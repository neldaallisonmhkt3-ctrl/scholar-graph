import type { QuizQuestion } from '@/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronLeft,
  BookOpen,
  Trophy,
  Target,
  AlertTriangle,
} from 'lucide-react';

interface QuizResultProps {
  questions: QuizQuestion[];
  answers: number[];
  onRetry: () => void;
  onBack: () => void;
  onGoToPage: (page: number) => void;
  /** 查看薄弱知识点，跳转到知识图谱 */
  onViewWeakPoints?: () => void;
}

export function QuizResult({ questions, answers, onRetry, onBack, onGoToPage, onViewWeakPoints }: QuizResultProps) {
  const correctCount = answers.reduce((acc, ans, i) => acc + (ans === questions[i].correctIndex ? 1 : 0), 0);
  const accuracy = Math.round((correctCount / questions.length) * 100);

  // 评级
  const getGrade = () => {
    if (accuracy >= 90) return { label: '优秀', color: 'text-green-600', emoji: '🏆' };
    if (accuracy >= 70) return { label: '良好', color: 'text-blue-600', emoji: '👍' };
    if (accuracy >= 50) return { label: '及格', color: 'text-amber-600', emoji: '📝' };
    return { label: '需加强', color: 'text-red-600', emoji: '💪' };
  };

  const grade = getGrade();

  // 错题列表
  const wrongQuestions = questions
    .map((q, i) => ({ question: q, index: i, userAnswer: answers[i] }))
    .filter((item) => item.userAnswer !== item.question.correctIndex);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 顶部栏 */}
      <div className="h-12 flex items-center px-4 gap-2 border-b border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium">测验结果</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto space-y-6">
          {/* 成绩概览 */}
          <div className="text-center space-y-4 py-4">
            <div className="text-4xl">{grade.emoji}</div>
            <div>
              <div className={`text-3xl font-bold ${grade.color}`}>{accuracy}%</div>
              <div className={`text-sm font-medium ${grade.color}`}>{grade.label}</div>
            </div>

            <div className="flex justify-center gap-6">
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>正确 {correctCount}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <XCircle className="w-4 h-4 text-red-400" />
                <span>错误 {questions.length - correctCount}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span>共 {questions.length} 题</span>
              </div>
            </div>

            <Progress value={accuracy} className="h-2 max-w-xs mx-auto" />
          </div>

          {/* 操作按钮 */}
          <div className="space-y-2">
            {wrongQuestions.length > 0 && onViewWeakPoints && (
              <Button
                className="w-full gap-2 h-10 bg-red-500 hover:bg-red-600 text-white"
                onClick={onViewWeakPoints}
              >
                <AlertTriangle className="w-4 h-4" />
                查看薄弱知识点
              </Button>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 gap-2 h-9" onClick={onRetry}>
                <RotateCcw className="w-3.5 h-3.5" />
                重新出题
              </Button>
              <Button variant="outline" className="flex-1 gap-2 h-9" onClick={onBack}>
                <BookOpen className="w-3.5 h-3.5" />
                返回课件
              </Button>
            </div>
          </div>

          {/* 错题回顾 */}
          {wrongQuestions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                错题回顾
              </h4>
              <div className="space-y-3">
                {wrongQuestions.map(({ question, index, userAnswer }) => (
                  <div
                    key={question.id}
                    className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-relaxed">
                        {index + 1}. {question.question}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1 h-6 shrink-0"
                        onClick={() => onGoToPage(question.sourcePage)}
                      >
                        <BookOpen className="w-3 h-3" />
                        P{question.sourcePage}
                      </Button>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                        <XCircle className="w-3 h-3" />
                        <span>你的答案：{question.options[userAnswer]}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>正确答案：{question.options[question.correctIndex]}</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">{question.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 全部题目回顾 */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">全部题目</h4>
            <div className="space-y-1.5">
              {questions.map((q, i) => {
                const isCorrect = answers[i] === q.correctIndex;
                return (
                  <button
                    key={q.id}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                      isCorrect
                        ? 'bg-green-50 dark:bg-green-900/10 hover:bg-green-100 dark:hover:bg-green-900/20'
                        : 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20'
                    }`}
                    onClick={() => onGoToPage(q.sourcePage)}
                  >
                    {isCorrect ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="truncate flex-1">{q.question}</span>
                    <span className="text-muted-foreground shrink-0">P{q.sourcePage}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
