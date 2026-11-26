import re

def extract(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    blocks = re.findall(r'(@app\.route.*?\ndef .*?:\n(?:(?:    .*?\n)|\n)+)', content, re.MULTILINE | re.DOTALL)
    keep = []
    for b in blocks:
        if 'def index' in b or 'def video_feed' in b or 'def get_status' in b or 'def camera_reconnect' in b or 'def camera_disconnect' in b:
            continue
        keep.append(b)
    return "\n".join(keep)

routes = []
routes.append(extract('app.py'))
routes.append(extract('watch_defect_detection/app.py'))
routes.append(extract('patchcore_defect_detection/app.py'))

with open('unified_app_routes.py', 'w', encoding='utf-8') as f:
    f.write('\n'.join(routes))
