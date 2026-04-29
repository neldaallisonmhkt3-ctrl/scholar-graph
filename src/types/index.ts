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

// ========== 知识掌握度 ==========
export type MasteryLevel = 'weak' | 'learning' | 'mastered';

export interface NodeMastery {
  id: string;
  /** 关联的知识图谱节点ID */
  nodeId: string;
  workspaceId: string;
  masteryLevel: MasteryLevel;
  /** 产生此状态的测验ID列表 */
  sourceQuizIds: string[];
  /** 答错次数 */
  wrongCount: number;
  /** 答对次数 */
  correctCount: number;
  updatedAt: number;
}

// ========== 测验 ==========
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface Quiz {
  id: string;
  /** 关联的PDF文件ID */
  fileId: string;
  workspaceId: string;
  /** 用户输入的关键词 */
  keywords: string[];
  /** 题目数量 */
  questionCount: number;
  /** 难度 */
  difficulty: QuizDifficulty;
  /** 用户答题记录（如果有） */
  answers?: number[];
  /** 是否已提交完成 */
  submitted?: boolean;
  createdAt: number;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  /** 题干 */
  question: string;
  /** 4个选项 */
  options: string[];
  /** 正确答案索引（0-3） */
  correctIndex: number;
  /** 答案解析 */
  explanation: string;
  /** 提示（答题前可查看） */
  hint: string;
  /** 来源页码 */
  sourcePage: number;
  /** 是否超出PDF范围（来自网络扩展） */
  isExtended: boolean;
}

export interface QuizSession {
  /** 当前答题进度 */
  currentIndex: number;
  /** 用户每题的选择，-1表示未答 */
  answers: number[];
  /** 是否已提交 */
  submitted: boolean;
}

// ========== 实验数据处理 ==========
/** 数据变量（一列数据） */
export interface LabVariable {
  /** 变量名，如 D/mm */
  name: string;
  /** 测量值列表 */
  values: number[];
  /** 仪器误差限 Δ仪，用于B类不确定度 */
  instrumentError?: number;
}

/** 预设公式类型 */
export type LabPresetFormula =
  | 'average'       // 算术平均值 x̄
  | 'stddev'        // 标准差 S
  | 'uA'            // A类不确定度 uA = S/√n
  | 'uB'            // B类不确定度 uB = Δ仪/√3
  | 'uCombined'     // 合成不确定度 u = √(uA²+uB²)
  | 'uRelative';    // 相对不确定度 ur = u/x̄

/** 公式模板 */
export interface LabFormulaTemplate {
  id: string;
  name: string;
  description: string;
  /** math.js表达式，变量用大括号引用，如 pi * {D_avg}^2 * {h_avg} / 4 */
  expression: string;
  /** 需要的输入变量描述 */
  inputs: { key: string; label: string }[];
}

/** 自定义公式 */
export interface LabCustomFormula {
  id: string;
  name: string;
  /** math.js表达式 */
  expression: string;
  createdAt: number;
}

/** 计算结果 */
export interface LabCalcResult {
  formula: LabPresetFormula | string;
  displayName: string;
  value: number;
  unit?: string;
  /** 完整的计算过程文本 */
  process: string;
}

/** 图表配置 */
export interface LabChartConfig {
  type: 'scatter' | 'line' | 'polar';
  xVariable: string;
  yVariable: string;
  /** 拟合类型 */
  fitType?: 'none' | 'linear' | 'quadratic' | 'cubic';
  title?: string;
}

/** 实验数据项目（顶层实体） */
export interface LabProject {
  id: string;
  name: string;
  /** 变量列表 */
  variables: LabVariable[];
  /** 自定义公式列表 */
  customFormulas: LabCustomFormula[];
  /** 保存的计算结果 */
  calcResults: LabCalcResult[];
  /** 图表配置列表 */
  charts: LabChartConfig[];
  createdAt: number;
  updatedAt: number;
}

// ========== 应用状态 ==========
export type AppView = 'workspace' | 'settings' | 'lab';

export interface AppState {
  currentWorkspaceId: string | null;
  currentFileId: string | null;
  currentConversationId: string | null;
  /** 当前展开的页面（用于深度讲解） */
  expandedPageNumber: number | null;
  view: AppView;
}
