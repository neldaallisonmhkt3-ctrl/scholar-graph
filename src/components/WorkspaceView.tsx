import { useState, useEffect, useCallback } from 'react';
import { db } from '@/db';
import type { FileDocument, PageAnalysis, KnowledgeNode, KnowledgeEdge, Workspace, Quiz, QuizQuestion, QuizDifficulty, QuizSession } from '@/types';
import { v4 as uuid } from 'uuid';
import { Button } from '@/components/ui/button';
import { FileList } from '@/components/FileList';
import { PdfViewer } from '@/components/PdfViewer';
import { PageDetailPanel } from '@/components/PageDetailPanel';
import { WorkspaceChat } from '@/components/WorkspaceChat';
import { KnowledgeGraphView } from '@/components/KnowledgeGraphView';
import { QuizSetup } from '@/components/QuizSetup';
import { QuizCard } from '@/components/QuizCard';
import { QuizResult } from '@/components/QuizResult';
import { extractPagesText, buildLightParsePrompt, parseLightParseResult, createPageAnalysis } from '@/services/pdf';
import { callLLM } from '@/services/llm';
import { generateKnowledgeGraph } from '@/services/knowledgeGraph';
import { generateQuiz, getQuizzesByFile, getQuizQuestions, deleteQuiz } from '@/services/quiz';
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
  Zap,
  History,
  Trash2,
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

type MainView = 'file' | 'chat' | 'graph' | 'quiz';

