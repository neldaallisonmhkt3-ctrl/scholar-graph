import type { Quiz, QuizQuestion, KnowledgeNode, KnowledgeEdge, NodeMastery, MasteryLevel } from '@/types';
import { db } from '@/db';
import { v4 as uuid } from 'uuid';

// ========== 学习路径类型 ==========

export interface LearningPathStep {
  nodeId: string;
  label: string;
  masteryLevel: MasteryLevel | 'untested';
  /** 为什么这个节点在路径中 */
  reason: 'weak_root' | 'weak_prerequisite' | 'path_node';
  /** 学习顺序 */
  order: number;
}

export interface LearningPath {
  /** 路径目标：薄弱节点 */
  targetNodeId: string;
  targetLabel: string;
  /** 从根前置知识到薄弱节点的有序步骤 */
  steps: LearningPathStep[];
}

// ========== 错题→知识节点映射 ==========

/**
 * 将测验错题映射到知识图谱节点，并更新掌握度数据
 *
 * 匹配策略：
 * 1. 页码匹配（主策略）：quiz.fileId:question.sourcePage → KnowledgeNode.pageReferences
 * 2. 关键词兜底：题目文本 → KnowledgeNode.label / description
 */
export async function mapWrongAnswersToNodes(
  quiz: Quiz,
  questions: QuizQuestion[],
  answers: number[],
  workspaceId: string
): Promise<void> {
  // 获取该工作空间所有知识节点
  const allNodes = await db.knowledgeNodes
    .where('workspaceId')
    .equals(workspaceId)
    .toArray();

  if (allNodes.length === 0) return;

  // 获取已有的掌握度数据
  const existingMasteries = await db.nodeMasteries
    .where('workspaceId')
    .equals(workspaceId)
    .toArray();
  const masteryMap = new Map<string, NodeMastery>();
  for (const m of existingMasteries) {
    masteryMap.set(m.nodeId, m);
  }

  // 分类：错题和答对题
  const wrongQuestions = questions
    .map((q, i) => ({ question: q, index: i, userAnswer: answers[i] }))
    .filter((item) => item.userAnswer !== item.question.correctIndex);

  const correctQuestions = questions
    .map((q, i) => ({ question: q, index: i, userAnswer: answers[i] }))
    .filter((item) => item.userAnswer === item.question.correctIndex);

  // 为错题匹配知识节点
  const wrongNodeIds = new Set<string>();
  for (const { question } of wrongQuestions) {
    const matchedNodes = matchQuestionToNodes(question, quiz.fileId, allNodes);
    for (const node of matchedNodes) {
      wrongNodeIds.add(node.id);
    }
  }

  // 为答对题匹配知识节点
  const correctNodeIds = new Set<string>();
  for (const { question } of correctQuestions) {
    const matchedNodes = matchQuestionToNodes(question, quiz.fileId, allNodes);
    for (const node of matchedNodes) {
      correctNodeIds.add(node.id);
    }
  }

  const now = Date.now();
  const toSave: NodeMastery[] = [];

  // 处理所有涉及的节点
  const allAffectedIds = new Set([...wrongNodeIds, ...correctNodeIds]);

  for (const nodeId of allAffectedIds) {
    const existing = masteryMap.get(nodeId);
    const isWrong = wrongNodeIds.has(nodeId);
    const isCorrect = correctNodeIds.has(nodeId);

    if (existing) {
      // 更新已有记录
      const updated: NodeMastery = {
        ...existing,
        wrongCount: existing.wrongCount + (isWrong ? 1 : 0),
        correctCount: existing.correctCount + (isCorrect ? 1 : 0),
        sourceQuizIds: existing.sourceQuizIds.includes(quiz.id)
          ? existing.sourceQuizIds
          : [...existing.sourceQuizIds, quiz.id],
        updatedAt: now,
      };
      // 重新计算掌握等级
      updated.masteryLevel = computeMasteryLevel(updated.wrongCount, updated.correctCount);
      toSave.push(updated);
    } else {
      // 新建记录
      const mastery: NodeMastery = {
        id: uuid(),
        nodeId,
        workspaceId,
        masteryLevel: isWrong ? 'weak' : 'mastered',
        sourceQuizIds: [quiz.id],
        wrongCount: isWrong ? 1 : 0,
        correctCount: isCorrect ? 1 : 0,
        updatedAt: now,
      };
      toSave.push(mastery);
    }
  }

  // 批量保存
  for (const m of toSave) {
    await db.nodeMasteries.put(m);
  }
}

