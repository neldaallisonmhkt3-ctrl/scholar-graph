import { useState } from 'react';
import { FolderOpen, Upload, FileText, Sparkles, Network, Zap, FlaskConical, ArrowLeft } from 'lucide-react';

/** 功能特性卡片数据 */
const FEATURES = [
  { icon: Upload, title: 'PDF 智能解析', desc: '上传课件，自动逐页提取关键词与摘要', needWorkspace: true },
  { icon: Network, title: '知识图谱', desc: '可视化知识点关联，点击节点查看详情', needWorkspace: true },
  { icon: Zap, title: 'AI 测验', desc: '基于课件内容出题，即时反馈与解析', needWorkspace: true },
  { icon: FlaskConical, title: '实验数据处理', desc: '数据录入、不确定度计算、自动作图', needWorkspace: false },
];

interface WelcomeScreenProps {
  onOpenLab?: () => void;
}

export function WelcomeScreen({ onOpenLab }: WelcomeScreenProps) {
  const [tipVisible, setTipVisible] = useState(false);

  const handleClick = (needWorkspace: boolean) => {
    if (needWorkspace) {
      setTipVisible(true);
      setTimeout(() => setTipVisible(false), 3000);
    } else {
      onOpenLab?.();
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-8 max-w-lg">
        {/* Logo + 标题 */}
        <div className="space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">欢迎使用智学图谱</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              上传课件 PDF，自动解析知识点，点击即可深入学习与追问。
              <br />
              每门课一个工作空间，轻松管理所有学习资料。
            </p>
          </div>
        </div>

        {/* 功能特性卡片 */}
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <button
              key={f.title}
              onClick={() => handleClick(f.needWorkspace)}
              className="flex items-start gap-3 p-3.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-primary/20 transition-colors text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors flex items-center justify-center shrink-0 mt-0.5">
                <f.icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{f.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* 提示：需要先创建工作空间 */}
        {tipVisible && (
          <div className="flex items-center justify-center gap-2 text-sm text-primary animate-in fade-in duration-300">
            <ArrowLeft className="w-4 h-4" />
            <span>请先在左下角创建或选择一个工作空间</span>
          </div>
        )}

        {/* 操作引导 */}
        <div className="flex items-center justify-center gap-2 text-center">
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium text-primary/70">1</span>
            <FolderOpen className="w-5 h-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground/60">创建工作空间</p>
          </div>
          <span className="text-muted-foreground/30 mb-5">→</span>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium text-primary/70">2</span>
            <Upload className="w-5 h-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground/60">上传课件PDF</p>
          </div>
          <span className="text-muted-foreground/30 mb-5">→</span>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium text-primary/70">3</span>
            <FileText className="w-5 h-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground/60">展开学习</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          在左侧创建或选择一个工作空间开始使用
        </p>
      </div>
    </div>
  );
}
