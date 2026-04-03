// Add Screen - Download new media
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { apiService } from '../../src/services/api';

export default function AddScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a video URL or search phrase');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiService.submitDownload({
        url: url.trim(),
        is_audio: isAudioOnly,
      });

      if (response && response.id) {
      Alert.alert(
        'Success',
        'Download job submitted successfully!',
          [
            { 
              text: 'Go to Downloads', 
              onPress: () => {
                setUrl('');
                router.push('/(tabs)/downloads');
              } 
            },
            { 
              text: 'OK', 
              onPress: () => setUrl('') 
            }
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to submit download');
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', (error as Error)?.message || 'Failed to connect to server. Ensure your backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="cloud-download" size={60} color={colors.primary} />
          <Text style={styles.title}>Download to Server</Text>
          <Text style={styles.subtitle}>
            Paste a direct URL or type a search phrase. FinchWire will queue the best match to your server.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Video URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://... or search topic (example: joe rogan theo von)"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline={true}
            numberOfLines={2}
          />

          <View style={styles.optionsContainer}>
            <TouchableOpacity 
              style={styles.optionRow} 
              onPress={() => setIsAudioOnly(!isAudioOnly)}
            >
              <Ionicons 
                name={isAudioOnly ? 'checkbox' : 'square-outline'} 
                size={24} 
                color={isAudioOnly ? colors.primary : colors.textTertiary} 
              />
              <Text style={styles.optionLabel}>Download as Audio Only (.mp3)</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, (!url.trim() || isLoading) && styles.buttonDisabled]}
            onPress={handleDownload}
            disabled={!url.trim() || isLoading}
          >
            <Ionicons name="cloud-upload" size={24} color={colors.buttonText} style={styles.buttonIcon} />
            <Text style={styles.buttonText}>
              {isLoading ? 'Submitting...' : 'Download to Server'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.infoText}>
            The server will process the download in the background. You can track progress in the Downloads tab.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  title: {
    ...typography.h1,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  form: {
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  optionsContainer: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionLabel: {
    ...typography.body,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.buttonText,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  infoText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
});
