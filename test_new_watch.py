import cv2
import numpy as np
import os

def main():
    new_img = cv2.imread(r"testing\new_test.jpg")
    if new_img is None:
        print("Failed to load")
        return
        
    gray = cv2.cvtColor(new_img, cv2.COLOR_BGR2GRAY)
    
    h, w = gray.shape
    cx, cy = int(w * 0.5), int(h * 0.5)
    radius = int(min(h, w) * 0.26)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), radius, 255, -1)
    
    # Use TopHat on the single image with a larger kernel to detect up to 500px defects
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel)
    
    anomalies = cv2.bitwise_and(tophat, tophat, mask=mask)
    
    # Strict threshold
    _, thresh = cv2.threshold(anomalies, 40, 255, cv2.THRESH_BINARY)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, np.ones((2,2), np.uint8))
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    result = new_img.copy()
    count = 0
    for c in contours:
        area = cv2.contourArea(c)
        if 2 < area <= 500:
            x, y, bw, bh = cv2.boundingRect(c)
            # Filter defects up to a maximum size of 500x500 bounding box
            if bw <= 500 and bh <= 500:
                cv2.circle(result, (int(x+bw/2), int(y+bh/2)), max(bw,bh)+10, (0, 0, 255), 2)
                count += 1
                
    print(f"TopHat AI found {count} defects inside the dial.")
    cv2.imwrite(r"testing\new_result.jpg", result)

if __name__ == "__main__":
    main()
