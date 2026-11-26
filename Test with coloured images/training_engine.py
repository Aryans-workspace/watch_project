"""
AI Model Training & Defect Inspection Engine
Specialized for Coloured Images (Watch Dials & Precision Components)

Features:
- PatchCore Feature Memory Bank (PyTorch ResNet-18 Feature Extractor)
- Fast CPU Coreset Subsampling & Memory Bank Optimization
- Threshold Calibration on Validation Splits (val/good & val/defect)
- Multi-Channel Color Defect Fusion (Dust & Scratch Localization)
- Real-Time Anomaly Scoring & Heatmap Generation
"""

import os
import time
import json
import threading
import cv2
import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as transforms


class PatchcoreTrainingEngine:
    def __init__(self, models_dir=None):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.models_dir = models_dir or os.path.join(base_dir, "models")
        os.makedirs(self.models_dir, exist_ok=True)

        # Device (CPU by default)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Active Model State
        self.active_model_id = None
        self.active_model_meta = None
        self.memory_bank = None # [N, D] torch tensor
        self.golden_reference = None
        self.active_focus_mask = None # Grayscale focus mask if roi_mode == "custom_mask"
        self.threshold = 0.35
        self.is_model_ready = False

        # Training Progress Tracking
        self.training_state = {
            "status": "idle", # 'idle', 'training', 'completed', 'error'
            "progress": 0.0,
            "stage": "Ready to train",
            "logs": [],
            "error": None,
            "model_id": None
        }

        # Pre-trained Feature Extractor (ResNet-18)
        self.feature_extractor = None
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((448, 448)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

        # Attempt to load existing active model if present
        self._load_latest_model()

    def _init_feature_extractor(self):
        """Initializes ResNet-18 feature extractor hooks (Layer 2 & Layer 3)."""
        if self.feature_extractor is not None:
            return

        resnet = models.resnet18(weights=models.ResNet18_Weights.DEFAULT if hasattr(models, 'ResNet18_Weights') else True)
        resnet.eval()
        resnet.to(self.device)

        # Freeze all layers
        for param in resnet.parameters():
            param.requires_grad = False

        self.features = []

        def hook(module, input, output):
            self.features.append(output)

        resnet.layer2.register_forward_hook(hook)
        resnet.layer3.register_forward_hook(hook)

        self.feature_extractor = resnet

    def _log(self, text):
        t_str = time.strftime("%H:%M:%S")
        msg = f"[{t_str}] {text}"
        print(msg)
        self.training_state["logs"].append(msg)
        if len(self.training_state["logs"]) > 100:
            self.training_state["logs"].pop(0)

    def get_training_state(self):
        return self.training_state

    def start_training(self, dataset_path, dataset_name="watch_dials_v1", backbone="resnet18",
                       coreset_ratio=0.02, roi_mode="dial"):
        """Initiates background model training on the specified dataset."""
        if self.training_state["status"] == "training":
            return {"success": False, "error": "Training already in progress."}

        train_good_dir = os.path.join(dataset_path, "train", "good")
        if not os.path.isdir(train_good_dir):
            return {"success": False, "error": f"Directory not found: {train_good_dir}"}

        train_files = [os.path.join(train_good_dir, f) for f in os.listdir(train_good_dir)
                       if f.lower().endswith(('.png', '.jpg', '.jpeg')) and not f.startswith('.')]

        if len(train_files) == 0:
            return {"success": False, "error": f"No training images found in '{train_good_dir}'. Collect normal images first!"}

        self.training_state = {
            "status": "training",
            "progress": 5.0,
            "stage": "Initializing training pipeline...",
            "logs": [],
            "error": None,
            "model_id": None
        }

        thread = threading.Thread(
            target=self._train_worker,
            args=(dataset_path, dataset_name, train_files, backbone, coreset_ratio, roi_mode),
            daemon=True
        )
        thread.start()

        return {"success": True, "message": "Model training started in background."}

    def _train_worker(self, dataset_path, dataset_name, train_files, backbone, coreset_ratio, roi_mode):
        try:
            start_time = time.time()
            self._log(f"Starting model training on dataset: '{dataset_name}'")
            self._log(f"Normal training samples: {len(train_files)}")
            self.training_state["progress"] = 15.0
            self.training_state["stage"] = "Loading neural feature extractor..."

            self._init_feature_extractor()

            # Check for custom focus mask if roi_mode == "custom_mask"
            dataset_focus_mask = None
            if roi_mode == "custom_mask":
                mask_p = os.path.join(dataset_path, "focus_mask.png")
                if os.path.exists(mask_p):
                    dataset_focus_mask = cv2.imread(mask_p, cv2.IMREAD_GRAYSCALE)
                    self._log("Custom Focus Mask loaded from dataset. Ignoring clamps & external reflections.")
                else:
                    self._log("[WARN] Custom mask selected but focus_mask.png not found; falling back to circular dial mask.")
                    roi_mode = "dial"

            # 1. Feature Extraction Loop
            self.training_state["progress"] = 30.0
            self.training_state["stage"] = "Extracting multi-channel patch embeddings..."

            all_embeddings = []
            golden_ref = None

            for idx, img_p in enumerate(train_files):
                self._log(f"Processing normal sample ({idx+1}/{len(train_files)}): {os.path.basename(img_p)}")
                img_bgr = cv2.imread(img_p)
                if img_bgr is None:
                    continue

                if golden_ref is None:
                    golden_ref = cv2.resize(img_bgr, (448, 448))

                # ROI crop if requested
                if roi_mode == "custom_mask" and dataset_focus_mask is not None:
                    h, w = img_bgr.shape[:2]
                    mask_resized = cv2.resize(dataset_focus_mask, (w, h), interpolation=cv2.INTER_NEAREST)
                    img_dial = cv2.bitwise_and(img_bgr, img_bgr, mask=mask_resized)
                elif roi_mode == "dial":
                    h, w = img_bgr.shape[:2]
                    mask = np.zeros((h, w), dtype=np.uint8)
                    cv2.circle(mask, (w // 2, h // 2), int(min(h, w) * 0.36), 255, -1)
                    img_dial = cv2.bitwise_and(img_bgr, img_bgr, mask=mask)
                else:
                    img_dial = img_bgr

                img_rgb = cv2.cvtColor(img_dial, cv2.COLOR_BGR2RGB)
                tensor = self.transform(img_rgb).unsqueeze(0).to(self.device)

                self.features.clear()
                with torch.no_grad():
                    _ = self.feature_extractor(tensor)

                # Patch embedding aggregation (layer2 + layer3)
                l2 = self.features[0] # [1, 128, H/4, W/4]
                l3 = self.features[1] # [1, 256, H/8, W/8]

                # Resize layer3 to match layer2 spatial dimensions
                l3_up = torch.nn.functional.interpolate(l3, size=l2.shape[-2:], mode="bilinear", align_corners=False)
                combined = torch.cat([l2, l3_up], dim=1) # [1, 384, H/4, W/4]

                # Flatten spatial patches: [H*W, 384]
                patches = combined.squeeze(0).permute(1, 2, 0).reshape(-1, combined.shape[1])
                all_embeddings.append(patches.cpu())

                prog = 30.0 + (idx + 1) / len(train_files) * 35.0
                self.training_state["progress"] = round(prog, 1)

            if not all_embeddings:
                raise ValueError("No valid embeddings could be extracted.")

            # 2. Build Memory Bank
            self.training_state["stage"] = "Subsampling features into compact Memory Bank..."
            self.training_state["progress"] = 70.0
            full_bank = torch.cat(all_embeddings, dim=0) # [Total_Patches, 384]
            self._log(f"Total raw patches extracted: {full_bank.shape[0]}")

            # Subsampling (randomized coreset approximation for high CPU speed)
            total_patches = full_bank.shape[0]
            num_coreset = max(100, int(total_patches * max(coreset_ratio, 0.01)))
            num_coreset = min(num_coreset, 4000) # Cap at 4000 vectors for ultra-fast CPU inference

            indices = torch.randperm(total_patches)[:num_coreset]
            memory_bank = full_bank[indices] # [num_coreset, 384]
            self._log(f"Optimized Memory Bank size: {memory_bank.shape[0]} vectors")

            # 3. Validation & Threshold Calibration
            self.training_state["stage"] = "Calibrating decision threshold on validation set..."
            self.training_state["progress"] = 85.0

            val_good_dir = os.path.join(dataset_path, "val", "good")
            val_defect_dir = os.path.join(dataset_path, "val", "defect")

            good_scores = []
            defect_scores = []

            # Score validation goods
            if os.path.isdir(val_good_dir):
                for f in os.listdir(val_good_dir):
                    if f.lower().endswith(('.png', '.jpg', '.jpeg')):
                        sc = self._compute_score_fast(cv2.imread(os.path.join(val_good_dir, f)), memory_bank, mask=dataset_focus_mask if roi_mode == "custom_mask" else None)
                        if sc is not None:
                            good_scores.append(sc)

            # Score validation defects
            if os.path.isdir(val_defect_dir):
                for f in os.listdir(val_defect_dir):
                    if f.lower().endswith(('.png', '.jpg', '.jpeg')):
                        sc = self._compute_score_fast(cv2.imread(os.path.join(val_defect_dir, f)), memory_bank, mask=dataset_focus_mask if roi_mode == "custom_mask" else None)
                        if sc is not None:
                            defect_scores.append(sc)

            # Determine threshold
            if defect_scores and good_scores:
                calibrated_threshold = round(float((max(good_scores) + min(defect_scores)) / 2.0), 3)
            elif defect_scores:
                calibrated_threshold = round(float(min(defect_scores) * 0.8), 3)
            elif good_scores:
                calibrated_threshold = round(float(max(good_scores) * 1.35), 3)
            else:
                calibrated_threshold = 0.35 # Default benchmark

            self._log(f"Calibrated anomaly threshold tau: {calibrated_threshold}")

            # 4. Save Model Artifacts
            model_id = f"model_{dataset_name}_{time.strftime('%Y%m%d_%H%M%S')}"
            model_dir = os.path.join(self.models_dir, model_id)
            os.makedirs(model_dir, exist_ok=True)

            # Save memory bank tensor
            torch.save(memory_bank, os.path.join(model_dir, "memory_bank.pt"))

            # Save focus mask if custom
            if dataset_focus_mask is not None and roi_mode == "custom_mask":
                cv2.imwrite(os.path.join(model_dir, "focus_mask.png"), dataset_focus_mask)
                self.active_focus_mask = dataset_focus_mask
            else:
                self.active_focus_mask = None

            # Save metadata
            meta = {
                "model_id": model_id,
                "dataset_name": dataset_name,
                "backbone": backbone,
                "roi_mode": roi_mode,
                "coreset_ratio": coreset_ratio,
                "memory_bank_size": memory_bank.shape[0],
                "feature_dim": memory_bank.shape[1],
                "threshold": calibrated_threshold,
                "has_focus_mask": (self.active_focus_mask is not None),
                "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "duration_seconds": round(time.time() - start_time, 1)
            }
            with open(os.path.join(model_dir, "metadata.json"), "w") as f:
                json.dump(meta, f, indent=2)

            # Save golden reference
            if golden_ref is not None:
                cv2.imwrite(os.path.join(model_dir, "golden.jpg"), golden_ref)

            # Set as Active Model
            self.active_model_id = model_id
            self.active_model_meta = meta
            self.memory_bank = memory_bank
            self.threshold = calibrated_threshold
            self.golden_reference = golden_ref
            self.is_model_ready = True

            self.training_state["progress"] = 100.0
            self.training_state["status"] = "completed"
            self.training_state["stage"] = "Training Completed Successfully!"
            self.training_state["model_id"] = model_id
            self._log(f"Model '{model_id}' is now active and ready for live inspection!")

        except Exception as e:
            self.training_state["status"] = "error"
            self.training_state["error"] = str(e)
            self._log(f"Training failed: {e}")

    def _compute_score_fast(self, img_bgr, memory_bank, mask=None):
        """Compute quick image anomaly score against memory bank."""
        if img_bgr is None or memory_bank is None:
            return None
        try:
            h, w = img_bgr.shape[:2]
            if mask is not None:
                mask_r = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
                img_proc = cv2.bitwise_and(img_bgr, img_bgr, mask=mask_r)
            else:
                img_proc = img_bgr

            img_rgb = cv2.cvtColor(cv2.resize(img_proc, (448, 448)), cv2.COLOR_BGR2RGB)
            tensor = self.transform(img_rgb).unsqueeze(0).to(self.device)
            self.features.clear()
            with torch.no_grad():
                _ = self.feature_extractor(tensor)
            l2 = self.features[0]
            l3 = self.features[1]
            l3_up = torch.nn.functional.interpolate(l3, size=l2.shape[-2:], mode="bilinear", align_corners=False)
            patches = torch.cat([l2, l3_up], dim=1).squeeze(0).permute(1, 2, 0).reshape(-1, l2.shape[1] + l3.shape[1]).cpu()

            # Nearest neighbor distance to memory bank
            # Subsample query patches for validation speed
            q_idx = torch.randperm(patches.shape[0])[:300]
            dists = torch.cdist(patches[q_idx], memory_bank)
            min_dists, _ = torch.min(dists, dim=1)
            return float(torch.max(min_dists).item())
        except Exception:
            return None

    def _load_latest_model(self):
        """Auto-loads the most recent model in models/ directory."""
        if not os.path.exists(self.models_dir):
            return
        model_dirs = [os.path.join(self.models_dir, d) for d in os.listdir(self.models_dir)
                      if os.path.isdir(os.path.join(self.models_dir, d))]
        if not model_dirs:
            return

        latest = max(model_dirs, key=os.path.getmtime)
        meta_p = os.path.join(latest, "metadata.json")
        mb_p = os.path.join(latest, "memory_bank.pt")

        if os.path.exists(meta_p) and os.path.exists(mb_p):
            try:
                with open(meta_p, "r") as f:
                    self.active_model_meta = json.load(f)
                self.memory_bank = torch.load(mb_p, map_location="cpu")
                self.active_model_id = os.path.basename(latest)
                self.threshold = self.active_model_meta.get("threshold", 0.35)
                mask_p = os.path.join(latest, "focus_mask.png")
                if os.path.exists(mask_p):
                    self.active_focus_mask = cv2.imread(mask_p, cv2.IMREAD_GRAYSCALE)
                else:
                    self.active_focus_mask = None
                self.is_model_ready = True
                print(f"[INFO] Loaded active model '{self.active_model_id}' (tau={self.threshold}, custom_mask={self.active_focus_mask is not None})")
            except Exception as e:
                print(f"[WARN] Failed loading model {latest}: {e}")

    def predict_image(self, image_bgr, threshold=None, sensitivity=65):
        """
        Runs full defect inspection on input image:
        - Deep Anomaly scoring & Patch Heatmap
        - Multi-channel CLAHE + Top-Hat / Black-Hat Dust & Scratch segmentation
        - Pass / Fail determination
        """
        start_time = time.time()
        tau = threshold if threshold is not None else self.threshold
        h_orig, w_orig = image_bgr.shape[:2]

        # 1. Inspection ROI Mask Setup
        active_roi = self.active_model_meta.get("roi_mode", "dial") if self.active_model_meta else "dial"
        cx, cy, r = w_orig // 2, h_orig // 2, int(min(h_orig, w_orig) * 0.36)

        if active_roi == "custom_mask" and self.active_focus_mask is not None:
            mask_resized = cv2.resize(self.active_focus_mask, (w_orig, h_orig), interpolation=cv2.INTER_NEAREST)
            _, inspection_mask = cv2.threshold(mask_resized, 127, 255, cv2.THRESH_BINARY)
        elif active_roi == "dial":
            inspection_mask = np.zeros((h_orig, w_orig), dtype=np.uint8)
            cv2.circle(inspection_mask, (cx, cy), r, 255, -1)
        else: # 'full'
            inspection_mask = np.ones((h_orig, w_orig), dtype=np.uint8) * 255

        # 2. Feature Map Extraction & Anomaly Distance Map
        self._init_feature_extractor()
        resized = cv2.resize(image_bgr, (448, 448))
        img_rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        tensor = self.transform(img_rgb).unsqueeze(0).to(self.device)

        self.features.clear()
        with torch.no_grad():
            _ = self.feature_extractor(tensor)

        l2 = self.features[0]
        l3 = self.features[1]
        l3_up = torch.nn.functional.interpolate(l3, size=l2.shape[-2:], mode="bilinear", align_corners=False)
        combined = torch.cat([l2, l3_up], dim=1) # [1, 384, H/4, W/4]
        H_map, W_map = combined.shape[-2:]

        patches = combined.squeeze(0).permute(1, 2, 0).reshape(-1, combined.shape[1]).cpu()

        # Mask at feature map resolution
        mask_map = cv2.resize(inspection_mask, (W_map, H_map), interpolation=cv2.INTER_NEAREST) > 127

        # If memory bank is loaded, compute nearest-neighbor anomaly score
        if self.memory_bank is not None:
            # Pairwise distance to memory bank: [H*W, N_mb]
            dists = torch.cdist(patches, self.memory_bank)
            min_dists, _ = torch.min(dists, dim=1) # [H*W]
            spatial_map = min_dists.reshape(H_map, W_map).numpy()
            if mask_map.any():
                anomaly_score = float(np.max(spatial_map[mask_map]))
                spatial_map[~mask_map] = 0
            else:
                anomaly_score = float(torch.max(min_dists).item())
        else:
            # Fallback when model not trained yet: gradient energy
            anomaly_score = 0.28
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            spatial_map = cv2.Laplacian(gray, cv2.CV_32F)
            if mask_map.any():
                spatial_map[~mask_map] = 0

        # Upsample anomaly map to original resolution
        spatial_map = np.maximum(0, spatial_map)
        norm_map = cv2.normalize(spatial_map, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
        norm_map_orig = cv2.resize(norm_map, (w_orig, h_orig), interpolation=cv2.INTER_LINEAR)

        # 3. Defect Contours & Classification (Dust vs Scratch)
        # Multi-channel color enhancement
        lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
        l_chan = lab[:, :, 0]
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        enhanced_l = clahe.apply(l_chan)

        # Dust (Top-Hat / Black-Hat)
        k_dust = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        tophat = cv2.morphologyEx(enhanced_l, cv2.MORPH_TOPHAT, k_dust)
        blackhat = cv2.morphologyEx(enhanced_l, cv2.MORPH_BLACKHAT, k_dust)
        dust_field = cv2.max(tophat, blackhat)

        # Adjust threshold by sensitivity
        s_factor = np.clip(sensitivity, 10, 95) / 100.0
        d_thresh_val = int(32 - (s_factor * 20))
        _, dust_bin = cv2.threshold(dust_field, d_thresh_val, 255, cv2.THRESH_BINARY)
        dust_bin = cv2.bitwise_and(dust_bin, dust_bin, mask=inspection_mask)
        dust_bin = cv2.morphologyEx(dust_bin, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))

        contours, _ = cv2.findContours(dust_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        annotated = image_bgr.copy()
        if active_roi == "custom_mask" and self.active_focus_mask is not None:
            mask_contours, _ = cv2.findContours(inspection_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(annotated, mask_contours, -1, (223, 193, 109), 2)
        elif active_roi == "dial":
            cv2.circle(annotated, (cx, cy), r, (223, 193, 109), 1, cv2.LINE_AA)

        defects = []
        dust_count = 0
        scratch_count = 0

        for c in contours:
            area = cv2.contourArea(c)
            if 2 < area < 600:
                x, y, bw, bh = cv2.boundingRect(c)
                aspect = max(bw, bh) / max(min(bw, bh), 1)
                is_scratch = aspect >= 2.2 and max(bw, bh) >= 8

                if is_scratch:
                    scratch_count += 1
                    dtype = "scratch"
                    color = (0, 69, 255) # Red for scratch
                    label = f"Scratch #{scratch_count}"
                    cv2.rectangle(annotated, (x - 2, y - 2), (x + bw + 2, y + bh + 2), color, 2)
                else:
                    dust_count += 1
                    dtype = "dust"
                    color = (0, 220, 255) # Gold for dust
                    label = f"Dust #{dust_count}"
                    cv2.circle(annotated, (x + bw // 2, y + bh // 2), max(bw, bh) + 8, color, 2, cv2.LINE_AA)

                defects.append({
                    "id": len(defects) + 1,
                    "type": dtype,
                    "x": int(x),
                    "y": int(y),
                    "w": int(bw),
                    "h": int(bh),
                    "area": float(area),
                    "label": label
                })

        # 4. Anomaly Heatmap
        heatmap = cv2.applyColorMap(norm_map_orig, cv2.COLORMAP_JET)
        heatmap = cv2.bitwise_and(heatmap, heatmap, mask=inspection_mask)
        heatmap_blend = cv2.addWeighted(image_bgr, 0.45, heatmap, 0.55, 0)

        # 5. Pass / Fail Verdict
        is_pass = (anomaly_score <= tau) and (len(defects) == 0)
        verdict = "PASS" if is_pass else "FAIL"

        elapsed_ms = round((time.time() - start_time) * 1000, 1)

        return {
            "verdict": verdict,
            "is_pass": is_pass,
            "anomaly_score": round(anomaly_score, 3),
            "threshold": round(tau, 3),
            "total_defects": len(defects),
            "dust_count": dust_count,
            "scratch_count": scratch_count,
            "defects": defects,
            "processing_time_ms": elapsed_ms,
            "annotated_image": annotated,
            "heatmap_image": heatmap_blend,
            "model_id": self.active_model_id or "Untrained/Default"
        }
