// Download Service for local file management
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

class DownloadService {
  private downloadsDir: string;

  constructor() {
    if (Platform.OS === 'web') {
      this.downloadsDir = '';
      return;
    }
    // Use app's document directory for downloads
    this.downloadsDir = `${FileSystem.documentDirectory}downloads/`;
    this.ensureDownloadDirectory();
  }

  private async ensureDownloadDirectory() {
    if (Platform.OS === 'web') return;
    const dirInfo = await FileSystem.getInfoAsync(this.downloadsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.downloadsDir, { intermediates: true });
    }
  }

  private sanitizeLocalFilename(filename: string): string {
    const fallback = `media_${Date.now()}.mp4`;
    const input = String(filename || '').trim();
    if (!input) return fallback;

    const cleaned = input
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/[^\w.\-]+/g, '_')
      .replace(/^_+/, '')
      .replace(/_+/g, '_')
      .slice(0, 180);

    if (!cleaned) return fallback;
    return cleaned;
  }

  async downloadMedia(
    mediaId: string,
    mediaUrl: string,
    filename: string,
    requestHeaders?: Record<string, string>,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    await this.ensureDownloadDirectory();

    const safeFilename = this.sanitizeLocalFilename(filename || `${mediaId}.mp4`);
    const localPath = `${this.downloadsDir}${safeFilename}`;

    const downloadResumable = FileSystem.createDownloadResumable(
      mediaUrl,
      localPath,
      requestHeaders ? { headers: requestHeaders } : undefined,
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress * 100);
      }
    );

    try {
      const result = await downloadResumable.downloadAsync();
      if (!result) {
        throw new Error('Download failed');
      }
      return result.uri;
    } catch (error) {
      console.error('Download error:', error);
      // Clean up partial download
      await this.deleteLocalFile(localPath);
      throw error;
    }
  }

  async deleteLocalFile(localPath: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(localPath);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }

  async getLocalFileInfo(localPath: string): Promise<FileSystem.FileInfo> {
    return await FileSystem.getInfoAsync(localPath);
  }

  async getDownloadedFiles(): Promise<string[]> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.downloadsDir);
      return files;
    } catch (error) {
      console.error('Error reading downloads directory:', error);
      return [];
    }
  }
}

export const downloadService = new DownloadService();
