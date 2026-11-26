import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''            # Initialize Patchcore with layer1, layer2, and layer3 to balance micro-defect sensitivity and spatial invariance
            layers = ["layer1", "layer2", "layer3"]'''

replacement = '''            # Initialize Patchcore with layer1, layer2, and layer3 to balance micro-defect sensitivity and spatial invariance
            if resolution == "pixel_zoom":
                # For extreme pixel-level detail, layer1 is critical. We drop layer3 to save memory and focus purely on micro-textures.
                layers = ["layer1", "layer2"]
            else:
                layers = ["layer1", "layer2", "layer3"]'''

content = content.replace(target, replacement)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated layers logic")
