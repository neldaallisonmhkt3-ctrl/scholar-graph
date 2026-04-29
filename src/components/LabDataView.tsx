/**
 * 实验数据处理 - 主视图
 * 独立于工作空间，包含数据输入、计算、作图三大功能
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { LabProject, LabVariable, LabCalcResult, LabChartConfig, LabPresetFormula, LabCustomFormula, ModelProvider } from '@/types';
import { db } from '@/db';
import { v4 as uuid } from 'uuid';
import { calcPresetFormula, calcCustomFormula, BUILTIN_TEMPLATES, performFit, generateFitPoints } from '@/services/labCalc';
import { recognizeLabData, fileToBase64 } from '@/services/labOcr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus, Trash2, Camera, Calculator, LineChart as LineChartIcon,
  Save, Download, ChevronDown, ChevronRight, FlaskConical, X,
  FileText, Copy, RotateCcw
} from 'lucide-react';

// ========== ECharts 动态导入 ==========
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let echartsModule: any = null;
async function getECharts() {
  if (!echartsModule) {
    echartsModule = await import('echarts');
  }
  return echartsModule;
}

// ========== 工具函数 ==========

/** 格式化数字，保留有效位数 */
function fmt(n: number, digits: number = 4): string {
  if (isNaN(n) || !isFinite(n)) return 'N/A';
  return Number(n.toPrecision(digits)).toString();
}

// ========== 属性 ==========
interface LabDataViewProps {
  onBack: () => void;
}

