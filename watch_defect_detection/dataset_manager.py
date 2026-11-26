"""
Dataset Manager for PatchCore Defect Detection
Organizes watch images into MVTec/Anomalib compliant structure:
  datasets/
    <active_folder>/
      train/
        good/
      val/
        good/
        defect/
"""

import os
import re
import time
import cv2

class DatasetManager:
    CATEGORIES = {
        "train_good": ("train", "good"),
        "val_good": ("val", "good"),
        "val_defect": ("val", "defect"),
    }

    def __init__(self, root_dir=None, active_folder="watches", base_dir=None):
        if base_dir:
            norm = os.path.abspath(base_dir)
            parent = os.path.basename(os.path.dirname(norm))
            if parent == "datasets" or "datasets" in norm:
                self.root_dir = os.path.dirname(norm)
                self.active_folder = self._sanitize_folder_name(os.path.basename(norm))
            else:
                self.root_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datasets")
                self.active_folder = self._sanitize_folder_name(active_folder)
        else:
            if root_dir is None:
                root_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datasets")
            self.root_dir = os.path.abspath(root_dir)
            self.active_folder = self._sanitize_folder_name(active_folder)

        os.makedirs(self.root_dir, exist_ok=True)
        self.ensure_directories()

    @staticmethod
    def _sanitize_folder_name(name):
        if not name:
            return "watches"
        # Keep letters, numbers, underscores, hyphens
        cleaned = re.sub(r'[^a-zA-Z0-9_\-]', '_', str(name).strip())
        return cleaned or "watches"

    @property
    def base_dir(self):
        """Returns the full path of the current active dataset folder."""
        return os.path.join(self.root_dir, self.active_folder)

    def get_folder_path(self, folder_name=None):
        target = self._sanitize_folder_name(folder_name) if folder_name else self.active_folder
        return os.path.join(self.root_dir, target)

    def ensure_directories(self, folder_name=None):
        """Creates all required PatchCore dataset directories for the specified or active folder."""
        target_dir = self.get_folder_path(folder_name)
        for split, label in self.CATEGORIES.values():
            folder = os.path.join(target_dir, split, label)
            os.makedirs(folder, exist_ok=True)
            # Create thumbnail folder for UI
            os.makedirs(os.path.join(folder, ".thumbs"), exist_ok=True)

    def list_folders(self):
        """Scans root_dir for dataset folders and computes image counts."""
        if not os.path.exists(self.root_dir):
            os.makedirs(self.root_dir, exist_ok=True)

        folders = []
        for item in sorted(os.listdir(self.root_dir)):
            full_item_path = os.path.join(self.root_dir, item)
            if os.path.isdir(full_item_path) and not item.startswith('.'):
                # Count images across active categories
                count = 0
                for split, label in self.CATEGORIES.values():
                    cat_dir = os.path.join(full_item_path, split, label)
                    if os.path.isdir(cat_dir):
                        count += len([f for f in os.listdir(cat_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff'))])
                
                mtime = os.path.getmtime(full_item_path)
                folders.append({
                    "name": item,
                    "is_active": (item == self.active_folder),
                    "image_count": count,
                    "mtime": mtime
                })
        
        # If active_folder is not yet listed, append it
        if not any(f["name"] == self.active_folder for f in folders):
            folders.append({
                "name": self.active_folder,
                "is_active": True,
                "image_count": 0,
                "mtime": time.time()
            })

        return folders

    def create_folder(self, folder_name):
        """Creates a new dataset folder and standard category structure."""
        clean_name = self._sanitize_folder_name(folder_name)
        folder_path = os.path.join(self.root_dir, clean_name)
        os.makedirs(folder_path, exist_ok=True)
        self.active_folder = clean_name
        self.ensure_directories()
        return {
            "success": True,
            "folder_name": clean_name,
            "active_folder": self.active_folder,
            "message": f"Dataset folder '{clean_name}' created and selected."
        }

    def set_active_folder(self, folder_name):
        """Switches current active dataset folder."""
        clean_name = self._sanitize_folder_name(folder_name)
        folder_path = os.path.join(self.root_dir, clean_name)
        if not os.path.exists(folder_path):
            os.makedirs(folder_path, exist_ok=True)
        self.active_folder = clean_name
        self.ensure_directories()
        return {
            "success": True,
            "active_folder": self.active_folder,
            "message": f"Switched active dataset folder to '{clean_name}'."
        }

    def get_category_dir(self, category_key, folder_name=None):
        """Returns directory for a given category key in the specified or active folder."""
        if category_key not in self.CATEGORIES:
            category_key = "train_good"
        split, label = self.CATEGORIES[category_key]
        target_dir = self.get_folder_path(folder_name)
        return os.path.join(target_dir, split, label)

    def save_slot_image(self, image, slot_num, watch_id=None, category_key="train_good"):
        """
        Saves a captured slot image to the appropriate PatchCore dataset folder.
        Filename format: {ddmmyy}_{timecaptured}_slot{slot_num}.png (e.g. 170926_152504_slot1.png)
        If file exists within the same second, appends increment: 170926_152504_slot1_1.png
        """
        target_dir = self.get_category_dir(category_key)
        date_str = time.strftime("%d%m%y")     # ddmmyy format (e.g. 170926)
        time_str = time.strftime("%H%M%S")     # timecaptured format (e.g. 152504)
        base_name = f"{date_str}_{time_str}_slot{slot_num}"
        filename = f"{base_name}.png"

        # Check for collision if multiple captures trigger in same second
        counter = 1
        while os.path.exists(os.path.join(target_dir, filename)):
            filename = f"{base_name}_{counter}.png"
            counter += 1

        filepath = os.path.join(target_dir, filename)

        # Save full resolution image (lossless PNG)
        cv2.imwrite(filepath, image, [cv2.IMWRITE_PNG_COMPRESSION, 3])

        # Generate thumbnail
        thumb_dir = os.path.join(target_dir, ".thumbs")
        os.makedirs(thumb_dir, exist_ok=True)
        thumb_path = os.path.join(thumb_dir, filename)
        h, w = image.shape[:2]
        thumb = cv2.resize(image, (320, int(320 * h / w)))
        cv2.imwrite(thumb_path, thumb)

        split, label = self.CATEGORIES.get(category_key, ("train", "good"))
        rel_path = f"{self.active_folder}/{split}/{label}/{filename}"

        return {
            "success": True,
            "filename": filename,
            "filepath": filepath,
            "folder": self.active_folder,
            "relative_path": rel_path,
            "thumb_url": f"/api/image/thumb/{rel_path}",
            "image_url": f"/api/image/full/{rel_path}",
            "slot_num": slot_num,
            "category": category_key,
            "split": split,
            "label": label,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "resolution": f"{w}x{h}"
        }

    def delete_image(self, relative_path):
        """
        Safely deletes an image and its thumbnail.
        Accepts paths like 'watches/train/good/170926_152504_slot1.png'
        or 'train/good/170926_152504_slot1.png'.
        """
        norm_path = os.path.normpath(relative_path).lstrip('\\/')
        if ".." in norm_path:
            return {"success": False, "error": "Invalid path"}

        # Try relative to root_dir first (folder/split/label/file)
        candidate = os.path.join(self.root_dir, norm_path)
        if not os.path.isfile(candidate):
            # Try relative to active base_dir (split/label/file)
            candidate = os.path.join(self.base_dir, norm_path)

        if not os.path.isfile(candidate):
            return {"success": False, "error": "File not found"}

        try:
            os.remove(candidate)
            # Also remove thumbnail if exists
            dir_name = os.path.dirname(candidate)
            file_name = os.path.basename(candidate)
            thumb_path = os.path.join(dir_name, ".thumbs", file_name)
            if os.path.exists(thumb_path):
                try:
                    os.remove(thumb_path)
                except Exception:
                    pass
            return {"success": True, "message": f"Deleted {file_name}", "relative_path": relative_path}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_dataset_stats(self, folder_name=None):
        """Returns file counts per category for the web dashboard."""
        target_folder = self._sanitize_folder_name(folder_name) if folder_name else self.active_folder
        folder_dir = self.get_folder_path(target_folder)

        stats = {}
        total = 0
        for cat_key, (split, label) in self.CATEGORIES.items():
            folder = os.path.join(folder_dir, split, label)
            count = 0
            if os.path.exists(folder):
                count = len([f for f in os.listdir(folder) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff'))])
            stats[cat_key] = {
                "split": split,
                "label": label,
                "count": count
            }
            total += count

        stats["total_images"] = total
        stats["active_folder"] = target_folder
        stats["base_dir"] = folder_dir
        return stats

    def list_recent_images(self, limit=30, folder_name=None):
        """Returns the most recent captures across active categories in the folder."""
        target_folder = self._sanitize_folder_name(folder_name) if folder_name else self.active_folder
        folder_dir = self.get_folder_path(target_folder)

        all_files = []
        for cat_key, (split, label) in self.CATEGORIES.items():
            folder = os.path.join(folder_dir, split, label)
            if not os.path.exists(folder):
                continue
            for f in os.listdir(folder):
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff')):
                    fp = os.path.join(folder, f)
                    stat = os.stat(fp)
                    rel_path = f"{target_folder}/{split}/{label}/{f}"
                    all_files.append({
                        "filename": f,
                        "relative_path": rel_path,
                        "folder": target_folder,
                        "split": split,
                        "label": label,
                        "category": cat_key,
                        "mtime": stat.st_mtime,
                        "size_bytes": stat.st_size,
                        "thumb_url": f"/api/image/thumb/{rel_path}",
                        "image_url": f"/api/image/full/{rel_path}"
                    })

        all_files.sort(key=lambda x: x["mtime"], reverse=True)
        return all_files[:limit]
