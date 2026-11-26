import os

css_files = [
    'static/css/style.css',
    'watch_defect_detection/static/css/style.css',
    'patchcore_defect_detection/static/css/style.css',
    'hub.py' # For hub iframe background
]

for file in css_files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Add gradient to css body
        if 'body {' in content and 'radial-gradient' not in content:
            content = content.replace('background-color: var(--bg-primary);', 'background: radial-gradient(circle at 50% -20%, #1f242d 0%, var(--bg-primary) 100%); background-attachment: fixed;')
            
        # Add gradient to hub body
        if 'background: #090b0e;' in content and 'radial-gradient' not in content:
            content = content.replace('background: #090b0e;', 'background: radial-gradient(circle at 50% -20%, #1f242d 0%, #090b0e 100%); background-attachment: fixed;')
            
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

print("Added gradient background.")
