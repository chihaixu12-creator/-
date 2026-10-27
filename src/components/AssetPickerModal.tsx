import React, { useState } from 'react';
import { X, Check, Image as ImageIcon, Plus } from 'lucide-react';
import { Asset } from '../types/index.ts';

interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  onSelectAsset: (asset: Asset) => void;
  title: string;
}

export const AssetPickerModal: React.FC<AssetPickerModalProps> = ({
  isOpen,
  onClose,
  assets,
  onSelectAsset,
  title,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const chosen = assets.find((a) => a.id === selectedId);
    if (chosen) {
      onSelectAsset(chosen);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <ImageIcon className="w-4 h-4 text-gray-700" />
            <span className="font-semibold text-xs text-gray-900">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-900 rounded hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Assets Grid */}
        <div className="p-4 flex-1 overflow-y-auto">
          {assets.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-gray-200 rounded">
              <p className="text-xs text-gray-400">素材库中暂无可用素材，请直接通过本地上传</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {assets.map((asset) => {
                const isSelected = selectedId === asset.id;
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    className={`relative aspect-square rounded border cursor-pointer overflow-hidden group transition-all ${
                      isSelected
                        ? 'border-black ring-2 ring-black'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <img
                      src={asset.thumbnailUrl || asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute top-1 right-1 bg-black text-white rounded-full p-0.5">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] p-1 truncate">
                      {asset.name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end space-x-2 bg-gray-50 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-gray-200 hover:border-gray-300 rounded text-xs text-gray-600 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
              selectedId
                ? 'bg-black text-white hover:bg-gray-800'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  );
};
