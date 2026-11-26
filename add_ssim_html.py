import re

with open('patchcore_defect_detection/templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''                                    <option value="resnet18" selected>ResNet-18 (Fast CPU Inference ~120ms)</option>
                                    <option value="wide_resnet50_2">WideResNet-50-2 (Benchmark High Capacity)</option>
                                </select>'''

replacement = '''                                    <option value="resnet18" selected>ResNet-18 (Fast CPU Inference ~120ms)</option>
                                    <option value="wide_resnet50_2">WideResNet-50-2 (Benchmark High Capacity)</option>
                                    <option value="pixel_ssim">Pixel-Level SSIM (Micro-Defect Comparison Engine)</option>
                                </select>'''

content = content.replace(target, replacement)

with open('patchcore_defect_detection/templates/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added pixel_ssim to HTML")
