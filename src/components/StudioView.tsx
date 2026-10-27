import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Paperclip,
  Square,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Maximize2,
  RotateCw,
  BookmarkPlus,
  Play,
  ChevronDown,
  ChevronUp,
  X,
  Upload,
  FolderOpen,
  Sparkles,
  Layers,
  Camera,
  Wand2,
  Film,
  SplitSquareVertical,
  Mic,
  MicOff,
  Move,
  Minimize2,
  Orbit,
  Sparkle,
  Radio,
} from 'lucide-react';
import { Asset, ChatMessage, ToolType } from '../types/index.ts';
import { AssetPickerModal } from './AssetPickerModal.tsx';
import { SpatialBehaviorType } from '../engine/modaCoreEngine.ts';
import { useDigitalLifeCoordinator } from './DigitalLifeCanvas.tsx';
import NeuralLifeform from './lifeform/NeuralLifeform.jsx';

interface StudioViewProps {
  conversationId: string;
  conversationTitle: string;
  messages: ChatMessage[];
  onSendMessage: (
    text: string,
    attachments: string[],
    templateIntent?: string,
    extraSlots?: {
      garmentImage?: string;
      modelImage?: string;
      sourceImage?: string;
      parameters?: Record<string, any>;
    }
  ) => Promise<void>;
  isGenerating: boolean;
  onStopGeneration?: () => void;
  onPreviewAsset: (asset: Asset) => void;
  onCompareAsset?: (asset: Asset, original?: Asset | null) => void;
  onSelectForEdit: (asset: Asset) => void;
  recentAssets: Asset[];
  isHome?: boolean;
}

