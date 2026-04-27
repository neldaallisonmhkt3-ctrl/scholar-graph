import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/db';
import type { PageAnalysis } from '@/types';
import { renderPageToCanvas } from '@/services/pdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PdfViewerProps {
  fileId: string;
  pageAnalyses: PageAnalysis[];
  expandedPageNumber: number | null;
  onExpandPage: (pageNumber: number | null) => void;
}

export function PdfViewer({ fileId, pageAnalyses, expandedPageNumber, onExpandPage }: PdfViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // 加载PDF blob
  useEffect(() => {
    db.fileBlobs
      .where('fileId')
      .equals(fileId)
      .first()
      .then((record) => {
        if (record) setPdfBlob(record.blob);
      });
  }, [fileId]);

  // 加载总页数
  useEffect(() => {
    db.files.get(fileId).then((f) => {
      if (f) setTotalPages(f.pageCount);
    });
  }, [fileId]);

  // 渲染当前页
  useEffect(() => {
    if (!pdfBlob || !canvasContainerRef.current) return;
    renderPageToCanvas(pdfBlob, currentPage, canvasContainerRef.current, 1.5);
  }, [pdfBlob, currentPage]);

  // 键盘翻页
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentPage > 1) setCurrentPage((p) => p - 1);
      if (e.key === 'ArrowRight' && currentPage < totalPages) setCurrentPage((p) => p + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, totalPages]);

  // 获取当前页的分析结果
  const currentPageAnalysis = pageAnalyses.find((a) => a.pageNumber === currentPage);

  // 上一页/下一页
  const goPrev = useCallback(() => setCurrentPage((p) => Math.max(1, p - 1)), []);
  const goNext = useCallback(() => setCurrentPage((p) => Math.min(totalPages, p + 1)), [totalPages]);

  // 切换到某页并展开
  const handleExpand = useCallback(() => {
    onExpandPage(expandedPageNumber === currentPage ? null : currentPage);
  }, [expandedPageNumber, currentPage, onExpandPage]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 页面导航 */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} disabled={currentPage <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[80px] text-center">
            {currentPage} / {totalPages || '?'}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} disabled={currentPage >= totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* 当前页摘要标签 */}
        {currentPageAnalysis && currentPageAnalysis.summary && (
          <button
            onClick={handleExpand}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
              expandedPageNumber === currentPage
                ? 'bg-primary text-primary-foreground'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {currentPageAnalysis.summary}
          </button>
        )}
      </div>

      {/* PDF页面渲染区 */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center py-4 gap-3">
          {/* PDF Canvas */}
          <div
            ref={canvasContainerRef}
            className="shadow-lg border border-border rounded bg-white"
          />

          {/* 页面下方的关键词标签 */}
          {currentPageAnalysis && currentPageAnalysis.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-w-[800px] justify-center">
              {currentPageAnalysis.keywords.map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  {kw}
                </Badge>
              ))}
            </div>
          )}

          {/* 快速跳转到其他页 */}
          <div className="flex flex-wrap gap-1 max-w-[800px] justify-center">
            {pageAnalyses.slice(0, 30).map((pa) => (
              <button
                key={pa.pageNumber}
                onClick={() => setCurrentPage(pa.pageNumber)}
                className={`w-7 h-7 rounded text-[10px] flex items-center justify-center transition-colors ${
                  pa.pageNumber === currentPage
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
                title={pa.summary}
              >
                {pa.pageNumber}
              </button>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
