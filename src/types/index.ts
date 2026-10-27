export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_input'
  | 'succeeded'
  | 'partially_failed'
  | 'failed'
  | 'cancelled';

export interface TaskStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tool?: string;
  details?: string;
  durationMs?: number;
}

export type ToolType =
  | 'fashion_design'
  | 'virtual_tryon'
  | 'model_photoshoot'
  | 'image_refine_color'
  | 'runway_video'
  | 'garment_analysis';

export interface ToolRegistryItem {
  id: ToolType;
  name: string;
  version: string;
  status: 'active' | 'unconnected';
  description: string;
  inputRequirements: string[];
  outputFormat: string;
  provider: string;
  requiresConfirmation?: boolean;
}

export interface Asset {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  createdAt: number;
  sizeBytes?: number;
  width?: number;
  height?: number;
  metadata: {
    tool: ToolType;
    prompt: string;
    version: number;
    parentAssetId?: string;
    conversationId?: string;
    taskId?: string;
    fabricAnalysis?: {
      composition: string;
      weight: string;
      texture: string;
    };
    fitAudit?: {
      fitScore: number;
      shoulderAlignment: string;
      drapeEvaluation: string;
      preservationReport: string;
    };
    colorTransform?: {
      targetColor: string;
      preservedTexture: boolean;
    };
  };
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[];
  taskId?: string;
  createdAt: number;
  taskRecord?: TaskRecord;
}

export interface TaskRecord {
  id: string;
  conversationId: string;
  userPrompt: string;
  status: TaskStatus;
  steps: TaskStep[];
  toolsCalled: ToolType[];
  outputAssets: Asset[];
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface UserSettings {
  userName: string;
  email: string;
  language: string;
  region: string;
  emailNotifications: boolean;
  twoFactorAuth: boolean;
  quotaRemaining: number;
  quotaTotal: number;
  planName: string;
  providers: {
    name: string;
    status: 'connected' | 'unconnected';
    model: string;
    quotaUsed: number;
  }[];
}
