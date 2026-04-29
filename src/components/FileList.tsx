import type { FileDocument } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Trash2, Loader2, Zap, RefreshCw, Upload } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface FileListProps {
  files: FileDocument[];
  currentFileId: string | null;
  onSelectFile: (id: string) => void;
  onDeleteFile: (id: string) => void;
  onQuizFile?: (id: string) => void;
  onRetryParse?: (id: string) => void;
}

export function FileList({ files, currentFileId, onSelectFile, onDeleteFile, onQuizFile, onRetryParse }: FileListProps) {
  if (files.length === 0) {
    return (
      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center justify-center py-12 text-center p-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center mb-3">
            <Upload className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">暂无文件</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">点击上方 + 上传PDF课件</p>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 space-y-1">
        {files.map((file) => (
          <div
            key={file.id}
            className={`w-full rounded-md transition-colors group ${
              currentFileId === file.id
                ? 'bg-primary/10'
                : 'hover:bg-muted'
            }`}
          >
            <button
              onClick={() => onSelectFile(file.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${
                currentFileId === file.id
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {file.parseStatus === 'parsing' ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-yellow-500" />
              ) : (
                <FileText className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate flex-1 text-left">{file.name}</span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {file.pageCount > 0 ? `${file.pageCount}页` : ''}
              </span>
              {/* 状态标签 */}
              {file.parseStatus === 'done' && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                  已解析
                </span>
              )}
              {/* Quiz按钮：已解析文件显示 */}
              {file.parseStatus === 'done' && onQuizFile && (
                <Zap
                  className="w-3 h-3 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-amber-500 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuizFile(file.id);
                  }}
                  title="开始测验"
                />
              )}
              {/* 解析失败重试按钮 */}
              {file.parseStatus === 'error' && onRetryParse && (
                <RefreshCw
                  className="w-3 h-3 text-red-400 hover:text-red-500 transition-colors shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetryParse(file.id);
                  }}
                  title="重新解析"
                />
              )}
              <Trash2
                className="w-3 h-3 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-destructive transition-opacity shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
              />
            </button>
            {/* 解析中进度条 */}
            {file.parseStatus === 'parsing' && (
              <div className="px-3 pb-2">
                <Progress value={undefined} className="h-1" />
                <p className="text-[10px] text-muted-foreground mt-0.5">解析中...</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
