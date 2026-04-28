import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/db';
import type { FileDocument, PageAnalysis, KnowledgeNode, KnowledgeEdge, Workspace, Quiz, QuizQuestion, QuizDifficulty, QuizSession, NodeMastery } from '@/types';
import { v4 as uuid } from 'uuid';
import { Button } from '@/components/ui/button';
import { FileList } from '@/components/FileList';
import { PdfViewer } from '@/components/PdfViewer';
import { WorkspaceChat } from '@/components/WorkspaceChat';
import { KnowledgeGraphView } from '@/components/KnowledgeGraphView';
import { QuizSetup } from '@/components/QuizSetup';
import { QuizCard } from '@/components/QuizCard';
import { QuizResult } from '@/components/QuizResult';
import { extractPagesText, buildLightParsePrompt, parseLightParseResult, createPageAnalysis } from '@/services/pdf';
import { callLLM } from '@/services/llm';
import { generateKnowledgeGraph } from '@/services/knowledgeGraph';
import { generateQuiz, getQuizzesByFile, getQuizQuestions, deleteQuiz } from '@/services/quiz';
import { mapWrongAnswersToNodes, getWeakNodes, computeLearningPathsV2, getAllMastery } from '@/services/mastery';
import type { LearningPath } from '@/services/mastery';
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
  AlertTriangle,
  Route,
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

  // 文件列表宽度拖拽状态
  const [fileListWidth, setFileListWidth] = useState(224);
  const [isFileListDragging, setIsFileListDragging] = useState(false);
  const fileListStartXRef = useRef(0);
  const fileListStartWidthRef = useRef(224);

  const handleFileListMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsFileListDragging(true);
    fileListStartXRef.current = e.clientX;
    fileListStartWidthRef.current = fileListWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [fileListWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isFileListDragging) return;
      const delta = e.clientX - fileListStartXRef.current;
      const newWidth = Math.max(160, Math.min(400, fileListStartWidthRef.current + delta));
      setFileListWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsFileListDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    if (isFileListDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isFileListDragging]);

  // Quiz状态
  const [quizPhase, setQuizPhase] = useState<QuizPhase>('setup');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizFileId, setQuizFileId] = useState<string | null>(null);
  const [quizHistory, setQuizHistory] = useState<Quiz[]>([]);

  // 薄弱知识点与学习路径状态
  const [weakNodeIds, setWeakNodeIds] = useState<Set<string>>(new Set());
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>([]);
  const [showLearningPath, setShowLearningPath] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);

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

  // 加载薄弱知识点数据（图谱数据变化时）
  useEffect(() => {
    if (graphNodes.length > 0) {
      loadWeakNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphNodes.length, graphEdges.length]);

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

  // 加载薄弱知识点数据
  const loadWeakNodes = useCallback(async () => {
    const masteries = await getWeakNodes(workspaceId);
    const weakIds = new Set(masteries.map((m) => m.nodeId));
    setWeakNodeIds(weakIds);

    if (weakIds.size > 0 && graphNodes.length > 0) {
      const allMasteryData = await getAllMastery(workspaceId);
      const paths = computeLearningPathsV2(graphNodes, graphEdges, weakIds, allMasteryData);
      setLearningPaths(paths);
    } else {
      setLearningPaths([]);
    }
  }, [workspaceId, graphNodes, graphEdges]);

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
        setCurrentQuiz(result.quiz);
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

  // 查看薄弱知识点 — 从Quiz结果跳转到知识图谱
  const handleViewWeakPoints = useCallback(async () => {
    if (!currentQuiz || quizQuestions.length === 0) return;

    // 1. 映射错题到知识节点，持久化掌握度数据
    await mapWrongAnswersToNodes(currentQuiz, quizQuestions, quizAnswers, workspaceId);

    // 2. 重新加载薄弱节点数据
    const masteries = await getWeakNodes(workspaceId);
    const weakIds = new Set(masteries.map((m) => m.nodeId));
    setWeakNodeIds(weakIds);

    // 3. 计算学习路径
    if (weakIds.size > 0) {
      const allMasteryData = await getAllMastery(workspaceId);
      const paths = computeLearningPathsV2(graphNodes, graphEdges, weakIds, allMasteryData);
      setLearningPaths(paths);
      setShowLearningPath(true);
    }

    // 4. 切换到图谱视图
    setMainView('graph');
  }, [currentQuiz, quizQuestions, quizAnswers, workspaceId, graphNodes, graphEdges]);

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


  // 图谱视图是全屏模式，不显示文件列表
  const isGraphFullScreen = mainView === 'graph';

  return (
    <div className="flex-1 flex overflow-hidden h-full min-h-0">
      {/* 图谱全屏模式 */}
      {isGraphFullScreen ? (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* 顶部栏 */}
          <div className="h-12 flex items-center justify-between px-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Network className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate">
                {workspaceName} - 知识图谱
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                ({graphNodes.length}个知识点, {graphEdges.length}条关系)
              </span>
              {weakNodeIds.size > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {weakNodeIds.size} 个薄弱点
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant={showLearningPath ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowLearningPath(!showLearningPath)}
                disabled={weakNodeIds.size === 0}
              >
                <Route className="w-3 h-3" />
                学习路径
              </Button>
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
                {generatingGraph ? '生成中...' : '重新生成'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setMainView('file');
                  setSelectedNode(null);
                  setShowLearningPath(false);
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* 图谱内容区 - 全屏展示 */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <KnowledgeGraphView
              nodes={graphNodes}
              edges={graphEdges}
              onNodeClick={handleNodeClick}
              selectedNode={selectedNode}
              onNavigateToNode={(node) => {
                setSelectedNode(node);
                // 点击节点时关闭学习路径面板
                if (node) setShowLearningPath(false);
              }}
              onGoToFile={handleNodeGoToFile}
              files={files}
              weakNodeIds={weakNodeIds}
              learningPaths={learningPaths}
              showLearningPath={showLearningPath}
              onToggleLearningPath={() => setShowLearningPath(!showLearningPath)}
            />
          </div>
        </div>
      ) : (
      <>
      {/* 非图谱模式：文件列表 + 主内容区 */}
      {/* 文件列表面板 */}
      <div
        style={{ width: fileListWidth, minWidth: fileListWidth, maxWidth: fileListWidth }}
        className="shrink-0 border-r border-border flex flex-col bg-card"
      >
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

        {/* Quiz按钮 */}
        <div className="p-2 border-t border-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={() => currentFileId && handleOpenQuiz(currentFileId)}
            disabled={!currentFileId || currentFile?.parseStatus !== 'done' || quizLoading}
          >
            {quizLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                出题中...
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5" />
                测验
              </>
            )}
          </Button>
        </div>

        {/* 知识图谱按钮：已有数据→查看，无数据→生成 */}
        <div className="p-2 border-t border-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={graphNodes.length > 0 ? () => setMainView('graph') : handleGenerateGraph}
            disabled={generatingGraph || parsing}
          >
            {generatingGraph ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                生成中...
              </>
            ) : graphNodes.length > 0 ? (
              <>
                <Network className="w-3.5 h-3.5" />
                查看知识图谱
              </>
            ) : (
              <>
                <Network className="w-3.5 h-3.5" />
                生成知识图谱
              </>
            )}
          </Button>
        </div>

        {/* 重新生成图谱（已有图谱时显示） */}
        {graphNodes.length > 0 && (
          <div className="px-2 pb-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs h-7 text-muted-foreground"
              onClick={handleGenerateGraph}
              disabled={generatingGraph}
            >
              <RefreshCw className="w-3 h-3" />
              重新生成图谱
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
            AI 问答
          </Button>
        </div>
      </div>

      {/* 文件列表与主内容区之间的拖拽分隔条 */}
      <div
        onMouseDown={handleFileListMouseDown}
        className={`
          w-1.5 shrink-0 cursor-col-resize 
          bg-border hover:bg-primary/40 
          flex items-center justify-center
          transition-colors
          ${isFileListDragging ? 'bg-primary/60' : ''}
        `}
        style={{ zIndex: 50 }}
      >
        <div className={`h-8 w-1 rounded-full bg-muted-foreground/30 ${isFileListDragging ? 'bg-primary/60' : ''}`} />
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden min-w-0">
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
                  <div className="w-56 border-l border-border bg-card p-3 space-y-2 overflow-y-auto shrink-0">
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
                          <div className="text-xs space-y-0.5 min-w-0">
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
                onViewWeakPoints={graphNodes.length > 0 ? handleViewWeakPoints : undefined}
              />
            )}
          </div>
        ) : showWorkspaceChat || mainView === 'chat' ? (
          <WorkspaceChat
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            currentFileName={currentFile?.name ?? null}
            onClose={() => {
              setShowWorkspaceChat(false);
              setMainView('file');
            }}
            currentConversationId={currentConversationId}
            onSelectConversation={onSelectConversation}
          />
        ) : currentFile ? (
          <div className="flex-1 flex overflow-hidden">
            {/* PDF预览区 */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {/* 文件信息栏 */}
              <div className="h-12 flex items-center justify-between px-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{currentFile.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
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
                <div className="flex items-center gap-1 shrink-0">
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
                <div className="px-4 py-2 bg-muted/50 text-xs text-muted-foreground flex items-center gap-2 shrink-0">
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
          </div>
        ) : (
          /* 未选择文件时 */
          <div className="flex-1 flex items-center justify-center p-6">
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
      </>
      )}
    </div>
  );
}
