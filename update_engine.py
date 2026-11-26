import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

# start_training signature
t1 = '''def start_training(self, dataset_name, backbone="resnet18", coreset_ratio=0.01, focus_mode="dial"):'''
r1 = '''def start_training(self, dataset_name, backbone="resnet18", coreset_ratio=0.01, focus_mode="dial", resolution="standard"):'''
content = content.replace(t1, r1)

# _train_worker signature
t2 = '''def _train_worker(self, dataset_name, dataset_path, train_images, backbone, coreset_ratio, focus_mode="dial"):'''
r2 = '''def _train_worker(self, dataset_name, dataset_path, train_images, backbone, coreset_ratio, focus_mode="dial", resolution="standard"):'''
content = content.replace(t2, r2)

# Pass resolution to _train_worker
t3 = '''threading.Thread(target=self._train_worker, args=(dataset_name, dataset_path, train_images, backbone, coreset_ratio, focus_mode), daemon=True).start()'''
r3 = '''threading.Thread(target=self._train_worker, args=(dataset_name, dataset_path, train_images, backbone, coreset_ratio, focus_mode, resolution), daemon=True).start()'''
content = content.replace(t3, r3)

# Handle resolution logic inside _train_worker
t4 = '''            # Build Dataset and DataLoader (448x448 high resolution)
            img_size = 448 if focus_mode in ("dial", "custom_mask") else 256'''
r4 = '''            # Build Dataset and DataLoader
            if resolution == "pixel_zoom":
                img_size = 896
                coreset_ratio = min(coreset_ratio, 0.01) # Force strict coreset limit to prevent OOM
            else:
                img_size = 448 if focus_mode in ("dial", "custom_mask") else 256'''
content = content.replace(t4, r4)

# Also need to save resolution into metadata so that inference uses the same img_size!
t5 = '''            # Save Metadata
            metadata = {
                "dataset_name": dataset_name,
                "backbone": backbone,
                "coreset_ratio": coreset_ratio,
                "focus_mode": focus_mode,
                "layers": layers
            }'''
r5 = '''            # Save Metadata
            metadata = {
                "dataset_name": dataset_name,
                "backbone": backbone,
                "coreset_ratio": coreset_ratio,
                "focus_mode": focus_mode,
                "layers": layers,
                "image_size": [img_size, img_size],
                "resolution": resolution
            }'''
content = content.replace(t5, r5)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated patchcore_engine.py with resolution logic")
