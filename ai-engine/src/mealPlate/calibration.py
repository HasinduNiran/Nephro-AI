import cv2
import numpy as np

# --- CONFIGURATION ---
# Ensure your empty plate image is in the same folder
IMAGE_PATH = 'empty_plate.png' 

# Load the image
img = cv2.imread(IMAGE_PATH)

if img is None:
    print(f"Error: Could not find '{IMAGE_PATH}'. Check the filename.")
    exit()

# Force a fixed resolution (Crucial for consistent pixel counting)
img = cv2.resize(img, (1280, 720))
overlay_img = img.copy()
points = []

def click_event(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        # Record the click coordinates
        points.append((x, y))
        # Draw a small red dot at the click location
        cv2.circle(overlay_img, (x, y), 4, (0, 0, 255), -1)
        # Draw a blue line between the last two points to visualize the curve
        if len(points) > 1:
            cv2.line(overlay_img, points[-2], points[-1], (255, 0, 0), 2)
        cv2.imshow("Calibration Window", overlay_img)

# Initialize the window and mouse callback
cv2.imshow("Calibration Window", overlay_img)
cv2.setMouseCallback("Calibration Window", click_event)

print("\n--- INSTRUCTIONS ---")
print("1. Click points along the curved edges of ONE compartment (e.g., Rice section).")
print("2. Use about 15-20 points to accurately trace the curve.")
print("3. Press 'c' to Calculate the total pixel area for that section.")
print("4. Press 'r' to Reset and move to the next compartment.")
print("5. Press 'q' to Quit when finished.")

while True:
    key = cv2.waitKey(1) & 0xFF
    
    # Calculate Area
    if key == ord('c'):
        if len(points) > 2:
            mask = np.zeros(img.shape[:2], np.uint8)
            pts = np.array(points, np.int32)
            # Fill the traced shape to create a solid mask
            cv2.fillPoly(mask, [pts], 255)
            
            # Count only the white pixels (The area of the compartment)
            total_area = cv2.countNonZero(mask)
            print(f"\n[SUCCESS] Total Pixels for this section: {total_area}")
            
            # Show a preview of the captured area
            cv2.imshow("Selected Area Preview", mask)
        else:
            print("Please select at least 3 points!")

    # Reset for the next compartment
    elif key == ord('r'):
        points = []
        overlay_img = img.copy()
        cv2.imshow("Calibration Window", overlay_img)
        print("Reset successful. Start tracing the next section.")

    # Quit
    elif key == ord('q'):
        break

cv2.destroyAllWindows()