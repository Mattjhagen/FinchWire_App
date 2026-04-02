// Home Screen - Media Library (YouTube style)
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../../src/utils/theme';
import { apiService } from '../../src/services/api';
import { MediaCard } from '../../src/components/MediaCard';
import { Loading } from '../../src/components/Loading';
import { EmptyState } from '../../src/components/EmptyState';
import { MediaJob } from '../../src/types';

export default function HomeScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: mediaList, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['media'],
    queryFn: () => apiService.getMediaList(),
    refetchInterval: (query) => query.state.status === 'error' ? false : 5000,
    retry: 1,
    retryDelay: 3000,
  });

  const filteredMedia = React.useMemo(() => {
    if (!mediaList) return [];
    if (!searchQuery) return mediaList;

    const query = searchQuery.toLowerCase();
    return mediaList.filter((media) =>
      media.filename?.toLowerCase().includes(query) ||
      media.source_domain?.toLowerCase().includes(query)
    );
  }, [mediaList, searchQuery]);

  const handleMediaPress = (media: MediaJob) => {
    if (media.status === 'completed') {
      router.push(`/player/${media.id}`);
    } else if (media.status === 'failed') {
      Alert.alert(
        'Download Failed',
        media.error_message || 'This download failed',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Retry',
            onPress: async () => {
              try {
                await apiService.retryDownload(media.id);
                refetch();
              } catch (error) {
                Alert.alert('Error', 'Failed to retry download');
              }
            },
          },
        ]
      );
    } else if (media.status === 'downloading' || media.status === 'queued') {
      Alert.alert('Info', `This download is ${media.status}`);
    }
  };

  const handleMediaLongPress = (media: MediaJob) => {
    Alert.alert(
      media.filename,
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteJob(media.id);
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete item');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return <Loading message="Loading library..." />;
  }

  if (error) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Cannot reach server"
        message={(error as Error).message}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search your library..."
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Media List */}
      {filteredMedia.length === 0 ? (
        <EmptyState
          icon="cloud-download-outline"
          title="No media found"
          message="Your library is empty or no results match your search"
        />
      ) : (
        <FlatList
          data={filteredMedia}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MediaCard
              media={item}
              onPress={() => handleMediaPress(item)}
              onLongPress={() => handleMediaLongPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
    marginHorizontal: spacing.md,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.sm,
  },
  listContent: {
    padding: spacing.md,
  },
});