export const StudioView: React.FC<StudioViewProps> = ({
  conversationTitle,
  messages,
  onSendMessage,
  isGenerating,
  onStopGeneration,
  onPreviewAsset,
  onCompareAsset,
  onSelectForEdit,
  recentAssets,
  isHome = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [activeIntent, setActiveIntent] = useState<ToolType | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Dynamic slot states
  const [garmentImage, setGarmentImage] = useState<string | null>(null);
  const [modelImage, setModelImage] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [designRefImage, setDesignRefImage] = useState<string | null>(null);
  const [videoRefImage, setVideoRefImage] = useState<string | null>(null);

  // Foldable advanced parameter panels
  const [isParamsCollapsed, setIsParamsCollapsed] = useState(false);

  // 1. AI设计参数
  const [designCategory, setDesignCategory] = useState('外套/大衣');
  const [designStyle, setDesignStyle] = useState('极简高定');
  const [designFabric, setDesignFabric] = useState('100%山羊绒');
  const [designSilhouette, setDesignSilhouette] = useState('直筒H型');
  const [designQuantity, setDesignQuantity] = useState(1);

  // 2. AI换衣参数
  const [tryonFitRange, setTryonFitRange] = useState('整套换装');
  const [tryonGarmentPreserve, setTryonGarmentPreserve] = useState('保留版型与纽扣细节');
  const [tryonPersonPreserve, setTryonPersonPreserve] = useState('保持面部与原姿态');

  // 3. AI棚拍参数
  const [studioScene, setStudioScene] = useState('纯白无影棚');
  const [studioPose, setStudioPose] = useState('全身站姿');
  const [studioLighting, setStudioLighting] = useState('柔和棚灯 (5600K电商柔光)');
  const [studioRatio, setStudioRatio] = useState('3:4 商业画册');
  const [studioCount, setStudioCount] = useState(1);

  // 4. 高清换色参数
  const [selectedColorHex, setSelectedColorHex] = useState('#1A1A1A');
  const [selectedColorName, setSelectedColorName] = useState('纯深黑');
  const [customColorText, setCustomColorText] = useState('');
  const [preserveTexture, setPreserveTexture] = useState(true);

  // 5. 走秀视频参数
  const [runwayVenue, setRunwayVenue] = useState('巴黎大皇宫高定天桥');
  const [runwayCamera, setRunwayCamera] = useState('迎面缓步推镜');
  const [runwayDuration, setRunwayDuration] = useState('8 秒');
  const [runwayRatio, setRunwayRatio] = useState('16:9 横屏');

  // Unified Digital Life Coordinator (authoritative state machine & event arbiter)
  const coordinator = useDigitalLifeCoordinator();
  const lifeState = coordinator.state;
  const isListening = coordinator.isListening;
  const [activeSpatialBehavior, setActiveSpatialBehavior] = useState<SpatialBehaviorType | null>(null);

  // Asset picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<
    'garment' | 'model' | 'source' | 'designRef' | 'video' | null
  >(null);
  const [pickerTitle, setPickerTitle] = useState('');

  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [savedToLibraryStatus, setSavedToLibraryStatus] = useState<Record<string, boolean>>({});

  // File input refs
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const designRefInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const generalAttachmentRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  // Digital Life Viewport Anchors
  const heroAnchorRef = useRef<HTMLDivElement>(null);
  const activeAvatarRef = useRef<HTMLDivElement>(null);

  // Continuous Viewport Anchor Tracking Loop (Home <-> Chat Avatar)
  const hasMessages = !isHome && messages.length > 0;

  const updateAnchorPosition = useCallback(() => {
    if (!hasMessages) {
      if (heroAnchorRef.current) {
        coordinator.updateAnchor(heroAnchorRef.current);
      }
    } else {
      if (activeAvatarRef.current) {
        coordinator.updateAnchor(activeAvatarRef.current);
      } else if (heroAnchorRef.current) {
        coordinator.updateAnchor(heroAnchorRef.current);
      }
    }
  }, [hasMessages, coordinator]);

  useEffect(() => {
    let animId: number;
    const track = () => {
      updateAnchorPosition();
      animId = requestAnimationFrame(track);
    };
    animId = requestAnimationFrame(track);

    window.addEventListener('resize', updateAnchorPosition);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateAnchorPosition);
    };
  }, [updateAnchorPosition]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Exact 5 Core Buttons (Strict names and order)
  const coreFeatures: {
    label: string;
    intent: ToolType;
    icon: React.ComponentType<{ className?: string }>;
    defaultTemplate: string;
  }[] = [
    {
      label: 'AI 设计',
      intent: 'fashion_design',
      icon: Sparkles,
      defaultTemplate: '请设计一款秋冬羊绒大衣，大翻驳领廓形，保留天然牛角扣与双面呢质感。',
    },
    {
      label: 'AI 换衣',
      intent: 'virtual_tryon',
      icon: Layers,
      defaultTemplate: '请将左侧指定服装精准换穿到右侧模特身上，完美匹配身材褶皱与光影。',
    },
    {
      label: 'AI 棚拍',
      intent: 'model_photoshoot',
      icon: Camera,
      defaultTemplate: '为该套服装生成专业商业摄影棚拍大片，纯白无影棚柔光，呈现精细面料质感。',
    },
    {
      label: '高清换色',
      intent: 'image_refine_color',
      icon: Wand2,
      defaultTemplate: '将选定服装精准替换为目标颜色，100%保留原始织物纹理、车缝线与高光阴影。',
    },
    {
      label: '走秀视频',
      intent: 'runway_video',
      icon: Film,
      defaultTemplate: '将该服装设计转化为巴黎高定时装周T台走秀动态视频，模特自然缓步走台。',
    },
  ];

  const handleSelectFeature = (item: (typeof coreFeatures)[0]) => {
    if (activeIntent === item.intent) {
      setActiveIntent(undefined);
      setInputText('');
    } else {
      setActiveIntent(item.intent);
      setInputText(item.defaultTemplate);
      setValidationError(null);
      coordinator.dispatchSpatialCommand('ORBIT', 0.05);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    coordinator.dispatchInputTyping(val.length);
  };

  const handleInputFocus = () => {
    coordinator.dispatchInputFocus();
  };

  const handleInputBlur = () => {
    coordinator.dispatchInputBlur(inputText.length > 0);
  };

  const handleToggleVoice = async () => {
    if (isListening) {
      coordinator.stopListening();
    } else {
      await coordinator.startListening();
    }
  };

  const handleSpatialTrigger = (behavior: SpatialBehaviorType, val?: number) => {
    setActiveSpatialBehavior(behavior);
    coordinator.dispatchSpatialCommand(behavior, val);
    setTimeout(() => setActiveSpatialBehavior(null), 1200);
  };

  // Mandatory Validation Before Submission
  const validateForm = (): boolean => {
    setValidationError(null);

    if (activeIntent === 'virtual_tryon') {
      if (!garmentImage) {
        setValidationError('【AI 换衣】必须提供待试穿的服装图片');
        return false;
      }
      if (!modelImage) {
        setValidationError('【AI 换衣】必须提供目标人物或模特照片');
        return false;
      }
    }

    if (activeIntent === 'image_refine_color') {
      if (!sourceImage && attachments.length === 0) {
        setValidationError('【高清换色】必须提供待换色的服装原图');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = () => {
    if (isGenerating) return;
    if (!validateForm()) return;

    const hasAnyContent =
      inputText.trim() ||
      attachments.length > 0 ||
      garmentImage ||
      modelImage ||
      sourceImage ||
      videoRefImage ||
      designRefImage;

    if (!hasAnyContent) return;

    let promptToSend = inputText.trim();
    if (!promptToSend) {
      promptToSend = activeIntent
        ? coreFeatures.find((f) => f.intent === activeIntent)?.defaultTemplate || '执行服装视觉创作'
        : '执行服装视觉创作';
    }

    const extraSlots: Record<string, any> = {
      parameters: {},
    };

    if (activeIntent === 'fashion_design') {
      extraSlots.sourceImage = designRefImage || undefined;
      extraSlots.parameters = {
        category: designCategory,
        style: designStyle,
        fabric: designFabric,
        silhouette: designSilhouette,
        quantity: designQuantity,
      };
    } else if (activeIntent === 'virtual_tryon') {
      extraSlots.garmentImage = garmentImage || undefined;
      extraSlots.modelImage = modelImage || undefined;
      extraSlots.parameters = {
        fitRange: tryonFitRange,
        garmentPreserve: tryonGarmentPreserve,
        personPreserve: tryonPersonPreserve,
      };
    } else if (activeIntent === 'model_photoshoot') {
      extraSlots.garmentImage = garmentImage || undefined;
      extraSlots.parameters = {
        scene: studioScene,
        pose: studioPose,
        lighting: studioLighting,
        ratio: studioRatio,
        count: studioCount,
      };
    } else if (activeIntent === 'image_refine_color') {
      extraSlots.sourceImage = sourceImage || attachments[0] || undefined;
      extraSlots.parameters = {
        targetColorHex: selectedColorHex,
        targetColorName: customColorText.trim() || selectedColorName,
        preserveTexture,
      };
    } else if (activeIntent === 'runway_video') {
      extraSlots.sourceImage = videoRefImage || garmentImage || undefined;
      extraSlots.parameters = {
        venue: runwayVenue,
        camera: runwayCamera,
        duration: runwayDuration,
        aspectRatio: runwayRatio,
      };
    }

    onSendMessage(promptToSend, attachments, activeIntent, extraSlots);

    // Reset input fields
    setInputText('');
    setAttachments([]);
    setGarmentImage(null);
    setModelImage(null);
    setSourceImage(null);
    setDesignRefImage(null);
    setVideoRefImage(null);
    setValidationError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const readFileAsDataUrl = (file: File, callback: (url: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        callback(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const openAssetPicker = (
    target: 'garment' | 'model' | 'source' | 'designRef' | 'video',
    title: string
  ) => {
    setPickerTarget(target);
    setPickerTitle(title);
    setPickerOpen(true);
  };

  const handleAssetPicked = (asset: Asset) => {
    if (pickerTarget === 'garment') setGarmentImage(asset.url);
    if (pickerTarget === 'model') setModelImage(asset.url);
    if (pickerTarget === 'source') setSourceImage(asset.url);
    if (pickerTarget === 'designRef') setDesignRefImage(asset.url);
    if (pickerTarget === 'video') setVideoRefImage(asset.url);
    setPickerOpen(false);
  };

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleSaveToLibrary = async (asset: Asset) => {
    setSavedToLibraryStatus((prev) => ({ ...prev, [asset.id]: true }));
    try {
      await fetch('/api/assets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: asset.name,
          dataUrl: asset.url,
          metadata: asset.metadata,
        }),
      });
    } catch (err) {
      console.warn('Save notice:', err);
    }
  };

  const handleDownload = (asset: Asset) => {
    const a = document.createElement('a');
    a.href = asset.url;
    a.download = `${asset.name || 'modagpt-creation'}.${asset.type === 'video' ? 'mp4' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Dynamic Input Panels for the 5 Core Functions
  const renderDynamicInputPanel = () => {
    if (!activeIntent) return null;

    if (activeIntent === 'fashion_design') {
      const categories = ['外套/大衣', '连衣裙', '卫衣/T恤', '衬衫', '西装', '裤装/半身裙'];
      const styles = ['极简高定', '新中式国风', '先锋解构', '复古老钱风', '机能工装'];
      const fabrics = ['100%山羊绒', '双面真丝', '精纺羊毛', '重磅牛仔', '进口欧根纱'];
      const silhouettes = ['直筒H型', '收腰X型', '茧型O型', '阔版A型'];

      return (
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2.5 text-left text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[#07C2E3]" />
              <span className="font-medium text-gray-900">AI 设计参数配置</span>
            </div>
            <button
              type="button"
              onClick={() => setIsParamsCollapsed(!isParamsCollapsed)}
              className="text-xs text-gray-400 hover:text-gray-700 flex items-center space-x-0.5"
            >
              <span>{isParamsCollapsed ? '展开' : '收起'}</span>
              {isParamsCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-gray-500 font-medium">设计参考底图（选填）：</span>
            {designRefImage ? (
              <div className="flex items-center space-x-2 border border-gray-200 rounded p-1">
                <img src={designRefImage} alt="参考图" className="w-8 h-8 object-cover rounded" />
                <button
                  type="button"
                  onClick={() => setDesignRefImage(null)}
                  className="text-xs text-red-600 hover:text-red-700 px-1 py-0.5"
                >
                  移除
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <input
                  type="file"
                  ref={designRefInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readFileAsDataUrl(f, setDesignRefImage);
                    e.target.value = '';
                  }}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => designRefInputRef.current?.click()}
                  className="inline-flex items-center px-2 py-1 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  本地上传
                </button>
                <button
                  type="button"
                  onClick={() => openAssetPicker('designRef', '选择设计参考图')}
                  className="inline-flex items-center px-2 py-1 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700"
                >
                  <FolderOpen className="w-3 h-3 mr-1" />
                  素材库
                </button>
              </div>
            )}
          </div>

          {!isParamsCollapsed && (
            <div className="space-y-2 text-xs pt-1">
              <div>
                <span className="text-[11px] text-gray-500 font-medium block mb-1">服装品类：</span>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDesignCategory(c)}
                      className={`px-2 py-1 rounded text-[11px] transition-colors ${
                        designCategory === c
                          ? 'bg-black text-white font-medium'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-gray-500 font-medium block mb-1">设计风格：</span>
                <div className="flex flex-wrap gap-1.5">
                  {styles.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDesignStyle(s)}
                      className={`px-2 py-1 rounded text-[11px] transition-colors ${
                        designStyle === s
                          ? 'bg-black text-white font-medium'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-[11px] text-gray-500 font-medium block mb-1">面料偏好：</span>
                  <div className="flex flex-wrap gap-1.5">
                    {fabrics.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setDesignFabric(f)}
                        className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                          designFabric === f
                            ? 'bg-black text-white font-medium'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] text-gray-500 font-medium block mb-1">剪裁廓形：</span>
                  <div className="flex flex-wrap gap-1.5">
                    {silhouettes.map((sh) => (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => setDesignSilhouette(sh)}
                        className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                          designSilhouette === sh
                            ? 'bg-black text-white font-medium'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {sh}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeIntent === 'virtual_tryon') {
      const fitRanges = ['整套换装', '上装替换', '下装替换'];

      return (
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-3 text-left text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-[#07C2E3]" />
              <span className="font-medium text-gray-900">AI 换衣：必须输入素材槽位</span>
            </div>
            <span className="text-[11px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              两项必填
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Slot A: Garment Image */}
            <div className={`border rounded p-2.5 bg-gray-50/50 ${garmentImage ? 'border-emerald-300' : 'border-gray-300'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-900">1. 服装图片 (必填)</span>
                {garmentImage && <span className="text-[10px] text-emerald-600 font-medium">已就绪</span>}
              </div>

              {garmentImage ? (
                <div className="relative aspect-video sm:aspect-square bg-white border border-gray-200 rounded overflow-hidden">
                  <img src={garmentImage} alt="服装素材" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setGarmentImage(null)}
                    className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white p-1 rounded-full"
                    title="移除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="aspect-video sm:aspect-square border border-dashed border-gray-300 rounded flex flex-col items-center justify-center p-2 text-center bg-white">
                  <input
                    type="file"
                    ref={garmentInputRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) readFileAsDataUrl(f, setGarmentImage);
                      e.target.value = '';
                    }}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="flex flex-col sm:flex-row gap-1.5 w-full">
                    <button
                      type="button"
                      onClick={() => garmentInputRef.current?.click()}
                      className="flex-1 py-1 px-2 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700 bg-white"
                    >
                      本地上传
                    </button>
                    <button
                      type="button"
                      onClick={() => openAssetPicker('garment', '从素材库选择服装')}
                      className="flex-1 py-1 px-2 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700 bg-white"
                    >
                      素材库
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Slot B: Model Image */}
            <div className={`border rounded p-2.5 bg-gray-50/50 ${modelImage ? 'border-emerald-300' : 'border-gray-300'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-900">2. 模特/人像照片 (必填)</span>
                {modelImage && <span className="text-[10px] text-emerald-600 font-medium">已就绪</span>}
              </div>

              {modelImage ? (
                <div className="relative aspect-video sm:aspect-square bg-white border border-gray-200 rounded overflow-hidden">
                  <img src={modelImage} alt="模特素材" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setModelImage(null)}
                    className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white p-1 rounded-full"
                    title="移除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="aspect-video sm:aspect-square border border-dashed border-gray-300 rounded flex flex-col items-center justify-center p-2 text-center bg-white">
                  <input
                    type="file"
                    ref={modelInputRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) readFileAsDataUrl(f, setModelImage);
                      e.target.value = '';
                    }}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="flex flex-col sm:flex-row gap-1.5 w-full">
                    <button
                      type="button"
                      onClick={() => modelInputRef.current?.click()}
                      className="flex-1 py-1 px-2 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700 bg-white"
                    >
                      本地上传
                    </button>
                    <button
                      type="button"
                      onClick={() => openAssetPicker('model', '从素材库选择模特')}
                      className="flex-1 py-1 px-2 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700 bg-white"
                    >
                      素材库
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeIntent === 'model_photoshoot') {
      const scenes = ['纯白无影棚', '高定秀场后台', '日光落地窗', '工业灰水泥棚'];
      const poses = ['全身站姿', '半身特写', '步行动感', '自然倚靠'];

      return (
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2.5 text-left text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <Camera className="w-4 h-4 text-[#07C2E3]" />
              <span className="font-medium text-gray-900">AI 棚拍参数配置</span>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-gray-500 font-medium">服装拍摄素材：</span>
            {garmentImage ? (
              <div className="flex items-center space-x-2 border border-gray-200 rounded p-1">
                <img src={garmentImage} alt="拍摄素材" className="w-8 h-8 object-cover rounded" />
                <button
                  type="button"
                  onClick={() => setGarmentImage(null)}
                  className="text-xs text-red-600 hover:text-red-700 px-1 py-0.5"
                >
                  移除
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <input
                  type="file"
                  ref={garmentInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readFileAsDataUrl(f, setGarmentImage);
                    e.target.value = '';
                  }}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => garmentInputRef.current?.click()}
                  className="inline-flex items-center px-2 py-1 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  上传素材
                </button>
                <button
                  type="button"
                  onClick={() => openAssetPicker('garment', '选择拍摄服装素材')}
                  className="inline-flex items-center px-2 py-1 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700"
                >
                  <FolderOpen className="w-3 h-3 mr-1" />
                  素材库
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <div>
              <span className="text-[11px] text-gray-500 font-medium block mb-1">棚拍场景：</span>
              <div className="flex flex-wrap gap-1.5">
                {scenes.map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setStudioScene(sc)}
                    className={`px-2 py-1 rounded text-[11px] transition-colors ${
                      studioScene === sc
                        ? 'bg-black text-white font-medium'
                        : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[11px] text-gray-500 font-medium block mb-1">模特姿态：</span>
              <div className="flex flex-wrap gap-1.5">
                {poses.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setStudioPose(p)}
                    className={`px-2 py-1 rounded text-[11px] transition-colors ${
                      studioPose === p
                        ? 'bg-black text-white font-medium'
                        : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeIntent === 'image_refine_color') {
      const presetColors = [
        { name: '纯深黑', hex: '#1A1A1A' },
        { name: '驼色羊绒', hex: '#C19A6B' },
        { name: '勃艮第红', hex: '#800020' },
        { name: '月光雾蓝', hex: '#4A6B82' },
        { name: '橄榄墨绿', hex: '#3B4D3C' },
      ];

      return (
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-3 text-left text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <Wand2 className="w-4 h-4 text-[#07C2E3]" />
              <span className="font-medium text-gray-900">高清换色配置</span>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-gray-500 font-medium">待换色原图（必填）：</span>
            {sourceImage ? (
              <div className="flex items-center space-x-2 border border-gray-200 rounded p-1">
                <img src={sourceImage} alt="原图" className="w-8 h-8 object-cover rounded" />
                <button
                  type="button"
                  onClick={() => setSourceImage(null)}
                  className="text-xs text-red-600 hover:text-red-700 px-1 py-0.5"
                >
                  移除
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <input
                  type="file"
                  ref={sourceInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readFileAsDataUrl(f, setSourceImage);
                    e.target.value = '';
                  }}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => sourceInputRef.current?.click()}
                  className="inline-flex items-center px-2 py-1 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  上传原图
                </button>
                <button
                  type="button"
                  onClick={() => openAssetPicker('source', '选择待换色服装原图')}
                  className="inline-flex items-center px-2 py-1 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700"
                >
                  <FolderOpen className="w-3 h-3 mr-1" />
                  素材库
                </button>
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] text-gray-500 font-medium block mb-1">目标换色色票：</span>
            <div className="flex flex-wrap gap-2">
              {presetColors.map((col) => (
                <button
                  key={col.hex}
                  type="button"
                  onClick={() => {
                    setSelectedColorHex(col.hex);
                    setSelectedColorName(col.name);
                  }}
                  className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded border text-xs transition-all ${
                    selectedColorHex === col.hex
                      ? 'border-black bg-gray-50 font-medium shadow-xs'
                      : 'border-gray-200 bg-white hover:border-gray-400 text-gray-700'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: col.hex }} />
                  <span>{col.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activeIntent === 'runway_video') {
      const venues = ['巴黎大皇宫高定天桥', '米兰极简水泥长廊', '日落沙滩临海T台'];

      return (
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2.5 text-left text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <Film className="w-4 h-4 text-[#07C2E3]" />
              <span className="font-medium text-gray-900">走秀视频配置</span>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] text-gray-500 font-medium">走秀服装主图：</span>
            {videoRefImage ? (
              <div className="flex items-center space-x-2 border border-gray-200 rounded p-1">
                <img src={videoRefImage} alt="视频参考图" className="w-8 h-8 object-cover rounded" />
                <button
                  type="button"
                  onClick={() => setVideoRefImage(null)}
                  className="text-xs text-red-600 hover:text-red-700 px-1 py-0.5"
                >
                  移除
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <input
                  type="file"
                  ref={videoInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readFileAsDataUrl(f, setVideoRefImage);
                    e.target.value = '';
                  }}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="inline-flex items-center px-2 py-1 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  上传主图
                </button>
                <button
                  type="button"
                  onClick={() => openAssetPicker('video', '从素材库选择走秀服装')}
                  className="inline-flex items-center px-2 py-1 border border-gray-200 hover:border-gray-400 rounded text-xs text-gray-700"
                >
                  <FolderOpen className="w-3 h-3 mr-1" />
                  素材库
                </button>
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] text-gray-500 font-medium block mb-1">秀场场景：</span>
            <div className="flex flex-wrap gap-1.5">
              {venues.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRunwayVenue(v)}
                  className={`px-2 py-1 rounded text-[11px] transition-colors ${
                    runwayVenue === v
                      ? 'bg-black text-white font-medium'
                      : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white select-none overflow-hidden relative">
      {/* Top Header Bar */}
      <div className="h-12 border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between shrink-0 bg-white z-10">
        <div className="flex items-center space-x-2 truncate">
          <span className="text-xs font-semibold text-gray-900 truncate">
            {isHome ? '首页' : conversationTitle || 'AI 创作中心'}
          </span>
          <span className="hidden sm:inline-block text-[11px] text-gray-400 border-l border-gray-200 pl-2">
            {isHome ? 'ModaGPT 商业视觉创作平台' : 'AI 创作中心 · 对话工作区'}
          </span>
        </div>

        {/* Digital Life State Indicator */}
        <div className="flex items-center space-x-1.5 text-[11px] text-gray-500 font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              lifeState === 'thinking'
                ? 'bg-[#07C2E3] animate-ping'
                : lifeState === 'listening'
                ? 'bg-red-500 animate-pulse'
                : lifeState === 'responding'
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-gray-400'
            }`}
          />
          <span className="capitalize">{lifeState}</span>
        </div>
      </div>

      {/* Main Workspace Area (Scrollable) */}
      <div
        ref={chatScrollContainerRef}
        className="flex-1 overflow-y-auto p-3 sm:p-6 flex flex-col justify-between pb-24 md:pb-6"
      >
        <div className="max-w-4xl mx-auto w-full space-y-6 flex-1 flex flex-col justify-center">
          {/* 1. Empty State (Home Screen) */}
          {!hasMessages && (
            <div className="w-full max-w-[800px] mx-auto py-2 sm:py-6 flex flex-col items-center text-center space-y-4 sm:space-y-5">
              {/* ModaGPT 3D Neural Lifeform Organism */}
              <div className="w-full max-w-[560px] mx-auto flex flex-col items-center justify-center relative">
                <NeuralLifeform
                  activity={
                    isListening
                      ? 'listening'
                      : isGenerating || lifeState === 'thinking'
                      ? 'thinking'
                      : lifeState === 'responding'
                      ? 'responding'
                      : 'idle'
                  }
                  onActivity={(action: string) => {
                    if (action === 'interaction') {
                      coordinator.dispatchSpatialCommand('INTERACT');
                    }
                  }}
                />
              </div>

              <h1 className="text-xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                你想创作什么？
              </h1>

              {/* Central Command Box */}
              <div className="w-full space-y-3">
                {/* 5 Locked Core Buttons */}
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap text-xs select-none">
                  {coreFeatures.map((item) => {
                    const isActive = activeIntent === item.intent;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => handleSelectFeature(item)}
                        className={`inline-flex items-center px-3 py-2 sm:py-1.5 rounded text-xs transition-colors touch-manipulation ${
                          isActive
                            ? 'bg-black text-white font-medium shadow-xs'
                            : 'bg-white border border-gray-200 text-gray-800 hover:border-gray-400 hover:text-black'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 mr-1.5 ${isActive ? 'text-[#07C2E3]' : 'text-gray-500'}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Dynamic Input Panel */}
                {renderDynamicInputPanel()}

                {/* Validation Warning Alert */}
                {validationError && (
                  <div className="flex items-center space-x-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2.5 text-left">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>{validationError}</span>
                  </div>
                )}

                {/* Attachments preview */}
                {attachments.length > 0 && (
                  <div className="flex items-center space-x-2 py-1.5 overflow-x-auto justify-start">
                    {attachments.map((att, i) => (
                      <div key={i} className="relative w-14 h-14 border border-gray-200 rounded shrink-0 overflow-hidden">
                        <img src={att} alt="附件预览" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0.5 right-0.5 bg-black/70 hover:bg-black text-white rounded-full p-0.5"
                          title="移除"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Input Container */}
                <div className="border border-gray-300 focus-within:border-black rounded-lg p-2.5 sm:p-3 transition-colors bg-white text-left shadow-xs">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={inputText}
                    onChange={handleTextareaChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onKeyDown={handleKeyDown}
                    placeholder="描述你想创作的服装需求或上传参考素材 (Enter 发送，Shift+Enter 换行)..."
                    className="w-full resize-none border-none outline-none text-sm text-gray-900 placeholder:text-gray-400 max-h-48 leading-relaxed bg-transparent"
                  />

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
                    <div className="flex items-center space-x-1.5 sm:space-x-2">
                      <input
                        type="file"
                        ref={generalAttachmentRef}
                        onChange={(e) => {
                          const files = e.target.files;
                          if (!files) return;
                          Array.from(files).forEach((file) => {
                            readFileAsDataUrl(file, (url) => setAttachments((prev) => [...prev, url]));
                          });
                          e.target.value = '';
                        }}
                        multiple
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => generalAttachmentRef.current?.click()}
                        className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors inline-flex items-center space-x-1 text-xs"
                        title="上传图片素材"
                      >
                        <Paperclip className="w-4 h-4" />
                        <span className="hidden sm:inline">附加素材</span>
                      </button>

                      {/* Microphone voice button (Listening state) */}
                      <button
                        type="button"
                        onClick={handleToggleVoice}
                        className={`p-1.5 rounded transition-colors inline-flex items-center space-x-1 text-xs ${
                          isListening
                            ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                        title={isListening ? '停止语音录制' : '语音输入 (激活生命体听觉)'}
                      >
                        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        <span className="hidden sm:inline">{isListening ? '正在聆听' : '语音'}</span>
                      </button>

                      {activeIntent && (
                        <span className="text-[11px] bg-gray-100 text-gray-800 px-2 py-0.5 rounded font-medium">
                          {coreFeatures.find((f) => f.intent === activeIntent)?.label || activeIntent}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={
                        !inputText.trim() &&
                        attachments.length === 0 &&
                        !garmentImage &&
                        !modelImage &&
                        !sourceImage &&
                        !videoRefImage &&
                        !designRefImage
                      }
                      className={`p-2 sm:p-1.5 rounded transition-colors touch-manipulation ${
                        inputText.trim() ||
                        attachments.length > 0 ||
                        garmentImage ||
                        modelImage ||
                        sourceImage ||
                        videoRefImage ||
                        designRefImage
                          ? 'bg-black text-white hover:bg-gray-800'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                      title="发送创作命令"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Strict Requirement: Input box bottom is kept completely clean. No recent works or preview cards here! */}
            </div>
          )}

          {/* 2. Populated Conversation Stream */}
          {hasMessages && (
            <div className="space-y-6 pt-2">
              {messages.map((msg, index) => {
                const isAssistant = msg.role === 'assistant';
                // Check if this is the newest assistant message for the active continuous Digital Life avatar
                const isLatestAssistant =
                  isAssistant &&
                  index ===
                    messages
                      .map((m, idx) => (m.role === 'assistant' ? idx : -1))
                      .filter((idx) => idx !== -1)
                      .pop();

                return (
                  <div key={msg.id} className="space-y-3">
                    {/* User Turn */}
                    {msg.role === 'user' && (
                      <div className="flex items-start space-x-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          U
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="text-xs font-medium text-gray-900 flex items-center space-x-2">
                            <span>用户指令</span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg p-3 leading-relaxed inline-block max-w-2xl">
                            {msg.content}
                          </div>

                          {/* User Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {msg.attachments.map((att, i) => (
                                <div key={i} className="border border-gray-200 rounded overflow-hidden">
                                  <img
                                    src={att}
                                    alt="用户素材"
                                    className="w-16 h-16 sm:w-20 sm:h-20 object-cover cursor-pointer hover:opacity-90"
                                    onClick={() =>
                                      onPreviewAsset({
                                        id: `user-att-${i}`,
                                        name: '用户输入素材',
                                        type: 'image',
                                        url: att,
                                        createdAt: Date.now(),
                                        metadata: { tool: 'fashion_design', prompt: msg.content, version: 1 },
                                      })
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Assistant Turn */}
                    {isAssistant && (
                      <div className="flex items-start space-x-3">
                        {/* ModaUI 3D Digital Life Avatar Anchor */}
                        <div
                          ref={isLatestAssistant ? activeAvatarRef : null}
                          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-gray-200 bg-white relative flex items-center justify-center shrink-0 mt-0.5 overflow-visible"
                        >
                          {!isLatestAssistant && (
                            <span className="text-[10px] text-gray-500 font-bold select-none">●</span>
                          )}
                        </div>

                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="text-xs font-medium text-gray-900 flex items-center space-x-2">
                            <span className="font-semibold">ModaGPT</span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {/* Task Progress Status Box */}
                          {msg.taskRecord && (
                            <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2 max-w-2xl text-xs">
                              <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                                <div className="flex items-center space-x-2">
                                  {msg.taskRecord.status === 'succeeded' ? (
                                    <span className="inline-flex items-center text-xs font-medium text-gray-900">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
                                      任务执行完成
                                    </span>
                                  ) : msg.taskRecord.status === 'waiting_for_input' ? (
                                    <span className="inline-flex items-center text-xs font-medium text-amber-700">
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 mr-1.5" />
                                      等待补充必要素材
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center text-xs font-medium text-red-600">
                                      <AlertCircle className="w-3.5 h-3.5 text-red-500 mr-1.5" />
                                      任务已阻断
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleTaskExpansion(msg.taskRecord!.id)}
                                  className="text-xs text-gray-500 hover:text-gray-900 flex items-center space-x-1"
                                >
                                  <span>{expandedTaskIds[msg.taskRecord.id] ? '收起' : '步骤详情'}</span>
                                  {expandedTaskIds[msg.taskRecord.id] ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>

                              <div className="space-y-1">
                                {msg.taskRecord.steps.map((st) => (
                                  <div key={st.id} className="flex items-center text-xs space-x-2">
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        st.status === 'completed'
                                          ? 'bg-emerald-500'
                                          : st.status === 'failed'
                                          ? 'bg-red-500'
                                          : 'bg-gray-400'
                                      }`}
                                    />
                                    <span className="text-gray-700">{st.title}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Detailed steps accordion */}
                              {expandedTaskIds[msg.taskRecord.id] && (
                                <div className="pt-2 border-t border-gray-100 space-y-1.5">
                                  {msg.taskRecord.steps.map((st, idx) => (
                                    <div
                                      key={idx}
                                      className="p-2 border border-gray-100 rounded bg-gray-50/70 text-xs space-y-0.5"
                                    >
                                      <span className="font-medium text-gray-800 block">
                                        {idx + 1}. {st.title}
                                      </span>
                                      {st.details && (
                                        <div className="text-[11px] text-gray-500">{st.details}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Assistant Reply Text */}
                          <div className="text-sm text-gray-900 leading-relaxed max-w-2xl whitespace-pre-line">
                            {msg.content}
                          </div>

                          {/* Deliverable Assets Gallery (Shown strictly in chat result) */}
                          {msg.taskRecord && msg.taskRecord.outputAssets.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                              {msg.taskRecord.outputAssets.map((asset) => (
                                <div
                                  key={asset.id}
                                  className="border border-gray-200 rounded-lg overflow-hidden bg-white group flex flex-col shadow-2xs"
                                >
                                  <div
                                    className="relative aspect-square bg-gray-50 overflow-hidden cursor-pointer"
                                    onClick={() => onPreviewAsset(asset)}
                                  >
                                    {asset.type === 'video' ? (
                                      <div className="relative w-full h-full flex items-center justify-center bg-black">
                                        <img
                                          src={asset.thumbnailUrl || asset.url}
                                          alt={asset.name}
                                          className="w-full h-full object-cover opacity-80"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-black">
                                            <Play className="w-4 h-4 ml-0.5 fill-black" />
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <img
                                        src={asset.url}
                                        alt={asset.name}
                                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-150"
                                      />
                                    )}
                                  </div>

                                  <div className="p-2 border-t border-gray-100 flex-1 flex flex-col justify-between space-y-2">
                                    <div className="truncate text-xs font-medium text-gray-900" title={asset.name}>
                                      {asset.name}
                                    </div>

                                    <div className="grid grid-cols-2 gap-1 pt-1 border-t border-gray-100 text-xs">
                                      <button
                                        type="button"
                                        onClick={() => onPreviewAsset(asset)}
                                        className="py-1 text-center text-gray-700 hover:text-black border border-gray-200 hover:border-gray-400 rounded transition-colors inline-flex items-center justify-center space-x-1"
                                      >
                                        <Maximize2 className="w-3 h-3" />
                                        <span>查看大图</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDownload(asset)}
                                        className="py-1 text-center text-gray-700 hover:text-black border border-gray-200 hover:border-gray-400 rounded transition-colors inline-flex items-center justify-center space-x-1"
                                      >
                                        <Download className="w-3 h-3" />
                                        <span>下载</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (onCompareAsset) {
                                            onCompareAsset(asset);
                                          } else {
                                            onPreviewAsset(asset);
                                          }
                                        }}
                                        className="py-1 text-center text-gray-700 hover:text-black border border-gray-200 hover:border-gray-400 rounded transition-colors inline-flex items-center justify-center space-x-1"
                                        title="对比原图或上一版本"
                                      >
                                        <SplitSquareVertical className="w-3 h-3" />
                                        <span>版本对比</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onSelectForEdit(asset)}
                                        className="py-1 text-center text-gray-700 hover:text-black border border-gray-200 hover:border-gray-400 rounded transition-colors inline-flex items-center justify-center space-x-1"
                                        title="基于当前方案继续改版"
                                      >
                                        <RotateCw className="w-3 h-3" />
                                        <span>继续修改</span>
                                      </button>
                                    </div>

                                    <div className="pt-1 border-t border-gray-50 flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => handleSaveToLibrary(asset)}
                                        className={`text-[11px] px-2 py-0.5 rounded border transition-colors inline-flex items-center space-x-1 ${
                                          savedToLibraryStatus[asset.id]
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                            : 'border-gray-200 text-gray-600 hover:border-gray-400 hover:text-black'
                                        }`}
                                      >
                                        <BookmarkPlus className="w-3 h-3" />
                                        <span>{savedToLibraryStatus[asset.id] ? '已保存' : '存入素材库'}</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Generating Loader */}
              {isGenerating && (
                <div className="flex items-start space-x-3 pt-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] text-[#07C2E3] animate-spin">●</span>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2 max-w-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-[#07C2E3] animate-spin" />
                        <span className="text-xs font-semibold text-gray-900">
                          正在创作中，请稍候...
                        </span>
                      </div>
                      {onStopGeneration && (
                        <button
                          type="button"
                          onClick={onStopGeneration}
                          className="text-xs text-gray-500 hover:text-red-600 flex items-center space-x-1"
                        >
                          <Square className="w-3 h-3" />
                          <span>停止</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Command Bar (When in active conversation) */}
      {hasMessages && (
        <div className="border-t border-gray-200 p-3 sm:p-4 bg-white/95 backdrop-blur shrink-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] mb-14 md:mb-0">
          <div className="max-w-[850px] mx-auto space-y-2">
            {/* 5 Locked Core Buttons */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs select-none scrollbar-none">
              {coreFeatures.map((item) => {
                const isActive = activeIntent === item.intent;
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleSelectFeature(item)}
                    className={`inline-flex items-center px-3 py-1.5 rounded text-xs transition-colors shrink-0 touch-manipulation ${
                      isActive
                        ? 'bg-black text-white font-medium shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400 hover:text-black'
                    }`}
                  >
                    <Icon className={`w-3 h-3 mr-1.5 ${isActive ? 'text-[#07C2E3]' : 'text-gray-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Input Panel */}
            {renderDynamicInputPanel()}

            {/* Validation Warning Alert */}
            {validationError && (
              <div className="flex items-center space-x-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 text-left">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="flex items-center space-x-2 py-1 overflow-x-auto">
                {attachments.map((att, i) => (
                  <div key={i} className="relative w-14 h-14 border border-gray-200 rounded shrink-0 overflow-hidden">
                    <img src={att} alt="附件预览" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 bg-black/70 hover:bg-black text-white rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea Box */}
            <div className="border border-gray-300 focus-within:border-black rounded-lg p-2.5 transition-colors bg-white shadow-2xs">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={handleTextareaChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                placeholder="描述你想创作的服装需求或上传参考素材 (Enter 发送，Shift+Enter 换行)..."
                className="w-full resize-none border-none outline-none text-sm text-gray-900 placeholder:text-gray-400 max-h-48 leading-relaxed bg-transparent"
              />

              <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-1.5">
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    ref={generalAttachmentRef}
                    onChange={(e) => {
                      const files = e.target.files;
                      if (!files) return;
                      Array.from(files).forEach((file) => {
                        readFileAsDataUrl(file, (url) => setAttachments((prev) => [...prev, url]));
                      });
                      e.target.value = '';
                    }}
                    multiple
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => generalAttachmentRef.current?.click()}
                    className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors inline-flex items-center space-x-1 text-xs"
                    title="上传图片"
                  >
                    <Paperclip className="w-4 h-4" />
                    <span className="hidden sm:inline">素材</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`p-1.5 rounded transition-colors inline-flex items-center space-x-1 text-xs ${
                      isListening
                        ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title={isListening ? '停止语音录制' : '语音输入'}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span className="hidden sm:inline">{isListening ? '正在聆听' : '语音'}</span>
                  </button>

                  {activeIntent && (
                    <span className="text-[11px] bg-gray-100 text-gray-800 px-2 py-0.5 rounded font-medium">
                      {coreFeatures.find((f) => f.intent === activeIntent)?.label || activeIntent}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {isGenerating ? (
                    <button
                      type="button"
                      onClick={onStopGeneration}
                      className="px-3 py-1.5 bg-black text-white rounded text-xs font-medium hover:bg-gray-800 transition-colors flex items-center space-x-1"
                    >
                      <Square className="w-3 h-3 text-red-400 fill-red-400" />
                      <span>停止</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={
                        !inputText.trim() &&
                        attachments.length === 0 &&
                        !garmentImage &&
                        !modelImage &&
                        !sourceImage &&
                        !videoRefImage &&
                        !designRefImage
                      }
                      className={`p-1.5 rounded transition-colors touch-manipulation ${
                        inputText.trim() ||
                        attachments.length > 0 ||
                        garmentImage ||
                        modelImage ||
                        sourceImage ||
                        videoRefImage ||
                        designRefImage
                          ? 'bg-black text-white hover:bg-gray-800'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                      title="发送"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Asset Picker Modal */}
      <AssetPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        assets={recentAssets}
        onSelectAsset={handleAssetPicked}
        title={pickerTitle}
      />
    </div>
  );
};
