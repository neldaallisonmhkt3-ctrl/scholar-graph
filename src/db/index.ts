import Dexie from 'dexie';
import type { Workspace, FileDocument, PageAnalysis, Conversation, ModelProvider, KnowledgeNode, KnowledgeEdge, Quiz, QuizQuestion, NodeMastery, LabProject } from '@/types';

// Dexie v4 使用 Table 类型，不用 EntityTable（那是v4的高级类型，可能有兼容性问题）
interface ScholarGraphDB extends Dexie {
  workspaces: Dexie.Table<Workspace, string>;
  files: Dexie.Table<FileDocument, string>;
  fileBlobs: Dexie.Table<{ id: string; fileId; blob: Blob }, string>;
  pageAnalyses: Dexie.Table<PageAnalysis, string>;
  conversations: Dexie.Table<Conversation, string>;
  modelProviders: Dexie.Table<ModelProvider, string>;
  knowledgeNodes: Dexie.Table<KnowledgeNode, string>;
  knowledgeEdges: Dexie.Table<KnowledgeEdge, string>;
  quizzes: Dexie.Table<Quiz, string>;
  quizQuestions: Dexie.Table<QuizQuestion, string>;
  nodeMasteries: Dexie.Table<NodeMastery, string>;
  labProjects: Dexie.Table<LabProject, string>;
}

const DB_NAME = 'ScholarGraphDB';

/** 创建并配置数据库 */
function createDatabase(): ScholarGraphDB {
  const db = new Dexie(DB_NAME) as ScholarGraphDB;

  // 必须保留所有历史版本声明，否则已有旧版数据库的浏览器会报 VersionError
  db.version(3).stores({
    workspaces: 'id, name, createdAt, updatedAt',
    files: 'id, workspaceId, name, uploadedAt, parseStatus',
    fileBlobs: 'id, fileId',
    pageAnalyses: 'id, fileId, workspaceId, pageNumber',
    conversations: 'id, workspaceId, fileId, createdAt, updatedAt',
    modelProviders: 'id, provider',
    knowledgeNodes: 'id, workspaceId, label',
    knowledgeEdges: 'id, workspaceId, source, target',
    quizzes: 'id, fileId, workspaceId, createdAt',
    quizQuestions: 'id, quizId',
  });

  // v4: 新增 nodeMasteries 表 + labProjects 表
  db.version(4).stores({
    nodeMasteries: 'id, workspaceId, nodeId, masteryLevel',
    labProjects: 'id, name, createdAt, updatedAt',
  });

  return db;
}

// 创建数据库实例
let db = createDatabase();

// 启动时尝试打开，如果版本升级导致损坏则自动删除重建
db.open().catch(async (err) => {
  console.warn('[DB] 数据库打开失败，尝试删除重建:', err);
  db.close();
  try {
    await Dexie.delete(DB_NAME);
    // 重新创建数据库实例（不能用旧的，因为版本声明已绑定）
    db = createDatabase();
    await db.open();
    console.info('[DB] 数据库重建成功');
  } catch (retryErr) {
    console.error('[DB] 数据库重建也失败了:', retryErr);
  }
});

export { db };
export type { ScholarGraphDB };
