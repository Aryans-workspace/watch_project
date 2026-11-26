/**
 * ABB Cobot & Mech-Mind Watch Inspection Controller
 * Manages live telemetry, 8-slot tray status, continuous scheduled acquisition,
 * dataset gallery with custom category outlines, and image deletion.
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        selectedCategory: 'train_good',
        activeFolder: 'watches',
        folders: [],
        isContinuous: false,
        activeJob: null,
        slotResults: {},
        activeModalImg: null
    };

    // Telemetry Elements
    const cobotDot = document.getElementById('cobotDot');
    const cobotStatusText = document.getElementById('cobotStatusText');
    const hostIpText = document.getElementById('hostIpText');
    const cameraDot = document.getElementById('cameraDot');
    const cameraModelText = document.getElementById('cameraModelText');
    const cameraFpsText = document.getElementById('cameraFpsText');

    // Folder Selector & Creation Elements
    const selectDatasetFolder = document.getElementById('selectDatasetFolder');
    const btnOpenNewFolderModal = document.getElementById('btnOpenNewFolderModal');
    const newFolderModal = document.getElementById('newFolderModal');
    const newFolderModalBackdrop = document.getElementById('newFolderModalBackdrop');
    const btnCloseFolderModal = document.getElementById('btnCloseFolderModal');
    const btnCancelFolderModal = document.getElementById('btnCancelFolderModal');
    const btnSubmitNewFolder = document.getElementById('btnSubmitNewFolder');
    const inputNewFolderName = document.getElementById('inputNewFolderName');

    // Viewport Elements
    const captureFlash = document.getElementById('captureFlash');
    const activeSlotOverlay = document.getElementById('activeSlotOverlay');
    const overlaySlotNum = document.getElementById('overlaySlotNum');

    // Controls Elements
    const btnModeSingle = document.getElementById('btnModeSingle');
    const btnModeContinuous = document.getElementById('btnModeContinuous');
    const continuousSettings = document.getElementById('continuousSettings');
    const inputEndDateTime = document.getElementById('inputEndDateTime');
    const continuousStatusBox = document.getElementById('continuousStatusBox');
    const continuousCycleBadge = document.getElementById('continuousCycleBadge');
    const continuousCountdown = document.getElementById('continuousCountdown');

    const btnStartFull = document.getElementById('btnStartFull');
    const btnStartFullText = document.getElementById('btnStartFullText');
    const btnSimulate = document.getElementById('btnSimulate');
    const btnSimulateText = document.getElementById('btnSimulateText');
    const btnCancel = document.getElementById('btnCancel');
    const btnCancelText = document.getElementById('btnCancelText');
    const progressBox = document.getElementById('progressBox');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const progressBarFill = document.getElementById('progressBarFill');

    // Crop Elements
    const chkCropEnabled = document.getElementById('chkCropEnabled');
    const chkZoomLiveStream = document.getElementById('chkZoomLiveStream');
    const readoutMmH = document.getElementById('readoutMmH');
    const readoutMmV = document.getElementById('readoutMmV');
    const cropResText = document.getElementById('cropResText');

    if (chkCropEnabled) {
        chkCropEnabled.addEventListener('change', () => {
            fetch('/api/crop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crop_enabled: chkCropEnabled.checked })
            })
            .then(res => res.json())
            .then(d => {
                showToast(d.crop.crop_enabled ? 'Slot Crop (26x29mm) Enabled' : 'Crop Disabled (Full Frame)');
            });
        });
    }

    if (chkZoomLiveStream) {
        chkZoomLiveStream.addEventListener('change', () => {
            fetch('/api/crop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crop_live_stream: chkZoomLiveStream.checked })
            });
        });
    }

    // Dataset Counts
    const countTrainGood = document.getElementById('countTrainGood');
    const countValGood = document.getElementById('countValGood');
    const countValDefect = document.getElementById('countValDefect');
    const totalImagesBadge = document.getElementById('totalImagesBadge');

    // Terminal & Gallery
    const terminalLog = document.getElementById('terminalLog');
    const galleryStrip = document.getElementById('galleryStrip');
    const galleryCountBadge = document.getElementById('galleryCountBadge');
    const btnRefreshGallery = document.getElementById('btnRefreshGallery');

    // Modal
    const imageModal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImg');
    const modalTitle = document.getElementById('modalTitle');
    const modalCategoryBadge = document.getElementById('modalCategoryBadge');
    const btnDownloadModal = document.getElementById('btnDownloadModal');
    const btnDeleteModal = document.getElementById('btnDeleteModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const modalBackdrop = document.getElementById('modalBackdrop');

    // Top actions
    const btnReconnectCam = document.getElementById('btnReconnectCam');
    const btnFullscreen = document.getElementById('btnFullscreen');
    const toast = document.getElementById('toast');

    // =========================================================================
    // Mode Selection & Datetime Defaults
    // =========================================================================

    function initEndDateTimeDefault(hoursToAdd = 1) {
        const now = new Date();
        now.setHours(now.getHours() + hoursToAdd);
        // Format for datetime-local: YYYY-MM-DDTHH:MM
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        if (inputEndDateTime) {
            inputEndDateTime.value = `${year}-${month}-${day}T${hours}:${mins}`;
        }
    }

    initEndDateTimeDefault(1);

    if (btnModeSingle && btnModeContinuous) {
        btnModeSingle.addEventListener('click', () => {
            state.isContinuous = false;
            btnModeSingle.classList.add('active');
            btnModeContinuous.classList.remove('active');
            if (continuousSettings) continuousSettings.style.display = 'none';
            if (btnStartFullText) btnStartFullText.textContent = 'START ACQUISITION (SLOTS 1 - 8)';
            if (btnSimulateText) btnSimulateText.textContent = 'Simulate Cobot Run (Dry Run)';
        });

        btnModeContinuous.addEventListener('click', () => {
            state.isContinuous = true;
            btnModeContinuous.classList.add('active');
            btnModeSingle.classList.remove('active');
            if (continuousSettings) continuousSettings.style.display = 'flex';
            if (btnStartFullText) btnStartFullText.textContent = 'START CONTINUOUS RUN';
            if (btnSimulateText) btnSimulateText.textContent = 'Simulate Continuous Run';
        });
    }

    // Quick Presets (+30m, +1h, etc.)
    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const addMin = parseInt(btn.dataset.addMin, 10) || 60;
            const now = new Date();
            now.setMinutes(now.getMinutes() + addMin);
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const mins = String(now.getMinutes()).padStart(2, '0');
            if (inputEndDateTime) {
                inputEndDateTime.value = `${year}-${month}-${day}T${hours}:${mins}`;
            }
            showToast(`Target finish time updated: +${addMin}m`);
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
                    const cam = data.camera.camera;
                    cameraModelText.textContent = cam.model || 'Mech-Eye UHP-140';
                    cameraFpsText.textContent = `${(data.camera.fps || 0).toFixed(1)} FPS`;
                    if (cam.connected) {
                        cameraDot.className = cam.is_real ? 'indicator-dot online' : 'indicator-dot listening';
                    } else {
                        cameraDot.className = 'indicator-dot offline';
                    }

                    // Crop ROI sync
                    if (data.camera.crop) {
                        const c = data.camera.crop;
                        if (cropResText) cropResText.textContent = `${c.crop_resolution} px`;
                        if (readoutMmH) readoutMmH.textContent = `±${c.crop_mm_h} mm`;
                        if (readoutMmV) readoutMmV.textContent = `±${c.crop_mm_v} mm`;
                    }
                }

                // 2. Server IPs for RAPID
                if (data.host_ips && data.host_ips.length > 0) {
                    hostIpText.textContent = data.host_ips.join(' / ');
                }

                // 3. Cobot Socket Status
                if (data.robot) {
                    const r = data.robot;
                    if (r.cobot_connected) {
                        cobotDot.className = 'indicator-dot online';
                        cobotStatusText.textContent = `CONNECTED (${r.cobot_address})`;
                    } else if (r.is_simulating) {
                        cobotDot.className = 'indicator-dot busy';
                        cobotStatusText.textContent = `SIMULATOR ACTIVE`;
                    } else {
                        cobotDot.className = 'indicator-dot listening';
                        cobotStatusText.textContent = `PORT 12343 (LISTENING)`;
                    }

                    // Handle Job State
                    updateJobUI(r.active_job);

                    // Update Terminal Logs
                    if (r.recent_logs) {
                        updateTerminalLogs(r.recent_logs);
                    }
                }

                // 4. Dataset Counts
                if (data.datasets) {
                    const d = data.datasets;
                    if (countTrainGood) countTrainGood.textContent = d.train_good ? d.train_good.count : 0;
                    if (countValGood) countValGood.textContent = d.val_good ? d.val_good.count : 0;
                    if (countValDefect) countValDefect.textContent = d.val_defect ? d.val_defect.count : 0;
                    if (totalImagesBadge) totalImagesBadge.textContent = `${d.total_images || 0} images`;
                }

                // 5. Active Folder & Folder List Sync
                if (data.active_folder && data.active_folder !== state.activeFolder) {
                    state.activeFolder = data.active_folder;
                }
                if (data.folders && Array.isArray(data.folders)) {
                    renderFolderSelectOptions(data.folders, state.activeFolder);
                }
            })
            .catch(err => console.warn('Status poll warning:', err));
    }

    // =========================================================================
    // Dataset Folder Management (Multi-Batch Support)
    // =========================================================================

    function renderFolderSelectOptions(folders, activeFolder) {
        if (!selectDatasetFolder) return;
        state.folders = folders;

        const currentOpts = Array.from(selectDatasetFolder.options).map(o => o.value).join(',');
        const newOpts = folders.map(f => f.name).join(',');
        const activeChanged = selectDatasetFolder.value !== activeFolder;

        if (currentOpts !== newOpts || activeChanged) {
            selectDatasetFolder.innerHTML = '';
            folders.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = `${f.name} (${f.image_count} imgs)`;
                if (f.name === activeFolder) {
                    opt.selected = true;
                }
                selectDatasetFolder.appendChild(opt);
            });
            if (activeFolder) {
                selectDatasetFolder.value = activeFolder;
            }
        }
    }

    function loadFolders() {
        fetch('/api/folders')
            .then(res => res.json())
            .then(data => {
                if (data && data.folders) {
                    state.activeFolder = data.active_folder || 'watches';
                    renderFolderSelectOptions(data.folders, state.activeFolder);
                }
            })
            .catch(err => console.warn('Folder load warning:', err));
    }

    if (selectDatasetFolder) {
        selectDatasetFolder.addEventListener('change', () => {
            const chosen = selectDatasetFolder.value;
            if (!chosen) return;
            fetch('/api/folder/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_name: chosen })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    state.activeFolder = data.active_folder;
                    showToast(`Active Folder: ${data.active_folder}`);
                    loadRecentGallery();
                    pollStatus();
                } else {
                    showToast(`Error: ${data.error || 'Failed to select folder'}`);
                }
            })
            .catch(err => {
                console.error('Select folder error:', err);
                showToast('Network error switching folder');
            });
        });
    }

    function openNewFolderModal() {
        if (newFolderModal) {
            newFolderModal.classList.add('active');
            if (inputNewFolderName) {
                inputNewFolderName.value = '';
                setTimeout(() => inputNewFolderName.focus(), 60);
            }
        }
    }

    function closeNewFolderModal() {
        if (newFolderModal) {
            newFolderModal.classList.remove('active');
        }
    }

    if (btnOpenNewFolderModal) btnOpenNewFolderModal.addEventListener('click', openNewFolderModal);
    if (btnCloseFolderModal) btnCloseFolderModal.addEventListener('click', closeNewFolderModal);
    if (btnCancelFolderModal) btnCancelFolderModal.addEventListener('click', closeNewFolderModal);
    if (newFolderModalBackdrop) newFolderModalBackdrop.addEventListener('click', closeNewFolderModal);

    function submitCreateFolder() {
        if (!inputNewFolderName) return;
        const rawName = inputNewFolderName.value.trim();
        if (!rawName) {
            showToast('Please enter a folder name');
            inputNewFolderName.focus();
            return;
        }

        const cleanName = rawName.replace(/[^a-zA-Z0-9_\-]/g, '_');

        fetch('/api/folder/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_name: cleanName })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                closeNewFolderModal();
                state.activeFolder = data.active_folder;
                showToast(`Created & selected folder: ${data.active_folder}`);
                loadFolders();
                loadRecentGallery();
                pollStatus();
            } else {
                showToast(`Error: ${data.error || 'Failed to create folder'}`);
            }
        })
        .catch(err => {
            console.error('Create folder error:', err);
            showToast('Network error creating folder');
        });
    }

    if (btnSubmitNewFolder) btnSubmitNewFolder.addEventListener('click', submitCreateFolder);
    if (inputNewFolderName) {
        inputNewFolderName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitCreateFolder();
            } else if (e.key === 'Escape') {
                closeNewFolderModal();
            }
        });
    }

    loadFolders();
    setInterval(pollStatus, 1000);
    pollStatus();

    // =========================================================================
    // Active Job & 8-Slot Progression Engine
    // =========================================================================

    function updateJobUI(job) {
        state.activeJob = job;

        // Always sync captured thumbnails into slot cards whenever results are present
        if (job && job.results && job.results.length > 0) {
            job.results.forEach(res => {
                const s = res.slot_num;
                if (!s || s < 1 || s > 8) return;
                if (!state.slotResults[s] || state.slotResults[s].filename !== res.filename) {
                    state.slotResults[s] = res;
                    flashScreen();
                    const thumbDiv = document.getElementById(`slotThumb-${s}`);
                    if (thumbDiv && res.thumb_url) {
                        thumbDiv.innerHTML = `<img src="${res.thumb_url}" alt="Slot ${s}">`;
                    }
                }
            });
        }

        if (!job || job.status === 'idle') {
            btnStartFull.disabled = false;
            btnSimulate.disabled = false;
            btnCancel.style.display = 'none';
            progressBox.style.display = 'none';
            activeSlotOverlay.style.display = 'none';
            if (continuousStatusBox) continuousStatusBox.style.display = 'none';
            return;
        }

        if (job.status === 'queued' || job.status === 'running') {
            btnStartFull.disabled = true;
            btnSimulate.disabled = true;
            btnCancel.style.display = 'block';
            progressBox.style.display = 'flex';

            const isContinuous = !!job.continuous;
            if (btnCancelText) {
                btnCancelText.textContent = isContinuous ? 'Stop Continuous Run' : 'Cancel Active Job';
            }

            // Continuous telemetry countdown
            if (isContinuous && continuousStatusBox) {
                continuousStatusBox.style.display = 'block';
                if (continuousCycleBadge) {
                    continuousCycleBadge.textContent = `Cycle ${job.cycle_count || 1}`;
                }
                if (continuousCountdown && job.end_time) {
                    const remainingSec = Math.max(0, Math.floor(job.end_time - (Date.now() / 1000)));
                    const h = String(Math.floor(remainingSec / 3600)).padStart(2, '0');
                    const m = String(Math.floor((remainingSec % 3600) / 60)).padStart(2, '0');
                    const s = String(remainingSec % 60).padStart(2, '0');
                    continuousCountdown.textContent = `${h}h ${m}m ${s}s`;
                }
            } else if (continuousStatusBox) {
                continuousStatusBox.style.display = 'none';
            }

            const current = job.current_slot || 0;
            const total = job.total_slots || 8;
            const pct = Math.round((current / total) * 100);

            progressText.textContent = isContinuous
                ? `Cycle ${job.cycle_count || 1}: Slot ${current} of ${total}`
                : `Progress: Slot ${current} of ${total}`;
            progressPercent.textContent = `${pct}%`;
            progressBarFill.style.width = `${pct}%`;

            if (current > 0 && current <= 8) {
                activeSlotOverlay.style.display = 'flex';
                overlaySlotNum.textContent = current;
            } else {
                activeSlotOverlay.style.display = 'none';
            }

            // Update slot cards states
            for (let i = 1; i <= 8; i++) {
                const card = document.getElementById(`slotCard-${i}`);
                if (!card) continue;
                const statusSpan = card.querySelector('.slot-status');

                if (job.target === 'all') {
                    if (i < current) {
                        card.className = 'slot-box state-completed';
                        statusSpan.className = 'slot-status completed';
                        statusSpan.textContent = 'DONE';
                    } else if (i === current) {
                        card.className = 'slot-box state-capturing';
                        statusSpan.className = 'slot-status capturing';
                        statusSpan.textContent = 'CAPTURING';
                    } else {
                        card.className = 'slot-box';
                        statusSpan.className = 'slot-status idle';
                        statusSpan.textContent = 'QUEUED';
                    }
                } else if (parseInt(job.target, 10) === i) {
                    card.className = 'slot-box state-capturing';
                    statusSpan.className = 'slot-status capturing';
                    statusSpan.textContent = 'CAPTURING';
                }
            }
        } else if (job.status === 'completed') {
            btnStartFull.disabled = false;
            btnSimulate.disabled = false;
            btnCancel.style.display = 'none';
            activeSlotOverlay.style.display = 'none';
            if (continuousStatusBox) continuousStatusBox.style.display = 'none';

            progressText.textContent = job.continuous
                ? `Continuous run finished! Completed ${job.cycle_count || 1} cycles.`
                : `Completed! ${job.total_slots} slots captured.`;
            progressBarFill.style.width = '100%';

            for (let i = 1; i <= 8; i++) {
                const card = document.getElementById(`slotCard-${i}`);
                if (!card) continue;
                const statusSpan = card.querySelector('.slot-status');
                if (state.slotResults[i]) {
                    card.className = 'slot-box state-completed';
                    statusSpan.className = 'slot-status completed';
                    statusSpan.textContent = 'CAPTURED';
                }
            }
            loadRecentGallery();
        } else if (job.status === 'cancelled') {
            btnStartFull.disabled = false;
            btnSimulate.disabled = false;
            btnCancel.style.display = 'none';
            activeSlotOverlay.style.display = 'none';
            if (continuousStatusBox) continuousStatusBox.style.display = 'none';
            progressText.textContent = 'Job Cancelled';
        }
    }

    function flashScreen() {
        captureFlash.classList.add('active');
        setTimeout(() => captureFlash.classList.remove('active'), 140);
    }

    function updateTerminalLogs(logs) {
        terminalLog.innerHTML = '';
        logs.forEach(line => {
            const div = document.createElement('div');
            div.className = 'log-line';
            div.textContent = line;
            terminalLog.appendChild(div);
        });
        terminalLog.scrollTop = terminalLog.scrollHeight;
    }

    // =========================================================================
    // Category Selector
    // =========================================================================

    document.querySelectorAll('.cat-radio-btn').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.cat-radio-btn').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const radio = card.querySelector('input[type="radio"]');
            radio.checked = true;
            state.selectedCategory = radio.value;
        });
    });

    function resetSlotCardsVisuals() {
        state.slotResults = {};
        for (let i = 1; i <= 8; i++) {
            const card = document.getElementById(`slotCard-${i}`);
            if (!card) continue;
            card.className = 'slot-box';
            card.querySelector('.slot-status').className = 'slot-status idle';
            card.querySelector('.slot-status').textContent = 'IDLE';
            document.getElementById(`slotThumb-${i}`).innerHTML = `<i class="fa-regular fa-clock empty-icon"></i>`;
        }
    }

    // =========================================================================
    // Acquisition Triggers
    // =========================================================================

    function startAcquisition(target, isSimulate = false) {
        resetSlotCardsVisuals();

        const payload = {
            target: target,
            category: state.selectedCategory,
            folder: state.activeFolder,
            simulate: isSimulate,
            continuous: state.isContinuous
        };

        if (state.isContinuous) {
            const endVal = inputEndDateTime ? inputEndDateTime.value : null;
            if (!endVal) {
                showToast('Please select a target finish Date & Time for continuous run');
                return;
            }
            payload.end_time = endVal;
        }

        fetch('/api/job/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const modeMsg = state.isContinuous ? 'Continuous Acquisition Started' : 'Acquisition Started';
                showToast(isSimulate ? `Simulated ${modeMsg}` : `${modeMsg}. Waiting for Cobot...`);
                pollStatus();
            } else {
                showToast(`Error: ${data.error || 'Failed to start'}`);
            }
        })
        .catch(err => {
            console.error('Start error:', err);
            showToast('Network error starting acquisition');
        });
    }

    // Start Full (Slots 1 - 8)
    btnStartFull.addEventListener('click', () => startAcquisition('all', false));

    // Simulate Cobot Run
    btnSimulate.addEventListener('click', () => startAcquisition('all', true));

    // Cancel Job
    btnCancel.addEventListener('click', () => {
        fetch('/api/job/cancel', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast('Job Cancelled');
                    pollStatus();
                }
            });
    });

    // =========================================================================
    // Individual Slot Capture (Cobot vs Instant Camera Snap)
    // =========================================================================
    const selectCaptureSlot = document.getElementById('selectCaptureSlot');
    const btnAcquireSlotCobot = document.getElementById('btnAcquireSlotCobot');
    const btnAcquireSlotInstant = document.getElementById('btnAcquireSlotInstant');

    function snapSlotInstant(slotNum) {
        flashScreen();
        showToast(`Snapping image for Slot ${slotNum} into [${state.selectedCategory}]...`);

        fetch('/api/capture/instant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slot_num: slotNum,
                category: state.selectedCategory,
                folder: state.activeFolder,
                watch_id: 'Watch'
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                state.slotResults[slotNum] = data;
                const card = document.getElementById(`slotCard-${slotNum}`);
                const thumbDiv = document.getElementById(`slotThumb-${slotNum}`);
                if (card) {
                    card.className = 'slot-box state-completed';
                    const statusSpan = card.querySelector('.slot-status');
                    if (statusSpan) {
                        statusSpan.className = 'slot-status completed';
                        statusSpan.textContent = 'CAPTURED';
                    }
                }
                if (thumbDiv && data.thumb_url) {
                    thumbDiv.innerHTML = `<img src="${data.thumb_url}" alt="Slot ${slotNum}">`;
                }
                showToast(`Slot ${slotNum} captured: ${data.filename}`);
                loadRecentGallery();
                pollStatus();
            } else {
                showToast(`Error: ${data.error || 'Failed to capture image'}`);
            }
        })
        .catch(err => {
            console.error('Instant capture error:', err);
            showToast('Network error capturing image');
        });
    }

    if (btnAcquireSlotCobot && selectCaptureSlot) {
        btnAcquireSlotCobot.addEventListener('click', () => {
            const slot = parseInt(selectCaptureSlot.value, 10) || 1;
            startAcquisition(slot, false);
        });
    }

    if (btnAcquireSlotInstant && selectCaptureSlot) {
        btnAcquireSlotInstant.addEventListener('click', () => {
            const slot = parseInt(selectCaptureSlot.value, 10) || 1;
            snapSlotInstant(slot);
        });
    }

    // Per-card Cobot and Instant buttons
    document.querySelectorAll('.btn-slot-cobot').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const slot = parseInt(btn.dataset.slot, 10);
            if (selectCaptureSlot) selectCaptureSlot.value = slot;
            startAcquisition(slot, false);
        });
    });

    document.querySelectorAll('.btn-slot-instant').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const slot = parseInt(btn.dataset.slot, 10);
            if (selectCaptureSlot) selectCaptureSlot.value = slot;
            snapSlotInstant(slot);
        });
    });

    // =========================================================================
    // Gallery & Modal & Deletion
    // =========================================================================

    function loadRecentGallery() {
        const folderParam = state.activeFolder ? `?folder=${encodeURIComponent(state.activeFolder)}` : '';
        fetch(`/api/captures/recent${folderParam}`)
            .then(res => res.json())
            .then(images => {
                galleryCountBadge.textContent = images.length;
                if (images.length === 0) {
                    galleryStrip.innerHTML = `<div class="empty-tray">Images captured during cobot run will appear here automatically.</div>`;
                    return;
                }

                galleryStrip.innerHTML = '';
                images.forEach(img => {
                    const item = document.createElement('div');
                    // Add category boundary outline class: cat-train_good, cat-val_good, cat-val_defect
                    item.className = `gallery-item cat-${img.category}`;
                    item.title = `${img.filename} (${img.category})`;

                    const match = img.filename.match(/slot(\d+)/i);
                    const slotNum = match ? `Slot ${match[1]}` : img.label;
                    const labelText = img.label === 'good' ? (img.split === 'train' ? 'TRAIN' : 'VAL GOOD') : 'VAL DEF';

                    item.innerHTML = `
                        <img src="${img.thumb_url}" alt="${img.filename}" loading="lazy">
                        <span class="cat-badge-mini">${labelText}</span>
                        <span class="slot-tag">${slotNum}</span>
                        <button class="btn-delete-img" title="Delete image" data-relpath="${img.relative_path}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    `;

                    // Delete button click
                    const btnDelete = item.querySelector('.btn-delete-img');
                    btnDelete.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteImage(img.relative_path, img.filename);
                    });

                    // Click item opens modal preview
                    item.addEventListener('click', () => openImageModal(img));
                    galleryStrip.appendChild(item);
                });
            })
            .catch(err => console.warn('Gallery error:', err));
    }

    btnRefreshGallery.addEventListener('click', loadRecentGallery);
    loadRecentGallery();

    function deleteImage(relativePath, filename) {
        if (!confirm(`Delete image ${filename}?`)) {
            return;
        }

        fetch('/api/image/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relative_path: relativePath })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`Deleted: ${filename}`);
                loadRecentGallery();
                pollStatus();
                closeModal();
            } else {
                showToast(`Error: ${data.error || 'Failed to delete'}`);
            }
        })
        .catch(err => {
            console.error('Delete error:', err);
            showToast('Network error deleting image');
        });
    }

    function openImageModal(img) {
        state.activeModalImg = img;
        modalTitle.textContent = img.filename;
        modalImg.src = img.image_url;
        btnDownloadModal.href = img.image_url;
        btnDownloadModal.download = img.filename;

        if (modalCategoryBadge) {
            const catName = img.category === 'train_good' ? 'Train Good' : (img.category === 'val_good' ? 'Validation Good' : 'Validation Defect');
            modalCategoryBadge.textContent = catName;
            modalCategoryBadge.className = `badge ${img.category === 'train_good' ? 'badge-success' : (img.category === 'val_good' ? 'badge-info' : 'badge-danger')}`;
        }

        imageModal.classList.add('active');
    }

    if (btnDeleteModal) {
        btnDeleteModal.addEventListener('click', () => {
            if (state.activeModalImg) {
                deleteImage(state.activeModalImg.relative_path, state.activeModalImg.filename);
            }
        });
    }

    function closeModal() {
        imageModal.classList.remove('active');
        modalImg.src = '';
        state.activeModalImg = null;
    }

    btnCloseModal.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);

    // =========================================================================
    // Top Bar Actions
    // =========================================================================

    btnReconnectCam.addEventListener('click', () => {
        btnReconnectCam.disabled = true;
        btnReconnectCam.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Camera`;
        fetch('/api/camera/reconnect', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                showToast(data.success ? 'Mech-Eye Camera Reconnected' : 'Reconnect failed');
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
});
