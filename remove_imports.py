import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''            if backbone == "pixel_ssim":
                self._log_training("Initializing Pixel-Level Subtraction Engine (Golden Reference)...")
                import numpy as np
                import cv2'''

replacement = '''            if backbone == "pixel_ssim":
                self._log_training("Initializing Pixel-Level Subtraction Engine (Golden Reference)...")'''

content = content.replace(target, replacement)

with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Removed inner imports")
