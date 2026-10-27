import React, { useState } from 'react';
import { X, Download, RotateCw, Play, SplitSquareVertical } from 'lucide-react';
import { Asset, ToolType } from '../types/index.ts';

interface ImagePreviewModalProps {
  asset: Asset | null;
  comparisonAsset?: Asset | null;
  onClose: () => void;
  onSelectForEdit: (asset: Asset) => void;
}

const TOOL_NAME_MAP: Record<ToolType, string> = {
  fashion_design: 'AI设计',
  virtual_tryon: 'AI换衣',
  model_photoshoot: 'AI棚拍',
  image_refine_color: '高清换色',
  runway_video: '走秀视频',
  garment_analysis: '面料与结构分析',
};

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  asset,
  comparisonAsset,
  onClose,
  onSelectForEdit,
}) => {
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');

  if (!asset) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = asset.url;
    a.download = asset.name || `modagpt-${asset.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toolDisplayName = TOOL_NAME_MAP[asset.metadata.tool] || asset.metadata.tool;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Top Bar */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-xs text-gray-900 truncate max-w-md">{asset.name}</span>
            <span className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
              {toolDisplayName}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {comparisonAsset && (
              <button
                onClick={() => setViewMode(viewMode === 'single' ? 'compare' : 'single')}
                className={`px-2.5 py-1 text-xs rounded border transition-colors flex items-center space-x-1 ${
                  viewMode === 'compare'
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                }`}
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span>{viewMode === 'compare' ? '单图预览' : '对比原图'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-900 rounded hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-0">
          {/* Main Visual Display */}
          <div className="md:col-span-2 bg-gray-50 flex items-center justify-center p-4 min-h-[350px]">
            {viewMode === 'compare' && comparisonAsset ? (
              <div className="w-full grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-500 mb-1">参考原素材</span>
                  <div className="aspect-square w-full rounded bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                    <img
                      src={comparisonAsset.url}
                      alt="原图"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-900 font-medium mb-1">创作后成品</span>
                  <div className="aspect-square w-full rounded bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                    <img
                      src={asset.url}
                      alt="成品"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            ) : asset.type === 'video' ? (
              <div className="relative w-full max-h-[70vh] flex items-center justify-center bg-black rounded">
                <img
                  src={asset.thumbnailUrl || asset.url}
                  alt={asset.name}
                  className="max-h-[70vh] object-contain opacity-75"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="w-5 h-5 ml-0.5 fill-black" />
                  </div>
                </div>
              </div>
            ) : (
              <img
                src={asset.url}
                alt={asset.name}
                className="max-h-[70vh] max-w-full object-contain rounded"
              />
            )}
          </div>

          {/* Details & Actions Sidebar */}
          <div className="p-5 border-t md:border-t-0 md:border-l border-gray-200 flex flex-col justify-between space-y-4">
            <div className="space-y-4 text-xs">
              <div>
                <span className="font-semibold text-gray-900 block mb-1">创作类型</span>
                <span className="inline-block bg-gray-100 text-gray-800 px-2 py-0.5 rounded font-medium">
                  {toolDisplayName}
                </span>
              </div>

              <div>
                <span className="font-semibold text-gray-900 block mb-1">创作需求</span>
                <p className="text-gray-600 leading-relaxed bg-gray-50 p-2.5 rounded border border-gray-100">
                  {asset.metadata.prompt || '用户上传素材'}
                </p>
              </div>

              {asset.metadata.fabricAnalysis && (
                <div>
                  <span className="font-semibold text-gray-900 block mb-1">面料规格</span>
                  <div className="bg-gray-50 p-2.5 rounded border border-gray-100 space-y-1 text-[11px] text-gray-600">
                    <div>成分: {asset.metadata.fabricAnalysis.composition}</div>
                    <div>克重: {asset.metadata.fabricAnalysis.weight}</div>
                    <div>纹理: {asset.metadata.fabricAnalysis.texture}</div>
                  </div>
                </div>
              )}

              {asset.metadata.fitAudit && (
                <div>
                  <span className="font-semibold text-gray-900 block mb-1">贴合质检评价</span>
                  <div className="bg-gray-50 p-2.5 rounded border border-gray-100 space-y-1 text-[11px] text-gray-600">
                    <div>贴合度: {asset.metadata.fitAudit.fitScore}%</div>
                    <div>肩线: {asset.metadata.fitAudit.shoulderAlignment}</div>
                    <div>垂褶: {asset.metadata.fitAudit.drapeEvaluation}</div>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-400 space-y-0.5">
                <div>创建时间: {new Date(asset.createdAt).toLocaleString()}</div>
                <div>分辨率: {asset.width || 1024} × {asset.height || 1024}</div>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => {
                  onSelectForEdit(asset);
                  onClose();
                }}
                className="w-full py-2 bg-gray-900 hover:bg-black text-white rounded text-xs font-medium transition-colors flex items-center justify-center space-x-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>基于此素材继续创作</span>
              </button>
              <button
                onClick={handleDownload}
                className="w-full py-2 border border-gray-200 hover:border-gray-400 text-gray-700 hover:text-black rounded text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载原文件</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
