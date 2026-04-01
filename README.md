# 🎬 FinchWire - Mobile Media Streaming App

FinchWire is a cross-platform mobile app (iOS & Android) for streaming, downloading, and managing media from your self-hosted media server. Built with Expo and React Native with a YouTube-inspired dark theme.

## 🌟 Features

### MVP (Phase 1) - ✅ Complete
- **First-Launch Setup**: Easy configuration of backend URL and admin password
- **Authentication**: Secure login with session management
- **Media Library**: Browse all your media with YouTube-style cards
- **Search & Filter**: Quick search across your media library
- **Video Streaming**: Stream videos directly with native playback controls
- **Audio Streaming**: Stream audio with background playback support
- **Media Player**: Full-screen player with playback controls
- **Downloads**: Download media for offline viewing
- **Local Storage**: Save downloads with metadata in local database
- **VLC Integration**: Open media directly in VLC player
- **Share**: Share media links with others
- **Settings**: Configure backend URL, retention, and preferences
- **Auto-Refresh**: Library updates every 5 seconds

### Phase 2 - Coming Soon
- Background cleanup worker (auto-delete old downloads)
- Chromecast support
- Subtitle support
- Playback speed control
- Favorites/watch later

## 🏗️ Architecture

```
frontend/
├── app/                          # Expo Router file-based routing
│   ├── _layout.tsx              # Root layout with auth protection
│   ├── setup.tsx                # First-launch configuration
│   ├── (auth)/
│   │   ├── _layout.tsx          # Auth group layout
│   │   └── login.tsx            # Login screen
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Bottom tab navigation
│   │   ├── index.tsx            # Home/Library screen
│   │   ├── downloads.tsx        # Downloaded media
│   │   └── settings.tsx         # App settings
│   └── player/
│       └── [id].tsx             # Media player (modal)
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── MediaCard.tsx        # YouTube-style media card
│   │   ├── Loading.tsx          # Loading indicator
│   │   └── EmptyState.tsx       # Empty state placeholder
│   ├── services/                # Business logic
│   │   ├── api.ts               # API client (Fetch-based)
│   │   ├── download.ts          # Download manager (expo-file-system)
│   │   └── storage.ts           # Local database (expo-sqlite)
│   ├── store/                   # State management (Zustand)
│   │   ├── authStore.ts         # Authentication state
│   │   └── settingsStore.ts    # App settings state
│   ├── types/                   # TypeScript types
│   │   └── index.ts             # Shared types
│   └── utils/                   # Utilities
│       ├── theme.ts             # YouTube-inspired theme
│       └── constants.ts         # App constants
```

## 🎨 Design System

**Theme**: YouTube-inspired dark theme with red accents

**Colors**:
- Primary: `#FF0000` (YouTube Red)
- Background: `#0F0F0F` (Dark)
- Surface: `#272727` (Cards)
- Text: `#FFFFFF` / `#AAAAAA` / `#717171`

**Components**:
- Bottom tab navigation (YouTube-style)
- Card-based media grid
- Full-screen modal player
- Native video controls

## 🔧 Tech Stack

- **Framework**: Expo SDK 54 + React Native
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing)
- **State Management**: Zustand + React Query
- **Media Playback**: expo-av (Video & Audio)
- **Downloads**: expo-file-system
- **Local Database**: expo-sqlite
- **Storage**: @react-native-async-storage/async-storage
- **Icons**: @expo/vector-icons (Ionicons)

## 🚀 Getting Started

### Prerequisites
- Backend server running (from your GitHub repo)
- Admin password (MEDIA_DROP_ADMIN_PASSWORD)

### First Launch
1. Open the app
2. Enter your backend URL (e.g., `https://yt.finchwire.site`)
3. Enter your admin password
4. Tap "Continue"
5. Login with the same password

### Using the App

**Browse Library**:
- Tap Library tab to see all media
- Use search bar to filter
- Pull down to refresh
- Tap a completed item to play

**Play Media**:
- Video: Full-screen player with native controls
- Audio: Audio player with background support
- Close button (top-right) to exit player

**Download for Offline**:
- Open any completed media
- Tap "Download" button
- Progress shown during download
- Downloaded files available in Downloads tab

**Open in VLC**:
- Tap "Open in VLC" in player
- App generates `vlc://` URL
- Falls back to share sheet if VLC not installed

**Manage Downloads**:
- Go to Downloads tab
- View all downloaded media
- Tap trash icon to delete

**Settings**:
- View backend URL
- Toggle Wi-Fi only downloads
- Toggle auto-delete old files
- Logout

## 📡 API Integration

### Backend Endpoints Used

