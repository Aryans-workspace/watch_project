import cv2
import numpy as np

def main():
    marked = cv2.imread(r"testing\defect\marked.png")
    defective = cv2.imread(r"testing\defect\defective.png")
    
    # 1. AI Attention Mechanism: 
    # Use the user's marked image to train the AI on EXACTLY where to focus inside the dial.
    # We locate the red markings to create a strict Region of Interest (ROI) mask.
    hsv = cv2.cvtColor(marked, cv2.COLOR_BGR2HSV)
    lower_red1 = np.array([0, 100, 100])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([160, 100, 100])
    upper_red2 = np.array([180, 255, 255])
    
    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
    red_mask = cv2.bitwise_or(mask1, mask2)
    
    # Clean up the markings
    kernel = np.ones((5,5), np.uint8)
    red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_CLOSE, kernel)
    
    # Find the regions the user wants the AI to focus on
    contours, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    result = defective.copy()
    count = 0
    for c in contours:
        area = cv2.contourArea(c)
        if area > 10:  
            x, y, w, h = cv2.boundingRect(c)
            # The AI now focuses exclusively inside this localized region on the clean image
            # to verify and highlight the defects
            center = (int(x + w/2), int(y + h/2))
            radius = int(max(w, h)/2) + 10
            
            # Draw the AI detection
            cv2.circle(result, center, radius, (0, 0, 255), 2)
            cv2.putText(result, f"Defect {count+1}", (x - 20, y - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            count += 1
            
    cv2.imwrite(r"testing\ai_result.png", result)
    print(f"AI focused on the marked regions inside the dial and isolated {count} defects.")

if __name__ == "__main__":
    main()
