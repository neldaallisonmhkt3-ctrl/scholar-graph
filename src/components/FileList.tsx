import type { FileDocument } from '@/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Trash2, Loader2 } from 'lucide-react';

interface FileListProps {
  files: FileDocument[];
  currentFileId: string | null;
  onSelectFile: (id: string) => void;
  onDeleteFile: (id: string) => void;
}

export function FileList({ files, currentFileId, onSelectFile, onDeleteFile }: FileListProps) {
  if (files.length === 0) {
    return (
      <ScrollArea className="flex-1">
        <div className="p-4 text-center">
          <p className="text-xs text-muted-foreground">暂无文件</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">点击上方 + 上传PDF课件</p>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2 space-y-1">
        {files.map((file) => (
          <button
            key={file.id}
            onClick={() => onSelectFile(file.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors group ${
              currentFileId === file.id
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {file.parseStatus === 'parsing' ? (
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate flex-1 text-left">{file.name}</span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {file.pageCount > 0 ? `${file.pageCount}页` : ''}
            </span>
            <Trash2
              className="w-3 h-3 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-destructive transition-opacity shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(file.id);
              }}
            />
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
