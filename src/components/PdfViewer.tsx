import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/db';
import type { PageAnalysis } from '@/types';
import { renderPageToBlobUrl } from '@/services/pdf';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PdfViewerProps {
  fileId: string;
  pageAnalyses: PageAnalysis[];
  expandedPageNumber: number | null;
  onExpandPage: (pageNumber: number | null) => void;
}

export function PdfViewer({ fileId, pageAnalyses, expandedPageNumber, onExpandPage }: PdfViewerProps) {
  const [totalPages, setTotalPages] = useState(0);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
  const [scale, setScale] = useState(1.2);
  // 每页的 blob URL: pageNum → url
  const [pageUrls, setPageUrls] = useState<Map<number, string>>(new Map());
  // 正在渲染中的页码集合，防止重复渲染
  const renderingPages = useRef<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  // 保留上一次的 blob URL，卸载时释放
  const prevUrlsRef = useRef<Map<number, string>>(new Map());

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

  // 渲染单个页面 → blob URL
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfBlob) return;
    // 已经渲染过或正在渲染中
    if (pageUrls.has(pageNum) || renderingPages.current.has(pageNum)) return;

    renderingPages.current.add(pageNum);
    try {
      const url = await renderPageToBlobUrl(pdfBlob, pageNum, scale);
      setPageUrls((prev) => {
        const next = new Map(prev);
        next.set(pageNum, url);
        return next;
      });
    } catch (err) {
      console.error(`渲染第${pageNum}页失败:`, err);
    } finally {
      renderingPages.current.delete(pageNum);
    }
  }, [pdfBlob, scale, pageUrls]);

  // 渲染可见页面（视口 ±300px 范围内）
  const renderVisiblePages = useCallback(() => {
    if (!scrollRef.current || !pdfBlob) return;

    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerTop = containerRect.top;
    const containerBottom = containerRect.bottom;

    const pageElements = container.querySelectorAll('[data-page-number]');
    pageElements.forEach((el) => {
      const pageNum = parseInt(el.getAttribute('data-page-number') || '1');
      const rect = el.getBoundingClientRect();
      if (rect.bottom >= containerTop - 300 && rect.top <= containerBottom + 300) {
        renderPage(pageNum);
      }
    });
  }, [pdfBlob, renderPage]);

  // 监听滚动
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const container = scrollRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;

    let closestPage = 1;
    let minDistance = Infinity;

    const pageElements = container.querySelectorAll('[data-page-number]');
    pageElements.forEach((el) => {
      const pageNum = parseInt(el.getAttribute('data-page-number') || '1');
      const rect = el.getBoundingClientRect();
      const pageCenter = rect.top + rect.height / 2;
      const distance = Math.abs(pageCenter - containerCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestPage = pageNum;
      }
    });

    setCurrentVisiblePage(closestPage);
    requestAnimationFrame(renderVisiblePages);
  }, [renderVisiblePages]);

  // 初始渲染和滚动监听
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    const timer = setTimeout(renderVisiblePages, 200);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, [handleScroll, renderVisiblePages]);

  // pdfBlob 变化时，清空旧 URL 重新渲染
  useEffect(() => {
    // 释放旧 blob URL
    pageUrls.forEach((url) => URL.revokeObjectURL(url));
    setPageUrls(new Map());
    renderingPages.current.clear();
    const timer = setTimeout(renderVisiblePages, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBlob]);

  // scale 变化时，清空旧 URL 重新渲染
  useEffect(() => {
    pageUrls.forEach((url) => URL.revokeObjectURL(url));
    setPageUrls(new Map());
    renderingPages.current.clear();
    const timer = setTimeout(renderVisiblePages, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // 卸载时释放所有 blob URL
  useEffect(() => {
    return () => {
      pageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 窗口大小变化时重新渲染
  useEffect(() => {
    const handleResize = () => {
      pageUrls.forEach((url) => URL.revokeObjectURL(url));
      setPageUrls(new Map());
      renderingPages.current.clear();
      renderVisiblePages();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderVisiblePages]);

  // 跳转到指定页
  const scrollToPage = useCallback((pageNumber: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const pageEl = container.querySelector(`[data-page-number="${pageNumber}"]`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 键盘翻页
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        scrollToPage(Math.max(1, currentVisiblePage - 1));
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        scrollToPage(Math.min(totalPages, currentVisiblePage + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentVisiblePage, totalPages, scrollToPage]);

  // 获取当前页的分析结果
  const currentPageAnalysis = pageAnalyses.find((a) => a.pageNumber === currentVisiblePage);

  // 切换到某页并展开
  const handleExpand = useCallback(() => {
    onExpandPage(expandedPageNumber === currentVisiblePage ? null : currentVisiblePage);
  }, [expandedPageNumber, currentVisiblePage, onExpandPage]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 页面导航栏 */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            第 {currentVisiblePage} / {totalPages || '?'} 页
          </span>
          {/* 缩放控制 */}
          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
            >
              -
            </Button>
            <span className="text-[10px] text-muted-foreground w-10 text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
            >
              +
            </Button>
          </div>
        </div>

        {/* 当前页摘要标签 */}
        {currentPageAnalysis && currentPageAnalysis.summary && (
          <button
            onClick={handleExpand}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
              expandedPageNumber === currentVisiblePage
                ? 'bg-primary text-primary-foreground'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {currentPageAnalysis.summary}
          </button>
        )}
      </div>

      {/* 连续滚动的PDF页面渲染区 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="flex flex-col items-center py-4 gap-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
            const analysis = pageAnalyses.find((a) => a.pageNumber === pageNum);
            const url = pageUrls.get(pageNum);
            return (
              <div
                key={pageNum}
                data-page-number={pageNum}
                className="flex flex-col items-center gap-2 w-full px-4"
              >
                {/* 页码标签 */}
                <div className="text-[10px] text-muted-foreground select-none">
                  第 {pageNum} 页
                </div>

                {/* PDF 页面图片 */}
                <div
                  className="shadow-lg border border-border rounded bg-white overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
                  style={{ maxWidth: '100%', width: `${scale * 100}%` }}
                  onClick={() => onExpandPage(expandedPageNumber === pageNum ? null : pageNum)}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={`第${pageNum}页`}
                      className="w-full h-auto block"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex items-center justify-center py-20 text-muted-foreground text-xs">
                      加载中...
                    </div>
                  )}
                </div>

                {/* 页面下方的关键词标签 */}
                {analysis && analysis.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-full">
                    {analysis.keywords.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
