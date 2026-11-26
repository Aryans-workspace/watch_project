"""
ABB Cobot & Mech-Mind PatchCore Defect Detection Studio
Flask Web Server on Port 5002 with TCP Socket Communication on Port 12343.
Provides model training on watch datasets, validation results visualization,
and real-time automated cobot slot inspection.
"""

import os
import time
import socket
import atexit
from flask import Flask, render_template, Response, jsonify, request, send_from_directory

from camera_manager import CameraManager
from patchcore_engine import PatchcoreEngine
from robot_server import RobotInspectionServer

app = Flask(__name__)

# Initialize Core Engines
camera_mgr = CameraManager()
patchcore_engine = PatchcoreEngine()


def on_slot_inspect(slot_num, job_info):
    """Callback triggered when Cobot signals 'at_pos' at Slot N."""
    frame = camera_mgr.capture_pristine_frame()
    if frame is None:
        return {"success": False, "error": "No camera frame available"}

    # Run real-time PatchCore anomaly detection
    result = patchcore_engine.predict_image(frame, slot_num=slot_num)
    return result


# Initialize Cobot TCP Socket Server (Port 12343)
robot_server = RobotInspectionServer(
    host="0.0.0.0",
    port=12343,
    on_slot_inspect_callback=on_slot_inspect
)


def cleanup():
    print("[INFO] Cleaning up Cobot server and Camera connection...")
    robot_server.stop_server()
    camera_mgr.disconnect()

atexit.register(cleanup)


def get_host_ips():
    """Returns local network IPs to configure RAPID CAM_SERVER_IP."""
    lan_ips = []
    cam_ips = []
    try:
        hostname = socket.gethostname()
        for item in socket.getaddrinfo(hostname, None):
            ip = item[4][0]
            if ":" not in ip and not ip.startswith("127."):
                if ip.startswith("169.254."):
                    if ip not in cam_ips:
                        cam_ips.append(ip)
                else:
                    if ip not in lan_ips:
                        lan_ips.append(ip)
    except Exception:
        pass
    ips = lan_ips + cam_ips
    return ips if ips else ["127.0.0.1"]


def generate_video_stream():
    """MJPEG stream generator from Mech-Eye camera."""
    while True:
        jpeg_bytes = camera_mgr.get_jpeg_frame()
        if jpeg_bytes is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n')
        time.sleep(0.033)


