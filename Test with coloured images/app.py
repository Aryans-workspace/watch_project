"""
Phone Camera AI Defect Studio
3-Stage Workflow: Data Collection -> Model Training -> Defect Inspection (Coloured Images)
Runs on Port 5005 (HTTP) and Port 5443 (HTTPS for Mobile Camera)
"""

import os
import sys
import time
import json
import base64
import atexit
import threading
import cv2
import numpy as np
import torch
from flask import Flask, render_template, Response, jsonify, request, send_from_directory, send_file

from camera_orchestrator import PhoneCameraOrchestrator
from dataset_manager import DatasetManager
from training_engine import PatchcoreTrainingEngine

# Base Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASETS_DIR = os.path.join(BASE_DIR, "datasets")
MODELS_DIR = os.path.join(BASE_DIR, "models")
CERT_PATH = os.path.join(BASE_DIR, "cert.pem")
KEY_PATH = os.path.join(BASE_DIR, "key.pem")

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)

# Core Engines
camera_mgr = PhoneCameraOrchestrator(capture_dir=os.path.join(DATASETS_DIR, "captures"))
dataset_mgr = DatasetManager(root_dir=DATASETS_DIR)
training_engine = PatchcoreTrainingEngine(models_dir=MODELS_DIR)

atexit.register(camera_mgr.stop)


# ----------------------------------------------------
# Video Streaming & Web Views
# ----------------------------------------------------
def generate_frames():
    """Generator yielding MJPEG frame stream."""
    while True:
        frame_bytes = camera_mgr.get_jpeg_frame()
        if frame_bytes is not None:
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
        time.sleep(0.033)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/phone")
def phone_camera_view():
    return render_template("phone_camera.html")


