import { useState, useEffect, useCallback } from 'react';
import { db } from '@/db';
import type { FileDocument, PageAnalysis, KnowledgeNode, KnowledgeEdge, Workspace } from '@/types';
import { v4 as uuid } from 'uuid';
import { Button } from '@/components/ui/button';
import { FileList } from '@/components/FileList';
import { PdfViewer } from '@/components/PdfViewer';
import { PageDetailPanel } from '@/components/PageDetailPanel';
import { WorkspaceChat } from '@/components/WorkspaceChat';
import { KnowledgeGraphView } from '@/components/KnowledgeGraphView';
import { extractPagesText, buildLightParsePrompt, parseLightParseResult, createPageAnalysis } from '@/services/pdf';
import { callLLM } from '@/services/llm';
import { generateKnowledgeGraph } from '@/services/knowledgeGraph';
import {
  Upload,
  FileText,
  Loader2,
  MessageSquare,
  X,
  Network,
  RefreshCw,
  XCircle,
  Info,
} from 'lucide-react';

interface WorkspaceViewProps {
  workspaceId: string;
  currentFileId: string | null;
  currentConversationId: string | null;
  expandedPageNumber: number | null;
  onSelectFile: (id: string | null) => void;
  onExpandPage: (pageNumber: number | null) => void;
  onSelectConversation: (id: string | null) => void;
  onOpenWorkspaceChat: () => void;
}

type MainView = 'file' | 'chat' | 'graph';

