import { useState, useCallback } from 'react';
import type { AppState } from '@/types';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceView } from '@/components/WorkspaceView';
import { SettingsPanel } from '@/components/SettingsPanel';
import { WelcomeScreen } from '@/components/WelcomeScreen';

function App() {
  const [appState, setAppState] = useState<AppState>({
    currentWorkspaceId: null,
    currentFileId: null,
    currentConversationId: null,
    expandedPageNumber: null,
    view: 'workspace',
  });

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
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        currentWorkspaceId={appState.currentWorkspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        onOpenSettings={() => setAppState((p) => ({ ...p, view: 'settings' }))}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {appState.view === 'settings' ? (
          <SettingsPanel onBack={() => setAppState((p) => ({ ...p, view: 'workspace' }))} />
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
          <WelcomeScreen />
        )}
      </div>
    </div>
  );
}

export default App;
