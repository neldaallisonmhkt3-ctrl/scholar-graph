import Dexie from 'dexie';
import type { Workspace, FileDocument, PageAnalysis, Conversation, ModelProvider, KnowledgeNode, KnowledgeEdge, Quiz, QuizQuestion, LabProject } from '@/types';

// Dexie v4 使用 Table 类型，不用 EntityTable（那是v4的高级类型，可能有兼容性问题）
interface ScholarGraphDB extends Dexie {
  workspaces: Dexie.Table<Workspace, string>;
  files: Dexie.Table<FileDocument, string>;
  fileBlobs: Dexie.Table<{ id: string; fileId: string; blob: Blob }, string>;
  pageAnalyses: Dexie.Table<PageAnalysis, string>;
  conversations: Dexie.Table<Conversation, string>;
  modelProviders: Dexie.Table<ModelProvider, string>;
  knowledgeNodes: Dexie.Table<KnowledgeNode, string>;
  knowledgeEdges: Dexie.Table<KnowledgeEdge, string>;
  quizzes: Dexie.Table<Quiz, string>;
  quizQuestions: Dexie.Table<QuizQuestion, string>;
  labProjects: Dexie.Table<LabProject, string>;
}

const db = new Dexie('ScholarGraphDB') as ScholarGraphDB;

db.version(4).stores({
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
  labProjects: 'id, name, createdAt, updatedAt',
});

export { db };
export type { ScholarGraphDB };
