import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { Html5Qrcode } from "html5-qrcode";
import AIAssistant from "./AIAssistant";
import ProofmasterTwin from "./ProofmasterTwin";
import AIDefectTwin from "./AIDefectTwin";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return <div className="p-4 text-red-600 font-bold">Something went wrong. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}

/* =========================================================
   MOCK "DATABASE" — in-memory only, resets on reload.
   Replace with real auth + API calls when the backend exists.
========================================================= */
const seedUsers = [
  { id: "OP-1042", name: "Marco Bellini", password: "battery87", role: "operator" },
  { id: "RSP-007", name: "Giulia Conti", password: "quarzo22", role: "manager" },
];

/* ---------------------------------------------------------
   DEMO EXTRACTION DATA
   A real integration would send the uploaded datasheet to a
   backend OCR / document-parsing service (e.g. Textract,
   Document AI, a custom Tesseract pipeline) and receive these
   fields back as structured JSON. There is no such service
   here, so uploading any file "extracts" this sample record —
   built from the datasheet template shared during setup — so
   the full field set, table, and edit flow can be tried end
   to end. Note the source PDF's own embedded image was itself
   a broken link, so this demo intentionally lands in the
   "image not found" state to show that fallback too.
--------------------------------------------------------- */
const DEMO_EXTRACTION = {
  week: "04/09/2026",
  ml: "310-2026",
  brand: "Versace Watches",
  family: "PY-URBAN MYSTIQUE 45",
  famPcs: "200",
  sku: "VEPY00320",
  description: "URBAN M. D/BLK S/BLK BICOL IP1N CROWN&PUCHER&TOP RING",
  pcs: "200",
  wip: "2275894 (16) [Job Mass Loaded on 10-FEB-26 14:36:36], 2275898 (200) [Job Mass Loaded on 10-FEB-26 14:38:41]",
  image: null,
  components: [
    { code: "CBPYCP991", description: "CASE BACK+O'RING CASE BACK VEPY(URBAN M.45M) MARKED", supplier: "VERTIME" },
    { code: "CMPYCP19", description: "CASE COMP.43MM.VEPY BICOL T.P.IP1N/SS WR 5 CAL.VER.M927", supplier: "ROYAL GLORY INTERNATIONAL LTD." },
    { code: "CR2016L", description: "STICKER LABELS FOR BATTERIES CR2016 LITHIUM METAL BATTERY 3.0V", supplier: "CPS BROTHERS LIMITED" },
    { code: "D1PYC1009P", description: "DIAL BLACK IP1N FINISHING VEPYCALIBER VERTIME M927(VEPY)", supplier: "VERTIME" },
    { code: "HSPYC110E", description: "HANDS (SET)VEPY IP-1N LUMINOUSCALIB.VERTIME M927", supplier: "ROYAL GLORY INTERNATIONAL LTD." },
    { code: "MUQA1P9920", description: "BUCKLE COMPLETE STEEL TOUNGUE mm 20 tongue buckle", supplier: "ANKIA (ASIA) LIMITED / FLAT B,13/F,CAPITAL TRADE CENTRE" },
    { code: "SCPY00", description: "CASE SMALL PARTS VEPY CHR.", supplier: "ROYAL GLORY INTERNATIONAL LTD." },
    { code: "SLPYC10090", description: "STR BLACK CALF MODEL VEPY 23/20 MM 119/78 MM", supplier: "ROYAL GLORY INTERNATIONAL LTD." },
    { code: "VEM927/1BN 19", description: "MOVEMENT CAL.M927 AIG.1 WHITE DISC BLACK FIGURE W/O INDIGLO", supplier: "VERTIME" },
    { code: "V14 WHT", description: "PRICE TAGS WHITE 30x15 mm LOGO VERSACE 8381C", supplier: "#N/A" },
    { code: "V15 WHT", description: "LABEL WHITE 27x23 mm", supplier: "#N/A" },
    { code: "WARNINGLAB", description: "WARNING LABELS WITH HOLE_Reese's Law", supplier: "Gatticoplast srl" },
  ],
};

const emptyProfile = () => ({
  week: "", ml: "", brand: "", family: "", famPcs: "", sku: "",
  description: "", pcs: "", wip: "", image: null, components: [],
  caseBackType: "Screwing case back", tasks: {}
});

function DonutChart({ total, defective }) {
  const tot = parseInt(total, 10) || 0;
  const def = parseInt(defective, 10) || 0;
  if (tot === 0) return null;

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const defPercent = def / tot;
  const dash = defPercent * circumference;

  return (
    <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)", display: "block" }}>
      <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--ok)" strokeWidth="6" />
      {def > 0 && (
        <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--danger)" strokeWidth="6"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
      )}
    </svg>
  );
}

const makeSerial = (ml) => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const mlPart = (ml || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9-]/g, "") || "BATCH";
  return `TGQC-${mlPart}-${rand}`;
};

const uid = () => Math.random().toString(36).slice(2, 9);

/* =========================================================
   EXCEL PARSING — client-side extraction
   Reads the uploaded .xlsx file directly in the browser
   using SheetJS and extracts data based on the known format.
========================================================= */
async function extractFromExcel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  
  if (!workbook.SheetNames.length) {
    throw new Error("PARSE_ERROR");
  }
  
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Helper to get cell value safely
  const getCell = (col, row) => {
    const cell = worksheet[XLSX.utils.encode_cell({ c: col, r: row })];
    return cell ? (cell.v !== undefined ? String(cell.v) : String(cell.w || "")) : "";
  };
  
  // Extract main fields based on known structure
  // Note: SheetJS is 0-indexed for rows and cols
  // Week: B1, ML: B2, Brand: B3, Family: B4, Fam Pcs: B5, SKU: B9, Desc: B10, Pcs: B11, WIP: B12
  const week = getCell(1, 0); // B1
  const ml = getCell(1, 1);   // B2
  const brand = getCell(1, 2); // B3
  let family = getCell(1, 3);  // B4
  // Handle edge case where Family might be in C4
  if (!family) {
      family = getCell(2, 3); // C4
  }
  const famPcs = getCell(1, 4); // B5
  
  const sku = getCell(1, 8); // B9
  const description = getCell(1, 9); // B10
  const pcs = getCell(1, 10); // B11
  const wip = getCell(1, 11); // B12
  
  // Extract components (start from row 15 (index 14))
  // Column A: CODE, Column B: DESCRIPTION, Column C: SUPPLIER
  const components = [];
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  
  for (let r = 14; r <= range.e.r; r++) {
    const code = getCell(0, r);
    const desc = getCell(1, r);
    const supplier = getCell(2, r);
    
    // Stop if we hit an empty row or footer
    if (!code && !desc && !supplier) continue;
    
    components.push({
      id: uid(),
      code: code,
      description: desc,
      supplier: supplier
    });
  }
  
  // Extract image if available (images are stored in xl/media/ in the zip)
  let image = null;
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const mediaFiles = Object.keys(zip.files).filter(name => name.startsWith('xl/media/image'));
    if (mediaFiles.length > 0) {
      const imgFile = mediaFiles[0];
      const ext = imgFile.split('.').pop().toLowerCase();
      const mimeMap = {
        png: 'image/png',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        gif: 'image/gif',
        bmp: 'image/bmp'
      };
      const mime = mimeMap[ext] || 'image/png';
      const base64Data = await zip.file(imgFile).async("base64");
      image = `data:${mime};base64,${base64Data}`;
    }
  } catch (err) {
    console.warn("Could not extract image from Excel", err);
  }

  return {
    week,
    ml,
    brand,
    family,
    famPcs,
    sku,
    description,
    pcs,
    wip,
    image,
    components,
  };
}



/* =========================================================
   TRANSLATIONS — Italian is the default language.
========================================================= */
const dict = {
  it: {
    brand: "TIMEX GROUP", dept: "Controllo Qualità Produzione",
    tagline: "Tracciamento digitale di lotti, difetti e operazioni",
    plate: "MOD. TG-QC · REV. 01",
    login: "Accesso", signup: "Registrazione",
    operator: "Operatore", manager: "Responsabile",
    id: "ID Operatore", idPh: "es. OP-1042",
    fullName: "Nome e Cognome", fullNamePh: "es. Marco Bellini",
    password: "Password", confirm: "Conferma Password",
    signInBtn: "Accedi", createBtn: "Crea Account",
    noAccount: "Non hai un account?", haveAccount: "Hai già un account?",
    toSignup: "Registrati", toLogin: "Accedi",
    errRequired: "Compila tutti i campi richiesti.",
    errMismatch: "Le password non coincidono.",
    errInvalid: "ID o password non validi.",
    errRole: "Il ruolo selezionato non corrisponde all'account.",
    errExists: "ID già registrato. Scegline un altro.",
    idTag: "ID", roleTag: "Ruolo", timeTag: "Ora accesso",
    logout: "Esci",
    demoHint: "Credenziali demo",
    demoText: "Operatore → OP-1042 / battery87  ·  Responsabile → RSP-007 / quarzo22",
    demoNote: "Ambiente dimostrativo — i dati non vengono salvati al ricaricamento della pagina.",
    langSwitch: "EN",

    dashboardTitle: "Dashboard",
    welcomeBack: "Bentornato/a",
    newBatchBtn: "Nuovo Lotto",
    batchListTitle: "Lotti Registrati",
    colSku: "SKU", colBrand: "Marchio", colSerial: "N. Serie",
    colPcs: "Pezzi", colStatus: "Stato", colDate: "Creato", colActions: "Azioni",
    statusReady: "Pronto per operatore",
    noBatches: "Nessun lotto registrato. Crea il primo lotto per iniziare.",
    operatorNoAccess: "Solo i Responsabili possono creare nuovi lotti. Qui puoi consultare i lotti registrati.",
    viewQr: "Vedi QR",
    btnViewProfile: "Vedi Profilo", btnAddProduct: "Aggiungi Prodotto",
    scannerTitle: "Scansione Codici a Barre", scannerSubtitle: "Usa un lettore barcode per registrare i prodotti. I salvataggi sono automatici.",
    scannedCount: "Orologi Scansionati", noScans: "Ancora nessuna scansione.",
    scanBarcodeCol: "Codice a Barre", scanTimeCol: "Ora",
    errDuplicate: "Attenzione: codice già registrato!",
    opScanTitle: "Scansione QR Lotto", opScanSubtitle: "Inquadra il QR code sul vassoio per caricare il profilo.",
    opScanErrNotFound: "Lotto non trovato. Riprova o contatta il Responsabile.",
    opConfirmBtn: "Conferma Dati Lotto",
    startScanBtn: "Avvia Fotocamera",
    errCameraPermission: "Permesso fotocamera negato. Ricarica la pagina e consenti l'accesso, oppure sblocca i permessi dalle impostazioni del browser.",
    qcDashTitle: "Controllo Qualità", 
    qcDashSubtitle: "Esegui i controlli per il lotto",
    qcCheck1: "1. Controllo Vite Fondello",
    qcCheck2: "2. Controllo Impermeabilità",
    qcCheck3: "3. Controllo Funzionale (Movimento/Calendario/Cronografo)",
    qcCheck4: "4. Controllo Pre-Assemblaggio",
    qcCheck5: "5. Controllo Assemblaggio Bracciale",
    qcCheck6: "6. Controllo Qualità Finale",
    qcPass: "Passato", qcFail: "Fallito", qcPending: "In attesa",
    scanQrBtn: "Scanner QR", startQcBtn: "Inizia QC",
    wizardTitle: "Nuovo Lotto — Profilo Scheda Tecnica",
    step1: "1. Carica scheda", step2: "2. Verifica profilo", step3: "3. Assegnazione Task",
    uploadPrompt: "Trascina qui la scheda tecnica o seleziona un file",
    uploadHint: "PDF, PNG o JPG",
    browseBtn: "Sfoglia file",
    manualEntry: "Inserisci manualmente, senza scheda",
    scanningTitle: "Scansione in corso…",
    scanSteps: ["Lettura del documento…", "Estrazione dei campi…", "Rilevamento immagine…", "Quasi fatto…"],
    demoNotice: "Dati dimostrativi — estratti dal modello di scheda tecnica caricato in fase di progetto. In produzione questi campi arriveranno da un servizio OCR / di elaborazione documenti collegato al backend.",
    reviewTitle: "Verifica Profilo",
    fieldWeek: "Settimana", fieldML: "ML", fieldBrand: "Marchio",
    fieldCaseBack: "Tipo Fondello",
    fieldFamily: "Famiglia", fieldFamPcs: "Pezzi Famiglia", fieldSku: "SKU",
    fieldDescription: "Descrizione", fieldPcs: "Pezzi", fieldWip: "WIP",
    componentsTitle: "Componenti", colCode: "Codice", colCompDesc: "Descrizione",
    colSupplier: "Fornitore", addRow: "+ Aggiungi riga", removeRow: "Rimuovi",
    imageTitle: "Immagine Prodotto",
    imageMissing: "Immagine non rilevata nella scheda",
    uploadImageManually: "Carica immagine manualmente",
    replaceImage: "Sostituisci immagine",
    cancelBtn: "Annulla", proceedBtn: "Procedi →",
    errRequiredFields: "Compila almeno Marchio, SKU, Descrizione e Pezzi.",
    confirmTitle: "Assegnazione Task",
    serialLabel: "Numero di Serie univoco",
    printQr: "Stampa QR Code",
    lblAssignTo: "Assegna a:",
    lblSelectOp: "Seleziona Operatore...",
    lblAssignedTo: "Assegnato a",
    editDetails: "← Modifica Dettagli",
    saveProfile: "Salva Profilo",
    savedTitle: "Profilo Salvato",
    savedMsg: "Il lotto è stato salvato ed è pronto per l'operatore.",
    backToDashboard: "Torna alla Dashboard",
    qrServiceNote: "QR generato interamente nel browser — nessun servizio esterno richiesto.",
    uploadedAs: "File caricato",
    aiExtractedNotice: "Campi estratti automaticamente dal documento Excel. Verifica e correggi se necessario.",
    extractionError: "Errore durante l'estrazione",
    errParseError: "Impossibile interpretare il file Excel. Verifica che il formato sia corretto.",
    retryBtn: "Riprova",
    enterManuallyBtn: "Inserisci manualmente",
    configureKeyBtn: "Configura chiave API",
    apiKeyTitle: "Impostazioni API Gemini",
    apiKeyDesc: "Inserisci la tua chiave API Google Gemini per abilitare l'estrazione automatica dai documenti. Puoi ottenere una chiave gratuita su aistudio.google.com.",
    apiKeyLabel: "Chiave API",
    apiKeyPlaceholder: "AIza...",
    apiKeySaveBtn: "Salva",
    apiKeyClearBtn: "Cancella",
    apiKeySaved: "✓ Chiave salvata",
    apiKeyNote: "La chiave è salvata solo nel tuo browser (localStorage) e inviata esclusivamente all'API di Google.",
    settingsBtn: "⚙",
    noKeyBanner: "Chiave API Gemini non configurata",
    scanningAI: "Analisi AI in corso…",
    scanStepSending: "Invio del documento a Gemini…",
    scanStepAnalyzing: "Analisi del contenuto…",
    scanStepExtracting: "Lettura del file Excel…",
    lblTotal: "Totale", lblDefective: "Difettosi", lblNonDefective: "Non Difettosi",
    lblLogDefectFor: "Registra difetto per:", lblAddCustomTag: "Aggiungi Tag Personalizzato",
    btnSaveDefect: "Salva Difetto", lblRepairWatch: "Ripara Orologio:",
    lblMarkedDefective: "Questo orologio è stato contrassegnato come difettoso.",
    lblDefectHistory: "Cronologia Difetti:", btnMarkRepaired: "Segna come Riparato",
    lblScannedWatches: "Orologi Scansionati", colHistoryLogs: "Cronologia",
    btnSaveProceed: "Salva dettagli e procedi",
    lblTypeNewDefect: "Digita nuovo nome difetto...",
    scanInstruction: "Scansiona un orologio funzionante per registrare un difetto, o un orologio difettoso per ripararlo.",
    lblEvents: "eventi",
    errBarcodeNotFound: "Codice a barre non trovato in questo lotto.",
    errPendingVerification: "Questo orologio è in attesa di verifica in",
    errDefectMismatch: "Questo orologio è stato contrassegnato come difettoso in",
    errDefectMismatchSuffix: ". Deve essere riparato e verificato in quel controllo.",
    errAnotherCheck: "un altro controllo",
    errSelectTag: "Seleziona almeno un tag difetto.",
    confirmReset: "Reimpostare i progressi per questo controllo?",
    btnResetCheck: "Azzera Controllo",
    qc4PartA: "Parte A: Controllo Cronometrico 24 Ore",
    qc4WarnCheck3: "Attenzione: Il Controllo 3 non è stato completato. Devi completare il Controllo 3 per avviare il timer di 24 ore.",
    qc4PartADesc: "Verificare che il prodotto mantenga l'ora corretta 24 ore dopo l'impostazione iniziale nel Controllo 3.",
    qc4TimerDone: "✓ Timer 24 ore completato. Scansiona qui sotto gli orologi che hanno fallito il test cronometrico.",
    remaining: "rimanenti",
    btnDevBypass: "Ignora Timer 24h",
    btnDevBypassSmall: "[DEV] Ignora Timer",
    qc4PartB: "Parte B: Controllo Campione a 10 Pezzi",
    qc4PartBDesc: "Verificare che i componenti del bracciale siano assemblati correttamente e mantengano la posizione su un campione casuale di 10 pezzi.",
    lblSample: "Campione",
    qc4FailMsg: "Un campione è fallito! L'intero lotto deve fallire il Controllo 4.",
    btnLogFailure: "Registra Fallimento",
    lblCompleteCheck: "Completa questo controllo",
    lblCurrentStatus: "Stato Attuale:",
    tagMap: {
      "Defective screw": "Vite difettosa",
      "Cross Screw defect": "Difetto Vite a Croce",
      "Gasket Defect": "Difetto Guarnizione",
      "Alignment issues": "Problemi di Allineamento",
      "Deformation": "Deformazione",
      "Higher leak rates": "Perdite elevate",
      "Overall Failure": "Fallimento Generale",
      "Faulty Movement": "Movimento Difettoso",
      "Faulty Rotation of hands": "Rotazione lancette difettosa",
      "Calendar rotation error": "Errore rotazione calendario",
      "Chronograph error": "Errore cronografo",
      "Timing too fast": "Cronometria troppo veloce",
      "Timing too slow": "Cronometria troppo lenta",
      "Watch stopped": "Orologio fermo",
      "Bracelet detached": "Bracciale staccato",
      "Spring bar failure": "Rottura ansa a molla",
      "Clasp failure": "Rottura chiusura",
      "Incorrect fit": "Vestibilità errata",
      "Dust under crystal": "Polvere sotto il vetro",
      "Hair under crystal": "Pelo sotto il vetro",
      "Metal shavings/Burrs": "Trucioli di metallo/Bave",
      "Incorrect time/date change": "Cambio ora/data errato",
      "Case scratch": "Graffio cassa",
      "Bezel scratch": "Graffio lunetta",
      "Crystal scratch": "Graffio vetro",
      "Loose case back/screws": "Fondello/viti allentati"
    },
  },
  en: {
    brand: "TIMEX GROUP", dept: "Production Quality Control",
    tagline: "Digital tracking for batches, defects and operations",
    plate: "MOD. TG-QC · REV. 01",
    login: "Sign In", signup: "Sign Up",
    operator: "Operator", manager: "Manager",
    id: "Operator ID", idPh: "e.g. OP-1042",
    fullName: "Full Name", fullNamePh: "e.g. Marco Bellini",
    password: "Password", confirm: "Confirm Password",
    signInBtn: "Sign In", createBtn: "Create Account",
    noAccount: "Don't have an account?", haveAccount: "Already have an account?",
    toSignup: "Sign up", toLogin: "Sign in",
    errRequired: "Fill in all required fields.",
    errMismatch: "Passwords do not match.",
    errInvalid: "Invalid ID or password.",
    errRole: "Selected role does not match this account.",
    errExists: "ID already registered. Choose another.",
    idTag: "ID", roleTag: "Role", timeTag: "Signed in at",
    logout: "Sign out",
    demoHint: "Demo credentials",
    demoText: "Operator → OP-1042 / battery87  ·  Manager → RSP-007 / quarzo22",
    demoNote: "Demo environment — data resets when the page reloads.",
    langSwitch: "IT",

    dashboardTitle: "Dashboard",
    welcomeBack: "Welcome back",
    newBatchBtn: "New Batch",
    batchListTitle: "Registered Batches",
    colSku: "SKU", colBrand: "Brand", colSerial: "Serial No.",
    colPcs: "Pcs", colStatus: "Status", colDate: "Created", colActions: "Actions",
    statusReady: "Ready for operator",
    noBatches: "No batches registered yet. Create the first one to get started.",
    operatorNoAccess: "Only Managers can create new batches. You can review registered batches here.",
    viewQr: "View QR",
    btnViewProfile: "View Profile", btnAddProduct: "Add Product",
    scannerTitle: "Barcode Scanner", scannerSubtitle: "Use a hardware barcode scanner to register products. Saves are automatic.",
    scannedCount: "Scanned Watches", noScans: "No scans yet.",
    scanBarcodeCol: "Barcode", scanTimeCol: "Time",
    errDuplicate: "Warning: Barcode already registered!",
    opScanTitle: "Scan Batch QR", opScanSubtitle: "Scan the QR code on the tray to load the profile.",
    opScanErrNotFound: "Batch not found. Try again or contact your Manager.",
    opConfirmBtn: "Confirm Batch Data",
    startScanBtn: "Start Camera",
    errCameraPermission: "Camera permission denied. Please reload the page and allow access, or unlock permissions in your browser settings.",
    qcDashTitle: "Quality Control", 
    qcDashSubtitle: "Perform quality checks for batch",
    qcCheck1: "1. Screw Caseback Check",
    qcCheck2: "2. Water Resistance Check",
    qcCheck3: "3. Functional Check (Movement/Calendar/Chronograph)",
    qcCheck4: "4. Pre-Assembly Check",
    qcCheck5: "5. Bracelet Assembly Check",
    qcCheck6: "6. Final Quality Inspection",
    qcPass: "Pass", qcFail: "Fail", qcPending: "Pending",
    scanQrBtn: "Scan QR", startQcBtn: "Start QC",
    wizardTitle: "New Batch — Datasheet Profile",
    step1: "1. Upload datasheet", step2: "2. Review profile", step3: "3. Task Allocation",
    uploadPrompt: "Drag the datasheet here or choose a file",
    uploadHint: "PDF, PNG or JPG",
    browseBtn: "Browse file",
    manualEntry: "Enter manually, no datasheet",
    scanningTitle: "Scanning…",
    scanSteps: ["Reading the document…", "Extracting fields…", "Detecting image…", "Almost done…"],
    demoNotice: "Demo data — extracted from the datasheet template shared during setup. In production these fields would come from a backend OCR / document-processing service.",
    reviewTitle: "Review Profile",
    fieldWeek: "Week", fieldML: "ML", fieldBrand: "Brand",
    fieldCaseBack: "Case Back Type",
    fieldFamily: "Family", fieldFamPcs: "Family Pcs", fieldSku: "SKU",
    fieldDescription: "Description", fieldPcs: "Pcs", fieldWip: "WIP",
    componentsTitle: "Components", colCode: "Code", colCompDesc: "Description",
    colSupplier: "Supplier", addRow: "+ Add row", removeRow: "Remove",
    imageTitle: "Product Image",
    imageMissing: "No image detected in the datasheet",
    uploadImageManually: "Upload image manually",
    replaceImage: "Replace image",
    cancelBtn: "Cancel", proceedBtn: "Proceed →",
    errRequiredFields: "Fill in at least Brand, SKU, Description and Pcs.",
    confirmTitle: "Task Assignment",
    serialLabel: "Unique Serial Number",
    printQr: "Print QR Code",
    lblAssignTo: "Assign to:",
    lblSelectOp: "Select Operator...",
    lblAssignedTo: "Assigned to",
    editDetails: "← Edit Details",
    saveProfile: "Save Profile",
    savedTitle: "Profile Saved",
    savedMsg: "The batch has been saved and is ready for the operator.",
    backToDashboard: "Back to Dashboard",
    qrServiceNote: "QR generated entirely in the browser — no external service required.",
    uploadedAs: "Uploaded file",
    aiExtractedNotice: "Fields automatically extracted from the uploaded Excel document. Review and correct as needed.",
    extractionError: "Extraction error",
    errParseError: "Could not parse the Excel file. Make sure the format is correct.",
    retryBtn: "Retry",
    enterManuallyBtn: "Enter manually",
    settingsBtn: "⚙",
    scanStepExtracting: "Reading Excel file…",
    lblTotal: "Total", lblDefective: "Defective", lblNonDefective: "Non Defective",
    lblLogDefectFor: "Log Defect for:", lblAddCustomTag: "Add Custom Tag",
    btnSaveDefect: "Save Defect", lblRepairWatch: "Repair Watch:",
    lblMarkedDefective: "This watch was marked defective.",
    lblDefectHistory: "Defect History:", btnMarkRepaired: "Mark Repaired",
    lblScannedWatches: "Scanned Watches", colHistoryLogs: "History Logs",
    btnSaveProceed: "Save details and proceed",
    lblTypeNewDefect: "Type new defect name...",
    scanInstruction: "Scan a good watch to log a defect, or scan a defective watch to repair it.",
    lblEvents: "events",
    errBarcodeNotFound: "Barcode not found in this batch.",
    errPendingVerification: "This watch is pending verification in",
    errDefectMismatch: "This watch was marked defective in",
    errDefectMismatchSuffix: ". It must be repaired and verified in that same check.",
    errAnotherCheck: "another check",
    errSelectTag: "Please select at least one defect tag.",
    confirmReset: "Reset progress for this check?",
    btnResetCheck: "Reset Check",
    qc4PartA: "Part A: 24-Hour Timing Check",
    qc4WarnCheck3: "Warning: Check 3 has not been completed. You must complete Check 3 to start the 24-hour timer.",
    qc4PartADesc: "Verify that the product keeps the correct time 24 hours after the initial time-setting in Check 3.",
    qc4TimerDone: "✓ 24-Hour Timer Completed. Please scan any watches that failed the timing check below.",
    remaining: "remaining",
    btnDevBypass: "Bypass 24h Timer",
    btnDevBypassSmall: "[DEV] Bypass Timer",
    qc4PartB: "Part B: 10-Piece Sample Check",
    qc4PartBDesc: "Verify that the bracelet components are correctly assembled and hold their position on a random sample of 10 pieces.",
    lblSample: "Sample",
    qc4FailMsg: "A sample has failed! The entire batch must fail Check 4.",
    btnLogFailure: "Log Failure",
    lblCompleteCheck: "Complete this check",
    lblCurrentStatus: "Current Status:",
    tagMap: {},
  },
};

