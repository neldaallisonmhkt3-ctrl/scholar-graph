import { useState, useEffect, useCallback } from 'react';
import { db } from '@/db';
import type { FileDocument, PageAnalysis } from '@/types';
import { v4 as uuid } from 'uuid';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileList } from '@/components/FileList';
import { PdfViewer } from '@/components/PdfViewer';
import { PageDetailPanel } from '@/components/PageDetailPanel';
import { WorkspaceChat } from '@/components/WorkspaceChat';
import { extractPagesText, buildLightParsePrompt, parseLightParseResult, createPageAnalysis } from '@/services/pdf';
import { callLLM } from '@/services/llm';
import {
  Upload,
  FileText,
  Loader2,
  MessageSquare,
  X,
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

  // 加载文件列表
  const loadFiles = useCallback(async () => {
    const list = await db.files.where('workspaceId').equals(workspaceId).toArray();
    setFiles(list);
  }, [workspaceId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

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

      // 保存文件元数据
      await db.files.add(fileDoc);

      // 保存PDF二进制
      await db.fileBlobs.add({ id: uuid(), fileId: fileDoc.id, blob: file });

      await loadFiles();
      onSelectFile(fileDoc.id);

      // 开始解析
      setParsing(true);
      fileDoc.parseStatus = 'parsing';
      await db.files.update(fileDoc.id, { parseStatus: 'parsing' });

      try {
        // 提取页面文本
        const { pageCount, pages } = await extractPagesText(file);
        await db.files.update(fileDoc.id, { pageCount });

        setParseProgress({ current: 0, total: pages.length });

        // 获取当前模型配置
        const providers = await db.modelProviders.toArray();
        const activeProvider = providers[0]; // 使用第一个配置的provider

        // 逐页调用LLM轻量解析
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
            // 没有API Key或页面无文字，用原始文本做兜底
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

        // 重新加载解析结果
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

      // 清空input以允许重复上传同名文件
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
          onSelectFile={onSelectFile}
          onDeleteFile={handleDeleteFile}
        />

        {/* 上传按钮 —— 放在底部，更醒目 */}
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

        {/* 工作空间对话入口 */}
        <div className="p-2 border-t border-border">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-xs h-8"
            onClick={() => setShowWorkspaceChat(true)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            跨文件问答
          </Button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {currentFile ? (
          <>
            {/* PDF预览区 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 文件信息栏 */}
              <div className="h-12 flex items-center justify-between px-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{currentFile.name}</span>
                  <Badge
                    variant={
                      currentFile.parseStatus === 'done'
                        ? 'default'
                        : currentFile.parseStatus === 'parsing'
                          ? 'secondary'
                          : currentFile.parseStatus === 'error'
                            ? 'destructive'
                            : 'outline'
                    }
                    className="text-[10px]"
                  >
                    {currentFile.parseStatus === 'done'
                      ? '已解析'
                      : currentFile.parseStatus === 'parsing'
                        ? '解析中'
                        : currentFile.parseStatus === 'error'
                          ? '解析失败'
                          : '待解析'}
                  </Badge>
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
        ) : showWorkspaceChat ? (
          <WorkspaceChat
            workspaceId={workspaceId}
            onClose={() => setShowWorkspaceChat(false)}
            currentConversationId={currentConversationId}
            onSelectConversation={onSelectConversation}
          />
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
