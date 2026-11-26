/**
 * Mech-Eye Calibration Program - Frontend Controller
 * Handles real-time telemetry, calibration overlays, zoom/pan, snapshot captures, and keyboard shortcuts.
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    const state = {
        zoom: 1.0,
        panX: 0,
        panY: 0,
        isPanning: false,
        startX: 0,
        startY: 0,
        stepSize: 1,
        captureMode: 'raw', // 'raw' or 'overlay'
        calibration: {
            offset_x: 0,
            offset_y: 0,
            center_x: 1024,
            center_y: 768,
            crosshair_enabled: true,
            cross_span: 'full',
            line_thickness: 2,
            show_center_circle: true,
            show_rings: false,
            show_coordinates: true
        },
        cameraInfo: {
            model: 'Mech-Eye UHP-140',
            ip: '169.254.8.29',
            resolution: '2048 x 1536',
            fps: 0,
            connected: false,
            is_real: true
        }
    };

    // DOM Elements
    const liveFeed = document.getElementById('liveFeed');
    const streamContainer = document.getElementById('streamContainer');
    const viewportWrapper = document.getElementById('viewportWrapper');
    const captureFlash = document.getElementById('captureFlash');
    const toast = document.getElementById('toast');

    // Telemetry
    const statusText = document.getElementById('statusText');
    const camStatusBadge = document.getElementById('camStatusBadge');
    const modelText = document.getElementById('modelText');
    const ipText = document.getElementById('ipText');
    const resText = document.getElementById('resText');
    const fpsText = document.getElementById('fpsText');

    // HUDs
    const hudCenter = document.getElementById('hudCenter');
    const hudCoords = document.getElementById('hudCoords');
    const mouseCoords = document.getElementById('mouseCoords');
    const readoutCx = document.getElementById('readoutCx');
    const readoutCy = document.getElementById('readoutCy');
    const readoutOffset = document.getElementById('readoutOffset');

    // Controls
    const chkCrosshair = document.getElementById('chkCrosshair');
    const btnSpanFull = document.getElementById('btnSpanFull');
    const btnSpanFixed = document.getElementById('btnSpanFixed');
    const rngThickness = document.getElementById('rngThickness');
    const valThickness = document.getElementById('valThickness');
    const chkCenterCircle = document.getElementById('chkCenterCircle');
    const chkRings = document.getElementById('chkRings');
    const chkCoords = document.getElementById('chkCoords');

    // Nudge & D-Pad
    const btnNudgeUp = document.getElementById('btnNudgeUp');
    const btnNudgeDown = document.getElementById('btnNudgeDown');
    const btnNudgeLeft = document.getElementById('btnNudgeLeft');
    const btnNudgeRight = document.getElementById('btnNudgeRight');
    const btnResetCenter = document.getElementById('btnResetCenter');
    const btnResetOffsetsFull = document.getElementById('btnResetOffsetsFull');

    // Zoom & View
    const btnZoomIn = document.getElementById('btnZoomIn');
    const btnZoomOut = document.getElementById('btnZoomOut');
    const btnZoomFit = document.getElementById('btnZoomFit');
    const btnZoom100 = document.getElementById('btnZoom100');
    const btnFullscreen = document.getElementById('btnFullscreen');
    const btnToggleCrosshairQuick = document.getElementById('btnToggleCrosshairQuick');

    // Capture
    const btnMainCapture = document.getElementById('btnMainCapture');
    const btnCaptureModeRaw = document.getElementById('btnCaptureModeRaw');
    const btnCaptureModeOverlay = document.getElementById('btnCaptureModeOverlay');

    // Gallery
    const galleryList = document.getElementById('galleryList');
    const captureCountBadge = document.getElementById('captureCountBadge');
    const btnRefreshGallery = document.getElementById('btnRefreshGallery');

    // Modal
    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalFilename = document.getElementById('modalFilename');
    const btnDownloadModal = document.getElementById('btnDownloadModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const modalBackdrop = document.getElementById('modalBackdrop');

    // Reconnect
    const btnReconnect = document.getElementById('btnReconnect');

    // =========================================================================
    // Initial Setup & Telemetry Polling
    // =========================================================================

    function fetchStatus() {
        fetch('/api/status')
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                // Update camera telemetry
                if (data.camera) {
                    state.cameraInfo = data.camera;
                    modelText.textContent = data.camera.model || 'Unknown';
                    ipText.textContent = data.camera.ip || 'Unknown';
                    resText.textContent = data.camera.resolution || '2048 × 1536';

                    const indicator = camStatusBadge.querySelector('.status-indicator');
                    if (data.camera.connected) {
                        if (data.camera.is_real) {
                            indicator.className = 'status-indicator online';
                            statusText.textContent = 'ONLINE (UHP-140)';
                        } else {
                            indicator.className = 'status-indicator simulated';
                            statusText.textContent = 'SIMULATED';
                        }
                    } else {
                        indicator.className = 'status-indicator offline';
                        statusText.textContent = 'OFFLINE';
                    }
                }

                if (typeof data.fps === 'number') {
                    fpsText.textContent = data.fps.toFixed(1);
                }

                // Update calibration state
                if (data.calibration) {
                    updateCalibrationUI(data.calibration);
                }
            })
            .catch(err => {
                console.warn('Status poll error:', err);
                statusText.textContent = 'CONNECTING...';
            });
    }

    function updateCalibrationUI(cal) {
        state.calibration = cal;

        // Coordinates display
        readoutCx.textContent = cal.center_x;
        readoutCy.textContent = cal.center_y;
        readoutOffset.textContent = `${cal.offset_x >= 0 ? '+' : ''}${cal.offset_x}, ${cal.offset_y >= 0 ? '+' : ''}${cal.offset_y}`;
        hudCoords.textContent = `X: ${cal.center_x}, Y: ${cal.center_y}`;

        // Crosshair controls sync
        chkCrosshair.checked = cal.crosshair_enabled;
        btnToggleCrosshairQuick.classList.toggle('active', cal.crosshair_enabled);

        if (cal.cross_span === 'full') {
            btnSpanFull.classList.add('active');
            btnSpanFixed.classList.remove('active');
        } else {
            btnSpanFull.classList.remove('active');
            btnSpanFixed.classList.add('active');
        }

        rngThickness.value = cal.line_thickness;
        valThickness.textContent = `${cal.line_thickness} px`;

        chkCenterCircle.checked = cal.show_center_circle;
        chkRings.checked = cal.show_rings;
        chkCoords.checked = cal.show_coordinates;

        hudCenter.style.display = cal.show_coordinates ? 'block' : 'none';
    }

    // Poll status every 1.5 seconds
    fetchStatus();
    setInterval(fetchStatus, 1500);

    // =========================================================================
    // Calibration Parameter API Updates
    // =========================================================================

    function sendCalibrationUpdate(params) {
        fetch('/api/calibration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                updateCalibrationUI(data.calibration);
            }
        })
        .catch(err => console.error('Calibration update error:', err));
    }

    // Crosshair Toggle
    chkCrosshair.addEventListener('change', () => {
        sendCalibrationUpdate({ crosshair_enabled: chkCrosshair.checked });
    });

    btnToggleCrosshairQuick.addEventListener('click', () => {
        const next = !chkCrosshair.checked;
        chkCrosshair.checked = next;
        sendCalibrationUpdate({ crosshair_enabled: next });
    });

    // Span Mode Buttons
    btnSpanFull.addEventListener('click', () => {
        sendCalibrationUpdate({ cross_span: 'full' });
    });

    btnSpanFixed.addEventListener('click', () => {
        sendCalibrationUpdate({ cross_span: 'fixed', cross_size: 1000 });
    });

    // Thickness Slider
    rngThickness.addEventListener('input', () => {
        valThickness.textContent = `${rngThickness.value} px`;
    });

    rngThickness.addEventListener('change', () => {
        sendCalibrationUpdate({ line_thickness: parseInt(rngThickness.value, 10) });
    });

    // Checkboxes
    chkCenterCircle.addEventListener('change', () => {
        sendCalibrationUpdate({ show_center_circle: chkCenterCircle.checked });
    });

    chkRings.addEventListener('change', () => {
        sendCalibrationUpdate({ show_rings: chkRings.checked });
    });

    chkCoords.addEventListener('change', () => {
        sendCalibrationUpdate({ show_coordinates: chkCoords.checked });
    });

    // Step Size Selector
    document.querySelectorAll('.btn-step').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-step').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.stepSize = parseInt(btn.dataset.step, 10);
        });
    });

    // Nudge Operations
    function nudge(dx, dy) {
        const nextX = state.calibration.offset_x + dx;
        const nextY = state.calibration.offset_y + dy;
        sendCalibrationUpdate({ offset_x: nextX, offset_y: nextY });
    }

    btnNudgeUp.addEventListener('click', () => nudge(0, -state.stepSize));
    btnNudgeDown.addEventListener('click', () => nudge(0, state.stepSize));
    btnNudgeLeft.addEventListener('click', () => nudge(-state.stepSize, 0));
    btnNudgeRight.addEventListener('click', () => nudge(state.stepSize, 0));

    function resetCenter() {
        fetch('/api/calibration/reset', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    updateCalibrationUI(data.calibration);
                    showToast('Offsets reset to geometric center (0, 0)');
                }
            });
    }

    btnResetCenter.addEventListener('click', resetCenter);
    btnResetOffsetsFull.addEventListener('click', resetCenter);

    // =========================================================================
    // Zoom & Pan Engine
    // =========================================================================

    function applyTransform() {
        streamContainer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    }

    btnZoomIn.addEventListener('click', () => {
        state.zoom = Math.min(6.0, state.zoom * 1.25);
        applyTransform();
        updateZoomButtons();
    });

    btnZoomOut.addEventListener('click', () => {
        state.zoom = Math.max(0.2, state.zoom / 1.25);
        applyTransform();
        updateZoomButtons();
    });

    btnZoomFit.addEventListener('click', () => {
        state.zoom = 1.0;
        state.panX = 0;
        state.panY = 0;
        applyTransform();
        updateZoomButtons();
    });

    btnZoom100.addEventListener('click', () => {
        state.zoom = 2.0; // 1:1 pixel view approx
        state.panX = 0;
        state.panY = 0;
        applyTransform();
        updateZoomButtons();
    });

    function updateZoomButtons() {
        btnZoomFit.classList.toggle('active', state.zoom === 1.0 && state.panX === 0 && state.panY === 0);
        btnZoom100.classList.toggle('active', state.zoom === 2.0);
    }

    // Mouse Wheel Zoom
    viewportWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        state.zoom = Math.min(8.0, Math.max(0.2, state.zoom * factor));
        applyTransform();
        updateZoomButtons();
    }, { passive: false });

    // Drag to Pan
    viewportWrapper.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left mouse button
            state.isPanning = true;
            state.startX = e.clientX - state.panX;
            state.startY = e.clientY - state.panY;
            viewportWrapper.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (state.isPanning) {
            state.panX = e.clientX - state.startX;
            state.panY = e.clientY - state.startY;
            applyTransform();
        }

        // Calculate cursor coordinate in camera image space
        const rect = liveFeed.getBoundingClientRect();
        if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        ) {
            // Resolution of camera
            const camW = 2048;
            const camH = 1536;
            const normX = (e.clientX - rect.left) / rect.width;
            const normY = (e.clientY - rect.top) / rect.height;
            const imgX = Math.floor(normX * camW);
            const imgY = Math.floor(normY * camH);
            mouseCoords.textContent = `X: ${imgX}, Y: ${imgY}`;
        } else {
            mouseCoords.textContent = `-- , --`;
        }
    });

    window.addEventListener('mouseup', () => {
        if (state.isPanning) {
            state.isPanning = false;
            viewportWrapper.style.cursor = 'crosshair';
        }
    });

    // =========================================================================
    // Capture & Snapshot Management
    // =========================================================================

    // Capture Mode Toggle
    btnCaptureModeRaw.addEventListener('click', () => {
        state.captureMode = 'raw';
        btnCaptureModeRaw.classList.add('active');
        btnCaptureModeOverlay.classList.remove('active');
    });

    btnCaptureModeOverlay.addEventListener('click', () => {
        state.captureMode = 'overlay';
        btnCaptureModeOverlay.classList.add('active');
        btnCaptureModeRaw.classList.remove('active');
    });

    function triggerCapture() {
        // Visual flash effect
        captureFlash.classList.add('active');
        setTimeout(() => captureFlash.classList.remove('active'), 120);

        const withCrosshair = (state.captureMode === 'overlay');

        fetch('/api/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ with_crosshair: withCrosshair })
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                showToast(`Saved: ${result.filename}`);
                loadGallery();
            } else {
                showToast(`Capture failed: ${result.error || 'Unknown error'}`);
            }
        })
        .catch(err => {
            console.error('Capture error:', err);
            showToast('Capture error');
        });
    }

    btnMainCapture.addEventListener('click', triggerCapture);

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // =========================================================================
    // Captures Gallery Drawer
    // =========================================================================

    function loadGallery() {
        fetch('/api/captures')
            .then(res => res.json())
            .then(captures => {
                captureCountBadge.textContent = captures.length;

                if (captures.length === 0) {
                    galleryList.innerHTML = `<div class="empty-gallery">No captures taken yet. Click "Capture Frame" or press Space.</div>`;
                    return;
                }

                galleryList.innerHTML = '';
                captures.forEach(cap => {
                    const item = document.createElement('div');
                    item.className = 'gallery-item';
                    item.title = cap.filename;

                    const hasCrosshair = cap.filename.startsWith('calibration_');
                    item.innerHTML = `
                        <img src="${cap.thumb_url}" alt="${cap.filename}" loading="lazy">
                        <span class="overlay-tag">${hasCrosshair ? '+' : 'RAW'}</span>
                    `;

                    item.addEventListener('click', () => openImageModal(cap));
                    galleryList.appendChild(item);
                });
            })
            .catch(err => console.warn('Failed to load captures gallery:', err));
    }

    btnRefreshGallery.addEventListener('click', loadGallery);
    loadGallery();

    // =========================================================================
    // Image Modal Preview
    // =========================================================================

    function openImageModal(cap) {
        modalFilename.textContent = cap.filename;
        modalImage.src = cap.url;
        btnDownloadModal.href = cap.url;
        btnDownloadModal.download = cap.filename;
        imageModal.classList.add('active');
    }

    function closeModal() {
        imageModal.classList.remove('active');
        modalImage.src = '';
    }

    btnCloseModal.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);

    // =========================================================================
    // Camera Reconnect Button
    // =========================================================================

    btnReconnect.addEventListener('click', () => {
        btnReconnect.disabled = true;
        btnReconnect.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Connecting...`;
        statusText.textContent = 'CONNECTING...';

        fetch('/api/camera/reconnect', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                fetchStatus();
                showToast(data.success ? 'Reconnected to Mech-Eye Camera' : 'Reconnect failed');
            })
            .catch(err => {
                console.error('Reconnect error:', err);
                showToast('Reconnect request failed');
            })
            .finally(() => {
                btnReconnect.disabled = false;
                btnReconnect.innerHTML = `<i class="fa-solid fa-rotate"></i> Reconnect`;
            });
    });

    // =========================================================================
    // Fullscreen Mode
    // =========================================================================

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.warn('Fullscreen error:', err);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    btnFullscreen.addEventListener('click', toggleFullscreen);

    // =========================================================================
    // Global Keyboard Shortcuts
    // =========================================================================

    window.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        if (e.code === 'Space' || e.key.toLowerCase() === 's') {
            e.preventDefault();
            triggerCapture();
        } else if (e.key.toLowerCase() === 'c') {
            e.preventDefault();
            btnToggleCrosshairQuick.click();
        } else if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            toggleFullscreen();
        } else if (e.key.toLowerCase() === 'r') {
            e.preventDefault();
            btnZoomFit.click();
        } else if (e.key === '0') {
            e.preventDefault();
            resetCenter();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            nudge(0, -state.stepSize);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(0, state.stepSize);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            nudge(-state.stepSize, 0);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nudge(state.stepSize, 0);
        } else if (e.key === 'Escape') {
            closeModal();
        }
    });
});
