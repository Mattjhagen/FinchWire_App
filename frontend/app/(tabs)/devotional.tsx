import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../../src/utils/theme';
import { apiService } from '../../src/services/api';
import { DevotionalResponse } from '../../src/types';

export default function DevotionalScreen() {
  const [devotional, setDevotional] = useState<DevotionalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevotional = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const data = await apiService.getDevotional();
      setDevotional(data);
    } catch (err: any) {
      console.error('Failed to fetch devotional:', err);
      setError(err.message || 'Unable to load today\'s word.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDevotional();
  }, [fetchDevotional]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDevotional(true);
  };

  const handleShare = async () => {
    if (!devotional) return;
    try {
      await Share.share({
        message: `FinchWire Daily Word: ${devotional.reference}\n\n"${devotional.text}"\n\nRead more in the FinchWire app.`,
      });
    } catch (error) {
      console.error('Sharing failed:', error);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Gathering today's word...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => fetchDevotional()}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : devotional ? (
          <>
            <View
              style={styles.headerCard}
            >
              <View style={styles.headerTop}>
                <Ionicons name="book" size={24} color="#FFF" />
                <TouchableOpacity onPress={handleShare}>
                  <Ionicons name="share-outline" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
              <Text style={styles.verseText}>"{devotional.text}"</Text>
              <Text style={styles.referenceText}>
                {devotional.reference} {devotional.translation && `(${devotional.translation})`}
              </Text>
            </View>

            <Section title="Context" icon="information-circle" content={devotional.context} />
            <Section title="Application" icon="walk" content={devotional.application} />
            <Section title="The World Today" icon="earth" content={devotional.current_events} />
            <Section title="Prayer" icon="heart" content={devotional.prayer} isLast />

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Powering your spiritual journey with FinchWire AI.
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Section({ title, icon, content, isLast = false }: { 
  title: string; 
  icon: any; 
  content: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.section, isLast && { marginBottom: 40 }]}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={20} color={colors.primary} style={styles.sectionIcon} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionContent}>
        <Text style={styles.sectionText}>{content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.md,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.md,
  },
  headerCard: {
    backgroundColor: colors.primary,
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  verseText: {
    ...typography.h2,
    color: '#FFF',
    fontStyle: 'italic',
    lineHeight: 32,
    marginBottom: spacing.md,
  },
  referenceText: {
    ...typography.body,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'right',
  },
  section: {
    backgroundColor: colors.backgroundLight,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionIcon: {
    marginRight: spacing.sm,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionContent: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
  },
  sectionText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  errorContainer: {
    alignItems: 'center',
    padding: spacing.xxl,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    ...typography.body,
    color: '#FFF',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  footerText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
