(function() {
  'use strict';

  var markedLib = window.marked || { parse: function(s) { return s; } };
  var $ = function(s) { return document.querySelector(s); };
  var $$ = function(s) { return document.querySelectorAll(s); };

  // ── DOM references ──
  var els = {
    slideDisplay: $('#slide-display'),
    slideNav: $('#slide-nav'),
    navStatus: $('#nav-status'),
    statusText: $('#status-text'),
    analysisBody: $('#analysis-body'),
    chatMessages: $('#chat-messages'),
    chatInput: $('#chat-input'),
    fullscreenModal: $('#fullscreen-modal'),
    modalTitle: $('#modal-title'),
    modalBody: $('#modal-body'),
    settingsModal: $('#settings-modal'),
    testMsg: $('#test-msg'),
    workspace: $('.workspace'),
    sidePanel: $('#side-panel')
  };

  // ── State ──
  var state = {
    snapshot: null,
    focusedId: null,
    autoAnalyze: true,
    followLatest: true,
    analyzeMode: 'fast',
    chatHistory: [],
    chatLoading: false,
    layoutSwapped: false,
    analysisMinimized: false,
    chatMinimized: false
  };

  // ── Utilities ──
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseMd(s) {
    try { return markedLib.parse(s || ''); } catch(e) { return esc(s); }
  }

  function showToast(msg, onClick) {
    var existing = document.querySelector('.toast-notify');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'toast-notify';
    el.innerHTML = '<span>' + esc(msg) + '</span><button class="toast-btn">查看</button>';
    document.body.appendChild(el);
    el.querySelector('.toast-btn').addEventListener('click', function() {
      el.remove();
      if (onClick) onClick();
    });
    setTimeout(function() { if (el.parentNode) el.remove(); }, 6000);
  }

  // ── Main render ──
  function render(snap) {
    state.snapshot = snap;
    renderStatus(snap.status);

    var captures = snap.captures
      .filter(function(c) { return c.status !== 'queued'; })
      .sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });

    var latestUpdated = captures.slice().sort(function(a, b) {
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    })[0];

    if (latestUpdated && !state.focusedId) {
      state.focusedId = latestUpdated.id;
    }
    var isNewCapture = latestUpdated && state._lastCaptureCount !== undefined && captures.length > state._lastCaptureCount;
    if (isNewCapture && state.followLatest) {
      state.focusedId = latestUpdated.id;
    }
    if (isNewCapture && !state.followLatest) {
      showToast('新课件已捕获，点击缩略图查看', function() {
        state.focusedId = latestUpdated.id;
        render(snap);
      });
    }
    state._lastCaptureCount = captures.length;

    var focused = captures.find(function(c) { return c.id === state.focusedId; }) || latestUpdated || null;
    if (focused) state.focusedId = focused.id;

    renderSlide(focused);
    renderNav(captures, focused);
    renderAnalysis(focused);

    var btn = $('#btn-auto-analyze');
    if (snap.status.autoAnalyze) {
      btn.classList.add('active');
      state.autoAnalyze = true;
    } else {
      btn.classList.remove('active');
      state.autoAnalyze = false;
    }

    renderModeButtons();
  }

  function renderModeButtons() {
    var btns = $$('.mode-btn');
    btns.forEach(function(b) {
      if (b.dataset.mode === state.analyzeMode) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    // Update model name indicator
    var modelEl = $('#current-model-name');
    if (modelEl && state.models) {
      var m = state.analyzeMode === 'deep' ? state.models.deep : state.models.fast;
      modelEl.textContent = m || '--';
    }
  }

  function loadCurrentModels() {
    fetch('/api/current-models')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          state.models = { fast: d.fast, deep: d.deep };
          renderModeButtons();
        }
      })
      .catch(function() {});
  }

  // ── Status ──
  function renderStatus(status) {
    var dot = els.navStatus.querySelector('.status-dot');
    var map = {
      running: '课堂进行中',
      'waiting-login': '请登录雨课堂',
      starting: '启动中',
      error: '连接异常',
      disabled: '仅面板模式'
    };

    var statusText = map[status.browserState] || '准备就绪';
    if (status.queueSize > 0) {
      statusText += ' · 队列 ' + status.queueSize;
    }
    els.statusText.textContent = statusText;

    if (status.browserState === 'running') dot.style.background = 'var(--green)';
    else if (status.browserState === 'waiting-login') dot.style.background = 'var(--amber)';
    else if (status.browserState === 'error') dot.style.background = 'var(--red)';
    else dot.style.background = 'var(--text-3)';
  }

  // ── Slide display ──
  function renderSlide(capture) {
    if (!capture) {
      els.slideDisplay.innerHTML = '<div class="slide-placeholder"><img src="/assets/empty-state.png" alt="" style="width:160px;height:160px;opacity:0.5" /><span>等待课件载入</span></div>';
      return;
    }
    els.slideDisplay.innerHTML = '<img src="' + capture.webPath + '" alt="" />';
  }

  // ── Thumbnail nav ──
  function renderNav(captures, focused) {
    if (captures.length === 0) {
      els.slideNav.innerHTML = '';
      return;
    }
    els.slideNav.innerHTML = captures.map(function(c, i) {
      var activeClass = (focused && c.id === focused.id) ? ' active' : '';
      var statusIndicator = '';
      if (c.status === 'analyzing' || c.status === 'retrying') {
        statusIndicator = '<span class="thumb-status analyzing"></span>';
      } else if (c.status === 'error') {
        statusIndicator = '<span class="thumb-status error"></span>';
      }
      return '<div class="thumb' + activeClass + '" data-id="' + c.id + '">' +
        '<img src="' + c.webPath + '" alt="" />' +
        '<span class="thumb-index">' + (i + 1) + '</span>' +
        statusIndicator +
        '</div>';
    }).join('');
  }

  // ── Analysis panel ──
  var lastRenderedAnalysis = { id: null, status: null, dt: null };

  function renderAnalysis(capture) {
    if (!capture || capture.status === 'captured') {
      lastRenderedAnalysis = { id: null, status: null, dt: null };
      els.analysisBody.innerHTML = '<div class="panel-welcome"><p>点击「解析此页」分析当前课件</p></div>';
      return;
    }

    var dtStatus = capture.deepThinkStatus || '';
    if (capture.status === 'done' && lastRenderedAnalysis.id === capture.id && lastRenderedAnalysis.status === 'done' && lastRenderedAnalysis.dt === dtStatus) {
      return;
    }

    lastRenderedAnalysis = { id: capture.id, status: capture.status, dt: dtStatus };

    if (capture.status === 'analyzing') {
      var attempt = capture.attemptCount || 1;
      var max = capture.maxAttempts || 3;
      var steps = '';
      for (var s = 1; s <= 3; s++) {
        var cls = s < attempt ? 'done' : (s === attempt ? 'active' : '');
        steps += '<span class="progress-step ' + cls + '"></span>';
      }
      els.analysisBody.innerHTML =
        '<div class="analysis-progress">' +
          '<div class="progress-ring"></div>' +
          '<div class="progress-text">正在分析课件内容</div>' +
          '<div class="progress-sub">AI 模型识别中，通常需要 3-8 秒</div>' +
          '<div class="progress-steps">' + steps + '</div>' +
        '</div>';
      return;
    }

    if (capture.status === 'retrying') {
      var retryMsg = capture.error ? ('上次失败: ' + capture.error) : '正在重试...';
      els.analysisBody.innerHTML =
        '<div class="analysis-progress">' +
          '<div class="progress-ring"></div>' +
          '<div class="progress-text">正在重新分析 (第 ' + (capture.attemptCount || 1) + ' 次)</div>' +
          '<div class="progress-sub">' + esc(retryMsg) + '</div>' +
        '</div>';
      return;
    }

    if (capture.status === 'error') {
      els.analysisBody.innerHTML =
        '<div class="card" style="margin:16px 0">' +
          '<h4>解析失败</h4>' +
          '<p class="prose">' + esc(capture.error) + '</p>' +
          '<button class="btn outline sm" style="margin-top:10px" data-do="retry" data-id="' + capture.id + '">重试</button>' +
        '</div>';
      return;
    }

    if (capture.status !== 'done') {
      els.analysisBody.innerHTML = '<div class="analysis-progress"><div class="progress-ring"></div><div class="progress-text">处理中...</div></div>';
      return;
    }

    var catColors = { 1: 'blue', 2: 'green', 3: 'amber', 4: 'red' };
    var html = '<div class="a-header">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<h3>' + esc(capture.title || '分析结果') + '</h3>' +
      '<span class="tag ' + (catColors[capture.categoryId] || 'blue') + '">' + esc(capture.categoryName) + '</span>' +
      '</div>' +
      '<div class="a-actions">' +
      '<button class="a-btn" data-do="deep-think" data-id="' + capture.id + '">深度思考</button>' +
      '<button class="a-btn" data-do="fullscreen" data-id="' + capture.id + '">全屏</button>' +
      '</div>' +
      '</div>';

    switch (capture.categoryId) {
      case 1: html += buildLecture(capture); break;
      case 2: html += buildChoice(capture); break;
      case 3: html += buildFill(capture); break;
      case 4: html += buildSubjective(capture); break;
      default: html += '<div class="prose">' + (capture.renderedHtml || '') + '</div>';
    }

    if (capture.deepThinkStatus === 'thinking') {
      html += '<div class="analysis-progress" style="padding:16px"><div class="progress-ring" style="width:28px;height:28px;border-width:2px"></div><div class="progress-text" style="font-size:12px">深度思考中，请稍候...</div></div>';
    } else if (capture.deepThinkHtml) {
      html += '<div class="card"><h4>深度思考</h4><div class="prose">' + capture.deepThinkHtml + '</div></div>';
    }

    els.analysisBody.innerHTML = html;
    els.analysisBody.scrollTop = 0;
  }

  // ── Build helpers ──
  function diffDots(n) {
    n = Math.min(5, Math.max(1, n || 3));
    var dots = '';
    for (var i = 0; i < 5; i++) {
      dots += '<span class="diff-dot' + (i < n ? ' on' : '') + '"></span>';
    }
    return '<div class="diff-row"><span>难度</span><div class="diff-dots">' + dots + '</div></div>';
  }

  function kpTags(pts) {
    if (!pts || !pts.length) return '';
    return '<div class="kp-row">' + pts.map(function(p) { return '<span class="kp">' + esc(p) + '</span>'; }).join('') + '</div>';
  }

  function buildLecture(c) {
    var p = c.payload || {};
    var h = '';

    if (c.renderedHtml) {
      h += '<div class="card"><div class="prose">' + c.renderedHtml + '</div></div>';
    }

    if (p.coreConcepts && p.coreConcepts.length) {
      h += '<div class="card"><h4>核心概念</h4>';
      for (var i = 0; i < p.coreConcepts.length; i++) {
        var cc = p.coreConcepts[i];
        h += '<p class="prose"><strong>' + esc(cc.name || '') + '：</strong>' + esc(cc.explanation || '') + '</p>';
      }
      h += '</div>';
    }

    if (p.connections && p.connections.length) {
      h += '<div class="card"><h4>知识关联</h4><ul class="prose">' +
        p.connections.map(function(x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ul></div>';
    }
    if (p.examTips && p.examTips.length) {
      h += '<div class="card"><h4>考试提示</h4><ul class="prose">' +
        p.examTips.map(function(x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ul></div>';
    }
    return h;
  }

  function buildChoice(c) {
    var p = c.payload || {};
    var opts = p.options || [];
    var answers = p.answers || [];
    var h = diffDots(p.difficulty);

    if (p.questionStem) {
      h += '<div class="q-stem">' + esc(p.questionStem) + '</div>';
    }

    h += '<div class="opt-list" data-cid="' + c.id + '">';
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      h += '<button class="opt" data-key="' + esc(o.key) + '">' +
        '<span class="opt-key">' + esc(o.key) + '</span>' +
        '<span class="opt-text">' + esc(o.text) + '</span>' +
        '</button>';
    }
    h += '</div>';

    h += '<div class="submit-row">' +
      '<button class="btn primary sm" data-do="submit" data-cid="' + c.id + '" data-type="choice">提交</button>' +
      '<button class="btn outline sm" data-do="reveal" data-cid="' + c.id + '">答案</button>' +
      '<span class="hint">选择后提交到雨课堂</span>' +
      '</div>';

    if (answers.length) {
      h += '<div class="answer-box" data-ans="' + c.id + '" style="display:none"><h5>参考答案</h5><p>' + answers.join(', ') + '</p></div>';
    }

    if (p.explanation) {
      h += '<div class="explain-box"><h5>解析</h5><div class="prose">' + parseMd(p.explanation) + '</div></div>';
    }

    h += kpTags(p.knowledgePoints);
    return h;
  }

  function buildFill(c) {
    var p = c.payload || {};
    var blanks = p.blanks || [];
    var h = diffDots(p.difficulty);

    if (p.questionStem) {
      h += '<div class="q-stem">' + esc(p.questionStem) + '</div>';
    }

    h += '<div data-blanks="' + c.id + '">';
    var count = Math.max(blanks.length, 1);
    for (var i = 0; i < count; i++) {
      h += '<div class="blank-row"><span class="blank-label">空 ' + (i + 1) + '</span><input class="blank-input" data-idx="' + i + '" placeholder="填写..." /></div>';
    }
    h += '</div>';

    h += '<div class="submit-row">' +
      '<button class="btn primary sm" data-do="submit" data-cid="' + c.id + '" data-type="fill">提交</button>' +
      '<button class="btn outline sm" data-do="reveal" data-cid="' + c.id + '">答案</button>' +
      '</div>';

    var ans = blanks.map(function(b) { return b.answer; }).filter(Boolean);
    if (ans.length) {
      h += '<div class="answer-box" data-ans="' + c.id + '" style="display:none"><h5>参考答案</h5><p>' + ans.join(' | ') + '</p></div>';
    }

    if (p.explanation) {
      h += '<div class="explain-box"><h5>解析</h5><div class="prose">' + parseMd(p.explanation) + '</div></div>';
    }

    h += kpTags(p.knowledgePoints);
    return h;
  }

  function buildSubjective(c) {
    var p = c.payload || {};
    var h = diffDots(p.difficulty);

    if (p.questionStem) {
      h += '<div class="q-stem">' + esc(p.questionStem) + '</div>';
    }

    h += '<textarea class="subj-textarea" data-subj="' + c.id + '" placeholder="输入答案..."></textarea>';

    h += '<div class="submit-row">' +
      '<button class="btn primary sm" data-do="submit" data-cid="' + c.id + '" data-type="subjective">提交</button>' +
      '<button class="btn outline sm" data-do="reveal" data-cid="' + c.id + '">参考答案</button>' +
      '</div>';

    if (p.sampleAnswer) {
      h += '<div class="answer-box" data-ans="' + c.id + '" style="display:none"><h5>参考答案</h5><div class="prose">' + parseMd(p.sampleAnswer) + '</div></div>';
    }

    if (p.keyPoints && p.keyPoints.length) {
      h += '<div class="explain-box"><h5>得分点</h5><ul class="prose">' +
        p.keyPoints.map(function(x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ul></div>';
    }

    if (p.explanation) {
      h += '<div class="explain-box"><h5>答题思路</h5><div class="prose">' + parseMd(p.explanation) + '</div></div>';
    }

    h += kpTags(p.knowledgePoints);
    return h;
  }

  // ── Chat rendering ──
  function renderChat() {
    if (!state.chatHistory.length) {
      els.chatMessages.innerHTML = '<div class="chat-bubble system">对当前课件有疑问？直接问我吧</div>';
      return;
    }
    els.chatMessages.innerHTML = state.chatHistory.map(function(m) {
      if (m.role === 'user') {
        return '<div class="chat-bubble user">' + esc(m.content) + '</div>';
      }
      return '<div class="chat-bubble assistant"><div class="prose">' + parseMd(m.content) + '</div></div>';
    }).join('');
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function appendBubble(cls, text) {
    var d = document.createElement('div');
    d.className = 'chat-bubble ' + cls;
    d.textContent = text;
    els.chatMessages.appendChild(d);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function removeBubble(cls) {
    var el = els.chatMessages.querySelector('.chat-bubble.' + cls);
    if (el) el.remove();
  }

  // ── Chat send ──
  function sendChat() {
    var input = els.chatInput;
    var text = input.value.trim();
    if (!text || state.chatLoading) return;
    input.value = '';

    state.chatHistory.push({ role: 'user', content: text });
    renderChat();
    state.chatLoading = true;
    appendBubble('thinking', '思考中...');

    var bg = $('#chat-background') ? ($('#chat-background').value || '').trim() : '';
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        captureId: state.focusedId,
        messages: state.chatHistory,
        background: bg
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      removeBubble('thinking');
      state.chatHistory.push({ role: 'assistant', content: d.ok ? d.reply : ('错误: ' + d.error) });
      state.chatLoading = false;
      renderChat();
    })
    .catch(function(e) {
      removeBubble('thinking');
      state.chatHistory.push({ role: 'assistant', content: '请求失败: ' + e.message });
      state.chatLoading = false;
      renderChat();
    });
  }

  // ── Settings ──
  function loadCfg() {
    fetch('/api/config')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.baseUrl) $('#cfg-url').value = d.baseUrl;
        if (d.model) $('#cfg-model').value = d.model;
        if (d.modelFast) { var el = $('#cfg-model-fast'); if (el) el.value = d.modelFast; }
        if (d.modelDeep) { var el = $('#cfg-model-deep'); if (el) el.value = d.modelDeep; }
      })
      .catch(function() {});

    loadAvailableModels();
  }

  function loadAvailableModels() {
    fetch('/api/models')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.ok || !d.models || !d.models.length) return;
        renderModelSuggestions(d.models);
      })
      .catch(function() {});
  }

  function renderModelSuggestions(models) {
    var containers = ['cfg-model', 'cfg-model-fast', 'cfg-model-deep'];
    containers.forEach(function(inputId) {
      var input = $('#' + inputId);
      if (!input) return;

      var existing = input.parentElement.querySelector('.model-suggestions');
      if (existing) existing.remove();

      var wrap = document.createElement('div');
      wrap.className = 'model-suggestions';
      wrap.innerHTML = '<small style="margin-top:6px;display:block;color:var(--text-3)">可用模型：</small>' +
        '<div class="model-chips">' +
        models.map(function(m) {
          return '<button type="button" class="model-chip" data-model="' + esc(m) + '">' + esc(m) + '</button>';
        }).join('') +
        '</div>';
      input.parentElement.appendChild(wrap);
    });
  }

  // ── Layout swap ──
  function toggleLayout() {
    state.layoutSwapped = !state.layoutSwapped;
    els.workspace.classList.toggle('layout-swapped', state.layoutSwapped);
  }

  // ── Panel minimize ──
  function toggleMinimize(panel) {
    var section;
    if (panel === 'analysis') {
      section = $('.analysis-section');
      state.analysisMinimized = !state.analysisMinimized;
      section.classList.toggle('minimized', state.analysisMinimized);
    } else if (panel === 'chat') {
      section = $('.chat-section');
      state.chatMinimized = !state.chatMinimized;
      section.classList.toggle('minimized', state.chatMinimized);
    }
  }

  // ── Panel resize ──
  function initPanelResize() {
    var handle = $('#panel-resize-handle');
    if (!handle) return;

    var dragging = false;
    var startY = 0;
    var analysisSection = $('.analysis-section');
    var chatSection = $('.chat-section');
    var startAnalysisH = 0;

    handle.addEventListener('mousedown', function(e) {
      dragging = true;
      startY = e.clientY;
      startAnalysisH = analysisSection.offsetHeight;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var diff = e.clientY - startY;
      var newH = Math.max(80, startAnalysisH + diff);
      var containerH = els.sidePanel.offsetHeight - handle.offsetHeight;
      var maxH = containerH - 120;
      newH = Math.min(newH, maxH);
      analysisSection.style.flex = '0 0 ' + newH + 'px';
      chatSection.style.flex = '1';
    });

    document.addEventListener('mouseup', function() {
      if (dragging) {
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // ── Horizontal workspace resize ──
  function initWorkspaceResize() {
    var handle = $('#workspace-resize-handle');
    if (!handle) return;

    var dragging = false;
    var startX = 0;
    var slideStage = $('.slide-stage');
    var sidePanel = els.sidePanel;
    var startSlideW = 0;

    handle.addEventListener('mousedown', function(e) {
      dragging = true;
      startX = e.clientX;
      startSlideW = slideStage.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var diff = e.clientX - startX;
      if (els.workspace.classList.contains('layout-swapped')) diff = -diff;
      var containerW = els.workspace.offsetWidth - handle.offsetWidth;
      var newW = Math.max(300, Math.min(startSlideW + diff, containerW - 280));
      slideStage.style.flex = '0 0 ' + newW + 'px';
      sidePanel.style.flex = '1';
      sidePanel.style.width = 'auto';
    });

    document.addEventListener('mouseup', function() {
      if (dragging) {
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // ── Mouse wheel slide navigation ──
  function initWheelNavigation() {
    els.slideDisplay.addEventListener('wheel', function(e) {
      if (!state.snapshot || !state.snapshot.captures) return;
      e.preventDefault();

      var captures = state.snapshot.captures
        .filter(function(c) { return c.status !== 'queued'; })
        .sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });

      if (captures.length < 2) return;

      var currentIdx = captures.findIndex(function(c) { return c.id === state.focusedId; });
      if (currentIdx === -1) return;

      var next;
      if (e.deltaY > 0) {
        next = Math.min(currentIdx + 1, captures.length - 1);
      } else {
        next = Math.max(currentIdx - 1, 0);
      }

      if (next !== currentIdx) {
        state.focusedId = captures[next].id;
        render(state.snapshot);
        // Scroll thumbnail into view
        var activeThumb = els.slideNav.querySelector('.thumb.active');
        if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, { passive: false });
  }

  // ── Event delegation ──
  document.addEventListener('click', function(e) {
    var t = e.target;

    // Thumbnail click
    var thumb = t.closest('.thumb');
    if (thumb) {
      state.focusedId = thumb.dataset.id;
      render(state.snapshot);
      return;
    }

    // Mode toggle buttons
    var modeBtn = t.closest('.mode-btn');
    if (modeBtn) {
      state.analyzeMode = modeBtn.dataset.mode || 'fast';
      renderModeButtons();
      return;
    }

    // Option click (choice questions)
    var opt = t.closest('.opt');
    if (opt) {
      opt.classList.toggle('selected');
      return;
    }

    // Auto analyze toggle
    if (t.closest('#btn-auto-analyze')) {
      state.autoAnalyze = !state.autoAnalyze;
      $('#btn-auto-analyze').classList.toggle('active', state.autoAnalyze);
      fetch('/api/auto-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: state.autoAnalyze, mode: state.analyzeMode })
      });
      return;
    }

    // Follow latest toggle
    if (t.closest('#btn-follow-latest')) {
      state.followLatest = !state.followLatest;
      $('#btn-follow-latest').classList.toggle('active', state.followLatest);
      return;
    }

    // Manual analyze
    if (t.closest('#btn-manual-analyze')) {
      var analyzeBtn = t.closest('#btn-manual-analyze') || t;
      analyzeBtn.style.pointerEvents = 'none';
      analyzeBtn.style.opacity = '0.5';
      setTimeout(function() { analyzeBtn.style.pointerEvents = ''; analyzeBtn.style.opacity = ''; }, 2000);
      fetch('/api/analyze-current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: state.analyzeMode })
      });
      return;
    }

    // Layout swap
    if (t.closest('#btn-layout-swap')) {
      toggleLayout();
      return;
    }

    // Panel minimize
    var minBtn = t.closest('[data-minimize]');
    if (minBtn) {
      toggleMinimize(minBtn.dataset.minimize);
      return;
    }

    // Model chip click in settings
    var modelChip = t.closest('.model-chip');
    if (modelChip) {
      var input = modelChip.closest('.field').querySelector('input');
      if (input) input.value = modelChip.dataset.model;
      return;
    }

    // Switch model button — open model picker via prompt for now
    if (t.closest('#btn-switch-model')) {
      var currentModel = state.models
        ? (state.analyzeMode === 'deep' ? state.models.deep : state.models.fast)
        : '';
      var newModel = prompt(
        '切换' + (state.analyzeMode === 'deep' ? '深度' : '快速') + '模式模型\n当前: ' + currentModel + '\n\n输入新模型名:',
        currentModel
      );
      if (newModel && newModel.trim() && newModel.trim() !== currentModel) {
        var payload = {};
        if (state.analyzeMode === 'deep') payload.deep = newModel.trim();
        else payload.fast = newModel.trim();
        fetch('/api/switch-model', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.ok) {
            state.models = { fast: d.fast, deep: d.deep };
            renderModeButtons();
          }
        });
      }
      return;
    }

    // Settings modal open
    if (t.closest('#btn-settings')) {
      els.settingsModal.style.display = 'flex';
      loadCfg();
      return;
    }

    // Close settings
    if (t.id === 'btn-close-settings') {
      els.settingsModal.style.display = 'none';
      return;
    }

    // Close fullscreen modal
    if (t.id === 'btn-close-modal') {
      els.fullscreenModal.style.display = 'none';
      return;
    }

    // Click on modal overlay background closes it
    if (t.classList.contains('modal-overlay')) {
      t.style.display = 'none';
      return;
    }

    // Chat context toggle
    if (t.id === 'btn-toggle-ctx' || t.closest('#btn-toggle-ctx')) {
      var area = $('#ctx-area');
      area.style.display = area.style.display === 'none' ? '' : 'none';
      return;
    }

    // Chip preset (settings)
    var chip = t.closest('.chip');
    if (chip && chip.dataset.preset) {
      $$('.chip').forEach(function(x) { x.classList.remove('active'); });
      chip.classList.add('active');
      var p = chip.dataset.preset;
      if (p === 'anthropic') {
        $('#cfg-url').value = 'https://api.anthropic.com/v1';
        $('#cfg-model').value = 'claude-sonnet-4-6';
      } else if (p === 'openai') {
        $('#cfg-url').value = 'https://api.openai.com/v1';
        $('#cfg-model').value = 'gpt-4o';
      } else {
        $('#cfg-url').value = '';
        $('#cfg-model').value = '';
      }
      return;
    }

    // Test connection
    if (t.id === 'btn-test') {
      var msg = els.testMsg;
      msg.className = 'test-msg';
      msg.style.display = 'block';
      msg.textContent = '测试中...';
      fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: $('#cfg-url').value,
          apiKey: $('#cfg-key').value,
          model: $('#cfg-model').value
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        msg.className = d.ok ? 'test-msg ok' : 'test-msg err';
        msg.textContent = d.ok ? ('连接成功: ' + d.reply) : (d.error);
      })
      .catch(function(err) {
        msg.className = 'test-msg err';
        msg.textContent = err.message;
      });
      return;
    }

    // Save config
    if (t.id === 'btn-save-cfg') {
      var payload = {
        baseUrl: $('#cfg-url').value,
        apiKey: $('#cfg-key').value,
        model: $('#cfg-model').value
      };
      var mf = $('#cfg-model-fast');
      var md = $('#cfg-model-deep');
      if (mf) payload.modelFast = mf.value;
      if (md) payload.modelDeep = md.value;

      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ok) {
          alert('已保存，重启服务后生效');
          els.settingsModal.style.display = 'none';
        } else {
          alert('保存失败: ' + d.error);
        }
      })
      .catch(function(err) {
        alert('保存失败: ' + err.message);
      });
      return;
    }

    // Send chat button
    if (t.closest('#btn-send')) {
      sendChat();
      return;
    }

    // data-do actions
    var doEl = t.closest('[data-do]');
    if (doEl) {
      var action = doEl.dataset.do;
      var cid = doEl.dataset.cid || doEl.dataset.id;

      if (action === 'reveal') {
        var box = $('[data-ans="' + cid + '"]');
        if (box) {
          var showing = box.style.display === 'none';
          box.style.display = showing ? 'block' : 'none';
          doEl.textContent = showing ? '隐藏答案' : '答案';
        }
        var optList = $('.opt-list[data-cid="' + cid + '"]');
        if (optList) {
          if (box && box.style.display !== 'none') {
            var cap = state.snapshot.captures.find(function(c) { return c.id === cid; });
            if (cap && cap.payload && cap.payload.options) {
              optList.querySelectorAll('.opt').forEach(function(el) {
                var o = cap.payload.options.find(function(x) { return x.key === el.dataset.key; });
                if (o && o.isAnswer) el.classList.add('correct');
              });
            }
          } else {
            optList.querySelectorAll('.opt.correct').forEach(function(el) {
              el.classList.remove('correct');
            });
          }
        }
        return;
      }

      if (action === 'submit') {
        var type = doEl.dataset.type;
        var answers = [];

        if (type === 'choice') {
          answers = Array.from($$('.opt-list[data-cid="' + cid + '"] .opt.selected')).map(function(x) { return x.dataset.key; });
          if (!answers.length) { alert('请先选择'); return; }
        } else if (type === 'fill') {
          answers = Array.from($$('[data-blanks="' + cid + '"] .blank-input')).map(function(x) { return x.value.trim(); });
        } else if (type === 'subjective') {
          var ta = $('[data-subj="' + cid + '"]');
          answers = [ta ? ta.value.trim() : ''];
        }

        doEl.disabled = true;
        doEl.textContent = '提交中...';
        fetch('/api/submit-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captureId: cid, answerType: type, answers: answers })
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          doEl.textContent = d.ok ? '已提交' : '失败';
          setTimeout(function() { doEl.textContent = '提交'; doEl.disabled = false; }, 2000);
        })
        .catch(function() {
          doEl.textContent = '失败';
          setTimeout(function() { doEl.textContent = '提交'; doEl.disabled = false; }, 2000);
        });
        return;
      }

      if (action === 'retry') {
        fetch('/api/analyze-current', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: state.analyzeMode })
        });
        return;
      }

      if (action === 'deep-think') {
        doEl.classList.add('loading');
        doEl.textContent = '思考中...';
        fetch('/api/deep-think', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captureId: cid })
        });
        return;
      }

      if (action === 'fullscreen') {
        var cap = state.snapshot.captures.find(function(c) { return c.id === cid; });
        if (!cap) return;
        els.modalTitle.textContent = cap.title || '解析详情';
        var content = '<div class="prose">' + (cap.renderedHtml || '') + '</div>';
        if (cap.deepThinkHtml) {
          content += '<hr style="margin:20px 0;border-color:var(--border)"/><div class="prose">' + cap.deepThinkHtml + '</div>';
        }
        els.modalBody.innerHTML = content;
        els.fullscreenModal.style.display = 'flex';
        return;
      }
    }
  });

  // ── Chat keyboard ──
  els.chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  // ── SSE + Boot ──
  function boot() {
    fetch('/api/state')
      .then(function(r) { return r.json(); })
      .then(function(data) { render(data); })
      .catch(function() {});

    var src = new EventSource('/api/events');
    src.onmessage = function(e) {
      render(JSON.parse(e.data));
    };

    loadCurrentModels();
    initPanelResize();
    initWorkspaceResize();
    initWheelNavigation();
  }

  boot();
})();
