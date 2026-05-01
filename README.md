# 智学图谱 Scholar-Graph

> 基于知识图谱与大模型的课程学习与实验数据处理平台 —— 天津大学人工智能创新应用案例

## 产品简介

智学图谱是一款面向本科生的**知识图谱 + 大模型**驱动的课程学习与实验数据处理平台。上传课件 PDF 即可自动解析，通过 AI 逐页讲解与追问、自动生成知识图谱和测验，同时提供完整的实验数据处理工具（公式计算、数据作图、拍照识别），实现"学-问-测-算"一体化的学习闭环。

**在线体验**：[https://neldaallisonmhkt3-ctrl.github.io/scholar-graph/](https://neldaallisonmhkt3-ctrl.github.io/scholar-graph/)

---

## 核心功能

### 📚 PDF 课件解析与 AI 讲解
- 上传 PDF 课件，逐页自动提取关键词与摘要
- 点击任意页面展开 AI 深度讲解
- 支持追问，AI 基于当前页面上下文回答
- 5 家大模型 API 可选：DeepSeek / OpenAI / Claude / Gemini / 智谱

### 🕸️ 知识图谱
- 一键从已解析 PDF 中提取知识点与关系
- D3.js 力导向图可视化，仿 Obsidian 风格
- 节点支持拖拽、缩放、悬停描述、点击查看详情
- 6 种关系类型：包含 / 依赖于 / 推导出 / 对比 / 应用 / 前置知识
- 右侧详情面板显示描述、来源文件、相关关系
- 新增 PDF 后可刷新图谱，自动合并新知识

### 📝 Quiz 测验
- 每个已解析 PDF 可生成测验，仿 Gemini 闪卡风格
- 支持关键词筛选、题数（5/10/15）、难度（简单/中等/困难）
- 闪卡式逐题答题：选项点击 → 揭晓 → 解析 → 提示
- 答题结果：正确率、评级、错题回顾
- 扩展题标记（超出 PDF 范围的知识）
- 来源页跳转，历史测验管理

### 🧪 实验数据处理
- **数据输入**：手动建表 + 拍照识别（LLM 视觉，支持 Gemini/Claude/OpenAI）
- **预设公式**：x̄、S、uA、uB、u、ur（一键计算，含完整过程文本）
- **模板公式**：圆柱体积、空心圆柱、单摆测 g、电阻伏安法、密度
- **自定义公式**：math.js 解析，支持 `{varName}` 变量引用，可保存复用
- **作图**：ECharts 散点/折线/极坐标 + 线性/二次/三次拟合 + R²
- **导出**：CSV 数据 + PNG 图表 + 复制计算过程

---

## 技术架构

| 层级 | 技术选型 |
|------|---------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| UI 组件 | Tailwind CSS + shadcn/ui |
| 知识图谱 | D3.js 力导向图 |
| 图表可视化 | ECharts |
| PDF 解析 | pdfjs-dist |
| 公式计算 | math.js |
| 数据存储 | Dexie.js (IndexedDB) |
| 大模型 API | DeepSeek / OpenAI / Claude / Gemini / 智谱 |

---

## 快速开始

### 在线使用

直接访问 [GitHub Pages](https://neldaallisonmhkt3-ctrl.github.io/scholar-graph/) 即可使用，无需安装任何软件。

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/neldaallisonmhkt3-ctrl/scholar-graph.git
cd scholar-graph

# 安装依赖（需 Node.js 18+）
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

### AI 模型配置

首次使用需在"设置"页面配置至少一个大模型 API Key：

| 模型 | 获取地址 |
|------|---------|
| DeepSeek | https://platform.deepseek.com |
| OpenAI | https://platform.openai.com |
| Claude | https://console.anthropic.com |
| Gemini | https://aistudio.google.com |
| 智谱 | https://open.bigmodel.cn |

API Key 仅存储在本地浏览器 IndexedDB 中，不会上传到任何服务器。

---

## 项目结构

```
src/
  components/
    ui/                     # shadcn/ui 基础组件
    KnowledgeGraph/         # 知识图谱（D3.js 力导向图）
    Quiz/                   # Quiz 测验（闪卡式）
    LabCalc/                # 实验数据计算
    LabOcr/                 # 拍照识别
    SettingsPanel.tsx       # 设置面板
    Sidebar.tsx             # 侧边栏
  services/
    llm.ts                  # LLM API 统一网关
    pdf.ts                  # PDF 解析管线
    knowledgeGraph.ts       # 知识图谱生成
    quiz.ts                 # 测验生成
    labCalc.ts              # 实验公式计算
    labOcr.ts               # OCR 识别
  db/
    index.ts                # Dexie 数据库定义
  App.tsx                   # 主应用组件
  main.tsx                  # 入口文件
```

---

## 数据存储

所有数据存储在浏览器本地 IndexedDB 中（通过 Dexie.js 管理），包括：

- 工作空间与文件元数据
- PDF 文件 Blob
- 页面解析结果
- AI 对话记录
- 模型配置
- 知识图谱节点与边
- 测验与答题记录
- 实验项目数据

**无需后端服务器，无需注册账号，数据完全由用户掌控。**

---

## 适用场景

- 📖 课程复习：上传课件 PDF，AI 逐页讲解，追问答疑
- 🗺️ 知识梳理：自动生成知识图谱，可视化知识关联
- ✍️ 自测练习：AI 生成测验，闪卡式答题，错题回顾
- 🔬 实验报告：数据处理、公式计算、自动作图、一键导出

---

## 开发团队

天津大学精密仪器与光电子工程学院 智能感知工程专业

---

*本项目为天津大学"智创天大，智享未来"人工智能创新应用案例征集活动参赛作品。*