# =========================================================================
# Web Application Routes
# =========================================================================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/video_feed')
def video_feed():
    return Response(generate_video_stream(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/status', methods=['GET'])
def get_status():
    active_meta = patchcore_engine.active_metadata
    return jsonify({
        "camera": camera_mgr.get_status(),
        "robot": robot_server.get_status(),
        "training": patchcore_engine.training_state,
        "active_model_id": patchcore_engine.active_model_id,
        "active_model": active_meta,
        "host_ips": get_host_ips()
    })


# -------------------------------------------------------------------------
# Datasets & Training Routes
# -------------------------------------------------------------------------

@app.route('/api/datasets', methods=['GET'])
def list_datasets():
    datasets = patchcore_engine.list_datasets()
    return jsonify({"datasets": datasets})


@app.route('/api/dataset/<dataset_name>/sample_image', methods=['GET'])
def get_dataset_sample_image(dataset_name):
    res = patchcore_engine.get_dataset_sample_image(dataset_name)
    if not res.get("success"):
        return jsonify(res), 404
    return jsonify(res)


@app.route('/api/dataset_image/<dataset_name>/<path:filepath>', methods=['GET'])
def serve_dataset_image(dataset_name, filepath):
    dataset_path = patchcore_engine.get_dataset_path(dataset_name)
    target_file = os.path.join(dataset_path, filepath)
    if not os.path.isfile(target_file):
        return "Image not found", 404
    dir_name = os.path.dirname(target_file)
    file_name = os.path.basename(target_file)
    return send_from_directory(dir_name, file_name)


@app.route('/api/dataset/<dataset_name>/focus_mask', methods=['GET'])
def get_dataset_focus_mask(dataset_name):
    res = patchcore_engine.get_dataset_focus_mask(dataset_name)
    return jsonify(res)


@app.route('/api/dataset/<dataset_name>/focus_mask', methods=['POST'])
def save_dataset_focus_mask(dataset_name):
    data = request.get_json() or {}
    res = patchcore_engine.save_dataset_focus_mask(dataset_name, data)
    status_code = 200 if res.get("success") else 400
    return jsonify(res), status_code


@app.route('/api/dataset/<dataset_name>/focus_mask_preview', methods=['GET'])
def serve_focus_mask_preview(dataset_name):
    dataset_path = patchcore_engine.get_dataset_path(dataset_name)
    mask_file = os.path.join(dataset_path, "focus_mask.png")
    if not os.path.isfile(mask_file):
        return "Focus mask preview not found", 404
    return send_from_directory(dataset_path, "focus_mask.png")


@app.route('/api/train/start', methods=['POST'])
def start_training():
    data = request.get_json() or {}
    dataset_name = data.get("dataset_name")
    backbone = data.get("backbone", "resnet18")
    coreset_ratio = float(data.get("coreset_ratio", 0.01))
    coreset_ratio = min(0.10, max(0.005, coreset_ratio))

    focus_mode = data.get("focus_mode", "dial")
    resolution = data.get("resolution", "standard")

    if not dataset_name:
        return jsonify({"success": False, "error": "dataset_name is required"}), 400

    res = patchcore_engine.start_training(
        dataset_name=dataset_name,
        backbone=backbone,
        coreset_ratio=coreset_ratio,
        focus_mode=focus_mode,
        resolution=resolution
    )
    return jsonify(res)


@app.route('/api/train/status', methods=['GET'])
def train_status():
    return jsonify(patchcore_engine.training_state)


# -------------------------------------------------------------------------
# Model Management & Validation Routes
# -------------------------------------------------------------------------

@app.route('/api/models', methods=['GET'])
def list_models():
    models = patchcore_engine.list_models()
    return jsonify({"models": models, "active_model_id": patchcore_engine.active_model_id})


@app.route('/api/model/select', methods=['POST'])
def select_model():
    data = request.get_json() or {}
    model_id = data.get("model_id")
    if not model_id:
        return jsonify({"success": False, "error": "model_id is required"}), 400
    res = patchcore_engine.load_model(model_id)
    return jsonify(res)


@app.route('/api/validation/results', methods=['GET'])
def get_validation_results():
    model_id = request.args.get("model_id")
    res = patchcore_engine.get_validation_results(model_id=model_id)
    return jsonify(res)


@app.route('/api/validation/run', methods=['POST'])
def run_validation():
    data = request.get_json() or {}
    model_id = data.get("model_id")
    res = patchcore_engine.run_validation(model_id=model_id)
    return jsonify(res)


@app.route('/api/validation/set_threshold', methods=['POST'])
def set_threshold():
    data = request.get_json() or {}
    threshold = data.get("threshold")
    model_id = data.get("model_id")
    if threshold is None:
        return jsonify({"success": False, "error": "threshold is required"}), 400
    res = patchcore_engine.set_threshold(threshold=threshold, model_id=model_id)
    return jsonify(res)


@app.route('/api/validation/set_dust_sensitivity', methods=['POST'])
def set_dust_sensitivity():
    data = request.get_json() or {}
    sensitivity = data.get("sensitivity", "high")
    perimeter_ratio = data.get("perimeter_ratio", 0.925)
    model_id = data.get("model_id")
    res = patchcore_engine.set_dust_sensitivity(
        sensitivity=sensitivity,
        perimeter_ratio=perimeter_ratio,
        model_id=model_id
    )
    return jsonify(res)


# -------------------------------------------------------------------------
# Cobot & Real-Time Inspection Routes
# -------------------------------------------------------------------------

@app.route('/api/inspection/start', methods=['POST'])
def start_inspection():
    data = request.get_json() or {}
    target = data.get("target", "all")  # "all" or 1..8
    simulate = bool(data.get("simulate", False))
    continuous = bool(data.get("continuous", False))

    if patchcore_engine.active_model is None:
        return jsonify({
            "success": False,
            "error": "No active PatchCore model loaded. Please train or select a model first."
        }), 400

    if simulate:
        res = robot_server.start_simulation_run(target=target, continuous=continuous)
    else:
        res = robot_server.queue_inspection_job(target=target, continuous=continuous)

    return jsonify(res)


@app.route('/api/inspection/cancel', methods=['POST'])
def cancel_inspection():
    res = robot_server.cancel_job()
    return jsonify(res)


@app.route('/api/inspect/current_frame', methods=['POST'])
def inspect_current_frame():
    """Performs immediate PatchCore anomaly detection on the current camera view (optionally assigned to slot_num)."""
    data = request.get_json() or {}
    slot_num = int(data.get("slot_num", 0))
    frame = camera_mgr.capture_pristine_frame()
    if frame is None:
        return jsonify({"success": False, "error": "No camera frame available"}), 400

    result = patchcore_engine.predict_image(frame, slot_num=slot_num)

    # If assigned to an individual slot (> 0), sync into robot_server results so UI immediately updates
    if result.get("success") and slot_num > 0:
        with robot_server.job_lock:
            robot_server.active_job["results"] = [r for r in robot_server.active_job["results"] if r.get("slot_num") != slot_num]
            robot_server.active_job["results"].append(result)
            robot_server.active_job["current_slot"] = slot_num
            robot_server.active_job["passed_count"] = sum(1 for r in robot_server.active_job["results"] if r.get("verdict") == "PASS")
            robot_server.active_job["defect_count"] = sum(1 for r in robot_server.active_job["results"] if r.get("verdict") == "DEFECT")

    return jsonify(result)


# -------------------------------------------------------------------------
# Image Serving Routes
# -------------------------------------------------------------------------

@app.route('/api/model_image/<model_id>/validation/<filename>')
def serve_validation_heatmap(model_id, filename):
    folder = os.path.join(patchcore_engine.models_dir, model_id, "validation")
    resp = send_from_directory(folder, filename)
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


@app.route('/api/model_image/<model_id>/validation_orig/<filename>')
def serve_validation_orig(model_id, filename):
    meta = None
    for m in patchcore_engine.list_models():
        if m.get("model_id") == model_id:
            meta = m
            break
    if not meta:
        return "Model not found", 404

    dataset_path = meta.get("dataset_path")
    for split in [os.path.join(dataset_path, "val", "good"), os.path.join(dataset_path, "val", "defect"), os.path.join(dataset_path, "train", "good")]:
        fp = os.path.join(split, filename)
        if os.path.isfile(fp):
            return send_from_directory(split, filename)
    return "Image not found", 404


@app.route('/api/camera/reconnect', methods=['POST'])
def reconnect_camera():
    camera_mgr.disconnect()
    time.sleep(0.5)
    success = camera_mgr.connect()
    return jsonify({"success": success, "camera": camera_mgr.get_status()})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    print(f"=================================================================")
    print(f" ABB Cobot + Mech-Mind PatchCore Defect Detection Studio")
    print(f" Web Server URL:    http://localhost:{port}")
    print(f" Cobot Socket Port: 12343 (Listening for RAPID inspection)")
    print(f" Local IPs:         {', '.join(get_host_ips())}")
    print(f" Active Model:      {patchcore_engine.active_model_id or 'None (Ready to Train)'}")
    print(f"=================================================================")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
