"""
Mech-Eye Camera Manager & Calibration Engine
Supports Mech-Eye Industrial 3D Cameras (e.g. Mech-Eye UHP-140)
Handles background capture, thread-safe frame access, crosshair calibration overlays,
and high-resolution snapshot saving.
"""

import os
import time
import threading
import traceback
import cv2
import numpy as np

# Try importing Mech-Eye SDK
MECHEYE_AVAILABLE = False
try:
    from mecheye.shared import *
    from mecheye.area_scan_3d_camera import *
    from mecheye.area_scan_3d_camera_utils import find_and_connect
    MECHEYE_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] Mech-Eye SDK could not be imported: {e}. Fallback to simulated camera.")


class CameraManager:
    def __init__(self, dataset_folder="datasets"):
        self.dataset_folder = dataset_folder
        os.makedirs(self.dataset_folder, exist_ok=True)

        self.camera = None
        self.is_connected = False
        self.camera_info = {
            "model": "Unknown",
            "ip": "Unknown",
            "serial": "Unknown",
            "firmware": "Unknown",
            "resolution": "0 x 0",
            "is_real": False,
            "connected": False
        }

        # Calibration parameters
        self.offset_x = 0
        self.offset_y = 0
        self.crosshair_enabled = True
        self.cross_span = "full"  # "full" or integer pixel size
        self.cross_size = 1000
        self.line_thickness = 2
        self.line_color = (0, 255, 0)  # BGR: Pure Green
        self.show_center_circle = True
        self.center_circle_radius = 4
        self.show_rings = False
        self.ring_radii = [50, 100, 200, 400]
        self.show_coordinates = True
        self.show_slot_roi = True
        self.slot_mm_h = 26.0
        self.slot_mm_v = 29.0
        self.pixels_per_mm = 15.904

        # Frame buffers & threading
        self.raw_frame = None
        self.display_frame = None
        self.jpeg_bytes = None
        self.frame_lock = threading.Lock()

        # Capture thread control
        self.running = False
        self.capture_thread = None
        self.fps = 0.0
        self.frame_count = 0
        self.last_fps_calc_time = time.time()

        # Connect automatically on startup
        self.connect()

    def connect(self):
        """Connect to Mech-Eye camera or initialize simulation if unavailable."""
        with self.frame_lock:
            if self.is_connected:
                return True

            if MECHEYE_AVAILABLE:
                try:
                    cameras = Camera.discover_cameras()
                    if cameras and len(cameras) > 0:
                        cam_info = cameras[0]
                        print(f"[INFO] Discovered Mech-Eye Camera: {cam_info.model} at {cam_info.ip_address}")
                        self.camera = Camera()
                        status = self.camera.connect(cam_info)
                        if not status.is_ok():
                            # Camera might need a moment to reset from previous connection
                            time.sleep(1.0)
                            status = self.camera.connect(cam_info)

                        if status.is_ok():
                            self.is_connected = True
                            fw = getattr(cam_info, 'firmware_version', None)
                            fw_str = fw.to_string() if (fw and hasattr(fw, 'to_string')) else str(fw or 'N/A')
                            self.camera_info = {
                                "model": str(cam_info.model),
                                "ip": str(cam_info.ip_address),
                                "serial": str(getattr(cam_info, 'serial_number', 'N/A')),
                                "firmware": fw_str,
                                "resolution": "2048 x 1536",
                                "is_real": True,
                                "connected": True
                            }
                            print(f"[INFO] Successfully connected to {cam_info.model}")
                            self._start_capture_thread()
                            return True
                        else:
                            err_msg = status.error_description if hasattr(status, 'error_description') else str(status)
                            print(f"[ERROR] Failed to connect: {err_msg}")
                    else:
                        print("[WARN] No Mech-Eye cameras detected on the network.")
                except Exception as e:
                    print(f"[ERROR] Exception while connecting to Mech-Eye: {traceback.format_exc()}")

            # Fallback to simulated camera mode
            print("[INFO] Initializing simulated calibration camera feed.")
            self.camera = None
            self.is_connected = True
            self.camera_info = {
                "model": "Simulated Mech-Eye UHP-140",
                "ip": "127.0.0.1 (Simulation Mode)",
                "serial": "SIM-UHP-140-001",
                "firmware": "v2.5.4-sim",
                "resolution": "2048 x 1536",
                "is_real": False,
                "connected": True
            }
            self._start_capture_thread()
            return True

    def disconnect(self):
        """Cleanly disconnect camera and stop acquisition thread."""
        self.running = False
        if self.capture_thread and self.capture_thread.is_alive():
            self.capture_thread.join(timeout=2.0)

        with self.frame_lock:
            if self.camera and self.is_connected:
                try:
                    self.camera.disconnect()
                    print("[INFO] Camera disconnected cleanly.")
                except Exception as e:
                    print(f"[ERROR] Error disconnecting camera: {e}")
            self.is_connected = False
            self.camera_info["connected"] = False

    def _start_capture_thread(self):
        self.running = True
        self.capture_thread = threading.Thread(target=self._capture_worker, daemon=True)
        self.capture_thread.start()

    def _capture_worker(self):
        """Worker loop acquiring frames continuously."""
        frame_2d = None
        if MECHEYE_AVAILABLE and self.camera_info["is_real"]:
            frame_2d = Frame2D()

        sim_pattern = None

        while self.running:
            raw_img = None

            if self.camera_info["is_real"] and self.camera and frame_2d is not None:
                try:
                    error = self.camera.capture_2d(frame_2d)
                    if error.is_ok():
                        if frame_2d.color_type() == ColorTypeOf2DCamera_Monochrome:
                            gray = frame_2d.get_gray_scale_image().data()
                            raw_img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
                        else:
                            color = frame_2d.get_color_image().data()
                            raw_img = cv2.cvtColor(color, cv2.COLOR_RGB2BGR)
                    else:
                        err_desc = error.error_description if hasattr(error, 'error_description') else str(error)
                        print(f"[WARN] Capture 2D error: {err_desc}")
                        time.sleep(0.05)
                except Exception as e:
                    print(f"[ERROR] Camera capture exception: {e}")
                    time.sleep(0.05)

            # If simulation or capture failed, generate synthetic calibration target
            if raw_img is None:
                if sim_pattern is None:
                    h, w = 1536, 2048
                    sim_pattern = np.zeros((h, w, 3), dtype=np.uint8)
                    # Create realistic matte dark background
                    sim_pattern[:] = (28, 30, 34)
                    # Grid pattern (every 100px)
                    for x in range(0, w, 100):
                        cv2.line(sim_pattern, (x, 0), (x, h), (45, 48, 55), 1)
                    for y in range(0, h, 100):
                        cv2.line(sim_pattern, (0, y), (w, y), (45, 48, 55), 1)
                    # Calibration target markers
                    cx, cy = w // 2, h // 2
                    for r in [100, 200, 300, 400, 500]:
                        cv2.circle(sim_pattern, (cx, cy), r, (60, 65, 75), 1)
                    # Concentric reference rings
                    cv2.circle(sim_pattern, (cx, cy), 15, (100, 110, 130), 2)
                    cv2.putText(sim_pattern, "SIMULATED MECH-EYE CALIBRATION TARGET", (cx - 320, 80),
                                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (140, 150, 170), 2, cv2.LINE_AA)
                    cv2.putText(sim_pattern, "Connect Mech-Eye Camera to view live sensor feed", (cx - 290, 120),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 110, 130), 1, cv2.LINE_AA)

                raw_img = sim_pattern.copy()
                time.sleep(0.033)  # ~30 FPS for simulation

            # Process frame with calibration overlays
            h, w = raw_img.shape[:2]
            self.camera_info["resolution"] = f"{w} x {h}"
            display_img = self._apply_calibration_overlay(raw_img)

            # Encode to JPEG for fast streaming
            # Quality 85 gives crisp calibration lines and low latency (~10-15ms)
            ret, jpeg = cv2.imencode('.jpg', display_img, [cv2.IMWRITE_JPEG_QUALITY, 85])

            with self.frame_lock:
                self.raw_frame = raw_img
                self.display_frame = display_img
                if ret:
                    self.jpeg_bytes = jpeg.tobytes()

                # FPS Calculation
                self.frame_count += 1
                now = time.time()
                elapsed = now - self.last_fps_calc_time
                if elapsed >= 1.0:
                    self.fps = round(self.frame_count / elapsed, 1)
                    self.frame_count = 0
                    self.last_fps_calc_time = now

    def _apply_calibration_overlay(self, img):
        """Render precision green crosshairs and calibration guides."""
        if not self.crosshair_enabled:
            return img.copy()

        overlay = img.copy()
        h, w = overlay.shape[:2]

        # Calculate intersection point (center + calibration offset)
        base_cx, base_cy = w // 2, h // 2
        cx = base_cx + self.offset_x
        cy = base_cy + self.offset_y

        color = self.line_color
        thick = max(1, int(self.line_thickness))

        # 1. Concentric alignment rings (if enabled)
        if self.show_rings:
            ring_color = (0, 180, 0)
            for r in self.ring_radii:
                if 0 <= cx < w and 0 <= cy < h:
                    cv2.circle(overlay, (cx, cy), r, ring_color, 1, cv2.LINE_AA)
                    # Radius label
                    cv2.putText(overlay, f"r={r}px", (cx + r + 4, cy - 4),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, ring_color, 1, cv2.LINE_AA)

        # 2. Crosshair Lines (Two green lines across the screen in a + shape)
        if self.cross_span == "full":
            # Edge-to-edge full width and height
            # Horizontal line across the entire screen
            cv2.line(overlay, (0, cy), (w - 1, cy), color, thick, cv2.LINE_AA)
            # Vertical line across the entire screen
            cv2.line(overlay, (cx, 0), (cx, h - 1), color, thick, cv2.LINE_AA)
        else:
            # Sized crosshair lines
            size = self.cross_size
            x1 = max(0, cx - size)
            x2 = min(w - 1, cx + size)
            y1 = max(0, cy - size)
            y2 = min(h - 1, cy + size)
            cv2.line(overlay, (x1, cy), (x2, cy), color, thick, cv2.LINE_AA)
            cv2.line(overlay, (cx, y1), (cx, y2), color, thick, cv2.LINE_AA)

        # 3. Center Precision Marker
        if self.show_center_circle:
            # Small green circle at the exact intersection center
            cv2.circle(overlay, (cx, cy), self.center_circle_radius, color, -1, cv2.LINE_AA)
            # High-contrast outer ring for clear visibility against bright surfaces
            cv2.circle(overlay, (cx, cy), self.center_circle_radius + 2, (0, 0, 0), 1, cv2.LINE_AA)

        # 4. Slot ROI Bounding Box (26mm x 29mm from center)
        if self.show_slot_roi:
            dx = int(round(self.slot_mm_h * self.pixels_per_mm))
            dy = int(round(self.slot_mm_v * self.pixels_per_mm))
            rx1 = max(0, cx - dx)
            rx2 = min(w - 1, cx + dx)
            ry1 = max(0, cy - dy)
            ry2 = min(h - 1, cy + dy)
            cv2.rectangle(overlay, (rx1, ry1), (rx2, ry2), (0, 255, 0), 2, cv2.LINE_AA)
            # Corner brackets
            c_len = 25
            cv2.line(overlay, (rx1, ry1), (rx1 + c_len, ry1), (0, 255, 0), 4)
            cv2.line(overlay, (rx1, ry1), (rx1, ry1 + c_len), (0, 255, 0), 4)
            cv2.line(overlay, (rx2, ry1), (rx2 - c_len, ry1), (0, 255, 0), 4)
            cv2.line(overlay, (rx2, ry1), (rx2, ry1 + c_len), (0, 255, 0), 4)
            cv2.line(overlay, (rx1, ry2), (rx1 + c_len, ry2), (0, 255, 0), 4)
            cv2.line(overlay, (rx1, ry2), (rx1, ry2 - c_len), (0, 255, 0), 4)
            cv2.line(overlay, (rx2, ry2), (rx2 - c_len, ry2), (0, 255, 0), 4)
            cv2.line(overlay, (rx2, ry2), (rx2, ry2 - c_len), (0, 255, 0), 4)
            cv2.putText(overlay, f"Slot ROI: 26mm x 29mm ({rx2 - rx1}x{ry2 - ry1}px)",
                        (rx1 + 6, max(30, ry1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2, cv2.LINE_AA)

        # 5. Center coordinates overlay
        if self.show_coordinates:
            coord_text = f"Center: ({cx}, {cy})"
            if self.offset_x != 0 or self.offset_y != 0:
                coord_text += f" | Offset: ({self.offset_x:+d}, {self.offset_y:+d})"
            
            # Badge background for high legibility
            text_size, _ = cv2.getTextSize(coord_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            bg_x1, bg_y1 = 20, 20
            bg_x2, bg_y2 = bg_x1 + text_size[0] + 16, bg_y1 + text_size[1] + 16
            cv2.rectangle(overlay, (bg_x1, bg_y1), (bg_x2, bg_y2), (0, 0, 0), -1)
            cv2.rectangle(overlay, (bg_x1, bg_y1), (bg_x2, bg_y2), (0, 255, 0), 1)
            cv2.putText(overlay, coord_text, (bg_x1 + 8, bg_y1 + text_size[1] + 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 1, cv2.LINE_AA)

        return overlay

    def get_jpeg_frame(self):
        """Returns latest encoded JPEG bytes for streaming."""
        with self.frame_lock:
            return self.jpeg_bytes

    def capture_snapshot(self, with_crosshair=False):
        """
        Saves current frame to dataset folder with high quality.
        Returns dictionary with saved file info.
        """
        with self.frame_lock:
            if with_crosshair:
                target_frame = self.display_frame
                prefix = "calibration"
            else:
                target_frame = self.raw_frame
                prefix = "capture"

            if target_frame is None:
                return {"success": False, "error": "No frame available"}

            img_to_save = target_frame.copy()

        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"{prefix}_{timestamp}.png"
        filepath = os.path.join(self.dataset_folder, filename)

        # Save lossless PNG
        cv2.imwrite(filepath, img_to_save, [cv2.IMWRITE_PNG_COMPRESSION, 3])

        # Also save small thumbnail for web gallery
        thumb_folder = os.path.join(self.dataset_folder, ".thumbs")
        os.makedirs(thumb_folder, exist_ok=True)
        thumb_path = os.path.join(thumb_folder, filename)
        thumb = cv2.resize(img_to_save, (320, int(320 * img_to_save.shape[0] / img_to_save.shape[1])))
        cv2.imwrite(thumb_path, thumb)

        return {
            "success": True,
            "filename": filename,
            "path": filepath,
            "timestamp": timestamp,
            "resolution": f"{img_to_save.shape[1]}x{img_to_save.shape[0]}",
            "with_crosshair": with_crosshair,
            "center": (img_to_save.shape[1] // 2 + self.offset_x, img_to_save.shape[0] // 2 + self.offset_y)
        }

    def update_calibration(self, **kwargs):
        """Update calibration parameters in real-time."""
        if "offset_x" in kwargs:
            self.offset_x = int(kwargs["offset_x"])
        if "offset_y" in kwargs:
            self.offset_y = int(kwargs["offset_y"])
        if "crosshair_enabled" in kwargs:
            self.crosshair_enabled = bool(kwargs["crosshair_enabled"])
        if "cross_span" in kwargs:
            self.cross_span = str(kwargs["cross_span"])
        if "cross_size" in kwargs:
            self.cross_size = int(kwargs["cross_size"])
        if "line_thickness" in kwargs:
            self.line_thickness = max(1, int(kwargs["line_thickness"]))
        if "show_center_circle" in kwargs:
            self.show_center_circle = bool(kwargs["show_center_circle"])
        if "show_rings" in kwargs:
            self.show_rings = bool(kwargs["show_rings"])
        if "show_coordinates" in kwargs:
            self.show_coordinates = bool(kwargs["show_coordinates"])

        return self.get_calibration_state()

    def reset_center(self):
        """Resets offsets to (0, 0) so crosshair is at exact geometric center."""
        self.offset_x = 0
        self.offset_y = 0
        return self.get_calibration_state()

    def get_calibration_state(self):
        """Returns current calibration settings as dictionary."""
        w, h = 2048, 1536
        if self.raw_frame is not None:
            h, w = self.raw_frame.shape[:2]

        return {
            "offset_x": self.offset_x,
            "offset_y": self.offset_y,
            "center_x": w // 2 + self.offset_x,
            "center_y": h // 2 + self.offset_y,
            "geometric_center": (w // 2, h // 2),
            "crosshair_enabled": self.crosshair_enabled,
            "cross_span": self.cross_span,
            "cross_size": self.cross_size,
            "line_thickness": self.line_thickness,
            "show_center_circle": self.show_center_circle,
            "show_rings": self.show_rings,
            "show_coordinates": self.show_coordinates
        }

    def get_status(self):
        """Returns comprehensive status dictionary for API."""
        return {
            "camera": self.camera_info,
            "fps": self.fps,
            "calibration": self.get_calibration_state()
        }