/**
 * 将单道题目匹配到知识节点
 * 策略：页码匹配优先，关键词兜底
 */
function matchQuestionToNodes(
  question: QuizQuestion,
  fileId: string,
  allNodes: KnowledgeNode[]
): KnowledgeNode[] {
  const matched = new Set<KnowledgeNode>();

  // 策略1：页码匹配 — "fileId:pageNumber"
  const pageRef = `${fileId}:${question.sourcePage}`;
  for (const node of allNodes) {
    if (node.pageReferences.includes(pageRef)) {
      matched.add(node);
    }
  }

  // 如果页码匹配到了，直接返回
  if (matched.size > 0) return [...matched];

  // 策略2：关键词匹配 — 题目文本与节点标签/描述
  const questionText = question.question.toLowerCase();
  const questionOptions = question.options.join(' ').toLowerCase();
  const fullText = questionText + ' ' + questionOptions;

  for (const node of allNodes) {
    const labelLower = node.label.toLowerCase();
    const descLower = node.description.toLowerCase();

    // 节点标签出现在题目中
    if (labelLower.length >= 2 && fullText.includes(labelLower)) {
      matched.add(node);
    }
    // 题目中的关键词出现在节点描述中（取描述前4个字）
    if (descLower.length >= 4 && fullText.includes(descLower.slice(0, 4))) {
      matched.add(node);
    }
  }

  return [...matched];
}

/**
 * 根据答对/答错次数计算掌握等级
 */
function computeMasteryLevel(wrongCount: number, correctCount: number): MasteryLevel {
  if (wrongCount > 0) return 'weak';
  if (correctCount >= 2) return 'mastered';
  if (correctCount >= 1) return 'learning';
  return 'weak';
}

// ========== 查询函数 ==========

/** 获取工作空间中所有薄弱节点 */
export async function getWeakNodes(workspaceId: string): Promise<NodeMastery[]> {
  return db.nodeMasteries
    .where('workspaceId')
    .equals(workspaceId)
    .filter((m) => m.masteryLevel === 'weak')
    .toArray();
}

/** 获取工作空间中所有掌握度数据 */
export async function getAllMastery(workspaceId: string): Promise<NodeMastery[]> {
  return db.nodeMasteries
    .where('workspaceId')
    .equals(workspaceId)
    .toArray();
}

/** 清除工作空间的所有掌握度数据 */
export async function clearMasteryForWorkspace(workspaceId: string): Promise<void> {
  await db.nodeMasteries
    .where('workspaceId')
    .equals(workspaceId)
    .delete();
}

// ========== 学习路径计算 ==========

/**
 * 基于知识图谱的"前置知识"边，计算从薄弱节点出发的学习路径
 *
 * 算法：对每个薄弱节点做反向BFS，沿"前置知识"边追溯根节点，
 * 然后按拓扑序排列，给出"先学A→再学B→最后学C(薄弱)"的推荐路径
 */
