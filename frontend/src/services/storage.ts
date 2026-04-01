// Storage Service for local database (SQLite)
import { Platform } from 'react-native';
import { LocalMedia } from '../types';

// Lazy import SQLite only on native platforms
let SQLite: any = null;
if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
}

class StorageService {
  private db: any = null;
  private isWeb = Platform.OS === 'web';

  async init() {
    // Skip initialization on web
    if (this.isWeb) {
      console.log('Storage service: Skipping SQLite on web platform');
      return;
    }

    try {
      this.db = SQLite.openDatabase('finchwire.db');
      await this.createTables();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async createTables() {
    if (!this.db || this.isWeb) return;

    return new Promise<void>((resolve, reject) => {
      this.db.transaction(
        (tx: any) => {
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS local_media (
              id TEXT PRIMARY KEY,
              media_id TEXT NOT NULL,
              title TEXT NOT NULL,
              local_path TEXT NOT NULL,
              remote_url TEXT NOT NULL,
              kind TEXT NOT NULL,
              mime_type TEXT,
              file_size INTEGER NOT NULL,
              downloaded_at TEXT NOT NULL,
              last_played_at TEXT,
              play_count INTEGER DEFAULT 0
            )`
          );
          tx.executeSql(
            'CREATE INDEX IF NOT EXISTS idx_media_id ON local_media(media_id)'
          );
          tx.executeSql(
            'CREATE INDEX IF NOT EXISTS idx_last_played ON local_media(last_played_at)'
          );
        },
        (error: any) => reject(error),
        () => resolve()
      );
    });
  }

  async saveLocalMedia(media: LocalMedia): Promise<void> {
    if (this.isWeb) return; // No-op on web
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise<void>((resolve, reject) => {
      this.db.transaction(
        (tx: any) => {
          tx.executeSql(
            `INSERT OR REPLACE INTO local_media 
             (id, media_id, title, local_path, remote_url, kind, mime_type, file_size, downloaded_at, last_played_at, play_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              media.id,
              media.media_id,
              media.title,
              media.local_path,
              media.remote_url,
              media.kind,
              media.mime_type || null,
              media.file_size,
              media.downloaded_at,
              media.last_played_at || null,
              media.play_count,
            ]
          );
        },
        (error: any) => reject(error),
        () => resolve()
      );
    });
  }

  async getLocalMedia(mediaId: string): Promise<LocalMedia | null> {
    if (this.isWeb) return null; // No-op on web
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise<LocalMedia | null>((resolve, reject) => {
      this.db.transaction((tx: any) => {
        tx.executeSql(
          'SELECT * FROM local_media WHERE media_id = ?',
          [mediaId],
          (_: any, { rows }: any) => {
            if (rows.length > 0) {
              resolve(rows.item(0) as LocalMedia);
            } else {
              resolve(null);
            }
          },
          (_: any, error: any) => {
            reject(error);
            return false;
          }
        );
      });
    });
  }

  async getAllLocalMedia(): Promise<LocalMedia[]> {
    if (this.isWeb) return []; // No-op on web
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise<LocalMedia[]>((resolve, reject) => {
      this.db.transaction((tx: any) => {
        tx.executeSql(
          'SELECT * FROM local_media ORDER BY downloaded_at DESC',
          [],
          (_: any, { rows }: any) => {
            const items: LocalMedia[] = [];
            for (let i = 0; i < rows.length; i++) {
              items.push(rows.item(i) as LocalMedia);
            }
            resolve(items);
          },
          (_: any, error: any) => {
            reject(error);
            return false;
          }
        );
      });
    });
  }

  async deleteLocalMedia(id: string): Promise<void> {
    if (this.isWeb) return; // No-op on web
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise<void>((resolve, reject) => {
      this.db.transaction(
        (tx: any) => {
          tx.executeSql('DELETE FROM local_media WHERE id = ?', [id]);
        },
        (error: any) => reject(error),
        () => resolve()
      );
    });
  }

  async updatePlayCount(mediaId: string): Promise<void> {
    if (this.isWeb) return; // No-op on web
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise<void>((resolve, reject) => {
      this.db.transaction(
        (tx: any) => {
          tx.executeSql(
            `UPDATE local_media 
             SET play_count = play_count + 1, last_played_at = datetime('now')
             WHERE media_id = ?`,
            [mediaId]
          );
        },
        (error: any) => reject(error),
        () => resolve()
      );
    });
  }

  async getExpiredMedia(retentionDays: number): Promise<LocalMedia[]> {
    if (this.isWeb) return []; // No-op on web
    if (!this.db) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise<LocalMedia[]>((resolve, reject) => {
      this.db.transaction((tx: any) => {
        tx.executeSql(
          `SELECT * FROM local_media 
           WHERE last_played_at IS NOT NULL 
           AND datetime(last_played_at) < datetime('now', '-' || ? || ' days')`,
          [retentionDays],
          (_: any, { rows }: any) => {
            const items: LocalMedia[] = [];
            for (let i = 0; i < rows.length; i++) {
              items.push(rows.item(i) as LocalMedia);
            }
            resolve(items);
          },
          (_: any, error: any) => {
            reject(error);
            return false;
          }
        );
      });
    });
  }
}

export const storageService = new StorageService();
