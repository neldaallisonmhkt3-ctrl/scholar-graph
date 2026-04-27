import { FolderOpen, Upload, FileText, Sparkles } from 'lucide-react';

export function WelcomeScreen() {
  return (
    <div className="flex-1 flex items-center justify-center">
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
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto">
              <FolderOpen className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">创建工作空间</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto">
              <Upload className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">上传课件PDF</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">点击展开学习</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          在左侧创建或选择一个工作空间开始使用
        </p>
      </div>
    </div>
  );
}
