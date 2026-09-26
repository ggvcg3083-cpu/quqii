/* ════════════════════════════════════════════════════════════════════
 * ChillOS · API 调用日志子模块  (api-log.js)
 * ────────────────────────────────────────────────────────────────────
 * 用途:计费对账。记录每次计费 API 调用的「时间 / 类型 / 模型 / 成败 /
 *       耗时 / token / 是否重试」,用于排查"多扣费、不知扣在哪"。
 *
 * 引入(在 index.html,主脚本之前越早越好):
 *     <script src="api-log.js"></script>
 *
 * 初始化(在那串 await XxxModule.init() 里加一行):
 *     try { await ApiLogModule.init(); } catch(e){ console.warn('apilog init failed', e); }
 *
 * 设置开关(系统设置页插入一个 toggle-row,见交付说明):
 *     <input type="checkbox" id="sys-toggle-apilog"
 *            onchange="ApiLogModule.setEnabled(this.checked)">
 *
 * 行为:
 *   • 文件一加载就装好 fetch 总闸(防止漏掉启动早期调用),
 *     但「关闭」时总闸直接透传、不写库、不显示胶囊,零开销。
 *   • 默认关闭。开关状态存 DB.settings('apilog-enabled')。
 *   • 开启后:右下角出现悬浮胶囊,点击弹出「居中」面板。
 *   • 只记计费 API(对话/生图/记忆embedding/语音TTS/模型),
 *     天气/Supabase/图床等自动忽略。不记提示词、不记回复正文。
 *   • 独立 IndexedDB 库(chillos-apilog),不碰主库、不升 DB_VERSION。
 *
 * 控制台:ApiLogModule.open() 打开面板 / .exportCSV() 导出 / .wipe() 清空
 * ════════════════════════════════════════════════════════════════════ */
