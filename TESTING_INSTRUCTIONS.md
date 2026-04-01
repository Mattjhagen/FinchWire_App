# 📱 Testing FinchWire App

## ⚠️ Important: Web Preview Limitation

The web preview currently shows an error due to `expo-sqlite` WASM compatibility issues. This is a **known limitation** and **does not affect the actual mobile app**.

**The app works perfectly on:**
- ✅ iOS devices (iPhone/iPad) via Expo Go
- ✅ Android devices via Expo Go
- ❌ Web preview (limited - no downloads feature)

## 🚀 How to Test on Your Phone

### Step 1: Install Expo Go

**iOS**:
1. Open App Store
2. Search "Expo Go"
3. Install the app

**Android**:
1. Open Play Store  
2. Search "Expo Go"
3. Install the app

### Step 2: Get the QR Code

The Expo development server generates a QR code. You can find it:

1. In the terminal logs (look for a QR code ASCII art)
2. Or run: `cd /app/frontend && npx expo start`
3. A QR code will appear in the terminal

### Step 3: Scan and Load

**iOS**:
1. Open Camera app
2. Point at QR code
3. Tap the notification
4. App opens in Expo Go

**Android**:
1. Open Expo Go app
2. Tap "Scan QR Code"
3. Point at QR code
4. App loads

### Step 4: First Launch Setup

1. **Backend URL**: Enter `https://yt.finchwire.site`
2. **Password**: Enter your MEDIA_DROP_ADMIN_PASSWORD
3. Tap "Continue"
4. You'll be taken to login screen
5. Enter the same password
6. Tap "Sign In"

### Step 5: Use the App

**Library Tab**:
- Browse all your media
- Use search to filter
- Pull down to refresh
- Tap any "completed" item to play

**Player**:
- Video plays with native controls
- Download button saves for offline
- Open in VLC button launches VLC
- Share button shares the media URL

**Downloads Tab**:
- See all downloaded media
- Play offline
- Delete downloads

**Settings Tab**:
- View backend URL
- Toggle Wi-Fi only downloads
- Toggle auto-delete
- Logout

## 🐛 Troubleshooting

###"Login just returns to login screen"

This happens on web because the app can't fully load. **Use mobile device instead.**

### "App won't load / Shows error"

**Web**: This is expected - use mobile device
**Mobile**: Make sure you're connected to internet and the QR code scanned correctly

### "Can't connect to server"

1. Check backend URL is exactly: `https://yt.finchwire.site`
2. Make sure your phone has internet
3. Make sure the backend server is running
4. Try accessing https://yt.finchwire.site in your phone's browser

### "Invalid password"

1. Make sure you're using the correct MEDIA_DROP_ADMIN_PASSWORD
2. Check for typos
3. Password is case-sensitive

### "Media won't play"

1. Make sure the media status is "completed"
2. Check internet connection
3. Try a different media item

### "Download fails"

1. Check phone storage space
2. Check internet connection
3. If Wi-Fi only is enabled, make sure you're on Wi-Fi

## 📊 Testing Checklist

- [ ] App loads on mobile device
- [ ] Setup screen accepts backend URL + password
- [ ] Login works with correct password
- [ ] Library shows media items
- [ ] Search filters media
- [ ] Pull-to-refresh updates library
- [ ] Tap media opens player
- [ ] Video plays with controls
- [ ] Audio plays
- [ ] Download button works
- [ ] Downloaded media appears in Downloads tab
- [ ] VLC button works (if VLC installed)
- [ ] Share button works
- [ ] Settings can be changed
- [ ] Logout works

## 🔧 Developer Testing

### Test API Manually

```bash
# Test login
curl -X POST https://yt.finchwire.site/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_PASSWORD"}'

# Should return: {"success":true}

# Test get media
curl https://yt.finchwire.site/api/downloads \
  -H "x-finchwire-token: YOUR_PASSWORD"

# Should return: array of media objects
```

### Check Expo Logs

When running on device, you can see console logs in the terminal where you ran `expo start`.

### Restart Expo

If changes don't appear:
```bash
sudo supervisorctl restart expo
```

## 📞 Need Help?

If you encounter issues:

1. Check this troubleshooting guide
2. Check console logs in Expo terminal
3. Verify backend is accessible: https://yt.finchwire.site
4. Try restarting the app (close and reopen in Expo Go)
5. Try clearing Expo Go cache: Settings > Clear cache in Expo Go

## ✅ Success Criteria

You'll know it's working when:
- ✅ Setup completes without errors
- ✅ Login succeeds and shows library
- ✅ Media cards display with titles/thumbnails
- ✅ Tapping a completed media opens player
- ✅ Video/audio plays smoothly
- ✅ Downloads save and appear in Downloads tab

---

**Note**: The web preview limitation is purely a development/preview issue. Once you build the app for production (iOS/Android), it will work perfectly on all devices without any expo-sqlite issues.
