import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import * as d3 from 'd3';
import type { KnowledgeNode, KnowledgeEdge, FileDocument } from '@/types';
import type { LearningPath } from '@/services/mastery';
import { X, FileText, ArrowRight, ArrowLeft, Link2, Hash, BookOpen, Layers, ChevronRight, Sparkles, Route, AlertTriangle } from 'lucide-react';

interface KnowledgeGraphViewProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  onNodeClick?: (node: KnowledgeNode) => void;
  selectedNode?: KnowledgeNode | null;
  onNavigateToNode?: (node: KnowledgeNode | null) => void;
  onGoToFile?: (node: KnowledgeNode) => void;
  files?: FileDocument[];
  /** 薄弱知识点节点ID集合 */
  weakNodeIds?: Set<string>;
  /** 学习路径数据 */
  learningPaths?: LearningPath[];
  /** 是否显示学习路径面板 */
  showLearningPath?: boolean;
  /** 切换学习路径面板 */
  onToggleLearningPath?: () => void;
}

/** 关系类型对应的颜色 - 更鲜艳、更有区分度 */
const RELATION_COLORS: Record<string, string> = {
  包含: '#6366f1',     // indigo
  依赖于: '#f59e0b',   // amber
  推导出: '#10b981',   // emerald
  对比: '#f43f5e',     // rose
  应用: '#8b5cf6',     // violet
  前置知识: '#06b6d4', // cyan
};

/** 节点层级颜色 - 核心用紫/蓝渐变，中等用蓝，外围用蓝灰 */
const NODE_PALETTE = {
  light: {
    core: { fill: '#6366f1', stroke: '#4f46e5', glow: 'rgba(99,102,241,0.35)' },
    medium: { fill: '#3b82f6', stroke: '#2563eb', glow: 'rgba(59,130,246,0.25)' },
    normal: { fill: '#94a3b8', stroke: '#64748b', glow: 'none' },
  },
  dark: {
    core: { fill: '#818cf8', stroke: '#6366f1', glow: 'rgba(129,140,248,0.4)' },
    medium: { fill: '#60a5fa', stroke: '#3b82f6', glow: 'rgba(96,165,250,0.3)' },
    normal: { fill: '#64748b', stroke: '#475569', glow: 'none' },
  },
};

