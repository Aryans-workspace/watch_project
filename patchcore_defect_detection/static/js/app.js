/**
 * PatchCore Defect Detection Studio Controller
 * Handles model training, validation visualization, threshold tuning,
 * and automated ABB Cobot real-time slot inspection.
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        activeTab: 'train',
        datasets: [],
        selectedDataset: null,
        models: [],
        activeModelId: null,
        validationSummary: null,
        valFilter: 'all',
        activeJob: null,
        slotResults: {},
        isTraining: false
    };

    // Telemetry Elements
    const activeModelText = document.getElementById('activeModelText');
    const cobotDot = document.getElementById('cobotDot');
    const cobotStatusText = document.getElementById('cobotStatusText');
    const hostIpText = document.getElementById('hostIpText');
    const cameraDot = document.getElementById('cameraDot');
    const cameraModelText = document.getElementById('cameraModelText');
    const cameraFpsText = document.getElementById('cameraFpsText');
    const btnReconnectCam = document.getElementById('btnReconnectCam');
    const btnFullscreen = document.getElementById('btnFullscreen');
    const toast = document.getElementById('toast');

    // Tab Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Tab 1 (Train) Elements
    const selectDataset = document.getElementById('selectDataset');
    const btnRefreshDatasets = document.getElementById('btnRefreshDatasets');
    const trainGoodCount = document.getElementById('trainGoodCount');
    const valGoodCount = document.getElementById('valGoodCount');
    const valDefectCount = document.getElementById('valDefectCount');
    const selectBackbone = document.getElementById('selectBackbone');
    const selectCoreset = document.getElementById('selectCoreset');
    const btnStartTraining = document.getElementById('btnStartTraining');
    const btnStartTrainingText = document.getElementById('btnStartTrainingText');
    const trainingStatusBadge = document.getElementById('trainingStatusBadge');
    const trainProgressBox = document.getElementById('trainProgressBox');
    const trainProgressText = document.getElementById('trainProgressText');
    const trainProgressPercent = document.getElementById('trainProgressPercent');
    const trainProgressBarFill = document.getElementById('trainProgressBarFill');
    const trainTerminalLog = document.getElementById('trainTerminalLog');
    const modelsTableBody = document.getElementById('modelsTableBody');
    const btnRefreshModels = document.getElementById('btnRefreshModels');

    // Tab 2 (Validation) Elements
    const valModelId = document.getElementById('valModelId');
    const valAccuracyText = document.getElementById('valAccuracyText');
    const valNormalMean = document.getElementById('valNormalMean');
    const valDefectMean = document.getElementById('valDefectMean');
    const valTotalCount = document.getElementById('valTotalCount');
    const sliderThreshold = document.getElementById('sliderThreshold');
    const thresholdValueText = document.getElementById('thresholdValueText');
    const sliderMinText = document.getElementById('sliderMinText');
    const sliderMaxText = document.getElementById('sliderMaxText');
    const btnSaveThreshold = document.getElementById('btnSaveThreshold');
    const btnReRunVal = document.getElementById('btnReRunVal');
    const selectDustSensitivity = document.getElementById('selectDustSensitivity');
    const selectPerimeterRatio = document.getElementById('selectPerimeterRatio');
    const btnApplyDustSens = document.getElementById('btnApplyDustSens');
    const validationGallery = document.getElementById('validationGallery');
    const filterAllCount = document.getElementById('filterAllCount');
    const filterDefectCount = document.getElementById('filterDefectCount');
    const filterPassCount = document.getElementById('filterPassCount');
    const filterBtns = document.querySelectorAll('.btn-filter');

    // Tab 3 (Live Cobot Inspection) Elements
    const liveFeed = document.getElementById('liveFeed');
    const captureFlash = document.getElementById('captureFlash');
    const activeSlotOverlay = document.getElementById('activeSlotOverlay');
    const overlaySlotNum = document.getElementById('overlaySlotNum');
    const btnInspectCurrent = document.getElementById('btnInspectCurrent');
    const instantResultCard = document.getElementById('instantResultCard');
    const instantVerdictBadge = document.getElementById('instantVerdictBadge');
    const instantImg = document.getElementById('instantImg');
    const instantScore = document.getElementById('instantScore');
    const instantThreshold = document.getElementById('instantThreshold');
    const instantLatency = document.getElementById('instantLatency');
    const instantDustCount = document.getElementById('instantDustCount');

    const btnStartInspectionFull = document.getElementById('btnStartInspectionFull');
    const btnSimulateInspection = document.getElementById('btnSimulateInspection');
    const btnCancelInspection = document.getElementById('btnCancelInspection');
    const inspectionJobStatusBadge = document.getElementById('inspectionJobStatusBadge');
    const inspectProgressBox = document.getElementById('inspectProgressBox');
    const inspectProgressText = document.getElementById('inspectProgressText');
    const inspectProgressPercent = document.getElementById('inspectProgressPercent');
    const inspectProgressBarFill = document.getElementById('inspectProgressBarFill');
    const inspectPassedCount = document.getElementById('inspectPassedCount');
    const inspectDefectCount = document.getElementById('inspectDefectCount');

    // Modal Elements
    const defectModal = document.getElementById('defectModal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const modalSlotTitle = document.getElementById('modalSlotTitle');
    const modalVerdictBadge = document.getElementById('modalVerdictBadge');
    const modalDustBadge = document.getElementById('modalDustBadge');
    const modalScoreText = document.getElementById('modalScoreText');
    const modalOrigImg = document.getElementById('modalOrigImg');
    const modalHeatmapImg = document.getElementById('modalHeatmapImg');

    // =========================================================================
    // Tab Navigation
    // =========================================================================
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            state.activeTab = target;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const content = document.getElementById(`tabContent-${target}`);
            if (content) content.classList.add('active');

            if (target === 'validation') {
                loadValidationResults();
            } else if (target === 'train') {
                loadDatasets();
                loadModels();
            }
        });
    });

    // =========================================================================
    // Telemetry & Status Polling
    // =========================================================================
    function pollStatus() {
        fetch('/api/status')
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                // 1. Camera Status
                if (data.camera) {
                    cameraFpsText.textContent = `${(data.camera.fps || 0).toFixed(1)} FPS`;
                    if (data.camera.connected) {
                        cameraDot.className = data.camera.is_real ? 'indicator-dot online' : 'indicator-dot listening';
                    } else {
                        cameraDot.className = 'indicator-dot offline';
                    }
                }

                // 2. Cobot Socket
                if (data.robot) {
                    const r = data.robot;
                    if (r.cobot_connected) {
                        cobotDot.className = 'indicator-dot online';
                        cobotStatusText.textContent = `CONNECTED (${r.cobot_address})`;
                    } else if (r.is_simulating) {
                        cobotDot.className = 'indicator-dot busy';
                        cobotStatusText.textContent = `SIMULATING`;
                    } else {
                        cobotDot.className = 'indicator-dot listening';
                        cobotStatusText.textContent = `PORT 12343 (LISTENING)`;
                    }

                    updateInspectionUI(r.active_job);
                }

                // 3. Server IPs for RAPID
                if (data.host_ips && data.host_ips.length > 0) {
                    hostIpText.textContent = data.host_ips.join(' / ');
                }

                // 4. Active Model
                if (data.active_model_id) {
                    state.activeModelId = data.active_model_id;
                    activeModelText.textContent = data.active_model_id;
                } else {
                    activeModelText.textContent = 'None (Train Below)';
                }

                // 5. Training State Sync
                if (data.training && data.training.status === 'training') {
                    handleTrainingStatus(data.training);
                }
            })
            .catch(err => console.warn('Status poll warning:', err));
    }

    setInterval(pollStatus, 1000);
    pollStatus();

    // =========================================================================
    // Tab 1: Dataset Loading & Model Training
    // =========================================================================
    function loadDatasets() {
        fetch('/api/datasets')
            .then(res => res.json())
            .then(data => {
                if (!data || !data.datasets) return;
                state.datasets = data.datasets;

                selectDataset.innerHTML = '';
                if (data.datasets.length === 0) {
                    selectDataset.innerHTML = '<option value="">No datasets found</option>';
                    return;
                }

                data.datasets.forEach(ds => {
                    const opt = document.createElement('option');
                    opt.value = ds.name;
                    opt.textContent = `${ds.name} (${ds.train_good_count} train watches)`;
                    selectDataset.appendChild(opt);
                });

                // Trigger selection of first dataset
                if (data.datasets.length > 0) {
                    updateSelectedDatasetInfo(data.datasets[0].name);
                }
            });
    }

    function updateSelectedDatasetInfo(name) {
        state.selectedDataset = name;
        const ds = state.datasets.find(d => d.name === name);
        if (ds) {
            trainGoodCount.textContent = ds.train_good_count;
            valGoodCount.textContent = ds.val_good_count;
            valDefectCount.textContent = ds.val_defect_count;
            btnStartTraining.disabled = (ds.train_good_count === 0);
        }
        if (typeof loadDatasetFocusMaskAndSample === 'function') {
            loadDatasetFocusMaskAndSample(name);
        }
    }

    selectDataset.addEventListener('change', () => {
        updateSelectedDatasetInfo(selectDataset.value);
    });

    btnRefreshDatasets.addEventListener('click', loadDatasets);

    // Start Training
    btnStartTraining.addEventListener('click', () => {
        const datasetName = selectDataset.value;
        if (!datasetName) {
            showToast('Please select a dataset');
            return;
        }

        const backbone = selectBackbone.value;
        const coreset = parseFloat(selectCoreset.value);

        btnStartTraining.disabled = true;
        btnStartTrainingText.textContent = 'TRAINING IN PROGRESS...';
        trainProgressBox.style.display = 'flex';
        trainProgressBarFill.style.width = '5%';
        trainProgressPercent.textContent = '5%';
        trainProgressText.textContent = 'Initializing PatchCore...';
        trainingStatusBadge.textContent = 'TRAINING';
        trainingStatusBadge.className = 'badge badge-accent';

        const focusMode = document.getElementById('selectFocusMode')?.value || 'dial';

        fetch('/api/train/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataset_name: datasetName,
                backbone: backbone,
                coreset_ratio: coreset,
                focus_mode: focusMode,
                resolution: document.getElementById('selectResolution')?.value || 'standard'
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`PatchCore training started on ${datasetName}`);
                state.isTraining = true;
                pollTrainingProgress();
            } else {
                showToast(`Error: ${data.error || 'Failed to start training'}`);
                btnStartTraining.disabled = false;
                btnStartTrainingText.textContent = 'TRAIN PATCHCORE MODEL';
            }
        })
        .catch(err => {
            console.error('Training start error:', err);
            showToast('Network error starting training');
            btnStartTraining.disabled = false;
            btnStartTrainingText.textContent = 'TRAIN PATCHCORE MODEL';
        });
    });

    function pollTrainingProgress() {
        if (!state.isTraining) return;

        fetch('/api/train/status')
            .then(res => res.json())
            .then(data => {
                handleTrainingStatus(data);
                if (data.status === 'training') {
                    setTimeout(pollTrainingProgress, 800);
                } else {
                    state.isTraining = false;
                    btnStartTraining.disabled = false;
                    btnStartTrainingText.textContent = 'TRAIN PATCHCORE MODEL';
                    loadModels();
                }
            })
            .catch(() => {
                setTimeout(pollTrainingProgress, 1200);
            });
    }

    function handleTrainingStatus(data) {
        if (!data) return;

        trainingStatusBadge.textContent = data.status.toUpperCase();
        if (data.status === 'completed') {
            trainingStatusBadge.className = 'badge text-green';
            showToast('PatchCore Model Training Completed!');
        } else if (data.status === 'failed') {
            trainingStatusBadge.className = 'badge text-red';
            showToast('Training Failed. Check log.');
        }

        trainProgressBox.style.display = 'flex';
        trainProgressBarFill.style.width = `${data.progress_pct || 0}%`;
        trainProgressPercent.textContent = `${data.progress_pct || 0}%`;
        trainProgressText.textContent = data.message || 'Processing...';

        // Update Terminal Logs
        if (data.logs && data.logs.length > 0) {
            trainTerminalLog.innerHTML = '';
            data.logs.forEach(line => {
                const div = document.createElement('div');
                div.className = 'log-line';
                div.textContent = line;
                trainTerminalLog.appendChild(div);
            });
            trainTerminalLog.scrollTop = trainTerminalLog.scrollHeight;
        }
    }

    // Load Models Table
    function loadModels() {
        fetch('/api/models')
            .then(res => res.json())
            .then(data => {
                if (!data || !data.models) return;
                state.models = data.models;
                state.activeModelId = data.active_model_id;

                if (data.models.length === 0) {
                    modelsTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No trained models yet. Train your first model above!</td></tr>`;
                    return;
                }

                modelsTableBody.innerHTML = '';
                data.models.forEach(m => {
                    const tr = document.createElement('tr');
                    if (m.is_active) tr.className = 'active-row';

                    const actBtn = m.is_active
                        ? `<span class="badge text-green"><i class="fa-solid fa-check"></i> ACTIVE</span>`
                        : `<button class="btn btn-secondary btn-xs btn-activate-model" data-id="${m.model_id}"><i class="fa-solid fa-bolt"></i> Activate</button>`;

                    let focusBadge = '<span class="badge">Full Frame</span>';
                    if (m.focus_mode === 'custom_mask' || m.has_focus_mask || (m.model_id && m.model_id.includes('custom'))) {
                        focusBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-border-all"></i> Custom Mask</span>';
                    } else if (m.focus_mode === 'dial' || (m.model_id && m.model_id.includes('dial'))) {
                        focusBadge = '<span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border-color: rgba(34, 197, 94, 0.3);"><i class="fa-solid fa-circle-notch"></i> Dial Face</span>';
                    }

                    tr.innerHTML = `
                        <td><strong>${m.model_id}</strong></td>
                        <td>${m.dataset_name}</td>
                        <td>${focusBadge}</td>
                        <td><span class="badge">${m.backbone}</span></td>
                        <td>${m.train_images_count} watches</td>
                        <td><strong class="text-accent">${m.threshold}</strong></td>
                        <td>${m.created_at || '--'}</td>
                        <td>${actBtn}</td>
                    `;

                    modelsTableBody.appendChild(tr);
                });

                // Attach activate button handlers
                document.querySelectorAll('.btn-activate-model').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const mid = btn.dataset.id;
                        activateModel(mid);
                    });
                });
            });
    }

    function activateModel(modelId) {
        fetch('/api/model/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_id: modelId })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`Activated model: ${modelId}`);
                loadModels();
                pollStatus();
            } else {
                showToast(`Error: ${data.error || 'Failed to activate'}`);
            }
        });
    }

    btnRefreshModels.addEventListener('click', loadModels);

    // =========================================================================
    // Tab 2: Validation Results & Defect Heatmaps
    // =========================================================================
    function loadValidationResults() {
        fetch('/api/validation/results')
            .then(res => res.json())
            .then(data => {
                if (!data || !data.summary) {
                    validationGallery.innerHTML = `<div class="empty-state">No validation results available yet. Train a model first.</div>`;
                    return;
                }

                const s = data.summary;
                state.validationSummary = s;

                valModelId.textContent = s.model_id || 'None';
                const valFocusModeText = document.getElementById('valFocusModeText');
                if (valFocusModeText) {
                    if (s.model_id && (s.model_id.includes('custom') || s.focus_mode === 'custom_mask')) {
                        valFocusModeText.textContent = 'Custom Mask (Mesh)';
                        valFocusModeText.className = 'metric-val text-red';
                    } else if (s.model_id && (s.model_id.includes('dial') || s.focus_mode === 'dial')) {
                        valFocusModeText.textContent = 'Circular Dial';
                        valFocusModeText.className = 'metric-val text-green';
                    } else {
                        valFocusModeText.textContent = 'Full Frame';
                        valFocusModeText.className = 'metric-val text-blue';
                    }
                }
                valAccuracyText.textContent = `${s.accuracy_pct}%`;
                valNormalMean.textContent = s.avg_normal_score.toFixed(2);
                valDefectMean.textContent = s.avg_defect_score.toFixed(2);
                valTotalCount.textContent = s.total_validated;

                // Threshold Slider Setup
                thresholdValueText.textContent = s.threshold.toFixed(2);
                sliderThreshold.value = s.threshold;
                const minRange = Math.max(0.5, Math.floor(s.avg_normal_score * 0.5));
                const maxRange = Math.max(30.0, Math.ceil(s.threshold * 2.0));
                sliderThreshold.min = minRange;
                sliderThreshold.max = maxRange;
                sliderMinText.textContent = minRange.toFixed(1);
                sliderMaxText.textContent = maxRange.toFixed(1);

                // Dust Sensitivity & Perimeter Dropdowns Setup
                if (s.dust_sensitivity && selectDustSensitivity) {
                    selectDustSensitivity.value = s.dust_sensitivity;
                }
                if (s.perimeter_ratio !== undefined && selectPerimeterRatio) {
                    selectPerimeterRatio.value = s.perimeter_ratio.toString();
                }

                renderValidationCards(s.items);
            })
            .catch(err => console.warn('Val error:', err));
    }

    // Dynamic Threshold Slider Adjustment (Updates verdicts live on screen!)
    sliderThreshold.addEventListener('input', () => {
        const newThresh = parseFloat(sliderThreshold.value);
        thresholdValueText.textContent = newThresh.toFixed(2);

        // Update local item verdicts live
        if (state.validationSummary && state.validationSummary.items) {
            state.validationSummary.items.forEach(it => {
                it.is_anomaly = it.score >= newThresh;
                it.verdict = it.is_anomaly ? 'DEFECT' : 'PASS';
            });
            renderValidationCards(state.validationSummary.items);
        }
    });

    btnSaveThreshold.addEventListener('click', () => {
        const newThresh = parseFloat(sliderThreshold.value);
        fetch('/api/validation/set_threshold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threshold: newThresh })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`Threshold saved: ${newThresh.toFixed(2)}`);
                loadValidationResults();
            }
        });
    });

    // Dust Sensitivity & Perimeter Apply
    if (btnApplyDustSens) {
        btnApplyDustSens.addEventListener('click', () => {
            const sensitivity = selectDustSensitivity ? selectDustSensitivity.value : 'high';
            const perimeterRatio = selectPerimeterRatio ? parseFloat(selectPerimeterRatio.value) : 0.925;
            btnApplyDustSens.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Inspecting...`;
            fetch('/api/validation/set_dust_sensitivity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sensitivity: sensitivity,
                    perimeter_ratio: perimeterRatio
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast(`Sensitivity set to ${sensitivity.toUpperCase()}, Perimeter ${(perimeterRatio * 100).toFixed(1)}%`);
                    loadValidationResults();
                } else {
                    showToast(`Error: ${data.error || 'Failed to update sensitivity'}`);
                }
            })
            .catch(err => {
                console.error('Sensitivity update error:', err);
                showToast('Failed to connect to server');
            })
            .finally(() => {
                btnApplyDustSens.innerHTML = `<i class="fa-solid fa-sliders"></i> Apply Sensitivity & Perimeter`;
            });
        });
    }

    btnReRunVal.addEventListener('click', () => {
        btnReRunVal.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Validating...`;
        fetch('/api/validation/run', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast('Validation re-run complete');
                    loadValidationResults();
                }
            })
            .finally(() => {
                btnReRunVal.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Re-Run Validation`;
            });
    });

    // Validation Filter Buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.valFilter = btn.dataset.filter;
            if (state.validationSummary && state.validationSummary.items) {
                renderValidationCards(state.validationSummary.items);
            }
        });
    });

    function renderValidationCards(items) {
        if (!items || items.length === 0) {
            validationGallery.innerHTML = `<div class="empty-state">No validation images available.</div>`;
            return;
        }

        const filtered = items.filter(it => {
            if (state.valFilter === 'defect') return it.verdict === 'DEFECT';
            if (state.valFilter === 'pass') return it.verdict === 'PASS';
            return true;
        });

        // Update filter badge counts
        filterAllCount.textContent = items.length;
        filterDefectCount.textContent = items.filter(i => i.verdict === 'DEFECT').length;
        filterPassCount.textContent = items.filter(i => i.verdict === 'PASS').length;

        const cacheBuster = `?v=${Date.now()}`;
        filtered.forEach(it => {
            const card = document.createElement('div');
            const isDefect = it.verdict === 'DEFECT';
            const dustBadge = (it.dust_count !== undefined && it.dust_count > 0)
                ? `<span class="tag-defect" style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-circle-exclamation"></i> ${it.dust_count} Dust</span>`
                : (it.dust_count === 0 ? `<span class="tag-pass" style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-check"></i> Clean</span>` : '');

            const freshHeatmapUrl = it.heatmap_url + (it.heatmap_url.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`);

            card.innerHTML = `
                <div class="val-card-thumb">
                    <img src="${freshHeatmapUrl}" alt="${it.filename}" loading="lazy">
                </div>
                <div class="val-card-info">
                    <span class="val-filename" title="${it.filename}">${it.filename}</span>
                    <div class="val-badges" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                        <span class="verdict-tag ${isDefect ? 'tag-defect' : 'tag-pass'}">${it.verdict}</span>
                        ${dustBadge}
                        <span class="score-text">Score: ${it.score}</span>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                openCompareModal({
                    title: `Validation: ${it.filename}`,
                    verdict: it.verdict,
                    score: it.score,
                    dustCount: it.dust_count,
                    origUrl: it.orig_url,
                    heatmapUrl: freshHeatmapUrl
                });
            });

            validationGallery.appendChild(card);
        });
    }

    // =========================================================================
    // Tab 3: Live Cobot Inspection (Slots 1 - 8)
    // =========================================================================
    const btnStartContinuousInspection = document.getElementById('btnStartContinuousInspection');
    const chkContinuousMode = document.getElementById('chkContinuousMode');
    const badgeCycleCount = document.getElementById('badgeCycleCount');

    function startCobotInspection(target, isSimulate = false, isContinuous = false) {
        resetInspectionVisuals();
        if (chkContinuousMode && chkContinuousMode.checked) {
            isContinuous = true;
        }

        fetch('/api/inspection/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target: target,
                simulate: isSimulate,
                continuous: isContinuous
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const modeLabel = isContinuous ? 'Continuous Cycle' : (isSimulate ? 'Simulated' : 'Automated Cobot');
                showToast(`${modeLabel} Inspection Started`);
                pollStatus();
            } else {
                showToast(`Error: ${data.error || 'Failed to start inspection'}`);
            }
        })
        .catch(err => {
            console.error('Inspection start error:', err);
            showToast('Network error starting inspection');
        });
    }

    btnStartInspectionFull.addEventListener('click', () => startCobotInspection('all', false, false));
    if (btnStartContinuousInspection) {
        btnStartContinuousInspection.addEventListener('click', () => {
            if (chkContinuousMode) chkContinuousMode.checked = true;
            startCobotInspection('all', false, true);
        });
    }
    btnSimulateInspection.addEventListener('click', () => {
        const isCont = chkContinuousMode ? chkContinuousMode.checked : false;
        startCobotInspection('all', true, isCont);
    });

    btnCancelInspection.addEventListener('click', () => {
        fetch('/api/inspection/cancel', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast('Inspection Run Stopped');
                    pollStatus();
                }
            });
    });

    // Inspect Current Camera View Button
    btnInspectCurrent.addEventListener('click', () => {
        btnInspectCurrent.disabled = true;
        btnInspectCurrent.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Inspecting...`;
        flashCamera();

        fetch('/api/inspect/current_frame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot_num: 0 }) })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    instantResultCard.style.display = 'block';
                    instantImg.src = data.overlay_url;
                    instantScore.textContent = data.score.toFixed(2);
                    instantThreshold.textContent = data.threshold.toFixed(2);
                    instantLatency.textContent = `${data.inference_time_ms} ms`;
                    if (instantDustCount) {
                        instantDustCount.textContent = data.dust_count !== undefined ? data.dust_count : 0;
                    }

                    instantVerdictBadge.textContent = data.verdict;
                    instantVerdictBadge.className = data.verdict === 'PASS' ? 'badge text-green' : 'badge text-red';

                    showToast(`Result: [${data.verdict}] - Anomaly Score: ${data.score}`);
                } else {
                    showToast(`Error: ${data.error || 'Inspection failed'}`);
                }
            })
            .catch(err => {
                console.error('Single inspect error:', err);
                showToast('Network error inspecting frame');
            })
            .finally(() => {
                btnInspectCurrent.disabled = false;
                btnInspectCurrent.innerHTML = `<i class="fa-solid fa-camera"></i> Inspect Current Camera View`;
            });
    });

    // Target Slot Selector and Individual Slot Inspection Actions
    const selectInspectSlot = document.getElementById('selectInspectSlot');
    const btnInspectSingleSlotCobot = document.getElementById('btnInspectSingleSlotCobot');
    const btnInspectSingleSlotCamera = document.getElementById('btnInspectSingleSlotCamera');

    function inspectCameraSlot(slotNum) {
        flashCamera();
        showToast(`Snapping camera frame for Slot ${slotNum}...`);

        fetch('/api/inspect/current_frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot_num: slotNum })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Update instant result card
                instantResultCard.style.display = 'block';
                instantImg.src = data.overlay_url;
                instantScore.textContent = data.score.toFixed(2);
                instantThreshold.textContent = data.threshold.toFixed(2);
                instantLatency.textContent = `${data.inference_time_ms} ms`;
                if (instantDustCount) {
                    instantDustCount.textContent = data.dust_count !== undefined ? data.dust_count : 0;
                }
                instantVerdictBadge.textContent = data.verdict;
                instantVerdictBadge.className = data.verdict === 'PASS' ? 'badge text-green' : 'badge text-red';

                // Update slot visual card
                if (slotNum >= 1 && slotNum <= 8) {
                    state.slotResults[slotNum] = data;
                    const slotCard = document.getElementById(`inspectSlot-${slotNum}`);
                    const thumbDiv = document.getElementById(`inspectThumb-${slotNum}`);
                    const scoreTag = document.getElementById(`inspectScoreTag-${slotNum}`);

                    if (slotCard) {
                        const isDefect = data.verdict === 'DEFECT';
                        slotCard.className = `slot-box ${isDefect ? 'state-defect' : 'state-pass'}`;
                        const verdictSpan = slotCard.querySelector('.slot-verdict');
                        if (verdictSpan) {
                            verdictSpan.className = `slot-verdict ${isDefect ? 'verdict-defect' : 'verdict-pass'}`;
                            verdictSpan.textContent = data.verdict;
                        }
                    }

                    if (thumbDiv && data.overlay_url) {
                        thumbDiv.innerHTML = `<img src="${data.overlay_url}" alt="Slot ${slotNum}">`;
                    }

                    if (scoreTag) {
                        const dustText = (data.dust_count !== undefined && data.dust_count > 0) ? ` | ${data.dust_count} Dust` : '';
                        scoreTag.textContent = `Score: ${data.score}${dustText}`;
                        scoreTag.style.color = data.verdict === 'PASS' ? 'var(--color-green)' : 'var(--color-red)';
                    }
                }

                showToast(`Slot ${slotNum} Result: [${data.verdict}] - Score: ${data.score}`);
            } else {
                showToast(`Error: ${data.error || 'Inspection failed'}`);
            }
        })
        .catch(err => {
            console.error('Inspect camera slot error:', err);
            showToast('Network error inspecting camera frame');
        });
    }

    if (btnInspectSingleSlotCobot && selectInspectSlot) {
        btnInspectSingleSlotCobot.addEventListener('click', () => {
            const slot = parseInt(selectInspectSlot.value, 10) || 1;
            startCobotInspection(slot, false);
        });
    }

    if (btnInspectSingleSlotCamera && selectInspectSlot) {
        btnInspectSingleSlotCamera.addEventListener('click', () => {
            const slot = parseInt(selectInspectSlot.value, 10) || 1;
            inspectCameraSlot(slot);
        });
    }

    // Per-card Cobot and Snap buttons
    document.querySelectorAll('.btn-slot-cobot').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const slot = parseInt(btn.dataset.slot, 10);
            if (selectInspectSlot) selectInspectSlot.value = slot;
            startCobotInspection(slot, false);
        });
    });

    document.querySelectorAll('.btn-slot-snap').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const slot = parseInt(btn.dataset.slot, 10);
            if (selectInspectSlot) selectInspectSlot.value = slot;
            inspectCameraSlot(slot);
        });
    });

    function updateInspectionUI(job) {
        state.activeJob = job;
        if (!job) return;

        // Always sync slot visual cards whenever results are present (running, completed, or idle reload)
        if (job.results && job.results.length > 0) {
            job.results.forEach(res => {
                const s = res.slot_num;
                if (!s || s < 1 || s > 8) return;
                if (!state.slotResults[s] || state.slotResults[s].overlay_url !== res.overlay_url) {
                    state.slotResults[s] = res;
                    flashCamera();

                    const slotCard = document.getElementById(`inspectSlot-${s}`);
                    const thumbDiv = document.getElementById(`inspectThumb-${s}`);
                    const scoreTag = document.getElementById(`inspectScoreTag-${s}`);

                    if (slotCard) {
                        const isDefect = res.verdict === 'DEFECT';
                        slotCard.className = `slot-box ${isDefect ? 'state-defect' : 'state-pass'}`;
                        const verdictSpan = slotCard.querySelector('.slot-verdict');
                        if (verdictSpan) {
                            verdictSpan.className = `slot-verdict ${isDefect ? 'verdict-defect' : 'verdict-pass'}`;
                            verdictSpan.textContent = res.verdict;
                        }
                    }

                    if (thumbDiv && res.overlay_url) {
                        thumbDiv.innerHTML = `<img src="${res.overlay_url}" alt="Slot ${s}">`;
                    }

                    if (scoreTag) {
                        const dustText = (res.dust_count !== undefined && res.dust_count > 0) ? ` | ${res.dust_count} Dust` : '';
                        scoreTag.textContent = `Score: ${res.score}${dustText}`;
                        scoreTag.style.color = res.verdict === 'PASS' ? 'var(--color-green)' : 'var(--color-red)';
                    }
                }
            });
        }

        const isContinuous = !!job.continuous;
        if (isContinuous && job.status === 'running') {
            inspectionJobStatusBadge.textContent = `CONTINUOUS (CYCLE ${job.cycle_count || 1})`;
            inspectionJobStatusBadge.className = 'badge text-accent';
            if (badgeCycleCount) {
                badgeCycleCount.style.display = 'inline-block';
                badgeCycleCount.textContent = `CYCLE ${job.cycle_count || 1}`;
            }
        } else {
            inspectionJobStatusBadge.textContent = job.status.toUpperCase();
            inspectionJobStatusBadge.className = 'badge';
            if (badgeCycleCount && job.status === 'idle') {
                badgeCycleCount.style.display = 'none';
            }
        }

        if (job.status === 'idle') {
            btnStartInspectionFull.disabled = false;
            if (btnStartContinuousInspection) btnStartContinuousInspection.disabled = false;
            btnSimulateInspection.disabled = false;
            btnCancelInspection.style.display = 'none';
            inspectProgressBox.style.display = 'none';
            activeSlotOverlay.style.display = 'none';
            if (badgeCycleCount) badgeCycleCount.style.display = 'none';
            return;
        }

        if (job.status === 'running' || job.status === 'queued') {
            btnStartInspectionFull.disabled = true;
            if (btnStartContinuousInspection) btnStartContinuousInspection.disabled = true;
            btnSimulateInspection.disabled = true;
            btnCancelInspection.style.display = 'block';
            btnCancelInspection.innerHTML = isContinuous
                ? '<i class="fa-solid fa-stop"></i> STOP CONTINUOUS RUN'
                : '<i class="fa-solid fa-stop"></i> Cancel Active Run';
            inspectProgressBox.style.display = 'flex';

            const current = job.current_slot || 0;
            const total = job.total_slots || 8;
            const pct = Math.round((current / total) * 100);

            if (isContinuous) {
                inspectProgressText.textContent = `Cycle ${job.cycle_count || 1} — Inspecting Slot ${current} of ${total}`;
            } else {
                inspectProgressText.textContent = `Inspecting Slot ${current} of ${total}`;
            }
            inspectProgressPercent.textContent = `${pct}%`;
            inspectProgressBarFill.style.width = `${pct}%`;

            inspectPassedCount.textContent = job.passed_count || 0;
            inspectDefectCount.textContent = job.defect_count || 0;

            if (current > 0 && current <= 8) {
                activeSlotOverlay.style.display = 'flex';
                overlaySlotNum.textContent = current;
            } else {
                activeSlotOverlay.style.display = 'none';
            }
        } else if (job.status === 'completed') {
            btnStartInspectionFull.disabled = false;
            if (btnStartContinuousInspection) btnStartContinuousInspection.disabled = false;
            btnSimulateInspection.disabled = false;
            btnCancelInspection.style.display = 'none';
            activeSlotOverlay.style.display = 'none';

            if (isContinuous && job.total_cycles_completed > 0) {
                inspectProgressText.textContent = `Continuous Run: Completed ${job.total_cycles_completed} cycles in ${job.elapsed_sec}s!`;
            } else {
                inspectProgressText.textContent = `Inspection Finished in ${job.elapsed_sec}s!`;
            }
            inspectProgressBarFill.style.width = '100%';
            inspectPassedCount.textContent = job.passed_count || 0;
            inspectDefectCount.textContent = job.defect_count || 0;
        }
    }

    function resetInspectionVisuals() {
        state.slotResults = {};
        for (let i = 1; i <= 8; i++) {
            const card = document.getElementById(`inspectSlot-${i}`);
            if (!card) continue;
            card.className = 'slot-box';
            const verdictSpan = card.querySelector('.slot-verdict');
            if (verdictSpan) {
                verdictSpan.className = 'slot-verdict verdict-idle';
                verdictSpan.textContent = 'IDLE';
            }
            document.getElementById(`inspectThumb-${i}`).innerHTML = `<i class="fa-regular fa-clock empty-icon"></i>`;
            const scoreTag = document.getElementById(`inspectScoreTag-${i}`);
            if (scoreTag) {
                scoreTag.textContent = 'Score: --';
                scoreTag.style.color = 'var(--text-dim)';
            }
        }
    }

    // Attach click listener to each slot card to open high-res side-by-side modal
    for (let i = 1; i <= 8; i++) {
        const card = document.getElementById(`inspectSlot-${i}`);
        if (card) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const res = state.slotResults[i];
                if (res) {
                    openCompareModal({
                        title: `Slot ${i} Inspection Result`,
                        verdict: res.verdict,
                        score: res.score,
                        dustCount: res.dust_count,
                        origUrl: res.orig_url,
                        heatmapUrl: res.overlay_url
                    });
                }
            });
        }
    }

    function flashCamera() {
        captureFlash.classList.add('active');
        setTimeout(() => captureFlash.classList.remove('active'), 140);
    }

    // =========================================================================
    // Compare Modal Dialog
    // =========================================================================
    function openCompareModal(data) {
        modalSlotTitle.textContent = data.title;
        modalVerdictBadge.textContent = data.verdict;
        modalVerdictBadge.className = data.verdict === 'PASS' ? 'badge text-green' : 'badge text-red';
        modalScoreText.textContent = `Anomaly Score: ${data.score}`;

        if (modalDustBadge) {
            if (data.dustCount !== undefined) {
                modalDustBadge.style.display = 'inline-block';
                modalDustBadge.textContent = data.dustCount > 0 ? `${data.dustCount} Dust / Defects` : 'Clean Dial';
                modalDustBadge.className = data.dustCount > 0 ? 'badge text-red' : 'badge text-green';
            } else {
                modalDustBadge.style.display = 'none';
            }
        }

        modalOrigImg.src = data.origUrl;
        modalHeatmapImg.src = data.heatmapUrl;

        defectModal.classList.add('active');
    }

    function closeCompareModal() {
        defectModal.classList.remove('active');
        modalOrigImg.src = '';
        modalHeatmapImg.src = '';
    }

    btnCloseModal.addEventListener('click', closeCompareModal);
    modalBackdrop.addEventListener('click', closeCompareModal);

    // =========================================================================
    // Top Bar Actions
    // =========================================================================
    btnReconnectCam.addEventListener('click', () => {
        btnReconnectCam.disabled = true;
        btnReconnectCam.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Camera`;
        fetch('/api/camera/reconnect', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                showToast(data.success ? 'Camera Reconnected' : 'Camera Reconnect Failed');
                pollStatus();
            })
            .finally(() => {
                btnReconnectCam.disabled = false;
                btnReconnectCam.innerHTML = `<i class="fa-solid fa-rotate"></i> Camera`;
            });
    });

    btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.warn(err));
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // =========================================================================
    // Tab 1: Interactive Grid Mesh Focus Mask Editor Module
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
    const datasetMaskStatusPill = document.getElementById('datasetMaskStatusPill');
    const linkJumpToGrid = document.getElementById('linkJumpToGrid');
    const gridMaskCoverageBadge = document.getElementById('gridMaskCoverageBadge');
    const selectFocusMode = document.getElementById('selectFocusMode');

    const meshDatasetName = document.getElementById('meshDatasetName');
    const meshSampleName = document.getElementById('meshSampleName');
    const meshResolution = document.getElementById('meshResolution');
    const meshActiveCount = document.getElementById('meshActiveCount');
    const meshCoveragePct = document.getElementById('meshCoveragePct');
    const meshSavedStatus = document.getElementById('meshSavedStatus');

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

        // Resample existing cells
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
            showToast('Cleared all painted cells');
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
            showToast('Inverted grid mask');
        });
    }

    if (btnReloadSampleImage) {
        btnReloadSampleImage.addEventListener('click', () => {
            if (state.selectedDataset) {
                loadDatasetFocusMaskAndSample(state.selectedDataset);
            }
        });
    }

    if (datasetMaskStatusPill) {
        datasetMaskStatusPill.addEventListener('click', () => {
            const card = document.getElementById('gridMeshEditorCard');
            if (card) card.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (linkJumpToGrid) {
        linkJumpToGrid.addEventListener('click', (e) => {
            e.preventDefault();
            const card = document.getElementById('gridMeshEditorCard');
            if (card) card.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Save Focus Mask API Call
    if (btnSaveGridMask) {
        btnSaveGridMask.addEventListener('click', () => {
            const dsName = state.selectedDataset;
            if (!dsName) {
                showToast('Please select a dataset first');
                return;
            }

            const gridPayload = [];
            for (let r = 0; r < gridRows; r++) {
                gridPayload.push(Array.from(gridState[r]));
            }

            btnSaveGridMask.disabled = true;
            btnSaveGridMask.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

            fetch(`/api/dataset/${encodeURIComponent(dsName)}/focus_mask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rows: gridRows,
                    cols: gridCols,
                    density: gridRows,
                    grid: gridPayload
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast(`Saved Focus Mask: ${data.coverage_pct}% coverage (${data.active_cells} cells) - Updated full dial!`);
                    updateMeshStats(false);
                    if (datasetMaskStatusPill) {
                        datasetMaskStatusPill.className = 'badge text-green';
                        datasetMaskStatusPill.innerHTML = `<i class="fa-solid fa-check"></i> Mask Active (${data.coverage_pct}%)`;
                    }
                    if (selectFocusMode) {
                        selectFocusMode.value = 'custom_mask';
                    }
                    // Auto-refresh validation so user immediately sees the updated full-dial coverage
                    setTimeout(() => {
                        loadValidationResults();
                    }, 1200);
                } else {
                    showToast(`Error: ${data.error || 'Failed to save mask'}`);
                }
            })
            .catch(err => {
                console.error('Save mask error:', err);
                showToast('Network error saving focus mask');
            })
            .finally(() => {
                btnSaveGridMask.disabled = false;
                btnSaveGridMask.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <strong>Save Focus Mask</strong>`;
            });
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
                    gridSampleImg.src = data.image_url;
                    gridSampleImg.onload = () => {
                        resizeCanvasToSampleImage();
                    };
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
                            if (datasetMaskStatusPill) {
                                datasetMaskStatusPill.className = 'badge text-green';
                                datasetMaskStatusPill.innerHTML = `<i class="fa-solid fa-check"></i> Mask Active (${md.coverage_pct || 0}%)`;
                            }
                        } else {
                            initGridMatrix(32, 32, 0);
                            if (selectGridDensity) selectGridDensity.value = '32';
                            resizeCanvasToSampleImage();
                            updateMeshStats(false);
                            if (datasetMaskStatusPill) {
                                datasetMaskStatusPill.className = 'badge badge-neutral';
                                datasetMaskStatusPill.innerHTML = `<i class="fa-solid fa-border-all"></i> No Focus Mask`;
                            }
                        }
                    });
            })
            .catch(err => {
                console.warn('Sample image load error:', err);
            });
    }

    window.addEventListener('resize', () => {
        resizeCanvasToSampleImage();
    });

    // Initial Data Fetch
    loadDatasets();
    loadModels();
});
