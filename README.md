# AI Defect Detection & Horological Analytics System (TG-QC)

Timex Group Quality Control (TG-QC) system integrating ABB Cobot automation, Mech-Mind vision systems, PatchCore anomaly detection, real-time horological analytics, and interactive 3D digital twins.

---

## 📋 System Overview

This project provides a comprehensive end-to-end industrial quality control platform:
1. **Application (Web UI & Backend)**:
   - **Frontend**: React + Vite interface with barcode scanning, Excel batch parsing, live defect logging, and digital twin visualizer.
   - **Backend**: Node.js + Express API server with SQLite ledger for operator activity, batches, and defect records.
   - **Voice Assistant**: Integrated offline speech recognition (`vosk`) and AI assistant for hands-free factory floor interaction.
   - **Robotic Integration**: ABB Cobot RAPID communication modules (`.mod`) and orchestrators.
2. **PatchCore Defect Detection Engine (`patchcore_defect_detection/`)**:
   - Deep learning anomaly detection based on PatchCore architecture (Anomalib / PyTorch / Torchvision).
   - High-resolution visual defect localization for watch cases, dials, and precision components.
3. **Unified Studio (`run_unified_studio.bat` & `hub.py`)**:
   - Integration hub connecting the Mech-Mind camera, ABB robot, calibration modules, and inference engine.

---

## 📁 Repository Structure

```text
├── Application/                        # React frontend & Node.js server
│   ├── src / App.jsx / AIAssistant.jsx # React client components
│   ├── server/                         # Express server, SQLite database, seed scripts
│   ├── Live Captions/                  # Voice speech recognition assistant
│   └── Application with Robotic.../    # Robotic cell integration configs & modules
├── patchcore_defect_detection/         # AI anomaly detection core
│   ├── patchcore_engine.py             # Inference and feature extraction pipeline
│   ├── app.py                          # Flask AI service
│   ├── camera_manager.py               # Hardware camera acquisition interface
│   ├── models/                         # Model metadata and training checkpoints
│   └── requirements.txt                # Python dependencies for AI engine
├── watch_defect_detection/             # Additional watch inspection modules
├── datasets/                           # Reference inspection image batches
├── camera_manager.py                   # Root camera manager
├── hub.py                              # Central server orchestrating Web UI & Cobot socket
├── run_unified_studio.bat              # One-click startup script for the studio
└── requirements.txt                    # Root Python dependencies
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18 or v20 recommended)
- **Python** (v3.9 or v3.10 recommended)
- **Git**

### 2. Frontend & Backend Setup
Navigate into the `Application` directory to install dependencies:

```bash
# Install frontend dependencies
cd Application
npm install

# Install backend dependencies
cd server
npm install

# (Optional) Seed initial database
node seed.js
```

To run the application:
```bash
# Start backend server (port 5001)
cd Application/server
node server.js

# In a separate terminal, start frontend (Vite)
cd Application
npm run dev
```

### 3. AI Defect Detection Engine Setup
Create and activate a virtual environment, then install requirements:

```bash
python -m venv venv
venv\Scripts\activate   # On Windows
pip install -r requirements.txt
pip install -r patchcore_defect_detection/requirements.txt
```

### 4. Running the Unified Studio
Double-click `run_unified_studio.bat` or run:
```bash
python hub.py
```
This launches the unified studio on port 5000 and listens for Cobot RAPID socket connections on port 12343.

---

## 🧠 Model Weights & Checkpoints

Due to GitHub's 100 MB file size limit, trained deep learning weights (`.pt`, `.ckpt`) are excluded from this repository.
- Refer to `patchcore_defect_detection/models/README.md` for details on placing or training model weights.
- Offline speech recognition models for `Live Captions` can be downloaded from [Alpha Cephei Vosk Models](https://alphacephei.com/vosk/models).

---

## 📄 License & Credits
Developed as part of the Master's Thesis for Timex Group Quality Control (TG-QC) in collaboration with SUPSI and Mech-Mind.
