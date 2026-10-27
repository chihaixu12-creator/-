import React, { useState, useRef } from 'react';
import { Search, Download, Trash2, Maximize2, RotateCw, Plus, Filter, Play } from 'lucide-react';
import { Asset, ToolType } from '../types/index.ts';

interface LibraryViewProps {
  assets: Asset[];
  onPreviewAsset: (asset: Asset) => void;
  onSelectForEdit: (asset: Asset) => void;
  onDeleteAsset: (id: string) => void;
  onUploadAsset: (file: File) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  assets,
  onPreviewAsset,
  onSelectForEdit,
  onDeleteAsset,
  onUploadAsset,
}) => {
  const [selectedToolFilter, setSelectedToolFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filters = [
    { id: 'all', label: '全部素材' },
    { id: 'fashion_design', label: 'AI设计' },
    { id: 'virtual_tryon', label: 'AI换衣' },
    { id: 'model_photoshoot', label: 'AI棚拍' },
    { id: 'image_refine_color', label: '高清换色' },
    { id: 'runway_video', label: '走秀视频' },
  ];

  const filteredAssets = assets.filter((asset) => {
    if (selectedToolFilter !== 'all' && asset.metadata.tool !== selectedToolFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = asset.name.toLowerCase().includes(q);
      const matchPrompt = asset.metadata.prompt?.toLowerCase().includes(q);
      return matchName || matchPrompt;
    }
    return true;
  });

  const handleDownload = (asset: Asset, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = asset.url;
    a.download = asset.name || `modagpt-asset-${asset.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确认删除此素材文件？')) {
      onDeleteAsset(id);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadAsset(file);
    }
    e.target.value = '';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white p-6 sm:p-10 flex flex-col">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">素材库</h1>
            <p className="text-xs text-gray-500 mt-1">
              集中归档所有生成作品、上传参考图及版本演进历史，共 {assets.length} 件资产
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,video/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-3.5 py-2 bg-gray-900 hover:bg-black text-white text-xs font-medium rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              上传新素材
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-1">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedToolFilter(f.id)}
                className={`px-3 py-1.5 rounded text-xs transition-colors shrink-0 ${
                  selectedToolFilter === f.id
                    ? 'bg-gray-900 text-white font-medium'
                    : 'bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索素材名称或提示词..."
              className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded text-xs outline-none focus:border-gray-900 transition-colors"
            />
          </div>
        </div>

        {/* Assets Grid */}
        {filteredAssets.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-gray-200 rounded">
            <p className="text-xs text-gray-400">未找到匹配的素材记录</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="border border-gray-200 rounded overflow-hidden bg-white hover:border-gray-400 transition-colors group flex flex-col"
              >
                <div
                  className="relative aspect-square bg-gray-50 overflow-hidden cursor-pointer"
                  onClick={() => onPreviewAsset(asset)}
                >
                  <img
                    src={asset.thumbnailUrl || asset.url}
                    alt={asset.name}
                    className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
                  />
                  {asset.type === 'video' && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Play className="w-6 h-6 text-white fill-white" />
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-xs font-mono">
                    v{asset.metadata.version || 1}
                  </div>
                </div>

                <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-medium text-gray-900 block truncate" title={asset.name}>
                      {asset.name}
                    </span>
                    <span className="text-[10px] text-gray-400 block line-clamp-1" title={asset.metadata.prompt}>
                      {asset.metadata.prompt || '暂无描述'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <button
                      onClick={(e) => handleDownload(asset, e)}
                      className="p-1 hover:text-black hover:bg-gray-100 rounded transition-colors"
                      title="下载原文件"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectForEdit(asset);
                      }}
                      className="p-1 hover:text-black hover:bg-gray-100 rounded transition-colors"
                      title="带入创作中心继续编辑"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(asset.id, e)}
                      className="p-1 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="删除素材"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
