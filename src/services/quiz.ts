import type { Quiz, QuizQuestion, QuizDifficulty, PageAnalysis } from '@/types';
import { callLLM } from '@/services/llm';
import type { ModelProvider } from '@/types';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';

/** 构建Quiz出题的Prompt */
export function buildQuizPrompt(
  fileName: string,
  keywords: string[],
  questionCount: number,
  difficulty: QuizDifficulty,
  pageData: { pageNumber: number; keywords: string[]; summary: string }[]
): string {
  const difficultyMap: Record<QuizDifficulty, string> = {
    easy: '简单（基础概念和定义，直白考察）',
    medium: '中等（理解应用层面，需要推理分析）',
    hard: '困难（综合运用和深入分析，需要跨知识点推理）',
  };

  const contentStr = pageData
    .map((p) => `第${p.pageNumber}页: 关键词[${p.keywords.join(', ')}] 摘要"${p.summary}"`)
    .join('\n');

  const keywordStr = keywords.length > 0 ? keywords.join('、') : '全部知识点';

  return `你是一个专业的课程测验出题助手。用户正在学习"${fileName}"这份课件，以下是各页面的知识点摘要：

${contentStr}

用户要求围绕以下知识点出题：${keywordStr}

请出${questionCount}道四选一选择题，难度为${difficultyMap[difficulty]}。

要求：
1. 题目必须基于以上课件内容，但也可以适当扩展相关知识（在isExtended字段标注）
2. 每道题必须围绕用户指定的关键词范围出题
3. 4个选项中只有1个正确答案，干扰项要有迷惑性但不能有歧义
4. 每道题需包含解析（explanation）和提示（hint），提示要在不泄露答案的前提下帮助思考
5. sourcePage标注该题主要基于哪一页内容（填页码数字）
6. 如果题目超出了课件内容范围（来自你的知识扩展），isExtended设为true

请严格按以下JSON格式返回，不要添加任何其他文字：
{
  "questions": [
    {
      "question": "题干文本",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "correctIndex": 0,
      "explanation": "答案解析",
      "hint": "思考提示",
      "sourcePage": 1,
      "isExtended": false
    }
  ]
}`;
}

/** 解析LLM返回的Quiz JSON */
export function parseQuizResult(
  text: string
): { question: string; options: string[]; correctIndex: number; explanation: string; hint: string; sourcePage: number; isExtended: boolean }[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.questions)) {
        return parsed.questions
          .filter((q: Record<string, unknown>) => q.question && Array.isArray(q.options) && q.options.length === 4)
          .map((q: Record<string, unknown>) => ({
            question: String(q.question),
            options: (q.options as string[]).map(String),
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
            explanation: String(q.explanation ?? ''),
            hint: String(q.hint ?? ''),
            sourcePage: typeof q.sourcePage === 'number' ? q.sourcePage : 1,
            isExtended: Boolean(q.isExtended),
          }));
      }
    }
  } catch {
    // 解析失败
  }
  return [];
}

/** 生成Quiz（出题+存库） */
export async function generateQuiz(
  fileId: string,
  workspaceId: string,
  keywords: string[],
  questionCount: number,
  difficulty: QuizDifficulty,
  provider: ModelProvider,
  getPageAnalyses: () => Promise<PageAnalysis[]>
): Promise<{ quiz: Quiz; questions: QuizQuestion[] }> {
  // 1. 获取该文件的页面解析数据
  const analyses = await getPageAnalyses();
  if (analyses.length === 0) {
    throw new Error('该文件尚未解析完成，请等待解析后再试');
  }

  // 2. 如果有关键词，筛选相关页面
  let relevantAnalyses = analyses;
  if (keywords.length > 0) {
    relevantAnalyses = analyses.filter((a) =>
      keywords.some(
        (kw) =>
          a.keywords.some((ak) => ak.includes(kw) || kw.includes(ak)) ||
          a.summary.includes(kw)
      )
    );
    // 如果筛选后太少，回退到全部页面
    if (relevantAnalyses.length === 0) {
      relevantAnalyses = analyses;
    }
  }

  // 3. 构建页面数据
  const pageData = relevantAnalyses.map((a) => ({
    pageNumber: a.pageNumber,
    keywords: a.keywords,
    summary: a.summary,
  }));

  // 4. 从数据库获取文件名
  const file = await db.files.get(fileId);
  const fileName = file?.name ?? '未知文件';

  // 5. 调用LLM出题
  const prompt = buildQuizPrompt(fileName, keywords, questionCount, difficulty, pageData);
  const response = await callLLM(provider, [{ role: 'user', content: prompt }], {
    temperature: 0.7,
    maxTokens: 4096,
  });

  // 6. 解析结果
  const parsed = parseQuizResult(response.content);
  if (parsed.length === 0) {
    throw new Error('LLM出题失败，请重试');
  }

  // 7. 创建Quiz记录
  const quiz: Quiz = {
    id: uuid(),
    fileId,
    workspaceId,
    keywords,
    questionCount: parsed.length,
    difficulty,
    createdAt: Date.now(),
  };

  // 8. 创建QuizQuestion记录
  const questions: QuizQuestion[] = parsed.map((q) => ({
    id: uuid(),
    quizId: quiz.id,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    hint: q.hint,
    sourcePage: q.sourcePage,
    isExtended: q.isExtended,
  }));

  // 9. 存入数据库
  await db.quizzes.add(quiz);
  await db.quizQuestions.bulkAdd(questions);

  return { quiz, questions };
}

/** 获取某个文件的所有Quiz */
export async function getQuizzesByFile(fileId: string): Promise<Quiz[]> {
  return db.quizzes.where('fileId').equals(fileId).reverse().sortBy('createdAt');
}

/** 获取某个Quiz的所有题目 */
export async function getQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  return db.quizQuestions.where('quizId').equals(quizId).toArray();
}

/** 删除Quiz及其题目 */
export async function deleteQuiz(quizId: string): Promise<void> {
  await db.quizQuestions.where('quizId').equals(quizId).delete();
  await db.quizzes.delete(quizId);
}