```
POST   /api/login              # Login with password
POST   /api/logout             # Logout
GET    /api/session            # Check session
GET    /api/downloads          # Get all media jobs
POST   /api/downloads          # Submit new download
POST   /api/downloads/:id/retry # Retry failed download
DELETE /api/downloads/:id      # Delete job
GET    /media/:filename        # Stream media (with Range support)
```

### Authentication
- Auth token stored in AsyncStorage
- Sent via `x-finchwire-token` header
- Persists across app restarts

### Media URLs
```javascript
// Streaming
https://yt.finchwire.site/media/filename.mp4

// Download
https://yt.finchwire.site/media/filename.mp4?download=true

// VLC
vlc://https://yt.finchwire.site/media/filename.mp4
```

## 💾 Local Storage

### AsyncStorage
- Settings (backend URL, password, preferences)
- Auth token
- Setup completion flag

### SQLite Database
```sql
CREATE TABLE local_media (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  title TEXT NOT NULL,
  local_path TEXT NOT NULL,
  remote_url TEXT NOT NULL,
  kind TEXT NOT NULL,           -- 'video' or 'audio'
  mime_type TEXT,
  file_size INTEGER NOT NULL,
  downloaded_at TEXT NOT NULL,
  last_played_at TEXT,
  play_count INTEGER DEFAULT 0
);
```

### File System
Downloads stored in: `${FileSystem.documentDirectory}downloads/`

## 🎯 Key Features Explained

### Offline Playback
- Downloads use expo-file-system
- Metadata saved in local SQLite database
- Player checks for local file first
- Falls back to streaming if not downloaded

### VLC Integration
- Uses deep linking: `vlc://https://...`
- `Linking.canOpenURL()` checks if VLC installed
- Falls back to share sheet if not available

### Background Audio
- Audio session configured for background playback
- Continues playing when app minimized
- Proper cleanup on unmount

### Download Progress
- Real-time progress callbacks
- Updates UI with percentage
- Handles failures and cleanup

### Auto-Refresh
- React Query refetchInterval: 5000ms
- Updates library status automatically
- Shows download progress live

## 🔐 Security

- No credentials hardcoded
- Auth token stored securely in AsyncStorage
- HTTPS communication with backend
- Session management with backend
- Proper cleanup on logout

## 📱 Platform Support

- ✅ iOS (tested on simulator & device)
- ✅ Android (tested on emulator & device)
- ✅ Web (basic support via Expo web)

## 🎬 User Flows

### First Time User
1. App opens → Setup screen
2. Enter backend URL + password → Save
3. Redirected to Login screen
4. Login → Home screen with media library

### Returning User
1. App opens → Auto-login check
2. If authenticated → Home screen
3. If not → Login screen

### Playing Media
1. Browse Library → Tap media card
2. Player opens (full-screen modal)
3. Video/audio plays automatically
4. Controls: play/pause, seek, volume
5. Actions: Download, VLC, Share
6. Close button returns to library

## 🛠️ Configuration

### Change Backend URL
1. Go to Settings tab
2. View current backend URL
3. To change: requires app reinstall or code modification

### Settings Options
- **Wi-Fi Only**: Enable to restrict downloads to Wi-Fi
- **Auto-Delete**: Enable to auto-delete old downloads
- **Retention Days**: 30 days (default, configurable in code)

## 🐛 Troubleshooting

**Login fails**:
- Check backend URL is correct
- Verify admin password matches backend
- Check network connection
- Ensure backend server is running

**Media won't play**:
- Check media status is "completed"
- Verify file exists on server
- Check network connection for streaming
- For downloads, verify local file exists

**VLC won't open**:
- Install VLC app from App Store / Play Store
- Grant permissions if prompted
- Use Share option as fallback

**Downloads fail**:
- Check available storage space
- Verify network connection
- Check Wi-Fi only setting
- Retry from player screen

## 📝 Future Enhancements

- [ ] Push notifications for download completion
- [ ] Offline mode indicator
- [ ] Video quality selection
- [ ] Picture-in-picture mode
- [ ] Chromecast support
- [ ] Playlist creation
- [ ] Watch history
- [ ] Recently played section
- [ ] Sort and filter options
- [ ] Batch download
- [ ] Background refresh

## 🙏 Credits

Built with:
- [Expo](https://expo.dev/)
- [React Native](https://reactnative.dev/)
- [Zustand](https://github.com/pmndrs/zustand)
- [TanStack Query](https://tanstack.com/query)

Backend from: [YT-Download](https://github.com/Mattjhagen/YT-Download)

---

**FinchWire** - Your personal media streaming companion 🎬
