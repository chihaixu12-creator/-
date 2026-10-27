/**
 * ModaGPT Sidebar & Mobile Navigation Bar
 * Desktop: Collapsible left sidebar
 * Mobile: Clean bottom navigation bar + top compact header
 */

import React from 'react';
import { Home, Sparkles, Folder, Settings, Plus, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { Conversation } from '../types/index.ts';

interface SidebarProps {
  currentTab: 'home' | 'studio' | 'library' | 'settings';
  onSelectTab: (tab: 'home' | 'studio' | 'library' | 'settings') => void;
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  collapsed,
  onToggleCollapse,
}) => {
  const navItems = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'studio', label: 'AI 创作中心', icon: Sparkles },
    { id: 'library', label: '素材库', icon: Folder },
    { id: 'settings', label: '总设置', icon: Settings },
  ] as const;

  return (
    <>
      {/* 1. Desktop Left Sidebar (Hidden on mobile < md) */}
      <aside
        className={`hidden md:flex h-screen bg-white border-r border-gray-200 flex-col transition-all duration-200 select-none shrink-0 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4">
          {!collapsed && (
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-black flex items-center justify-center rounded text-white font-bold text-xs tracking-wider">
                M
              </div>
              <span className="font-semibold text-base text-gray-900 tracking-tight">ModaGPT</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 bg-black flex items-center justify-center rounded text-white font-bold text-xs mx-auto">
              M
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
            title={collapsed ? '展开导航' : '收起导航'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* 4 Main Nav Items */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center px-3 py-2 text-sm rounded transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#07C2E3]' : 'text-gray-500'
                  }`}
                />
                {!collapsed && <span className="ml-3 truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Recent Conversations */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto px-3 py-3 border-t border-gray-100 flex flex-col">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-medium text-gray-400">最近创作会话</span>
              <button
                onClick={() => {
                  onSelectTab('studio');
                  onNewConversation();
                }}
                className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                title="新建创作会话"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-0.5">
              {conversations.map((conv) => {
                const isSelected = currentTab === 'studio' && activeConversationId === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      onSelectTab('studio');
                      onSelectConversation(conv.id);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs truncate flex items-center transition-colors ${
                      isSelected
                        ? 'bg-gray-100 text-gray-900 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 mr-2 text-gray-400 shrink-0" />
                    <span className="truncate">{conv.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="p-3 border-t border-gray-200 text-xs text-gray-400">
          {!collapsed && (
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>ModaGPT</span>
              <span>商业视觉创作平台</span>
            </div>
          )}
        </div>
      </aside>

      {/* 2. Mobile Bottom Navigation Bar (< md) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-t border-gray-200 z-40 flex items-center justify-around px-2 pb-[max(0px,env(safe-area-inset-bottom))] shadow-xs">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-colors touch-manipulation ${
                isActive ? 'text-black font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-[#07C2E3]' : 'text-gray-400'}`} />
              <span className="text-[10px] mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};