export function computeLearningPaths(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  weakNodeIds: Set<string>
): LearningPath[] {
  if (weakNodeIds.size === 0) return [];

  // 构建节点ID→标签的映射
  const nodeLabelMap = new Map<string, string>();
  for (const n of nodes) {
    nodeLabelMap.set(n.id, n.label);
  }

  // 构建"前置知识"邻接表
  // edge: source --前置知识--> target 意味着 source 是 target 的前置知识
  // 反向遍历：从 target 找 source（即找前置知识）
  const prerequisiteOf = new Map<string, string[]>(); // nodeId -> 它的前置知识节点ID列表
  for (const edge of edges) {
    if (edge.relation === '前置知识') {
      // source是target的前置知识
      const existing = prerequisiteOf.get(edge.target) ?? [];
      existing.push(edge.source);
      prerequisiteOf.set(edge.target, existing);
    }
  }

  // 构建掌握度映射（用于步骤标记）
  const masteryMap = new Map<string, MasteryLevel>();
  // 注意：这里我们只有weakNodeIds，无法区分learning和mastered
  // 在实际使用中，调用方应从DB获取完整的mastery数据

  const paths: LearningPath[] = [];

  for (const weakId of weakNodeIds) {
    const label = nodeLabelMap.get(weakId) ?? '未知';
    const steps: LearningPathStep[] = [];

    // 反向BFS：从薄弱节点出发，沿前置知识边追溯
    const visited = new Set<string>();
    const queue: string[] = [weakId];
    const parentMap = new Map<string, string>(); // child -> parent (child的前置知识)
    const allRelatedNodes: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      allRelatedNodes.push(current);

      // 找current的前置知识
      const prereqs = prerequisiteOf.get(current) ?? [];
      for (const prereq of prereqs) {
        if (!visited.has(prereq)) {
          parentMap.set(prereq, current); // prereq是current的前置知识
          queue.push(prereq);
        }
      }
    }

    // 拓扑排序：根节点（无前置知识的）排在前面
    // 简单方法：按BFS层级排序（先入队的在前 = 更底层的前置知识）
    // 但BFS已经保证了层级顺序，我们需要反转它
    // 实际上，allRelatedNodes中，薄弱节点在最前面（最先入队），
    // 其前置知识在后面。我们需要反转顺序：先学前置，再学目标

    const reversedNodes = [...allRelatedNodes].reverse();

    // 为每个节点分配步骤号
    for (let i = 0; i < reversedNodes.length; i++) {
      const nodeId = reversedNodes[i];
      const nodeLabel = nodeLabelMap.get(nodeId) ?? '未知';
      const isWeak = weakNodeIds.has(nodeId);

      let reason: LearningPathStep['reason'];
      if (nodeId === weakId) {
        reason = 'weak_root';
      } else if (isWeak) {
        reason = 'weak_prerequisite';
      } else {
        reason = 'path_node';
      }

      steps.push({
        nodeId,
        label: nodeLabel,
        masteryLevel: isWeak ? 'weak' : 'untested',
        reason,
        order: i + 1,
      });
    }

    // 如果只有薄弱节点本身（无前置知识），仍然生成单步路径
    paths.push({
      targetNodeId: weakId,
      targetLabel: label,
      steps,
    });
  }

  // 排序：步骤多的路径优先（说明薄弱节点有更多前置依赖，更需要先补基础）
  paths.sort((a, b) => b.steps.length - a.steps.length);

  return paths;
}

/**
 * 带完整掌握度数据的学习路径计算
 */
export function computeLearningPathsV2(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  weakNodeIds: Set<string>,
  masteryData: NodeMastery[]
): LearningPath[] {
  const paths = computeLearningPaths(nodes, edges, weakNodeIds);

  // 用真实掌握度数据更新步骤中的masteryLevel
  const masteryLookup = new Map<string, MasteryLevel>();
  for (const m of masteryData) {
    masteryLookup.set(m.nodeId, m.masteryLevel);
  }

  for (const path of paths) {
    for (const step of path.steps) {
      if (masteryLookup.has(step.nodeId)) {
        step.masteryLevel = masteryLookup.get(step.nodeId)!;
      }
    }
  }

  return paths;
}
