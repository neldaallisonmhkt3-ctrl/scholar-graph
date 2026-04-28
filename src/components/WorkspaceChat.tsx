import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/db';
import type { ChatMessage, Conversation, PageAnalysis } from '@/types';
import { v4 as uuid } from 'uuid';
import { callLLM } from '@/services/llm';
import { buildWorkspaceSystemPrompt } from '@/services/pdf';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Send, Loader2, MessageSquare } from 'lucide-react';

interface WorkspaceChatProps {
  workspaceId: string;
  workspaceName: string;
  currentFileName: string | null;
  onClose: () => void;
  currentConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
}

export function WorkspaceChat({
  workspaceId,
  workspaceName,
  currentFileName,
  onClose,
  currentConversationId,
  onSelectConversation,
}: WorkspaceChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 加载已有的工作空间对话
  const loadConversations = useCallback(async () => {
    const list = await db.conversations
      .where('workspaceId')
      .equals(workspaceId)
      .and((c) => c.fileId === null)
      .reverse()
      .sortBy('updatedAt');
    setConversations(list);
  }, [workspaceId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 加载选中对话的消息
  useEffect(() => {
    if (currentConversationId) {
      db.conversations.get(currentConversationId).then((conv) => {
        if (conv) setMessages(conv.messages);
      });
    } else {
      setMessages([]);
    }
  }, [currentConversationId]);

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 构建工作空间上下文
  const buildContext = useCallback(async () => {
    // 获取工作空间名称
    const workspace = await db.workspaces.get(workspaceId);
    const workspaceName = workspace?.name ?? '未命名课程';

    // 获取所有文件的页面摘要
    const allFiles = await db.files.where('workspaceId').equals(workspaceId).toArray();
    const fileSummaries: { fileName: string; summaries: { pageNumber: number; summary: string }[] }[] = [];

    for (const file of allFiles) {
      const analyses = await db.pageAnalyses
        .where('fileId')
        .equals(file.id)
        .sortBy('pageNumber');
      fileSummaries.push({
        fileName: file.name,
        summaries: analyses
          .filter((a) => a.summary)
          .map((a) => ({ pageNumber: a.pageNumber, summary: a.summary })),
      });
    }

    return buildWorkspaceSystemPrompt(workspaceName, fileSummaries);
  }, [workspaceId]);

  // 发送消息
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

      const systemPrompt = await buildContext();
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
      };

      const updatedMessages = [...newMessages, assistantMsg];
      setMessages(updatedMessages);

      // 保存或更新对话
      if (currentConversationId) {
        await db.conversations.update(currentConversationId, {
          messages: updatedMessages,
          updatedAt: Date.now(),
        });
      } else {
        const conversation: Conversation = {
          id: uuid(),
          workspaceId,
          fileId: null,
          title: text.slice(0, 30),
          messages: updatedMessages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.conversations.add(conversation);
        onSelectConversation(conversation.id);
        await loadConversations();
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
  }, [input, loading, messages, workspaceId, currentConversationId, buildContext, onSelectConversation, loadConversations]);

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
    <div className="flex-1 flex overflow-hidden">
      {/* 对话历史列表 */}
      <div className="w-48 border-r border-border flex flex-col bg-card">
        <div className="h-10 flex items-center px-3 border-b border-border">
          <span className="text-xs font-medium">对话记录</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            <button
              onClick={() => onSelectConversation(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                !currentConversationId ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              <MessageSquare className="w-3 h-3 shrink-0" />
              <span className="truncate">新对话</span>
            </button>
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                  currentConversationId === conv.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                <MessageSquare className="w-3 h-3 shrink-0" />
                <span className="truncate">{conv.title}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* 对话区 */}
      <div className="flex-1 flex flex-col">
        <div className="h-12 flex items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">
              {currentFileName ? `${currentFileName} AI问答` : `${workspaceName || '课件'} AI问答`}
            </span>
            <span className="text-xs text-muted-foreground">— 基于课件内容智能解答</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="p-4 space-y-4 max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">输入问题，基于课件内容为你解答</p>
                <p className="text-xs text-muted-foreground/60 mt-1">如：这节课的重点是什么？</p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                思考中...
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border max-w-3xl mx-auto w-full">
          <div className="flex gap-2">
            <Textarea
              placeholder="针对课件内容提问... (Ctrl+Enter 发送)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[60px] text-sm resize-none"
              disabled={loading}
            />
            <Button size="icon" onClick={handleSend} disabled={!input.trim() || loading} className="shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
