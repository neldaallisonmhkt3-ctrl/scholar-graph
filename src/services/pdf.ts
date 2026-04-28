import type { PageAnalysis } from '@/types';
import { v4 as uuid } from 'uuid';

// 延迟加载pdfjs-dist，避免顶层import导致白屏
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    // 使用CDN加载worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;
  }
  return pdfjsLib;
}

/** 从PDF文件提取每页文本 */
export async function extractPagesText(file: File): Promise<{ pageCount: number; pages: { pageNumber: number; text: string }[] }> {
  const lib = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pageCount = pdf.numPages;
  const pages: { pageNumber: number; text: string }[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    pages.push({ pageNumber: i, text });
  }

  return { pageCount, pages };
}

/** 渲染PDF页面到canvas（高清预览） */
export async function renderPageToCanvas(
  fileBlob: Blob,
  pageNumber: number,
  container: HTMLDivElement,
  scale = 1.5
): Promise<HTMLCanvasElement> {
  const lib = await getPdfjs();
  const arrayBuffer = await fileBlob.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation: 0 });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.className = 'pdf-page-canvas';
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d')!;

  container.innerHTML = '';
  container.appendChild(canvas);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** 渲染单页到指定 canvas（不创建新元素） */
export async function renderPageToExistingCanvas(
  fileBlob: Blob,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1.5
): Promise<void> {
  const lib = await getPdfjs();
  const arrayBuffer = await fileBlob.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation: 0 });

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

/** 渲染PDF页面为图片Blob URL（离屏canvas，不依赖DOM） */
export async function renderPageToBlobUrl(
  fileBlob: Blob,
  pageNumber: number,
  scale = 1.5
): Promise<string> {
  const lib = await getPdfjs();
  const arrayBuffer = await fileBlob.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const page = await pdf.getPage(pageNumber);

  // 不指定 rotation，使用页面默认旋转
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  // 先填充白色背景（PNG透明底变白）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  // canvas → Blob → Object URL
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
  return URL.createObjectURL(blob);
}

/** 构建轻量解析的Prompt */
export function buildLightParsePrompt(pageNumber: number, pageText: string): string {
  return `你是一个课程知识点提取助手。以下是PDF课件第${pageNumber}页的文字内容，请提取：

1. 关键词（3-5个，用逗号分隔）
2. 一句话摘要（不超过30字，概括该页核心内容）

请严格按以下JSON格式返回，不要添加任何其他文字：
{"keywords": ["关键词1", "关键词2"], "summary": "一句话摘要"}

如果该页内容为空或无法提取有效信息，返回：
{"keywords": [], "summary": "该页无可提取内容"}

---页面内容---
${pageText}`;
}

/** 构建深度讲解的Prompt */
export function buildDetailExplainPrompt(
  pageNumber: number,
  pageText: string,
  pageSummary: string
): string {
  return `你是一个耐心的课程学习辅导助手。用户正在学习一份PDF课件，当前查看的是第${pageNumber}页。

该页摘要：${pageSummary}
该页原文内容：
${pageText}

请对这一页的内容进行详细讲解：
1. 用清晰易懂的语言解释该页涉及的所有概念
2. 如果有公式，解释每个符号的含义
3. 如果有示例，分析示例的解题思路
4. 标注该页内容与前面知识的关联（如果能推断的话）

注意：不要直接照搬原文，而是用自己的话重新讲解，帮助学生真正理解。`;
}

/** 构建追问的System Prompt */
export function buildFollowUpSystemPrompt(
  pageNumber: number,
  pageText: string,
  pageSummary: string
): string {
  return `你是一个课程学习辅导助手。用户正在学习PDF课件的第${pageNumber}页，可能会对你之前的讲解进行追问。

当前页面摘要：${pageSummary}
当前页面原文：
${pageText}

请基于该页面的内容回答用户的问题。如果问题超出该页范围，可以适当扩展，但要标注"这超出了当前页面范围"。鼓励学生思考，不要只是简单给出答案。`;
}

/** 构建工作空间级对话的System Prompt */
export function buildWorkspaceSystemPrompt(
  workspaceName: string,
  fileSummaries: { fileName: string; summaries: { pageNumber: number; summary: string }[] }[]
): string {
  const summaryText = fileSummaries
    .map(
      (f) =>
        `【${f.fileName}】\n${f.summaries.map((s) => `  第${s.pageNumber}页: ${s.summary}`).join('\n')}`
    )
    .join('\n\n');

  return `你是一个课程学习辅导助手。用户正在复习"${workspaceName}"这门课的所有课件内容。

以下是每份课件的逐页摘要：
${summaryText}

用户可能会问跨课件的综合问题。请基于以上摘要信息回答，如果需要更详细的内容，告诉用户可以去具体课件中深入查看。鼓励学生建立知识之间的关联。`;
}

/** 解析LLM返回的轻量解析结果 */
export function parseLightParseResult(text: string): { keywords: string[]; summary: string } {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        summary: typeof parsed.summary === 'string' ? parsed.summary : '解析失败',
      };
    }
  } catch {
    // 解析失败
  }
  return { keywords: [], summary: text.slice(0, 50) };
}

/** 生成PageAnalysis对象 */
export function createPageAnalysis(
  fileId: string,
  workspaceId: string,
  pageNumber: number,
  rawText: string,
  keywords: string[],
  summary: string
): PageAnalysis {
  return {
    id: uuid(),
    fileId,
    workspaceId,
    pageNumber,
    rawText,
    keywords,
    summary,
  };
}
