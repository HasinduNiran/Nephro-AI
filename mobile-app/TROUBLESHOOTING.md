# Expo QR Code Not Working - Solution

## The Problem

When you scan the QR code, the app doesn't load on your phone because:

1. The Expo server is showing `exp://127.0.0.1:8081` (localhost) which your phone can't access
2. Your backend API IP was wrong (192.168.43.223 instead of 192.168.8.103)

## ✅ Fixed Issues

1. ✅ Updated backend API URL to `http://192.168.8.103:5000/api` in `axiosConfig.js`
2. ✅ Backend server is running on port 5000
3. ✅ Expo server is running

## 📱 How to Connect Your Phone Now

### Option 1: Use Tunnel Mode (Easiest - Works on any network)

1. Stop the current Expo server (Press Ctrl+C in the terminal)
2. Run: `npx expo start --tunnel`
3. Wait for ngrok to start (it will show a new QR code with an ngrok URL)
4. Scan the new QR code with Expo Go app

### Option 2: Use LAN Mode (Requires same WiFi)

1. **Make sure your phone and computer are on the SAME WiFi network**
2. Stop the current Expo server (Press Ctrl+C)
3. Run: `npx expo start --lan`
4. The QR code will now show your actual IP (192.168.8.103:8081)
5. Scan with Expo Go app

### Option 3: Manual Connection

If QR code still doesn't work:

1. Open Expo Go app on your phone
2. Tap "Enter URL manually"
3. Type: `exp://192.168.8.103:8081`
4. Tap "Connect"

## 🔍 Current Network Configuration

- **Your Computer's WiFi IP**: 192.168.8.103
- **Backend Server**: http://192.168.8.103:5000
- **Expo Server**: Should use 192.168.8.103:8081

## ⚠️ Important Checklist

- [ ] Expo Go app installed on your phone
- [ ] Phone and computer on same WiFi network (192.168.8.x)
- [ ] Backend server is running (npm start in backend folder)
- [ ] Expo server is running (npx expo start in mobile-app folder)
- [ ] Windows Firewall allows Node.js connections (if prompted, click "Allow")

## 🛠️ Quick Commands

```bash
# Terminal 1: Start Backend
cd C:\Research\Nephro-AI\backend
npm start

# Terminal 2: Start Expo with LAN mode
cd C:\Research\Nephro-AI\mobile-app
npx expo start --lan
```

## If Still Not Working

1. Check if firewall is blocking: `netsh advfirewall show allprofiles state`
2. Temporarily disable firewall to test
3. Make sure you're using Expo Go app version compatible with SDK 49
4. Try restarting both servers
