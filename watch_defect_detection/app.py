"""
ABB Cobot & Mech-Mind Watch Inspection Web Application
Coordinates Mech-Eye camera feed, TCP socket communication with ABB Cobot,
and PatchCore dataset organization.
"""

import os
import time
import socket
import atexit
from flask import Flask, render_template, Response, jsonify, request, send_from_directory
from camera_manager import CameraManager
from dataset_manager import DatasetManager
from robot_server import RobotServer

app = Flask(__name__)

# Initialize components
dataset_mgr = DatasetManager()
camera_mgr = CameraManager()


def on_slot_trigger(slot_num, job_info):
    """Callback executed when ABB Cobot signals 'at_pos' at a given slot."""
    frame = camera_mgr.capture_pristine_frame()
    if frame is None:
        return {"success": False, "error": "No camera frame available"}

    category = job_info.get("category", "train_good") if job_info else "train_good"
    watch_id = job_info.get("watch_id", "Watch_01") if job_info else "Watch_01"

    save_info = dataset_mgr.save_slot_image(
        image=frame,
        slot_num=slot_num,
        watch_id=watch_id,
        category_key=category
    )
    return save_info


# Initialize TCP Socket Server for ABB Cobot (Port 12343)
robot_server = RobotServer(
    host="0.0.0.0",
    port=12343,
    on_slot_trigger_callback=on_slot_trigger
)

# Clean shutdown handlers
def cleanup():
    print("[INFO] Cleaning up Cobot server and Camera connection...")
    robot_server.stop_server()
    camera_mgr.disconnect()

atexit.register(cleanup)


def get_host_ips():
    """Returns local network IPs to display for the user's RAPID configuration."""
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
    
    # Priority: LAN/Wi-Fi IPs first (what the robot connects to), then link-local
    ips = lan_ips + cam_ips
    if not ips:
        ips = ["127.0.0.1"]
    return ips


def generate_video_stream():
    """Generator yielding MJPEG frame stream from camera."""
    while True:
        jpeg_bytes = camera_mgr.get_jpeg_frame()
        if jpeg_bytes is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n')
        time.sleep(0.033)


# =========================================================================
# Web Routes
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
    return jsonify({
        "camera": camera_mgr.get_status(),
        "robot": robot_server.get_status(),
        "datasets": dataset_mgr.get_dataset_stats(),
        "active_folder": dataset_mgr.active_folder,
        "folders": dataset_mgr.list_folders(),
        "host_ips": get_host_ips()
    })


@app.route('/api/folders', methods=['GET'])
def list_folders():
    return jsonify({
        "folders": dataset_mgr.list_folders(),
        "active_folder": dataset_mgr.active_folder
    })


@app.route('/api/folder/create', methods=['POST'])
def create_folder():
    data = request.get_json() or {}
    folder_name = data.get("folder_name", "").strip()
    if not folder_name:
        return jsonify({"success": False, "error": "Folder name is required"}), 400
    res = dataset_mgr.create_folder(folder_name)
    return jsonify(res)


@app.route('/api/folder/select', methods=['POST'])
def select_folder():
    data = request.get_json() or {}
    folder_name = data.get("folder_name", "").strip()
    if not folder_name:
        return jsonify({"success": False, "error": "Folder name is required"}), 400
    res = dataset_mgr.set_active_folder(folder_name)
    return jsonify(res)


@app.route('/api/job/start', methods=['POST'])
def start_job():
    data = request.get_json() or {}
    target = data.get("target", "all")  # "all" or 1..8
    category = data.get("category", "train_good")
    watch_id = data.get("watch_id", "Watch")
    simulate = data.get("simulate", False)
    continuous = bool(data.get("continuous", False))
    end_time_raw = data.get("end_time")

    # If folder specified in job, switch to it
    job_folder = data.get("folder")
    if job_folder:
        dataset_mgr.set_active_folder(job_folder)

    end_timestamp = None
    if end_time_raw:
        if isinstance(end_time_raw, (int, float)):
            end_timestamp = float(end_time_raw)
        elif isinstance(end_time_raw, str):
            try:
                import datetime
                dt = datetime.datetime.fromisoformat(end_time_raw)
                end_timestamp = dt.timestamp()
            except Exception:
                try:
                    end_timestamp = float(end_time_raw)
                except Exception:
                    pass

    if simulate:
        result = robot_server.start_simulation_run(
            target=target,
            category=category,
            watch_id=watch_id,
            continuous=continuous,
            end_time=end_timestamp
        )
    else:
        result = robot_server.queue_job(
            target=target,
            category=category,
            watch_id=watch_id,
            continuous=continuous,
            end_time=end_timestamp
        )

    return jsonify(result)


