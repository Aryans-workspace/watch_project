import re

with open('patchcore_defect_detection/static/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''            body: JSON.stringify({
                dataset_name: datasetName,
                backbone: backbone,
                coreset_ratio: coreset,
                focus_mode: focusMode
            })'''

replacement = '''            body: JSON.stringify({
                dataset_name: datasetName,
                backbone: backbone,
                coreset_ratio: coreset,
                focus_mode: focusMode,
                resolution: document.getElementById('selectResolution')?.value || 'standard'
            })'''

content = content.replace(target, replacement)

with open('patchcore_defect_detection/static/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated JS payload")
