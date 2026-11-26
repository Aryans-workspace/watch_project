import re

with open('patchcore_defect_detection/patchcore_engine.py', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''        # Absolute difference
        diff = cv2.absdiff(gray, golden)
        blur = cv2.GaussianBlur(diff, (5, 5), 0)
        _, thresh = cv2.threshold(blur, 20, 255, cv2.THRESH_BINARY)
        
        anomaly_map = blur.astype(np.float32) / 255.0
        
        # Calculate ratio of changed pixels
        ratio = np.count_nonzero(thresh) / thresh.size
        # Map 1% change to score 30.0 (high defect), 0% to score 20.0 (ok)
        score = 20.0 + (ratio * 100.0 * 20.0) 
        
        return torch.tensor([score]), None, anomaly_map'''

replacement = '''        # 1. Image Alignment (Crucial)
        try:
            warp_matrix = np.eye(2, 3, dtype=np.float32)
            criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 0.001)
            _, warp_matrix = cv2.findTransformECC(golden, gray, warp_matrix, cv2.MOTION_TRANSLATION, criteria)
            aligned_gray = cv2.warpAffine(gray, warp_matrix, (gray.shape[1], gray.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
        except Exception:
            aligned_gray = gray
            
        # 2. Strict Inner-Dial Masking
        mask = np.zeros_like(aligned_gray)
        h, w = aligned_gray.shape
        cv2.circle(mask, (w//2, h//2), int(w * 0.26), 255, -1)
        
        # Apply mask
        aligned_gray = cv2.bitwise_and(aligned_gray, aligned_gray, mask=mask)
        masked_golden = cv2.bitwise_and(golden, golden, mask=mask)

        # 3. Morphological Feature Extraction (Top-Hat for bright dust)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        tophat = cv2.morphologyEx(aligned_gray, cv2.MORPH_TOPHAT, kernel)
        _, tophat_thresh = cv2.threshold(tophat, 30, 255, cv2.THRESH_BINARY)
        
        # 4. Image Subtraction (absdiff for dark dust)
        blur_ref = cv2.GaussianBlur(masked_golden, (5, 5), 0)
        blur_def = cv2.GaussianBlur(aligned_gray, (5, 5), 0)
        diff = cv2.absdiff(blur_ref, blur_def)
        _, diff_thresh = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
        
        # 5. Geometric Filtering
        combined = cv2.bitwise_or(tophat_thresh, diff_thresh)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(combined)
        
        filtered_mask = np.zeros_like(combined)
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            wb = stats[i, cv2.CC_STAT_WIDTH]
            hb = stats[i, cv2.CC_STAT_HEIGHT]
            # Ensure it only flags compact dust, not long scratches or shadows
            if 3 <= area <= 400 and wb < 40 and hb < 40:
                filtered_mask[labels == i] = 255
                
        # Heatmap visualization
        blur_map = cv2.GaussianBlur(filtered_mask, (15, 15), 0)
        anomaly_map = blur_map.astype(np.float32) / 255.0
        
        # Calculate ratio of defect pixels over inner circle area
        circle_area = np.pi * (int(w * 0.26) ** 2)
        ratio = np.count_nonzero(filtered_mask) / max(circle_area, 1.0)
        
        # Map ratio to standard anomaly score (threshold is ~26.0)
        score = 20.0 + (ratio * 100.0 * 500.0) 
        
        return torch.tensor([score]), None, anomaly_map'''

content = content.replace(target, replacement)
with open('patchcore_defect_detection/patchcore_engine.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated advanced OpenCV pipeline in PixelSSIMModel")
