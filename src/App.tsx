import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { StudioView } from './components/StudioView.tsx';
import { LibraryView } from './components/LibraryView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { ImagePreviewModal } from './components/ImagePreviewModal.tsx';
import { Asset, ChatMessage, Conversation, UserSettings } from './types/index.ts';
import { DigitalLifeCanvas, dispatchDigitalLifeLifecycleEvent } from './components/DigitalLifeCanvas.tsx';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'home' | 'studio' | 'library' | 'settings'>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Core Data
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('conv-init');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
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
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [previewingAsset, setPreviewingAsset] = useState<Asset | null>(null);
  const [comparisonAsset, setComparisonAsset] = useState<Asset | null>(null);

  // Pre-load from backend API
  useEffect(() => {
    async function initData() {
      try {
        const [convRes, assetsRes, settingsRes] = await Promise.allSettled([
          fetch('/api/conversations').then((r) => r.json()),
          fetch('/api/assets').then((r) => r.json()),
          fetch('/api/settings').then((r) => r.json()),
        ]);

        if (convRes.status === 'fulfilled' && Array.isArray(convRes.value)) {
          setConversations(convRes.value);
          if (convRes.value.length > 0) {
            setActiveConversationId(convRes.value[0].id);
          }
        }
        if (assetsRes.status === 'fulfilled' && Array.isArray(assetsRes.value)) {
          setAssets(assetsRes.value);
        }
        if (settingsRes.status === 'fulfilled' && settingsRes.value) {
          setSettings(settingsRes.value);
        }
      } catch (err) {
        console.warn('Backend load notice:', err);
      }
    }

    initData();
  }, []);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) return;

    fetch(`/api/conversations/${activeConversationId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(data);
        }
      })
      .catch(() => {});
  }, [activeConversationId]);

  // Handle user sending message / command
  const handleSendMessage = async (
    text: string,
    attachments: string[],
    templateIntent?: string,
    extraSlots?: {
      garmentImage?: string;
      modelImage?: string;
      sourceImage?: string;
    }
  ) => {
    setIsGenerating(true);
    setCurrentTab('studio');
    dispatchDigitalLifeLifecycleEvent({
      type: 'AI_REQUEST_DISPATCH',
      payload: { prompt: text },
    });

    const effectiveAttachments = [...attachments];
    if (extraSlots?.garmentImage && !effectiveAttachments.includes(extraSlots.garmentImage)) {
      effectiveAttachments.push(extraSlots.garmentImage);
    }
    if (extraSlots?.modelImage && !effectiveAttachments.includes(extraSlots.modelImage)) {
      effectiveAttachments.push(extraSlots.modelImage);
    }
    if (extraSlots?.sourceImage && !effectiveAttachments.includes(extraSlots.sourceImage)) {
      effectiveAttachments.push(extraSlots.sourceImage);
    }

    const tempUserMsg: ChatMessage = {
      id: `msg-${Date.now()}-temp`,
      conversationId: activeConversationId,
      role: 'user',
      content: text,
      attachments: effectiveAttachments,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          attachments: effectiveAttachments,
          conversationId: activeConversationId,
          templateIntent,
          ...extraSlots,
        }),
      });

      if (!response.ok) {
        throw new Error('创作任务处理失败');
      }

      // Signal stream chunk reception
      dispatchDigitalLifeLifecycleEvent({ type: 'AI_STREAM_CHUNK' });

      const data = await response.json();

      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      }

      if (data.task?.outputAssets && data.task.outputAssets.length > 0) {
        setAssets((prev) => [...data.task.outputAssets, ...prev]);
      }

      setSettings((prev) => ({
        ...prev,
        quotaRemaining: Math.max(0, prev.quotaRemaining - 4),
      }));

      // Update conversation title
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? { ...c, title: text.slice(0, 18), updatedAt: Date.now(), messageCount: (c.messageCount || 0) + 2 }
            : c
        )
      );

      // Signal genuine task completion
      dispatchDigitalLifeLifecycleEvent({
        type: 'AI_TASK_COMPLETED',
        requestId: data.task?.id,
      });
    } catch (err: any) {
      console.error('Task error:', err);
      dispatchDigitalLifeLifecycleEvent({
        type: 'AI_TASK_FAILED',
        payload: { error: err?.message || '网络连接或服务暂时不可用' },
      });
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        conversationId: activeConversationId,
        role: 'assistant',
        content: `任务执行异常：${err?.message || '网络连接或服务暂时不可用'}。已保留您的输入素材。`,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStopGeneration = () => {
    dispatchDigitalLifeLifecycleEvent({ type: 'AI_TASK_CANCELLED' });
    setIsGenerating(false);
  };

  // Create new conversation
  const handleNewConversation = async () => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新创作任务' }),
      });
      const newConv = await res.json();
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages([]);
      setCurrentTab('studio');
    } catch {
      const fallbackId = `conv-${Date.now()}`;
      const fallbackConv: Conversation = {
        id: fallbackId,
        title: '新创作任务',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
      };
      setConversations((prev) => [fallbackConv, ...prev]);
      setActiveConversationId(fallbackId);
      setMessages([]);
      setCurrentTab('studio');
    }
  };

  const handleCompareAsset = (asset: Asset, original?: Asset | null) => {
    let parent = original || null;
    if (!parent && asset.metadata.parentAssetId) {
      parent = assets.find((a) => a.id === asset.metadata.parentAssetId || a.url === asset.metadata.parentAssetId) || null;
    }
    setComparisonAsset(parent);
    setPreviewingAsset(asset);
  };

  const handleSelectForEdit = (asset: Asset) => {
    setCurrentTab('studio');
    handleSendMessage(
      `请基于该作品 (${asset.name}) 进行新一轮改版与微调，保留核心轮廓，优化细节质感。`,
      [asset.url],
      asset.metadata.tool
    );
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      await fetch(`/api/assets/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Asset deletion error:', err);
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const handleUploadAsset = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;

      try {
        const res = await fetch('/api/assets/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            dataUrl,
            metadata: { tool: 'fashion_design', prompt: '用户本地上传素材' },
          }),
        });
        const savedAsset = await res.json();
        setAssets((prev) => [savedAsset, ...prev]);
      } catch (err) {
        console.warn('Upload API notice:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateSettings = async (newSettings: Partial<UserSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.warn('Settings update notice:', err);
    }
  };

  const handleExportData = () => {
    const exportBundle = {
      exportedAt: new Date().toISOString(),
      user: settings,
      conversations,
      messages,
      assetsCount: assets.length,
      assets,
    };

    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modagpt-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const currentTitle = activeConv ? activeConv.title : 'ModaGPT 创作空间';

  const isStudioWorkspace = currentTab === 'home' || currentTab === 'studio';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-900 select-none relative">
      {/* Global 3D Digital Life WebGL Canvas */}
      <DigitalLifeCanvas conversationId={activeConversationId} isGenerating={isGenerating} />

      {/* Fixed 4-Entry Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'home') {
            setCurrentTab('home');
          } else if (tab === 'studio') {
            setCurrentTab('studio');
          } else {
            setCurrentTab(tab);
          }
        }}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          setCurrentTab('studio');
        }}
        onNewConversation={handleNewConversation}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {isStudioWorkspace && (
          <StudioView
            isHome={currentTab === 'home'}
            conversationId={activeConversationId}
            conversationTitle={currentTitle}
            messages={messages}
            onSendMessage={handleSendMessage}
            isGenerating={isGenerating}
            onStopGeneration={handleStopGeneration}
            onPreviewAsset={(asset) => {
              setComparisonAsset(null);
              setPreviewingAsset(asset);
            }}
            onCompareAsset={handleCompareAsset}
            onSelectForEdit={handleSelectForEdit}
            recentAssets={assets}
          />
        )}

        {currentTab === 'library' && (
          <LibraryView
            assets={assets}
            onPreviewAsset={(asset) => {
              setComparisonAsset(null);
              setPreviewingAsset(asset);
            }}
            onSelectForEdit={handleSelectForEdit}
            onDeleteAsset={handleDeleteAsset}
            onUploadAsset={handleUploadAsset}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onExportData={handleExportData}
          />
        )}
      </main>

      {/* Image / Video Preview & Comparison Modal */}
      <ImagePreviewModal
        asset={previewingAsset}
        comparisonAsset={comparisonAsset}
        onClose={() => {
          setPreviewingAsset(null);
          setComparisonAsset(null);
        }}
        onSelectForEdit={handleSelectForEdit}
      />
    </div>
  );
}