@app.route('/api/job/cancel', methods=['POST'])
def cancel_job():
    result = robot_server.cancel_job()
    return jsonify(result)


@app.route('/api/capture/instant', methods=['POST'])
def instant_capture():
    """Immediately captures pristine frame from camera and saves to specified slot and category."""
    data = request.get_json() or {}
    slot_num = int(data.get("slot_num", 1))
    category = data.get("category", "train_good")
    watch_id = data.get("watch_id", "Watch")
    folder = data.get("folder")
    if folder:
        dataset_mgr.set_active_folder(folder)

    frame = camera_mgr.capture_pristine_frame()
    if frame is None:
        return jsonify({"success": False, "error": "No camera frame available"}), 400

    save_info = dataset_mgr.save_slot_image(
        image=frame,
        slot_num=slot_num,
        watch_id=watch_id,
        category_key=category
    )
    return jsonify(save_info)


@app.route('/api/image/delete', methods=['POST', 'DELETE'])
def delete_image():
    data = request.get_json() or {}
    rel_path = data.get('relative_path') or request.args.get('relative_path')
    if not rel_path:
        return jsonify({"success": False, "error": "Missing relative_path"}), 400
    res = dataset_mgr.delete_image(rel_path)
    return jsonify(res)


@app.route('/api/crop', methods=['GET'])
def get_crop():
    return jsonify(camera_mgr.get_crop_state())


@app.route('/api/crop', methods=['POST'])
def update_crop():
    data = request.get_json() or {}
    updated = camera_mgr.update_crop_settings(**data)
    return jsonify({"success": True, "crop": updated})


@app.route('/api/captures/recent', methods=['GET'])
def get_recent_captures():
    limit = int(request.args.get("limit", 30))
    folder = request.args.get("folder")
    recent = dataset_mgr.list_recent_images(limit=limit, folder_name=folder)
    return jsonify(recent)


@app.route('/api/image/full/<path:filepath>')
def serve_full_image(filepath):
    norm_path = os.path.normpath(filepath).lstrip('\\/')
    if ".." in norm_path:
        return "Invalid path", 400

    # 1. Try relative to datasets root (e.g. watches/train/good/file.png)
    direct_path = os.path.join(dataset_mgr.root_dir, norm_path)
    if os.path.isfile(direct_path):
        return send_from_directory(os.path.dirname(direct_path), os.path.basename(direct_path))

    # 2. Try relative to active base_dir (e.g. train/good/file.png)
    active_path = os.path.join(dataset_mgr.base_dir, norm_path)
    if os.path.isfile(active_path):
        return send_from_directory(os.path.dirname(active_path), os.path.basename(active_path))

    return "Image not found", 404


@app.route('/api/image/thumb/<path:filepath>')
def serve_thumb_image(filepath):
    norm_path = os.path.normpath(filepath).lstrip('\\/')
    if ".." in norm_path:
        return "Invalid path", 400

    # 1. Try relative to datasets root (e.g. watches/train/good/file.png -> watches/train/good/.thumbs/file.png)
    direct_path = os.path.join(dataset_mgr.root_dir, norm_path)
    dir_name = os.path.dirname(direct_path)
    file_name = os.path.basename(direct_path)
    thumb_path = os.path.join(dir_name, ".thumbs", file_name)
    if os.path.isfile(thumb_path):
        return send_from_directory(os.path.join(dir_name, ".thumbs"), file_name)
    if os.path.isfile(direct_path):
        return send_from_directory(dir_name, file_name)

    # 2. Try relative to active base_dir (e.g. train/good/file.png -> active/train/good/.thumbs/file.png)
    active_path = os.path.join(dataset_mgr.base_dir, norm_path)
    active_dir = os.path.dirname(active_path)
    active_name = os.path.basename(active_path)
    active_thumb = os.path.join(active_dir, ".thumbs", active_name)
    if os.path.isfile(active_thumb):
        return send_from_directory(os.path.join(active_dir, ".thumbs"), active_name)
    if os.path.isfile(active_path):
        return send_from_directory(active_dir, active_name)

    return "Thumbnail not found", 404


@app.route('/api/camera/reconnect', methods=['POST'])
def reconnect_camera():
    camera_mgr.disconnect()
    time.sleep(0.5)
    success = camera_mgr.connect()
    return jsonify({"success": success, "camera": camera_mgr.get_status()})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5001))
    print(f"=================================================================")
    print(f" ABB Cobot + Mech-Mind Watch Inspection Web Application")
    print(f" Web Server URL:    http://localhost:{port}")
    print(f" Cobot Socket Port: 12343 (Listening for RAPID script)")
    print(f" Local IPs:         {', '.join(get_host_ips())}")
    print(f"=================================================================")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
