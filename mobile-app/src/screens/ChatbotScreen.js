import React, { useState, useEffect, useRef, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Easing,
  Linking,
  Keyboard, // Import Keyboard for handling keyboard events
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";

import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy"; // SDK 54: writeAsStringAsync moved to legacy path
import axios from "axios";
import * as Haptics from "expo-haptics";
import Markdown from "react-native-markdown-display";
import { WebView } from "react-native-webview";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

// 👇 [NEW] Import Speech Library
import * as Speech from "expo-speech";
import { Buffer } from "buffer"; // Reliable base64 conversion in React Native
import { CHATBOT_URL } from "../api/axiosConfig";

// Use centralized URL from axiosConfig
const BACKEND_URL = CHATBOT_URL;

// Session-scoped language preference — survives navigation but resets on app close
let _sessionLanguage = null;

// Custom base64 decode for React Native (atob polyfill)
const base64Decode = (str) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";

  str = String(str).replace(/=+$/, "");

  if (str.length % 4 === 1) {
    throw new Error(
      "'atob' failed: The string to be decoded is not correctly encoded.",
    );
  }

  for (
    let bc = 0, bs, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }

  // UTF-8 decode without using deprecated escape()
  try {
    // Convert the string to a byte array
    const bytes = [];
    for (let i = 0; i < output.length; i++) {
      bytes.push(output.charCodeAt(i));
    }

    // Decode UTF-8
    let result = "";
    let i = 0;
    while (i < bytes.length) {
      const c = bytes[i];
      if (c < 128) {
        result += String.fromCharCode(c);
        i++;
      } else if (c > 191 && c < 224) {
        result += String.fromCharCode(((c & 31) << 6) | (bytes[i + 1] & 63));
        i += 2;
      } else {
        result += String.fromCharCode(
          ((c & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63),
        );
        i += 3;
      }
    }
    return result;
  } catch (e) {
    // Fallback to simple output if UTF-8 decoding fails
    return output;
  }
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const COLORS = {
  primary: "#2E86DE", // Professional Blue
  primaryDark: "#1E5BA8", // Darker Blue for gradients
  primaryLight: "#E3F2FD",
  secondary: "#6C5CE7", // Purple accent
  accent: "#10AC84", // Calming Green (Success)
  accentLight: "#D4F1E8", // Light green background
  danger: "#EE5253", // Soft Red (Error/Recording)
  warning: "#FFA502", // Orange for warnings
  background: "#F7F9FC", // Very light grey-blue
  card: "#FFFFFF",
  cardBorder: "#EFF2F7", // Subtle border
  textDark: "#2D3436",
  textMedium: "#4A5568", // Medium grey for secondary text
  textLight: "#636E72",
  textLighter: "#A0AEC0", // Even lighter for timestamps
  white: "#FFFFFF",
  overlay: "rgba(0,0,0,0.5)",
};

const THREE_BODY_LOADER_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    display: flex; justify-content: flex-start; align-items: center;
    background-color: transparent; overflow: hidden;
  }
  .three-body {
    --uib-size: 30px;
    --uib-speed: 0.8s;
    --uib-color: #2E86DE;
    position: relative;
    display: inline-block;
    height: var(--uib-size);
    width: var(--uib-size);
    animation: spin78236 calc(var(--uib-speed) * 2.5) infinite linear;
  }
  .three-body__dot { position: absolute; height: 100%; width: 30%; }
  .three-body__dot:after {
    content: ''; position: absolute; height: 0%; width: 100%;
    padding-bottom: 100%; background-color: var(--uib-color); border-radius: 50%;
  }
  .three-body__dot:nth-child(1) { bottom: 5%; left: 0; transform: rotate(60deg); transform-origin: 50% 85%; }
  .three-body__dot:nth-child(1)::after { bottom: 0; left: 0; animation: wobble1 var(--uib-speed) infinite ease-in-out; animation-delay: calc(var(--uib-speed) * -0.3); }
  .three-body__dot:nth-child(2) { bottom: 5%; right: 0; transform: rotate(-60deg); transform-origin: 50% 85%; }
  .three-body__dot:nth-child(2)::after { bottom: 0; left: 0; animation: wobble1 var(--uib-speed) infinite calc(var(--uib-speed) * -0.15) ease-in-out; }
  .three-body__dot:nth-child(3) { bottom: -5%; left: 0; transform: translateX(116.666%); }
  .three-body__dot:nth-child(3)::after { top: 0; left: 0; animation: wobble2 var(--uib-speed) infinite ease-in-out; }
  @keyframes spin78236 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  @keyframes wobble1 { 0%, 100% { transform: translateY(0%) scale(1); opacity: 1; } 50% { transform: translateY(-66%) scale(0.65); opacity: 0.8; } }
  @keyframes wobble2 { 0%, 100% { transform: translateY(0%) scale(1); opacity: 1; } 50% { transform: translateY(66%) scale(0.65); opacity: 0.8; } }
</style>
</head>
<body>
  <div class="three-body">
    <div class="three-body__dot"></div>
    <div class="three-body__dot"></div>
    <div class="three-body__dot"></div>
  </div>
</body>
</html>
`;

const ChatbotScreen = ({ route, navigation }) => {
  const { userID, userName } = route.params || {}; // Validate params exist

  // Chat storage key unique to each user
  const CHAT_STORAGE_KEY = `chat_messages_${userID || "guest"}`;

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [attachedDoc, setAttachedDoc] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Explicit user language preference — "sinhala" or "english"
  // null means the modal hasn't been answered yet
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Default welcome message
  const welcomeMessage = {
    id: "1",
    text: "Hello! 👋 I'm your **Nephro-AI** assistant. I'm here to help you with kidney health.",
    sender: "bot",
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  // Load messages from AsyncStorage on mount
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const savedMessages = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
        if (savedMessages) {
          const parsedMessages = JSON.parse(savedMessages);
          setMessages(parsedMessages);
          console.log(
            `📥 Loaded ${parsedMessages.length} messages from storage`,
          );
        } else {
          // First time - show welcome message
          setMessages([welcomeMessage]);
        }
      } catch (error) {
        console.error("Error loading chat messages:", error);
        setMessages([welcomeMessage]);
      } finally {
        setIsInitialized(true);
      }
    };
    loadMessages();
  }, [userID]);

  // Save messages to AsyncStorage whenever they change
  useEffect(() => {
    const saveMessages = async () => {
      if (isInitialized && messages.length > 0) {
        try {
          await AsyncStorage.setItem(
            CHAT_STORAGE_KEY,
            JSON.stringify(messages),
          );
          console.log(`💾 Saved ${messages.length} messages to storage`);
        } catch (error) {
          console.error("Error saving chat messages:", error);
        }
      }
    };
    saveMessages();
  }, [messages, isInitialized]);

  // Show language modal once per app session; skip if already chosen this session
  useEffect(() => {
    if (_sessionLanguage) {
      setSelectedLanguage(_sessionLanguage);
    } else {
      setShowLanguageModal(true);
    }
  }, []);

  const selectLanguage = (lang) => {
    _sessionLanguage = lang;
    setSelectedLanguage(lang);
    setShowLanguageModal(false);
  };

  // Debug log - Run only once on mount
  useEffect(() => {
    console.log("Chatbot Initialized for:", { userID, userName });
  }, []);

  // Clear chat history function
  const clearChatHistory = useCallback(() => {
    Alert.alert(
      "Clear Chat",
      "Are you sure you want to clear all chat messages?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              // Clear local storage
              await AsyncStorage.removeItem(CHAT_STORAGE_KEY);
              setMessages([welcomeMessage]);

              // Clear backend cache for this patient (prevents stale cached responses)
              try {
                await axios.post(`${BACKEND_URL}/chat/clear`, {
                  text: "clear",
                  patient_id: userID || "default_patient",
                });
                console.log("🗑️ Chat history & backend cache cleared");
              } catch (backendError) {
                console.warn(
                  "Backend cache clear failed (non-critical):",
                  backendError.message,
                );
              }
            } catch (error) {
              console.error("Error clearing chat:", error);
            }
          },
        },
      ],
    );
  }, [CHAT_STORAGE_KEY, welcomeMessage, userID]);

  const showAttachOptions = () => {
    Alert.alert(
      "Attach Medical Document",
      "Select a file or take a photo of your lab report",
      [
        { text: "📁 Choose File (PDF/Image)", onPress: pickDocument },
        { text: "📷 Take Photo", onPress: capturePhoto },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const capturePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is required to photograph lab reports.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const file = {
        uri: asset.uri,
        name: `lab_report_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
      };
      setAttachedDoc(file);
      await uploadDocument(file);
    }
  };

  // Handle document upload logic
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      setAttachedDoc(file);
      await uploadDocument(file);
    } catch (err) {
      console.error("Error picking document:", err);
      Alert.alert("Error", "Could not pick document.");
    }
  };

  const uploadDocument = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);
    setLoadingType("text");
    setIsLoading(true);
    setLoadingStep({ text: "Reading your report...", icon: "cloud-upload" });

    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || "application/pdf",
    });
    formData.append("patient_id", userID || "default_patient");

    try {
      const response = await axios.post(
        `${BACKEND_URL}/chat/upload_context`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            if (e.total) setUploadProgress(e.loaded / e.total);
          },
        }
      );
      console.log("Upload success:", response.data);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: `📄 Attached: ${file.name}\n\n*I will use this document as context for your next questions.*`,
          sender: "bot",
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    } catch (err) {
      console.error("Upload error:", err);
      Alert.alert("Upload Failed", "Could not upload the document.");
      setAttachedDoc(null);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setIsLoading(false);
    }
  };

  const removeDocument = async () => {
    try {
      await axios.post(`${BACKEND_URL}/chat/remove_document`, {
        patient_id: userID || "default_patient",
      });
      console.log("Document removed, chat history preserved");
      setAttachedDoc(null);
    } catch (err) {
      console.warn("Failed to remove document:", err);
      Alert.alert("Error", "Could not remove document context from server.");
    }
  };

  // Keyboard listener to scroll to end when keyboard opens
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      },
    );

    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Replaced loadingText string with loadingStep object and loadingType
  const [loadingStep, setLoadingStep] = useState({
    text: "Processing...",
    icon: "dots-horizontal",
  });
  const [loadingType, setLoadingType] = useState("text"); // 'audio' or 'text'
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [sound, setSound] = useState(null);
  const [metering, setMetering] = useState(-160);
  const [inputFocused, setInputFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const soundRef = useRef(null);
  const fetchAbortRef = useRef(null); // AbortController for in-flight Sinhala TTS fetch
  const flatListRef = useRef();

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dotAnim1 = useRef(new Animated.Value(0)).current;
  const dotAnim2 = useRef(new Animated.Value(0)).current;
  const dotAnim3 = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const typingDots = useRef(new Animated.Value(0)).current;

  const markdownStyles = {
    body: { color: COLORS.textDark, fontSize: 17, lineHeight: 26, letterSpacing: 0.2 },
    bullet_list: { marginTop: 5, marginBottom: 5 },
    strong: { fontWeight: "700", color: COLORS.primaryDark },
    paragraph: { marginBottom: 8 },
    link: { color: COLORS.primary },
  };

  // Helper: cancel in-flight Sinhala fetch and stop all audio
  const stopAllAudio = async () => {
    // Cancel any pending Sinhala TTS network request
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }
    // Stop English expo-speech
    Speech.stop();
    // Stop Sinhala expo-av
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {
        /* ignore cleanup errors */
      }
      soundRef.current = null;
    }
  };

  /**
   * Parse a length-framed binary response from /chat/tts/stream.
   * Frame format per segment: [4-byte big-endian uint32 length][MP3 bytes]
   * Returns an array of ArrayBuffers, one per sentence.
   */
  const parseStreamedSegments = (arrayBuffer) => {
    const segments = [];
    const view = new DataView(arrayBuffer);
    let offset = 0;
    while (offset + 4 <= arrayBuffer.byteLength) {
      const length = view.getUint32(offset, false); // big-endian
      offset += 4;
      if (length === 0 || offset + length > arrayBuffer.byteLength) break;
      segments.push(arrayBuffer.slice(offset, offset + length));
      offset += length;
    }
    return segments;
  };

  // Server-side TTS playback (Gemini TTS for Sinhala, expo-speech for English)
  // urgencyFlags: array of {flag, term, ...} from the message — used to trigger
  // the pre-cached emergency phrase as the very first audio segment.
  const playServerTTS = async (text, messageId, urgencyFlags = []) => {
    // ── TOGGLE-OFF: user tapped the button that is already playing/loading ──
    // Check this FIRST before any async work so we can abort fetches mid-flight.
    if (currentlyPlayingId === messageId) {
      await stopAllAudio();
      setCurrentlyPlayingId(null);
      setIsTTSLoading(false);
      return; // This is the pure "Stop" action — do NOT restart
    }

    // ── SWITCH: something else was playing — stop it before starting new ──
    await stopAllAudio();
    setCurrentlyPlayingId(null);

    if (!text) return;

    const cleanText = text.replace(/[*#]/g, "").replace(/\[MAPS:.*?\]/g, "");

    // Use explicit user language preference \u2014 zero detection latency, 100% accuracy
    const isSinhala = (selectedLanguage || "auto") === "sinhala" ||
      ((selectedLanguage || "auto") === "auto" && (text.match(/[\u0D80-\u0DFF]/g) || []).length > 0);
    console.log(
      `[TTS] Language | preference=${selectedLanguage} | isSinhala=${isSinhala} | engine=${isSinhala ? "GEMINI SERVER" : "LOCAL expo-speech"}`,
    );

    // For English, use local expo-speech (fast, good quality)
    if (!isSinhala) {
      console.log("[TTS] ▶ LOCAL English voice (expo-speech en-US)");
      setCurrentlyPlayingId(messageId);
      Speech.speak(cleanText, {
        language: "en-US",
        pitch: 1.0,
        rate: 1.0,
        onDone: () => setCurrentlyPlayingId(null),
        onStopped: () => setCurrentlyPlayingId(null),
        onError: () => setCurrentlyPlayingId(null),
      });
      return;
    }

    // For Sinhala, use the streaming endpoint (/chat/tts/stream) which generates
    // each sentence in parallel on the server — then plays segments sequentially.
    // Falls back to /chat/tts (full-text) if the stream endpoint fails.
    console.log(
      `[TTS] ▶ STREAM Gemini voice | endpoint: ${BACKEND_URL}/chat/tts/stream`,
    );
    setIsTTSLoading(true);
    setCurrentlyPlayingId(messageId);

    // AbortController for the fetch phase
    const abortController = new AbortController();
    fetchAbortRef.current = abortController;

    try {
      // Reconfigure Audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // ── 0. LAYER 2 CACHE CHECK: Play from phone storage if already downloaded ──
      let tempFiles = [];
      let usedMobileCache = false;
      let usedStreamEndpoint = false;
      const _seg0Uri = FileSystem.cacheDirectory + `tts_${messageId}_seg0.wav`;
      if ((await FileSystem.getInfoAsync(_seg0Uri)).exists) {
        let _si = 0;
        while (true) {
          const _su =
            FileSystem.cacheDirectory + `tts_${messageId}_seg${_si}.wav`;
          const _sf = await FileSystem.getInfoAsync(_su);
          if (_sf.exists) {
            tempFiles.push(_su);
            _si++;
          } else {
            break;
          }
        }
        usedMobileCache = tempFiles.length > 0;
        if (usedMobileCache)
          console.log(
            `[TTS] ⚡ Mobile Cache Hit! Playing locally saved segments for message ${messageId}`,
          );
      }

      if (!usedMobileCache) {
        // ── 1. Try fast /chat/tts/stream endpoint ──────────────────────────
        let segments = null;
        try {
          console.log(
            "[TTS] Trying /chat/tts/stream (parallel sentence generation)...",
          );
          const streamResponse = await fetch(`${BACKEND_URL}/chat/tts/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, urgency_flags: urgencyFlags, language: selectedLanguage || "auto" }),
            signal: abortController.signal,
          });
          if (fetchAbortRef.current === abortController)
            fetchAbortRef.current = null;

          console.log(`[TTS] Stream response: HTTP ${streamResponse.status}`);
          if (streamResponse.ok) {
            const streamBuffer = await streamResponse.arrayBuffer();
            segments = parseStreamedSegments(streamBuffer);
            console.log(
              `[TTS] Parsed ${segments.length} segment(s) from stream | total=${streamBuffer.byteLength} bytes`,
            );
            usedStreamEndpoint = segments.length > 0;
          }
        } catch (streamErr) {
          if (streamErr.name === "AbortError") throw streamErr; // propagate user-stop
          console.warn(
            `[TTS] /chat/tts/stream failed — falling back. Reason: ${streamErr.message}`,
          );
        }

        // ── 2. Fallback to /chat/tts (single full-text request) ───────────
        if (!segments || segments.length === 0) {
          console.log(`[TTS] Fallback → ${BACKEND_URL}/chat/tts`);
          const fallbackController = new AbortController();
          fetchAbortRef.current = fallbackController;
          const response = await fetch(`${BACKEND_URL}/chat/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, language: selectedLanguage || "auto" }),
            signal: fallbackController.signal,
          });
          if (fetchAbortRef.current === fallbackController)
            fetchAbortRef.current = null;

          console.log(`[TTS] Fallback response: HTTP ${response.status}`);
          if (!response.ok)
            throw new Error(`TTS server error: ${response.status}`);

          const arrayBuffer = await response.arrayBuffer();
          if (!arrayBuffer.byteLength)
            throw new Error("TTS server returned empty audio");
          console.log(
            `[TTS] Fallback buffer | byteLength=${arrayBuffer.byteLength}`,
          );
          segments = [arrayBuffer]; // treat the whole MP3 as one segment
        }

        // ── 3. Write all segment files up-front ───────────────────────────
        for (let i = 0; i < segments.length; i++) {
          const segBase64 = Buffer.from(segments[i]).toString("base64");

          // Use .wav for Gemini (Sinhala) — zero-transcoding WAV delivery
          // Use .mp3 for Edge-TTS (English) — already MP3 from edge_tts
          const fileExtension = isSinhala ? "wav" : "mp3";
          const segUri =
            FileSystem.cacheDirectory +
            `tts_${messageId}_seg${i}.${fileExtension}`;

          await FileSystem.writeAsStringAsync(segUri, segBase64, {
            encoding: "base64",
          });
          tempFiles.push(segUri);
        }
        console.log(`[TTS] Wrote ${tempFiles.length} segment file(s)`);
      } // end if (!usedMobileCache)

      // ── 4. Sequential playback with stop-anywhere cancellation ───────────
      // We replace fetchAbortRef with a synthetic object whose .abort() cancels
      // the segment chain — so stopAllAudio() works during playback too.
      const sessionToken = { active: true };
      const syntheticAbort = {
        abort: () => {
          sessionToken.active = false;
        },
      };
      fetchAbortRef.current = syntheticAbort;

      const cleanupSegments = () => {
        if (fetchAbortRef.current === syntheticAbort)
          fetchAbortRef.current = null;
        setCurrentlyPlayingId(null);
        Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        }).catch(() => {});
      };

      const playSegment = async (index) => {
        if (!sessionToken.active || index >= tempFiles.length) {
          if (index >= tempFiles.length) {
            console.log("[TTS] ✅ All segments finished playing");
          }
          cleanupSegments();
          return;
        }
        // Unload previous segment sound object
        if (soundRef.current) {
          try {
            await soundRef.current.unloadAsync();
          } catch (e) {
            /* ignore */
          }
          soundRef.current = null;
        }
        // Guard: user may have tapped stop during the unloadAsync above
        if (!sessionToken.active) {
          cleanupSegments();
          return;
        }
        console.log(
          `[TTS] ▶ Segment ${index + 1}/${tempFiles.length}: ${tempFiles[index]}`,
        );
        const { sound } = await Audio.Sound.createAsync(
          { uri: tempFiles[index] },
          { shouldPlay: false },
        );
        // Guard: user may have tapped stop while createAsync was running
        if (!sessionToken.active) {
          try {
            await sound.unloadAsync();
          } catch (e) {
            /* ignore */
          }
          cleanupSegments();
          return;
        }
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) {
            playSegment(index + 1);
          }
        });
        await sound.playAsync();
      };

      setIsTTSLoading(false);
      console.log(
        `[TTS] ✅ ${usedMobileCache ? "Mobile cache" : usedStreamEndpoint ? "Gemini stream" : "Gemini fallback"} — starting playback`,
      );
      await playSegment(0);
    } catch (error) {
      // AbortError means the user intentionally stopped — exit silently
      if (error.name === "AbortError") {
        console.log("[TTS] Fetch aborted by user (Stop button)");
        setCurrentlyPlayingId(null);
        setIsTTSLoading(false);
        return;
      }
      console.error(
        `[TTS] ❌ Gemini pipeline failed | ${error.name}: ${error.message}`,
      );
      console.warn("[TTS] ⚠ FALLBACK → local si-LK voice (Thilini)");
      Speech.stop();
      Speech.speak(cleanText, { language: "si-LK", pitch: 1.0, rate: 0.9 });
      setCurrentlyPlayingId(null);
    } finally {
      setIsTTSLoading(false);
      // Safety-clear — only if still pointing at the original controller
      if (fetchAbortRef.current === abortController) {
        fetchAbortRef.current = null;
      }
    }
  };

  // Pulse animation for recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Dynamic Thinking Text Animation
  useEffect(() => {
    let interval;
    if (isLoading) {
      // 🎙️ Sequence for Voice Input
      const audioSteps = [
        { text: "Listening to audio...", icon: "ear-hearing" }, // Ear Icon
        { text: "Translating Sinhala...", icon: "translate" }, // Translate Icon
        { text: "Analyzing symptoms...", icon: "brain" }, // Brain Icon
        { text: "Checking safety...", icon: "shield-check" }, // Shield Icon
        { text: "Formulating advice...", icon: "doctor" }, // Doctor Icon
      ];

      // ⌨️ Sequence for Text Input
      const textSteps = [
        { text: "Reading message...", icon: "email-open" }, // Email/Read Icon
        { text: "Analyzing symptoms...", icon: "brain" }, // Brain Icon
        { text: "Consulting database...", icon: "database-search" }, // Database Icon
        { text: "Checking safety...", icon: "shield-check" }, // Shield Icon
        { text: "Typing response...", icon: "keyboard" }, // Keyboard Icon
      ];

      // 2. Select the correct list based on input type
      const steps = loadingType === "audio" ? audioSteps : textSteps;

      let i = 0;
      setLoadingStep(steps[0]);
      setLoadingStepIndex(0);

      interval = setInterval(() => {
        i = (i + 1) % steps.length;
        setLoadingStep(steps[i]);
        setLoadingStepIndex(i);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isLoading, loadingType]);

  // 1. Permission & Audio Setup
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Microphone access is required for voice chat.",
        );
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    })();
  }, []);

  // Cleanup sound on component unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
      Speech.stop();
    };
  }, []);

  // Typing indicator animation
  useEffect(() => {
    if (isTyping) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(typingDots, {
            toValue: 1,
            duration: 600,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(typingDots, {
            toValue: 0,
            duration: 600,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      typingDots.setValue(0);
    }
  }, [isTyping]);

  const updateMetering = (status) => {
    if (status.isRecording) {
      setMetering(status.metering || -160);
    }
  };

  // 2. Start Recording
  const startRecording = async () => {
    try {
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      // Stop any current speaking when recording starts
      Speech.stop();

      // Also stop any server TTS playback
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (e) {
          /* ignore */
        }
        soundRef.current = null;
        setCurrentlyPlayingId(null);
      }

      console.log("Starting recording..");
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => updateMetering(status),
      );

      await recording.setProgressUpdateInterval(100);

      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  // 3. Stop Recording & Send to Server
  const stopRecording = async () => {
    console.log("Stopping recording..");
    setRecording(undefined);
    setIsRecording(false);

    if (!recording) return;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    console.log("Recording stored at", uri);

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    await sendAudioToBackend(uri);
  };

  // 4. API Logic: Upload Audio (UPDATED for Client-Side TTS)
  const sendAudioToBackend = async (uri) => {
    setIsLoading(true);
    setLoadingType("audio"); // Set type for animation
    setIsTyping(true);

    const formData = new FormData();
    formData.append("file", {
      uri: uri,
      type: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
      name: "voice_input.m4a",
    });
    formData.append("patient_id", userID || "default_patient");
    formData.append("language", selectedLanguage || "auto");

    const userMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        text: "🎤 Voice Message",
        sender: "user",
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);

    try {
      console.log("Uploading audio to:", `${BACKEND_URL}/chat/audio`);
      console.log("Patient ID:", userID || "default_patient");

      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch(`${BACKEND_URL}/chat/audio`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server Error: ${response.status}`);
      }

      // Read headers for the text response
      const b64ResponseText = response.headers.get("x-response-b64");
      const b64Sources = response.headers.get("x-sources-b64");
      const b64Transcription = response.headers.get("x-transcription-b64");

      let responseText = "Audio Response";
      let sourcesText = "";
      let transcribedText = "\uD83C\uDFA4 Voice Message";

      try {
        if (b64ResponseText) {
          responseText = base64Decode(b64ResponseText);
        }
        if (b64Sources) {
          sourcesText = base64Decode(b64Sources);
        }
        if (b64Transcription) {
          transcribedText = base64Decode(b64Transcription);
        }
      } catch (e) {
        console.log("Error decoding headers", e);
        // Fallback: try to use the base64 string directly
        if (b64ResponseText) responseText = b64ResponseText;
        if (b64Sources) sourcesText = b64Sources;
        if (b64Transcription) transcribedText = b64Transcription;
      }

      // Update voice message bubble with the actual transcribed text
      setMessages((prev) =>
        prev.map((m) => (m.id === userMsgId ? { ...m, text: transcribedText } : m))
      );

      // Use explicit language preference for audio routing \u2014 no detection needed
      const isSinhala = (selectedLanguage || "auto") === "sinhala" ||
        ((selectedLanguage || "auto") === "auto" && /[\u0D80-\u0DFF]/.test(responseText));
      if (isSinhala) {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });

          const audioBlob = await response.blob();
          const reader = new FileReader();
          const base64Audio = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });

          // Gemini TTS returns WAV for Sinhala \u2014 use .wav extension so the decoder
          // correctly identifies the format instead of misreading it as MP3.
          const fileUri =
            FileSystem.cacheDirectory + `voice_response_${Date.now()}.wav`;
          await FileSystem.writeAsStringAsync(fileUri, base64Audio, {
            encoding: "base64", // string literal avoids EncodingType enum resolution bug
          });

          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: fileUri },
            { shouldPlay: true },
          );

          newSound.setOnPlaybackStatusUpdate((status) => {
            if (status.didJustFinish) {
              newSound.unloadAsync();
              FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(
                () => {},
              );
              Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
              }).catch(() => {});
            }
          });
        } catch (audioError) {
          console.error(
            "Audio playback failed, falling back to Speech:",
            audioError,
          );
          Speech.speak(responseText.replace(/[*#]/g, ""), {
            language: "si-LK",
            rate: 0.9,
          });
        }
      } else {
        // English: use local Speech (fast, good quality)
        const cleanText = responseText
          .replace(/[*#]/g, "")
          .replace(/\[MAPS:.*?\]/g, "");
        Speech.speak(cleanText, {
          language: "en-US",
          pitch: 1.0,
          rate: 1.0,
        });
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: responseText,
          sender: "bot",
          sources: sourcesText,
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert(
        "Error",
        "Could not connect to chatbot server. Please check your connection.",
      );

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          text: "⚠️ Unable to process your request. Please try again.",
          sender: "bot",
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  // Text Chat Implementation (UPDATED for Client-Side TTS)
  const sendTextMessage = async (textToSend) => {
    const text = textToSend?.text || textToSend || message;
    if (!text.trim()) return;

    if (!textToSend) setMessage(""); // Clear input if typed

    // 🛑 REMOVE or COMMENT OUT this line (Don't speak when user is typing)
    // Speech.stop();

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: text,
        sender: "user",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setIsLoading(true);
    setLoadingType("text"); // Set type for animation
    setIsTyping(true);

    try {
      const res = await axios.post(`${BACKEND_URL}/chat/text`, {
        text: text,
        patient_id: userID || "default_patient",
        language: selectedLanguage || "auto",
      });

      const botReply = res.data.response;

      // 🛑 COMMENT OUT THIS LINE (This stops Auto-Play for Text)
      // speakResponse(botReply);

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: botReply,
          sender: "bot",
          sources:
            res.data.sources && res.data.sources.length > 0
              ? res.data.sources.map((s) => s.source).join(", ")
              : "",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          // 🆕 Urgency flags from NLG engine (Angle 4: Empathy & Urgency Router)
          urgencyFlags: res.data.urgency_flags || [],
        },
      ]);
    } catch (error) {
      console.error("Text API Error", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          text: "⚠️ Sorry, I couldn't process your request. Please try again.",
          sender: "bot",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const renderItem = ({ item }) => {
    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: item.sender === "user" ? "flex-end" : "flex-start",
          marginBottom: 16,
          paddingHorizontal: 4,
        }}
      >
        {item.sender === "bot" && (
          <View
            style={[
              styles.avatarContainer,
              { backgroundColor: COLORS.primary },
            ]}
          >
            <FontAwesome5 name="heartbeat" size={15} color="white" />
          </View>
        )}

        <View style={{ maxWidth: "88%", flex: 1 }}>
          <View
            style={[
              styles.messageBubble,
              item.sender === "user" ? styles.userBubble : styles.botBubble,
              item.isError && styles.errorBubble,
              item.urgencyFlags?.some((f) => f.flag === "CRITICAL_URGENCY") &&
                styles.criticalBubble,
              item.urgencyFlags?.some(
                (f) =>
                  f.flag === "SYMPTOM_WARNING" ||
                  f.flag === "NEPHROTOXIN_WARNING",
              ) &&
                !item.urgencyFlags?.some(
                  (f) => f.flag === "CRITICAL_URGENCY",
                ) &&
                styles.warningBubble,
            ]}
          >
            {item.sender === "user" ? (
              <Text style={styles.userText}>{item.text}</Text>
            ) : (
              <View>
                {(() => {
                  const mapTagMatch = item.text.match(/\[MAPS: (.*?)\]/);
                  const locationQuery = mapTagMatch ? mapTagMatch[1] : null;
                  const displayText = item.text
                    .replace(/\[MAPS:.*?\]/g, "")
                    .trim();

                  return (
                    <>
                      <Markdown style={markdownStyles}>{displayText}</Markdown>

                      {locationQuery && (
                        <TouchableOpacity
                          style={{
                            marginTop: 10,
                            backgroundColor: COLORS.accentLight,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            flexDirection: "row",
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: COLORS.accent,
                          }}
                          onPress={() => {
                            const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationQuery)}`;
                            Linking.openURL(url);
                          }}
                        >
                          <Ionicons
                            name="map"
                            size={20}
                            color={COLORS.accent}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={{ color: COLORS.accent, fontWeight: "600" }}>
                            Navigate to {locationQuery}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  );
                })()}
              </View>
            )}

            {/* Source citation pills — replaces raw filename text */}
            {item.sender === "bot" && item.sources && !item.isError ? (
              <View style={styles.sourceContainer}>
                <Ionicons
                  name="book-outline"
                  size={11}
                  color={COLORS.textLight}
                  style={{ marginRight: 6, marginTop: 1 }}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", flex: 1, gap: 6 }}>
                  {item.sources
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((src, idx) => {
                      // Extract a readable label: first meaningful word + year if present
                      const year = src.match(/\d{4}/)?.[0];
                      const name = src
                        .replace(/[-_]/g, " ")
                        .replace(/\.pdf$/i, "")
                        .split(" ")
                        .filter((w) => w.length > 3)
                        .slice(0, 2)
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(" ");
                      const label = year ? `${name} (${year})` : name || `Ref ${idx + 1}`;
                      return (
                        <View key={idx} style={styles.sourcePill}>
                          <Text style={styles.sourcePillText} numberOfLines={1}>
                            {label}
                          </Text>
                        </View>
                      );
                    })}
                </View>
              </View>
            ) : null}
          </View>

          {/* Audio pill button — separate row for breathing room */}
          {item.sender === "bot" && (
            <TouchableOpacity
              style={[
                styles.audioPlayBtn,
                currentlyPlayingId === item.id && styles.audioPlayBtnActive,
              ]}
              onPress={() =>
                playServerTTS(item.text, item.id, item.urgencyFlags || [])
              }
              disabled={isTTSLoading && currentlyPlayingId !== item.id}
              activeOpacity={0.75}
            >
              {isTTSLoading && currentlyPlayingId === item.id ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons
                  name={currentlyPlayingId === item.id ? "stop-circle" : "volume-medium"}
                  size={15}
                  color={currentlyPlayingId === item.id ? COLORS.danger : COLORS.primary}
                />
              )}
              <Text
                style={[
                  styles.audioPlayBtnText,
                  currentlyPlayingId === item.id && { color: COLORS.danger },
                ]}
              >
                {isTTSLoading && currentlyPlayingId === item.id
                  ? "Loading..."
                  : currentlyPlayingId === item.id
                  ? "Stop"
                  : "Play"}
              </Text>
            </TouchableOpacity>
          )}

          {/* Timestamp — own row */}
          {item.timestamp && (
            <Text
              style={{
                fontSize: 11,
                color: COLORS.textLighter,
                marginTop: 4,
                marginHorizontal: 4,
                textAlign: item.sender === "user" ? "right" : "left",
              }}
            >
              {item.timestamp}
            </Text>
          )}
        </View>

        {item.sender === "user" && (
          <View
            style={[
              styles.avatarContainer,
              { backgroundColor: COLORS.accent, marginLeft: 8, marginRight: 0 },
            ]}
          >
            <Ionicons name="person" size={16} color="white" />
          </View>
        )}
      </View>
    );
  };

  // Welcome Tips Component
  const WelcomeTips = () => {
    if (!showTip) return null;
    return (
      <View style={styles.tipsContainer}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: COLORS.primaryDark }}>
            💡 Quick Tips
          </Text>
          <TouchableOpacity onPress={() => setShowTip(false)} style={{ padding: 4 }}>
            <Ionicons name="close" size={18} color={COLORS.textMedium} />
          </TouchableOpacity>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="mic" size={16} color={COLORS.accent} />
          <Text style={styles.tipText}>Hold the mic button to speak</Text>
        </View>
        <View style={[styles.tipItem, { marginTop: 6 }]}>
          <Ionicons name="volume-medium" size={16} color={COLORS.primary} />
          <Text style={styles.tipText}>Tap Play on any response to hear it aloud</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor="#4A90E2" />

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#F0F3F8" }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Hero Header */}
        <View style={styles.heroHeader}>
          <View style={styles.heroCircleLarge} />
          <View style={styles.heroCircleSmall} />
          <View style={styles.heroInner}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.heroTitle}>AI Assistant</Text>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={styles.heroActionBtn}
                activeOpacity={0.7}
                onPress={clearChatHistory}
              >
                <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.langChip}
                activeOpacity={0.7}
                onPress={() => setShowLanguageModal(true)}
              >
                <Ionicons name="globe-outline" size={13} color="#FFFFFF" />
                <Text style={[styles.langChipText, { marginLeft: 4 }]}>
                  {selectedLanguage === "sinhala" ? "සිංහල" : "English"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <FlatList
          style={{ flex: 1 }}
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          onScroll={({ nativeEvent: { layoutMeasurement, contentOffset, contentSize } }) => {
            const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
            setShowScrollBtn(distanceFromBottom > 120);
          }}
          scrollEventThrottle={100}
          ListHeaderComponent={messages.length <= 1 ? <WelcomeTips /> : null}
          ListFooterComponent={
            isTyping ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-start",
                  marginBottom: 12,
                  paddingHorizontal: 4,
                }}
              >
                <View style={styles.avatarContainer}>
                  <FontAwesome5 name="heartbeat" size={15} color="white" />
                </View>
                {/* Sleek minimal pill */}
                <View
                  style={[
                    styles.messageBubble,
                    styles.botBubble,
                    {
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      flexDirection: "row",
                      alignItems: "center",
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 35,
                      height: 35,
                      overflow: "hidden",
                      marginRight: 8,
                    }}
                  >
                    <WebView
                      source={{ html: THREE_BODY_LOADER_HTML }}
                      style={{ backgroundColor: "transparent", flex: 1 }}
                      scrollEnabled={false}
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      originWhitelist={["*"]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.textMedium, fontSize: 13, fontStyle: "italic" }}>
                      {loadingStep.text}
                    </Text>
                    {/* Progress bar: each step fills 20% */}
                    <View style={{ height: 3, borderRadius: 2, backgroundColor: COLORS.cardBorder, marginTop: 6, overflow: "hidden" }}>
                      <View
                        style={{
                          height: 3,
                          borderRadius: 2,
                          backgroundColor: COLORS.primary,
                          width: `${((loadingStepIndex + 1) / 5) * 100}%`,
                        }}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        {/* Scroll-to-bottom FAB */}
        {showScrollBtn && (
          <TouchableOpacity
            style={styles.scrollFAB}
            onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-down" size={20} color={COLORS.white} />
          </TouchableOpacity>
        )}

        {attachedDoc && (
          <View style={{
            backgroundColor: COLORS.primaryLight,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: isUploading ? 4 : 8,
            marginHorizontal: 16,
            marginBottom: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: COLORS.primary + '40',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {isUploading
                ? <ActivityIndicator size={18} color={COLORS.primary} />
                : <MaterialCommunityIcons name="file-document-outline" size={20} color={COLORS.primary} />
              }
              <Text style={{ flex: 1, marginLeft: 8, color: COLORS.primaryDark, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                {isUploading
                  ? `Uploading… ${Math.round(uploadProgress * 100)}%`
                  : attachedDoc.name
                }
              </Text>
              {!isUploading && (
                <TouchableOpacity onPress={() => {
                  Alert.alert(
                    "Remove Document",
                    "This will also clear your current chat history. Continue?",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: removeDocument }
                    ]
                  );
                }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                </TouchableOpacity>
              )}
            </View>
            {isUploading && (
              <View style={{ height: 3, backgroundColor: COLORS.primary + '30', borderRadius: 2, marginTop: 6 }}>
                <View style={{
                  height: 3,
                  width: `${Math.round(uploadProgress * 100)}%`,
                  backgroundColor: COLORS.primary,
                  borderRadius: 2,
                }} />
              </View>
            )}
          </View>
        )}

        <View style={{ backgroundColor: COLORS.card }}>
          <View
            style={[
              styles.inputContainer,
              { paddingBottom: Platform.OS === "ios" ? 34 : 20 },
            ]}
          >
            <View style={[styles.inputWrapper, { flexDirection: 'row', alignItems: 'flex-end' }]}>
              <TouchableOpacity
                onPress={showAttachOptions}
                disabled={isUploading}
                style={{ paddingBottom: 11, paddingRight: 6, opacity: isUploading ? 0.5 : 1 }}
              >
                <Ionicons name="attach" size={24} color={COLORS.primary} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.input, { paddingHorizontal: 0 }]}
                  placeholder={selectedLanguage === "sinhala" ? "සිංහල හෝ English ලිවිය හැකිය..." : "Ask in English or Sinhala..."}
                  value={message}
                  onChangeText={setMessage}
                  placeholderTextColor={COLORS.textLighter}
                  multiline
                  maxLength={500}
                />
                {message.length > 0 && (
                  <Text style={styles.charCount}>{message.length}/500</Text>
                )}
              </View>
            </View>

            {message.length > 0 ? (
              <TouchableOpacity
                onPress={() => sendTextMessage()}
                style={styles.sendButton}
                activeOpacity={0.7}
              >
                <Ionicons name="send" size={22} color="white" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPressIn={startRecording}
                onPressOut={stopRecording}
                style={[styles.micButton, isRecording && styles.micActive]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isRecording ? "mic" : "mic-outline"}
                  size={26}
                  color="white"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Enhanced Recording Overlay — rendered as a Modal so it covers the
          full screen including the Android system navigation bar */}
      <Modal
        visible={isRecording}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.recordingOverlay}>
          <View style={styles.recordingCard}>
            <View style={styles.recordingIconContainer}>
              <View style={styles.recordingPulse} />
              <Ionicons name="mic" size={52} color={COLORS.danger} />
            </View>
            <Text style={styles.recordingTitle}>🎤 Listening...</Text>
            <Text style={styles.recordingSubtitle}>
              Speak clearly about your health
            </Text>

            <View style={styles.meterTrack}>
              <View
                style={[
                  styles.meterFill,
                  {
                    width: `${Math.min(
                      100,
                      Math.max(5, (metering + 160) / 1.0),
                    )}%`,
                    backgroundColor:
                      metering > -30 ? COLORS.accent : COLORS.danger,
                  },
                ]}
              />
            </View>
            <View style={styles.volumeFeedback}>
              <Ionicons
                name={
                  metering > -30 ? "checkmark-circle" : "alert-circle-outline"
                }
                size={16}
                color={metering > -30 ? COLORS.accent : COLORS.warning}
              />
              <Text
                style={[
                  styles.recordingHint,
                  {
                    color: metering > -30 ? COLORS.accent : COLORS.warning,
                  },
                ]}
              >
                {metering > -30 ? "Perfect Volume ✓" : "Speak a bit louder"}
              </Text>
            </View>

            <Text style={styles.releaseHint}>Release to send</Text>
          </View>
        </View>
      </Modal>

      {/* ── Language Selection Modal ─────────────────────────────────── */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => selectedLanguage && setShowLanguageModal(false)}
      >
        <View style={styles.langModalOverlay}>
          <View style={styles.langModalCard}>
            <Ionicons name="language" size={40} color={COLORS.primary} style={{ marginBottom: 12 }} />
            <Text style={styles.langModalTitle}>
              Select Language
            </Text>
            <Text style={styles.langModalSubtitle}>
              Please select your preferred language{"\n"}
              කරුණාකර ඔබේ භාෂාව තෝරන්න
            </Text>

            <TouchableOpacity
              style={[styles.langBtn, selectedLanguage === "sinhala" && styles.langBtnActive]}
              activeOpacity={0.8}
              onPress={() => selectLanguage("sinhala")}
            >
              <Text style={[styles.langBtnText, selectedLanguage === "sinhala" && styles.langBtnTextActive]}>
                සිංහල
              </Text>
              <Text style={styles.langBtnSub}>Sinhala</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.langBtn, selectedLanguage === "english" && styles.langBtnActive]}
              activeOpacity={0.8}
              onPress={() => selectLanguage("english")}
            >
              <Text style={[styles.langBtnText, selectedLanguage === "english" && styles.langBtnTextActive]}>
                English
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ... (Styles remain unchanged, paste your previous styles here) ...

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#4A90E2",
  },

  // ═══════════════════════════════════════════════════════
  // HERO HEADER STYLES
  // ═══════════════════════════════════════════════════════
  heroHeader: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    overflow: "hidden",
    position: "relative",
  },
  heroCircleLarge: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -50,
    right: -40,
  },
  heroCircleSmall: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -20,
    left: 30,
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rightBtnPlaceholder: {
    width: 40,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  // ═══════════════════════════════════════════════════════
  // MESSAGE STYLES
  // ═══════════════════════════════════════════════════════
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },

  messageBubble: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  userBubble: {
    backgroundColor: COLORS.primaryDark,
    borderBottomRightRadius: 4,
  },

  botBubble: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primaryLight,
  },

  errorBubble: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FED7D7",
    borderWidth: 1,
  },

  // 🆕 Urgency flag bubble styles (Angle 4: Empathy & Urgency Router)
  criticalBubble: {
    backgroundColor: "#FFF5F5",
    borderColor: "#EE5253",
    borderWidth: 2,
    borderLeftWidth: 4,
  },

  warningBubble: {
    backgroundColor: "#FFFBEB",
    borderColor: "#F59E0B",
    borderWidth: 1.5,
    borderLeftWidth: 3,
  },

  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textDark,
  },

  userText: {
    color: COLORS.white,
    fontSize: 17,
    lineHeight: 26,
    letterSpacing: 0.2,
  },

  botText: {
    color: COLORS.textDark,
    fontSize: 17,
    lineHeight: 26,
  },

  timestamp: {
    fontSize: 11,
    color: COLORS.textLighter,
    marginTop: 4,
    marginHorizontal: 8,
  },

  timestampLeft: {
    textAlign: "left",
    marginLeft: 44,
  },

  timestampRight: {
    textAlign: "right",
    marginRight: 44,
  },

  sourceContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },

  sourcePill: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: 160,
  },

  sourcePillText: {
    fontSize: 11,
    color: COLORS.textMedium,
    fontWeight: "500",
  },

  audioPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 6,
    marginLeft: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    gap: 5,
  },

  audioPlayBtnActive: {
    backgroundColor: "#FFF0F0",
    borderColor: COLORS.danger + "50",
  },

  audioPlayBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },

  scrollFAB: {
    position: "absolute",
    right: 16,
    bottom: 80,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },

  sourceText: {
    fontSize: 11,
    color: COLORS.textLight,
    fontStyle: "italic",
    flex: 1,
  },

  audioButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    padding: 10,
    borderRadius: 20,
    marginTop: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },

  audioText: {
    marginLeft: 8,
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 14,
  },

  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    marginTop: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },

  welcomeAvatar: {
    backgroundColor: COLORS.secondary,
    shadowColor: COLORS.secondary,
  },

  // ═══════════════════════════════════════════════════════
  // TYPING INDICATOR
  // ═══════════════════════════════════════════════════════
  typingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },

  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginHorizontal: 3,
  },

  typingText: {
    fontSize: 13,
    color: COLORS.textLight,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 6,
  },

  // ═══════════════════════════════════════════════════════
  // INPUT
  // ═══════════════════════════════════════════════════════
  inputContainer: {
    flexDirection: "row",
    padding: 12,
    paddingBottom: Platform.OS === "ios" ? 24 : 20,
    backgroundColor: COLORS.card,
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },

  inputWrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginRight: 10,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },

  input: {
    fontSize: 16,
    color: COLORS.textDark,
    maxHeight: 100,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 40,
  },

  charCount: {
    fontSize: 10,
    color: COLORS.textLighter,
    textAlign: "right",
    paddingBottom: 4,
  },

  sendButton: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: 26,
    width: 52,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  micButton: {
    backgroundColor: COLORS.accent,
    padding: 12,
    borderRadius: 26,
    width: 52,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  micActive: {
    backgroundColor: COLORS.danger,
    transform: [{ scale: 1.1 }],
    shadowColor: COLORS.danger,
    shadowOpacity: 0.5,
  },

  // ═══════════════════════════════════════════════════════
  // RECORDING OVERLAY
  // ═══════════════════════════════════════════════════════

  recordingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },

  recordingCard: {
    backgroundColor: "white",
    padding: 32,
    borderRadius: 28,
    alignItems: "center",
    width: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },

  recordingIconContainer: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    height: 80,
  },

  recordingPulse: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.danger,
    opacity: 0.2,
  },

  recordingTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 6,
    color: COLORS.textDark,
  },

  recordingSubtitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 24,
  },

  meterTrack: {
    width: "100%",
    height: 12,
    backgroundColor: "#F0F0F0",
    borderRadius: 6,
    marginTop: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  meterFill: {
    height: "100%",
    borderRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },

  volumeFeedback: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
  },

  recordingHint: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
  },

  releaseHint: {
    marginTop: 20,
    fontSize: 12,
    color: COLORS.textLighter,
    fontStyle: "italic",
  },

  // ═══════════════════════════════════════════════════════
  // TIPS SECTION
  // ═══════════════════════════════════════════════════════
  tipsContainer: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  tipsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primaryDark,
    marginBottom: 12,
  },

  tipItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  tipText: {
    fontSize: 13,
    color: COLORS.textMedium,
    marginLeft: 10,
  },
  loadingContainer: {
    alignItems: "center",
    marginVertical: 4,
    flexDirection: "row",
    gap: 10,
  },
  loadingText: {
    color: COLORS.textMedium,
    fontSize: 14,
    fontWeight: "600",
    fontStyle: "italic",
  },

  // ── Language Chip (header) ───────────────────────────────────────────
  langChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    marginLeft: 4,
  },
  langChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // ── Language Selection Modal ─────────────────────────────────────────
  langModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  langModalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  langModalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textDark,
    marginBottom: 8,
  },
  langModalSubtitle: {
    fontSize: 14,
    color: COLORS.textMedium,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  langBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.cardBorder,
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: COLORS.background,
  },
  langBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "12",
  },
  langBtnText: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textDark,
  },
  langBtnTextActive: {
    color: COLORS.primary,
  },
  langBtnSub: {
    fontSize: 13,
    color: COLORS.textMedium,
    marginTop: 2,
  },
});

export default ChatbotScreen;

// Helper: Convert ArrayBuffer to Base64 (Can keep just in case, or remove if unused)
const arrayBufferToBase64 = (buffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};