export function LabDataView({ onBack }: LabDataViewProps) {
  // === 项目状态 ===
  const [projects, setProjects] = useState<LabProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<LabProject | null>(null);

  // === 数据编辑 ===
  const [newVarName, setNewVarName] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === 计算 ===
  const [selectedVarIndex, setSelectedVarIndex] = useState(0);
  const [calcResults, setCalcResults] = useState<LabCalcResult[]>([]);
  const [templateInputs, setTemplateInputs] = useState<Record<string, Record<string, string>>>({});
  const [customFormulaName, setCustomFormulaName] = useState('');
  const [customFormulaExpr, setCustomFormulaExpr] = useState('');
  const [customFormulaInputs, setCustomFormulaInputs] = useState<Record<string, string>>({});
  const [projectCustomFormulas, setProjectCustomFormulas] = useState<LabCustomFormula[]>([]);

  // === 图表 ===
  const [chartXVar, setChartXVar] = useState('');
  const [chartYVar, setChartYVar] = useState('');
  const [chartFitType, setChartFitType] = useState<'none' | 'linear' | 'quadratic' | 'cubic'>('none');
  const [chartType, setChartType] = useState<'scatter' | 'line' | 'polar'>('scatter');
  const chartRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartInstanceRef = useRef<any>(null);

  // === 新建项目 ===
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // ========== 加载项目列表 ==========
  const loadProjects = useCallback(async () => {
    const list = await db.labProjects.orderBy('updatedAt').reverse().toArray();
    setProjects(list);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // ========== 加载当前项目 ==========
  useEffect(() => {
    if (currentProjectId) {
      db.labProjects.get(currentProjectId).then(p => {
        setCurrentProject(p ?? null);
        if (p) {
          setCalcResults(p.calcResults ?? []);
          setProjectCustomFormulas(p.customFormulas ?? []);
          setSelectedVarIndex(0);
        }
      });
    } else {
      setCurrentProject(null);
      setCalcResults([]);
      setProjectCustomFormulas([]);
    }
  }, [currentProjectId]);

  // ========== 保存项目 ==========
  const saveProject = useCallback(async (updated: LabProject) => {
    updated.updatedAt = Date.now();
    await db.labProjects.put(updated);
    setCurrentProject({ ...updated });
    await loadProjects();
  }, [loadProjects]);

  // ========== 新建项目 ==========
  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    const now = Date.now();
    const project: LabProject = {
      id: uuid(),
      name,
      variables: [],
      customFormulas: [],
      calcResults: [],
      charts: [],
      createdAt: now,
      updatedAt: now,
    };
    await db.labProjects.add(project);
    setNewProjectName('');
    setShowNewProject(false);
    await loadProjects();
    setCurrentProjectId(project.id);
  }, [newProjectName, loadProjects]);

  // ========== 删除项目 ==========
  const handleDeleteProject = useCallback(async (id: string) => {
    await db.labProjects.delete(id);
    if (currentProjectId === id) {
      setCurrentProjectId(null);
      setCurrentProject(null);
    }
    await loadProjects();
  }, [currentProjectId, loadProjects]);

  // ========== 添加变量 ==========
  const handleAddVariable = useCallback(async () => {
    if (!currentProject || !newVarName.trim()) return;
    const newVar: LabVariable = { name: newVarName.trim(), values: [] };
    const updated: LabProject = {
      ...currentProject,
      variables: [...currentProject.variables, newVar],
    };
    await saveProject(updated);
    setNewVarName('');
  }, [currentProject, newVarName, saveProject]);

  // ========== 修改变量值 ==========
  const handleValueChange = useCallback(async (varIndex: number, valueIndex: number, newValue: string) => {
    if (!currentProject) return;
    const numVal = newValue === '' ? NaN : parseFloat(newValue);
    const vars = [...currentProject.variables];
    const values = [...vars[varIndex].values];
    // 扩展数组到所需长度（新变量values为空时需要填充NaN）
    while (values.length <= valueIndex) {
      values.push(NaN);
    }
    values[valueIndex] = numVal;
    vars[varIndex] = { ...vars[varIndex], values };
    await saveProject({ ...currentProject, variables: vars });
  }, [currentProject, saveProject]);

  // ========== 添加数据行 ==========
  const handleAddRow = useCallback(async () => {
    if (!currentProject || currentProject.variables.length === 0) return;
    const vars = currentProject.variables.map(v => ({
      ...v,
      values: [...v.values, NaN],
    }));
    await saveProject({ ...currentProject, variables: vars });
  }, [currentProject, saveProject]);

  // ========== 删除数据行 ==========
  const handleDeleteRow = useCallback(async (rowIndex: number) => {
    if (!currentProject) return;
    const vars = currentProject.variables.map(v => ({
      ...v,
      values: v.values.filter((_, i) => i !== rowIndex),
    }));
    await saveProject({ ...currentProject, variables: vars });
  }, [currentProject, saveProject]);

  // ========== 删除变量列 ==========
  const handleDeleteVariable = useCallback(async (varIndex: number) => {
    if (!currentProject) return;
    const vars = currentProject.variables.filter((_, i) => i !== varIndex);
    await saveProject({ ...currentProject, variables: vars });
    if (selectedVarIndex >= vars.length) setSelectedVarIndex(Math.max(0, vars.length - 1));
  }, [currentProject, selectedVarIndex, saveProject]);

  // ========== 设置仪器误差 ==========
  const handleSetInstrumentError = useCallback(async (varIndex: number, error: string) => {
    if (!currentProject) return;
    const vars = [...currentProject.variables];
    vars[varIndex] = {
      ...vars[varIndex],
      instrumentError: error === '' ? undefined : parseFloat(error),
    };
    await saveProject({ ...currentProject, variables: vars });
  }, [currentProject, saveProject]);

  // ========== 拍照识别 ==========
  const handleOcrImage = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProject) return;

    // 获取第一个可用的 provider
    const providers = await db.modelProviders.toArray();
    if (providers.length === 0) {
      alert('请先在模型设置中配置 API Key');
      return;
    }
    const provider = providers[0];

    setOcrLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const variables = await recognizeLabData(base64, provider, file.type);
      if (variables.length === 0) {
        alert('未能识别到数据，请确保照片清晰且包含数据表格');
        return;
      }
      const updated: LabProject = {
        ...currentProject,
        variables: [...currentProject.variables, ...variables],
      };
      await saveProject(updated);
    } catch (err) {
      alert(`识别失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOcrLoading(false);
      // 重置 file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [currentProject, saveProject]);

  // ========== 预设公式计算 ==========
  const handlePresetCalc = useCallback(async (formula: LabPresetFormula) => {
    if (!currentProject || currentProject.variables.length === 0) return;
    const variable = currentProject.variables[selectedVarIndex];
    if (!variable) return;
    const result = calcPresetFormula(formula, variable);
    const newResults = [...calcResults, result];
    setCalcResults(newResults);
    await saveProject({ ...currentProject, calcResults: newResults });
  }, [currentProject, selectedVarIndex, calcResults, saveProject]);

  // ========== 模板公式计算 ==========
  const handleTemplateCalc = useCallback(async (templateId: string) => {
    if (!currentProject) return;
    const template = BUILTIN_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    const inputs = templateInputs[templateId] ?? {};
    const numInputs: Record<string, number> = {};
    for (const inp of template.inputs) {
      const val = parseFloat(inputs[inp.key] ?? '');
      if (isNaN(val)) {
        alert(`请填写 ${inp.label}`);
        return;
      }
      numInputs[inp.key] = val;
    }
    const result = calcCustomFormula(template.expression, numInputs, template.name, template.id);
    const newResults = [...calcResults, result];
    setCalcResults(newResults);
    await saveProject({ ...currentProject, calcResults: newResults });
  }, [currentProject, templateInputs, calcResults, saveProject]);

  // ========== 自定义公式计算 ==========
  const handleCustomCalc = useCallback(async () => {
    if (!currentProject || !customFormulaExpr.trim()) return;
    const numInputs: Record<string, number> = {};
    for (const [key, val] of Object.entries(customFormulaInputs)) {
      const num = parseFloat(val);
      if (isNaN(num)) {
        alert(`变量 ${key} 的值无效`);
        return;
      }
      numInputs[key] = num;
    }
    const name = customFormulaName.trim() || '自定义公式';
    const result = calcCustomFormula(customFormulaExpr, numInputs, name, `custom_${Date.now()}`);
    const newResults = [...calcResults, result];
    setCalcResults(newResults);
    await saveProject({ ...currentProject, calcResults: newResults });
  }, [currentProject, customFormulaName, customFormulaExpr, customFormulaInputs, calcResults, saveProject]);

  // ========== 保存自定义公式到项目 ==========
  const handleSaveCustomFormula = useCallback(async () => {
    if (!currentProject || !customFormulaExpr.trim()) return;
    const formula: LabCustomFormula = {
      id: uuid(),
      name: customFormulaName.trim() || '自定义公式',
      expression: customFormulaExpr,
      createdAt: Date.now(),
    };
    const newFormulas = [...projectCustomFormulas, formula];
    setProjectCustomFormulas(newFormulas);
    await saveProject({ ...currentProject, customFormulas: newFormulas });
    setCustomFormulaName('');
    setCustomFormulaExpr('');
  }, [currentProject, customFormulaName, customFormulaExpr, projectCustomFormulas, saveProject]);

  // ========== 使用已保存的自定义公式 ==========
  const handleUseSavedFormula = useCallback(async (formula: LabCustomFormula) => {
    if (!currentProject) return;
    // 解析公式中的变量引用 {varName}
    const varMatches = formula.expression.match(/\{([^}]+)\}/g);
    const inputs: Record<string, number> = {};
    if (varMatches) {
      for (const m of varMatches) {
        const varName = m.slice(1, -1);
        const val = customFormulaInputs[varName];
        if (!val) {
          alert(`请填写变量 ${varName} 的值`);
          return;
        }
        const num = parseFloat(val);
        if (isNaN(num)) {
          alert(`变量 ${varName} 的值无效`);
          return;
        }
        inputs[varName] = num;
      }
    }
    const result = calcCustomFormula(formula.expression, inputs, formula.name, formula.id);
    const newResults = [...calcResults, result];
    setCalcResults(newResults);
    await saveProject({ ...currentProject, calcResults: newResults });
  }, [currentProject, customFormulaInputs, calcResults, saveProject]);

  // ========== 清除计算结果 ==========
  const handleClearResults = useCallback(async () => {
    if (!currentProject) return;
    setCalcResults([]);
    await saveProject({ ...currentProject, calcResults: [] });
  }, [currentProject, saveProject]);

  // ========== 图表渲染 ==========
  useEffect(() => {
    if (!chartRef.current || !currentProject) return;

    const renderChart = async () => {
      const echarts = await getECharts();
      if (!chartRef.current) return;

      // 销毁旧实例
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
      }
      chartInstanceRef.current = echarts.init(chartRef.current);

      const xVar = currentProject.variables.find(v => v.name === chartXVar);
      const yVar = currentProject.variables.find(v => v.name === chartYVar);

      if (!xVar || !yVar) {
        chartInstanceRef.current.setOption({
          title: { text: '请选择X轴和Y轴变量', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } },
        });
        return;
      }

      // 取有效数据对（两个变量都有值的行）
      const data: [number, number][] = [];
      const len = Math.min(xVar.values.length, yVar.values.length);
      for (let i = 0; i < len; i++) {
        if (!isNaN(xVar.values[i]) && !isNaN(yVar.values[i])) {
          data.push([xVar.values[i], yVar.values[i]]);
        }
      }

      if (data.length === 0) {
        chartInstanceRef.current.setOption({
          title: { text: '无有效数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } },
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const series: any[] = [{
        name: '数据点',
        type: chartType === 'polar' ? 'scatter' : (chartType === 'line' ? 'line' : 'scatter'),
        data: data,
        symbolSize: 8,
        itemStyle: { color: '#6366f1' },
      }];

      // 拟合线
      let fitResultText = '';
      if (chartFitType !== 'none' && data.length >= 2) {
        const xData = data.map(d => d[0]);
        const yData = data.map(d => d[1]);
        try {
          const fit = performFit(chartFitType, xData, yData);
          const fitPoints = generateFitPoints(xData, chartFitType, fit.coefficients, 200);
          series.push({
            name: `${chartFitType === 'linear' ? '线性' : chartFitType === 'quadratic' ? '二次' : '三次'}拟合`,
            type: 'line',
            data: fitPoints.map(p => [p.x, p.y]),
            smooth: true,
            symbol: 'none',
            lineStyle: { color: '#ef4444', width: 2, type: 'dashed' },
          });
          fitResultText = `${fit.equation}  R²=${fit.rSquared.toFixed(6)}`;
        } catch {
          fitResultText = '拟合失败';
        }
      }

      const option: Record<string, unknown> = {
        title: {
          text: fitResultText || undefined,
          textStyle: { fontSize: 12, color: '#666' },
          left: 'center',
        },
        tooltip: {
          trigger: 'item',
          formatter: (params: { data: number[] }) => {
            return `${chartXVar}: ${params.data[0]}<br/>${chartYVar}: ${params.data[1]}`;
          },
        },
        grid: { left: 60, right: 30, top: fitResultText ? 50 : 30, bottom: 40 },
        xAxis: { type: 'value', name: chartXVar, nameLocation: 'middle', nameGap: 25 },
        yAxis: { type: 'value', name: chartYVar, nameLocation: 'middle', nameGap: 50 },
        series,
      };

      // 极坐标模式
      if (chartType === 'polar') {
        option.polar = {};
        option.angleAxis = { type: 'value', name: chartXVar };
        option.radiusAxis = { type: 'value', name: chartYVar };
        delete option.grid;
        delete option.xAxis;
        delete option.yAxis;
        series[0].coordinateSystem = 'polar';
        if (series[1]) series[1].coordinateSystem = 'polar';
      }

      chartInstanceRef.current.setOption(option);
    };

    renderChart();

    // 响应窗口大小
    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [currentProject, chartXVar, chartYVar, chartFitType, chartType]);

  // ========== 导出CSV ==========
  const handleExportCSV = useCallback(() => {
    if (!currentProject) return;
    const headers = currentProject.variables.map(v => v.name).join(',');
    const maxRows = Math.max(...currentProject.variables.map(v => v.values.length), 0);
    const rows: string[] = [];
    for (let i = 0; i < maxRows; i++) {
      const row = currentProject.variables.map(v => {
        const val = v.values[i];
        return isNaN(val) ? '' : String(val);
      }).join(',');
      rows.push(row);
    }
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name}_数据.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentProject]);

  // ========== 导出图表 ==========
  const handleExportChart = useCallback(() => {
    if (!chartInstanceRef.current) return;
    const url = chartInstanceRef.current.getDataURL({ type: 'png', pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject?.name ?? '图表'}_chart.png`;
    a.click();
  }, [currentProject]);

  // ========== 复制计算过程 ==========
  const handleCopyProcess = useCallback(() => {
    const text = calcResults.map(r => `${r.displayName}:\n${r.process}\n结果: ${fmt(r.value)}\n`).join('\n');
    navigator.clipboard.writeText(text);
  }, [calcResults]);

  // ========== 渲染 ==========
  // 如果没有选中项目，显示项目列表
  if (!currentProjectId) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {/* 顶栏 */}
        <div className="h-14 flex items-center px-4 border-b border-border gap-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            ← 返回
          </Button>
          <FlaskConical className="w-5 h-5 text-primary" />
          <span className="font-semibold">实验数据处理</span>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 max-w-2xl mx-auto">
            <h2 className="text-lg font-semibold mb-4">我的实验项目</h2>

            {/* 项目列表 */}
            {projects.length === 0 ? (
              <div className="text-muted-foreground text-sm text-center py-12">
                还没有实验项目，点击下方新建
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {projects.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setCurrentProjectId(p.id)}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors group"
                  >
                    <div>
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.variables.length} 个变量 · {new Date(p.updatedAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <Trash2
                      className="w-4 h-4 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-destructive transition-opacity"
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 新建项目 */}
            {showNewProject ? (
              <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                <Input
                  placeholder="实验名称，如：圆柱体密度测量"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName(''); } }}
                  autoFocus
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreateProject} disabled={!newProjectName.trim()}>创建</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowNewProject(false); setNewProjectName(''); }}>取消</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2" onClick={() => setShowNewProject(true)}>
                <Plus className="w-4 h-4" />新建实验项目
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ========== 已选中项目 ==========
  if (!currentProject) return null;

  const maxRows = Math.max(...currentProject.variables.map(v => v.values.length), 0);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 顶栏 */}
      <div className="h-14 flex items-center px-4 border-b border-border gap-3 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => { setCurrentProjectId(null); setCurrentProject(null); }} className="gap-1">
          ← 项目列表
        </Button>
        <FlaskConical className="w-5 h-5 text-primary" />
        <span className="font-semibold">{currentProject.name}</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={handleExportCSV} className="gap-1 text-xs" disabled={currentProject.variables.length === 0}>
          <Download className="w-3.5 h-3.5" />导出CSV
        </Button>
      </div>

      {/* 主内容 - Tab切换 */}
      <Tabs defaultValue="data" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-2 shrink-0">
          <TabsList>
            <TabsTrigger value="data" className="gap-1 text-xs"><FileText className="w-3.5 h-3.5" />数据</TabsTrigger>
            <TabsTrigger value="calc" className="gap-1 text-xs"><Calculator className="w-3.5 h-3.5" />计算</TabsTrigger>
            <TabsTrigger value="chart" className="gap-1 text-xs"><LineChartIcon className="w-3.5 h-3.5" />作图</TabsTrigger>
          </TabsList>
        </div>

        {/* ===== 数据Tab ===== */}
        <TabsContent value="data" className="flex-1 overflow-auto min-h-0 px-4 pb-4 data-[state=active]:flex data-[state=active]:flex-col">
          {/* 拍照识别 */}
          <div className="flex items-center gap-2 mt-3 mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleOcrImage}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={ocrLoading}
            >
              <Camera className="w-3.5 h-3.5" />
              {ocrLoading ? '识别中...' : '拍照识别'}
            </Button>
            <span className="text-xs text-muted-foreground">拍照后可在表格中微调数据</span>
          </div>

          {/* 数据表格 */}
          {currentProject.variables.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium w-12">#</th>
                    {currentProject.variables.map((v, vi) => (
                      <th key={vi} className="px-3 py-2 text-left font-medium min-w-[100px]">
                        <div className="flex items-center gap-1">
                          <span>{v.name}</span>
                          <Trash2
                            className="w-3 h-3 opacity-30 hover:opacity-100 hover:text-destructive cursor-pointer transition-opacity"
                            onClick={() => handleDeleteVariable(vi)}
                          />
                        </div>
                      </th>
                    ))}
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxRows }).map((_, ri) => (
                    <tr key={ri} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-1.5 text-muted-foreground text-xs">{ri + 1}</td>
                      {currentProject.variables.map((v, vi) => (
                        <td key={vi} className="px-1 py-1">
                          <input
                            type="number"
                            step="any"
                            value={isNaN(v.values[ri]) ? '' : v.values[ri]}
                            onChange={e => handleValueChange(vi, ri, e.target.value)}
                            className="w-full px-2 py-1 text-sm bg-transparent border border-transparent hover:border-border focus:border-primary rounded outline-none transition-colors"
                          />
                        </td>
                      ))}
                      <td className="px-1">
                        <Trash2
                          className="w-3 h-3 opacity-30 hover:opacity-100 hover:text-destructive cursor-pointer transition-opacity"
                          onClick={() => handleDeleteRow(ri)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">暂无数据，添加变量或拍照识别</div>
          )}

          {/* 添加变量和行 */}
          <div className="flex items-center gap-2 mt-3">
            <Input
              placeholder="变量名（如 D/mm）"
              value={newVarName}
              onChange={e => setNewVarName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddVariable(); }}
              className="h-8 text-sm w-48"
            />
            <Button size="sm" onClick={handleAddVariable} disabled={!newVarName.trim()} className="gap-1">
              <Plus className="w-3.5 h-3.5" />添加变量
            </Button>
            <Button size="sm" variant="outline" onClick={handleAddRow} disabled={currentProject.variables.length === 0} className="gap-1">
              <Plus className="w-3.5 h-3.5" />添加行
            </Button>
          </div>

          {/* 仪器误差设置 */}
          {currentProject.variables.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
              <div className="text-xs text-muted-foreground mb-2 font-medium">仪器误差限 Δ仪</div>
              <div className="flex flex-wrap gap-3">
                {currentProject.variables.map((v, vi) => (
                  <div key={vi} className="flex items-center gap-1.5">
                    <span className="text-xs">{v.name}:</span>
                    <input
                      type="number"
                      step="any"
                      value={v.instrumentError ?? ''}
                      onChange={e => handleSetInstrumentError(vi, e.target.value)}
                      placeholder="Δ仪"
                      className="w-20 px-2 py-1 text-xs bg-transparent border border-border rounded outline-none focus:border-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== 计算Tab ===== */}
        <TabsContent value="calc" className="flex-1 overflow-auto min-h-0 px-4 pb-4 data-[state=active]:flex data-[state=active]:flex-col">
          {/* 选择变量 */}
          {currentProject.variables.length > 0 && (
            <div className="mt-3 mb-4">
              <div className="text-xs text-muted-foreground mb-1.5">选择计算变量</div>
              <div className="flex flex-wrap gap-1.5">
                {currentProject.variables.map((v, vi) => (
                  <button
                    key={vi}
                    onClick={() => setSelectedVarIndex(vi)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      selectedVarIndex === vi
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 预设公式 */}
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">预设公式</div>
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'average' as LabPresetFormula, label: 'x̄ 平均值' },
                { key: 'stddev' as LabPresetFormula, label: 'S 标准差' },
                { key: 'uA' as LabPresetFormula, label: 'uA A类' },
                { key: 'uB' as LabPresetFormula, label: 'uB B类' },
                { key: 'uCombined' as LabPresetFormula, label: 'u 合成' },
                { key: 'uRelative' as LabPresetFormula, label: 'ur 相对' },
              ]).map(f => (
                <Button
                  key={f.key}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handlePresetCalc(f.key)}
                  disabled={currentProject.variables.length === 0}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {/* 模板公式 */}
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">公式模板</div>
            <div className="space-y-2">
              {BUILTIN_TEMPLATES.map(t => (
                <div key={t.id} className="p-2.5 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{t.description}</span>
                    </div>
                    <Button size="sm" className="h-6 text-xs" onClick={() => handleTemplateCalc(t.id)}>计算</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {t.inputs.map(inp => (
                      <div key={inp.key} className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{inp.label}:</span>
                        <input
                          type="number"
                          step="any"
                          value={templateInputs[t.id]?.[inp.key] ?? ''}
                          onChange={e => setTemplateInputs(prev => ({
                            ...prev,
                            [t.id]: { ...(prev[t.id] ?? {}), [inp.key]: e.target.value },
                          }))}
                          className="w-20 px-2 py-0.5 text-xs border border-border rounded outline-none focus:border-primary bg-transparent"
                          placeholder={inp.label}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 自定义公式 */}
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">自定义公式</div>
            <div className="p-2.5 rounded-lg border border-border bg-muted/20 space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="公式名称（可选）"
                  value={customFormulaName}
                  onChange={e => setCustomFormulaName(e.target.value)}
                  className="h-7 text-xs w-36"
                />
                <Input
                  placeholder="math.js表达式，如 pi * {D_avg}^2 * {h_avg} / 4"
                  value={customFormulaExpr}
                  onChange={e => setCustomFormulaExpr(e.target.value)}
                  className="h-7 text-xs flex-1"
                />
              </div>
              {/* 动态输入变量 */}
              {customFormulaExpr && (() => {
                const matches = customFormulaExpr.match(/\{([^}]+)\}/g);
                if (!matches) return null;
                const vars = [...new Set(matches.map(m => m.slice(1, -1)))];
                return (
                  <div className="flex flex-wrap gap-2">
                    {vars.map(v => (
                      <div key={v} className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{v}:</span>
                        <input
                          type="number"
                          step="any"
                          value={customFormulaInputs[v] ?? ''}
                          onChange={e => setCustomFormulaInputs(prev => ({ ...prev, [v]: e.target.value }))}
                          className="w-20 px-2 py-0.5 text-xs border border-border rounded outline-none focus:border-primary bg-transparent"
                          placeholder={v}
                        />
                      </div>
                    ))}
                    <Button size="sm" className="h-6 text-xs" onClick={handleCustomCalc} disabled={!customFormulaExpr.trim()}>计算</Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handleSaveCustomFormula} disabled={!customFormulaExpr.trim()}>
                      <Save className="w-3 h-3" />保存公式
                    </Button>
                  </div>
                );
              })()}
            </div>

            {/* 已保存的自定义公式 */}
            {projectCustomFormulas.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="text-xs text-muted-foreground">已保存的公式</div>
                {projectCustomFormulas.map(f => (
                  <div key={f.id} className="flex items-center gap-2 p-2 rounded border border-border bg-muted/10">
                    <span className="text-xs font-medium">{f.name}</span>
                    <code className="text-xs text-muted-foreground flex-1 truncate">{f.expression}</code>
                    {/* 动态输入 */}
                    {(() => {
                      const matches = f.expression.match(/\{([^}]+)\}/g);
                      if (!matches) return (
                        <Button size="sm" className="h-6 text-xs" onClick={() => handleUseSavedFormula(f)}>计算</Button>
                      );
                      const vars = [...new Set(matches.map(m => m.slice(1, -1)))];
                      return (
                        <>
                          {vars.map(v => (
                            <input
                              key={v}
                              type="number"
                              step="any"
                              value={customFormulaInputs[v] ?? ''}
                              onChange={e => setCustomFormulaInputs(prev => ({ ...prev, [v]: e.target.value }))}
                              className="w-16 px-1.5 py-0.5 text-xs border border-border rounded outline-none focus:border-primary bg-transparent"
                              placeholder={v}
                            />
                          ))}
                          <Button size="sm" className="h-6 text-xs" onClick={() => handleUseSavedFormula(f)}>计算</Button>
                          <Trash2
                            className="w-3 h-3 opacity-30 hover:opacity-100 hover:text-destructive cursor-pointer"
                            onClick={async () => {
                              const newFormulas = projectCustomFormulas.filter(x => x.id !== f.id);
                              setProjectCustomFormulas(newFormulas);
                              await saveProject({ ...currentProject, customFormulas: newFormulas });
                            }}
                          />
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 计算结果 */}
          {calcResults.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs text-muted-foreground font-medium">计算结果</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={handleCopyProcess}>
                    <Copy className="w-3 h-3" />复制
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={handleClearResults}>
                    <RotateCcw className="w-3 h-3" />清除
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                {calcResults.map((r, i) => (
                  <div key={i} className="p-2.5 rounded-lg border border-border bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{r.displayName}</span>
                      <span className="text-sm font-mono text-primary">{fmt(r.value)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap font-mono">{r.process}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== 作图Tab ===== */}
        <TabsContent value="chart" className="flex-1 min-h-0 px-4 pb-4 data-[state=active]:flex data-[state=active]:flex-col">
          {currentProject.variables.length < 2 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              至少需要2个变量才能作图
            </div>
          ) : (
            <>
              {/* 图表配置 */}
              <div className="mt-3 mb-3 flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">X轴:</span>
                  <select
                    value={chartXVar}
                    onChange={e => setChartXVar(e.target.value)}
                    className="h-7 px-2 text-xs border border-border rounded bg-background outline-none"
                  >
                    <option value="">选择变量</option>
                    {currentProject.variables.map((v, i) => (
                      <option key={i} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Y轴:</span>
                  <select
                    value={chartYVar}
                    onChange={e => setChartYVar(e.target.value)}
                    className="h-7 px-2 text-xs border border-border rounded bg-background outline-none"
                  >
                    <option value="">选择变量</option>
                    {currentProject.variables.map((v, i) => (
                      <option key={i} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">图表:</span>
                  <select
                    value={chartType}
                    onChange={e => setChartType(e.target.value as 'scatter' | 'line' | 'polar')}
                    className="h-7 px-2 text-xs border border-border rounded bg-background outline-none"
                  >
                    <option value="scatter">散点图</option>
                    <option value="line">折线图</option>
                    <option value="polar">极坐标</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">拟合:</span>
                  <select
                    value={chartFitType}
                    onChange={e => setChartFitType(e.target.value as 'none' | 'linear' | 'quadratic' | 'cubic')}
                    className="h-7 px-2 text-xs border border-border rounded bg-background outline-none"
                  >
                    <option value="none">无</option>
                    <option value="linear">线性</option>
                    <option value="quadratic">二次</option>
                    <option value="cubic">三次</option>
                  </select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={handleExportChart}
                  disabled={!chartXVar || !chartYVar}
                >
                  <Download className="w-3.5 h-3.5" />导出PNG
                </Button>
              </div>

              {/* 图表区域 */}
              <div ref={chartRef} className="flex-1 min-h-[300px] rounded-lg border border-border bg-background" />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
