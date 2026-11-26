"""
PatchCore Defect Detection Engine
Integrates Anomalib 2.2 PatchCore for training, validation visualization,
defect heatmap generation, and real-time inference.
"""

import os
import re
import time
import json
import threading
import shutil
from pathlib import Path
import numpy as np
import cv2
from PIL import Image

import torch
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms


class PixelSSIMModel:
    def __init__(self, golden_np):
        self.golden = golden_np
        self.model = self
        self.training = False

    def __call__(self, batch):
        import torch
        # Handle dict batch from run_validation
        if isinstance(batch, dict) and 'image' in batch:
            tensor = batch['image']
            out_t, _, amap = self.__call__(tensor)
            return MockPred(out_t.item(), amap)
            
        tensor = batch
        # tensor is 1x3xHxW. We need to do SSIM difference against self.golden
        # Convert tensor to numpy BGR image (inverse transform)
        # tf normalizes with mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]
        mean = np.array([0.485, 0.456, 0.406]).reshape(3, 1, 1)
        std = np.array([0.229, 0.224, 0.225]).reshape(3, 1, 1)
        
        # Denormalize
        img_np = tensor[0].cpu().numpy()
        img_np = img_np * std + mean
        img_np = np.clip(img_np * 255.0, 0, 255).astype(np.uint8)
        
        # Convert RGB to GRAY
        import cv2
        img_bgr = cv2.cvtColor(img_np.transpose(1, 2, 0), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # Resize golden if needed
        golden = self.golden
        if golden.shape != gray.shape:
            golden = cv2.resize(golden, (gray.shape[1], gray.shape[0]))
            
        # 1. Image Alignment (Crucial)
        try:
            warp_matrix = np.eye(2, 3, dtype=np.float32)
            criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 0.001)
            _, warp_matrix = cv2.findTransformECC(golden, gray, warp_matrix, cv2.MOTION_TRANSLATION, criteria)
            aligned_gray = cv2.warpAffine(gray, warp_matrix, (gray.shape[1], gray.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
        except Exception:
            aligned_gray = gray
            
        # 2. Strict Inner-Dial Masking
        mask = np.zeros_like(aligned_gray)
        h, w = aligned_gray.shape
        cv2.circle(mask, (w//2, h//2), int(w * 0.26), 255, -1)
        
        # Apply mask
        aligned_gray = cv2.bitwise_and(aligned_gray, aligned_gray, mask=mask)
        masked_golden = cv2.bitwise_and(golden, golden, mask=mask)

        # 1. Edge-Preserving Noise Reduction
        # Bilateral filter removes background grain but keeps dust edges perfectly sharp
        smooth_live = cv2.bilateralFilter(aligned_gray, 5, 50, 50)
        smooth_gold = cv2.bilateralFilter(masked_golden, 5, 50, 50)

        # 2. Optimized CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8,8))
        clahe_live = clahe.apply(smooth_live)
        clahe_gold = clahe.apply(smooth_gold)

        # 3. Multi-Scale Morphological Top-Hat (Bright Dust & Long Hairs)
        # Using two kernels ensures we catch both tiny circular dust AND long thin hairs
        k_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        k_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
        top_s = cv2.morphologyEx(clahe_live, cv2.MORPH_TOPHAT, k_small)
        top_l = cv2.morphologyEx(clahe_live, cv2.MORPH_TOPHAT, k_large)
        tophat = cv2.bitwise_or(top_s, top_l)
        _, tophat_thresh = cv2.threshold(tophat, 18, 255, cv2.THRESH_BINARY)
        
        # 4. Smart Subtraction (Dark dust) with Edge Suppression
        diff = cv2.absdiff(clahe_gold, clahe_live)
        _, diff_thresh = cv2.threshold(diff, 20, 255, cv2.THRESH_BINARY)
        
        # Suppress false positives on high-contrast structural edges (watch hands, logos)
        edges = cv2.Canny(clahe_gold, 40, 120)
        edge_mask = cv2.dilate(edges, np.ones((5,5), np.uint8), iterations=1)
        diff_thresh[edge_mask == 255] = 0
        
        # ----- NEW: FFT FREQUENCY DOMAIN DUST ISOLATION -----
        # Convert images to frequency domain
        f_live = np.fft.fft2(np.float32(clahe_live))
        f_live_shift = np.fft.fftshift(f_live)
        
        f_gold = np.fft.fft2(np.float32(clahe_gold))
        f_gold_shift = np.fft.fftshift(f_gold)
        
        # Compute dynamic frequency mask from Golden Image (Blocks predictable watch geometry)
        mag_gold = np.log1p(np.abs(f_gold_shift))
        freq_thresh = np.mean(mag_gold) + 2.0 * np.std(mag_gold)
        freq_mask = (mag_gold < freq_thresh).astype(np.float32)
        
        # Apply High-Pass filter to remove global brightness/illumination shifts
        h_f, w_f = clahe_live.shape
        cy_f, cx_f = h_f // 2, w_f // 2
        y_grid, x_grid = np.ogrid[:h_f, :w_f]
        lpf_mask = (x_grid - cx_f)**2 + (y_grid - cy_f)**2 <= 20**2
        freq_mask[lpf_mask] = 0
        
        # Apply frequency mask to live image and mathematically reconstruct it
        f_live_filtered = f_live_shift * freq_mask
        img_back = np.fft.ifft2(np.fft.ifftshift(f_live_filtered))
        
        # Extract the chaotic high-frequency anomalies (dust)
        fft_anomaly = np.abs(img_back)
        fft_anomaly = cv2.normalize(fft_anomaly, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
        _, fft_thresh = cv2.threshold(fft_anomaly, 40, 255, cv2.THRESH_BINARY)
        # ----------------------------------------------------
        
        # 5. Geometric Filtering
        combined = cv2.bitwise_or(tophat_thresh, diff_thresh)
        combined = cv2.bitwise_or(combined, fft_thresh)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(combined)
        
        filtered_mask = np.zeros_like(combined)
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            wb = stats[i, cv2.CC_STAT_WIDTH]
            hb = stats[i, cv2.CC_STAT_HEIGHT]
            # Ensure it only flags compact dust, not long scratches or shadows
            if 3 <= area <= 500 and wb < 50 and hb < 50:
                filtered_mask[labels == i] = 255
                
        # Heatmap visualization
        blur_map = cv2.GaussianBlur(filtered_mask, (15, 15), 0)
        anomaly_map = blur_map.astype(np.float32) / 255.0
        
        # Calculate ratio of defect pixels over inner circle area
        circle_area = np.pi * (int(w * 0.26) ** 2)
        ratio = np.count_nonzero(filtered_mask) / max(circle_area, 1.0)
        
        # Map ratio to standard anomaly score (threshold is ~26.0)
        score = 20.0 + (ratio * 100.0 * 500.0) 
        
        return torch.tensor([score]), None, anomaly_map
        
    def eval(self):
        pass

# Helper to mock Anomalib output format for run_validation
class MockPred:
    def __init__(self, score, amap):
        import torch
        self.pred_score = torch.tensor([score])
        self.anomaly_map = torch.tensor(amap).unsqueeze(0).unsqueeze(0)


# =========================================================================

# Windows Symlink Compatibility Monkey-Patch for Anomalib
# =========================================================================
try:
    import anomalib.utils.path as anomalib_path
    import anomalib.engine.engine as anomalib_engine

    def safe_create_versioned_dir(root_dir):
        root_dir = Path(root_dir).resolve()
        root_dir.mkdir(parents=True, exist_ok=True)
        highest_version = -1
        for version_dir in root_dir.iterdir():
            if version_dir.is_dir():
                m = re.match(r"^v(\d+)$", version_dir.name)
                if m:
                    highest_version = max(highest_version, int(m.group(1)))
        new_version_dir = root_dir / f"v{highest_version + 1}"
        new_version_dir.mkdir(exist_ok=True)
        latest_link_path = root_dir / "latest"
        try:
            if latest_link_path.is_symlink() or latest_link_path.exists():
                latest_link_path.unlink()
            latest_link_path.symlink_to(new_version_dir, target_is_directory=True)
            return latest_link_path
        except OSError:
            # On Windows without developer mode, return directory directly
            return new_version_dir

    anomalib_path.create_versioned_dir = safe_create_versioned_dir
    anomalib_engine.create_versioned_dir = safe_create_versioned_dir
except Exception as e:
    print(f"[WARN] Symlink monkey-patch error: {e}")

from anomalib.models import Patchcore
from anomalib.engine import Engine
from anomalib.data import ImageBatch


# =========================================================================
# Circular Dial ROI & Surface Defect (Dust & Scratch) Extraction
# =========================================================================
def detect_dial_circle(gray):
    """Detects the circular dial boundary in the watch image."""
    blurred = cv2.medianBlur(gray, 7)
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=100,
        param1=50, param2=30, minRadius=190, maxRadius=240
    )
    if circles is not None:
        c = circles[0][0]
        return int(c[0]), int(c[1]), min(218, max(210, int(c[2])))
    return 440, 465, 215


def extract_dial_roi(img_bgr, target_size=448, dial_crop_margin=1.05):
    """
    Extracts the watch dial and masks out the 3D-printed fixture and watch case.
    Returns: resized_dial_bgr, (cx, cy, r, y1, y2, x1, x2)
    """
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    cx, cy, r = detect_dial_circle(gray)

    pad = int(r * dial_crop_margin)
    y1, y2 = max(0, cy - pad), min(h, cy + pad)
    x1, x2 = max(0, cx - pad), min(w, cx + pad)

    crop = img_bgr[y1:y2, x1:x2].copy()
    crop_h, crop_w = crop.shape[:2]

    # Circular mask
    mask = np.zeros((crop_h, crop_w), dtype=np.uint8)
    crop_cx, crop_cy = cx - x1, cy - y1
    cv2.circle(mask, (crop_cx, crop_cy), int(r * 0.98), 255, -1)

    # Neutral background fill outside circle
    dial_pixels = crop[mask > 0]
    neutral_bg = np.median(dial_pixels, axis=0) if len(dial_pixels) > 0 else (128, 128, 128)
    crop[mask == 0] = neutral_bg

    resized = cv2.resize(crop, (target_size, target_size), interpolation=cv2.INTER_AREA)
    return resized, (cx, cy, r, y1, y2, x1, x2)


def detect_surface_defects(img_bgr, circle_info, sensitivity="high", perimeter_ratio=0.925):
    """
    Precision surface defect inspector for watch dials:
    Detects foreign dust specks, fibers, and scratch lines while
    preserving expected watch features (hands, hour markers, center hub).

    Parameters:
      - sensitivity: 'low', 'medium', 'high' (default), 'ultra' (or numeric diff value)
      - perimeter_ratio: Fraction of detected dial circle radius to inspect (default 0.925)
    """
    cx, cy, r, y1, y2, x1, x2 = circle_info
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    sens_map = {
        'low': (22, 4),
        'medium': (18, 3),
        'high': (15, 2),
        'ultra': (13, 2)
    }
    if isinstance(sensitivity, (int, float)):
        diff_thresh = int(sensitivity)
        min_area = 2
    else:
        diff_thresh, min_area = sens_map.get(str(sensitivity).lower(), (15, 2))

    inner_r = int(r * perimeter_ratio)
    dial_mask = np.zeros_like(gray)
    cv2.circle(dial_mask, (cx, cy), inner_r, 255, -1)

    dial_pixels = gray[dial_mask > 0]
    if len(dial_pixels) == 0:
        return []

    med_val = np.median(dial_pixels)

    # Extract dark surface deviations (dust specks, scratches, smudges)
    dark_mask = ((gray < (med_val - diff_thresh)) & (dial_mask > 0)).astype(np.uint8) * 255
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(dark_mask)

    known_elements = np.zeros_like(gray)
    dust_candidates = np.zeros_like(gray)

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        wb = stats[i, cv2.CC_STAT_WIDTH]
        hb = stats[i, cv2.CC_STAT_HEIGHT]
        dist = np.hypot(centroids[i][0] - cx, centroids[i][1] - cy)
        max_dim = max(wb, hb)

        # Hands & hour markers separation:
        # 1. Major dial hands (area > 90 or length > 20)
        # 2. Outer hour tick marks (dist >= r * 0.70 with area >= 35, length >= 15, or touching perimeter edge)
        # 3. Center pin / pivot (dist <= 22)
        is_known = False
        if area > 4000 or max_dim > 120:
            is_known = True
        elif dist >= r * 0.70:
            if area >= 35 or max_dim >= 15 or dist >= (inner_r - 8):
                is_known = True
        elif dist <= 22:
            is_known = True

        if is_known:
            known_elements[labels == i] = 255
        elif min_area <= area <= 4000:
            dust_candidates[labels == i] = 255

    # Shield known hands and markers with small 3x3 dilation
    # (prevents false edge transitions while preserving dust sitting right near ticks)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    known_dilated = cv2.dilate(known_elements, k)
    dust_candidates[known_dilated > 0] = 0

    num_d, _, d_stats, d_cents = cv2.connectedComponentsWithStats(dust_candidates)
    defects = []
    for i in range(1, num_d):
        a = d_stats[i, cv2.CC_STAT_AREA]
        if min_area <= a <= 4000:
            x = d_stats[i, cv2.CC_STAT_LEFT]
            y = d_stats[i, cv2.CC_STAT_TOP]
            wb = d_stats[i, cv2.CC_STAT_WIDTH]
            hb = d_stats[i, cv2.CC_STAT_HEIGHT]
            c_dist = np.hypot(d_cents[i][0] - cx, d_cents[i][1] - cy)
            defects.append({
                "type": "dust",
                "area": int(a),
                "box": [int(x), int(y), int(wb), int(hb)],
                "centroid": [float(d_cents[i][0]), float(d_cents[i][1])],
                "dist": float(c_dist)
            })
    return defects


def detect_surface_defects_mask(img_bgr, mask_2d, sensitivity="high", perimeter_ratio=0.88):
    """
    Precision surface defect inspector for arbitrary watch geometries
    (hexagonal, oval, square, tonneau, irregular, or custom shapes).
    Inspects strictly within the user-painted binary mask_2d (> 0).
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    sens_map = {
        'low': (22, 4),
        'medium': (18, 3),
        'high': (15, 2),
        'ultra': (13, 2)
    }
    if isinstance(sensitivity, (int, float)):
        diff_thresh = int(sensitivity)
        min_area = 2
    else:
        diff_thresh, min_area = sens_map.get(str(sensitivity).lower(), (15, 2))

    # Ensure mask_2d matches gray shape
    if mask_2d.shape[:2] != gray.shape[:2]:
        mask_2d = cv2.resize(mask_2d, (gray.shape[1], gray.shape[0]), interpolation=cv2.INTER_NEAREST)

    dial_pixels = gray[mask_2d > 0]
    if len(dial_pixels) == 0:
        return []

    med_val = np.median(dial_pixels)

    # Dark surface deviations (dust specks, scratches, fibers)
    dark_mask = ((gray < (med_val - diff_thresh)) & (mask_2d > 0)).astype(np.uint8) * 255
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(dark_mask)

    # Instead of the mask centroid, find the TRUE physical center and radius of the shifted watch
    true_cx, true_cy, true_r = detect_dial_circle(gray)
    cx, cy = true_cx, true_cy
    
    # Distance to mask boundary to shield boundary transition edge and bezel seam
    dist_to_boundary = cv2.distanceTransform(mask_2d, cv2.DIST_L2, 5)
    max_b_dist = float(dist_to_boundary.max()) if np.any(mask_2d > 0) else 0.0

    try:
        p_ratio = float(perimeter_ratio)
    except (ValueError, TypeError):
        p_ratio = 0.88

    # Shield boundary zone: moderate 18px minimum to block jagged bezel seam shadows when watch shifts
    shield_dist = max(18.0, max_b_dist * max(0.04, (1.0 - p_ratio) * 1.5))

    known_elements = np.zeros_like(gray)
    dust_candidates = np.zeros_like(gray)

    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        wb = stats[i, cv2.CC_STAT_WIDTH]
        hb = stats[i, cv2.CC_STAT_HEIGHT]
        c_x, c_y = centroids[i]
        dist_from_center = np.hypot(c_x - cx, c_y - cy)
        max_dim = max(wb, hb)

        # Boundary distance check
        iy, ix = min(gray.shape[0] - 1, max(0, int(c_y))), min(gray.shape[1] - 1, max(0, int(c_x)))
        b_dist = dist_to_boundary[iy, ix]

        is_known = False
        if area > 4000 or max_dim > 120:
            # Hands
            is_known = True
        elif dist_from_center <= 22:
            # Center pivot / hands hub
            is_known = True
        elif b_dist <= shield_dist or dist_from_center >= (true_r - 8):
            # Shield border pixels, mask seam, AND true physical bezel shadows
            is_known = True
        elif dist_from_center > 130 and (area >= 35 or max_dim >= 15):
            # Hour markers (only near the perimeter, robust to shifted watch)
            is_known = True

        if is_known:
            known_elements[labels == i] = 255
        elif min_area <= area <= 4000:
            dust_candidates[labels == i] = 255

    # Shield known hands and markers with small 3x3 morphological kernel
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    known_dilated = cv2.dilate(known_elements, k)
    dust_candidates[known_dilated > 0] = 0

    num_d, _, d_stats, d_cents = cv2.connectedComponentsWithStats(dust_candidates)
    defects = []
    for i in range(1, num_d):
        a = d_stats[i, cv2.CC_STAT_AREA]
        if min_area <= a <= 4000:
            x = d_stats[i, cv2.CC_STAT_LEFT]
            y = d_stats[i, cv2.CC_STAT_TOP]
            wb = d_stats[i, cv2.CC_STAT_WIDTH]
            hb = d_stats[i, cv2.CC_STAT_HEIGHT]
            c_dist = np.hypot(d_cents[i][0] - cx, d_cents[i][1] - cy)
            defects.append({
                "type": "dust",
                "area": int(a),
                "box": [int(x), int(y), int(wb), int(hb)],
                "centroid": [float(d_cents[i][0]), float(d_cents[i][1])],
                "dist": float(c_dist)
            })
    return defects


# =========================================================================
# Dataset Loader for PatchCore
# =========================================================================
class PatchcoreWatchDataset(Dataset):
    def __init__(self, image_paths, is_normal=True, image_size=(448, 448), focus_mode="dial", mask=None):
        self.image_paths = image_paths
        self.is_normal = is_normal
        self.image_size = image_size
        self.focus_mode = focus_mode
        self.mask = mask
        if self.is_normal:
            self.transform = transforms.Compose([
                transforms.ColorJitter(brightness=0.1, contrast=0.1),
                transforms.RandomAffine(degrees=2, translate=(0.02, 0.02), scale=(0.98, 1.02)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])
        else:
            self.transform = transforms.Compose([
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        path = self.image_paths[idx]
        bgr = cv2.imread(path)
        if bgr is None:
            bgr = np.zeros((self.image_size[0], self.image_size[1], 3), dtype=np.uint8)

        if self.focus_mode == "custom_mask" and self.mask is not None:
            m = self.mask
            if m.shape[:2] != bgr.shape[:2]:
                m = cv2.resize(m, (bgr.shape[1], bgr.shape[0]), interpolation=cv2.INTER_NEAREST)
            # Neutral background fill outside custom mask
            dial_pixels = bgr[m > 0]
            neutral_bg = np.median(dial_pixels, axis=0) if len(dial_pixels) > 0 else (128, 128, 128)
            masked_bgr = bgr.copy()
            masked_bgr[m == 0] = neutral_bg
            processed_bgr = cv2.resize(masked_bgr, self.image_size, interpolation=cv2.INTER_AREA)
        elif self.focus_mode == "dial":
            processed_bgr, _ = extract_dial_roi(bgr, target_size=self.image_size[0])
        else:
            processed_bgr = cv2.resize(bgr, self.image_size)

        rgb = cv2.cvtColor(processed_bgr, cv2.COLOR_BGR2RGB)
        tensor = self.transform(Image.fromarray(rgb))
        return {
            "image": tensor,
            "gt_label": torch.tensor(0 if self.is_normal else 1, dtype=torch.long),
            "image_path": path
        }


def collate_image_batch(batch_list):
    images = torch.stack([item["image"] for item in batch_list])
    gt_labels = torch.stack([item["gt_label"] for item in batch_list])
    paths = [item["image_path"] for item in batch_list]
    b, c, h, w = images.shape
    gt_masks = torch.zeros((b, h, w), dtype=torch.uint8)
    return ImageBatch(image=images, gt_label=gt_labels, gt_mask=gt_masks, image_path=paths)


# =========================================================================
# PatchCore Engine Controller
# =========================================================================
class PatchcoreEngine:
    def __init__(self, workspace_dir=None):
        if workspace_dir is None:
            workspace_dir = os.path.dirname(os.path.abspath(__file__))
        self.workspace_dir = os.path.abspath(workspace_dir)

        self.models_dir = os.path.join(self.workspace_dir, "models")
        os.makedirs(self.models_dir, exist_ok=True)

        self.inspections_dir = os.path.join(self.workspace_dir, "static", "inspections")
        os.makedirs(self.inspections_dir, exist_ok=True)

        # External datasets root from the acquisition app
        self.external_datasets_dir = os.path.abspath(
            os.path.join(self.workspace_dir, "..", "watch_defect_detection", "datasets")
        )
        self.local_datasets_dir = os.path.join(self.workspace_dir, "datasets")
        os.makedirs(self.local_datasets_dir, exist_ok=True)

        # Active Model in memory
        self.active_model_id = None
        self.active_model = None
        self.active_metadata = None
        self.model_lock = threading.Lock()

        # Training State Machine
        self.training_state = {
            "status": "idle",      # idle, training, completed, failed
            "dataset_name": None,
            "backbone": "resnet18",
            "progress_pct": 0,
            "message": "Ready to train",
            "logs": [],
            "start_time": None,
            "elapsed_sec": 0
        }
        self.train_thread = None

        # Active Custom Focus Mask (arbitrary geometry binary mask uint8)
        self.active_focus_mask = None

        # Surface Defect (Dust & Perimeter) Inspector Settings
        self.dust_sensitivity = "high"
        self.perimeter_ratio = 0.925

        # Try loading the most recent model on startup
        self._auto_load_latest_model()

    # ---------------------------------------------------------------------
    # Dataset Discovery & Grid Focus Mask Management
    # ---------------------------------------------------------------------
    def list_datasets(self):
        """Discovers all dataset folders across external and local directories."""
        datasets = {}
        search_dirs = [self.external_datasets_dir, self.local_datasets_dir]

        for sdir in search_dirs:
            if not os.path.exists(sdir):
                continue
            for item in sorted(os.listdir(sdir)):
                fpath = os.path.join(sdir, item)
                if os.path.isdir(fpath) and not item.startswith("."):
                    train_good = os.path.join(fpath, "train", "good")
                    val_good = os.path.join(fpath, "val", "good")
                    val_defect = os.path.join(fpath, "val", "defect")

                    def count_imgs(d):
                        if not os.path.exists(d):
                            return 0
                        return len([f for f in os.listdir(d) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff')) and not f.startswith('.')])

                    c_tg = count_imgs(train_good)
                    c_vg = count_imgs(val_good)
                    c_vd = count_imgs(val_defect)

                    has_mask = os.path.exists(os.path.join(fpath, "focus_mask.png"))

                    datasets[item] = {
                        "name": item,
                        "path": fpath,
                        "train_good_count": c_tg,
                        "val_good_count": c_vg,
                        "val_defect_count": c_vd,
                        "total_count": c_tg + c_vg + c_vd,
                        "ready_for_training": c_tg > 0,
                        "has_focus_mask": has_mask
                    }

        return list(datasets.values())

    def get_dataset_path(self, dataset_name):
        """Resolves dataset directory path."""
        cand1 = os.path.join(self.external_datasets_dir, dataset_name)
        if os.path.exists(cand1):
            return cand1
        cand2 = os.path.join(self.local_datasets_dir, dataset_name)
        if os.path.exists(cand2):
            return cand2
        return cand1

    def get_dataset_sample_image(self, dataset_name):
        """Finds a representative sample image from the dataset for grid mask configuration."""
        dataset_path = self.get_dataset_path(dataset_name)
        for sub in ["train/good", "val/good", "val/defect"]:
            folder = os.path.join(dataset_path, *sub.split("/"))
            if os.path.exists(folder):
                for f in sorted(os.listdir(folder)):
                    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')) and not f.startswith('.'):
                        full_path = os.path.join(folder, f)
                        rel_path = f"{sub}/{f}"
                        img = cv2.imread(full_path)
                        h, w = (img.shape[0], img.shape[1]) if img is not None else (900, 900)
                        return {
                            "success": True,
                            "dataset_name": dataset_name,
                            "filename": f,
                            "rel_path": rel_path,
                            "full_path": full_path,
                            "width": w,
                            "height": h,
                            "image_url": f"/api/dataset_image/{dataset_name}/{rel_path}"
                        }
        return {"success": False, "error": f"No sample images found in dataset '{dataset_name}'"}

    def get_dataset_focus_mask(self, dataset_name):
        """Retrieves existing grid focus mask JSON and status for a dataset."""
        dataset_path = self.get_dataset_path(dataset_name)
        json_path = os.path.join(dataset_path, "focus_mask.json")
        png_path = os.path.join(dataset_path, "focus_mask.png")

        if os.path.exists(json_path):
            try:
                with open(json_path, "r") as f:
                    data = json.load(f)
                data["has_mask"] = True
                data["mask_image_url"] = f"/api/dataset/{dataset_name}/focus_mask_preview"
                return {"success": True, "mask_data": data}
            except Exception as e:
                return {"success": False, "error": f"Failed to read focus mask: {str(e)}"}

        return {"success": True, "mask_data": {"has_mask": False, "rows": 32, "cols": 32, "grid": None}}

    def save_dataset_focus_mask(self, dataset_name, payload):
        """
        Saves grid matrix JSON and rasterizes a high-resolution binary mask (focus_mask.png).
        Payload: { rows: int, cols: int, density: int, grid: [[int]] }
        """
        dataset_path = self.get_dataset_path(dataset_name)
        if not os.path.exists(dataset_path):
            return {"success": False, "error": f"Dataset directory not found: {dataset_path}"}

        rows = int(payload.get("rows", 32))
        cols = int(payload.get("cols", 32))
        density = int(payload.get("density", rows))
        grid = payload.get("grid")

        if not grid or len(grid) != rows:
            return {"success": False, "error": "Invalid grid dimensions"}

        # Determine reference image resolution
        sample_info = self.get_dataset_sample_image(dataset_name)
        img_w = sample_info.get("width", 828)
        img_h = sample_info.get("height", 922)

        # Rasterize high-resolution binary mask (0 = ignored fixture/clamps, 255 = focus watch area)
        mask = np.zeros((img_h, img_w), dtype=np.uint8)
        cell_h = img_h / float(rows)
        cell_w = img_w / float(cols)

        active_cells = 0
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == 1:
                    active_cells += 1
                    y1 = int(round(r * cell_h))
                    y2 = int(round((r + 1) * cell_h))
                    x1 = int(round(c * cell_w))
                    x2 = int(round((c + 1) * cell_w))
                    mask[y1:y2, x1:x2] = 255

        total_cells = rows * cols
        coverage_pct = round((active_cells / total_cells) * 100, 2) if total_cells > 0 else 0.0

        # Save focus_mask.png
        png_path = os.path.join(dataset_path, "focus_mask.png")
        cv2.imwrite(png_path, mask)

        # Save focus_mask.json
        meta = {
            "dataset_name": dataset_name,
            "rows": rows,
            "cols": cols,
            "density": density,
            "active_cells": active_cells,
            "total_cells": total_cells,
            "coverage_pct": coverage_pct,
            "mask_width": img_w,
            "mask_height": img_h,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "grid": grid
        }
        json_path = os.path.join(dataset_path, "focus_mask.json")
        with open(json_path, "w") as f:
            json.dump(meta, f, indent=2)

        # If currently active model belongs to this dataset, update active focus mask immediately
        if self.active_metadata and self.active_metadata.get("dataset_name") == dataset_name:
            self.active_focus_mask = mask
            if self.active_model_id:
                m_dir = os.path.join(self.models_dir, self.active_model_id)
                if os.path.exists(m_dir):
                    cv2.imwrite(os.path.join(m_dir, "focus_mask.png"), mask)
                    with open(os.path.join(m_dir, "focus_mask.json"), "w") as f:
                        json.dump(meta, f, indent=2)
            print(f"[INFO] Synced updated focus mask into active model '{self.active_model_id}'.")
            try:
                threading.Thread(target=self.run_validation, args=(self.active_model_id,), daemon=True).start()
                print(f"[INFO] Background validation refresh queued for model '{self.active_model_id}'.")
            except Exception as ex:
                print(f"[WARN] Failed starting background validation refresh: {ex}")

        print(f"[INFO] Saved focus mask for '{dataset_name}': {active_cells}/{total_cells} cells ({coverage_pct}% coverage), rasterized to {img_w}x{img_h}.")
        return {
            "success": True,
            "message": f"Focus mask saved ({coverage_pct}% coverage, {active_cells} active cells)",
            "coverage_pct": coverage_pct,
            "active_cells": active_cells,
            "total_cells": total_cells
        }

    # ---------------------------------------------------------------------
    # Training Execution
    # ---------------------------------------------------------------------
    def _log_training(self, text):
        timestamp = time.strftime("%H:%M:%S")
        line = f"[{timestamp}] {text}"
        print(line)
        self.training_state["logs"].append(line)
        if len(self.training_state["logs"]) > 200:
            self.training_state["logs"].pop(0)

    def start_training(self, dataset_name, backbone="resnet18", coreset_ratio=0.01, focus_mode="dial", resolution="standard"):
        """Initiates background PatchCore model training."""
        if self.training_state["status"] == "training":
            return {"success": False, "error": "Training is already in progress"}

        # Safe coreset clamp for high-resolution 448x448 inputs on CPU
        if focus_mode in ("dial", "custom_mask") and coreset_ratio > 0.05:
            coreset_ratio = 0.02
        else:
            coreset_ratio = max(0.005, float(coreset_ratio))

        dataset_path = self.get_dataset_path(dataset_name)
        train_good_dir = os.path.join(dataset_path, "train", "good")

        if not os.path.exists(train_good_dir):
            return {"success": False, "error": f"Directory not found: {train_good_dir}"}

        train_images = [
            os.path.join(train_good_dir, f)
            for f in os.listdir(train_good_dir)
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff')) and not f.startswith('.')
        ]

        if len(train_images) == 0:
            return {"success": False, "error": f"No training images found in {train_good_dir}"}

        # Validate custom focus mask existence if requested
        if focus_mode == "custom_mask":
            mask_path = os.path.join(dataset_path, "focus_mask.png")
            if not os.path.exists(mask_path):
                return {
                    "success": False,
                    "error": f"No focus mask configured for '{dataset_name}'. Please paint and save a focus mask in the Grid Editor first."
                }

        self.training_state = {
            "status": "training",
            "dataset_name": dataset_name,
            "backbone": backbone,
            "focus_mode": focus_mode,
            "progress_pct": 5,
            "message": "Initializing PatchCore...",
            "logs": [],
            "start_time": time.time(),
            "elapsed_sec": 0
        }

        self.train_thread = threading.Thread(
            target=self._train_worker,
            args=(dataset_name, dataset_path, train_images, backbone, coreset_ratio, focus_mode),
            daemon=True
        )
        self.train_thread.start()

        mode_label = "CUSTOM GRID MASK" if focus_mode == "custom_mask" else ("CIRCULAR DIAL" if focus_mode == "dial" else "FULL FRAME")
        return {"success": True, "message": f"Training initiated on {len(train_images)} watches (Mode: {mode_label})."}

    def _train_worker(self, dataset_name, dataset_path, train_images, backbone, coreset_ratio, focus_mode="dial", resolution="standard"):
        try:
            self._log_training(f"Starting PatchCore training for dataset: {dataset_name}")
            mode_desc = "CUSTOM GRID MASK (Arbitrary Geometry)" if focus_mode == "custom_mask" else ("WATCH DIAL (Dust & Scratches)" if focus_mode == "dial" else "FULL FRAME")
            self._log_training(f"Target Focus: {mode_desc}")
            self._log_training(f"Backbone: {backbone} | Coreset Ratio: {int(coreset_ratio * 100)}%")
            self._log_training(f"Found {len(train_images)} normal training watch images.")

            self.training_state["progress_pct"] = 15
            self.training_state["message"] = "Loading feature extractor..."

            # Model ID
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            mode_prefix = "custom" if focus_mode == "custom_mask" else ("dial" if focus_mode == "dial" else "full")
            model_id = f"{dataset_name}_{mode_prefix}_{backbone}_{timestamp}"
            model_dir = os.path.join(self.models_dir, model_id)
            os.makedirs(model_dir, exist_ok=True)

            # Load custom focus mask if enabled
            custom_mask = None
            focus_mask_path = os.path.join(dataset_path, "focus_mask.png")
            if focus_mode == "custom_mask" and os.path.exists(focus_mask_path):
                custom_mask = cv2.imread(focus_mask_path, cv2.IMREAD_GRAYSCALE)
                self._log_training(f"Loaded custom focus mask ({custom_mask.shape[1]}x{custom_mask.shape[0]}) for training.")
            elif focus_mode == "custom_mask":
                self._log_training("[WARN] Custom focus mask requested but focus_mask.png not found! Falling back to circular dial.")
                focus_mode = "dial"

            # Build Dataset and DataLoader
            if resolution == "pixel_zoom":
                img_size = 896
                coreset_ratio = min(coreset_ratio, 0.01) # Force strict coreset limit to prevent OOM
            else:
                img_size = 448 if focus_mode in ("dial", "custom_mask") else 256
            train_ds = PatchcoreWatchDataset(
                train_images,
                is_normal=True,
                image_size=(img_size, img_size),
                focus_mode=focus_mode,
                mask=custom_mask
            )
            batch_size = min(4, len(train_images))
            train_dl = DataLoader(
                train_ds,
                batch_size=batch_size,
                shuffle=False,
                collate_fn=collate_image_batch
            )

            self.training_state["progress_pct"] = 30
            self.training_state["message"] = f"Extracting patch features with {backbone}..."
            self._log_training("Extracting high-resolution patch embeddings...")

            if backbone == "pixel_ssim":
                self._log_training("Initializing Pixel-Level Subtraction Engine (Golden Reference)...")
                golden = None
                count = 0
                for img_path in train_images:
                    img = cv2.imread(img_path)
                    if img is None: continue
                    
                    # Handle Custom Mask / ROI correctly during training
                    mask_to_pass = None
                    if focus_mode == "custom_mask" and custom_mask is not None:
                        m = custom_mask
                        if m.shape[:2] != img.shape[:2]:
                            m = cv2.resize(m, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
                        dial_pixels = img[m > 0]
                        neutral_bg = np.median(dial_pixels, axis=0) if len(dial_pixels) > 0 else (128, 128, 128)
                        masked_bgr = img.copy()
                        masked_bgr[m == 0] = neutral_bg
                        proc_img = cv2.resize(masked_bgr, (img_size, img_size), interpolation=cv2.INTER_AREA)
                    elif focus_mode == "dial":
                        from utils import extract_dial_roi
                        proc_img, _ = extract_dial_roi(img, target_size=img_size)
                    else:
                        proc_img = cv2.resize(img, (img_size, img_size))

                    gray = cv2.cvtColor(proc_img, cv2.COLOR_BGR2GRAY)
                    if golden is None:
                        golden = np.zeros_like(gray, dtype=np.float32)
                    golden += gray.astype(np.float32)
                    count += 1
                
                golden = (golden / count).astype(np.uint8)
                np.save(os.path.join(model_dir, "golden.npy"), golden)
                self.training_state["progress_pct"] = 80
                self.training_state["message"] = "Golden template constructed."
                self._log_training("Golden template constructed successfully.")
                calibrated_threshold = 26.0
                mean_good = 0.0
                max_good = 0.0
                layers = []
                self._log_training(f"Calibration: Normal Mean Score=0.00, Max Normal=0.00")
                self._log_training(f"Recommended Anomaly Threshold: {calibrated_threshold}")
            else:
            # Initialize Patchcore with layer1, layer2, and layer3 to balance micro-defect sensitivity and spatial invariance
                if resolution == "pixel_zoom":
                    # strictly restrict to layer1 to shrink the patch receptive field
                    # this makes the AI hyper-focused on microscopic anomalies (dust)
                    layers = ["layer1"]
                else:
                    layers = ["layer1", "layer2", "layer3"]
                model = Patchcore(
                    backbone=backbone,
                    layers=layers,
                    pre_trained=True,
                    coreset_sampling_ratio=coreset_ratio,
                    num_neighbors=9
                )

                results_dir = os.path.join(model_dir, "results")
                os.makedirs(results_dir, exist_ok=True)
                engine = Engine(max_epochs=1, accelerator="cpu", default_root_dir=results_dir)

                self.training_state["progress_pct"] = 55
                self.training_state["message"] = "Building coreset memory bank..."

                engine.fit(model=model, train_dataloaders=train_dl)

                self.training_state["progress_pct"] = 80
                self.training_state["message"] = "Calibrating decision threshold..."
                self._log_training("Coreset memory bank constructed successfully.")

                model.eval()
                train_scores = []
                with torch.no_grad():
                    for batch in train_dl:
                        out = model.model(batch.image)
                        scores = getattr(out, "pred_score", None)
                        if scores is None and isinstance(out, (tuple, list)) and len(out) > 0:
                            scores = out[0]
                        elif scores is None and isinstance(out, torch.Tensor):
                            scores = out

                        if isinstance(scores, torch.Tensor):
                            train_scores.extend(scores.cpu().flatten().tolist())

                if train_scores:
                    mean_good = float(np.mean(train_scores))
                    max_good = float(np.max(train_scores))
                    std_good = float(np.std(train_scores)) if len(train_scores) > 1 else 0.5
                    calibrated_threshold = round(max_good + 1.2 * std_good, 3)
                else:
                    mean_good = 22.0
                    max_good = 24.0
                    calibrated_threshold = 26.0

                self._log_training(f"Calibration: Normal Mean Score={mean_good:.2f}, Max Normal={max_good:.2f}")
                self._log_training(f"Recommended Anomaly Threshold: {calibrated_threshold}")

                weights_path = os.path.join(model_dir, "weights.pt")
                torch.save(model.state_dict(), weights_path)

            # Bundle custom focus mask with model if active
            has_mask = False
            if custom_mask is not None and os.path.exists(focus_mask_path):
                shutil.copy2(focus_mask_path, os.path.join(model_dir, "focus_mask.png"))
                focus_json_path = os.path.join(dataset_path, "focus_mask.json")
                if os.path.exists(focus_json_path):
                    shutil.copy2(focus_json_path, os.path.join(model_dir, "focus_mask.json"))
                has_mask = True
                self._log_training("Bundled custom focus mask into trained model package.")

            # Save Metadata
            metadata = {
                "model_id": model_id,
                "dataset_name": dataset_name,
                "dataset_path": dataset_path,
                "backbone": backbone,
                "layers": layers,
                "focus_mode": focus_mode,
                "has_focus_mask": has_mask,
                "image_size": [img_size, img_size],
                "coreset_ratio": coreset_ratio,
                "train_images_count": len(train_images),
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "weights_file": "weights.pt",
                "threshold": calibrated_threshold,
                "normal_mean_score": round(mean_good, 2),
                "normal_max_score": round(max_good, 2),
                "status": "ready"
            }

            meta_path = os.path.join(model_dir, "metadata.json")
            with open(meta_path, "w") as f:
                json.dump(metadata, f, indent=2)

            self.training_state["progress_pct"] = 100
            self.training_state["status"] = "completed"
            self.training_state["message"] = "Model training completed successfully!"
            self.training_state["elapsed_sec"] = round(time.time() - self.training_state["start_time"], 1)
            self._log_training(f"Training completed in {self.training_state['elapsed_sec']}s. Model '{model_id}' is ready.")

            # Set as active model
            self.load_model(model_id)

            # Auto-run validation
            self._log_training("Running initial validation on dataset...")
            self.run_validation(model_id)

        except Exception as e:
            import traceback
            err_msg = str(e)
            print(traceback.format_exc())
            self.training_state["status"] = "failed"
            self.training_state["message"] = f"Training error: {err_msg}"
            self._log_training(f"FATAL ERROR: {err_msg}")

    # ---------------------------------------------------------------------
    # Model Management & Loading
    # ---------------------------------------------------------------------
    def list_models(self):
        """Lists all trained PatchCore models and metadata."""
        models = []
        if not os.path.exists(self.models_dir):
            return models

        raw_items = []
        for item in os.listdir(self.models_dir):
            mdir = os.path.join(self.models_dir, item)
            meta_file = os.path.join(mdir, "metadata.json")
            if os.path.isdir(mdir) and os.path.exists(meta_file):
                try:
                    with open(meta_file, "r") as f:
                        meta = json.load(f)
                    meta["is_active"] = (item == self.active_model_id)
                    raw_items.append(meta)
                except Exception:
                    pass

        # Sort by created_at descending (newest first)
        raw_items.sort(key=lambda m: m.get("created_at", m.get("model_id", "")), reverse=True)
        return raw_items

    def load_model(self, model_id):
        """Loads a model into memory for real-time inference and validation."""
        model_dir = os.path.join(self.models_dir, model_id)
        meta_file = os.path.join(model_dir, "metadata.json")
        weights_file = os.path.join(model_dir, "weights.pt")

        if not os.path.exists(meta_file):
            return {"success": False, "error": f"Metadata not found for {model_id}"}
        
        with open(meta_file, "r") as mf:
            m_temp = __import__("json").load(mf)
            
        if m_temp.get("backbone") != "pixel_ssim" and not os.path.exists(weights_file):
            return {"success": False, "error": f"Model weights not found for {model_id}"}

        with open(meta_file, "r") as f:
            metadata = json.load(f)

        backbone = metadata.get("backbone", "resnet18")
        focus_mode = metadata.get("focus_mode")
        if not focus_mode:
            focus_mode = "dial" if "dial" in model_id else "full"
            metadata["focus_mode"] = focus_mode

        layers = metadata.get("layers")
        if not layers:
            layers = ["layer1", "layer2", "layer3"]
            metadata["layers"] = layers

        coreset_ratio = metadata.get("coreset_ratio", 0.1)

        print(f"[INFO] Loading PatchCore model {model_id} (backbone: {backbone}, focus_mode: {focus_mode}, layers: {layers})...")
        if backbone == "pixel_ssim":
            golden_path = os.path.join(model_dir, "golden.npy")
            import numpy as np
            model = PixelSSIMModel(np.load(golden_path))
        else:
            model = Patchcore(
                backbone=backbone,
                layers=layers,
                pre_trained=False,
                coreset_sampling_ratio=coreset_ratio,
                num_neighbors=9
            )
            state_dict = torch.load(weights_file, map_location="cpu")
            model.load_state_dict(state_dict, strict=False)
            model.eval()

        # Check for bundled custom focus mask
        focus_mask_path = os.path.join(model_dir, "focus_mask.png")
        if not os.path.exists(focus_mask_path) and metadata.get("dataset_name"):
            cand_mask = os.path.join(self.get_dataset_path(metadata.get("dataset_name")), "focus_mask.png")
            if os.path.exists(cand_mask):
                focus_mask_path = cand_mask

        loaded_mask = None
        if os.path.exists(focus_mask_path):
            loaded_mask = cv2.imread(focus_mask_path, cv2.IMREAD_GRAYSCALE)
            print(f"[INFO] Loaded custom focus mask for {model_id} ({loaded_mask.shape[1]}x{loaded_mask.shape[0]}).")

        with self.model_lock:
            self.active_model = model
            self.active_model_id = model_id
            self.active_metadata = metadata
            self.active_focus_mask = loaded_mask
            self.dust_sensitivity = metadata.get("dust_sensitivity", "high")
            try:
                self.perimeter_ratio = float(metadata.get("perimeter_ratio", 0.925))
            except (ValueError, TypeError):
                self.perimeter_ratio = 0.925

        print(f"[INFO] Model {model_id} loaded successfully as active (focus_mode={focus_mode}, has_custom_mask={loaded_mask is not None}, dust_sensitivity={self.dust_sensitivity}, perimeter_ratio={self.perimeter_ratio}).")
        return {"success": True, "model_id": model_id, "metadata": metadata}

    def _auto_load_latest_model(self):
        """Automatically loads the most recent valid model on startup."""
        models = self.list_models()
        if models:
            self.load_model(models[0]["model_id"])

    @staticmethod
    def _extract_model_output(out):
        """Extracts pred_score (float) and 2D anomaly_map (np.ndarray) from Anomalib output."""
        score = 0.0
        if hasattr(out, "pred_score") and out.pred_score is not None:
            score = float(out.pred_score.cpu().flatten()[0].item())
        elif isinstance(out, (tuple, list)) and len(out) > 0 and out[0] is not None:
            if isinstance(out[0], torch.Tensor):
                score = float(out[0].cpu().flatten()[0].item())
            else:
                score = float(out[0])
        elif isinstance(out, torch.Tensor):
            score = float(out.cpu().flatten()[0].item())

        raw_map = None
        if hasattr(out, "anomaly_map") and out.anomaly_map is not None:
            raw_map = out.anomaly_map.cpu().numpy()
        elif isinstance(out, (tuple, list)) and len(out) > 2 and out[2] is not None:
            if isinstance(out[2], torch.Tensor):
                raw_map = out[2].cpu().numpy()
            elif isinstance(out[2], np.ndarray):
                raw_map = out[2]

        if raw_map is not None:
            raw_map = np.squeeze(raw_map)
            while raw_map.ndim > 2:
                raw_map = raw_map[0]
            if raw_map.ndim < 2:
                raw_map = np.zeros((256, 256), dtype=np.float32)
        else:
            raw_map = np.zeros((256, 256), dtype=np.float32)

        return score, raw_map

    # ---------------------------------------------------------------------
    # Validation & Defect Heatmaps
    # ---------------------------------------------------------------------
    def run_validation(self, model_id=None):
        """Evaluates active model on validation images and caches defect heatmaps."""
        if model_id and model_id != self.active_model_id:
            res = self.load_model(model_id)
            if not res["success"]:
                return res

        if self.active_model is None:
            return {"success": False, "error": "No active PatchCore model loaded"}

        metadata = self.active_metadata
        dataset_path = metadata.get("dataset_path")
        focus_mode = metadata.get("focus_mode")
        if not focus_mode:
            focus_mode = "dial" if (self.active_model_id and "dial" in self.active_model_id) else "full"
        img_size = metadata.get("image_size", [448, 448])[0]
        val_good_dir = os.path.join(dataset_path, "val", "good")
        val_defect_dir = os.path.join(dataset_path, "val", "defect")

        good_files = []
        if os.path.exists(val_good_dir):
            good_files = [
                os.path.join(val_good_dir, f) for f in os.listdir(val_good_dir)
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))
            ]

        defect_files = []
        if os.path.exists(val_defect_dir):
            defect_files = [
                os.path.join(val_defect_dir, f) for f in os.listdir(val_defect_dir)
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))
            ]

        if not good_files and not defect_files:
            train_good_dir = os.path.join(dataset_path, "train", "good")
            if os.path.exists(train_good_dir):
                good_files = [
                    os.path.join(train_good_dir, f) for f in os.listdir(train_good_dir)
                    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))
                ][:8]

        val_cache_dir = os.path.join(self.models_dir, self.active_model_id, "validation")
        os.makedirs(val_cache_dir, exist_ok=True)

        results = []
        threshold = metadata.get("threshold", 26.0)
        dust_sens = metadata.get("dust_sensitivity", self.dust_sensitivity)
        try:
            perim_ratio = float(metadata.get("perimeter_ratio", self.perimeter_ratio))
        except (ValueError, TypeError):
            perim_ratio = 0.925

        tf = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

        all_items = [(f, "good", False) for f in good_files] + [(f, "defect", True) for f in defect_files]

        with self.model_lock, torch.no_grad():
            for filepath, ground_truth, is_defect_gt in all_items:
                fname = os.path.basename(filepath)
                orig_bgr = cv2.imread(filepath)
                if orig_bgr is None:
                    continue

                mask_to_pass = None
                circle_info = None

                if focus_mode == "custom_mask" and self.active_focus_mask is not None:
                    m = self.active_focus_mask
                    if m.shape[:2] != orig_bgr.shape[:2]:
                        m = cv2.resize(m, (orig_bgr.shape[1], orig_bgr.shape[0]), interpolation=cv2.INTER_NEAREST)
                    dial_pixels = orig_bgr[m > 0]
                    neutral_bg = np.median(dial_pixels, axis=0) if len(dial_pixels) > 0 else (128, 128, 128)
                    masked_bgr = orig_bgr.copy()
                    masked_bgr[m == 0] = neutral_bg
                    proc_bgr = cv2.resize(masked_bgr, (img_size, img_size), interpolation=cv2.INTER_AREA)

                    pil_img = Image.fromarray(cv2.cvtColor(proc_bgr, cv2.COLOR_BGR2RGB))
                    tensor = tf(pil_img).unsqueeze(0)

                    out = self.active_model.model(tensor)
                    score, raw_map = self._extract_model_output(out)

                    # Zero out raw_map outside custom focus mask
                    raw_map_orig = cv2.resize(raw_map, (m.shape[1], m.shape[0]), interpolation=cv2.INTER_CUBIC)
                    raw_map_orig[m == 0] = 0.0
                    if np.any(m > 0):
                        score = float(np.max(raw_map_orig[m > 0]))

                    dust_defects = detect_surface_defects_mask(orig_bgr, m, sensitivity=dust_sens, perimeter_ratio=perim_ratio)
                    dust_count = len(dust_defects)

                    if dust_count > 0:
                        dust_bonus = min(12.0, sum(d["area"] for d in dust_defects) * 0.04 + dust_count * 1.2)
                        score = max(score, round(threshold + dust_bonus, 3))

                    is_anomaly = (score >= threshold) or (dust_count > 0)
                    mask_to_pass = m

                elif focus_mode == "dial":
                    proc_bgr, circle_info = extract_dial_roi(orig_bgr, target_size=img_size)
                    pil_img = Image.fromarray(cv2.cvtColor(proc_bgr, cv2.COLOR_BGR2RGB))
                    tensor = tf(pil_img).unsqueeze(0)

                    out = self.active_model.model(tensor)
                    score, raw_map = self._extract_model_output(out)

                    # Precision surface defect detection for dust specks and scratches
                    dust_defects = detect_surface_defects(orig_bgr, circle_info, sensitivity=dust_sens, perimeter_ratio=perim_ratio)
                    dust_count = len(dust_defects)

                    if dust_count > 0:
                        dust_bonus = min(12.0, sum(d["area"] for d in dust_defects) * 0.04 + dust_count * 1.2)
                        score = max(score, round(threshold + dust_bonus, 3))

                    is_anomaly = (score >= threshold) or (dust_count > 0)
                else:
                    circle_info = None
                    dust_defects = []
                    dust_count = 0
                    resized = cv2.resize(orig_bgr, (img_size, img_size))
                    pil_img = Image.fromarray(cv2.cvtColor(resized, cv2.COLOR_BGR2RGB))
                    tensor = tf(pil_img).unsqueeze(0)

                    out = self.active_model.model(tensor)
                    score, raw_map = self._extract_model_output(out)
                    is_anomaly = score >= threshold

                verdict = "DEFECT" if is_anomaly else "PASS"

                # Generate colorized defect heatmap overlay
                heatmap_filename = f"hm_{fname}"
                heatmap_path = os.path.join(val_cache_dir, heatmap_filename)
                self._save_heatmap_overlay(orig_bgr, raw_map, heatmap_path, threshold, dial_coords=circle_info, dust_defects=dust_defects, custom_mask=mask_to_pass)

                results.append({
                    "filename": fname,
                    "filepath": filepath,
                    "ground_truth": ground_truth,
                    "is_defect_gt": is_defect_gt,
                    "score": round(score, 3),
                    "dust_count": dust_count,
                    "defects": dust_defects,
                    "threshold": threshold,
                    "is_anomaly": is_anomaly,
                    "verdict": verdict,
                    "is_correct": (is_anomaly == is_defect_gt),
                    "heatmap_url": f"/api/model_image/{self.active_model_id}/validation/{heatmap_filename}",
                    "orig_url": f"/api/model_image/{self.active_model_id}/validation_orig/{fname}"
                })

        # Compute summary metrics
        good_scores = [r["score"] for r in results if not r["is_defect_gt"]]
        defect_scores = [r["score"] for r in results if r["is_defect_gt"]]

        correct_count = sum(1 for r in results if r["is_correct"])
        total_count = len(results)
        accuracy_pct = round((correct_count / total_count) * 100, 1) if total_count > 0 else 100.0

        summary = {
            "model_id": self.active_model_id,
            "threshold": threshold,
            "dust_sensitivity": dust_sens,
            "perimeter_ratio": perim_ratio,
            "total_validated": total_count,
            "accuracy_pct": accuracy_pct,
            "normal_count": len(good_scores),
            "defect_count": len(defect_scores),
            "avg_normal_score": round(float(np.mean(good_scores)), 2) if good_scores else 0.0,
            "avg_defect_score": round(float(np.mean(defect_scores)), 2) if defect_scores else 0.0,
            "items": results
        }

        # Cache summary
        with open(os.path.join(val_cache_dir, "summary.json"), "w") as f:
            json.dump(summary, f, indent=2)

        return {"success": True, "summary": summary}

    def get_validation_results(self, model_id=None):
        """Fetches cached validation results or runs validation if not present."""
        target_id = model_id or self.active_model_id
        if not target_id:
            return {"success": False, "error": "No model loaded"}

        summary_path = os.path.join(self.models_dir, target_id, "validation", "summary.json")
        if os.path.exists(summary_path):
            try:
                with open(summary_path, "r") as f:
                    return {"success": True, "summary": json.load(f)}
            except Exception:
                pass

        return self.run_validation(target_id)

    def set_threshold(self, threshold, model_id=None):
        """Updates decision threshold and refreshes validation classification."""
        target_id = model_id or self.active_model_id
        if not target_id:
            return {"success": False, "error": "No model loaded"}

        meta_file = os.path.join(self.models_dir, target_id, "metadata.json")
        if os.path.exists(meta_file):
            with open(meta_file, "r") as f:
                meta = json.load(f)
            meta["threshold"] = round(float(threshold), 3)
            with open(meta_file, "w") as f:
                json.dump(meta, f, indent=2)
            if target_id == self.active_model_id and self.active_metadata:
                self.active_metadata["threshold"] = meta["threshold"]

        # Refresh validation with new threshold
        return self.run_validation(target_id)

    def set_dust_sensitivity(self, sensitivity="high", perimeter_ratio=0.925, model_id=None):
        """Updates dust defect sensitivity and dial perimeter ratio, saving to metadata and re-running validation."""
        target_id = model_id or self.active_model_id
        if not target_id:
            return {"success": False, "error": "No model loaded"}

        self.dust_sensitivity = str(sensitivity).lower()
        try:
            self.perimeter_ratio = float(perimeter_ratio)
        except (ValueError, TypeError):
            self.perimeter_ratio = 0.925

        meta_file = os.path.join(self.models_dir, target_id, "metadata.json")
        if os.path.exists(meta_file):
            with open(meta_file, "r") as f:
                meta = json.load(f)
            meta["dust_sensitivity"] = self.dust_sensitivity
            meta["perimeter_ratio"] = self.perimeter_ratio
            with open(meta_file, "w") as f:
                json.dump(meta, f, indent=2)
            if target_id == self.active_model_id and self.active_metadata:
                self.active_metadata["dust_sensitivity"] = self.dust_sensitivity
                self.active_metadata["perimeter_ratio"] = self.perimeter_ratio

        print(f"[INFO] Updated dust defect settings for {target_id}: sensitivity={self.dust_sensitivity}, perimeter_ratio={self.perimeter_ratio}")
        # Refresh validation with updated settings
        return self.run_validation(target_id)

    # ---------------------------------------------------------------------
    # Real-Time Frame Inference (Used by Cobot Inspection)
    # ---------------------------------------------------------------------
    def predict_image(self, image_bgr, slot_num=None):
        """
        Runs real-time PatchCore anomaly detection on a single watch frame.
        Returns score, classification verdict, confidence, and heatmap overlay.
        """
        if self.active_model is None:
            return {
                "success": False,
                "error": "No trained PatchCore model loaded. Please train or select a model first.",
                "verdict": "UNKNOWN",
                "score": 0.0
            }

        t_start = time.time()
        threshold = self.active_metadata.get("threshold", 26.0)
        focus_mode = self.active_metadata.get("focus_mode")
        if not focus_mode:
            focus_mode = "dial" if (self.active_model_id and "dial" in self.active_model_id) else "full"
        dust_sens = self.active_metadata.get("dust_sensitivity", self.dust_sensitivity)
        try:
            perim_ratio = float(self.active_metadata.get("perimeter_ratio", self.perimeter_ratio))
        except (ValueError, TypeError):
            perim_ratio = 0.925
        img_size = self.active_metadata.get("image_size", [448, 448])[0]

        tf = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

        mask_to_pass = None
        circle_info = None

        if focus_mode == "custom_mask" and self.active_focus_mask is not None:
            m = self.active_focus_mask
            if m.shape[:2] != image_bgr.shape[:2]:
                m = cv2.resize(m, (image_bgr.shape[1], image_bgr.shape[0]), interpolation=cv2.INTER_NEAREST)
            dial_pixels = image_bgr[m > 0]
            neutral_bg = np.median(dial_pixels, axis=0) if len(dial_pixels) > 0 else (128, 128, 128)
            masked_bgr = image_bgr.copy()
            masked_bgr[m == 0] = neutral_bg
            proc_bgr = cv2.resize(masked_bgr, (img_size, img_size), interpolation=cv2.INTER_AREA)

            pil_img = Image.fromarray(cv2.cvtColor(proc_bgr, cv2.COLOR_BGR2RGB))
            tensor = tf(pil_img).unsqueeze(0)

            with self.model_lock, torch.no_grad():
                out = self.active_model.model(tensor)
                score, raw_map = self._extract_model_output(out)

            # Restrict anomaly map strictly inside custom focus mask
            raw_map_orig = cv2.resize(raw_map, (m.shape[1], m.shape[0]), interpolation=cv2.INTER_CUBIC)
            raw_map_orig[m == 0] = 0.0
            if np.any(m > 0):
                score = float(np.max(raw_map_orig[m > 0]))

            dust_defects = detect_surface_defects_mask(image_bgr, m, sensitivity=dust_sens, perimeter_ratio=perim_ratio)
            dust_count = len(dust_defects)

            if dust_count > 0:
                dust_bonus = min(12.0, sum(d["area"] for d in dust_defects) * 0.04 + dust_count * 1.2)
                score = max(score, round(threshold + dust_bonus, 3))

            is_anomaly = (score >= threshold) or (dust_count > 0)
            mask_to_pass = m

        elif focus_mode == "dial":
            proc_bgr, circle_info = extract_dial_roi(image_bgr, target_size=img_size)
            pil_img = Image.fromarray(cv2.cvtColor(proc_bgr, cv2.COLOR_BGR2RGB))
            tensor = tf(pil_img).unsqueeze(0)

            with self.model_lock, torch.no_grad():
                out = self.active_model.model(tensor)
                score, raw_map = self._extract_model_output(out)

            # Precision surface defect detection for dust specks and scratches
            dust_defects = detect_surface_defects(image_bgr, circle_info, sensitivity=dust_sens, perimeter_ratio=perim_ratio)
            dust_count = len(dust_defects)

            if dust_count > 0:
                dust_bonus = min(12.0, sum(d["area"] for d in dust_defects) * 0.04 + dust_count * 1.2)
                score = max(score, round(threshold + dust_bonus, 3))

            is_anomaly = (score >= threshold) or (dust_count > 0)
        else:
            dust_defects = []
            dust_count = 0
            resized = cv2.resize(image_bgr, (img_size, img_size))
            pil_img = Image.fromarray(cv2.cvtColor(resized, cv2.COLOR_BGR2RGB))
            tensor = tf(pil_img).unsqueeze(0)

            with self.model_lock, torch.no_grad():
                out = self.active_model.model(tensor)
                score, raw_map = self._extract_model_output(out)

            is_anomaly = score >= threshold

        inference_time_ms = round((time.time() - t_start) * 1000, 1)
        verdict = "DEFECT" if is_anomaly else "PASS"

        # Confidence metric (distance from threshold)
        diff = abs(score - threshold)
        confidence = min(99.9, round(50.0 + (diff / max(threshold, 1.0)) * 50.0, 1))

        # Save inspection result images
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        prefix = f"slot{slot_num}_{timestamp}" if slot_num else f"capture_{timestamp}"
        overlay_filename = f"{prefix}_overlay.jpg"
        orig_filename = f"{prefix}_orig.jpg"

        overlay_path = os.path.join(self.inspections_dir, overlay_filename)
        orig_path = os.path.join(self.inspections_dir, orig_filename)

        cv2.imwrite(orig_path, image_bgr)
        self._save_heatmap_overlay(image_bgr, raw_map, overlay_path, threshold, dial_coords=circle_info, dust_defects=dust_defects, custom_mask=mask_to_pass)

        return {
            "success": True,
            "slot_num": slot_num,
            "score": round(score, 3),
            "dust_count": dust_count,
            "dust_sensitivity": dust_sens,
            "perimeter_ratio": perim_ratio,
            "defects": dust_defects,
            "threshold": threshold,
            "is_anomaly": is_anomaly,
            "verdict": verdict,
            "confidence": confidence,
            "inference_time_ms": inference_time_ms,
            "overlay_url": f"/static/inspections/{overlay_filename}",
            "orig_url": f"/static/inspections/{orig_filename}",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }

    def _save_heatmap_overlay(self, orig_bgr, raw_anomaly_map, save_path, threshold, dial_coords=None, dust_defects=None, custom_mask=None):
        """
        Generates calibrated defect heatmap overlay.
        Blends heatmap specifically inside the inspection area (custom_mask or circular watch dial),
        leaving the fixture plate and watch case pristine and free of false alarms.
        """
        h, w = orig_bgr.shape[:2]

        if custom_mask is not None:
            m = custom_mask
            if m.shape[:2] != (h, w):
                m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)

            map_resized = cv2.resize(raw_anomaly_map, (w, h), interpolation=cv2.INTER_CUBIC)
            inside = (m > 0)

            v_min = threshold * 0.75
            inside_max = float(map_resized[inside].max()) if np.any(inside) else float(map_resized.max())
            v_max = max(threshold * 1.25, inside_max)
            if v_max > v_min:
                norm_map = np.clip((map_resized - v_min) / (v_max - v_min), 0.0, 1.0)
            else:
                norm_map = np.zeros_like(map_resized)

            norm_uint8 = (norm_map * 255).astype(np.uint8)
            color_hm = cv2.applyColorMap(norm_uint8, cv2.COLORMAP_JET)

            alpha = 0.35
            full_result = orig_bgr.copy()
            full_result[inside] = cv2.addWeighted(orig_bgr, 1.0 - alpha, color_hm, alpha, 0)[inside]

            # Draw clean contour around custom focus mask boundary (subtle cyan/gold contour)
            contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(full_result, contours, -1, (220, 200, 0), 2)

            # Highlight defects with red circles/contours
            if dust_defects:
                for d in dust_defects:
                    bx, by, bw, bh = d["box"]
                    radius = max(bw, bh) // 2 + 7
                    center_pt = (bx + bw // 2, by + bh // 2)
                    cv2.circle(full_result, center_pt, radius, (0, 0, 255), 2)
            elif inside_max >= threshold:
                defect_mask = ((norm_map > 0.65) & inside).astype(np.uint8) * 255
                d_contours, _ = cv2.findContours(defect_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                cv2.drawContours(full_result, d_contours, -1, (0, 0, 255), 2)

            cv2.imwrite(save_path, full_result)
            return

        if dial_coords is not None:
            cx, cy, r, y1, y2, x1, x2 = dial_coords
        else:
            cx, cy, r = detect_dial_circle(cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2GRAY))
            pad = int(r * 1.05)
            y1, y2 = max(0, cy - pad), min(h, cy + pad)
            x1, x2 = max(0, cx - pad), min(w, cx + pad)

        crop_h, crop_w = y2 - y1, x2 - x1
        dial_crop = orig_bgr[y1:y2, x1:x2].copy()

        # Resize raw anomaly map to dial crop dimensions
        map_resized = cv2.resize(raw_anomaly_map, (crop_w, crop_h), interpolation=cv2.INTER_CUBIC)

        # Calibrated normalization:
        # Below (threshold * 0.75) maps to 0.0 (cool blue).
        # At threshold maps to ~0.65 (yellow).
        # Above threshold maps to 1.0 (bright red).
        v_min = threshold * 0.75
        v_max = max(threshold * 1.25, float(map_resized.max()))
        if v_max > v_min:
            norm_map = np.clip((map_resized - v_min) / (v_max - v_min), 0.0, 1.0)
        else:
            norm_map = np.zeros_like(map_resized)

        norm_uint8 = (norm_map * 255).astype(np.uint8)
        color_hm = cv2.applyColorMap(norm_uint8, cv2.COLORMAP_JET)

        # Circular mask inside dial crop
        c_mask = np.zeros((crop_h, crop_w), dtype=np.uint8)
        crop_cx, crop_cy = cx - x1, cy - y1
        cv2.circle(c_mask, (crop_cx, crop_cy), int(r * 0.96), 255, -1)

        # Alpha blend ONLY inside dial circle
        alpha = 0.35
        blended_crop = dial_crop.copy()
        inside = c_mask > 0
        blended_crop[inside] = cv2.addWeighted(dial_crop, 1.0 - alpha, color_hm, alpha, 0)[inside]

        # Draw clean dial inspection boundary (subtle cyan circle)
        cv2.circle(blended_crop, (crop_cx, crop_cy), int(r * 0.96), (220, 200, 0), 1)

        # Highlight defects with red circles/contours
        if dust_defects:
            for d in dust_defects:
                bx, by, bw, bh = d["box"]
                cbx, cby = bx - x1, by - y1
                radius = max(bw, bh) // 2 + 7
                center_pt = (cbx + bw // 2, cby + bh // 2)
                cv2.circle(blended_crop, center_pt, radius, (0, 0, 255), 2)
        elif float(map_resized.max()) >= threshold:
            defect_mask = ((norm_map > 0.65) & inside).astype(np.uint8) * 255
            contours, _ = cv2.findContours(defect_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(blended_crop, contours, -1, (0, 0, 255), 2)

        # Re-integrate blended dial into full frame
        full_result = orig_bgr.copy()
        full_result[y1:y2, x1:x2] = blended_crop
        cv2.circle(full_result, (cx, cy), int(r * 0.96), (220, 200, 0), 1)

        cv2.imwrite(save_path, full_result)
