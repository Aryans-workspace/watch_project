import re

with open('patchcore_defect_detection/templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'/static/js/app\.js(\?v=\d+)?', '/static/js/app.js?v=2', content)

with open('patchcore_defect_detection/templates/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added cache buster to JS")
