"""
Camera Manager for PatchCore Defect Detection Studio
Handles connection, frame retrieval, and 26mm x 29mm ROI cropping
for the Mech-Eye UHP-140 camera.
"""

import os
import time
import threading
import numpy as np
import cv2

try:
    from mecheye.shared import *
    from mecheye.area_scan_3d_camera import *
    from mecheye.area_scan_3d_camera_utils import find_and_connect
    MECHEYE_AVAILABLE = True
except ImportError:
    MECHEYE_AVAILABLE = False


class CameraManager:
    # Sensor specs for Mech-Eye UHP-140 at standard working distance Z = 300mm
    # fx = 4771.2 px, fy = 4770.7 px -> scale approx 15.904 px/mm
    DEFAULT_MM_PER_PIXEL = 1.0 / 15.904  # ~0.06287 mm/px
    TARGET_WIDTH_MM = 26.0               # Horizontally 26 mm from center
    TARGET_HEIGHT_MM = 29.0              # Vertically 29 mm from center

    def __init__(self, target_ip="169.254.8.29"):
        self.target_ip = target_ip
        self.camera = None
        self.is_connected = False
        self.is_real_camera = False

        self.latest_frame = None
        self.latest_cropped_frame = None
        self.latest_jpeg = None
        self.frame_lock = threading.Lock()
        self.running = False
        self.capture_thread = None

        self.crop_enabled = True
        self.crop_live_stream = False
        self.fps = 0.0
        self.intrinsics_scale = None

        self.connect()

    def connect(self):
        """Attempts connection to the physical Mech-Eye UHP-140 camera."""
        if not MECHEYE_AVAILABLE:
            print("[WARN] Mech-Eye SDK not installed. Running in Camera Simulation mode.")
            self._start_simulation()
            return False

        try:
            cameras = Camera.discover_cameras()
            if cameras and len(cameras) > 0:
                cam_info = cameras[0]
                print(f"[INFO] Connecting to Mech-Eye Camera: {cam_info.model} at {cam_info.ip_address}...")
                self.camera = Camera()
                status = self.camera.connect(cam_info)
                if not status.is_ok():
                    time.sleep(1.0)
                    status = self.camera.connect(cam_info)

                if status.is_ok():
                    self.is_connected = True
                    self.is_real_camera = True
                    self._load_intrinsics()
                    print(f"[INFO] Connected successfully to Mech-Eye UHP-140 ({cam_info.ip_address})")
                    self._start_capture_loop()
                    return True
                else:
                    err_desc = getattr(status, "description", str(status))
                    print(f"[WARN] Failed to connect to camera: {err_desc}")
            else:
                print("[WARN] No Mech-Eye cameras discovered.")

            print("[WARN] Mech-Eye camera not available. Starting simulation mode.")
            self._start_simulation()
            return False

        except Exception as e:
            print(f"[ERROR] Camera connection error: {e}. Starting simulation mode.")
            self._start_simulation()
            return False

    def _load_intrinsics(self):
        """Loads camera intrinsic parameters to calculate accurate px/mm scaling."""
        try:
            intrinsics = CameraIntrinsics()
            err = self.camera.get_camera_intrinsics(intrinsics)
            if err.is_ok():
                fx = float(intrinsics.texture.camera_matrix.fx)
                fy = float(intrinsics.texture.camera_matrix.fy)
                working_dist_mm = 300.0
                px_per_mm = ((fx + fy) / 2.0) / working_dist_mm
                self.intrinsics_scale = px_per_mm
                print(f"[INFO] Loaded camera intrinsics: fx={fx:.1f}, fy={fy:.1f}, scale={px_per_mm:.2f}px/mm")
            else:
                self.intrinsics_scale = 1.0 / self.DEFAULT_MM_PER_PIXEL
        except Exception as e:
            print(f"[WARN] Could not read intrinsics: {e}. Using calibrated default.")
            self.intrinsics_scale = 1.0 / self.DEFAULT_MM_PER_PIXEL

    def _start_simulation(self):
        """Starts synthetic frame generator if hardware camera is not available."""
        self.is_connected = True
        self.is_real_camera = False
        self.intrinsics_scale = 1.0 / self.DEFAULT_MM_PER_PIXEL
        self._start_capture_loop()

    def _start_capture_loop(self):
        if self.running:
            return
        self.running = True
        self.capture_thread = threading.Thread(target=self._capture_worker, daemon=True)
        self.capture_thread.start()

    def _get_crop_box(self, width, height):
        """Computes center-aligned crop bounding box for slot size: 26mm from center horizontally, 29mm from center vertically (total 52mm x 58mm -> 828px x 922px)."""
        scale = self.intrinsics_scale if self.intrinsics_scale else (1.0 / self.DEFAULT_MM_PER_PIXEL)
        dx = int(round(self.TARGET_WIDTH_MM * scale))   # 26mm * ~15.904 = 414px from center -> total 828px
        dy = int(round(self.TARGET_HEIGHT_MM * scale))  # 29mm * ~15.902 = 461px from center -> total 922px

        cx = width // 2
        cy = height // 2

        x1 = max(0, cx - dx)
        y1 = max(0, cy - dy)
        x2 = min(width, cx + dx)
        y2 = min(height, cy + dy)

        return x1, y1, x2, y2

    def crop_frame(self, frame):
        """Crops image to exact 26mm x 29mm centered region."""
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = self._get_crop_box(w, h)
        return frame[y1:y2, x1:x2].copy()

    def _capture_worker(self):
        fps_counter = 0
        fps_timer = time.time()
        frame_2d = Frame2D() if MECHEYE_AVAILABLE else None

        while self.running:
            raw_frame = None

            if self.is_real_camera and self.camera and frame_2d is not None:
                try:
                    error = self.camera.capture_2d(frame_2d)
                    if error.is_ok():
                        color_image = frame_2d.get_color_image()
                        raw_data = color_image.data()
                        if len(raw_data.shape) == 3 and raw_data.shape[2] == 3:
                            raw_frame = cv2.cvtColor(raw_data, cv2.COLOR_RGB2BGR)
                    else:
                        time.sleep(0.04)
                except Exception as e:
                    print(f"[WARN] Frame capture exception: {e}")
                    time.sleep(0.04)

            if raw_frame is None:
                if self.is_real_camera:
                    time.sleep(0.04)
                    continue
                # Synthetic watch frame ONLY for simulation/testing when no hardware camera exists
                raw_frame = self._generate_simulated_frame()
                time.sleep(0.04)

            # Generate pristine crop (26mm x 29mm)
            cropped_frame = self.crop_frame(raw_frame)

            # Generate display frame with ROI overlay box
            display_frame = raw_frame.copy()
            h, w = display_frame.shape[:2]
            x1, y1, x2, y2 = self._get_crop_box(w, h)

            if self.crop_live_stream and self.crop_enabled:
                view_frame = cropped_frame.copy()
            else:
                view_frame = display_frame
                if self.crop_enabled:
                    # Draw subtle green corner brackets around ROI
                    color = (0, 255, 100)
                    corner_len = 25
                    th = 2
                    # Top-left
                    cv2.line(view_frame, (x1, y1), (x1 + corner_len, y1), color, th)
                    cv2.line(view_frame, (x1, y1), (x1, y1 + corner_len), color, th)
                    # Top-right
                    cv2.line(view_frame, (x2, y1), (x2 - corner_len, y1), color, th)
                    cv2.line(view_frame, (x2, y1), (x2 - corner_len, y1), color, th)
                    # Bottom-left
                    cv2.line(view_frame, (x1, y2), (x1 + corner_len, y2), color, th)
                    cv2.line(view_frame, (x1, y2), (x1 - corner_len, y2), color, th)
                    # Bottom-right
                    cv2.line(view_frame, (x2, y2), (x2 - corner_len, y2), color, th)
                    cv2.line(view_frame, (x2, y2), (x2 - corner_len, y2), color, th)

            # Compress for MJPEG web streaming
            ret, jpeg = cv2.imencode('.jpg', view_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])

            with self.frame_lock:
                self.latest_frame = raw_frame
                self.latest_cropped_frame = cropped_frame
                if ret:
                    self.latest_jpeg = jpeg.tobytes()

            fps_counter += 1
            if time.time() - fps_timer >= 1.0:
                self.fps = fps_counter / (time.time() - fps_timer)
                fps_counter = 0
                fps_timer = time.time()

    def _generate_simulated_frame(self):
        """Generates synthetic watch dial in compartment."""
        img = np.full((1536, 2048, 3), 28, dtype=np.uint8)
        cx, cy = 1024, 768

        # Watch slot fixture boundary
        cv2.rectangle(img, (cx - 414, cy - 461), (cx + 414, cy + 461), (45, 52, 65), -1)
        cv2.rectangle(img, (cx - 414, cy - 461), (cx + 414, cy + 461), (60, 70, 90), 2)

        # Watch case
        cv2.circle(img, (cx, cy), 320, (190, 195, 205), -1)
        cv2.circle(img, (cx, cy), 310, (80, 85, 95), 2)

        # Watch dial
        cv2.circle(img, (cx, cy), 280, (225, 228, 235), -1)
        cv2.circle(img, (cx, cy), 280, (50, 55, 65), 3)

        # Hour markers
        for angle in range(0, 360, 30):
            rad = np.deg2rad(angle)
            p1 = (int(cx + 240 * np.cos(rad)), int(cy + 240 * np.sin(rad)))
            p2 = (int(cx + 270 * np.cos(rad)), int(cy + 270 * np.sin(rad)))
            cv2.line(img, p1, p2, (30, 35, 45), 3)

        # Watch hands (animated by time)
        t = time.time()
        hour_rad = np.deg2rad((t * 5) % 360)
        min_rad = np.deg2rad((t * 30) % 360)
        cv2.line(img, (cx, cy), (int(cx + 150 * np.cos(hour_rad)), int(cy + 150 * np.sin(hour_rad))), (20, 20, 25), 6)
        cv2.line(img, (cx, cy), (int(cx + 220 * np.cos(min_rad)), int(cy + 220 * np.sin(min_rad))), (20, 20, 25), 4)
        cv2.circle(img, (cx, cy), 12, (200, 40, 40), -1)

        return img

    def capture_pristine_frame(self):
        """Returns the current pristine frame, cropped to 26mm x 29mm if enabled."""
        with self.frame_lock:
            if self.latest_frame is None:
                return None
            if self.crop_enabled and self.latest_cropped_frame is not None:
                return self.latest_cropped_frame.copy()
            return self.latest_frame.copy()

    def get_jpeg_frame(self):
        with self.frame_lock:
            return self.latest_jpeg

    def disconnect(self):
        self.running = False
        if self.capture_thread and self.capture_thread.is_alive():
            self.capture_thread.join(timeout=1.5)
        if self.camera and self.is_real_camera:
            try:
                self.camera.disconnect()
                print("[INFO] Mech-Eye Camera disconnected.")
            except Exception:
                pass
        self.is_connected = False
        self.is_real_camera = False

    def reconnect(self):
        """Attempts to reconnect to the camera."""
        self.disconnect()
        time.sleep(0.5)
        return self.connect()

    def get_status(self):
        return {
            "connected": self.is_connected,
            "is_real": self.is_real_camera,
            "fps": round(self.fps, 1),
            "crop_enabled": self.crop_enabled,
            "crop_resolution": f"{int(round(self.TARGET_WIDTH_MM * 2 * (self.intrinsics_scale or 15.904)))} x {int(round(self.TARGET_HEIGHT_MM * 2 * (self.intrinsics_scale or 15.904)))}"
        }
