import re

file_path = 'patchcore_defect_detection/patchcore_engine.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''        # Suppress false positives on high-contrast structural edges (watch hands, logos)
        edges = cv2.Canny(clahe_gold, 40, 120)
        edge_mask = cv2.dilate(edges, np.ones((5,5), np.uint8), iterations=1)
        diff_thresh[edge_mask == 255] = 0
        
        # 5. Geometric Filtering
        combined = cv2.bitwise_or(tophat_thresh, diff_thresh)'''

replacement = '''        # Suppress false positives on high-contrast structural edges (watch hands, logos)
        edges = cv2.Canny(clahe_gold, 40, 120)
        edge_mask = cv2.dilate(edges, np.ones((5,5), np.uint8), iterations=1)
        diff_thresh[edge_mask == 255] = 0
        
        # ----- NEW: FFT FREQUENCY DOMAIN DUST ISOLATION -----
        # Convert images to frequency domain
        f_live = np.fft.fft2(np.float32(clahe_live))
        f_live_shift = np.fft.fftshift(f_live)
        
        f_gold = np.fft.fft2(np.float32(clahe_gold))
        f_gold_shift = np.fft.fftshift(f_gold)
        
        # Compute dynamic frequency mask from Golden Image (Blocks predictable watch geometry)
        mag_gold = np.log1p(np.abs(f_gold_shift))
        freq_thresh = np.mean(mag_gold) + 2.0 * np.std(mag_gold)
        freq_mask = (mag_gold < freq_thresh).astype(np.float32)
        
        # Apply High-Pass filter to remove global brightness/illumination shifts
        h_f, w_f = clahe_live.shape
        cy_f, cx_f = h_f // 2, w_f // 2
        y_grid, x_grid = np.ogrid[:h_f, :w_f]
        lpf_mask = (x_grid - cx_f)**2 + (y_grid - cy_f)**2 <= 20**2
        freq_mask[lpf_mask] = 0
        
        # Apply frequency mask to live image and mathematically reconstruct it
        f_live_filtered = f_live_shift * freq_mask
        img_back = np.fft.ifft2(np.fft.ifftshift(f_live_filtered))
        
        # Extract the chaotic high-frequency anomalies (dust)
        fft_anomaly = np.abs(img_back)
        fft_anomaly = cv2.normalize(fft_anomaly, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
        _, fft_thresh = cv2.threshold(fft_anomaly, 40, 255, cv2.THRESH_BINARY)
        # ----------------------------------------------------
        
        # 5. Geometric Filtering
        combined = cv2.bitwise_or(tophat_thresh, diff_thresh)
        combined = cv2.bitwise_or(combined, fft_thresh)'''

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully injected FFT algorithm.")
else:
    print("Error: Target block not found.")
