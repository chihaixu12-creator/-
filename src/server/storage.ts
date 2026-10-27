import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Asset, Conversation, TaskRecord, ChatMessage, UserSettings } from '../types/index.ts';
import { DatabaseService } from './database.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_STORAGE = path.resolve(__dirname, '../../storage');
const ASSETS_DIR = path.join(ROOT_STORAGE, 'assets');
const DB_JSON_FILE = path.join(ROOT_STORAGE, 'db.json');

// Ensure directories exist
if (!fs.existsSync(ROOT_STORAGE)) {
  fs.mkdirSync(ROOT_STORAGE, { recursive: true });
}
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Perform one-time migration from legacy db.json if present
if (fs.existsSync(DB_JSON_FILE)) {
  try {
    const raw = fs.readFileSync(DB_JSON_FILE, 'utf-8');
    const legacy = JSON.parse(raw);
    if (legacy.assets && Array.isArray(legacy.assets)) {
      for (const a of legacy.assets) {
        if (!DatabaseService.getAsset(a.id)) {
          DatabaseService.insertAsset(a);
        }
      }
    }
    if (legacy.tasks) {
      for (const t of Object.values(legacy.tasks) as TaskRecord[]) {
        if (!DatabaseService.getTask(t.id)) {
          DatabaseService.saveTask(t);
        }
      }
    }
  } catch (err) {
    console.warn('Legacy db.json migration notice:', err);
  }
}

export const StorageService = {
  // Save physical binary buffer as a real file and insert record into SQLite
  async saveBufferAsAsset(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    metadata: Asset['metadata']
  ): Promise<Asset> {
    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const safeFilename = `${id}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(ASSETS_DIR, safeFilename);

    await fs.promises.writeFile(filePath, buffer);
    const stats = await fs.promises.stat(filePath);

    const asset: Asset = {
      id,
      name: filename,
      type: mimeType.startsWith('video') ? 'video' : 'image',
      url: `/storage/assets/${safeFilename}`,
      thumbnailUrl: `/storage/assets/${safeFilename}`,
      createdAt: Date.now(),
      sizeBytes: stats.size,
      width: 1024,
      height: 1024,
      metadata,
    };

    DatabaseService.insertAsset(asset);
    return asset;
  },

  getAsset(id: string): Asset | undefined {
    return DatabaseService.getAsset(id);
  },

  listAssets(tool?: string, search?: string): Asset[] {
    return DatabaseService.listAssets(tool, search);
  },

  async deleteAsset(id: string): Promise<boolean> {
    const asset = DatabaseService.getAsset(id);
    if (!asset) return false;

    DatabaseService.deleteAsset(id);

    // Remove physical file from disk if located in storage/assets
    if (asset.url.startsWith('/storage/assets/')) {
      const filename = path.basename(asset.url);
      const filePath = path.join(ASSETS_DIR, filename);
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      } catch (e) {
        console.warn('Physical file cleanup notice:', e);
      }
    }
    return true;
  },

  // Task persistence in SQLite
  saveTask(task: TaskRecord) {
    DatabaseService.saveTask(task);
  },

  getTask(id: string): TaskRecord | undefined {
    return DatabaseService.getTask(id);
  },

  // Conversation persistence in SQLite
  getConversations(): Conversation[] {
    return DatabaseService.getConversations();
  },

  createConversation(title: string): Conversation {
    return DatabaseService.createConversation(title);
  },

  deleteConversation(id: string): boolean {
    return DatabaseService.deleteConversation(id);
  },

  getMessages(convId: string): ChatMessage[] {
    return DatabaseService.getMessages(convId);
  },

  addMessage(msg: ChatMessage) {
    DatabaseService.addMessage(msg);
  },

  // Settings in SQLite
  getSettings(): UserSettings {
    return DatabaseService.getSettings();
  },

  updateSettings(patch: Partial<UserSettings>): UserSettings {
    return DatabaseService.updateSettings(patch);
  },
};
