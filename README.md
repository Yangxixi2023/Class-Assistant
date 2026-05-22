# 智慧课堂 (Class Assistant)

> 基于 AI 的雨课堂实时课件解析助手 — 自动捕获课堂图片、智能分类解析、支持答题和深度学习

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## 功能特性

- **实时课件捕获** — 通过 Playwright 自动监控雨课堂页面，捕获课件图片
- **AI 智能解析** — 自动识别课件类型（课件内容 / 选择题 / 填空题 / 主观题），给出结构化分析
- **快速 / 深度模式** — 快速模式用轻量模型实时解析，深度模式用强模型详细分析
- **答题辅助** — 选择题高亮答案、填空题参考答案、主观题范文，支持一键提交到雨课堂
- **深度思考** — 对任意课件内容进行深入的知识剖析
- **AI 对话** — 对当前课件内容自由提问，支持上下文和背景信息
- **跟随课程** — 自动切换到最新课件，或停留在当前页面自主复习
- **自适应布局** — 左右拖拽调整课件 / 解析比例，面板最小化，布局互换
- **哈希去重** — 翻页回看时自动匹配已解析的内容，不重复消耗额度

## 快速开始

### 环境要求

- **Node.js 18+**（推荐 20+）
- Windows / macOS / Linux

### 三步启动

```bash
# 1. 克隆并安装
git clone https://github.com/Yangxixi2023/Class-assistent.git
cd Class-assistent
npm install

# 2. 安装浏览器（首次需要）
npx playwright install chromium

# 3. 启动！
npm start
```

启动后会自动打开两个窗口：

| 窗口 | 说明 |
|------|------|
| http://127.0.0.1:3000 | 控制面板 — 查看解析、提问、答题 |
| Chromium 浏览器 | 在这里登录雨课堂，然后正常上课 |

> **已内置默认 API 配置，无需额外设置即可使用。**
> 如需自定义模型或密钥，可在面板右上角「设置」中修改，或编辑 `.env` 文件。

## 使用说明

1. 启动程序，在弹出的浏览器中**登录雨课堂**
2. 进入课堂后，程序**自动捕获**课件图片并分析
3. 左侧显示当前课件，右侧显示 AI 解析
4. 如果是**选择题 / 填空题**，可选择答案并提交到雨课堂
5. 点击「深度思考」获取更详细的知识分析
6. 在「提问」区自由提问

### 界面操作

| 操作 | 说明 |
|------|------|
| **快速 / 深度** 按钮 | 切换解析模式 |
| **自动解析** 开关 | 新课件是否自动分析 |
| **跟随课程** 开关 | 是否自动跳到最新课件 |
| **解析此页** 按钮 | 手动触发解析 |
| **⇆ 布局** 按钮 | 课件区和解析区互换 |
| 拖动中间**分隔条** | 调整左右宽度 |
| 在课件区**滚轮** | 翻页切换幻灯片 |

## 自定义配置

复制 `.env.example` 为 `.env`，按注释修改：

```env
# API 地址和密钥
OPENAI_BASE_URL=https://api.nuoda.vip/v1
OPENAI_API_KEY=你的主密钥
OPENAI_API_KEY_FAST=你的快速模型密钥（可选，留空则用主密钥）

# 模型名称
OPENAI_MODEL=claude-sonnet-4-6
OPENAI_MODEL_FAST=claude-haiku-4-5-20251001
OPENAI_MODEL_DEEP=claude-sonnet-4-6
```

也可以在面板「设置」中直接配置，保存后重启生效。

### 支持的模型

通过 OpenAI 兼容接口，支持任意模型：

- **Claude**: `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-6` 等
- **GPT**: `gpt-4o-mini`, `gpt-5.2`, `gpt-5.4` 等
- 任何 OpenAI API 兼容接口的模型

## 项目结构

```
├── src/
│   ├── server.js              # Express 服务 + SSE + API 路由
│   ├── config.js              # 配置读取
│   ├── app-state.js           # 全局状态 + 实时广播
│   └── services/
│       ├── model-service.js       # AI 调用（多 key / 多模型）
│       ├── capture-pipeline.js    # 图片去重 + 队列 + 重试
│       └── monitor-service.js     # Playwright 浏览器监控
├── public/
│   ├── index.html             # 面板 UI
│   ├── app.js                 # 前端逻辑
│   └── assets/                # 图标、插画
├── data/
│   ├── captures/              # 捕获的图片（自动生成）
│   └── browser/               # 浏览器数据（保持登录状态）
├── .env.example               # 配置模板
└── package.json
```

## 开发模式

```bash
npm run dev    # 文件变动自动重启
```

## 注意事项

- 本工具**仅用于辅助学习**，请勿在考试中使用
- API Key 仅保存在本地 `.env` 文件中，不会上传
- 浏览器登录状态保存在 `data/browser/`，下次启动无需重新登录
- 可通过 `DISABLE_BROWSER_MONITOR=true` 仅启动面板（不打开浏览器）

## License

MIT