/* =========================================================
   SHARED STYLES
========================================================= */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@500;700&family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap');

      .tgqc-root {
        --bg: #090b0e; --panel: rgba(23, 26, 31, 0.65); --panel-2: rgba(33, 37, 43, 0.5); --line: rgba(255, 255, 255, 0.08);
        --text: #f0f2f5; --text-dim: #9ca3af; --brass: #dfc16d; --brass-dark: #c9a24a;
        --brass-soft: rgba(223, 193, 109, 0.12); --ok: #5c9c74; --ok-soft: rgba(92,156,116,0.12);
        --danger: #e26353; --danger-soft: rgba(226,99,83,0.12);
        font-family: 'Roboto', sans-serif; background: radial-gradient(circle at 50% -20%, #1f242d 0%, var(--bg) 100%);
        background-attachment: fixed; color: var(--text);
        min-height: 100vh; width: 100%;
      }
      .tgqc-display { font-family: 'Roboto Condensed', sans-serif; }
      .tgqc-mono { font-family: 'Roboto Mono', monospace; }

      /* ---- auth screens ---- */
      .tgqc-authwrap { display: flex; align-items: stretch; justify-content: center; min-height: 100vh; padding: 24px; box-sizing: border-box; }
      .tgqc-shell { width: 100%; max-width: 980px; margin: auto; display: grid; grid-template-columns: 1fr;
        border: 1px solid var(--line); background: var(--panel); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 30px 80px -10px rgba(0,0,0,0.8); border-radius: 8px; overflow: hidden; }
      @media (min-width: 860px) { .tgqc-shell { grid-template-columns: 0.9fr 1.1fr; min-height: 600px; } }
      .tgqc-brandpanel { position: relative; background: repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px), radial-gradient(circle at 50% 30%, #23262c 0%, #191b1f 70%);
        border-bottom: 1px solid var(--line); padding: 40px 32px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; }
      @media (min-width: 860px) { .tgqc-brandpanel { border-bottom: none; border-right: 1px solid var(--line); padding: 48px; } }
      .tgqc-dial-wrap { position: relative; width: 176px; height: 176px; }
      .tgqc-tick-rot { position: absolute; inset: 0; }
      .tgqc-tick { position: absolute; top: 6px; left: 50%; width: 1.5px; height: 8px; background: var(--text-dim); transform: translateX(-50%); opacity: 0.55; }
      .tgqc-tick.major { top: 4px; width: 2.5px; height: 13px; background: var(--brass); opacity: 0.9; }
      .tgqc-hand-rot { position: absolute; inset: 0; transform-origin: 50% 50%; animation: tgqc-spin 24s linear infinite; }
      .tgqc-hand { position: absolute; left: 50%; top: 50%; width: 2px; height: 68px; background: var(--brass); transform: translate(-50%, -100%); border-radius: 2px; }
      @keyframes tgqc-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .tgqc-hand-rot { animation: none; transform: rotate(35deg); } }
      .tgqc-dial-rim { position: absolute; inset: 10px; border-radius: 50%; border: 1px solid var(--line); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02), inset 0 8px 20px rgba(0,0,0,0.35); }
      .tgqc-dial-hub { position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; background: var(--brass); border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 8px rgba(201,162,74,0.6); }
      .tgqc-dial-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; flex-direction: column; gap: 2px; }
      .tgqc-dial-qc { font-size: 22px; letter-spacing: 0.12em; font-weight: 600; color: var(--text); }
      .tgqc-dial-sub { font-size: 9px; letter-spacing: 0.16em; color: var(--text-dim); text-transform: uppercase; }
      .tgqc-brandname { font-size: 30px; letter-spacing: 0.08em; font-weight: 700; text-align: center; }
      .tgqc-brandsub { font-size: 14px; color: var(--text-dim); text-align: center; margin-top: 2px; }
      .tgqc-tagline { font-size: 12.5px; color: var(--text-dim); text-align: center; max-width: 260px; line-height: 1.5; }
      .tgqc-plate { font-size: 10.5px; letter-spacing: 0.12em; color: var(--text-dim); border: 1px solid var(--line); padding: 5px 12px; border-radius: 2px; }
      .tgqc-formpanel { padding: 36px 32px 28px; display: flex; flex-direction: column; }
      @media (min-width: 860px) { .tgqc-formpanel { padding: 48px 56px 36px; } }
      .tgqc-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 26px; }
      .tgqc-modelabel { font-size: 26px; letter-spacing: 0.02em; font-weight: 600; }
      .tgqc-langbtn { font-family: 'Roboto Mono', monospace; font-size: 12px; letter-spacing: 0.08em; background: transparent; color: var(--text-dim); border: 1px solid var(--line); padding: 6px 11px; border-radius: 2px; cursor: pointer; transition: all 0.15s ease; }
      .tgqc-langbtn:hover { color: var(--brass); border-color: var(--brass); }
      .tgqc-langbtn:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
      .tgqc-roletabs { display: flex; border: 1px solid var(--line); border-radius: 3px; overflow: hidden; margin-bottom: 22px; }
      .tgqc-roletab { flex: 1; padding: 10px 8px; background: var(--panel-2); color: var(--text-dim); font-size: 13px; letter-spacing: 0.03em; border: none; cursor: pointer; transition: all 0.15s ease; border-right: 1px solid var(--line); }
      .tgqc-roletab:last-child { border-right: none; }
      .tgqc-roletab.active { background: var(--brass-soft); color: var(--brass); font-weight: 600; }
      .tgqc-roletab:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
      .tgqc-field { margin-bottom: 16px; }
      .tgqc-label { display: block; font-size: 11.5px; letter-spacing: 0.06em; color: var(--text-dim); margin-bottom: 6px; text-transform: uppercase; }
      .tgqc-input { width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.25); border: 1px solid var(--line); color: var(--text); padding: 12px 14px; font-size: 14.5px; border-radius: 6px; font-family: 'Roboto Mono', monospace; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
      .tgqc-input::placeholder { color: #5b5e64; }
      .tgqc-input:focus { outline: none; border-color: var(--brass); background: rgba(0,0,0,0.4); box-shadow: 0 0 0 3px var(--brass-soft), inset 0 2px 4px rgba(0,0,0,0.1); }
      .tgqc-input:focus-visible { outline: none; }
      .tgqc-submit { width: 100%; margin-top: 10px; background: linear-gradient(135deg, var(--brass) 0%, var(--brass-dark) 100%); color: #111; border: none; padding: 14px; font-size: 15px; font-weight: 700; letter-spacing: 0.05em; border-radius: 6px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); font-family: 'Roboto', sans-serif; box-shadow: 0 4px 12px rgba(201,162,74,0.15); }
      .tgqc-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(201,162,74,0.3); filter: brightness(1.1); }
      .tgqc-submit:active:not(:disabled) { transform: translateY(0); }
      .tgqc-submit:disabled { opacity: 0.5; cursor: not-allowed; }
      .tgqc-submit:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
      .tgqc-switchrow { text-align: center; margin-top: 18px; font-size: 13px; color: var(--text-dim); }
      .tgqc-switchbtn { background: none; border: none; color: var(--brass); cursor: pointer; font-size: 13px; padding: 0; margin-left: 4px; font-weight: 600; }
      .tgqc-switchbtn:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
      .tgqc-alert { padding: 10px 12px; border-radius: 2px; font-size: 13px; margin-bottom: 16px; border-left: 3px solid var(--danger); background: var(--danger-soft); color: #e0a89f; }
      .tgqc-demo { margin-top: auto; padding-top: 18px; }
      .tgqc-demotoggle { background: none; border: none; color: var(--text-dim); font-size: 11.5px; letter-spacing: 0.04em; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; padding: 0; }
      .tgqc-democontent { margin-top: 8px; font-size: 11.5px; color: var(--text-dim); font-family: 'Roboto Mono', monospace; line-height: 1.6; border: 1px dashed var(--line); padding: 10px 12px; border-radius: 2px; }
      .tgqc-demonote { font-size: 11px; color: #5b5e64; margin-top: 8px; }

      /* ---- app shell (post-login) ---- */
      .tgqc-app-shell { min-height: 100vh; display: flex; flex-direction: column; }
      .tgqc-nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px; border-bottom: 1px solid var(--line); background: rgba(18, 20, 24, 0.75); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); flex-wrap: wrap; gap: 12px; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
      .tgqc-nav-left { display: flex; align-items: center; gap: 12px; }
      .tgqc-navmark { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; letter-spacing: 0.06em; color: var(--brass); font-weight: 600; flex-shrink: 0; }
      .tgqc-navbrand { font-size: 18px; letter-spacing: 0.04em; font-weight: 600; }
      .tgqc-navdept { font-size: 11.5px; color: var(--text-dim); }
      .tgqc-nav-right { display: flex; align-items: center; gap: 10px; }
      .tgqc-rolebadge { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; padding: 5px 10px; border-radius: 2px; border: 1px solid var(--brass); color: var(--brass); background: var(--brass-soft); }
      .tgqc-navname { font-size: 13px; color: var(--text-dim); }
      .tgqc-navbtn { font-family: 'Roboto', sans-serif; font-size: 12.5px; background: transparent; color: var(--text-dim); border: 1px solid var(--line); padding: 8px 14px; border-radius: 4px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
      .tgqc-navbtn:hover { color: var(--text); border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.03); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
      .tgqc-navbtn.brass { background: linear-gradient(135deg, var(--brass) 0%, var(--brass-dark) 100%); color: #111; border: none; font-weight: 600; }
      .tgqc-navbtn.brass:hover { color: #000; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(201,162,74,0.3); filter: brightness(1.1); }
      .tgqc-navbtn:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
      .tgqc-main { flex: 1; padding: 32px 28px 60px; max-width: 1100px; width: 100%; margin: 0 auto; box-sizing: border-box; }

      .tgqc-pagehead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; flex-wrap: wrap; gap: 12px; }
      .tgqc-pagetitle { font-size: 28px; letter-spacing: 0.02em; font-weight: 600; }
      .tgqc-pagesub { font-size: 13px; color: var(--text-dim); margin-top: 2px; }

      .tgqc-card { border: 1px solid var(--line); background: var(--panel); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 8px; padding: 32px; box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
      .tgqc-notice { border-left: 3px solid var(--brass); background: var(--brass-soft); padding: 10px 14px; font-size: 12.5px; color: var(--text-dim); border-radius: 2px; margin-bottom: 20px; line-height: 1.5; }

      .tgqc-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13.5px; }
      .tgqc-table th { text-align: left; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); padding: 12px 14px; border-bottom: 1px solid var(--line); }
      .tgqc-table td { padding: 16px 14px; border-bottom: 1px solid var(--line); transition: background 0.2s ease; }
      .tgqc-table tbody tr { transition: background 0.2s ease, transform 0.2s ease; }
      .tgqc-table tbody tr:hover td { background: rgba(255,255,255,0.03); }
      .tgqc-table tr:last-child td { border-bottom: none; }
      .tgqc-table td.mono, .tgqc-table th.mono { font-family: 'Roboto Mono', monospace; }

      @media (max-width: 760px) {
        .tgqc-table thead { display: none; }
        .tgqc-table tbody tr { display: flex; flex-direction: column; margin-bottom: 16px; border: 1px solid var(--line); border-radius: 8px; background: rgba(0,0,0,0.15); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .tgqc-table td { display: block; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .tgqc-table td:last-child { border-bottom: none; }
      }

      .tgqc-empty { padding: 40px 10px; text-align: center; color: var(--text-dim); font-size: 13.5px; }
      .tgqc-statuspill { display: inline-block; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 9px; border-radius: 10px; border: 1px solid var(--ok); color: var(--ok); background: var(--ok-soft); }
      .tgqc-linkbtn { background: none; border: none; color: var(--brass); cursor: pointer; font-size: 12.5px; padding: 0; text-decoration: underline; text-underline-offset: 2px; }

      /* ---- wizard ---- */
      .tgqc-steps { display: flex; gap: 6px; margin-bottom: 24px; flex-wrap: wrap; }
      .tgqc-stepchip { font-size: 11.5px; letter-spacing: 0.03em; padding: 6px 12px; border-radius: 12px; border: 1px solid var(--line); color: var(--text-dim); }
      .tgqc-stepchip.active { border-color: var(--brass); color: var(--brass); background: var(--brass-soft); }
      .tgqc-stepchip.done { border-color: var(--ok); color: var(--ok); }

      .tgqc-dropzone { border: 1.5px dashed var(--line); border-radius: 4px; padding: 52px 24px; text-align: center; cursor: pointer; transition: all 0.15s ease; background: var(--panel-2); }
      .tgqc-dropzone:hover, .tgqc-dropzone.dragover { border-color: var(--brass); background: var(--brass-soft); }
      .tgqc-dropzone:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
      .tgqc-uploadicon { font-size: 30px; margin-bottom: 12px; color: var(--brass); }
      .tgqc-uploadprompt { font-size: 15px; margin-bottom: 4px; }
      .tgqc-uploadhint { font-size: 12px; color: var(--text-dim); }

      .tgqc-scanwrap { padding: 60px 24px; text-align: center; }
      .tgqc-scanring { width: 64px; height: 64px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--brass); margin: 0 auto 22px; animation: tgqc-scan-spin 1s linear infinite; }
      @keyframes tgqc-scan-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .tgqc-scanring { animation: none; } }
      .tgqc-scanstatus { font-size: 14px; color: var(--text-dim); font-family: 'Roboto Mono', monospace; }

      .tgqc-formgrid { display: grid; grid-template-columns: 1fr; gap: 16px 20px; margin-bottom: 22px; }
      @media (min-width: 700px) { .tgqc-formgrid { grid-template-columns: repeat(3, 1fr); } }
      .tgqc-formgrid .span2 { grid-column: span 1; }
      @media (min-width: 700px) { .tgqc-formgrid .span2 { grid-column: span 2; } }
      @media (min-width: 700px) { .tgqc-formgrid .span3 { grid-column: span 3; } }
      .tgqc-textarea { width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.25); border: 1px solid var(--line); color: var(--text); padding: 14px 16px; font-size: 14.5px; border-radius: 6px; font-family: 'Roboto Mono', monospace; resize: vertical; min-height: 80px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
      .tgqc-textarea:focus { outline: none; border-color: var(--brass); background: rgba(0,0,0,0.4); box-shadow: 0 0 0 3px var(--brass-soft), inset 0 2px 4px rgba(0,0,0,0.1); }

      .tgqc-sectiontitle { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); margin: 26px 0 12px; padding-top: 20px; border-top: 1px solid var(--line); }
      .tgqc-sectiontitle:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }

      .tgqc-imgbox { border: 1px solid var(--line); border-radius: 3px; background: var(--panel-2); aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 12px; }
      .tgqc-imgbox img { width: 100%; height: 100%; object-fit: contain; }
      .tgqc-imgmissing { text-align: center; color: var(--text-dim); font-size: 12.5px; padding: 16px; }
      .tgqc-imgmissing-icon { font-size: 26px; margin-bottom: 8px; opacity: 0.6; }

      .tgqc-comprow { display: grid; grid-template-columns: 1fr; gap: 8px; margin-bottom: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 2px; background: var(--panel-2); }
      @media (min-width: 700px) { .tgqc-comprow { grid-template-columns: 1fr 2fr 1.4fr auto; align-items: center; gap: 10px; } }
      .tgqc-comprow input { background: var(--panel); border: 1px solid var(--line); color: var(--text); padding: 8px 9px; font-size: 12.5px; border-radius: 2px; font-family: 'Roboto Mono', monospace; width: 100%; box-sizing: border-box; }
      .tgqc-comprow input:focus { outline: none; border-color: var(--brass); }
      .tgqc-removebtn { background: none; border: 1px solid var(--line); color: var(--danger); font-size: 11.5px; padding: 7px 10px; border-radius: 2px; cursor: pointer; white-space: nowrap; }
      .tgqc-removebtn:hover { border-color: var(--danger); }
      .tgqc-addbtn { background: none; border: 1px dashed var(--line); color: var(--brass); font-size: 12.5px; padding: 9px; border-radius: 2px; cursor: pointer; width: 100%; margin-top: 4px; }
      .tgqc-addbtn:hover { border-color: var(--brass); }

      .tgqc-actionrow { display: flex; justify-content: flex-end; gap: 10px; margin-top: 26px; flex-wrap: wrap; }
      .tgqc-btn { font-family: 'Roboto', sans-serif; font-size: 13.5px; padding: 12px 24px; border-radius: 6px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid var(--line); background: rgba(255,255,255,0.03); color: var(--text); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .tgqc-btn:not(.primary):hover:not(:disabled) { border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.3); }
      .tgqc-btn:active:not(:disabled) { transform: translateY(0); }
      .tgqc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .tgqc-btn.primary { background: linear-gradient(135deg, var(--brass) 0%, var(--brass-dark) 100%); color: #111; border: none; font-weight: 700; box-shadow: 0 4px 12px rgba(201,162,74,0.15); }
      .tgqc-btn.primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(201,162,74,0.3); filter: brightness(1.1); background: linear-gradient(135deg, var(--brass) 0%, var(--brass-dark) 100%); }
      .tgqc-btn:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }

      .tgqc-confirmgrid { display: grid; grid-template-columns: 1fr; gap: 28px; align-items: start; }
      @media (min-width: 760px) { .tgqc-confirmgrid { grid-template-columns: 280px 1fr; } }
      .tgqc-qrbox { border: 1px solid var(--line); background: #fff; border-radius: 3px; padding: 16px; text-align: center; }
      .tgqc-qrbox img { width: 100%; max-width: 220px; height: auto; display: block; margin: 0 auto; }
      .tgqc-serial { font-family: 'Roboto Mono', monospace; font-size: 16px; letter-spacing: 0.03em; background: var(--panel-2); border: 1px solid var(--line); padding: 12px 14px; border-radius: 2px; margin: 14px 0; word-break: break-all; text-align: center; }
      .tgqc-summaryrow { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
      .tgqc-summarylabel { color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
      .tgqc-summaryval { font-family: 'Roboto Mono', monospace; text-align: right; }

      .tgqc-savedwrap { max-width: 480px; margin: 60px auto; text-align: center; }
      .tgqc-stamp { display: inline-block; border: 1px solid var(--ok); color: var(--ok); background: var(--ok-soft); font-size: 11px; letter-spacing: 0.14em; padding: 5px 14px; border-radius: 2px; margin-bottom: 18px; text-transform: uppercase; }

      /* ---- print ---- */
      .tgqc-print-area { display: none; }
      @media print {
        .tgqc-authwrap, .tgqc-nav, .tgqc-pagehead, .tgqc-steps, .tgqc-card, .tgqc-savedwrap, .tgqc-notice { display: none !important; }
        .tgqc-main { padding: 0 !important; max-width: none !important; }
        .tgqc-print-area { display: flex !important; flex-direction: column; align-items: center; gap: 14px; padding: 40px; }
        .tgqc-print-area svg { width: 240px; height: 240px; }
      }

      /* ---- modal / settings dialog ---- */
      .tgqc-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; box-sizing: border-box; animation: tgqc-fade-in 0.15s ease; }
      @keyframes tgqc-fade-in { from { opacity: 0; } to { opacity: 1; } }
      .tgqc-modal { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; width: 100%; max-width: 460px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); animation: tgqc-slide-up 0.2s ease; }
      @keyframes tgqc-slide-up { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .tgqc-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--line); }
      .tgqc-modal-close { background: none; border: none; color: var(--text-dim); font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 2px; transition: color 0.15s; }
      .tgqc-modal-close:hover { color: var(--text); }
      .tgqc-modal-body { padding: 22px; }

      /* ---- scan error state ---- */
      .tgqc-scan-error { padding: 40px 24px; text-align: center; }
      .tgqc-scan-error-icon { font-size: 36px; margin-bottom: 14px; opacity: 0.7; }
      .tgqc-scan-error-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
      .tgqc-scan-error-msg { font-size: 13px; color: var(--text-dim); line-height: 1.5; margin-bottom: 22px; max-width: 360px; margin-left: auto; margin-right: auto; }
      .tgqc-scan-error-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

      /* ---- settings key indicator ---- */
      .tgqc-keydot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-left: 5px; vertical-align: middle; }
      .tgqc-keydot.on { background: var(--ok); box-shadow: 0 0 6px rgba(92,156,116,0.5); }
      .tgqc-keydot.off { background: var(--danger); box-shadow: 0 0 6px rgba(189,90,76,0.4); }

      /* ---- no-key banner ---- */
      .tgqc-nokey-banner { border-left: 3px solid var(--danger); background: var(--danger-soft); padding: 10px 14px; font-size: 12.5px; color: #e0a89f; border-radius: 2px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    `}</style>
  );
}

