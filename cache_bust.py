import os

html_files = [
    'templates/index.html',
    'watch_defect_detection/templates/index.html',
    'patchcore_defect_detection/templates/index.html'
]

for file in html_files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        content = content.replace("filename='css/style.css')", "filename='css/style.css', v=2")
        
        # Actually Flask url_for doesn't accept random kwargs without generating ?v=2.
        # Wait, url_for('static', filename='css/style.css', v=2) generates static/css/style.css?v=2
        # Let's do it safely.
        content = content.replace("css/style.css')", "css/style.css', v=2)")
        
        # If it was already replaced, don't do it again.
        # Easier to just replace the whole tag
        import re
        content = re.sub(r"filename='css/style\.css'(, v=\d+)?\)", "filename='css/style.css', v=3)", content)
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

print("Added cache buster to HTML files.")
