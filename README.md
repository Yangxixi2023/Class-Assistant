# 智慧课堂 (Class Assistant)

> 基于 AI 的雨课堂实时课件解析助手 — 自动捕获课堂图片、智能分类、答题辅助、深度学习

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## 一分钟上手

> **已内置 API 配置，克隆后直接可用，无需任何额外设置。**

### 方式一：双击启动（推荐 Windows 用户）

```
1. 安装 Node.js 18+  →  https://nodejs.org/
2. 下载本项目（Clone 或 Download ZIP）
3. 双击「智慧课堂.exe」
4. 点击「启动」按钮
5. 在弹出的浏览器中登录雨课堂 → 完成！
```

> 首次运行会自动安装依赖（需要网络），之后秒开。

### 方式二：命令行启动

```bash
git clone https://github.com/Yangxixi2023/Class-assistent.git
cd Class-assistent
npm install                         # 安装依赖
npx playwright install chromium     # 安装浏览器（首次）
npm start                           # 启动
```

### 启动后会发生什么

| 自动打开的窗口 | 用途 |
|:---|:---|
| **http://127.0.0.1:3000** | 控制面板 — 查看解析结果、答题、提问 |
| **Chromium 浏览器** | 在这里登录雨课堂，然后正常上课即可 |

登录雨课堂后，程序会自动监听课堂内容。**不需要任何其他操作。**

---

## 功能概览

| 功能 | 说明 |
|:---|:---|
| **实时课件捕获** | 自动监控雨课堂页面，捕获课件图片 |
| **AI 智能解析** | 识别课件类型（内容讲解 / 选择题 / 填空题 / 主观题），给出结构化分析 |
| **快速 / 深度模式** | 快速模式秒出结果，深度模式更准确详细 |
| **答题辅助** | 选择题高亮正确选项、填空题/主观题给出参考答案 |
| **深度思考** | 对课件做知识点剖析、推导原理、典型考题分析 |
| **AI 对话** | 针对当前课件内容自由提问，支持补充背景信息 |
| **跟随课程** | 自动跟进最新课件，或停留当前页自主复习 |
| **哈希去重** | 翻页回看自动匹配已解析内容，不重复消耗额度 |
| **自适应布局** | 拖拽调整比例、面板最小化、布局互换 |

---

## 界面操作

| 操作 | 说明 |
|:---|:---|
| 顶部 **快速 / 深度** 按钮 | 切换解析模式 |
| **自动解析** 开关 | 新课件是否自动分析 |
| **跟随课程** 开关 | 是否自动跳到最新课件 |
| **解析此页** 按钮 | 手动触发当前页面解析 |
| **⇆** 按钮 | 课件区和解析区主次互换 |
| 拖动中间**分隔条** | 调整左右面板宽度 |
| 课件区域**滚轮** | 前后翻页切换幻灯片 |
| 解析面板 **─** 按钮 | 最小化 / 恢复面板 |
| **答案** 按钮 | 显示 / 隐藏参考答案 |
| **深度思考** 按钮 | 启动深入分析（需要更长时间） |
| **全屏** 按钮 | 全屏查看解析内容 |

---

## 自定义配置（可选）

默认配置已经可以直接使用。如果你想用自己的 API：

### 方法 1：在面板中修改

点击右上角 ⚙️ 设置 → 填入你的接口地址、密钥、模型 → 保存 → 重启

### 方法 2：编辑配置文件

复制 `.env.example` 为 `.env`，修改其中的值：

```env
# 接口地址（中转站填完整路径含 /v1）
OPENAI_BASE_URL=https://api.nuoda.vip/v1

# 密钥
OPENAI_API_KEY=sk-your-key-here
OPENAI_API_KEY_FAST=sk-your-fast-key-here    # 可选，留空则用主密钥

# 模型
OPENAI_MODEL=claude-sonnet-4-6               # 默认模型
OPENAI_MODEL_FAST=claude-haiku-4-5-20251001  # 快速模式
OPENAI_MODEL_DEEP=claude-sonnet-4-6          # 深度模式
```

> `.env` 文件不会被上传到 GitHub。如果没有 `.env`，程序自动使用内置的 `.env.default`。

### 支持的模型

通过 OpenAI 兼容接口调用，支持任意模型：
- **Claude**: `claude-haiku-4-5-20251001`、`claude-sonnet-4-6`、`claude-opus-4-6` 等
- **GPT**: `gpt-4o-mini`、`gpt-5.2`、`gpt-5.4` 等
- 其他 OpenAI API 兼容的模型

---

## 常见问题

<details>
<summary><b>Q: 启动后浏览器没弹出来？</b></summary>

检查终端输出是否有 Playwright 相关错误。运行 `npx playwright install chromium` 重新安装浏览器。
</details>

<details>
<summary><b>Q: 解析失败 / 报错 500？</b></summary>

通常是 API Key 对某个模型没有权限。在设置中切换到有权限的模型，或更换 Key。
</details>

<details>
<summary><b>Q: 怎么只用面板不开浏览器？</b></summary>

在 `.env` 中设置 `DISABLE_BROWSER_MONITOR=true`，然后重启。
</details>

<details>
<summary><b>Q: 下次启动还要重新登录吗？</b></summary>

不需要。浏览器登录状态保存在 `data/browser/` 目录，会自动保持。
</details>

---

## 项目结构

```
├── 智慧课堂.exe                # Windows GUI 启动器（双击即用）
├── launcher.cs                # 启动器源码（C# WinForms）
├── .env.default               # 内置默认配置（可直接使用）
├── src/
│   ├── server.js              # Express + SSE + API
│   ├── config.js              # 配置加载（.env → .env.default 回退）
│   ├── app-state.js           # 全局状态 + 实时广播
│   └── services/
│       ├── model-service.js       # AI 调用（多 key / 多模型）
│       ├── capture-pipeline.js    # 图片去重 + 分析队列 + 自动重试
│       └── monitor-service.js     # Playwright 浏览器监控
├── public/
│   ├── index.html             # 面板 UI
│   ├── app.js                 # 前端交互逻辑
│   └── assets/                # 图标、插画素材
└── data/
    ├── captures/              # 捕获的课件图片
    └── browser/               # 浏览器持久化数据
```

## 开发

```bash
npm run dev    # 文件变动自动重启
```

## 注意事项

- 本工具**仅供辅助学习**，请勿在考试中使用
- API Key 仅保存在本地，不会上传到任何服务器
- 浏览器数据保存在 `data/browser/`，支持登录状态持久化

## License

MIT
