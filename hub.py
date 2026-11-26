import os
import sys
import time
import socket
import subprocess
import atexit
import threading
from flask import Flask, render_template_string, jsonify, request

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ACTIVE_PROCESS = None
ACTIVE_MODULE = None
MODULE_LOCK = threading.Lock()

def kill_port_5003():
    try:
        output = subprocess.check_output('netstat -ano | findstr :5003', shell=True).decode()
        for line in output.strip().split('\n'):
            if 'LISTENING' in line:
                pid = line.strip().split()[-1]
                if pid and pid != '0':
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
    time.sleep(1) # wait for port/camera to be fully released

def start_module(module_name):
    global ACTIVE_PROCESS, ACTIVE_MODULE
    
    with MODULE_LOCK:
        if ACTIVE_MODULE == module_name and is_port_5003_open():
            return True
            
        stop_active_module()
        
        env = os.environ.copy()
        env["PORT"] = "5003" # Target port for module iframe
        
        python_exe = r"C:\Users\MECH MIND\PycharmProjects\sure2coat_v1\.venv1\Scripts\python.exe"
        if not os.path.exists(python_exe):
            python_exe = sys.executable or "python"
            
        if module_name == 'calibration':
            ACTIVE_PROCESS = subprocess.Popen([python_exe, "app.py"], cwd=BASE_DIR, env=env)
        elif module_name == 'collection':
            cwd = os.path.join(BASE_DIR, "watch_defect_detection")
            ACTIVE_PROCESS = subprocess.Popen([python_exe, "app.py"], cwd=cwd, env=env)
        elif module_name == 'patchcore':
            cwd = os.path.join(BASE_DIR, "patchcore_defect_detection")
            ACTIVE_PROCESS = subprocess.Popen([python_exe, "app.py"], cwd=cwd, env=env)
            
        ACTIVE_MODULE = module_name
        
        # Wait up to 35 seconds for port 5003 to be open
        for _ in range(35):
            if is_port_5003_open():
                return True
            time.sleep(1)
        
        return False

def is_port_5003_open():
    try:
        with socket.create_connection(('127.0.0.1', 5003), timeout=0.5):
            return True
    except (ConnectionRefusedError, socket.timeout, OSError):
        return False

atexit.register(stop_active_module)

