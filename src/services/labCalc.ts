/**
 * 实验数据处理 - 计算服务
 * 预设公式、模板公式、自定义公式、最小二乘拟合
 */
import type { LabVariable, LabPresetFormula, LabFormulaTemplate, LabCalcResult } from '@/types';
import { evaluate } from 'mathjs';

// ========== 预设公式计算 ==========

/** 算术平均值 x̄ */
function calcAverage(values: number[]): { value: number; process: string } {
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const process = `x̄ = (${values.map(v => v).join(' + ')}) / ${n} = ${sum.toFixed(6)} / ${n} = ${avg.toFixed(6)}`;
  return { value: avg, process };
}

/** 标准差 S（样本标准差） */
function calcStdDev(values: number[]): { value: number; process: string } {
  const n = values.length;
  const { value: avg } = calcAverage(values);
  const diffs = values.map(v => v - avg);
  const sumSq = diffs.reduce((a, b) => a + b * b, 0);
  const s = Math.sqrt(sumSq / (n - 1));
  const process = `S = √[Σ(xi - x̄)² / (n-1)] = √[${sumSq.toFixed(6)} / ${n - 1}] = ${s.toFixed(6)}`;
  return { value: s, process };
}

/** A类不确定度 uA = S / √n */
function calcUA(values: number[]): { value: number; process: string } {
  const n = values.length;
  const { value: s } = calcStdDev(values);
  const ua = s / Math.sqrt(n);
  const process = `uA = S / √n = ${s.toFixed(6)} / √${n} = ${s.toFixed(6)} / ${Math.sqrt(n).toFixed(6)} = ${ua.toFixed(6)}`;
  return { value: ua, process };
}

/** B类不确定度 uB = Δ仪 / √3 */
function calcUB(instrumentError: number): { value: number; process: string } {
  const ub = instrumentError / Math.sqrt(3);
  const process = `uB = Δ仪 / √3 = ${instrumentError} / ${Math.sqrt(3).toFixed(6)} = ${ub.toFixed(6)}`;
  return { value: ub, process };
}

/** 合成不确定度 u = √(uA² + uB²) */
function calcUCombined(values: number[], instrumentError: number): { value: number; process: string } {
  const { value: ua } = calcUA(values);
  const { value: ub } = calcUB(instrumentError);
  const u = Math.sqrt(ua * ua + ub * ub);
  const process = `u = √(uA² + uB²) = √(${ua.toFixed(6)}² + ${ub.toFixed(6)}²) = √(${(ua * ua).toFixed(6)} + ${(ub * ub).toFixed(6)}) = ${u.toFixed(6)}`;
  return { value: u, process };
}

/** 相对不确定度 ur = u / x̄ */
function calcURelative(values: number[], instrumentError: number): { value: number; process: string } {
  const { value: avg } = calcAverage(values);
  const { value: u } = calcUCombined(values, instrumentError);
  const ur = u / Math.abs(avg);
  const percent = (ur * 100).toFixed(2);
  const process = `ur = u / x̄ = ${u.toFixed(6)} / ${avg.toFixed(6)} = ${ur.toFixed(6)} = ${percent}%`;
  return { value: ur, process };
}

/** 预设公式的显示名 */
const PRESET_NAMES: Record<LabPresetFormula, string> = {
  average: '算术平均值 x̄',
  stddev: '标准差 S',
  uA: 'A类不确定度 uA',
  uB: 'B类不确定度 uB',
  uCombined: '合成不确定度 u',
  uRelative: '相对不确定度 ur',
};

/**
 * 执行预设公式计算
 * @param formula 预设公式类型
 * @param variable 选中的变量
 * @returns 计算结果
 */
