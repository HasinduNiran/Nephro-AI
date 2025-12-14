import React, { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import axios from 'axios';
import * as Haptics from 'expo-haptics';
import Markdown from 'react-native-markdown-display';

// ⚠️ CHANGE THIS TO YOUR LAPTOP'S IP ADDRESS
// Find it by running 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux)
const BACKEND_URL = 'http://10.143.248.166:8000';  

const COLORS = {
  primary: '#2E86DE',    // Professional Blue
  primaryLight: '#E3F2FD',
  accent: '#10AC84',     // Calming Green (Success)
  danger: '#EE5253',     // Soft Red (Error/Recording)
  background: '#F7F9FC', // Very light grey-blue
  card: '#FFFFFF',
  textDark: '#2D3436',
  textLight: '#636E72',
  white: '#FFFFFF'
};

const ChatbotScreen = ({ navigation }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hello! I am your Nephro-AI assistant. You can speak to me or type.', sender: 'bot' },
  ]);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sound, setSound] = useState(null);
  const [metering, setMetering] = useState(-160);
  const flatListRef = useRef(); // NEW: Auto-scroll ref

  const suggestions = ["Diet Plan 🍎", "My Lab Results 🧪", "Symptoms 🤒", "Help 🆘"];
  
  const markdownStyles = {
    body: { color: COLORS.textDark, fontSize: 16 },
    bullet_list: { marginTop: 5, marginBottom: 5 },
    strong: { fontWeight: 'bold', color: COLORS.primary } 
  };

  // 1. Permission & Audio Setup
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice chat.');
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

      console.log('Starting recording..');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => updateMetering(status)
      );
      
      await recording.setProgressUpdateInterval(100); 

      setRecording(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  // 3. Stop Recording & Send to Server
  const stopRecording = async () => {
    console.log('Stopping recording..');
    setRecording(undefined);
    setIsRecording(false);
    
    if (!recording) return;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI(); 
    console.log('Recording stored at', uri);
    
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    await sendAudioToBackend(uri);
  };

  // 4. API Logic: Upload Audio
  const sendAudioToBackend = async (uri) => {
    setIsLoading(true);
    
    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      type: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4',
      name: 'voice_input.m4a',
    });
    formData.append('patient_id', 'p_001');

    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, text: '🎤 (Voice Message)', sender: 'user' }]);

    try {
      const response = await axios.post(`${BACKEND_URL}/chat/audio`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const b64ResponseText = response.headers['x-response-b64'];
      const b64Sources = response.headers['x-sources-b64']; // NEW: Read sources header
      
      let responseText = "Audio Response";
      let sourcesText = "";
      
      try {
          // Native Base64 Decode (Standard JS)
          if (b64ResponseText) responseText = decodeURIComponent(escape(window.atob(b64ResponseText)));
          if (b64Sources) sourcesText = decodeURIComponent(escape(window.atob(b64Sources)));
      } catch (e) {
          console.log("Error decoding headers", e);
      }

      const fileUri = FileSystem.documentDirectory + 'response.mp3';
      
      // 2. Convert Binary to Base64 (Using our safe helper)
      const base64Data = arrayBufferToBase64(response.data);

      // 3. Write to disk
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // 4. Verification
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      console.log("💾 Saved Audio File:", fileInfo);

      if (fileInfo.size < 100) {
        console.error("⚠️ Warning: Audio file is too small. Likely corrupted.");
        Alert.alert("Audio Error", "Received empty audio from server.");
        return; 
      }

      playResponseAudio(fileUri);

      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        text: responseText, 
        sender: 'bot',
        sources: sourcesText,
        audioUri: fileUri // NEW: Save audio URI for replay
      }]);

    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Could not connect to chatbot server.");
    } finally {
      setIsLoading(false);
    }
  };

  const playResponseAudio = async (uri) => {
    try {
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (error) {
      console.log("Playback error", error);
    }
  };

  // Text Chat Implementation
  const sendTextMessage = async (textToSend) => {
    const text = textToSend || message;
    if (!text.trim()) return;

    if (!textToSend) setMessage(''); // Clear input if typed
    
    setMessages(prev => [...prev, { id: Date.now().toString(), text: text, sender: 'user' }]);
    setIsLoading(true);

    try {
      const res = await axios.post(`${BACKEND_URL}/chat/text`, {
        text: text,
        patient_id: 'p_001'
      });
      
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        text: res.data.response, 
        sender: 'bot',
        sources: res.data.sources && res.data.sources.length > 0 ? 
                 res.data.sources.map(s => s.source).join(", ") : "" 
      }]);
    } catch (error) {
        console.error("Text API Error", error);
    } finally {
        setIsLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={{ 
      flexDirection: 'row', 
      justifyContent: item.sender === 'user' ? 'flex-end' : 'flex-start',
      marginBottom: 12 
    }}>
      {item.sender === 'bot' && (
        <View style={styles.avatarContainer}>
          <Ionicons name="medkit" size={16} color="white" />
        </View>
      )}
      
      <View style={[
        styles.messageBubble,
        item.sender === 'user' ? styles.userBubble : styles.botBubble,
      ]}>
        {item.sender === 'user' ? (
           <Text style={styles.userText}>{item.text}</Text>
        ) : (
           <View>
              <Markdown style={markdownStyles}>
                {item.text}
              </Markdown>
              {/* Audio Replay Button */}
              {item.audioUri && (
                <TouchableOpacity 
                   style={styles.audioButton} 
                   onPress={() => playResponseAudio(item.audioUri)}
                >
                  <Ionicons name="play-circle" size={32} color={COLORS.primary} />
                  <Text style={styles.audioText}>Play Audio</Text>
                </TouchableOpacity>
              )}
           </View>
        )}
        
        {/* Source Attribution Tag */}
        {item.sender === 'bot' && item.sources ? (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EFF2F7' }}>
                <Text style={{ fontSize: 10, color: '#636E72', fontStyle: 'italic' }}>
                    📚 Source: {item.sources}
                </Text>
            </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.card} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nephro Assistant</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <FlatList
        ref={flatListRef} // NEW: Ref
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} // NEW: Auto-scroll
        ListFooterComponent={
            isLoading ? (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 12 }}>
                 <View style={styles.avatarContainer}>
                    <Ionicons name="medkit" size={16} color="white" />
                 </View>
                 <View style={[styles.messageBubble, styles.botBubble]}>
                    <Text style={{ color: '#999', fontStyle: 'italic' }}>
                       Thinking... 🩺
                    </Text>
                 </View>
              </View>
            ) : null
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Chips */}
        <View style={{ height: 50, marginBottom: 5 }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={suggestions}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.chip} 
                onPress={() => sendTextMessage(item)}
              >
                <Text style={styles.chipText}>{item}</Text>
              </TouchableOpacity>
            )}
            keyExtractor={item => item}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          />
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type or speak..."
            value={message}
            onChangeText={setMessage}
            placeholderTextColor={COLORS.textLight}
          />
          
          {message.length > 0 ? (
             <TouchableOpacity onPress={() => sendTextMessage()} style={styles.sendButton}>
               <Ionicons name="send" size={24} color="white" />
             </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPressIn={startRecording}
              onPressOut={stopRecording}
              style={[styles.micButton, isRecording && styles.micActive]}
            >
              <Ionicons name={isRecording ? "mic" : "mic-outline"} size={28} color="white" />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Overlay */}
        {isRecording && (
          <View style={styles.recordingOverlay}>
            <View style={styles.recordingCard}>
              <Ionicons name="mic" size={48} color={COLORS.danger} />
              <Text style={styles.recordingTitle}>Listening...</Text>
              
              <View style={styles.meterTrack}>
                <View 
                  style={[
                    styles.meterFill, 
                    { 
                      width: `${Math.min(100, Math.max(5, (metering + 160) / 1.0))}%`,
                      backgroundColor: metering > -30 ? COLORS.accent : COLORS.danger
                    } 
                  ]} 
                />
              </View>
              <Text style={styles.recordingHint}>
                {metering > -30 ? "Perfect Volume" : "Please speak closer"}
              </Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.background 
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 20,
    paddingBottom: 15,
    backgroundColor: COLORS.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    zIndex: 10
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: COLORS.textDark,
    letterSpacing: 0.5 
  },
  messagesList: { padding: 16 },
  messageBubble: { 
    padding: 16, 
    borderRadius: 20, 
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  userBubble: { 
    alignSelf: 'flex-end', 
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4 
  },
  botBubble: { 
    alignSelf: 'flex-start', 
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#EFF2F7'
  },
  messageText: { 
    fontSize: 16, 
    lineHeight: 24, 
    color: COLORS.textDark 
  },
  userText: { color: COLORS.white },
  botText: { color: COLORS.textDark },
  
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    padding: 8,
    borderRadius: 20,
    marginTop: 8,
    alignSelf: 'flex-start'
  },
  audioText: { marginLeft: 8, color: COLORS.primary, fontWeight: '600' },

  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 10
  },

  // Input & Chips
  inputContainer: { 
    flexDirection: 'row', 
    padding: 10, 
    backgroundColor: COLORS.card, 
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#EFF2F7'
  },
  input: { 
    flex: 1, 
    backgroundColor: '#F2F2F7', 
    borderRadius: 20, 
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 10,
    fontSize: 16,
    color: COLORS.textDark
  },
  sendButton: { backgroundColor: COLORS.primary, padding: 10, borderRadius: 25 },
  micButton: { backgroundColor: COLORS.accent, padding: 10, borderRadius: 25 },
  micActive: { backgroundColor: COLORS.danger, transform: [{ scale: 1.2 }] },
  
  chip: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    justifyContent: 'center'
  },
  chipText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14
  },
  
  // Overlay
  recordingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100
  },
  recordingCard: {
    backgroundColor: 'white',
    padding: 30,
    borderRadius: 25,
    alignItems: 'center',
    width: '80%',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10
  },
  recordingTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginTop: 20,
      marginBottom: 10,
      color: COLORS.textDark
  },
  recordingHint: {
      marginTop: 10,
      fontSize: 14,
      color: COLORS.textLight
  },
  meterTrack: {
    width: '100%',
    height: 10,
    backgroundColor: '#F0F0F0',
    borderRadius: 5,
    marginTop: 20,
    overflow: 'hidden'
  },
  meterFill: {
    height: '100%',
    borderRadius: 5
  }
});

export default ChatbotScreen;

// Helper: Convert ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};