export function WorkspaceView({
  workspaceId,
  currentFileId,
  currentConversationId,
  expandedPageNumber,
  onSelectFile,
  onExpandPage,
  onSelectConversation,
  onOpenWorkspaceChat,
}: WorkspaceViewProps) {
  const [files, setFiles] = useState<FileDocument[]>([]);
  const [currentFile, setCurrentFile] = useState<FileDocument | null>(null);
  const [pageAnalyses, setPageAnalyses] = useState<PageAnalysis[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0 });
  const [showWorkspaceChat, setShowWorkspaceChat] = useState(false);

  // 知识图谱状态
  const [mainView, setMainView] = useState<MainView>('file');
  const [graphNodes, setGraphNodes] = useState<KnowledgeNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<KnowledgeEdge[]>([]);
  const [generatingGraph, setGeneratingGraph] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);

  // 加载文件列表
  const loadFiles = useCallback(async () => {
    const list = await db.files.where('workspaceId').equals(workspaceId).toArray();
    setFiles(list);
  }, [workspaceId]);

  // 加载工作空间名称
  useEffect(() => {
    db.workspaces.get(workspaceId).then((ws) => {
      if (ws) setWorkspaceName(ws.name);
    });
  }, [workspaceId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // 加载已保存的知识图谱
  useEffect(() => {
    async function loadGraph() {
      const nodes = await db.knowledgeNodes.where('workspaceId').equals(workspaceId).toArray();
      const edges = await db.knowledgeEdges.where('workspaceId').equals(workspaceId).toArray();
      setGraphNodes(nodes);
      setGraphEdges(edges);
    }
    loadGraph();
  }, [workspaceId]);

  // 加载当前文件的解析结果
  useEffect(() => {
    if (!currentFileId) {
      setCurrentFile(null);
      setPageAnalyses([]);
      return;
    }
    db.files.get(currentFileId).then((f) => setCurrentFile(f ?? null));
    db.pageAnalyses
      .where('fileId')
      .equals(currentFileId)
      .sortBy('pageNumber')
      .then(setPageAnalyses);
  }, [currentFileId]);

  // 上传PDF
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;

      const now = Date.now();
      const fileDoc: FileDocument = {
        id: uuid(),
        workspaceId,
        name: file.name,
        fileSize: file.size,
        pageCount: 0,
        uploadedAt: now,
        parseStatus: 'pending',
      };

      await db.files.add(fileDoc);
      await db.fileBlobs.add({ id: uuid(), fileId: fileDoc.id, blob: file });
      await loadFiles();
      onSelectFile(fileDoc.id);

      setParsing(true);
      fileDoc.parseStatus = 'parsing';
      await db.files.update(fileDoc.id, { parseStatus: 'parsing' });

      try {
        const { pageCount, pages } = await extractPagesText(file);
        await db.files.update(fileDoc.id, { pageCount });
        setParseProgress({ current: 0, total: pages.length });

        const providers = await db.modelProviders.toArray();
        const activeProvider = providers[0];

        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          setParseProgress({ current: i + 1, total: pages.length });

          let keywords: string[] = [];
          let summary = '';

          if (page.text.trim() && activeProvider?.apiKey) {
            try {
              const prompt = buildLightParsePrompt(page.pageNumber, page.text);
              const response = await callLLM(activeProvider, [
                { role: 'user', content: prompt },
              ], { temperature: 0.3, maxTokens: 256 });
              const parsed = parseLightParseResult(response.content);
              keywords = parsed.keywords;
              summary = parsed.summary;
            } catch {
              summary = page.text.slice(0, 30) + '...';
              keywords = [];
            }
          } else {
            summary = page.text.trim() ? page.text.slice(0, 30) + '...' : '（无文字内容）';
          }

          const analysis = createPageAnalysis(
            fileDoc.id,
            workspaceId,
            page.pageNumber,
            page.text,
            keywords,
            summary
          );
          await db.pageAnalyses.add(analysis);
        }

        await db.files.update(fileDoc.id, { parseStatus: 'done' });
        await loadFiles();

        const analyses = await db.pageAnalyses
          .where('fileId')
          .equals(fileDoc.id)
          .sortBy('pageNumber');
        setPageAnalyses(analyses);
      } catch (err) {
        console.error('解析失败:', err);
        await db.files.update(fileDoc.id, { parseStatus: 'error' });
        await loadFiles();
      } finally {
        setParsing(false);
        setParseProgress({ current: 0, total: 0 });
      }

      e.target.value = '';
    },
    [workspaceId, loadFiles, onSelectFile]
  );

  // 删除文件
  const handleDeleteFile = useCallback(
    async (id: string) => {
      await db.pageAnalyses.where('fileId').equals(id).delete();
      await db.conversations.where('fileId').equals(id).delete();
      await db.fileBlobs.where('fileId').equals(id).delete();
      await db.files.delete(id);
      if (currentFileId === id) {
        onSelectFile(null);
        onExpandPage(null);
      }
      await loadFiles();
    },
    [currentFileId, onSelectFile, onExpandPage, loadFiles]
  );

  // 生成知识图谱
  const handleGenerateGraph = useCallback(async () => {
    const providers = await db.modelProviders.toArray();
    const activeProvider = providers[0];
    if (!activeProvider?.apiKey) {
      alert('请先在设置中配置 API Key');
      return;
    }

    setGeneratingGraph(true);
    try {
      // 获取该工作空间所有文件的页面分析（带文件名）
      const allAnalyses = await db.pageAnalyses
        .where('workspaceId')
        .equals(workspaceId)
        .toArray();

      // 为每个分析附加文件名
      const analysesWithFileName = await Promise.all(
        allAnalyses.map(async (a) => {
          const f = await db.files.get(a.fileId);
          return { ...a, fileName: f?.name ?? '未知文件' };
        })
      );

      if (analysesWithFileName.length === 0) {
        alert('暂无已解析的页面数据，请先上传并解析PDF');
        setGeneratingGraph(false);
        return;
      }

      // 删除旧的知识图谱数据
      await db.knowledgeNodes.where('workspaceId').equals(workspaceId).delete();
      await db.knowledgeEdges.where('workspaceId').equals(workspaceId).delete();

      // 生成新的知识图谱
      const result = await generateKnowledgeGraph(
        workspaceId,
        workspaceName,
        activeProvider,
        () => Promise.resolve(analysesWithFileName)
      );

      // 存入数据库
      for (const node of result.nodes) {
        await db.knowledgeNodes.add(node);
      }
      for (const edge of result.edges) {
        await db.knowledgeEdges.add(edge);
      }

      setGraphNodes(result.nodes);
      setGraphEdges(result.edges);
      setMainView('graph');
    } catch (err) {
      console.error('生成知识图谱失败:', err);
      alert('生成知识图谱失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setGeneratingGraph(false);
    }
  }, [workspaceId, workspaceName]);

  // 点击知识图谱节点
  const handleNodeClick = useCallback(
    (node: KnowledgeNode) => {
      setSelectedNode(node);
    },
    []
  );

  // 从知识图谱节点跳转到文件
  const handleNodeGoToFile = useCallback(
    (node: KnowledgeNode) => {
      if (node.sourceFileIds.length > 0) {
        onSelectFile(node.sourceFileIds[0]);
        setMainView('file');
        setSelectedNode(null);
      }
    },
    [onSelectFile]
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 文件列表面板 */}
      <div className="w-56 border-r border-border flex flex-col bg-card">
        <div className="h-12 flex items-center px-3 border-b border-border">
          <span className="text-sm font-medium truncate flex-1">
            文件列表
          </span>
        </div>

        <FileList
          files={files}
          currentFileId={currentFileId}
          onSelectFile={(id) => {
            onSelectFile(id);
            setMainView('file');
          }}
          onDeleteFile={handleDeleteFile}
        />

        {/* 上传按钮 */}
        <div className="p-2 border-t border-border">
          <label className="cursor-pointer block">
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleUpload}
              disabled={parsing}
            />
            <div
              className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 w-full ${
                parsing ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              {parsing ? `解析中 ${parseProgress.current}/${parseProgress.total}...` : '上传 PDF 课件'}
            </div>
          </label>
        </div>

        {/* 知识图谱按钮 */}
        <div className="p-2 border-t border-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={handleGenerateGraph}
            disabled={generatingGraph || parsing}
          >
            {generatingGraph ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                生成中...
              </>
            ) : graphNodes.length > 0 ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                刷新知识图谱
              </>
            ) : (
              <>
                <Network className="w-3.5 h-3.5" />
                生成知识图谱
              </>
            )}
          </Button>
        </div>

        {/* 查看知识图谱按钮（已有数据时显示） */}
        {graphNodes.length > 0 && (
          <div className="px-2 pb-2">
            <Button
              variant={mainView === 'graph' ? 'default' : 'outline'}
              className="w-full justify-start gap-2 text-xs h-8"
              onClick={() => setMainView('graph')}
            >
              <Network className="w-3.5 h-3.5" />
              查看知识图谱
            </Button>
          </div>
        )}

        {/* 工作空间对话入口 */}
        <div className="p-2 border-t border-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={() => {
              setShowWorkspaceChat(true);
              setMainView('chat');
            }}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            跨文件问答
          </Button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {mainView === 'graph' ? (
          /* 知识图谱视图 */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 顶部栏 */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">
                  {workspaceName} - 知识图谱
                </span>
                <span className="text-xs text-muted-foreground">
                  ({graphNodes.length}个知识点, {graphEdges.length}条关系)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleGenerateGraph}
                  disabled={generatingGraph}
                >
                  {generatingGraph ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {generatingGraph ? '生成中...' : '刷新'}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setMainView('file');
                    setSelectedNode(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* 图谱内容区 */}
            <div className="flex-1 flex overflow-hidden">
              <KnowledgeGraphView
                nodes={graphNodes}
                edges={graphEdges}
                onNodeClick={handleNodeClick}
              />

              {/* 右侧节点详情面板 */}
              {selectedNode && (
                <div className="w-72 border-l border-border bg-card p-4 space-y-4 overflow-y-auto">
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-semibold">{selectedNode.label}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setSelectedNode(null)}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>

                  {selectedNode.description && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">描述</div>
                      <p className="text-sm">{selectedNode.description}</p>
                    </div>
                  )}

                  {selectedNode.sourceFileIds.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">来源文件</div>
                      <div className="space-y-1">
                        {selectedNode.sourceFileIds.map((fileId) => (
                          <Button
                            key={fileId}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs h-7"
                            onClick={() => handleNodeGoToFile(selectedNode)}
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            {files.find((f) => f.id === fileId)?.name ?? '未知文件'}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 相关关系 */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">相关关系</div>
                    <div className="space-y-1">
                      {graphEdges
                        .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                        .map((edge) => {
                          const isSource = edge.source === selectedNode.id;
                          const otherNodeId = isSource ? edge.target : edge.source;
                          const otherNode = graphNodes.find((n) => n.id === otherNodeId);
                          return (
                            <div key={edge.id} className="text-xs flex items-center gap-1">
                              {isSource ? (
                                <>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="text-primary">{edge.relation}</span>
                                  <span className="text-muted-foreground">→</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-muted-foreground">←</span>
                                  <span className="text-primary">{edge.relation}</span>
                                  <span className="text-muted-foreground">←</span>
                                </>
                              )}
                              <button
                                className="hover:text-primary transition-colors"
                                onClick={() => {
                                  const node = graphNodes.find((n) => n.id === otherNodeId);
                                  if (node) setSelectedNode(node);
                                }}
                              >
                                {otherNode?.label ?? '未知'}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : showWorkspaceChat || mainView === 'chat' ? (
          <WorkspaceChat
            workspaceId={workspaceId}
            onClose={() => {
              setShowWorkspaceChat(false);
              setMainView('file');
            }}
            currentConversationId={currentConversationId}
            onSelectConversation={onSelectConversation}
          />
        ) : currentFile ? (
          <>
            {/* PDF预览区 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 文件信息栏 */}
              <div className="h-12 flex items-center justify-between px-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{currentFile.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      currentFile.parseStatus === 'done'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : currentFile.parseStatus === 'parsing'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : currentFile.parseStatus === 'error'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {currentFile.parseStatus === 'done'
                      ? '已解析'
                      : currentFile.parseStatus === 'parsing'
                        ? '解析中'
                        : currentFile.parseStatus === 'error'
                          ? '解析失败'
                          : '待解析'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    onSelectFile(null);
                    onExpandPage(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* 解析进度 */}
              {parsing && (
                <div className="px-4 py-2 bg-muted/50 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  正在解析第 {parseProgress.current}/{parseProgress.total} 页...
                </div>
              )}

              {/* PDF渲染+页面标注 */}
              <PdfViewer
                fileId={currentFileId!}
                pageAnalyses={pageAnalyses}
                expandedPageNumber={expandedPageNumber}
                onExpandPage={onExpandPage}
              />
            </div>

            {/* 右侧详情/对话面板 */}
            {expandedPageNumber !== null && (
              <PageDetailPanel
                fileId={currentFileId!}
                workspaceId={workspaceId}
                pageNumber={expandedPageNumber}
                pageAnalyses={pageAnalyses}
                onClose={() => onExpandPage(null)}
                currentConversationId={currentConversationId}
                onSelectConversation={onSelectConversation}
              />
            )}
          </>
        ) : (
          /* 未选择文件时 */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <div>
                <p className="text-sm text-muted-foreground">选择或上传一份 PDF 课件开始学习</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  系统会自动解析每页知识点，点击即可深入讲解
                </p>
              </div>
              {graphNodes.length > 0 && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => setMainView('graph')}
                >
                  <Network className="w-4 h-4" />
                  查看知识图谱
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