/** 根据连接数返回节点视觉参数 */
function getNodeStyle(d: SimNode, isDark: boolean) {
  const connCount = (d.sourceLinks?.length ?? 0) + (d.targetLinks?.length ?? 0);
  const palette = isDark ? NODE_PALETTE.dark : NODE_PALETTE.light;

  if (connCount >= 5) {
    return { ...palette.core, r: 22, fontSize: 12, fontWeight: 700 };
  }
  if (connCount >= 3) {
    return { ...palette.medium, r: 16, fontSize: 11, fontWeight: 600 };
  }
  return { ...palette.normal, r: 12, fontSize: 10, fontWeight: 500 };
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

export function KnowledgeGraphView({
  nodes,
  edges,
  onNodeClick,
  selectedNode,
  onNavigateToNode,
  onGoToFile,
  files = [],
  weakNodeIds = new Set(),
  learningPaths = [],
  showLearningPath = false,
  onToggleLearningPath,
}: KnowledgeGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const isDark = document.documentElement.classList.contains('dark');

    // 清空旧图
    d3.select(svgRef.current).selectAll('*').remove();
    // 清除旧 tooltip
    d3.select(container).selectAll('.graph-tooltip').remove();

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

    // 计算每个节点的连接数（用于碰撞半径）
    const connCountMap = new Map<string, number>();
    edges.forEach(e => {
      connCountMap.set(e.source, (connCountMap.get(e.source) ?? 0) + 1);
      connCountMap.set(e.target, (connCountMap.get(e.target) ?? 0) + 1);
    });

    // 创建力仿真 - 更大的间距
    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(160)
      )
      .force('charge', d3.forceManyBody().strength(-600))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<SimNode>().radius((d) => {
        const conn = connCountMap.get(d.id) ?? 0;
        return conn >= 5 ? 60 : conn >= 3 ? 46 : 36;
      }).strength(0.8))
      .force('x', d3.forceX(width / 2).strength(0.04))
      .force('y', d3.forceY(height / 2).strength(0.04));

    // 添加缩放
    const g = svg.append('g');

    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 5])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        }) as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void
    );

    // ====== defs: 渐变、阴影、箭头、动画 ======
    const defs = svg.append('defs');

    // 选中节点外圈发光 filter
    const selectedGlowFilter = defs.append('filter')
      .attr('id', 'selected-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    selectedGlowFilter.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', 4)
      .attr('result', 'blur');
    const selectedMerge = selectedGlowFilter.append('feMerge');
    selectedMerge.append('feMergeNode').attr('in', 'blur');
    selectedMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // 薄弱节点红色发光 filter
    const weakGlowFilter = defs.append('filter')
      .attr('id', 'weak-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    weakGlowFilter.append('feGaussianBlur')
      .attr('in', 'SourceGraphic')
      .attr('stdDeviation', 5)
      .attr('result', 'blur');
    const weakMerge = weakGlowFilter.append('feMerge');
    weakMerge.append('feMergeNode').attr('in', 'blur');
    weakMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // 节点阴影
    const shadowFilter = defs.append('filter').attr('id', 'node-shadow');
    shadowFilter.append('feDropShadow')
      .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 4)
      .attr('flood-color', isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)')
      .attr('flood-opacity', 1);

    // 核心节点光晕
    const glowFilter = defs.append('filter').attr('id', 'core-glow');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'blur');
    glowFilter.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'blur').attr('operator', 'over');

    // 箭头标记 - 更精致
    const relationTypes = [...new Set(edges.map((e) => e.relation))];
    for (const rel of relationTypes) {
      const color = RELATION_COLORS[rel] || '#64748b';
      defs
        .append('marker')
        .attr('id', `arrow-${rel}`)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 30)
        .attr('refY', 0)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', color)
        .attr('fill-opacity', 0.7)
        .attr('d', 'M0,-3.5L7,0L0,3.5Z');
    }

    // ====== 绘制边 - 使用曲线路径 ======
    const linkPath = g
      .append('g')
      .selectAll('path')
      .data(simLinks)
      .join('path')
      .attr('class', 'graph-link')
      .attr('fill', 'none')
      .attr('stroke', (d) => RELATION_COLORS[d.relation] || '#64748b')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1.2)
      .attr('marker-end', (d) => `url(#arrow-${d.relation})`);

    // 边上的关系标签 - 加背景
    const linkLabelGroup = g
      .append('g')
      .selectAll('g')
      .data(simLinks)
      .join('g')
      .attr('class', 'graph-link-label');

    // 标签背景
    linkLabelGroup
      .append('rect')
      .attr('class', 'graph-link-label-bg')
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', isDark ? '#1e293b' : '#f8fafc')
      .attr('fill-opacity', 0.85);

    // 标签文字
    linkLabelGroup
      .append('text')
      .attr('class', 'graph-link-label-text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '9px')
      .attr('font-weight', 500)
      .text((d) => d.relation);

    // ====== 绘制节点组 ======
    const nodeGroup = g
      .append('g')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('class', 'graph-node')
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

    // 节点外发光（仅核心/重要节点）
    nodeGroup
      .filter((d) => {
        const conn = (d.sourceLinks?.length ?? 0) + (d.targetLinks?.length ?? 0);
        return conn >= 3;
      })
      .append('circle')
      .attr('class', 'graph-node-glow')
      .attr('r', (d) => getNodeStyle(d, isDark).r + 10)
      .attr('fill', (d) => getNodeStyle(d, isDark).glow)
      .attr('fill-opacity', 0.5)
      .attr('stroke', 'none');

    // 薄弱节点红色脉冲光环（默认隐藏，仅薄弱节点显示）
    nodeGroup
      .append('circle')
      .attr('class', 'graph-node-weak-ring')
      .attr('r', (d) => getNodeStyle(d, isDark).r + 4)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4 2')
      .attr('opacity', 0)
      .style('display', 'none')
      .each(function (d) {
        const baseR = getNodeStyle(d, isDark).r + 4;
        d3.select(this).append('animate')
          .attr('attributeName', 'r')
          .attr('from', baseR)
          .attr('to', baseR + 12)
          .attr('dur', '2s')
          .attr('repeatCount', 'indefinite');
        d3.select(this).append('animate')
          .attr('attributeName', 'opacity')
          .attr('values', '0.8;0.2')
          .attr('dur', '2s')
          .attr('repeatCount', 'indefinite');
      });

    // 薄弱节点红色外圈发光（默认隐藏）
    nodeGroup
      .append('circle')
      .attr('class', 'graph-node-weak-glow')
      .attr('r', (d) => getNodeStyle(d, isDark).r + 8)
      .attr('fill', 'rgba(239,68,68,0.15)')
      .attr('stroke', 'none')
      .attr('opacity', 0)
      .style('display', 'none');

    // 选中脉冲光环 1（默认隐藏，用 SVG animate 实现脉冲）
    nodeGroup
      .append('circle')
      .attr('class', 'graph-node-selected-ring')
      .attr('r', (d) => getNodeStyle(d, isDark).r + 2)
      .attr('fill', 'none')
      .attr('stroke', isDark ? '#818cf8' : '#6366f1')
      .attr('stroke-width', 2.5)
      .attr('opacity', 0)
      .style('display', 'none')
      .each(function (d) {
        const baseR = getNodeStyle(d, isDark).r + 2;
        d3.select(this).append('animate')
          .attr('attributeName', 'r')
          .attr('from', baseR)
          .attr('to', baseR + 16)
          .attr('dur', '1.5s')
          .attr('repeatCount', 'indefinite');
        d3.select(this).append('animate')
          .attr('attributeName', 'opacity')
          .attr('values', '0.7;0')
          .attr('dur', '1.5s')
          .attr('repeatCount', 'indefinite');
      });

    // 选中脉冲光环 2（延迟脉冲）
    nodeGroup
      .append('circle')
      .attr('class', 'graph-node-selected-ring-2')
      .attr('r', (d) => getNodeStyle(d, isDark).r + 2)
      .attr('fill', 'none')
      .attr('stroke', isDark ? '#a5b4fc' : '#818cf8')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0)
      .style('display', 'none')
      .each(function (d) {
        const baseR = getNodeStyle(d, isDark).r + 2;
        d3.select(this).append('animate')
          .attr('attributeName', 'r')
          .attr('from', baseR)
          .attr('to', baseR + 14)
          .attr('dur', '1.5s')
          .attr('begin', '0.5s')
          .attr('repeatCount', 'indefinite');
        d3.select(this).append('animate')
          .attr('attributeName', 'opacity')
          .attr('values', '0.5;0')
          .attr('dur', '1.5s')
          .attr('begin', '0.5s')
          .attr('repeatCount', 'indefinite');
      });

    // 节点圆形
    nodeGroup
      .append('circle')
      .attr('class', 'graph-node-circle')
      .attr('r', (d) => getNodeStyle(d, isDark).r)
      .attr('fill', (d) => {
        if (weakNodeIds.has(d.id)) {
          return isDark ? '#f87171' : '#ef4444';
        }
        return getNodeStyle(d, isDark).fill;
      })
      .attr('fill-opacity', 0.9)
      .attr('stroke', (d) => {
        if (weakNodeIds.has(d.id)) {
          return isDark ? '#dc2626' : '#b91c1c';
        }
        return getNodeStyle(d, isDark).stroke;
      })
      .attr('stroke-width', (d) => {
        if (weakNodeIds.has(d.id)) return 2.5;
        const conn = (d.sourceLinks?.length ?? 0) + (d.targetLinks?.length ?? 0);
        return conn >= 5 ? 2.5 : conn >= 3 ? 2 : 1.5;
      })
      .attr('filter', (d) => {
        if (weakNodeIds.has(d.id)) return 'url(#weak-glow)';
        const conn = (d.sourceLinks?.length ?? 0) + (d.targetLinks?.length ?? 0);
        return conn >= 3 ? 'url(#node-shadow)' : 'none';
      })
      .on('click', (_event, d) => {
        onNodeClick?.(nodes.find((n) => n.id === d.id)!);
      });

    // 节点标签 - 更好的排版
    nodeGroup
      .append('text')
      .attr('class', 'graph-node-text')
      .attr('dy', (d) => getNodeStyle(d, isDark).r + 14)
      .attr('text-anchor', 'middle')
      .attr('fill', isDark ? '#e2e8f0' : '#1e293b')
      .attr('font-size', (d) => `${getNodeStyle(d, isDark).fontSize}px`)
      .attr('font-weight', (d) => getNodeStyle(d, isDark).fontWeight)
      .text((d) => d.label)
      .each(function (d) {
        const textEl = this as SVGTextElement;
        const maxW = getNodeStyle(d, isDark).r >= 20 ? 80 : 56;
        if (textEl.getComputedTextLength() > maxW) {
          let truncated = d.label;
          while (textEl.getComputedTextLength() > maxW && truncated.length > 2) {
            truncated = truncated.slice(0, -1);
            textEl.textContent = truncated + '…';
          }
        }
      });

    // ====== 悬停高亮 + tooltip ======
    const tooltip = d3
      .select(container)
      .append('div')
      .attr('class', 'graph-tooltip')
      .style('position', 'absolute')
      .style('padding', '8px 12px')
      .style('background', isDark ? '#1e293b' : '#ffffff')
      .style('border', `1px solid ${isDark ? '#334155' : '#e2e8f0'}`)
      .style('border-radius', '8px')
      .style('font-size', '12px')
      .style('color', isDark ? '#e2e8f0' : '#1e293b')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('max-width', '220px')
      .style('z-index', 50)
      .style('box-shadow', isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.1)');

    // 悬停时高亮当前节点和相关连接
    nodeGroup
      .on('mouseover', (event, d) => {
        const hoveredId = d.id;
        const connectedIds = new Set<string>([hoveredId]);
        simLinks.forEach((l) => {
          const sId = typeof l.source === 'string' ? l.source : (l.source as SimNode).id;
          const tId = typeof l.target === 'string' ? l.target : (l.target as SimNode).id;
          if (sId === hoveredId) connectedIds.add(tId);
          if (tId === hoveredId) connectedIds.add(sId);
        });

        // 边：高亮相关
        linkPath.attr('stroke-opacity', function () {
          const ld = d3.select(this).datum() as SimLink | undefined;
          if (!ld) return 0.3;
          const sId = typeof ld.source === 'string' ? ld.source : (ld.source as SimNode).id;
          const tId = typeof ld.target === 'string' ? ld.target : (ld.target as SimNode).id;
          return (sId === hoveredId || tId === hoveredId) ? 0.7 : 0.06;
        }).attr('stroke-width', function () {
          const ld = d3.select(this).datum() as SimLink | undefined;
          if (!ld) return 1.2;
          const sId = typeof ld.source === 'string' ? ld.source : (ld.source as SimNode).id;
          const tId = typeof ld.target === 'string' ? ld.target : (ld.target as SimNode).id;
          return (sId === hoveredId || tId === hoveredId) ? 2 : 1;
        });

        // 标签
        linkLabelGroup.select('.graph-link-label-bg').attr('fill-opacity', function () {
          const ld = d3.select(this.parentNode as Element).datum() as SimLink | undefined;
          if (!ld) return 0.85;
          const sId = typeof ld.source === 'string' ? ld.source : (ld.source as SimNode).id;
          const tId = typeof ld.target === 'string' ? ld.target : (ld.target as SimNode).id;
          return (sId === hoveredId || tId === hoveredId) ? 0.9 : 0.1;
        });
        linkLabelGroup.select('.graph-link-label-text').attr('opacity', function () {
          const ld = d3.select(this.parentNode as Element).datum() as SimLink | undefined;
          if (!ld) return 1;
          const sId = typeof ld.source === 'string' ? ld.source : (ld.source as SimNode).id;
          const tId = typeof ld.target === 'string' ? ld.target : (ld.target as SimNode).id;
          return (sId === hoveredId || tId === hoveredId) ? 1 : 0.08;
        });

        // 节点
        nodeGroup.select('.graph-node-circle')
          .attr('fill-opacity', (nd: SimNode) => connectedIds.has(nd.id) ? 1 : 0.12)
          .attr('stroke-opacity', (nd: SimNode) => connectedIds.has(nd.id) ? 1 : 0.1);
        nodeGroup.select('.graph-node-glow')
          .attr('fill-opacity', (nd: SimNode) => connectedIds.has(nd.id) ? 0.6 : 0.03);
        nodeGroup.select('.graph-node-text')
          .attr('opacity', (nd: SimNode) => connectedIds.has(nd.id) ? 1 : 0.1);

        // tooltip
        tooltip.style('opacity', 1)
          .html(`<strong style="font-size:13px">${d.label}</strong>${d.description ? `<br/><span style="color:${isDark ? '#94a3b8' : '#64748b'};font-size:11px">${d.description}</span>` : ''}`);
      })
      .on('mousemove', (event) => {
        const rect = container.getBoundingClientRect();
        tooltip
          .style('left', `${event.clientX - rect.left + 14}px`)
          .style('top', `${event.clientY - rect.top - 14}px`);
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
        // 恢复默认状态（如果没选中节点）
        if (!selectedNode) {
          linkPath.attr('stroke-opacity', 0.3).attr('stroke-width', 1.2);
          linkLabelGroup.select('.graph-link-label-bg').attr('fill-opacity', 0.85);
          linkLabelGroup.select('.graph-link-label-text').attr('opacity', 1);
          nodeGroup.select('.graph-node-circle').attr('fill-opacity', 0.9).attr('stroke-opacity', 1);
          nodeGroup.select('.graph-node-glow').attr('fill-opacity', 0.5);
          nodeGroup.select('.graph-node-text').attr('opacity', 1);
        }
      });

    // ====== 仿真 tick 更新位置 ======
    simulation.on('tick', () => {
      // 更新曲线路径
      linkPath.attr('d', (d) => {
        const sx = (d.source as SimNode).x ?? 0;
        const sy = (d.source as SimNode).y ?? 0;
        const tx = (d.target as SimNode).x ?? 0;
        const ty = (d.target as SimNode).y ?? 0;
        // 轻微弧线：向右偏移控制点
        const dx = tx - sx;
        const dy = ty - sy;
        const dr = Math.sqrt(dx * dx + dy * dy) * 4;
        return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
      });

      // 更新标签位置
      linkLabelGroup.each(function (d) {
        const sx = (d.source as SimNode).x ?? 0;
        const sy = (d.source as SimNode).y ?? 0;
        const tx = (d.target as SimNode).x ?? 0;
        const ty = (d.target as SimNode).y ?? 0;
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const g = d3.select(this);
        const textEl = g.select('.graph-link-label-text').node() as SVGTextElement;
        const bbox = textEl?.getBBox();
        g.select('.graph-link-label-bg')
          .attr('x', mx - (bbox?.width ?? 0) / 2 - 4)
          .attr('y', my - (bbox?.height ?? 0) / 2 - 1)
          .attr('width', (bbox?.width ?? 0) + 8)
          .attr('height', (bbox?.height ?? 0) + 2);
        g.select('.graph-link-label-text')
          .attr('x', mx)
          .attr('y', my);
      });

      nodeGroup.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, onNodeClick, selectedNode, weakNodeIds]);

  useEffect(() => {
    const cleanup = renderGraph();
    return () => cleanup?.();
  }, [renderGraph]);

  // 选中节点高亮 effect
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const link = svg.selectAll<SVGPathElement, SimLink>('.graph-link');
    const linkLabelBg = svg.selectAll<SVGRectElement, SimLink>('.graph-link-label-bg');
    const linkLabelText = svg.selectAll<SVGTextElement, SimLink>('.graph-link-label-text');
    const nodeCircle = svg.selectAll<SVGCircleElement, SimNode>('.graph-node-circle');
    const nodeGlow = svg.selectAll<SVGCircleElement, SimNode>('.graph-node-glow');
    const nodeText = svg.selectAll<SVGTextElement, SimNode>('.graph-node-text');
    const selectedRing = svg.selectAll<SVGCircleElement, SimNode>('.graph-node-selected-ring');
    const selectedRing2 = svg.selectAll<SVGCircleElement, SimNode>('.graph-node-selected-ring-2');

    const isDark = document.documentElement.classList.contains('dark');

    if (!selectedNode) {
      // 清除高亮 - 恢复默认
      link.attr('stroke-opacity', 0.3).attr('stroke-width', 1.2);
      linkLabelBg.attr('fill-opacity', 0.85);
      linkLabelText.attr('opacity', 1);
      nodeCircle
        .attr('fill-opacity', 0.9)
        .attr('stroke-opacity', 1)
        .attr('stroke-width', (d: SimNode) => {
          const conn = (d.sourceLinks?.length ?? 0) + (d.targetLinks?.length ?? 0);
          return conn >= 5 ? 2.5 : conn >= 3 ? 2 : 1.5;
        })
        .attr('filter', (d: SimNode) => {
          const conn = (d.sourceLinks?.length ?? 0) + (d.targetLinks?.length ?? 0);
          return conn >= 3 ? 'url(#node-shadow)' : 'none';
        });
      nodeGlow.attr('fill-opacity', 0.5);
      nodeText.attr('opacity', 1);
      // 隐藏选中光环
      selectedRing.style('display', 'none').attr('opacity', 0);
      selectedRing2.style('display', 'none').attr('opacity', 0);
      return;
    }

    const selectedId = selectedNode.id;
    const connectedIds = new Set<string>([selectedId]);
    edges.forEach((e) => {
      if (e.source === selectedId) connectedIds.add(e.target);
      if (e.target === selectedId) connectedIds.add(e.source);
    });

    // 边
    link.attr('stroke-opacity', function () {
      const d = d3.select(this).datum() as SimLink | undefined;
      if (!d) return 0.3;
      const sId = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
      const tId = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
      return (sId === selectedId || tId === selectedId) ? 0.8 : 0.04;
    }).attr('stroke-width', function () {
      const d = d3.select(this).datum() as SimLink | undefined;
      if (!d) return 1.2;
      const sId = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
      const tId = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
      return (sId === selectedId || tId === selectedId) ? 2.5 : 0.8;
    });

    // 标签
    linkLabelBg.attr('fill-opacity', function () {
      const d = d3.select(this.parentNode as Element).datum() as SimLink | undefined;
      if (!d) return 0.85;
      const sId = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
      const tId = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
      return (sId === selectedId || tId === selectedId) ? 0.95 : 0.05;
    });
    linkLabelText.attr('opacity', function () {
      const d = d3.select(this.parentNode as Element).datum() as SimLink | undefined;
      if (!d) return 1;
      const sId = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
      const tId = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
      return (sId === selectedId || tId === selectedId) ? 1 : 0.05;
    });

    // 节点圆形：选中的节点特殊高亮，连接节点正常高亮，其余淡化
    nodeCircle
      .attr('fill-opacity', (d: SimNode) => {
        if (!d) return 0.9;
        if (d.id === selectedId) return 1;
        return connectedIds.has(d.id) ? 0.9 : 0.08;
      })
      .attr('stroke-opacity', (d: SimNode) => {
        if (!d) return 1;
        if (d.id === selectedId) return 1;
        return connectedIds.has(d.id) ? 0.8 : 0.06;
      })
      .attr('stroke-width', (d: SimNode) => {
        if (!d) return 1.5;
        if (d.id === selectedId) return 4;
        return connectedIds.has(d.id) ? 2 : 1;
      })
      .attr('filter', (d: SimNode) => {
        if (!d) return 'none';
        if (d.id === selectedId) return 'url(#selected-glow)';
        const conn = (d.sourceLinks?.length ?? 0) + (d.targetLinks?.length ?? 0);
        return connectedIds.has(d.id) && conn >= 3 ? 'url(#node-shadow)' : 'none';
      });

    nodeGlow.attr('fill-opacity', (d: SimNode) => {
      if (!d) return 0.5;
      if (d.id === selectedId) return 0.8;
      return connectedIds.has(d.id) ? 0.6 : 0.01;
    });

    nodeText.attr('opacity', (d: SimNode) => {
      if (!d) return 1;
      if (d.id === selectedId) return 1;
      return connectedIds.has(d.id) ? 0.9 : 0.08;
    });

    // 选中节点：显示脉冲光环
    selectedRing
      .style('display', (d: SimNode) => d.id === selectedId ? 'block' : 'none')
      .attr('opacity', (d: SimNode) => d.id === selectedId ? null : 0);
    selectedRing2
      .style('display', (d: SimNode) => d.id === selectedId ? 'block' : 'none')
      .attr('opacity', (d: SimNode) => d.id === selectedId ? null : 0);
  }, [selectedNode, edges]);

  // 薄弱节点视觉效果 effect
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const weakRing = svg.selectAll<SVGCircleElement, SimNode>('.graph-node-weak-ring');
    const weakGlow = svg.selectAll<SVGCircleElement, SimNode>('.graph-node-weak-glow');

    if (weakNodeIds.size === 0) {
      // 没有薄弱节点，全部隐藏
      weakRing.style('display', 'none').attr('opacity', 0);
      weakGlow.style('display', 'none').attr('opacity', 0);
      return;
    }

    // 显示薄弱节点的红色光环
    weakRing
      .style('display', (d: SimNode) => weakNodeIds.has(d.id) ? 'block' : 'none')
      .attr('opacity', (d: SimNode) => weakNodeIds.has(d.id) ? null : 0);
    weakGlow
      .style('display', (d: SimNode) => weakNodeIds.has(d.id) ? 'block' : 'none')
      .attr('opacity', (d: SimNode) => weakNodeIds.has(d.id) ? 0.6 : 0);
  }, [weakNodeIds, selectedNode]);

  // 监听容器大小变化
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      renderGraph();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [renderGraph]);

  // 获取选中节点的关联边和节点
  const selectedEdges = selectedNode
    ? edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
    : [];

  const outgoingEdges = selectedEdges.filter((e) => e.source === selectedNode?.id);
  const incomingEdges = selectedEdges.filter((e) => e.target === selectedNode?.id);

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
    <div ref={containerRef} className="flex-1 relative overflow-hidden min-h-0">
      <svg ref={svgRef} className="w-full h-full" />

      {/* 图例 - 更精致 */}
      <div className="absolute bottom-4 left-4 bg-background/70 backdrop-blur-lg border border-border/50 rounded-xl p-3 text-xs space-y-2 shadow-lg">
        <div className="font-semibold text-foreground/80 text-[11px] mb-1.5">关系类型</div>
        {Object.entries(RELATION_COLORS).map(([rel, color]) => (
          <div key={rel} className="flex items-center gap-2.5">
            <div className="w-5 h-[2px] rounded-full" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground text-[11px]">{rel}</span>
          </div>
        ))}
        <div className="border-t border-border/40 pt-1.5 mt-1.5 space-y-1.5">
          <div className="font-semibold text-foreground/80 text-[11px]">节点层级</div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: isDarkContext() ? '#818cf8' : '#6366f1' }} />
            <span className="text-muted-foreground text-[11px]">核心（≥5连接）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: isDarkContext() ? '#60a5fa' : '#3b82f6' }} />
            <span className="text-muted-foreground text-[11px]">重要（≥3连接）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: isDarkContext() ? '#64748b' : '#94a3b8' }} />
            <span className="text-muted-foreground text-[11px]">一般</span>
          </div>
          {weakNodeIds.size > 0 && (
            <>
              <div className="border-t border-border/40 pt-1.5 mt-1.5">
                <div className="font-semibold text-foreground/80 text-[11px]">掌握状态</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-muted-foreground text-[11px]">薄弱知识点</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 学习路径推荐面板 */}
      {showLearningPath && learningPaths.length > 0 && !selectedNode && (
        <div className="absolute top-4 right-4 w-[360px] max-h-[calc(100%-32px)] bg-background/90 backdrop-blur-xl border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* 标题栏 */}
          <div className="shrink-0 px-5 pt-4 pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                  <Route className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">学习路径推荐</span>
              </div>
              <button
                className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 rounded-lg hover:bg-accent/60"
                onClick={onToggleLearningPath}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-1.5">
              基于测验结果与知识图谱的前置关系，为你推荐最优学习顺序
            </p>
          </div>

          {/* 路径列表 */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
            {learningPaths.map((path, pathIndex) => (
              <div key={path.targetNodeId} className="space-y-2.5">
                {/* 路径标题 */}
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-red-500">
                    薄弱: {path.targetLabel}
                  </span>
                  {path.steps.length > 1 && (
                    <span className="text-[10px] text-muted-foreground/50 ml-auto">
                      需{path.steps.length}步
                    </span>
                  )}
                </div>

                {/* 步骤列表 */}
                <div className="space-y-1.5">
                  {path.steps.map((step) => (
                    <button
                      key={step.nodeId}
                      className="w-full flex items-center gap-2.5 text-xs px-3 py-2 rounded-lg hover:bg-accent/40 transition-colors text-left group"
                      onClick={() => {
                        const node = nodes.find((n) => n.id === step.nodeId);
                        if (node) onNavigateToNode?.(node);
                      }}
                    >
                      {/* 序号圆点 */}
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        step.masteryLevel === 'weak'
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                          : step.masteryLevel === 'mastered'
                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {step.order}
                      </div>
                      {/* 知识点名称 */}
                      <span className="truncate flex-1 group-hover:text-primary transition-colors font-medium">
                        {step.label}
                      </span>
                      {/* 掌握状态标签 */}
                      {step.masteryLevel === 'weak' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                          薄弱
                        </span>
                      )}
                      {step.masteryLevel === 'mastered' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-500 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                          已掌握
                        </span>
                      )}
                      {step.masteryLevel === 'learning' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-500 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                          学习中
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* 路径之间分割线 */}
                {pathIndex < learningPaths.length - 1 && (
                  <div className="border-t border-border/30 pt-1" />
                )}
              </div>
            ))}
          </div>

          {/* 底部提示 */}
          <div className="shrink-0 px-4 py-3 border-t border-border/40 bg-muted/20">
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              点击步骤可在图谱中定位对应知识点。按照推荐顺序学习，先掌握前置知识再攻克薄弱点效果更好。
            </p>
          </div>
        </div>
      )}

      {/* 节点详情 - 精致面板 */}
      {selectedNode && (
        <div className="absolute top-4 right-4 w-[390px] max-h-[calc(100%-32px)] bg-background/90 backdrop-blur-xl border border-border/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* 标题栏 */}
          <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border/40">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[15px] font-bold text-foreground tracking-tight">{selectedNode.label}</h3>
                  {(() => {
                    const degree = selectedEdges.length;
                    if (degree >= 5) return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center gap-0.5">
                        <Sparkles className="w-2.5 h-2.5" />核心
                      </span>
                    );
                    if (degree >= 3) return (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">重要</span>
                    );
                    return null;
                  })()}
                </div>
              </div>
              <button
                className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 p-1 rounded-lg hover:bg-accent/60"
                onClick={() => onNavigateToNode?.(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedNode.description && (
              <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">{selectedNode.description}</p>
            )}

            {/* 统计条 */}
            <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground/70">
              <span className="flex items-center gap-1.5">
                <Link2 className="w-3 h-3" />
                {selectedEdges.length} 条关系
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3 h-3" />
                {selectedNode.sourceFileIds.length} 个文件
              </span>
              {selectedNode.pageReferences.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3 h-3" />
                  {selectedNode.pageReferences.length} 处引用
                </span>
              )}
            </div>
          </div>

          {/* 可滚动内容区 */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-5 space-y-5">
              {/* 出发关系 */}
              {outgoingEdges.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <ArrowRight className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <span className="text-[12px] font-semibold text-foreground">指向的知识点</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-0.5">{outgoingEdges.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {outgoingEdges.map((edge) => {
                      const targetNode = nodes.find((n) => n.id === edge.target);
                      if (!targetNode) return null;
                      const color = RELATION_COLORS[edge.relation] || '#64748b';
                      return (
                        <div
                          key={edge.id}
                          className="cursor-pointer group rounded-xl border border-transparent hover:border-border/60 hover:bg-accent/30 transition-all px-3 py-2.5 -mx-1"
                          onClick={() => onNavigateToNode?.(targetNode)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}40` }} />
                            <div className="h-px w-3 shrink-0" style={{ backgroundColor: color, opacity: 0.4 }} />
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap"
                              style={{ backgroundColor: color + '15', color, border: `1px solid ${color}20` }}
                            >
                              {edge.relation}
                            </span>
                            <div className="h-px w-2 shrink-0 bg-border/40" />
                            <span className="text-xs font-semibold group-hover:text-primary transition-colors truncate">
                              {targetNode.label}
                            </span>
                          </div>
                          {targetNode.description && (
                            <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed line-clamp-2 pl-[18px]">
                              {targetNode.description}
                            </p>
                          )}
                          {(() => {
                            const targetDegree = edges.filter(e => e.source === targetNode.id || e.target === targetNode.id).length;
                            if (targetDegree > 1) return (
                              <div className="text-[10px] text-muted-foreground/40 mt-1 pl-[18px] flex items-center gap-1">
                                <Link2 className="w-2.5 h-2.5" />{targetDegree} 条关联
                              </div>
                            );
                            return null;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 入边关系 */}
              {incomingEdges.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <ArrowLeft className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-[12px] font-semibold text-foreground">被哪些知识点指向</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-0.5">{incomingEdges.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {incomingEdges.map((edge) => {
                      const sourceNode = nodes.find((n) => n.id === edge.source);
                      if (!sourceNode) return null;
                      const color = RELATION_COLORS[edge.relation] || '#64748b';
                      return (
                        <div
                          key={edge.id}
                          className="cursor-pointer group rounded-xl border border-transparent hover:border-border/60 hover:bg-accent/30 transition-all px-3 py-2.5 -mx-1"
                          onClick={() => onNavigateToNode?.(sourceNode)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold group-hover:text-primary transition-colors truncate">
                              {sourceNode.label}
                            </span>
                            <div className="h-px w-2 shrink-0 bg-border/40" />
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 whitespace-nowrap"
                              style={{ backgroundColor: color + '15', color, border: `1px solid ${color}20` }}
                            >
                              {edge.relation}
                            </span>
                            <div className="h-px w-3 shrink-0" style={{ backgroundColor: color, opacity: 0.4 }} />
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}40` }} />
                          </div>
                          {sourceNode.description && (
                            <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed line-clamp-2">
                              {sourceNode.description}
                            </p>
                          )}
                          {(() => {
                            const sourceDegree = edges.filter(e => e.source === sourceNode.id || e.target === sourceNode.id).length;
                            if (sourceDegree > 1) return (
                              <div className="text-[10px] text-muted-foreground/40 mt-1 flex items-center gap-1">
                                <Link2 className="w-2.5 h-2.5" />{sourceDegree} 条关联
                              </div>
                            );
                            return null;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 二度关系 */}
              {(() => {
                const directNeighborIds = new Set([
                  selectedNode.id,
                  ...outgoingEdges.map(e => e.target),
                  ...incomingEdges.map(e => e.source),
                ]);
                const secondDegreeNodes = new Map<string, { node: KnowledgeNode; viaNode: KnowledgeNode; relation: string }>();
                for (const edge of selectedEdges) {
                  const neighborId = edge.source === selectedNode.id ? edge.target : edge.source;
                  const neighborEdges = edges.filter(e =>
                    (e.source === neighborId || e.target === neighborId) &&
                    e.source !== selectedNode.id && e.target !== selectedNode.id
                  );
                  for (const ne of neighborEdges) {
                    const secondId = ne.source === neighborId ? ne.target : ne.source;
                    if (directNeighborIds.has(secondId)) continue;
                    const secondNode = nodes.find(n => n.id === secondId);
                    const viaNode = nodes.find(n => n.id === neighborId);
                    if (secondNode && viaNode && !secondDegreeNodes.has(secondId)) {
                      secondDegreeNodes.set(secondId, { node: secondNode, viaNode, relation: ne.relation });
                    }
                  }
                }
                const secondList = [...secondDegreeNodes.values()].slice(0, 6);
                if (secondList.length === 0) return null;
                return (
                  <div>
                    <div className="flex items-center gap-1.5 mb-3">
                      <div className="w-5 h-5 rounded-md bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <Layers className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                      </div>
                      <span className="text-[12px] font-semibold text-foreground">间接关联</span>
                      <span className="text-[10px] text-muted-foreground/50 ml-0.5">二度关系</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {secondList.map(({ node: sNode, viaNode, relation }) => {
                        const color = RELATION_COLORS[relation] || '#64748b';
                        return (
                          <button
                            key={sNode.id}
                            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-accent/40 transition-all group"
                            onClick={() => onNavigateToNode?.(sNode)}
                            title={`经 "${viaNode.label}" → ${relation} → ${sNode.label}`}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="group-hover:text-primary transition-colors">{sNode.label}</span>
                          </button>
                        );
                      })}
                      {secondDegreeNodes.size > 6 && (
                        <span className="text-[10px] text-muted-foreground/50 self-center">+{secondDegreeNodes.size - 6}</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 页码引用 */}
              {selectedNode.pageReferences.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-5 h-5 rounded-md bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                      <Hash className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <span className="text-[12px] font-semibold text-foreground">出现位置</span>
                  </div>
                  <div className="space-y-1">
                    {selectedNode.pageReferences.map((ref) => {
                      const [fileId, pageNum] = ref.split(':');
                      const fileName = files.find((f) => f.id === fileId)?.name ?? '未知文件';
                      return (
                        <button
                          key={ref}
                          className="w-full flex items-center gap-2.5 text-[11px] text-left px-3 py-2 rounded-lg hover:bg-accent/40 transition-colors group"
                          onClick={() => onGoToFile?.(selectedNode)}
                        >
                          <FileText className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                          <span className="truncate text-muted-foreground group-hover:text-foreground transition-colors">{fileName}</span>
                          <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground font-medium text-[10px]">
                            P{pageNum}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 来源文件 */}
              {selectedNode.sourceFileIds.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <BookOpen className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-[12px] font-semibold text-foreground">来源文件</span>
                  </div>
                  <div className="space-y-1">
                    {selectedNode.sourceFileIds.map((fileId) => {
                      const file = files.find((f) => f.id === fileId);
                      return (
                        <button
                          key={fileId}
                          className="w-full flex items-center gap-2.5 text-xs text-left px-3 py-2.5 rounded-lg hover:bg-accent/40 transition-colors group"
                          onClick={() => onGoToFile?.(selectedNode)}
                        >
                          <FileText className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="truncate group-hover:text-primary transition-colors">{file?.name ?? '未知文件'}</span>
                          {file?.pageCount && (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">{file.pageCount}页</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 无关系 */}
              {selectedEdges.length === 0 && (
                <div className="text-xs text-muted-foreground/40 text-center py-8">
                  <Link2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  该节点暂无关联关系
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 用于图例中检测暗色模式 */
function isDarkContext() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}
