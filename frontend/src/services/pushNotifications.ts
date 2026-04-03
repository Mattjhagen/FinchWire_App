import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const PUSH_TOKEN_STORAGE_KEY = '@finchwire_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class PushNotificationsService {
  getExpoProjectId(): string | null {
    // Works in Expo Go/dev clients and EAS builds.
    const fromEasConfig = (Constants as any)?.easConfig?.projectId;
    const fromExpoConfig = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
    const projectId = String(fromEasConfig || fromExpoConfig || '').trim();
    return projectId || null;
  }

  formatRegistrationError(error: unknown): string {
    const raw = String((error as any)?.message || error || '').trim();
    const lower = raw.toLowerCase();

    if (lower.includes('default firebaseapp is not initialized')) {
      return [
        'Android push setup is incomplete (Firebase is not initialized).',
        'Do this before the next Expo build:',
        '1) Add firebase/google-services.json in frontend/',
        '2) Set expo.android.googleServicesFile to ./firebase/google-services.json',
        '3) Upload FCM V1 credentials in Expo project settings',
        '4) Build a new APK (old builds will keep failing)',
      ].join('\n');
    }

    if (lower.includes('project id') && lower.includes('missing')) {
      return 'Expo projectId is missing in app config. Set expo.extra.eas.projectId, rebuild, then retry push.';
    }

    if (lower.includes('permission') && lower.includes('granted')) {
      return 'Push permission was denied. You can enable notifications in your phone Settings and try again.';
    }

    return raw || 'Could not enable push notifications.';
  }

  async getStoredPushToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  async clearStoredPushToken(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  async registerDeviceForPush(): Promise<string | null> {
    if (!Device.isDevice) {
      throw new Error('Push notifications require a physical device.');
    }

    const existing = await this.getStoredPushToken();
    if (existing) {
      return existing;
    }

    const { status: currentStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = currentStatus;
    if (currentStatus !== 'granted') {
      const permissionResponse = await Notifications.requestPermissionsAsync();
      finalStatus = permissionResponse.status;
    }

    if (finalStatus !== 'granted') {
      throw new Error('Push permission was not granted.');
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const projectId = this.getExpoProjectId();
    if (!projectId) {
      throw new Error('Expo project ID is missing from app config.');
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    if (!token) {
      throw new Error('Could not retrieve Expo push token.');
    }

    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    return token;
  }
}

export const pushNotificationsService = new PushNotificationsService();
