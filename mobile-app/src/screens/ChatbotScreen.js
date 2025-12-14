import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import { Buffer } from 'buffer';

// ⚠️ CHANGE THIS TO YOUR LAPTOP'S IP ADDRESS
// Find it by running 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux)
const BACKEND_URL = 'http://10.143.248.166:8000'; 

const ChatbotScreen = ({ navigation }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hello! I am your Nephro-AI assistant. You can speak to me or type.', sender: 'bot' },
  ]);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sound, setSound] = useState(null);

  // 1. Permission & Audio Setup
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice chat.');
      }
      // Configure audio mode for voice chat (Playback + Recording)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    })();
  }, []);

  // 2. Start Recording
  const startRecording = async () => {
    try {
      // Stop any playing audio
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      console.log('Starting recording..');
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
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

    // Send to Backend
    await sendAudioToBackend(uri);
  };

  // 4. API Logic: Upload Audio
  const sendAudioToBackend = async (uri) => {
    setIsLoading(true);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      type: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4', // Common mobile formats
      name: 'voice_input.m4a',
    });
    formData.append('patient_id', 'p_001'); // Hardcoded for demo

    // Add user placeholder message
    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, text: '🎤 (Voice Message)', sender: 'user' }]);

    try {
      const response = await axios.post(`${BACKEND_URL}/chat/audio`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'arraybuffer', // Expect binary audio data back
      });

      // Handle Text Headers (Encoded in Base64 by server.py)
      // Note: Axios headers are lowercased
      const b64Transcript = response.headers['x-transcription-b64'];
      const b64ResponseText = response.headers['x-response-b64'];

      // Decode Base64 (Using built-in atob or Buffer logic needed, 
      // but React Native needs a polyfill or simple hack)
      // Quick Hack for Demo: Just trust the server or use a library like 'base-64'
      // If server sends raw text in body, we can't get file. 
      // So we rely on headers or dual request. Ideally, install 'base-64' package.
      
      // Update UI with Transcription
      // (For this snippet, we will assume headers worked, or just show "Audio Received")
      let transcriptText = "Audio Processed";
      let responseText = "Audio Response";
      try {
          if (b64Transcript) transcriptText = Buffer.from(b64Transcript, 'base64').toString('utf-8');
          if (b64ResponseText) responseText = Buffer.from(b64ResponseText, 'base64').toString('utf-8');
      } catch (e) {
          console.log("Error decoding headers", e);
      }

      // Save Response Audio
      const fileUri = FileSystem.documentDirectory + 'response.mp3';
      
      // Convert binary to base64 for saving (Expo FileSystem requires string)
      // This part is tricky in RN without libraries. 
      // BETTER APPROACH for student project: Download the file directly.
      // But since we have arraybuffer, let's try a simple blob save if using standard fetch,
      // or simply play the buffer.
      
      // SIMPLER METHOD FOR EXPO:
      // Use FileSystem.downloadAsync instead of axios for the file download part
      // But let's finish the Axios flow for logic consistency.
      
      // Easier Path for Audio Playback from API Response:
      const base64Data =  Buffer.from(response.data, 'binary').toString('base64');
      await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });

      // Play Response
      playResponseAudio(fileUri);

      // Add Bot Message
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        text: responseText, // Decode b64ResponseText here if you install 'base-64'
        sender: 'bot' 
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
  const sendTextMessage = async () => {
    if (!message.trim()) return;

    const userText = message;
    setMessage('');
    setMessages(prev => [...prev, { id: Date.now().toString(), text: userText, sender: 'user' }]);
    setIsLoading(true);

    try {
      const res = await axios.post(`${BACKEND_URL}/chat/text`, {
        text: userText,
        patient_id: 'p_001'
      });
      
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        text: res.data.response, 
        sender: 'bot' 
      }]);
    } catch (error) {
        console.error("Text API Error", error);
    } finally {
        setIsLoading(false);
    }
  };

  // UI Components
  const renderItem = ({ item }) => (
    <View style={[
        styles.messageBubble,
        item.sender === 'user' ? styles.userBubble : styles.botBubble,
      ]}>
      <Text style={[styles.messageText, item.sender === 'user' ? styles.userText : styles.botText]}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nephro Assistant</Text>
        <View style={{ width: 24 }} /> 
      </View>

      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type or speak..."
            value={message}
            onChangeText={setMessage}
          />
          
          {message.length > 0 ? (
             <TouchableOpacity onPress={sendTextMessage} style={styles.sendButton}>
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
        {isLoading && <ActivityIndicator style={{marginBottom: 10}} color="#4A90E2" />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  messagesList: { padding: 16 },
  messageBubble: { padding: 12, borderRadius: 16, marginBottom: 12, maxWidth: '80%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#4A90E2' },
  botBubble: { alignSelf: 'flex-start', backgroundColor: '#FFF' },
  messageText: { fontSize: 16 },
  userText: { color: '#FFF' },
  botText: { color: '#000' },
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#FFF', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 20, padding: 10, marginRight: 10 },
  sendButton: { backgroundColor: '#4A90E2', padding: 10, borderRadius: 25 },
  micButton: { backgroundColor: '#34C759', padding: 10, borderRadius: 25 }, // Green for mic
  micActive: { backgroundColor: '#FF3B30', transform: [{ scale: 1.2 }] }, // Red when recording
});

export default ChatbotScreen;
