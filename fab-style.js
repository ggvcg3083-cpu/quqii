// ============================================================
// fab-style.js — FAB  外观自定义模块
// ============================================================
'use strict';

const FABStyleModule = (() => {

  /* ── DB 键名 ── */
  const K_CSS         = 'fabstyle-css';
  const K_ICON_IDLE   = 'fabstyle-icon-idle';   // base64 dataURL
  const K_ICON_OPEN   = 'fabstyle-icon-open';
  const K_ILLUST_CFG  = 'fabstyle-illust-cfg';  // { enabled, width, height }
  const K_ILLUST_IMG  = 'fabstyle-illust-img';
  const K_ILLUST_OPEN = 'fabstyle-illust-img-open';

  let _tab = 'css'; // 当前激活的 tab

  /* ════════════════════════════════════════
     INIT
  ════════════════════════════════════════ */
  async function init() {
    _injectStyles();
    _injectModal();
    await _restore();
  }

  /* ════════════════════════════════════════
     MODAL HTML 注入
  ════════════════════════════════════════ */
  function _injectStyles() {
    if (document.getElementById('fabstyle-base-css')) return;
    const s = document.createElement('style');
    s.id = 'fabstyle-base-css';
    s.textContent = `
      #fabstyle-overlay {
        position: fixed; inset: 0; z-index: 9900;
        background: rgba(0,0,0,0.45);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        display: none; align-items: flex-end; justify-content: center;
      }
      #fabstyle-modal {
        width: 100%; max-width: 390px;
        background: var(--bg-device);
        border-radius: 24px 24px 0 0;
        border-top: 0.5px solid var(--border-line);
        padding-bottom: max(28px, env(safe-area-inset-bottom));
        max-height: 82vh; overflow-y: auto;
        overscroll-behavior: contain;
        will-change: transform;
      }
      .fbs-tab {
        flex: 1; padding: 10px 0 11px;
        border: none; border-bottom: 2px solid transparent;
        background: none; cursor: pointer;
        font-family: 'Space Mono', monospace;
        font-size: 0.6rem; letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-sub);
        transition: color 0.15s, border-color 0.15s;
      }
      .fbs-tab.active {
        color: var(--text-main);
        border-bottom-color: var(--text-main);
      }
      .fbs-btn-primary {
        width: 100%; padding: 12px; border: none;
        background: var(--text-main); border-radius: 10px;
        font-family: 'Space Mono', monospace; font-size: 0.68rem;
        font-weight: 700; letter-spacing: 0.06em;
        color: var(--bg-device); cursor: pointer;
      }
      .fbs-btn-secondary {
        width: 100%; padding: 10px; border: 0.5px solid var(--border-line);
        background: none; border-radius: 10px;
        font-family: 'Space Mono', monospace; font-size: 0.65rem;
        color: var(--text-sub); cursor: pointer;
      }
      .fbs-btn-danger {
        width: 100%; padding: 10px; border: 0.5px solid rgba(217,58,58,0.35);
        background: none; border-radius: 10px;
        font-size: 0.65rem; color: #D93A3A; cursor: pointer;
      }
      .fbs-label {
        font-family: 'Space Mono', monospace; font-size: 0.55rem;
        color: var(--text-sub); letter-spacing: 0.1em;
        text-transform: uppercase; margin-bottom: 8px;
      }
      .fbs-section { margin-bottom: 22px; }
      .fbs-upload-label {
        display: flex; align-items: center; justify-content: center;
        gap: 5px; padding: 8px 12px;
        border: 0.5px solid var(--border-line); border-radius: 8px;
        font-size: 0.68rem; color: var(--text-sub);
        background: var(--s-bg); cursor: pointer;
      }
      .fbs-toggle {
        width: 42px; height: 24px; border-radius: 12px;
        background: var(--border-line); position: relative;
        cursor: pointer; transition: background 0.25s; flex-shrink: 0;
      }
      .fbs-toggle-knob {
        position: absolute; top: 4px; left: 4px;
        width: 16px; height: 16px; border-radius: 50%;
        background: #fff; transition: left 0.25s, background 0.25s;
        box-shadow: 0 1px 4px rgba(0,0,0,0.25);
      }
      .fbs-toggle.on { background: var(--text-main); }
      .fbs-toggle.on .fbs-toggle-knob { left: 22px; background: var(--bg-device); }
      .fbs-icon-slot {
        width: 52px; height: 52px; border-radius: 50%;
        background: var(--s-bg); border: 0.5px dashed var(--border-line);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.4rem; flex-shrink: 0; overflow: hidden;
      }
      .fbs-illust-slot {
        width: 100%; border-radius: 10px;
        background: var(--s-bg); border: 0.5px dashed var(--border-line);
        display: flex; align-items: center; justify-content: center;
        overflow: hidden; aspect-ratio: 1 / 2;
        margin-bottom: 8px;
      }
      .fbs-note {
        font-size: 0.63rem; color: var(--text-sub); line-height: 1.75;
        background: var(--s-bg); padding: 10px 13px;
        border-radius: 9px; margin-bottom: 14px;
      }
      .fbs-range-row {
        display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px;
      }
      .fbs-range-header {
        display: flex; justify-content: space-between;
        font-size: 0.63rem; color: var(--text-sub);
      }
      input[type=range].fbs-range {
        width: 100%; accent-color: var(--text-main);
        cursor: pointer;
      }
    `;
    document.head.appendChild(s);
  }

  function _injectModal() {
    if (document.getElementById('fabstyle-overlay')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
<div id="fabstyle-overlay" onclick="FABStyleModule._overlayClick(event)">
  <div id="fabstyle-modal">

    <!-- ── 拖拽指示条 ── -->
    <div style="display:flex;justify-content:center;padding:12px 0 4px;">
      <div style="width:36px;height:4px;border-radius:2px;background:var(--border-line);"></div>
    </div>

    <!-- ── 标题 ── -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 0;">
      <div>
        <div style="font-family:'Space Mono',monospace;font-size:0.72rem;font-weight:700;color:var(--text-main);letter-spacing:0.1em;">FAB STYLE</div>
        <div style="font-size:0.6rem;color:var(--text-sub);margin-top:2px;">自定义悬浮球外观</div>
      </div>
      <button onclick="FABStyleModule.close()" style="border:none;background:none;font-size:1.1rem;cursor:pointer;color:var(--text-sub);padding:6px 8px;">✕</button>
    </div>

    <!-- ── Tabs ── -->
    <div style="display:flex;padding:14px 20px 0;border-bottom:0.5px solid var(--border-line);gap:0;">
      <button id="fbs-tab-css"    class="fbs-tab active" onclick="FABStyleModule.switchTab('css')">CSS</button>
      <button id="fbs-tab-icon"   class="fbs-tab"        onclick="FABStyleModule.switchTab('icon')">图标</button>
      <button id="fbs-tab-illust" class="fbs-tab"        onclick="FABStyleModule.switchTab('illust')">立绘</button>
    </div>

    <!-- ══════════════════════════
         TAB: CSS
    ══════════════════════════ -->
    <div id="fbs-pane-css" style="padding:20px;">
      <div class="fbs-note">
        直接编写 CSS 覆盖 <code style="color:var(--text-main);font-family:monospace;">#g-fab</code> 与 <code style="color:var(--text-main);font-family:monospace;">#g-fab-panel</code>，点应用后实时生效并持久保存。
      </div>
      <textarea id="fbs-css-input"
        placeholder="/* 示例：改成胶囊形 */&#10;#g-fab {&#10;  border-radius: 16px;&#10;  background: #3b5bdb;&#10;}"
        spellcheck="false"
        style="width:100%;height:190px;padding:13px;background:var(--s-bg);border:0.5px solid var(--border-line);border-radius:10px;font-family:'Space Mono',monospace;font-size:0.68rem;color:var(--text-main);resize:none;line-height:1.65;outline:none;tab-size:2;-webkit-text-fill-color:var(--text-main);"
      ></textarea>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="fbs-btn-secondary" style="flex:1;" onclick="FABStyleModule.resetCSS()">重置</button>
        <button class="fbs-btn-primary"   style="flex:2;" onclick="FABStyleModule.applyCSS()">应用</button>
      </div>

      <!-- 默认 CSS 参考折叠 -->
      <details style="margin-top:18px;">
        <summary style="font-family:'Space Mono',monospace;font-size:0.58rem;color:var(--text-sub);cursor:pointer;user-select:none;letter-spacing:0.05em;">默认 CSS 参考 ▾</summary>
        <pre id="fbs-css-ref" style="margin-top:8px;padding:12px;background:var(--s-bg);border:0.5px solid var(--border-line);border-radius:9px;font-size:0.58rem;color:var(--text-sub);line-height:1.7;overflow-x:auto;white-space:pre-wrap;font-family:'Space Mono',monospace;"></pre>
      </details>
    </div>

    <!-- ══════════════════════════
         TAB: 图标
    ══════════════════════════ -->
    <div id="fbs-pane-icon" style="padding:20px;display:none;">
      <div class="fbs-note">上传图片或 GIF 替换默认图标，可分别设置<b style="color:var(--text-main);">默认</b>（闪电）和<b style="color:var(--text-main);">展开</b>（✕）两个状态。支持 PNG 透明背景。</div>

      <!-- Idle 图标 -->
      <div class="fbs-section">
        <div class="fbs-label">默认状态 / Idle</div>
        <div style="display:flex;align-items:center;gap:14px;">
          <div class="fbs-icon-slot" id="fbs-icon-idle-prev">⚡</div>
          <div style="flex:1;display:flex;flex-direction:column;gap:7px;">
            <label class="fbs-upload-label">
              <i class="ph ph-upload-simple"></i> 选择图片 / GIF
              <input type="file" accept="image/*,.gif" style="display:none;" onchange="FABStyleModule.uploadIconIdle(this)">
            </label>
            <button class="fbs-btn-danger" style="width:auto;padding:6px 12px;" onclick="FABStyleModule.clearIconIdle()">清除</button>
          </div>
        </div>
      </div>

      <!-- Open 图标 -->
      <div class="fbs-section">
        <div class="fbs-label">展开状态 / Active</div>
        <div style="display:flex;align-items:center;gap:14px;">
          <div class="fbs-icon-slot" id="fbs-icon-open-prev">✕</div>
          <div style="flex:1;display:flex;flex-direction:column;gap:7px;">
            <label class="fbs-upload-label">
              <i class="ph ph-upload-simple"></i> 选择图片 / GIF
              <input type="file" accept="image/*,.gif" style="display:none;" onchange="FABStyleModule.uploadIconOpen(this)">
            </label>
            <button class="fbs-btn-danger" style="width:auto;padding:6px 12px;" onclick="FABStyleModule.clearIconOpen()">清除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════
         TAB: 立绘
    ══════════════════════════ -->
    <div id="fbs-pane-illust" style="padding:20px;display:none;">
      <div class="fbs-note">上传立绘让悬浮球变成从角落探出的角色，支持 PNG（透明背景）与 GIF。建议图片宽高比约 1:2。</div>

      <!-- 模式开关 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:13px 15px;background:var(--s-bg);border-radius:12px;border:0.5px solid var(--border-line);">
        <div>
          <div style="font-size:0.75rem;font-weight:600;color:var(--text-main);">立绘模式</div>
          <div style="font-size:0.58rem;color:var(--text-sub);margin-top:3px;">开启后替换默认悬浮球</div>
        </div>
        <div id="fbs-illust-toggle" class="fbs-toggle" onclick="FABStyleModule.toggleIllustMode()">
          <div class="fbs-toggle-knob"></div>
        </div>
      </div>

      <!-- 立绘上传 (两列) -->
      <div style="display:flex;gap:12px;margin-bottom:20px;">
        <div style="flex:1;">
          <div class="fbs-label">默认立绘</div>
          <div class="fbs-illust-slot" id="fbs-illust-prev">
            <span style="font-size:0.6rem;color:var(--text-sub);">未设置</span>
          </div>
          <label class="fbs-upload-label" style="font-size:0.62rem;">
            <i class="ph ph-upload-simple"></i> 上传
            <input type="file" accept="image/*,.gif" style="display:none;" onchange="FABStyleModule.uploadIllust(this)">
          </label>
        </div>
        <div style="flex:1;">
          <div class="fbs-label">展开立绘</div>
          <div class="fbs-illust-slot" id="fbs-illust-open-prev">
            <span style="font-size:0.6rem;color:var(--text-sub);">默认同上</span>
          </div>
          <label class="fbs-upload-label" style="font-size:0.62rem;">
            <i class="ph ph-upload-simple"></i> 上传
            <input type="file" accept="image/*,.gif" style="display:none;" onchange="FABStyleModule.uploadIllustOpen(this)">
          </label>
        </div>
      </div>

      <!-- 尺寸控制 -->
      <div class="fbs-section">
        <div class="fbs-label">尺寸设置</div>
        <div class="fbs-range-row">
          <div class="fbs-range-header">
            <span>宽度</span><span id="fbs-w-val">80px</span>
          </div>
          <input type="range" class="fbs-range" id="fbs-illust-w" min="40" max="160" value="80" oninput="FABStyleModule.onSizeChange()">
        </div>
        <div class="fbs-range-row">
          <div class="fbs-range-header">
            <span>高度</span><span id="fbs-h-val">160px</span>
          </div>
          <input type="range" class="fbs-range" id="fbs-illust-h" min="80" max="320" value="160" oninput="FABStyleModule.onSizeChange()">
        </div>
      </div>

      <button class="fbs-btn-primary"   style="margin-bottom:8px;" onclick="FABStyleModule.saveIllustSettings()">保存设置</button>
      <button class="fbs-btn-danger"    onclick="FABStyleModule.clearIllust()">清除所有立绘</button>
    </div>

  </div>
</div>`;
    document.body.appendChild(wrap.firstElementChild);

    // 填充默认 CSS 参考内容
    const refEl = document.getElementById('fbs-css-ref');
    if (refEl) refEl.textContent = _defaultCSS();
  }

  /* ════════════════════════════════════════
     RESTORE 启动时还原
  ════════════════════════════════════════ */
  async function _restore() {
    try {
      // ── CSS ──
      const css = await DB.settings.get(K_CSS);
      if (css) {
        const ta = document.getElementById('fbs-css-input');
        if (ta) ta.value = css;
        _injectCSS(css);
      }

      // ── 图标 ──
      const iconIdle = await DB.settings.get(K_ICON_IDLE);
      if (iconIdle) _applyIconIdle(iconIdle);

      const iconOpen = await DB.settings.get(K_ICON_OPEN);
      if (iconOpen) _applyIconOpen(iconOpen);

      // ── 立绘 ──
      const cfg = await DB.settings.get(K_ILLUST_CFG);
      if (cfg) {
        const w = cfg.width  || 80;
        const h = cfg.height || 160;
        const wEl = document.getElementById('fbs-illust-w');
        const hEl = document.getElementById('fbs-illust-h');
        if (wEl) wEl.value = w;
        if (hEl) hEl.value = h;
        _setSizeLabel(w, h);
        if (cfg.enabled) _setToggleUI(true);
      }

      const illustImg     = await DB.settings.get(K_ILLUST_IMG);
      const illustImgOpen = await DB.settings.get(K_ILLUST_OPEN);

      if (illustImg)     _setSlotPreview('fbs-illust-prev', illustImg);
      if (illustImgOpen) _setSlotPreview('fbs-illust-open-prev', illustImgOpen);

      if (cfg?.enabled) {
        _applyIllustMode(cfg, illustImg, illustImgOpen);
      }
    } catch(e) {
      console.warn('[FABStyleModule] restore error', e);
    }
  }

  /* ════════════════════════════════════════
     CSS TAB
  ════════════════════════════════════════ */
  function _injectCSS(css) {
    let el = document.getElementById('fab-custom-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'fab-custom-css';
      document.head.appendChild(el);
    }
    el.textContent = css || '';
  }

  async function applyCSS() {
    const css = document.getElementById('fbs-css-input')?.value || '';
    _injectCSS(css);
    try { await DB.settings.set(K_CSS, css); } catch(e) {}
    Toast.show('CSS 已应用 ✓');
  }

  async function resetCSS() {
    _injectCSS('');
    const ta = document.getElementById('fbs-css-input');
    if (ta) ta.value = '';
    try { await DB.settings.set(K_CSS, ''); } catch(e) {}
    Toast.show('已重置为默认');
  }

  function _defaultCSS() {
    return `/* ── 悬浮球本体 ── */
#g-fab {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--text-main);
  color: var(--bg-device);
  font-size: 1.2rem;
  box-shadow: 0 4px 18px rgba(0,0,0,.2);
}

/* ── 面板 ── */
#g-fab-panel {
  width: 218px;
  background: var(--bg-device);
  border: 1px solid var(--border-line);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,.14);
}`;
  }

  /* ════════════════════════════════════════
     图标 TAB — Idle
  ════════════════════════════════════════ */
  function _applyIconIdle(b64) {
    const fab = document.getElementById('g-fab');
    if (!fab) return;

    // 注入自定义图标 img
    let img = document.getElementById('fab-icon-custom-idle');
    if (!img) {
      img = document.createElement('img');
      img.id = 'fab-icon-custom-idle';
      img.style.cssText = 'position:absolute;width:66%;height:66%;object-fit:contain;pointer-events:none;transition:opacity .15s,transform .15s;';
      fab.appendChild(img);
    }
    img.src = b64;

    // 隐藏原始 ph 图标（Idle 状态）
    _patchIconCSS();

    // 更新预览槽
    const prev = document.getElementById('fbs-icon-idle-prev');
    if (prev) prev.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:contain;">`;
  }

  /* ════════════════════════════════════════
     图标 TAB — Open
  ════════════════════════════════════════ */
  function _applyIconOpen(b64) {
    const fab = document.getElementById('g-fab');
    if (!fab) return;

    let img = document.getElementById('fab-icon-custom-open');
    if (!img) {
      img = document.createElement('img');
      img.id = 'fab-icon-custom-open';
      img.style.cssText = 'position:absolute;width:66%;height:66%;object-fit:contain;pointer-events:none;transition:opacity .15s,transform .15s;opacity:0;transform:rotate(-90deg);';
      fab.appendChild(img);
    }
    img.src = b64;

    _patchIconCSS();

    const prev = document.getElementById('fbs-icon-open-prev');
    if (prev) prev.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:contain;">`;
  }

  function _patchIconCSS() {
    // 用 <style> 统一控制自定义图标在开/关状态的显示逻辑
    let el = document.getElementById('fab-icon-patch-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'fab-icon-patch-css';
      document.head.appendChild(el);
    }

    const hasIdle = !!document.getElementById('fab-icon-custom-idle');
    const hasOpen = !!document.getElementById('fab-icon-custom-open');

    let css = '';
    if (hasIdle) {
      // 隐藏原始默认图标，显示自定义 idle
      css += `
        #g-fab .fab-icon-default { opacity: 0 !important; }
        #g-fab:not(.fab-open) #fab-icon-custom-idle { opacity: 1; transform: rotate(0deg); }
        #g-fab.fab-open        #fab-icon-custom-idle { opacity: 0; transform: rotate(90deg); }
      `;
    }
    if (hasOpen) {
      // 隐藏原始 X 图标，显示自定义 open
      css += `
        #g-fab .fab-icon-open { opacity: 0 !important; }
        #g-fab:not(.fab-open) #fab-icon-custom-open { opacity: 0; transform: rotate(-90deg); }
        #g-fab.fab-open        #fab-icon-custom-open { opacity: 1; transform: rotate(0deg); }
      `;
    }
    el.textContent = css;
  }

  async function uploadIconIdle(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      _warnLargeFile(file);
      const b64 = await _toBase64(file);
      await DB.settings.set(K_ICON_IDLE, b64);
      _applyIconIdle(b64);
      Toast.show('图标已更新 ✓');
    } catch(e) { Toast.show('上传失败'); }
  }

  async function uploadIconOpen(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      _warnLargeFile(file);
      const b64 = await _toBase64(file);
      await DB.settings.set(K_ICON_OPEN, b64);
      _applyIconOpen(b64);
      Toast.show('图标已更新 ✓');
    } catch(e) { Toast.show('上传失败'); }
  }

  async function clearIconIdle() {
    document.getElementById('fab-icon-custom-idle')?.remove();
    const prev = document.getElementById('fbs-icon-idle-prev');
    if (prev) prev.textContent = '⚡';
    _patchIconCSS();
    // 恢复原始图标显示
    const defIcon = document.getElementById('g-fab')?.querySelector('.fab-icon-default');
    if (defIcon) defIcon.style.opacity = '';
    try { await DB.settings.set(K_ICON_IDLE, null); } catch(e) {}
    Toast.show('已清除');
  }

  async function clearIconOpen() {
    document.getElementById('fab-icon-custom-open')?.remove();
    const prev = document.getElementById('fbs-icon-open-prev');
    if (prev) prev.textContent = '✕';
    _patchIconCSS();
    const openIcon = document.getElementById('g-fab')?.querySelector('.fab-icon-open');
    if (openIcon) openIcon.style.opacity = '';
    try { await DB.settings.set(K_ICON_OPEN, null); } catch(e) {}
    Toast.show('已清除');
  }

  /* ════════════════════════════════════════
     立绘 TAB
  ════════════════════════════════════════ */
  function _setToggleUI(on) {
    const el = document.getElementById('fbs-illust-toggle');
    if (!el) return;
    el.classList.toggle('on', on);
  }

  function _setSizeLabel(w, h) {
    const wEl = document.getElementById('fbs-w-val');
    const hEl = document.getElementById('fbs-h-val');
    if (wEl) wEl.textContent = w + 'px';
    if (hEl) hEl.textContent = h + 'px';
  }

  function _setSlotPreview(elId, b64) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:contain;">`;
  }

  function _applyIllustMode(cfg, idleB64, openB64) {
    const fab = document.getElementById('g-fab');
    if (!fab) return;

    const w = cfg.width  || 80;
    const h = cfg.height || 160;

    fab.classList.add('fab-illust-mode');

    // 注入立绘专属 CSS（覆盖圆形外观）
    let style = document.getElementById('fab-illust-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'fab-illust-css';
      document.head.appendChild(style);
    }
    style.textContent = `
      #g-fab.fab-illust-mode {
        width: ${w}px !important;
        height: ${h}px !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      /* 隐藏所有原始图标和自定义小图标 */
      #g-fab.fab-illust-mode .fab-icon-default,
      #g-fab.fab-illust-mode .fab-icon-open,
      #g-fab.fab-illust-mode #fab-icon-custom-idle,
      #g-fab.fab-illust-mode #fab-icon-custom-open { opacity: 0 !important; }
      /* 立绘图片共用样式 */
      #g-fab.fab-illust-mode #fab-illust-idle,
      #g-fab.fab-illust-mode #fab-illust-open-img {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        object-fit: contain; object-position: bottom center;
        pointer-events: none;
        transition: opacity 0.22s ease;
      }
      /* 默认状态：显示 idle，隐藏 open */
      #g-fab.fab-illust-mode:not(.fab-open) #fab-illust-idle      { opacity: 1; }
      #g-fab.fab-illust-mode:not(.fab-open) #fab-illust-open-img  { opacity: 0; }
      /* 展开状态：显示 open */
      #g-fab.fab-illust-mode.fab-open #fab-illust-idle     { opacity: 0; }
      #g-fab.fab-illust-mode.fab-open #fab-illust-open-img { opacity: 1; }
      /* 点击缩放改小一点，更自然 */
      #g-fab.fab-illust-mode:active { transform: scale(0.96) !important; }
    `;

    // Idle 立绘
    if (idleB64) {
      let img = document.getElementById('fab-illust-idle');
      if (!img) {
        img = document.createElement('img');
        img.id = 'fab-illust-idle';
        fab.appendChild(img);
      }
      img.src = idleB64;
    }

    // Open 立绘（无则复用 idle）
    const openSrc = openB64 || idleB64;
    if (openSrc) {
      let img = document.getElementById('fab-illust-open-img');
      if (!img) {
        img = document.createElement('img');
        img.id = 'fab-illust-open-img';
        fab.appendChild(img);
      }
      img.src = openSrc;
    }
  }

  function _removeIllustMode() {
    const fab = document.getElementById('g-fab');
    if (fab) fab.classList.remove('fab-illust-mode');
    document.getElementById('fab-illust-css')?.remove();
    document.getElementById('fab-illust-idle')?.remove();
    document.getElementById('fab-illust-open-img')?.remove();
  }

  async function toggleIllustMode() {
    try {
      const cfg = (await DB.settings.get(K_ILLUST_CFG)) || {};
      cfg.enabled = !cfg.enabled;
      await DB.settings.set(K_ILLUST_CFG, cfg);
      _setToggleUI(cfg.enabled);

      if (cfg.enabled) {
        const idle = await DB.settings.get(K_ILLUST_IMG);
        const open = await DB.settings.get(K_ILLUST_OPEN);
        _applyIllustMode(cfg, idle, open);
        Toast.show('立绘模式已开启');
      } else {
        _removeIllustMode();
        Toast.show('立绘模式已关闭');
      }
    } catch(e) { Toast.show('操作失败'); console.error(e); }
  }

  async function uploadIllust(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      _warnLargeFile(file);
      const b64 = await _toBase64(file);
      await DB.settings.set(K_ILLUST_IMG, b64);
      _setSlotPreview('fbs-illust-prev', b64);
      // 如果立绘模式已开启，实时更新
      const cfg = (await DB.settings.get(K_ILLUST_CFG)) || {};
      if (cfg.enabled) {
        const idleEl = document.getElementById('fab-illust-idle');
        if (idleEl) idleEl.src = b64;
        // 如果没有单独的 open 立绘，顺带更新 open
        const openB64 = await DB.settings.get(K_ILLUST_OPEN);
        if (!openB64) {
          const openEl = document.getElementById('fab-illust-open-img');
          if (openEl) openEl.src = b64;
        }
      }
      Toast.show('立绘已上传 ✓');
    } catch(e) { Toast.show('上传失败'); }
  }

  async function uploadIllustOpen(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      _warnLargeFile(file);
      const b64 = await _toBase64(file);
      await DB.settings.set(K_ILLUST_OPEN, b64);
      _setSlotPreview('fbs-illust-open-prev', b64);
      const cfg = (await DB.settings.get(K_ILLUST_CFG)) || {};
      if (cfg.enabled) {
        const openEl = document.getElementById('fab-illust-open-img');
        if (openEl) openEl.src = b64;
      }
      Toast.show('展开立绘已上传 ✓');
    } catch(e) { Toast.show('上传失败'); }
  }

  function onSizeChange() {
    const w = document.getElementById('fbs-illust-w')?.value || 80;
    const h = document.getElementById('fbs-illust-h')?.value || 160;
    _setSizeLabel(w, h);
  }

  async function saveIllustSettings() {
    const w = parseInt(document.getElementById('fbs-illust-w')?.value || 80);
    const h = parseInt(document.getElementById('fbs-illust-h')?.value || 160);
    try {
      const cfg = (await DB.settings.get(K_ILLUST_CFG)) || {};
      cfg.width  = w;
      cfg.height = h;
      await DB.settings.set(K_ILLUST_CFG, cfg);
      if (cfg.enabled) {
        // 直接重新 apply 以更新尺寸
        const idle = await DB.settings.get(K_ILLUST_IMG);
        const open = await DB.settings.get(K_ILLUST_OPEN);
        _applyIllustMode(cfg, idle, open);
      }
      Toast.show('设置已保存 ✓');
    } catch(e) { Toast.show('保存失败'); }
  }

  async function clearIllust() {
    try {
      _removeIllustMode();
      await DB.settings.set(K_ILLUST_CFG,  { enabled: false });
      await DB.settings.set(K_ILLUST_IMG,  null);
      await DB.settings.set(K_ILLUST_OPEN, null);
      _setToggleUI(false);
      const p1 = document.getElementById('fbs-illust-prev');
      const p2 = document.getElementById('fbs-illust-open-prev');
      if (p1) p1.innerHTML = '<span style="font-size:0.6rem;color:var(--text-sub);">未设置</span>';
      if (p2) p2.innerHTML = '<span style="font-size:0.6rem;color:var(--text-sub);">默认同上</span>';
      Toast.show('立绘已清除');
    } catch(e) { Toast.show('清除失败'); }
  }

  /* ════════════════════════════════════════
     TABS / OPEN / CLOSE
  ════════════════════════════════════════ */
  function switchTab(tab) {
    _tab = tab;
    ['css', 'icon', 'illust'].forEach(t => {
      const pane = document.getElementById(`fbs-pane-${t}`);
      const btn  = document.getElementById(`fbs-tab-${t}`);
      const on   = t === tab;
      if (pane) pane.style.display = on ? 'block' : 'none';
      if (btn)  btn.classList.toggle('active', on);
    });
  }

  function open() {
    const overlay = document.getElementById('fabstyle-overlay');
    const modal   = document.getElementById('fabstyle-modal');
    if (!overlay || !modal) return;
    overlay.style.display = 'flex';
    modal.style.transition = 'none';
    modal.style.transform  = 'translateY(100%)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.style.transition = 'transform 0.38s cubic-bezier(0.19,1,0.22,1)';
        modal.style.transform  = 'translateY(0)';
      });
    });
    switchTab(_tab);
  }

  function close() {
    const overlay = document.getElementById('fabstyle-overlay');
    const modal   = document.getElementById('fabstyle-modal');
    if (!modal) return;
    modal.style.transition = 'transform 0.3s cubic-bezier(0.4,0,1,1)';
    modal.style.transform  = 'translateY(100%)';
    setTimeout(() => {
      if (overlay) overlay.style.display = 'none';
    }, 300);
  }

  // 点击遮罩关闭
  function _overlayClick(e) {
    if (e.target === document.getElementById('fabstyle-overlay')) close();
  }

  /* ════════════════════════════════════════
     UTILS
  ════════════════════════════════════════ */
  function _toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function _warnLargeFile(file) {
    if (file.size > 2 * 1024 * 1024) {
      Toast.show('文件较大 (>2MB)，建议压缩后使用');
    }
  }

  /* ════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════ */
  return {
    init,
    open, close, _overlayClick,
    switchTab,
    applyCSS, resetCSS,
    uploadIconIdle, uploadIconOpen,
    clearIconIdle, clearIconOpen,
    uploadIllust, uploadIllustOpen,
    onSizeChange, saveIllustSettings,
    toggleIllustMode, clearIllust,
  };
})();