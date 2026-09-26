/* ============================================================================
 * story-status.js — 单人剧情【自定义状态栏】独立子模块
 * ----------------------------------------------------------------------------
 * 移植自群像 GroupStoryModule 的状态面板机制，适配单人剧情 StoryChatModule。
 *
 * 与群像的差异：
 *   · 隔离键：sc-status-*-${charId}（沿用单人 sc- 命名），不碰群像 gstory-*
 *   · 预设全局共用：sc-status-presets（与群像的 gstory-status-presets 各自独立）
 *   · 单角色：buildPrompt 只要求 AI 输出一行 @角色名；GS_CHARS 注入【角色 + 用户人设】
 *     两个元素，模板想做切换可用 GS_CHARS（>1 时系统不出圆点），不用则只显示当前角色
 *   · 自带弹窗 + 全套 CSS，零依赖主文件（仅用到全局 DB / Toast）
 *
 * 主文件 wiring（详见文件末尾 README 注释）：
 *   1) <script src="story-status.js"></script>
 *   2) _appendCard 角色气泡头像挂 onclick + StoryStatus.isOn 判断
 *   3) _buildStorySystemPrompt 末尾拼 await StoryStatus.buildPrompt(charId)
 *   4) AI 回复落库后调 StoryStatus.extract(charId, msgId, raw)
 *   5) openSettings 面板加「状态面板」按钮 → StoryStatus.openEditor(charId)
 *
 * 暴露：window.StoryStatus = { isOn, openPanel, openEditor, buildPrompt,
 *                              extract, stripStatusBlock, getStatusOf }
 * ========================================================================== */
