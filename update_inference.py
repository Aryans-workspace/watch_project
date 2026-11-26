import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''        img_size = metadata.get("image_size", [448, 448])[0] if focus_mode == "dial" else 256'''
replacement = '''        img_size = metadata.get("image_size", [448, 448])[0]'''
content = content.replace(target, replacement)

target2 = '''        img_size = self.active_metadata.get("image_size", [448, 448])[0] if focus_mode == "dial" else 256'''
replacement2 = '''        img_size = self.active_metadata.get("image_size", [448, 448])[0]'''
content = content.replace(target2, replacement2)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed img_size inference logic")
