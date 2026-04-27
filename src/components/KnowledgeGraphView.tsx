import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { KnowledgeNode, KnowledgeEdge } from '@/types';

interface KnowledgeGraphViewProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  onNodeClick?: (node: KnowledgeNode) => void;
}

/** 关系类型对应的颜色 */
const RELATION_COLORS: Record<string, string> = {
  包含: '#3b82f6',
  依赖于: '#f59e0b',
  推导出: '#10b981',
  对比: '#ef4444',
  应用: '#8b5cf6',
  前置知识: '#06b6d4',
};

/** 节点连接数对应的颜色深浅 */
function getNodeColor(d: SimNode, isDark: boolean) {
  const connCount = (d.sourceLinks?.length ?? 0) + (d.targetLinks?.length ?? 0);
  if (isDark) {
    if (connCount >= 5) return '#818cf8'; // 高连接：亮紫
    if (connCount >= 3) return '#60a5fa'; // 中连接：亮蓝
    return '#94a3b8'; // 低连接：灰蓝
  } else {
    if (connCount >= 5) return '#4f46e5';
    if (connCount >= 3) return '#2563eb';
    return '#64748b';
  }
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  description: string;
  sourceFileIds: string[];
  pageReferences: string[];
  sourceLinks?: SimLink[];
  targetLinks?: SimLink[];
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  relation: string;
}

export function KnowledgeGraphView({ nodes, edges, onNodeClick }: KnowledgeGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 检测暗色模式
    const isDark = document.documentElement.classList.contains('dark');

    // 清空旧图
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // 构建仿真节点和边
    const simNodes: SimNode[] = nodes.map((n) => ({
      id: n.id,
      label: n.label,
      description: n.description,
      sourceFileIds: n.sourceFileIds,
      pageReferences: n.pageReferences,
    }));

    const simLinks: SimLink[] = edges.map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.relation,
    }));

    // 创建力仿真
    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(120)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // 添加缩放
    const g = svg.append('g');

    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        }) as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void
    );

    // 绘制箭头标记
    const defs = svg.append('defs');
    const relationTypes = [...new Set(edges.map((e) => e.relation))];
    for (const rel of relationTypes) {
      const color = RELATION_COLORS[rel] || '#64748b';
      defs
        .append('marker')
        .attr('id', `arrow-${rel}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', color)
        .attr('d', 'M0,-5L10,0L0,5');
    }

    // 绘制边
    const link = g
      .append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d) => RELATION_COLORS[d.relation] || '#64748b')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.5)
      .attr('marker-end', (d) => `url(#arrow-${d.relation})`);

    // 边上的关系标签
    const linkLabel = g
      .append('g')
      .selectAll('text')
      .data(simLinks)
      .join('text')
      .attr('fill', isDark ? '#9ca3af' : '#6b7280')
      .attr('font-size', '9px')
      .attr('text-anchor', 'middle')
      .attr('dy', -6)
      .text((d) => d.relation);

    // 绘制节点组
    const nodeGroup = g
      .append('g')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as unknown as (selection: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>) => void
      );

    // 节点圆形
    nodeGroup
      .append('circle')
      .attr('r', 20)
      .attr('fill', (d) => getNodeColor(d, isDark))
      .attr('fill-opacity', 0.85)
      .attr('stroke', isDark ? '#4b5563' : '#e5e7eb')
      .attr('stroke-width', 2)
      .on('mouseover', function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 24)
          .attr('stroke-width', 3)
          .attr('stroke', isDark ? '#818cf8' : '#3b82f6');
      })
      .on('mouseout', function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 20)
          .attr('stroke-width', 2)
          .attr('stroke', isDark ? '#4b5563' : '#e5e7eb');
      })
      .on('click', (_event, d) => {
        onNodeClick?.(nodes.find((n) => n.id === d.id)!);
      });

    // 节点标签
    nodeGroup
      .append('text')
      .attr('dy', 32)
      .attr('text-anchor', 'middle')
      .attr('fill', isDark ? '#e5e7eb' : '#1f2937')
      .attr('font-size', '11px')
      .attr('font-weight', 500)
      .text((d) => d.label)
      .each(function (d) {
        // 标签过长时截断
        const textEl = this as SVGTextElement;
        if (textEl.getComputedTextLength() > 60) {
          let truncated = d.label;
          while (textEl.getComputedTextLength() > 60 && truncated.length > 2) {
            truncated = truncated.slice(0, -1);
            textEl.textContent = truncated + '…';
          }
        }
      });

    // 节点tooltip（悬停显示描述）
    const tooltip = d3
      .select(container)
      .append('div')
      .style('position', 'absolute')
      .style('padding', '6px 10px')
      .style('background', isDark ? '#1f2937' : '#ffffff')
      .style('border', `1px solid ${isDark ? '#374151' : '#e5e7eb'}`)
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('color', isDark ? '#e5e7eb' : '#1f2937')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('max-width', '200px')
      .style('z-index', 50)
      .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)');

    nodeGroup
      .on('mouseover', (event, d) => {
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.label}</strong><br/>${d.description || '暂无描述'}`);
      })
      .on('mousemove', (event) => {
        const rect = container.getBoundingClientRect();
        tooltip
          .style('left', `${event.clientX - rect.left + 12}px`)
          .style('top', `${event.clientY - rect.top - 10}px`);
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });

    // 仿真tick更新位置
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      linkLabel
        .attr('x', (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2);

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, onNodeClick]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => cleanup?.();
  }, [renderGraph]);

  // 监听容器大小变化
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      renderGraph();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [renderGraph]);

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-sm">暂无知识图谱数据</p>
          <p className="text-xs text-muted-foreground/60">请先上传PDF并完成解析，然后点击"生成知识图谱"</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" />
      {/* 图例 */}
      <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm border border-border rounded-lg p-2.5 text-xs space-y-1.5">
        <div className="font-medium text-foreground mb-1">关系图例</div>
        {Object.entries(RELATION_COLORS).map(([rel, color]) => (
          <div key={rel} className="flex items-center gap-2">
            <div className="w-4 h-0.5" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">{rel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
