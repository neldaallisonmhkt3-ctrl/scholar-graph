import { FolderOpen, Upload, FileText, Sparkles } from 'lucide-react';

export function WelcomeScreen() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-md">
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
