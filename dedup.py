import re
with open('unified_app_routes.py', 'r', encoding='utf-8') as f:
    content = f.read()
blocks = content.split('\n\n\n')
seen_routes = set()
unique_blocks = []
for b in blocks:
    m = re.search(r'@app\.route\([^)]+\)', b)
    if m:
        route = m.group(0)
        if route in seen_routes:
            continue
        seen_routes.add(route)
        
        # also ignore /video_feed, /, /api/status, /api/camera/reconnect just in case
        if '/video_feed' in route or route == "@app.route('/')" or '/api/status' in route or '/api/camera/reconnect' in route or '/api/camera/disconnect' in route:
            continue
    unique_blocks.append(b)

with open('unified_app_routes.py', 'w', encoding='utf-8') as f:
    f.write('\n\n\n'.join(unique_blocks))
