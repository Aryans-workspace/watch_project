import re

file_path = 'patchcore_defect_detection/patchcore_engine.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = 'if 3 <= area <= 400 and wb < 40 and hb < 40:'
replacement = 'if 3 <= area <= 500 and wb < 50 and hb < 50:'

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully updated size threshold to 500px.")
else:
    print("Error: Target string not found.")
