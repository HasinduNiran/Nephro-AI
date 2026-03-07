/**
 * PlateCamera Component
 * =====================
 * Full-screen camera with the plate_overlay_camera.png displayed on top.
 * The user aligns their physical 3-compartment plate with the overlay edges,
 * ensuring consistent distance and framing every time.
 *
 * The overlay image (plate_overlay_camera.png) contains:
 *   - Cyan plate rim outline
 *   - Green compartment divider lines
 *   - Yellow centre crosshair
 *   - White compartment labels
 *   - Corner alignment brackets
 */

import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

// The overlay image generated from actual plate calibration masks
const PLATE_OVERLAY = require("../../assets/plate_overlay_camera.png");

// ── Dimension Constants ────────────────────────────────────────────
// The UI box matches the Python calibration plate exactly (1524 × 1557).
// The CameraView renders at its native 4:3 ratio to avoid black bars,
// then gets pulled upward by VERTICAL_OFFSET so its center aligns with
// the box center — mirroring the center-crop Python does on the backend.
const SCREEN_WIDTH = Dimensions.get("window").width;
const BOX_HEIGHT = Math.round(SCREEN_WIDTH * (1557 / 1524));  // ~1.0217 — calibration ratio
const CAMERA_FEED_HEIGHT = Math.round(SCREEN_WIDTH * (4 / 3)); // native 4:3 feed, no black bars
const VERTICAL_OFFSET = (CAMERA_FEED_HEIGHT - BOX_HEIGHT) / 2; // pixels to pull feed upward

// ─── Main Component ─────────────────────────────────────────────────
const PlateCamera = ({ visible, onCapture, onClose }) => {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [facing, setFacing] = useState("back");

  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
  }, [visible]);

  if (!visible) return null;

  // --- Permission handling ---
  if (!permission) {
    return (
      <Modal visible animationType="fade" statusBarTranslucent>
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.permissionText}>
            Requesting camera permission…
          </Text>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible animationType="fade" statusBarTranslucent>
        <View style={styles.container}>
          <Ionicons name="camera-off-outline" size={60} color="#fff" />
          <Text style={styles.permissionText}>
            Camera permission is required
          </Text>
          <TouchableOpacity
            style={styles.permissionBtn}
            onPress={requestPermission}
          >
            <Text style={styles.permissionBtnText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // --- Capture ---
  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (photo?.uri) onCapture(photo.uri);
    } catch (err) {
      console.error("Capture error:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {/* ---- TOP BAR ---- */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.topTitle}>Plate Scanner</Text>

          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          >
            <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ---- CAMERA AREA ---- */}
        <View style={styles.cameraSection}>
          {/*
            BOX is shaped to 1524×1557 (calibration ratio).
            CameraView renders at 4:3 and is pulled up by VERTICAL_OFFSET
            so its optical centre aligns with the box centre —
            identical to the Python centre-crop on the backend.
            overflow:hidden in cameraBox clips the excess top and bottom.
          */}
          <View style={[styles.cameraBox, { width: SCREEN_WIDTH, height: BOX_HEIGHT }]}>
            {/* Camera feed: full 4:3, floated so its centre matches the box centre */}
            <CameraView
              ref={cameraRef}
              style={{
                position: "absolute",
                width: SCREEN_WIDTH,
                height: CAMERA_FEED_HEIGHT,
                top: -VERTICAL_OFFSET,
                left: 0,
              }}
              facing={facing}
              ratio="4:3"
            />

            {/* Overlay: stretched pixel-perfect to the 1524×1557 box */}
            <Image
              source={PLATE_OVERLAY}
              style={{
                position: "absolute",
                width: SCREEN_WIDTH,
                height: BOX_HEIGHT,
                top: 0,
                left: 0,
              }}
              resizeMode="stretch"
              pointerEvents="none"
            />
          </View>

          {/* Alignment tip */}
          <Text style={styles.alignText}>
            Align your plate with the overlay
          </Text>
        </View>

        {/* ---- BOTTOM CONTROLS ---- */}
        <View style={styles.bottomBar}>
          <Text style={styles.instructionText}>
            Hold phone directly above the plate{"\n"}Align plate edges with the
            overlay outline
          </Text>

          <TouchableOpacity
            style={[styles.captureBtn, isCapturing && styles.capturingBtn]}
            onPress={handleCapture}
            disabled={isCapturing}
            activeOpacity={0.7}
          >
            {isCapturing ? (
              <ActivityIndicator size="small" color="#007BFF" />
            ) : (
              <View style={styles.captureInner} />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "space-between",
  },

  /* --- Contained camera + overlay layout --- */
  cameraSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBox: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 2,
    borderColor: "rgba(0,255,221,0.35)",
  },

  alignText: {
    marginTop: 12,
    color: "#00FFDD",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.5,
  },

  /* --- Top bar (in normal flow) --- */
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 54 : 36,
    paddingBottom: 10,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },

  /* --- Bottom bar (in normal flow) --- */
  bottomBar: {
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    paddingTop: 8,
  },
  instructionText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 20,
    paddingHorizontal: 30,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  capturingBtn: {
    borderColor: "#007BFF",
    backgroundColor: "rgba(0,123,255,0.2)",
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  cancelText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
    paddingVertical: 8,
    textShadowColor: "#000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  /* --- Permission states --- */
  permissionText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 15,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  permissionBtn: {
    marginTop: 20,
    backgroundColor: "#007BFF",
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});

export default PlateCamera;
