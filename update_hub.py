import re

with open('hub.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''def stop_active_module():
    global ACTIVE_PROCESS, ACTIVE_MODULE
    if ACTIVE_PROCESS is not None:
        try:
            ACTIVE_PROCESS.terminate()
            ACTIVE_PROCESS.wait(timeout=3)
        except subprocess.TimeoutExpired:
            ACTIVE_PROCESS.kill()
        except Exception:
            pass
        ACTIVE_PROCESS = None
    ACTIVE_MODULE = None
    time.sleep(1) # wait for port/camera to be fully released'''

replacement = '''def kill_port_5003():
    try:
        output = subprocess.check_output('netstat -ano | findstr :5003', shell=True).decode()
        for line in output.strip().split('\\n'):
            if 'LISTENING' in line:
                pid = line.strip().split()[-1]
                subprocess.run(['taskkill', '/F', '/PID', pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

def stop_active_module():
    global ACTIVE_PROCESS, ACTIVE_MODULE
    if ACTIVE_PROCESS is not None:
        try:
            ACTIVE_PROCESS.terminate()
            ACTIVE_PROCESS.wait(timeout=3)
        except subprocess.TimeoutExpired:
            ACTIVE_PROCESS.kill()
        except Exception:
            pass
        ACTIVE_PROCESS = None
    ACTIVE_MODULE = None
    kill_port_5003()
    time.sleep(1) # wait for port/camera to be fully released'''

content = content.replace(target, replacement)

# Also fix the browser cache issue by adding timestamp to iframe src
content = content.replace(
    '''document.getElementById('module-frame').src = "http://localhost:5003/";''',
    '''document.getElementById('module-frame').src = "http://localhost:5003/?t=" + new Date().getTime();'''
)

with open('hub.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated hub.py")
