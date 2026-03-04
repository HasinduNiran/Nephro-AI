import cv2
import numpy as np

# --- CONFIGURATION ---
IMAGE_PATH = 'empty_plate.png' 
TARGET_WIDTH = 1524
TARGET_HEIGHT = 1557

# Load the image
img = cv2.imread(IMAGE_PATH)

if img is None:
    print(f"Error: Could not find '{IMAGE_PATH}'. Check the filename.")
    exit()

# Force the exact fixed resolution
img = cv2.resize(img, (TARGET_WIDTH, TARGET_HEIGHT))
overlay_img = img.copy()
points = []

def click_event(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        # Even if the window is visually small, (x, y) are relative to 1524x1557
        points.append((x, y))
        
        # Draw on the high-res image
        cv2.circle(overlay_img, (x, y), 5, (0, 0, 255), -1)
        if len(points) > 1:
            cv2.line(overlay_img, points[-2], points[-1], (255, 0, 0), 2)
        
        cv2.imshow("Calibration Window", overlay_img)

# --- WINDOW SETUP ---
# WINDOW_NORMAL allows the window to be resized by the user or code
cv2.namedWindow("Calibration Window", cv2.WINDOW_NORMAL)

# This resizes the VIEWPORT, not the IMAGE. 
# It makes the 1557px height fit on a standard 1080p monitor.
cv2.resizeWindow("Calibration Window", 800, 800) 

cv2.imshow("Calibration Window", overlay_img)
cv2.setMouseCallback("Calibration Window", click_event)

print("\n--- INSTRUCTIONS ---")
print(f"Current Image Resolution: {TARGET_WIDTH}x{TARGET_HEIGHT}")
print("1. Click points along the curved edges of ONE compartment.")
print("2. Press 'c' to Calculate the total pixel area (based on full resolution).")
print("3. Press 'r' to Reset and move to the next compartment.")
print("4. Press 'q' to Quit.")

while True:
    key = cv2.waitKey(1) & 0xFF
    
    if key == ord('c'):
        if len(points) > 2:
            # Create mask at the FULL resolution
            mask = np.zeros((TARGET_HEIGHT, TARGET_WIDTH), np.uint8)
            pts = np.array(points, np.int32)
            cv2.fillPoly(mask, [pts], 255)
            
            total_area = cv2.countNonZero(mask)
            print(f"\n[SUCCESS] Area: {total_area} pixels (at {TARGET_WIDTH}x{TARGET_HEIGHT})")
            
            # Show preview (also resizable)
            cv2.namedWindow("Selected Area Preview", cv2.WINDOW_NORMAL)
            cv2.resizeWindow("Selected Area Preview", 400, 400)
            cv2.imshow("Selected Area Preview", mask)
        else:
            print("Please select at least 3 points!")

    elif key == ord('r'):
        points = []
        overlay_img = img.copy()
        cv2.imshow("Calibration Window", overlay_img)
        print("Reset successful.")

    elif key == ord('q'):
        break

cv2.destroyAllWindows()