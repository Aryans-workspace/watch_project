import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix weights file check
target1 = '''        if not os.path.exists(meta_file) or not os.path.exists(weights_file):
            return {"success": False, "error": f"Model files not found for {model_id}"}'''
replacement1 = '''        if not os.path.exists(meta_file):
            return {"success": False, "error": f"Metadata not found for {model_id}"}
        
        with open(meta_file, "r") as mf:
            m_temp = __import__("json").load(mf)
            
        if m_temp.get("backbone") != "pixel_ssim" and not os.path.exists(weights_file):
            return {"success": False, "error": f"Model weights not found for {model_id}"}'''
content = content.replace(target1, replacement1)

# Fix PixelSSIMModel loading
target2 = '''        print(f"[INFO] Loading PatchCore model {model_id} (backbone: {backbone}, focus_mode: {focus_mode}, layers: {layers})...")
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
        if os.path.exists(focus_mask_path):'''
replacement2 = '''        print(f"[INFO] Loading PatchCore model {model_id} (backbone: {backbone}, focus_mode: {focus_mode}, layers: {layers})...")
        if backbone == "pixel_ssim":
            golden_path = os.path.join(model_dir, "golden.npy")
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
        if os.path.exists(focus_mask_path):'''
content = content.replace(target2, replacement2)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated load_model successfully")