export function calcPresetFormula(
  formula: LabPresetFormula,
  variable: LabVariable
): LabCalcResult {
  const { values, instrumentError = 0, name } = variable;

  if (values.length === 0) {
    return {
      formula,
      displayName: `${PRESET_NAMES[formula]}（${name}）`,
      value: NaN,
      process: '数据为空，无法计算',
    };
  }

  let result: { value: number; process: string };

  switch (formula) {
    case 'average':
      result = calcAverage(values);
      break;
    case 'stddev':
      if (values.length < 2) {
        return { formula, displayName: `${PRESET_NAMES[formula]}（${name}）`, value: NaN, process: '数据少于2个，无法计算标准差' };
      }
      result = calcStdDev(values);
      break;
    case 'uA':
      if (values.length < 2) {
        return { formula, displayName: `${PRESET_NAMES[formula]}（${name}）`, value: NaN, process: '数据少于2个，无法计算A类不确定度' };
      }
      result = calcUA(values);
      break;
    case 'uB':
      if (!instrumentError) {
        return { formula, displayName: `${PRESET_NAMES[formula]}（${name}）`, value: NaN, process: '未设置仪器误差限 Δ仪，无法计算B类不确定度' };
      }
      result = calcUB(instrumentError);
      break;
    case 'uCombined':
      if (values.length < 2) {
        return { formula, displayName: `${PRESET_NAMES[formula]}（${name}）`, value: NaN, process: '数据少于2个，无法计算合成不确定度' };
      }
      if (!instrumentError) {
        return { formula, displayName: `${PRESET_NAMES[formula]}（${name}）`, value: NaN, process: '未设置仪器误差限 Δ仪，无法计算合成不确定度' };
      }
      result = calcUCombined(values, instrumentError);
      break;
    case 'uRelative':
      if (values.length < 2 || !instrumentError) {
        return { formula, displayName: `${PRESET_NAMES[formula]}（${name}）`, value: NaN, process: '需要至少2个数据且设置仪器误差限' };
      }
      result = calcURelative(values, instrumentError);
      break;
    default:
      result = { value: NaN, process: '未知公式' };
  }

  return {
    formula,
    displayName: `${PRESET_NAMES[formula]}（${name}）`,
    value: result.value,
    process: result.process,
  };
}

// ========== 模板公式 ==========

/** 内置公式模板 */
export const BUILTIN_TEMPLATES: LabFormulaTemplate[] = [
  {
    id: 'cylinder_volume',
    name: '圆柱体体积',
    description: 'V = πD²h / 4',
    expression: 'pi * {D_avg}^2 * {h_avg} / 4',
    inputs: [
      { key: 'D_avg', label: '直径平均值 D̄' },
      { key: 'h_avg', label: '高度平均值 h̄' },
    ],
  },
  {
    id: 'hollow_cylinder_volume',
    name: '空心圆柱体体积',
    description: 'V = π(D外² - D内²)h / 4',
    expression: 'pi * ({D_outer_avg}^2 - {D_inner_avg}^2) * {h_avg} / 4',
    inputs: [
      { key: 'D_outer_avg', label: '外径平均值 D̄外' },
      { key: 'D_inner_avg', label: '内径平均值 D̄内' },
      { key: 'h_avg', label: '高度平均值 h̄' },
    ],
  },
  {
    id: 'pendulum_g',
    name: '单摆测重力加速度',
    description: 'g = 4π²L / T²',
    expression: '4 * pi^2 * {L_avg} / {T_avg}^2',
    inputs: [
      { key: 'L_avg', label: '摆长平均值 L̄' },
      { key: 'T_avg', label: '周期平均值 T̄' },
    ],
  },
  {
    id: 'resistance',
    name: '电阻（伏安法）',
    description: 'R = U / I',
    expression: '{U_avg} / {I_avg}',
    inputs: [
      { key: 'U_avg', label: '电压平均值 Ū' },
      { key: 'I_avg', label: '电流平均值 Ī' },
    ],
  },
  {
    id: 'density',
    name: '密度测量',
    description: 'ρ = m / V',
    expression: '{m} / {V}',
    inputs: [
      { key: 'm', label: '质量 m' },
      { key: 'V', label: '体积 V' },
    ],
  },
];

/**
 * 执行模板公式或自定义公式
 * @param expression math.js表达式，变量用 {varName} 引用
 * @param inputValues 变量名 → 数值的映射
 * @param displayName 显示名
 * @param formulaId 公式ID
 */
