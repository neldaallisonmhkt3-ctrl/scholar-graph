import type { KnowledgeNode, KnowledgeEdge, PageAnalysis } from '@/types';
import { callLLM } from '@/services/llm';
import type { ModelProvider } from '@/types';
import { v4 as uuid } from 'uuid';

/** 构建知识图谱提取的Prompt */
export function buildKnowledgeGraphPrompt(
  courseName: string,
  pageData: { fileName: string; pageNumber: number; keywords: string[]; summary: string }[]
): string {
  // 按文件分组整理页面摘要
  const grouped: Record<string, { pageNumber: number; keywords: string[]; summary: string }[]> = {};
  for (const p of pageData) {
    if (!grouped[p.fileName]) grouped[p.fileName] = [];
    grouped[p.fileName].push(p);
  }

  const contentStr = Object.entries(grouped)
    .map(([fileName, pages]) => {
      const pageStr = pages
        .map((p) => `  第${p.pageNumber}页: 关键词[${p.keywords.join(', ')}] 摘要"${p.summary}"`)
        .join('\n');
      return `【${fileName}】\n${pageStr}`;
    })
    .join('\n\n');

  return `你是一个课程知识图谱构建助手。用户正在学习"${courseName}"这门课，以下是所有课件的知识点摘要：

${contentStr}

请从以上内容中提取知识图谱，要求：

1. 提取所有独立的知识点作为节点（node），每个节点包含：
   - id: 唯一标识，用小写英文+下划线命名，如"binary_tree", "time_complexity"
   - label: 知识点的中文简称，如"二叉树"，不超过6个字
   - description: 一句话解释该知识点

2. 提取知识点之间的关系作为边（edge），每条边包含：
   - source: 起始节点id
   - target: 目标节点id
   - relation: 关系类型，从以下选一个："包含" "依赖于" "推导出" "对比" "应用" "前置知识"

注意：
- 知识点粒度要适中，不要太细（如某个公式里的参数）也不要太粗（如整门课的名称）
- 每个知识点应该是一个可以独立理解的概念或方法
- 关系要体现知识之间的逻辑结构，帮助学生理解学习路径
- 节点数量控制在10-30个之间

请严格按以下JSON格式返回，不要添加任何其他文字：
{
  "nodes": [
    {"id": "xxx", "label": "知识点名称", "description": "一句话解释"}
  ],
  "edges": [
    {"source": "xxx", "target": "yyy", "relation": "包含"}
  ]
}`;
}

/** 解析LLM返回的知识图谱JSON */
export function parseKnowledgeGraphResult(
  text: string
): { nodes: { id: string; label: string; description: string }[]; edges: { source: string; target: string; relation: string }[] } {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const nodes = Array.isArray(parsed.nodes)
        ? parsed.nodes.filter((n: Record<string, unknown>) => n.id && n.label).map((n: Record<string, unknown>) => ({
            id: String(n.id),
            label: String(n.label),
            description: String(n.description ?? ''),
          }))
        : [];
      const edges = Array.isArray(parsed.edges)
        ? parsed.edges.filter((e: Record<string, unknown>) => e.source && e.target).map((e: Record<string, unknown>) => ({
            source: String(e.source),
            target: String(e.target),
            relation: String(e.relation ?? '关联'),
          }))
        : [];
      return { nodes, edges };
    }
  } catch {
    // 解析失败
  }
  return { nodes: [], edges: [] };
}

/** 从数据库中的PageAnalysis生成知识图谱 */
export async function generateKnowledgeGraph(
  workspaceId: string,
  courseName: string,
  provider: ModelProvider,
  getAllPageAnalyses: () => Promise<(PageAnalysis & { fileName?: string })[]>
): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }> {
  // 1. 获取所有页面解析数据
  const analyses = await getAllPageAnalyses();
  if (analyses.length === 0) {
    return { nodes: [], edges: [] };
  }

  // 2. 构建页面摘要数据
  const pageData = analyses.map((a) => ({
    fileName: a.fileName ?? '未知文件',
    pageNumber: a.pageNumber,
    keywords: a.keywords,
    summary: a.summary,
  }));

  // 3. 调用LLM提取知识图谱
  const prompt = buildKnowledgeGraphPrompt(courseName, pageData);
  const response = await callLLM(provider, [{ role: 'user', content: prompt }], {
    temperature: 0.3,
    maxTokens: 4096,
  });

  // 4. 解析结果
  const parsed = parseKnowledgeGraphResult(response.content);

  // 5. 构建KnowledgeNode和KnowledgeEdge对象
  // 为每个节点计算来源文件和页码
  const nodeIdToSources: Record<string, { fileIds: Set<string>; pages: string[] }> = {};
  for (const node of parsed.nodes) {
    nodeIdToSources[node.id] = { fileIds: new Set(), pages: [] };
    // 通过关键词匹配找到该知识点出现在哪些页面
    for (const analysis of analyses) {
      const labelMatch = analysis.keywords.some(
        (kw) => kw.includes(node.label) || node.label.includes(kw)
      );
      const descMatch = node.description && analysis.summary.includes(node.description.slice(0, 4));
      if (labelMatch || descMatch) {
        nodeIdToSources[node.id].fileIds.add(analysis.fileId);
        nodeIdToSources[node.id].pages.push(`${analysis.fileId}:${analysis.pageNumber}`);
      }
    }
  }

  const nodes: KnowledgeNode[] = parsed.nodes.map((n) => ({
    id: uuid(),
    workspaceId,
    label: n.label,
    sourceFileIds: Array.from(nodeIdToSources[n.id]?.fileIds ?? []),
    pageReferences: nodeIdToSources[n.id]?.pages ?? [],
    description: n.description,
  }));

  // 构建LLM id到数据库id的映射
  const llmIdToDbId: Record<string, string> = {};
  parsed.nodes.forEach((n, i) => {
    llmIdToDbId[n.id] = nodes[i].id;
  });

  const edges: KnowledgeEdge[] = parsed.edges
    .filter((e) => llmIdToDbId[e.source] && llmIdToDbId[e.target])
    .map((e) => ({
      id: uuid(),
      workspaceId,
      source: llmIdToDbId[e.source],
      target: llmIdToDbId[e.target],
      relation: e.relation,
    }));

  return { nodes, edges };
}
