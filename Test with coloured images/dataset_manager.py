"""
Dataset Manager for Coloured Image Defect Detection
Manages datasets for training and validation:
  datasets/
    <dataset_name>/
      train/
        good/
      val/
        good/
        defect/
"""

import os
import re
import time
import shutil
import cv2
import numpy as np


class DatasetManager:
    CATEGORIES = {
        "train_good": ("train", "good"),
        "val_good": ("val", "good"),
        "val_defect": ("val", "defect")
    }

    def __init__(self, root_dir=None, active_folder="watch_dials_v1"):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.root_dir = root_dir or os.path.join(base_dir, "datasets")
        self.active_folder = self._sanitize_name(active_folder)
        os.makedirs(self.root_dir, exist_ok=True)
        self.ensure_directories()
        self._populate_initial_sample_dataset()

    @staticmethod
    def _sanitize_name(name):
        cleaned = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(name or "watch_dials_v1").strip())
        return cleaned or "watch_dials_v1"

    def get_dataset_path(self, folder_name=None):
        target = self._sanitize_name(folder_name) if folder_name else self.active_folder
        return os.path.join(self.root_dir, target)

    def ensure_directories(self, folder_name=None):
        target_dir = self.get_dataset_path(folder_name)
        for split, label in self.CATEGORIES.values():
            cat_dir = os.path.join(target_dir, split, label)
            os.makedirs(cat_dir, exist_ok=True)
            os.makedirs(os.path.join(cat_dir, ".thumbs"), exist_ok=True)

    def _populate_initial_sample_dataset(self):
        """Seed initial sample dataset from existing workspace testing images if empty."""
        train_dir = self.get_category_dir("train_good")
        val_defect_dir = self.get_category_dir("val_defect")
        
        # Check if empty
        if not os.path.exists(train_dir) or len(os.listdir(train_dir)) <= 1:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            good_src = os.path.join(base_dir, "..", "testing", "good")
            defect_src = os.path.join(base_dir, "..", "testing", "defect")

            if os.path.exists(good_src):
                for f in os.listdir(good_src):
                    if f.lower().endswith(('.png', '.jpg', '.jpeg')):
                        src_path = os.path.join(good_src, f)
                        dest_path = os.path.join(train_dir, f)
                        if not os.path.exists(dest_path):
                            shutil.copy2(src_path, dest_path)

            if os.path.exists(defect_src):
                for f in os.listdir(defect_src):
                    if f.lower().endswith(('.png', '.jpg', '.jpeg')):
                        src_path = os.path.join(defect_src, f)
                        dest_path = os.path.join(val_defect_dir, f)
                        if not os.path.exists(dest_path):
                            shutil.copy2(src_path, dest_path)

    def list_datasets(self):
        """List all dataset folders and image counts."""
        if not os.path.exists(self.root_dir):
            os.makedirs(self.root_dir, exist_ok=True)

        datasets = []
        for item in sorted(os.listdir(self.root_dir)):
            full_path = os.path.join(self.root_dir, item)
            if os.path.isdir(full_path) and not item.startswith('.'):
                counts = self.get_dataset_counts(item)
                datasets.append({
                    "name": item,
                    "is_active": (item == self.active_folder),
                    "total_images": sum(counts.values()),
                    "counts": counts
                })

        if not any(d["name"] == self.active_folder for d in datasets):
            datasets.append({
                "name": self.active_folder,
                "is_active": True,
                "total_images": 0,
                "counts": {"train_good": 0, "val_good": 0, "val_defect": 0}
            })

        return datasets

    def get_dataset_counts(self, folder_name=None):
        """Return counts for train_good, val_good, val_defect."""
        target_dir = self.get_dataset_path(folder_name)
        counts = {}
        for key, (split, label) in self.CATEGORIES.items():
            cat_dir = os.path.join(target_dir, split, label)
            if os.path.isdir(cat_dir):
                files = [f for f in os.listdir(cat_dir) 
                         if f.lower().endswith(('.png', '.jpg', '.jpeg')) and not f.startswith('.')]
                counts[key] = len(files)
            else:
                counts[key] = 0
        return counts

    def create_dataset(self, folder_name):
        clean = self._sanitize_name(folder_name)
        self.active_folder = clean
        self.ensure_directories(clean)
        return {"success": True, "active_folder": clean}

    def set_active_dataset(self, folder_name):
        clean = self._sanitize_name(folder_name)
        self.active_folder = clean
        self.ensure_directories(clean)
        return {"success": True, "active_folder": clean}

    def get_category_dir(self, category_key, folder_name=None):
        if category_key not in self.CATEGORIES:
            category_key = "train_good"
        split, label = self.CATEGORIES[category_key]
        return os.path.join(self.get_dataset_path(folder_name), split, label)

    def save_image(self, image_np, category_key="train_good", folder_name=None, custom_name=None):
        """Save captured image into dataset split folder and generate thumbnail."""
        target_dir = self.get_category_dir(category_key, folder_name)
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        prefix = "good" if "good" in category_key else "defect"
        filename = f"{prefix}_{timestamp}.jpg" if not custom_name else f"{custom_name}.jpg"

        filepath = os.path.join(target_dir, filename)
        cv2.imwrite(filepath, image_np, [int(cv2.IMWRITE_JPEG_QUALITY), 98])

        # Generate thumbnail (160x160)
        thumb_dir = os.path.join(target_dir, ".thumbs")
        os.makedirs(thumb_dir, exist_ok=True)
        thumb_path = os.path.join(thumb_dir, filename)
        h, w = image_np.shape[:2]
        scale = 160.0 / max(h, w)
        thumb_img = cv2.resize(image_np, (int(w * scale), int(h * scale)))
        cv2.imwrite(thumb_path, thumb_img)

        return {
            "success": True,
            "filename": filename,
            "filepath": filepath,
            "category": category_key,
            "folder": folder_name or self.active_folder
        }

    def list_images(self, folder_name=None, category_key=None):
        """List captured images with metadata."""
        target_dir = self.get_dataset_path(folder_name)
        images = []

        categories_to_scan = [category_key] if category_key else list(self.CATEGORIES.keys())

        for cat in categories_to_scan:
            if cat not in self.CATEGORIES:
                continue
            cat_dir = self.get_category_dir(cat, folder_name)
            if not os.path.isdir(cat_dir):
                continue

            for f in sorted(os.listdir(cat_dir), reverse=True):
                if f.lower().endswith(('.png', '.jpg', '.jpeg')) and not f.startswith('.'):
                    full_p = os.path.join(cat_dir, f)
                    stat = os.stat(full_p)
                    images.append({
                        "filename": f,
                        "category": cat,
                        "size_bytes": stat.st_size,
                        "mtime": stat.st_mtime,
                        "url": f"/dataset_files/{folder_name or self.active_folder}/{cat}/{f}",
                        "thumb_url": f"/dataset_files/{folder_name or self.active_folder}/{cat}/.thumbs/{f}"
                    })

        return images

    def delete_image(self, filename, category_key, folder_name=None):
        cat_dir = self.get_category_dir(category_key, folder_name)
        img_p = os.path.join(cat_dir, filename)
        thumb_p = os.path.join(cat_dir, ".thumbs", filename)

        if os.path.exists(img_p):
            os.remove(img_p)
        if os.path.exists(thumb_p):
            os.remove(thumb_p)

        return {"success": True, "message": f"Deleted {filename}"}

    def get_dataset_sample_image(self, folder_name=None):
        """Retrieves a sample image from the dataset for painting the grid mesh focus mask."""
        target_dir = self.get_dataset_path(folder_name)
        active_f = folder_name or self.active_folder

        # Check train/good, then val/good, then val/defect
        for cat in ["train_good", "val_good", "val_defect"]:
            cat_dir = self.get_category_dir(cat, active_f)
            if os.path.isdir(cat_dir):
                files = [f for f in sorted(os.listdir(cat_dir)) 
                         if f.lower().endswith(('.png', '.jpg', '.jpeg')) and not f.startswith('.')]
                if files:
                    sample_file = files[0]
                    img_path = os.path.join(cat_dir, sample_file)
                    img = cv2.imread(img_path)
                    if img is not None:
                        h, w = img.shape[:2]
                        split, label = self.CATEGORIES.get(cat, ("train", "good"))
                        return {
                            "success": True,
                            "dataset_name": active_f,
                            "category": cat,
                            "filename": sample_file,
                            "width": w,
                            "height": h,
                            "image_url": f"/dataset_files/{active_f}/{split}/{label}/{sample_file}"
                        }

        return {"success": False, "error": f"No images found in dataset '{active_f}'"}

    def get_dataset_focus_mask(self, folder_name=None):
        """Retrieves existing grid focus mask JSON and metadata."""
        dataset_path = self.get_dataset_path(folder_name)
        active_f = folder_name or self.active_folder
        json_path = os.path.join(dataset_path, "focus_mask.json")
        png_path = os.path.join(dataset_path, "focus_mask.png")

        if os.path.exists(json_path):
            try:
                import json
                with open(json_path, "r") as f:
                    data = json.load(f)
                data["has_mask"] = True
                data["mask_image_url"] = f"/api/dataset/{active_f}/focus_mask_preview"
                return {"success": True, "mask_data": data}
            except Exception as e:
                return {"success": False, "error": f"Failed to read focus mask: {e}"}

        return {
            "success": True,
            "mask_data": {
                "has_mask": False,
                "rows": 32,
                "cols": 32,
                "density": 32,
                "grid": None,
                "active_cells": 0,
                "coverage_pct": 0.0
            }
        }

    def save_dataset_focus_mask(self, folder_name, payload):
        """
        Saves grid matrix JSON and rasterizes a high-resolution binary mask (focus_mask.png).
        Payload: { rows: int, cols: int, density: int, grid: [[int]] }
        """
        import json
        dataset_path = self.get_dataset_path(folder_name)
        if not os.path.exists(dataset_path):
            return {"success": False, "error": f"Dataset directory not found: {dataset_path}"}

        rows = int(payload.get("rows", 32))
        cols = int(payload.get("cols", 32))
        density = int(payload.get("density", rows))
        grid = payload.get("grid")

        if not grid or len(grid) != rows:
            return {"success": False, "error": "Invalid grid dimensions"}

        sample_info = self.get_dataset_sample_image(folder_name)
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

        png_path = os.path.join(dataset_path, "focus_mask.png")
        cv2.imwrite(png_path, mask)

        meta = {
            "dataset_name": folder_name,
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

        return {
            "success": True,
            "message": f"Focus mask saved ({coverage_pct}% coverage, {active_cells} active cells)",
            "coverage_pct": coverage_pct,
            "active_cells": active_cells,
            "total_cells": total_cells
        }