# Start default module asynchronously so Port 5000 is open INSTANTLY
threading.Thread(target=start_module, args=('calibration',), daemon=True).start()

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
    <meta charset="UTF-8">
    <title>Unified Defect Detection Studio</title>
    <style>
        body { margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column; background: radial-gradient(circle at 50% -20%, #1f242d 0%, #090b0e 100%); background-attachment: fixed; font-family: "Roboto", sans-serif; color: #fff; overflow: hidden; }
        .hub-nav { background: rgba(23, 26, 31, 1); border-bottom: 2px solid #dfc16d; padding: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center; gap: 15px; }
        .hub-nav button { background: transparent; color: #fff; border: 1px solid #333; padding: 8px 18px; border-radius: 4px; font-weight: bold; cursor: pointer; transition: 0.2s; font-size: 15px; }
        .hub-nav button:hover { border-color: #dfc16d; color: #dfc16d; }
        .hub-nav button.active { background: #dfc16d; color: #000; border-color: #dfc16d; }
        .hub-iframe { flex-grow: 1; border: none; width: 100%; height: 100%; }
        
        #loading { display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(10,13,20,0.92); z-index: 2000; justify-content: center; align-items: center; flex-direction: column; }
        .spinner { border: 4px solid #333; border-top: 4px solid #dfc16d; border-radius: 50%; width: 44px; height: 44px; animation: spin 1s linear infinite; margin-bottom: 15px; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .badge { background: rgba(223, 193, 109, 0.15); border: 1px solid #dfc16d; color: #dfc16d; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="hub-nav">
        <button id="btn-calibration" onclick="switchModule('calibration')">1. Calibration</button>
        <button id="btn-collection" onclick="switchModule('collection')">2. Data Collection</button>
        <button id="btn-patchcore" onclick="switchModule('patchcore')">3. AI PatchCore</button>
        <span class="badge" id="port-badge">PORT: 5003</span>
    </div>
    
    <div id="loading">
        <div class="spinner"></div>
        <h2 id="loading-text" style="color: #dfc16d; margin: 0 0 10px 0;">Booting Module...</h2>
        <p style="color:#aaa; margin:0;" id="loading-sub">(Connecting to Vision Camera & AI Engine)</p>
    </div>

    <iframe id="module-frame" class="hub-iframe" src="about:blank"></iframe>

    <script>
        var currentActiveModule = "{{ default_module }}";

        function getModuleUrl() {
            var host = window.location.hostname || 'localhost';
            var protocol = window.location.protocol || 'http:';
            return protocol + '//' + host + ':5003/?t=' + new Date().getTime();
        }

        function pollUntilReady(callback, maxAttempts) {
            maxAttempts = maxAttempts || 40;
            var attempts = 0;
            function check() {
                attempts++;
                fetch('/api/module-ready')
                    .then(function(res) { return res.json(); })
                    .then(function(data) {
                        if (data.ready) {
                            callback(true);
                        } else if (attempts < maxAttempts) {
                            setTimeout(check, 1000);
                        } else {
                            callback(false);
                        }
                    })
                    .catch(function() {
                        if (attempts < maxAttempts) {
                            setTimeout(check, 1000);
                        } else {
                            callback(false);
                        }
                    });
            }
            check();
        }

        function loadFrame() {
            var frame = document.getElementById('module-frame');
            frame.src = getModuleUrl();
            document.getElementById('loading').style.display = 'none';
        }

        function updateActiveButton(mod) {
            currentActiveModule = mod;
            document.querySelectorAll('.hub-nav button').forEach(function(b) { b.classList.remove('active'); });
            var btn = document.getElementById('btn-' + mod);
            if (btn) btn.classList.add('active');
        }

        function switchModule(moduleName) {
            updateActiveButton(moduleName);
            
            document.getElementById('loading').style.display = 'flex';
            document.getElementById('loading-text').innerText = "Booting " + moduleName + " module...";
            document.getElementById('loading-sub').innerText = "(Initializing hardware and weights)";
            
            fetch('/api/switch?module=' + moduleName)
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    pollUntilReady(function(ready) {
                        loadFrame();
                    });
                })
                .catch(function(err) {
                    console.error("Failed to switch module:", err);
                    loadFrame();
                });
        }

        window.onload = function() {
            updateActiveButton(currentActiveModule);
            document.getElementById('loading').style.display = 'flex';
            document.getElementById('loading-text').innerText = "Loading " + currentActiveModule + "...";
            pollUntilReady(function(ready) {
                loadFrame();
            });
        };
    </script>
</body>
</html>
"""

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/')
def index():
    target_module = request.args.get('module')
    if target_module in ['calibration', 'collection', 'patchcore']:
        if ACTIVE_MODULE != target_module:
            threading.Thread(target=start_module, args=(target_module,), daemon=True).start()
        return render_template_string(HTML_TEMPLATE, default_module=target_module)
    return render_template_string(HTML_TEMPLATE, default_module=ACTIVE_MODULE or 'calibration')

@app.route('/api/health')
def health():
    return jsonify({
        "status": "online",
        "active_module": ACTIVE_MODULE,
        "module_ready": is_port_5003_open(),
        "hub_port": 5000,
        "module_port": 5003
    })

@app.route('/api/module-ready')
def module_ready():
    return jsonify({
        "ready": is_port_5003_open(),
        "active_module": ACTIVE_MODULE
    })

@app.route('/api/switch')
def switch():
    module = request.args.get('module')
    if module in ['calibration', 'collection', 'patchcore']:
        success = start_module(module)
        return jsonify({"success": success, "module": module})
    return jsonify({"success": False})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
