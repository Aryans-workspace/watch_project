import re

file_path = 'patchcore_defect_detection/patchcore_engine.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = '''        # Apply mask
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
        _, diff_thresh = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)'''

replacement = '''        # Apply mask
        aligned_gray = cv2.bitwise_and(aligned_gray, aligned_gray, mask=mask)
        masked_golden = cv2.bitwise_and(golden, golden, mask=mask)

        # Apply CLAHE to exponentially boost the contrast of microscopic dust
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

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully added CLAHE and lowered thresholds.")
else:
    print("Error: Target block not found.")
