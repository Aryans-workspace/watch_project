# Timex Group Quality Control (TG-QC) Application

## 📖 For the Simple Person (Overview)

**What is this app?**
This is a digital Quality Control application designed specifically for the Timex Group. It replaces manual paperwork by helping operators and managers digitally track production batches, scan watches, and log defects.

**Key Features:**
- **Excel Uploads:** You can easily upload `.xlsx` files (datasheets). The app automatically reads the file and extracts all the necessary batch information and watch components.
- **Barcode Scanning:** Use your device's camera to scan watch barcodes quickly and efficiently.
- **Quality Control Logging:** Track which watches are "good" and easily log specific defects if they fail the quality check.
- **Role-based Access:** The app has different views. **Operators** use it to scan and check watches on the floor, while **Managers** use it to oversee the entire batch progress and approve final results.

---

## 💻 For the Developer (Technical Handover)

This project is a modern web application split into a **React Frontend** and a **Node.js Backend**.

### 1. Technology Stack
- **Frontend:** React, Vite (for fast bundling). 
  - Key libraries: `html5-qrcode` (for barcode scanning), `xlsx` (SheetJS) and `jszip` (for client-side Excel parsing and image extraction).
- **Backend:** Node.js with Express.js.
- **Database:** SQLite (file-based database, ideal for lightweight setup).
- **Authentication:** JSON Web Tokens (JWT) for secure sessions, with `bcryptjs` for password hashing.

### 2. Project Structure
```text
Application/
├── App.jsx            # Main React frontend logic (routing, Excel parsing, UI components)
├── index.html         # Entry point for the frontend
├── package.json       # Frontend dependencies and Vite scripts
└── server/
    ├── server.js      # Backend Express application and API endpoints
    ├── database.js    # SQLite database schema and connection setup
    ├── database.sqlite# The actual database file (auto-generated if missing)
    └── package.json   # Backend dependencies (express, sqlite3, jsonwebtoken)
```

### 3. How to Run the Application Locally

You will need to run both the backend server and the frontend development server simultaneously.

**Prerequisites:**
- Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

**Step 1: Start the Backend Server**
1. Open your terminal and navigate to the `server` folder: 
   ```bash
   cd server
   ```
2. Install the backend dependencies:
   ```bash
   npm install
   ```
3. Start the server (uses nodemon for hot-reloading):
   ```bash
   npm run dev
   ```
   *(The server will run on `http://localhost:5000`)*

**Step 2: Start the Frontend Application**
1. Open a **new** terminal window and navigate to the root `Application` folder.
2. Install the frontend dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the provided local link (usually `http://localhost:5173`) in your web browser.

### 4. Important Handover Notes & Quirks

- **Client-Side Excel Parsing:** The logic to read uploaded `.xlsx` files is handled entirely on the frontend inside `App.jsx`. It uses `SheetJS` to read cell data and `jszip` to extract embedded images (from the `xl/media/` directory inside the Excel archive).
- **Mock Demo Data:** Inside `App.jsx`, there is a hardcoded `DEMO_EXTRACTION` object. This is currently used as a fallback or placeholder to simulate how data looks when successfully extracted from a template. 
- **Database Initialization:** You don't need to manually create SQL tables. The `server/database.js` file contains logic to automatically generate the required tables (`users`, `batches`, `components`, `watch_actions`) if they don't already exist in `database.sqlite`.
- **Default Users for Testing:** For testing the login flow, the system expects specific user credentials. You can find these seeded in the frontend or database logic:
  - **Operator Account:** Username: `OP-1042` / Password: `battery87` (Note: the backend also accepts a fallback password `password123`).
  - **Manager Account:** Username: `RSP-007` / Password: `quarzo22` (Note: the backend also accepts a fallback password `password123`).
- **CORS:** The backend is configured with `cors()` to ensure the React frontend (running on port `5173`) can communicate securely with the API (running on port `5000`).
