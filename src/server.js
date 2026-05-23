import fs from 'fs/promises';
import http from 'http';
import path from 'path';

import express from 'express';
import open from 'open';

import { AppState } from './app-state.js';
import { config } from './config.js';
import { CapturePipeline } from './services/capture-pipeline.js';
import { ModelService } from './services/model-service.js';
import { MonitorService } from './services/monitor-service.js';

async function ensureDirectories() {
  await fs.mkdir(config.captureDir, { recursive: true });
  await fs.mkdir(config.browserDataDir, { recursive: true });
}

async function main() {
  await ensureDirectories();

  const app = express();
  const server = http.createServer(app);
  const state = new AppState(config);
  const modelService = new ModelService(config);
  const capturePipeline = new CapturePipeline(config, state, modelService);
  const monitorService = new MonitorService(config, state, capturePipeline);

  app.use(express.json());
  app.use(express.static(config.publicDir));
  app.use('/captures', express.static(config.captureDir));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, now: new Date().toISOString() });
  });

  app.get('/api/state', (_req, res) => {
    res.json(state.snapshot());
  });

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });

    res.write(`data: ${JSON.stringify(state.snapshot())}\n\n`);
    state.subscribe(res);

    req.on('close', () => {
      state.unsubscribe(res);
    });
  });

  app.post('/api/auto-analyze', (req, res) => {
    const { enabled, mode } = req.body;
    if (enabled !== undefined) {
      state.setAutoAnalyze(Boolean(enabled));
      capturePipeline.setAutoAnalyze(Boolean(enabled));
    }
    if (mode) {
      state.setAnalyzeMode(mode);
      capturePipeline.setAnalyzeMode(mode);
    }
    res.json({ ok: true, autoAnalyze: state.state.status.autoAnalyze, mode: state.state.status.analyzeMode });
  });

  app.get('/api/current-models', (_req, res) => {
    res.json({ ok: true, ...modelService.getCurrentModels() });
  });

  app.post('/api/switch-model', (req, res) => {
    const { fast, deep } = req.body;
    modelService.setModels({ fast, deep });
    const current = modelService.getCurrentModels();
    state.setStatus({ modelFast: current.fast, modelDeep: current.deep });
    res.json({ ok: true, ...current });
  });

  app.post('/api/analyze-current', async (req, res) => {
    const { mode } = req.body || {};
    try {
      await monitorService.triggerManualCapture(mode || state.state.status.analyzeMode || 'fast');
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/deep-think', async (req, res) => {
    const { captureId } = req.body;
    const capture = state.findCapture(captureId);
    if (!capture) {
      return res.status(404).json({ ok: false, error: '未找到对应内容' });
    }

    try {
      state.updateCapture(captureId, { deepThinkStatus: 'thinking' });
      const result = await modelService.deepThink({
        imageUrl: capture.url,
        contextMarkdown: capture.renderedMarkdown
      });
      const { marked } = await import('marked');
      const renderedHtml = marked.parse(result.replace(/<script[\s\S]*?<\/script>/gi, ''));
      state.updateCapture(captureId, {
        deepThinkStatus: 'done',
        deepThinkMarkdown: result,
        deepThinkHtml: renderedHtml
      });
      res.json({ ok: true, markdown: result, html: renderedHtml });
    } catch (error) {
      state.updateCapture(captureId, { deepThinkStatus: 'error' });
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const { captureId, messages, background } = req.body;
    const capture = captureId ? state.findCapture(captureId) : null;

    try {
      const reply = await modelService.chat({
        messages: messages || [],
        imageUrl: capture?.url,
        contextMarkdown: capture?.renderedMarkdown,
        background: background || ''
      });
      res.json({ ok: true, reply });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/submit-answer', async (req, res) => {
    const { captureId, answerType, answers } = req.body;
    try {
      await monitorService.submitAnswer({ captureId, answerType, answers });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/relogin', async (_req, res) => {
    try {
      await monitorService.relogin();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      baseUrl: config.openaiBaseUrl,
      model: config.openaiModel,
      modelFast: config.openaiModelFast,
      modelDeep: config.openaiModelDeep,
      hasKey: Boolean(config.openaiApiKey)
    });
  });

  app.get('/api/models', async (_req, res) => {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({
        apiKey: config.openaiApiKey,
        baseURL: config.openaiBaseUrl || undefined
      });
      const list = await client.models.list();
      const models = [];
      for await (const model of list) {
        models.push(model.id);
      }
      models.sort();
      res.json({ ok: true, models });
    } catch (error) {
      res.json({ ok: false, models: [], error: error.message });
    }
  });

  app.post('/api/config', async (req, res) => {
    const { baseUrl, apiKey, model, modelFast, modelDeep } = req.body;
    try {
      const envPath = path.join(config.rootDir, '.env');
      let envContent = await fs.readFile(envPath, 'utf-8').catch(() => '');

      const upsert = (key, val) => {
        if (val === undefined) return;
        const re = new RegExp(`^${key}=.*$`, 'm');
        if (re.test(envContent)) {
          envContent = envContent.replace(re, `${key}=${val}`);
        } else {
          envContent += `\n${key}=${val}`;
        }
      };

      upsert('OPENAI_BASE_URL', baseUrl);
      if (apiKey && apiKey !== '') upsert('OPENAI_API_KEY', apiKey);
      upsert('OPENAI_MODEL', model);
      upsert('OPENAI_MODEL_FAST', modelFast);
      upsert('OPENAI_MODEL_DEEP', modelDeep);

      await fs.writeFile(envPath, envContent.trim() + '\n', 'utf-8');

      res.json({ ok: true, message: '配置已保存，重启后生效。' });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/test-connection', async (req, res) => {
    const { baseUrl, apiKey, model } = req.body;
    try {
      const { default: OpenAI } = await import('openai');
      const testClient = new OpenAI({
        apiKey: apiKey || config.openaiApiKey,
        baseURL: baseUrl || config.openaiBaseUrl || undefined
      });
      const completion = await testClient.chat.completions.create({
        model: model || config.openaiModel,
        messages: [{ role: 'user', content: '回复"连接成功"两个字即可' }],
        max_tokens: 20
      });
      const reply = completion.choices?.[0]?.message?.content || '';
      res.json({ ok: true, reply });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(config.publicDir, 'index.html'));
  });

  server.listen(config.port, async () => {
    const dashboardUrl = `http://127.0.0.1:${config.port}`;
    state.addLog(`面板已启动：${dashboardUrl}`);

    if (config.autoOpenDashboard) {
      await open(dashboardUrl).catch(() => {
        state.addLog('自动打开本地面板失败，请手动访问面板地址。', 'warn');
      });
    }

    if (config.disableBrowserMonitor) {
      state.setStatus({ browserState: 'disabled' });
      state.addLog('已跳过浏览器监听，当前运行在仅面板模式。');
      return;
    }

    try {
      await monitorService.start();
    } catch (error) {
      state.setStatus({ browserState: 'error' });
      state.addLog(
        `浏览器监听启动失败：${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    }
  });

  const shutdown = async () => {
    state.addLog('正在关闭服务...');
    await monitorService.stop().catch(() => {});
    server.close(() => { process.exit(0); });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