/* =========================================================
   AUTH SCREENS (login / signup)
========================================================= */
function AuthScreen({ lang, setLang, t, onLogin }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("operator");
  const [users, setUsers] = useState(seedUsers);
  const [form, setForm] = useState({ id: "", name: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => { setError(""); }, [mode, role, lang]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const resetForm = () => setForm({ id: "", name: "", password: "", confirm: "" });

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.id.trim() || !form.password) return setError(t.errRequired);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.id.trim(), password: form.password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      if (data.user.role !== role) throw new Error(t.errRole);
      
      setError("");
      onLogin({ ...data.user, token: data.token });
    } catch (err) {
      if (err.message === "Failed to fetch") {
        setError("Network error: Cannot connect to the server.");
      } else {
        setError(err.message === t.errRole ? t.errRole : (err.message || t.errInvalid));
      }
    }
  };

  const handleSignup = (e) => {
    e.preventDefault();
    setError("Signup is disabled. Please ask an admin to create an account.");
  };

  return (
    <div className="tgqc-authwrap">
      <div className="tgqc-shell">
        <div className="tgqc-brandpanel">
          <div className="tgqc-dial-wrap">
            <div className="tgqc-dial-rim" />
            {Array.from({ length: 60 }).map((_, i) => (
              <div key={i} className="tgqc-tick-rot" style={{ transform: `rotate(${i * 6}deg)` }}>
                <div className={`tgqc-tick${i % 5 === 0 ? " major" : ""}`} />
              </div>
            ))}
            <div className="tgqc-hand-rot"><div className="tgqc-hand" /></div>
            <div className="tgqc-dial-hub" />
            <div className="tgqc-dial-center">
              <div className="tgqc-dial-qc tgqc-display">QC</div>
              <div className="tgqc-dial-sub tgqc-mono">TG · IT</div>
            </div>
          </div>
          <div>
            <div className="tgqc-brandname tgqc-display">{t.brand}</div>
            <div className="tgqc-brandsub">{t.dept}</div>
          </div>
          <div className="tgqc-tagline">{t.tagline}</div>
          <div className="tgqc-plate tgqc-mono">{t.plate}</div>
        </div>

        <div className="tgqc-formpanel">
          <div className="tgqc-topbar">
            <div className="tgqc-modelabel tgqc-display">{mode === "login" ? t.login : t.signup}</div>
            <button className="tgqc-langbtn" onClick={() => setLang((l) => (l === "it" ? "en" : "it"))} aria-label="Switch language">
              {t.langSwitch}
            </button>
          </div>

          <div className="tgqc-roletabs" role="tablist" aria-label="role">
            <button className={`tgqc-roletab${role === "operator" ? " active" : ""}`} onClick={() => setRole("operator")} role="tab" aria-selected={role === "operator"}>{t.operator}</button>
            <button className={`tgqc-roletab${role === "manager" ? " active" : ""}`} onClick={() => setRole("manager")} role="tab" aria-selected={role === "manager"}>{t.manager}</button>
          </div>

          {error && <div className="tgqc-alert">{error}</div>}

          <form onSubmit={mode === "login" ? handleLogin : handleSignup} noValidate>
            {mode === "signup" && (
              <div className="tgqc-field">
                <label className="tgqc-label">{t.fullName}</label>
                <input className="tgqc-input" style={{ fontFamily: "'Roboto', sans-serif" }} type="text" placeholder={t.fullNamePh} value={form.name} onChange={update("name")} />
              </div>
            )}
            <div className="tgqc-field">
              <label className="tgqc-label">{t.id}</label>
              <input className="tgqc-input" type="text" placeholder={t.idPh} value={form.id} onChange={update("id")} autoCapitalize="none" />
            </div>
            <div className="tgqc-field">
              <label className="tgqc-label">{t.password}</label>
              <input className="tgqc-input" type="password" value={form.password} onChange={update("password")} />
            </div>
            {mode === "signup" && (
              <div className="tgqc-field">
                <label className="tgqc-label">{t.confirm}</label>
                <input className="tgqc-input" type="password" value={form.confirm} onChange={update("confirm")} />
              </div>
            )}
            <button type="submit" className="tgqc-submit">{mode === "login" ? t.signInBtn : t.createBtn}</button>
          </form>

          <div className="tgqc-switchrow">
            {mode === "login" ? t.noAccount : t.haveAccount}
            <button className="tgqc-switchbtn" onClick={() => { setMode((m) => (m === "login" ? "signup" : "login")); resetForm(); }}>
              {mode === "login" ? t.toSignup : t.toLogin}
            </button>
          </div>

          {mode === "login" && (
            <div className="tgqc-demo">
              <button className="tgqc-demotoggle" onClick={() => setShowDemo((s) => !s)}>{t.demoHint}</button>
              {showDemo && <div className="tgqc-democontent">{t.demoText}</div>}
              <div className="tgqc-demonote">{t.demoNote}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DigitalClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const h = (time.getHours() % 12 || 12).toString().padStart(2, '0');
  const m = time.getMinutes().toString().padStart(2, '0');
  const s = time.getSeconds().toString().padStart(2, '0');
  const ampm = time.getHours() >= 12 ? 'PM' : 'AM';

  return (
    <div style={{ 
      fontFamily: "'Roboto Mono', monospace", 
      background: "var(--panel-2)", 
      color: "var(--text)",      
      padding: "8px 16px", 
      borderRadius: "6px", 
      border: "1px solid var(--line)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      display: "flex", 
      alignItems: "center",
      gap: "8px",
      fontWeight: 500,
      letterSpacing: "0.05em",
      marginRight: "16px",
    }}>
      <div style={{ fontSize: "20px", display: "flex", alignItems: "center" }}>
        <span>{h}</span>
        <span style={{ opacity: time.getSeconds() % 2 === 0 ? 1 : 0.3, margin: "0 2px", color: "var(--brass)" }}>:</span>
        <span>{m}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", fontSize: "10px", lineHeight: 1.2, color: "var(--text-dim)" }}>
        <span style={{ fontWeight: 700 }}>{ampm}</span>
        <span style={{ color: "var(--brass)", fontWeight: 700 }}>{s}</span>
      </div>
    </div>
  );
}

/* =========================================================
   USER ACTIVITY VIEW
========================================================= */
function UserActivityView({ t, session, onBack }) {
  const [logs, setLogs] = useState([]);
  
  useEffect(() => {
    fetch(`${API_URL}/activity/${session.name}`, {
      headers: { "Authorization": `Bearer ${session.token}` }
    })
    .then(r => r.json())
    .then(data => setLogs(data))
    .catch(e => console.error(e));
  }, [session]);

  const exportToNumbers = () => {
    if (logs.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(logs.map(l => ({
      "Date/Time": l.timestamp,
      "Watch and Batch details": l.barcode ? `Batch: ${l.batch_id} | Watch: ${l.barcode}` : `Batch: ${l.batch_id}`,
      "Task": l.task,
      "Number of units": l.units
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Activity Log");
    XLSX.writeFile(wb, `Activity_Log_${session.name}.xlsx`);
  };

  return (
    <div className="tgqc-main" style={{ maxWidth: 800, margin: "0 auto" }}>
      <div className="tgqc-pagehead">
        <div>
          <div className="tgqc-pagetitle tgqc-display">My Work</div>
          <div className="tgqc-pagesub">Activity Log for {session.name}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="tgqc-btn brass" onClick={exportToNumbers}>Export to Numbers</button>
          <button className="tgqc-btn" onClick={onBack}>{t.backToDashboard || "Back"}</button>
        </div>
      </div>
      
      <div className="tgqc-card">
        {logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>No activity logged today.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", gap: 16, justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", padding: 16, borderRadius: 8, flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Total Watches Worked On</div>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "var(--brass)" }}>{logs.reduce((s, l) => (l.task && l.task.startsWith("QC") ? s + (parseInt(l.units)||0) : s), 0)}</div>
              </div>
              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", padding: 16, borderRadius: 8, flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Total Defects</div>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "#e11d48" }}>{logs.reduce((s, l) => (l.task && l.task.startsWith("Logged Defect") ? s + (parseInt(l.units)||0) : s), 0)}</div>
              </div>
              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", padding: 16, borderRadius: 8, flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Total After Repair</div>
                <div style={{ fontSize: 24, fontWeight: "bold", color: "var(--ok)" }}>{logs.reduce((s, l) => (l.task && l.task.startsWith("Repaired Defect") ? s + (parseInt(l.units)||0) : s), 0)}</div>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="tgqc-table">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Date/Time</th>
                    <th className="mono">SKU</th>
                    <th>Brand</th>
                    <th className="mono">ML</th>
                    <th className="mono">Fam Pcs</th>
                    <th className="mono">Pcs</th>
                    <th>Task</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td className="mono" style={{ fontSize: 13, color: "var(--text-dim)" }}>{log.timestamp}</td>
                      <td className="mono">{log.sku}</td>
                      <td>{log.brand}</td>
                      <td className="mono">{log.ml}</td>
                      <td className="mono">{log.batchFamPcs}</td>
                      <td className="mono">{log.batchPcs}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{log.task}</span>
                        {log.barcode && <span style={{ opacity: 0.7, fontSize: 12, marginLeft: 8 }}>(Watch: {log.barcode})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   TOP NAV
========================================================= */
function TopNav({ t, lang, setLang, session, onLogout, view, setView }) {
  return (
    <div className="tgqc-nav">
      <div className="tgqc-nav-left" style={{ cursor: "pointer" }} onClick={() => setView("dashboard")}>
        <div className="tgqc-navmark tgqc-display">QC</div>
        <div>
          <div className="tgqc-navbrand tgqc-display">{t.brand}</div>
          <div className="tgqc-navdept">{t.dept}</div>
        </div>
      </div>
      <div className="tgqc-nav-right">
        {session.role === "manager" && (
          <button 
            className="tgqc-navbtn" 
            style={{ color: "var(--err)" }}
            onClick={() => {
              if (window.confirm("WARNING: This will delete ALL data, users, and batches. Are you sure?")) {
                localStorage.clear();
                window.location.reload();
              }
            }}
          >
            Factory Reset
          </button>
        )}
        <DigitalClock />
        <span className="tgqc-rolebadge">{session.role === "operator" ? t.operator : t.manager}</span>
        <span className="tgqc-navname">{session.name}</span>
        <style>{`
          .ai-logo-img {
            transition: all 0.3s ease;
          }
          .ai-logo-img:hover {
            box-shadow: 0 0 20px rgba(223, 193, 109, 0.8), 0 0 40px rgba(223, 193, 109, 0.4) !important;
            transform: scale(1.05);
          }
        `}</style>
        <button className="tgqc-navbtn" style={{ padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center", border: 'none', background: 'transparent', transform: 'scale(1.1)', margin: '0 8px' }} onClick={() => setView("ai-analyst")} title="AI Analyst">
          <img className="ai-logo-img" src="/ai_logo.png?v=7" alt="AI Analyst" style={{ height: '56px', width: '56px', borderRadius: '50%', border: '2px solid #dfc16d', boxShadow: '0 0 10px rgba(223, 193, 109, 0.4)', objectFit: 'cover' }} />
        </button>
        <button className="tgqc-navbtn" style={{ fontWeight: "bold" }} onClick={() => setView("activityLog")}>My Work</button>
        <button className="tgqc-navbtn brass" onClick={() => setLang((l) => (l === "it" ? "en" : "it"))}>{t.langSwitch}</button>
        <button className="tgqc-navbtn" onClick={onLogout}>{t.logout}</button>
      </div>
    </div>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */
function ManagerDetailedStats({ batch, t }) {
  const checks = [
    { key: "check1", label: t.qcCheck1 || "Check 1" },
    { key: "check2", label: t.qcCheck2 || "Check 2" },
    { key: "check3", label: t.qcCheck3 || "Check 3" },
    { key: "check4_partA", label: t.qcCheck4 || "Check 4" },
    { key: "check5", label: t.qcCheck5 || "Check 5" },
    { key: "check6", label: t.qcCheck6 || "Check 6" }
  ];

  const legacyMap = {
    "Cross Screw defect": "check1", "Gasket Defect": "check1", "Alignment issues": "check1",
    "Deformation": "check2", "Higher leak rates": "check2", "Overall Failure": "check2",
    "Faulty Movement": "check3", "Faulty Rotation of hands": "check3", "Calendar rotation error": "check3", "Chronograph error": "check3",
    "Timing too fast": "check4_partA", "Timing too slow": "check4_partA", "Watch stopped": "check4_partA",
    "Bracelet detached": "check5", "Spring bar failure": "check5", "Clasp failure": "check5", "Incorrect fit": "check5"
  };

  const calcStats = (checkKey) => {
    let defCount = 0;
    let repCount = 0;
    (batch.scannedWatches || []).forEach(w => {
       let hasDefectForThisCheck = false;
       let hasRepairForThisCheck = false;
       let currentLegacyCheckContext = null;

       w.history.forEach(h => {
         if (h.action.startsWith("Logged Defect")) {
           if (h.action === `Logged Defect (${checkKey})`) {
             hasDefectForThisCheck = true;
             currentLegacyCheckContext = checkKey;
           } else if (h.action === "Logged Defect") {
             let mappedCheck = null;
             if (h.tags && h.tags.length > 0) {
               for (const t of h.tags) {
                 if (legacyMap[t]) mappedCheck = legacyMap[t];
               }
             }
             if (!mappedCheck) mappedCheck = "check1";
             currentLegacyCheckContext = mappedCheck;
             if (mappedCheck === checkKey) hasDefectForThisCheck = true;
           } else {
             currentLegacyCheckContext = null;
           }
         } else if (h.action.startsWith("Repaired")) {
           if (h.action === `Repaired (${checkKey})`) {
             hasRepairForThisCheck = true;
           } else if (h.action === "Repaired" && currentLegacyCheckContext === checkKey) {
             hasRepairForThisCheck = true;
           }
         }
       });

       if (hasDefectForThisCheck) defCount++;
       if (hasRepairForThisCheck) repCount++;
    });
    return { defCount, repCount };
  };

  const total = batch.pcs || 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 10 }}>
       {checks.map(chk => {
          const stats = calcStats(chk.key);
          return (
             <div key={chk.key} style={{ background: "var(--bg)", padding: 16, borderRadius: 8, border: "1px solid var(--border)", textAlign: "left", display: "flex", flexDirection: "column" }}>
               <div style={{ fontWeight: "bold", marginBottom: 12, color: "var(--brass)", wordBreak: "break-word", overflowWrap: "break-word", lineHeight: 1.4 }}>{chk.label}</div>
               <div style={{ fontSize: 13, marginBottom: 4 }}><span style={{ color: "var(--text-dim)" }}>Total Pcs:</span> {total}</div>
               <div style={{ fontSize: 13, marginBottom: 4 }}><span style={{ color: "var(--text-dim)" }}>Defective Pcs:</span> <span style={{ color: stats.defCount > 0 ? "var(--err)" : "inherit" }}>{stats.defCount}</span></div>
               <div style={{ fontSize: 13, marginBottom: 4 }}><span style={{ color: "var(--text-dim)" }}>Reworked Pcs:</span> <span style={{ color: stats.repCount > 0 ? "#10b981" : "inherit" }}>{stats.repCount}</span></div>
               <div style={{ fontSize: 13 }}><span style={{ color: "var(--text-dim)" }}>Defects after rework:</span> <span style={{ color: (stats.defCount - stats.repCount) > 0 ? "var(--err)" : "inherit" }}>{stats.defCount - stats.repCount}</span></div>
             </div>
          );
       })}
    </div>
  );
}

const extractOriginCheckKey = (watch) => {
  if (!watch.history) return null;
  const lastDefectLog = watch.history.slice().reverse().find(h => h.action.startsWith("Logged Defect"));
  if (!lastDefectLog) return null;
  const match = lastDefectLog.action.match(/\(([^)]+)\)/);
  return match ? match[1] : null;
};

function Dashboard({ t, session, batches, setView, onViewProfile, onAddProduct, onOpenQCDefectLogging, onOpenGenericQC, onDeleteBatch, onResetBatch, onSaveBatch, onOpenQC4, lang }) {
  const isManager = session.role === "manager";
  const [expandedBatches, setExpandedBatches] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const toggleExpand = (id) => setExpandedBatches(prev => ({...prev, [id]: !prev[id]}));

  const parseDateString = (dateStr) => {
    if (!dateStr) return 0;
    
    // Handle DD/MM/YYYY legacy format explicitly
    if (dateStr.includes('/')) {
      const [datePart, timePart] = dateStr.split(', ');
      const parts = datePart.split('/');
      if (parts.length === 3) {
        const parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}${timePart ? 'T' + timePart : 'T00:00:00'}`).getTime();
        if (!isNaN(parsed)) return parsed;
      }
    }

    const parsed = new Date(dateStr).getTime();
    if (!isNaN(parsed) && parsed !== 0) return parsed;
    return 0;
  };

  const formatDateString = (dateStr) => {
    if (!dateStr) return "";
    let d;
    
    if (dateStr.includes('/')) {
      const parts = dateStr.split(',')[0].split('/');
      if (parts.length === 3) {
        d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
      }
    } else {
      d = new Date(dateStr);
    }
    
    if (!d || isNaN(d.getTime())) return dateStr.split(',')[0];
    return new Intl.DateTimeFormat(lang === "it" ? "it-IT" : "en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(d);
  };

  const displayBatches = batches.sort((a, b) => parseDateString(b.createdAt) - parseDateString(a.createdAt));

  const activeBatches = displayBatches.filter(b => {
    if (b.isSaved) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const sku = (b.sku || "").toLowerCase();
      const ml = (b.ml || "").toLowerCase();
      if (!sku.includes(q) && !ml.includes(q)) return false;
    }
    return true;
  });
  const savedBatches = displayBatches.filter(b => b.isSaved);

  const [selectedMonth, setSelectedMonth] = useState("all");

  const availableMonths = [...new Set(savedBatches.map(b => {
    const d = new Date(parseDateString(b.createdAt));
    return d.toISOString().substring(0, 7);
  }))].sort().reverse();

  const filteredSavedBatches = selectedMonth === "all" ? savedBatches : savedBatches.filter(b => {
    const d = new Date(parseDateString(b.createdAt));
    return d.toISOString().substring(0, 7) === selectedMonth;
  });

  const savedBatchesByDate = filteredSavedBatches.reduce((acc, b) => {
    const formattedDate = formatDateString(b.createdAt);
    if (!acc[formattedDate]) acc[formattedDate] = [];
    acc[formattedDate].push(b);
    return acc;
  }, {});

  const [showExportPreview, setShowExportPreview] = useState(false);
  const [exportPreviewData, setExportPreviewData] = useState([]);

  const generateExportData = () => {
    const headers = [
      'Year 2025 Month', 'Day', 'Line Description', 'Production n.', 'Family code', 'Item Code', 
      'Qty scheduled', 'Qty Assembled', 'Rejected post production', '%', 
      'Rejected to be polished', '%', 'DIFFERENCE REJECTED/DEFECTIVES', 
      'DEFECTIVE SUM', 
      'No WR', 'Defective Cases Back', 'Defective screws', 
      'Defective movements', 'Defective Crowns/ Stems', 'Defective/disaligned Dials', 
      'Defective/disaligned Hands', 'Defective Jump of calendary', 
      'Defective cases, glasses', 'Defective top rings', 'Defective Pushers', 
      'Dust under glasses'
    ];
    
    const rows = [headers];
    const mlSeen = new Set();

    filteredSavedBatches.forEach(b => {
      const uploadMonth = new Date(parseDateString(b.createdAt)).getMonth() + 1;
      
      let maxTimestamp = parseDateString(b.createdAt);
      b.scannedWatches?.forEach(w => {
         w.history?.forEach(h => {
             const ht = parseDateString(h.timestamp);
             if (ht > maxTimestamp) maxTimestamp = ht;
         });
      });
      const dayCompleted = new Date(maxTimestamp).getDate();
      
      const lineDescription = b.description || '';
      const productionNumber = b.ml || '';
      const skuParts = b.sku ? b.sku.split(' ') : [];
      let familyCode = b.family || (skuParts.length > 1 ? skuParts[1] : '');
      let itemCode = b.sku || '';

      let scheduled = '';
      if (!mlSeen.has(b.ml)) {
        scheduled = parseInt(b.famPcs) || parseInt(b.pcs) || 0;
        if (b.ml) mlSeen.add(b.ml);
      }
      
      let rejectedToPolished = 0; 
      let defectCounts = {};

      let check1CaseBackCount = 0;
      let check1ScrewCount = 0;
      let check2WRCount = 0;
      
      let check3MovementsCount = 0;
      let check3CrownsCount = 0;
      let check3DialsCount = 0;
      let check3HandsCount = 0;
      let check3JumpCount = 0;
      
      let check6CasesGlassesCount = 0;
      let check6TopRingsCount = 0;
      let check6PushersCount = 0;
      let check6DustCount = 0;

      b.scannedWatches?.forEach(w => {
         let wCheck1CaseBack = 0;
         let wCheck1Screw = 0;
         let wCheck2WR = 0;
         
         let wCheck3Movements = 0;
         let wCheck3Crowns = 0;
         let wCheck3Dials = 0;
         let wCheck3Hands = 0;
         let wCheck3Jump = 0;
         
         let wCheck6CasesGlasses = 0;
         let wCheck6TopRings = 0;
         let wCheck6Pushers = 0;
         let wCheck6Dust = 0;

         w.history?.forEach(h => {
            if (h.action.startsWith("Logged Defect")) {
               const match = h.action.match(/\(([^)]+)\)/);
               const chkKey = match ? match[1] : null;

               if (chkKey === "check2") {
                  wCheck2WR = 1;
               } else if (chkKey === "check1") {
                  if (b.caseBackType === "4 Screws Case back") {
                      wCheck1Screw = 1;
                  } else {
                      wCheck1CaseBack = 1;
                  }
               }
               
               const processTags = (tags) => {
                 tags.forEach(t => {
                   const tl = t.toLowerCase();
                   defectCounts[tl] = (defectCounts[tl] || 0) + 1;
                   if (tl.includes("polish") || tl.includes("lucid")) rejectedToPolished++;
                   
                   if (chkKey === "check3") {
                     if (tl.includes("movement") || tl.includes("moviment")) wCheck3Movements = 1;
                     if (tl.includes("crown") || tl.includes("stem") || tl.includes("coron")) wCheck3Crowns = 1;
                     if (tl.includes("dial") || tl.includes("quadrant")) wCheck3Dials = 1;
                     if (tl.includes("hand") || tl.includes("sfera") || tl.includes("sfere")) wCheck3Hands = 1;
                     if (tl.includes("jump") || tl.includes("calendar") || tl.includes("data")) wCheck3Jump = 1;
                   }
                   
                   if (chkKey === "check6") {
                     if (tl.includes("case") || tl.includes("glass") || tl.includes("vetro") || tl.includes("cass")) wCheck6CasesGlasses = 1;
                     if (tl.includes("top ring") || tl.includes("ghier") || tl.includes("bezel")) wCheck6TopRings = 1;
                     if (tl.includes("pusher") || tl.includes("pulsant")) wCheck6Pushers = 1;
                     if (tl.includes("dust") || tl.includes("polvere")) wCheck6Dust = 1;
                   }
                 });
               };

               if (h.tags) {
                 processTags(h.tags);
               } else {
                  const parts = h.action.split(":");
                  if (parts.length > 1) {
                     const tags = parts[1].split(",").map(t => t.trim().toLowerCase());
                     processTags(tags);
                  }
               }
            }
         });
         check1CaseBackCount += wCheck1CaseBack;
         check1ScrewCount += wCheck1Screw;
         check2WRCount += wCheck2WR;
         
         check3MovementsCount += wCheck3Movements;
         check3CrownsCount += wCheck3Crowns;
         check3DialsCount += wCheck3Dials;
         check3HandsCount += wCheck3Hands;
         check3JumpCount += wCheck3Jump;
         
         check6CasesGlassesCount += wCheck6CasesGlasses;
         check6TopRingsCount += wCheck6TopRings;
         check6PushersCount += wCheck6Pushers;
         check6DustCount += wCheck6Dust;
      });
      
      const rejectedPostProduction = check1CaseBackCount + check1ScrewCount + check2WRCount + 
                           check3MovementsCount + check3CrownsCount + check3DialsCount + 
                           check3HandsCount + check3JumpCount + check6CasesGlassesCount + 
                           check6TopRingsCount + check6PushersCount + check6DustCount;

      const assembled = b.scannedWatches ? b.scannedWatches.filter(w => w.status === 'good').length : 0;
      
      const pct1 = assembled > 0 ? (rejectedPostProduction / assembled).toFixed(2) : 0;
      const pct2 = assembled > 0 ? (rejectedToPolished / assembled).toFixed(2) : 0;
      const diff = rejectedToPolished - rejectedPostProduction;

      const defectiveSum = rejectedPostProduction + rejectedToPolished;

      rows.push([
        uploadMonth, dayCompleted, lineDescription, productionNumber, familyCode, itemCode, scheduled, assembled,
        rejectedPostProduction, pct1, rejectedToPolished, pct2, diff, defectiveSum,
        check2WRCount, check1CaseBackCount, check1ScrewCount, 
        check3MovementsCount, check3CrownsCount, check3DialsCount, 
        check3HandsCount, check3JumpCount, check6CasesGlassesCount, 
        check6TopRingsCount, check6PushersCount, check6DustCount
      ]);
    });

    return rows;
  };

  const handleExportExcel = () => {
    const rows = generateExportData();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "RIGETTATI DA VISIVO");
    XLSX.writeFile(wb, `RIGETTATI_DA_VISIVO_${selectedMonth === "all" ? "ALL" : selectedMonth}.xlsx`);
  };

  const handlePreviewExport = () => {
    setExportPreviewData(generateExportData());
    setShowExportPreview(true);
  };

  const [expandedDates, setExpandedDates] = useState({});
  const toggleDateExpand = (date) => setExpandedDates(prev => ({...prev, [date]: !prev[date]}));

  const isBatchComplete = (b) => {
    if (!b.qcState) return false;
    const checkOrder = ["check1", "check2", "check3", "check4", "check5", "check6"];
    const requiresQC1 = b.caseBackType === "Screwing case back" || !b.caseBackType;
    for (const chk of checkOrder) {
      if (chk === "check1" && !requiresQC1) continue;
      if (b.qcState[chk] !== "pass") return false;
    }
    const defectiveWatches = b.scannedWatches?.filter(w => w.status === 'defective') || [];
    if (defectiveWatches.length > 0) return false;
    return true;
  };

  return (
    <div className="tgqc-main">
      <div className="tgqc-pagehead">
        <div>
          <div className="tgqc-pagetitle tgqc-display">{t.dashboardTitle}</div>
          <div className="tgqc-pagesub">{t.welcomeBack}, {session.name}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>

          {isManager && (
            <button className="tgqc-btn primary" onClick={() => setView("newBatch")}>{t.newBatchBtn}</button>
          )}
        </div>
      </div>

      {!isManager && <div className="tgqc-notice">{t.operatorNoAccess}</div>}

      <div className="tgqc-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-dim)" }}>
            {t.batchListTitle || "ACTIVE BATCHES"}
          </div>
          <input 
            type="text" 
            className="tgqc-input" 
            placeholder="Search SKU or ML Number..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "250px", padding: "8px 12px", background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: "4px" }}
          />
        </div>
        {activeBatches.length === 0 ? (
          <div className="tgqc-empty">
            {isManager ? t.noBatches : "No active batches."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tgqc-table">
              <thead>
                <tr>
                  <th className="mono">{t.colSku}</th>
                  <th>{t.colBrand}</th>
                  <th className="mono">{t.fieldML || "ML Number"}</th>
                  <th className="mono">{t.fieldFamPcs || "Fam Pcs"}</th>
                  <th className="mono">{t.colPcs}</th>
                  <th>{t.colStatus}</th>
                  <th className="mono">{t.colDate}</th>
                  <th>{t.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {activeBatches.map((b) => (
                  <React.Fragment key={b.id}>
                    <tr>
                      <td className="mono">{b.sku}</td>
                      <td>{b.brand}</td>
                      <td className="mono">{b.ml}</td>
                      <td className="mono">{b.famPcs}</td>
                      <td style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "nowrap" }}>
                        {(() => {
                          const x = b.pcs || 0;
                          const n = b.scannedWatches?.filter(w => w.status === 'defective').length || 0;
                          
                          const badgeStyle = {
                            display: "inline-block", padding: "6px 10px", borderRadius: "4px", 
                            marginRight: "8px", fontWeight: "600", fontSize: "11px", 
                            letterSpacing: "0.06em", textTransform: "uppercase"
                          };

                          return (
                            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                <div style={{ ...badgeStyle, border: "1px solid var(--brass)", color: "var(--brass)", background: "rgba(223, 193, 109, 0.08)" }}>
                                  {t.lblTotal}: {x}
                                </div>
                                <div style={{ ...badgeStyle, border: "1px solid var(--danger)", color: "var(--danger)", background: "rgba(226, 99, 83, 0.08)" }}>
                                  {t.lblDefective}: {n}
                                </div>
                                <div style={{ ...badgeStyle, border: "1px solid var(--ok)", color: "var(--ok)", background: "rgba(92, 156, 116, 0.08)", marginRight: 0 }}>
                                  {t.lblNonDefective}: {b.scannedWatches?.filter(w => w.status === 'good').length || 0}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        {!b.qcState ? (
                          <span className="tgqc-statuspill">{t.statusReady}</span>
                        ) : (
                          <div style={{ display: "flex", gap: 4 }}>
                            {["check1", "check2", "check3", "check4", "check5", "check6"].map((chk, i) => {
                              const requiresQC1 = b.caseBackType === "Screwing case back" || !b.caseBackType;
                              if (chk === "check1" && !requiresQC1) return null;
                              const st = b.qcState[chk];
                              const defectiveWatches = b.scannedWatches?.filter(w => w.status === 'defective') || [];
                              const checkOrder = ["check1", "check2", "check3", "check4", "check5", "check6"];
                              const chkIndex = checkOrder.indexOf(chk);
                              const hasRelevantDefects = defectiveWatches.some(w => {
                                const originCheckKey = extractOriginCheckKey(w);
                                const originIndex = checkOrder.indexOf(originCheckKey);
                                return originIndex >= 0 && originIndex <= chkIndex;
                              });
                              let bg = "var(--border)";
                              if (st === "pass") bg = hasRelevantDefects ? "var(--brass)" : "#10b981";
                              if (st === "fail") bg = "#ef4444";
                              return <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: bg }} title={`Check ${i+1}: ${st || t.qcPending}`} />;
                            })}
                          </div>
                        )}
                      </td>
                      <td className="mono">{formatDateString(b.createdAt)}</td>
                      <td>
                        {isManager ? (
                          <>
                            <button className="tgqc-navbtn" style={{marginRight: 6}} onClick={() => onViewProfile(b.id)}>{t.btnViewProfile}</button>
                            <button className="tgqc-navbtn" style={{color: "var(--danger)", border: "1px solid var(--danger)"}} onClick={() => {
                              if (window.confirm("Are you sure you want to delete this batch?")) {
                                onDeleteBatch(b.id);
                              }
                            }}>Delete</button>
                          </>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="tgqc-navbtn brass" onClick={() => toggleExpand(b.id)}>
                              {expandedBatches[b.id] ? "Hide QC" : "Start QC"}
                            </button>
                            {isBatchComplete(b) && (
                              <button className="tgqc-navbtn" style={{background: "var(--ok)", borderColor: "var(--ok)", color: "#000"}} onClick={() => {
                                if (window.confirm("Are you sure you want to save this batch? It will be moved to Saved Profiles.")) {
                                  onSaveBatch(b.id);
                                }
                              }}>
                                Save Batch
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {expandedBatches[b.id] && !isManager && (
                      <tr style={{ background: "var(--panel-2)" }}>
                        <td colSpan="7" style={{ padding: "30px 40px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                            {["check1", "check2", "check3", "check4", "check5", "check6"].map((chk, i, arr) => {
                              const requiresQC1 = b.caseBackType === "Screwing case back" || b.caseBackType === "4 Screws Case back" || !b.caseBackType;
                              if (chk === "check1" && !requiresQC1) return null;

                              let isDisabled = false;

                              const checkOrder = ["check1", "check2", "check3", "check4", "check5", "check6"];
                              const chkIndex = checkOrder.indexOf(chk);

                              const val = (b.qcState || {})[chk];
                              const defectiveWatches = b.scannedWatches?.filter(w => w.status === 'defective') || [];
                              const relevantDefectsCount = defectiveWatches.filter(w => {
                                const originCheckKey = extractOriginCheckKey(w);
                                const originIndex = checkOrder.indexOf(originCheckKey);
                                return originIndex >= 0 && originIndex <= chkIndex;
                              }).length;
                              const hasRelevantDefects = relevantDefectsCount > 0;
                              
                              const pendingVerificationsCount = b.scannedWatches?.filter(w => w.status === 'pending_verification' && w.verificationCheckKey === chk).length || 0;

                              let bg = "var(--panel)";
                              let color = "var(--text)";
                              let border = "1px solid var(--border)";
                              if (val === "pass") { bg = (hasRelevantDefects || pendingVerificationsCount > 0) ? "var(--brass)" : "var(--ok)"; color = "#000"; border = (hasRelevantDefects || pendingVerificationsCount > 0) ? "1px solid var(--brass)" : "1px solid var(--ok)"; }
                              if (val === "fail") { bg = "var(--err)"; color = "#fff"; border = "1px solid var(--err)"; }

                              const labelMap = {
                                check1: b.caseBackType === "4 Screws Case back" ? (lang === "it" ? "1. Controllo Fondello a 4 Viti" : "1. 4 Screws Caseback Check") : t.qcCheck1, 
                                check2: t.qcCheck2, check3: t.qcCheck3,
                                check4: t.qcCheck4, check5: t.qcCheck5, check6: t.qcCheck6
                              };
                              const label = labelMap[chk] || chk;

                              return (
                                <React.Fragment key={chk}>
                                  <div style={{ position: "relative", display: "inline-block" }}>
                                    <button 
                                      className="tgqc-btn"
                                      style={{ background: bg, color, border, opacity: isDisabled ? 0.4 : 1, pointerEvents: isDisabled ? "none" : "auto", fontWeight: "bold", padding: "12px 20px" }}
                                      onClick={() => {
                                        if (chk === "check4") {
                                          onOpenQC4(b.id);
                                        } else if (chk === "check1" || chk === "check2" || chk === "check3" || chk === "check5" || chk === "check6") {
                                          onOpenQCDefectLogging(b.id, chk);
                                        } else {
                                          onOpenGenericQC(b.id, chk);
                                        }
                                      }}
                                      disabled={isDisabled}
                                    >
                                      {label}
                                    </button>
                                    {hasRelevantDefects && (
                                      <div style={{
                                        position: "absolute",
                                        top: -10,
                                        right: -10,
                                        background: "#e11d48",
                                        color: "white",
                                        borderRadius: "50%",
                                        width: 24,
                                        height: 24,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 13,
                                        fontWeight: "bold",
                                        border: "2px solid var(--panel-2)",
                                        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                                        pointerEvents: "none"
                                      }}>
                                        {relevantDefectsCount}
                                      </div>
                                    )}
                                    {pendingVerificationsCount > 0 && (
                                      <div style={{
                                        position: "absolute",
                                        top: -10,
                                        right: hasRelevantDefects ? 20 : -10,
                                        background: "#10b981",
                                        color: "white",
                                        borderRadius: "50%",
                                        width: 24,
                                        height: 24,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 13,
                                        fontWeight: "bold",
                                        border: "2px solid var(--panel-2)",
                                        boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                                        pointerEvents: "none",
                                        zIndex: 2
                                      }}>
                                        {pendingVerificationsCount}
                                      </div>
                                    )}
                                  </div>
                                  {i < arr.length - 1 && <span style={{ color: "var(--text-dim)", fontWeight: "bold", fontSize: 20 }}>→</span>}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SAVED PROFILES SECTION */}
      {savedBatches.length > 0 && (
        <div className="tgqc-card" style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              SAVED PROFILES
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select 
                className="tgqc-input" 
                style={{ padding: "6px 10px", width: "auto" }}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="all">All Months</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button className="tgqc-btn" onClick={handlePreviewExport}>
                Preview
              </button>
              <button className="tgqc-btn primary" onClick={handleExportExcel}>
                Export Excel
              </button>
            </div>
          </div>
          
          {Object.keys(savedBatchesByDate).length === 0 ? (
             <div className="tgqc-empty">No batches saved for this month.</div>
          ) : (
            Object.entries(savedBatchesByDate).map(([date, batchesForDate]) => (
              <div key={date} style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <div 
                  style={{ background: "var(--panel-2)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => toggleDateExpand(date)}
                >
                  <span>{date} ({batchesForDate.length} batches)</span>
                  <span>{expandedDates[date] ? "▲" : "▼"}</span>
                </div>
                
                {expandedDates[date] && (
                  <div style={{ overflowX: "auto", padding: "10px 0" }}>
                    <table className="tgqc-table">
                      <thead>
                        <tr>
                          <th className="mono">{t.colSku}</th>
                          <th>{t.colBrand}</th>
                          <th className="mono">{t.colSerial}</th>
                          <th>{t.colPcs}</th>
                          <th>{t.colCheckboxes}</th>
                          <th>{t.colAction}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchesForDate.map(b => (
                          <tr key={b.id}>
                            <td className="mono">{b.sku}</td>
                            <td>{b.brand}</td>
                            <td className="mono">{b.serial}</td>
                            <td>{b.pcs}</td>
                            <td>
                              <div style={{ display: "flex", gap: 4 }}>
                                {["check1", "check2", "check3", "check4", "check5", "check6"].map((chk, i) => {
                                  const requiresQC1 = b.caseBackType === "Screwing case back" || !b.caseBackType;
                                  if (chk === "check1" && !requiresQC1) return null;
                                  return <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: "#10b981" }} title={`Check ${i+1}: pass`} />;
                                })}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="tgqc-navbtn" onClick={() => onViewProfile(b.id)}>{t.btnViewProfile}</button>
                                {isManager && (
                                  <button className="tgqc-navbtn" style={{color: "var(--danger)", border: "1px solid var(--danger)"}} onClick={() => {
                                    if (window.confirm("Are you sure you want to delete this batch profile?")) {
                                      onDeleteBatch(b.id);
                                    }
                                  }}>Delete</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {showExportPreview && (
        <div className="tgqc-modal-overlay">
          <div className="tgqc-modal" style={{ maxWidth: "95vw", width: 1400 }}>
            <div className="tgqc-modal-header">
              <div className="tgqc-display">Export Preview</div>
              <button className="tgqc-modal-close" onClick={() => setShowExportPreview(false)}>×</button>
            </div>
            <div className="tgqc-modal-body" style={{ overflowX: "auto", maxHeight: "60vh" }}>
              <table className="tgqc-table" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                <thead>
                  <tr>
                    {exportPreviewData[0]?.map((header, i) => (
                      <th key={i}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exportPreviewData.slice(1).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                  {exportPreviewData.length <= 1 && (
                    <tr><td colSpan={30} style={{textAlign:"center", padding:20}}>No data for the selected month.</td></tr>
                  )}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "flex-end" }}>
                <button className="tgqc-btn" onClick={() => setShowExportPreview(false)}>Close</button>
                <button className="tgqc-btn primary" onClick={() => {
                   setShowExportPreview(false);
                   handleExportExcel();
                }}>Download Excel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   OPERATOR FLOW VIEWS
========================================================= */
function OperatorScanView({ t, onScan, onLogout }) {
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  const startScan = async () => {
    try {
      setScanning(true);
      setError("");
      scannerRef.current = new Html5Qrcode("tgqc-qr-reader");
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Success! Stop camera and pass result
          if (navigator.vibrate) navigator.vibrate(200);
          if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
              scannerRef.current.clear();
              scannerRef.current = null;
              setScanning(false);
              onScan(decodedText, setError);
            }).catch(console.error);
          }
        },
        (err) => {
          // ignore frame errors
        }
      );
    } catch (err) {
      console.error(err);
      const errMsg = typeof err === "string" ? err : (err?.message || "Errore sconosciuto.");
      if (errMsg.toLowerCase().includes("notallowederror") || errMsg.toLowerCase().includes("permission denied")) {
        setError(t.errCameraPermission);
      } else {
        setError("Camera error: " + errMsg);
      }
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => {
          scannerRef.current.clear();
        }).catch(console.error);
      }
    };
  }, []);

  return (
    <div className="tgqc-main" style={{ maxWidth: 500, margin: "40px auto", textAlign: "center" }}>
      <div className="tgqc-card">
        <div style={{ fontSize: 20, marginBottom: 10 }} className="tgqc-display">{t.opScanTitle}</div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 30 }}>{t.opScanSubtitle}</div>
        
        <div id="tgqc-qr-reader" style={{ width: "100%", maxWidth: 300, margin: "0 auto 20px auto", display: scanning ? "block" : "none" }}></div>
        
        {!scanning && (
          <button className="tgqc-btn primary" style={{ marginBottom: 20 }} onClick={startScan}>
            {t.startScanBtn}
          </button>
        )}

        {error && <div className="tgqc-alert" style={{ marginBottom: 20 }}>{error}</div>}
        <br />
        <button className="tgqc-btn" onClick={onLogout}>{t.logout}</button>
      </div>
    </div>
  );
}

function OperatorConfirmView({ t, batch, onConfirm, onCancel }) {
  if (!batch) return null;
  return (
    <div className="tgqc-main">
      <div className="tgqc-pagehead">
        <div>
          <div className="tgqc-pagetitle tgqc-display">{t.wizardTitle}</div>
          <div className="tgqc-pagesub">{batch.brand} - {batch.sku}</div>
        </div>
        <button className="tgqc-btn" onClick={onCancel}>{t.cancelBtn}</button>
      </div>
      
      <div className="tgqc-card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          {batch.image ? (
            <div className="tgqc-imagewrap">
              <img src={batch.image} alt={batch.sku} className="tgqc-image" />
            </div>
          ) : (
            <div className="tgqc-imagewrap" style={{ background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{t.imageMissing}</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldWeek}</span><span className="tgqc-summaryval">{batch.week}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldML}</span><span className="tgqc-summaryval">{batch.ml}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldBrand}</span><span className="tgqc-summaryval">{batch.brand}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldFamily}</span><span className="tgqc-summaryval">{batch.family}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldFamPcs}</span><span className="tgqc-summaryval">{batch.famPcs}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldSku}</span><span className="tgqc-summaryval">{batch.sku}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldDescription}</span><span className="tgqc-summaryval">{batch.description}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldPcs}</span><span className="tgqc-summaryval">{batch.pcs}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldWip}</span><span className="tgqc-summaryval">{batch.wip}</span></div>
          </div>
        </div>
      </div>
      <div className="tgqc-card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 14 }}>{t.componentsTitle}</div>
        <div style={{ overflowX: "auto" }}>
          <table className="tgqc-table">
            <thead>
              <tr>
                <th className="mono">{t.colCode}</th>
                <th>{t.colCompDesc}</th>
                <th>{t.colSupplier}</th>
              </tr>
            </thead>
            <tbody>
              {batch.components?.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.code}</td>
                  <td>{c.description}</td>
                  <td>{c.supplier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ textAlign: "right", marginBottom: 60 }}>
        <button className="tgqc-btn primary" style={{ fontSize: 16, padding: "14px 28px" }} onClick={onConfirm}>
          {t.opConfirmBtn} →
        </button>
      </div>
    </div>
  );
}

function PendingRepairsList({ batch, currentCheckKey, onRepairLog }) {
  if (!batch || !batch.scannedWatches) return null;
  const defective = batch.scannedWatches.filter(w => w.status === "defective");
  if (defective.length === 0) return null;

  return (
    <div className="tgqc-card" style={{ marginTop: 24 }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: 16 }}>Watches Currently Under Repair</h3>
      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {defective.map(w => {
          const lastDefectLog = w.history.slice().reverse().find(h => h.action.startsWith("Logged Defect"));
          const match = lastDefectLog ? lastDefectLog.action.match(/\(([^)]+)\)/) : null;
          const originCheckKey = match ? match[1] : null;
          
          const isLocked = originCheckKey && currentCheckKey && originCheckKey !== currentCheckKey;
          
          return (
            <div key={w.barcode} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 12px", borderRadius: 6, background: "var(--panel)",
              border: "1px solid var(--border)", opacity: isLocked ? 0.5 : 1
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {isLocked && <span title="Locked: Belongs to another check">🔒</span>}
                <span className="mono" style={{ fontWeight: "bold" }}>{w.barcode}</span>
                <span style={{ fontSize: 12, color: "var(--err)" }}>{lastDefectLog?.tags?.join(", ")}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "capitalize", display: "flex", alignItems: "center", gap: 10 }}>
                Origin: {originCheckKey ? originCheckKey.replace('check', 'Check ') : "Unknown"}
                {!isLocked && onRepairLog && (
                  <button className="tgqc-btn" style={{ padding: "4px 8px", fontSize: 11, background: "var(--ok)", borderColor: "var(--ok)" }} onClick={() => onRepairLog(batch.id, w.barcode, originCheckKey)}>
                    Quick Repair
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   QC DEFECT LOGGING VIEW (Check 1, Check 2)
========================================================= */
function QCDefectLoggingView({ t, batch, checkKey, defectTagsMap, onAddCustomTag, onDefectLog, onRepairLog, onBulkVerifyLog, onUpdateQC, onBack, hideHeaderFooter }) {
  const [mode, setMode] = useState("scan"); // scan | logDefect | logRepair
  const [scanVal, setScanVal] = useState("");
  const [activeWatch, setActiveWatch] = useState(null);

  const [selectedTags, setSelectedTags] = useState([]);
  const [customTag, setCustomTag] = useState("");

  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const cameraScannerRef = useRef(null);

  const startCameraScan = async () => {
    try {
      setCameraScannerOpen(true);
      setCameraError("");
      setTimeout(async () => {
        cameraScannerRef.current = new Html5Qrcode("tgqc-defect-reader");
        await cameraScannerRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (navigator.vibrate) navigator.vibrate(200);
            if (cameraScannerRef.current) {
              cameraScannerRef.current.stop().then(() => {
                cameraScannerRef.current.clear();
                cameraScannerRef.current = null;
                setCameraScannerOpen(false);
                handleScanSubmit(decodedText);
              }).catch(console.error);
            }
          },
          (err) => {}
        );
      }, 100);
    } catch (err) {
      setCameraError("Camera error: " + err);
    }
  };

  const closeCameraScan = () => {
     if (cameraScannerRef.current) {
         cameraScannerRef.current.stop().then(() => {
            cameraScannerRef.current.clear();
            cameraScannerRef.current = null;
         }).catch(console.error);
     }
     setCameraScannerOpen(false);
  };

  const inputRef = useRef(null);

  useEffect(() => {
    if (mode === "scan" && inputRef.current) inputRef.current.focus();
  }, [mode]);

  if (!batch) return null;

  const total = batch.scannedWatches?.length || 0;
  const defective = batch.scannedWatches?.filter(w => w.status === "defective").length || 0;
  const good = total - defective;

  const handleScanSubmit = (eOrBarcode) => {
    if (eOrBarcode?.preventDefault) eOrBarcode.preventDefault();
    const barcode = (typeof eOrBarcode === 'string' ? eOrBarcode : scanVal).trim();
    if (!barcode) return;
    
    let watch = batch.scannedWatches.find(w => w.barcode === barcode);
    if (!watch) {
      // New defect scanning flow! Create it on the fly.
      watch = { barcode, status: "good", history: [] };
    }

    setActiveWatch(watch);
    if (watch.status === "pending_verification") {
      if (watch.verificationCheckKey !== checkKey) {
        alert(`${t.errPendingVerification} ${watch.verificationCheckKey || t.errAnotherCheck}.`);
        setScanVal("");
        return;
      }
      setMode("logDefect");
      setSelectedTags([]);
      setCustomTag("");
    } else if (watch.status === "defective") {
      const lastDefectLog = watch.history.slice().reverse().find(h => h.action.startsWith("Logged Defect"));
      if (lastDefectLog) {
        const match = lastDefectLog.action.match(/\(([^)]+)\)/);
        const originalCheckKey = match ? match[1] : null;
        if (originalCheckKey && originalCheckKey !== checkKey) {
          alert(`${t.errDefectMismatch} ${originalCheckKey}${t.errDefectMismatchSuffix}`);
          setScanVal("");
          return;
        }
      }
      setMode("logRepair");
    } else {
      setMode("logDefect");
      setSelectedTags([]);
      setCustomTag("");
    }
    setScanVal("");
  };

  const defectTags = (defectTagsMap || {})[checkKey] || [];

  const saveDefect = () => {
    const finalTags = [...selectedTags];
    if (customTag.trim()) {
      finalTags.push(customTag.trim());
      onAddCustomTag(checkKey, customTag.trim());
    }
    if (finalTags.length === 0) {
      alert(t.errSelectTag);
      return;
    }
    onDefectLog(batch.id, activeWatch.barcode, finalTags, checkKey);
    setMode("scan");
    setActiveWatch(null);
  };

  const handleCustomTagKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = customTag.trim();
      if (tag) {
        if (!selectedTags.includes(tag)) {
          setSelectedTags(prev => [...prev, tag]);
        }
        onAddCustomTag(checkKey, tag);
        setCustomTag("");
      }
    }
  };

  const saveRepair = () => {
    onRepairLog(batch.id, activeWatch.barcode, checkKey);
    setMode("scan");
    setActiveWatch(null);
  };

  const handleSaveAndProceed = () => {
    const pendingWatches = (batch.scannedWatches || [])
      .filter(w => w.status === 'pending_verification' && w.verificationCheckKey === checkKey)
      .map(w => w.barcode);
      
    if (pendingWatches.length > 0 && onBulkVerifyLog) {
      onBulkVerifyLog(batch.id, pendingWatches, checkKey);
    }
    
    onUpdateQC(batch.id, checkKey, "pass");
    onBack();
  };

  const labelMap = {
    check1: t.qcCheck1, check2: t.qcCheck2, check3: t.qcCheck3,
    check4: t.qcCheck4, check5: t.qcCheck5, check6: t.qcCheck6
  };
  const label = labelMap[checkKey] || checkKey;

  return (
    <div className="tgqc-main" style={hideHeaderFooter ? { padding: 0 } : { maxWidth: 800, margin: "0 auto" }}>
      {!hideHeaderFooter && (
        <div className="tgqc-pagehead">
          <div>
            <div className="tgqc-pagetitle tgqc-display">{label}</div>
            <div className="tgqc-pagesub">{batch.brand} - {batch.sku}</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="tgqc-btn" style={{ color: "var(--err)", border: "1px solid var(--err)" }} onClick={() => {
              if (window.confirm(t.confirmReset)) { onUpdateQC(batch.id, checkKey, null); onBack(); }
            }}>{t.btnResetCheck}</button>
            <button className="tgqc-btn" onClick={onBack}>{t.backToDashboard}</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <div className="tgqc-card" style={{ flex: 1, textAlign: "center", padding: "30px 20px" }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase" }}>{t.lblNonDefective}</div>
          <div style={{ fontSize: 36, color: "var(--ok)", fontWeight: "bold" }}>{good}</div>
        </div>
        <div className="tgqc-card" style={{ flex: 1, textAlign: "center", padding: "30px 20px" }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase" }}>{t.lblDefective}</div>
          <div style={{ fontSize: 36, color: "var(--err)", fontWeight: "bold" }}>{defective}</div>
        </div>
        <div className="tgqc-card" style={{ flex: 1, textAlign: "center", padding: "30px 20px" }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase" }}>{t.lblTotal}</div>
          <div style={{ fontSize: 36, fontWeight: "bold" }}>{total}</div>
        </div>
      </div>

      {mode === "scan" && (
        <div className="tgqc-card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 18, marginBottom: 10 }}>{t.scannerTitle}</div>
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 20 }}>{t.scanInstruction}</div>
          <form onSubmit={handleScanSubmit} style={{ marginBottom: 20 }}>
            <input 
              ref={inputRef}
              type="text" 
              className="tgqc-input" 
              style={{ maxWidth: 300, margin: "0 auto", textAlign: "center" }}
              value={scanVal}
              onChange={(e) => setScanVal(e.target.value)}
              placeholder="Barcode..."
              autoFocus
            />
            <button type="submit" style={{ display: "none" }} />
          </form>
          <div>
            <button className="tgqc-btn primary" onClick={startCameraScan}>
               📷 Scan Defective Watch
            </button>
          </div>
        </div>
      )}

      {cameraScannerOpen && (
        <div className="tgqc-modal-overlay">
          <div className="tgqc-modal">
             <div className="tgqc-modal-header">
                <div className="tgqc-display">Scan Defective Watch</div>
                <button className="tgqc-modal-close" onClick={closeCameraScan}>×</button>
             </div>
             <div className="tgqc-modal-body" style={{ textAlign: "center" }}>
                {cameraError && <div style={{ color: "var(--err)", marginBottom: 10 }}>{cameraError}</div>}
                <div id="tgqc-defect-reader" style={{ width: "100%", maxWidth: 400, margin: "0 auto", borderRadius: 8, overflow: "hidden" }}></div>
             </div>
          </div>
        </div>
      )}

      {mode === "logDefect" && (
        <div className="tgqc-card">
          <div className="tgqc-sectiontitle" style={{ marginTop: 0 }}>{t.lblLogDefectFor} {activeWatch.barcode}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            {defectTags.map(tag => (
              <button 
                key={tag}
                onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                className={`tgqc-btn ${selectedTags.includes(tag) ? "primary" : ""}`}
                style={selectedTags.includes(tag) ? { background: "var(--err)", borderColor: "var(--err)", color: "#fff" } : {}}
              >
                {t.tagMap?.[tag] || tag}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="tgqc-label">{t.lblAddCustomTag}</label>
            <input className="tgqc-input" value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={handleCustomTagKeyDown} placeholder={t.lblTypeNewDefect} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="tgqc-btn" onClick={() => setMode("scan")}>{t.cancelBtn}</button>
            <button className="tgqc-btn" style={{ background: "#ef4444", color: "#fff", borderColor: "#ef4444" }} onClick={saveDefect}>{t.btnSaveDefect}</button>
          </div>
        </div>
      )}

      {mode === "logRepair" && (
        <div className="tgqc-card">
          <div className="tgqc-sectiontitle" style={{ marginTop: 0 }}>{t.lblRepairWatch} {activeWatch.barcode}</div>
          <div className="tgqc-notice" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--err)", borderColor: "rgba(239, 68, 68, 0.3)", marginBottom: 20 }}>
            {t.lblMarkedDefective}
          </div>
          <div style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 10 }}>{t.lblDefectHistory}</div>
          {activeWatch.history.filter(h => !h.action.startsWith("Verified")).map((h, i) => (
            <div key={i} style={{ marginBottom: 10, padding: 10, background: "var(--panel-2)", borderRadius: 6, fontSize: 13 }}>
              <strong>{h.timestamp}</strong> - {h.action}
              {h.tags && <div>Tags: {h.tags.map(tag => t.tagMap?.[tag] || tag).join(", ")}</div>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="tgqc-btn" onClick={() => setMode("scan")}>{t.cancelBtn}</button>
            <button className="tgqc-btn primary" style={{ background: "var(--ok)", borderColor: "var(--ok)" }} onClick={saveRepair}>{t.btnMarkRepaired}</button>
          </div>
        </div>
      )}

      <div className="tgqc-card" style={{ marginTop: 24 }}>
        <div className="tgqc-sectiontitle" style={{ marginTop: 0 }}>{t.lblScannedWatches}</div>
        <div style={{ overflowX: "auto" }}>
          <table className="tgqc-table">
            <thead>
              <tr>
                <th className="mono">{t.scanBarcodeCol}</th>
                <th>{t.colStatus}</th>
                <th>{t.colHistoryLogs}</th>
              </tr>
            </thead>
            <tbody>
              {(batch.scannedWatches || []).map((w, idx) => {
                const originCheckKey = extractOriginCheckKey(w);
                const checkOrder = ["check1", "check2", "check3", "check4", "check5", "check6"];
                const isFromPrevious = w.status === 'defective' && originCheckKey && checkOrder.indexOf(originCheckKey) < checkOrder.indexOf(checkKey);
                
                return (
                <tr key={idx} style={{ opacity: isFromPrevious ? 0.4 : 1 }}>
                  <td className="mono">{w.barcode}</td>
                  <td>
                    <span className="tgqc-statuspill" style={w.status === "defective" ? { background: "rgba(239, 68, 68, 0.1)", color: "var(--err)" } : (w.status === "pending_verification" && w.verificationCheckKey === checkKey) ? { background: "rgba(234, 179, 8, 0.1)", color: "var(--brass)" } : { background: "rgba(16, 185, 129, 0.1)", color: "var(--ok)" }}>
                      {w.status === "pending_verification" ? (w.verificationCheckKey === checkKey ? "PENDING_VERIFICATION" : "GOOD") : w.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {w.history.filter(h => !h.action.startsWith("Verified")).map((h, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <span style={{ color: "var(--text-dim)" }}>{h.timestamp}</span> - {h.action} {h.tags ? <strong style={{ color: "var(--err)" }}>({h.tags.map(tag => t.tagMap?.[tag] || tag).join(", ")})</strong> : ""}
                      </div>
                    ))}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!hideHeaderFooter && (
        <div className="tgqc-card" style={{ marginTop: 24, textAlign: "center", padding: 30 }}>
           <button 
             className="tgqc-btn" 
             onClick={handleSaveAndProceed}
             style={{ background: "var(--brass)", color: "#000", borderColor: "var(--brass)", padding: "16px 32px", fontSize: 18, fontWeight: "bold" }}
           >
             {t.btnSaveProceed}
           </button>
        </div>
      )}
    </div>
  );
}

function QC4DetailView({ t, batch, defectTagsMap, onAddCustomTag, onDefectLog, onRepairLog, onBulkVerifyLog, onUpdateQC, onSaveCheck4State, onBack }) {
  if (!batch) return null;

  const [now, setNow] = useState(Date.now());
  const [devBypass, setDevBypass] = useState(batch.check4Bypass || false);
  const [samples, setSamples] = useState(() => {
    if (batch.qcState?.check4 === "pass") return Array(10).fill(true);
    return batch.check4Samples || Array(10).fill(null);
  });

  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  const hasCheck3PassedAt = !!batch.check3PassedAt;
  const elapsedMs = hasCheck3PassedAt ? (now - batch.check3PassedAt) : 0;
  const MS_IN_24H = 24 * 60 * 60 * 1000;
  const timerFinished = devBypass || (hasCheck3PassedAt && elapsedMs >= MS_IN_24H);

  let timerDisplay = "";
  if (hasCheck3PassedAt && !timerFinished) {
    const remainingMs = MS_IN_24H - elapsedMs;
    const h = Math.floor(remainingMs / 3600000);
    const m = Math.floor((remainingMs % 3600000) / 60000);
    const s = Math.floor((remainingMs % 60000) / 1000);
    timerDisplay = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} ${t.remaining}`;
  }

  const handleToggleBypass = () => {
    const nextBypass = !devBypass;
    setDevBypass(nextBypass);
    if (onSaveCheck4State) onSaveCheck4State(batch.id, nextBypass, samples);
  };

  const handleSaveAndProceed = () => {
    const pendingWatches = (batch.scannedWatches || [])
      .filter(w => w.status === 'pending_verification' && w.verificationCheckKey === "check4")
      .map(w => w.barcode);
      
    if (pendingWatches.length > 0 && onBulkVerifyLog) {
      onBulkVerifyLog(batch.id, pendingWatches, "check4");
    }
    
    onUpdateQC(batch.id, "check4", "pass");
    onBack();
  };

  const toggleSample = (index) => {
    if (!timerFinished) return; // Cannot check samples until timer is done
    setSamples(prev => {
      const next = [...prev];
      if (next[index] === null) next[index] = true; // Click -> Pass
      else if (next[index] === true) next[index] = false; // Click -> Fail
      else next[index] = null; // Click -> Reset
      if (onSaveCheck4State) onSaveCheck4State(batch.id, devBypass, next);
      return next;
    });
  };

  const allPassed = samples.every(s => s === true);
  const hasFailure = samples.some(s => s === false);

  const canProceed = timerFinished && allPassed && !hasFailure;

  return (
    <div className="tgqc-main">
      <div className="tgqc-pagehead">
        <div>
          <div className="tgqc-pagetitle tgqc-display">{t.qcCheck4}</div>
          <div className="tgqc-pagesub">{batch.sku}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="tgqc-btn" onClick={handleToggleBypass} style={{ background: devBypass ? "var(--accent)" : "transparent", border: "1px solid var(--accent)", color: devBypass ? "#000" : "var(--accent)" }}>
            {t.btnDevBypass}
          </button>
          <button className="tgqc-btn" style={{ color: "var(--err)", border: "1px solid var(--err)" }} onClick={() => {
            if (window.confirm(t.confirmReset)) { onUpdateQC(batch.id, "check4", null); onBack(); }
          }}>{t.btnResetCheck}</button>
          <button className="tgqc-btn" onClick={onBack}>{t.backToDashboard}</button>
        </div>
      </div>

      <div className="tgqc-card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, color: "var(--brass)", marginBottom: 12 }}>{t.qc4PartA}</h3>
        {!hasCheck3PassedAt ? (
          <div style={{ color: "var(--danger)", background: "rgba(239,68,68,0.1)", padding: 12, borderRadius: 4 }}>
            {t.qc4WarnCheck3}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 10 }}>
              {t.qc4PartADesc}
            </div>
            {timerFinished ? (
              <div>
                <div style={{ color: "var(--ok)", fontWeight: "bold", fontSize: 16, marginBottom: 16 }}>
                  {t.qc4TimerDone}
                </div>
                <QCDefectLoggingView 
                  t={t}
                  batch={batch}
                  checkKey="check4_partA"
                  defectTagsMap={defectTagsMap}
                  onAddCustomTag={onAddCustomTag}
                  onDefectLog={onDefectLog}
                  onRepairLog={onRepairLog}
                  hideHeaderFooter={true}
                />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 24, fontWeight: "bold", fontFamily: "monospace", color: "var(--brass)" }}>
                  {timerDisplay}
                </div>
                <button onClick={handleToggleBypass} style={{ background: "rgba(223, 193, 109, 0.2)", border: "1px dashed var(--brass)", color: "var(--brass)", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                  {t.btnDevBypassSmall}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tgqc-card" style={{ opacity: timerFinished ? 1 : 0.5, pointerEvents: timerFinished ? "auto" : "none" }}>
        <h3 style={{ marginTop: 0, color: "var(--brass)", marginBottom: 12 }}>{t.qc4PartB}</h3>
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 16 }}>
          {t.qc4PartBDesc}
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 12 }}>
          {samples.map((status, i) => (
            <button 
              key={i}
              onClick={() => toggleSample(i)}
              style={{
                padding: "20px 10px",
                border: "2px solid " + (status === true ? "var(--ok)" : status === false ? "var(--danger)" : "var(--line)"),
                background: status === true ? "rgba(92, 156, 116, 0.1)" : status === false ? "rgba(239, 68, 68, 0.1)" : "transparent",
                color: status === true ? "var(--ok)" : status === false ? "var(--danger)" : "var(--text)",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: "bold",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.8 }}>{t.lblSample} {i + 1}</div>
              <div style={{ fontSize: 16 }}>
                {status === true ? t.qcPass : status === false ? t.qcFail : t.qcPending}
              </div>
            </button>
          ))}
        </div>

        {hasFailure && (
          <div style={{ marginTop: 20, color: "var(--danger)", background: "rgba(239,68,68,0.1)", padding: 12, borderRadius: 4, textAlign: "center", fontWeight: "bold" }}>
            {t.qc4FailMsg}
          </div>
        )}
      </div>

      <div className="tgqc-card" style={{ marginTop: 24, textAlign: "center", padding: 30 }}>
          {hasFailure ? (
           <button 
             className="tgqc-btn" 
             onClick={() => { onUpdateQC(batch.id, "check4", "fail"); onBack(); }}
             style={{ background: "var(--danger)", color: "#fff", borderColor: "var(--danger)", padding: "16px 32px", fontSize: 18, fontWeight: "bold" }}
           >
             {t.btnLogFailure}
           </button>
         ) : (
           <button 
             className="tgqc-btn" 
             onClick={handleSaveAndProceed}
             style={{ background: "var(--brass)", color: "#000", borderColor: "var(--brass)", padding: "16px 32px", fontSize: 18, fontWeight: "bold", opacity: canProceed ? 1 : 0.4 }}
             disabled={!canProceed}
           >
             {t.btnSaveProceed}
           </button>
          )}
       </div>
    </div>
  );
}

function QCGenericDetailView({ t, batch, checkKey, onUpdateQC, onBack }) {
  if (!batch || !batch.qcState) return null;

  const labelMap = {
    check1: t.qcCheck1, check2: t.qcCheck2, check3: t.qcCheck3,
    check4: t.qcCheck4, check5: t.qcCheck5, check6: t.qcCheck6
  };
  const label = labelMap[checkKey] || checkKey;
  const val = batch.qcState[checkKey];

  return (
    <div className="tgqc-main" style={{ maxWidth: 800, margin: "0 auto" }}>
      <div className="tgqc-pagehead">
        <div>
          <div className="tgqc-pagetitle tgqc-display">{label}</div>
          <div className="tgqc-pagesub">{batch.brand} - {batch.sku}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="tgqc-btn" style={{ color: "var(--err)", border: "1px solid var(--err)" }} onClick={() => {
            if (window.confirm(t.confirmReset)) { onUpdateQC(batch.id, checkKey, null); onBack(); }
          }}>{t.btnResetCheck}</button>
          <button className="tgqc-btn" onClick={onBack}>{t.backToDashboard || "Back"}</button>
        </div>
      </div>

      <div className="tgqc-card" style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 20, marginBottom: 30 }}>{t.lblCompleteCheck}</div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
          <button 
            className={`tgqc-btn ${val === "pass" ? "primary" : ""}`} 
            onClick={() => { onUpdateQC(batch.id, checkKey, "pass"); onBack(); }}
            style={val === "pass" ? { background: "#10b981", color: "#fff", borderColor: "#10b981", padding: "16px 32px", fontSize: 18 } : { padding: "16px 32px", fontSize: 18 }}
          >
            {t.qcPass || "Pass"}
          </button>
          <button 
            className={`tgqc-btn ${val === "fail" ? "primary" : ""}`} 
            onClick={() => { onUpdateQC(batch.id, checkKey, "fail"); onBack(); }}
            style={val === "fail" ? { background: "#ef4444", color: "#fff", borderColor: "#ef4444", padding: "16px 32px", fontSize: 18 } : { padding: "16px 32px", fontSize: 18 }}
          >
            {t.qcFail || "Fail"}
          </button>
        </div>
        {val !== null && (
          <div style={{ marginTop: 20, color: "var(--text-dim)" }}>
            {t.lblCurrentStatus} {val.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   PROFILE VIEW (Read Only)
========================================================= */
function ProfileView({ t, batch, session, onBack }) {
  const [showComponents, setShowComponents] = useState(false);
  if (!batch) return null;
  const isManager = session?.role === "manager";
  return (
    <div className="tgqc-main">
      <div className="tgqc-pagehead">
        <div>
          <div className="tgqc-pagetitle tgqc-display">{t.wizardTitle}</div>
          <div className="tgqc-pagesub">{batch.brand} - {batch.sku}</div>
        </div>
        <button className="tgqc-btn" onClick={onBack}>{t.backToDashboard}</button>
      </div>
      <div className="tgqc-card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          {batch.image ? (
            <div className="tgqc-imagewrap" style={{ width: 140, height: 140, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", flexShrink: 0 }}>
              <img src={batch.image} alt={batch.sku} className="tgqc-image" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ) : (
            <div className="tgqc-imagewrap" style={{ width: 140, height: 140, borderRadius: 8, background: "var(--panel-2)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)", flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{t.imageMissing}</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldWeek}</span><span className="tgqc-summaryval">{batch.week}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldML}</span><span className="tgqc-summaryval">{batch.ml}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldBrand}</span><span className="tgqc-summaryval">{batch.brand}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldFamily}</span><span className="tgqc-summaryval">{batch.family}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldFamPcs}</span><span className="tgqc-summaryval">{batch.famPcs}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldSku}</span><span className="tgqc-summaryval">{batch.sku}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldDescription}</span><span className="tgqc-summaryval">{batch.description}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldPcs}</span><span className="tgqc-summaryval">{batch.pcs}</span></div>
            <div className="tgqc-summaryrow"><span className="tgqc-summarylabel">{t.fieldWip}</span><span className="tgqc-summaryval">{batch.wip}</span></div>
          </div>

        </div>
      </div>
      <div className="tgqc-card">
        <div 
          onClick={() => setShowComponents(!showComponents)}
          style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--brass)", marginBottom: showComponents ? 14 : 0, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>{t.componentsTitle}</span>
          <span style={{ fontSize: 10 }}>{showComponents ? "▲ HIDE" : "▼ SHOW"}</span>
        </div>
        {showComponents && (
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table className="tgqc-table">
              <thead>
                <tr>
                  <th className="mono">{t.colCode}</th>
                  <th>{t.colCompDesc}</th>
                  <th>{t.colSupplier}</th>
                </tr>
              </thead>
              <tbody>
                {batch.components?.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.code}</td>
                    <td>{c.description}</td>
                    <td>{c.supplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {isManager && (
        <div className="tgqc-card" style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 14 }}>Detailed Quality Control Report</div>
          <ManagerDetailedStats batch={batch} t={t} />
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SCANNER VIEW
========================================================= */
function ScannerView({ t, batch, onBack, onScan }) {
  const [error, setError] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [queue, setQueue] = useState([]);
  const [isCommitting, setIsCommitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Keep focus on input for hardware scanner
    const handleClick = () => inputRef.current?.focus();
    window.addEventListener("click", handleClick);
    inputRef.current?.focus();
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && inputVal.trim()) {
      e.preventDefault();
      const val = inputVal.trim();
      if (queue.includes(val) || batch.scannedWatches?.some(w => w.barcode === val)) {
        setError(t.errDuplicate || "Duplicate scanned");
        setInputVal("");
        return;
      }
      if (navigator.vibrate) navigator.vibrate(200);
      setQueue(q => [...q, val]);
      setError("");
      setInputVal("");
    }
  };

  const handleCommitAll = async () => {
    setIsCommitting(true);
    let successCount = 0;
    for (const v of queue) {
      try {
        await onScan(batch.id, v);
        successCount++;
      } catch (e) {
        console.error("Failed to commit watch:", v, e);
      }
    }
    setIsCommitting(false);
    
    if (successCount === queue.length) {
      setQueue([]);
    } else {
      setError(`Failed to commit ${queue.length - successCount} watches. Please try again.`);
      // Remove successfully committed watches from queue
      // Since it's hard to track which ones succeeded without a return value, we just clear it for now.
      setQueue([]);
    }
  };

  if (!batch) return null;


  return (
    <div className="tgqc-main">
      <div className="tgqc-pagehead">
        <div>
          <div className="tgqc-pagetitle tgqc-display">{t.scannerTitle}</div>
          <div className="tgqc-pagesub">{t.scannerSubtitle}</div>
        </div>
        <button className="tgqc-btn" onClick={onBack}>{t.backToDashboard}</button>
      </div>

      <div className="tgqc-card" style={{ marginBottom: 24, textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 18, marginBottom: 10 }}>{batch.brand} - {batch.sku}</div>
        <div style={{ fontSize: 24, fontWeight: "bold", color: "var(--brass)", marginBottom: 20 }}>
          {batch.scannedWatches?.length || 0} / {batch.pcs}
        </div>
        
        {/* Hidden input to catch scanner typing */}
        <input 
          ref={inputRef}
          type="text" 
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ opacity: 0, position: "absolute", zIndex: -1 }}
          autoFocus
        />
        
        {error && <div className="tgqc-alert" style={{ maxWidth: 400, margin: "0 auto 20px auto" }}>{error}</div>}

        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 24 }}>
          <span className="tgqc-scanring" style={{ width: 24, height: 24, display: "inline-block", verticalAlign: "middle", marginRight: 10 }}></span>
          {t.scanningTitle}
        </div>

        {queue.length > 0 && (
          <div style={{ background: "rgba(92,156,116,0.1)", border: "1px solid var(--ok)", padding: "16px", borderRadius: "8px", maxWidth: 400, margin: "0 auto" }}>
            <div style={{ color: "var(--ok)", fontWeight: "bold", marginBottom: 12 }}>{queue.length} watches in Queue</div>
            <button className="tgqc-btn primary" onClick={handleCommitAll} disabled={isCommitting} style={{ width: "100%", opacity: isCommitting ? 0.6 : 1 }}>
              {isCommitting ? "Committing..." : "Commit All Watches"}
            </button>
          </div>
        )}
      </div>

      <div className="tgqc-card">
        <div style={{ fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 14 }}>{t.scannedCount}</div>
        {!batch.scannedWatches || batch.scannedWatches.length === 0 ? (
          <div className="tgqc-empty">{t.noScans}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tgqc-table">
              <thead>
                <tr>
                  <th className="mono">{t.scanBarcodeCol}</th>
                  <th className="mono">{t.scanTimeCol}</th>
                </tr>
              </thead>
              <tbody>
                {batch.scannedWatches.map((w, idx) => (
                  <tr key={idx}>
                    <td className="mono" style={{ color: "var(--ok)" }}>{w.barcode}</td>
                    <td className="mono">{w.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   NEW BATCH WIZARD
========================================================= */
function NewBatchWizard({ t, lang, onCancel, onSaved }) {
  const [stage, setStage] = useState("upload"); // upload | scanning | scanError | review | confirm | saved
  const [scanMsg, setScanMsg] = useState("");
  const [scanErrorMsg, setScanErrorMsg] = useState("");
  const [scanErrorType, setScanErrorType] = useState("");
  const [fileName, setFileName] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [formData, setFormData] = useState(emptyProfile());
  const [serial, setSerial] = useState("");
  const [error, setError] = useState("");
  const [wasAIExtracted, setWasAIExtracted] = useState(false);
  const [operators, setOperators] = useState([]);
  const [activeAssignmentCheck, setActiveAssignmentCheck] = useState(null);
  const [operatorSearch, setOperatorSearch] = useState("");
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    const session = JSON.parse(localStorage.getItem("tgqc_session"));
    if (session && session.token) {
      fetch("/api/users/operators", {
        headers: { "Authorization": `Bearer ${session.token}` }
      })
      .then(res => res.json())
      .then(data => setOperators(data))
      .catch(err => console.error("Failed to load operators", err));
    }
  }, []);

  const startScan = async (file) => {
    setFileName(file.name);
    setPendingFile(file);
    setStage("scanning");
    setScanMsg(t.scanStepExtracting);
    setScanErrorMsg("");
    setScanErrorType("");
    setWasAIExtracted(false);

    try {
      await new Promise((r) => setTimeout(r, 200)); // brief pause so UI updates
      const result = await extractFromExcel(file);
      setFormData(result);
      setWasAIExtracted(true);
      setStage("review");
    } catch (err) {
      const code = err.message;
      setScanErrorType(code);
      if (code === "PARSE_ERROR") setScanErrorMsg(t.errParseError);
      else setScanErrorMsg(err.message || "Unknown error");
      setStage("scanError");
    }
  };

  const handleRetry = () => {
    if (pendingFile) startScan(pendingFile);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    startScan(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    startScan(file);
  };

  const handleManualEntry = () => {
    setFormData(emptyProfile());
    setFileName("");
    setWasAIExtracted(false);
    setStage("review");
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFormData((f) => ({ ...f, image: reader.result }));
    reader.readAsDataURL(file);
  };

  const updateField = (field) => (e) => setFormData((f) => ({ ...f, [field]: e.target.value }));

  const updateComponent = (id, field) => (e) => {
    setFormData((f) => ({
      ...f,
      components: f.components.map((c) => (c.id === id ? { ...c, [field]: e.target.value } : c)),
    }));
  };

  const updateTask = (checkKey, operatorId) => {
    setFormData((f) => ({
      ...f,
      tasks: { ...(f.tasks || {}), [checkKey]: operatorId }
    }));
  };

  const addComponentRow = () => {
    setFormData((f) => ({ ...f, components: [...f.components, { id: uid(), code: "", description: "", supplier: "" }] }));
  };

  const removeComponentRow = (id) => {
    setFormData((f) => ({ ...f, components: f.components.filter((c) => c.id !== id) }));
  };

  const handleProceed = () => {
    if (!formData.brand.trim() || !formData.sku.trim() || !formData.description.trim() || !formData.pcs.toString().trim()) {
      setError(t.errRequiredFields);
      return;
    }
    setError("");
    const newSerial = serial || makeSerial(formData.ml);
    setSerial(newSerial);
    
    onSaved({
      id: uid(),
      serial: newSerial,
      ...formData,
      createdAt: new Date().toISOString(),
      scannedWatches: [],
      qcState: {
        check1: null,
        check2: null,
        check3: null,
        check4: null,
        check5: null,
        check6: null,
      }
    });
    setStage("saved");
  };

  const handlePrint = () => window.print();

  const handleSave = () => {
    onSaved({
      id: uid(),
      serial,
      ...formData,
      createdAt: new Date().toISOString(),
      scannedWatches: [],
      qcState: {
        check1: null,
        check2: null,
        check3: null,
        check4: null,
        check5: null,
        check6: null,
      }
    });
    setStage("saved");
  };

  return (
    <div className="tgqc-main">

      <div className="tgqc-pagehead">
        <div>
          <div className="tgqc-pagetitle tgqc-display">{t.wizardTitle}</div>
        </div>
      </div>

      <div className="tgqc-steps">
        <span className={`tgqc-stepchip ${stage === "upload" || stage === "scanning" ? "active" : "done"}`}>{t.step1}</span>
        <span className={`tgqc-stepchip ${stage === "review" ? "active" : (stage === "saved") ? "done" : ""}`}>{t.step2}</span>
      </div>

      {(stage === "upload") && (
        <div className="tgqc-card">
          <div
            className={`tgqc-dropzone${dragOver ? " dragover" : ""}`}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") fileInputRef.current.click(); }}
          >
            <div className="tgqc-uploadicon">⬆</div>
            <div className="tgqc-uploadprompt">{t.uploadPrompt}</div>
            <div className="tgqc-uploadhint">.xlsx, .xls</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFileInput} />
          </div>
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <button className="tgqc-linkbtn" onClick={handleManualEntry}>{t.manualEntry}</button>
          </div>
          <div className="tgqc-actionrow" style={{ justifyContent: "flex-start" }}>
            <button className="tgqc-btn" onClick={onCancel}>{t.cancelBtn}</button>
          </div>
        </div>
      )}

      {stage === "scanning" && (
        <div className="tgqc-card">
          <div className="tgqc-scanwrap">
            <div className="tgqc-scanring" />
            <div style={{ fontSize: 16, marginBottom: 8 }} className="tgqc-display">{t.scanningTitle}</div>
            <div className="tgqc-scanstatus">{scanMsg}</div>
            {fileName && <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-dim)" }}>{t.uploadedAs}: {fileName}</div>}
          </div>
        </div>
      )}

      {stage === "scanError" && (
        <div className="tgqc-card">
          <div className="tgqc-scan-error">
            <div className="tgqc-scan-error-icon">⚠</div>
            <div className="tgqc-scan-error-title">{t.extractionError}</div>
            <div className="tgqc-scan-error-msg">{scanErrorMsg}</div>
            <div className="tgqc-scan-error-actions">
              <button className="tgqc-btn primary" onClick={handleRetry}>{t.retryBtn}</button>
              <button className="tgqc-btn" onClick={handleManualEntry}>{t.enterManuallyBtn}</button>
            </div>
          </div>
        </div>
      )}

      {stage === "review" && (
        <div className="tgqc-card">
          {fileName && <div className="tgqc-notice">{wasAIExtracted ? t.aiExtractedNotice : t.demoNotice}</div>}

          <div className="tgqc-sectiontitle">{t.reviewTitle}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24, marginBottom: 8 }}>
            <div className="tgqc-formgrid" style={{ marginBottom: 0 }}>
              <div className="span2">
                <div className="tgqc-imgbox">
                  {formData.image ? (
                    <img src={formData.image} alt="Product" />
                  ) : (
                    <div className="tgqc-imgmissing">
                      <div className="tgqc-imgmissing-icon">🖼</div>
                      {t.imageMissing}
                    </div>
                  )}
                </div>
                <label className="tgqc-linkbtn" style={{ cursor: "pointer" }}>
                  {formData.image ? t.replaceImage : t.uploadImageManually}
                  <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
                </label>
              </div>
            </div>
          </div>

          <div className="tgqc-formgrid">
            <div>
              <label className="tgqc-label">{t.fieldWeek}</label>
              <input className="tgqc-input" value={formData.week} onChange={updateField("week")} />
            </div>
            <div>
              <label className="tgqc-label">{t.fieldML}</label>
              <input className="tgqc-input" value={formData.ml} onChange={updateField("ml")} />
            </div>
            <div>
              <label className="tgqc-label">{t.fieldFamPcs}</label>
              <input className="tgqc-input" value={formData.famPcs} onChange={updateField("famPcs")} />
            </div>
            <div className="span2">
              <label className="tgqc-label">{t.fieldBrand}</label>
              <input className="tgqc-input" value={formData.brand} onChange={updateField("brand")} />
            </div>
            <div>
              <label className="tgqc-label">{t.fieldSku}</label>
              <input className="tgqc-input" value={formData.sku} onChange={updateField("sku")} />
            </div>
            <div className="span3">
              <label className="tgqc-label">{t.fieldFamily}</label>
              <input className="tgqc-input" value={formData.family} onChange={updateField("family")} />
            </div>
            <div className="span2">
              <label className="tgqc-label">{t.fieldDescription}</label>
              <input className="tgqc-input" value={formData.description} onChange={updateField("description")} />
            </div>
            <div>
              <label className="tgqc-label">{t.fieldPcs}</label>
              <input className="tgqc-input" value={formData.pcs} onChange={updateField("pcs")} />
            </div>
            <div className="span3">
              <label className="tgqc-label">{t.fieldWip}</label>
              <textarea className="tgqc-textarea" value={formData.wip} onChange={updateField("wip")} />
            </div>
            <div className="span3">
              <label className="tgqc-label">{t.fieldCaseBack}</label>
              <select className="tgqc-input" value={formData.caseBackType} onChange={updateField("caseBackType")}>
                <option value="Screwing case back">Screwing case back</option>
                <option value="Press fit">Press fit</option>
                <option value="4 screws caseback">4 screws caseback</option>
              </select>
            </div>
          </div>

          <div className="tgqc-sectiontitle">{t.componentsTitle}</div>
          {formData.components.map((c) => (
            <div className="tgqc-comprow" key={c.id}>
              <input placeholder={t.colCode} value={c.code} onChange={updateComponent(c.id, "code")} />
              <input placeholder={t.colCompDesc} value={c.description} onChange={updateComponent(c.id, "description")} />
              <input placeholder={t.colSupplier} value={c.supplier} onChange={updateComponent(c.id, "supplier")} />
              <button className="tgqc-removebtn" onClick={() => removeComponentRow(c.id)}>{t.removeRow}</button>
            </div>
          ))}
          <button className="tgqc-addbtn" onClick={addComponentRow}>{t.addRow}</button>

          {error && <div className="tgqc-alert" style={{ marginTop: 20 }}>{error}</div>}

          <div className="tgqc-actionrow">
            <button className="tgqc-btn" onClick={onCancel}>{t.cancelBtn}</button>
            <button className="tgqc-btn primary" onClick={handleProceed}>{t.proceedBtn}</button>
          </div>
        </div>
      )}

      {stage === "confirm" && (
        <div className="tgqc-card">
          <div className="tgqc-sectiontitle" style={{ marginTop: 0 }}>{t.confirmTitle}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 24px", background: "var(--panel)", padding: 16, borderRadius: 8, marginBottom: 24, border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="tgqc-summarylabel" style={{ width: "auto" }}>{t.fieldSku}</span><span className="tgqc-summaryval" style={{ textAlign: "left", fontSize: 14 }}>{formData.sku}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="tgqc-summarylabel" style={{ width: "auto" }}>{t.fieldBrand}</span><span className="tgqc-summaryval" style={{ textAlign: "left", fontSize: 14 }}>{formData.brand}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="tgqc-summarylabel" style={{ width: "auto" }}>{t.fieldFamily}</span><span className="tgqc-summaryval" style={{ textAlign: "left", fontSize: 14 }}>{formData.family}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="tgqc-summarylabel" style={{ width: "auto" }}>{t.fieldPcs}</span><span className="tgqc-summaryval" style={{ textAlign: "left", fontSize: 14 }}>{formData.pcs}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 100%" }}><span className="tgqc-summarylabel" style={{ width: "auto" }}>{t.fieldDescription}</span><span className="tgqc-summaryval" style={{ textAlign: "left", fontSize: 14 }}>{formData.description}</span></div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: "var(--brass)", fontSize: 15 }}>{t.lblAssignTo}</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button className="tgqc-btn" onClick={() => setStage("review")} style={{ padding: "8px 16px" }}>{t.editDetails}</button>
                  <button className="tgqc-btn primary" onClick={handleSave} style={{ padding: "8px 16px" }}>{t.saveProfile}</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {["check1", "check2", "check3", "check4", "check5", "check6"].map((chk, i) => {
                 const requiresQC1 = formData.caseBackType === "Screwing case back" || !formData.caseBackType;
                 if (chk === "check1" && !requiresQC1) return null;
                 const checkLabels = [t.qcCheck1, t.qcCheck2, t.qcCheck3, t.qcCheck4, t.qcCheck5, t.qcCheck6];
                 
                 const isExpanded = activeAssignmentCheck === chk;
                 const assignedOpId = (formData.tasks || {})[chk];
                 const assignedOp = operators.find(o => String(o.id) === String(assignedOpId));

                 let btnBg = "var(--panel-2)";
                 let btnColor = "var(--text)";
                 let btnBorder = "1px solid var(--line)";
                 if (assignedOp) {
                   btnBg = "var(--ok)";
                   btnColor = "#000";
                   btnBorder = "1px solid var(--ok)";
                 }
                 if (isExpanded) {
                   btnBorder = "1px solid var(--brass)";
                 }

                 return (
                   <div key={chk} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                     <button 
                       className="tgqc-btn" 
                       style={{ 
                         background: btnBg, 
                         color: btnColor, 
                         border: btnBorder, 
                         textAlign: "left", 
                         padding: "16px",
                         display: "flex",
                         justifyContent: "space-between",
                         alignItems: "center"
                       }}
                       onClick={() => {
                         setOperatorSearch("");
                         setActiveAssignmentCheck(isExpanded ? null : chk);
                       }}
                     >
                       <span style={{ fontWeight: 600, fontSize: 14 }}>{checkLabels[i]}</span>
                       {assignedOp && <span style={{ fontSize: 12, opacity: 0.8 }}>{t.lblAssignedTo} {assignedOp.name} ({assignedOp.username})</span>}
                     </button>
                     
                     {isExpanded && (
                       <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0 8px 8px" }}>
                         <input
                           type="text"
                           className="tgqc-input"
                           placeholder="Search operator by name or ID..."
                           value={operatorSearch}
                           onChange={(e) => setOperatorSearch(e.target.value)}
                           style={{ width: "100%", padding: "10px", fontSize: 13, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 4 }}
                         />
                         <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                           {operators.filter(op => {
                             const q = operatorSearch.toLowerCase();
                             return (op.name && op.name.toLowerCase().includes(q)) || 
                                    (op.username && op.username.toLowerCase().includes(q));
                           }).map(op => {
                             const isSelected = String(op.id) === String(assignedOpId);
                             return (
                               <button 
                                 key={op.id}
                                 className="tgqc-btn"
                                 style={{ 
                                   background: isSelected ? "var(--brass)" : "var(--panel)", 
                                   color: isSelected ? "#000" : "var(--text)", 
                                   border: isSelected ? "1px solid var(--brass)" : "1px solid var(--line)",
                                   padding: "10px",
                                   fontSize: 13,
                                   lineHeight: 1.4,
                                   textAlign: "center"
                                 }}
                                 onClick={() => {
                                   updateTask(chk, op.id);
                                   setActiveAssignmentCheck(null);
                                 }}
                               >
                                 <div style={{ fontWeight: 600 }}>{op.name || op.username}</div>
                                 <div style={{ fontSize: 11, opacity: 0.7 }}>{op.username}</div>
                               </button>
                             );
                           })}
                         </div>
                       </div>
                     )}
                   </div>
                 );
              })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 16, lineHeight: 1.5, textAlign: "center" }}>
                Task allocations will be saved and automatically routed to the operator's dashboard.
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === "saved" && (
        <div className="tgqc-savedwrap">
          <div className="tgqc-stamp">{t.savedTitle}</div>
          <div style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 24 }}>{t.savedMsg}</div>
          <button className="tgqc-btn primary" style={{ width: "100%" }} onClick={onCancel}>{t.backToDashboard}</button>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   BREADCRUMBS COMPONENT
========================================================= */
function Breadcrumbs({ view, batch, t }) {
  if (view === "dashboard" || view === "operatorScan" || !view) return null;
  const crumbs = ["Dashboard"];
  if (view.startsWith("operator") || view.startsWith("qc")) crumbs[0] = "Operator";

  if (batch && view !== "newBatch") {
    crumbs.push(`Batch: ${batch.sku}`);
  }

  if (view === "newBatch") crumbs.push(t.btnNewBatch);
  if (view === "viewProfile") crumbs.push(t.btnViewProfile);
  if (view === "scanner") crumbs.push("Scan Products");
  if (view === "operatorConfirm") crumbs.push("Confirm");
  if (view === "qc1Detail" || view === "qcGenericDetail" || view === "qcDefectLogging" || view === "qc4Detail") {
    crumbs.push("QC Detail");
  }

  return (
    <div style={{ padding: "16px 20px", fontSize: 12, color: "var(--text-dim)", maxWidth: 1000, margin: "0 auto", display: "flex", gap: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
          <span style={{ color: i === crumbs.length - 1 ? "var(--brass)" : "inherit" }}>{c}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/* =========================================================
   ROOT APP
========================================================= */
const API_URL = "/api";

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem("tgqc_lang") || "it");
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem("tgqc_session")); } catch { return null; } });
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("tgqc_apiKey") || "");
  const [view, setView] = useState("dashboard"); // dashboard | newBatch | viewProfile | scanner | qcDashboard | qc1Detail
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [defectTags, setDefectTags] = useState(() => {
    const check1Tags = ["Cross Screw defect", "Gasket Defect", "Alignment issues", "Defective screw"];
    const check2Tags = ["Deformation", "Higher leak rates", "Overall Failure"];
    const check3Tags = ["Defective movements", "Defective Crowns/ Stems", "Defective/disaligned Dials", "Defective/disaligned Hands", "Defective Jump of calendary"];
    const check4Tags = ["Timing too fast", "Timing too slow", "Watch stopped"];
    const check5Tags = ["Bracelet detached", "Spring bar failure", "Clasp failure", "Incorrect fit"];
    const check6Specific = ["Defective cases, glasses", "Defective top rings", "Defective Pushers", "Dust under glasses", "Dust under crystal", "Hair under crystal", "Metal shavings/Burrs", "Incorrect time/date change", "Case scratch", "Bezel scratch", "Crystal scratch", "Loose case back/screws"];
    
    const defaults = {
      check1: check1Tags,
      check2: check2Tags,
      check3: check3Tags,
      check4_partA: check4Tags,
      check5: check5Tags,
      check6: [...check1Tags, ...check2Tags, ...check3Tags, ...check4Tags, ...check5Tags, ...check6Specific]
    };
    try {
      const stored = JSON.parse(localStorage.getItem("tgqc_defectTags"));
      if (stored) {
        return { ...defaults, ...stored, check3: defaults.check3, check4_partA: stored.check4_partA || defaults.check4_partA, check5: stored.check5 || defaults.check5, check6: defaults.check6 };
      }
    } catch {}
    return defaults;
  });
  const [toast, setToast] = useState(null); // Used for Undo and notifications

  useEffect(() => {
    if (!session?.token) return;
    fetch(`${API_URL}/batches`, {
      headers: { "Authorization": `Bearer ${session.token}` }
    })
      .then(r => {
        if (!r.ok && (r.status === 401 || r.status === 403)) setSession(null);
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setBatches(data);
        } else {
          console.error("API returned non-array for batches:", data);
          setBatches([]);
        }
      })
      .catch(e => console.error("Failed to load batches from API", e));
  }, [session?.token]);

  useEffect(() => { localStorage.setItem("tgqc_lang", lang); }, [lang]);
  useEffect(() => { localStorage.setItem("tgqc_session", JSON.stringify(session)); }, [session]);
  useEffect(() => { localStorage.setItem("tgqc_defectTags", JSON.stringify(defectTags)); }, [defectTags]);
  useEffect(() => { localStorage.setItem("tgqc_apiKey", geminiKey); }, [geminiKey]);

  const t = dict[lang];

  const handleLogin = (user) => {
    setSession(user);
    setView("dashboard");
  };

  const handleLogout = () => {
    setSession(null);
    setBatches([]);
    setView("dashboard");
  };

  const handleSaved = async (batch) => {
    try {
      const res = await fetch(`${API_URL}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.token}` },
        body: JSON.stringify(batch)
      });
      if (res.ok) {
        setBatches((b) => [batch, ...b]);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to save: ${errData.details || errData.error || res.status}`);
      }
    } catch (e) { 
      console.error("Failed to save batch", e); 
      alert(`Network/Client Error: ${e.message}`);
    }
  };

  const handleViewProfile = (id) => {
    setSelectedBatchId(id);
    setView("viewProfile");
  };

  const handleDeleteBatch = async (id) => {
    try {
      await fetch(`${API_URL}/batches/${id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${session.token}` } });
      setBatches(prev => prev.filter(b => b.id !== id));
    } catch (e) { console.error("Failed to delete batch", e); }
  };

  const handleResetBatch = async (id) => {
    try {
      await fetch(`${API_URL}/batches/${id}/reset`, { method: "POST", headers: { "Authorization": `Bearer ${session.token}` } });
      setBatches(prev => prev.map(b => {
        if (b.id !== id) return b;
        return { 
          ...b, 
          qcState: { check1: null, check2: null, check3: null, check4: null, check5: null, check6: null },
          check3PassedAt: null,
          check4Bypass: false,
          check4Samples: null,
          scannedWatches: []
        };
      }));
    } catch (e) { console.error("Failed to reset batch", e); }
  };

  const handleSaveBatch = async (id) => {
    try {
      await fetch(`${API_URL}/batches/${id}/save`, { method: "PUT", headers: { "Authorization": `Bearer ${session.token}` } });
      setBatches(prev => prev.map(b => b.id === id ? { ...b, isSaved: true } : b));
    } catch (e) { console.error("Failed to save batch", e); }
  };

  const handleAddProduct = (id) => {
    setSelectedBatchId(id);
    setView("scanner");
  };

  const handleScanWatch = async (batchId, barcode) => {
    let duplicateError = false;
    try {
      await fetch(`${API_URL}/batches/${batchId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.token}` },
        body: JSON.stringify({ barcode })
      });
      setBatches((prevBatches) => prevBatches.map(b => {
        if (b.id !== batchId) return b;
        if (b.scannedWatches.some(w => w.barcode === barcode)) {
          duplicateError = true;
          return b;
        }
        return {
          ...b,
          scannedWatches: [{ 
            barcode, 
            time: new Date().toLocaleTimeString(),
            status: "good",
            history: []
          }, ...(b.scannedWatches || [])]
        };
      }));
      if (duplicateError) throw new Error("DUPLICATE");
    } catch (e) { 
      if (e.message === "DUPLICATE") throw e;
      console.error("Failed to scan watch", e); 
    }
  };

  const handleUpdateQC = async (batchId, checkKey, status) => {
    try {
      await fetch(`${API_URL}/batches/${batchId}/qc`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.token}` },
        body: JSON.stringify({ checkKey, status })
      });
      setBatches(prev => prev.map(b => {
        if (b.id !== batchId) return b;
        let extra = {};
        if (checkKey === "check3" && status === "pass") {
          extra.check3PassedAt = Date.now();
        }
        if (checkKey === "check3" && status !== "pass") {
          extra.check3PassedAt = null; // Clear if it was passed before but now failed
        }
        return { ...b, qcState: { ...b.qcState, [checkKey]: status }, ...extra };
      }));
    } catch (e) { console.error("Failed to update QC", e); }
  };

  const handleSaveCheck4State = async (id, bypass, samples) => {
    try {
      await fetch(`${API_URL}/batches/${id}/check4`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.token}` },
        body: JSON.stringify({ bypass, samples })
      });
      setBatches(prev => prev.map(b => {
        if (b.id !== id) return b;
        return { ...b, check4Bypass: bypass, check4Samples: samples };
      }));
    } catch (e) { console.error("Failed to save check 4 state", e); }
  };

  const handleStartQC = (id) => {
    setSelectedBatchId(id);
    setView("dashboard");
  };

  const handleOpenQC4 = (id) => {
    setSelectedBatchId(id);
    setView("qc4Detail");
  };

  const handleOpenQCDefectLogging = (id, checkKey) => {
    if (checkKey === "check6") {
      fetch(`${API_URL}/launch-ai-hub`, { 
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${session.token}` }
      }).catch(err => console.error("Failed to launch AI Hub", err));
    }
    setSelectedBatchId(id);
    setSelectedCheckKey(checkKey);
    setView("qcDefectLogging");
  };

  const handleAddCustomTag = (checkKey, tag) => {
    setDefectTags(prev => {
      const current = prev[checkKey] || [];
      if (current.includes(tag)) return prev;
      return { ...prev, [checkKey]: [...current, tag] };
    });
  };

  const handleDefectLog = async (batchId, barcode, tags, checkKey) => {
    try {
      await fetch(`${API_URL}/batches/${batchId}/defect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.token}` },
        body: JSON.stringify({ barcode, tags, checkKey })
      });
      setBatches(prev => prev.map(b => {
        if (b.id !== batchId) return b;
        let watchExists = false;
        const updatedWatches = (b.scannedWatches || []).map(w => {
          if (w.barcode !== barcode) return w;
          watchExists = true;
          return {
            ...w,
            status: "defective",
            verificationCheckKey: undefined,
            history: [...w.history, {
              timestamp: new Date().toLocaleString(),
              action: checkKey ? `Logged Defect (${checkKey})` : "Logged Defect",
              tags
            }]
          };
        });
        if (!watchExists) {
          updatedWatches.push({
            barcode,
            status: "defective",
            history: [{
              timestamp: new Date().toLocaleString(),
              action: checkKey ? `Logged Defect (${checkKey})` : "Logged Defect",
              tags
            }]
          });
        }
        return { ...b, scannedWatches: updatedWatches };
      }));
    } catch (e) { console.error("Failed to log defect", e); }
  };

  const handleRepairLog = async (batchId, barcode, checkKey) => {
    try {
      await fetch(`${API_URL}/batches/${batchId}/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.token}` },
        body: JSON.stringify({ barcode, checkKey })
      });
      setBatches(prev => prev.map(b => {
        if (b.id !== batchId) return b;
        const updatedWatches = b.scannedWatches.map(w => {
          if (w.barcode !== barcode) return w;
          const checkOrder = ["check1", "check2", "check3", "check4", "check5", "check6"];
          const idx = checkOrder.indexOf(checkKey);
          const verificationKey = (idx >= 0 && idx < checkOrder.length - 1) ? checkOrder[idx + 1] : checkKey;
          return {
            ...w,
            status: "pending_verification",
            verificationCheckKey: verificationKey,
            history: [...w.history, {
              timestamp: new Date().toLocaleString(),
              action: checkKey ? `Repaired (${checkKey})` : "Repaired"
            }]
          };
        });
        return { ...b, scannedWatches: updatedWatches };
      }));
    } catch (e) { console.error("Failed to log repair", e); }
  };

  const handleBulkVerifyLog = async (batchId, barcodes, checkKey) => {
    try {
      await fetch(`${API_URL}/batches/${batchId}/verify-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.token}` },
        body: JSON.stringify({ barcodes, checkKey })
      });
      setBatches(prev => prev.map(b => {
        if (b.id !== batchId) return b;
        const updatedWatches = b.scannedWatches.map(w => {
          if (!barcodes.includes(w.barcode)) return w;
          return {
            ...w,
            status: "good",
            verificationCheckKey: undefined
          };
        });
        return { ...b, scannedWatches: updatedWatches };
      }));
    } catch (e) { console.error("Failed to bulk verify", e); }
  };

  const [selectedCheckKey, setSelectedCheckKey] = useState(null);

  const handleOpenGenericQC = (id, checkKey) => {
    setSelectedBatchId(id);
    setSelectedCheckKey(checkKey);
    setView("qcGenericDetail");
  };

  return (
    <div className="tgqc-root">
      <GlobalStyle />
      {!session ? (
        <AuthScreen lang={lang} setLang={setLang} t={t} onLogin={handleLogin} />
      ) : (
        <div className="tgqc-app-shell">
          <TopNav t={t} lang={lang} setLang={setLang} session={session} onLogout={handleLogout} view={view} setView={setView} />
          
          {view === "activityLog" && (
            <UserActivityView t={t} session={session} onBack={() => setView("dashboard")} />
          )}

          <Breadcrumbs view={view} batch={batches.find(b => String(b.id) === String(selectedBatchId))} t={t} />
          {view === "dashboard" && (
            <Dashboard t={t} session={session} batches={batches} setView={setView} onViewProfile={handleViewProfile} onAddProduct={handleAddProduct} onOpenQCDefectLogging={handleOpenQCDefectLogging} onOpenGenericQC={handleOpenGenericQC} onDeleteBatch={handleDeleteBatch} onResetBatch={handleResetBatch} onSaveBatch={handleSaveBatch} onOpenQC4={handleOpenQC4} lang={lang} />
          )}
          {view === "newBatch" && (
            <NewBatchWizard t={t} lang={lang} onCancel={() => setView("dashboard")} onSaved={handleSaved} />
          )}
          {view === "viewProfile" && (
            <ProfileView t={t} batch={batches.find(b => String(b.id) === String(selectedBatchId))} session={session} onBack={() => setView("dashboard")} />
          )}
          {view === "scanner" && (
            <ScannerView t={t} batch={batches.find(b => String(b.id) === String(selectedBatchId))} onBack={() => setView("dashboard")} onScan={handleScanWatch} />
          )}
          {view === "operatorScan" && (
            <OperatorScanView 
              t={t} 
              onScan={(decodedText, setError) => {
                const b = batches.find(x => x.serial === decodedText);
                if (b) {
                  setSelectedBatchId(b.id);
                  setView("operatorConfirm");
                } else {
                  setError(t.opScanErrNotFound);
                }
              }} 
              onLogout={handleLogout} 
            />
          )}
          {view === "operatorConfirm" && (
            <OperatorConfirmView 
              t={t} 
              batch={batches.find(b => String(b.id) === String(selectedBatchId))} 
              onCancel={() => setView("operatorScan")}
              onConfirm={async () => {
                try {
                  await fetch(`${API_URL}/batches/${selectedBatchId}/confirm`, {
                    method: "PUT",
                    headers: { "Authorization": `Bearer ${session.token}` }
                  });
                  setBatches(prev => prev.map(b => {
                    if (b.id !== selectedBatchId) return b;
                    const confirmedBy = b.confirmedBy || [];
                    if (!confirmedBy.includes(session.id)) {
                      return { ...b, confirmedBy: [...confirmedBy, session.id] };
                    }
                    return b;
                  }));
                  setView("dashboard");
                } catch (e) {
                  console.error("Failed to confirm batch", e);
                  alert("Failed to confirm batch. Please try again.");
                }
              }}
            />
          )}
          {view === "qcGenericDetail" && selectedCheckKey === "check2" && (
            <div style={{ position: "relative", paddingBottom: "40px", maxWidth: 1000, margin: "0 auto" }}>
               <button onClick={() => setView("dashboard")} className="tgqc-btn" style={{ position: 'absolute', top: 20, left: 20, zIndex: 100 }}>&larr; Back to Dashboard</button>
               <ProofmasterTwin />
            </div>
          )}
          {view === "qcGenericDetail" && selectedCheckKey !== "check2" && (
            <QCGenericDetailView 
              t={t} 
              batch={batches.find(b => String(b.id) === String(selectedBatchId))} 
              checkKey={selectedCheckKey}
              onUpdateQC={handleUpdateQC}
              onBack={() => setView("dashboard")} 
            />
          )}
          {view === "qcDefectLogging" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              {selectedCheckKey === "check2" && (
                <div style={{ position: "relative", paddingTop: "20px" }}>
                   <ProofmasterTwin />
                </div>
              )}
              {selectedCheckKey === "check6" && (
                <div style={{ position: "relative", paddingTop: "20px" }}>
                   <AIDefectTwin />
                </div>
              )}
              <QCDefectLoggingView 
                t={t}
                batch={batches.find(b => String(b.id) === String(selectedBatchId))}
                checkKey={selectedCheckKey}
                defectTagsMap={defectTags}
                onAddCustomTag={handleAddCustomTag}
                onDefectLog={handleDefectLog}
                onRepairLog={handleRepairLog}
                onBulkVerifyLog={handleBulkVerifyLog}
                onUpdateQC={handleUpdateQC}
                onBack={() => setView("dashboard")}
              />
            </div>
          )}
          {view === "qc1Detail" && (
            <QCDefectLoggingView 
              t={t} 
              batch={batches.find(b => String(b.id) === String(selectedBatchId))} 
              checkKey="check1"
              defectTagsMap={defectTags}
              onAddCustomTag={(chk, tag) => {
                setDefectTags(prev => ({ ...prev, [chk]: [...(prev[chk] || []), tag] }));
              }}
              onDefectLog={handleDefectLog} 
              onRepairLog={handleRepairLog}
              onBulkVerifyLog={handleBulkVerifyLog}
              onUpdateQC={(bId, val) => {
                setBatches(prev => prev.map(b => b.id === bId ? { ...b, qcState: { ...b.qcState, check1: val } } : b));
              }}
              onBack={() => setView("dashboard")} 
            />
          )}
          {view === "qc4Detail" && (
            <QC4DetailView 
              t={t} 
              batch={batches.find(b => String(b.id) === String(selectedBatchId))} 
              defectTagsMap={defectTags}
              onAddCustomTag={(chk, tag) => {
                setDefectTags(prev => ({ ...prev, [chk]: [...(prev[chk] || []), tag] }));
              }}
              onDefectLog={handleDefectLog} 
              onRepairLog={handleRepairLog}
              onBulkVerifyLog={handleBulkVerifyLog}
              onUpdateQC={handleUpdateQC}
              onSaveCheck4State={handleSaveCheck4State}
              onBack={() => setView("dashboard")} 
            />
          )}
          {view === "ai-analyst" && session && session.role === 'manager' && (
            <div style={{ height: 'calc(100vh - 100px)', padding: '20px' }}>
              <AIAssistant apiKey={geminiKey} setApiKey={setGeminiKey} session={session} lang={lang} />
            </div>
          )}
        </div>
      )}
      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, background: "rgba(0,0,0,0.85)", 
          color: "#fff", padding: "12px 20px", borderRadius: "8px", 
          display: "flex", alignItems: "center", gap: 16, zIndex: 9999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)"
        }}>
          <span>{toast.message}</span>
          <button onClick={toast.onUndo} style={{
            background: "none", border: "1px solid var(--brass)", color: "var(--brass)",
            padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold"
          }}>UNDO</button>
        </div>
      )}
    </div>
  );
}
