import cv2
import numpy as np
import base64
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

@app.route('/image')
def serve_image():
    return send_file(r"C:\Users\MECH MIND\Desktop\AI defect detection\testing\defect\defective.png", mimetype='image/png')

def process_channel(img, mask, channel_name):
    # TopHat finds small bright anomalies on the specified channel
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    tophat = cv2.morphologyEx(img, cv2.MORPH_TOPHAT, kernel)
    
    anomalies = cv2.bitwise_and(tophat, tophat, mask=mask)
    _, thresh = cv2.threshold(anomalies, 30, 255, cv2.THRESH_BINARY)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, np.ones((2,2), np.uint8))
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    return contours

@app.route('/process', methods=['POST'])
def process():
    try:
        data = request.json
        # Extract base64 mask (drawn by user)
        mask_b64 = data.get('mask').split(',')[1]
        mask_bytes = base64.b64decode(mask_b64)
        mask_np = np.frombuffer(mask_bytes, dtype=np.uint8)
        mask_img = cv2.imdecode(mask_np, cv2.IMREAD_UNCHANGED) # Extract with alpha channel
        
        # We threshold the alpha channel to create a binary mask of the user's brush strokes
        if len(mask_img.shape) == 3 and mask_img.shape[2] == 4:
            alpha = mask_img[:, :, 3]
            _, mask_binary = cv2.threshold(alpha, 10, 255, cv2.THRESH_BINARY)
        else:
            _, mask_binary = cv2.threshold(mask_img, 10, 255, cv2.THRESH_BINARY)
            
        def_img = cv2.imread(r"testing\defect\defective.png")
        if def_img is None:
            return jsonify({"error": "Failed to load defective image from disk"})
            
        # Ensure mask matches original image size
        if mask_binary.shape != def_img.shape[:2]:
            mask_binary = cv2.resize(mask_binary, (def_img.shape[1], def_img.shape[0]))
            
        # OpenCV loads BGR
        b, g, r = cv2.split(def_img)
        
        # Yellow Filter = Average of Red and Green channels
        yellow = cv2.addWeighted(r, 0.5, g, 0.5, 0)
        
        channels = {
            'Red Filter': r,
            'Green Filter': g,
            'Blue Filter': b,
            'Yellow Filter': yellow
        }
        
        results = {}
        for name, ch in channels.items():
            contours = process_channel(ch, mask_binary, name)
            
            # Draw on a fresh copy of the original image
            res_img = def_img.copy()
            count = 0
            for c in contours:
                area = cv2.contourArea(c)
                if 2 < area < 400:
                    x, y, w, h = cv2.boundingRect(c)
                    if w < 40 and h < 40:
                        cv2.circle(res_img, (int(x+w/2), int(y+h/2)), max(w,h)+10, (0, 0, 255), 2)
                        count += 1
                        
            # Encode result to base64
            _, buffer = cv2.imencode('.jpg', res_img)
            res_b64 = base64.b64encode(buffer).decode('utf-8')
            results[name] = {
                'image': 'data:image/jpeg;base64,' + res_b64,
                'count': count
            }
            
        return jsonify(results)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)})

if __name__ == '__main__':
    app.run(port=5000)
