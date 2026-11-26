import re

file_path = 'patchcore_defect_detection/patchcore_engine.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the layer selection logic to only use layer1 for pixel_zoom
target = '''                if resolution == "pixel_zoom":
                    layers = ["layer1", "layer2"]
                else:
                    layers = ["layer1", "layer2", "layer3"]'''

replacement = '''                if resolution == "pixel_zoom":
                    # strictly restrict to layer1 to shrink the patch receptive field
                    # this makes the AI hyper-focused on microscopic anomalies (dust)
                    layers = ["layer1"]
                else:
                    layers = ["layer1", "layer2", "layer3"]'''

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully shrank PatchCore layers to layer1 for pixel_zoom.")
else:
    print("Error: Target block not found.")
