# Industrial Horological Quality Control (H-QC) & Robotic Inspection Ecosystem
*Advanced Quality Assurance, Digital Traceability, and Automated Optical Inspection (AOI) for Precision Manufacturing.*

---

> [!TIP]
> ### ⚡ 1-Click Fast Setup / Installazione Rapida in 1 Clic
> - **Windows**: Clone the repo and double-click **`install_requirements.bat`**.
> - **macOS / Linux**: Clone the repo and run **`./install_requirements.sh`**.
> 
> *Automatically verifies Node.js/Python, installs all frontend and backend npm packages, seeds the SQLite database, builds the production client, creates the Python virtual environment (`venv`), and installs all vision and AI dependencies.*

---

## 🌐 Language Navigation / Navigazione Lingua
- [English Version](#-english-version)
  - [Part 1: Setup & Installation Guide (Windows & macOS)](#part-1-setup--installation-guide-windows--macos)
    - [1.3 ⚡ Single-Click Setup (Recommended)](#13--single-click-setup-recommended)
    - [1.4 Manual Setup on Windows](#14-manual-setup-on-windows)
    - [1.5 Running on macOS](#15-running-on-macos)
  - [Part 2: Step-by-Step Application User Guide & Defect Logging](#part-2-step-by-step-application-user-guide--defect-logging)
  - [Part 3: Robotic Cell Operation (Cobot & Industrial Vision 8-Slot Inspection)](#part-3-robotic-cell-operation-cobot--industrial-vision-8-slot-inspection)
- [Versione Italiana](#-versione-italiana)
  - [Parte 1: Guida all'Installazione e Configurazione (Windows e macOS)](#parte-1-guida-allinstallazione-e-configurazione-windows-e-macos)
    - [1.3 ⚡ Installazione con Singolo Clic (Consigliata)](#13--installazione-con-singolo-clic-consigliata)
    - [1.4 Configurazione Manuale su Windows](#14-configurazione-manuale-su-windows)
    - [1.5 Esecuzione su macOS](#15-esecuzione-su-macos)
  - [Parte 2: Guida Operativa all'Applicazione e Registrazione Difetti](#parte-2-guida-operativa-allapplicazione-e-registrazione-difetti)
  - [Parte 3: Funzionamento della Cella Robotica (Cobot e Visione Industriale 8 Slot)](#parte-3-funzionamento-della-cella-robotica-cobot-e-visione-industriale-8-slot)

---

# 🇬🇧 ENGLISH VERSION

---

## PART 1: Setup & Installation Guide (Windows & macOS)

This guide provides instructions to install and run the Quality Control (QC) application cleanly on both **Windows** and **macOS** workstations.

### 1.1 Prerequisites
Ensure the following are installed on your machine:
- **Node.js**: Version **v18.x, v20.x, or v22.x LTS** ([nodejs.org](https://nodejs.org/)).
  - Verify in terminal: `node -v` and `npm -v`
- **Git**: ([git-scm.com](https://git-scm.com/)).
- **Python 3.9 / 3.10** (for the AI / Cobot modules).
- **Web Browser**: Google Chrome or Microsoft Edge (recommended for webcam barcode scanner access).
- **Default Ports**:
  - `51999`: Frontend Client (Vite Dev Server)
  - `44444`: Backend API Server (Express + SQLite)
  - `5000` / `5001`: Defect Detection & Cobot Studio
  - `12343`: ABB Cobot TCP Socket Communication

---

### 1.2 Downloading the Repository
Open your terminal (PowerShell, CMD, or macOS Terminal) and clone the repository:
```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_FOLDER>
```

---

### 1.3 ⚡ Single-Click Setup (Recommended)

To install all frontend, backend, database, and Python AI requirements in a single step:

- **On Windows**:
  Simply **double-click** the file:
  ```text
  install_requirements.bat
  ```
  *(Or run `.\install_requirements.bat` in PowerShell/CMD).*

- **On macOS / Linux**:
  Open Terminal in the repository folder and run:
  ```bash
  chmod +x install_requirements.sh
  ./install_requirements.sh
  ```

#### What the installer does automatically:
1. Validates that **Node.js** and **Python** are installed.
2. Installs all React/Vite dependencies (`Application/`).
3. Installs all Express/SQLite dependencies (`Application/server/`).
4. Seeds the initial SQLite database and user accounts (`admin`, `OP1`–`OP12`).
5. Builds the production frontend bundle.
6. Automatically creates the Python virtual environment (`venv`) and installs all AI defect detection dependencies.
7. Once finished:
   - Double-click **`Run_TG_QC.bat`** to start the Quality Control Web App (Port 44444).
   - Double-click **`run_unified_studio.bat`** to start the Cobot & Industrial Vision Studio (Port 5000 / 12343).

---

### 1.4 Manual Setup on Windows

#### Step 1: Install Dependencies
Open **PowerShell** or **Command Prompt** in the project folder:
```cmd
:: 1. Install frontend packages
cd "Application"
npm install

:: 2. Install backend server packages
cd "server"
npm install

:: 3. Seed initial operator accounts
node seed.js
```

#### Step 2: Running in Development Mode
Open **two** command windows:
- **Window 1 (Backend Server):**
  ```cmd
  cd "Application\server"
  node server.js
  ```
  *(Displays: `Connected to the SQLite database via node:sqlite` and `Express API Server is running on port 44444`)*

- **Window 2 (Frontend Client):**
  ```cmd
  cd "Application"
  npm run dev
  ```
  *(Displays: `Local: http://localhost:51999/`)*

Open your browser to: **`http://localhost:51999`**

#### Step 3: Running in Production Mode (Single Port)
To run everything bundled on port 44444:
```cmd
cd "Application"
npm run build
cd "server"
node server.js
```
Then navigate to **`http://localhost:44444`**.

---

### 1.4 Running on macOS

#### Step 1: Install Dependencies
Open **Terminal**:
```bash
cd Application
npm install
cd server
npm install
node seed.js
```

#### Step 2: One-Click Startup via `start.sh`
```bash
cd Application
chmod +x start.sh
./start.sh
```
This automatically builds the production client and starts the backend on **`http://localhost:44444`**.

#### Step 3: Development Mode on macOS
- Terminal 1: `cd Application/server && node server.js`
- Terminal 2: `cd Application && npm run dev`
- Open: **`http://localhost:51999`**

---

### 1.5 Troubleshooting & Tips for Smooth Operation
1. **Port Already in Use (`EADDRINUSE: 44444` or `51999`)**:
   - *Windows*: Run `netstat -ano | findstr :44444`, then kill the PID: `taskkill /F /PID <PID>`
   - *macOS*: Run `lsof -i :44444`, then kill the PID: `kill -9 <PID>`
2. **Camera / Barcode Scanner Permissions**:
   - The browser will ask for webcam permissions to scan barcodes. Click **Allow**.
   - If blocked, click the site settings icon beside the URL in Chrome and enable **Camera**.
3. **Database Reset**:
   - To clear local test data and start fresh, delete `Application/server/database_new.sqlite` and run `node seed.js`.

---

## PART 2: Step-by-Step Application User Guide & Defect Logging

*(Note: This section covers the human operator and manager quality control web application workflow; robotic and AI modules are covered in Part 3).*

### 2.1 Default Login Credentials
- **Manager**: Username `admin` | Password `password123`
- **Operators**: Username `OP1` to `OP12` (or `operator`) | Password `password123`

---

### 2.2 Manager Workflow (Production Setup & Batch Assignment)

1. **Sign In**: Log in with `admin` / `password123`.
2. **Upload Datasheet (`.xlsx`)**:
   - Click **"Carica Scheda Tecnica" (Upload Datasheet)**.
   - Upload the production Excel file (e.g., `310-2026 - VEPY00320.xlsx`).
   - The app automatically parses:
     - Model SKU, Family name, and Brand/Model classification.
     - Batch quantity (e.g., 40 pieces per tray).
     - Individual watch serial numbers and barcodes.
     - Embedded technical component drawings directly from the spreadsheet.
3. **Assign to Digital Queue**:
   - Select an operator from the dropdown (`OP1` – `OP12`) to assign the batch.
   - The batch immediately appears in that operator's personal work queue.
4. **Monitor Quality Analytics**:
   - Review the live Donut Chart showing compliant vs. defective counts.
   - Inspect the Pareto defect distribution across inspection stations.
   - Give final approval once all units complete Check 6.

---

### 2.3 Operator Workflow (Sequential Quality Inspection)

Quality inspection follows a strict **6-check sequence**. A watch cannot skip checkpoints or proceed to the next check until the current one is passed.

#### The 6 Quality Stations:
1. **Check 1: Caseback Screw Check (*Controllo Vite Fondello*)**: Verifies caseback screw torque and gasket seating.
2. **Check 2: Water Resistance Check (*Controllo Impermeabilità*)**: Vacuum and overpressure leak testing.
3. **Check 3: Functional Check (*Controllo Funzionale*)**: Movement rate, hand rotation, date jump at midnight, chronograph start/stop/flyback reset.
4. **Check 4: Pre-Assembly Check (*Controllo Pre-Assemblaggio*)**: Case cleanliness, bezel rotation, crown and pusher operation.
5. **Check 5: Bracelet Assembly Check (*Controllo Assemblaggio Bracciale*)**: Spring-bar retention, bracelet link flexibility, clasp locking.
6. **Check 6: Final Quality Control (*Controllo Qualità Finale*)**: High-intensity optical check for dial dust, scratches, hand alignment, and crystal defects.

---

### 2.4 How Defect Logging & Repairs Work

```text
  [Scan Barcode]
        │
   Is it good?
   ├── YES ──▶ Click [Conforme / Pass] ──▶ Watch advances to next station
   │
   └── NO  ──▶ Click [Segnala Difetto / Log Defect]
                     │
                     ▼
             [Select Defect Tag] (e.g. Dust on dial, Case scratch)
                     │
                     ▼
             [Attach Photo / Notes] (Optional)
                     │
                     ▼
             [Click "Salva Difetto"]
                     │
                     ▼
        ┌──────────────────────────────────────────────┐
        │ ⚠️ WATCH LOCKED IN "DEFECTIVE" STATE         │
        │ - Blocked from advancing to future checks    │
        │ - Sent to Rework Bench                       │
        └──────────────────────────────────────────────┘
                     │
          (After physical repair)
                     │
                     ▼
        [Scan Barcode at Repair Station]
                     │
                     ▼
        [Click "Segna come Riparato / Mark Repaired"]
                     │
                     ▼
        [Must re-inspect and pass original check]
```

1. **Scanning**: The operator points the barcode scanner or camera at the watch barcode (or types the serial number).
2. **Logging a Defect**:
   - Click **"Segnala Difetto"**.
   - Select the defect reason from standard tags (e.g., *Polvere su quadrante / Dust on Dial*, *Graffio cassa / Case scratch*, *Perdita WR / Leak*) or type a custom tag.
   - Click **"Salva Difetto"**.
3. **Enforcement**:
   - The watch is locked as **Defective**.
   - If an operator tries to scan it at a later station, the system blocks them with: *"This watch was marked defective at Check X. It must be repaired first."*
4. **Repairing**:
   - At the repair station, scan the watch barcode.
   - Click **"Segna come Riparato" (Mark as Repaired)**.
   - The watch must be re-tested at that station before it can advance down the line.

---

## PART 3: Robotic Cell Operation (Cobot & Industrial Vision 8-Slot Inspection)

This section describes how the robotic automated optical inspection (AOI) cell is physically set up and operated in the laboratory.

```text
 ┌────────────────────────────────────────────────────────┐
 │                      CONTROL PC                        │
 │  • Unified Studio Web UI (Port 5000 / 5001)            │
 │  • Python TCP Socket Server (Port 12343)               │
 └───────────────────────────┬────────────────────────────┘
                             │
            TCP Socket (Port 12343 - LAN)
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │                   ABB COBOT CONTROLLER                 │
 │  • RAPID Orchestration Program (CAM_SERVER_IP)         │
 └───────────────────────────┬────────────────────────────┘
                             │
            Arm Trajectory / Trigger Signals
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │                   PHYSICAL CELL                        │
 │  • Collaborative Robot Arm with Vision Camera          │
 │  • Precision Fixture Tray: 8 Slots (CMM1 – CMM8)       │
 │  • Dial Crop ROI: 26 mm × 29 mm                        │
 └────────────────────────────────────────────────────────┘
```

### 3.1 Physical Setup & Hardware Architecture
- **Robot Arm**: ABB Collaborative Robot (Cobot) connected to the local network.
- **Vision Sensor**: Industrial high-resolution 2D/3D vision camera mounted on the robot arm / gantry.
- **Fixture Tray**: Custom precision fixture holding **8 watch slots (CMM1 through CMM8)**.
- **Network Link**: Dedicated Ethernet link connecting the PC and ABB controller.

---

### 3.2 Operating Procedure: Step-by-Step (How We Actually Do It)

#### Step 1: Physical Preparation
1. Place up to 8 watch cases or dials into the precision fixture tray (**Slots CMM1 to CMM8**).
2. Ensure the ABB Cobot work area is clear and the safety circuit is enabled.
3. Power on the industrial vision camera and ensure its network link is active.

#### Step 2: Start the Studio on the PC
On the Windows PC, double-click **`run_unified_studio.bat`** (or `run_cobot_acquisition.bat` in `watch_defect_detection/`).
- This opens the web interface in your browser at **`http://localhost:5000`** (or `http://localhost:5001`).
- The Python socket server starts listening on **Port 12343**.
- The top header displays the server's LAN IP address (needed for the robot).

#### Step 3: Start the ABB Cobot Program
1. On the ABB FlexPendant, ensure the `CAM_SERVER_IP` constant matches the PC's IP address and port is set to `12343`.
2. Select **`PP to Main`** (Program Pointer to Main).
3. Switch to **Automatic Mode** (or Manual Reduced Speed for testing).
4. Press the **Play / Start** button on the FlexPendant.
5. In the Web UI, the telemetry badge will immediately change from `DISCONNECTED` to **`CONNECTED`** with a green status indicator.

#### Step 4: Operating from the Web Interface
In the Web Studio, you have two operation modes:

- **Mode A: Individual Slot Inspection**:
  1. Under **"Individual Slot"**, select the desired slot from the dropdown (`Slot 1 (CMM1)` to `Slot 8 (CMM8)`).
  2. Click **"Move Cobot & Capture"** (or "Move Cobot & Inspect").
  3. The robot moves exclusively to that slot, acquires the image, and waits.

- **Mode B: Full Tray Acquisition / Inspection (All 8 Slots)**:
  1. Select the target category:
     - `Train Good`: Saves pristine images for model training.
     - `Val Good`: Saves compliant validation images.
     - `Val Defect`: Saves defect sample images.
  2. Enter the **Watch ID** (e.g., `Watch_01`).
  3. Click **"START ACQUISITION"**.

#### Step 5: How the Automated Handshake & Capture Works
The execution between the Cobot and PC follows this exact loop:

```text
ABB Cobot                           Control PC (Port 12343)
   │                                           │
   │ ────────────── "ready" ─────────────────▶ │ (Cobot asks for task)
   │                                           │
   │ ◀────────── "9" (or "1"-"8") ──────────── │ (Server dispatches command)
   │                                           │
   ▼                                           │
[Moves to Slot Position]                       │
   │                                           │
   │ ───────────── "at_pos" ─────────────────▶ │ (Cobot arrives over watch)
   │                                           │
   │                                           ▼
   │                                    [Camera snaps frame]
   │                                    [Crops 26×29mm ROI]
   │                                    [Runs AI Anomaly Model]
   │                                           │
   │ ◀─────────── "captured" ───────────────── │ (Server confirms capture)
   │                                           │
   ▼                                           ▼
[Moves to next slot]                    [Displays live heatmap & PASS/FAIL]
```

1. **Ready Query**: The Cobot sends `"ready"` over the TCP socket.
2. **Command Dispatch**: The PC checks the queued job and sends:
   - `"9"` to run all 8 slots in sequence.
   - `"1"` through `"8"` for a single target slot.
3. **Motion to Slot**: The Cobot moves along its calibrated path until positioned directly above the watch dial.
4. **Trigger Signal**: When in position, the Cobot sends `"at_pos"`.
5. **Frame Capture & AI Inference**:
   - The PC instantly commands the industrial vision camera to capture a frame.
   - The watch dial region of interest (**ROI: 26mm × 29mm**) is extracted.
   - The image is saved to the dataset and evaluated by PatchCore AI (generating an anomaly score and defect heatmap overlay).
6. **Confirmation**: The PC sends `"captured"` back to the Cobot.
7. **Next Step**: The Cobot receives `"captured"` and advances to the next slot until all 8 slots are completed. Once finished, the PC sends `"wait"`, returning the robot to its safe home position.

---
---

# 🇮🇹 VERSIONE ITALIANA

---

## PARTE 1: Guida all'Installazione e Configurazione (Windows e macOS)

Questa guida fornisce le istruzioni per installare ed eseguire l'applicazione di Controllo Qualità (QC) su postazioni **Windows** e **macOS**.

### 1.1 Prerequisiti
Verificare che sul computer siano installati:
- **Node.js**: Versione **v18.x, v20.x o v22.x LTS** ([nodejs.org](https://nodejs.org/)).
  - Verifica nel terminale: `node -v` e `npm -v`
- **Git**: ([git-scm.com](https://git-scm.com/)).
- **Python 3.9 / 3.10** (per i moduli AI e di controllo Cobot).
- **Browser Web**: Google Chrome o Microsoft Edge (consigliati per l'accesso alla webcam del lettore barcode).
- **Porte Predefinite**:
  - `51999`: Client Frontend (Server di Sviluppo Vite)
  - `44444`: Server API Backend (Express + SQLite)
  - `5000` / `5001`: Studio Difetti e Acquisizione Cobot
  - `12343`: Socket TCP per la Comunicazione con il Cobot ABB

---

### 1.2 Download del Repository
Aprire il terminale (PowerShell, CMD o Terminale macOS) e clonare il repository:
```bash
git clone <REPOSITORY_URL>
cd <REPOSITORY_FOLDER>
```

---

### 1.3 ⚡ Installazione con Singolo Clic (Consigliata)

Per installare automaticamente tutte le dipendenze frontend, backend, database e pacchetti Python AI in un solo passaggio:

- **Su Windows**:
  Fare semplicemente **doppio clic** sul file:
  ```text
  install_requirements.bat
  ```
  *(Oppure eseguire `.\install_requirements.bat` dal Prompt dei Comandi o PowerShell).*

- **Su macOS / Linux**:
  Aprire il Terminale nella cartella del repository ed eseguire:
  ```bash
  chmod +x install_requirements.sh
  ./install_requirements.sh
  ```

#### Cosa fa l'installer automaticamente:
1. Verifica la presenza di **Node.js** e **Python**.
2. Installa le dipendenze React/Vite (`Application/`).
3. Installa le dipendenze Express/SQLite (`Application/server/`).
4. Inizializza e popola il database SQLite con gli account predefiniti (`admin`, `OP1`–`OP12`).
5. Compila l'applicazione frontend per la produzione.
6. Crea l'ambiente virtuale Python (`venv`) e installa tutti i requisiti di visione e AI PatchCore.
7. Al termine:
   - Doppio clic su **`Run_TG_QC.bat`** per avviare l'Applicazione Web di Controllo Qualità (Porta 44444).
   - Doppio clic su **`run_unified_studio.bat`** per avviare lo Studio Cobot e Visione Industriale (Porta 5000 / 12343).

---

### 1.4 Configurazione Manuale su Windows

#### Passo 1: Installazione delle Dipendenze
Aprire **PowerShell** o il **Prompt dei Comandi** nella cartella del progetto:
```cmd
:: 1. Installare le dipendenze del frontend
cd "Application"
npm install

:: 2. Installare le dipendenze del backend server
cd "server"
npm install

:: 3. Popolare gli account operatore iniziali
node seed.js
```

#### Passo 2: Avvio in Modalità Sviluppo
Aprire **due** finestre di terminale:
- **Finestra 1 (Server Backend):**
  ```cmd
  cd "Application\server"
  node server.js
  ```
  *(Mostra: `Connected to the SQLite database via node:sqlite` e `Express API Server is running on port 44444`)*

- **Finestra 2 (Client Frontend):**
  ```cmd
  cd "Application"
  npm run dev
  ```
  *(Mostra: `Local: http://localhost:51999/`)*

Aprire il browser all'indirizzo: **`http://localhost:51999`**

#### Passo 3: Avvio in Modalità Produzione (Porta Singola)
Per eseguire tutto compilato su porta 44444:
```cmd
cd "Application"
npm run build
cd "server"
node server.js
```
Accedere a **`http://localhost:44444`**.

---

### 1.4 Esecuzione su macOS

#### Passo 1: Installazione delle Dipendenze
Aprire il **Terminale**:
```bash
cd Application
npm install
cd server
npm install
node seed.js
```

#### Passo 2: Avvio Diretto con `start.sh`
```bash
cd Application
chmod +x start.sh
./start.sh
```
Lo script compila automaticamente il client e avvia il backend su **`http://localhost:44444`**.

#### Passo 3: Modalità Sviluppo su macOS
- Terminale 1: `cd Application/server && node server.js`
- Terminale 2: `cd Application && npm run dev`
- Aprire: **`http://localhost:51999`**

---

### 1.5 Risoluzione dei Problemi
1. **Porta Già Occupata (`EADDRINUSE: 44444` o `51999`)**:
   - *Windows*: Eseguire `netstat -ano | findstr :44444`, poi terminare il processo: `taskkill /F /PID <PID>`
   - *macOS*: Eseguire `lsof -i :44444`, poi terminare il processo: `kill -9 <PID>`
2. **Permessi Fotocamera / Barcode**:
   - Il browser chiederà il permesso di utilizzare la fotocamera per scansionare i codici a barre. Cliccare su **Consenti**.
3. **Ripristino Database**:
   - Per azzerare i lotti di test e ricominciare da zero, eliminare `Application/server/database_new.sqlite` ed eseguire `node seed.js`.

---

## PARTE 2: Guida Operativa all'Applicazione e Registrazione Difetti

*(Nota: Questa sezione illustra il flusso dell'applicazione web per operatori e manager; i moduli robotici e AI sono descritti nella Parte 3).*

### 2.1 Credenziali di Accesso Predefinite
- **Manager**: Utente `admin` | Password `password123`
- **Operatori**: Utente da `OP1` a `OP12` (oppure `operator`) | Password `password123`

---

### 2.2 Flusso di Lavoro del Manager (Configurazione e Assegnazione)

1. **Accesso**: Login con `admin` / `password123`.
2. **Caricamento Scheda Tecnica (`.xlsx`)**:
   - Cliccare su **"Carica Scheda Tecnica"**.
   - Caricare il file Excel di produzione (es. `310-2026 - VEPY00320.xlsx`).
   - L'applicazione estrae automaticamente:
     - Codice SKU, Nome Famiglia e classificazione Brand/Modello.
     - Quantità del lotto (es. 40 pezzi per vassoio).
     - Matricole e codici a barre dei singoli orologi.
     - Disegni tecnici ed esplosi dei componenti estratti direttamente dall'Excel.
3. **Assegnazione alla Coda Digitale**:
   - Selezionare l'operatore dal menu a tendina (`OP1` – `OP12`) per assegnare il lotto.
   - Il lotto compare immediatamente nella coda di lavoro dell'operatore designato.
4. **Monitoraggio Analitico**:
   - Consultare il grafico a ciambella in tempo reale con il conteggio dei pezzi conformi e difettosi.
   - Analizzare la distribuzione dei difetti per postazione.
   - Fornire l'approvazione finale al termine del Controllo 6.

---

### 2.3 Flusso di Lavoro dell'Operatore (Controlli Sequenziali)

Il controllo qualità segue una **sequenza obbligatoria di 6 controlli**. Un orologio non può saltare alcun controllo né avanzare senza aver superato quello corrente.

#### Le 6 Stazioni di Controllo:
1. **Controllo 1: Controllo Vite Fondello**: Verifica del corretto serraggio delle viti e della guarnizione del fondello.
2. **Controllo 2: Controllo Impermeabilità**: Collaudo pneumatico in vuoto e sovrapressione.
3. **Controllo 3: Controllo Funzionale**: Marcia movimento, rotazione lancette, scatto data a mezzanotte, avvio/arresto/azzeramento cronografo.
4. **Controllo 4: Controllo Pre-Assemblaggio**: Pulizia cassa, rotazione ghiera, funzionalità pulsanti e corona.
5. **Controllo 5: Controllo Assemblaggio Bracciale**: Tenuta anse, snodo maglie bracciale, chiusura fibbia.
6. **Controllo 6: Controllo Qualità Finale**: Ispezione ottica microscopica sotto lampada per polvere su quadrante, graffi cassa, allineamento lancette e difetti vetro zaffiro.

---

### 2.4 Registrazione Difetti e Riparazioni

```text
  [Scansione Barcode Orologio]
              │
        È conforme?
        ├── SI ──▶ Cliccare [Conforme] ──▶ L'orologio avanza alla stazione successiva
        │
        └── NO ──▶ Cliccare [Segnala Difetto]
                         │
                         ▼
             [Seleziona Tag Difetto] (es. Polvere su quadrante, Graffio cassa)
                         │
                         ▼
             [Allega Foto / Note] (Opzionale)
                         │
                         ▼
             [Cliccare "Salva Difetto"]
                         │
                         ▼
        ┌──────────────────────────────────────────────┐
        │ ⚠️ OROLOGIO BLOCCATO IN STATO "DIFETTOSO"    │
        │ - Avanzamento bloccato categoricamente       │
        │ - Inviato al banco riparazione               │
        └──────────────────────────────────────────────┘
                         │
              (Dopo riparazione fisica)
                         │
                         ▼
        [Scansione Barcode al Banco Riparazione]
                         │
                         ▼
        [Cliccare "Segna come Riparato"]
                         │
                         ▼
        [Deve ripetere e superare il controllo fallito]
```

1. **Scansione**: L'operatore inquadra il codice a barre con la fotocamera o il lettore (oppure digita il seriale).
2. **Registrazione del Difetto**:
   - Cliccare su **"Segnala Difetto"**.
   - Selezionare la categoria del difetto dai tag predefiniti (es. *Polvere su quadrante*, *Graffio cassa*, *Perdita impermeabilità*) o digitare un tag personalizzato.
   - Cliccare **"Salva Difetto"**.
3. **Blocco di Sicurezza**:
   - L'orologio viene registrato come **Difettoso**.
   - Se un operatore tenta di scansionarlo in una stazione successiva, l'app lo blocca con il messaggio: *"Questo orologio è stato contrassegnato come difettoso nel Controllo X. Deve prima essere riparato."*
4. **Riparazione**:
   - Al banco riparazioni, scansionare l'orologio.
   - Cliccare **"Segna come Riparato"**.
   - L'orologio deve essere nuovamente collaudato e superare quel controllo per poter proseguire.

---

## PARTE 3: Funzionamento della Cella Robotica (Cobot e Visione Industriale 8 Slot)

Questa sezione illustra come è configurata e utilizzata concretamente la cella robotica di ispezione visiva automatizzata (AOI) in laboratorio.

```text
 ┌────────────────────────────────────────────────────────┐
 │                        PC DI CONTROLLO                 │
 │  • Web UI Studio Unificato (Porta 5000 / 5001)         │
 │  • Socket Server TCP Python (Porta 12343)              │
 └───────────────────────────┬────────────────────────────┘
                             │
            Socket TCP (Porta 12343 - LAN)
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │                  CONTROLLORE ABB COBOT                 │
 │  • Programma RAPID di Movimentazione (CAM_SERVER_IP)   │
 └───────────────────────────┬────────────────────────────┘
                             │
            Traiettoria Braccio / Segnali Trigger
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │                     CELLA FISICA                       │
 │  • Braccio Robot Collaborativo con Telecamera          │
 │  • Vassoio di Posizionamento: 8 Alloggiamenti (CMM1-8) │
 │  • Finestra di Ritaglio (ROI) Quadrante: 26mm × 29mm   │
 └────────────────────────────────────────────────────────┘
```

### 3.1 Configurazione Fisica e Hardware
- **Robot**: Robot Collaborativo ABB (Cobot) collegato alla rete locale.
- **Sensore di Visione**: Telecamera industriale ad alta risoluzione 2D/3D montata sul robot.
- **Dima Meccanica**: Vassoio calibrato con **8 alloggiamenti per orologi (CMM1 fino a CMM8)**.
- **Connessione di Rete**: Cavo Ethernet dedicato tra il controller ABB e il PC di controllo.

---

### 3.2 Procedura Operativa Passo-Passo (Come Facciamo Realmente)

#### Passo 1: Preparazione Fisica
1. Posizionare fino a 8 casse o quadranti di orologio negli alloggiamenti del vassoio (**Slot CMM1 a CMM8**).
2. Verificare che l'area di lavoro del Cobot ABB sia sgombra e che i dispositivi di sicurezza siano attivi.
3. Accendere la telecamera di visione industriale e verificare la connessione di rete.

#### Passo 2: Avvio dello Studio sul PC
Sul PC Windows, fare doppio clic su **`run_unified_studio.bat`** (oppure su `run_cobot_acquisition.bat` in `watch_defect_detection/`).
- Nel browser si aprirà automaticamente l'interfaccia web all'indirizzo **`http://localhost:5000`** (o `http://localhost:5001`).
- Il server socket Python si avvierà in ascolto sulla **Porta 12343**.
- L'intestazione della pagina web mostrerà l'indirizzo IP locale del PC (necessario per il robot).

#### Passo 3: Avvio del Programma sul Cobot ABB
1. Sul pannello ABB FlexPendant, verificare che la costante `CAM_SERVER_IP` corrisponda all'indirizzo IP del PC e che la porta sia impostata su `12343`.
2. Selezionare **`PP to Main`** (Puntatore di Programma all'inizio del Main).
3. Impostare la modalità del robot su **Automatico** (oppure Manuale a velocità ridotta per i primi collaudi).
4. Premere il pulsante **Play / Start** sul FlexPendant.
5. Sull'interfaccia web, il badge di stato passerà istantaneamente da `DISCONNECTED` a **`CONNECTED`** con indicatore verde.

#### Passo 4: Controllo dall'Interfaccia Web
Dall'interfaccia web dello Studio sono disponibili due modalità di funzionamento:

- **Modalità A: Ispezione Singolo Alloggiamento**:
  1. Nella sezione **"Individual Slot"**, selezionare l'alloggiamento desiderato dal menu (`Slot 1 (CMM1)` fino a `Slot 8 (CMM8)`).
  2. Cliccare su **"Move Cobot & Capture"** (o "Move Cobot & Inspect").
  3. Il robot si muove esclusivamente sopra quell'orologio, acquisisce l'immagine e attende.

- **Modalità B: Acquisizione / Ispezione Vassoio Completo (Tutti gli 8 Slot)**:
  1. Selezionare la categoria di destinazione:
     - `Train Good`: Salva immagini perfette per l'addestramento del modello AI.
     - `Val Good`: Salva immagini conformi di validazione.
     - `Val Defect`: Salva immagini con difetti.
  2. Inserire il **Watch ID** (es. `Watch_01`).
  3. Cliccare su **"START ACQUISITION"**.

#### Passo 5: Come Funziona l'Handshake e l'Acquisizione Automatica
L'interazione tra il Cobot e il PC avviene attraverso questo ciclo esatto:

```text
Cobot ABB                           PC di Controllo (Porta 12343)
   │                                           │
   │ ────────────── "ready" ─────────────────▶ │ (Il Cobot chiede la mansione)
   │                                           │
   │ ◀────────── "9" (oppure "1"-"8") ──────── │ (Il server invia il comando)
   │                                           │
   ▼                                           │
[Raggiunge lo Slot sul Vassoio]                 │
   │                                           │
   │ ───────────── "at_pos" ─────────────────▶ │ (Il Cobot segnala di essere in quota)
   │                                           │
   │                                           ▼
   │                                    [La telecamera scatta il fotogramma]
   │                                    [Ritaglio ROI quadrante 26×29mm]
   │                                    [Esecuzione modello AI PatchCore]
   │                                           │
   │ ◀─────────── "captured" ───────────────── │ (Il server conferma l'acquisizione)
   │                                           │
   ▼                                           ▼
[Avanza allo slot successivo]           [Mostra a video heatmap e PASS/FAIL]
```

1. **Richiesta di Prontitudine**: Il Cobot invia la stringa `"ready"` via socket TCP.
2. **Invio Comando**: Il server PC invia:
   - `"9"` per eseguire tutti gli 8 slot in sequenza automatica.
   - Da `"1"` a `"8"` per uno slot specifico.
3. **Posizionamento**: Il Cobot si muove lungo la traiettoria calibrata fino a posizionarsi perfettamente sopra l'orologio.
4. **Segnale di Posizione Raggiunta**: Una volta fermo in quota, il Cobot invia `"at_pos"`.
5. **Scatto e Inferenza AI**:
   - Il PC comanda immediatamente alla telecamera lo scatto del fotogramma ad alta risoluzione.
   - Viene ritagliata la regione di interesse del quadrante (**ROI: 26mm × 29mm**).
   - L'immagine viene salvata nel dataset e analizzata dal modello PatchCore AI (che calcola lo score di anomalia e mappa termica del difetto).
6. **Conferma di Fine Scatto**: Il PC invia `"captured"` al Cobot.
7. **Proseguimento del Ciclo**: Il Cobot riceve `"captured"` e procede allo slot successivo fino a completare tutti gli 8 alloggiamenti. Al termine, il PC invia `"wait"`, e il robot torna in posizione di riposo sicura.
