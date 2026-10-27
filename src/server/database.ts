import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { Asset, Conversation, TaskRecord, TaskStep, ChatMessage, UserSettings } from '../types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_STORAGE = path.resolve(__dirname, '../../storage');
const DB_SQLITE_PATH = path.join(ROOT_STORAGE, 'modagpt.sqlite');

if (!fs.existsSync(ROOT_STORAGE)) {
  fs.mkdirSync(ROOT_STORAGE, { recursive: true });
}

// Initialize SQLite database instance
const db = new DatabaseSync(DB_SQLITE_PATH);

// Configure high performance and ACID integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// Create transactional relational schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'designer',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    task_id TEXT,
    attachments TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    tools_called TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS task_steps (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    tool TEXT,
    details TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER NOT NULL DEFAULT 1024,
    height INTEGER NOT NULL DEFAULT 1024,
    tool TEXT NOT NULL,
    prompt TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    conversation_id TEXT,
    task_id TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_conv ON tasks(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(task_id);
  CREATE INDEX IF NOT EXISTS idx_assets_tool ON assets(tool);
`);

// Default initial settings
const defaultSettings: UserSettings = {
  userName: 'Moda Designer',
  email: 'fsososocc@gmail.com',
  language: 'zh-CN',
  region: '中国 / 亚太',
  emailNotifications: true,
  twoFactorAuth: false,
  quotaRemaining: 840,
  quotaTotal: 1000,
  planName: '商业高级版 (Commercial Pro)',
  providers: [
    { name: 'Google GenAI (Gemini 3.1 / 3.8)', status: 'connected', model: 'gemini-3.1-flash-lite', quotaUsed: 160 },
    { name: 'Moda Precision Deterministic Engine', status: 'connected', model: 'Sharp-V2-Engine', quotaUsed: 88 },
    { name: 'Veo Runway Video Engine', status: 'unconnected', model: 'veo-2.0-preview (待授权)', quotaUsed: 0 },
  ],
};

// Seed default conversation & settings if empty
const countConvStmt = db.prepare('SELECT count(*) as cnt FROM conversations');
const convRow = countConvStmt.get() as { cnt: number };
if (convRow.cnt === 0) {
  const insertConv = db.prepare(`
    INSERT INTO conversations (id, title, message_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  insertConv.run('conv-init', 'ModaGPT 生产级创作空间', 0, now, now);
}

const getSettingStmt = db.prepare('SELECT value FROM system_settings WHERE key = ?');
const settingRow = getSettingStmt.get('user_settings') as { value: string } | undefined;
if (!settingRow) {
  const insertSetting = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)');
  insertSetting.run('user_settings', JSON.stringify(defaultSettings));
}

export const DatabaseService = {
  // Asset operations
  insertAsset(asset: Asset): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO assets (
        id, name, type, url, thumbnail_url, size_bytes, width, height,
        tool, prompt, version, conversation_id, task_id, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      asset.id,
      asset.name,
      asset.type,
      asset.url,
      asset.thumbnailUrl ?? asset.url,
      asset.sizeBytes ?? 0,
      asset.width ?? 1024,
      asset.height ?? 1024,
      asset.metadata.tool,
      asset.metadata.prompt || '',
      asset.metadata.version || 1,
      asset.metadata.conversationId ?? null,
      asset.metadata.taskId ?? null,
      JSON.stringify(asset.metadata),
      asset.createdAt
    );
  },

  getAsset(id: string): Asset | undefined {
    const stmt = db.prepare('SELECT * FROM assets WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      type: row.type as 'image' | 'video',
      url: row.url,
      thumbnailUrl: row.thumbnail_url,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  },

  listAssets(tool?: string, search?: string): Asset[] {
    let query = 'SELECT * FROM assets WHERE 1=1';
    const params: any[] = [];

    if (tool && tool !== 'all') {
      query += ' AND tool = ?';
      params.push(tool);
    }
    if (search && search.trim()) {
      query += ' AND (name LIKE ? OR prompt LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s);
    }
    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as 'image' | 'video',
      url: row.url,
      thumbnailUrl: row.thumbnail_url,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
  },

  deleteAsset(id: string): boolean {
    const stmt = db.prepare('DELETE FROM assets WHERE id = ?');
    stmt.run(id);
    return true;
  },

  // Task operations
  saveTask(task: TaskRecord): void {
    const insertTask = db.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, conversation_id, user_prompt, status, tools_called, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertTask.run(
      task.id,
      task.conversationId,
      task.userPrompt,
      task.status,
      JSON.stringify(task.toolsCalled),
      task.createdAt,
      task.completedAt || null
    );

    // Save steps
    const deleteSteps = db.prepare('DELETE FROM task_steps WHERE task_id = ?');
    deleteSteps.run(task.id);

    const insertStep = db.prepare(`
      INSERT INTO task_steps (
        id, task_id, step_order, title, status, tool, details, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    task.steps.forEach((step, index) => {
      insertStep.run(
        step.id,
        task.id,
        index,
        step.title,
        step.status,
        step.tool || null,
        step.details || '',
        step.durationMs || 0
      );
    });
  },

  getTask(id: string): TaskRecord | undefined {
    const taskStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const taskRow = taskStmt.get(id) as any;
    if (!taskRow) return undefined;

    const stepsStmt = db.prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY step_order ASC');
    const stepRows = stepsStmt.all(id) as any[];

    const steps: TaskStep[] = stepRows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      tool: r.tool || undefined,
      details: r.details || undefined,
      durationMs: r.duration_ms,
    }));

    // Find output assets linked to this task
    const assetsStmt = db.prepare('SELECT * FROM assets WHERE task_id = ?');
    const assetRows = assetsStmt.all(id) as any[];
    const outputAssets: Asset[] = assetRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as 'image' | 'video',
      url: row.url,
      thumbnailUrl: row.thumbnail_url,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}'),
    }));

    return {
      id: taskRow.id,
      conversationId: taskRow.conversation_id,
      userPrompt: taskRow.user_prompt,
      status: taskRow.status as TaskRecord['status'],
      steps,
      toolsCalled: JSON.parse(taskRow.tools_called || '[]'),
      outputAssets,
      createdAt: taskRow.created_at,
      completedAt: taskRow.completed_at || undefined,
    };
  },

  // Conversation operations
  getConversations(): Conversation[] {
    const stmt = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC');
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      messageCount: r.message_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  createConversation(title: string): Conversation {
    const id = `conv-${Date.now()}`;
    const now = Date.now();
    const cleanTitle = title || '新创作任务';

    const stmt = db.prepare(`
      INSERT INTO conversations (id, title, message_count, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)
    `);
    stmt.run(id, cleanTitle, now, now);

    return {
      id,
      title: cleanTitle,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  },

  deleteConversation(id: string): boolean {
    const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
    stmt.run(id);
    return true;
  },

  // Message operations
  getMessages(conversationId: string): ChatMessage[] {
    const stmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
    const rows = stmt.all(conversationId) as any[];

    return rows.map((r) => {
      let taskRecord: TaskRecord | undefined = undefined;
      if (r.task_id) {
        taskRecord = this.getTask(r.task_id);
      }

      return {
        id: r.id,
        conversationId: r.conversation_id,
        role: r.role as 'user' | 'assistant',
        content: r.content,
        taskId: r.task_id || undefined,
        taskRecord,
        attachments: JSON.parse(r.attachments || '[]'),
        createdAt: r.created_at,
      };
    });
  },

  addMessage(msg: ChatMessage): void {
    const stmt = db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, task_id, attachments, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      msg.id,
      msg.conversationId,
      msg.role,
      msg.content,
      msg.taskId || null,
      JSON.stringify(msg.attachments || []),
      msg.createdAt
    );

    // Update conversation message count and updatedAt
    const countStmt = db.prepare('SELECT count(*) as count FROM messages WHERE conversation_id = ?');
    const countRes = countStmt.get(msg.conversationId) as { count: number };

    const updateConv = db.prepare(`
      UPDATE conversations 
      SET message_count = ?, updated_at = ?
      WHERE id = ?
    `);
    updateConv.run(countRes.count, Date.now(), msg.conversationId);
  },

  // Settings
  getSettings(): UserSettings {
    const stmt = db.prepare('SELECT value FROM system_settings WHERE key = ?');
    const row = stmt.get('user_settings') as { value: string } | undefined;
    if (!row) return defaultSettings;
    try {
      return JSON.parse(row.value);
    } catch {
      return defaultSettings;
    }
  },

  updateSettings(patch: Partial<UserSettings>): UserSettings {
    const current = this.getSettings();
    const updated = { ...current, ...patch };
    const stmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
    stmt.run('user_settings', JSON.stringify(updated));
    return updated;
  },
};
