import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if '[INFO] Loading PatchCore model' in line:
        start_idx = i
        break

end_idx = -1
for i in range(start_idx, len(lines)):
    if 'model.eval()' in line:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    replacement = '''        print(f"[INFO] Loading PatchCore model {model_id} (backbone: {backbone}, focus_mode: {focus_mode}, layers: {layers})...")
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
'''
    content = ''.join(lines[:start_idx]) + replacement + ''.join(lines[end_idx+1:])
    with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated load_model successfully via index")
else:
    print(f"Could not find block. start={start_idx}, end={end_idx}")
