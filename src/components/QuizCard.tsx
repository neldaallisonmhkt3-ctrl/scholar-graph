import { useState } from 'react';
import type { QuizQuestion, QuizSession } from '@/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

interface QuizCardProps {
  questions: QuizQuestion[];
  onComplete: (answers: number[]) => void;
  onGoToPage: (page: number) => void;
  onBack: () => void;
}

export function QuizCard({ questions, onComplete, onGoToPage, onBack }: QuizCardProps) {
  const [session, setSession] = useState<QuizSession>({
    currentIndex: 0,
    answers: new Array(questions.length).fill(-1),
    submitted: false,
  });
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const current = questions[session.currentIndex];
  const progress = ((session.currentIndex + (revealed ? 1 : 0)) / questions.length) * 100;

  // 选择答案
  const handleSelect = (optionIndex: number) => {
    if (revealed) return; // 已揭晓不能再选
    const newAnswers = [...session.answers];
    newAnswers[session.currentIndex] = optionIndex;
    setSession({ ...session, answers: newAnswers });
  };

  // 确认答案（揭晓）
  const handleReveal = () => {
    if (session.answers[session.currentIndex] === -1) return;
    setRevealed(true);
    setShowHint(false);
  };

  // 下一题
  const handleNext = () => {
    if (session.currentIndex < questions.length - 1) {
      setSession({ ...session, currentIndex: session.currentIndex + 1 });
      setRevealed(false);
      setShowHint(false);
    } else {
      // 最后一题，完成
      onComplete(session.answers);
    }
  };

  // 上一题
  const handlePrev = () => {
    if (session.currentIndex > 0) {
      setSession({ ...session, currentIndex: session.currentIndex - 1 });
      setRevealed(session.answers[session.currentIndex - 1] !== -1);
      setShowHint(false);
    }
  };

  const selectedAnswer = session.answers[session.currentIndex];
  const isCorrect = selectedAnswer === current.correctIndex;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 顶部进度条 */}
      <div className="h-12 flex items-center px-4 gap-3 border-b border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <Progress value={progress} className="h-2" />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {session.currentIndex + 1} / {questions.length}
        </span>
      </div>

      {/* 题目卡片 */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-6">
          {/* 题干 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                第 {session.currentIndex + 1} 题
              </span>
              {current.isExtended && (
                <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
                  扩展题
                </span>
              )}
            </div>
            <h3 className="text-base font-medium leading-relaxed">{current.question}</h3>
          </div>

          {/* 选项 */}
          <div className="space-y-2">
            {current.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isCorrectOption = index === current.correctIndex;
              let optionClass = 'border-border hover:border-primary/50 hover:bg-primary/5';

              if (revealed) {
                if (isCorrectOption) {
                  optionClass = 'border-green-500 bg-green-50 dark:bg-green-900/20';
                } else if (isSelected && !isCorrect) {
                  optionClass = 'border-red-400 bg-red-50 dark:bg-red-900/20';
                } else {
                  optionClass = 'border-border opacity-60';
                }
              } else if (isSelected) {
                optionClass = 'border-primary bg-primary/10';
              }

              return (
                <button
                  key={index}
                  className={`w-full text-left p-3 rounded-lg border transition-all text-sm ${optionClass} ${
                    revealed ? 'cursor-default' : 'cursor-pointer'
                  }`}
                  onClick={() => handleSelect(index)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium shrink-0 ${
                        revealed && isCorrectOption
                          ? 'border-green-500 text-green-600'
                          : revealed && isSelected && !isCorrect
                            ? 'border-red-400 text-red-500'
                            : isSelected
                              ? 'border-primary text-primary'
                              : 'border-border text-muted-foreground'
                      }`}
                    >
                      {revealed && isCorrectOption ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : revealed && isSelected && !isCorrect ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        String.fromCharCode(65 + index)
                      )}
                    </span>
                    <span className={revealed && !isCorrectOption && !isSelected ? 'text-muted-foreground' : ''}>
                      {option}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 提示区域 */}
          {!revealed && (
            <div className="space-y-2">
              {showHint ? (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-medium mb-1">
                    <Lightbulb className="w-3.5 h-3.5" />
                    提示
                  </div>
                  <p className="text-sm text-amber-800 dark:text-amber-200">{current.hint}</p>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-amber-600 hover:text-amber-700 gap-1.5"
                  onClick={() => setShowHint(true)}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  显示提示
                </Button>
              )}
            </div>
          )}

          {/* 解析区域（揭晓后显示） */}
          {revealed && (
            <div className="space-y-3">
              {/* 正确/错误反馈 */}
              <div
                className={`p-3 rounded-lg ${
                  isCorrect
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
                  {isCorrect ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-green-700 dark:text-green-400">回答正确！</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-red-700 dark:text-red-400">回答错误</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{current.explanation}</p>
              </div>

              {/* 来源页码 */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1.5 h-7"
                  onClick={() => onGoToPage(current.sourcePage)}
                >
                  <BookOpen className="w-3 h-3" />
                  查看来源：第 {current.sourcePage} 页
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9"
              onClick={handlePrev}
              disabled={session.currentIndex === 0}
            >
              <ChevronLeft className="w-4 h-4" />
              上一题
            </Button>

            {!revealed ? (
              <Button
                size="sm"
                className="gap-1.5 h-9"
                onClick={handleReveal}
                disabled={selectedAnswer === -1}
              >
                确认答案
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 h-9"
                onClick={handleNext}
              >
                {session.currentIndex < questions.length - 1 ? (
                  <>
                    下一题
                    <ChevronRight className="w-4 h-4" />
                  </>
                ) : (
                  '查看结果'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
