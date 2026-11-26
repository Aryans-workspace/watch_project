import re

with open('patchcore_defect_detection/app.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''    focus_mode = data.get("focus_mode", "dial")

    if not dataset_name:'''

replacement = '''    focus_mode = data.get("focus_mode", "dial")
    resolution = data.get("resolution", "standard")

    if not dataset_name:'''

content = content.replace(target, replacement)

target2 = '''    res = patchcore_engine.start_training(
        dataset_name=dataset_name,
        backbone=backbone,
        coreset_ratio=coreset_ratio,
        focus_mode=focus_mode
    )'''

replacement2 = '''    res = patchcore_engine.start_training(
        dataset_name=dataset_name,
        backbone=backbone,
        coreset_ratio=coreset_ratio,
        focus_mode=focus_mode,
        resolution=resolution
    )'''

content = content.replace(target2, replacement2)

with open('patchcore_defect_detection/app.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated app.py with resolution logic")