type QuizPhase = 'setup' | 'playing' | 'result';

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

  // Quiz状态
  const [quizPhase, setQuizPhase] = useState<QuizPhase>('setup');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizFileId, setQuizFileId] = useState<string | null>(null);
  const [quizHistory, setQuizHistory] = useState<Quiz[]>([]);

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

  // 加载Quiz历史
  const loadQuizHistory = useCallback(async (fileId: string) => {
    const quizzes = await getQuizzesByFile(fileId);
    setQuizHistory(quizzes);
  }, []);

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
      // 删除相关Quiz
      const quizzes = await db.quizzes.where('fileId').equals(id).toArray();
      for (const q of quizzes) {
        await db.quizQuestions.where('quizId').equals(q.id).delete();
      }
      await db.quizzes.where('fileId').equals(id).delete();
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
      const allAnalyses = await db.pageAnalyses
        .where('workspaceId')
        .equals(workspaceId)
        .toArray();

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

      await db.knowledgeNodes.where('workspaceId').equals(workspaceId).delete();
      await db.knowledgeEdges.where('workspaceId').equals(workspaceId).delete();

      const result = await generateKnowledgeGraph(
        workspaceId,
        workspaceName,
        activeProvider,
        () => Promise.resolve(analysesWithFileName)
      );

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

  // 打开Quiz
  const handleOpenQuiz = useCallback(
    async (fileId: string) => {
      setQuizFileId(fileId);
      setQuizPhase('setup');
      setQuizQuestions([]);
      setQuizAnswers([]);
      setMainView('quiz');
      await loadQuizHistory(fileId);
    },
    [loadQuizHistory]
  );

  // 生成Quiz
  const handleGenerateQuiz = useCallback(
    async (keywords: string[], questionCount: number, difficulty: QuizDifficulty) => {
      if (!quizFileId) return;

      const providers = await db.modelProviders.toArray();
      const activeProvider = providers[0];
      if (!activeProvider?.apiKey) {
        alert('请先在设置中配置 API Key');
        return;
      }

      setQuizLoading(true);
      try {
        const result = await generateQuiz(
          quizFileId,
          workspaceId,
          keywords,
          questionCount,
          difficulty,
          activeProvider,
          () => db.pageAnalyses.where('fileId').equals(quizFileId).sortBy('pageNumber')
        );

        setQuizQuestions(result.questions);
        setQuizPhase('playing');
        await loadQuizHistory(quizFileId);
      } catch (err) {
        console.error('出题失败:', err);
        alert('出题失败: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setQuizLoading(false);
      }
    },
    [quizFileId, workspaceId, loadQuizHistory]
  );

  // Quiz答题完成
  const handleQuizComplete = useCallback((answers: number[]) => {
    setQuizAnswers(answers);
    setQuizPhase('result');
  }, []);

  // Quiz重新出题
  const handleQuizRetry = useCallback(() => {
    setQuizPhase('setup');
    setQuizQuestions([]);
    setQuizAnswers([]);
  }, []);

  // Quiz返回课件
  const handleQuizBack = useCallback(() => {
    setMainView('file');
    setQuizPhase('setup');
    setQuizQuestions([]);
    setQuizAnswers([]);
  }, []);

  // Quiz跳转到来源页
  const handleQuizGoToPage = useCallback(
    (page: number) => {
      if (quizFileId) {
        onSelectFile(quizFileId);
        onExpandPage(page);
        setMainView('file');
      }
    },
    [quizFileId, onSelectFile, onExpandPage]
  );

  // 加载历史Quiz
  const handleLoadHistoryQuiz = useCallback(async (quizId: string) => {
    const questions = await getQuizQuestions(quizId);
    if (questions.length > 0) {
      setQuizQuestions(questions);
      setQuizPhase('playing');
    }
  }, []);

  // 删除历史Quiz
  const handleDeleteHistoryQuiz = useCallback(
    async (quizId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteQuiz(quizId);
      if (quizFileId) {
        await loadQuizHistory(quizFileId);
      }
    },
    [quizFileId, loadQuizHistory]
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
          onQuizFile={handleOpenQuiz}
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
        {mainView === 'quiz' ? (
          /* Quiz视图 */
          <div className="flex-1 flex overflow-hidden">
            {quizPhase === 'setup' && (
              <div className="flex-1 flex overflow-hidden">
                <QuizSetup
                  fileName={files.find((f) => f.id === quizFileId)?.name ?? '未知文件'}
                  onSubmit={handleGenerateQuiz}
                  onCancel={handleQuizBack}
                  loading={quizLoading}
                />
                {/* 历史Quiz侧边栏 */}
                {quizHistory.length > 0 && (
                  <div className="w-56 border-l border-border bg-card p-3 space-y-2 overflow-y-auto">
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <History className="w-3 h-3" />
                      历史测验
                    </h4>
                    {quizHistory.map((q) => (
                      <div
                        key={q.id}
                        className="p-2 rounded-lg border border-border hover:border-primary/50 cursor-pointer transition-colors group"
                        onClick={() => handleLoadHistoryQuiz(q.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs space-y-0.5">
                            <div className="font-medium truncate">
                              {q.keywords.length > 0 ? q.keywords.join('、') : '全部知识点'}
                            </div>
                            <div className="text-muted-foreground">
                              {q.questionCount}题 · {q.difficulty === 'easy' ? '简单' : q.difficulty === 'medium' ? '中等' : '困难'}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                            onClick={(e) => handleDeleteHistoryQuiz(q.id, e)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {quizPhase === 'playing' && (
              <QuizCard
                questions={quizQuestions}
                onComplete={handleQuizComplete}
                onGoToPage={handleQuizGoToPage}
                onBack={handleQuizBack}
              />
            )}
            {quizPhase === 'result' && (
              <QuizResult
                questions={quizQuestions}
                answers={quizAnswers}
                onRetry={handleQuizRetry}
                onBack={handleQuizBack}
                onGoToPage={handleQuizGoToPage}
              />
            )}
          </div>
        ) : mainView === 'graph' ? (
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
                <div className="flex items-center gap-1">
                  {/* Quiz按钮 */}
                  {currentFile.parseStatus === 'done' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleOpenQuiz(currentFileId!)}
                    >
                      <Zap className="w-3 h-3" />
                      Quiz
                    </Button>
                  )}
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
