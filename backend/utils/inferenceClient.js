const axios = require("axios");

const FASTAPI_INFERENCE_URL = (process.env.FASTAPI_INFERENCE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
const FASTAPI_TIMEOUT_MS = Number.parseInt(process.env.FASTAPI_TIMEOUT_MS || "45000", 10);
const USE_FASTAPI_INFERENCE = String(process.env.USE_FASTAPI_INFERENCE || "true").toLowerCase() !== "false";

function isFastApiEnabled() {
  return USE_FASTAPI_INFERENCE;
}

async function callFastApi(path, payload, timeout = FASTAPI_TIMEOUT_MS) {
  const response = await axios.post(`${FASTAPI_INFERENCE_URL}${path}`, payload, {
    timeout,
    headers: { "Content-Type": "application/json" },
  });
  return response.data;
}

async function predictStageViaFastApi(inputData, mode) {
  if (!isFastApiEnabled()) return null;

  try {
    const body = { input_data: inputData };
    if (mode) body.mode = mode;
    const data = await callFastApi("/predict-stage", body);
    if (!data || data.success === false) return null;
    return data;
  } catch (error) {
    console.warn("FastAPI stage prediction unavailable, falling back to spawn:", error.message);
    return null;
  }
}

async function analyzeUltrasoundViaFastApi(imagePath, manualRatio = null) {
  if (!isFastApiEnabled()) return null;

  try {
    const fs = require("fs");
    let payload;
    if (fs.existsSync(imagePath)) {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64 = imageBuffer.toString("base64");
      const ext = imagePath.split(".").pop().toLowerCase();
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      payload = { image_base64: `data:${mime};base64,${base64}`, manual_ratio: manualRatio };
    } else {
      payload = { image_path: imagePath, manual_ratio: manualRatio };
    }
    const data = await callFastApi("/analyze-ultrasound", payload);
    if (!data || data.success === false) return null;
    return data;
  } catch (error) {
    console.warn("FastAPI ultrasound unavailable, falling back to spawn:", error.message);
    return null;
  }
}

async function predictRiskViaFastApi(inputData) {
  if (!isFastApiEnabled()) return null;

  try {
    const data = await callFastApi("/predict-risk", inputData);
    if (!data || data.error) return null;
    return data;
  } catch (error) {
    console.warn("FastAPI risk prediction unavailable, falling back to spawn:", error.message);
    return null;
  }
}

module.exports = {
  FASTAPI_INFERENCE_URL,
  FASTAPI_TIMEOUT_MS,
  isFastApiEnabled,
  predictStageViaFastApi,
  analyzeUltrasoundViaFastApi,
  predictRiskViaFastApi,
};