const StoryStatus = (() => {
  'use strict';

  const _DB = () => (typeof DB !== 'undefined' ? DB : null);
  const _toast = (m) => { try { if (typeof Toast !== 'undefined' && Toast.show) Toast.show(m); } catch (e) {} };
  const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 角色中文名首字母（英文取首字母大写，中文取首字）
  function _initialOf(name) {
    if (!name) return '?';
    const ch = String(name).trim().charAt(0);
    return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ch;
  }
  // 清洗状态文字：剥首尾括号/引号，超长软截断
  function _cleanField(s, max) {
    let t = (s || '').trim(), prev;
    do { prev = t; t = t.replace(/^[（(「『"'\[【]+/, '').replace(/[）)」』"'\]】]+$/, '').trim(); } while (t !== prev);
    if (max && t.length > max) t = t.slice(0, max) + '…';
    return t;
  }

  /* ── 存储键：全部 sc- 前缀 + charId 隔离 ───────────────────────── */
  const K_ON   = (cid) => `sc-status-on-${cid}`;
  const K_TPL  = (cid) => `sc-status-tpl-${cid}`;
  const K_FLDS = (cid) => `sc-status-fields-${cid}`;
  const K_PRESETS = 'sc-status-presets';            // 全局
  const K_STATUSDATA = (cid, msgId) => `sc-status-data-${cid}-${msgId}`;  // 每条消息的状态快照

  /* ── 默认字段表（与群像同构，单人照常跑）─────────────────────── */
  const FIELDS_DEFAULT = [
    { key: 'name_en',  desc: '英文名或拼音',                                   max: 0  },
    { key: 'role',     desc: '身份头衔',                                       max: 0  },
    { key: 'status',   desc: '当前一句话状态',                                 max: 40 },
    { key: 'god_note', desc: '上帝视角吐槽（第三人称犀利毒舌点评，绝非角色心声）', max: 30 },
    { key: 'thought',  desc: '该角色此刻的内心独白（第一人称真实想法）',          max: 50 },
  ];

  // 系统内置占位符（场景/名字/首字母系统自动填，扫描时跳过）
  const BUILTIN_KEYS = ['nav', 'loc_cn', 'loc_en', 'time', 'char_initial', 'char_name_cn',
                        'char_name_en', 'char_role', 'char_status'];
  // 已知字段预填说明 + 软上限
  const KEY_HINTS = {
    name_en:  { desc: '英文名或拼音', max: 0 },
    role:     { desc: '身份头衔', max: 0 },
    status:   { desc: '当前一句话状态', max: 40 },
    mood:     { desc: '此刻心情，两个字的词', max: 4 },
    god_note: { desc: '上帝视角吐槽（第三人称犀利毒舌点评，绝非角色心声）', max: 30 },
    thought:  { desc: '该角色此刻的内心独白（第一人称真实想法）', max: 50 },
    paper:    { desc: '这份小报的报名（按场景气质起，如「街角晨报」）', max: 8 },
    issue:    { desc: '本期刊号，两位数字（如 07、23）', max: 2 },
    memo:     { desc: '剧情备忘/启事，多条用竖线 | 分隔', max: 0 },
    hp:       { desc: '体力 0-100 的数字', max: 0 },
    favor:    { desc: '好感度 0-100 的数字', max: 0 },
    location: { desc: '该角色此刻所在的具体位置', max: 0 },
    weapon:   { desc: '随身携带的武器或物品', max: 0 },
    obsession:{ desc: '心魔/执念，一句话', max: 0 },
    note:     { desc: '上帝视角吐槽（第三人称犀利点评，绝非角色心声）', max: 45 },
    want:     { desc: '此刻最想做的事', max: 0 },
  };

  /* ── 默认模板（报纸夹/剪报风，与群像一致）───────────────────── */
  const TEMPLATE_DEFAULT = `<div class="rp-wrap">
  <div class="rp-card">
    <div class="rp-clip"></div>
    <div class="rp-inner">
      <div class="rp-top">
        <div class="rp-top-l">
          <p class="rp-label">Current Location</p>
          <p class="rp-loc">{{loc_cn}} <span class="rp-slash">/</span> <span class="rp-loc-en">{{loc_en}}</span></p>
        </div>
        <div class="rp-top-r">
          <p class="rp-label">Log. Time</p>
          <p class="rp-time">{{time}}</p>
        </div>
      </div>
      <div class="rp-nav-slot">{{nav}}</div>
      <div class="rp-namerow">
        <h1 class="rp-name-en">{{char_name_en}}</h1>
        <span class="rp-name-cn">{{char_name_cn}}</span>
      </div>
      <div class="rp-rolerow">
        <span class="rp-roletag">Role</span>
        <span class="rp-role">{{char_role}}</span>
      </div>
      <div class="rp-statusblock">
        <p class="rp-label rp-status-label">Status <span class="rp-pulse"></span></p>
        <p class="rp-status">{{char_status}}</p>
      </div>
      <div class="rp-tracing">
        <div class="rp-tape"></div>
        <div class="rp-note-head">
          <span class="rp-note-title">Observer's Log</span>
          <span class="rp-note-tag">#KP_NOTE</span>
        </div>
        <p class="rp-note-body">{{god_note}}</p>
      </div>
      <div class="rp-mono">
        <div class="rp-mono-head">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Inner Monologue</span>
        </div>
        <div class="rp-mono-box"><p>{{thought}}</p></div>
      </div>
    </div>
  </div>
</div>
<style>
  .rp-wrap{width:100%;display:flex;justify-content:center;padding:8px 4px 24px;}
  .rp-card{width:100%;max-width:400px;background:#F9F8F6;border-radius:12px;position:relative;box-shadow:0 20px 50px rgba(0,0,0,.1);border:1px solid rgba(229,229,229,.6);}
  .rp-clip{position:absolute;top:-15px;left:30px;width:14px;height:40px;border:2px solid #a3a3a3;border-bottom:0;border-radius:10px 10px 0 0;z-index:20;box-shadow:2px 2px 4px rgba(0,0,0,.1) inset,1px 1px 2px rgba(0,0,0,.2);transform:rotate(5deg);}
  .rp-clip::after{content:'';position:absolute;bottom:-5px;left:2px;width:6px;height:30px;border:2px solid #a3a3a3;border-top:0;border-radius:0 0 10px 10px;}
  .rp-inner{padding:24px 24px 32px;display:flex;flex-direction:column;gap:24px;}
  .rp-top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid rgba(209,213,219,.5);padding-bottom:12px;}
  .rp-top-r{text-align:right;}
  .rp-label{font-size:9px;text-transform:uppercase;letter-spacing:.25em;color:#7A7671;margin:0 0 4px;font-family:'Inter',sans-serif;}
  .rp-loc{font-family:'Noto Serif SC',serif;font-size:13px;font-weight:500;letter-spacing:.1em;color:#1A1A1A;margin:0;}
  .rp-slash{font-family:'Cormorant Garamond',serif;color:#A69F95;margin:0 4px;}
  .rp-loc-en{font-family:'Inter',sans-serif;font-size:10px;color:#7A7671;letter-spacing:.1em;text-transform:uppercase;}
  .rp-time{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:14px;color:#1A1A1A;margin:0;}
  .rp-nav-slot{margin-bottom:4px;}
  .rp-namerow{display:flex;align-items:baseline;gap:12px;margin-bottom:-8px;}
  .rp-name-en{font-family:'Cormorant Garamond',serif;font-size:48px;color:#1A1A1A;margin:0 0 0 -2px;line-height:1;}
  .rp-name-cn{font-family:'Noto Serif SC',serif;font-size:14px;letter-spacing:.1em;color:#7A7671;font-weight:300;}
  .rp-rolerow{display:flex;align-items:center;gap:8px;margin-top:8px;}
  .rp-roletag{font-size:9px;text-transform:uppercase;letter-spacing:.2em;background:#1A1A1A;color:#fff;padding:2px 8px;border-radius:3px;font-family:'Inter',sans-serif;}
  .rp-role{font-family:'Noto Serif SC',serif;font-size:12px;letter-spacing:.1em;color:#1A1A1A;}
  .rp-statusblock{border-left:2px solid #9A8C7A;padding-left:12px;display:flex;flex-direction:column;gap:8px;}
  .rp-status-label{display:flex;align-items:center;gap:8px;margin:0;}
  .rp-pulse{width:6px;height:6px;border-radius:50%;background:#9A8C7A;display:inline-block;}
  .rp-status{font-family:'Noto Serif SC',serif;font-size:13px;letter-spacing:.05em;color:#1A1A1A;font-weight:500;margin:0;}
  .rp-tracing{background:rgba(255,255,255,.65);backdrop-filter:blur(12px) saturate(120%);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(0,0,0,.05);box-shadow:0 10px 30px -10px rgba(0,0,0,.08);border-radius:8px;padding:16px;position:relative;transform:rotate(1deg);}
  .rp-tape{position:absolute;background:rgba(240,238,235,.85);border:1px solid rgba(255,255,255,.5);box-shadow:0 2px 5px rgba(0,0,0,.03);width:40px;height:12px;top:-6px;left:50%;transform:translateX(-50%) rotate(-2deg);z-index:10;}
  .rp-note-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(156,163,175,.3);padding-bottom:6px;margin-bottom:8px;}
  .rp-note-title{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:13px;color:#9A8C7A;}
  .rp-note-tag{font-size:8px;font-family:'Inter',sans-serif;color:#9ca3af;letter-spacing:.15em;}
  .rp-note-body{font-family:'Noto Serif SC',serif;font-size:11px;line-height:1.7;letter-spacing:.05em;color:#1A1A1A;margin:0;}
  .rp-mono{padding-top:20px;border-top:1px dashed #d1d5db;}
  .rp-mono-head{display:flex;align-items:center;gap:8px;margin-bottom:12px;color:#9A8C7A;}
  .rp-mono-head span{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#7A7671;}
  .rp-mono-box{background:#F0EEEB;border-radius:6px;padding:16px;box-shadow:inset 0 2px 4px rgba(0,0,0,.06);min-height:80px;}
  .rp-mono-box p{font-family:'Noto Serif SC',serif;font-weight:300;font-size:13px;line-height:1.8;letter-spacing:.1em;color:#2A2826;margin:0;text-align:justify;}
</style>`;

  /* ── 内置预设：报纸风（字段表 + 模板一体）───────────────────── */
  const PRESET_NEWSPAPER = {
    fields: [
      { key: 'paper',        desc: '这份小报的报名（按场景气质起，如「街角晨报」「码头夜讯」）', max: 8 },
      { key: 'issue',        desc: '本期刊号，两位数字（如 07、23）', max: 2 },
      { key: 'char_name_en', desc: '角色英文名或拼音', max: 0 },
      { key: 'role',         desc: '身份头衔', max: 0 },
      { key: 'status',       desc: '一句话状态（做头条用，简短有力）', max: 20 },
      { key: 'mood',         desc: '此刻心情，两个字的词', max: 4 },
      { key: 'god_note',     desc: '上帝视角吐槽（第三人称犀利毒舌，像记者现场点评，绝非角色心声）', max: 45 },
      { key: 'thought',      desc: '内心独白（第一人称真实想法，放进黑底心声专栏）', max: 40 },
      { key: 'memo',         desc: '分类启事，多条用竖线 | 分隔（剧情备忘/伏笔，如：寻：欠债的Joy|注意：后门未锁）', max: 0 },
    ],
    tpl: `<div class="np-wrap"><div class="np-paper">
  <div class="np-masthead">
    <div class="np-eyebrow"><span>Vol.III · No.{{issue}}</span><span>★ ★ ★</span><span>Late Edition</span></div>
    <h1 class="np-title">{{paper}}</h1>
    <div class="np-dateline"><span>{{loc_cn}}</span><span>{{time}}</span><span>定价 一枚硬币</span></div>
  </div>
  <div class="np-headblock">
    <div class="np-kicker">⸻ Headline ⸻</div>
    <h2 class="np-headline">{{char_name_en}}，{{status}}</h2>
    <div class="np-byline">本报记者 · {{role}} · 现场报道</div>
  </div>
  <div class="np-cols">
    <div class="np-col-log"><div class="np-coltag">观察手记 / Log</div><p class="np-logtext">{{god_note}}</p></div>
    <div class="np-col-aside"><div class="np-coltag light">心声 / Aside</div><p class="np-asidetext">"{{thought}}"</p></div>
  </div>
  <div class="np-footrow">
    <div class="np-mood"><div class="np-moodtag">Mood</div><div class="np-moodval">{{mood}}</div></div>
    <div class="np-notices"><div class="np-coltag">分类启事 / Notices</div><div class="np-notice-list" id="np-notices"></div></div>
  </div>
  <div class="np-footer">— Printed at the edge of the night —</div>
</div></div>
<style>
  .np-wrap{width:100%;display:flex;justify-content:center;padding:4px;box-sizing:border-box;}
  .np-paper{width:100%;max-width:400px;background:#F4F1EA;border:1px solid #1A1A1A;color:#1A1A1A;}
  .np-paper *{box-sizing:border-box;}
  .np-masthead{text-align:center;padding:10px 14px 7px;border-bottom:1px solid #1A1A1A;}
  .np-eyebrow{display:flex;justify-content:space-between;font-family:'Space Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:#444;}
  .np-title{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:34px;line-height:1.05;margin:6px 0 3px;letter-spacing:-.01em;}
  .np-dateline{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #1A1A1A;border-bottom:3px double #1A1A1A;padding:3px 0;font-family:'Space Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;}
  .np-headblock{padding:13px 15px 11px;border-bottom:1px solid #1A1A1A;}
  .np-kicker{font-family:'Space Mono',monospace;font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:#8a2c2c;margin-bottom:5px;}
  .np-headline{font-family:'Playfair Display','Noto Serif SC',Georgia,serif;font-weight:700;font-size:27px;line-height:1.12;letter-spacing:-.01em;margin:0;}
  .np-byline{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.06em;color:#444;margin-top:7px;border-top:1px solid rgba(0,0,0,.25);padding-top:5px;}
  .np-cols{display:flex;border-bottom:1px solid #1A1A1A;}
  .np-col-log{flex:1.35;padding:11px 12px;border-right:1px solid #1A1A1A;}
  .np-col-aside{flex:1;padding:11px 12px;background:#1A1A1A;color:#F4F1EA;}
  .np-coltag{font-family:'Space Mono',monospace;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:#8a2c2c;margin-bottom:6px;}
  .np-coltag.light{color:#C9C4BA;}
  .np-logtext{font-family:'Noto Serif SC',serif;font-size:12px;line-height:1.7;margin:0;text-align:justify;}
  .np-logtext::first-letter{float:left;font-family:'Playfair Display',serif;font-weight:900;font-size:34px;line-height:.72;padding:4px 7px 0 0;}
  .np-asidetext{font-family:'Noto Serif SC',serif;font-size:12px;line-height:1.75;margin:0;font-style:italic;}
  .np-footrow{display:flex;align-items:stretch;border-bottom:3px double #1A1A1A;}
  .np-mood{padding:9px 13px;border-right:1px solid #1A1A1A;display:flex;flex-direction:column;justify-content:center;min-width:64px;}
  .np-moodtag{font-family:'Space Mono',monospace;font-size:7px;letter-spacing:.15em;text-transform:uppercase;color:#444;}
  .np-moodval{font-family:'Playfair Display','Noto Serif SC',serif;font-weight:700;font-size:18px;line-height:1.1;margin-top:2px;}
  .np-notices{flex:1;padding:9px 12px;}
  .np-notice-list{display:flex;flex-wrap:wrap;gap:5px;}
  .np-notice{font-family:'Space Mono',monospace;font-size:9px;border:1px solid #1A1A1A;padding:2px 7px;letter-spacing:.02em;}
  .np-footer{text-align:center;padding:6px;font-family:'Space Mono',monospace;font-size:7px;letter-spacing:.25em;text-transform:uppercase;color:#666;}
</style>
<script>
  (function(){
    var raw = "{{memo}}";
    var box = document.getElementById('np-notices');
    if(!box) return;
    if(!raw || raw.indexOf('{'+'{')===0){ box.innerHTML='<span class="np-notice">暂无启事</span>'; return; }
    var items = raw.split(/[|｜]/).map(function(s){return s.trim();}).filter(Boolean);
    box.innerHTML = items.length ? items.map(function(t){ return '<span class="np-notice">'+t.replace(/</g,'&lt;')+'</span>'; }).join('') : '<span class="np-notice">暂无启事</span>';
  })();
<\/script>`
  };

  /* ── 存储读写 ─────────────────────────────────────────────── */
  async function isOn(cid) {
    const db = _DB(); if (!db || cid == null) return false;
    try { return !!(await db.settings.get(K_ON(cid))); } catch (e) { return false; }
  }
  async function _getTpl(cid) {
    const db = _DB();
    try { return (await db.settings.get(K_TPL(cid))) || TEMPLATE_DEFAULT; } catch (e) { return TEMPLATE_DEFAULT; }
  }
  async function _getFields(cid) {
    const db = _DB();
    try {
      const v = await db.settings.get(K_FLDS(cid));
      if (Array.isArray(v) && v.length) return v.map(f => ({ key: String(f.key || '').trim(), desc: f.desc || '', max: Number(f.max) || 0 })).filter(f => f.key);
    } catch (e) {}
    return FIELDS_DEFAULT.slice();
  }
  async function _getPresets() {
    const db = _DB();
    try { const v = await db.settings.get(K_PRESETS); if (Array.isArray(v)) return v; } catch (e) {}
    return [];
  }
  async function _savePresets(arr) {
    const db = _DB();
    try { await db.settings.set(K_PRESETS, arr); return true; } catch (e) { return false; }
  }
  // 每条消息的状态快照（方案 2：单独存 settings，按 cid+msgId）
  async function getStatusOf(cid, msgId) {
    const db = _DB();
    try { return (await db.settings.get(K_STATUSDATA(cid, msgId))) || null; } catch (e) { return null; }
  }
  async function _saveStatusOf(cid, msgId, data) {
    const db = _DB();
    try { await db.settings.set(K_STATUSDATA(cid, msgId), data); return true; } catch (e) { return false; }
  }

  /* ── 占位符填充（{{key}} / $n / {{key.bar}} / {{key.num}}）──── */
  function _fillTpl(tpl, scene, ch, fieldOrder) {
    const fields = ch.fields || {};
    const order = (Array.isArray(fieldOrder) && fieldOrder.length) ? fieldOrder : Object.keys(fields);
    // $n：按字段表顺序
    let out = tpl.replace(/\$(\d{1,2})\b/g, (m, n) => {
      const i = parseInt(n, 10) - 1;
      if (i < 0 || i >= order.length) return m;
      const key = order[i];
      return _esc(fields[key] != null ? fields[key] : '');
    });
    const builtin = {
      loc_cn: scene.locCn || '—', loc_en: scene.locEn || '', time: scene.time || '',
      char_initial: ch.initial || '?', char_name_cn: ch.nameCn || '',
      char_name_en: fields.name_en || ch.nameEn || ch.nameCn || '',
      char_role: fields.role || '', char_status: fields.status || '',
      god_note: fields.god_note || '', thought: fields.thought || '',
    };
    return out.replace(/\{\{([\w.]+)\}\}/g, (m, k) => {
      if (k === 'nav') return m;
      if (k in builtin) return _esc(builtin[k]);
      if (k in fields) return _esc(fields[k]);
      const bm = k.match(/^(\w+)\.bar$/);
      if (bm && bm[1] in fields) {
        const pct = Math.max(0, Math.min(100, parseFloat(fields[bm[1]]) || 0));
        return `<span class="ssbar" style="display:inline-block;height:6px;width:100%;background:rgba(0,0,0,.1);border-radius:3px;overflow:hidden;vertical-align:middle"><span style="display:block;height:100%;width:${pct}%;background:#9A8C7A"></span></span>`;
      }
      const nm = k.match(/^(\w+)\.num$/);
      if (nm && nm[1] in fields) return _esc(String(parseFloat(fields[nm[1]]) || 0));
      return m;
    });
  }

  /* ── 沙箱文档（含修好的 body 真实高度 reporter）────────────── */
  function _wrapDoc(innerHtml, token, allData) {
    const reporter = `<script>(function(){
      function post(){ try{
        var b=document.body, de=document.documentElement;
        var rect=b?b.getBoundingClientRect():null;
        var h=Math.ceil(Math.max(rect?rect.height:0, b?b.scrollHeight:0, b?b.offsetHeight:0));
        if(!h){ h=de.scrollHeight||0; }
        parent.postMessage({__ssHeight:true,token:${JSON.stringify(token)},h:h},'*');
      }catch(e){} }
      window.addEventListener('load',post);
      setTimeout(post,80); setTimeout(post,300); setTimeout(post,800);
      try{ new ResizeObserver(post).observe(document.body); }catch(e){}
    })();<\/script>`;
    const dataScript = allData ? `<script>window.GS_CHARS=${JSON.stringify(allData.chars)};window.GS_SCENE=${JSON.stringify(allData.scene)};window.GS_CUR=${allData.cur || 0};<\/script>` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
      + `<style>html,body{margin:0;padding:0;background:transparent;}</style></head><body>${dataScript}${innerHtml}${reporter}</body></html>`;
  }

  // 构建 GS_CHARS 数组（单人：当前角色 + 用户人设，供模板自定义切换；不用则只取第一个）
  function _buildAllChars(chars, fieldOrder) {
    const order = (Array.isArray(fieldOrder) && fieldOrder.length) ? fieldOrder : [];
    return (chars || []).map(ch => {
      const fields = ch.fields || {};
      return {
        name: ch.nameCn || '',
        initial: ch.initial || '?',
        name_en: fields.name_en || ch.nameEn || '',
        role: fields.role || '',
        fields: fields,
        $: order.map(k => (fields[k] != null ? fields[k] : '')),
      };
    });
  }

  /* ── 从 AI 原文抽取 [STATUS] 块 → 结构化数据 ──────────────────
   * 单人场景：通常只有一行 @角色名，但容错多行（如角色+对手）。
   * 返回 { scene:{locCn,locEn,time}, chars:[{nameCn,initial,nameEn,fields,...}] }
   * ----------------------------------------------------------------- */
  function _parseStatus(raw, fields) {
    if (!raw) return null;
    const fieldList = (Array.isArray(fields) && fields.length) ? fields : FIELDS_DEFAULT;
    let txt = String(raw).replace(/\\n/g, '\n');
    let block = '';
    let m = txt.match(/\[STATUS\]([\s\S]*?)\[\/STATUS\]/i);
    if (m) block = m[1];
    else { m = txt.match(/\[STATUS\]([\s\S]*)$/i); if (m) block = m[1]; }
    if (!block) return null;
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const data = { scene: { locCn: '', locEn: '', time: '' }, chars: [] };
    for (const line of lines) {
      if (/^SCENE\s*\|/i.test(line)) {
        const p = line.split('|');
        data.scene = { locCn: (p[1] || '').trim(), locEn: (p[2] || '').trim(), time: (p[3] || '').trim() };
      } else if (line.startsWith('@')) {
        const p = line.slice(1).split('|');
        const nameCn = (p[0] || '').trim();
        const fieldVals = {};
        fieldList.forEach((f, i) => { fieldVals[f.key] = _cleanField(p[i + 1] || '', f.max || 0); });
        data.chars.push({
          nameCn,
          initial: _initialOf(nameCn),
          nameEn: fieldVals.name_en || '',
          fields: fieldVals,
          role: fieldVals.role || '', status: fieldVals.status || '',
          godNote: fieldVals.god_note || '', thought: fieldVals.thought || '',
        });
      }
    }
    return data.chars.length ? data : null;
  }

  // 剥离正文里的 [STATUS] 块（渲染/存储正文时用），返回干净正文
  function stripStatusBlock(raw) {
    if (!raw) return raw;
    let txt = String(raw).replace(/\\n/g, '\n');
    if (/\[STATUS\][\s\S]*?\[\/STATUS\]/i.test(txt)) {
      txt = txt.replace(/\s*\[STATUS\][\s\S]*?\[\/STATUS\]\s*/i, '\n').trim();
    } else {
      txt = txt.replace(/\s*\[STATUS\][\s\S]*$/i, '').trim();
    }
    return txt;
  }

  /* ── extract：抽取 + 落库（方案 2，按 cid+msgId 存 settings）────
   * 返回剥离后的干净正文，主文件可用它覆盖落库的 content（也可不用）。
   * ----------------------------------------------------------------- */
  async function extract(cid, msgId, raw) {
    if (cid == null || msgId == null) return { clean: raw, status: null };
    let fields = FIELDS_DEFAULT;
    try { fields = await _getFields(cid); } catch (e) {}
    const status = _parseStatus(raw, fields);
    if (status) { try { await _saveStatusOf(cid, msgId, status); } catch (e) {} }
    return { clean: stripStatusBlock(raw), status };
  }

  /* ── buildPrompt：生成要拼进系统提示词的状态填写指令 ──────────
   * charName 可选：传入则指定 @行的角色名（单人就是当前角色名）。
   * ----------------------------------------------------------------- */
  async function buildPrompt(cid, charName) {
    if (!(await isOn(cid))) return '';
    const fl = await _getFields(cid);
    const colTpl = fl.map(f => `<${f.desc || f.key}>`).join('|');
    const fieldRules = fl.map((f, i) => {
      const lim = f.max ? `（≤${f.max}字）` : '';
      return `  第${i + 1}列「${f.desc || f.key}」${lim}`;
    }).join('\n');
    const nameRow = `@${charName || '角色名'}|${colTpl}`;
    return `
# 📊 状态面板数据（强制附加）
在正文**全部结束之后**，另起一段，输出状态数据块，格式严格如下（驱动前端面板，用户看不到原始标记）：

[STATUS]
SCENE|当前地点中文名|当前地点英文或拼音|当前时间(如 23:45 PM)
${nameRow}
[/STATUS]

规则：
- 为当前出场角色输出一行，以 \`@角色名\` 开头，字段用竖线 \`|\` 分隔，**顺序严格按下列定义，不可乱、不可缺列**（没有内容也要留空占位，即连续两个 \`||\`）。
- SCENE 行只有一行，放全局场景信息。
- \`@角色名\` 之后的各列依次为：
${fieldRules}
- 若某列要求是数字（如体力、好感度之类 0-100 的值），**只填纯数字**，不要带单位或文字。
- **不要任何括号或引号包裹**：各列直接写内容，首尾不要 ()（）「」"" 等符号。
- 角色中文名首字母由前端自动处理，\`@\` 后直接写中文名即可。
- 这个块必须放在正文最后，[STATUS] 和 [/STATUS] 单独成行。
`;
  }

  /* ── 弹窗基建（自带，不依赖主文件；挂到剧情屏或 body）────────── */
  const HOST_ID = 'story-chat-screen';
  // 弹窗一律挂 document.body：story-chat-screen 等容器可能有 transform/overflow 形成局部层叠上下文，
  // 会让内部 position:fixed 不相对视口、z-index 失效，导致遮罩盖不住桌面层。挂 body 才能全屏覆盖。
  function _host() { return document.body; }
  function _ensureRoot() {
    let root = document.getElementById('ss-dialog-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ss-dialog-root'; root.className = 'ss-dlg';
      _host().appendChild(root);
    }
    return root;
  }
  function _ensureRoot2() {
    let root = document.getElementById('ss-dialog-root-2');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ss-dialog-root-2'; root.className = 'ss-dlg';
      root.style.zIndex = '2147483000';
      _host().appendChild(root);
    }
    return root;
  }
  function _prompt(title, placeholder = '', defVal = '') {
    return new Promise(resolve => {
      const root = _ensureRoot2();
      root.innerHTML = `
        <div class="ss-dlg-box">
          <div class="ss-dlg-head"><div class="ss-dlg-title">${_esc(title)}</div></div>
          <div class="ss-dlg-body"><input type="text" class="ss-dlg-input" id="ss-prompt-input" placeholder="${_esc(placeholder)}" value="${_esc(defVal)}" style="width:100%;"></div>
          <div class="ss-dlg-foot">
            <button class="ss-dlg-btn ghost" data-act="cancel">取消</button>
            <button class="ss-dlg-btn primary" data-act="ok">确定</button>
          </div>
        </div>`;
      const inp = root.querySelector('#ss-prompt-input');
      const done = (val) => { root.classList.remove('active'); resolve(val); };
      root.querySelector('[data-act="cancel"]').onclick = () => done(null);
      root.querySelector('[data-act="ok"]').onclick = () => done((inp.value || '').trim());
      root.onclick = (e) => { if (e.target === root) done(null); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done((inp.value || '').trim()); });
      requestAnimationFrame(() => { root.classList.add('active'); inp.focus(); });
    });
  }
  function _confirm(title, msg = '') {
    return new Promise(resolve => {
      const root = _ensureRoot2();
      root.innerHTML = `
        <div class="ss-dlg-box">
          <div class="ss-dlg-head"><div class="ss-dlg-title">${_esc(title)}</div></div>
          ${msg ? `<div class="ss-dlg-body"><div class="ss-dlg-text">${msg}</div></div>` : ''}
          <div class="ss-dlg-foot">
            <button class="ss-dlg-btn ghost" data-act="cancel">取消</button>
            <button class="ss-dlg-btn primary" data-act="ok">确定</button>
          </div>
        </div>`;
      const done = (val) => { root.classList.remove('active'); resolve(val); };
      root.querySelector('[data-act="cancel"]').onclick = () => done(false);
      root.querySelector('[data-act="ok"]').onclick = () => done(true);
      root.onclick = (e) => { if (e.target === root) done(false); };
      requestAnimationFrame(() => root.classList.add('active'));
    });
  }

  /* ── 扫描模板 {{字段}} / $n / .fields 取值 → 自动建字段表 ─────── */
  function _fieldsFromTemplate(tpl, existing) {
    const found = [], seen = {};
    const add = (key) => {
      if (BUILTIN_KEYS.indexOf(key) !== -1 || seen[key]) return;
      seen[key] = true;
      const prev = (existing || []).find(f => f.key === key);
      if (prev) { found.push({ ...prev }); return; }
      const hint = KEY_HINTS[key];
      found.push({ key, desc: hint ? hint.desc : '', max: hint ? hint.max : 0 });
    };
    let m;
    const re = /\{\{([\w.]+)\}\}/g;
    while ((m = re.exec(tpl)) !== null) {
      let key = m[1]; const dot = key.match(/^(\w+)\.(bar|num)$/); if (dot) key = dot[1];
      add(key);
    }
    const fre = /\.fields\s*(?:\[\s*['"]([\w]+)['"]\s*\]|\.([\w]+))/g;
    while ((m = fre.exec(tpl)) !== null) { const key = m[1] || m[2]; if (key) add(key); }
    const hre = /\b\w+\s*\(\s*\w+\s*,\s*['"]([\w]+)['"]\s*\)/g;
    while ((m = hre.exec(tpl)) !== null) { if (m[1]) add(m[1]); }
    // $n 补足
    let maxN = 0, dm; const dre = /\$(\d{1,2})\b/g;
    while ((dm = dre.exec(tpl)) !== null) { const n = parseInt(dm[1], 10); if (n > maxN) maxN = n; }
    while (found.length < maxN) {
      const idx = found.length + 1;
      const prev = (existing || [])[idx - 1];
      if (prev && !found.find(f => f.key === prev.key)) found.push({ ...prev });
      else found.push({ key: 'field' + idx, desc: '', max: 0 });
    }
    return found;
  }

  /* ── openPanel：点头像查看状态卡片 ───────────────────────────── */
  let _stCur = 0;
  async function openPanel(cid, msgId) {
    const data = await getStatusOf(cid, msgId);
    if (!data || !data.chars || !data.chars.length) { _toast('这条暂时没有状态数据'); return; }
    const tpl = await _getTpl(cid);
    const fieldOrder = (await _getFields(cid)).map(f => f.key);
    _stCur = 0;
    const root = _ensureRoot();
    root.classList.add('ss-centered');   // 查看面板：垂直居中浮现（区别于编辑器的底部抽屉）

    const _selfSwitch = /GS_CHARS/.test(tpl) && data.chars.length > 1;
    const _allData = _selfSwitch ? { chars: _buildAllChars(data.chars, fieldOrder), scene: data.scene, cur: 0 } : null;
    const token = 'ss-panel-' + Date.now();

    const buildDoc = (ch) => {
      const filled = _fillTpl(tpl, data.scene, ch, fieldOrder).replace(/\{\{nav\}\}/g, '');
      return _wrapDoc(filled, token, _allData);
    };
    const onMsg = (e) => {
      const d = e.data;
      if (d && d.__ssHeight && d.token === token) {
        const f = root.querySelector('#ss-frame');
        if (f && d.h) f.style.height = (d.h + 4) + 'px';
      }
    };
    window.addEventListener('message', onMsg);

    const render = () => {
      const ch = data.chars[_stCur] || data.chars[0];
      const dots = (!_selfSwitch && data.chars.length > 1) ? data.chars.map((c, i) =>
        `<div class="ss-dot${i === _stCur ? ' on' : ''}" data-i="${i}">${_esc(c.initial || '?')}</div>`
      ).join('') : '';
      const navHtml = dots ? `<div class="ss-nav">${dots}</div>` : '';
      let frame = root.querySelector('#ss-frame');
      if (!frame) {
        root.innerHTML = `
          <div class="ss-panel-wrap">
            ${navHtml}
            <div class="ss-stage">
              <iframe id="ss-frame" sandbox="allow-scripts" style="width:100%;min-height:120px;border:0;display:block;background:transparent;" scrolling="no"></iframe>
            </div>
            <div class="ss-close" data-act="close">关闭</div>
          </div>`;
        frame = root.querySelector('#ss-frame');
        const close = () => {
          window.removeEventListener('message', onMsg);
          root.classList.remove('active');
          // 淡出动画结束后清空内容：日夜模板内容超长会撑出可滚动 fixed 层，
          // 即便隐藏，iOS WebView 仍可能截获触摸惯性导致底层聊天滑不动。直接移除 DOM 根治。
          setTimeout(() => { if (!root.classList.contains('active')) { root.innerHTML = ''; root.classList.remove('ss-centered'); } }, 320);
        };
        root.querySelector('[data-act="close"]').onclick = close;
        root.onclick = (e) => { if (e.target === root) close(); };
      } else {
        root.querySelectorAll('.ss-dot').forEach(d => d.classList.toggle('on', Number(d.dataset.i) === _stCur));
      }
      frame.style.height = '120px';   // 切角色归零，等新内容上报真实高度
      frame.srcdoc = buildDoc(ch);
      root.querySelectorAll('.ss-dot').forEach(d => { d.onclick = () => { _stCur = Number(d.dataset.i); render(); }; });
    };
    render();
    requestAnimationFrame(() => root.classList.add('active'));
  }

  /* ── openEditor：状态面板设置（开关+字段表+模板+预设+实时预览）── */
  async function openEditor(cid) {
    if (cid == null) { _toast('未指定角色'); return; }
    const on = await isOn(cid);
    const tpl = await _getTpl(cid);
    let fields = await _getFields(cid);   // 工作副本
    const root = _ensureRoot();
    root.classList.remove('ss-centered');   // 编辑器：底部抽屉式（清掉查看面板可能残留的居中标记）

    const demoScene = { locCn: '塞壬酒馆', locEn: 'THE SIREN TAVERN', time: '23:45 PM' };
    const _demoVal = (f) => {
      const d = (f.desc || '') + f.key;
      if (/0-?100|百分|进度|好感|体力|血|hp|favor|mood?bar/i.test(d) && /\d|0-?100|进度|百分|体力|血|hp|好感/i.test(d)) return '72';
      if (/英文|拼音|name_?en/i.test(d)) return 'Elysia.';
      if (/身份|头衔|role/i.test(d)) return '酒馆老板娘';
      if (/状态|status/i.test(d)) return '表面从容，暗中观察';
      if (/吐槽|上帝|note/i.test(d)) return '说是观察，杯子却擦了十分钟。';
      if (/独白|心声|thought|内心/i.test(d)) return '今晚客人真多……别又惹出乱子。';
      if (/心情|情绪|mood/i.test(d)) return '警惕';
      if (/金币|钱|gold|coin|数值|数字/i.test(d)) return '128';
      return '示例';
    };
    const buildDemoChar = () => {
      const fv = {};
      fields.forEach(f => { if (f.key) fv[f.key] = _demoVal(f); });
      return { initial: 'E', nameCn: '伊丽莎', nameEn: fv.name_en || 'Elysia.', fields: fv,
               role: fv.role || '', status: fv.status || '', godNote: fv.god_note || '', thought: fv.thought || '' };
    };

    const pvToken = 'ss-pv-' + Date.now();
    const drawPreview = () => {
      const t = root.querySelector('#ss-tpl-input');
      const v = t ? t.value : tpl;
      const frame = root.querySelector('#ss-pv-frame');
      if (!frame) return;
      const filled = _fillTpl(v, demoScene, buildDemoChar(), fields.map(f => f.key)).replace(/\{\{nav\}\}/g, '');
      frame.srcdoc = _wrapDoc(filled, pvToken);
    };
    const onPvMsg = (e) => {
      const d = e.data;
      if (d && d.__ssHeight && d.token === pvToken) {
        const f = root.querySelector('#ss-pv-frame');
        if (f && d.h) f.style.height = Math.max(120, d.h + 4) + 'px';
      }
    };
    window.addEventListener('message', onPvMsg);

    const renderFieldRows = () => {
      const box = root.querySelector('#ss-fields');
      if (!box) return;
      box.innerHTML = fields.map((f, i) => `
        <div class="ss-frow" data-i="${i}">
          <input class="ss-fkey" data-f="key" value="${_esc(f.key)}" placeholder="key" spellcheck="false">
          <input class="ss-fdesc" data-f="desc" value="${_esc(f.desc)}" placeholder="给 AI 的说明（这列填什么）" spellcheck="false">
          <input class="ss-fmax" data-f="max" value="${f.max || ''}" placeholder="字数" type="number" min="0" title="软上限，留空不限">
          <button class="ss-fdel" title="删除">✕</button>
        </div>`).join('');
      box.querySelectorAll('.ss-frow').forEach(rowEl => {
        const idx = Number(rowEl.dataset.i);
        rowEl.querySelectorAll('input').forEach(inp => {
          inp.addEventListener('input', () => {
            const fld = inp.dataset.f;
            fields[idx][fld] = fld === 'max' ? (parseInt(inp.value, 10) || 0) : inp.value;
            renderChips(); drawPreview();
          });
        });
        rowEl.querySelector('.ss-fdel').onclick = () => { fields.splice(idx, 1); renderFieldRows(); renderChips(); drawPreview(); };
      });
    };

    const renderChips = () => {
      const box = root.querySelector('#ss-chips');
      if (!box) return;
      const builtin = ['loc_cn', 'loc_en', 'time', 'char_name_cn', 'char_initial'];
      const fieldKeys = fields.filter(f => f.key).map(f => f.key);
      const all = builtin.concat(fieldKeys);
      box.innerHTML = all.map(k => `<button class="ss-chip" data-k="{{${k}}}">{{${k}}}</button>`).join('')
        + fieldKeys.map(k => `<button class="ss-chip ghost" data-k="{{${k}.bar}}">{{${k}.bar}}</button>`).join('');
      box.querySelectorAll('.ss-chip').forEach(c => {
        c.onclick = () => {
          const ta = root.querySelector('#ss-tpl-input');
          const s = ta.selectionStart, val = ta.value, ins = c.dataset.k;
          ta.value = val.slice(0, s) + ins + val.slice(ta.selectionEnd);
          ta.focus(); const p = s + ins.length; ta.setSelectionRange(p, p);
          drawPreview();
        };
      });
    };

    root.innerHTML = `
      <div class="ss-dlg-box ss-ed-box">
        <div class="ss-dlg-head"><div class="ss-dlg-title">状态面板</div><div class="ss-dlg-sub">STATUS · FULLY CUSTOM</div></div>
        <div class="ss-dlg-body">
          <div class="ss-toggle-row">
            <div><div class="ss-tg-main">启用状态面板</div><div class="ss-tg-sub">开启后 AI 按字段表生成数据，点头像查看</div></div>
            <div class="ss-switch${on ? ' on' : ''}" id="ss-switch"><div class="ss-switch-knob"></div></div>
          </div>

          <div class="ss-sec-h">① 字段 / DATA <span>你定数据 · AI 照填</span></div>
          <div class="ss-tip" style="margin-bottom:8px;">key 给模板取值 <b>{{key}}</b> 用；说明是给 AI 看的人话；字数是软上限（留空不限）。0-100 的数字字段可在模板里用 <b>{{key.bar}}</b> 渲染进度条。</div>
          <div id="ss-fields"></div>
          <div class="ss-btns"><button class="ss-mini" id="ss-fadd">+ 加字段</button><button class="ss-mini" id="ss-fdefault">默认字段</button></div>

          <div class="ss-sec-h">② 模板 / TEMPLATE <span>HTML · CSS · JS 全放开</span></div>
          <div id="ss-chips" class="ss-chips"></div>
          <textarea class="ss-dlg-input ss-css-input" id="ss-tpl-input" rows="8" spellcheck="false">${_esc(tpl)}</textarea>
          <div class="ss-btns">
            <button class="ss-mini" id="ss-scan" style="flex:2;border-color:rgba(138,44,44,.4);color:#8a2c2c;">✦ 从模板生成字段</button>
            <button class="ss-mini" id="ss-default">默认模板</button>
          </div>
          <div class="ss-tip">在外面搓好状态栏（{{字段}} 或 $1 $2 都认）直接贴进来，点 <b>从模板生成字段</b> 自动建好字段表，你只需补一句"给 AI 的说明"。脚本在 iframe 沙箱内运行。</div>
          <div class="ss-btns" style="margin-top:6px;"><button class="ss-mini" id="ss-preset-np">📰 一键套用报纸风</button></div>

          <div class="ss-sec-h">★ 我的预设 / PRESETS <span>跨剧情共用</span></div>
          <div class="ss-tip" style="margin-bottom:8px;">把当前字段表 + 模板存成预设，下次任何剧情点一下就套用。点预设套用，点 ✕ 删除。</div>
          <div id="ss-presets" class="ss-preset-list"></div>
          <div class="ss-btns" style="margin-top:6px;"><button class="ss-mini" id="ss-preset-save" style="border-color:rgba(138,44,44,.4);color:#8a2c2c;">＋ 存为预设</button></div>

          <div class="ss-sec-h">③ 预览 / LIVE <span>沙箱 · 示例数据</span></div>
          <div class="ss-pv"><iframe id="ss-pv-frame" sandbox="allow-scripts" scrolling="no" style="width:100%;height:300px;min-height:120px;border:0;display:block;background:transparent;"></iframe></div>
        </div>
        <div class="ss-dlg-foot">
          <button class="ss-dlg-btn ghost" data-act="close">关闭</button>
          <button class="ss-dlg-btn primary" data-act="save">保存</button>
        </div>
      </div>`;

    const close = () => { window.removeEventListener('message', onPvMsg); root.classList.remove('active'); };
    const sw = root.querySelector('#ss-switch');
    sw.onclick = () => sw.classList.toggle('on');
    const ta = root.querySelector('#ss-tpl-input');
    ta.addEventListener('input', drawPreview);
    root.querySelector('#ss-default').onclick = () => { ta.value = TEMPLATE_DEFAULT; drawPreview(); };
    root.querySelector('#ss-fadd').onclick = () => { fields.push({ key: 'field' + (fields.length + 1), desc: '', max: 0 }); renderFieldRows(); renderChips(); drawPreview(); };
    root.querySelector('#ss-fdefault').onclick = () => { fields = FIELDS_DEFAULT.map(f => ({ ...f })); renderFieldRows(); renderChips(); drawPreview(); };
    root.querySelector('#ss-scan').onclick = () => {
      const scanned = _fieldsFromTemplate(ta.value, fields);
      if (!scanned.length) { _toast('没扫到字段，确认模板里有 {{字段}}、$n 或 .fields 取值'); return; }
      fields = scanned;
      renderFieldRows(); renderChips(); drawPreview();
      const blanks = fields.filter(f => !f.desc).length;
      _toast(blanks ? `已生成 ${fields.length} 个字段，还有 ${blanks} 个待补说明` : `已生成 ${fields.length} 个字段 ✦`);
    };
    root.querySelector('#ss-preset-np').onclick = () => {
      fields = PRESET_NEWSPAPER.fields.map(f => ({ ...f }));
      ta.value = PRESET_NEWSPAPER.tpl;
      if (!sw.classList.contains('on')) sw.classList.add('on');
      renderFieldRows(); renderChips(); drawPreview();
      _toast('报纸风已套用，保存即可 📰');
    };
    // 我的预设
    let _presets = [];
    const renderPresets = () => {
      const box = root.querySelector('#ss-presets');
      if (!box) return;
      if (!_presets.length) {
        box.innerHTML = `<div class="ss-tip" style="opacity:.6;padding:2px 0;">还没有预设，点下面「＋ 存为预设」把当前这套存起来。</div>`;
        return;
      }
      box.innerHTML = _presets.map((p, i) =>
        `<span class="ss-preset-chip" data-i="${i}">${_esc(p.name || '未命名')}<b class="ss-preset-del" data-del="${i}">✕</b></span>`
      ).join('');
      box.querySelectorAll('.ss-preset-chip').forEach(c => {
        c.onclick = (e) => {
          if (e.target.classList.contains('ss-preset-del')) return;
          const p = _presets[Number(c.dataset.i)];
          if (!p) return;
          fields = (p.fields || []).map(f => ({ ...f }));
          ta.value = p.tpl || '';
          if (!sw.classList.contains('on')) sw.classList.add('on');
          renderFieldRows(); renderChips(); drawPreview();
          _toast(`已套用「${p.name}」，保存即可 ✦`);
        };
      });
      box.querySelectorAll('.ss-preset-del').forEach(b => {
        b.onclick = async (e) => {
          e.stopPropagation();
          const i = Number(b.dataset.del); const p = _presets[i];
          if (!p) return;
          if (!(await _confirm('删除预设', `删除预设「${_esc(p.name)}」？`))) return;
          _presets.splice(i, 1); await _savePresets(_presets); renderPresets(); _toast('已删除');
        };
      });
    };
    root.querySelector('#ss-preset-save').onclick = async () => {
      const clean = fields.map(f => ({ key: String(f.key || '').trim(), desc: f.desc || '', max: Number(f.max) || 0 })).filter(f => f.key);
      if (!clean.length) { _toast('先建至少一个字段再存'); return; }
      const name = await _prompt('存为预设', '给这个预设起个名字');
      if (!name) return;
      const existIdx = _presets.findIndex(p => p.name === name);
      const entry = { id: 'p' + Date.now(), name, fields: clean, tpl: ta.value };
      if (existIdx >= 0) { if (!(await _confirm('覆盖预设', `已有同名预设「${_esc(name)}」，覆盖它？`))) return; _presets[existIdx] = entry; }
      else _presets.push(entry);
      await _savePresets(_presets); renderPresets(); _toast(`已存为预设「${name}」★`);
    };
    root.querySelector('[data-act="close"]').onclick = close;
    root.querySelector('[data-act="save"]').onclick = async () => {
      const clean = fields.map(f => ({ key: String(f.key || '').trim(), desc: f.desc || '', max: Number(f.max) || 0 })).filter(f => f.key);
      if (!clean.length) { _toast('至少保留一个字段'); return; }
      try {
        const db = _DB();
        await db.settings.set(K_ON(cid), sw.classList.contains('on'));
        await db.settings.set(K_TPL(cid), ta.value);
        await db.settings.set(K_FLDS(cid), clean);
        _toast('状态面板已保存 ✦');
      } catch (e) { _toast('保存失败'); }
      close();
    };
    root.onclick = (e) => { if (e.target === root) close(); };
    renderFieldRows(); renderChips(); drawPreview();
    _getPresets().then(arr => { _presets = arr || []; renderPresets(); });
    requestAnimationFrame(() => root.classList.add('active'));
  }

  /* ── 注入 CSS（自带，命名空间 ss-，暖灰编辑风）─────────────── */
  function _injectCSS() {
    if (document.getElementById('ss-status-style')) return;
    const css = `
    .ss-dlg{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:flex-end;justify-content:center;
      background:rgba(20,18,16,0);pointer-events:none;transition:background .28s ease;}
    /* 查看面板：垂直居中浮现（编辑器仍走默认的底部抽屉） */
    .ss-dlg.ss-centered{align-items:center;padding:20px 12px;box-sizing:border-box;pointer-events:none;}
    .ss-dlg.ss-centered.active{pointer-events:auto;}
    .ss-dlg.ss-centered .ss-panel-wrap{transform:translateY(16px) scale(.98);opacity:0;pointer-events:none;
      max-height:0;overflow:hidden;
      transition:transform .3s cubic-bezier(.16,1,.3,1),opacity .26s ease;}
    .ss-dlg.ss-centered.active .ss-panel-wrap{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;
      max-height:92vh;overflow-y:auto;}
    .ss-dlg.active{background:rgba(20,18,16,.46);pointer-events:auto;}
    .ss-dlg-box{width:100%;max-width:440px;max-height:92vh;overflow-y:auto;background:#F4F1EA;color:#1A1A1A;
      border-radius:18px 18px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.25);transform:translateY(100%);
      transition:transform .32s cubic-bezier(.16,1,.3,1);-webkit-overflow-scrolling:touch;}
    .ss-dlg.active .ss-dlg-box{transform:translateY(0);}
    .ss-dlg-box::-webkit-scrollbar{display:none;}
    .ss-dlg-head{padding:20px 22px 12px;border-bottom:1px solid rgba(0,0,0,.08);position:sticky;top:0;background:#F4F1EA;z-index:2;}
    .ss-dlg-title{font-family:'Noto Serif SC',serif;font-size:17px;font-weight:600;letter-spacing:.05em;}
    .ss-dlg-sub{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.2em;color:#8a8478;margin-top:3px;text-transform:uppercase;}
    .ss-dlg-body{padding:16px 22px;}
    .ss-dlg-foot{padding:12px 22px max(env(safe-area-inset-bottom,16px),16px);display:flex;gap:10px;
      border-top:1px solid rgba(0,0,0,.08);position:sticky;bottom:0;background:#F4F1EA;}
    .ss-dlg-btn{flex:1;padding:11px 0;border-radius:10px;font-family:'Space Mono',monospace;font-size:12px;
      letter-spacing:.08em;cursor:pointer;border:1px solid transparent;transition:.18s;}
    .ss-dlg-btn.ghost{background:transparent;border-color:rgba(0,0,0,.2);color:#5a554c;}
    .ss-dlg-btn.primary{background:#1A1A1A;color:#F4F1EA;}
    .ss-dlg-btn.primary:active{transform:scale(.97);}
    .ss-dlg-text{font-family:'Noto Serif SC',serif;font-size:13px;line-height:1.7;color:#3a352e;}
    .ss-dlg-input{background:#FBFAF7;border:1px solid rgba(0,0,0,.15);border-radius:8px;padding:9px 11px;
      font-family:'Space Mono',monospace;font-size:12px;color:#1A1A1A;outline:none;box-sizing:border-box;}
    .ss-dlg-input:focus{border-color:#8a2c2c;}
    .ss-css-input{width:100%;resize:vertical;line-height:1.5;}
    /* 开关 */
    .ss-toggle-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:6px 0 14px;}
    .ss-tg-main{font-family:'Noto Serif SC',serif;font-size:14px;font-weight:600;}
    .ss-tg-sub{font-size:11px;color:#8a8478;margin-top:3px;line-height:1.4;}
    .ss-switch{width:46px;height:26px;border-radius:13px;background:rgba(0,0,0,.18);position:relative;flex-shrink:0;cursor:pointer;transition:background .22s;}
    .ss-switch.on{background:#8a2c2c;}
    .ss-switch-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .22s;box-shadow:0 1px 3px rgba(0,0,0,.3);}
    .ss-switch.on .ss-switch-knob{transform:translateX(20px);}
    /* 小节标题 */
    .ss-sec-h{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;
      color:#1A1A1A;margin:20px 0 10px;display:flex;align-items:center;gap:8px;border-top:1px dashed rgba(0,0,0,.15);padding-top:14px;}
    .ss-sec-h span{font-size:9px;color:#a39c8f;letter-spacing:.05em;text-transform:none;}
    .ss-tip{font-size:11px;line-height:1.6;color:#7a7468;}
    .ss-tip b{color:#8a2c2c;font-weight:600;}
    /* 字段行 */
    .ss-frow{display:flex;gap:6px;margin-bottom:6px;align-items:center;}
    .ss-frow .ss-fkey{width:84px;flex-shrink:0;background:#FBFAF7;border:1px solid rgba(0,0,0,.15);border-radius:6px;padding:7px 8px;font-family:'Space Mono',monospace;font-size:11px;outline:none;box-sizing:border-box;}
    .ss-frow .ss-fdesc{flex:1;min-width:0;background:#FBFAF7;border:1px solid rgba(0,0,0,.15);border-radius:6px;padding:7px 8px;font-family:'Noto Serif SC',serif;font-size:12px;outline:none;box-sizing:border-box;}
    .ss-frow .ss-fmax{width:46px;flex-shrink:0;background:#FBFAF7;border:1px solid rgba(0,0,0,.15);border-radius:6px;padding:7px 4px;font-family:'Space Mono',monospace;font-size:11px;text-align:center;outline:none;box-sizing:border-box;}
    .ss-frow input:focus{border-color:#8a2c2c;}
    .ss-frow .ss-fdel{width:26px;height:26px;flex-shrink:0;border:none;background:transparent;color:#b0a99c;font-size:13px;cursor:pointer;border-radius:6px;}
    .ss-frow .ss-fdel:active{background:rgba(0,0,0,.06);}
    .ss-btns{display:flex;gap:8px;margin-top:8px;}
    .ss-mini{flex:1;padding:8px 0;border:1px solid rgba(0,0,0,.2);border-radius:7px;background:transparent;
      font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.05em;color:#5a554c;cursor:pointer;transition:.16s;}
    .ss-mini:active{background:rgba(0,0,0,.05);}
    /* 占位药丸 */
    .ss-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px;}
    .ss-chip{border:1px solid rgba(0,0,0,.2);background:#FBFAF7;border-radius:20px;padding:3px 9px;
      font-family:'Space Mono',monospace;font-size:10px;color:#3a352e;cursor:pointer;transition:.16s;}
    .ss-chip:active{background:#1A1A1A;color:#fff;}
    .ss-chip.ghost{opacity:.6;border-style:dashed;}
    /* 预设 */
    .ss-preset-list{display:flex;flex-wrap:wrap;gap:6px;}
    .ss-preset-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(0,0,0,.2);
      background:#FBFAF7;border-radius:20px;padding:5px 10px;font-family:'Noto Serif SC',serif;font-size:12px;color:#1A1A1A;cursor:pointer;}
    .ss-preset-chip .ss-preset-del{color:#b0a99c;font-size:10px;font-weight:400;cursor:pointer;}
    .ss-preset-chip .ss-preset-del:active{color:#8a2c2c;}
    /* 预览 */
    .ss-pv{background:rgba(0,0,0,.03);border-radius:10px;padding:4px;border:1px solid rgba(0,0,0,.06);}
    /* ── 查看面板（点头像）── */
    .ss-panel-wrap{width:100%;max-width:440px;max-height:92vh;overflow-y:auto;background:transparent;
      transform:translateY(20px);transition:transform .3s cubic-bezier(.16,1,.3,1);padding-bottom:env(safe-area-inset-bottom,16px);}
    .ss-dlg.active .ss-panel-wrap{transform:translateY(0);}
    .ss-panel-wrap::-webkit-scrollbar{display:none;}
    .ss-nav{display:flex;justify-content:center;gap:10px;padding:10px 0 4px;flex-wrap:wrap;}
    .ss-dot{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.15);
      backdrop-filter:blur(8px);color:#fff;display:flex;align-items:center;justify-content:center;
      font-family:'Cormorant Garamond',serif;font-size:16px;cursor:pointer;transition:.25s;}
    .ss-dot.on{background:#fff;color:#1A1A1A;transform:scale(1.1);}
    .ss-stage{width:100%;}
    .ss-close{text-align:center;margin:12px auto 4px;width:fit-content;padding:8px 28px;border-radius:20px;
      background:rgba(255,255,255,.15);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.4);
      color:#fff;font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.15em;cursor:pointer;text-transform:uppercase;}
    .ss-close:active{background:rgba(255,255,255,.3);}
    `;
    const st = document.createElement('style');
    st.id = 'ss-status-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // 自注入 CSS
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _injectCSS);
    else _injectCSS();
  }

  /* ── 导出 ─────────────────────────────────────────────────── */
  return {
    isOn,                 // (cid) → bool
    openPanel,            // (cid, msgId) 点头像查看
    openEditor,           // (cid) 设置面板入口
    buildPrompt,          // (cid, charName) → 提示词段
    extract,              // (cid, msgId, raw) → {clean, status}
    stripStatusBlock,     // (raw) → 干净正文
    getStatusOf,          // (cid, msgId) → status|null
    _parseStatus,         // 内部解析（swipe 重填钩子用，见 README）
  };
})();
if (typeof window !== 'undefined') window.StoryStatus = StoryStatus;

/* ============================================================================
 * StoryMusic — 单人剧情【网易云配乐】（复刻群像，渲染适配单人 _parseStoryText）
 * ----------------------------------------------------------------------------
 * 物理上与 StoryStatus 同处一个文件，但逻辑完全独立、各自 IIFE / window 导出。
 * 机制：AI 在剧情回复里吐 `【BGM】歌手 - 歌名` 标记 → _parseStoryText 把该行替
 *       换成 pending 播放条 → 渲染后 resolvePending() 扫描抓歌填充 → 点击播放。
 * 配置：全局 sc-netease-config（与群像 gs-netease-config 各自独立，互不影响）。
 * 面板：居中弹窗（不是底部抽屉）。
 * 暴露：window.StoryMusic = { isReady, openPanel, buildPrompt, playerHtml,
 *                            resolvePending, toggle }
 * 主文件 wiring（详见末尾 README）：
 *   1) story-status.js 已引入，无需再加 script
 *   2) _parseStoryText 里把【BGM】行替换成 StoryMusic.playerHtml(关键词)
 *   3) _appendCard 之后调 StoryMusic.resolvePending()
 *   4) 系统提示词拼 await StoryMusic.buildPrompt()
 *   5) ＋菜单加按钮 → StoryMusic.openPanel()
 * ========================================================================== */
const StoryMusic = (() => {
  'use strict';

  const _DB = () => (typeof DB !== 'undefined' ? DB : null);
  const _toast = (m) => { try { if (typeof Toast !== 'undefined' && Toast.show) Toast.show(m); } catch (e) {} };
  const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const K_CFG = 'sc-netease-config';   // 与群像 gs-netease-config 独立
  let _audio = null;                   // 单人全局单一播放实例

  async function _getConfig() {
    const db = _DB();
    try {
      const c = await db.settings.get(K_CFG);
      return c && typeof c === 'object' ? c : { enabled: false, base: '', cookie: '' };
    } catch (e) { return { enabled: false, base: '', cookie: '' }; }
  }
  async function isReady() {
    const c = await _getConfig();
    return !!(c.enabled && c.base && c.base.trim() && c.cookie && c.cookie.trim());
  }
  function _slimCookie(raw) {
    if (!raw) return '';
    const m = String(raw).match(/MUSIC_U=[^;]+/);
    return m ? m[0] : String(raw).trim();
  }

  // 抓取：关键词 → { id, title, artist, audioUrl, coverUrl } | null
  async function _fetch(keyword) {
    if (!keyword || keyword === 'null') return null;
    const cfg = await _getConfig();
    if (!cfg.enabled || !cfg.base || !cfg.cookie) return null;
    const base = cfg.base.trim().replace(/\/+$/, '');
    const cookieParam = `&cookie=${encodeURIComponent(_slimCookie(cfg.cookie))}`;
    const ts = `timerstamp=${Date.now()}`;
    try {
      const sRes = await fetch(`${base}/search?keywords=${encodeURIComponent(keyword)}&limit=5&${ts}${cookieParam}`);
      const sData = await sRes.json();
      const songs = sData.result && sData.result.songs;
      if (!songs || !songs.length) return null;
      const ids = songs.map(s => s.id).join(',');
      const uRes = await fetch(`${base}/song/url/v1?id=${ids}&level=exhigh&${ts}${cookieParam}`);
      const uData = await uRes.json();
      const valid = uData.data && uData.data.find(it => it.url && it.url.trim());
      if (!valid) return null;
      const meta = songs.find(s => s.id === valid.id) || songs[0];
      let coverUrl = '';
      try {
        const dRes = await fetch(`${base}/song/detail?ids=${valid.id}&${ts}${cookieParam}`);
        const dData = await dRes.json();
        coverUrl = (dData.songs && dData.songs[0] && dData.songs[0].al && dData.songs[0].al.picUrl) || '';
      } catch (e) {}
      return { id: valid.id, title: meta.name || keyword, artist: (meta.artists && meta.artists[0] && meta.artists[0].name) || 'Unknown', audioUrl: (valid.url || '').replace('http://', 'https://'), coverUrl };
    } catch (e) {
      console.warn('[StoryMusic] 网易云抓取失败', e);
      return null;
    }
  }

  // 提示词：选曲铁律（拼进系统提示词）
  async function buildPrompt() {
    if (!(await isReady())) return '';
    return `
# 🎵 BGM 选曲指令（重要）
当某一幕出现强烈的情绪节点（重逢、离别、深夜独处、情绪爆发、暧昧升温、并肩沉默等），你必须为这一幕配一首**网易云音乐**里的歌，单独起一行插入标记，格式严格为：
【BGM】歌手名 - 歌名
（例：【BGM】The Weeknd - Starboy）

**⚠️ 选曲铁律：**
1. **拒绝千篇一律**：严禁总是选《Merry Christmas Mr. Lawrence》《Cornfield Chase》这类烂大街的纯音乐！
2. **风格多样化**：根据此刻情绪，大胆选择**带人声/歌词**的歌：
   - 都市情感 → R&B / Soul / City Pop（如 The Weeknd、落日飞车）
   - 情绪宣泄 → Indie Rock / Alternative（如 Radiohead、告五人）
   - 怀旧 → 经典华语 / 欧美老歌（如 王菲、Lana Del Rey）
   - **不要只局限于纯音乐/古典乐！要"像电影插曲"一样有词的歌。**
3. **精准格式**：关键词必须是 \`歌手名 - 歌名\`，这样搜索才准。
4. **节制**：一幕之内最多 1 首，普通段落不必配乐，确保每次选的歌是新的、风格独特、契合当下情绪。
5. 直接写这一行标记，不要解释、不要加书名号、不要写"配乐："之类前缀。
`;
  }

  // 播放/暂停（单实例 + 实时重换链 + 互斥）
  async function toggle(playerEl) {
    const songId = playerEl.dataset.id;
    let src = playerEl.dataset.src;
    if (!songId && !src) return;
    if (!_audio) { _audio = new Audio(); _audio.loop = true; }
    const btn = playerEl.querySelector('.sm-music-btn');

    if (_audio.dataset.songId === songId && _audio.src) {
      if (_audio.paused) { try { await _audio.play(); } catch (e) {} _setUI(playerEl, true); }
      else { _audio.pause(); _setUI(playerEl, false); }
      return;
    }
    if (songId) {
      if (btn) btn.textContent = '⋯';
      const cfg = await _getConfig();
      if (cfg.base && cfg.cookie) {
        try {
          const base = cfg.base.trim().replace(/\/+$/, '');
          const cookieParam = `&cookie=${encodeURIComponent(_slimCookie(cfg.cookie))}`;
          const r = await fetch(`${base}/song/url/v1?id=${songId}&level=exhigh&timerstamp=${Date.now()}${cookieParam}`);
          const d = await r.json();
          const v = d.data && d.data.find(it => it.url && it.url.trim());
          if (v) { src = (v.url || '').replace('http://', 'https://'); playerEl.dataset.src = src; }
        } catch (e) {}
      }
    }
    if (!src) { _toast('暂无可用音源'); if (btn) btn.textContent = '▶'; return; }
    document.querySelectorAll('.sm-music-player').forEach(p => _setUI(p, false));
    _audio.src = src;
    _audio.dataset.songId = songId || '';
    try { await _audio.play(); _setUI(playerEl, true); }
    catch (e) { if (btn) btn.textContent = '▶'; }
  }
  function _setUI(playerEl, playing) {
    const btn = playerEl.querySelector('.sm-music-btn');
    const wave = playerEl.querySelector('.sm-music-wave');
    if (btn) btn.textContent = playing ? '❚❚' : '▶';
    if (wave) wave.classList.toggle('playing', playing);
  }

  // 【BGM】关键词 → pending 播放条 HTML（_parseStoryText 调用）
  function playerHtml(query) {
    const q = String(query || '').trim();
    return `<div class="sm-music-player sm-music-pending" data-q="${_esc(q)}">`
      + `<div class="sm-music-cover sm-music-cover-empty"><span class="sm-music-note">♪</span></div>`
      + `<div class="sm-music-perf"><div class="sm-music-meta"><span class="sm-music-title">检索配乐…</span><span class="sm-music-artist">${_esc(q)}</span></div>`
      + `<div class="sm-music-foot"><span class="sm-music-code">NETEASE · BGM</span><span class="sm-music-wave"><i></i><i></i><i></i><i></i></span></div></div>`
      + `<div class="sm-music-stub"><span class="sm-music-btn">⋯</span></div></div>`;
  }

  // 渲染后扫描所有 pending 播放条，抓歌填充（抓不到则移除）
  async function resolvePending() {
    const nodes = Array.from(document.querySelectorAll('.sm-music-pending'));
    for (const node of nodes) {
      const q = node.dataset.q;
      node.classList.remove('sm-music-pending');
      const data = await _fetch(q);
      if (data) {
        node.dataset.id = data.id;
        node.dataset.src = data.audioUrl;
        node.setAttribute('onclick', 'StoryMusic.toggle(this)');
        node.style.cursor = 'pointer';
        const cover = data.coverUrl
          ? `<div class="sm-music-cover" style="background-image:url('${_esc(data.coverUrl)}')"></div>`
          : `<div class="sm-music-cover sm-music-cover-empty"><span class="sm-music-note">♪</span></div>`;
        node.innerHTML = `${cover}<div class="sm-music-perf"><div class="sm-music-meta"><span class="sm-music-title">${_esc(data.title)}</span><span class="sm-music-artist">${_esc(data.artist)}</span></div><div class="sm-music-foot"><span class="sm-music-code">NETEASE · BGM</span><span class="sm-music-wave"><i></i><i></i><i></i><i></i></span></div></div><div class="sm-music-stub"><span class="sm-music-btn">▶</span></div>`;
      } else {
        node.remove();
      }
    }
  }

  /* ── 配置面板（居中弹窗，复用 ss-dlg + ss-centered 那套已修好滑动的居中层）── */
  function _ensureRoot() {
    let root = document.getElementById('sm-dialog-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sm-dialog-root';
      root.className = 'ss-dlg ss-centered';   // 借用 story-status 注入的居中弹层样式
      root.style.zIndex = '2147482500';
      document.body.appendChild(root);
    }
    root.className = 'ss-dlg ss-centered';
    return root;
  }

  async function openPanel() {
    const cfg = await _getConfig();
    const root = _ensureRoot();
    root.innerHTML = `
      <div class="ss-dlg-box sm-box">
        <div class="ss-dlg-head"><div class="ss-dlg-title">网易云配乐</div><div class="ss-dlg-sub">NETEASE · BGM</div></div>
        <div class="ss-dlg-body">
          <div class="ss-toggle-row">
            <div><div class="ss-tg-main">启用配乐</div><div class="ss-tg-sub">开启后 AI 会随剧情情绪自动点歌</div></div>
            <div class="ss-switch${cfg.enabled ? ' on' : ''}" id="sm-switch"><div class="ss-switch-knob"></div></div>
          </div>
          <div class="ss-sec-h">网易云 API 地址</div>
          <input type="text" class="ss-dlg-input" id="sm-base" placeholder="https://你的网易云api地址" value="${_esc(cfg.base || '')}" spellcheck="false" style="width:100%;">
          <div class="ss-sec-h">Cookie（MUSIC_U）</div>
          <textarea class="ss-dlg-input ss-css-input" id="sm-cookie" rows="4" placeholder="粘贴你的 MUSIC_U=... cookie" spellcheck="false">${_esc(cfg.cookie || '')}</textarea>
          <div class="ss-tip" style="margin-top:8px;">需自行部署网易云 API 并填入自己的 cookie。开关关闭、或地址/cookie 任一留空时，不会触发配乐。<b>注意：开配乐时记得开🪄，否则抓不到歌。</b></div>
          <div class="ss-tip" style="border-top:.5px solid rgba(0,0,0,.08);padding-top:8px;margin-top:8px;">
            <b style="display:block;margin-bottom:4px;">怎么获取 cookie？</b>
            1. 电脑浏览器打开 <b>music.163.com</b> 并登录（建议 VIP 账号）<br>
            2. 按 <b>F12</b> 打开开发者工具 → 顶部切到 <b>Application</b>（应用）<br>
            3. 左侧 <b>Storage → Cookies</b> → 点 <b>https://music.163.com</b><br>
            4. 找到名为 <b>MUSIC_U</b> 的那一行，复制它的 <b>Value</b><br>
            5. 这里粘贴成 <b>MUSIC_U=刚复制的值</b> 即可（前面的 MUSIC_U= 要带上）
          </div>
        </div>
        <div class="ss-dlg-foot">
          <button class="ss-dlg-btn ghost" data-act="close">关闭</button>
          <button class="ss-dlg-btn primary" data-act="save">保存</button>
        </div>
      </div>`;
    const close = () => {
      root.classList.remove('active');
      setTimeout(() => { if (!root.classList.contains('active')) root.innerHTML = ''; }, 320);
    };
    const sw = root.querySelector('#sm-switch');
    sw.onclick = () => sw.classList.toggle('on');
    root.querySelector('[data-act="close"]').onclick = close;
    root.querySelector('[data-act="save"]').onclick = async () => {
      try {
        const db = _DB();
        await db.settings.set(K_CFG, {
          enabled: sw.classList.contains('on'),
          base: (root.querySelector('#sm-base').value || '').trim(),
          cookie: (root.querySelector('#sm-cookie').value || '').trim(),
        });
        _toast('配乐设置已保存 ✦');
      } catch (e) { _toast('保存失败'); }
      close();
    };
    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => root.classList.add('active'));
  }

  /* ── 播放条 CSS（sm- 前缀，照搬群像票根风）── */
  function _injectCSS() {
    if (document.getElementById('sm-music-style')) return;
    const css = `
    .sm-music-player{position:relative;display:flex;align-items:stretch;gap:0;margin:12px 0;background:transparent;border:1px solid rgba(0,0,0,.22);cursor:pointer;font-family:'Space Mono','SFMono-Regular',monospace;overflow:hidden;-webkit-tap-highlight-color:transparent;transition:opacity .2s;}
    .sm-music-player::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.22) 0 5px,transparent 5px 10px);opacity:.5;}
    .sm-music-player:active{opacity:.72;}
    .sm-music-cover{flex:0 0 auto;width:52px;height:52px;margin:9px 0 9px 9px;background-size:cover;background-position:center;background-color:#e8e6e1;filter:grayscale(.35) contrast(1.02);border:.5px solid rgba(0,0,0,.18);}
    .sm-music-cover-empty{display:flex;align-items:center;justify-content:center;}
    .sm-music-note{font-size:18px;color:#999;opacity:.6;}
    .sm-music-perf{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:9px 4px 9px 12px;}
    .sm-music-meta{display:flex;flex-direction:column;gap:2px;min-width:0;}
    .sm-music-title{font-size:12.5px;font-weight:700;letter-spacing:.01em;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .sm-music-artist{font-size:10px;letter-spacing:.05em;color:#888;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .sm-music-foot{display:flex;align-items:center;gap:8px;}
    .sm-music-code{font-size:8px;letter-spacing:.16em;color:#aaa;text-transform:uppercase;white-space:nowrap;}
    .sm-music-wave{flex:0 0 auto;display:flex;align-items:flex-end;gap:2px;height:11px;}
    .sm-music-wave i{width:2px;height:3px;background:#999;}
    .sm-music-wave.playing i{animation:smWave .85s ease-in-out infinite;}
    .sm-music-wave.playing i:nth-child(2){animation-delay:.22s;}
    .sm-music-wave.playing i:nth-child(3){animation-delay:.44s;}
    .sm-music-wave.playing i:nth-child(4){animation-delay:.13s;}
    @keyframes smWave{0%,100%{height:3px;}50%{height:11px;}}
    .sm-music-stub{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:42px;border-left:1px dashed rgba(0,0,0,.28);}
    .sm-music-btn{width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#1a1a1a;border:1px solid rgba(0,0,0,.34);border-radius:50%;}
    .sm-music-pending{opacity:.6;cursor:default;}
    .sm-music-pending .sm-music-stub{border-left-color:rgba(0,0,0,.18);}
    `;
    const st = document.createElement('style');
    st.id = 'sm-music-style';
    st.textContent = css;
    document.head.appendChild(st);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _injectCSS);
    else _injectCSS();
  }

  return {
    isReady,         // () → bool
    openPanel,       // () ＋菜单配置弹窗（居中）
    buildPrompt,     // () → 选曲铁律提示词
    playerHtml,      // (query) → pending 播放条 HTML
    resolvePending,  // () 渲染后抓歌填充
    toggle,          // (el) 点击播放/暂停
  };
})();
if (typeof window !== 'undefined') window.StoryMusic = StoryMusic;