// Download Service for local file management
import * as FileSystem from 'expo-file-system';
import { LocalMedia } from '../types';

class DownloadService {
  private downloadsDir: string;

  constructor() {
    // Use app's document directory for downloads
    this.downloadsDir = `${FileSystem.documentDirectory}downloads/`;
    this.ensureDownloadDirectory();
  }

  private async ensureDownloadDirectory() {
    const dirInfo = await FileSystem.getInfoAsync(this.downloadsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.downloadsDir, { intermediates: true });
    }
  }

  async downloadMedia(
    mediaId: string,
    mediaUrl: string,
    filename: string,
    authToken: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    await this.ensureDownloadDirectory();
    
    const localPath = `${this.downloadsDir}${filename}`;

    const downloadResumable = FileSystem.createDownloadResumable(
      mediaUrl,
      localPath,
      {
        headers: {
          'x-finchwire-token': authToken,
        },
      },
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
