import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'if not os.path.exists(meta_file) or not os.path.exists(weights_file):' in line:
        lines[i] = '''        if not os.path.exists(meta_file):
            return {"success": False, "error": f"Metadata not found for {model_id}"}
        
        with open(meta_file, "r") as mf:
            m_temp = __import__("json").load(mf)
            
        if m_temp.get("backbone") != "pixel_ssim" and not os.path.exists(weights_file):
            return {"success": False, "error": f"Model weights not found for {model_id}"}
'''
        break

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("Fixed weights_file check in load_model")
