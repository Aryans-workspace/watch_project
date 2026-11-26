# Phone Camera AI Defect Detection Studio (Coloured Images)

This module provides high-resolution optical inspection for **dust and scratches** on coloured watch dials and precision components using a **smartphone camera** as the optical imaging hardware, without any robotic dependency.

---

## 📱 Hardware & Orchestrator Concept

### How Phone Camera Remote Control Works from PC:
Modern smartphones possess high-resolution optical sensors (12 MP, 48 MP, 50 MP+), optical stabilization, and integrated macro lenses. To conduct AI defect detection on microscopic dust and scratches, capturing the **pristine full-sensor resolution** (rather than a compressed 1080p video feed) is critical.

This orchestrator supports **3 seamless connection architectures**:

### 1. Web Companion Bridge (Zero Install - Works on iPhone & Android)
- **No apps required on your phone.**
- The PC orchestrator hosts a mobile companion web app at `http://<PC_IP>:5005/phone`.
- Scan the QR code displayed on the PC screen with your phone camera.
- The phone streams a live alignment viewfinder to the PC.
- When you press **"CAPTURE HIGH-RES PHOTO"** (or hit **Spacebar**) on your PC:
  1. The PC signals the phone camera over a low-latency event channel.
  2. The phone triggers physical hardware autofocus and invokes the HTML5 `ImageCapture.takePhoto()` API at **full native sensor resolution** (up to 4032 × 3024 / 4K+).
  3. The uncompressed high-resolution photo is transferred directly to `datasets/captures/` on the PC and immediately fed into the AI Defect Engine.

### 2. IP Webcam REST API (Dedicated Android / iOS App)
- Install **IP Webcam** (Android) or **IP Camera** (iOS).
- Tap **Start Server** on your phone (e.g. `http://10.105.1.X:8080`).
- Enter this URL into the orchestrator dashboard.
- Features:
  - Hardware shutter trigger endpoint (`/photoaf.jpg` with physical lens autofocus).
  - Phone flashlight / LED torch control (`/enabletorch` / `/disabletorch`) for directional surface illumination.

### 3. USB Virtual Webcam (DroidCam / Iriun Webcam / Camo Studio)
- Connect your phone via USB cable using DroidCam, Iriun, or Camo Studio.
- The phone appears as a DirectShow camera index in OpenCV (`Index 0, 1, 2`).

---

## 🔬 AI Defect Detection Engine (Dust & Scratches on Coloured Images)

1. **Color-Aware Channel Decompositions**:
   - Analyzes CIE LAB (L = luminance, A/B = chrominance), HSV, and RGB color spaces to detect defects against coloured watch dials without confusing dial colors or markings.
2. **CLAHE (Contrast Limited Adaptive Histogram Equalization)**:
   - Amplifies microscopic contrast around dust particles and shallow hairline scratches.
3. **Morphological Dual-Hat Filtering**:
   - **Top-Hat Filter**: Isolates bright reflective dust specks.
   - **Black-Hat Filter**: Isolates dark dust flecks.
4. **Directional Edge & Gradient Analysis**:
   - Multi-angle directional line filters ($0^\circ, 45^\circ, 90^\circ, 135^\circ$) and Laplacian gradients to isolate linear micro-scratches.
5. **Geometric Classification**:
   - Classifies detected defects into **Dust Particles** (circular, compact) and **Scratches** (elongated, high aspect ratio).
6. **Optical Dial Masking**:
   - Automatically detects the circular dial perimeter to eliminate fixturing or background reflections.

---

## 🚀 How to Run

1. Double-click `run.bat` or run:
   ```cmd
   python app.py
   ```
2. Open your browser on PC:
   ```
   http://localhost:5005
   ```
3. Connect your phone:
   - Scan the QR code with your phone or visit `http://10.105.1.15:5005/phone` on your phone browser.
4. Press **Spacebar** or click **"CAPTURE HIGH-RES PHOTO"** to take high-resolution images and run defect detection!
