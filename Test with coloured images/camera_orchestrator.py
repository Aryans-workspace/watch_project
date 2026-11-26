"""
Phone Camera Orchestrator Engine
Supports controlling smartphone cameras from PC to capture high-resolution images for defect detection.

Supported Backends:
1. Web Companion Bridge (Zero-Install, WebRTC / HTML5 ImageCapture API on iPhone & Android)
2. IP Camera REST API (IP Webcam on Android, IP Camera on iOS with /photoaf.jpg autofocus & torch API)
3. USB Virtual Webcam / DirectShow (DroidCam, Iriun, Camo Studio via OpenCV)
4. Android Debug Bridge (ADB over USB cable)
5. Simulated / Sample Stream (For testing without physical hardware)
"""

import os
import time
import socket
import threading
import subprocess
import requests
import cv2
import numpy as np
from datetime import datetime


class PhoneCameraOrchestrator:
    # Backend Modes
    MODE_WEB_BRIDGE = "web_bridge"
    MODE_IP_WEBCAM = "ip_webcam"
    MODE_USB_WEBCAM = "usb_webcam"
    MODE_ADB = "adb"
    MODE_SIMULATED = "simulated"

    def __init__(self, capture_dir=None):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.capture_dir = capture_dir or os.path.join(base_dir, "datasets", "captures")
        os.makedirs(self.capture_dir, exist_ok=True)

        # Active Mode & Connection State
        self.mode = self.MODE_SIMULATED
        self.is_connected = False
        self.device_name = "Simulated Phone Camera"
        self.ip_address = "127.0.0.1"
        self.port = 8080
        self.usb_index = 0
        self.resolution = "1920 x 1080"
        self.fps = 0.0
        self.latency_ms = 0.0
        self.torch_on = False

        # Web Companion Signaling
        self.web_client_connected = False
        self.web_client_last_ping = 0
        self.pending_capture_event = threading.Event()
        self.capture_response_event = threading.Event()
        self.last_web_snapshot = None

        # Frame Buffering & Threading
        self.raw_frame = None
        self.display_frame = None
        self.jpeg_bytes = None
        self.lock = threading.Lock()
        self.running = True

        # Calibration & Alignment Overlays
        self.show_crosshair = True
        self.show_grid = False
        self.show_dial_roi = True
        self.dial_roi_radius = 280
        self.offset_x = 0
        self.offset_y = 0
        self.line_color = (0, 220, 255) # BGR: Gold/Yellow #dfc16d

        # Precision Crop & Zoom Parameters (Base: 52mm x 58mm -> 828 x 922 px)
        self.crop_enabled = True
        self.crop_live_stream = False  # If True, live stream is cropped/zoomed to 828x922
        self.crop_w = 828              # Canonical model/dataset width (px)
        self.crop_h = 922              # Canonical model/dataset height (px)
        self.crop_mm_h = 26.0          # Base mm from center horizontally (52mm total at 1.0x)
        self.crop_mm_v = 29.0          # Base mm from center vertically (58mm total at 1.0x)
        self.crop_zoom = 1.5           # Default 1.5x zoom for closer crop and larger dial inspection
        self.show_crop_roi = True      # Draw precision ROI box overlay

        # Frame counter for FPS
        self.frame_count = 0
        self.last_fps_calc = time.time()

        # Capture thread
        self.worker_thread = threading.Thread(target=self._stream_loop, daemon=True)
        self.worker_thread.start()

        # Initialize sample frame
        self._load_sample_frame()

    def _load_sample_frame(self):
        """Load initial test frame from workspace sample if available."""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        sample_path = os.path.join(base_dir, "..", "testing", "defect", "defective.png")
        if os.path.exists(sample_path):
            img = cv2.imread(sample_path)
            if img is not None:
                with self.lock:
                    self.raw_frame = img
                    self.resolution = f"{img.shape[1]} x {img.shape[0]}"
                    self.device_name = "Sample Coloured Dial (Ready for Phone)"
        else:
            blank = np.zeros((1080, 1920, 3), dtype=np.uint8)
            cv2.putText(blank, "Phone Camera Standby - Connect Phone Below", (400, 540),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (223, 193, 109), 2)
            with self.lock:
                self.raw_frame = blank

    def get_crop_bounds(self, width, height):
        """
        Calculates pixel bounding box for the precision cropped ROI.
        Higher zoom factors (e.g. 1.25x, 1.5x, 2.0x) slice a tighter region from the center
        which is then resampled to the canonical 828 x 922 px.
        Robustly scales across preview resolution (e.g. 1080p) and max-res camera sensor captures (4K+).
        """
        min_dim = min(width, height)
        if min_dim >= 1080:
            s = min_dim / 1080.0
        elif width >= self.crop_w and height >= self.crop_h:
            s = 1.0
        else:
            s = min(width / float(self.crop_w), height / float(self.crop_h))

        zoom = max(0.2, float(self.crop_zoom))
        box_w = int(round((float(self.crop_w) / zoom) * s))
        box_h = int(round((float(self.crop_h) / zoom) * s))

        # Clamp box to image dimensions
        box_w = max(30, min(width, box_w))
        box_h = max(30, min(height, box_h))

        cx = int(width / 2.0 + self.offset_x * s)
        cy = int(height / 2.0 + self.offset_y * s)

        x1 = int(cx - box_w / 2.0)
        y1 = int(cy - box_h / 2.0)

        # Keep box entirely inside frame boundaries
        if x1 < 0:
            x1 = 0
        if y1 < 0:
            y1 = 0
        if x1 + box_w > width:
            x1 = max(0, width - box_w)
        if y1 + box_h > height:
            y1 = max(0, height - box_h)

        x2 = min(width, x1 + box_w)
        y2 = min(height, y1 + box_h)

        return x1, y1, x2, y2

    def crop_to_dial_roi(self, img):
        """
        Crops and zooms the image to the precision ROI,
        producing an exact cropped image size of 828 x 922 pixels with high-fidelity Lanczos4.
        """
        if img is None:
            return None
        if not self.crop_enabled:
            return img

        h, w = img.shape[:2]
        x1, y1, x2, y2 = self.get_crop_bounds(w, h)
        crop = img[y1:y2, x1:x2].copy()

        # Resize to exact 828 x 922
        if crop.shape[1] != self.crop_w or crop.shape[0] != self.crop_h:
            interp = cv2.INTER_AREA if (crop.shape[1] > self.crop_w and crop.shape[0] > self.crop_h) else cv2.INTER_LANCZOS4
            crop = cv2.resize(crop, (self.crop_w, self.crop_h), interpolation=interp)

        return crop

    def update_crop_settings(self, **kwargs):
        """Update crop and zoom settings dynamically."""
        with self.lock:
            if "crop_enabled" in kwargs and kwargs["crop_enabled"] is not None:
                self.crop_enabled = bool(kwargs["crop_enabled"])
            if "crop_live_stream" in kwargs and kwargs["crop_live_stream"] is not None:
                self.crop_live_stream = bool(kwargs["crop_live_stream"])
            if "show_crop_roi" in kwargs and kwargs["show_crop_roi"] is not None:
                self.show_crop_roi = bool(kwargs["show_crop_roi"])
            if "crop_zoom" in kwargs and kwargs["crop_zoom"] is not None:
                self.crop_zoom = max(0.5, min(5.0, float(kwargs["crop_zoom"])))
            if "offset_x" in kwargs and kwargs["offset_x"] is not None:
                self.offset_x = int(kwargs["offset_x"])
            if "offset_y" in kwargs and kwargs["offset_y"] is not None:
                self.offset_y = int(kwargs["offset_y"])

        return self.get_crop_state()

    def get_crop_state(self):
        """Return current crop configuration, physical mm window, and bounds."""
        w, h = 1920, 1080
        if self.raw_frame is not None:
            h, w = self.raw_frame.shape[:2]
        x1, y1, x2, y2 = self.get_crop_bounds(w, h)
        z = max(0.1, self.crop_zoom)
        mm_total_w = round(52.0 / z, 1)
        mm_total_h = round(58.0 / z, 1)
        return {
            "crop_enabled": self.crop_enabled,
            "crop_live_stream": self.crop_live_stream,
            "show_crop_roi": self.show_crop_roi,
            "crop_w": self.crop_w,
            "crop_h": self.crop_h,
            "crop_mm_h": round(mm_total_w / 2.0, 1),
            "crop_mm_v": round(mm_total_h / 2.0, 1),
            "crop_mm_total_w": mm_total_w,
            "crop_mm_total_h": mm_total_h,
            "crop_zoom": round(self.crop_zoom, 2),
            "bounds": [x1, y1, x2, y2],
            "target_resolution": f"{self.crop_w} x {self.crop_h}",
            "offset_x": self.offset_x,
            "offset_y": self.offset_y
        }

    def get_host_ips(self):
        """Return all PC IPv4 addresses for connecting the phone."""
        ips = []
        try:
            hostname = socket.gethostname()
            for item in socket.getaddrinfo(hostname, None):
                ip = item[4][0]
                if ":" not in ip and not ip.startswith("127."):
                    ips.append(ip)
        except Exception:
            pass

        # Sort prioritizing typical Wi-Fi / LAN subnets (10.x, 192.168.x) over 169.254 link-local
        wifi_ips = [ip for ip in ips if ip.startswith("10.") or ip.startswith("192.168.")]
        other_ips = [ip for ip in ips if ip not in wifi_ips]
        sorted_ips = wifi_ips + other_ips
        return sorted_ips if sorted_ips else ["127.0.0.1"]

    def connect_mode(self, mode, params=None):
        """
        Switch camera orchestrator backend mode.
        params can include: 'ip', 'port', 'usb_index', 'url'
        """
        params = params or {}
        print(f"[ORCHESTRATOR] Switching to mode: {mode} with params: {params}")

        with self.lock:
            self.mode = mode
            if mode == self.MODE_IP_WEBCAM:
                ip = params.get("ip", "").strip()
                if "://" in ip:
                    self.ip_address = ip
                else:
                    port = params.get("port", 8080)
                    self.ip_address = f"http://{ip}:{port}"
                self.device_name = f"IP Camera ({self.ip_address})"
                self.is_connected = False
            elif mode == self.MODE_WEB_BRIDGE:
                self.device_name = "Mobile Web Companion"
                self.is_connected = (time.time() - self.web_client_last_ping) < 10
            elif mode == self.MODE_USB_WEBCAM:
                self.usb_index = int(params.get("usb_index", 0))
                self.device_name = f"USB/DirectShow Camera #{self.usb_index}"
                self.is_connected = False
            elif mode == self.MODE_ADB:
                self.device_name = "Android Phone (ADB USB)"
                self.is_connected = self._check_adb_device()
            elif mode == self.MODE_SIMULATED:
                self.device_name = "Simulated Phone Camera"
                self.is_connected = True

        # Perform quick connection test
        diagnostic = self.diagnose_connection(mode, params)
        return diagnostic

    def diagnose_connection(self, mode=None, params=None):
        """
        Active diagnosis of phone camera control and latency.
        Checks if camera endpoints respond and can trigger high-res photos.
        """
        mode = mode or self.mode
        params = params or {}
        diag = {
            "mode": mode,
            "connected": False,
            "latency_ms": 0.0,
            "resolution": "Unknown",
            "can_capture": False,
            "message": "",
            "details": {}
        }

        t0 = time.time()

        if mode == self.MODE_IP_WEBCAM:
            base_url = params.get("ip", self.ip_address).strip()
            if not base_url.startswith("http"):
                port = params.get("port", 8080)
                base_url = f"http://{base_url}:{port}"

            try:
                # Test pinging the status / video header
                resp = requests.get(f"{base_url}/status.json", timeout=2.0)
                latency = round((time.time() - t0) * 1000, 1)
                if resp.status_code == 200:
                    data = resp.json()
                    diag["connected"] = True
                    diag["latency_ms"] = latency
                    diag["can_capture"] = True
                    cursize = data.get("cursize", "Unknown")
                    diag["resolution"] = cursize
                    diag["message"] = f"IP Webcam responding! Shutter latency: {latency} ms"
                    diag["details"] = data
                    with self.lock:
                        self.is_connected = True
                        self.latency_ms = latency
                        self.resolution = cursize
                    return diag
            except Exception as e:
                # Try testing /photo.jpg directly with HEAD or quick GET
                try:
                    resp = requests.head(f"{base_url}/photo.jpg", timeout=2.0)
                    latency = round((time.time() - t0) * 1000, 1)
                    if resp.status_code == 200:
                        diag["connected"] = True
                        diag["latency_ms"] = latency
                        diag["can_capture"] = True
                        diag["message"] = f"IP Camera online (/photo.jpg ready). Latency: {latency} ms"
                        with self.lock:
                            self.is_connected = True
                            self.latency_ms = latency
                        return diag
                except Exception as e2:
                    diag["message"] = f"Failed to connect to IP camera at {base_url}: {e2}"
                    diag["connected"] = False
                    return diag

        elif mode == self.MODE_WEB_BRIDGE:
            is_active = (time.time() - self.web_client_last_ping) < 10
            diag["connected"] = is_active
            diag["can_capture"] = is_active
            diag["resolution"] = self.resolution
            diag["latency_ms"] = self.latency_ms
            if is_active:
                diag["message"] = f"Phone Web Companion connected & ready for capture! ({self.resolution})"
            else:
                diag["message"] = "No phone connected yet. Scan QR code or open /phone on your mobile browser."
            return diag

        elif mode == self.MODE_USB_WEBCAM:
            idx = int(params.get("usb_index", self.usb_index))
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if cap.isOpened():
                ret, frame = cap.read()
                latency = round((time.time() - t0) * 1000, 1)
                if ret and frame is not None:
                    h, w = frame.shape[:2]
                    diag["connected"] = True
                    diag["latency_ms"] = latency
                    diag["resolution"] = f"{w} x {h}"
                    diag["can_capture"] = True
                    diag["message"] = f"USB/Virtual Webcam #{idx} opened successfully! ({w}x{h})"
                    with self.lock:
                        self.is_connected = True
                        self.resolution = f"{w} x {h}"
                cap.release()
            else:
                diag["message"] = f"Cannot open USB/Virtual webcam device index {idx}."
            return diag

        elif mode == self.MODE_ADB:
            has_dev = self._check_adb_device()
            diag["connected"] = has_dev
            diag["can_capture"] = has_dev
            if has_dev:
                diag["message"] = "Android phone detected via ADB! Ready to trigger camera shutter."
            else:
                diag["message"] = "No ADB device detected. Connect Android via USB and enable USB Debugging."
            return diag

        else: # Simulated
            diag["connected"] = True
            diag["can_capture"] = True
            diag["resolution"] = self.resolution
            diag["latency_ms"] = 5.0
            diag["message"] = "Simulated High-Resolution Camera Mode active."
            return diag

    def _check_adb_device(self):
        """Check if any Android device is connected via ADB."""
        try:
            res = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=2)
            lines = res.stdout.strip().split("\n")[1:]
            for line in lines:
                if "\tdevice" in line:
                    return True
        except Exception:
            pass
        return False

    def toggle_torch(self, state=None):
        """Toggle phone flashlight/torch for defect illumination."""
        if state is None:
            state = not self.torch_on
        self.torch_on = state

        if self.mode == self.MODE_IP_WEBCAM and self.is_connected:
            endpoint = "/enabletorch" if self.torch_on else "/disabletorch"
            try:
                requests.get(f"{self.ip_address}{endpoint}", timeout=1.5)
            except Exception as e:
                print(f"[ORCHESTRATOR] Error toggling torch: {e}")

        # Web Companion torch signaling will be picked up on next poll/push
        return {"success": True, "torch_on": self.torch_on}

    def trigger_capture(self, autofocus=True):
        """
        Orchestrate taking a full-resolution photo from the phone camera.
        Returns: dict with success, file_path, resolution, timestamp, and latency.
        """
        t0 = time.time()
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"capture_{timestamp_str}.jpg"
        target_path = os.path.join(self.capture_dir, filename)

        # ---------------------------------------------
        # 1. IP WEBCAM MODE (HTTP REST API)
        # ---------------------------------------------
        if self.mode == self.MODE_IP_WEBCAM:
            endpoint = "/photoaf.jpg" if autofocus else "/photo.jpg"
            photo_url = f"{self.ip_address}{endpoint}"
            try:
                print(f"[ORCHESTRATOR] Requesting high-res snapshot from {photo_url}...")
                resp = requests.get(photo_url, timeout=10.0)
                if resp.status_code == 200 and len(resp.content) > 1000:
                    with open(target_path, "wb") as f:
                        f.write(resp.content)

                    # Verify image, crop to 828x922 ROI, and read dimensions
                    img = cv2.imread(target_path)
                    if self.crop_enabled:
                        img = self.crop_to_dial_roi(img)
                        cv2.imwrite(target_path, img)
                    h, w = img.shape[:2]
                    latency = round((time.time() - t0) * 1000, 1)
                    with self.lock:
                        self.raw_frame = img
                        self.resolution = f"{w} x {h}"
                        self.latency_ms = latency

                    return {
                        "success": True,
                        "filename": filename,
                        "file_path": target_path,
                        "resolution": f"{w} x {h}",
                        "width": w,
                        "height": h,
                        "size_bytes": os.path.getsize(target_path),
                        "latency_ms": latency,
                        "mode": self.mode
                    }
                else:
                    return {"success": False, "error": f"Camera returned HTTP {resp.status_code}"}
            except Exception as e:
                return {"success": False, "error": f"Failed to fetch photo from phone: {e}"}

        # ---------------------------------------------
        # 2. WEB BRIDGE MODE (WebRTC / Mobile Companion)
        # ---------------------------------------------
        is_web_alive = (time.time() - self.web_client_last_ping) < 15
        if (self.mode == self.MODE_WEB_BRIDGE or self.mode == self.MODE_SIMULATED) and is_web_alive:
            # Signal phone to capture high-res photo
            self.capture_response_event.clear()
            self.last_web_snapshot = None
            self.pending_capture_event.set()

            print("[ORCHESTRATOR] Shutter command sent to Phone Web Companion. Waiting for high-res upload...")
            captured = self.capture_response_event.wait(timeout=10.0)
            self.pending_capture_event.clear()

            if captured and self.last_web_snapshot is not None:
                img = self.last_web_snapshot
                if self.crop_enabled and (img.shape[1] != self.crop_w or img.shape[0] != self.crop_h):
                    img = self.crop_to_dial_roi(img)
                cv2.imwrite(target_path, img)
                h, w = img.shape[:2]
                latency = round((time.time() - t0) * 1000, 1)
                with self.lock:
                    self.raw_frame = img
                    self.resolution = f"{w} x {h}"
                    self.latency_ms = latency
                    self.mode = self.MODE_WEB_BRIDGE

                print(f"[ORCHESTRATOR] Saved CROPPED 828x922 capture: {target_path} ({w}x{h})")
                return {
                    "success": True,
                    "filename": filename,
                    "file_path": target_path,
                    "resolution": f"{w} x {h}",
                    "width": w,
                    "height": h,
                    "latency_ms": latency,
                    "mode": self.MODE_WEB_BRIDGE
                }
            else:
                print("[ORCHESTRATOR] Warning: Phone high-res capture timed out; falling back to current buffer.")

        # ---------------------------------------------
        # 3. USB / VIRTUAL WEBCAM MODE (DirectShow)
        # ---------------------------------------------
        elif self.mode == self.MODE_USB_WEBCAM:
            cap = cv2.VideoCapture(self.usb_index, cv2.CAP_DSHOW)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 3840)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 2160)
                for _ in range(5):
                    cap.read()
                ret, frame = cap.read()
                cap.release()
                if ret and frame is not None:
                    if self.crop_enabled:
                        frame = self.crop_to_dial_roi(frame)
                    cv2.imwrite(target_path, frame)
                    h, w = frame.shape[:2]
                    latency = round((time.time() - t0) * 1000, 1)
                    with self.lock:
                        self.raw_frame = frame
                        self.resolution = f"{w} x {h}"
                    return {
                        "success": True,
                        "filename": filename,
                        "file_path": target_path,
                        "resolution": f"{w} x {h}",
                        "width": w,
                        "height": h,
                        "latency_ms": latency,
                        "mode": self.mode
                    }
            return {"success": False, "error": f"Failed to capture from USB camera #{self.usb_index}"}

        # ---------------------------------------------
        # 4. ADB MODE
        # ---------------------------------------------
        elif self.mode == self.MODE_ADB:
            try:
                subprocess.run(["adb", "shell", "input", "keyevent", "27"], timeout=2)
                time.sleep(1.2)
                find_cmd = "adb shell ls -t /sdcard/DCIM/Camera/ | head -n 1"
                res = subprocess.run(find_cmd, shell=True, capture_output=True, text=True, timeout=3)
                latest_photo = res.stdout.strip()
                if latest_photo:
                    pull_cmd = ["adb", "pull", f"/sdcard/DCIM/Camera/{latest_photo}", target_path]
                    subprocess.run(pull_cmd, timeout=5)
                    img = cv2.imread(target_path)
                    if img is not None:
                        if self.crop_enabled:
                            img = self.crop_to_dial_roi(img)
                        cv2.imwrite(target_path, img)
                        h, w = img.shape[:2]
                        latency = round((time.time() - t0) * 1000, 1)
                        with self.lock:
                            self.raw_frame = img
                            self.resolution = f"{w} x {h}"
                        return {
                            "success": True,
                            "filename": filename,
                            "file_path": target_path,
                            "resolution": f"{w} x {h}",
                            "width": w,
                            "height": h,
                            "latency_ms": latency,
                            "mode": self.mode
                        }
            except Exception as e:
                return {"success": False, "error": f"ADB capture error: {e}"}

        # ---------------------------------------------
        # 5. SIMULATED / CURRENT BUFFER MODE
        # ---------------------------------------------
        with self.lock:
            if self.raw_frame is not None:
                frame = self.raw_frame.copy()
            else:
                frame = np.zeros((922, 828, 3), dtype=np.uint8)

        if self.crop_enabled:
            frame = self.crop_to_dial_roi(frame)
        cv2.imwrite(target_path, frame)
        h, w = frame.shape[:2]
        latency = round((time.time() - t0) * 1000, 1)
        return {
            "success": True,
            "filename": filename,
            "file_path": target_path,
            "resolution": f"{w} x {h}",
            "width": w,
            "height": h,
            "latency_ms": latency,
            "mode": self.mode
        }

    # ----------------------------------------------------
    # Web Companion Handlers (Signaling & Frame Push)
    # ----------------------------------------------------
    def register_web_client(self, client_info=None):
        """Called when a mobile browser opens /phone."""
        self.web_client_connected = True
        self.web_client_last_ping = time.time()
        with self.lock:
            self.mode = self.MODE_WEB_BRIDGE
            self.is_connected = True
            if client_info and "resolution" in client_info:
                self.resolution = client_info["resolution"]
                self.device_name = client_info.get("device", "Mobile Browser Camera")

    def poll_web_trigger(self):
        """Long poll endpoint for the phone to check if PC triggered capture."""
        self.web_client_last_ping = time.time()
        # Wait up to 5 seconds for capture event
        triggered = self.pending_capture_event.wait(timeout=5.0)
        return {
            "capture_requested": triggered,
            "torch_on": self.torch_on,
            "timestamp": time.time()
        }

    def receive_web_snapshot(self, img_bytes):
        """Called when the phone uploads a high-resolution snapshot."""
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            if self.crop_enabled:
                img = self.crop_to_dial_roi(img)
            h, w = img.shape[:2]
            with self.lock:
                self.raw_frame = img
                self.resolution = f"{w} x {h}"
                self.last_web_snapshot = img
                self.mode = self.MODE_WEB_BRIDGE
                self.is_connected = True
                self.capture_response_event.set()
            return True, w, h
        return False, 0, 0

    def push_web_stream_frame(self, img_bytes):
        """Phone streams low/medium latency video preview frame."""
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            with self.lock:
                self.raw_frame = img
                if not self.resolution or self.resolution == "Unknown" or self.resolution.startswith("640"):
                    self.resolution = f"{img.shape[1]} x {img.shape[0]}"
                self.web_client_connected = True
                self.web_client_last_ping = time.time()

    # ----------------------------------------------------
    # Video Streaming Loop & Overlays
    # ----------------------------------------------------
    def _stream_loop(self):
        """Background thread handling continuous video frame grabbing."""
        cap_usb = None
        current_usb_idx = None

        while self.running:
            # 1. IP Webcam MJPEG stream handling
            if self.mode == self.MODE_IP_WEBCAM and self.is_connected:
                try:
                    stream_url = f"{self.ip_address}/video"
                    stream = requests.get(stream_url, stream=True, timeout=4.0)
                    bytes_buf = b""
                    for chunk in stream.iter_content(chunk_size=4096):
                        if not self.running or self.mode != self.MODE_IP_WEBCAM:
                            break
                        bytes_buf += chunk
                        a = bytes_buf.find(b"\xff\xd8") # JPEG start
                        b = bytes_buf.find(b"\xff\xd9") # JPEG end
                        if a != -1 and b != -1:
                            jpg = bytes_buf[a:b+2]
                            bytes_buf = bytes_buf[b+2:]
                            img = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                            if img is not None:
                                with self.lock:
                                    self.raw_frame = img
                                    self._render_overlay(img)
                                self._track_fps()
                except Exception:
                    time.sleep(1.0)

            # 2. USB Webcam Stream
            elif self.mode == self.MODE_USB_WEBCAM and self.is_connected:
                if cap_usb is None or current_usb_idx != self.usb_index:
                    if cap_usb:
                        cap_usb.release()
                    cap_usb = cv2.VideoCapture(self.usb_index, cv2.CAP_DSHOW)
                    current_usb_idx = self.usb_index

                if cap_usb and cap_usb.isOpened():
                    ret, frame = cap_usb.read()
                    if ret and frame is not None:
                        with self.lock:
                            self.raw_frame = frame
                            self._render_overlay(frame)
                        self._track_fps()
                    else:
                        time.sleep(0.05)
                else:
                    time.sleep(0.5)

            # 3. Web Companion / Simulated
            else:
                if cap_usb is not None:
                    cap_usb.release()
                    cap_usb = None

                with self.lock:
                    if self.raw_frame is not None:
                        self._render_overlay(self.raw_frame)
                self._track_fps()
                time.sleep(0.033)

        if cap_usb:
            cap_usb.release()

    def _track_fps(self):
        """Compute rolling FPS."""
        self.frame_count += 1
        now = time.time()
        if now - self.last_fps_calc >= 1.0:
            self.fps = round(self.frame_count / (now - self.last_fps_calc), 1)
            self.frame_count = 0
            self.last_fps_calc = now

    def _render_overlay(self, base_img):
        """Render optical alignment crosshair, grid, and precision zoomed ROI overlay."""
        if self.crop_enabled and self.crop_live_stream:
            display = self.crop_to_dial_roi(base_img)
            h, w = display.shape[:2]
            cx = int(w / 2)
            cy = int(h / 2)
            cv2.putText(display, f"ZOOMED LIVE [{self.crop_zoom:.2f}x] 828x922", (18, 32),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (94, 197, 34), 2, cv2.LINE_AA)
        else:
            display = base_img.copy()
            h, w = display.shape[:2]
            cx = int(w / 2 + self.offset_x)
            cy = int(h / 2 + self.offset_y)

            # Draw Precision Crop ROI
            if self.crop_enabled and self.show_crop_roi:
                x1, y1, x2, y2 = self.get_crop_bounds(w, h)
                roi_color = (94, 197, 34)  # BGR: Crisp Green #22c55e
                cv2.rectangle(display, (x1, y1), (x2, y2), roi_color, 2, cv2.LINE_AA)
                # Corner brackets
                clen = 28
                cv2.line(display, (x1, y1), (x1 + clen, y1), roi_color, 4)
                cv2.line(display, (x1, y1), (x1, y1 + clen), roi_color, 4)
                cv2.line(display, (x2, y1), (x2 - clen, y1), roi_color, 4)
                cv2.line(display, (x2, y1), (x2, y1 + clen), roi_color, 4)
                cv2.line(display, (x1, y2), (x1 + clen, y2), roi_color, 4)
                cv2.line(display, (x1, y2), (x1, y2 - clen), roi_color, 4)
                cv2.line(display, (x2, y2), (x2 - clen, y2), roi_color, 4)
                cv2.line(display, (x2, y2), (x2, y2 - clen), roi_color, 4)

                # Badge tag
                mm_w = round(52.0 / max(0.1, self.crop_zoom), 1)
                mm_h = round(58.0 / max(0.1, self.crop_zoom), 1)
                tag = f"CROP ROI [{self.crop_zoom:.2f}x Zoom]: {mm_w}x{mm_h}mm -> {self.crop_w}x{self.crop_h}px"
                cv2.putText(display, tag, (x1 + 6, max(28, y1 - 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, roi_color, 2, cv2.LINE_AA)

        # Draw Grid if enabled
        if self.show_grid:
            grid_step = 80
            for x in range(0, w, grid_step):
                cv2.line(display, (x, 0), (x, h), (40, 40, 40), 1)
            for y in range(0, h, grid_step):
                cv2.line(display, (0, y), (w, y), (40, 40, 40), 1)

        # Draw Dial ROI circle
        if self.show_dial_roi:
            r = int(min(h, w) * 0.32) if self.dial_roi_radius <= 0 else self.dial_roi_radius
            # Glowing double ring in accent gold (#dfc16d)
            cv2.circle(display, (cx, cy), r, self.line_color, 2, cv2.LINE_AA)
            cv2.circle(display, (cx, cy), r + 4, (40, 180, 220), 1, cv2.LINE_AA)

        # Draw Crosshairs
        if self.show_crosshair:
            # Full viewport crosshair lines
            cv2.line(display, (0, cy), (w, cy), self.line_color, 1, cv2.LINE_AA)
            cv2.line(display, (cx, 0), (cx, h), self.line_color, 1, cv2.LINE_AA)
            # Center target bullseye
            cv2.circle(display, (cx, cy), 12, self.line_color, 1, cv2.LINE_AA)
            cv2.circle(display, (cx, cy), 3, (0, 0, 255), -1, cv2.LINE_AA)

        # Encode to JPEG for fast web streaming
        ret, buf = cv2.imencode(".jpg", display, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if ret:
            self.display_frame = display
            self.jpeg_bytes = buf.tobytes()

    def get_jpeg_frame(self):
        """Return MJPEG byte chunk for HTTP video feed."""
        with self.lock:
            return self.jpeg_bytes

    def get_status(self):
        """Return dictionary of current live orchestrator telemetry."""
        with self.lock:
            # Check web companion timeout
            is_web_alive = (time.time() - self.web_client_last_ping) < 10
            connected = self.is_connected or (self.mode == self.MODE_WEB_BRIDGE and is_web_alive) or (self.mode == self.MODE_SIMULATED)

            return {
                "mode": self.mode,
                "connected": connected,
                "device_name": self.device_name,
                "ip_address": self.ip_address,
                "resolution": self.resolution,
                "fps": self.fps,
                "latency_ms": self.latency_ms,
                "torch_on": self.torch_on,
                "crosshair": self.show_crosshair,
                "grid": self.show_grid,
                "dial_roi": self.show_dial_roi,
                "dial_radius": self.dial_roi_radius,
                "offset_x": self.offset_x,
                "offset_y": self.offset_y,
                "crop": self.get_crop_state()
            }

    def update_overlays(self, crosshair=None, grid=None, dial_roi=None, dial_radius=None, offset_x=None, offset_y=None,
                        crop_enabled=None, crop_live_stream=None, show_crop_roi=None, crop_zoom=None):
        """Update live view overlay parameters."""
        with self.lock:
            if crosshair is not None:
                self.show_crosshair = bool(crosshair)
            if grid is not None:
                self.show_grid = bool(grid)
            if dial_roi is not None:
                self.show_dial_roi = bool(dial_roi)
            if dial_radius is not None:
                self.dial_roi_radius = int(dial_radius)
            if offset_x is not None:
                self.offset_x = int(offset_x)
            if offset_y is not None:
                self.offset_y = int(offset_y)
            if crop_enabled is not None:
                self.crop_enabled = bool(crop_enabled)
            if crop_live_stream is not None:
                self.crop_live_stream = bool(crop_live_stream)
            if show_crop_roi is not None:
                self.show_crop_roi = bool(show_crop_roi)
            if crop_zoom is not None:
                self.crop_zoom = max(0.2, min(5.0, float(crop_zoom)))
        return self.get_status()

    def stop(self):
        """Clean shutdown."""
        self.running = False
