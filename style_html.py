import os

html_files = [
    'templates/index.html',
    'watch_defect_detection/templates/index.html',
    'patchcore_defect_detection/templates/index.html'
]

font_import = '''    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">\n'''

for file in html_files:
    if os.path.exists(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if 'fonts.googleapis.com' not in content:
            content = content.replace('</title>', '</title>\n' + font_import)
            
            with open(file, 'w', encoding='utf-8') as f:
                f.write(content)

print("Updated HTML files.")
