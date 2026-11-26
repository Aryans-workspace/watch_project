import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if 'def load_model(' in line:
        start_idx = i
        break

replace_start = -1
for i in range(start_idx, len(lines)):
    if 'print(f"[INFO] Loading PatchCore model' in line:
        replace_start = i
        break

replace_end = -1
for i in range(replace_start, len(lines)):
    if 'self.active_metadata = metadata' in line:
        replace_end = i
        break

replacement = '''        print(f"[INFO] Loading PatchCore model {model_id} (backbone: {backbone}, focus_mode: {focus_mode}, layers: {layers})...")
        if backbone == "pixel_ssim":
            golden_path = os.path.join(model_dir, "golden.npy")
            import numpy as np
            self.active_model = PixelSSIMModel(np.load(golden_path))
            self.active_model_id = model_id
            self.active_metadata = metadata
        else:
            model = Patchcore(
                backbone=backbone,
                layers=layers,
                pre_trained=False,
                coreset_sampling_ratio=coreset_ratio,
                num_neighbors=9
            )
            model.load_state_dict(torch.load(weights_file, map_location="cpu"))
            model.eval()

            self.active_model = model
            self.active_model_id = model_id
            self.active_metadata = metadata
'''

content = ''.join(lines[:replace_start]) + replacement + ''.join(lines[replace_end+1:])

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated load_model successfully via index")
