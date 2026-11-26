"""
Mech-Eye Camera Streamer & Capture Engine for Cobot Inspection
Interfaces with Mech-Eye UHP-140 camera, provides real-time MJPEG live stream,
and captures pristine high-resolution frames with precision ROI cropping:
  - Vertically 29mm from center (total height 58mm / ~922px)
  - Horizontally 26mm from center (total width 52mm / ~828px)
"""

import os
import time
import threading
import traceback
import cv2
import numpy as np

# Import Mech-Eye SDK
MECHEYE_AVAILABLE = False
try:
    from mecheye.shared import *
    from mecheye.area_scan_3d_camera import *
    from mecheye.area_scan_3d_camera_utils import find_and_connect
    MECHEYE_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] Mech-Eye SDK not available: {e}. Running in simulation mode.")


class CameraManager:
    def __init__(self):
        self.camera = None
        self.is_connected = False
        self.camera_info = {
            "model": "Unknown",
            "ip": "Unknown",
            "serial": "Unknown",
            "firmware": "Unknown",
            "resolution": "2048 x 1536",
            "is_real": False,
            "connected": False
        }

        # Crop parameters (From center of the screen: 29mm vertically, 26mm horizontally)
        self.crop_enabled = True
        self.crop_live_stream = False  # If True, live feed is cropped; if False, shows green ROI overlay
        self.crop_mm_h = 26.0  # mm from center horizontally (total 52mm)
        self.crop_mm_v = 29.0  # mm from center vertically (total 58mm)
        self.working_dist_z = 300.0  # mm (UHP-140 standard working distance)
        self.fx = 4771.212
        self.fy = 4770.737
        self.pixels_per_mm_x = self.fx / self.working_dist_z  # ~15.904 px/mm
        self.pixels_per_mm_y = self.fy / self.working_dist_z  # ~15.902 px/mm
        self.center_x = 1024
        self.center_y = 768

        self.raw_frame = None
        self.jpeg_bytes = None
        self.frame_lock = threading.Lock()

        self.running = False
        self.capture_thread = None
        self.fps = 0.0
        self.frame_count = 0
        self.last_fps_time = time.time()

        # Connect on startup
        self.connect()

    def get_crop_bounds(self, width=2048, height=1536):
        """Calculates pixel bounding box for the 26mm x 29mm crop from center."""
        dx = int(round(self.crop_mm_h * self.pixels_per_mm_x))
        dy = int(round(self.crop_mm_v * self.pixels_per_mm_y))
        cx = self.center_x
        cy = self.center_y
        x1 = max(0, cx - dx)
        x2 = min(width, cx + dx)
        y1 = max(0, cy - dy)
        y2 = min(height, cy + dy)
        return x1, y1, x2, y2

    def update_crop_settings(self, **kwargs):
        """Updates crop settings in real-time."""
        with self.frame_lock:
            if "crop_enabled" in kwargs:
                self.crop_enabled = bool(kwargs["crop_enabled"])
            if "crop_live_stream" in kwargs:
                self.crop_live_stream = bool(kwargs["crop_live_stream"])
            if "crop_mm_h" in kwargs:
                self.crop_mm_h = max(1.0, float(kwargs["crop_mm_h"]))
            if "crop_mm_v" in kwargs:
                self.crop_mm_v = max(1.0, float(kwargs["crop_mm_v"]))
            if "center_x" in kwargs:
                self.center_x = int(kwargs["center_x"])
            if "center_y" in kwargs:
                self.center_y = int(kwargs["center_y"])
            if "working_dist_z" in kwargs:
                self.working_dist_z = max(50.0, float(kwargs["working_dist_z"]))
                self.pixels_per_mm_x = self.fx / self.working_dist_z
                self.pixels_per_mm_y = self.fy / self.working_dist_z

        return self.get_crop_state()

    def get_crop_state(self):
        """Returns current crop settings and pixel bounds."""
        w, h = 2048, 1536
        if self.raw_frame is not None:
            h, w = self.raw_frame.shape[:2]

        x1, y1, x2, y2 = self.get_crop_bounds(w, h)
        crop_w = x2 - x1
        crop_h = y2 - y1

        return {
            "crop_enabled": self.crop_enabled,
            "crop_live_stream": self.crop_live_stream,
            "crop_mm_h": self.crop_mm_h,
            "crop_mm_v": self.crop_mm_v,
            "working_dist_z": self.working_dist_z,
            "center_x": self.center_x,
            "center_y": self.center_y,
            "bounds": [x1, y1, x2, y2],
            "crop_resolution": f"{crop_w} x {crop_h}",
            "crop_width_px": crop_w,
            "crop_height_px": crop_h,
            "pixels_per_mm": round(self.pixels_per_mm_x, 3)
        }

    def connect(self):
        """Attempts connection to physical Mech-Eye camera or initializes simulation."""
        with self.frame_lock:
            if self.is_connected:
                return True

            if MECHEYE_AVAILABLE:
                try:
                    cameras = Camera.discover_cameras()
                    if cameras and len(cameras) > 0:
                        cam_info = cameras[0]
                        print(f"[INFO] Connecting to Mech-Eye Camera: {cam_info.model} at {cam_info.ip_address}")
                        self.camera = Camera()
                        status = self.camera.connect(cam_info)
                        if not status.is_ok():
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

                            # Query camera intrinsics for exact focal length
                            try:
                                intr = CameraIntrinsics()
                                self.camera.get_camera_intrinsics(intr)
                                self.fx = float(intr.texture.camera_matrix.fx)
                                self.fy = float(intr.texture.camera_matrix.fy)
                                self.pixels_per_mm_x = self.fx / self.working_dist_z
                                self.pixels_per_mm_y = self.fy / self.working_dist_z
                                print(f"[INFO] Loaded camera intrinsics: fx={self.fx:.1f}, fy={self.fy:.1f}, scale={self.pixels_per_mm_x:.2f}px/mm")
                            except Exception as e:
                                print(f"[WARN] Could not read intrinsics: {e}")

                            print(f"[INFO] Connected successfully to {cam_info.model}")
                            self._start_worker()
                            return True
                        else:
                            err_msg = status.error_description if hasattr(status, 'error_description') else str(status)
                            print(f"[WARN] Failed to connect to camera: {err_msg}")
                    else:
                        print("[WARN] No Mech-Eye cameras detected.")
                except Exception as e:
                    print(f"[ERROR] Exception during Mech-Eye connection: {traceback.format_exc()}")

            # Fallback to simulation mode
            print("[INFO] Fallback: Initializing simulated camera feed.")
            self.camera = None
            self.is_connected = True
            self.camera_info = {
                "model": "Simulated Mech-Eye UHP-140",
                "ip": "127.0.0.1 (Simulation)",
                "serial": "SIM-UHP-140",
                "firmware": "v2.5.4",
                "resolution": "2048 x 1536",
                "is_real": False,
                "connected": True
            }
            self._start_worker()
            return True

    def disconnect(self):
        """Disconnects camera and stops capture worker."""
        self.running = False
        if self.capture_thread and self.capture_thread.is_alive():
            self.capture_thread.join(timeout=2.0)

        with self.frame_lock:
            if self.camera and self.is_connected:
                try:
                    self.camera.disconnect()
                    print("[INFO] Camera disconnected.")
                except Exception as e:
                    print(f"[ERROR] Disconnect error: {e}")
            self.is_connected = False
            self.camera_info["connected"] = False

    def _start_worker(self):
        self.running = True
        self.capture_thread = threading.Thread(target=self._capture_worker, daemon=True)
        self.capture_thread.start()

    def _capture_worker(self):
        frame_2d = None
        if MECHEYE_AVAILABLE and self.camera_info["is_real"]:
            frame_2d = Frame2D()

        sim_canvas = None

        while self.running:
            img = None

            if self.camera_info["is_real"] and self.camera and frame_2d is not None:
                try:
                    err = self.camera.capture_2d(frame_2d)
                    if err.is_ok():
                        if frame_2d.color_type() == ColorTypeOf2DCamera_Monochrome:
                            gray = frame_2d.get_gray_scale_image().data()
                            img = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
                        else:
                            col = frame_2d.get_color_image().data()
                            img = cv2.cvtColor(col, cv2.COLOR_RGB2BGR)
                    else:
                        time.sleep(0.05)
                except Exception as e:
                    time.sleep(0.05)

            if img is None:
                # Generate synthetic test frame
                if sim_canvas is None:
                    h, w = 1536, 2048
                    sim_canvas = np.zeros((h, w, 3), dtype=np.uint8)
                    sim_canvas[:] = (24, 28, 36)
                    # Draw fixture grid
                    for x in range(0, w, 128):
                        cv2.line(sim_canvas, (x, 0), (x, h), (40, 45, 56), 1)
                    for y in range(0, h, 128):
                        cv2.line(sim_canvas, (0, y), (w, y), (40, 45, 56), 1)
                    cx, cy = w // 2, h // 2
                    # Simulated watch bezel & dial
                    cv2.circle(sim_canvas, (cx, cy), 380, (80, 85, 95), 8)
                    cv2.circle(sim_canvas, (cx, cy), 350, (35, 40, 50), -1)
                    cv2.circle(sim_canvas, (cx, cy), 340, (120, 130, 150), 2)
                    for a in range(0, 360, 30):
                        rad = np.radians(a)
                        x1 = int(cx + 310 * np.cos(rad))
                        y1 = int(cy + 310 * np.sin(rad))
                        x2 = int(cx + 335 * np.cos(rad))
                        y2 = int(cy + 335 * np.sin(rad))
                        cv2.line(sim_canvas, (x1, y1), (x2, y2), (200, 210, 230), 4)

                img = sim_canvas.copy()
                t = time.time()
                cx, cy = 2048 // 2, 1536 // 2
                angle = (t % 60) * 6.0
                rad = np.radians(angle - 90)
                hx = int(cx + 260 * np.cos(rad))
                hy = int(cy + 260 * np.sin(rad))
                cv2.line(img, (cx, cy), (hx, hy), (0, 255, 100), 3, cv2.LINE_AA)
                cv2.circle(img, (cx, cy), 12, (0, 255, 100), -1)
                time.sleep(0.04)

            # Update resolution
            h, w = img.shape[:2]
            self.camera_info["resolution"] = f"{w} x {h}"

            # Prepare display image (with crop box or cropped view)
            x1, y1, x2, y2 = self.get_crop_bounds(w, h)

            if self.crop_live_stream and self.crop_enabled:
                # View only the cropped region
                disp = img[y1:y2, x1:x2].copy()
                dh, dw = disp.shape[:2]
                dcx, dcy = dw // 2, dh // 2
                # Subtle center crosshair in cropped view
                cv2.line(disp, (dcx - 20, dcy), (dcx + 20, dcy), (0, 255, 100), 1, cv2.LINE_AA)
                cv2.line(disp, (dcx, dcy - 20), (dcx, dcy + 20), (0, 255, 100), 1, cv2.LINE_AA)
                cv2.putText(disp, f"CROPPED: {dw}x{dh} px (26mm x 29mm)", (14, 28),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 100), 1, cv2.LINE_AA)
            else:
                # Full frame with prominent green crop box overlay
                disp = img.copy()
                if self.crop_enabled:
                    # Prominent green bounding box for 26mm x 29mm from center
                    cv2.rectangle(disp, (x1, y1), (x2, y2), (0, 255, 0), 2, cv2.LINE_AA)
                    # Corner brackets for high visibility
                    corner_len = 30
                    # Top-left
                    cv2.line(disp, (x1, y1), (x1 + corner_len, y1), (0, 255, 0), 4)
                    cv2.line(disp, (x1, y1), (x1, y1 + corner_len), (0, 255, 0), 4)
                    # Top-right
                    cv2.line(disp, (x2, y1), (x2 - corner_len, y1), (0, 255, 0), 4)
                    cv2.line(disp, (x2, y1), (x2, y1 + corner_len), (0, 255, 0), 4)
                    # Bottom-left
                    cv2.line(disp, (x1, y2), (x1 + corner_len, y2), (0, 255, 0), 4)
                    cv2.line(disp, (x1, y2), (x1, y2 - corner_len), (0, 255, 0), 4)
                    # Bottom-right
                    cv2.line(disp, (x2, y2), (x2 - corner_len, y2), (0, 255, 0), 4)
                    cv2.line(disp, (x2, y2), (x2 - corner_len, y2), (0, 255, 0), 4)

                    # Center crosshair mark
                    cv2.line(disp, (self.center_x - 35, self.center_y), (self.center_x + 35, self.center_y), (0, 255, 0), 1, cv2.LINE_AA)
                    cv2.line(disp, (self.center_x, self.center_y - 35), (self.center_x, self.center_y + 35), (0, 255, 0), 1, cv2.LINE_AA)
                    cv2.circle(disp, (self.center_x, self.center_y), 3, (0, 255, 0), -1)

                    # Label badge above ROI
                    crop_w, crop_h = x2 - x1, y2 - y1
                    tag = f"CROP ROI: 26mm x 29mm ({crop_w}x{crop_h} px)"
                    cv2.putText(disp, tag, (x1 + 6, max(30, y1 - 10)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 0), 2, cv2.LINE_AA)

            ret, jpeg = cv2.imencode('.jpg', disp, [cv2.IMWRITE_JPEG_QUALITY, 80])

            with self.frame_lock:
                self.raw_frame = img
                if ret:
                    self.jpeg_bytes = jpeg.tobytes()

                self.frame_count += 1
                now = time.time()
                elapsed = now - self.last_fps_time
                if elapsed >= 1.0:
                    self.fps = round(self.frame_count / elapsed, 1)
                    self.frame_count = 0
                    self.last_fps_time = now

    def get_jpeg_frame(self):
        """Returns latest compressed JPEG bytes for streaming."""
        with self.frame_lock:
            return self.jpeg_bytes

    def capture_pristine_frame(self):
        """
        Returns a pristine copy of the latest raw frame.
        If crop_enabled is True, returns the cropped ROI (26mm x 29mm from center).
        """
        with self.frame_lock:
            if self.raw_frame is None:
                return None
            img = self.raw_frame.copy()

        if self.crop_enabled:
            h, w = img.shape[:2]
            x1, y1, x2, y2 = self.get_crop_bounds(w, h)
            return img[y1:y2, x1:x2].copy()

        return img

    def get_status(self):
        """Returns status dictionary."""
        return {
            "camera": self.camera_info,
            "fps": self.fps,
            "crop": self.get_crop_state()
        }
