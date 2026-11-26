import cv2
import glob
import numpy as np

def main():
    print("Loading 4 good reference images and 1 defective image...")
    good_paths = glob.glob(r"testing\good\*.png")
    good_imgs = [cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2GRAY) for p in good_paths]
    
    orig_def_img = cv2.imread(r"testing\defect\defective.png")
    def_img = cv2.cvtColor(orig_def_img, cv2.COLOR_BGR2GRAY)
    
    # 1. Align all good images to the first one to create a statistical model of "normal"
    ref = good_imgs[0]
    aligned_goods = [ref]
    
    warp_mode = cv2.MOTION_EUCLIDEAN
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 1e-3)
    
    print("Training AI on normal variances...")
    for i in range(1, len(good_imgs)):
        warp_matrix = np.eye(2, 3, dtype=np.float32)
        try:
            _, warp_matrix = cv2.findTransformECC(ref, good_imgs[i], warp_matrix, warp_mode, criteria)
            aligned = cv2.warpAffine(good_imgs[i], warp_matrix, (ref.shape[1], ref.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
            aligned_goods.append(aligned)
        except:
            aligned_goods.append(good_imgs[i])
            
    # Align the defective image to our reference
    warp_matrix = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp_matrix = cv2.findTransformECC(ref, def_img, warp_matrix, warp_mode, criteria)
        def_aligned = cv2.warpAffine(def_img, warp_matrix, (ref.shape[1], ref.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
        def_aligned_color = cv2.warpAffine(orig_def_img, warp_matrix, (ref.shape[1], ref.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
    except:
        def_aligned = def_img
        def_aligned_color = orig_def_img
        
    # 2. Build the Statistical Model
    # We find the min and max pixel values across all 4 normal images.
    # This automatically ignores text shifting or reflections since they will vary across the 4 images.
    stacked_goods = np.stack(aligned_goods, axis=0)
    min_good = np.min(stacked_goods, axis=0).astype(np.int16)
    max_good = np.max(stacked_goods, axis=0).astype(np.int16)
    
    def_aligned_16 = def_aligned.astype(np.int16)
    
    # 3. Detect Anomalies
    # An anomaly is any pixel that falls significantly outside the normal expected range.
    tolerance = 25 # Buffer to account for tiny unseen noise
    diff_upper = np.maximum(0, def_aligned_16 - max_good - tolerance)
    diff_lower = np.maximum(0, min_good - def_aligned_16 - tolerance)
    
    anomaly_map = np.maximum(diff_upper, diff_lower).astype(np.uint8)
    
    # 4. Strict Inner Dial Mask (focusing only inside the dial)
    h, w = ref.shape
    cx, cy = int(w * 0.5), int(h * 0.5)
    radius = int(min(h, w) * 0.26)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), radius, 255, -1)
    
    anomaly_map = cv2.bitwise_and(anomaly_map, anomaly_map, mask=mask)
    
    # 5. Extract the dust contours
    _, thresh = cv2.threshold(anomaly_map, 15, 255, cv2.THRESH_BINARY)
    
    # Morphological open to remove 1-pixel sensor artifacts
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, np.ones((2,2), np.uint8))
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    result = def_aligned_color.copy()
    count = 0
    for c in contours:
        area = cv2.contourArea(c)
        if 2 < area < 400:
            x, y, bw, bh = cv2.boundingRect(c)
            # Dust is compact
            if bw < 40 and bh < 40:
                cv2.circle(result, (int(x+bw/2), int(y+bh/2)), max(bw,bh)+12, (0, 0, 255), 2)
                count += 1
                
    print(f"Statistical AI extracted {count} definitive defects inside the dial.")
    cv2.imwrite(r"testing\ai_result.png", result)

if __name__ == "__main__":
    main()
