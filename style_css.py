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
        
        # Replace colors
        content = content.replace('--bg-primary: #0a0d14;', '--bg-primary: #090b0e;')
        content = content.replace('--bg-surface: #111622;', '--bg-surface: rgba(23, 26, 31, 0.65);')
        content = content.replace('--bg-card: #182030;', '--bg-card: rgba(33, 37, 43, 0.5);')
        content = content.replace('--bg-card-hover: #1f2a3f;', '--bg-card-hover: rgba(53, 57, 63, 0.6);')
        content = content.replace('--bg-input: #0e1420;', '--bg-input: #090b0e;')
        
        content = content.replace('--border-subtle: #232e42;', '--border-subtle: rgba(255, 255, 255, 0.08);')
        content = content.replace('--border-highlight: #344462;', '--border-highlight: rgba(255, 255, 255, 0.2);')
        
        content = content.replace('--text-main: #f1f5f9;', '--text-main: #f0f2f5;')
        content = content.replace('--text-muted: #94a3b8;', '--text-muted: #9ca3af;')
        
        content = content.replace('--accent-green: #00ff66;', '--accent-green: #dfc16d;')
        content = content.replace('--accent-green-hover: #10b981;', '--accent-green-hover: #c9a24a;')
        content = content.replace('rgba(0, 255, 102,', 'rgba(223, 193, 109,')
        content = content.replace('rgba(16, 185, 129,', 'rgba(201, 162, 74,')
        
        # Replace fonts
        content = content.replace(
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
            'font-family: "Roboto", sans-serif;'
        )
        content = content.replace(
            'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;',
            'font-family: "Roboto Mono", monospace;'
        )
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

print("Updated CSS files.")
