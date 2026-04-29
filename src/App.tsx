import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppState } from '@/types';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceView } from '@/components/WorkspaceView';
import { SettingsPanel } from '@/components/SettingsPanel';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { LabDataView } from '@/components/LabDataView';
import { GripVertical } from 'lucide-react';

function App() {
  const [appState, setAppState] = useState<AppState>({
    currentWorkspaceId: null,
    currentFileId: null,
    currentConversationId: null,
    expandedPageNumber: null,
    view: 'workspace',
  });

  // 侧栏宽度（像素）
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(160, Math.min(400, startWidthRef.current + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleSelectWorkspace = useCallback((id: string | null) => {
    setAppState((prev) => ({
      ...prev,
      currentWorkspaceId: id,
      currentFileId: null,
      currentConversationId: null,
      expandedPageNumber: null,
    }));
  }, []);

  const handleSelectFile = useCallback((id: string | null) => {
    setAppState((prev) => ({
      ...prev,
      currentFileId: id,
      currentConversationId: null,
      expandedPageNumber: null,
    }));
  }, []);

  const handleExpandPage = useCallback((pageNumber: number | null) => {
    setAppState((prev) => ({
      ...prev,
      expandedPageNumber: pageNumber,
    }));
  }, []);

  const handleSelectConversation = useCallback((id: string | null) => {
    setAppState((prev) => ({
      ...prev,
      currentConversationId: id,
    }));
  }, []);

  const handleOpenWorkspaceChat = useCallback(() => {
    setAppState((prev) => ({
      ...prev,
      currentFileId: null,
      currentConversationId: null,
      expandedPageNumber: null,
    }));
  }, []);

  return (
    <div ref={containerRef} className="h-screen flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <div
        style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
        className="shrink-0"
      >
        <Sidebar
          currentWorkspaceId={appState.currentWorkspaceId}
          currentView={appState.view}
          onSelectWorkspace={handleSelectWorkspace}
          onOpenSettings={() => setAppState((p) => ({ ...p, view: 'settings' }))}
          onOpenLab={() => setAppState((p) => ({ ...p, view: 'lab' }))}
        />
      </div>

      {/* 拖拽分隔条 */}
      <div
        onMouseDown={handleMouseDown}
        className={`
          w-1.5 shrink-0 cursor-col-resize 
          hover:w-2 hover:bg-primary/30
          flex items-center justify-center
          transition-all duration-150
          ${isDragging ? 'w-2.5 bg-primary/50' : 'bg-border'}
        `}
        style={{ zIndex: 50 }}
      >
        <div className={`
          h-8 w-1 rounded-full transition-all duration-150
          ${isDragging ? 'bg-primary/70 scale-y-125' : 'bg-muted-foreground/20 hover:bg-primary/40'}
        `} />
        {/* 拖拽时显示宽度 */}
        {isDragging && (
          <div className="absolute top-1/2 -translate-y-1/2 left-1/2 translate-x-1/2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap z-50">
            {sidebarWidth}px
          </div>
        )}
      </div>

      {/* 主内容区 */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {appState.view === 'settings' ? (
          <SettingsPanel onBack={() => setAppState((p) => ({ ...p, view: 'workspace' }))} />
        ) : appState.view === 'lab' ? (
          <LabDataView onBack={() => setAppState((p) => ({ ...p, view: 'workspace' }))} />
        ) : appState.currentWorkspaceId ? (
          <WorkspaceView
            workspaceId={appState.currentWorkspaceId}
            currentFileId={appState.currentFileId}
            currentConversationId={appState.currentConversationId}
            expandedPageNumber={appState.expandedPageNumber}
            onSelectFile={handleSelectFile}
            onExpandPage={handleExpandPage}
            onSelectConversation={handleSelectConversation}
            onOpenWorkspaceChat={handleOpenWorkspaceChat}
          />
        ) : (
          <WelcomeScreen onOpenLab={() => setAppState((p) => ({ ...p, view: 'lab' }))} />
        )}
      </div>
    </div>
  );
}

export default App;