@app.route("/video_feed")
def video_feed():
    return Response(generate_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


# ----------------------------------------------------
# Telemetry & Camera Controls API
# ----------------------------------------------------
@app.route("/api/status", methods=["GET"])
def get_status():
    status = camera_mgr.get_status()
    ips = camera_mgr.get_host_ips()
    primary_ip = ips[0] if ips else "127.0.0.1"
    status["host_ips"] = ips
    status["primary_ip"] = primary_ip
    status["http_url"] = f"http://{primary_ip}:5005/phone"
    status["https_url"] = f"https://{primary_ip}:5443/phone"
    status["active_model"] = training_engine.active_model_id
    status["active_dataset"] = dataset_mgr.active_folder
    status["is_model_ready"] = training_engine.is_model_ready
    return jsonify(status)


@app.route("/api/connect", methods=["POST"])
def connect_camera():
    data = request.get_json() or {}
    mode = data.get("mode", camera_mgr.MODE_SIMULATED)
    diag = camera_mgr.connect_mode(mode, params=data)
    return jsonify(diag)


@app.route("/api/diagnose", methods=["POST"])
def diagnose():
    data = request.get_json() or {}
    mode = data.get("mode", camera_mgr.mode)
    diag = camera_mgr.diagnose_connection(mode, params=data)
    return jsonify(diag)


@app.route("/api/torch", methods=["POST"])
def toggle_torch():
    data = request.get_json() or {}
    result = camera_mgr.toggle_torch(data.get("state"))
    return jsonify(result)


@app.route("/api/overlays", methods=["POST"])
def update_overlays():
    data = request.get_json() or {}
    status = camera_mgr.update_overlays(
        crosshair=data.get("crosshair"),
        grid=data.get("grid"),
        dial_roi=data.get("dial_roi"),
        dial_radius=data.get("dial_radius"),
        offset_x=data.get("offset_x"),
        offset_y=data.get("offset_y"),
        crop_enabled=data.get("crop_enabled"),
        crop_live_stream=data.get("crop_live_stream"),
        show_crop_roi=data.get("show_crop_roi"),
        crop_zoom=data.get("crop_zoom")
    )
    return jsonify({"success": True, "status": status})


@app.route("/api/camera/crop", methods=["GET", "POST"])
def camera_crop_settings():
    if request.method == "POST":
        data = request.get_json() or {}
        res = camera_mgr.update_crop_settings(**data)
        return jsonify({"success": True, "crop": res})
    return jsonify(camera_mgr.get_crop_state())


# ----------------------------------------------------
# Mobile Phone Web Companion Endpoints
# ----------------------------------------------------
@app.route("/api/phone/register", methods=["POST"])
def phone_register():
    data = request.get_json() or {}
    camera_mgr.register_web_client(data)
    return jsonify({"success": True})


@app.route("/api/phone/poll_trigger", methods=["GET"])
def phone_poll_trigger():
    trig = camera_mgr.poll_web_trigger()
    trig["active_dataset"] = dataset_mgr.active_folder
    return jsonify(trig)


@app.route("/api/phone/upload_snapshot", methods=["POST"])
def phone_upload_snapshot():
    img_bytes = None
    if "image" in request.files:
        img_bytes = request.files["image"].read()
    elif request.data:
        img_bytes = request.data

    if not img_bytes:
        return jsonify({"success": False, "error": "No image data received"}), 400

    success, w, h = camera_mgr.receive_web_snapshot(img_bytes)
    if not success:
        return jsonify({"success": False, "error": "Failed to decode image"}), 400

    save_to_dataset = request.form.get("save_to_dataset", "").lower() in ("true", "1", "yes") or \
                      request.args.get("save_to_dataset", "").lower() in ("true", "1", "yes")
    category = request.form.get("category") or request.args.get("category") or "train_good"
    folder = request.form.get("folder") or request.args.get("folder") or dataset_mgr.active_folder

    saved_filename = None
    counts = None

    if save_to_dataset:
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            if camera_mgr.crop_enabled:
                img = camera_mgr.crop_to_dial_roi(img)
            h, w = img.shape[:2]
            save_res = dataset_mgr.save_image(img, category_key=category, folder_name=folder)
            saved_filename = save_res.get("filename")
            counts = dataset_mgr.get_dataset_counts(folder)
            print(f"[PHONE] Saved CROPPED {w}x{h} snapshot to dataset '{folder}' [{category}]: {saved_filename}")

    return jsonify({
        "success": True,
        "width": w,
        "height": h,
        "resolution": f"{w} x {h}",
        "saved_to_dataset": save_to_dataset,
        "filename": saved_filename,
        "category": category,
        "folder": folder,
        "counts": counts
    })


@app.route("/api/phone/stream_frame", methods=["POST"])
def phone_stream_frame():
    if request.data:
        camera_mgr.push_web_stream_frame(request.data)
        return jsonify({"success": True})
    return jsonify({"success": False}), 400


# ----------------------------------------------------
# STAGE 1: Dataset Management & Data Collection API
# ----------------------------------------------------
@app.route("/api/datasets", methods=["GET"])
def list_datasets():
    datasets = dataset_mgr.list_datasets()
    return jsonify({
        "datasets": datasets,
        "active_folder": dataset_mgr.active_folder,
        "counts": dataset_mgr.get_dataset_counts()
    })


@app.route("/api/datasets/create", methods=["POST"])
def create_dataset():
    data = request.get_json() or {}
    name = data.get("name", "watches")
    res = dataset_mgr.create_dataset(name)
    return jsonify(res)


@app.route("/api/datasets/select", methods=["POST"])
def select_dataset():
    data = request.get_json() or {}
    name = data.get("name", "watches")
    res = dataset_mgr.set_active_dataset(name)
    return jsonify(res)


@app.route("/api/datasets/images", methods=["GET"])
def list_dataset_images():
    folder = request.args.get("folder", dataset_mgr.active_folder)
    cat = request.args.get("category", None)
    images = dataset_mgr.list_images(folder_name=folder, category_key=cat)
    return jsonify(images)


@app.route("/api/datasets/capture", methods=["POST"])
def capture_to_dataset():
    """Trigger phone capture and save into active dataset folder & category."""
    data = request.get_json() or {}
    category = data.get("category", "train_good")
    folder = data.get("folder", dataset_mgr.active_folder)

    # 1. Trigger phone camera snapshot
    cap_res = camera_mgr.trigger_capture(autofocus=True)
    if not cap_res["success"]:
        return jsonify(cap_res), 400

    # 2. Save captured image into dataset category
    img = cv2.imread(cap_res["file_path"])
    save_res = dataset_mgr.save_image(img, category_key=category, folder_name=folder)

    # Update counts
    counts = dataset_mgr.get_dataset_counts(folder)

    return jsonify({
        "success": True,
        "filename": save_res["filename"],
        "category": category,
        "folder": folder,
        "counts": counts,
        "resolution": cap_res.get("resolution", "Unknown"),
        "latency_ms": cap_res.get("latency_ms", 0)
    })


@app.route("/api/datasets/delete", methods=["POST"])
def delete_dataset_image():
    data = request.get_json() or {}
    res = dataset_mgr.delete_image(
        filename=data.get("filename"),
        category_key=data.get("category"),
        folder_name=data.get("folder", dataset_mgr.active_folder)
    )
    return jsonify(res)


@app.route("/dataset_files/<dataset>/<path:filepath>")
def serve_dataset_file_universal(dataset, filepath):
    norm_p = filepath.replace("\\", "/").strip("/")

    # 1. Direct path check (e.g. train/good/img.jpg or train/good/.thumbs/img.jpg)
    direct_p = os.path.join(DATASETS_DIR, dataset, norm_p)
    if os.path.isfile(direct_p):
        return send_file(direct_p)

    # 2. Check category_key alias (e.g. train_good/img.jpg -> train/good/img.jpg)
    parts = norm_p.split("/")
    if len(parts) >= 2 and parts[0] in dataset_mgr.CATEGORIES:
        split, label = dataset_mgr.CATEGORIES[parts[0]]
        remapped = os.path.join(DATASETS_DIR, dataset, split, label, *parts[1:])
        if os.path.isfile(remapped):
            return send_file(remapped)

    return jsonify({"error": f"Dataset file '{filepath}' not found in '{dataset}'"}), 404


# ----------------------------------------------------
# Interactive Grid Mesh Focus Mask API
# ----------------------------------------------------
@app.route("/api/dataset/<dataset_name>/sample_image", methods=["GET"])
def get_dataset_sample_image(dataset_name):
    res = dataset_mgr.get_dataset_sample_image(dataset_name)
    return jsonify(res)


@app.route("/api/dataset/<dataset_name>/focus_mask", methods=["GET"])
def get_dataset_focus_mask(dataset_name):
    res = dataset_mgr.get_dataset_focus_mask(dataset_name)
    return jsonify(res)


@app.route("/api/dataset/<dataset_name>/focus_mask", methods=["POST"])
def save_dataset_focus_mask(dataset_name):
    payload = request.get_json() or {}
    res = dataset_mgr.save_dataset_focus_mask(dataset_name, payload)
    return jsonify(res)


@app.route("/api/dataset/<dataset_name>/focus_mask_preview", methods=["GET"])
def get_dataset_focus_mask_preview(dataset_name):
    dpath = dataset_mgr.get_dataset_path(dataset_name)
    return send_from_directory(dpath, "focus_mask.png")


# ----------------------------------------------------
# STAGE 2: Model Training & Registry API
# ----------------------------------------------------
@app.route("/api/models", methods=["GET"])
def list_models():
    models = []
    if os.path.exists(MODELS_DIR):
        for item in sorted(os.listdir(MODELS_DIR), reverse=True):
            mp = os.path.join(MODELS_DIR, item)
            if os.path.isdir(mp):
                meta_p = os.path.join(mp, "metadata.json")
                if os.path.exists(meta_p):
                    try:
                        with open(meta_p, "r") as f:
                            meta = json.load(f)
                        meta["is_active"] = (item == training_engine.active_model_id)
                        models.append(meta)
                    except Exception:
                        pass
    return jsonify({"models": models, "active_model_id": training_engine.active_model_id})


@app.route("/api/models/load", methods=["POST"])
def load_model():
    data = request.get_json() or {}
    mid = data.get("model_id")
    if not mid:
        return jsonify({"success": False, "error": "Missing model_id"}), 400
    mp = os.path.join(MODELS_DIR, mid)
    if not os.path.exists(mp):
        return jsonify({"success": False, "error": f"Model {mid} not found"}), 404
    try:
        meta_p = os.path.join(mp, "metadata.json")
        mb_p = os.path.join(mp, "memory_bank.pt")
        with open(meta_p, "r") as f:
            training_engine.active_model_meta = json.load(f)
        training_engine.memory_bank = torch.load(mb_p, map_location="cpu")
        training_engine.active_model_id = mid
        training_engine.threshold = training_engine.active_model_meta.get("threshold", 0.35)
        mask_p = os.path.join(mp, "focus_mask.png")
        if os.path.exists(mask_p):
            training_engine.active_focus_mask = cv2.imread(mask_p, cv2.IMREAD_GRAYSCALE)
        else:
            training_engine.active_focus_mask = None
        training_engine.is_model_ready = True
        return jsonify({"success": True, "model_id": mid, "meta": training_engine.active_model_meta})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
@app.route("/api/train/start", methods=["POST"])
def start_model_training():
    data = request.get_json() or {}
    dataset_name = data.get("dataset_name", dataset_mgr.active_folder)
    backbone = data.get("backbone", "resnet18")
    coreset_ratio = float(data.get("coreset_ratio", 0.02))
    roi_mode = data.get("roi_mode", "dial")

    dpath = dataset_mgr.get_dataset_path(dataset_name)
    res = training_engine.start_training(
        dataset_path=dpath,
        dataset_name=dataset_name,
        backbone=backbone,
        coreset_ratio=coreset_ratio,
        roi_mode=roi_mode
    )
    return jsonify(res)


@app.route("/api/train/status", methods=["GET"])
def get_training_status():
    state = training_engine.get_training_state()
    state["active_model_id"] = training_engine.active_model_id
    state["active_threshold"] = training_engine.threshold
    state["is_model_ready"] = training_engine.is_model_ready
    state["meta"] = training_engine.active_model_meta
    return jsonify(state)


# ----------------------------------------------------
# STAGE 3: Defect Inspection API
# ----------------------------------------------------
@app.route("/api/inspect/live", methods=["POST"])
def inspect_live_camera():
    """Inspect current live camera frame using the trained AI model."""
    data = request.get_json() or {}
    sensitivity = int(data.get("sensitivity", 65))
    threshold = float(data.get("threshold", training_engine.threshold)) if "threshold" in data else None

    with camera_mgr.lock:
        if camera_mgr.raw_frame is not None:
            img = camera_mgr.raw_frame.copy()
        else:
            return jsonify({"success": False, "error": "No camera frame available"}), 400

    if camera_mgr.crop_enabled and (img.shape[1] != camera_mgr.crop_w or img.shape[0] != camera_mgr.crop_h):
        img = camera_mgr.crop_to_dial_roi(img)

    res = training_engine.predict_image(img, threshold=threshold, sensitivity=sensitivity)

    # Encode images to base64
    _, annot_buf = cv2.imencode(".jpg", res["annotated_image"], [cv2.IMWRITE_JPEG_QUALITY, 85])
    _, heat_buf = cv2.imencode(".jpg", res["heatmap_image"], [cv2.IMWRITE_JPEG_QUALITY, 85])

    res["annotated_b64"] = f"data:image/jpeg;base64,{base64.b64encode(annot_buf).decode('utf-8')}"
    res["heatmap_b64"] = f"data:image/jpeg;base64,{base64.b64encode(heat_buf).decode('utf-8')}"
    res["annotated_image"] = None
    res["heatmap_image"] = None
    res["success"] = True

    return jsonify(res)


@app.route("/api/inspect/image", methods=["POST"])
def inspect_dataset_image():
    """Inspect a specific dataset image using the trained AI model."""
    data = request.get_json() or {}
    dataset_name = data.get("dataset_name", dataset_mgr.active_folder)
    category = data.get("category", "val_defect")
    filename = data.get("filename")
    sensitivity = int(data.get("sensitivity", 65))

    cat_dir = dataset_mgr.get_category_dir(category, dataset_name)
    img_path = os.path.join(cat_dir, filename)

    if not os.path.exists(img_path):
        return jsonify({"success": False, "error": f"Image '{filename}' not found"}), 404

    img = cv2.imread(img_path)
    res = training_engine.predict_image(img, sensitivity=sensitivity)

    _, annot_buf = cv2.imencode(".jpg", res["annotated_image"], [cv2.IMWRITE_JPEG_QUALITY, 85])
    _, heat_buf = cv2.imencode(".jpg", res["heatmap_image"], [cv2.IMWRITE_JPEG_QUALITY, 85])

    res["annotated_b64"] = f"data:image/jpeg;base64,{base64.b64encode(annot_buf).decode('utf-8')}"
    res["heatmap_b64"] = f"data:image/jpeg;base64,{base64.b64encode(heat_buf).decode('utf-8')}"
    res["annotated_image"] = None
    res["heatmap_image"] = None
    res["filename"] = filename
    res["success"] = True

    return jsonify(res)


if __name__ == "__main__":
    http_port = int(os.environ.get("PORT", 5005))
    https_port = 5443
    primary_ip = camera_mgr.get_host_ips()[0]

    # Run HTTPS server for mobile devices in a daemon thread
    if os.path.exists(CERT_PATH) and os.path.exists(KEY_PATH):
        def run_https():
            try:
                from werkzeug.serving import run_simple
                print(f" [HTTPS] Mobile App (Secure Context): https://{primary_ip}:{https_port}/phone")
                run_simple("0.0.0.0", https_port, app, ssl_context=(CERT_PATH, KEY_PATH), threaded=True)
            except Exception as e:
                print(f"[WARN] Failed to start HTTPS on {https_port}: {e}")

        t = threading.Thread(target=run_https, daemon=True)
        t.start()

    print("=" * 70)
    print(" PHONE CAMERA DEFECT STUDIO: DATA COLLECTION -> TRAINING -> INSPECTION")
    print(f" Web UI (PC):        http://localhost:{http_port}")
    print(f" Mobile (HTTPS SSL): https://{primary_ip}:{https_port}/phone")
    print(f" Mobile (HTTP):      http://{primary_ip}:{http_port}/phone")
    print("=" * 70)
    app.run(host="0.0.0.0", port=http_port, debug=False, threaded=True)
