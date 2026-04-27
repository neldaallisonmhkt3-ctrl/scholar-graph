# 智学图谱 ScholarGraph

> AI课程学习与科研双赋能助手 —— 天津大学人工智能创新应用案例

## 产品概述

智学图谱是一款面向本科生的**基于知识图谱 + RAG**的课程学习与科研入门双赋能平台。通过知识图谱可视化、苏格拉底式AI辅导和科研文献探索三大核心模块，实现"学-问-研"三位一体的学习闭环。

## 核心功能

### 1. 知识图谱可视化学习导航
- 以《数据结构》课程为试点，构建35个知识点、40条关联关系的知识网络
- 支持按难度等级、知识类别筛选
- 节点颜色标识掌握度（绿色≥80%、红色<50%）
- 点击节点查看概念详解与学习建议

### 2. 苏格拉底式RAG智能问答
- 不直接给答案，通过提问引导自主思考
- 基于教材内容的RAG检索增强（16个教材片段）
- 回答附带引用来源标注
- 支持DeepSeek/硅基流动/OpenAI API接入
- 无API Key时自动切换演示模式

### 3. 科研文献探索
- 对接Semantic Scholar API（免费）
- 输入研究方向关键词检索全球学术论文
- 文献影响力与时效性可视化评估
- 一键跳转PDF原文

### 4. 学习仪表盘
- 六维知识掌握度雷达图
- 周学习活动柱状图
- 薄弱知识点识别与推荐学习路径
- 学习时长与问答互动统计

## 技术架构

| 层级 | 技术选型 |
|------|---------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| UI组件 | Tailwind CSS + shadcn/ui |
| 图谱可视化 | Cytoscape.js |
| 图表 | Recharts |
| 大模型API | DeepSeek / 硅基流动 / OpenAI |
| 文献API | Semantic Scholar API |
| 数据持久化 | 浏览器 localStorage |

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

构建完成后，`dist/` 目录即为可部署的静态文件。

## API配置

在"设置"页面配置大模型API Key：

- **DeepSeek**: https://platform.deepseek.com
- **硅基流动**: https://cloud.siliconflow.cn
- **OpenAI**: https://platform.openai.com

API Key仅存储在本地浏览器中，不会上传到任何服务器。

## 项目结构

```
src/
  components/
    ui/              # shadcn/ui 基础组件
    KnowledgeGraph.tsx    # 知识图谱可视化
    ChatAssistant.tsx     # AI辅导问答
    LiteratureExplorer.tsx # 文献探索
    Dashboard.tsx         # 学习仪表盘
    SettingsPanel.tsx     # 设置面板
  data/
    course-data.ts   # 课程知识图谱数据
    prompts.ts       # AI Prompt模板
  hooks/
    use-local-storage.ts  # localStorage Hook
  types/
    index.ts         # TypeScript类型定义
  App.tsx            # 主应用组件
  main.tsx           # 入口文件
```

## 创新点

1. **知识图谱 + 大模型融合**：不是简单调用ChatGPT，而是将课程知识网络与大模型结合，实现有结构的知识推理
2. **苏格拉底式辅导**：培养自主学习能力，而非被动接受答案
3. **学研一体**：从课程学习自然过渡到科研探索，打通"学-问-研"闭环
4. **可视化优先**：知识图谱和文献网络的可视化在答辩展示时极具冲击力

## 适用场景

- 课程复习与知识点梳理
- 考前薄弱点针对性突破
- 科研项目选题与文献调研
- 个性化学习路径规划

## 演示数据

当前试点课程为《数据结构》，包含：
- 6大知识类别：基础概念、线性结构、树形结构、图结构、排序算法、查找算法
- 35个核心知识点
- 40条知识关联关系
- 16个教材内容片段（用于RAG检索）

## 开发团队

天津大学智能感知工程专业

---

*本项目为天津大学"智创天大，智享未来"人工智能创新应用案例征集活动参赛作品。*
