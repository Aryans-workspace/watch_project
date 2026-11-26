import os

css_files = [
    'static/css/style.css',
    'watch_defect_detection/static/css/style.css',
    'patchcore_defect_detection/static/css/style.css'
]

for file in css_files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Backgrounds again just to be safe
        content = content.replace('--bg-base: #0a0d14;', '--bg-base: #090b0e;')
        
        # Colors
        content = content.replace('#38bdf8', '#dfc16d') # Blue to Brass
        content = content.replace('rgba(56, 189, 248,', 'rgba(223, 193, 109,') # Blue glow to Brass glow
        
        content = content.replace('#00ff66', '#dfc16d') # Laser green to Brass
        content = content.replace('rgba(0, 255, 102,', 'rgba(223, 193, 109,')
        
        content = content.replace('#10b981', '#dfc16d') # Emerald green to Brass
        content = content.replace('rgba(16, 185, 129,', 'rgba(223, 193, 109,')
        
        # Borders
        content = content.replace('--border-bright: #344462;', '--border-bright: rgba(255, 255, 255, 0.2);')
        
        # Text colors
        content = content.replace('--text-primary: #f8fafc;', '--text-primary: #f0f2f5;')
        content = content.replace('--text-secondary: #94a3b8;', '--text-secondary: #9ca3af;')
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

print("Updated all CSS colors globally.")
