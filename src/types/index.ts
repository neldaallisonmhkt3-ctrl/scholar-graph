// ========== 工作空间 ==========
export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ========== 文件 ==========
export type FileParseStatus = 'pending' | 'parsing' | 'done' | 'error';

export interface FileDocument {
  id: string;
  workspaceId: string;
  name: string;
  fileSize: number;
  pageCount: number;
  uploadedAt: number;
  parseStatus: FileParseStatus;
  /** PDF二进制数据存在IndexedDB的fileBlobs表中，用id关联 */
}

// ========== 页面解析结果 ==========
export interface PageAnalysis {
  id: string;
  fileId: string;
  workspaceId: string;
  pageNumber: number;
  /** 从PDF提取的原始文本 */
  rawText: string;
  /** LLM提取的关键词 */
  keywords: string[];
  /** LLM生成的一句话摘要 */
  summary: string;
}

// ========== 对话 ==========
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** 关联的页面范围，如 "第5-8页" */
  pageReferences?: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  /** null 表示工作空间级对话 */
  fileId: string | null;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ========== 模型配置 ==========
export interface ModelProvider {
  id: string;
  name: string;
  provider: 'deepseek' | 'openai' | 'claude' | 'gemini' | 'zhipu' | 'custom';
  apiKey: string;
  baseUrl: string;
  /** 该provider下可选的模型列表 */
  models: string[];
  /** 当前选中的模型 */
  defaultModel: string;
}

// ========== 知识图谱 ==========
export interface KnowledgeNode {
  id: string;
  workspaceId: string;
  /** 知识点名称 */
  label: string;
  /** 所属文件ID列表 */
  sourceFileIds: string[];
  /** 出现的页码（格式：fileId:pageNumber） */
  pageReferences: string[];
  /** LLM生成的一句话描述 */
  description: string;
}

export interface KnowledgeEdge {
  id: string;
  workspaceId: string;
  /** 起始节点ID */
  source: string;
  /** 目标节点ID */
  target: string;
  /** 关系描述，如"包含"、"依赖于"、"推导出" */
  relation: string;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  /** 生成时的文件ID快照，用于判断是否需要刷新 */
  fileSnapshot: string[];
  createdAt: number;
}

// ========== 应用状态 ==========
export type AppView = 'workspace' | 'settings';

export interface AppState {
  currentWorkspaceId: string | null;
  currentFileId: string | null;
  currentConversationId: string | null;
  /** 当前展开的页面（用于深度讲解） */
  expandedPageNumber: number | null;
  view: AppView;
}
