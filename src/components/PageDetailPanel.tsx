import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/db';
import type { PageAnalysis, ChatMessage, Conversation } from '@/types';
import { v4 as uuid } from 'uuid';
import { callLLM } from '@/services/llm';
import { buildDetailExplainPrompt, buildFollowUpSystemPrompt } from '@/services/pdf';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Send, Loader2, BookOpen } from 'lucide-react';

interface PageDetailPanelProps {
  fileId: string;
  workspaceId: string;
  pageNumber: number;
  pageAnalyses: PageAnalysis[];
  onClose: () => void;
  currentConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
}

export function PageDetailPanel({
  fileId,
  workspaceId,
  pageNumber,
  pageAnalyses,
  onClose,
  currentConversationId,
  onSelectConversation,
}: PageDetailPanelProps) {
  const pageAnalysis = pageAnalyses.find((a) => a.pageNumber === pageNumber);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoaded, setDetailLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 加载已有对话或创建新对话
  useEffect(() => {
    if (currentConversationId) {
      db.conversations.get(currentConversationId).then((conv) => {
        if (conv) setMessages(conv.messages);
      });
    } else {
      setMessages([]);
      setDetailLoaded(false);
    }
  }, [currentConversationId, pageNumber]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 自动生成深度讲解
  useEffect(() => {
    if (detailLoaded || messages.length > 0 || !pageAnalysis?.rawText.trim()) return;
    generateDetailExplanation();
  }, [pageNumber, pageAnalysis?.id]);

  // 生成深度讲解
  const generateDetailExplanation = useCallback(async () => {
    if (!pageAnalysis?.rawText.trim()) return;
    setLoading(true);

    try {
      const providers = await db.modelProviders.toArray();
      const provider = providers[0];
      if (!provider?.apiKey) {
        setMessages([
          {
            id: uuid(),
            role: 'assistant',
            content: '请先在"模型设置"中配置 API Key，才能使用AI讲解功能。',
            timestamp: Date.now(),
          },
        ]);
        setLoading(false);
        return;
      }

      const prompt = buildDetailExplainPrompt(pageNumber, pageAnalysis.rawText, pageAnalysis.summary);
      const response = await callLLM(provider, [
        { role: 'user', content: prompt },
      ]);

      const assistantMsg: ChatMessage = {
        id: uuid(),
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        pageReferences: `第${pageNumber}页`,
      };

      // 创建对话记录
      const conversation: Conversation = {
        id: uuid(),
        workspaceId,
        fileId,
        title: `第${pageNumber}页 - ${pageAnalysis.summary}`,
        messages: [assistantMsg],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.conversations.add(conversation);
      onSelectConversation(conversation.id);

      setMessages([assistantMsg]);
      setDetailLoaded(true);
    } catch (err) {
      setMessages([
        {
          id: uuid(),
          role: 'assistant',
          content: `生成讲解失败：${err instanceof Error ? err.message : '未知错误'}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [pageAnalysis, pageNumber, workspaceId, fileId, onSelectConversation]);

  // 发送追问
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const providers = await db.modelProviders.toArray();
      const provider = providers[0];
      if (!provider?.apiKey) throw new Error('未配置API Key');

      if (!pageAnalysis) throw new Error('页面未解析');

      const systemPrompt = buildFollowUpSystemPrompt(pageNumber, pageAnalysis.rawText, pageAnalysis.summary);
      const llmMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...newMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      const response = await callLLM(provider, llmMessages);

      const assistantMsg: ChatMessage = {
        id: uuid(),
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        pageReferences: `第${pageNumber}页`,
      };

      const updatedMessages = [...newMessages, assistantMsg];
      setMessages(updatedMessages);

      // 更新对话记录
      if (currentConversationId) {
        await db.conversations.update(currentConversationId, {
          messages: updatedMessages,
          updatedAt: Date.now(),
        });
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: uuid(),
        role: 'assistant',
        content: `回答失败：${err instanceof Error ? err.message : '未知错误'}`,
        timestamp: Date.now(),
      };
      setMessages([...newMessages, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, pageAnalysis, pageNumber, currentConversationId]);

  // 键盘快捷键：Ctrl+Enter 发送
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="w-[420px] border-l border-border flex flex-col bg-card">
      {/* 头部 */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">第 {pageNumber} 页详解</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* 页面摘要 */}
      {pageAnalysis && (
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            {pageAnalysis.summary || '该页暂无摘要'}
          </p>
          {pageAnalysis.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {pageAnalysis.keywords.map((kw, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 对话区 */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-4">
          {loading && messages.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在生成讲解...
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.pageReferences && (
                  <div className="text-[10px] opacity-60 mt-1">{msg.pageReferences}</div>
                )}
              </div>
            </div>
          ))}
          {loading && messages.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              思考中...
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 输入区 */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            placeholder="追问关于这一页的内容... (Ctrl+Enter 发送)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[60px] text-sm resize-none"
            disabled={loading}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
