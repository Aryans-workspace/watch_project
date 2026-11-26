/**
 * Phone Camera AI Defect Studio
 * 3-Stage Lifecycle: Data Collection -> Model Training -> Defect Inspection
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // State Variables
    // ----------------------------------------------------
    let activePage = 'page-collection';
    let currentCategory = 'train_good';
    let activeDataset = 'watch_dials_v1';
    let currentInspectionResult = null;
    let activeInspectionView = 'annotated';
    let isTrainingPolling = false;
    let qrGenerated = false;

    // ----------------------------------------------------
    // DOM Elements - Telemetry Bar & Studio Navigation
    // ----------------------------------------------------
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const hostIpText = document.getElementById('hostIpText');
    const resolutionText = document.getElementById('resolutionText');
    const activeModelBadge = document.getElementById('activeModelBadge');
    const fpsText = document.getElementById('fpsText');

    const studioTabBtns = document.querySelectorAll('.studio-tab-btn');
    const studioPages = document.querySelectorAll('.studio-page');

    // Stage 1 (Collection) Elements
    const datasetSelect = document.getElementById('datasetSelect');
    const btnNewDataset = document.getElementById('btnNewDataset');
    const catButtons = document.querySelectorAll('.category-toggle-grid .cat-btn');
    const btnCaptureToDataset = document.getElementById('btnCaptureToDataset');
    const btnTorch = document.getElementById('btnTorch');
    const torchLabel = document.getElementById('torchLabel');
    const countTrainGood = document.getElementById('countTrainGood');
    const countValGood = document.getElementById('countValGood');
    const countValDefect = document.getElementById('countValDefect');
    const totalImagesBadge = document.getElementById('totalImagesBadge');
    const datasetImagesGrid = document.getElementById('datasetImagesGrid');
    const btnRefreshDatasetImages = document.getElementById('btnRefreshDatasetImages');
    const btnProceedToTraining = document.getElementById('btnProceedToTraining');
    const captureFlash = document.getElementById('captureFlash');

    // Phone Connection Elements
    const qrcodeBox = document.getElementById('qrcodeBox');
    const mobileCompanionLink = document.getElementById('mobileCompanionLink');
    const togglePhonePairing = document.getElementById('togglePhonePairing');
    const phonePairingBody = document.getElementById('phonePairingBody');
    const btnShowIpWebcam = document.getElementById('btnShowIpWebcam');
    const btnShowUsb = document.getElementById('btnShowUsb');
    const drawerIpWebcam = document.getElementById('drawerIpWebcam');
    const drawerUsb = document.getElementById('drawerUsb');
    const ipWebcamInput = document.getElementById('ipWebcamInput');
    const btnConnectIpWebcam = document.getElementById('btnConnectIpWebcam');
    const usbIndexSelect = document.getElementById('usbIndexSelect');
    const btnConnectUsb = document.getElementById('btnConnectUsb');
    const btnDiagnostics = document.getElementById('btnDiagnostics');

    // Stage 2 (Training) Elements
    const trainDatasetSelect = document.getElementById('trainDatasetSelect');
    const trainCardGoodCount = document.getElementById('trainCardGoodCount');
    const trainCardValGoodCount = document.getElementById('trainCardValGoodCount');
    const trainCardValDefectCount = document.getElementById('trainCardValDefectCount');
    const selectBackbone = document.getElementById('selectBackbone');
    const selectTrainRoi = document.getElementById('selectTrainRoi');
    const selectCoreset = document.getElementById('selectCoreset');
    const btnStartTraining = document.getElementById('btnStartTraining');
    const btnTrainingLabel = document.getElementById('btnTrainingLabel');
    const trainStatusBadge = document.getElementById('trainStatusBadge');
    const trainProgressFill = document.getElementById('trainProgressFill');
    const trainProgressText = document.getElementById('trainProgressText');
    const trainStageText = document.getElementById('trainStageText');
    const trainTerminal = document.getElementById('trainTerminal');
    const activeModelSummary = document.getElementById('activeModelSummary');
    const sumModelId = document.getElementById('sumModelId');
    const sumThreshold = document.getElementById('sumThreshold');
    const sumMemoryBank = document.getElementById('sumMemoryBank');
    const sumFeatureDim = document.getElementById('sumFeatureDim');
    const btnProceedToInspection = document.getElementById('btnProceedToInspection');

    // Stage 3 (Inspection) Elements
    const inspectionLiveFeed = document.getElementById('inspectionLiveFeed');
    const inspectionResultImg = document.getElementById('inspectionResultImg');
    const btnRunInspection = document.getElementById('btnRunInspection');
    const sliderInspectSens = document.getElementById('sliderInspectSens');
    const valInspectSens = document.getElementById('valInspectSens');
    const viewToggleBtns = document.querySelectorAll('#inspectionViewToggles .toggle-btn');
    const inspectTimeBadge = document.getElementById('inspectTimeBadge');
    const verdictBanner = document.getElementById('verdictBanner');
    const verdictTitle = document.getElementById('verdictTitle');
    const verdictSub = document.getElementById('verdictSub');
    const verdictIcon = document.getElementById('verdictIcon');
    const scoreText = document.getElementById('scoreText');
    const scoreMeterFill = document.getElementById('scoreMeterFill');
    const inspectTotalDefects = document.getElementById('inspectTotalDefects');
    const inspectDustCount = document.getElementById('inspectDustCount');
    const inspectScratchCount = document.getElementById('inspectScratchCount');
    const inspectDefectList = document.getElementById('inspectDefectList');

    // Modal Elements
    const newDatasetModal = document.getElementById('newDatasetModal');
    const newDatasetNameInput = document.getElementById('newDatasetNameInput');
    const btnCloseNewDatasetModal = document.getElementById('btnCloseNewDatasetModal');
    const btnCancelNewDataset = document.getElementById('btnCancelNewDataset');
    const btnConfirmNewDataset = document.getElementById('btnConfirmNewDataset');

    // ----------------------------------------------------
    // Studio Stage Page Switcher
    // ----------------------------------------------------
    function switchStagePage(pageId) {
        activePage = pageId;
        studioTabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageId);
        });
        studioPages.forEach(p => {
            p.classList.toggle('active', p.id === pageId);
        });

        if (pageId === 'page-training') {
            loadDatasets();
            loadModelsList();
            setTimeout(resizeCanvasToSampleImage, 100);
        } else if (pageId === 'page-inspection') {
            // Default to live view initially
            switchInspectionView('live');
        }
    }

    studioTabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchStagePage(btn.dataset.page));
    });

    btnProceedToTraining.addEventListener('click', () => switchStagePage('page-training'));
    btnProceedToInspection.addEventListener('click', () => switchStagePage('page-inspection'));

    // ----------------------------------------------------
    // STAGE 1: Data Collection & Dataset Management
    // ----------------------------------------------------
    // Category Selector
    catButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            catButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.cat;
        });
    });

    // Load Datasets List
    async function loadDatasets() {
        try {
            const resp = await fetch('/api/datasets');
            if (!resp.ok) return;
            const data = await resp.json();

            activeDataset = data.active_folder;

            // Populate collection dropdown
            datasetSelect.innerHTML = '';
            trainDatasetSelect.innerHTML = '';

            data.datasets.forEach(d => {
                const opt1 = document.createElement('option');
                opt1.value = d.name;
                opt1.innerText = `${d.name} (${d.total_images} images)`;
                if (d.name === activeDataset) opt1.selected = true;
                datasetSelect.appendChild(opt1);

                const opt2 = document.createElement('option');
                opt2.value = d.name;
                opt2.innerText = `${d.name} (${d.total_images} images)`;
                if (d.name === activeDataset) opt2.selected = true;
                trainDatasetSelect.appendChild(opt2);
            });

            // Update Counts
            updateCategoryCounts(data.counts);
            loadDatasetImages();
            if (typeof loadDatasetFocusMaskAndSample === 'function') {
                loadDatasetFocusMaskAndSample(activeDataset);
            }
        } catch (e) {
            console.warn('Dataset load error:', e);
        }
    }

    function updateCategoryCounts(counts) {
        if (!counts) return;
        const tg = counts.train_good || 0;
        const vg = counts.val_good || 0;
        const vd = counts.val_defect || 0;

        countTrainGood.innerText = tg;
        countValGood.innerText = vg;
        countValDefect.innerText = vd;
        totalImagesBadge.innerText = tg + vg + vd;

        trainCardGoodCount.innerText = tg;
        trainCardValGoodCount.innerText = vg;
        trainCardValDefectCount.innerText = vd;
    }

    datasetSelect.addEventListener('change', async () => {
        const selected = datasetSelect.value;
        try {
            await fetch('/api/datasets/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: selected })
            });
            loadDatasets();
        } catch (e) {}
    });

    trainDatasetSelect.addEventListener('change', () => {
        datasetSelect.value = trainDatasetSelect.value;
        if (typeof loadDatasetFocusMaskAndSample === 'function') {
            loadDatasetFocusMaskAndSample(trainDatasetSelect.value);
        }
        datasetSelect.dispatchEvent(new Event('change'));
    });

    // Create New Dataset Modal
    btnNewDataset.addEventListener('click', () => {
        newDatasetNameInput.value = '';
        newDatasetModal.style.display = 'flex';
    });

    [btnCloseNewDatasetModal, btnCancelNewDataset].forEach(b => {
        b.addEventListener('click', () => newDatasetModal.style.display = 'none');
    });

    btnConfirmNewDataset.addEventListener('click', async () => {
        const name = newDatasetNameInput.value.trim();
        if (!name) return;
        try {
            await fetch('/api/datasets/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name })
            });
            newDatasetModal.style.display = 'none';
            loadDatasets();
        } catch (e) {
            alert('Failed to create dataset: ' + e.message);
        }
    });

    // List Dataset Images in Gallery
    async function loadDatasetImages() {
        try {
            const resp = await fetch(`/api/datasets/images?folder=${activeDataset}`);
            if (!resp.ok) return;
            const images = await resp.json();

            datasetImagesGrid.innerHTML = '';
            if (images.length === 0) {
                datasetImagesGrid.innerHTML = '<div class="empty-state">No images collected yet. Click CAPTURE TO DATASET!</div>';
                return;
            }

            images.forEach(img => {
                const item = document.createElement('div');
                item.className = 'dataset-img-item';
                const badgeColor = img.category === 'train_good' ? 'bg-green text-green' : (img.category === 'val_good' ? 'text-blue' : 'text-red');
                const catShort = img.category === 'train_good' ? 'Train' : (img.category === 'val_good' ? 'Val' : 'Defect');

                item.innerHTML = `
                    <img src="${img.thumb_url || img.url}" alt="${img.filename}">
                    <span class="dataset-img-badge ${badgeColor}">${catShort}</span>
                    <button class="dataset-img-del" title="Delete image">&times;</button>
                `;

                // Delete handler
                item.querySelector('.dataset-img-del').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete ${img.filename}?`)) {
                        await fetch('/api/datasets/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: img.filename, category: img.category, folder: activeDataset })
                        });
                        loadDatasets();
                    }
                });

                datasetImagesGrid.appendChild(item);
            });
        } catch (e) {}
    }

    btnRefreshDatasetImages.addEventListener('click', loadDatasetImages);

    // Capture to Dataset Trigger
    async function triggerCaptureToDataset() {
        captureFlash.classList.add('flashing');
        setTimeout(() => captureFlash.classList.remove('flashing'), 100);

        btnCaptureToDataset.disabled = true;
        btnCaptureToDataset.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CAPTURING...';

        try {
            const resp = await fetch('/api/datasets/capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: currentCategory,
                    folder: activeDataset
                })
            });
            const res = await resp.json();

            if (res.success) {
                updateCategoryCounts(res.counts);
                loadDatasetImages();
                if (res.resolution) {
                    resolutionText.innerText = res.resolution;
                }
            } else {
                alert('Capture error: ' + (res.error || 'Failed to capture'));
            }
        } catch (e) {
            alert('Capture failed: ' + e.message);
        } finally {
            btnCaptureToDataset.disabled = false;
            btnCaptureToDataset.innerHTML = '<i class="fa-solid fa-camera"></i> CAPTURE TO DATASET';
        }
    }

    btnCaptureToDataset.addEventListener('click', triggerCaptureToDataset);

    // Keyboard Shortcut (Spacebar triggers capture on Collection page, inspects on Inspection page)
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (activePage === 'page-collection') {
                triggerCaptureToDataset();
            } else if (activePage === 'page-inspection') {
                runLiveInspection();
            }
        } else if (e.key === 'f' || e.key === 'F') {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
            else document.exitFullscreen().catch(() => {});
        }
    });

    // ----------------------------------------------------
    // STAGE 2: Model Training
    // ----------------------------------------------------
    btnStartTraining.addEventListener('click', async () => {
        btnStartTraining.disabled = true;
        btnTrainingLabel.innerText = 'TRAINING IN PROGRESS...';
        trainStatusBadge.innerText = 'TRAINING';
        trainStatusBadge.className = 'badge text-accent';
        trainTerminal.innerHTML = '';

        const payload = {
            dataset_name: trainDatasetSelect.value,
            backbone: selectBackbone.value,
            roi_mode: selectTrainRoi.value,
            coreset_ratio: parseFloat(selectCoreset.value)
        };

        try {
            const resp = await fetch('/api/train/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const res = await resp.json();

            if (res.success) {
                startTrainingPolling();
            } else {
                alert('Training failed to start: ' + res.error);
                btnStartTraining.disabled = false;
                btnTrainingLabel.innerText = 'TRAIN AI DEFECT MODEL';
                trainStatusBadge.innerText = 'IDLE';
            }
        } catch (e) {
            alert('Request error: ' + e.message);
            btnStartTraining.disabled = false;
        }
    });

    function startTrainingPolling() {
        if (isTrainingPolling) return;
        isTrainingPolling = true;

        const interval = setInterval(async () => {
            try {
                const resp = await fetch('/api/train/status');
                if (!resp.ok) return;
                const state = await resp.json();

                // Progress update
                trainProgressFill.style.width = state.progress + '%';
                trainProgressText.innerText = Math.round(state.progress) + '%';
                trainStageText.innerText = state.stage;

                // Terminal log append
                if (state.logs && state.logs.length > 0) {
                    trainTerminal.innerHTML = state.logs.map(l => `<div class="terminal-line">${l}</div>`).join('');
                    trainTerminal.scrollTop = trainTerminal.scrollHeight;
                }

                if (state.status === 'completed') {
                    clearInterval(interval);
                    isTrainingPolling = false;
                    btnStartTraining.disabled = false;
                    btnTrainingLabel.innerText = 'TRAIN AI DEFECT MODEL';
                    trainStatusBadge.innerText = 'READY';
                    trainStatusBadge.className = 'badge text-green';

                    // Show active model summary
                    activeModelSummary.style.display = 'block';
                    sumModelId.innerText = state.active_model_id || '--';
                    sumThreshold.innerText = state.active_threshold || '--';
                    if (state.meta) {
                        sumMemoryBank.innerText = (state.meta.memory_bank_size || '--') + ' vectors';
                        sumFeatureDim.innerText = (state.meta.feature_dim || '--') + ' channels';
                    }
                    activeModelBadge.innerText = 'Trained & Ready';
                    activeModelBadge.style.color = '#22c55e';
                    if (typeof loadModelsList === 'function') {
                        loadModelsList();
                    }
                } else if (state.status === 'error') {
                    clearInterval(interval);
                    isTrainingPolling = false;
                    btnStartTraining.disabled = false;
                    btnTrainingLabel.innerText = 'TRAIN AI DEFECT MODEL';
                    trainStatusBadge.innerText = 'ERROR';
                    trainStatusBadge.className = 'badge text-red';
                    alert('Training error: ' + state.error);
                }
            } catch (e) {
                clearInterval(interval);
                isTrainingPolling = false;
            }
        }, 600);
    }

    // ----------------------------------------------------
    // STAGE 3: Defect Inspection
    // ----------------------------------------------------
    sliderInspectSens.addEventListener('input', () => {
        valInspectSens.innerText = sliderInspectSens.value + '%';
    });

    // View Toggles (Annotated, Heatmap, Live)
    viewToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            viewToggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            switchInspectionView(btn.dataset.view);
        });
    });

    function switchInspectionView(view) {
        activeInspectionView = view;
        if (view === 'live') {
            inspectionLiveFeed.style.display = 'block';
            inspectionResultImg.style.display = 'none';
        } else if (currentInspectionResult) {
            inspectionLiveFeed.style.display = 'none';
            inspectionResultImg.style.display = 'block';
            if (view === 'annotated') {
                inspectionResultImg.src = currentInspectionResult.annotated_b64;
            } else if (view === 'heatmap') {
                inspectionResultImg.src = currentInspectionResult.heatmap_b64;
            }
        }
    }

    // Run Live Inspection
    async function runLiveInspection() {
        btnRunInspection.disabled = true;
        btnRunInspection.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> RUNNING AI INFERENCE...';

        try {
            const resp = await fetch('/api/inspect/live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sensitivity: parseInt(sliderInspectSens.value)
                })
            });
            const data = await resp.json();

            if (data.success) {
                currentInspectionResult = data;
                renderInspectionResult(data);
                switchInspectionView('annotated');
                document.querySelector('[data-view="annotated"]').click();
            } else {
                alert('Inspection error: ' + (data.error || 'Failed to inspect'));
            }
        } catch (e) {
            alert('Inspection request failed: ' + e.message);
        } finally {
            btnRunInspection.disabled = false;
            btnRunInspection.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> INSPECT DEFECTS (CURRENT FRAME)';
        }
    }

    btnRunInspection.addEventListener('click', runLiveInspection);

    function renderInspectionResult(data) {
        inspectTimeBadge.innerText = data.processing_time_ms + ' ms';

        // Verdict Banner
        if (data.is_pass) {
            verdictBanner.className = 'verdict-banner pass';
            verdictTitle.innerText = 'PASS: PRISTINE';
            verdictSub.innerText = 'Component dial surface is defect-free.';
            verdictIcon.className = 'fa-solid fa-circle-check';
        } else {
            verdictBanner.className = 'verdict-banner fail';
            verdictTitle.innerText = 'FAIL: DEFECT DETECTED';
            verdictSub.innerText = `Identified ${data.total_defects} anomalies (${data.dust_count} dust, ${data.scratch_count} scratches).`;
            verdictIcon.className = 'fa-solid fa-triangle-exclamation';
        }

        // Anomaly Score Meter
        scoreText.innerText = `${data.anomaly_score.toFixed(3)} / \u03c4: ${data.threshold.toFixed(3)}`;
        const pct = Math.min(100, Math.max(5, (data.anomaly_score / (data.threshold * 2.0)) * 100));
        scoreMeterFill.style.width = pct + '%';

        // Metrics
        inspectTotalDefects.innerText = data.total_defects;
        inspectDustCount.innerText = data.dust_count;
        inspectScratchCount.innerText = data.scratch_count;

        // Defect Table
        inspectDefectList.innerHTML = '';
        if (!data.defects || data.defects.length === 0) {
            inspectDefectList.innerHTML = '<div class="empty-state">No anomalies found. Component is pristine!</div>';
            return;
        }

        data.defects.forEach(d => {
            const item = document.createElement('div');
            item.className = 'defect-item';
            item.innerHTML = `
                <div>
                    <span class="defect-badge ${d.type}">${d.type.toUpperCase()}</span>
                    <strong>#${d.id}</strong>
                </div>
                <div style="color: var(--text-dim); font-family: monospace;">
                    X: ${d.x}, Y: ${d.y} | Area: ${Math.round(d.area)}px²
                </div>
            `;
            inspectDefectList.appendChild(item);
        });
    }

    // ----------------------------------------------------
    // Phone Connection Hub & Diagnostics
    // ----------------------------------------------------
    togglePhonePairing.addEventListener('click', () => {
        phonePairingBody.style.display = phonePairingBody.style.display === 'none' ? 'block' : 'none';
    });

    btnShowIpWebcam.addEventListener('click', () => {
        drawerIpWebcam.style.display = drawerIpWebcam.style.display === 'none' ? 'block' : 'none';
        drawerUsb.style.display = 'none';
    });

    btnShowUsb.addEventListener('click', () => {
        drawerUsb.style.display = drawerUsb.style.display === 'none' ? 'block' : 'none';
        drawerIpWebcam.style.display = 'none';
    });

    btnConnectIpWebcam.addEventListener('click', async () => {
        const url = ipWebcamInput.value.trim();
        await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'ip_webcam', ip: url })
        });
        fetchStatus();
    });

    btnConnectUsb.addEventListener('click', async () => {
        const idx = parseInt(usbIndexSelect.value);
        await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'usb_webcam', usb_index: idx })
        });
        fetchStatus();
    });

    btnDiagnostics.addEventListener('click', async () => {
        try {
            const resp = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const res = await resp.json();
            alert(`Camera Diagnostic:\n${res.message}\nResolution: ${res.resolution}\nLatency: ${res.latency_ms} ms`);
        } catch (e) {
            alert('Diagnostic check failed: ' + e.message);
        }
    });

    // Torch Toggle
    btnTorch.addEventListener('click', async () => {
        try {
            const resp = await fetch('/api/torch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const res = await resp.json();
            btnTorch.classList.toggle('active', res.torch_on);
            torchLabel.innerText = res.torch_on ? 'Torch ON' : 'Torch LED';
        } catch (e) {}
    });

    // Viewport Overlay Controls
    const toggleCropRoi = document.getElementById('toggleCropRoi');
    const toggleLiveZoom = document.getElementById('toggleLiveZoom');
    const toggleCrosshair = document.getElementById('toggleCrosshair');
    const toggleDialRoi = document.getElementById('toggleDialRoi');
    const labelCropRoiBtn = document.getElementById('labelCropRoiBtn');

    // Zoom & Crop Framing Controls
    const sliderCropZoom = document.getElementById('sliderCropZoom');
    const valCropZoom = document.getElementById('valCropZoom');
    const valCropDim = document.getElementById('valCropDim');
    const btnZoomPresets = document.querySelectorAll('.btn-zoom-preset');
    const btnNudgeLeft = document.getElementById('btnNudgeLeft');
    const btnNudgeRight = document.getElementById('btnNudgeRight');
    const btnNudgeUp = document.getElementById('btnNudgeUp');
    const btnNudgeDown = document.getElementById('btnNudgeDown');
    const btnNudgeReset = document.getElementById('btnNudgeReset');

    let currentCropZoom = 1.50;
    let currentOffsetX = 0;
    let currentOffsetY = 0;
    let isUserDraggingSlider = false;

    function updateZoomDisplay(zoomVal, totalMmW = null, totalMmH = null) {
        currentCropZoom = parseFloat(zoomVal);
        if (valCropZoom) valCropZoom.innerText = `${currentCropZoom.toFixed(2)}x`;
        if (sliderCropZoom && !isUserDraggingSlider) sliderCropZoom.value = currentCropZoom;

        const mmW = totalMmW !== null ? totalMmW : (52.0 / currentCropZoom).toFixed(1);
        const mmH = totalMmH !== null ? totalMmH : (58.0 / currentCropZoom).toFixed(1);
        if (valCropDim) valCropDim.innerText = `${mmW}×${mmH} mm → 828×922px`;
        if (labelCropRoiBtn) labelCropRoiBtn.innerText = `ROI ${currentCropZoom.toFixed(2)}x (828×922)`;

        btnZoomPresets.forEach(btn => {
            const z = parseFloat(btn.dataset.zoom);
            btn.classList.toggle('active', Math.abs(z - currentCropZoom) < 0.04);
        });
    }

    let zoomDebounceTimer = null;
    async function sendCropSettings(immediate = false) {
        if (zoomDebounceTimer) clearTimeout(zoomDebounceTimer);
        const doSend = async () => {
            try {
                const resp = await fetch('/api/camera/crop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        crop_zoom: currentCropZoom,
                        offset_x: currentOffsetX,
                        offset_y: currentOffsetY
                    })
                });
                const res = await resp.json();
                if (res.crop) {
                    currentOffsetX = res.crop.offset_x || 0;
                    currentOffsetY = res.crop.offset_y || 0;
                    const hudCoords = document.getElementById('hudCoords');
                    if (hudCoords) {
                        hudCoords.innerText = `ROI ${res.crop.crop_mm_total_w}×${res.crop.crop_mm_total_h}mm (${currentCropZoom.toFixed(2)}x)`;
                    }
                }
            } catch (e) {}
        };

        if (immediate) {
            await doSend();
        } else {
            zoomDebounceTimer = setTimeout(doSend, 40);
        }
    }

    if (sliderCropZoom) {
        sliderCropZoom.addEventListener('input', (e) => {
            isUserDraggingSlider = true;
            updateZoomDisplay(e.target.value);
            sendCropSettings(false);
        });
        sliderCropZoom.addEventListener('change', (e) => {
            isUserDraggingSlider = false;
            updateZoomDisplay(e.target.value);
            sendCropSettings(true);
        });
    }

    btnZoomPresets.forEach(btn => {
        btn.addEventListener('click', () => {
            const z = parseFloat(btn.dataset.zoom);
            updateZoomDisplay(z);
            sendCropSettings(true);
        });
    });

    const NUDGE_STEP = 15;
    if (btnNudgeLeft) {
        btnNudgeLeft.addEventListener('click', () => { currentOffsetX -= NUDGE_STEP; sendCropSettings(true); });
    }
    if (btnNudgeRight) {
        btnNudgeRight.addEventListener('click', () => { currentOffsetX += NUDGE_STEP; sendCropSettings(true); });
    }
    if (btnNudgeUp) {
        btnNudgeUp.addEventListener('click', () => { currentOffsetY -= NUDGE_STEP; sendCropSettings(true); });
    }
    if (btnNudgeDown) {
        btnNudgeDown.addEventListener('click', () => { currentOffsetY += NUDGE_STEP; sendCropSettings(true); });
    }
    if (btnNudgeReset) {
        btnNudgeReset.addEventListener('click', () => { currentOffsetX = 0; currentOffsetY = 0; sendCropSettings(true); });
    }

    let overlayState = {
        show_crop_roi: true,
        crop_live_stream: false,
        crosshair: true,
        dial_roi: true
    };

    async function sendOverlayUpdate() {
        try {
            await fetch('/api/overlays', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(overlayState)
            });
        } catch (e) {}
    }

    if (toggleCropRoi) {
        toggleCropRoi.addEventListener('click', () => {
            overlayState.show_crop_roi = !overlayState.show_crop_roi;
            toggleCropRoi.classList.toggle('active', overlayState.show_crop_roi);
            sendOverlayUpdate();
        });
    }

    if (toggleLiveZoom) {
        toggleLiveZoom.addEventListener('click', () => {
            overlayState.crop_live_stream = !overlayState.crop_live_stream;
            toggleLiveZoom.classList.toggle('active', overlayState.crop_live_stream);
            sendOverlayUpdate();
        });
    }

    if (toggleCrosshair) {
        toggleCrosshair.addEventListener('click', () => {
            overlayState.crosshair = !overlayState.crosshair;
            toggleCrosshair.classList.toggle('active', overlayState.crosshair);
            sendOverlayUpdate();
        });
    }

    if (toggleDialRoi) {
        toggleDialRoi.addEventListener('click', () => {
            overlayState.dial_roi = !overlayState.dial_roi;
            toggleDialRoi.classList.toggle('active', overlayState.dial_roi);
            sendOverlayUpdate();
        });
    }

    // ----------------------------------------------------
    // Telemetry Poller
    // ----------------------------------------------------
    async function fetchStatus() {
        try {
            const resp = await fetch('/api/status');
            if (!resp.ok) return;
            const data = await resp.json();

            // Host IP & QR Code
            if (data.primary_ip) {
                hostIpText.innerText = `${data.primary_ip}:5005`;
                const httpsUrl = data.https_url || `https://${data.primary_ip}:5443/phone`;
                mobileCompanionLink.innerText = httpsUrl;
                mobileCompanionLink.href = httpsUrl;

                if (!qrGenerated && typeof QRCode !== 'undefined') {
                    qrcodeBox.innerHTML = '';
                    new QRCode(qrcodeBox, {
                        text: httpsUrl,
                        width: 78,
                        height: 78,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.M
                    });
                    qrGenerated = true;
                }
            }

            // Connection indicator
            if (data.connected) {
                statusDot.className = 'indicator-dot online';
                statusText.innerText = 'ONLINE';
            } else {
                statusDot.className = 'indicator-dot';
                statusText.innerText = 'OFFLINE';
            }

            if (data.crop && data.crop.crop_enabled) {
                resolutionText.innerText = data.crop.target_resolution;
                const hudCoords = document.getElementById('hudCoords');
                if (hudCoords) {
                    hudCoords.innerText = `ROI ${data.crop.crop_mm_total_w}×${data.crop.crop_mm_total_h}mm (${data.crop.crop_zoom}x)`;
                }
                if (!isUserDraggingSlider && data.crop.crop_zoom) {
                    updateZoomDisplay(data.crop.crop_zoom, data.crop.crop_mm_total_w, data.crop.crop_mm_total_h);
                }
            } else {
                resolutionText.innerText = data.resolution || '--';
            }
            fpsText.innerText = (data.fps || 0).toFixed(1);

            if (data.is_model_ready) {
                activeModelBadge.innerText = 'Model Ready';
                activeModelBadge.style.color = '#22c55e';
            } else {
                activeModelBadge.innerText = 'Untrained';
                activeModelBadge.style.color = '#a78bfa';
            }
        } catch (e) {}
    }

    // =========================================================================
    // Tab 2: Interactive Grid Mesh Focus Mask Editor & Models Registry Module
    // =========================================================================
    const gridMeshCanvas = document.getElementById('gridMeshCanvas');
    const gridSampleImg = document.getElementById('gridSampleImg');
    const gridCanvasContainer = document.getElementById('gridCanvasContainer');
    const gridEditorHint = document.getElementById('gridEditorHint');
    const toolPaint = document.getElementById('toolPaint');
    const toolErase = document.getElementById('toolErase');
    const selectGridDensity = document.getElementById('selectGridDensity');
    const btnInvertGrid = document.getElementById('btnInvertGrid');
    const btnClearGrid = document.getElementById('btnClearGrid');
    const btnSaveGridMask = document.getElementById('btnSaveGridMask');
    const btnReloadSampleImage = document.getElementById('btnReloadSampleImage');
    const gridMaskCoverageBadge = document.getElementById('gridMaskCoverageBadge');
    const linkJumpToGrid = document.getElementById('linkJumpToGrid');

    const meshDatasetName = document.getElementById('meshDatasetName');
    const meshSampleName = document.getElementById('meshSampleName');
    const meshResolution = document.getElementById('meshResolution');
    const meshActiveCount = document.getElementById('meshActiveCount');
    const meshCoveragePct = document.getElementById('meshCoveragePct');
    const meshSavedStatus = document.getElementById('meshSavedStatus');

    const modelsList = document.getElementById('modelsList');
    const btnRefreshModels = document.getElementById('btnRefreshModels');

    let meshCtx = gridMeshCanvas ? gridMeshCanvas.getContext('2d') : null;
    let gridRows = 32;
    let gridCols = 32;
    let gridState = [];
    let currentTool = 'paint'; // 'paint' | 'erase'
    let brushSize = 2; // 1 | 2 | 3
    let isMouseDown = false;
    let isErasing = false;
    let hoveredCell = null; // { r, c }
    let currentSampleInfo = null;

    function initGridMatrix(rows, cols, fillVal = 0) {
        gridRows = rows;
        gridCols = cols;
        gridState = [];
        for (let r = 0; r < rows; r++) {
            const row = new Uint8Array(cols);
            if (fillVal !== 0) row.fill(fillVal);
            gridState.push(row);
        }
    }

    initGridMatrix(32, 32);

    function resizeCanvasToSampleImage() {
        if (!gridMeshCanvas || !gridSampleImg) return;
        if (!gridSampleImg.complete || gridSampleImg.naturalWidth === 0) return;

        const left = gridSampleImg.offsetLeft;
        const top = gridSampleImg.offsetTop;
        const w = gridSampleImg.clientWidth;
        const h = gridSampleImg.clientHeight;

        if (w === 0 || h === 0) return;

        gridMeshCanvas.style.left = `${left}px`;
        gridMeshCanvas.style.top = `${top}px`;
        gridMeshCanvas.style.width = `${w}px`;
        gridMeshCanvas.style.height = `${h}px`;

        gridMeshCanvas.width = w;
        gridMeshCanvas.height = h;

        drawMeshCanvas();
    }

    function drawMeshCanvas() {
        if (!meshCtx || !gridMeshCanvas) return;
        const w = gridMeshCanvas.width;
        const h = gridMeshCanvas.height;
        if (w === 0 || h === 0) return;

        meshCtx.clearRect(0, 0, w, h);

        const cellW = w / gridCols;
        const cellH = h / gridRows;

        // 1. Subtle grid mesh lines
        meshCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        meshCtx.lineWidth = 1;

        meshCtx.beginPath();
        for (let c = 0; c <= gridCols; c++) {
            const x = Math.round(c * cellW);
            meshCtx.moveTo(x, 0);
            meshCtx.lineTo(x, h);
        }
        for (let r = 0; r <= gridRows; r++) {
            const y = Math.round(r * cellH);
            meshCtx.moveTo(0, y);
            meshCtx.lineTo(w, y);
        }
        meshCtx.stroke();

        // 2. Active painted boxes in transparent red
        meshCtx.fillStyle = 'rgba(239, 68, 68, 0.45)';
        meshCtx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
        meshCtx.lineWidth = 1;

        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                if (gridState[r] && gridState[r][c] === 1) {
                    const x = c * cellW;
                    const y = r * cellH;
                    meshCtx.fillRect(x, y, cellW, cellH);
                    meshCtx.strokeRect(x, y, cellW, cellH);
                }
            }
        }

        // 3. Hover / Brush outline indicator
        if (hoveredCell && hoveredCell.r >= 0 && hoveredCell.c >= 0) {
            meshCtx.strokeStyle = (currentTool === 'erase' || isErasing) ? 'rgba(245, 158, 11, 0.95)' : 'rgba(56, 189, 248, 0.95)';
            meshCtx.lineWidth = 2;
            meshCtx.setLineDash([4, 4]);

            const offsets = getBrushOffsets(brushSize);
            offsets.forEach(off => {
                const tr = hoveredCell.r + off.r;
                const tc = hoveredCell.c + off.c;
                if (tr >= 0 && tr < gridRows && tc >= 0 && tc < gridCols) {
                    meshCtx.strokeRect(tc * cellW, tr * cellH, cellW, cellH);
                }
            });
            meshCtx.setLineDash([]);
        }
    }

    function getBrushOffsets(size) {
        if (size === 1) {
            return [{ r: 0, c: 0 }];
        } else if (size === 2) {
            return [
                { r: 0, c: 0 }, { r: 0, c: 1 },
                { r: 1, c: 0 }, { r: 1, c: 1 }
            ];
        } else if (size === 3) {
            const arr = [];
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    arr.push({ r: dr, c: dc });
                }
            }
            return arr;
        }
        return [{ r: 0, c: 0 }];
    }

    function applyBrush(r, c, erasing) {
        const val = erasing ? 0 : 1;
        const offsets = getBrushOffsets(brushSize);
        let changed = false;

        offsets.forEach(off => {
            const tr = r + off.r;
            const tc = c + off.c;
            if (tr >= 0 && tr < gridRows && tc >= 0 && tc < gridCols) {
                if (gridState[tr][tc] !== val) {
                    gridState[tr][tc] = val;
                    changed = true;
                }
            }
        });

        if (changed) {
            drawMeshCanvas();
            updateMeshStats(true);
        }
    }

    function updateMeshStats(isDirty = false) {
        let active = 0;
        const total = gridRows * gridCols;
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                if (gridState[r] && gridState[r][c] === 1) active++;
            }
        }
        const pct = total > 0 ? ((active / total) * 100).toFixed(1) : 0;

        if (meshActiveCount) meshActiveCount.textContent = `${active} / ${total}`;
        if (meshCoveragePct) meshCoveragePct.textContent = `${pct}%`;
        if (gridMaskCoverageBadge) gridMaskCoverageBadge.textContent = `${active} cells (${pct}% coverage)`;

        if (meshSavedStatus) {
            if (isDirty) {
                meshSavedStatus.textContent = 'Unsaved Changes';
                meshSavedStatus.className = 'text-amber';
            } else if (active > 0) {
                meshSavedStatus.textContent = 'Saved & Active';
                meshSavedStatus.className = 'text-green';
            } else {
                meshSavedStatus.textContent = 'Empty (No mask)';
                meshSavedStatus.className = 'text-dim';
            }
        }
    }

    function getCellFromEvent(e) {
        if (!gridMeshCanvas) return null;
        const rect = gridMeshCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x < 0 || x >= rect.width || y < 0 || y >= rect.height) return null;

        const cellW = rect.width / gridCols;
        const cellH = rect.height / gridRows;

        const c = Math.floor(x / cellW);
        const r = Math.floor(y / cellH);

        return { r: Math.min(gridRows - 1, Math.max(0, r)), c: Math.min(gridCols - 1, Math.max(0, c)) };
    }

    // Canvas Mouse Event Handlers
    if (gridMeshCanvas) {
        gridMeshCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

        gridMeshCanvas.addEventListener('mousedown', (e) => {
            isMouseDown = true;
            isErasing = (e.button === 2) || (currentTool === 'erase');
            const cell = getCellFromEvent(e);
            if (cell) {
                hoveredCell = cell;
                applyBrush(cell.r, cell.c, isErasing);
            }
        });

        gridMeshCanvas.addEventListener('mousemove', (e) => {
            const cell = getCellFromEvent(e);
            hoveredCell = cell;
            if (isMouseDown && cell) {
                applyBrush(cell.r, cell.c, isErasing);
            } else {
                drawMeshCanvas();
            }
        });

        window.addEventListener('mouseup', () => {
            isMouseDown = false;
        });

        gridMeshCanvas.addEventListener('mouseleave', () => {
            hoveredCell = null;
            drawMeshCanvas();
        });
    }

    // Brush Tool & Density Listeners
    if (toolPaint && toolErase) {
        toolPaint.addEventListener('click', () => {
            currentTool = 'paint';
            toolPaint.classList.add('active');
            toolPaint.classList.remove('btn-outline');
            toolPaint.classList.add('btn-primary');
            toolErase.classList.remove('active');
            toolErase.classList.remove('btn-primary');
            toolErase.classList.add('btn-outline');
        });

        toolErase.addEventListener('click', () => {
            currentTool = 'erase';
            toolErase.classList.add('active');
            toolErase.classList.remove('btn-outline');
            toolErase.classList.add('btn-primary');
            toolPaint.classList.remove('active');
            toolPaint.classList.remove('btn-primary');
            toolPaint.classList.add('btn-outline');
        });
    }

    document.querySelectorAll('.brush-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            brushSize = parseInt(btn.dataset.size, 10) || 2;
        });
    });

    if (selectGridDensity) {
        selectGridDensity.addEventListener('change', () => {
            const newDensity = parseInt(selectGridDensity.value, 10) || 32;
            if (confirm(`Change grid density to ${newDensity}x${newDensity}? Existing mask will be resampled.`)) {
                resampleGridMatrix(newDensity, newDensity);
            } else {
                selectGridDensity.value = gridRows.toString();
            }
        });
    }

    function resampleGridMatrix(newRows, newCols) {
        const oldRows = gridRows;
        const oldCols = gridCols;
        const oldGrid = gridState;

        initGridMatrix(newRows, newCols);

        for (let r = 0; r < newRows; r++) {
            const srcR = Math.min(oldRows - 1, Math.floor((r / newRows) * oldRows));
            for (let c = 0; c < newCols; c++) {
                const srcC = Math.min(oldCols - 1, Math.floor((c / newCols) * oldCols));
                if (oldGrid[srcR] && oldGrid[srcR][srcC] === 1) {
                    gridState[r][c] = 1;
                }
            }
        }

        drawMeshCanvas();
        updateMeshStats(true);
    }

    if (btnClearGrid) {
        btnClearGrid.addEventListener('click', () => {
            initGridMatrix(gridRows, gridCols, 0);
            drawMeshCanvas();
            updateMeshStats(true);
        });
    }

    if (btnInvertGrid) {
        btnInvertGrid.addEventListener('click', () => {
            for (let r = 0; r < gridRows; r++) {
                for (let c = 0; c < gridCols; c++) {
                    gridState[r][c] = gridState[r][c] === 1 ? 0 : 1;
                }
            }
            drawMeshCanvas();
            updateMeshStats(true);
        });
    }

    if (btnReloadSampleImage) {
        btnReloadSampleImage.addEventListener('click', () => {
            const ds = trainDatasetSelect ? trainDatasetSelect.value : activeDataset;
            if (ds) loadDatasetFocusMaskAndSample(ds);
        });
    }

    if (linkJumpToGrid) {
        linkJumpToGrid.addEventListener('click', (e) => {
            e.preventDefault();
            const card = document.getElementById('gridMeshEditorCard');
            if (card) card.scrollIntoView({ behavior: 'smooth' });
        });
    }

    const btnScrollToTop = document.getElementById('btnScrollToTop');
    if (btnScrollToTop) {
        btnScrollToTop.addEventListener('click', () => {
            const page = document.getElementById('page-training');
            if (page) page.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    window.addEventListener('resize', () => {
        if (activePage === 'page-training') {
            resizeCanvasToSampleImage();
        }
    });

    // Save Focus Mask API Call
    if (btnSaveGridMask) {
        btnSaveGridMask.addEventListener('click', async () => {
            const dsName = trainDatasetSelect ? trainDatasetSelect.value : activeDataset;
            if (!dsName) {
                alert('Please select a dataset first');
                return;
            }

            const gridPayload = [];
            for (let r = 0; r < gridRows; r++) {
                gridPayload.push(Array.from(gridState[r]));
            }

            btnSaveGridMask.disabled = true;
            btnSaveGridMask.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

            try {
                const res = await fetch(`/api/dataset/${encodeURIComponent(dsName)}/focus_mask`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        rows: gridRows,
                        cols: gridCols,
                        density: gridRows,
                        grid: gridPayload
                    })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`Saved Focus Mask: ${data.coverage_pct}% coverage (${data.active_cells} cells)`);
                    updateMeshStats(false);
                    if (selectTrainRoi) selectTrainRoi.value = 'custom_mask';
                } else {
                    alert(`Error: ${data.error || 'Failed to save mask'}`);
                }
            } catch (err) {
                alert('Network error saving focus mask: ' + err.message);
            } finally {
                btnSaveGridMask.disabled = false;
                btnSaveGridMask.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <strong>Save Focus Mask</strong>`;
            }
        });
    }

    // Load Focus Mask & Sample Image for active dataset
    function loadDatasetFocusMaskAndSample(datasetName) {
        if (!datasetName) return;

        if (meshDatasetName) meshDatasetName.textContent = datasetName;
        if (meshSavedStatus) {
            meshSavedStatus.textContent = 'Loading...';
            meshSavedStatus.className = 'text-dim';
        }

        fetch(`/api/dataset/${encodeURIComponent(datasetName)}/sample_image`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) {
                    if (gridEditorHint) {
                        gridEditorHint.style.display = 'flex';
                        gridEditorHint.querySelector('span').textContent = `No sample image found in dataset '${datasetName}'`;
                    }
                    if (gridSampleImg) gridSampleImg.style.display = 'none';
                    return;
                }

                currentSampleInfo = data;
                if (meshSampleName) meshSampleName.textContent = data.filename;
                if (meshResolution) meshResolution.textContent = `${data.width} x ${data.height}`;

                if (gridEditorHint) gridEditorHint.style.display = 'none';
                if (gridSampleImg) {
                    gridSampleImg.style.display = 'block';
                    gridSampleImg.onload = () => {
                        resizeCanvasToSampleImage();
                    };
                    gridSampleImg.onerror = () => {
                        console.error('Failed to load sample image:', data.image_url);
                        if (gridEditorHint) {
                            gridEditorHint.style.display = 'flex';
                            gridEditorHint.querySelector('span').textContent = `Could not load sample image: ${data.filename}`;
                        }
                    };
                    gridSampleImg.src = data.image_url;
                    if (gridSampleImg.complete && gridSampleImg.naturalWidth > 0) {
                        resizeCanvasToSampleImage();
                    }
                }

                fetch(`/api/dataset/${encodeURIComponent(datasetName)}/focus_mask`)
                    .then(r => r.json())
                    .then(maskRes => {
                        if (maskRes.success && maskRes.mask_data && maskRes.mask_data.has_mask) {
                            const md = maskRes.mask_data;
                            const rCount = md.rows || 32;
                            const cCount = md.cols || 32;
                            initGridMatrix(rCount, cCount);
                            if (selectGridDensity) selectGridDensity.value = rCount.toString();

                            if (md.grid && Array.isArray(md.grid)) {
                                for (let r = 0; r < rCount; r++) {
                                    if (md.grid[r]) {
                                        for (let c = 0; c < cCount; c++) {
                                            gridState[r][c] = md.grid[r][c] ? 1 : 0;
                                        }
                                    }
                                }
                            }
                            resizeCanvasToSampleImage();
                            updateMeshStats(false);
                        } else {
                            initGridMatrix(32, 32, 0);
                            if (selectGridDensity) selectGridDensity.value = '32';
                            resizeCanvasToSampleImage();
                            updateMeshStats(false);
                        }
                    });
            })
            .catch(err => {
                console.warn('Sample image load error:', err);
            });
    }

    // Models Registry Loader
    async function loadModelsList() {
        if (!modelsList) return;
        try {
            const resp = await fetch('/api/models');
            if (!resp.ok) return;
            const data = await resp.json();

            modelsList.innerHTML = '';
            if (!data.models || data.models.length === 0) {
                modelsList.innerHTML = '<div class="empty-state">No trained models yet. Train your first model above!</div>';
                return;
            }

            data.models.forEach(m => {
                const item = document.createElement('div');
                item.className = 'model-registry-item' + (m.is_active ? ' active' : '');
                const maskBadge = m.has_focus_mask ? '<span class="badge text-green" style="margin-left: 6px;"><i class="fa-solid fa-border-all"></i> Custom Mask</span>' : '';
                item.innerHTML = `
                    <div>
                        <strong>${m.model_id}</strong> ${maskBadge}
                        <div class="fs-xs text-muted" style="margin-top: 2px;">
                            Dataset: ${m.dataset_name} | Backbone: ${m.backbone} | ROI: ${m.roi_mode} | &tau;: ${m.threshold} | vectors: ${m.memory_bank_size}
                        </div>
                    </div>
                    <div>
                        ${m.is_active 
                            ? '<span class="badge text-green"><i class="fa-solid fa-check"></i> Active</span>' 
                            : `<button class="btn btn-xs btn-outline btn-load-model" data-id="${m.model_id}">Load Model</button>`}
                    </div>
                `;

                const btnLoad = item.querySelector('.btn-load-model');
                if (btnLoad) {
                    btnLoad.addEventListener('click', async () => {
                        await loadModelById(m.model_id);
                    });
                }

                modelsList.appendChild(item);
            });
        } catch (e) {
            console.warn('Failed to load models list:', e);
        }
    }

    async function loadModelById(modelId) {
        try {
            const resp = await fetch('/api/models/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: modelId })
            });
            const data = await resp.json();
            if (data.success) {
                alert(`Successfully activated model ${modelId}!`);
                loadModelsList();
                fetchStatus();
            } else {
                alert('Failed to load model: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Load model error: ' + e.message);
        }
    }

    if (btnRefreshModels) {
        btnRefreshModels.addEventListener('click', loadModelsList);
    }

    window.addEventListener('resize', () => {
        resizeCanvasToSampleImage();
    });

    setInterval(fetchStatus, 1500);
    fetchStatus();
    loadDatasets();
    loadModelsList();
});
