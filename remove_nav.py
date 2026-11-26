import re

for filename in ['templates/calibration.html', 'templates/collection.html', 'templates/patchcore.html']:
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Remove the injected navbar div
        new_content = re.sub(r'<div style="background: #111; padding: 15px;.*?(?=<!-- Top Navigation)', '', content, flags=re.DOTALL)
        
        # Remove the old powershell injected navbar if present
        new_content = re.sub(r'<div style="background: #222; padding: 10px;.*?(?=<!-- Top Navigation)', '', new_content, flags=re.DOTALL)
        
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(new_content)
    except Exception as e:
        print(f"Failed on {filename}: {e}")
