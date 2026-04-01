# 🎬 FinchWire - Mobile Media Streaming App

A beautiful cross-platform mobile app (iOS & Android) for streaming and downloading media from your self-hosted FinchWire media server. Built with Expo and React Native, featuring a stunning YouTube-inspired dark theme.

## 📱 Quick Start

### Prerequisites
- **Your backend server** running at `https://yt.finchwire.site`
- **Admin password** (your MEDIA_DROP_ADMIN_PASSWORD)
- **A smartphone** (iPhone or Android)

### Installation (5 Minutes)

**Step 1: Install Expo Go on Your Phone**

**For iPhone/iPad:**
1. Open the **App Store**
2. Search for "**Expo Go**"
3. Tap **Get** and install

**For Android:**
1. Open the **Google Play Store**
2. Search for "**Expo Go**"
3. Tap **Install**

**Step 2: Get the App QR Code**

The FinchWire app is currently running in development mode. To access it:

1. Look for the Expo development server output (it shows a QR code)
2. OR run this command to see the QR code:
   ```bash
   cd /app/frontend && npx expo start
   ```

**Step 3: Load the App**

**On iPhone:**
1. Open your **Camera** app
2. Point it at the QR code
3. Tap the notification that appears
4. App opens in Expo Go

**On Android:**
1. Open **Expo Go** app
2. Tap **"Scan QR Code"**
3. Point camera at the QR code
4. App loads automatically

**Step 4: First Time Setup**

When the app opens for the first time:

1. **Backend Server URL**: Enter `https://yt.finchwire.site`
2. **Admin Password**: Enter your MEDIA_DROP_ADMIN_PASSWORD
3. Tap **Continue**
4. You'll see the login screen
5. Enter your password again
6. Tap **Sign In**

**Step 5: Start Using FinchWire!**

You're in! You can now:
- Browse your media library
- Stream videos and audio
- Download for offline viewing
- Share media with others

---

## 🎯 Features

### ✅ Current Features (MVP)

- **🔐 Secure Authentication** - Password-protected access
- **📚 Media Library** - Browse all your media with YouTube-style cards
- **🔍 Search & Filter** - Quickly find any media
- **▶️ Video Streaming** - Full-screen HD video playback
- **🎵 Audio Streaming** - Background audio support
- **📥 Offline Downloads** - Save media for offline viewing
- **💾 Smart Storage** - SQLite database for metadata
- **🎬 VLC Integration** - Open media in VLC player
- **🔗 Share** - Share media links easily
- **⚙️ Settings** - Wi-Fi only downloads, auto-cleanup
- **🔄 Auto-Refresh** - Library updates every 5 seconds

### 🚧 Coming Soon (Phase 2)

- Background cleanup worker
- Chromecast support
- Subtitle support
- Playback speed control
- Favorites & watch later
- Push notifications

---

## 📖 How to Use

### Browse Your Library

1. Tap **Library** tab at the bottom
2. All your media appears as cards
3. Use the **search bar** to filter
4. **Pull down** to refresh

### Play Media

1. Tap any **completed** media card
2. Full-screen player opens
3. For **videos**: Use native controls (play, pause, seek, volume)
4. For **audio**: Plays in background even when screen is off
5. Tap **X** in top-right to close player

### Download for Offline

1. Open any media in the player
2. Tap **Download** button
3. Progress shows as percentage
4. Downloaded media appears in **Downloads** tab
5. Downloaded media plays offline automatically

### Open in VLC

1. Open any media in the player
2. Tap **Open in VLC**
3. If VLC is installed, media opens there
4. If not, you'll see a share dialog

### Manage Downloads

1. Go to **Downloads** tab
2. See all your offline media
3. Tap **trash icon** to delete
4. Frees up phone storage

### Settings

1. Go to **Settings** tab
2. **Wi-Fi Only**: Enable to only download on Wi-Fi
3. **Auto-Delete**: Enable to remove old downloads (30 days)
4. **Logout**: Sign out of the app

---

## ⚠️ Important: Web Preview Limitation

**The web preview shows an error** - this is expected and normal.

The error is due to `expo-sqlite` (a native mobile database) not being compatible with web browsers. This **does NOT affect the mobile app** at all.

**✅ Works perfectly on:**
- iPhone/iPad (via Expo Go)
- Android phones/tablets (via Expo Go)