const ApiLogModule = (() => {
  'use strict';

  // ── 配置 ──────────────────────────────────────────────────────────
  const SETTING_KEY = 'apilog-enabled';
  const IDB_NAME    = 'chillos-apilog';
  const STORE       = 'logs';
  const MAX_ROWS    = 5000;        // 超过自动滚动删最老,防爆库
  const RETRY_WIN   = 8000;        // 同出口指纹在该窗口(ms)内再现 → 判为重试

  // 计费 API 分类规则;命中任一即记录,否则忽略
  const CLASSIFY = [
    { kind: 'image',     test: u => /\/images\/(generations|edits)\b/.test(u) },
    { kind: 'embedding', test: u => /\/embeddings\b/.test(u) },
    { kind: 'tts',       test: u => /minimax\.chat\/v1\/t2a|\/audio\/speech|\/tts\b/.test(u) },
    { kind: 'models',    test: u => /\/(v1|v4)\/models\b|\/models$/.test(u) },
    { kind: 'chat',      test: u => /\/chat\/completions\b|\/v1\/completions\b/.test(u) },
  ];

  const KIND_LABEL = { chat:'对话', image:'生图', embedding:'记忆', tts:'语音', models:'模型' };
  const KIND_COLOR = { chat:'#5b8def', image:'#c0883b', embedding:'#7d9a6f', tts:'#a86bb0', models:'#888' };

  let _enabled = false;          // 当前开关状态(默认关)
  let _installed = false;        // fetch 总闸是否已装

  // ── IndexedDB(独立库,自管)────────────────────────────────────────
  let _db = null;
  function _open() {
    return new Promise((res, rej) => {
      if (_db) return res(_db);
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          s.createIndex('ts', 'ts');
        }
      };
      r.onsuccess = () => { _db = r.result; res(_db); };
      r.onerror   = () => rej(r.error);
    });
  }

  async function _put(row) {
    try {
      const db = await _open();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add(row);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      _maybeTrim();
    } catch (_) { /* 日志失败绝不影响主流程 */ }
  }

  let _trimBusy = false;
  async function _maybeTrim() {
    if (_trimBusy) return; _trimBusy = true;
    try {
      const db = await _open();
      const cnt = await new Promise(r => {
        const req = db.transaction(STORE).objectStore(STORE).count();
        req.onsuccess = () => r(req.result); req.onerror = () => r(0);
      });
      if (cnt > MAX_ROWS) {
        const over = cnt - MAX_ROWS;
        await new Promise(res => {
          const tx = db.transaction(STORE, 'readwrite');
          const cur = tx.objectStore(STORE).index('ts').openCursor();
          let n = 0;
          cur.onsuccess = e => { const c = e.target.result; if (c && n < over) { c.delete(); n++; c.continue(); } };
          tx.oncomplete = res; tx.onerror = res;
        });
      }
    } catch (_) {} finally { _trimBusy = false; }
  }

  async function _getAll() {
    try {
      const db = await _open();
      return await new Promise(r => {
        const out = [];
        const cur = db.transaction(STORE).objectStore(STORE).index('ts').openCursor(null, 'prev');
        cur.onsuccess = e => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else r(out); };
        cur.onerror = () => r(out);
      });
    } catch (_) { return []; }
  }

  async function wipe() {
    try {
      const db = await _open();
      await new Promise(res => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = res; tx.onerror = res;
      });
    } catch (_) {}
    _render();
  }

  // ── 元信息抽取(不碰提示词正文)──────────────────────────────────
  function _classify(url) { for (const c of CLASSIFY) if (c.test(url)) return c.kind; return null; }
  function _host(url) { try { return new URL(url, location.href).host; } catch (_) { return String(url).slice(0,40); } }
  function _model(init, input) {
    try {
      const b = (init && init.body) || (input && input.body);
      if (typeof b === 'string' && b.length < 200000) {
        const m = b.match(/"model"\s*:\s*"([^"]{1,80})"/);
        if (m) return m[1];
      }
    } catch (_) {}
    return '';
  }
  function _usage(json) {
    try {
      const u = json && json.usage; if (!u) return null;
      return { in:  u.prompt_tokens ?? u.input_tokens ?? null,
               out: u.completion_tokens ?? u.output_tokens ?? null,
               tot: u.total_tokens ?? null };
    } catch (_) { return null; }
  }

  const _lastSeen = new Map(); // 出口指纹 → ts,用于重试检测

  // ── fetch 总闸(只装一次;由 _enabled 决定是否记录)──────────────
  function _install() {
    if (_installed) return; _installed = true;
    const orig = window.fetch.bind(window);

    window.fetch = async function (input, init) {
      // 关闭时:直接透传,零开销
      if (!_enabled) return orig(input, init);

      let url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (_) {}
      const kind = url ? _classify(url) : null;
      if (!kind) return orig(input, init); // 非计费请求不记

      const host  = _host(url);
      const model = _model(init, input);
      const fp    = kind + '|' + host + '|' + model;
      const t0    = Date.now();
      const prev  = _lastSeen.get(fp);
      const retry = prev != null && (t0 - prev) < RETRY_WIN;
      _lastSeen.set(fp, t0);

      try {
        const res = await orig(input, init);
        let usage = null, errType = '';
        if (res.ok && (kind === 'chat' || kind === 'embedding')) {
          try {
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('json')) usage = _usage(await res.clone().json());
          } catch (_) {}
        }
        if (!res.ok) {
          try {
            const t = await res.clone().text();
            const m = t.match(/"(?:code|type)"\s*:\s*"([^"]{1,60})"/);
            errType = m ? m[1] : ('HTTP' + res.status);
          } catch (_) { errType = 'HTTP' + res.status; }
        }
        _put({ ts:t0, kind, host, model, ok:res.ok, status:res.status, retry,
               ms:Date.now()-t0, in:usage?.in??null, out:usage?.out??null, tot:usage?.tot??null,
               err: res.ok ? '' : errType });
        return res;
      } catch (e) {
        const aborted = e && e.name === 'AbortError';
        _put({ ts:t0, kind, host, model, ok:false, status:0, retry,
               ms:Date.now()-t0, in:null, out:null, tot:null,
               err: aborted ? 'aborted' : 'network' });
        throw e;
      }
    };
  }

  // ── UI:悬浮胶囊 + 居中面板 ────────────────────────────────────────
  function _injectStyle() {
    if (document.getElementById('apilog-style')) return;
    const s = document.createElement('style');
    s.id = 'apilog-style';
    s.textContent = `
      #apilog-cap{position:fixed;right:16px;bottom:88px;z-index:2147483000;
        display:none;align-items:center;gap:6px;height:34px;padding:0 14px;
        border-radius:18px;background:rgba(28,28,30,.92);color:#fff;cursor:grab;
        box-shadow:0 4px 16px rgba(0,0,0,.28);font-family:'Space Mono',monospace;
        font-size:12px;letter-spacing:.6px;user-select:none;backdrop-filter:blur(6px);
        transition:opacity .2s;opacity:.9;touch-action:none}
      #apilog-cap:active{cursor:grabbing}
      #apilog-cap.on{display:flex}
      #apilog-cap:hover{opacity:1}
      #apilog-cap .dot{width:7px;height:7px;border-radius:50%;background:#5a9a5a}
      #apilog-mask{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.46);
        display:none;align-items:center;justify-content:center;padding:20px}
      #apilog-mask.on{display:flex}
      #apilog-panel{background:#faf8f5;color:#2a2a2a;width:100%;max-width:560px;
        max-height:82vh;border-radius:16px;display:flex;flex-direction:column;
        font-family:-apple-system,'Space Mono',monospace;box-shadow:0 14px 50px rgba(0,0,0,.32);
        overflow:hidden}
      #apilog-head{padding:14px 16px 10px;border-bottom:1px solid #e7e2da;display:flex;
        align-items:center;gap:8px;flex-wrap:wrap}
      #apilog-head h3{margin:0;font-family:'Playfair Display',serif;font-size:17px;flex:1;font-weight:600}
      .apilog-btn{border:1px solid #d6cfc4;background:#fff;border-radius:8px;padding:5px 10px;
        font-size:12px;cursor:pointer;color:#444;font-family:inherit}
      .apilog-btn:hover{background:#f1ece4}
      .apilog-btn.warn{color:#b04a4a;border-color:#e0c4c4}
      #apilog-filters{padding:8px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #efeae2}
      .apilog-chip{border:1px solid #d6cfc4;background:#fff;border-radius:20px;padding:3px 11px;
        font-size:11px;cursor:pointer;color:#666}
      .apilog-chip.on{background:#2a2a2a;color:#fff;border-color:#2a2a2a}
      #apilog-stat{padding:7px 16px;font-size:11px;color:#8a8275;border-bottom:1px solid #efeae2;
        display:flex;gap:14px;flex-wrap:wrap}
      #apilog-stat b{color:#2a2a2a}
      #apilog-list{overflow-y:auto;flex:1;padding:2px 0;min-height:120px}
      .apilog-row{padding:8px 16px;border-bottom:1px solid #f0ebe3;display:flex;
        align-items:center;gap:8px;font-size:12px}
      .apilog-row .tag{color:#fff;border-radius:5px;padding:1px 6px;font-size:10px;flex-shrink:0;min-width:30px;text-align:center}
      .apilog-row .tm{color:#9a9183;font-size:11px;flex-shrink:0;width:60px}
      .apilog-row .md{flex:1;color:#3a3a3a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .apilog-row .meta{color:#9a9183;font-size:10px;flex-shrink:0;text-align:right}
      .apilog-row.fail{background:#fcf1f1}
      .apilog-row .dot2{font-size:10px;flex-shrink:0}
      .apilog-row .rtry{background:#b04a4a;color:#fff;border-radius:4px;padding:0 5px;font-size:9px;flex-shrink:0}
      #apilog-empty{padding:44px 20px;text-align:center;color:#b3aa9c;font-size:13px;line-height:1.8}
    `;
    document.head.appendChild(s);
  }

  const POS_KEY = 'apilog-cap-pos';

  function _ensureCapsule() {
    _injectStyle();
    if (!document.getElementById('apilog-cap')) {
      const cap = document.createElement('div');
      cap.id = 'apilog-cap';
      cap.innerHTML = `<span class="dot"></span>API 日志`;
      cap.title = '查看 API 调用日志(可拖动)';
      document.body.appendChild(cap);
      _restorePos(cap);
      _bindDrag(cap);
    }
  }

  // 恢复上次拖到的位置;没存过则用 CSS 默认(右下角)
  function _restorePos(cap) {
    try {
      const s = JSON.parse(localStorage.getItem(POS_KEY));
      if (s && typeof s.x === 'number') {
        cap.style.right  = 'auto';
        cap.style.bottom = 'auto';
        cap.style.left = Math.max(0,  Math.min(s.x, window.innerWidth  - 60)) + 'px';
        cap.style.top  = Math.max(40, Math.min(s.y, window.innerHeight - 40)) + 'px';
      }
    } catch (_) {}
  }

  function _savePos(cap) {
    const r = cap.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top })); } catch (_) {}
  }

  // 拖拽:按下记起点,移动超过阈值算拖动,松手时若没拖动则当作点击→打开面板
  function _bindDrag(cap) {
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const TH = 4; // 移动超过 4px 才算拖动,避免轻微抖动误判

    cap.addEventListener('pointerdown', e => {
      dragging = true; moved = false;
      const r = cap.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      cap.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });

    cap.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) > TH) moved = true;
      if (moved) {
        cap.style.right = 'auto'; cap.style.bottom = 'auto';
        cap.style.left = Math.max(0, Math.min(ox + dx, window.innerWidth  - cap.offsetWidth))  + 'px';
        cap.style.top  = Math.max(0, Math.min(oy + dy, window.innerHeight - cap.offsetHeight)) + 'px';
      }
    });

    cap.addEventListener('pointerup', e => {
      if (!dragging) return;
      dragging = false;
      cap.releasePointerCapture?.(e.pointerId);
      if (moved) _savePos(cap);   // 拖动了 → 存位置,不触发打开
      else open();                // 没拖动 → 当点击,打开面板
    });

    cap.addEventListener('pointercancel', () => { dragging = false; });
  }

  function _applyEnabled(val) {
    _ensureCapsule();
    const cap = document.getElementById('apilog-cap');
    if (cap) cap.classList.toggle('on', !!val);
    if (!val) { const m = document.getElementById('apilog-mask'); if (m) m.classList.remove('on'); }
  }

  let _filterKind = 'all';
  let _filterRetry = false;

  function open() {
    _injectStyle();
    let mask = document.getElementById('apilog-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'apilog-mask';
      mask.innerHTML = `
        <div id="apilog-panel" onclick="event.stopPropagation()">
          <div id="apilog-head">
            <h3>API 调用日志</h3>
            <button class="apilog-btn" data-act="refresh">刷新</button>
            <button class="apilog-btn" data-act="csv">导出</button>
            <button class="apilog-btn warn" data-act="clear">清空</button>
            <button class="apilog-btn" data-act="close">关闭</button>
          </div>
          <div id="apilog-filters"></div>
          <div id="apilog-stat"></div>
          <div id="apilog-list"></div>
        </div>`;
      mask.onclick = () => mask.classList.remove('on');
      document.body.appendChild(mask);
      mask.querySelector('[data-act="close"]').onclick   = () => mask.classList.remove('on');
      mask.querySelector('[data-act="refresh"]').onclick = _render;
      mask.querySelector('[data-act="csv"]').onclick     = exportCSV;
      mask.querySelector('[data-act="clear"]').onclick   = async () => {
        if (confirm('确定清空所有 API 日志?(不影响 App 数据)')) await wipe();
      };
    }
    mask.classList.add('on');
    _render();
  }

  function _fmtTime(ts) {
    const d = new Date(ts), p = n => String(n).padStart(2,'0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  async function _render() {
    const list = document.getElementById('apilog-list');
    if (!list) return;
    const rows = await _getAll();
    const fbox = document.getElementById('apilog-filters');
    const sbox = document.getElementById('apilog-stat');

    const kinds = ['all','chat','image','embedding','tts','models'];
    fbox.innerHTML = kinds.map(k =>
      `<span class="apilog-chip ${_filterKind===k?'on':''}" data-k="${k}">${k==='all'?'全部':(KIND_LABEL[k]||k)}</span>`
    ).join('') + `<span class="apilog-chip ${_filterRetry?'on':''}" data-retry="1">⟳ 只看重试</span>`;
    fbox.querySelectorAll('[data-k]').forEach(c => c.onclick = () => { _filterKind = c.dataset.k; _render(); });
    fbox.querySelector('[data-retry]').onclick = () => { _filterRetry = !_filterRetry; _render(); };

    let view = rows;
    if (_filterKind !== 'all') view = view.filter(r => r.kind === _filterKind);
    if (_filterRetry) view = view.filter(r => r.retry);

    const fails = view.filter(r => !r.ok).length;
    const retries = view.filter(r => r.retry).length;
    const tIn = view.reduce((s,r)=>s+(r.in||0),0);
    const tOut = view.reduce((s,r)=>s+(r.out||0),0);
    sbox.innerHTML =
      `<span>调用 <b>${view.length}</b></span>` +
      `<span>重试 <b style="color:#b04a4a">${retries}</b></span>` +
      `<span>失败 <b>${fails}</b></span>` +
      (tIn||tOut ? `<span>token <b>${tIn}</b>↑ <b>${tOut}</b>↓</span>` : '');

    if (!view.length) {
      list.innerHTML = `<div id="apilog-empty">暂无记录<br><span style="font-size:11px">发一条消息或生成一张图后回来看看</span></div>`;
      return;
    }
    list.innerHTML = view.slice(0, 800).map(r => {
      const color = KIND_COLOR[r.kind] || '#888';
      const tok = r.tot ? `${r.tot}tok` : (r.out ? `${r.out}tok` : '');
      const meta = [tok, `${r.ms}ms`].filter(Boolean).join(' · ');
      return `<div class="apilog-row ${r.ok?'':'fail'}">
        <span class="tm">${_fmtTime(r.ts)}</span>
        <span class="tag" style="background:${color}">${KIND_LABEL[r.kind]||r.kind}</span>
        ${r.retry?'<span class="rtry">⟳重试</span>':''}
        <span class="md">${(r.model||r.host||'').replace(/</g,'&lt;')}</span>
        <span class="dot2" style="color:${r.ok?'#5a9a5a':'#b04a4a'}">${r.ok?'●':'✕'+(r.err?' '+r.err:'')}</span>
        <span class="meta">${meta}</span>
      </div>`;
    }).join('');
  }

  async function exportCSV() {
    const rows = await _getAll();
    const head = ['时间','类型','域名','模型','结果','状态码','重试','耗时ms','in','out','total','错误'];
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push([
        new Date(r.ts).toLocaleString('zh-CN'),
        r.kind, r.host, r.model, r.ok?'OK':'FAIL', r.status, r.retry?'是':'',
        r.ms, r.in??'', r.out??'', r.tot??'', (r.err||'').replace(/,/g,';'),
      ].join(','));
    }
    const blob = new Blob(['\ufeff'+lines.join('\n')], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `apilog-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ── 对外:开关 + 初始化 ────────────────────────────────────────────
  async function setEnabled(val) {
    _enabled = !!val;
    _applyEnabled(_enabled);
    try { await DB.settings.set(SETTING_KEY, _enabled); } catch (_) {}
  }
  function isEnabled() { return _enabled; }

  async function init() {
    _install();                       // 总闸尽早装好(关闭时透传)
    try {
      const saved = await DB.settings.get(SETTING_KEY);
      _enabled = saved === true;      // 默认关:只有显式存过 true 才开
    } catch (_) { _enabled = false; }
    _applyEnabled(_enabled);
    // 让设置页开关勾选状态与持久化值同步(若该 DOM 存在)
    const t = document.getElementById('sys-toggle-apilog');
    if (t) t.checked = _enabled;
  }

  // 文件加载即装总闸(即使 init 还没跑,也不漏启动早期调用;此时 _enabled=false 故透传)
  _install();

  return { init, setEnabled, isEnabled, open, exportCSV, wipe };
})();