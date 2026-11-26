import re

nav = '''<div style="background: #111; padding: 15px; text-align: center; border-bottom: 2px solid #00f0ff; position: relative; z-index: 10000; box-shadow: 0 4px 6px rgba(0,0,0,0.5);">
    <a href="/" style="color: #fff; margin: 0 20px; text-decoration: none; font-weight: bold; font-family: sans-serif; font-size: 16px; padding: 8px 16px; border-radius: 4px; border: 1px solid #333;">1. Calibration</a>
    <a href="/collection" style="color: #fff; margin: 0 20px; text-decoration: none; font-weight: bold; font-family: sans-serif; font-size: 16px; padding: 8px 16px; border-radius: 4px; border: 1px solid #333;">2. Data Collection</a>
    <a href="/patchcore" style="color: #fff; margin: 0 20px; text-decoration: none; font-weight: bold; font-family: sans-serif; font-size: 16px; padding: 8px 16px; border-radius: 4px; border: 1px solid #333;">3. AI PatchCore</a>
</div>'''

for filename in ['templates/calibration.html', 'templates/collection.html', 'templates/patchcore.html']:
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # If already injected, don't inject again
    if '1. Calibration</a>' in content:
        continue
        
    new_content = re.sub(r'(<body[^>]*>)', r'\1\n' + nav, content)
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(new_content)

print("Navbar injected successfully!")