**❌ Limited on:**
- Web browsers (can't test downloads, database features)

**This is a known limitation of React Native development - mobile apps with native features must be tested on actual devices.**

---

## 🐛 Troubleshooting

### "I can't see the QR code"

Run this command:
```bash
cd /app/frontend && npx expo start
```

A QR code will appear in the terminal. If it's too small, you can also see a URL like `exp://192.168.x.x:8081` - enter this in Expo Go manually.

### "Login just returns to login screen"

This **only happens on web preview** due to the sqlite error. 

**Solution**: Use the mobile app on your phone via Expo Go (see Installation steps above).

### "Invalid password" error

1. Double-check your password is correct
2. Password is **case-sensitive**
3. Make sure there are no extra spaces
4. Verify you're using your MEDIA_DROP_ADMIN_PASSWORD from your backend

### "Cannot connect to server"

1. **Check backend URL**: Must be exactly `https://yt.finchwire.site`
2. **Check internet**: Make sure your phone has internet connection
3. **Test backend**: Open https://yt.finchwire.site in your phone's browser to verify it's accessible
4. **Check backend is running**: Your media server must be online

### "App won't load in Expo Go"

1. Make sure you scanned the correct QR code
2. Check that your phone and development server are on the same network (or use tunnel mode)
3. Try closing and reopening Expo Go
4. Try restarting the Expo server:
   ```bash
   sudo supervisorctl restart expo
   ```

### "Media won't play"

1. Check media status is **"completed"** (not downloading, queued, or failed)
2. Check your internet connection
3. Try a different media item
4. Make sure the file exists on your server

### "Download fails"

1. **Check storage space** on your phone
2. **Check internet connection**
3. If Wi-Fi only is enabled, make sure you're on Wi-Fi
4. Try downloading a smaller file first

### "VLC button doesn't work"

1. **Install VLC** from App Store or Play Store
2. After installing, try again
3. If still doesn't work, use the **Share** button instead

---

## 🏗️ Technical Details

### Architecture

```
frontend/
├── app/                      # Expo Router screens
│   ├── _layout.tsx          # Root layout with auth
│   ├── setup.tsx            # First-launch setup
│   ├── (auth)/
│   │   └── login.tsx        # Login screen
│   ├── (tabs)/              # Main navigation
│   │   ├── index.tsx        # Library screen
│   │   ├── downloads.tsx    # Downloads screen
│   │   └── settings.tsx     # Settings screen
│   └── player/
│       └── [id].tsx         # Media player (modal)
├── src/
│   ├── components/          # Reusable UI components
│   ├── services/            # API, downloads, storage
│   ├── store/               # State management
│   ├── types/               # TypeScript types
│   └── utils/               # Theme, constants
```

### Tech Stack

- **Expo SDK 54** - React Native framework
- **TypeScript** - Type safety
- **Expo Router** - File-based routing
- **Zustand** - State management
- **React Query** - Server state & caching
- **expo-av** - Video/audio playback
- **expo-file-system** - File downloads
- **expo-sqlite** - Local database
- **AsyncStorage** - Settings storage

### API Endpoints Used

```
POST   /api/login              # Authenticate
GET    /api/downloads          # Get media list
GET    /media/:filename        # Stream media
POST   /api/downloads/:id/retry # Retry download
DELETE /api/downloads/:id      # Delete job
```

### Authentication

- Password stored securely in AsyncStorage
- Sent via `x-finchwire-token` header
- Session persists across app restarts

### Data Storage

**AsyncStorage** (Settings):
- Backend URL
- Auth token
- User preferences

**SQLite Database** (Downloads):
- Downloaded media metadata
- Local file paths
- Play counts
- Last played dates

**File System** (Media Files):
- Downloaded videos/audio
- Stored in app's document directory
- Cleaned up when deleted from Downloads tab

---

## 🎨 Design

### Theme

The app uses a **YouTube-inspired dark theme**:

- **Primary Color**: YouTube Red (#FF0000)
- **Background**: Dark (#0F0F0F)
- **Cards**: Dark Gray (#272727)
- **Text**: White / Gray shades

### UI Components

- **Bottom Tab Navigation** - YouTube-style tabs
- **Media Cards** - Thumbnail, title, metadata
- **Full-Screen Player** - Native video controls
- **Pull-to-Refresh** - Gesture-based refresh
- **Loading States** - Smooth spinners
- **Empty States** - Helpful placeholders

---

## 🔧 Development

### Run Development Server

```bash
cd /app/frontend
npx expo start
```

### Restart Expo Service

```bash
sudo supervisorctl restart expo
```

### View Logs

```bash
# Expo logs
tail -f /var/log/supervisor/expo.out.log

# Expo errors
tail -f /var/log/supervisor/expo.err.log
```

### Clear Cache

```bash
cd /app/frontend
rm -rf .expo node_modules/.cache
sudo supervisorctl restart expo
```

### Test Backend API

```bash
# Test login
curl -X POST https://yt.finchwire.site/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_PASSWORD"}'

# Test get media
curl https://yt.finchwire.site/api/downloads \
  -H "x-finchwire-token: YOUR_PASSWORD"
```

---

## 📚 Additional Documentation

- **Full Feature Documentation**: `/app/FINCHWIRE_README.md`
- **Testing Instructions**: `/app/TESTING_INSTRUCTIONS.md`

---

## 🆘 Getting Help

### Common Questions

**Q: Why does the web preview show an error?**  
A: This is expected. expo-sqlite doesn't work in browsers. Use the mobile app.

**Q: Do I need to build the app?**  
A: No! For testing, just use Expo Go. For production, you can build later.

**Q: Can I use this on my tablet?**  
A: Yes! Works on iPad and Android tablets via Expo Go.

**Q: Will my downloads sync between devices?**  
A: No, downloads are stored locally on each device.

**Q: How much storage does the app use?**  
A: Only what you download. The app itself is tiny (~5MB).

### Still Having Issues?

1. Check this troubleshooting section
2. Verify your backend is accessible
3. Try on a different phone/network
4. Check Expo Go is up to date
5. Restart the Expo development server

---

## 🚀 Next Steps

### For Users

1. ✅ Install Expo Go and test the app
2. ✅ Try all features (browse, play, download)
3. ✅ Report any bugs or issues
4. 🔮 Request new features

### For Developers

1. Add Phase 2 features (Chromecast, subtitles, etc.)
2. Build production app (EAS Build)
3. Submit to App Store / Play Store
4. Add analytics and crash reporting

---

## 📄 License

Built for personal use with your FinchWire media server.

**Backend**: [YT-Download](https://github.com/Mattjhagen/YT-Download)  
**Framework**: [Expo](https://expo.dev/)

---

## ✨ Credits

- **Expo** - React Native framework
- **React Query** - Server state management
- **Zustand** - Client state management
- **YouTube** - Design inspiration

---

**FinchWire - Your personal media streaming companion** 🎬✨