export function calcCustomFormula(
  expression: string,
  inputValues: Record<string, number>,
  displayName: string,
  formulaId: string
): LabCalcResult {
  try {
    // 把 {varName} 替换为实际值
    let expr = expression;
    const processSteps: string[] = [];
    for (const [key, val] of Object.entries(inputValues)) {
      expr = expr.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
      processSteps.push(`${key} = ${val}`);
    }

    const value = evaluate(expr) as number;
    const process = `${processSteps.join(', ')}\n代入 ${expression} → ${expr}\n= ${typeof value === 'number' ? value.toFixed(6) : value}`;

    return { formula: formulaId, displayName, value, process };
  } catch (err) {
    return {
      formula: formulaId,
      displayName,
      value: NaN,
      process: `公式计算错误: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ========== 最小二乘拟合 ==========

export interface FitResult {
  /** 拟合方程文本 */
  equation: string;
  /** 系数 */
  coefficients: number[];
  /** 拟合值（用于画线） */
  fittedY: number[];
  /** R² 决定系数 */
  rSquared: number;
}

/** 线性拟合 y = a + bx */
function linearFit(x: number[], y: number[]): FitResult {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);

  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;

  const fittedY = x.map(xi => a + b * xi);
  const rSquared = calcRSquared(y, fittedY);

  const aStr = a >= 0 ? a.toFixed(4) : `(${a.toFixed(4)})`;
  const bStr = b >= 0 ? b.toFixed(4) : `(${b.toFixed(4)})`;

  return {
    equation: `y = ${aStr} + ${bStr}x`,
    coefficients: [a, b],
    fittedY,
    rSquared,
  };
}

/** 二次拟合 y = a + bx + cx² */
function quadraticFit(x: number[], y: number[]): FitResult {
  const n = x.length;
  // 构建正规方程 X^T X c = X^T y
  const X = x.map(xi => [1, xi, xi * xi]);
  const result = solveLeastSquares(X, y);
  const [a, b, c] = result;

  const fittedY = x.map(xi => a + b * xi + c * xi * xi);
  const rSquared = calcRSquared(y, fittedY);

  const aStr = a.toFixed(4);
  const bStr = b >= 0 ? `+ ${b.toFixed(4)}` : `- ${Math.abs(b).toFixed(4)}`;
  const cStr = c >= 0 ? `+ ${c.toFixed(4)}` : `- ${Math.abs(c).toFixed(4)}`;

  return {
    equation: `y = ${aStr} ${bStr}x ${cStr}x²`,
    coefficients: [a, b, c],
    fittedY,
    rSquared,
  };
}

/** 三次拟合 y = a + bx + cx² + dx³ */
function cubicFit(x: number[], y: number[]): FitResult {
  const X = x.map(xi => [1, xi, xi * xi, xi * xi * xi]);
  const result = solveLeastSquares(X, y);
  const [a, b, c, d] = result;

  const fittedY = x.map(xi => a + b * xi + c * xi * xi + d * xi * xi * xi);
  const rSquared = calcRSquared(y, fittedY);

  return {
    equation: `y = ${a.toFixed(4)} + ${b.toFixed(4)}x + ${c.toFixed(4)}x² + ${d.toFixed(4)}x³`,
    coefficients: [a, b, c, d],
    fittedY,
    rSquared,
  };
}

/** 最小二乘法求解：X^T X c = X^T y */
function solveLeastSquares(X: number[][], y: number[]): number[] {
  const n = X[0].length; // 参数个数
  // X^T X
  const XtX: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < X.length; k++) {
        XtX[i][j] += X[k][i] * X[k][j];
      }
    }
  }
  // X^T y
  const Xty: number[] = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < X.length; k++) {
      Xty[i] += X[k][i] * y[k];
    }
  }
  // 高斯消元法
  return gaussElimination(XtX, Xty);
}

/** 高斯消元法求解线性方程组 */
function gaussElimination(A: number[][], b: number[]): number[] {
  const n = A.length;
  // 增广矩阵
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // 选主元
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    // 消元
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // 回代
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return x;
}

/** 计算 R² 决定系数 */
function calcRSquared(yActual: number[], yFitted: number[]): number {
  const mean = yActual.reduce((a, b) => a + b, 0) / yActual.length;
  const ssTot = yActual.reduce((a, b, i) => a + (b - mean) ** 2, 0);
  const ssRes = yActual.reduce((a, b, i) => a + (b - yFitted[i]) ** 2, 0);
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

/**
 * 执行拟合
 * @param fitType 拟合类型
 * @param xData X轴数据
 * @param yData Y轴数据
 */
export function performFit(
  fitType: 'linear' | 'quadratic' | 'cubic',
  xData: number[],
  yData: number[]
): FitResult {
  switch (fitType) {
    case 'linear':
      return linearFit(xData, yData);
    case 'quadratic':
      return quadraticFit(xData, yData);
    case 'cubic':
      return cubicFit(xData, yData);
  }
}

/**
 * 为拟合线生成平滑的点数据
 * @param xData 原始X数据
 * @param fitType 拟合类型
 * @param coefficients 拟合系数
 * @param points 生成点数
 */
export function generateFitPoints(
  xData: number[],
  fitType: 'linear' | 'quadratic' | 'cubic',
  coefficients: number[],
  points: number = 100
): { x: number; y: number }[] {
  const xMin = Math.min(...xData);
  const xMax = Math.max(...xData);
  const step = (xMax - xMin) / (points - 1);
  const result: { x: number; y: number }[] = [];

  for (let i = 0; i < points; i++) {
    const x = xMin + i * step;
    let y: number;
    switch (fitType) {
      case 'linear':
        y = coefficients[0] + coefficients[1] * x;
        break;
      case 'quadratic':
        y = coefficients[0] + coefficients[1] * x + coefficients[2] * x * x;
        break;
      case 'cubic':
        y = coefficients[0] + coefficients[1] * x + coefficients[2] * x * x + coefficients[3] * x * x * x;
        break;
    }
    result.push({ x: parseFloat(x.toFixed(8)), y: parseFloat(y.toFixed(8)) });
  }

  return result;
}
