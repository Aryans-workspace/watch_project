import re

file_path = 'patchcore_defect_detection/patchcore_engine.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''        # Apply CLAHE to exponentially boost the contrast of microscopic dust
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        aligned_gray = clahe.apply(aligned_gray)
        masked_golden = clahe.apply(masked_golden)

        # 3. Morphological Feature Extraction (Top-Hat for bright dust)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        tophat = cv2.morphologyEx(aligned_gray, cv2.MORPH_TOPHAT, kernel)
        _, tophat_thresh = cv2.threshold(tophat, 15, 255, cv2.THRESH_BINARY)
        
        # 4. Image Subtraction (absdiff for dark dust)
        blur_ref = cv2.GaussianBlur(masked_golden, (5, 5), 0)
        blur_def = cv2.GaussianBlur(aligned_gray, (5, 5), 0)
        diff = cv2.absdiff(blur_ref, blur_def)
        _, diff_thresh = cv2.threshold(diff, 15, 255, cv2.THRESH_BINARY)'''

replacement = '''        # 1. Edge-Preserving Noise Reduction
        # Bilateral filter removes background grain but keeps dust edges perfectly sharp
        smooth_live = cv2.bilateralFilter(aligned_gray, 5, 50, 50)
        smooth_gold = cv2.bilateralFilter(masked_golden, 5, 50, 50)

        # 2. Optimized CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8,8))
        clahe_live = clahe.apply(smooth_live)
        clahe_gold = clahe.apply(smooth_gold)

        # 3. Multi-Scale Morphological Top-Hat (Bright Dust & Long Hairs)
        # Using two kernels ensures we catch both tiny circular dust AND long thin hairs
        k_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        k_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
        top_s = cv2.morphologyEx(clahe_live, cv2.MORPH_TOPHAT, k_small)
        top_l = cv2.morphologyEx(clahe_live, cv2.MORPH_TOPHAT, k_large)
        tophat = cv2.bitwise_or(top_s, top_l)
        _, tophat_thresh = cv2.threshold(tophat, 18, 255, cv2.THRESH_BINARY)
        
        # 4. Smart Subtraction (Dark dust) with Edge Suppression
        diff = cv2.absdiff(clahe_gold, clahe_live)
        _, diff_thresh = cv2.threshold(diff, 20, 255, cv2.THRESH_BINARY)
        
        # Suppress false positives on high-contrast structural edges (watch hands, logos)
        edges = cv2.Canny(clahe_gold, 40, 120)
        edge_mask = cv2.dilate(edges, np.ones((5,5), np.uint8), iterations=1)
        diff_thresh[edge_mask == 255] = 0'''

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully deployed Advanced Multi-Scale CLAHE pipeline.")
else:
    print("Error: Target block not found.")
