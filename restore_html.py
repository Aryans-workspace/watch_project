files = [
    ('templates/index.html', 'calib'),
    ('watch_defect_detection/templates/index.html', 'collect'),
    ('patchcore_defect_detection/templates/index.html', 'patchcore')
]
for path, prefix in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace(f'css/{prefix}_style.css', 'css/style.css')
    content = content.replace(f'js/{prefix}_app.js', 'js/app.js')
    # Also I need to remove the navbar properly, since my previous regex might have left a trailing div or missed it.
    import re
    content = re.sub(r'<div style="background: #[12][12][12];[^>]+>.*?</div>', '', content, flags=re.DOTALL)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
