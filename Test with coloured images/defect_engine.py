"""
Color-Aware AI Defect Detection Engine
Specialized for Dust and Scratch Detection on Colored Images (Watch Dials & Precision Components)

Features:
- Color-aware Multi-channel Analysis (CIE LAB, HSV, YCrCb, Grayscale)
- Contrast Limited Adaptive Histogram Equalization (CLAHE) for micro-defect enhancement
- Morphological Top-Hat & Black-Hat filtering for bright/dark dust particles
- Multi-angle Directional Gradient & Edge analysis for micro-scratches
- Dial / Component ROI auto-detection (circular dial masking)
- Anomaly Heatmap & Color-coded Visual Overlay generation
- Statistical comparison against golden reference (when available) or standalone single-image defect inspection
"""

import os
import time
import math
import cv2
import numpy as np


class DefectEngine:
    def __init__(self, golden_reference_path=None):
        self.golden_img = None
        self.golden_gray = None
        self.reference_images = []
        self.min_good = None
        self.max_good = None
        if golden_reference_path:
            self.load_golden_reference(golden_reference_path)

    def load_golden_reference(self, path_or_dir):
        """Load one or multiple pristine defect-free reference images to train statistical model."""
        if os.path.isdir(path_or_dir):
            paths = [os.path.join(path_or_dir, f) for f in os.listdir(path_or_dir) 
                     if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        elif os.path.isfile(path_or_dir):
            paths = [path_or_dir]
        else:
            return False

        loaded = [cv2.imread(p) for p in paths if cv2.imread(p) is not None]
        if not loaded:
            return False

        self.reference_images = loaded
        self.golden_img = loaded[0]
        self.golden_gray = cv2.cvtColor(self.golden_img, cv2.COLOR_BGR2GRAY)

        # Train statistical normal distribution
        if len(loaded) > 1:
            ref_gray = self.golden_gray
            aligned_goods = [ref_gray]
            warp_mode = cv2.MOTION_EUCLIDEAN
            criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 1e-3)
            for g in loaded[1:]:
                ggray = cv2.cvtColor(g, cv2.COLOR_BGR2GRAY)
                warp_matrix = np.eye(2, 3, dtype=np.float32)
                try:
                    _, warp_matrix = cv2.findTransformECC(ref_gray, ggray, warp_matrix, warp_mode, criteria)
                    aligned = cv2.warpAffine(ggray, warp_matrix, (ref_gray.shape[1], ref_gray.shape[0]), 
                                             flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
                    aligned_goods.append(aligned)
                except Exception:
                    aligned_goods.append(ggray)
            stacked = np.stack(aligned_goods, axis=0)
            self.min_good = np.min(stacked, axis=0).astype(np.int16)
            self.max_good = np.max(stacked, axis=0).astype(np.int16)
        else:
            self.min_good = self.golden_gray.astype(np.int16)
            self.max_good = self.golden_gray.astype(np.int16)
        return True

    def auto_detect_dial_roi(self, image):
        """
        Auto-detect circular watch dial / component region.
        Returns: (cx, cy, radius, mask)
        """
        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        
        # Blur slightly to suppress fine surface texture for circle detection
        blurred = cv2.GaussianBlur(gray, (9, 9), 2)
        
        # Try HoughCircles
        min_dim = min(h, w)
        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=min_dim // 3,
            param1=100,
            param2=50,
            minRadius=int(min_dim * 0.18),
            maxRadius=int(min_dim * 0.48)
        )
        
        if circles is not None:
            circles = np.uint16(np.around(circles))
            best_circle = circles[0][0]
            cx, cy, r = int(best_circle[0]), int(best_circle[1]), int(best_circle[2])
            # Ensure circle is reasonably centered
            if abs(cx - w // 2) < w * 0.25 and abs(cy - h // 2) < h * 0.25:
                # Use generous dial radius to include perimeter defects
                r_effective = max(int(r * 1.15), int(min_dim * 0.35))
                mask = np.zeros((h, w), dtype=np.uint8)
                cv2.circle(mask, (cx, cy), r_effective, 255, -1)
                return cx, cy, r_effective, mask

        # Fallback: Default concentric dial mask (center 72% of min dimension)
        cx, cy = w // 2, h // 2
        r = int(min_dim * 0.36)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.circle(mask, (cx, cy), r, 255, -1)
        return cx, cy, r, mask

    def detect_defects(self, image, sensitivity=50, min_size=2, max_size=500, 
                       defect_types="all", roi_mode="auto", custom_roi=None):
        """
        Perform high-resolution AI defect detection for dust and scratches on colored images.

        Parameters:
        - image: np.ndarray (BGR image)
        - sensitivity: 1 to 100 (higher = more sensitive to subtle dust/scratches)
        - min_size: minimum contour area in pixels
        - max_size: maximum contour area in pixels
        - defect_types: 'all', 'dust', 'scratch'
        - roi_mode: 'auto' (circular dial), 'full' (entire frame), 'custom' (cx,cy,r or rect)
        - custom_roi: dict with roi specs if roi_mode=='custom'

        Returns:
        - dict containing:
          - 'defects': list of defect objects (type, x, y, w, h, area, confidence)
          - 'dust_count': int
          - 'scratch_count': int
          - 'total_defects': int
          - 'annotated_image': BGR image with overlays
          - 'heatmap_image': Colorized anomaly heatmap
          - 'mask_image': Binary detection mask
          - 'processing_time_ms': float
        """
        start_time = time.time()
        h, w = image.shape[:2]

        # 1. Determine ROI Mask
        if roi_mode == "auto":
            cx, cy, radius, mask = self.auto_detect_dial_roi(image)
        elif roi_mode == "custom" and custom_roi:
            mask = np.zeros((h, w), dtype=np.uint8)
            if "radius" in custom_roi:
                cx = int(custom_roi.get("cx", w // 2))
                cy = int(custom_roi.get("cy", h // 2))
                r = int(custom_roi.get("radius", min(h, w) // 3))
                cv2.circle(mask, (cx, cy), r, 255, -1)
            elif "w" in custom_roi:
                x = int(custom_roi["x"])
                y = int(custom_roi["y"])
                bw = int(custom_roi["w"])
                bh = int(custom_roi["h"])
                mask[y:y+bh, x:x+bw] = 255
        else: # Full frame
            mask = np.ones((h, w), dtype=np.uint8) * 255

        # 2. Color Space Decompositions
        # Converting to LAB and HSV provides robust separation between luminance (L)
        # and chrominance (A, B) to handle colored dials accurately
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)

        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        h_channel, s_channel, v_channel = cv2.split(hsv)

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # 3. Contrast Enhancement with CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        enhanced_l = clahe.apply(l_channel)
        enhanced_gray = clahe.apply(gray)

        # Calibrate sensitivity (slider 1-100 maps to internal thresholds)
        # Higher sensitivity -> Lower threshold
        norm_sens = np.clip(sensitivity, 1, 100) / 100.0
        # dust_thresh ranges from 35 down to 10
        dust_thresh = int(35 - (norm_sens * 25))
        # scratch_thresh ranges from 45 down to 14
        scratch_thresh = int(45 - (norm_sens * 31))

        # ----------------------------------------------------
        # 4. DUST DETECTION PIPELINE
        # ----------------------------------------------------
        # Dust exhibits high local frequency variations (bright flecks or dark specks)
        # Use Morphological Top-Hat (bright dust) & Black-Hat (dark dust)
        kernel_dust_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        kernel_dust_med = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))

        # Bright dust (Top-Hat)
        tophat_small = cv2.morphologyEx(enhanced_l, cv2.MORPH_TOPHAT, kernel_dust_small)
        tophat_med = cv2.morphologyEx(enhanced_l, cv2.MORPH_TOPHAT, kernel_dust_med)
        bright_dust_map = cv2.max(tophat_small, tophat_med)

        # Dark dust (Black-Hat)
        blackhat_small = cv2.morphologyEx(enhanced_l, cv2.MORPH_BLACKHAT, kernel_dust_small)
        blackhat_med = cv2.morphologyEx(enhanced_l, cv2.MORPH_BLACKHAT, kernel_dust_med)
        dark_dust_map = cv2.max(blackhat_small, blackhat_med)

        # Color chrominance anomaly (color deviation on uniform dial background)
        # Compute gradient on a & b channels
        grad_a = cv2.morphologyEx(a_channel, cv2.MORPH_GRADIENT, kernel_dust_small)
        grad_b = cv2.morphologyEx(b_channel, cv2.MORPH_GRADIENT, kernel_dust_small)
        color_grad = cv2.addWeighted(grad_a, 0.5, grad_b, 0.5, 0)

        # If trained on good references, compute statistical difference map
        stat_anomaly = None
        if self.min_good is not None and self.golden_gray is not None:
            try:
                warp_matrix = np.eye(2, 3, dtype=np.float32)
                criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 1e-3)
                _, warp_matrix = cv2.findTransformECC(self.golden_gray, gray, warp_matrix, cv2.MOTION_EUCLIDEAN, criteria)
                aligned_gray = cv2.warpAffine(gray, warp_matrix, (self.golden_gray.shape[1], self.golden_gray.shape[0]),
                                             flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
                gray_16 = aligned_gray.astype(np.int16)
                diff_upper = np.maximum(0, gray_16 - self.max_good - 18)
                diff_lower = np.maximum(0, self.min_good - gray_16 - 18)
                stat_anomaly = np.maximum(diff_upper, diff_lower).astype(np.uint8)
                # Warp back to current image coordinate space
                stat_anomaly = cv2.warpAffine(stat_anomaly, warp_matrix, (w, h), flags=cv2.INTER_LINEAR)
            except Exception:
                stat_anomaly = None

        # Combined dust anomaly map
        dust_anomaly = cv2.max(bright_dust_map, dark_dust_map)
        dust_anomaly = cv2.addWeighted(dust_anomaly, 0.8, color_grad, 0.4, 0)
        if stat_anomaly is not None:
            dust_anomaly = cv2.max(dust_anomaly, stat_anomaly)
        dust_anomaly = cv2.bitwise_and(dust_anomaly, dust_anomaly, mask=mask)

        # Threshold dust
        _, dust_binary = cv2.threshold(dust_anomaly, dust_thresh, 255, cv2.THRESH_BINARY)
        # Remove isolated single-pixel noise
        dust_binary = cv2.morphologyEx(dust_binary, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))

        # ----------------------------------------------------
        # 5. SCRATCH DETECTION PIPELINE
        # ----------------------------------------------------
        # Scratches are thin, directional linear discontinuities.
        # Multi-angle directional filter (0, 45, 90, 135 degrees)
        scratch_responses = []
        for angle in [0, 45, 90, 135]:
            theta = np.deg2rad(angle)
            kernel_len = 11
            kernel_scratch = np.zeros((kernel_len, kernel_len), dtype=np.float32)
            for i in range(kernel_len):
                x_k = int((i - kernel_len // 2) * np.cos(theta) + kernel_len // 2)
                y_k = int((i - kernel_len // 2) * np.sin(theta) + kernel_len // 2)
                if 0 <= x_k < kernel_len and 0 <= y_k < kernel_len:
                    kernel_scratch[y_k, x_k] = 1.0
            kernel_scratch = kernel_scratch / max(np.sum(kernel_scratch), 1.0)
            
            # Line top-hat
            opened = cv2.morphologyEx(enhanced_gray, cv2.MORPH_OPEN, kernel_scratch.astype(np.uint8))
            diff = cv2.absdiff(enhanced_gray, opened)
            scratch_responses.append(diff)

        # Combine directional responses
        scratch_anomaly = scratch_responses[0]
        for sr in scratch_responses[1:]:
            scratch_anomaly = cv2.max(scratch_anomaly, sr)

        # High-pass Laplacian edge detection for sharp scratch ridges
        laplacian = cv2.Laplacian(enhanced_gray, cv2.CV_16S, ksize=3)
        laplacian_abs = cv2.convertScaleAbs(laplacian)
        scratch_anomaly = cv2.addWeighted(scratch_anomaly, 0.6, laplacian_abs, 0.4, 0)
        scratch_anomaly = cv2.bitwise_and(scratch_anomaly, scratch_anomaly, mask=mask)

        # Threshold scratches
        _, scratch_binary = cv2.threshold(scratch_anomaly, scratch_thresh, 255, cv2.THRESH_BINARY)
        scratch_binary = cv2.morphologyEx(scratch_binary, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))

        # ----------------------------------------------------
        # 6. COMBINED DEFECT CONTOUR EXTRACTION & CLASSIFICATION
        # ----------------------------------------------------
        # Merged anomaly map for heatmap display
        total_anomaly = cv2.max(dust_anomaly, scratch_anomaly)
        total_anomaly = cv2.bitwise_and(total_anomaly, total_anomaly, mask=mask)

        # Extract contours
        combined_binary = cv2.bitwise_or(dust_binary, scratch_binary)
        combined_binary = cv2.bitwise_and(combined_binary, combined_binary, mask=mask)

        contours, _ = cv2.findContours(combined_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        defects = []
        dust_count = 0
        scratch_count = 0

        annotated = image.copy()
        
        # Draw subtle ROI border on annotated output
        if roi_mode == "auto":
            cv2.circle(annotated, (cx, cy), radius, (223, 193, 109), 1, cv2.LINE_AA)

        for c in contours:
            area = cv2.contourArea(c)
            if area < min_size or area > max_size:
                continue

            x, y, bw, bh = cv2.boundingRect(c)
            perimeter = cv2.arcLength(c, True)
            
            # Geometric metrics for classification
            aspect_ratio = max(bw, bh) / max(min(bw, bh), 1)
            circularity = (4 * math.pi * area) / (perimeter * perimeter) if perimeter > 0 else 0
            
            # Scratch vs Dust classification:
            # - Scratches have high aspect ratio (elongated) or low circularity with significant length
            # - Dust is compact, relatively rounded, small bounding box
            is_scratch = (aspect_ratio >= 2.2 and max(bw, bh) >= 8) or (perimeter > 35 and circularity < 0.25)
            
            defect_type = "scratch" if is_scratch else "dust"

            if defect_types == "dust" and defect_type != "dust":
                continue
            if defect_types == "scratch" and defect_type != "scratch":
                continue

            # Calculate confidence score (0-100%) based on pixel intensity in anomaly map
            roi_anomaly = total_anomaly[y:y+bh, x:x+bw]
            mean_intensity = np.mean(roi_anomaly) if roi_anomaly.size > 0 else 0
            confidence = int(np.clip((mean_intensity / 180.0) * 100, 30, 99))

            center_x = int(x + bw / 2)
            center_y = int(y + bh / 2)
            radius_draw = max(int(max(bw, bh) / 2) + 6, 8)

            if defect_type == "dust":
                dust_count += 1
                color = (0, 220, 255) # Yellow/Gold for Dust
                label = f"Dust #{dust_count} ({confidence}%)"
                # Draw circular target around dust
                cv2.circle(annotated, (center_x, center_y), radius_draw, color, 2, cv2.LINE_AA)
                cv2.circle(annotated, (center_x, center_y), 2, (0, 255, 255), -1)
            else:
                scratch_count += 1
                color = (0, 69, 255) # Red/Orange for Scratch
                label = f"Scratch #{scratch_count} ({confidence}%)"
                # Draw rounded rectangle / contour for scratch
                cv2.rectangle(annotated, (x - 3, y - 3), (x + bw + 3, y + bh + 3), color, 2)

            # Draw small floating text badge
            text_pos = (max(x - 10, 5), max(y - 8, 15))
            cv2.putText(annotated, label, text_pos, cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 2, cv2.LINE_AA)
            cv2.putText(annotated, label, text_pos, cv2.FONT_HERSHEY_SIMPLEX, 0.42, color, 1, cv2.LINE_AA)

            defects.append({
                "id": len(defects) + 1,
                "type": defect_type,
                "x": int(x),
                "y": int(y),
                "w": int(bw),
                "h": int(bh),
                "area": float(area),
                "aspect_ratio": round(aspect_ratio, 2),
                "confidence": confidence,
                "label": label
            })

        # ----------------------------------------------------
        # 7. COLORIZED ANOMALY HEATMAP
        # ----------------------------------------------------
        # Normalize total anomaly map for JET / INFERNO colormap
        norm_map = cv2.normalize(total_anomaly, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
        heatmap = cv2.applyColorMap(norm_map, cv2.COLORMAP_JET)
        # Dim background outside mask
        heatmap = cv2.bitwise_and(heatmap, heatmap, mask=mask)
        # Blend 35% with original image for context
        heatmap_blend = cv2.addWeighted(image, 0.45, heatmap, 0.55, 0)

        elapsed_ms = round((time.time() - start_time) * 1000, 1)

        return {
            "defects": defects,
            "dust_count": dust_count,
            "scratch_count": scratch_count,
            "total_defects": len(defects),
            "annotated_image": annotated,
            "heatmap_image": heatmap_blend,
            "binary_mask": combined_binary,
            "processing_time_ms": elapsed_ms,
            "dial_roi": {"cx": cx, "cy": cy, "radius": radius} if roi_mode == "auto" else None
        }


# Quick CLI verification
if __name__ == "__main__":
    engine = DefectEngine()
    test_path = r"testing\defect\defective.png"
    if os.path.exists(test_path):
        test_img = cv2.imread(test_path)
        res = engine.detect_defects(test_img, sensitivity=65)
        print(f"Test run completed in {res['processing_time_ms']} ms:")
        print(f"  Dust: {res['dust_count']}")
        print(f"  Scratches: {res['scratch_count']}")
        print(f"  Total Defects: {res['total_defects']}")
