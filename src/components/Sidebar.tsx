import { useState, useEffect, useCallback } from 'react';
import { db } from '@/db';
import type { Workspace } from '@/types';
import { v4 as uuid } from 'uuid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  BookOpen,
  Settings,
  Trash2,
  FolderOpen,
} from 'lucide-react';

interface SidebarProps {
  currentWorkspaceId: string | null;
  onSelectWorkspace: (id: string | null) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ currentWorkspaceId, onSelectWorkspace, onOpenSettings }: SidebarProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');

  // 加载工作空间列表
  const loadWorkspaces = useCallback(async () => {
    try {
      const list = await db.workspaces.orderBy('updatedAt').reverse().toArray();
      setWorkspaces(list);
    } catch (err) {
      console.error('加载工作空间失败:', err);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // 创建工作空间
  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const now = Date.now();
      const workspace: Workspace = { id: uuid(), name, createdAt: now, updatedAt: now };
      await db.workspaces.add(workspace);
      setNewName('');
      setShowNewForm(false);
      await loadWorkspaces();
      onSelectWorkspace(workspace.id);
    } catch (err) {
      console.error('创建工作空间失败:', err);
    }
  }, [newName, loadWorkspaces, onSelectWorkspace]);

  // 删除工作空间
  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await db.conversations.where('workspaceId').equals(id).delete();
        const files = await db.files.where('workspaceId').equals(id).toArray();
        for (const f of files) {
          await db.pageAnalyses.where('fileId').equals(f.id).delete();
          await db.fileBlobs.where('fileId').equals(f.id).delete();
        }
        await db.files.where('workspaceId').equals(id).delete();
        await db.workspaces.delete(id);
        if (currentWorkspaceId === id) {
          onSelectWorkspace(null);
        }
        await loadWorkspaces();
      } catch (err) {
        console.error('删除工作空间失败:', err);
      }
    },
    [currentWorkspaceId, onSelectWorkspace, loadWorkspaces]
  );

  return (
    <div className="h-full border-r border-border flex flex-col bg-card">
      {/* 标题 */}
      <div className="h-14 flex items-center px-4 border-b border-border gap-2">
        <BookOpen className="w-5 h-5 text-primary" />
        <span className="font-semibold text-sm">智学图谱</span>
      </div>

      {/* 工作空间列表 */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => onSelectWorkspace(ws.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors group ${
                currentWorkspaceId === ws.id
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1 text-left">{ws.name}</span>
              <Trash2
                className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-destructive transition-opacity shrink-0"
                onClick={(e) => handleDelete(ws.id, e)}
              />
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* 底部操作 */}
      <div className="p-2 border-t border-border space-y-1">
        {/* 新建工作空间 —— 使用内联表单替代Dialog */}
        {showNewForm ? (
          <div className="space-y-2 p-2 rounded-md bg-muted/50">
            <Input
              placeholder="输入课程名称，如：数据结构"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') { setShowNewForm(false); setNewName(''); }
              }}
              autoFocus
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreate} disabled={!newName.trim()}>
                创建
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowNewForm(false); setNewName(''); }}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sm"
            onClick={() => setShowNewForm(true)}
          >
            <Plus className="w-4 h-4" />
            新建工作空间
          </Button>
        )}

        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sm"
          onClick={onOpenSettings}
        >
          <Settings className="w-4 h-4" />
          模型设置
        </Button>
      </div>
    </div>
  );
}
