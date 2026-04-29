import { useState } from 'react';
import type { QuizDifficulty } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Zap, BookOpen, Flame } from 'lucide-react';

interface QuizSetupProps {
  fileName: string;
  onSubmit: (keywords: string[], questionCount: number, difficulty: QuizDifficulty) => void;
  onCancel: () => void;
  loading: boolean;
}

const DIFFICULTY_OPTIONS: { value: QuizDifficulty; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'easy', label: '简单', icon: <BookOpen className="w-4 h-4" />, desc: '基础概念和定义' },
  { value: 'medium', label: '中等', icon: <Zap className="w-4 h-4" />, desc: '理解与应用分析' },
  { value: 'hard', label: '困难', icon: <Flame className="w-4 h-4" />, desc: '综合推理运用' },
];

const COUNT_OPTIONS = [5, 10, 15];

export function QuizSetup({ fileName, onSubmit, onCancel, loading }: QuizSetupProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');

  const handleStart = () => {
    const kws = keywordInput
      .split(/[,，、\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    onSubmit(kws, questionCount, difficulty);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border bg-card p-8 shadow-sm space-y-7">
        {/* 标题 */}
        <div className="text-center space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">开始测验</h2>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </div>

        {/* 关键词输入 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">知识点关键词</label>
          <Input
            placeholder="输入关键词，用逗号分隔（留空则覆盖全部）"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            className="h-10 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            如：二叉树、排序算法、时间复杂度
          </p>
        </div>

        {/* 题目数量 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">题目数量</label>
          <div className="flex gap-3">
            {COUNT_OPTIONS.map((count) => (
              <Button
                key={count}
                variant={questionCount === count ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-10 text-sm"
                onClick={() => setQuestionCount(count)}
              >
                {count} 题
              </Button>
            ))}
          </div>
        </div>

        {/* 难度选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">难度</label>
          <div className="grid grid-cols-3 gap-3">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={difficulty === opt.value ? 'default' : 'outline'}
                size="sm"
                className={`h-auto py-3 flex-col gap-1 ${difficulty === opt.value ? 'ring-2 ring-primary/20' : ''}`}
                onClick={() => setDifficulty(opt.value)}
              >
                {opt.icon}
                <span className="text-sm font-medium">{opt.label}</span>
                <span className={`text-[11px] ${difficulty === opt.value ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {opt.desc}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-1">
          <Button
            variant="outline"
            className="flex-1 h-10"
            onClick={onCancel}
            disabled={loading}
          >
            取消
          </Button>
          <Button
            className="flex-1 h-10 gap-2"
            onClick={handleStart}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                出题中...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                开始出题
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
