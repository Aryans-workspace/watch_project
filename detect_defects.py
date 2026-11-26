import cv2
import numpy as np

def main():
    print("Loading images...")
    ref_img = cv2.imread(r"testing\good\good_1.png")
    def_img = cv2.imread(r"testing\defect\defective.png")
    
    if ref_img is None or def_img is None:
        print("Error loading images.")
        return
        
    ref_gray = cv2.cvtColor(ref_img, cv2.COLOR_BGR2GRAY)
    def_gray = cv2.cvtColor(def_img, cv2.COLOR_BGR2GRAY)

    print("Aligning...")
    warp_mode = cv2.MOTION_EUCLIDEAN
    warp_matrix = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-4)
    try:
        _, warp_matrix = cv2.findTransformECC(ref_gray, def_gray, warp_matrix, warp_mode, criteria)
        def_aligned = cv2.warpAffine(def_img, warp_matrix, (ref_img.shape[1], ref_img.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
        def_gray_aligned = cv2.cvtColor(def_aligned, cv2.COLOR_BGR2GRAY)
    except:
        print("Alignment failed.")
        def_aligned = def_img
        def_gray_aligned = def_gray

    h, w = ref_gray.shape
    mask = np.zeros((h, w), dtype=np.uint8)
    # Mask out the background ridges
    cv2.circle(mask, (w//2, h//2), int(min(h, w) * 0.40), 255, -1)
    
    print("Computing difference...")
    blur_ref = cv2.GaussianBlur(ref_gray, (3, 3), 0)
    blur_def = cv2.GaussianBlur(def_gray_aligned, (3, 3), 0)
    
    # We are specifically looking for dark dust/lint. 
    # Subtracting def from ref will highlight spots that are darker in the defect image.
    diff_dark = cv2.subtract(blur_ref, blur_def)
    
    diff_masked = cv2.bitwise_and(diff_dark, diff_dark, mask=mask)
    
    # High threshold to find very distinct dark spots (defects)
    _, thresh = cv2.threshold(diff_masked, 30, 255, cv2.THRESH_BINARY)
    
    # Morphological operations to clean up
    kernel = np.ones((3,3), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    result_img = def_aligned.copy()
    count = 0
    for c in contours:
        area = cv2.contourArea(c)
        if 3 < area < 400:
            (x, y, w_box, h_box) = cv2.boundingRect(c)
            # Filter for compact dust particles
            if w_box < 40 and h_box < 40:
                cv2.circle(result_img, (int(x+w_box/2), int(y+h_box/2)), max(w_box, h_box) + 15, (0, 0, 255), 2)
                count += 1
                
    print(f"Detected {count} potential defects.")
    cv2.imwrite(r"testing\result.png", result_img)
    cv2.imwrite(r"testing\thresh.png", thresh)

if __name__ == "__main__":
    main()
