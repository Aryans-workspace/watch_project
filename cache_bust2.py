import os
import re

html_files = [
    'templates/index.html',
    'watch_defect_detection/templates/index.html',
    'patchcore_defect_detection/templates/index.html'
]

for file in html_files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        content = re.sub(r'/static/css/style\.css(\?v=\d+)?', '/static/css/style.css?v=5', content)
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)

print("Added direct cache buster.")
