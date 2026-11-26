"""
Mech-Eye Camera Calibration Web Application
Flask backend server providing live MJPEG streaming, camera controls,
precision optical alignment crosshairs, and capture management.
"""

import os
import time
import atexit
from flask import Flask, render_template, Response, jsonify, request, send_from_directory
from camera_manager import CameraManager

app = Flask(__name__)

# Initialize camera manager
camera_mgr = CameraManager(dataset_folder="datasets")

# Ensure camera disconnects when server exits
atexit.register(camera_mgr.disconnect)


def generate_frames():
    """Generator yielding MJPEG frame stream."""
    last_yield_time = 0
    while True:
        frame_bytes = camera_mgr.get_jpeg_frame()
        if frame_bytes is not None:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        # Cap frame rate to max 30 FPS to reduce CPU/bandwidth overhead
        time.sleep(0.033)


@app.route('/')
def index():
    """Render main web calibration UI."""
    return render_template('index.html')


@app.route('/video_feed')
def video_feed():
    """MJPEG video streaming route."""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/api/status', methods=['GET'])
def get_status():
    """Return live camera status, calibration state, and FPS."""
    return jsonify(camera_mgr.get_status())


@app.route('/api/calibration', methods=['POST'])
def update_calibration():
    """Update calibration parameters in real-time."""
    data = request.get_json() or {}
    new_state = camera_mgr.update_calibration(**data)
    return jsonify({"success": True, "calibration": new_state})


@app.route('/api/calibration/reset', methods=['POST'])
def reset_calibration():
    """Reset calibration offsets to exact geometric center."""
    new_state = camera_mgr.reset_center()
    return jsonify({"success": True, "calibration": new_state})


@app.route('/api/capture', methods=['POST'])
def capture():
    """Capture snapshot frame and save to datasets folder."""
    data = request.get_json() or {}
    with_crosshair = data.get("with_crosshair", False)
    result = camera_mgr.capture_snapshot(with_crosshair=with_crosshair)
    return jsonify(result)


@app.route('/api/captures', methods=['GET'])
def list_captures():
    """List all saved captures in the datasets folder."""
    dataset_dir = camera_mgr.dataset_folder
    if not os.path.exists(dataset_dir):
        return jsonify([])

    captures = []
    for f in os.listdir(dataset_dir):
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tiff')):
            full_path = os.path.join(dataset_dir, f)
            stat = os.stat(full_path)
            captures.append({
                "filename": f,
                "size_bytes": stat.st_size,
                "modified_time": stat.st_mtime,
                "url": f"/captures/{f}",
                "thumb_url": f"/captures/thumb/{f}" if os.path.exists(os.path.join(dataset_dir, ".thumbs", f)) else f"/captures/{f}"
            })

    # Sort descending by creation/modification time
    captures.sort(key=lambda x: x["modified_time"], reverse=True)
    return jsonify(captures)


@app.route('/captures/<path:filename>')
def get_capture_image(filename):
    """Serve full-resolution captured image."""
    return send_from_directory(camera_mgr.dataset_folder, filename)


@app.route('/captures/thumb/<path:filename>')
def get_thumbnail(filename):
    """Serve thumbnail of captured image."""
    thumb_dir = os.path.join(camera_mgr.dataset_folder, ".thumbs")
    return send_from_directory(thumb_dir, filename)


@app.route('/api/camera/reconnect', methods=['POST'])
def reconnect_camera():
    """Disconnect and attempt reconnection to the Mech-Eye camera."""
    camera_mgr.disconnect()
    time.sleep(0.5)
    success = camera_mgr.connect()
    return jsonify({"success": success, "status": camera_mgr.get_status()})


@app.route('/api/camera/disconnect', methods=['POST'])
def disconnect_camera():
    """Disconnect camera on demand."""
    camera_mgr.disconnect()
    return jsonify({"success": True, "status": camera_mgr.get_status()})


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting Mech-Eye Calibration Web Server on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
