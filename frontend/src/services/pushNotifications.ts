import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Project ID from app.json extra.eas.projectId — required by Expo SDK 50+
const EXPO_PROJECT_ID: string =
  Constants.expoConfig?.extra?.eas?.projectId ?? 'bd5bc628-9fdd-4f3c-96d0-4b08e2daec19';

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

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    const token = tokenResponse.data;
    if (!token) {
      throw new Error('Could not retrieve Expo push token.');
    }

    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    return token;
  }
}

export const pushNotificationsService = new PushNotificationsService();
