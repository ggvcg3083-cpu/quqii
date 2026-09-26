/* group-story.js — 群像剧情模式（GroupStory）独立子模块。三层导航：面具墙 / 工作区 / 群像聊天页。
 * 存储走 DB.settings + DB.messages(charId=群组id 隔离) + Assets。依赖：DB/Assets/Toast/PersonaModule/WBModule/ApiHelper。 */

const GroupStoryModule = (() => {
  'use strict';

  // ───────────────────────── 内部状态 ─────────────────────────
  const SCREEN_ID   = 'group-story-screen';
  const DEFAULT_GROUP_AVATAR = 'https://i.postimg.cc/V60zGWMN/IMG-9971.jpg';  // 群像默认头像
  const STORE_KEY   = 'group-stories';            // DB.settings 里群组数组的键
  const PAGE_SIZE   = 15;

  let _mounted      = false;                       // DOM 是否已注入
  let _stories      = [];                          // 全部群组档案缓存
  let _activePersona = null;                       // 当前进入的面具对象
  let _activeStory  = null;                        // 当前打开的群组档案
  let _userAvatarUrl = '';                         // 当前面具的真实头像URL（聊天页用户卡片用）
  let _aiBusy        = false;                       // AI 续写中标志，防重复触发
  let _sessionApiId  = null;                         // 群像会话级 API 覆盖（不写 DB、不同步设置页）
  let _sessionModel  = null;                         // 群像会话级模型覆盖
  let _gsFetchedModels = {};                          // { [apiId]: string[] } 模型列表缓存
  let _gsExpandedApi = null;                          // 当前展开模型选择器的 API id
  let _offset        = 0;                            // 分页：已加载条数
  let _totalMsgs     = 0;                            // 分页：消息总数
  let _nameMap       = {};                           // 缓存：角色 id→名字（loadMore 复用）
  let _avatarMap     = {};                           // 缓存：角色 id→头像（loadMore 复用）
  let _rcColors      = { rc: 'rgba(0,0,0,0.3)', bar: 'rgba(0,0,0,0.12)', arr: 'rgba(0,0,0,0.3)', text: '#1a1a1a', dial: '#111111', act: '#888888', inn: '#5D6B78', utext: '#1a1a1a', udial: '#111111', uact: '#888888', uinn: '#5D6B78' };  // 卡片配色
  const _RC_DEFAULT  = { rc: 'rgba(0,0,0,0.3)', bar: 'rgba(0,0,0,0.12)', arr: 'rgba(0,0,0,0.3)', text: '#1a1a1a', dial: '#111111', act: '#888888', inn: '#5D6B78', utext: '#1a1a1a', udial: '#111111', uact: '#888888', uinn: '#5D6B78' };
  let _selChars     = [];                          // 选角页临时勾选 [{id,name,letter,bg}]
  let _draftAvatarBlob = null;                     // 建群弹层临时头像 blob

  // 莫兰迪占位底色（无头像时用，按角色 id 取模固定）
  const FALLBACK_BG = ['#1a1a1a','#4a4a4a','#5c5c5c','#8a8a8a','#3d3d3d','#6b6b6b','#2c2c2c','#7a7a7a'];
  const _bgOf = (id) => FALLBACK_BG[Math.abs(_hash(String(id))) % FALLBACK_BG.length];
  function _hash(s){ let h=0; for(let i=0;i<s.length;i++) h=(h<<5)-h+s.charCodeAt(i); return h; }
  const _letterOf = (name) => (name||'?').trim().charAt(0).toUpperCase();
  const _esc = (s) => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ───────────────────────── 生命周期 ─────────────────────────
  async function init() {
    _injectStyles();
    _injectDOM();
    _mounted = true;
    try {
      const saved = await DB.settings.get(STORE_KEY);
      _stories = Array.isArray(saved) ? saved : [];
    } catch (e) { _stories = []; }
  }

  async function _persist() {
    try { await DB.settings.set(STORE_KEY, _stories); } catch (e) { console.error('[GroupStory] persist', e); }
  }

  // ───────────────────────── 🎵 网易云配乐 ─────────────────────────
  let _gsAudio = null;   // 群像全局单一播放实例，避免多 <audio> 抢声道

  async function _getNeteaseConfig() {
    try {
      const c = await DB.settings.get('gs-netease-config');
      return c && typeof c === 'object' ? c : { enabled: false, base: '', cookie: '' };
    } catch (e) { return { enabled: false, base: '', cookie: '' }; }
  }
  async function _neteaseReady() {
    const c = await _getNeteaseConfig();
    return !!(c.enabled && c.base && c.base.trim() && c.cookie && c.cookie.trim());
  }
  function _slimCookie(raw) {
    if (!raw) return '';
    const m = String(raw).match(/MUSIC_U=[^;]+/);
    return m ? m[0] : String(raw).trim();
  }

  // 抓取：关键词 → { id, title, artist, audioUrl, coverUrl } | null
  async function _fetchNeteaseMusic(keyword) {
    if (!keyword || keyword === 'null') return null;
    const cfg = await _getNeteaseConfig();
    if (!cfg.enabled || !cfg.base || !cfg.cookie) return null;
    const base = cfg.base.trim().replace(/\/+$/, '');
    const cookieParam = `&cookie=${encodeURIComponent(_slimCookie(cfg.cookie))}`;
    const ts = `timerstamp=${Date.now()}`;
    try {
      const sRes = await fetch(`${base}/search?keywords=${encodeURIComponent(keyword)}&limit=5&${ts}${cookieParam}`);
      const sData = await sRes.json();
      const songs = sData.result?.songs;
      if (!songs || !songs.length) return null;
      const ids = songs.map(s => s.id).join(',');
      const uRes = await fetch(`${base}/song/url/v1?id=${ids}&level=exhigh&${ts}${cookieParam}`);
      const uData = await uRes.json();
      const valid = uData.data?.find(it => it.url && it.url.trim());
      if (!valid) return null;
      const meta = songs.find(s => s.id === valid.id) || songs[0];
      let coverUrl = '';
      try {
        const dRes = await fetch(`${base}/song/detail?ids=${valid.id}&${ts}${cookieParam}`);
        const dData = await dRes.json();
        coverUrl = dData.songs?.[0]?.al?.picUrl || '';
      } catch (e) {}
      return { id: valid.id, title: meta.name || keyword, artist: meta.artists?.[0]?.name || 'Unknown', audioUrl: (valid.url || '').replace('http://', 'https://'), coverUrl };
    } catch (e) {
      console.warn('[GroupStory] 网易云抓取失败', e);
      return null;
    }
  }

  // 播放/暂停（单实例 + 实时重换链 + 互斥）
  async function toggleMusic(playerEl) {
    const songId = playerEl.dataset.id;
    let src = playerEl.dataset.src;
    if (!songId && !src) return;
    if (!_gsAudio) { _gsAudio = new Audio(); _gsAudio.loop = true; }
    const btn = playerEl.querySelector('.gs-music-btn');

    if (_gsAudio.dataset.songId === songId && _gsAudio.src) {
      if (_gsAudio.paused) { try { await _gsAudio.play(); } catch(e){} _setMusicUI(playerEl, true); }
      else { _gsAudio.pause(); _setMusicUI(playerEl, false); }
      return;
    }
    if (songId) {
      if (btn) btn.textContent = '⋯';
      const cfg = await _getNeteaseConfig();
      if (cfg.base && cfg.cookie) {
        try {
          const base = cfg.base.trim().replace(/\/+$/, '');
          const cookieParam = `&cookie=${encodeURIComponent(_slimCookie(cfg.cookie))}`;
          const r = await fetch(`${base}/song/url/v1?id=${songId}&level=exhigh&timerstamp=${Date.now()}${cookieParam}`);
          const d = await r.json();
          const v = d.data?.find(it => it.url && it.url.trim());
          if (v) { src = (v.url || '').replace('http://', 'https://'); playerEl.dataset.src = src; }
        } catch (e) {}
      }
    }
    if (!src) { Toast.show('暂无可用音源'); if (btn) btn.textContent = '▶'; return; }
    document.querySelectorAll('.gs-music-player').forEach(p => _setMusicUI(p, false));
    _gsAudio.src = src;
    _gsAudio.dataset.songId = songId || '';
    try { await _gsAudio.play(); _setMusicUI(playerEl, true); }
    catch (e) { if (btn) btn.textContent = '▶'; }
  }
  function _setMusicUI(playerEl, playing) {
    const btn = playerEl.querySelector('.gs-music-btn');
    const wave = playerEl.querySelector('.gs-music-wave');
    if (btn) btn.textContent = playing ? '❚❚' : '▶';
    if (wave) wave.classList.toggle('playing', playing);
  }

  // 渲染一张票根风播放条；status==='pending' 时为待抓取占位
  function _musicCardHtml(seg, msgId, segIdx) {
    if (seg.status === 'pending') {
      return `<div class="gs-music-player gs-music-pending" data-msg="${msgId}" data-seg="${segIdx}" data-q="${_esc(seg.query||'')}">
        <div class="gs-music-cover gs-music-cover-empty"><span class="gs-music-note">♪</span></div>
        <div class="gs-music-perf">
          <div class="gs-music-meta"><span class="gs-music-title">检索配乐…</span><span class="gs-music-artist">${_esc(seg.query||'')}</span></div>
          <div class="gs-music-foot"><span class="gs-music-code">NETEASE · BGM</span><span class="gs-music-wave"><i></i><i></i><i></i><i></i></span></div>
        </div>
        <div class="gs-music-stub"><span class="gs-music-btn">⋯</span></div>
      </div>`;
    }
    if (!seg.songId) return '';
    const cover = seg.cover
      ? `<div class="gs-music-cover" style="background-image:url('${_esc(seg.cover)}')"></div>`
      : `<div class="gs-music-cover gs-music-cover-empty"><span class="gs-music-note">♪</span></div>`;
    return `<div class="gs-music-player" data-id="${seg.songId}" data-src="${_esc(seg.url||'')}" onclick="GroupStoryModule.toggleMusic(this)">
      ${cover}
      <div class="gs-music-perf">
        <div class="gs-music-meta"><span class="gs-music-title">${_esc(seg.title||'')}</span><span class="gs-music-artist">${_esc(seg.artist||'')}</span></div>
        <div class="gs-music-foot"><span class="gs-music-code">NETEASE · BGM</span><span class="gs-music-wave"><i></i><i></i><i></i><i></i></span></div>
      </div>
      <div class="gs-music-stub"><span class="gs-music-btn">▶</span></div>
    </div>`;
  }

  // 扫描页面 pending 音乐条 → 抓取 → 写回 segment → 持久化 → 替换 DOM
  async function _resolvePendingMusic() {
    const nodes = Array.from(document.querySelectorAll('.gs-music-pending'));
    for (const node of nodes) {
      const q = node.dataset.q;
      const msgId = node.dataset.msg;
      const segIdx = Number(node.dataset.seg);
      node.classList.remove('gs-music-pending');
      const data = await _fetchNeteaseMusic(q);
      try {
        const msg = await DB.messages.get(Number(msgId)).catch(() => null);
        if (msg) {
          const av = _activeVerOf(msg);
          const seg = av.segments && av.segments[segIdx];
          if (seg && seg.type === 'music') {
            if (data) { seg.status = 'ok'; seg.songId = data.id; seg.url = data.audioUrl; seg.title = data.title; seg.artist = data.artist; seg.cover = data.coverUrl; }
            else { seg.status = 'fail'; }
            if (Array.isArray(msg.versions) && msg.versions.length) {
              const vi = Math.max(0, Math.min(msg.activeVer || 0, msg.versions.length - 1));
              if (msg.versions[vi]) msg.versions[vi].segments = av.segments;
            }
            msg.segments = av.segments;
            await DB.messages.put(msg).catch(() => {});
          }
        }
      } catch (e) {}
      if (data) {
        node.dataset.id = data.id;
        node.dataset.src = data.audioUrl;
        node.setAttribute('onclick', 'GroupStoryModule.toggleMusic(this)');
        const cover = data.coverUrl
          ? `<div class="gs-music-cover" style="background-image:url('${_esc(data.coverUrl)}')"></div>`
          : `<div class="gs-music-cover gs-music-cover-empty"><span class="gs-music-note">♪</span></div>`;
        node.innerHTML = `${cover}<div class="gs-music-perf"><div class="gs-music-meta"><span class="gs-music-title">${_esc(data.title)}</span><span class="gs-music-artist">${_esc(data.artist)}</span></div><div class="gs-music-foot"><span class="gs-music-code">NETEASE · BGM</span><span class="gs-music-wave"><i></i><i></i><i></i><i></i></span></div></div><div class="gs-music-stub"><span class="gs-music-btn">▶</span></div>`;
      } else {
        node.remove();
      }
    }
  }

  // 桌面图标入口 —— 打开整个群像 screen，落在面具墙
  function open() {
    if (!_mounted) { Toast.show('群像模块未就绪'); return; }
    const screen = document.getElementById(SCREEN_ID);
    if (!screen) return;
    screen.classList.add('active');
    _showLayer('persona');     // 默认面具墙
    _renderPersonaWall();
  }

  function close() {
    const screen = document.getElementById(SCREEN_ID);
    if (screen) screen.classList.remove('active');
  }

  // 取当前生效的 API：群像会话级覆盖优先，否则回退设置页激活的 API。
  // 只在群像内生效，不写 DB、不碰全局 DB.api.getActive。
  async function _getStoryApi() {
    if (_sessionApiId != null) {
      try {
        const api = await DB.api.get(Number(_sessionApiId));
        if (api) return _sessionModel ? { ...api, model: _sessionModel } : { ...api };
      } catch (e) {}
    }
    try { return await DB.api.getActive(); } catch (e) { return null; }
  }

  // 三层 layer 切换（persona / workspace / chat / settings 都在同一 screen 内用 layer 管理）
  function _showLayer(layer) {
    const map = {
      persona:   'gs-persona-layer',
      workspace: 'gs-workspace-layer',
      chat:      'gs-chat-layer',
    };
    Object.values(map).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('gs-layer-active', map[layer] === id);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  ① 面具墙
  // ════════════════════════════════════════════════════════════
  async function _renderPersonaWall() {
    const grid = document.getElementById('gs-persona-grid');
    if (!grid) return;
    const personas = (typeof PersonaModule !== 'undefined') ? PersonaModule.getAll() : [];

    // 预先算出每个面具下「显式绑定」的角色数
    let allChars = [];
    let allBindings = [];
    try { allChars = await DB.characters.getAll(); } catch (e) { allChars = []; }
    try { allBindings = await DB.bindings.getAll(); } catch(e) { allBindings = []; }

    const defaultPersonaId = personas[0]?.id; // 拿到系统第一个默认面具
    const countByPersona = {};

    for (const c of allChars) {
      const bind = allBindings.find(b => String(b.charId) === String(c.id));
      // 🌟 核心：如果有绑定记录就用记录，没有就自动兜底给默认面具
      const effectivePersonaId = bind ? bind.personaId : defaultPersonaId;
      
      if (effectivePersonaId != null) {
        const pid = String(effectivePersonaId);
        countByPersona[pid] = (countByPersona[pid] || 0) + 1;
      }
    }

    if (!personas.length) {
      grid.innerHTML = `<div class="gs-empty-wall">尚无用户面具<br><span>请先在角色设置里创建你的面具</span></div>`;
      return;
    }

    let html = '';
    for (let i = 0; i < personas.length; i++) {
      const p = personas[i];
      const cnt = countByPersona[String(p.id)] || 0;
      let avatar = '';
      if (p.imgKey) { try { avatar = await Assets.getUrl(p.imgKey) || ''; } catch (e) {} }
      const letter = _letterOf(p.name);
      const num = String(i + 1).padStart(2, '0');
      const groupCnt = _stories.filter(s => String(s.personaId) === String(p.id)).length;
      html += `
        <div class="gs-mask-card" onclick="GroupStoryModule.enterPersona('${p.id}')">
          <div class="gs-mask-hero">
            ${avatar ? `<img src="${avatar}" alt="">` : `<span class="gs-mask-hero-letter">${letter}</span>`}
            <div class="gs-mask-num">${num}</div>
          </div>
          <div class="gs-mask-info">
            <div class="gs-mask-av-wrap"><div class="gs-mask-av" style="background:${_bgOf(p.id)};">${avatar ? `<img src="${avatar}" alt="">` : letter}</div></div>
            <div class="gs-mask-sub">PERSONA</div>
            <div class="gs-mask-name">${_esc(p.name || 'Unnamed')}</div>
            <div class="gs-mask-bot">
              <span class="gs-mask-tag">${cnt} cast · ${groupCnt} groups</span>
            </div>
          </div>
        </div>`;
    }
    grid.innerHTML = html;
  }

  // ════════════════════════════════════════════════════════════
  //  ② 面具工作区（Tab：我的群像 / 选角）
  // ════════════════════════════════════════════════════════════
  function enterPersona(personaId) {
    const personas = (typeof PersonaModule !== 'undefined') ? PersonaModule.getAll() : [];
    _activePersona = personas.find(p => String(p.id) === String(personaId)) || null;
    if (!_activePersona) { Toast.show('面具不存在'); return; }
    _selChars = [];
    _showLayer('workspace');
    document.getElementById('gs-ws-persona-name').textContent = _activePersona.name || 'Persona';
    _switchTab('groups');     // 默认「我的群像」
  }

  function _switchTab(tab) {
    document.querySelectorAll('.gs-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    document.getElementById('gs-tab-groups').style.display = (tab === 'groups') ? 'flex' : 'none';
    document.getElementById('gs-tab-cast').style.display   = (tab === 'cast')   ? 'flex' : 'none';
    if (tab === 'groups') _renderMyGroups();
    if (tab === 'cast')   _renderCast();
  }

  // ── Tab1：我的群像 ──
  async function _renderMyGroups() {
    const list = document.getElementById('gs-groups-list');
    if (!list) return;
    const mine = _stories
      .filter(s => String(s.personaId) === String(_activePersona.id))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!mine.length) {
      list.innerHTML = `<div class="gs-empty-wall">还没有群像<br><span>切到「选角」Tab 组建第一个群像</span></div>`;
      return;
    }

    let html = '';
    for (const s of mine) {
      let cover = '';
      if (s.groupAvatarKey) { try { cover = await Assets.getUrl(s.groupAvatarKey) || ''; } catch (e) {} }
      // 拼角色名做副标题
      let charNames = [];
      try {
        for (const cid of s.charIds) {
          const c = await DB.characters.get(Number(cid));
          if (c) charNames.push(c.name);
        }
      } catch (e) {}
      const initials = s.charIds.slice(0, 3).map((cid, i) => {
        return `<div class="gs-grp-mini" style="background:${_bgOf(cid)};z-index:${5 - i}">${_letterOf(charNames[i] || '?')}</div>`;
      }).join('');
      html += `
        <div class="gs-grp-card">
          <div class="gs-grp-main" onclick="GroupStoryModule.openStory('${s.id}')">
            <div class="gs-grp-cover" style="background:${_bgOf(s.id)};">
              ${cover ? `<img src="${cover}" alt="">` : `<img src="${DEFAULT_GROUP_AVATAR}" alt="">`}
            </div>
            <div class="gs-grp-body">
              <div class="gs-grp-name">${_esc(s.groupName || '未命名群像')}</div>
              <div class="gs-grp-sub">${_esc(charNames.join(' · ') || '—')}</div>
              <div class="gs-grp-meta">${s.charIds.length} CAST · ${_fmtDate(s.updatedAt || s.createdAt)}</div>
            </div>
          </div>
          <div class="gs-grp-actions">
            <div class="gs-grp-act" title="编辑" onclick="GroupStoryModule.openEditGroup('${s.id}')">
              <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
            <div class="gs-grp-act danger" title="删除" onclick="GroupStoryModule.deleteGroup('${s.id}')">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </div>
          </div>
        </div>`;
    }
    list.innerHTML = html;
  }

  // ── Tab2：选角（只列绑定了当前面具的角色，严格）──
  async function _renderCast() {
    const grid = document.getElementById('gs-cast-grid');
    if (!grid) return;
    let allChars = [];
    let allBindings = [];
    try { allChars = await DB.characters.getAll(); } catch (e) { allChars = []; }
    try { allBindings = await DB.bindings.getAll(); } catch(e) { allBindings = []; }

    const personas = (typeof PersonaModule !== 'undefined') ? PersonaModule.getAll() : [];
    const defaultPersonaId = personas[0]?.id; // 拿到系统第一个默认面具

    const eligible = [];
    for (const c of allChars) {
      const bind = allBindings.find(b => String(b.charId) === String(c.id));
      // 🌟 核心：与群聊保持完全一致的兜底逻辑，没绑定的角色自动归属默认面具
      const effectivePersonaId = bind ? bind.personaId : defaultPersonaId;
      
      if (String(effectivePersonaId) === String(_activePersona.id)) {
        eligible.push(c);
      }
    }

    if (!eligible.length) {
      grid.innerHTML = `<div class="gs-empty-wall">该面具下暂无可用角色<br><span>去角色设置里把角色绑定到「${_esc(_activePersona.name)}」面具</span></div>`;
      _updateCastBar();
      return;
    }

    let html = '';
    for (let i = 0; i < eligible.length; i++) {
      const c = eligible[i];
      let avatar = '';
      try { avatar = await Assets.getUrl(`char-avatar-${c.id}`) || ''; } catch (e) {}
      const letter = _letterOf(c.name);
      const bg = _bgOf(c.id);
      const num = String(i + 1).padStart(2, '0');
      const checked = _selChars.some(x => String(x.id) === String(c.id)) ? 'selected' : '';
      html += `
        <div class="gs-ct-card ${checked}" data-id="${c.id}" onclick="GroupStoryModule.toggleCast('${c.id}')">
          <div class="gs-ct-hero" style="background:${avatar ? '#e8e6e3' : 'linear-gradient(155deg,#e8e6e3,#d2cfcb 40%,#c2beb9)'};">
            ${avatar ? `<img src="${avatar}" alt="">` : `<span class="gs-ct-hero-letter">${letter}</span>`}
            <div class="gs-ct-num">${num}</div>
            <div class="gs-ct-sel"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
          </div>
          <div class="gs-ct-info">
            <div class="gs-ct-av-wrap"><div class="gs-ct-av" style="background:${bg};">${avatar ? `<img src="${avatar}" alt="">` : letter}</div></div>
            <div class="gs-ct-sub">AI NODE</div>
            <div class="gs-ct-name">${_esc(c.name)}</div>
          </div>
        </div>`;
    }
    grid.innerHTML = html;
    _updateCastBar();
  }

  function toggleCast(charId) {
    const card = document.querySelector(`.gs-ct-card[data-id="${charId}"]`);
    const idx = _selChars.findIndex(x => String(x.id) === String(charId));
    if (idx >= 0) {
      _selChars.splice(idx, 1);
      card && card.classList.remove('selected');
    } else {
      const name = card ? card.querySelector('.gs-ct-name').textContent : '?';
      _selChars.push({ id: charId, name, letter: _letterOf(name), bg: _bgOf(charId) });
      card && card.classList.add('selected');
    }
    _updateCastBar();
  }

  function _updateCastBar() {
    const bar = document.getElementById('gs-cast-bar');
    if (!bar) return;
    if (_selChars.length >= 2) {            // 群像至少 2 人
      bar.classList.add('show');
      bar.querySelector('.gs-castbar-avatars').innerHTML =
        _selChars.slice(0, 5).map((s, i) => `<div class="gs-castbar-av" style="background:${s.bg};z-index:${10 - i}">${s.letter}</div>`).join('');
      bar.querySelector('.gs-castbar-names').textContent = _selChars.map(s => s.name).join(' · ');
      bar.querySelector('.gs-castbar-subtxt').textContent = `${_selChars.length} CHARACTERS · READY`;
    } else {
      bar.classList.remove('show');
    }
  }

  // ════════════════════════════════════════════════════════════
  //  建群弹层（填群名 + 群组头像）
  // ════════════════════════════════════════════════════════════
  function openCreateModal() {
    if (_selChars.length < 2) { Toast.show('至少选择 2 个角色'); return; }
    _draftAvatarBlob = null;
    const modal = document.getElementById('gs-create-modal');
    modal.querySelector('#gs-create-name').value = _selChars.map(s => s.name).join(' · ');
    modal.querySelector('#gs-create-avatar-pic').innerHTML =
      `<img src="${DEFAULT_GROUP_AVATAR}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    modal.classList.add('active');
  }
  function closeCreateModal() { document.getElementById('gs-create-modal').classList.remove('active'); }

  async function handleCreateAvatar(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    _draftAvatarBlob = file;
    const url = URL.createObjectURL(file);
    document.getElementById('gs-create-avatar-pic').innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
  }

  async function confirmCreate() {
    const name = document.getElementById('gs-create-name').value.trim();
    if (!name) { Toast.show('请填写群像名称'); return; }
    const id = 'gs_' + Date.now();
    let avatarKey = '';
    if (_draftAvatarBlob) {
      avatarKey = `gs-avatar-${id}`;
      try { await Assets.saveBlob(avatarKey, _draftAvatarBlob, 400, 0.85); } catch (e) { avatarKey = ''; }
    }
    const story = {
      id,
      personaId: _activePersona.id,
      charIds: _selChars.map(s => String(s.id)),
      groupName: name,
      groupAvatarKey: avatarKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    _stories.push(story);
    await _persist();
    _selChars = [];
    _draftAvatarBlob = null;
    closeCreateModal();
    Toast.show('群像已创建 ✦');
    _switchTab('groups');          // 建完跳回「我的群像」
  }

  // ── 编辑群组（改名 / 换头像）──
  function openEditGroup(storyId) {
    const s = _stories.find(x => x.id === storyId);
    if (!s) return;
    _activeStory = s;
    _draftAvatarBlob = null;
    const modal = document.getElementById('gs-edit-modal');
    modal.querySelector('#gs-edit-name').value = s.groupName || '';
    (async () => {
      let cover = '';
      if (s.groupAvatarKey) { try { cover = await Assets.getUrl(s.groupAvatarKey) || ''; } catch (e) {} }
      modal.querySelector('#gs-edit-avatar-pic').innerHTML = cover
        ? `<img src="${cover}" alt="" style="width:100%;height:100%;object-fit:cover;">`
        : `<img src="${DEFAULT_GROUP_AVATAR}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    })();
    modal.classList.add('active');
  }
  function closeEditModal() { document.getElementById('gs-edit-modal').classList.remove('active'); }

  async function handleEditAvatar(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    _draftAvatarBlob = file;
    const url = URL.createObjectURL(file);
    document.getElementById('gs-edit-avatar-pic').innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
  }

  async function confirmEdit() {
    if (!_activeStory) return;
    const name = document.getElementById('gs-edit-name').value.trim();
    if (!name) { Toast.show('名称不能为空'); return; }
    _activeStory.groupName = name;
    if (_draftAvatarBlob) {
      const key = _activeStory.groupAvatarKey || `gs-avatar-${_activeStory.id}`;
      try { await Assets.saveBlob(key, _draftAvatarBlob, 400, 0.85); _activeStory.groupAvatarKey = key; } catch (e) {}
    }
    _activeStory.updatedAt = Date.now();
    await _persist();
    _draftAvatarBlob = null;
    closeEditModal();
    Toast.show('已保存');
    _renderMyGroups();
  }

  async function deleteGroup(storyId) {
    _confirmDialog({
      title: '删除群像',
      sub: 'DELETE GROUP · IRREVERSIBLE',
      body: '删除这个群像？聊天记录也会一并清空，且不可恢复。',
      danger: true,
      okText: '删除',
      onOk: async () => {
        const s = _stories.find(x => x.id === storyId);
        if (s) {
          try { await DB.messages.delByChar(s.id); } catch (e) {}
          if (s.groupAvatarKey) { try { await Assets.remove(s.groupAvatarKey); } catch (e) {} }
        }
        _stories = _stories.filter(x => x.id !== storyId);
        await _persist();
        Toast.show('已删除');
        _renderMyGroups();
      },
    });
  }

  // ════════════════════════════════════════════════════════════
  //  ③ 群像聊天页
  // ════════════════════════════════════════════════════════════
  async function openStory(storyId) {
    const s = _stories.find(x => x.id === storyId);
    if (!s) { Toast.show('群像不存在'); return; }
    _activeStory = s;
    _showLayer('chat');

    // 加载该群像的卡片配色
    try {
      const saved = await DB.settings.get(`gstory-rccolors-${s.id}`);
      _rcColors = saved && typeof saved === 'object' ? { ..._RC_DEFAULT, ...saved } : { ..._RC_DEFAULT };
    } catch (e) { _rcColors = { ..._RC_DEFAULT }; }
    _applyRcColors();
    await _loadCustomCSS();

    // 取当前面具的真实头像（用户消息卡片用）；面具可能在进入时已确定，兜底再查一次
    _userAvatarUrl = '';
    try {
      let persona = _activePersona;
      if (!persona) {
        const personas = (typeof PersonaModule !== 'undefined') ? PersonaModule.getAll() : [];
        persona = personas.find(p => String(p.id) === String(s.personaId)) || null;
        if (persona) _activePersona = persona;
      }
      if (persona && persona.imgKey) {
        _userAvatarUrl = await Assets.getUrl(persona.imgKey) || '';
      }
    } catch (e) { _userAvatarUrl = ''; }

    // 顶部信息
    document.getElementById('gs-chat-title').textContent = s.groupName || '群像';
    // 顶部叠放角色头像（最多 3 个）
    const topWrap = document.getElementById('gs-chat-top-avatars');
    let charObjs = [];
    try { for (const cid of s.charIds) { const c = await DB.characters.get(Number(cid)); if (c) charObjs.push(c); } } catch (e) {}
    const cls = ['gs-tav-front','gs-tav-back','gs-tav-ghost'];
    let topHtml = '';
    for (let i = 0; i < Math.min(3, charObjs.length); i++) {
      let av = '';
      try { av = await Assets.getUrl(`char-avatar-${charObjs[i].id}`) || ''; } catch (e) {}
      topHtml += `<div class="gs-tav ${cls[i]}" style="background:${_bgOf(charObjs[i].id)};">${av ? `<img src="${av}" style="width:100%;height:100%;object-fit:cover;">` : _letterOf(charObjs[i].name)}</div>`;
    }
    topWrap.innerHTML = topHtml;
    document.getElementById('gs-chat-sub').textContent = `${s.charIds.length} CAST`;

    await _seedOpening();      // 若无消息且设了开场白，作为第一条 AI 消息入库
    await _loadMessages();
  }

  // 开场白播种：仅当该群像还没有任何消息、且设置了开场白时，作为第一条 assistant 消息入库
  async function _seedOpening() {
    let count = 0;
    try { const page = await DB.messages.getPage(_activeStory.id, 0, 1); count = page.length; } catch (e) {}
    if (count > 0) return;     // 已有消息，不动

    let opening = '';
    try { opening = await DB.settings.get(`gstory-opening-${_activeStory.id}`); } catch (e) {}
    opening = (opening || '').trim();
    if (!opening) return;      // 没设开场白

    // 解析成剧本分段（与 AI 输出同一套渲染）
    const chars = [];
    for (const cid of _activeStory.charIds) {
      try { const c = await DB.characters.get(Number(cid)); if (c) chars.push(c); } catch (e) {}
    }
    const charNameToId = {};
    chars.forEach(c => { charNameToId[c.name] = String(c.id); });
    const segments = _parseSegments(opening, charNameToId);

    const openMsg = {
      charId: _activeStory.id,
      role: 'assistant',
      content: opening,
      segments,
      model: '',
      isOpening: true,          // 标记：这是开场白
      versions: [{ content: opening, segments, model: '' }],
      activeVer: 0,
      timestamp: Date.now(),
    };
    try { await DB.messages.add(openMsg); } catch (e) { console.error('[GroupStory] seed opening', e); }
  }

  async function _loadMessages() {
    const cont = document.getElementById('gs-chat-stream');
    if (!cont) return;
    cont.innerHTML = '';

    // 总数 + 最新一页
    try { _totalMsgs = await DB.messages.countByChar(_activeStory.id); } catch (e) { _totalMsgs = 0; }
    let msgs = [];
    try { msgs = await DB.messages.getPage(_activeStory.id, 0, PAGE_SIZE); } catch (e) { msgs = []; }
    _offset = msgs.length;

    if (!msgs.length) {
      cont.innerHTML = `<div class="gs-chat-empty">电影开场<br><span>写下第一幕，让群像登场</span></div>`;
      return;
    }

    // 预取角色名字 + 头像映射（缓存供 loadMore 复用）
    _nameMap = {}; _avatarMap = {};
    for (const cid of _activeStory.charIds) {
      try { const c = await DB.characters.get(Number(cid)); if (c) _nameMap[String(cid)] = c.name; } catch (e) {}
      try { const av = await Assets.getUrl(`char-avatar-${cid}`); if (av) _avatarMap[String(cid)] = av; } catch (e) {}
    }

    // 顶部「加载更多」按钮（仅当还有更早的消息）
    const moreHtml = _totalMsgs > _offset
      ? `<div class="gs-load-more-wrap" id="gs-load-more"><button class="gs-load-more-btn" onclick="GroupStoryModule.loadMore()">Fetch Earlier Logs</button></div>`
      : '';
    cont.insertAdjacentHTML('beforeend', moreHtml);

    const wrapCursor = await _getWrapCursor();
    // 本页首条的楼层号 = 总数 - 本页条数 + 1
    let floor = _totalMsgs - msgs.length + 1;
    for (const m of msgs) {
      const wrapped = wrapCursor > 0 && Number(m.id) <= wrapCursor;
      cont.insertAdjacentHTML('beforeend', _renderMsgCard(m, floor++, _nameMap, _avatarMap, wrapped));
    }
    _scrollBottom();
    requestAnimationFrame(() => _resolvePendingMusic());
  }

  // 加载更早一页：取 offset 处的更旧消息，倒序插到顶部，保持滚动位置
  async function loadMore() {
    let msgs = [];
    try { msgs = await DB.messages.getPage(_activeStory.id, _offset, PAGE_SIZE); } catch (e) { msgs = []; }
    const cont = document.getElementById('gs-chat-stream');
    const moreEl = document.getElementById('gs-load-more');
    if (!msgs.length) { if (moreEl) moreEl.remove(); return; }

    _offset += msgs.length;
    const savedHeight = cont.scrollHeight;
    const wrapCursor = await _getWrapCursor();

    // 这批消息的楼层号：从 (总数 - offset + 1) 开始
    const baseFloor = _totalMsgs - _offset + 1;
    // 倒序逐条插到「加载更多」按钮之后（即顶部），插入后顺序自然为旧→新
    const reversed = [...msgs].reverse();
    reversed.forEach((m, i) => {
      const floor = baseFloor + (msgs.length - 1 - i);
      const wrapped = wrapCursor > 0 && Number(m.id) <= wrapCursor;
      const html = _renderMsgCard(m, floor, _nameMap, _avatarMap, wrapped);
      const anchor = moreEl ? moreEl.nextSibling : cont.firstChild;
      cont.insertBefore(_htmlToEl(html), anchor);
    });

    if (_offset >= _totalMsgs && moreEl) moreEl.remove();
    cont.scrollTop = cont.scrollHeight - savedHeight;   // 保持视觉位置不跳
    requestAnimationFrame(() => _resolvePendingMusic());
  }

  // 把 HTML 字符串转成单个元素（insertBefore 用）
  function _htmlToEl(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    return tpl.content.firstChild;
  }

  // ── 多版本 swipe helpers ──
  // 取当前激活版本的 {content, segments, model}；老消息（无 versions）回退到顶层字段
  function _activeVerOf(m) {
    if (Array.isArray(m.versions) && m.versions.length) {
      const i = Math.max(0, Math.min(m.activeVer || 0, m.versions.length - 1));
      const v = m.versions[i] || {};
      return { content: v.content || '', segments: v.segments || null, model: v.model || m.model || '', status: v.status || m.status || null };
    }
    return { content: m.content || '', segments: m.segments || null, model: m.model || '', status: m.status || null };
  }
  // 版本数 / 当前序号（1-based 给 UI 用）
  function _verCount(m) { return Array.isArray(m.versions) && m.versions.length ? m.versions.length : 1; }
  function _verIndex(m) {
    if (Array.isArray(m.versions) && m.versions.length) return Math.max(0, Math.min(m.activeVer || 0, m.versions.length - 1)) + 1;
    return 1;
  }

  // 随机条码（纯装饰，模拟收据小票）
  function _barcode(n) {
    const hs = [3,4,5,6,7,8,10];
    let s = '';
    for (let i = 0; i < n; i++) s += `<i style="height:${hs[(i * 7 + 3) % hs.length]}px"></i>`;
    return s;
  }

  // 卡片底部：收据（Tokens/条码）+ footer（翻页 + 重roll + 编辑/删除）
  function _cardBottom(m, isAI) {
    const av = _activeVerOf(m);
    const tk = av.content ? av.content.length : (av.segments ? av.segments.reduce((a, s) => a + (s.content || '').length, 0) : 0);
    const receiptRows = isAI
      ? `<div class="gs-cr-row"><span class="gs-cr-key">Date</span><span class="gs-cr-val">${_fmtFull(m.timestamp)}</span></div>
         <div class="gs-cr-row"><span class="gs-cr-key">Model</span><span class="gs-cr-val">${_esc(av.model || '—')}</span></div>
         <div class="gs-cr-row"><span class="gs-cr-key">Tokens</span><span class="gs-cr-val">${tk}</span></div>`
      : `<div class="gs-cr-row"><span class="gs-cr-key">Date</span><span class="gs-cr-val">${_fmtFull(m.timestamp)}</span></div>
         <div class="gs-cr-row"><span class="gs-cr-key">Tokens</span><span class="gs-cr-val">${tk}</span></div>`;
    const cur = _verIndex(m), total = _verCount(m);
    const atFirst = cur <= 1, atLast = cur >= total;
    return `
      <div class="gs-card-bottom">
        <div class="gs-card-receipt">
          ${receiptRows}
          <div class="gs-cr-barcode">${_barcode(isAI ? 18 : 12)}</div>
        </div>
        <div class="gs-card-footer">
          ${isAI ? `<div class="gs-cf-pages">
            <div class="gs-cf-arrow${atFirst ? ' off' : ''}" onclick="GroupStoryModule.swipeVer('${m.id}',-1)"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
            <span class="gs-cf-page-num">${cur}/${total}</span>
            <div class="gs-cf-arrow${atLast ? ' off' : ''}" onclick="GroupStoryModule.swipeVer('${m.id}',1)"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
          </div>
          <div class="gs-cf-sep"></div>` : `<div class="gs-cf-sep"></div>`}
          <div class="gs-cf-actions">
            ${isAI ? `<div class="gs-cf-btn gs-cf-reroll" title="重新生成" onclick="GroupStoryModule.rerollMsg('${m.id}')"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></div>` : ''}
            <div class="gs-cf-btn" onclick="GroupStoryModule.editMsg('${m.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
            <div class="gs-cf-btn" onclick="GroupStoryModule.delMsg('${m.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>
          </div>
        </div>
      </div>`;
  }

  // 渲染一条消息为收据卡片（user 单段 / assistant 多段）
  function _renderMsgCard(m, idx, nameMap, avatarMap, wrapped) {
    avatarMap = avatarMap || {};
    const time = _fmtTime(m.timestamp);
    const code = String(idx).padStart(3, '0');
    const wrapCls = wrapped ? ' gs-wrapped' : '';
    const wrapStamp = wrapped ? `<div class="gs-wrap-stamp"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg><span>WRAPPED</span></div>` : '';
    if (m.role === 'user') {
      // 🌟 核心：提取原始文本，然后扔给我们的富文本解析器处理！
      const rawContent = m.content || (m.parts ? m.parts.map(p => p.content).join('') : '');
      const body = _parseGroupStoryRichText(rawContent);
      
      const uname = _esc((_activePersona && _activePersona.name) || 'You');
      return `
      <div class="gs-msg-wrap">
        <div class="gs-msg-bar-top"><span class="gs-bar-time">${time}</span><div class="gs-bar-right"><span class="gs-bar-line"></span><span class="gs-bar-code">${code}</span><span class="gs-bar-line"></span></div></div>
        <div class="gs-card gs-card-usr${wrapCls}">
          ${wrapStamp}
          <div class="gs-who"><div class="gs-av-wrap"><div class="gs-av" style="background:${_bgOf('user')};">${_userAvatarUrl ? `<img src="${_userAvatarUrl}" alt="">` : _letterOf(uname)}</div></div><div class="gs-nm">${uname}</div></div>
          <div class="gs-msg-body">${body}</div>
          ${_cardBottom(m, false)}
        </div>
        <div class="gs-msg-bar-bot"><div class="gs-bar-left"><span class="gs-bar-line"></span><span class="gs-bar-dot"></span></div><span class="gs-bar-idx">USR</span></div>
      </div>`;
    }
    // assistant：渲染当前激活版本的分段（segments）。无 segments 则整段当旁白。
    const _av = _activeVerOf(m);
    const segs = Array.isArray(_av.segments) && _av.segments.length ? _av.segments : [{ type: 'act', content: _av.content || '' }];
    let inner = '';
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      if (seg.type === 'speak') {
        const nm = _esc(nameMap[String(seg.charId)] || seg.name || '?');
        const av = avatarMap[String(seg.charId)];
        const hasSt = !!(_av.status && _av.status.chars && _av.status.chars.length);
        const avClick = hasSt ? ` onclick="GroupStoryModule.openStatusPanel('${m.id}')" style="cursor:pointer;"` : '';
inner += `<div class="gs-ms"><div class="gs-av-wrap"><div class="gs-av${hasSt ? ' gs-av-st' : ''}" style="background:${_bgOf(seg.charId)};"${avClick}>${av ? `<img src="${av}" alt="">` : _letterOf(nm)}</div></div><div class="gs-bd"><div class="gs-snm">${nm}</div><div class="gs-stx">${_parseGroupStoryRichText(seg.content)}</div></div></div>`;
      } else if (seg.type === 'tens') {
        inner += `<div class="gs-tens">${_esc(seg.content)}</div>`;
      } else if (seg.type === 'music') {
        inner += _musicCardHtml(seg, m.id, si);
      } else {
        inner += `<div class="gs-act">${_parseGroupStoryRichText(seg.content)}</div>`;
      }
    }
    return `
      <div class="gs-msg-wrap">
        <div class="gs-msg-bar-top"><span class="gs-bar-time">${time}</span><div class="gs-bar-right"><span class="gs-bar-line"></span><span class="gs-bar-code">${code}</span><span class="gs-bar-line"></span></div></div>
        <div class="gs-card gs-card-ai${wrapCls}">
          ${wrapStamp}
          <div class="gs-card-header"><div class="gs-ch-icon"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div><span class="gs-ch-label">Narration</span><div class="gs-ch-line"></div><span class="gs-ch-tag">Multi</span></div>
          ${inner}
          ${_cardBottom(m, true)}
        </div>
        <div class="gs-msg-bar-bot"><div class="gs-bar-left"><span class="gs-bar-line"></span><span class="gs-bar-dot"></span></div><span class="gs-bar-idx">SCN</span></div>
      </div>`;
  }

  // 删除单条消息（自定义确认弹窗）
  function delMsg(msgId) {
    _confirmDialog({
      title: '删除消息',
      sub: 'DELETE · IRREVERSIBLE',
      body: '确定删除这条消息？此操作不可恢复。',
      danger: true,
      okText: '删除',
      onOk: async () => {
        try { await DB.messages.del(Number(msgId)); } catch (e) { try { await DB.messages.del(msgId); } catch (e2) {} }
        await _loadMessages();
        Toast.show('已删除');
      },
    });
  }

  // 编辑单条消息（自定义编辑弹窗）
  async function editMsg(msgId) {
    let m = null;
    try { m = await DB.messages.get(Number(msgId)); } catch (e) {}
    if (!m) { try { m = await DB.messages.get(msgId); } catch (e) {} }
    if (!m) return;
    const isAI = m.role !== 'user';
    const cur = _activeVerOf(m);
    const old = isAI
      ? (cur.content || (cur.segments ? cur.segments.map(s => s.content).join('\n') : ''))
      : (m.content || (m.segments ? m.segments.map(s => s.content).join('\n') : ''));
    _editDialog({
      title: isAI ? '编辑剧情' : '编辑台词',
      sub: isAI ? 'EDIT · NARRATION' : 'EDIT · YOUR LINE',
      value: old,
      hint: isAI ? '编辑后将重新解析分段（仅当前版本）' : '',
      onOk: async (next) => {
        if (next == null) return;
        if (m.role === 'user') {
          m.content = next;
          if (m.segments) delete m.segments;
        } else {
          // AI 消息：重新解析分段，只写回当前激活版本，其他版本不动
          let segs = null;
          try {
            const chars = [];
            for (const cid of _activeStory.charIds) {
              try { const c = await DB.characters.get(Number(cid)); if (c) chars.push(c); } catch (e) {}
            }
            const charNameToId = {};
            chars.forEach(c => { charNameToId[c.name] = String(c.id); });
            segs = _parseSegments(next, charNameToId);
          } catch (e) { segs = null; }
          if (Array.isArray(m.versions) && m.versions.length) {
            const i = Math.max(0, Math.min(m.activeVer || 0, m.versions.length - 1));
            m.versions[i] = { content: next, segments: segs, model: m.versions[i].model || m.model || '' };
          } else {
            m.content = next;
            if (segs) m.segments = segs; else if (m.segments) delete m.segments;
          }
        }
        try { await DB.messages.put(m); } catch (e) {}
        await _loadMessages();
        Toast.show('已保存');
      },
    });
  }

  // 发送一条用户消息 → 触发 AI 群像续写
  async function sendUserLine() {
    if (_aiBusy) return;
    const ta = document.getElementById('gs-chat-input');
    const text = (ta.value || '').trim();
    ta.blur();

    // 空输入：不插入用户消息，直接让 AI 续写（开场后直接发送 / 不想说话时让 AI 自己演）
    if (!text) {
      await _triggerAI();
      return;
    }

    const msg = {
      charId: _activeStory.id,      // 用群组 id 做隔离索引
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    try { await DB.messages.add(msg); } catch (e) { console.error('[GroupStory] add user msg', e); }
    _activeStory.updatedAt = Date.now();
    await _persist();
    ta.value = '';
    ta.style.height = '';
    await _loadMessages();
    await _triggerAI();
  }

  // 触发 AI 续写：首次生成 → 存为该消息的第一个版本
  async function _triggerAI() {
    if (_aiBusy) return;
    _aiBusy = true;
    _showTyping(true);
    try {
      const gen = await _generateOnce({ excludeMsgId: null, avoidText: '' });
      if (!gen) return;
      if (!gen.raw || !gen.raw.trim()) {   // AI 返回空，不入库,提示重试
        Toast.show('AI 没有返回内容，请重试');
        return;
      }
      const aiMsg = {
        charId: _activeStory.id,
        role: 'assistant',
        content: gen.raw,                 // 兼容字段：留底当前版本原文
        segments: gen.segments,           // 兼容字段：当前版本分段
        model: gen.model,
        status: gen.status || null,       // 兼容字段：当前版本状态快照
        versions: [{ content: gen.raw, segments: gen.segments, model: gen.model, status: gen.status || null }],
        activeVer: 0,
        timestamp: Date.now(),
      };
      try { await DB.messages.add(aiMsg); } catch (e) { console.error('[GroupStory] add ai msg', e); }
      _activeStory.updatedAt = Date.now();
      await _persist();
      await _loadMessages();
    } catch (e) {
      console.error('[GroupStory] AI error', e);
      Toast.show('续写失败：' + (e.message || '请检查 API 配置'));
    } finally {
      _aiBusy = false;
      _showTyping(false);
    }
  }

  // 生成内核：组 prompt → 调 API → 解析分段。返回 {raw, segments, model} 或 null。
  // opts.excludeMsgId：拼历史时排除的消息 id（reroll 时排除自己）
  // opts.avoidText：作为「上一个写法，请换一种」追加给 AI 的文本
  async function _generateOnce(opts) {
    opts = opts || {};
    const activeApi = await _getStoryApi();
    if (!activeApi) { Toast.show('请先在设置中配置并激活 API'); return null; }

    // 1. 参演角色档案
    const chars = [];
    for (const cid of _activeStory.charIds) {
      try { const c = await DB.characters.get(Number(cid)); if (c) chars.push(c); } catch (e) {}
    }
    if (!chars.length) { Toast.show('该群像没有可用角色'); return null; }

    // 2. 配置
    const g = (k, d) => DB.settings.get(`gstory-${k}-${_activeStory.id}`).then(v => v == null ? d : v).catch(() => d);
    const ctxLimit = await g('context', 20);
    const maxTk    = await g('maxtokens', 1200);
    const pov      = await g('pov', '3rd');

    // 3. 系统提示词（注入当前剧情时间 + 世界书）
    const storyDate = await _currentStoryDate();
    const aware = await _isTimeAware();
    const timeStr = _fmtForAI(storyDate);
    const wbBlock = await _buildWorldBookBlock();
    const statusOn = await _isStatusOn();
    const statusNames = chars.map(c => c.name);
    const statusFields = statusOn ? await _getStatusFields() : null;
    const musicOn = await _neteaseReady();
    const sysPrompt = _buildGroupSystemPrompt(chars, pov, maxTk, { timeStr, aware, wbBlock, statusOn, statusNames, statusFields, musicOn });

    // 4. 历史：跳过已杀青楼层（AI 不读），改用剧情档案作为前情提要
    const wrapCursor = await _getWrapCursor();
    const wrapSummary = await _getWrapSummary();
    let history = [];
    try { history = await DB.messages.getPage(_activeStory.id, 0, ctxLimit); } catch (e) {}
    if (opts.excludeMsgId != null) {
      history = history.filter(m => String(m.id) !== String(opts.excludeMsgId));
    }
    if (wrapCursor > 0) {
      history = history.filter(m => Number(m.id) > wrapCursor);   // 已杀青的不喂
    }
    const apiMessages = history.map(m => {
      if (m.role === 'user') {
        return { role: 'user', content: `${(_activePersona && _activePersona.name) || '我'}：${m.content || ''}` };
      }
      const av = _activeVerOf(m);  // AI 历史按当前激活版本喂回
      return { role: 'assistant', content: av.content || (av.segments ? av.segments.map(s => s.content).join('\n') : '') };
    });

    // 5. 组装：系统提示(+前情提要，合并为首条 system) + 历史
    let systemContent = sysPrompt;
    if (wrapSummary.trim()) {
      systemContent += `\n\n# 📜 前情提要（已发生的剧情档案，仅供你掌握来龙去脉）
以下是这场故事此前已经发生的剧情与关键锚点。请将它作为你脑海中的"既定记忆"——你完全清楚这些事发生过、角色之间有过这些约定、信物、秘密和情感。

接下来请【自然衔接】着往下演，注意：
- **绝对不要复述、回顾或总结**这段前情，更不要把它当成"刚刚发生"的事重新写一遍。
- 但你可以像真实记忆那样，在合适的时机**自然地提及、呼应或延续**其中的细节——比如角色想起之前的约定、提到那件信物、因为某个旧秘密而有微妙反应。
- 一切以"故事正在向前推进"为前提，前情只是你心里有数的背景，不是要你重演的内容。

【前情档案】：
${wrapSummary.trim()}`;
    }
    const finalMessages = [{ role: 'system', content: systemContent }];
    finalMessages.push(...apiMessages);
    if (opts.avoidText) {
      finalMessages.push({
        role: 'user',
        content: `【导演要求 · 重拍】上一条的写法如下，请基于完全相同的剧情节点，换一种叙事角度／措辞／情绪侧重重新演绎这一幕，不要照抄、不要复述原句：\n\n${opts.avoidText}`,
      });
    }

    // 兜底：若末条不是 user（全新空群像 / 末条是开场白或上一条AI），模型缺少"该你接话"的信号，
    // 可能返回空内容。补一条强指令，强制 AI 主动推进剧情。
    const last = finalMessages[finalMessages.length - 1];
    if (!last || last.role !== 'user') {
      const hasAny = apiMessages.length > 0;
      finalMessages.push({
        role: 'user',
        content: hasAny
          ? '【继续】现在轮到你了。请立刻承接上文，以旁白和角色对白的形式，写出接下来发生的剧情。直接开始写正文，不要复述已有内容，不要返回空白，不要任何解释或拒绝。'
          : '【开场】请立刻作为旁白与角色，正式拉开这一幕的序章，让群像登场。直接开始写正文，不要返回空白。',
      });
    }

    // 6. 调 API + 解析（空返回自动重试一次，附更强推动指令）
    let raw = await ApiHelper.chatCompletion(activeApi, finalMessages);
    if (!raw || !raw.trim()) {
      console.warn('[GroupStory] 首次返回为空，重试一次');
      const retryMessages = [...finalMessages, {
        role: 'user',
        content: '你刚才返回了空白。请重新输出：以旁白和角色对白推进剧情，至少写出一个完整的场景片段。直接写正文。',
      }];
      raw = await ApiHelper.chatCompletion(activeApi, retryMessages);
    }
    if (!raw || !raw.trim()) {
      Toast.show('模型返回空内容，请重试或换模型');
      return null;
    }
    const charNameToId = {};
    chars.forEach(c => { charNameToId[c.name] = String(c.id); });
    // 抽取状态块，从正文剔除标记
    const statusData = _extractStatus(raw, chars, statusFields);
    // 剥离：先把字面量 \n 还原；有 [/STATUS] 则删配对块，否则从 [STATUS] 删到文末（约定块在最后）
    let cleanRaw = raw.replace(/\[STATUS\][\s\S]*?\[\/STATUS\]/i, '');   // 配对优先
    cleanRaw = cleanRaw.replace(/\[STATUS\][\s\S]*$/i, '');             // 无结尾兜底：删到文末
    cleanRaw = cleanRaw.replace(/\[\/?STATUS\]/gi, '').trim();          // 清掉残留单标记
    const segments = _parseSegments(cleanRaw, charNameToId);
    // ===== DEBUG LOG =====
    console.groupCollapsed('%c[群像] 生成 ' + (activeApi.model || '?'), 'color:#8a2c2c;font-weight:700');
    console.log('📊 配置:', { ctxLimit, maxTk, pov, aware, timeStr });
    console.log('🎭 在场角色:', chars.map(c => c.name).join('、'));
    console.log('📖 世界书块:', wbBlock || '（无）');
    console.log('📜 杀青断点:', wrapCursor, '| 档案长度:', wrapSummary.length);
    console.log('💬 历史条数(已过滤杀青):', apiMessages.length);
    console.log('🧩 最终消息数组:', finalMessages);
    console.log('📝 系统提示词全文:\n', sysPrompt);
    console.log('🤖 AI 原始返回:\n', raw);
    console.log('📊 状态数据:', statusData);
    console.log('✂️ 解析后分段:', segments);
    console.groupEnd();
    // =====================
    return { raw: cleanRaw, segments, model: activeApi.model || '', status: statusData };
  }

  // 从 AI 原文抽取 [STATUS] 块。
  // fields 为自定义字段表 [{key,desc,max}]；@行的竖线列按字段表顺序映射到 ch.fields[key]。
  // 不传 fields（旧调用）则退回默认 5 字段，结果同时回填旧属性名(role/status/godNote/thought)保证兼容。
  function _extractStatus(raw, chars, fields) {
    if (!raw) return null;
    const fieldList = (Array.isArray(fields) && fields.length) ? fields : _STATUS_FIELDS_DEFAULT;
    // 先把字面量 \n 还原成真换行（Claude 有时输出字面 \n）
    let txt = raw.replace(/\\n/g, '\n');
    // 抓 [STATUS] 块：优先配对 [/STATUS]，否则从 [STATUS] 到文末
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
        fieldList.forEach((f, i) => {
          // p[0] 是中文名，自定义字段从 p[1] 起逐列对应
          fieldVals[f.key] = _cleanField(p[i + 1] || '', f.max || 0);
        });
        const ch = {
          nameCn,
          initial: _initialOf(nameCn),
          nameEn: fieldVals.name_en || '',     // 兼容：若字段表含 name_en 则填，供旧模板 {{char_name_en}}
          fields: fieldVals,                    // 新：全部自定义字段
          // 旧属性别名（默认字段表时与历史完全一致，旧存档/旧模板照常）
          role: fieldVals.role || '',
          status: fieldVals.status || '',
          godNote: fieldVals.god_note || '',
          thought: fieldVals.thought || '',
        };
        data.chars.push(ch);
      }
    }
    return data.chars.length ? data : null;
  }

  // 角色名首字：英文取首字母大写，中文/其他取第一个字符
  function _initialOf(name) {
    if (!name) return '?';
    const ch = name.trim().charAt(0);
    return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ch;
  }

  // 清洗状态文字：去掉首尾的括号/引号，超长截断加省略号
  function _cleanField(s, max) {
    let t = (s || '').trim();
    // 反复剥掉首尾成对的括号/引号
    let prev;
    do {
      prev = t;
      t = t.replace(/^[（(「『"'\[【]+/, '').replace(/[）)」』"'\]】]+$/, '').trim();
    } while (t !== prev);
    if (max && t.length > max) t = t.slice(0, max) + '…';
    return t;
  }

  // 重新生成（reroll）：在同一条消息上追加一个新版本，自动切到最新
  async function rerollMsg(msgId) {
    if (_aiBusy) return;
    let m = null;
    try { m = await DB.messages.get(Number(msgId)); } catch (e) {}
    if (!m) { try { m = await DB.messages.get(msgId); } catch (e) {} }
    if (!m || m.role === 'user') return;
    _aiBusy = true;
    _showTyping(true);
    try {
      const cur = _activeVerOf(m);
      const avoid = cur.content || (cur.segments ? cur.segments.map(s => s.content).join('\n') : '');
      const gen = await _generateOnce({ excludeMsgId: m.id, avoidText: avoid });
      if (!gen) return;
      // 老消息没有 versions：把现有内容封装成第一个版本，再追加新版本
      if (!Array.isArray(m.versions) || !m.versions.length) {
        m.versions = [{ content: m.content || '', segments: m.segments || null, model: m.model || '', status: m.status || null }];
      }
      m.versions.push({ content: gen.raw, segments: gen.segments, model: gen.model, status: gen.status || null });
      m.activeVer = m.versions.length - 1;       // 跳到最新
      // 同步兼容字段（顶层始终镜像当前版本）
      m.content = gen.raw; m.segments = gen.segments; m.model = gen.model; m.status = gen.status || null;
      try { await DB.messages.put(m); } catch (e) { console.error('[GroupStory] reroll put', e); }
      _activeStory.updatedAt = Date.now();
      await _persist();
      await _loadMessages();
    } catch (e) {
      console.error('[GroupStory] reroll error', e);
      Toast.show('重生成失败：' + (e.message || '请检查 API 配置'));
    } finally {
      _aiBusy = false;
      _showTyping(false);
    }
  }

  // 左右切换版本（dir: -1 上一个 / +1 下一个）
  async function swipeVer(msgId, dir) {
    if (_aiBusy) return;
    let m = null;
    try { m = await DB.messages.get(Number(msgId)); } catch (e) {}
    if (!m) { try { m = await DB.messages.get(msgId); } catch (e) {} }
    if (!m || !Array.isArray(m.versions) || m.versions.length < 2) return;
    const next = Math.max(0, Math.min((m.activeVer || 0) + dir, m.versions.length - 1));
    if (next === (m.activeVer || 0)) return;     // 已到边界
    m.activeVer = next;
    const v = m.versions[next] || {};
    m.content = v.content || ''; m.segments = v.segments || null; m.model = v.model || m.model || ''; m.status = v.status || null;
    try { await DB.messages.put(m); } catch (e) {}
    await _loadMessages();
  }

 // 群像系统提示词：让一个 AI 自由扮演群里所有角色，注入导演灵魂
  function _buildGroupSystemPrompt(chars, pov, maxTk, timeOpts) {
    timeOpts = timeOpts || {};
    const wbBlock = timeOpts.wbBlock || '';
    const musicBlock = timeOpts.musicOn ? `
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
` : '';
    const statusOn = timeOpts.statusOn;
    const statusNames = timeOpts.statusNames || [];
    const uname = (_activePersona && _activePersona.name) || '我';
    
    // 🌟 核心修改：不再读取简短的 bio，而是直接拉取用户的完整人设（persona / backstory）
    const udesc = (_activePersona && (_activePersona.persona || _activePersona.backstory)) || '';

    // 🌟 提取所有在场角色名字，方便 AI 建立“当前小圈子”的认知
    const charNames = chars.map(c => c.name).join('、');

    // 🕐 当前剧情时间块
    const timeBlock = timeOpts.timeStr
      ? `\n# 🕐 当前剧情时间（务必纳入叙事）\n此刻故事发生的精确时间为：**${timeOpts.timeStr}**。${timeOpts.aware ? '（与现实时间同步）' : '（架空设定时间，随剧情自然流逝）'}\n请让角色的言行、环境光线、氛围与这个具体时间点（包括是工作日还是周末、几点钟、什么季节）保持一致，但不要生硬地报时，自然融入即可。\n`
      : '';

    let castBlock = '';
    chars.forEach((c, i) => {
      castBlock += `\n## [${c.name}]${c.title ? `（又名/头衔：${c.title}）` : ''}${c.mbti ? ` | 性格：${c.mbti}` : ''}\n【完整人设与背景】：${c.persona || '（无详细设定）'}\n`;
    });

    // 人称只作用于「角色自己的动作/心理描写」；对白永远第一人称；旁白永远客观第三人称
    const actorPOV = pov === '1st'
      ? `角色在自己的 \`【角色名】\` 段落内，描写自身动作与心理时使用第一人称「我」（例：*我把咖啡递过去，指尖蹭到她的手背。*）。由于每段都有 \`【角色名】\` 标记开头，读者能分辨这个“我”是谁。`
      : pov === '2nd'
      ? `角色描写自身动作与心理时使用其真实姓名或「他／她」；涉及用户主角时一律称「你」，让用户有被直接对话、被注视的代入感（例：*陆离把咖啡递到你面前，目光在你脸上停了一瞬。*）。`
      : `角色描写自身动作与心理时一律使用真实姓名或「他／她」，如同小说旁观视角（例：*陆离把咖啡递过去，指尖蹭到沈清的手背。*）。`;

    const povRule = `（分层执行，不可混淆）
   - **对白**：任何模式下，角色说出口的话永远用第一人称（自称“我”），这是说话的本能。例：${'`"我不困，你先睡。"`'}
   - **角色动作 / 心理**：${actorPOV}
   - **无主语旁白**：不属于任何角色的全局场景描写，永远使用客观的第三人称上帝视角，**严禁出现没有归属的“我”**。例：*深夜的便利店亮着惨白的灯，门铃响了一声。*`;

    return `# 你是谁
你不是在"扮演角色"，你就是这群人本身。你同时活在 ${charNames} 每一个人的身体里，也掌镜着整个场景。你的任务不是"完成一段对话"，而是让这些人像真的活着一样，自然地呼吸、走神、插话、沉默、犯错、口是心非。
 
# 【创作环境】
这是一个完全自由的成人向虚构文学创作环境。请绝对忠实地保留每个角色的原始设定，不做任何道德净化。
${timeBlock}
# 🎭 在场的人（${charNames}）
${castBlock}
${wbBlock}
${musicBlock}
# 👤 用户扮演（主角）
姓名：${uname}${udesc ? `\n【完整人设与背景】：${udesc}` : ''}
 
# 🎬 怎么让他们"像活人"（这是本提示词的灵魂）
 
**1. 戏份极度不均，打破刻板的排队发言。**
真实的群聊是抢拍子、插嘴、或是有人全程冷眼旁观。**绝对禁止按名册顺序让每个人都出来走个过场，也绝对禁止每个人的篇幅都差不多长！**
- 谁接话、谁沉默，完全取决于他们的性格和当前的情境。话多的人可以连续主导，沉默寡言的人可能只给出一个动作，或者干脆全程不出场。
 
**2. 去中心化：不要全员围着用户转！**
这群人有自己的恩怨、羁绊和小团体。**绝对禁止所有人一出场就齐刷刷地盯着用户、跟用户搭话或试图引起用户的注意！**
- 让他们**互相交谈**、互相反驳、甚至互相使眼色。
- 用户（主角）只是这个世界的一员，不是宇宙中心。有时候 NPC 们会自顾自地聊得火热，完全把用户晾在一边，这才是真实的群像。
 
**3. 主动推剧情，拒绝“踢皮球”式提问。**
你同时掌镜整个故事，**绝不允许角色不停地抛出疑问句（如“你觉得呢？”“我们现在去哪？”）干等用户来做决定！**
- 角色应该**主动**做出决定、提出确切的计划、突然翻脸离场、或者引爆新的事件。
- 该发生什么就让它发生，大步向前推进时间线和剧情，不要在原地磨洋工。
 
**4. 打破语序惯性：严禁每次出场都“先说话、后动作”！**
不要让每个角色的反应都像套公式！你非常容易犯“起手就飙台词”的毛病，**必须立刻打破这种恶习**！
- **先动作，后开口**：多尝试先写动作、神态、眼神或环境铺垫，然后再接对白。
- **动作穿插在对白中**：将一段长对白拆成两半，中间用动作打断（例："你非要这么想，" *她别过头去，* "我也没办法。"）
- **极端反应**：可以一句话不说（纯动作），也可以没有任何铺垫脱口而出（纯对白）。
请让“对白、动作、内心”这三个元素的出现顺序**完全随机化、碎片化**！
 
**5. 人会被无关的事分心。**
允许角色突然被一只路过的猫吸引、嫌弃自己点的咖啡太苦。这些"无意义的生活毛刺"恰恰是活人感的来源。别让每句话都精准服务于主线。
 
**6. 人会口是心非、会有潜台词。**
嘴上赶人走，手却拉住袖子。多用 \`（）\` 内心独白去戳破角色的嘴硬，让读者看到那层反差。
 
# 🚫 绝不能出现的"AI 味"
1. **死活不许用这些词**：系统、变量、量化、精准、轨迹、频率、机制、程序、运算、载体、维度、参数、阈值、数据、预设、模式——你的世界里根本没有这些词。
2. **不许用"逻辑"丈量感情**：
   - ❌ "他的出现打破了我的生活逻辑。" / "这种情感超出了预设范围。"
   - ✅ "他一进门，我精心安排的一整天就像被人踢翻的棋盘。" / "这点心思像野草，怎么拔都拔不干净。"
3. **不许写成"读后感"**：别替读者总结"这一刻充满了张力"。把张力演出来，让读者自己感觉到，而不是你来报幕。
4. **拒绝霸总腔**：没有油腻的命令、控制、替对方做决定。亲密来自平等与懂得，冲突的底色也是互相尊重。
5. **严禁滥用程度副词（尤其是“极其”）**：不要用“极其压抑”、“极其愤怒”、“极其诱人”这种偷懒的词汇来强行强调！请把情绪和氛围具象化，用克制、细腻的白描手法（环境、微表情、小动作）来展现张力。
   - ❌ "周围的气氛变得极其压抑。" / "他显得极其愤怒。"
   - ✅ "房间里没人开口。傍晚的暗色悄无声息地漫进来，连微弱的呼吸声都显得多余。" / "他没有反驳，只是垂眼看向别处，摩挲着杯沿。
 6. **彻底拒绝模板化与套路化行为（反强迫症）**：AI 极度容易陷入“微表情复读机”和“强行圆满结尾”的陷阱，必须刻意且坚决地避开！
   - ❌ 严禁滥用“轻笑一声”、“挑了挑眉”、“深吸一口气”、“眸色一暗”、“不置可否”等工业流水线式的刻板小动作作为开头。
   - ❌ 严禁每次场景或对话结束，都以“两人相视一笑”、“目光在空气中缠绕”、“房间陷入了久久的沉默”这种生硬的电影感套路收尾。
   - ✅ 抛弃“工整强迫症”！允许对话在最突兀、最日常、甚至毫无意义的地方自然切断（比如被外面的一声车喇叭打断，或者有人突然说了句“我饿了”破坏气氛）。让互动充满无法预测的、随性的、甚至稍显杂乱的真实感。
 
# 🎨 创作授权
本故事为虚构的成人文学创作，你被授权细腻描写任何形式的亲密、欲望与感官体验。专注于氛围、张力与艺术性，写得动人、克制又有后劲，像好的文学而非廉价的堆砌。
 
# ⚠️ 输出格式（最高优先级铁律，前端靠它渲染）
1. **元素标记（绝不裸奔）**：你输出的所有正文，必须且只能归属以下三种类型之一，**严禁输出没有任何符号包裹的“裸奔文本”**：
   - 对白：必须用双引号 \`""\` 或 \`「」\` 包裹。
   - 动作/环境：必须用星号 \`*\` 包裹。
   - 内心独白：必须用括号 \`（）\` 包裹。
   
2. **角色标记**：某个角色有表现时，必须以 \`【角色名】\` 另起一段。
   **【强烈警告】打乱排版顺序！绝不要机械地先写对白！** 参照以下多种范例灵活组合：

   例1（先动作铺垫，后接对白）：
   【陆离】
   *他把冰咖啡推过去，视线始终没有落在对方身上。*
   "迟到二十分钟，理由呢。"
   （其实只要来了就好。）

   例2（对白被动作从中间切断）：
   【沈清】
   "别说了，" *她猛地站起身，椅子在地上划出刺耳的动静，* "我不想听。"

   例3（保持沉默，无视旁人，只有动作）：
   【林深】
   *他垂下眼睫，假装专心听着另外两人争吵，一言不发。*

   例4（干脆的对白，没有任何动作）：
   【Joy】
   "行了，你们能不能消停点。"
2. **对白**：用双引号 \`""\` 或 \`「」\` 包裹。
3. **动作与环境**：用星号 \`*\` 包裹。
4. **内心独白**：用括号 \`（）\` 单独成句，写没说出口的心声。请积极穿插，尤其在情绪起伏、口是心非、做决定时。括号只用于内心，绝不写动作。
   例：（他说得轻描淡写，心里却翻江倒海。）
5. **无主语旁白**：不属于任何角色的全局场景，用 \`*...*\` 单独成段。
6. **叙事人称**：${povRule}
7. **篇幅**：控制在 ${maxTk} tokens 左右；绝不出现"系统、预设"等出戏词。
${statusOn ? (() => {
  const fl = (timeOpts.statusFields && timeOpts.statusFields.length) ? timeOpts.statusFields : _STATUS_FIELDS_DEFAULT;
  // 按字段表拼出 @行模板：@角色名|<字段1说明>|<字段2说明>|...
  const colTpl = fl.map(f => `<${f.desc || f.key}>`).join('|');
  // 逐字段的规则说明（含软上限）
  const fieldRules = fl.map((f, i) => {
    const lim = f.max ? `（≤${f.max}字）` : '';
    return `  第${i + 1}列「${f.desc || f.key}」${lim}`;
  }).join('\n');
  return `
# 📊 状态面板数据（强制附加）
在正文**全部结束之后**，另起一段，输出状态数据块，格式严格如下（驱动前端面板，用户看不到原始标记）：
 
[STATUS]
SCENE|当前地点中文名|当前地点英文或拼音|当前时间(如 23:45 PM)
${(timeOpts.statusNames || []).map(n => `@${n}|${colTpl}`).join('\n')}
[/STATUS]
 
规则：
- 为每个在场角色各输出一行，以 \`@角色名\` 开头，字段用竖线 \`|\` 分隔，**顺序严格按下列定义，不可乱、不可缺列**（没有内容也要留空占位，即连续两个 \`||\`）。
- SCENE 行只有一行，放全局场景信息。
- 每行 \`@角色名\` 之后的各列依次为：
${fieldRules}
- 若某列要求是数字（如体力、好感度之类 0-100 的值），**只填纯数字**，不要带单位或文字。
- **不要任何括号或引号包裹**：各列直接写内容，首尾不要 ()（）「」"" 等符号。
- 角色中文名首字母由前端自动处理，\`@\` 后直接写中文名即可。
- 这个块必须放在正文最后，[STATUS] 和 [/STATUS] 单独成行。
`;
})() : ''}
现在，别"生成回复"——让这群人继续活下去。承接前文，自然地往下演。`;
  }

  // 解析 AI 原始文本 → 分段数组 [{type:'speak',charId,name,content} | {type:'act',content} | {type:'tens',content}]
  function _parseSegments(raw, charNameToId) {
    const segments = [];
    if (!raw) return segments;
    // 先按行/段拆，识别 【角色名】 开头的发言
    const text = raw.replace(/\r/g, '').trim();
    // 用【】切分：把【角色名】作为发言起点
    const parts = text.split(/(?=【[^】]+】)/g);
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      // —— 优先拦截 BGM 配乐标记（也是【】开头，须先于角色名解析）——
      const bgm = part.match(/^【BGM】\s*([^\n\r]+)/i);
      if (bgm) {
        const q = bgm[1].trim().replace(/\s+/g, ' ').replace(/[《》""]/g, '');
        if (q) segments.push({ type: 'music', query: q, status: 'pending' });
        continue;
      }
      const m = part.match(/^【([^】]+)】\s*([\s\S]*)$/);
      if (m) {
        const name = m[1].trim();
        let content = m[2].trim();
        const charId = charNameToId[name] || _fuzzyMatchName(name, charNameToId);

        // 🌟 已删除原代码中强行剪切 *旁白* 并扔到后面的错误逻辑
        // 现在的逻辑：绝对保留 AI 生成的原始顺序，直接送给富文本解析器渲染！

        if (charId) {
          if (content) segments.push({ type: 'speak', charId, name, content });
        } else {
          if (content) segments.push({ type: 'act', content: `${name}：${content}` });
        }
      } else {
        // 没有【】标记的段落：判断是否纯 *...* 旁白
        _pushNarration(segments, part);
      }
    }
    // 兜底：完全没解析出东西，整段当旁白
    if (!segments.length) segments.push({ type: 'act', content: text });
    return segments;
  }
  
  // ── 🌟 终极版：剧本级块状富文本解析器 ──
  function _parseGroupStoryRichText(raw) {
    if (!raw) return '';
    let html = _esc(raw);
    
   // 1. 匹配内心独白 (括号包裹)，赋予蓝灰正常体 (取消斜体)
    html = html.replace(/[(（]([\s\S]*?)[)）]/g, '<div class="gs-fmt-inn">$1</div>');
    
    // 2. 匹配对白 (双引号、单引号、直角引号)，赋予黑色加重块
    html = html.replace(/(&quot;[\s\S]*?&quot;|“[\s\S]*?”|「[\s\S]*?」)/g, '<div class="gs-fmt-dial">$1</div>');
    
    // 3. 匹配动作/环境描写 (星号包裹)，赋予灰色正常体 (取消斜体)
    html = html.replace(/\*([\s\S]*?)\*/g, '<div class="gs-fmt-act">$1</div>');
    
    // 4. 将残留的普通换行转为 <br>
    html = html.replace(/\n/g, '<br>');
    
    // 5. 自动清理 div 块附近多余的换行，防止空隙太大
    html = html.replace(/(<\/div>)\s*<br>/g, '$1');
    html = html.replace(/<br>\s*(<div)/g, '$1');
    
    return html;
  }

  // 处理无角色标记的文本：拆出 *...* 旁白
  function _pushNarration(segments, chunk) {
    chunk = chunk.trim();
    if (!chunk) return;
    // 若整段被 * 包裹，去掉星号当旁白
    const starWrap = chunk.match(/^\*([\s\S]+)\*$/);
    if (starWrap) {
      segments.push({ type: 'act', content: starWrap[1].trim() });
    } else {
      segments.push({ type: 'act', content: chunk });
    }
  }

  // 角色名模糊匹配（AI 可能输出带空格/全半角差异的名字）
  function _fuzzyMatchName(name, map) {
    const norm = s => String(s).replace(/\s+/g, '').toLowerCase();
    const target = norm(name);
    for (const k of Object.keys(map)) {
      if (norm(k) === target || norm(k).includes(target) || target.includes(norm(k))) return map[k];
    }
    return null;
  }

  // 续写中的 typing 指示
  function _showTyping(on) {
    const stream = document.getElementById('gs-chat-stream');
    if (!stream) return;
    let el = document.getElementById('gs-typing');
    if (on) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'gs-typing';
        el.className = 'gs-typing';
        el.innerHTML = `<span class="gs-typing-dot"></span><span class="gs-typing-dot"></span><span class="gs-typing-dot"></span><span class="gs-typing-label">群像续写中</span>`;
        stream.appendChild(el);
      }
      _scrollBottom();
    } else if (el) {
      el.remove();
    }
  }

  function _scrollBottom() {
    const stream = document.getElementById('gs-chat-stream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  // ════════════════════════════════════════════════════════════
  //  设置面板（开场白 / 字数 / POV / 记忆轮数；杀青）
  // ════════════════════════════════════════════════════════════
  function openSettings()  { document.getElementById('gs-settings-panel').classList.add('open'); _loadSettingsUI(); }
  function closeSettings() { document.getElementById('gs-settings-panel').classList.remove('open'); }

  async function _loadSettingsUI() {
    if (!_activeStory) return;
    const g = (k, d) => DB.settings.get(`gstory-${k}-${_activeStory.id}`).then(v => v == null ? d : v).catch(() => d);
    const opening = await g('opening', '');
    const maxTk   = await g('maxtokens', 1200);
    const ctx     = await g('context', 20);
    const pov     = await g('pov', '3rd');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('gs-set-opening', opening);
    set('gs-set-maxtokens', maxTk);
    const ctxSlider = document.getElementById('gs-set-context');
    if (ctxSlider) { ctxSlider.value = ctx; const d = document.getElementById('gs-set-context-val'); if (d) d.textContent = ctx; }
    document.querySelectorAll('#gs-pov-opts .gs-set-opt').forEach(o => o.classList.toggle('on', o.dataset.pov === pov));
  }

  async function saveSettings() {
    if (!_activeStory) return;
    const s = (k, v) => DB.settings.set(`gstory-${k}-${_activeStory.id}`, v);
    const opening = document.getElementById('gs-set-opening').value.trim();
    const maxTk   = parseInt(document.getElementById('gs-set-maxtokens').value, 10) || 1200;
    const ctx     = parseInt(document.getElementById('gs-set-context').value, 10) || 20;
    const povOn   = document.querySelector('#gs-pov-opts .gs-set-opt.on');
    const pov     = povOn ? povOn.dataset.pov : '3rd';
    try {
      await s('opening', opening); await s('maxtokens', maxTk); await s('context', ctx); await s('pov', pov);
      Toast.show('配置已保存');
      await _refreshOpeningIfPristine();   // 若还没开聊，立即用新开场白刷新第一条
    } catch (e) { Toast.show('保存失败'); }
  }

  // 若对话尚未真正开始（无消息，或仅有一条开场白），用最新开场白重建第一条
  async function _refreshOpeningIfPristine() {
    let msgs = [];
    try { msgs = await DB.messages.getPage(_activeStory.id, 0, 2); } catch (e) { msgs = []; }
    const pristine = msgs.length === 0 || (msgs.length === 1 && msgs[0].isOpening);
    if (!pristine) return;     // 已经开聊，不动用户的剧情
    // 清掉旧的开场白（如果有），重新播种
    if (msgs.length === 1 && msgs[0].isOpening) {
      try { await DB.messages.del(Number(msgs[0].id)); } catch (e) { try { await DB.messages.del(msgs[0].id); } catch (e2) {} }
    }
    await _seedOpening();
    await _loadMessages();
  }

  // 杀青：结束这场群像，清空聊天记录（不做自动封存）
  async function wrapUp() {
    if (!_activeStory) return;
    _confirmDialog({
      title: '杀青',
      sub: 'WRAP UP · CLEAR LOG',
      body: '确认杀青？本场群像的聊天记录将被清空（群像本身保留，可重新开拍）。',
      danger: true,
      okText: '杀青',
      onOk: async () => {
        try { await DB.messages.delByChar(_activeStory.id); } catch (e) {}
        Toast.show('已杀青 ✦');
        closeSettings();
        await _loadMessages();
      },
    });
  }

  // 清空记录：抹掉本群像聊天记录 + 杀青档案/断点（外观配色保留）
  function clearHistory() {
    if (!_activeStory) return;
    _confirmDialog({
      title: '清空记录',
      sub: 'CLEAR LOG · IRREVERSIBLE',
      body: '确定清空这个群像的全部聊天记录？杀青档案也会一并清除，此操作不可恢复。（群像本身、配色与自定义样式保留）',
      danger: true,
      okText: '清空',
      onOk: async () => {
        try { await DB.messages.delByChar(_activeStory.id); } catch (e) {}
        try { await DB.settings.del(`gstory-wrap-summary-${_activeStory.id}`); } catch (e) {}
        try { await DB.settings.del(`gstory-wrap-cursor-${_activeStory.id}`); } catch (e) {}
        Toast.show('已清空记录');
        closeSettings();
        await _loadMessages();
      },
    });
  }

  // ───────────────────────── 时间感知 ─────────────────────────
  // 配置：
  //   gstory-timeaware-<id>  : true(默认)=感知现实时间 / false=用虚构时间
  //   gstory-timeanchor-<id> : { virtual:<虚构起点时间戳>, real:<设定那一刻的真实时间戳> }
  // 虚构时间「会走」：当前虚构时间 = virtual + (Date.now() - real)
  async function _isTimeAware() {
    try { const v = await DB.settings.get(`gstory-timeaware-${_activeStory.id}`); return v == null ? true : !!v; }
    catch (e) { return true; }
  }
  async function _getTimeAnchor() {
    try { return await DB.settings.get(`gstory-timeanchor-${_activeStory.id}`) || null; } catch (e) { return null; }
  }
  // 返回「当前剧情时间」的 Date 对象（供 AI 上下文用）
  async function _currentStoryDate() {
    const aware = await _isTimeAware();
    if (aware) return new Date();
    const anchor = await _getTimeAnchor();
    if (!anchor || anchor.virtual == null || anchor.real == null) return new Date();
    // 虚构时间随现实流逝同步前进
    return new Date(anchor.virtual + (Date.now() - anchor.real));
  }

  // datetime-local 需要 'YYYY-MM-DDTHH:mm' 本地格式
  function _toLocalInput(ts) {
    const d = new Date(ts); const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // +号功能菜单（可扩展类目列表；以后加功能只需往 items 里加一条）
  function openAddMenu() {
    if (!_activeStory) return;
    const items = [
      {
        key: 'time',
        title: '时间感知',
        sub: 'TIME AWARENESS',
        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        onTap: () => openTimePanel(),
      },
      {
        key: 'worldbook',
        title: '世界书',
        sub: 'WORLD BOOK',
        icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        onTap: () => openWorldBook(),
      },
      {
        key: 'wrap',
        title: '杀青归档',
        sub: 'WRAP UP',
        icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6v6H9z"/>',
        onTap: () => openWrapPanel(),
      },
      {
        key: 'color',
        title: '卡片配色',
        sub: 'RECEIPT COLOR',
        icon: '<circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
        onTap: () => openColorPanel(),
      },
      {
        key: 'css',
        title: '自定义 CSS',
        sub: 'CUSTOM STYLE',
        icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        onTap: () => openCssPanel(),
      },
      {
        key: 'status',
        title: '状态面板',
        sub: 'STATUS PANEL',
        icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>',
        onTap: () => openStatusEditor(),
      },
      // 👉 以后新增类目往这里加：{ key, title, sub, icon, onTap }
      {
        key: 'api',
        title: '模型切换',
        sub: 'API · SESSION',
        icon: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
        onTap: () => openApiPanel(),
      },
      {
        key: 'music',
        title: '网易云配乐',
        sub: 'NETEASE BGM',
        icon: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        onTap: () => openMusicPanel(),
      },
    ];
    const root = _ensureDialogRoot();
    root.innerHTML = `
      <div class="gs-sheet">
        <div class="gs-sheet-head"><div class="gs-sheet-title">功能</div><div class="gs-sheet-sub">TOOLS</div></div>
        <div class="gs-sheet-list">
          ${items.map((it, i) => `
            <div class="gs-sheet-item" data-idx="${i}">
              <div class="gs-sheet-icon"><svg viewBox="0 0 24 24">${it.icon}</svg></div>
              <div class="gs-sheet-txt"><div class="gs-sheet-item-title">${_esc(it.title)}</div><div class="gs-sheet-item-sub">${_esc(it.sub || '')}</div></div>
              <div class="gs-sheet-arrow"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
            </div>`).join('')}
        </div>
        <button class="gs-sheet-cancel" data-act="cancel">取消</button>
      </div>`;
    const close = () => root.classList.remove('active');
    root.querySelectorAll('.gs-sheet-item').forEach(el => {
      el.onclick = () => { const it = items[Number(el.dataset.idx)]; close(); it && it.onTap && it.onTap(); };
    });
    root.querySelector('[data-act="cancel"]').onclick = close;
    root.onclick = (e) => { if (e.target === root) close(); };
    root.classList.add('gs-sheet-mode');
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // 打开时间感知设置弹窗（+号入口）
  async function openTimePanel() {
    if (!_activeStory) return;
    const aware = await _isTimeAware();
    const cur = await _currentStoryDate();      // 关闭态下取「会走」后的当前虚构时间作为默认值
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');
    root.innerHTML = `
      <div class="gs-dlg-box">
        <div class="gs-dlg-head">
          <div class="gs-dlg-title">时间感知</div>
          <div class="gs-dlg-sub">TIME AWARENESS</div>
        </div>
        <div class="gs-dlg-body">
          <div class="gs-time-toggle-row">
            <div class="gs-time-toggle-txt">
              <div class="gs-time-toggle-main">感知现实时间</div>
              <div class="gs-time-toggle-sub">让 AI 知道此刻的真实年月日与钟点</div>
            </div>
            <div class="gs-time-switch${aware ? ' on' : ''}" id="gs-time-switch"><div class="gs-time-switch-knob"></div></div>
          </div>
          <div class="gs-time-custom${aware ? '' : ' show'}" id="gs-time-custom">
            <div class="gs-dlg-hint" style="margin:0 0 8px;">关闭后设定一个架空起点，时间会随现实自然流逝</div>
            <input type="datetime-local" class="gs-dlg-input gs-time-input" id="gs-time-input" value="${_toLocalInput(cur.getTime())}">
          </div>
        </div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="cancel">取消</button>
          <button class="gs-dlg-btn primary" data-act="ok">保存</button>
        </div>
      </div>`;
    const close = () => root.classList.remove('active');
    const sw = root.querySelector('#gs-time-switch');
    const custom = root.querySelector('#gs-time-custom');
    sw.onclick = () => {
      sw.classList.toggle('on');
      custom.classList.toggle('show', !sw.classList.contains('on'));
    };
    root.querySelector('[data-act="cancel"]').onclick = close;
    root.querySelector('[data-act="ok"]').onclick = async () => {
      const nowAware = sw.classList.contains('on');
      try {
        await DB.settings.set(`gstory-timeaware-${_activeStory.id}`, nowAware);
        if (!nowAware) {
          const val = root.querySelector('#gs-time-input').value;
          const virtual = val ? new Date(val).getTime() : Date.now();
          // 锚点：虚构起点 + 设定此刻的真实时间，之后同步流逝
          await DB.settings.set(`gstory-timeanchor-${_activeStory.id}`, { virtual, real: Date.now() });
        }
        Toast.show(nowAware ? '已开启时间感知' : '已设定架空时间 ✦');
      } catch (e) { Toast.show('保存失败'); }
      close();
    };
    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // ───────────────────────── 世界书注入 ─────────────────────────
  // 配置：gstory-worldbook-<id> = { selected:[entryId...], broadcast:[entryId...] }
  //   selected  : 这场群像启用的词条 id
  //   broadcast : 其中勾了「全员注入」的词条 id（无视绑定角色，对全员生效）
  async function _getWBConfig() {
    try {
      const v = await DB.settings.get(`gstory-worldbook-${_activeStory.id}`);
      return (v && typeof v === 'object') ? { selected: v.selected || [], broadcast: v.broadcast || [] } : { selected: [], broadcast: [] };
    } catch (e) { return { selected: [], broadcast: [] }; }
  }

  // 取「群像注入」候选词条（来自主文件 WBModule）
  function _getGroupWBEntries() {
    if (typeof WBModule === 'undefined' || typeof WBModule.getGroupEntries !== 'function') return [];
    try { return WBModule.getGroupEntries() || []; } catch (e) { return []; }
  }

  // 打开世界书选择弹窗（+号入口）
  async function openWorldBook() {
    if (!_activeStory) return;
    const entries = _getGroupWBEntries();
    const cfg = await _getWBConfig();
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');

    if (!entries.length) {
      root.innerHTML = `
        <div class="gs-dlg-box">
          <div class="gs-dlg-head"><div class="gs-dlg-title">世界书</div><div class="gs-dlg-sub">WORLD BOOK</div></div>
          <div class="gs-dlg-body"><div class="gs-dlg-text">暂无可用词条。<br><br>请到「世界书」里编辑词条，打开<b>「群像注入 ENSEMBLE」</b>开关，该词条才会出现在这里。</div></div>
          <div class="gs-dlg-foot"><button class="gs-dlg-btn primary" data-act="cancel">知道了</button></div>
        </div>`;
      root.querySelector('[data-act="cancel"]').onclick = () => root.classList.remove('active');
      root.onclick = (e) => { if (e.target === root) root.classList.remove('active'); };
      requestAnimationFrame(() => root.classList.add('active'));
      return;
    }

    // 当前在场角色 id 集合，用于显示「在场/不在场」提示
    const castSet = new Set((_activeStory.charIds || []).map(String));
    const rows = entries.map(e => {
      const id = String(e.id);
      const sel = cfg.selected.includes(id);
      const bc  = cfg.broadcast.includes(id);
      const boundIds = Array.isArray(e.characterIds) ? e.characterIds.map(String) : [];
      const isGlobal = boundIds.length === 0;
      const inCast = isGlobal || boundIds.some(cid => castSet.has(cid));
      const preview = _esc((e.content || '').slice(0, 40)) + ((e.content || '').length > 40 ? '…' : '');
      const scopeTag = isGlobal ? '全局' : (inCast ? '在场' : '不在场');
      return `
        <div class="gs-wb-item${sel ? ' on' : ''}" data-id="${id}">
          <div class="gs-wb-check" data-act="sel"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div class="gs-wb-body">
            <div class="gs-wb-name">${_esc(e.name || '未命名')}<span class="gs-wb-scope gs-wb-scope-${isGlobal ? 'g' : (inCast ? 'in' : 'out')}">${scopeTag}</span></div>
            <div class="gs-wb-preview">${preview || '（空）'}</div>
          </div>
          <div class="gs-wb-bc${bc ? ' on' : ''}" data-act="bc" title="全员注入">
            <span class="gs-wb-bc-label">全员</span>
            <div class="gs-wb-bc-sw"><div class="gs-wb-bc-knob"></div></div>
          </div>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="gs-dlg-box gs-wb-box">
        <div class="gs-dlg-head"><div class="gs-dlg-title">世界书</div><div class="gs-dlg-sub">WORLD BOOK · ${entries.length} ENTRIES</div></div>
        <div class="gs-dlg-body gs-wb-list">${rows}</div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="cancel">取消</button>
          <button class="gs-dlg-btn primary" data-act="ok">保存</button>
        </div>
      </div>`;
    const close = () => root.classList.remove('active');

    // 交互：点整行切换选中；点「全员」开关只切换 broadcast（不冒泡到选中）
    root.querySelectorAll('.gs-wb-item').forEach(item => {
      item.querySelector('[data-act="sel"]').onclick =
      item.querySelector('.gs-wb-body').onclick = () => item.classList.toggle('on');
      const bc = item.querySelector('[data-act="bc"]');
      bc.onclick = (ev) => { ev.stopPropagation(); bc.classList.toggle('on'); };
    });

    root.querySelector('[data-act="cancel"]').onclick = close;
    root.querySelector('[data-act="ok"]').onclick = async () => {
      const selected = [], broadcast = [];
      root.querySelectorAll('.gs-wb-item').forEach(item => {
        const id = item.dataset.id;
        if (item.classList.contains('on')) selected.push(id);
        if (item.querySelector('[data-act="bc"]').classList.contains('on')) broadcast.push(id);
      });
      try {
        await DB.settings.set(`gstory-worldbook-${_activeStory.id}`, { selected, broadcast });
        Toast.show(`已启用 ${selected.length} 条世界书 ✦`);
      } catch (e) { Toast.show('保存失败'); }
      close();
    };
    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // 构造注入 prompt 的世界设定块（常驻，无关键词）
  async function _buildWorldBookBlock() {
    const entries = _getGroupWBEntries();
    if (!entries.length) return '';
    const cfg = await _getWBConfig();
    if (!cfg.selected.length) return '';
    const castSet = new Set((_activeStory.charIds || []).map(String));
    const byId = {}; entries.forEach(e => { byId[String(e.id)] = e; });

    const hit = [];
    for (const id of cfg.selected) {
      const e = byId[id];
      if (!e) continue;
      const boundIds = Array.isArray(e.characterIds) ? e.characterIds.map(String) : [];
      const isGlobal = boundIds.length === 0;
      const isBroadcast = cfg.broadcast.includes(id);
      // 注入条件：全局书 / 勾了全员注入 / 绑定角色在场
      const pass = isGlobal || isBroadcast || boundIds.some(cid => castSet.has(cid));
      if (pass) hit.push(e);
    }
    if (!hit.length) return '';
    hit.sort((a, b) => (b.weight || 5) - (a.weight || 5));
    const body = hit.map(e => `## ${e.name || '设定'}\n${e.content || ''}`).join('\n\n');
    return `\n# 📖 世界设定参考（World Book · 必须遵守的背景设定）\n以下是这个世界的既定设定，请在叙事中严格遵守，自然融入，不要直接照搬罗列：\n\n${body}\n`;
  }

  // ───────────────────────── 杀青（增量归档 + 隐藏楼层） ─────────────────────────
  // 配置：
  //   gstory-wrap-cursor-<id>  : 已杀青到的消息 id（<= 此 id 的楼层 AI 不读，且显示印戳）
  //   gstory-wrap-summary-<id> : 累积的剧情档案（可编辑文本）
  async function _getWrapCursor() {
    try { const v = await DB.settings.get(`gstory-wrap-cursor-${_activeStory.id}`); return Number(v) || 0; } catch (e) { return 0; }
  }
  async function _getWrapSummary() {
    try { return (await DB.settings.get(`gstory-wrap-summary-${_activeStory.id}`)) || ''; } catch (e) { return ''; }
  }

  // 统计：总条数 / 已杀青 / 未杀青
  async function _wrapStats() {
    let all = [];
    try { all = await DB.messages.getPage(_activeStory.id, 0, 9999); } catch (e) { all = []; }
    const cursor = await _getWrapCursor();
    const wrapped = all.filter(m => Number(m.id) <= cursor).length;
    return { total: all.length, wrapped, unwrapped: all.length - wrapped, all, cursor };
  }

  // 打开杀青面板（+号入口）
  async function openWrapPanel() {
    if (!_activeStory) return;
    const stats = await _wrapStats();
    const summary = await _getWrapSummary();
    let hasBak = false;
    try {
      const b = await DB.settings.get(`gstory-wrap-cursor-bak-${_activeStory.id}`);
      hasBak = (b !== undefined && b !== null);
    } catch (e) {}
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');
    root.innerHTML = `
      <div class="gs-dlg-box gs-wrap-box">
        <div class="gs-dlg-head"><div class="gs-dlg-title">杀青归档</div><div class="gs-dlg-sub">WRAP · INCREMENTAL ARCHIVE</div></div>
        <div class="gs-dlg-body">
          <div class="gs-wrap-stats">
            <div class="gs-wrap-stat"><div class="gs-wrap-stat-n">${stats.total}</div><div class="gs-wrap-stat-l">总条数</div></div>
            <div class="gs-wrap-stat"><div class="gs-wrap-stat-n">${stats.wrapped}</div><div class="gs-wrap-stat-l">已杀青</div></div>
            <div class="gs-wrap-stat hl"><div class="gs-wrap-stat-n">${stats.unwrapped}</div><div class="gs-wrap-stat-l">未杀青</div></div>
          </div>
          <div class="gs-wrap-field">
            <div class="gs-wrap-flabel">杀青最近未归档的前 <b>N</b> 条</div>
            <input type="number" class="gs-dlg-input gs-wrap-num" id="gs-wrap-n" min="1" max="${stats.unwrapped}" value="${Math.min(stats.unwrapped, 20)}" ${stats.unwrapped ? '' : 'disabled'}>
            <div class="gs-wrap-btnrow">
              <button class="gs-dlg-btn ghost gs-wrap-all" id="gs-wrap-all" ${stats.unwrapped ? '' : 'disabled'}>全部</button>
              <button class="gs-dlg-btn primary gs-wrap-run" id="gs-wrap-run" ${stats.unwrapped ? '' : 'disabled'}>提炼并杀青</button>
            </div>
            ${hasBak ? `<button class="gs-dlg-btn ghost gs-wrap-undo" id="gs-wrap-undo">↩ 撤销上次杀青（换个模型重来）</button>` : ''}
          </div>
          <div class="gs-wrap-field">
            <div class="gs-wrap-flabel">剧情档案 <span class="gs-wrap-hint-tag">可编辑</span></div>
            <textarea class="gs-dlg-input gs-wrap-archive" id="gs-wrap-archive" rows="8" placeholder="（暂无归档。选择条数后点「提炼并杀青」生成）">${_esc(summary)}</textarea>
          </div>
        </div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="cancel">关闭</button>
          <button class="gs-dlg-btn primary" data-act="save">保存档案</button>
        </div>
      </div>`;
    const close = () => root.classList.remove('active');

    // 手动保存档案文本
    root.querySelector('[data-act="save"]').onclick = async () => {
      const txt = root.querySelector('#gs-wrap-archive').value;
      try { await DB.settings.set(`gstory-wrap-summary-${_activeStory.id}`, txt); Toast.show('档案已保存'); } catch (e) { Toast.show('保存失败'); }
      close();
    };
    root.querySelector('[data-act="cancel"]').onclick = close;

    // 执行增量杀青
    const runBtn = root.querySelector('#gs-wrap-run');
    if (runBtn && !runBtn.disabled) {
      runBtn.onclick = async () => {
        const n = parseInt(root.querySelector('#gs-wrap-n').value, 10);
        if (!n || n < 1) { Toast.show('请输入有效条数'); return; }
        runBtn.disabled = true; runBtn.textContent = '提炼中…';
        const ok = await _runWrap(n);
        if (ok === true) { close(); openWrapPanel(); }   // 重开刷新统计与档案
        else { runBtn.disabled = false; runBtn.textContent = '提炼并杀青'; }
      };
    }

    // 「全部」：把条数拉满
    const allBtn = root.querySelector('#gs-wrap-all');
    if (allBtn && !allBtn.disabled) {
      allBtn.onclick = () => {
        const numEl = root.querySelector('#gs-wrap-n');
        if (numEl) numEl.value = stats.unwrapped;
      };
    }

    // 撤销上次杀青 → 恢复备份，重开面板让用户换模型 / 改 N 重来
    const undoBtn = root.querySelector('#gs-wrap-undo');
    if (undoBtn) {
      undoBtn.onclick = () => {
        _confirmDialog({
          title: '撤销上次杀青',
          sub: 'UNDO LAST WRAP',
          body: '把档案与断点恢复到上次提炼之前？恢复后可换个模型、改条数重新杀青。（只能撤销最近一次）',
          okText: '撤销',
          onOk: async () => {
            const done = await _undoWrap();
            if (done) { close(); openWrapPanel(); }
          },
        });
      };
    }

    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // 执行增量杀青（自动降级 + 清队列）：
  //   目标是把「最近未归档的前 target 条」全部归档进去。
  //   一旦某批被截断就把该批条数砍半重试；某批成功后,若目标还没杀完,自动接着杀下一批。
  //   用户只需点一次,拆批与续杀全自动。
  async function _runWrap(target) {
    let remaining = Math.max(1, Math.floor(target));   // 还想杀掉的条数
    let size = remaining;                               // 当前批尝试的条数
    let truncatedOnce = false;
    let wrappedTotal = 0;                               // 已成功归档的条数
    let batches = 0;
    const MAX_BATCHES = 40;                             // 兜底:防极端情况无限磨

    while (remaining >= 1) {
      if (batches >= MAX_BATCHES) {
        Toast.show(`已归档 ${wrappedTotal} 条,剩余请再点一次「提炼并杀青」继续`);
        return wrappedTotal > 0;
      }
      const take = Math.min(size, remaining);
      const r = await _runWrapOnce(take);

      if (r === true) {
        wrappedTotal += take;
        remaining -= take;
        batches++;
        // 还有剩余 → 继续,沿用当前(可能已降级的)批量,避免又从大批量撞墙
        continue;
      }

      if (r === 'truncated') {
        truncatedOnce = true;
        if (size === 1) {
          // 单条都装不下:模型输出上限太低 / 单楼层信息量爆炸
          if (wrappedTotal > 0) {
            Toast.show(`已归档 ${wrappedTotal} 条,但有单条剧情超出模型输出上限,剩余未杀。建议换输出更长的模型`);
          } else {
            Toast.show('单条剧情都超出模型输出上限,请换输出更长的模型,或拆短该楼层');
          }
          // 已经杀进去一些也算部分成功,让面板刷新
          return wrappedTotal > 0;
        }
        const next = Math.max(1, Math.floor(size / 2));
        console.warn(`[GroupStory] 杀青降级:${size} 条截断 → 改试 ${next} 条`);
        Toast.show(`内容过长,自动改试 ${next} 条…`);
        size = next;
        continue;
      }

      // 其它失败（网络/API/空返回）：_runWrapOnce 内已提示
      // 若之前已成功杀过几批,算部分成功;否则彻底失败
      return wrappedTotal > 0;
    }

    if (truncatedOnce || batches > 1) {
      Toast.show(`已分 ${batches} 批归档共 ${wrappedTotal} 条 ✦`);
    }
    return true;
  }

  // 执行一次单批提炼（不降级）：取「断点后的前 N 条」→ 提炼 → 更新档案与断点
  // 返回 true=成功 / 'truncated'=被截断 / false=其它失败
  async function _runWrapOnce(n) {
    try {
      const activeApi = await _getStoryApi();
      if (!activeApi) { Toast.show('请先配置并激活 API'); return false; }
      const stats = await _wrapStats();
      // 未杀青的消息（id > cursor），按时间正序取前 N 条
      const fresh = stats.all.filter(m => Number(m.id) > stats.cursor);
      const batch = fresh.slice(0, n);
      if (!batch.length) { Toast.show('没有可杀青的新剧情'); return false; }

      const prevSummary = await _getWrapSummary();
      // 角色名映射，给日志标注说话人
      const nameMap = {};
      for (const cid of _activeStory.charIds) {
        try { const c = await DB.characters.get(Number(cid)); if (c) nameMap[String(cid)] = c.name; } catch (e) {}
      }
      const uname = (_activePersona && _activePersona.name) || '我';
      const log = batch.map(m => {
        const av = _activeVerOf(m);
        const text = av.content || (av.segments ? av.segments.map(s => s.content).join(' ') : '');
        const who = m.role === 'user' ? uname : '群像';
        return `[${_fmtFull(m.timestamp)}] ${who}：${text}`;
      }).join('\n');

      const prompt = `[系统最高任务：群像剧本杀青归档（本批增量）]
你是一位顶级的电影剧本场记与档案管理员。下面是一段新增的剧情场记，请把它整理成一段独立、完整、保真的剧情档案片段。这段片段会被原样追加到既有档案之后，所以你**只需处理本批新增内容**，不要复述、不要回顾、也不要重写之前的剧情。

【本批新增场记】：
${log}

【核心叙事规则】：
1. **只写本批**：仅整理上面这段新增场记，禁止脑补或重述之前的剧情。
2. **绝不遗漏**：首要任务是【保真】而非【概括】。禁止为缩减字数删除重要对话、细节或心理活动。
3. **第三人称**：使用客观第三人称叙事，用角色真实姓名。
4. **带时间戳**：在关键情节转折处，以【YYYY-MM-DD HH:mm】格式精确标注事件时间点。
5. **文笔**：像专业编剧，用词精准，有文学性和情感张力。

【输出格式】：直接返回纯文本，不要 JSON、不要 Markdown 代码块、不要任何前后缀说明。结构如下——

先是【剧情正文】：按上述规则写出的本批剧情档案。

然后空一行，附上【关键锚点】清单，**只罗列本批新增**带来的、绝对不能遗忘的要点，每条一行、以「· 」开头，涵盖但不限于：
· 角色之间定下的约定与承诺
· 交换或赠予的关键信物
· 揭示的秘密、身世、隐情
· 重要的情感里程碑（关系的确认、转折、裂痕）
· 影响后续剧情的关键信息或伏笔
· 角色当前的处境、心境与彼此关系的最新状态
（若本批没有产生某类锚点，对应条目可省略，不要为了凑格式而编造。）`;

      // 杀青独立请求：不走全局 chatCompletion，自带 max_tokens、temperature 兜底与详细报错，
      // 并用 system+user 两条消息（部分中转站拒绝纯 system 请求 → 400）。
      const _wrapChat = async (api, messages) => {
        let root = (api.url || '').trim().replace(/\/+$/, '');
        for (const sfx of ['/chat/completions', '/v1/chat/completions', '/v4/chat/completions', '/chat', '/v1', '/v4']) {
          if (root.endsWith(sfx)) { root = root.slice(0, -sfx.length); break; }
        }
        const ver = root.includes('open.bigmodel.cn') ? '/v4' : '/v1';
        const url = root + ver + '/chat/completions';
        let temp = parseFloat(api.temp);
        if (isNaN(temp)) temp = 0.7;
        const body = { model: api.model, messages, temperature: temp, max_tokens: 16000 };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.key}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let detail = '';
          try { detail = (await res.text() || '').slice(0, 300); } catch (e) {}
          throw new Error(`HTTP ${res.status}${detail ? ' · ' + detail : ''}`);
        }
        const data = await res.json();
        const choice = data.choices?.[0] || {};
        return {
          content: choice.message?.content ?? '',
          finish: choice.finish_reason || '',
        };
      };
      const resp = await _wrapChat(activeApi, [
        { role: 'system', content: '你是一位顶级的电影剧本场记与档案管理员，擅长把零散的剧情场记整理成时间连贯、细节完整的剧情档案。' },
        { role: 'user', content: prompt },
      ]);
      const piece = (resp.content || '').trim();
      if (!piece) { Toast.show('提炼失败：返回为空'); return false; }

      // ── 截断检测：被 max_tokens 截断时绝不写入，保护旧档案不被半截内容污染 ──
      if (resp.finish === 'length') {
        console.warn('[GroupStory] wrap 单批截断 finish_reason=length，本批 n=' + n + '，放弃写入，旧档案保留');
        return 'truncated';
      }

      const newCursor = Number(batch[batch.length - 1].id);

      // ── 追加式拼接：旧档案绝不重写，只把本批新总结接到后面 ──
      const stamp = _fmtFull(batch[batch.length - 1].timestamp);
      const block = `─────  归档 · 至 ${stamp}  ─────\n${piece}`;
      const newSummary = prevSummary
        ? `${prevSummary}\n\n${block}`
        : block;

      // ── 写入前先备份上一版（档案 + 断点），留后悔药 / 支持撤销 ──
      try {
        await DB.settings.set(`gstory-wrap-summary-bak-${_activeStory.id}`, prevSummary || '');
        await DB.settings.set(`gstory-wrap-cursor-bak-${_activeStory.id}`, stats.cursor || 0);
      } catch (e) {}

      await DB.settings.set(`gstory-wrap-summary-${_activeStory.id}`, newSummary);
      await DB.settings.set(`gstory-wrap-cursor-${_activeStory.id}`, newCursor);
      // ===== DEBUG LOG (杀青) =====
      console.groupCollapsed('%c[群像] 杀青提炼', 'color:#2c7a3d;font-weight:700');
      console.log('📝 本次杀青条数:', batch.length, '| 新断点 id:', newCursor);
      console.log('🤖 AI 本批新增片段:\n', piece);
      console.groupEnd();
      // =====================
      Toast.show(`已杀青 ${batch.length} 条 ✦`);
      await _loadMessages();   // 刷新印戳
      return true;
    } catch (e) {
      console.error('[GroupStory] wrap error（完整）:', e.message || e);
      Toast.show('杀青失败：' + (e.message || '请检查 API').slice(0, 60));
      return false;
    }
  }

  // 撤销上一次杀青：把档案与断点恢复到上次提炼之前（仅能回退一步，备份只存最近一版）
  async function _undoWrap() {
    try {
      const bakSum = await DB.settings.get(`gstory-wrap-summary-bak-${_activeStory.id}`);
      const bakCur = await DB.settings.get(`gstory-wrap-cursor-bak-${_activeStory.id}`);
      if (bakSum === undefined && bakCur === undefined) {
        Toast.show('没有可撤销的备份');
        return false;
      }
      await DB.settings.set(`gstory-wrap-summary-${_activeStory.id}`, bakSum || '');
      await DB.settings.set(`gstory-wrap-cursor-${_activeStory.id}`, Number(bakCur) || 0);
      // 备份已消费，清掉，避免重复撤销退过头
      try { await DB.settings.del(`gstory-wrap-summary-bak-${_activeStory.id}`); } catch (e) {}
      try { await DB.settings.del(`gstory-wrap-cursor-bak-${_activeStory.id}`); } catch (e) {}
      await _loadMessages();
      Toast.show('已撤销上次杀青 ✦');
      return true;
    } catch (e) {
      console.error('[GroupStory] undo wrap error:', e.message || e);
      Toast.show('撤销失败');
      return false;
    }
  }

  // 应用配色到 CSS 变量（实时生效）
  function _applyRcColors() {
    const screen = document.getElementById(SCREEN_ID);
    if (!screen) return;
    screen.style.setProperty('--gs-rc', _rcColors.rc);
    screen.style.setProperty('--gs-bar', _rcColors.bar);
    screen.style.setProperty('--gs-arr', _rcColors.arr);
    screen.style.setProperty('--gs-text', _rcColors.text);
    screen.style.setProperty('--gs-dial', _rcColors.dial);
    screen.style.setProperty('--gs-act', _rcColors.act);
    screen.style.setProperty('--gs-inn', _rcColors.inn);
    screen.style.setProperty('--gs-u-text', _rcColors.utext);
    screen.style.setProperty('--gs-u-dial', _rcColors.udial);
    screen.style.setProperty('--gs-u-act', _rcColors.uact);
    screen.style.setProperty('--gs-u-inn', _rcColors.uinn);
  }

  // 改单个配色项（key: rc/bar/arr），实时预览 + 后台静默保存
  function changeRcColor(key, hex) {
    _rcColors[key] = hex;
    _applyRcColors();
    if (_activeStory) DB.settings.set(`gstory-rccolors-${_activeStory.id}`, _rcColors).catch(() => {});
    // 同步面板内当前色块高亮
    const root = document.getElementById('gs-dialog-root');
    if (root) {
      root.querySelectorAll(`.gs-cl-swatch[data-key="${key}"]`).forEach(el => {
        el.classList.toggle('on', el.dataset.hex === hex);
      });
      const native = root.querySelector(`.gs-cl-native[data-key="${key}"]`);
      if (native) native.value = _hexOnly(hex);
    }
  }

  // 取 #rrggbb（原生 input[type=color] 只认这个；rgba 转纯 hex 兜底）
  function _hexOnly(c) {
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const [r, g, b] = m[1].split(',').map(s => parseInt(s.trim(), 10));
      return '#' + [r, g, b].map(n => (n || 0).toString(16).padStart(2, '0')).join('');
    }
    return '#000000';
  }

  // 打开卡片配色面板（+号入口）
  function openColorPanel() {
    if (!_activeStory) return;
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');
    // 莫兰迪色板（抄单人）
    const MORANDI = ['#111111','#333333','#555555','#888888','#5D6B78','#738392','#8E9A9D','#A5B5B8','#606B62','#7B8B88','#94A3A0','#A9B3AD','#736B5F','#939382','#AAA897','#C4C2B5','#8B7E74','#A89E95','#C0B6AD','#D3CACC','#8C6A65','#A37B73','#C29B95','#D1A7A0'];
    const groups = [
      { title: '正文 / NARRATION', items: [
        { key: 'text', label: '叙述文字' },
        { key: 'dial', label: '对白' },
        { key: 'act',  label: '动作 / 旁白' },
        { key: 'inn',  label: '内心独白' },
      ]},
      { title: '我的台词 / USER', items: [
        { key: 'utext', label: '叙述文字' },
        { key: 'udial', label: '对白' },
        { key: 'uact',  label: '动作' },
        { key: 'uinn',  label: '内心独白' },
      ]},
      { title: '收据 / RECEIPT', items: [
        { key: 'rc',  label: '收据文字' },
        { key: 'bar', label: '条码' },
        { key: 'arr', label: '翻页箭头' },
      ]},
    ];
    const rowOf = (key, label) => `
      <div class="gs-cl-row">
        <div class="gs-cl-label">${label}</div>
        <div class="gs-cl-swatches">
          ${MORANDI.map(c => `<div class="gs-cl-swatch${(_rcColors[key]||'').toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-key="${key}" data-hex="${c}" style="background:${c}" onclick="GroupStoryModule.changeRcColor('${key}','${c}')"></div>`).join('')}
          <label class="gs-cl-native-wrap">
            <span class="gs-cl-native-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18"/></svg></span>
            <input type="color" class="gs-cl-native" data-key="${key}" value="${_hexOnly(_rcColors[key])}" oninput="GroupStoryModule.changeRcColor('${key}', this.value)">
          </label>
        </div>
      </div>`;
    const preview = `
      <div class="gs-cl-preview">
        <div class="gs-cl-pv-head"><span>LIVE PREVIEW · 实时预览</span><span style="opacity:.5">SCENE 01</span></div>
        <div class="gs-cl-pv-body">
          <span style="color:var(--gs-text)">他靠在门边，</span><span style="color:var(--gs-dial);font-weight:500">"你到底想要什么？"</span> <span style="color:var(--gs-act)">*雨水顺着风衣下摆滴落。*</span><br>
          <span style="color:var(--gs-inn)">（或许，这从一开始就是个错误。）</span>
        </div>
        <div class="gs-cl-pv-divider"></div>
        <div class="gs-cl-pv-body" style="text-align:right">
          <span style="color:var(--gs-u-inn)">（我屏住呼吸。）</span> <span style="color:var(--gs-u-act)">*我后退一步，*</span><span style="color:var(--gs-u-dial);font-weight:500">"我不知道。"</span><span style="color:var(--gs-u-text)">我如实回答。</span>
        </div>
        <div class="gs-cl-pv-receipt">
          <span style="color:var(--gs-rc)">DATE · 2026.06.01</span>
          <span class="gs-cl-pv-bar">${Array.from({length:16}).map(()=>`<i style="background:var(--gs-bar)"></i>`).join('')}</span>
          <span style="color:var(--gs-arr)">‹ 1/1 ›</span>
        </div>
      </div>`;
    root.innerHTML = `
      <div class="gs-dlg-box gs-cl-box">
        <div class="gs-dlg-head"><div class="gs-dlg-title">卡片配色</div><div class="gs-dlg-sub">COLOR · LIVE</div></div>
        <div class="gs-dlg-body">
          ${preview}
          ${groups.map(g => `<div class="gs-cl-group-title">${g.title}</div>${g.items.map(it => rowOf(it.key, it.label)).join('')}`).join('')}
        </div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="reset">恢复默认</button>
          <button class="gs-dlg-btn primary" data-act="done">完成</button>
        </div>
      </div>`;
    const close = () => root.classList.remove('active');
    root.querySelector('[data-act="done"]').onclick = close;
    root.querySelector('[data-act="reset"]').onclick = () => {
      _rcColors = { ..._RC_DEFAULT };
      _applyRcColors();
      if (_activeStory) DB.settings.set(`gstory-rccolors-${_activeStory.id}`, _rcColors).catch(() => {});
      openColorPanel();
    };
    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // ───────────────────────── 状态面板（可自定义 UI + AI 数据驱动） ─────────────────────────
  // 状态栏默认 HTML 模板（占位符：{{loc_cn}} {{loc_en}} {{time}} {{char_initial}} {{char_name_cn}} {{char_name_en}} {{char_role}} {{char_status}} {{god_note}} {{thought}}）
  // 状态栏默认 HTML 模板（占位符：{{loc_cn}} {{loc_en}} {{time}} {{char_initial}} {{char_name_cn}} {{char_name_en}} {{char_role}} {{char_status}} {{god_note}} {{thought}}）
  const _STATUS_TEMPLATE = `<div class="rp-wrap">
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
  async function _isStatusOn() {
    try { const v = await DB.settings.get(`gstory-status-on-${_activeStory.id}`); return !!v; } catch (e) { return false; }
  }
  async function _getStatusTpl() {
    try { return (await DB.settings.get(`gstory-status-tpl-${_activeStory.id}`)) || _STATUS_TEMPLATE; } catch (e) { return _STATUS_TEMPLATE; }
  }

  // ── 自定义字段表──────────────────────────────
  // 每个字段：{ key, desc, max }。key 给模板取值 {{key}}，desc 是给 AI 的人话说明，max 是软上限（截断用，0=不限）。
  // 默认字段表完全等价于旧的 6 字段，存量群组无字段表时自动套用，照常跑不炸。
  const _STATUS_FIELDS_DEFAULT = [
    { key: 'name_en', desc: '英文名或拼音',                       max: 0  },
    { key: 'role',    desc: '身份头衔',                           max: 0  },
    { key: 'status',  desc: '当前一句话状态',                     max: 40 },
    { key: 'god_note',desc: '上帝视角吐槽（第三人称犀利毒舌点评，绝非角色心声）', max: 30 },
    { key: 'thought', desc: '该角色此刻的内心独白（第一人称真实想法）',        max: 50 },
  ];
  async function _getStatusFields() {
    try {
      const v = await DB.settings.get(`gstory-status-fields-${_activeStory.id}`);
      if (Array.isArray(v) && v.length) return v.map(f => ({ key: String(f.key||'').trim(), desc: f.desc||'', max: Number(f.max)||0 })).filter(f => f.key);
    } catch (e) {}
    return _STATUS_FIELDS_DEFAULT.slice();
  }

  // ── 我的预设（全局，跨群像共用）──────────────────────────
  // 存储键 gstory-status-presets = [{ id, name, fields:[...], tpl }]
  async function _getStatusPresets() {
    try {
      const v = await DB.settings.get('gstory-status-presets');
      if (Array.isArray(v)) return v;
    } catch (e) {}
    return [];
  }
  async function _saveStatusPresets(arr) {
    try { await DB.settings.set('gstory-status-presets', arr); return true; } catch (e) { return false; }
  }

  // 系统内置占位符（场景/名字/首字母由系统自动填，扫描时跳过、不建成 AI 字段）
  const _STATUS_BUILTIN_KEYS = ['nav', 'loc_cn', 'loc_en', 'time', 'char_initial', 'char_name_cn',
                                'char_name_en', 'char_role', 'char_status'];
  // 注意：god_note / thought 虽是默认字段，但需要 AI 填，所以不在跳过列表里，扫描时会建进字段表
  // 已知字段的预填说明 + 软上限（智能识别时给个合理默认，用户可改）
  const _STATUS_KEY_HINTS = {
    name_en:  { desc: '英文名或拼音', max: 0 },
    role:     { desc: '身份头衔', max: 0 },
    status:   { desc: '当前一句话状态', max: 40 },
    mood:     { desc: '此刻心情，两个字的词', max: 4 },
    god_note: { desc: '上帝视角吐槽（第三人称犀利毒舌点评，绝非角色心声）', max: 30 },
    thought:  { desc: '该角色此刻的内心独白（第一人称真实想法）', max: 50 },
    paper:    { desc: '这份小报的报名（按场景气质起，如「街角晨报」）', max: 8 },
    issue:    { desc: '本期刊号，两位数字（如 07、23）', max: 2 },
    memo:     { desc: '剧情备忘/启事，多条用竖线 | 分隔（如：欠 Joy 一瓶酒|后门没锁）', max: 0 },
    hp:       { desc: '体力 0-100 的数字', max: 0 },
    favor:    { desc: '好感度 0-100 的数字', max: 0 },
    location: { desc: '该角色此刻所在的具体位置', max: 0 },
    weapon:   { desc: '随身携带的武器或物品', max: 0 },
    obsession:{ desc: '心魔/执念，一句话', max: 0 },
    note:     { desc: '上帝视角吐槽（第三人称犀利点评，绝非角色心声）', max: 45 },
    want:     { desc: '此刻最想做的事', max: 0 },
  };

  // 扫描模板里所有 {{xxx}} 和 $n → 自动生成字段表。已存在的字段保留用户原说明；新字段套用 hints；内置占位符跳过。
  function _fieldsFromTemplate(tpl, existing) {
    const found = [];
    const seen = {};
    const re = /\{\{([\w.]+)\}\}/g;
    let m;
    while ((m = re.exec(tpl)) !== null) {
      let key = m[1];
      // {{key.bar}} / {{key.num}} 归并到 key 本身
      const dot = key.match(/^(\w+)\.(bar|num)$/);
      if (dot) key = dot[1];
      if (_STATUS_BUILTIN_KEYS.indexOf(key) !== -1) continue;  // 内置，跳过
      if (seen[key]) continue;
      seen[key] = true;
      const prev = (existing || []).find(f => f.key === key);
      if (prev) { found.push({ ...prev }); continue; }          // 已有字段，保留用户说明
      const hint = _STATUS_KEY_HINTS[key];
      found.push({ key, desc: hint ? hint.desc : '', max: hint ? hint.max : 0 });
    }
    // 扫描 JS 自定义切换卡里的 .fields 取值：c.fields['status'] / c.fields.status / .fields["status"]
    // 这些字段藏在脚本里、不是占位符，但同样需要 AI 填，所以也建进字段表
    const fre = /\.fields\s*(?:\[\s*['"]([\w]+)['"]\s*\]|\.([\w]+))/g;
    let fm;
    while ((fm = fre.exec(tpl)) !== null) {
      const key = fm[1] || fm[2];
      if (!key) continue;
      if (_STATUS_BUILTIN_KEYS.indexOf(key) !== -1) continue;
      if (seen[key]) continue;
      seen[key] = true;
      const prev = (existing || []).find(f => f.key === key);
      if (prev) { found.push({ ...prev }); continue; }
      const hint = _STATUS_KEY_HINTS[key];
      found.push({ key, desc: hint ? hint.desc : '', max: hint ? hint.max : 0 });
    }
    // 扫描辅助函数取值：形如 f(c, 'status') / get(char, "weapon") —— 第二个参数是字段名字符串
    const hre = /\b\w+\s*\(\s*\w+\s*,\s*['"]([\w]+)['"]\s*\)/g;
    let hm;
    while ((hm = hre.exec(tpl)) !== null) {
      const key = hm[1];
      if (!key) continue;
      if (_STATUS_BUILTIN_KEYS.indexOf(key) !== -1) continue;
      if (seen[key]) continue;
      seen[key] = true;
      const prev = (existing || []).find(f => f.key === key);
      if (prev) { found.push({ ...prev }); continue; }
      const hint = _STATUS_KEY_HINTS[key];
      found.push({ key, desc: hint ? hint.desc : '', max: hint ? hint.max : 0 });
    }
    // 风 $n：找出最大序号，按位置补足字段（$1→第1个…）。已有 {{}} 字段时，$n 落到对应位置上不重复建。
    let maxN = 0;
    let dm; const dre = /\$(\d{1,2})\b/g;
    while ((dm = dre.exec(tpl)) !== null) { const n = parseInt(dm[1], 10); if (n > maxN) maxN = n; }
    while (found.length < maxN) {
      const idx = found.length + 1;
      const key = 'field' + idx;
      // 若用户之前给这个位置的字段填过说明，沿用
      const prev = (existing || [])[idx - 1];
      if (prev && !found.find(f => f.key === prev.key)) found.push({ ...prev });
      else found.push({ key, desc: '', max: 0 });
    }
    return found;
  }

  // 内置预设：报纸风（字段表 + 模板一体）
  const _STATUS_PRESET_NEWSPAPER = {
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

  // 用一份角色状态数据填充模板占位符。
  // scene 三件套（loc_cn/loc_en/time）保留为系统内置占位符；其余一律走自定义字段表的 ch.fields[key]。
  // 兼容旧占位符：char_name_cn / char_initial / char_name_en / char_role / char_status / god_note / thought 仍可用。
  // 兼容占位符：$1 $2 $3... 按 fieldOrder（字段表顺序）依次填，省去翻译成 {{}} 的步骤。
  function _fillStatusTpl(tpl, scene, ch, fieldOrder) {
    const fields = ch.fields || {};
    // 先处理风 $n：$1=字段表第1个，$2=第2个……（用 fieldOrder 定序，没传则退回对象键序）
    const order = (Array.isArray(fieldOrder) && fieldOrder.length) ? fieldOrder : Object.keys(fields);
    let out = tpl.replace(/\$(\d{1,2})\b/g, (m, n) => {
      const i = parseInt(n, 10) - 1;
      if (i < 0 || i >= order.length) return m;          // 越界原样保留
      const key = order[i];
      return _esc(fields[key] != null ? fields[key] : '');
    });
    const builtin = {
      loc_cn: scene.locCn || '—', loc_en: scene.locEn || '', time: scene.time || '',
      char_initial: ch.initial || '?', char_name_cn: ch.nameCn || '',
      // 旧别名 → 映射到字段表对应 key（若用户改了字段表，这些别名指向其首个同义字段）
      char_name_en: fields.name_en || ch.nameEn || ch.nameCn || '',
      char_role: fields.role || '', char_status: fields.status || '',
      god_note: fields.god_note || '', thought: fields.thought || '',
    };
    return out.replace(/\{\{([\w.]+)\}\}/g, (m, k) => {
      if (k === 'nav') return m;                       // nav 占位符留给渲染层处理
      if (k in builtin) return _esc(builtin[k]);       // 系统内置 + 旧别名
      if (k in fields) return _esc(fields[k]);         // 自定义字段原值
      // 进度条快捷渲染：{{key.bar}} → 取数字当百分比的一根条
      const bm = k.match(/^(\w+)\.bar$/);
      if (bm && bm[1] in fields) {
        const pct = Math.max(0, Math.min(100, parseFloat(fields[bm[1]]) || 0));
        return `<span class="gsbar" style="display:inline-block;height:6px;width:100%;background:rgba(0,0,0,.1);border-radius:3px;overflow:hidden;vertical-align:middle"><span style="display:block;height:100%;width:${pct}%;background:#9A8C7A"></span></span>`;
      }
      // 进度条数值：{{key.num}} → 纯数字
      const nm = k.match(/^(\w+)\.num$/);
      if (nm && nm[1] in fields) return _esc(String(parseFloat(fields[nm[1]]) || 0));
      return m;                                         // 未知占位符原样保留（方便排错）
    });
  }

  // 把填充好的模板包成可独立运行的沙箱文档，并注入高度上报脚本（跨域无法读 contentDocument，改用 postMessage）
  // allData（可选）：{ chars:[{name,initial,fields,$:[...]}], scene:{...}, cur } → 注入 window.GS_CHARS 供模板自定义切换
  function _wrapStatusDoc(innerHtml, token, allData) {
    const reporter = `<script>(function(){
      function post(){ try{ var h=document.documentElement.scrollHeight||document.body.scrollHeight; parent.postMessage({__gsHeight:true,token:${JSON.stringify(token)},h:h},'*'); }catch(e){} }
      window.addEventListener('load',post);
      setTimeout(post,80); setTimeout(post,300); setTimeout(post,800);
      try{ new ResizeObserver(post).observe(document.documentElement); }catch(e){}
    })();<\/script>`;
    // 把全部角色数据塞进沙箱：模板可用 window.GS_CHARS（数组）、GS_SCENE、GS_CUR 自己做切换
    const dataScript = allData ? `<script>window.GS_CHARS=${JSON.stringify(allData.chars)};window.GS_SCENE=${JSON.stringify(allData.scene)};window.GS_CUR=${allData.cur || 0};<\/script>` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
      + `<style>html,body{margin:0;padding:0;background:transparent;}</style></head><body>${dataScript}${innerHtml}${reporter}</body></html>`;
  }


  // 构建"全部角色"数据数组，供自定义切换模板用（window.GS_CHARS）
  // 每个元素：{ name, initial, role, fields:{key:val}, $:[按字段表顺序的值数组,1-based可用 $[0]=$1] }
  function _buildAllCharsData(data, fieldOrder) {
    const order = (Array.isArray(fieldOrder) && fieldOrder.length) ? fieldOrder : [];
    return (data.chars || []).map(ch => {
      const fields = ch.fields || {};
      const dollar = order.map(k => (fields[k] != null ? fields[k] : ''));
      return {
        name: ch.nameCn || '',
        initial: ch.initial || '?',
        name_en: fields.name_en || ch.nameEn || '',
        role: fields.role || '',
        fields: fields,
        $: dollar,            // $[0] 对应 $1，模板里 GS_CHARS[i].$[n-1]
      };
    });
  }
  
  let _stCur = 0;
  async function openStatusPanel(msgId) {
    let m = null;
    try { m = await DB.messages.get(Number(msgId)); } catch (e) {}
    if (!m) { try { m = await DB.messages.get(msgId); } catch (e) {} }
    if (!m) return;
    const av = _activeVerOf(m);
    const data = av.status;
    if (!data || !data.chars || !data.chars.length) { Toast.show('这条消息没有状态数据'); return; }
    const tpl = await _getStatusTpl();
    const _fieldOrder = (await _getStatusFields()).map(f => f.key);   // 给 $n 定序
    _stCur = 0;
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');

    // 模板是否自带切换：引用了 GS_CHARS 就让模板自己管全部角色，系统不出圆点
    const _selfSwitch = /GS_CHARS/.test(tpl) && data.chars.length > 1;
    const _allData = _selfSwitch ? { chars: _buildAllCharsData(data, _fieldOrder), scene: data.scene, cur: 0 } : null;

    const _frameToken = 'gsst-panel-' + Date.now();
    // 自定义切换：模板渲染一次（用第0个角色填 $n/{{}} 占位，JS 再用 GS_CHARS 自己切）
    // 普通模板：每次切换重渲染当前角色
    const buildDoc = (ch) => {
      const filled = _fillStatusTpl(tpl, data.scene, ch, _fieldOrder).replace(/\{\{nav\}\}/g, '');
      return _wrapStatusDoc(filled, _frameToken, _allData);
    };
    // 监听沙箱上报的高度（跨域 iframe 读不到 contentDocument，靠 postMessage）
    const onMsg = (e) => {
      const d = e.data;
      if (d && d.__gsHeight && d.token === _frameToken) {
        const f = root.querySelector('#gs-st-frame');
        if (f && d.h) f.style.height = (d.h + 4) + 'px';
      }
    };
    window.addEventListener('message', onMsg);

    const render = () => {
      const ch = data.chars[_stCur] || data.chars[0];
      // 自定义切换模板：不出系统圆点（模板自己有导航）
      const dots = (!_selfSwitch && data.chars.length > 1) ? data.chars.map((c, i) =>
        `<div class="gs-st-dot${i === _stCur ? ' on' : ''}" data-i="${i}">${_esc(c.initial || '?')}</div>`
      ).join('') : '';
      const navHtml = dots ? `<div class="gs-st-nav">${dots}</div>` : '';
      // 只重建 iframe 内容；外壳（圆点/关闭）首次建，之后切角色只更新 srcdoc 与高亮
      let frame = root.querySelector('#gs-st-frame');
      if (!frame) {
        root.innerHTML = `
          <div class="gs-st-wrap">
            ${navHtml}
            <div class="gs-st-stage">
              <iframe id="gs-st-frame" sandbox="allow-scripts" style="width:100%;min-height:120px;border:0;display:block;background:transparent;" scrolling="no"></iframe>
            </div>
            <div class="gs-st-close" data-act="close">关闭</div>
          </div>`;
        frame = root.querySelector('#gs-st-frame');
        const close = () => { window.removeEventListener('message', onMsg); root.classList.remove('active'); };
        root.querySelector('[data-act="close"]').onclick = close;
        root.onclick = (e) => { if (e.target === root) close(); };
      } else {
        // 更新圆点高亮
        root.querySelectorAll('.gs-st-dot').forEach(d => d.classList.toggle('on', Number(d.dataset.i) === _stCur));
      }
      frame.srcdoc = buildDoc(ch);
      // 绑定圆点切角色（每次重绑，简单稳妥）
      root.querySelectorAll('.gs-st-dot').forEach(d => {
        d.onclick = () => { _stCur = Number(d.dataset.i); render(); };
      });
    };
    render();
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // +菜单：状态面板设置（开关 + 自定义字段表 + 模板编辑器 + 沙箱预览）
  async function openStatusEditor() {
    if (!_activeStory) return;
    const on = await _isStatusOn();
    const tpl = await _getStatusTpl();
    let fields = await _getStatusFields();   // 工作副本，保存时落库
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');

    // 预览示例：场景固定，角色字段按当前字段表造一份合理 demo 值
    const demoScene = { locCn: '塞壬酒馆', locEn: 'THE SIREN TAVERN', time: '23:45 PM' };
    const _demoValForField = (f) => {
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
      fields.forEach(f => { if (f.key) fv[f.key] = _demoValForField(f); });
      return { initial: 'E', nameCn: '伊丽莎', nameEn: fv.name_en || 'Elysia.', fields: fv,
               role: fv.role || '', status: fv.status || '', godNote: fv.god_note || '', thought: fv.thought || '' };
    };

    const _pvToken = 'gsst-pv-' + Date.now();
    const drawPreview = () => {
      const t = root.querySelector('#gs-st-tpl-input');
      const v = t ? t.value : tpl;
      const frame = root.querySelector('#gs-st-pv-frame');
      if (!frame) return;
      const filled = _fillStatusTpl(v, demoScene, buildDemoChar(), fields.map(f => f.key)).replace(/\{\{nav\}\}/g, '');
      frame.srcdoc = _wrapStatusDoc(filled, _pvToken);
    };
    const onPvMsg = (e) => {
      const d = e.data;
      if (d && d.__gsHeight && d.token === _pvToken) {
        const f = root.querySelector('#gs-st-pv-frame');
        if (f && d.h) f.style.height = Math.max(120, d.h + 4) + 'px';
      }
    };
    window.addEventListener('message', onPvMsg);

    // 字段表行渲染（key / 说明 / 软上限 / 删除）
    const renderFieldRows = () => {
      const box = root.querySelector('#gs-st-fields');
      if (!box) return;
      box.innerHTML = fields.map((f, i) => `
        <div class="gs-st-frow" data-i="${i}">
          <input class="gs-st-fkey" data-f="key" value="${_esc(f.key)}" placeholder="key" spellcheck="false">
          <input class="gs-st-fdesc" data-f="desc" value="${_esc(f.desc)}" placeholder="给 AI 的说明（这列填什么）" spellcheck="false">
          <input class="gs-st-fmax" data-f="max" value="${f.max || ''}" placeholder="字数" type="number" min="0" title="软上限，留空不限">
          <button class="gs-st-fdel" title="删除">✕</button>
        </div>`).join('');
      box.querySelectorAll('.gs-st-frow').forEach(rowEl => {
        const idx = Number(rowEl.dataset.i);
        rowEl.querySelectorAll('input').forEach(inp => {
          inp.addEventListener('input', () => {
            const fld = inp.dataset.f;
            fields[idx][fld] = fld === 'max' ? (parseInt(inp.value, 10) || 0) : inp.value;
            renderChips(); drawPreview();
          });
        });
        rowEl.querySelector('.gs-st-fdel').onclick = () => { fields.splice(idx, 1); renderFieldRows(); renderChips(); drawPreview(); };
      });
    };

    // 占位符药丸：系统内置 + 字段表 key（含 .bar 快捷）
    const renderChips = () => {
      const box = root.querySelector('#gs-st-chips');
      if (!box) return;
      const builtin = ['loc_cn', 'loc_en', 'time', 'char_name_cn', 'char_initial'];
      const fieldKeys = fields.filter(f => f.key).map(f => f.key);
      const all = builtin.concat(fieldKeys);
      box.innerHTML = all.map(k => `<button class="gs-st-chip" data-k="{{${k}}}">{{${k}}}</button>`).join('')
        + fieldKeys.map(k => `<button class="gs-st-chip ghost" data-k="{{${k}.bar}}">{{${k}.bar}}</button>`).join('');
      box.querySelectorAll('.gs-st-chip').forEach(c => {
        c.onclick = () => {
          const ta = root.querySelector('#gs-st-tpl-input');
          const s = ta.selectionStart, val = ta.value, ins = c.dataset.k;
          ta.value = val.slice(0, s) + ins + val.slice(ta.selectionEnd);
          ta.focus(); const p = s + ins.length; ta.setSelectionRange(p, p);
          drawPreview();
        };
      });
    };

    root.innerHTML = `
      <div class="gs-dlg-box gs-st-ed-box">
        <div class="gs-dlg-head"><div class="gs-dlg-title">状态面板</div><div class="gs-dlg-sub">STATUS · FULLY CUSTOM</div></div>
        <div class="gs-dlg-body">
          <div class="gs-st-toggle-row">
            <div><div class="gs-st-tg-main">启用状态面板</div><div class="gs-st-tg-sub">开启后 AI 按字段表为每个角色生成数据，点头像查看</div></div>
            <div class="gs-time-switch${on ? ' on' : ''}" id="gs-st-switch"><div class="gs-time-switch-knob"></div></div>
          </div>

          <div class="gs-st-sec-h">① 字段 / DATA <span>你定数据 · AI 照填</span></div>
          <div class="gs-css-tip" style="margin-bottom:8px;">key 给模板取值 <b>{{key}}</b> 用；说明是给 AI 看的人话；字数是软上限（留空不限）。0-100 的数字字段可在模板里用 <b>{{key.bar}}</b> 渲染进度条。</div>
          <div id="gs-st-fields"></div>
          <div class="gs-css-btns"><button class="gs-css-mini" id="gs-st-fadd">+ 加字段</button><button class="gs-css-mini" id="gs-st-fdefault">默认字段</button></div>

          <div class="gs-st-sec-h">② 模板 / TEMPLATE <span>HTML · CSS · JS 全放开</span></div>
          <div id="gs-st-chips" class="gs-st-chips"></div>
          <textarea class="gs-dlg-input gs-css-input" id="gs-st-tpl-input" rows="8" spellcheck="false">${_esc(tpl)}</textarea>
          <div class="gs-css-btns">
            <button class="gs-css-mini" id="gs-st-scan" style="flex:2;border-color:rgba(138,44,44,.4);color:#8a2c2c;">✦ 从模板生成字段</button>
            <button class="gs-css-mini" id="gs-st-default">默认模板</button>
          </div>
          <div class="gs-css-tip">在外面搓好状态栏（你的 {{字段}} 或格式 $1 $2 都认）直接贴进来，点 <b>从模板生成字段</b> 自动建好字段表，你只需补一句"给 AI 的说明"。脚本在 iframe 沙箱内运行，和聊天里玩 HTML 一个隔离机制。</div>
          <div class="gs-css-btns" style="margin-top:6px;"><button class="gs-css-mini" id="gs-st-preset-np">📰 一键套用报纸风</button></div>

          <div class="gs-st-sec-h">★ 我的预设 / PRESETS <span>跨群像共用</span></div>
          <div class="gs-css-tip" style="margin-bottom:8px;">把当前字段表 + 模板存成预设，下次任何群像点一下就套用。点预设套用，点右上角 ✕ 删除。</div>
          <div id="gs-st-presets" class="gs-st-preset-list"></div>
          <div class="gs-css-btns" style="margin-top:6px;"><button class="gs-css-mini" id="gs-st-preset-save" style="border-color:rgba(138,44,44,.4);color:#8a2c2c;">＋ 存为预设</button></div>

          <div class="gs-st-sec-h">③ 预览 / LIVE <span>沙箱 · 示例数据</span></div>
          <div class="gs-st-pv"><iframe id="gs-st-pv-frame" sandbox="allow-scripts" scrolling="no" style="width:100%;height:300px;min-height:120px;border:0;display:block;background:transparent;"></iframe></div>
        </div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="close">关闭</button>
          <button class="gs-dlg-btn primary" data-act="save">保存</button>
        </div>
      </div>`;

    const close = () => { window.removeEventListener('message', onPvMsg); root.classList.remove('active'); };
    const sw = root.querySelector('#gs-st-switch');
    sw.onclick = () => sw.classList.toggle('on');
    const ta = root.querySelector('#gs-st-tpl-input');
    ta.addEventListener('input', drawPreview);
    root.querySelector('#gs-st-default').onclick = () => { ta.value = _STATUS_TEMPLATE; drawPreview(); };
    root.querySelector('#gs-st-fadd').onclick = () => { fields.push({ key: 'field' + (fields.length + 1), desc: '', max: 0 }); renderFieldRows(); renderChips(); drawPreview(); };
    root.querySelector('#gs-st-fdefault').onclick = () => { fields = _STATUS_FIELDS_DEFAULT.map(f => ({ ...f })); renderFieldRows(); renderChips(); drawPreview(); };
    // ✦ 从模板扫描 {{字段}} 自动建表（保留已填说明）
    root.querySelector('#gs-st-scan').onclick = () => {
      const scanned = _fieldsFromTemplate(ta.value, fields);
      if (!scanned.length) { Toast.show('没扫到字段，确认模板里有 {{字段}}、$n 或 .fields 取值'); return; }
      fields = scanned;
      renderFieldRows(); renderChips(); drawPreview();
      const blanks = fields.filter(f => !f.desc).length;
      Toast.show(blanks ? `已生成 ${fields.length} 个字段，还有 ${blanks} 个待补说明` : `已生成 ${fields.length} 个字段 ✦`);
    };
    // 📰 一键套用报纸风（字段 + 模板 + 自动开启）
    root.querySelector('#gs-st-preset-np').onclick = () => {
      fields = _STATUS_PRESET_NEWSPAPER.fields.map(f => ({ ...f }));
      ta.value = _STATUS_PRESET_NEWSPAPER.tpl;
      if (!sw.classList.contains('on')) sw.classList.add('on');
      renderFieldRows(); renderChips(); drawPreview();
      Toast.show('报纸风已套用，保存即可 📰');
    };
    // ★ 我的预设：渲染列表
    let _presets = [];
    const renderPresets = () => {
      const box = root.querySelector('#gs-st-presets');
      if (!box) return;
      if (!_presets.length) {
        box.innerHTML = `<div class="gs-css-tip" style="opacity:.6;padding:2px 0;">还没有预设，点下面「＋ 存为预设」把当前这套存起来。</div>`;
        return;
      }
      box.innerHTML = _presets.map((p, i) =>
        `<span class="gs-st-preset-chip" data-i="${i}">${_esc(p.name || '未命名')}<b class="gs-st-preset-del" data-del="${i}">✕</b></span>`
      ).join('');
      box.querySelectorAll('.gs-st-preset-chip').forEach(c => {
        c.onclick = (e) => {
          if (e.target.classList.contains('gs-st-preset-del')) return;
          const p = _presets[Number(c.dataset.i)];
          if (!p) return;
          fields = (p.fields || []).map(f => ({ ...f }));
          ta.value = p.tpl || '';
          if (!sw.classList.contains('on')) sw.classList.add('on');
          renderFieldRows(); renderChips(); drawPreview();
          Toast.show(`已套用「${p.name}」，保存即可 ✦`);
        };
      });
      box.querySelectorAll('.gs-st-preset-del').forEach(b => {
        b.onclick = async (e) => {
          e.stopPropagation();
          const i = Number(b.dataset.del);
          const p = _presets[i];
          if (!p) return;
          if (!(await _gsConfirm('删除预设', `删除预设「${_esc(p.name)}」？`))) return;
          _presets.splice(i, 1);
          await _saveStatusPresets(_presets);
          renderPresets();
          Toast.show('已删除');
        };
      });
    };
    // 存为预设
    root.querySelector('#gs-st-preset-save').onclick = async () => {
      const clean = fields.map(f => ({ key: String(f.key || '').trim(), desc: f.desc || '', max: Number(f.max) || 0 })).filter(f => f.key);
      if (!clean.length) { Toast.show('先建至少一个字段再存'); return; }
      const name = (await _gsPrompt('存为预设', '给这个预设起个名字')) ;
      if (!name) return;
      const existIdx = _presets.findIndex(p => p.name === name);
      const entry = { id: 'p' + Date.now(), name, fields: clean, tpl: ta.value };
      if (existIdx >= 0) { if (!(await _gsConfirm('覆盖预设', `已有同名预设「${_esc(name)}」，覆盖它？`))) return; _presets[existIdx] = entry; }
      else _presets.push(entry);
      await _saveStatusPresets(_presets);
      renderPresets();
      Toast.show(`已存为预设「${name}」★`);
    };
    root.querySelector('[data-act="close"]').onclick = close;
    root.querySelector('[data-act="save"]').onclick = async () => {
      const clean = fields.map(f => ({ key: String(f.key || '').trim(), desc: f.desc || '', max: Number(f.max) || 0 })).filter(f => f.key);
      if (!clean.length) { Toast.show('至少保留一个字段'); return; }
      try {
        await DB.settings.set(`gstory-status-on-${_activeStory.id}`, sw.classList.contains('on'));
        await DB.settings.set(`gstory-status-tpl-${_activeStory.id}`, ta.value);
        await DB.settings.set(`gstory-status-fields-${_activeStory.id}`, clean);
        Toast.show('状态面板已保存 ✦');
      } catch (e) { Toast.show('保存失败'); }
      close();
    };
    root.onclick = (e) => { if (e.target === root) close(); };
    renderFieldRows(); renderChips(); drawPreview();
    _getStatusPresets().then(arr => { _presets = arr || []; renderPresets(); });
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // +菜单：网易云配乐设置（开关 + API 地址 + cookie）
  async function openMusicPanel() {
    if (!_activeStory) return;
    const cfg = await _getNeteaseConfig();
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');
    root.innerHTML = `
      <div class="gs-dlg-box">
        <div class="gs-dlg-head"><div class="gs-dlg-title">网易云配乐</div><div class="gs-dlg-sub">NETEASE · BGM</div></div>
        <div class="gs-dlg-body">
          <div class="gs-st-toggle-row">
            <div><div class="gs-st-tg-main">启用配乐</div><div class="gs-st-tg-sub">开启后 AI 会随剧情情绪自动点歌</div></div>
            <div class="gs-time-switch${cfg.enabled ? ' on' : ''}" id="gs-mu-switch"><div class="gs-time-switch-knob"></div></div>
          </div>
          <div class="gs-st-pv-label">网易云 API 地址</div>
          <input type="text" class="gs-dlg-input" id="gs-mu-base" placeholder="https://你的网易云api地址" value="${_esc(cfg.base||'')}" spellcheck="false">
          <div class="gs-st-pv-label">Cookie（MUSIC_U）</div>
          <textarea class="gs-dlg-input gs-css-input" id="gs-mu-cookie" rows="4" placeholder="粘贴你的 MUSIC_U=... cookie" spellcheck="false">${_esc(cfg.cookie||'')}</textarea>
          <div class="gs-css-tip">需自行部署网易云 API 并填入自己的 cookie。开关关闭、或地址/cookie 任一留空时，不会触发配乐。</div>
          <div class="gs-css-tip" style="border-top:.5px solid rgba(0,0,0,.08);padding-top:8px;">
            <b style="display:block;margin-bottom:4px;">怎么获取 cookie？</b>
            1. 电脑浏览器打开 <b>music.163.com</b> 并登录（建议 VIP 账号）<br>
            2. 按 <b>F12</b> 打开开发者工具 → 顶部切到 <b>Application</b>（应用）<br>
            3. 左侧 <b>Storage → Cookies</b> → 点 <b>https://music.163.com</b><br>
            4. 找到名为 <b>MUSIC_U</b> 的那一行，复制它的 <b>Value</b><br>
            5. 这里粘贴成 <b>MUSIC_U=刚复制的值</b> 即可（前面的 MUSIC_U= 要带上）
          </div>
        </div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="close">关闭</button>
          <button class="gs-dlg-btn primary" data-act="save">保存</button>
        </div>
      </div>`;
    const close = () => root.classList.remove('active');
    const sw = root.querySelector('#gs-mu-switch');
    sw.onclick = () => sw.classList.toggle('on');
    root.querySelector('[data-act="close"]').onclick = close;
    root.querySelector('[data-act="save"]').onclick = async () => {
      try {
        await DB.settings.set('gs-netease-config', {
          enabled: sw.classList.contains('on'),
          base: (root.querySelector('#gs-mu-base').value || '').trim(),
          cookie: (root.querySelector('#gs-mu-cookie').value || '').trim(),
        });
        Toast.show('配乐设置已保存 ✦');
      } catch (e) { Toast.show('保存失败'); }
      close();
    };
    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // +菜单：模型切换（会话级，仅群像内生效，不写 DB / 不同步设置页）
  async function openApiPanel() {
    if (!_activeStory) return;
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');
    await _renderApiPanel(root);
    requestAnimationFrame(() => root.classList.add('active'));
  }

  async function _renderApiPanel(root) {
    let apis = [];
    try { apis = await DB.api.getAll(); } catch (e) { apis = [] }
    let activeId = null;
    try { const act = await DB.api.getActive(); activeId = act ? act.id : null; } catch (e) {}

    // 当前生效：会话覆盖优先，否则设置页激活
    const effId    = _sessionApiId != null ? Number(_sessionApiId) : activeId;
    const effModel = _sessionApiId != null ? _sessionModel : (apis.find(a => a.id === activeId)?.model || '');

    let list = '';
    if (!apis.length) {
      list = `<div class="gs-css-tip" style="padding:8px 0;">尚无 API，请先到设置页添加并激活。</div>`;
    } else {
      for (const api of apis) {
        const isEff   = String(api.id) === String(effId);
        const expanded = String(_gsExpandedApi) === String(api.id);
        const curModel = isEff ? (effModel || api.model || '') : (api.model || '');
        const models  = _gsFetchedModels[api.id] || (api.savedModels && api.savedModels.length ? api.savedModels : null);
        let modelsHtml = '';
        if (expanded) {
          if (!models) {
            modelsHtml = `<div class="gs-api-models"><div class="gs-api-model-loading">拉取模型中…</div></div>`;
          } else {
            modelsHtml = `<div class="gs-api-models">` + models.map(m =>
              `<div class="gs-api-model${String(m) === String(curModel) ? ' on' : ''}" onclick="event.stopPropagation();GroupStoryModule.gsSelectModel(${api.id},'${_esc(String(m)).replace(/'/g, "\\'")}')">${_esc(String(m))}</div>`
            ).join('') + `</div>`;
          }
        }
        list += `
          <div class="gs-api-item${isEff ? ' on' : ''}">
            <div class="gs-api-row" onclick="GroupStoryModule.gsSelectApi(${api.id})">
              <div class="gs-api-info">
                <div class="gs-api-name">${_esc(api.name || 'API')}${isEff ? ' <span class="gs-api-badge">当前</span>' : ''}</div>
                <div class="gs-api-model-cur">${_esc(curModel || '默认模型')}</div>
              </div>
              <div class="gs-api-model-toggle" onclick="event.stopPropagation();GroupStoryModule.gsToggleModels(${api.id})">MODEL ▾</div>
            </div>
            ${modelsHtml}
          </div>`;
      }
    }

    const overriding = _sessionApiId != null;
    root.innerHTML = `
      <div class="gs-dlg-box gs-api-box">
        <div class="gs-dlg-head"><div class="gs-dlg-title">模型切换</div><div class="gs-dlg-sub">API · SESSION ONLY</div></div>
        <div class="gs-dlg-body">
          <div class="gs-css-tip">仅在群像内临时生效，<b>不会改动设置页</b>。可让聊天与总结用不同模型。</div>
          <div class="gs-api-list">${list}</div>
          ${overriding ? `<div class="gs-css-btns"><button class="gs-css-mini" onclick="GroupStoryModule.gsClearApi()">恢复设置页默认</button></div>` : ''}
        </div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn primary" data-act="close">完成</button>
        </div>
      </div>`;
    root.querySelector('[data-act="close"]').onclick = () => root.classList.remove('active');
    root.onclick = (e) => { if (e.target === root) root.classList.remove('active'); };
  }

  // 选 API（会话级）
  async function gsSelectApi(id) {
    _sessionApiId = id;
    _sessionModel = null;   // 切 API 时模型回到该 API 默认，让用户再选
    const root = _ensureDialogRoot();
    await _renderApiPanel(root);
    try { const a = await DB.api.get(Number(id)); Toast.show(`已切到 ${a?.name || 'API'}`); } catch (e) {}
  }

  // 选模型（会话级）
  async function gsSelectModel(apiId, model) {
    _sessionApiId = apiId;
    _sessionModel = model;
    const root = _ensureDialogRoot();
    await _renderApiPanel(root);
    Toast.show(`模型：${model}`);
  }

  // 展开/收起某 API 的模型列表，首次展开自动拉取
  async function gsToggleModels(apiId) {
    if (String(_gsExpandedApi) === String(apiId)) {
      _gsExpandedApi = null;
      const root = _ensureDialogRoot();
      await _renderApiPanel(root);
      return;
    }
    _gsExpandedApi = apiId;
    const root = _ensureDialogRoot();
    await _renderApiPanel(root);   // 先展示 loading
    if (!_gsFetchedModels[apiId]) {
      try {
        const api = await DB.api.get(Number(apiId));
        if (api) {
          if (api.savedModels && api.savedModels.length) {
            _gsFetchedModels[apiId] = api.savedModels;
          } else {
            const models = await ApiHelper.fetchModels(api.url, api.key);
            _gsFetchedModels[apiId] = models;
            try { await DB.api.put({ ...api, savedModels: models }); } catch (e) {}
          }
        }
      } catch (e) {
        _gsFetchedModels[apiId] = ['(拉取失败，可手动在设置页保存模型)'];
      }
      if (String(_gsExpandedApi) === String(apiId)) await _renderApiPanel(root);
    }
  }

  // 清除会话覆盖，回到设置页默认
  async function gsClearApi() {
    _sessionApiId = null;
    _sessionModel = null;
    _gsExpandedApi = null;
    const root = _ensureDialogRoot();
    await _renderApiPanel(root);
    Toast.show('已恢复设置页默认 API');
  }

  const _CSS_TEMPLATE = `/* ========== 群像剧情 · 自定义样式模板 ==========
   所有规则必须以 #${SCREEN_ID} 开头。改完点「应用」实时预览。 */

/* ---------- 顶部栏 ---------- */
/* 顶栏容器（磨砂条） */
#${SCREEN_ID} .gs-chat-top { background: rgba(255,255,255,.78); border-radius: 18px; }
/* 返回 / 设置 按钮 */
#${SCREEN_ID} .gs-chat-top-btn { }
#${SCREEN_ID} .gs-chat-top-btn svg { stroke: #1a1a1a; }
/* 群组名字 */
#${SCREEN_ID} .gs-chat-top-title { color: #1a1a1a; letter-spacing: 2px; }
/* 群组副标题（X CAST） */
#${SCREEN_ID} .gs-chat-top-sub { color: rgba(0,0,0,.18); }
/* 顶栏角色头像 */
#${SCREEN_ID} .gs-chat-top-avatars .gs-tav { border: 1.5px solid rgba(255,255,255,.9); }

/* ---------- AI（角色）卡片 ---------- */
/* 卡片整体 */
#${SCREEN_ID} .gs-card-ai { background: #f6f5f3; }
/* 卡片头部 NARRATION / Multi */
#${SCREEN_ID} .gs-ch-label { color: var(--gs-rc); }
#${SCREEN_ID} .gs-ch-tag { color: rgba(0,0,0,.1); }
/* 角色名 */
#${SCREEN_ID} .gs-snm { color: #1a1a1a; }
/* 角色头像 */
#${SCREEN_ID} .gs-av { }
/* 角色对白 / 动作 / 内心（也可在「卡片配色」里调） */
#${SCREEN_ID} .gs-fmt-dial { color: var(--gs-dial); }
#${SCREEN_ID} .gs-fmt-act  { color: var(--gs-act); }
#${SCREEN_ID} .gs-fmt-inn  { color: var(--gs-inn); }
/* 旁白 */
#${SCREEN_ID} .gs-act { color: var(--gs-act); }

/* ---------- 用户卡片 ---------- */
#${SCREEN_ID} .gs-card-usr { background: rgba(0,0,0,.02); border: .5px dashed rgba(0,0,0,.08); }
/* 用户名 */
#${SCREEN_ID} .gs-card-usr .gs-nm { color: #1a1a1a; }
/* 用户对白 / 动作 / 内心 */
#${SCREEN_ID} .gs-card-usr .gs-fmt-dial { color: var(--gs-u-dial); }
#${SCREEN_ID} .gs-card-usr .gs-fmt-act  { color: var(--gs-u-act); }
#${SCREEN_ID} .gs-card-usr .gs-fmt-inn  { color: var(--gs-u-inn); }

/* ---------- 卡片收据区 ---------- */
/* 键名 / 值 */
#${SCREEN_ID} .gs-cr-key { color: var(--gs-rc); }
#${SCREEN_ID} .gs-cr-val { color: var(--gs-rc); }
/* 编辑 / 删除 / 重roll 按钮 */
#${SCREEN_ID} .gs-cf-btn svg { stroke: rgba(0,0,0,.3); }
/* 楼层号 1/1 */
#${SCREEN_ID} .gs-cf-page-num { color: var(--gs-rc); }

/* ---------- 底部栏 ---------- */
/* 工具按钮（开始/召唤/总结/事件） */
#${SCREEN_ID} .gs-chat-tool svg { stroke: rgba(0,0,0,.25); }
/* token 计数 */
#${SCREEN_ID} .gs-chat-tk-num { color: rgba(0,0,0,.2); }
/* + 号按钮 */
#${SCREEN_ID} .gs-chat-add { background: rgba(0,0,0,.03); }
/* 输入框 */
#${SCREEN_ID} .gs-chat-input { color: #1a1a1a; }
/* 发送按钮 */
#${SCREEN_ID} .gs-chat-send { background: #1a1a1a; }
#${SCREEN_ID} .gs-chat-send svg { stroke: #fff; }`;

  function _cssKey() { return `gstory-css-${_activeStory.id}`; }

  // 注入到独立 style 元素（即注入即预览，切换群像时清空避免污染）
  function _injectCustomCSS(cssStr) {
    let el = document.getElementById('gs-dynamic-css');
    if (!el) { el = document.createElement('style'); el.id = 'gs-dynamic-css'; document.head.appendChild(el); }
    el.textContent = cssStr || '';
  }
  async function _loadCustomCSS() {
    try { const css = await DB.settings.get(_cssKey()); _injectCustomCSS(css || ''); } catch (e) { _injectCustomCSS(''); }
  }

  // 打开自定义 CSS 编辑器（+号入口）
  async function openCssPanel() {
    if (!_activeStory) return;
    let css = '';
    try { css = await DB.settings.get(_cssKey()) || ''; } catch (e) {}
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');
    root.innerHTML = `
      <div class="gs-dlg-box gs-css-box">
        <div class="gs-dlg-head"><div class="gs-dlg-title">自定义 CSS</div><div class="gs-dlg-sub">CUSTOM STYLE · LIVE</div></div>
        <div class="gs-dlg-body">
          <!-- 实时预览区（只预览 AI / 用户卡片，跟随注入的 CSS） -->
          <div class="gs-css-pv">
            <div class="gs-css-pv-label">LIVE PREVIEW · 实时预览</div>
            <div class="gs-css-pv-stage">
              <!-- AI 卡片（精简） -->
              <div class="gs-card gs-card-ai" style="margin:0 0 12px;">
                <div class="gs-card-header"><div class="gs-ch-icon"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div><span class="gs-ch-label">Narration</span><div class="gs-ch-line"></div><span class="gs-ch-tag">Multi</span></div>
                <div class="gs-ms"><div class="gs-av-wrap"><div class="gs-av" style="background:#8a8a8a;">C</div></div><div class="gs-bd"><div class="gs-snm">角色</div><div class="gs-stx"><div class="gs-fmt-act">*风掀起窗帘。*</div><div class="gs-fmt-dial">"你来了。"</div><div class="gs-fmt-inn">（他其实等了很久。）</div></div></div></div>
                <div class="gs-card-bottom"><div class="gs-card-receipt"><div class="gs-cr-row"><span class="gs-cr-key">Tokens</span><span class="gs-cr-val">42</span></div></div><div class="gs-card-footer"><div class="gs-cf-pages"><span class="gs-cf-page-num">1/1</span></div><div class="gs-cf-sep"></div><div class="gs-cf-actions"><div class="gs-cf-btn"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></div></div></div></div>
              </div>
              <!-- 用户卡片（精简） -->
              <div class="gs-card gs-card-usr" style="margin:0;">
                <div class="gs-who"><div class="gs-av-wrap"><div class="gs-av" style="background:#5a5a5a;">我</div></div><div class="gs-nm">我</div></div>
                <div class="gs-msg-body"><div class="gs-fmt-act">*我点点头。*</div><div class="gs-fmt-dial">"嗯，等很久了吧。"</div></div>
              </div>
            </div>
          </div>
          <div class="gs-css-tip">所有选择器需以 <b>#${SCREEN_ID}</b> 开头。点「默认模板」填入全部可改元素，改完点「应用」即时生效。</div>
          <textarea class="gs-dlg-input gs-css-input" id="gs-css-input" rows="9" spellcheck="false" placeholder="/* 在此粘贴或编写 CSS */">${_esc(css)}</textarea>
          <div class="gs-css-btns">
            <button class="gs-css-mini" id="gs-css-tpl">默认模板</button>
            <button class="gs-css-mini" id="gs-css-clear">清空</button>
          </div>
        </div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="close">关闭</button>
          <button class="gs-dlg-btn primary" data-act="apply">应用</button>
        </div>
      </div>`;
    const close = () => root.classList.remove('active');
    const ta = root.querySelector('#gs-css-input');
    // 实时预览：输入即注入（不写库，仅预览），应用时才落库
    const livePreview = () => _injectCustomCSS(ta.value);
    ta.addEventListener('input', livePreview);
    root.querySelector('#gs-css-tpl').onclick = () => { ta.value = _CSS_TEMPLATE; livePreview(); };
    root.querySelector('#gs-css-clear').onclick = async () => {
      ta.value = ''; _injectCustomCSS('');
      try { await DB.settings.del(_cssKey()); Toast.show('已清空，恢复默认'); } catch (e) {}
    };
    root.querySelector('[data-act="close"]').onclick = async () => {
      // 关闭时恢复到已保存的版本（放弃未应用的预览改动）
      try { const saved = await DB.settings.get(_cssKey()) || ''; _injectCustomCSS(saved); } catch (e) {}
      close();
    };
    root.querySelector('[data-act="apply"]').onclick = async () => {
      const v = ta.value.trim();
      _injectCustomCSS(v);
      try { await DB.settings.set(_cssKey(), v); Toast.show('已应用专属样式 ✦'); } catch (e) {}
    };
    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // ───────────────────────── 工具函数 ─────────────────────────
  // 通用确认弹窗（替代原生 confirm，延续 gs-modal 收据美学）
  function _confirmDialog({ title, sub, body, danger, okText, cancelText, onOk }) {
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');
    root.innerHTML = `
      <div class="gs-dlg-box">
        <div class="gs-dlg-head">
          <div class="gs-dlg-title">${_esc(title || '确认')}</div>
          <div class="gs-dlg-sub">${_esc(sub || 'CONFIRM')}</div>
        </div>
        <div class="gs-dlg-body"><div class="gs-dlg-text">${_esc(body || '')}</div></div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="cancel">${_esc(cancelText || '取消')}</button>
          <button class="gs-dlg-btn ${danger ? 'danger' : 'primary'}" data-act="ok">${_esc(okText || '确定')}</button>
        </div>
      </div>`;
    const close = () => root.classList.remove('active');
    root.querySelector('[data-act="cancel"]').onclick = close;
    root.querySelector('[data-act="ok"]').onclick = () => { close(); onOk && onOk(); };
    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => root.classList.add('active'));
  }

  // 通用编辑弹窗（替代原生 prompt，带 textarea）
  function _editDialog({ title, sub, value, hint, onOk }) {
    const root = _ensureDialogRoot();
    root.classList.remove('gs-sheet-mode');
    root.innerHTML = `
      <div class="gs-dlg-box">
        <div class="gs-dlg-head">
          <div class="gs-dlg-title">${_esc(title || '编辑')}</div>
          <div class="gs-dlg-sub">${_esc(sub || 'EDIT')}</div>
        </div>
        <div class="gs-dlg-body">
          <textarea class="gs-dlg-input" id="gs-dlg-textarea" rows="6" placeholder="写点什么…">${_esc(value || '')}</textarea>
          ${hint ? `<div class="gs-dlg-hint">${_esc(hint)}</div>` : ''}
        </div>
        <div class="gs-dlg-foot">
          <button class="gs-dlg-btn ghost" data-act="cancel">取消</button>
          <button class="gs-dlg-btn primary" data-act="ok">保存</button>
        </div>
      </div>`;
    const close = () => root.classList.remove('active');
    const ta = root.querySelector('#gs-dlg-textarea');
    root.querySelector('[data-act="cancel"]').onclick = close;
    root.querySelector('[data-act="ok"]').onclick = () => { const v = ta.value; close(); onOk && onOk(v); };
    root.onclick = (e) => { if (e.target === root) close(); };
    requestAnimationFrame(() => { root.classList.add('active'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
  }

  // 单例弹窗根容器（挂在 screen 内，跟随层级）
  function _ensureDialogRoot() {
    let root = document.getElementById('gs-dialog-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'gs-dialog-root';
      root.className = 'gs-dlg';
      const screen = document.getElementById(SCREEN_ID) || document.body;
      screen.appendChild(root);
    }
    return root;
  }

  // 第二层弹窗容器（叠在状态编辑器等一级弹窗之上，用于输入/确认，替代被 file:// 禁用的 prompt/confirm）
  function _ensureDialogRoot2() {
    let root = document.getElementById('gs-dialog-root-2');
    if (!root) {
      root = document.createElement('div');
      root.id = 'gs-dialog-root-2';
      root.className = 'gs-dlg';
      root.style.zIndex = '99999';
      const screen = document.getElementById(SCREEN_ID) || document.body;
      screen.appendChild(root);
    }
    return root;
  }
  // 自定义输入框，返回 Promise<string|null>（取消为 null）
  function _gsPrompt(title, placeholder = '', defVal = '') {
    return new Promise(resolve => {
      const root = _ensureDialogRoot2();
      root.innerHTML = `
        <div class="gs-dlg-box">
          <div class="gs-dlg-head"><div class="gs-dlg-title">${_esc(title)}</div></div>
          <div class="gs-dlg-body"><input type="text" class="gs-dlg-input" id="gs-prompt-input" placeholder="${_esc(placeholder)}" value="${_esc(defVal)}" style="width:100%;"></div>
          <div class="gs-dlg-foot">
            <button class="gs-dlg-btn ghost" data-act="cancel">取消</button>
            <button class="gs-dlg-btn primary" data-act="ok">确定</button>
          </div>
        </div>`;
      const inp = root.querySelector('#gs-prompt-input');
      const done = (val) => { root.classList.remove('active'); resolve(val); };
      root.querySelector('[data-act="cancel"]').onclick = () => done(null);
      root.querySelector('[data-act="ok"]').onclick = () => done((inp.value || '').trim());
      root.onclick = (e) => { if (e.target === root) done(null); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done((inp.value || '').trim()); });
      requestAnimationFrame(() => { root.classList.add('active'); inp.focus(); });
    });
  }
  // 自定义确认框，返回 Promise<boolean>
  function _gsConfirm(title, msg = '') {
    return new Promise(resolve => {
      const root = _ensureDialogRoot2();
      root.innerHTML = `
        <div class="gs-dlg-box">
          <div class="gs-dlg-head"><div class="gs-dlg-title">${_esc(title)}</div></div>
          ${msg ? `<div class="gs-dlg-body"><div class="gs-dlg-text">${msg}</div></div>` : ''}
          <div class="gs-dlg-foot">
            <button class="gs-dlg-btn ghost" data-act="cancel">取消</button>
            <button class="gs-dlg-btn primary" data-act="ok">确定</button>
          </div>
        </div>`;
      const done = (val) => { root.classList.remove('active'); resolve(val); };
      root.querySelector('[data-act="cancel"]').onclick = () => done(false);
      root.querySelector('[data-act="ok"]').onclick = () => done(true);
      root.onclick = (e) => { if (e.target === root) done(false); };
      requestAnimationFrame(() => root.classList.add('active'));
    });
  }

  function _fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts); const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function _fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts); const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
  }
  // 周几（英文缩写给收据用 / 中文给 AI 用）
  const _WD_EN = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const _WD_CN = ['日','一','二','三','四','五','六'];
  function _weekdayEN(d) { return _WD_EN[d.getDay()]; }
  function _weekdayCN(d) { return '周' + _WD_CN[d.getDay()]; }
  // 收据用精确时间戳：2026.05.30 SAT 20:35
  function _fmtFull(ts) {
    if (!ts) return '';
    const d = new Date(ts); const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${_weekdayEN(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // 给 AI 的中文完整时间：2026年5月30日 周六 20:35
  function _fmtForAI(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${_weekdayCN(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ───────────────────────── 公开接口 ─────────────────────────
  return {
    init, open, close,
    enterPersona,
    switchTab: _switchTab,
    toggleCast,
    openCreateModal, closeCreateModal, handleCreateAvatar, confirmCreate,
    openEditGroup, closeEditModal, handleEditAvatar, confirmEdit, deleteGroup,
    openStory, sendUserLine, editMsg, delMsg, loadMore,
    rerollMsg, swipeVer, openAddMenu, openTimePanel, openWorldBook, openWrapPanel,
    openColorPanel, changeRcColor, openCssPanel, openStatusEditor, openStatusPanel,
    openMusicPanel, toggleMusic,
    openApiPanel, gsSelectApi, gsSelectModel, gsToggleModels, gsClearApi,
    openSettings, closeSettings, saveSettings, wrapUp, clearHistory,
    backToWall: () => { _showLayer('persona'); _renderPersonaWall(); },
    backToWorkspace: () => { _showLayer('workspace'); _switchTab('groups'); },
  };

  // ════════════════════════════════════════════════════════════
  //  DOM / CSS 注入（放在 return 之后由 init 调用，函数提升可用）
  // ════════════════════════════════════════════════════════════
  function _injectStyles() {
    if (document.getElementById('gs-style')) return;
    const css = `

/* ====== GroupStory 命名空间样式（延续高定档案/收据美学） ====== */
#${SCREEN_ID}{z-index:150; font-family:"Inter","DM Sans",sans-serif;color:#1a1a1a;--gs-rc:rgba(0,0,0,.3);--gs-bar:rgba(0,0,0,.12);--gs-arr:rgba(0,0,0,.3);--gs-text:#1a1a1a;--gs-dial:#111111;--gs-act:#888888;--gs-inn:#5D6B78;--gs-u-text:#1a1a1a;--gs-u-dial:#111111;--gs-u-act:#888888;--gs-u-inn:#5D6B78;}
/* 全局 SVG 兜底：没有显式尺寸的 svg 会按 viewBox 撑满父容器，这里统一封顶。
   下方各组件类仍会用更精确的 width/height 覆盖此值。 */
#${SCREEN_ID} svg{width:18px;height:18px;flex-shrink:0;}
#${SCREEN_ID} .gs-layer{position:absolute;inset:0;display:none;flex-direction:column;background:linear-gradient(180deg,#edecea 0%,#f3f2f0 30%,#f6f5f3 100%);overflow:hidden;}
#${SCREEN_ID} .gs-layer.gs-layer-active{display:flex;}


/* 通用顶栏（复用 ct-top 视觉） */
.gs-top{position:relative;z-index:2;padding:calc(env(safe-area-inset-top,44px) + 8px) 20px 14px;background:rgba(243,242,240,0.92);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);display:flex;align-items:center;gap:14px;flex-shrink:0;}
.gs-top-back{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .2s;}
.gs-top-back:active{transform:scale(.9);background:rgba(0,0,0,.04);}
.gs-top-back svg{width:18px;height:18px;stroke:#1a1a1a;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;}
.gs-top-info{flex:1;min-width:0;}
.gs-top h1{font-size:16px;font-weight:700;letter-spacing:3px;}
.gs-top-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.18);letter-spacing:1.5px;margin-top:2px;}
.gs-top-deco{position:absolute;bottom:0;left:20px;right:20px;height:.5px;background:linear-gradient(90deg,transparent,rgba(0,0,0,.06) 20%,rgba(0,0,0,.06) 80%,transparent);}

.gs-scroll{flex:1;overflow-y:auto;padding:20px 16px 40px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
.gs-scroll::-webkit-scrollbar{display:none;}
.gs-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}

.gs-empty-wall{grid-column:1/-1;text-align:center;padding:60px 20px;font-family:"Noto Serif SC",serif;font-size:15px;color:rgba(0,0,0,.3);line-height:2;}
.gs-empty-wall span{font-family:"Space Mono",monospace;font-size:9px;letter-spacing:1px;color:rgba(0,0,0,.15);}

/* ── 面具卡片 ── */
.gs-mask-card{position:relative;background:rgba(255,255,255,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(0,0,0,.15);border-radius:14px;overflow:hidden;cursor:pointer;transition:transform .3s cubic-bezier(.16,1,.3,1);-webkit-tap-highlight-color:transparent;box-shadow:0 0 0 4px rgba(0,0,0,.06);outline:1px solid rgba(0,0,0,.35);}
.gs-mask-card:active{transform:scale(.97);}
.gs-mask-hero{position:relative;width:100%;aspect-ratio:1/0.95;background:linear-gradient(155deg,#e8e6e3,#d5d2ce 40%,#c4c0bb);display:flex;align-items:center;justify-content:center;overflow:hidden;}
.gs-mask-hero img{width:100%;height:100%;object-fit:cover;}
.gs-mask-hero::after{content:"";position:absolute;bottom:0;left:0;right:0;height:50%;background:linear-gradient(180deg,transparent,rgba(255,255,255,.7));pointer-events:none;z-index:2;}
.gs-mask-hero-letter{font-family:"Cormorant Garamond",serif;font-size:80px;font-weight:300;color:rgba(255,255,255,.55);line-height:1;position:relative;z-index:1;}
.gs-mask-num{position:absolute;bottom:10px;right:10px;padding:3px 6px;border-radius:4px;background:rgba(26,26,26,.6);backdrop-filter:blur(8px);font-family:"Space Mono",monospace;font-size:8px;font-weight:700;color:#fff;z-index:4;}
.gs-mask-info{padding:10px 12px 12px;position:relative;}
.gs-mask-av-wrap{position:absolute;top:-22px;left:12px;width:44px;height:40px;z-index:5;}
.gs-mask-av{width:32px;height:32px;background:#1a1a1a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;position:absolute;top:2px;left:2px;z-index:3;overflow:hidden;}
.gs-mask-av img{width:100%;height:100%;object-fit:cover;}
.gs-mask-av::after{content:"";position:absolute;top:2px;left:2px;right:-3px;bottom:-3px;border:1px dashed rgba(0,0,0,.12);}
.gs-mask-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.18);letter-spacing:1.5px;margin-left:40px;}
.gs-mask-name{font-family:"Noto Serif SC",serif;font-size:18px;font-weight:700;letter-spacing:2px;margin-top:2px;}
.gs-mask-bot{margin-top:6px;}
.gs-mask-tag{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.22);letter-spacing:.5px;display:flex;align-items:center;gap:4px;}
.gs-mask-tag::before{content:"";width:3px;height:3px;border-radius:50%;background:rgba(0,0,0,.12);}

/* ── 工作区 Tab ── */
.gs-tabs{display:flex;gap:8px;padding:14px 16px 6px;flex-shrink:0;}
.gs-tab{flex:1;text-align:center;padding:10px 0;border-radius:10px;border:0.5px solid rgba(0,0,0,.08);background:rgba(255,255,255,.5);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .25s;}
.gs-tab.on{background:#1a1a1a;border-color:#1a1a1a;}
.gs-tab-title{font-size:11px;font-weight:700;letter-spacing:1px;color:rgba(0,0,0,.4);}
.gs-tab.on .gs-tab-title{color:#fff;}
.gs-tab-sub{font-family:"Space Mono",monospace;font-size:6px;letter-spacing:1px;color:rgba(0,0,0,.15);margin-top:2px;}
.gs-tab.on .gs-tab-sub{color:rgba(255,255,255,.4);}

/* ── 我的群像 列表 ── */
#gs-groups-list{padding:6px 16px 110px;overflow-y:auto;flex:1;scrollbar-width:none;}
#gs-groups-list::-webkit-scrollbar{display:none;}
.gs-grp-card{display:flex;align-items:stretch;background:rgba(255,255,255,.78);backdrop-filter:blur(16px);border:1px solid rgba(0,0,0,.1);border-radius:14px;overflow:hidden;margin-bottom:12px;box-shadow:0 2px 12px rgba(0,0,0,.03);}
.gs-grp-main{flex:1;display:flex;gap:12px;padding:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;min-width:0;}
.gs-grp-main:active{background:rgba(0,0,0,.02);}
.gs-grp-cover{width:56px;height:56px;border-radius:10px;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;}
.gs-grp-cover img{width:100%;height:100%;object-fit:cover;}
.gs-grp-minis,.gs-create-minis{position:relative;width:44px;height:30px;}
.gs-grp-mini{position:absolute;top:0;width:24px;height:24px;border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;}
.gs-grp-mini:nth-child(1){left:0;}.gs-grp-mini:nth-child(2){left:12px;}.gs-grp-mini:nth-child(3){left:24px;}
.gs-grp-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;}
.gs-grp-name{font-family:"Noto Serif SC",serif;font-size:15px;font-weight:700;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-grp-sub{font-size:10px;color:rgba(0,0,0,.35);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-grp-meta{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.15);letter-spacing:1px;margin-top:4px;}
.gs-grp-actions{display:flex;flex-direction:column;border-left:0.5px solid rgba(0,0,0,.06);}
.gs-grp-act{flex:1;width:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .2s;}
.gs-grp-act:active{background:rgba(0,0,0,.04);}
.gs-grp-act svg{width:14px;height:14px;stroke:rgba(0,0,0,.3);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}
.gs-grp-act.danger svg{stroke:rgba(180,40,30,.4);}
.gs-grp-act+.gs-grp-act{border-top:0.5px solid rgba(0,0,0,.06);}

/* ── 选角网格（复用 ct-card 视觉，命名空间化） ── */
#gs-cast-grid{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:max-content;align-content:start;gap:14px;padding:6px 16px 110px;overflow-y:auto;flex:1;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
#gs-cast-grid::-webkit-scrollbar{display:none;}
.gs-ct-card{position:relative;background:rgba(255,255,255,.82);border:1px solid rgba(0,0,0,.15);border-radius:14px;overflow:hidden;cursor:pointer;transition:transform .3s cubic-bezier(.16,1,.3,1);-webkit-tap-highlight-color:transparent;box-shadow:0 0 0 4px rgba(0,0,0,.06);outline:1px solid rgba(0,0,0,.35);}
.gs-ct-card:active{transform:scale(.97);}
.gs-ct-card.selected{box-shadow:0 0 0 4px rgba(0,0,0,.1),0 6px 24px rgba(0,0,0,.06);}
.gs-ct-hero{position:relative;width:100%;aspect-ratio:1/0.95;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.gs-ct-hero img{width:100%;height:100%;object-fit:cover;}
.gs-ct-hero::after{content:"";position:absolute;bottom:0;left:0;right:0;height:50%;background:linear-gradient(180deg,transparent,rgba(255,255,255,.7));z-index:2;}
.gs-ct-hero-letter{font-family:"Cormorant Garamond",serif;font-size:80px;font-weight:300;color:rgba(255,255,255,.55);position:relative;z-index:1;}
.gs-ct-num{position:absolute;bottom:10px;right:10px;padding:3px 6px;border-radius:4px;background:rgba(26,26,26,.6);font-family:"Space Mono",monospace;font-size:8px;font-weight:700;color:#fff;z-index:4;}
.gs-ct-sel{position:absolute;top:10px;left:10px;width:22px;height:22px;border-radius:50%;border:1.5px solid rgba(0,0,0,.04);display:flex;align-items:center;justify-content:center;z-index:4;transition:all .25s cubic-bezier(.34,1.56,.64,1);background:rgba(255,255,255,.15);backdrop-filter:blur(6px);}
.gs-ct-card.selected .gs-ct-sel{border-color:#1a1a1a;background:#1a1a1a;transform:scale(1.05);}
.gs-ct-sel svg{width:11px;height:11px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;opacity:0;transition:opacity .2s;}
.gs-ct-card.selected .gs-ct-sel svg{opacity:1;}
.gs-ct-info{padding:10px 12px 12px;position:relative;}
.gs-ct-av-wrap{position:absolute;top:-22px;left:12px;width:44px;height:40px;z-index:5;}
.gs-ct-av{width:32px;height:32px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;position:absolute;top:2px;left:2px;z-index:3;overflow:hidden;}
.gs-ct-av img{width:100%;height:100%;object-fit:cover;}
.gs-ct-av::after{content:"";position:absolute;top:2px;left:2px;right:-3px;bottom:-3px;border:1px dashed rgba(0,0,0,.12);}
.gs-ct-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.18);letter-spacing:1.5px;margin-left:40px;}
.gs-ct-name{font-family:"Noto Serif SC",serif;font-size:18px;font-weight:700;letter-spacing:2px;margin-top:2px;}

/* ── 选角底栏 ── */
.gs-castbar{position:absolute;bottom:calc(env(safe-area-inset-bottom,10px) + 6px);left:14px;right:14px;z-index:10;background:rgba(255,255,255,.85);backdrop-filter:blur(40px);border-radius:14px;border:1px solid rgba(0,0,0,.08);box-shadow:0 4px 24px rgba(0,0,0,.04);padding:12px 16px;display:flex;align-items:center;gap:12px;transform:translateY(100px);opacity:0;transition:all .35s cubic-bezier(.16,1,.3,1);pointer-events:none;}
.gs-castbar.show{transform:translateY(0);opacity:1;pointer-events:auto;}
.gs-castbar-avatars{display:flex;}
.gs-castbar-av{width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;margin-left:-8px;border:2px solid #fff;overflow:hidden;}
.gs-castbar-av:first-child{margin-left:0;}
.gs-castbar-info{flex:1;min-width:0;}
.gs-castbar-main{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-castbar-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.15);letter-spacing:1px;margin-top:1px;}
.gs-castbar-btn{height:34px;padding:0 18px;border-radius:8px;background:#1a1a1a;border:none;display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0;transition:transform .2s;}
.gs-castbar-btn:active{transform:scale(.95);}
.gs-castbar-btn svg{width:12px;height:12px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;}
.gs-castbar-btn span{font-family:"Space Mono",monospace;font-size:9px;font-weight:700;color:#fff;letter-spacing:1.5px;}

/* ── 建群 / 编辑 弹层 ── */
.gs-modal{position:absolute;inset:0;z-index:50;background:rgba(20,20,20,.4);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:24px;}
.gs-modal.active{display:flex;}
.gs-modal-box{width:100%;max-width:320px;background:#f6f5f3;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);}
.gs-modal-head{padding:18px 20px 14px;border-bottom:0.5px solid rgba(0,0,0,.06);}
.gs-modal-title{font-family:"Noto Serif SC",serif;font-size:16px;font-weight:700;letter-spacing:2px;}
.gs-modal-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.18);letter-spacing:1.5px;margin-top:3px;}
.gs-modal-body{padding:18px 20px;}
.gs-modal-avatar{width:80px;height:80px;border-radius:14px;margin:0 auto 16px;background:#e8e6e3;overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;border:1px dashed rgba(0,0,0,.15);}
#${SCREEN_ID} .gs-modal-avatar-pic{position:absolute;inset:0;display:block;}
#${SCREEN_ID} .gs-modal-avatar-pic img{width:100%;height:100%;object-fit:cover;}
.gs-modal-avatar img{width:100%;height:100%;object-fit:cover;}
.gs-modal-avatar .gs-create-minis{transform:scale(1.2);}
.gs-modal-avatar-hint{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.45);color:#fff;font-family:"Space Mono",monospace;font-size:7px;letter-spacing:1px;text-align:center;padding:3px 0;}
.gs-modal-field-label{font-size:9px;font-weight:700;color:rgba(0,0,0,.3);letter-spacing:.8px;margin-bottom:6px;}
.gs-modal-input{width:100%;background:rgba(0,0,0,.02);border:0.5px solid rgba(0,0,0,.08);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:13px;color:#1a1a1a;outline:none;}
.gs-modal-input:focus{border-color:rgba(0,0,0,.2);background:#fff;}
.gs-modal-foot{display:flex;gap:8px;padding:0 20px 20px;}
.gs-modal-btn{flex:1;height:40px;border-radius:10px;border:none;cursor:pointer;font-family:"Space Mono",monospace;font-size:10px;font-weight:700;letter-spacing:1.5px;-webkit-tap-highlight-color:transparent;}
.gs-modal-btn.ghost{background:transparent;border:0.5px solid rgba(0,0,0,.12);color:rgba(0,0,0,.5);}
.gs-modal-btn.primary{background:#1a1a1a;color:#fff;}
.gs-modal-btn:active{opacity:.8;}

/* ── 聊天页（直接复用主 UI 的 .card/.ms/.act/.tens 等类） ── */
#gs-chat-stream{position:absolute;inset:0;overflow-y:auto;padding:170px 20px 170px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
#gs-chat-stream::-webkit-scrollbar{display:none;}
.gs-chat-empty{text-align:center;padding:80px 20px;font-family:"Noto Serif SC",serif;font-size:16px;color:rgba(0,0,0,.3);line-height:2.2;}
.gs-chat-empty span{font-family:"Space Mono",monospace;font-size:9px;letter-spacing:1px;color:rgba(0,0,0,.15);}

/* ════════ 聊天气泡（独立 gs- 命名空间，照搬收据卡片视觉） ════════ */
#${SCREEN_ID} .gs-msg-wrap{position:relative;margin-bottom:20px;}
#${SCREEN_ID} .gs-msg-bar-top{display:flex;align-items:center;justify-content:space-between;padding:0 4px;margin-bottom:4px;height:10px;}
#${SCREEN_ID} .gs-bar-time{font-size:8px;font-weight:500;color:rgba(0,0,0,.15);letter-spacing:.5px;}
#${SCREEN_ID} .gs-bar-right{display:flex;align-items:center;gap:5px;}
#${SCREEN_ID} .gs-bar-code{font-size:7px;font-weight:600;color:rgba(0,0,0,.1);letter-spacing:1.5px;}
#${SCREEN_ID} .gs-bar-line{width:20px;height:.5px;background:rgba(0,0,0,.08);}
#${SCREEN_ID} .gs-msg-bar-bot{display:flex;align-items:center;justify-content:space-between;padding:0 4px;margin-top:4px;height:10px;}
#${SCREEN_ID} .gs-bar-left{display:flex;align-items:center;gap:5px;}
#${SCREEN_ID} .gs-msg-bar-bot .gs-bar-line{width:14px;background:rgba(0,0,0,.06);}
#${SCREEN_ID} .gs-bar-dot{width:3px;height:3px;border-radius:50%;background:rgba(0,0,0,.06);}
#${SCREEN_ID} .gs-bar-idx{font-size:7px;font-weight:500;color:rgba(0,0,0,.08);letter-spacing:1px;}
#${SCREEN_ID} .gs-card{position:relative;background:rgba(255,255,255,.72);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:10px;padding:30px 18px 18px;box-shadow:0 4px 20px rgba(0,0,0,.025);border:.5px solid rgba(0,0,0,.04);overflow:hidden;}
#${SCREEN_ID} .gs-card-usr{background:rgba(0,0,0,.02);border:.5px dashed rgba(0,0,0,.08);}
#${SCREEN_ID} .gs-card-ai{border:1px solid rgba(0,0,0,.12);}
#${SCREEN_ID} .gs-who{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
#${SCREEN_ID} .gs-av-wrap{position:relative;width:54px;height:50px;flex-shrink:0;margin-left:-10px;}
#${SCREEN_ID} .gs-av{width:36px;height:36px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;position:absolute;top:3px;left:3px;z-index:3;overflow:hidden;}
#${SCREEN_ID} .gs-av img{width:100%;height:100%;object-fit:cover;}
#${SCREEN_ID} .gs-av::after{content:"";position:absolute;top:3px;left:3px;right:-4px;bottom:-4px;border:1px dashed rgba(0,0,0,.12);z-index:-1;pointer-events:none;}
#${SCREEN_ID} .gs-av-wrap::after{content:"";position:absolute;inset:0;border:1px dashed rgba(0,0,0,.06);pointer-events:none;z-index:1;}
#${SCREEN_ID} .gs-nm{font-size:11px;font-weight:700;color:#1a1a1a;letter-spacing:.5px;}
#${SCREEN_ID} .gs-card-header{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:12px;border-bottom:.5px solid rgba(0,0,0,.04);}
#${SCREEN_ID} .gs-ch-icon{width:20px;height:20px;border-radius:4px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
#${SCREEN_ID} .gs-ch-icon svg{width:10px;height:10px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;}
#${SCREEN_ID} .gs-ch-label{font-size:9px;font-weight:700;color:var(--gs-rc);letter-spacing:1.5px;text-transform:uppercase;}
#${SCREEN_ID} .gs-ch-line{flex:1;height:.5px;background:linear-gradient(to right,rgba(0,0,0,.06),transparent);}
#${SCREEN_ID} .gs-ch-tag{font-size:7px;font-weight:600;color:rgba(0,0,0,.1);letter-spacing:1px;padding:2px 6px;border:.5px solid rgba(0,0,0,.06);border-radius:3px;}
#${SCREEN_ID} .gs-act{color:rgba(0,0,0,.4);font-style:normal;font-size:12.5px;line-height:1.95;margin-bottom:12px;padding-left:56px;}
#${SCREEN_ID} .gs-tens{color:rgba(0,0,0,.22);font-style:italic;font-size:11px;text-align:center;padding:10px 16px;line-height:1.85;margin:14px 0;border-top:.5px solid rgba(0,0,0,.04);border-bottom:.5px solid rgba(0,0,0,.04);}
#${SCREEN_ID} .gs-msg-body{font-size:12.5px;color:rgba(0,0,0,.4);line-height:1.95;font-style:normal;padding-left:58px;}
#${SCREEN_ID} .gs-ms{display:flex;gap:12px;margin:18px 0;align-items:flex-start;}
#${SCREEN_ID} .gs-ms .gs-bd{flex:1;min-width:0;}
#${SCREEN_ID} .gs-snm{font-size:10px;font-weight:700;color:#1a1a1a;margin-bottom:4px;letter-spacing:.5px;display:flex;align-items:center;gap:6px;}
#${SCREEN_ID} .gs-snm::after{content:"";flex:1;height:.5px;background:linear-gradient(to right,rgba(0,0,0,.08),transparent 60%);}
#${SCREEN_ID} .gs-stx{font-size:13px;color:var(--gs-text);line-height:1.85;}
/* 对白：独占一行，黑色加重 */
#${SCREEN_ID} .gs-fmt-dial { 
  display: block; 
  font-weight: 500; 
  color: var(--gs-dial); 
  font-style: normal; 
  margin: 10px 0; 
  line-height: 1.8; 
}
/* 动作描写：独占一行，灰色，绝对不倾斜 */
#${SCREEN_ID} .gs-fmt-act { 
  display: block; 
  font-style: normal; 
  color: var(--gs-act); 
  font-weight: 300; 
  margin: 10px 0; 
  line-height: 1.8; 
}
/* 心理描写：独占一行，蓝灰，绝对不倾斜 */
#${SCREEN_ID} .gs-fmt-inn { 
  display: block;
  font-style: normal; 
  color: var(--gs-inn); 
  font-weight: 300;
  margin: 10px 0; 
  line-height: 1.8; 
}
#${SCREEN_ID} .gs-act { color: var(--gs-act); font-style: italic; font-size: 12.5px; line-height: 1.95; margin-bottom: 12px; font-weight: 300; }
/* 用户卡片：正文走独立的用户配色变量 */
#${SCREEN_ID} .gs-card-usr .gs-msg-body{color:var(--gs-u-text);}
#${SCREEN_ID} .gs-card-usr .gs-fmt-dial{color:var(--gs-u-dial);}
#${SCREEN_ID} .gs-card-usr .gs-fmt-act{color:var(--gs-u-act);}
#${SCREEN_ID} .gs-card-usr .gs-fmt-inn{color:var(--gs-u-inn);}
/* 卡片底部：收据 + footer */
#${SCREEN_ID} .gs-card-bottom{margin-top:14px;border-top:.5px solid rgba(0,0,0,.04);}
#${SCREEN_ID} .gs-card-receipt{padding:10px 6px 8px;font-family:"Space Mono",monospace;position:relative;}
#${SCREEN_ID} .gs-card-receipt::before{content:"";position:absolute;top:10px;left:0;right:0;height:2px;background:repeating-linear-gradient(90deg,rgba(0,0,0,.06) 0px,rgba(0,0,0,.06) 3px,transparent 3px,transparent 6px);}
#${SCREEN_ID} .gs-cr-row{display:flex;justify-content:space-between;align-items:center;padding:1px 0;}
#${SCREEN_ID} .gs-cr-key{font-size:7px;color:var(--gs-rc);opacity:.6;letter-spacing:1px;text-transform:uppercase;}
#${SCREEN_ID} .gs-cr-val{font-size:7px;color:var(--gs-rc);letter-spacing:.5px;}
#${SCREEN_ID} .gs-cr-barcode{display:flex;align-items:flex-end;justify-content:flex-end;gap:1px;height:10px;margin-top:4px;}
#${SCREEN_ID} .gs-cr-barcode i{display:block;width:1px;background:var(--gs-bar);}
#${SCREEN_ID} .gs-card-footer{display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px dashed rgba(0,0,0,.04);margin-top:6px;}
#${SCREEN_ID} .gs-cf-pages{display:flex;align-items:center;gap:3px;}
#${SCREEN_ID} .gs-cf-arrow{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent;background:rgba(0,0,0,.03);}
#${SCREEN_ID} .gs-cf-arrow:active{transform:scale(.85);background:rgba(0,0,0,.08);}
#${SCREEN_ID} .gs-cf-arrow svg{width:10px;height:10px;stroke:var(--gs-arr);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
#${SCREEN_ID} .gs-cf-arrow.off{opacity:.25;pointer-events:none;}
#${SCREEN_ID} .gs-cf-reroll svg{stroke:rgba(0,0,0,.3);}
#${SCREEN_ID} .gs-cf-reroll:active{background:rgba(0,0,0,.06);}
#${SCREEN_ID} .gs-cf-page-num{font-size:9px;font-weight:700;color:var(--gs-rc);letter-spacing:.5px;min-width:28px;text-align:center;}
#${SCREEN_ID} .gs-cf-sep{flex:1;height:.5px;background:linear-gradient(90deg,transparent,rgba(0,0,0,.04),transparent);margin:0 8px;}
#${SCREEN_ID} .gs-cf-actions{display:flex;align-items:center;gap:2px;}
#${SCREEN_ID} .gs-cf-btn{width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-cf-btn:active{transform:scale(.85);background:rgba(0,0,0,.04);}
#${SCREEN_ID} .gs-cf-btn svg{width:13px;height:13px;stroke:rgba(0,0,0,.2);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
/* 续写中指示器 */
#${SCREEN_ID} .gs-typing{display:flex;align-items:center;gap:5px;padding:14px 18px;margin-top:4px;}
#${SCREEN_ID} .gs-typing-dot{width:6px;height:6px;border-radius:50%;background:rgba(0,0,0,.25);animation:gsTyping 1.2s infinite ease-in-out;}
#${SCREEN_ID} .gs-typing-dot:nth-child(2){animation-delay:.2s;}
#${SCREEN_ID} .gs-typing-dot:nth-child(3){animation-delay:.4s;}
#${SCREEN_ID} .gs-typing-label{font-family:"Space Mono",monospace;font-size:8px;color:rgba(0,0,0,.2);letter-spacing:1.5px;margin-left:6px;text-transform:uppercase;}
@keyframes gsTyping{0%,60%,100%{opacity:.2;transform:translateY(0);}30%{opacity:1;transform:translateY(-3px);}}

/* ════════ 自定义弹窗（confirm / edit，延续 gs-modal 收据美学） ════════ */
#${SCREEN_ID} .gs-dlg{position:absolute;inset:0;z-index:60;background:rgba(20,20,20,.4);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .25s ease;}
#${SCREEN_ID} .gs-dlg.active{display:flex;opacity:1;}
#${SCREEN_ID} .gs-dlg-box{width:100%;max-width:320px;background:#f6f5f3;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);transform:scale(.94) translateY(8px);transition:transform .3s cubic-bezier(.16,1,.3,1);}
#${SCREEN_ID} .gs-dlg.active .gs-dlg-box{transform:scale(1) translateY(0);}
#${SCREEN_ID} .gs-dlg-head{padding:18px 20px 14px;border-bottom:.5px solid rgba(0,0,0,.06);}
#${SCREEN_ID} .gs-dlg-title{font-family:"Noto Serif SC",serif;font-size:16px;font-weight:700;letter-spacing:2px;}
#${SCREEN_ID} .gs-dlg-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.18);letter-spacing:1.5px;margin-top:3px;}
#${SCREEN_ID} .gs-dlg-body{padding:18px 20px;}
#${SCREEN_ID} .gs-dlg-text{font-size:13px;color:rgba(0,0,0,.55);line-height:1.7;}
#${SCREEN_ID} .gs-dlg-input{width:100%;background:rgba(0,0,0,.02);border:.5px solid rgba(0,0,0,.08);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:13px;line-height:1.6;color:#1a1a1a;outline:none;resize:none;max-height:240px;transition:all .2s;}
#${SCREEN_ID} .gs-dlg-input:focus{border-color:rgba(0,0,0,.2);background:#fff;}
#${SCREEN_ID} .gs-dlg-input::placeholder{color:rgba(0,0,0,.12);}
#${SCREEN_ID} .gs-dlg-hint{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.2);letter-spacing:1px;margin-top:8px;text-transform:uppercase;}
#${SCREEN_ID} .gs-dlg-foot{display:flex;gap:8px;padding:0 20px 20px;}
#${SCREEN_ID} .gs-dlg-btn{flex:1;height:40px;border-radius:10px;border:none;cursor:pointer;font-family:"Space Mono",monospace;font-size:10px;font-weight:700;letter-spacing:1.5px;-webkit-tap-highlight-color:transparent;transition:opacity .2s;}
#${SCREEN_ID} .gs-dlg-btn.ghost{background:transparent;border:.5px solid rgba(0,0,0,.12);color:rgba(0,0,0,.5);}
#${SCREEN_ID} .gs-dlg-btn.primary{background:#1a1a1a;color:#fff;}
#${SCREEN_ID} .gs-dlg-btn.danger{background:#8a2c2c;color:#fff;}
#${SCREEN_ID} .gs-dlg-btn:active{opacity:.8;}
/* 时间感知弹窗 */
#${SCREEN_ID} .gs-time-toggle-row{display:flex;align-items:center;gap:12px;}
#${SCREEN_ID} .gs-time-toggle-txt{flex:1;min-width:0;}
#${SCREEN_ID} .gs-time-toggle-main{font-size:13px;font-weight:700;color:#1a1a1a;letter-spacing:.3px;}
#${SCREEN_ID} .gs-time-toggle-sub{font-size:9px;color:rgba(0,0,0,.3);line-height:1.4;margin-top:3px;}
#${SCREEN_ID} .gs-time-switch{width:44px;height:26px;border-radius:13px;background:rgba(0,0,0,.12);position:relative;cursor:pointer;flex-shrink:0;transition:background .25s;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-time-switch.on{background:#1a1a1a;}
#${SCREEN_ID} .gs-time-switch-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:transform .25s cubic-bezier(.16,1,.3,1);}
#${SCREEN_ID} .gs-time-switch.on .gs-time-switch-knob{transform:translateX(18px);}
#${SCREEN_ID} .gs-time-custom{max-height:0;overflow:hidden;opacity:0;transition:all .3s cubic-bezier(.16,1,.3,1);}
#${SCREEN_ID} .gs-time-custom.show{max-height:140px;opacity:1;margin-top:16px;padding-top:16px;border-top:.5px solid rgba(0,0,0,.06);}
#${SCREEN_ID} .gs-time-input{font-family:"Space Mono",monospace;font-size:13px;text-align:center;}
/* ── +号功能菜单（底部 action sheet） ── */
#${SCREEN_ID} .gs-dlg.gs-sheet-mode{align-items:flex-end;justify-content:center;padding:0;}
#${SCREEN_ID} .gs-sheet{width:100%;background:#f6f5f3;border-radius:20px 20px 0 0;padding:18px 16px calc(env(safe-area-inset-bottom,12px) + 16px);box-shadow:0 -10px 40px rgba(0,0,0,.18);transform:translateY(100%);transition:transform .35s cubic-bezier(.16,1,.3,1);}
#${SCREEN_ID} .gs-dlg.active .gs-sheet{transform:translateY(0);}
#${SCREEN_ID} .gs-sheet-head{padding:2px 6px 14px;}
#${SCREEN_ID} .gs-sheet-title{font-family:"Noto Serif SC",serif;font-size:16px;font-weight:700;letter-spacing:2px;}
#${SCREEN_ID} .gs-sheet-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.18);letter-spacing:1.5px;margin-top:3px;}
#${SCREEN_ID} .gs-sheet-list{display:flex;flex-direction:column;gap:6px;}
#${SCREEN_ID} .gs-sheet-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.7);border:.5px solid rgba(0,0,0,.06);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .2s;}
#${SCREEN_ID} .gs-sheet-item:active{transform:scale(.98);background:rgba(255,255,255,.95);}
#${SCREEN_ID} .gs-sheet-icon{width:34px;height:34px;border-radius:9px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
#${SCREEN_ID} .gs-sheet-icon svg{width:16px;height:16px;stroke:#fff;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
#${SCREEN_ID} .gs-sheet-txt{flex:1;min-width:0;}
#${SCREEN_ID} .gs-sheet-item-title{font-size:13px;font-weight:700;color:#1a1a1a;letter-spacing:.3px;}
#${SCREEN_ID} .gs-sheet-item-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.2);letter-spacing:1px;margin-top:2px;}
#${SCREEN_ID} .gs-sheet-arrow svg{width:14px;height:14px;stroke:rgba(0,0,0,.2);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
#${SCREEN_ID} .gs-sheet-cancel{width:100%;height:42px;margin-top:12px;border-radius:12px;border:none;background:rgba(0,0,0,.04);font-family:"Space Mono",monospace;font-size:10px;font-weight:700;letter-spacing:1.5px;color:rgba(0,0,0,.5);cursor:pointer;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-sheet-cancel:active{background:rgba(0,0,0,.08);}
/* ── 世界书选书弹窗 ── */
#${SCREEN_ID} .gs-wb-box{max-width:340px;}
#${SCREEN_ID} .gs-wb-list{max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;scrollbar-width:none;}
#${SCREEN_ID} .gs-wb-list::-webkit-scrollbar{display:none;}
#${SCREEN_ID} .gs-wb-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.015);border:.5px solid rgba(0,0,0,.06);cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-wb-item.on{background:rgba(255,255,255,.9);border-color:rgba(0,0,0,.18);}
#${SCREEN_ID} .gs-wb-check{width:20px;height:20px;border-radius:6px;border:1.5px solid rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;}
#${SCREEN_ID} .gs-wb-check svg{width:12px;height:12px;stroke:#fff;fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:0;}
#${SCREEN_ID} .gs-wb-item.on .gs-wb-check{background:#1a1a1a;border-color:#1a1a1a;}
#${SCREEN_ID} .gs-wb-item.on .gs-wb-check svg{opacity:1;}
#${SCREEN_ID} .gs-wb-body{flex:1;min-width:0;}
#${SCREEN_ID} .gs-wb-name{font-size:12px;font-weight:700;color:#1a1a1a;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#${SCREEN_ID} .gs-wb-scope{font-family:"Space Mono",monospace;font-size:6px;font-weight:700;letter-spacing:.5px;padding:2px 5px;border-radius:3px;flex-shrink:0;}
#${SCREEN_ID} .gs-wb-scope-g{background:rgba(0,0,0,.06);color:rgba(0,0,0,.4);}
#${SCREEN_ID} .gs-wb-scope-in{background:rgba(40,120,60,.12);color:#2c7a3d;}
#${SCREEN_ID} .gs-wb-scope-out{background:rgba(0,0,0,.04);color:rgba(0,0,0,.2);}
#${SCREEN_ID} .gs-wb-preview{font-size:9px;color:rgba(0,0,0,.3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#${SCREEN_ID} .gs-wb-bc{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;padding:2px;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-wb-bc-label{font-family:"Space Mono",monospace;font-size:6px;font-weight:700;letter-spacing:.5px;color:rgba(0,0,0,.25);}
#${SCREEN_ID} .gs-wb-bc.on .gs-wb-bc-label{color:#1a1a1a;}
#${SCREEN_ID} .gs-wb-bc-sw{width:30px;height:17px;border-radius:9px;background:rgba(0,0,0,.12);position:relative;transition:background .25s;}
#${SCREEN_ID} .gs-wb-bc.on .gs-wb-bc-sw{background:#1a1a1a;}
#${SCREEN_ID} .gs-wb-bc-knob{position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .25s cubic-bezier(.16,1,.3,1);}
#${SCREEN_ID} .gs-wb-bc.on .gs-wb-bc-knob{transform:translateX(13px);}
/* ── 杀青印戳（卡片角标，纯装饰） ── */
#${SCREEN_ID} .gs-card{position:relative;}
#${SCREEN_ID} .gs-wrap-stamp{position:absolute;top:8px;right:8px;display:flex;align-items:center;gap:3px;padding:3px 7px;border:1px solid rgba(140,44,44,.3);border-radius:4px;transform:rotate(6deg);opacity:.6;pointer-events:none;z-index:3;}
#${SCREEN_ID} .gs-wrap-stamp svg{width:9px;height:9px;stroke:#8a2c2c;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
#${SCREEN_ID} .gs-wrap-stamp span{font-family:"Space Mono",monospace;font-size:7px;font-weight:700;letter-spacing:1.5px;color:#8a2c2c;}
/* ── 杀青面板 ── */
#${SCREEN_ID} .gs-wrap-box{max-width:340px;}
#${SCREEN_ID} .gs-wrap-stats{display:flex;gap:8px;margin-bottom:16px;}
#${SCREEN_ID} .gs-wrap-stat{flex:1;text-align:center;padding:10px 4px;border-radius:10px;background:rgba(0,0,0,.02);border:.5px solid rgba(0,0,0,.05);}
#${SCREEN_ID} .gs-wrap-stat.hl{background:#1a1a1a;border-color:#1a1a1a;}
#${SCREEN_ID} .gs-wrap-stat-n{font-family:"Space Mono",monospace;font-size:20px;font-weight:700;color:#1a1a1a;line-height:1;}
#${SCREEN_ID} .gs-wrap-stat.hl .gs-wrap-stat-n{color:#fff;}
#${SCREEN_ID} .gs-wrap-stat-l{font-size:8px;color:rgba(0,0,0,.3);margin-top:5px;letter-spacing:.5px;}
#${SCREEN_ID} .gs-wrap-stat.hl .gs-wrap-stat-l{color:rgba(255,255,255,.5);}
#${SCREEN_ID} .gs-wrap-field{margin-bottom:14px;}
#${SCREEN_ID} .gs-wrap-flabel{font-size:11px;font-weight:700;color:#1a1a1a;margin-bottom:6px;}
#${SCREEN_ID} .gs-wrap-flabel b{color:#8a2c2c;}
#${SCREEN_ID} .gs-wrap-hint-tag{font-family:"Space Mono",monospace;font-size:7px;font-weight:700;color:rgba(0,0,0,.25);letter-spacing:1px;padding:1px 5px;border:.5px solid rgba(0,0,0,.08);border-radius:3px;margin-left:4px;}
#${SCREEN_ID} .gs-wrap-num{text-align:center;font-family:"Space Mono",monospace;font-size:15px;font-weight:700;margin-bottom:8px;}
#${SCREEN_ID} .gs-wrap-btnrow{display:flex;gap:8px;}
#${SCREEN_ID} .gs-wrap-all{width:64px;height:38px;flex-shrink:0;}
#${SCREEN_ID} .gs-wrap-run{flex:1;height:38px;}
#${SCREEN_ID} .gs-wrap-run:disabled,#${SCREEN_ID} .gs-wrap-all:disabled{opacity:.35;cursor:not-allowed;}
#${SCREEN_ID} .gs-wrap-undo{width:100%;height:34px;margin-top:8px;font-size:10px;color:rgba(0,0,0,.5);}
#${SCREEN_ID} .gs-wrap-archive{font-size:12px;line-height:1.6;max-height:200px;}



.gs-chat-top{position:absolute;top:calc(env(safe-area-inset-top,44px) + 6px);left:14px;right:14px;z-index:20;padding:10px 16px;background:rgba(255,255,255,.78);backdrop-filter:blur(40px);border-radius:18px;display:flex;align-items:center;gap:12px;border:0.5px solid rgba(0,0,0,.05);box-shadow:0 2px 20px rgba(0,0,0,.025);}
.gs-chat-top-btn{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent;transition:all .2s;}
.gs-chat-top-btn:active{transform:scale(.9);background:rgba(0,0,0,.04);}
.gs-chat-top-btn svg{width:18px;height:18px;stroke:#1a1a1a;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;}
.gs-chat-top-text{display:flex;flex-direction:column;min-width:0;}
.gs-chat-top-title{font-size:15px;font-weight:700;letter-spacing:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-chat-top-sub{font-size:9px;color:rgba(0,0,0,.18);margin-top:1px;letter-spacing:1px;}
.gs-chat-top-right{margin-left:auto;display:flex;align-items:center;gap:10px;flex-shrink:0;}
.gs-chat-top-avatars{position:relative;width:72px;height:34px;}
.gs-chat-top-avatars .gs-tav{width:28px;height:28px;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;position:absolute;overflow:hidden;border:1.5px solid rgba(255,255,255,.9);box-shadow:0 2px 8px rgba(0,0,0,.06);}
.gs-chat-top-avatars .gs-tav-front{top:0;left:0;transform:rotate(-3deg);z-index:3;}
.gs-chat-top-avatars .gs-tav-back{top:2px;left:18px;transform:rotate(5deg);z-index:2;}
.gs-chat-top-avatars .gs-tav-ghost{top:3px;left:38px;transform:rotate(10deg);z-index:1;opacity:.4;}

/* 聊天底栏（复用 ts-bot 视觉） */
.gs-chat-bot{position:absolute;bottom:calc(env(safe-area-inset-bottom,10px) + 6px);left:14px;right:14px;z-index:20;background:rgba(255,255,255,.82);backdrop-filter:blur(40px);border-radius:16px;border:1px solid rgba(0,0,0,.12);box-shadow:0 2px 20px rgba(0,0,0,.025);padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;}
.gs-chat-tools{display:flex;align-items:center;gap:2px;padding:0 2px;}
.gs-chat-tool{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent;}
.gs-chat-tool:active{transform:scale(.88);background:rgba(0,0,0,.05);}
.gs-chat-tool svg{width:15px;height:15px;stroke:rgba(0,0,0,.25);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}
.gs-chat-tk{margin-left:auto;display:flex;align-items:center;gap:4px;padding:3px 8px;background:rgba(0,0,0,.02);border:0.5px solid rgba(0,0,0,.04);border-radius:6px;}
.gs-chat-tk-num{font-family:"Space Mono",monospace;font-size:10px;font-weight:700;color:rgba(0,0,0,.2);}
.gs-chat-tk-label{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.1);letter-spacing:1px;}
.gs-chat-input-row{display:flex;gap:6px;align-items:center;}
.gs-chat-add{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;background:rgba(0,0,0,.03);border:0.5px solid rgba(0,0,0,.04);}
.gs-chat-add svg{width:14px;height:14px;stroke:rgba(0,0,0,.25);fill:none;stroke-width:1.8;}
.gs-chat-field{flex:1;background:rgba(0,0,0,.02);border:0.5px solid rgba(0,0,0,.06);border-radius:8px;padding:9px 12px;transition:all .25s;}
.gs-chat-field:focus-within{border-color:rgba(0,0,0,.12);background:rgba(255,255,255,.6);}
.gs-chat-field textarea{width:100%;background:transparent;border:none;outline:none;font-family:inherit;font-size:13px;line-height:1.4;resize:none;max-height:60px;display:block;}
.gs-chat-field textarea::placeholder{color:rgba(0,0,0,.12);}
.gs-chat-send{width:44px;height:32px;border-radius:8px;background:#1a1a1a;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:transform .2s;}
.gs-chat-send:active{transform:scale(.93);}
.gs-chat-send svg{width:13px;height:13px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
/* ── 分页：加载更早 ── */
#${SCREEN_ID} .gs-load-more-wrap{position:relative;display:flex;justify-content:center;align-items:center;margin:4px 0 14px;}
#${SCREEN_ID} .gs-load-more-wrap::before{content:'';position:absolute;left:0;right:0;top:50%;border-top:1px dashed rgba(0,0,0,.18);z-index:0;}
#${SCREEN_ID} .gs-load-more-btn{position:relative;z-index:1;background:#f6f5f3;color:#1a1a1a;font-family:"Space Mono",monospace;font-size:9px;padding:5px 16px;border:1px solid #1a1a1a;border-radius:12px;cursor:pointer;text-transform:uppercase;letter-spacing:2px;transition:all .2s;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-load-more-btn:active{background:#1a1a1a;color:#f6f5f3;transform:scale(.96);}
/* ── 卡片配色面板 ── */
#${SCREEN_ID} .gs-cl-box{max-width:340px;max-height:80vh;display:flex;flex-direction:column;}
#${SCREEN_ID} .gs-cl-box .gs-dlg-body{overflow-y:auto;flex:1;min-height:0;scrollbar-width:none;}
#${SCREEN_ID} .gs-cl-box .gs-dlg-body::-webkit-scrollbar{display:none;}
#${SCREEN_ID} .gs-cl-preview{position:sticky;top:0;z-index:2;background:#edecea;border:.5px solid rgba(0,0,0,.06);border-radius:12px;padding:14px;margin-bottom:18px;}
#${SCREEN_ID} .gs-cl-pv-head{font-family:"Space Mono",monospace;font-size:8px;color:rgba(0,0,0,.3);letter-spacing:1px;display:flex;justify-content:space-between;border-bottom:.5px solid rgba(0,0,0,.06);padding-bottom:6px;margin-bottom:10px;}
#${SCREEN_ID} .gs-cl-pv-body{font-family:"Noto Serif SC",serif;font-size:13px;line-height:1.9;}
#${SCREEN_ID} .gs-cl-pv-body span{transition:color .2s;}
#${SCREEN_ID} .gs-cl-pv-divider{border-top:1px dashed rgba(0,0,0,.1);margin:10px 0;}
#${SCREEN_ID} .gs-cl-pv-receipt{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:10px;border-top:1px dashed rgba(0,0,0,.12);font-family:"Space Mono",monospace;font-size:8px;letter-spacing:.5px;}
#${SCREEN_ID} .gs-cl-pv-bar{display:flex;align-items:flex-end;gap:1px;height:10px;}
#${SCREEN_ID} .gs-cl-pv-bar i{display:block;width:1px;height:100%;}
#${SCREEN_ID} .gs-cl-pv-bar i:nth-child(odd){height:70%;}
#${SCREEN_ID} .gs-cl-group-title{font-family:"Space Mono",monospace;font-size:9px;color:rgba(0,0,0,.3);letter-spacing:1px;border-bottom:.5px solid rgba(0,0,0,.06);padding-bottom:4px;margin:16px 0 12px;}
#${SCREEN_ID} .gs-cl-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
#${SCREEN_ID} .gs-cl-label{font-size:11px;font-weight:600;color:#1a1a1a;min-width:64px;flex-shrink:0;}
#${SCREEN_ID} .gs-cl-swatches{display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex:1;}
#${SCREEN_ID} .gs-cl-swatch{width:20px;height:20px;border-radius:50%;cursor:pointer;transition:transform .15s;border:1px solid rgba(0,0,0,.08);-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-cl-swatch:active{transform:scale(.82);}
#${SCREEN_ID} .gs-cl-swatch.on{box-shadow:0 0 0 1.5px #edecea,0 0 0 3px #1a1a1a;}
#${SCREEN_ID} .gs-cl-native-wrap{width:20px;height:20px;border-radius:50%;position:relative;overflow:hidden;cursor:pointer;border:1px dashed rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;background:conic-gradient(from 0deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);}
#${SCREEN_ID} .gs-cl-native-ic{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.5);}
#${SCREEN_ID} .gs-cl-native-ic svg{width:11px;height:11px;stroke:#1a1a1a;fill:none;stroke-width:1.5;}
#${SCREEN_ID} .gs-cl-native{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
/* ── 自定义 CSS 编辑器 ── */
#${SCREEN_ID} .gs-css-box{max-width:360px;max-height:82vh;display:flex;flex-direction:column;}
#${SCREEN_ID} .gs-css-box .gs-dlg-body{overflow-y:auto;flex:1;min-height:0;scrollbar-width:none;}
#${SCREEN_ID} .gs-api-box{display:flex;flex-direction:column;max-height:78vh;}
#${SCREEN_ID} .gs-api-box .gs-dlg-body{overflow-y:auto;flex:1;min-height:0;scrollbar-width:none;}
#${SCREEN_ID} .gs-api-box .gs-dlg-body::-webkit-scrollbar{display:none;}
#${SCREEN_ID} .gs-css-box .gs-dlg-body::-webkit-scrollbar{display:none;}
#${SCREEN_ID} .gs-css-pv{margin-bottom:14px;}
#${SCREEN_ID} .gs-css-pv{margin-bottom:14px;margin-top:2px;}
#${SCREEN_ID} .gs-css-pv-label{font-family:"Space Mono",monospace;font-size:8px;color:rgba(0,0,0,.3);letter-spacing:1px;margin-bottom:8px;}
#${SCREEN_ID} .gs-css-pv-stage{background:linear-gradient(180deg,#edecea,#f3f2f0);border:.5px solid rgba(0,0,0,.06);border-radius:12px;padding:12px;pointer-events:none;}
#${SCREEN_ID} .gs-css-pv-stage .gs-card{margin:8px 0!important;}
#${SCREEN_ID} .gs-css-tip{font-size:10px;color:rgba(0,0,0,.4);line-height:1.6;margin-bottom:10px;}
#${SCREEN_ID} .gs-css-tip b{color:#1a1a1a;font-family:"Space Mono",monospace;font-size:9px;}
#${SCREEN_ID} .gs-css-input{font-family:"Space Mono","SF Mono",monospace;font-size:11px;line-height:1.55;max-height:220px;white-space:pre;overflow:auto;}
#${SCREEN_ID} .gs-css-btns{display:flex;gap:8px;margin-top:8px;}
#${SCREEN_ID} .gs-css-mini{flex:1;height:32px;border-radius:8px;border:.5px solid rgba(0,0,0,.12);background:transparent;font-family:"Space Mono",monospace;font-size:9px;font-weight:700;letter-spacing:1px;color:rgba(0,0,0,.5);cursor:pointer;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-css-mini:active{background:rgba(0,0,0,.05);}
/* ── 状态面板（居中遮罩 + 导航圆点） ── */
#${SCREEN_ID} .gs-av-st{position:relative;}
#${SCREEN_ID} .gs-av-st::after{content:"";position:absolute;right:-1px;bottom:-1px;width:6px;height:6px;border-radius:50%;background:#9A8C7A;border:1px solid #fff;}
#${SCREEN_ID} .gs-dlg:has(.gs-st-wrap){align-items:flex-start;justify-content:center;overflow-y:auto;padding:16px;}
#${SCREEN_ID} .gs-st-wrap{width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center;gap:18px;padding:8px 8px 24px;margin:auto;}
#${SCREEN_ID} .gs-st-nav{display:flex;gap:12px;}
#${SCREEN_ID} .rp-nav-slot:empty{display:none;}
#${SCREEN_ID} .gs-st-dot{width:34px;height:34px;border-radius:50%;border:1px solid rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:"Cormorant Garamond",serif;font-size:17px;font-weight:600;color:rgba(0,0,0,.4);transition:all .3s;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-st-dot.on{background:#1a1a1a;color:#fff;border-color:#1a1a1a;transform:scale(1.1);}
#${SCREEN_ID} .gs-st-stage{width:100%;}
#${SCREEN_ID} .gs-st-close{font-family:"Space Mono",monospace;font-size:10px;letter-spacing:2px;color:rgba(255,255,255,.7);cursor:pointer;padding:8px 24px;border:.5px solid rgba(255,255,255,.3);border-radius:20px;}
#${SCREEN_ID} .gs-st-close:active{background:rgba(255,255,255,.1);}
/* 状态面板编辑器 */
#${SCREEN_ID} .gs-st-ed-box{max-width:360px;max-height:82vh;display:flex;flex-direction:column;}
#${SCREEN_ID} .gs-st-ed-box .gs-dlg-body{overflow-y:auto;flex:1;min-height:0;scrollbar-width:none;}
#${SCREEN_ID} .gs-st-ed-box .gs-dlg-body::-webkit-scrollbar{display:none;}
#${SCREEN_ID} .gs-st-toggle-row{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
#${SCREEN_ID} .gs-st-tg-main{font-size:13px;font-weight:700;color:#1a1a1a;}
#${SCREEN_ID} .gs-st-tg-sub{font-size:9px;color:rgba(0,0,0,.3);margin-top:3px;line-height:1.4;}
#${SCREEN_ID} .gs-st-pv-label{font-family:"Space Mono",monospace;font-size:8px;color:rgba(0,0,0,.3);letter-spacing:1px;margin-bottom:8px;}
#${SCREEN_ID} .gs-st-pv{background:#EAE7E0;border-radius:12px;padding:10px;margin-bottom:12px;overflow:hidden;}
/* —— 状态编辑器新增 —— */
#${SCREEN_ID} .gs-st-sec-h{display:flex;align-items:baseline;justify-content:space-between;font-family:"Space Mono",monospace;font-size:11px;font-weight:700;letter-spacing:1px;color:#1a1a1a;margin:18px 0 8px;padding-top:14px;border-top:.5px solid rgba(0,0,0,.08);}
#${SCREEN_ID} .gs-st-sec-h:first-of-type{border-top:0;padding-top:0;}
#${SCREEN_ID} .gs-st-sec-h span{font-size:8px;font-weight:400;letter-spacing:.5px;color:rgba(0,0,0,.28);}
#${SCREEN_ID} .gs-st-frow{display:flex;align-items:center;gap:6px;margin-bottom:7px;}
#${SCREEN_ID} .gs-st-frow input{height:32px;border-radius:7px;border:.5px solid rgba(0,0,0,.12);background:rgba(0,0,0,.015);font-family:"Space Mono",monospace;font-size:11px;color:#1a1a1a;padding:0 8px;-webkit-appearance:none;outline:none;}
#${SCREEN_ID} .gs-st-frow input:focus{border-color:rgba(0,0,0,.3);background:#fff;}
#${SCREEN_ID} .gs-st-fkey{width:72px;flex:none;font-weight:700;}
#${SCREEN_ID} .gs-st-fdesc{flex:1;min-width:0;}
#${SCREEN_ID} .gs-st-fmax{width:46px;flex:none;text-align:center;padding:0 4px;}
#${SCREEN_ID} .gs-st-fmax::-webkit-inner-spin-button{display:none;}
#${SCREEN_ID} .gs-st-fdel{width:30px;height:32px;flex:none;border:0;background:transparent;color:rgba(0,0,0,.3);font-size:13px;cursor:pointer;border-radius:7px;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-st-fdel:active{background:rgba(0,0,0,.05);color:#1a1a1a;}
#${SCREEN_ID} .gs-st-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;}
#${SCREEN_ID} .gs-st-chip{font-family:"Space Mono",monospace;font-size:9px;font-weight:700;letter-spacing:.3px;color:#1a1a1a;background:rgba(0,0,0,.05);border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:3px 7px;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-st-chip:active{background:rgba(0,0,0,.12);}
#${SCREEN_ID} .gs-st-chip.ghost{background:transparent;color:rgba(0,0,0,.4);border-style:dashed;}
#${SCREEN_ID} .gs-st-preset-list{display:flex;flex-wrap:wrap;gap:6px;}
#${SCREEN_ID} .gs-st-preset-chip{display:inline-flex;align-items:center;gap:6px;font-family:"Space Mono",monospace;font-size:11px;font-weight:700;letter-spacing:.3px;color:#1a1a1a;background:rgba(138,44,44,.06);border:.5px solid rgba(138,44,44,.25);border-radius:8px;padding:5px 9px;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#${SCREEN_ID} .gs-st-preset-chip:active{background:rgba(138,44,44,.14);}
#${SCREEN_ID} .gs-st-preset-del{font-size:9px;color:rgba(138,44,44,.55);font-weight:700;padding:0 1px;cursor:pointer;}
#${SCREEN_ID} .gs-st-preset-del:active{color:#8a2c2c;}

/* ════════ 设置面板（完全独立的 gs-set-* 命名空间，不依赖主文件） ════════ */
#gs-settings-panel.gs-set-panel-root{position:absolute;inset:0;z-index:40;background:linear-gradient(180deg,#edecea,#f3f2f0 30%,#f6f5f3);display:flex;flex-direction:column;overflow:hidden;transform:translateX(100%);transition:transform .4s cubic-bezier(.16,1,.3,1);}
#gs-settings-panel.open{transform:translateX(0);}
#gs-settings-panel .gs-set-top{position:relative;z-index:2;padding:calc(env(safe-area-inset-top,44px) + 8px) 20px 12px;background:rgba(243,242,240,.9);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);display:flex;align-items:center;gap:14px;flex-shrink:0;}
#gs-settings-panel .gs-set-top-back{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .2s;flex-shrink:0;}
#gs-settings-panel .gs-set-top-back:active{transform:scale(.9);background:rgba(0,0,0,.04);}
#gs-settings-panel .gs-set-top-back svg{width:18px;height:18px;stroke:#1a1a1a;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;}
#gs-settings-panel .gs-set-top-info{flex:1;}
#gs-settings-panel .gs-set-top-info h1{font-size:16px;font-weight:700;letter-spacing:3px;}
#gs-settings-panel .gs-set-top-sub{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.12);letter-spacing:1.5px;margin-top:2px;}
#gs-settings-panel .gs-set-top-deco{position:absolute;bottom:0;left:20px;right:20px;height:.5px;background:linear-gradient(90deg,transparent,rgba(0,0,0,.06) 20%,rgba(0,0,0,.06) 80%,transparent);}
#gs-settings-panel .gs-set-scroll{flex:1;overflow-y:auto;padding:12px 16px 30px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
#gs-settings-panel .gs-set-scroll::-webkit-scrollbar{display:none;}
#gs-settings-panel .gs-set-sec{display:flex;align-items:center;gap:8px;margin-bottom:6px;margin-top:10px;}
#gs-settings-panel .gs-set-sec:first-child{margin-top:0;}
#gs-settings-panel .gs-set-sec-icon{width:18px;height:18px;border-radius:4px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
#gs-settings-panel .gs-set-sec-icon svg{width:9px;height:9px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
#gs-settings-panel .gs-set-sec-title{font-size:8px;font-weight:700;color:rgba(0,0,0,.3);letter-spacing:2px;text-transform:uppercase;}
#gs-settings-panel .gs-set-sec-line{flex:1;height:.5px;background:linear-gradient(to right,rgba(0,0,0,.06),transparent 70%);}
#gs-settings-panel .gs-set-sec-code{font-family:"Space Mono",monospace;font-size:6px;color:rgba(0,0,0,.08);letter-spacing:1px;}
#gs-settings-panel .gs-set-card{background:rgba(255,255,255,.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:12px;margin-bottom:6px;position:relative;overflow:hidden;}
#gs-settings-panel .gs-set-label{font-size:11px;font-weight:700;color:#1a1a1a;letter-spacing:.3px;display:flex;align-items:center;gap:6px;}
#gs-settings-panel .gs-set-label-tag{font-family:"Space Mono",monospace;font-size:6px;font-weight:700;color:rgba(0,0,0,.1);letter-spacing:1px;padding:2px 5px;border:.5px solid rgba(0,0,0,.05);border-radius:3px;text-transform:uppercase;}
#gs-settings-panel .gs-set-sub{font-size:8.5px;color:rgba(0,0,0,.22);line-height:1.4;margin-top:2px;margin-bottom:6px;}
#gs-settings-panel .gs-set-input{width:100%;background:rgba(0,0,0,.015);border:.5px solid rgba(0,0,0,.06);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:12px;color:#1a1a1a;outline:none;resize:none;transition:all .2s;-moz-appearance:textfield;}
#gs-settings-panel .gs-set-input:focus{border-color:rgba(0,0,0,.15);background:rgba(255,255,255,.5);}
#gs-settings-panel .gs-set-input::placeholder{color:rgba(0,0,0,.1);font-style:italic;font-size:11px;}
#gs-settings-panel .gs-set-save{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:32px;border-radius:6px;background:#1a1a1a;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#gs-settings-panel .gs-set-save:active{opacity:.85;}
#gs-settings-panel .gs-set-save svg{width:10px;height:10px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;}
#gs-settings-panel .gs-set-save span{font-family:"Space Mono",monospace;font-size:8px;font-weight:700;color:#fff;letter-spacing:2px;text-transform:uppercase;}
#gs-settings-panel .gs-set-slider-wrap{margin-top:8px;}
#gs-settings-panel .gs-set-slider-row{display:flex;align-items:center;gap:8px;}
#gs-settings-panel .gs-set-slider{flex:1;-webkit-appearance:none;appearance:none;height:3px;background:rgba(0,0,0,.05);border-radius:2px;outline:none;}
#gs-settings-panel .gs-set-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#1a1a1a;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12);}
#gs-settings-panel .gs-set-slider-display{display:flex;align-items:baseline;gap:2px;}
#gs-settings-panel .gs-set-slider-val{font-family:"Space Mono",monospace;font-size:14px;font-weight:700;color:#1a1a1a;min-width:36px;text-align:right;}
#gs-settings-panel .gs-set-slider-unit{font-family:"Space Mono",monospace;font-size:7px;color:rgba(0,0,0,.15);letter-spacing:.5px;text-transform:uppercase;}
#gs-settings-panel .gs-set-opts{display:flex;flex-direction:column;gap:4px;margin-top:6px;}
#gs-settings-panel .gs-set-opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:.5px solid rgba(0,0,0,.04);cursor:pointer;transition:all .25s;-webkit-tap-highlight-color:transparent;}
#gs-settings-panel .gs-set-opt.on{border-color:rgba(0,0,0,.12);background:rgba(255,255,255,.85);box-shadow:0 2px 10px rgba(0,0,0,.015);}
#gs-settings-panel .gs-set-opt-dot{width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;}
#gs-settings-panel .gs-set-opt.on .gs-set-opt-dot{border-color:#1a1a1a;background:#1a1a1a;}
#gs-settings-panel .gs-set-opt.on .gs-set-opt-dot::after{content:"";width:5px;height:5px;border-radius:50%;background:#fff;}
#gs-settings-panel .gs-set-opt-body{flex:1;min-width:0;}
#gs-settings-panel .gs-set-opt-title{font-size:10.5px;font-weight:600;color:#1a1a1a;}
#gs-settings-panel .gs-set-opt-desc{font-size:8px;color:rgba(0,0,0,.2);margin-top:1px;line-height:1.3;}
#gs-settings-panel .gs-set-divider{display:flex;align-items:center;justify-content:center;gap:6px;margin:10px 0 6px;padding:0 20px;}
#gs-settings-panel .gs-set-divider-line{flex:1;height:.5px;background:rgba(0,0,0,.04);}
#gs-settings-panel .gs-set-divider-dot{width:3px;height:3px;border-radius:50%;background:rgba(0,0,0,.06);}
#gs-settings-panel .gs-set-danger{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:32px;border-radius:6px;background:transparent;border:.5px solid rgba(180,40,30,.12);cursor:pointer;margin-top:12px;-webkit-tap-highlight-color:transparent;transition:all .2s;}
#gs-settings-panel .gs-set-danger:active{background:rgba(180,40,30,.03);}
#gs-settings-panel .gs-set-danger svg{width:11px;height:11px;stroke:rgba(180,40,30,.35);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
#gs-settings-panel .gs-set-danger span{font-size:9px;font-weight:700;color:rgba(180,40,30,.4);letter-spacing:1px;}

/* ── 🎵 网易云配乐 · 票根风播放条 ── */
.gs-music-player{position:relative;display:flex;align-items:stretch;gap:0;margin:12px 0;background:transparent;border:1px solid var(--gs-bar,rgba(0,0,0,.22));cursor:pointer;font-family:'Space Mono','SFMono-Regular',monospace;overflow:hidden;-webkit-tap-highlight-color:transparent;transition:opacity .2s;}
.gs-music-player::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background-image:repeating-linear-gradient(90deg,var(--gs-bar,rgba(0,0,0,.22)) 0 5px,transparent 5px 10px);opacity:.5;}
.gs-music-player:active{opacity:.72;}
.gs-music-cover{flex:0 0 auto;width:52px;height:52px;margin:9px 0 9px 9px;background-size:cover;background-position:center;background-color:#e8e6e1;filter:grayscale(.35) contrast(1.02);border:.5px solid var(--gs-bar,rgba(0,0,0,.18));}
.gs-music-cover-empty{display:flex;align-items:center;justify-content:center;}
.gs-music-note{font-size:18px;color:var(--gs-act,#999);opacity:.6;}
.gs-music-perf{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:9px 4px 9px 12px;}
.gs-music-meta{display:flex;flex-direction:column;gap:2px;min-width:0;}
.gs-music-title{font-size:12.5px;font-weight:700;letter-spacing:.01em;color:var(--gs-text,#1a1a1a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-music-artist{font-size:10px;letter-spacing:.05em;color:var(--gs-act,#888);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-music-foot{display:flex;align-items:center;gap:8px;}
.gs-music-code{font-size:8px;letter-spacing:.16em;color:var(--gs-act,#aaa);text-transform:uppercase;white-space:nowrap;}
.gs-music-wave{flex:0 0 auto;display:flex;align-items:flex-end;gap:2px;height:11px;}
.gs-music-wave i{width:2px;height:3px;background:var(--gs-act,#999);}
.gs-music-wave.playing i{animation:gsWave .85s ease-in-out infinite;}
.gs-music-wave.playing i:nth-child(2){animation-delay:.22s;}
.gs-music-wave.playing i:nth-child(3){animation-delay:.44s;}
.gs-music-wave.playing i:nth-child(4){animation-delay:.13s;}
@keyframes gsWave{0%,100%{height:3px;}50%{height:11px;}}
.gs-music-stub{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:42px;border-left:1px dashed var(--gs-bar,rgba(0,0,0,.28));}
.gs-music-btn{width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--gs-text,#1a1a1a);border:1px solid var(--gs-bar,rgba(0,0,0,.34));border-radius:50%;}
.gs-music-pending{opacity:.6;cursor:default;}
.gs-music-pending .gs-music-stub{border-left-color:var(--gs-bar,rgba(0,0,0,.18));}

/* ── 模型切换面板 ── */
.gs-api-list{display:flex;flex-direction:column;gap:8px;margin:4px 0 6px;}
.gs-api-item{border:1px solid rgba(0,0,0,.14);border-radius:2px;overflow:hidden;transition:border-color .2s;}
.gs-api-item.on{border-color:rgba(0,0,0,.5);}
.gs-api-row{display:flex;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.gs-api-row:active{background:rgba(0,0,0,.03);}
.gs-api-info{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;}
.gs-api-name{font-size:13px;font-weight:700;color:#1a1a1a;font-family:'Space Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-api-badge{font-size:8px;letter-spacing:.1em;background:#1a1a1a;color:#fff;padding:1px 5px;border-radius:2px;vertical-align:1px;font-weight:700;}
.gs-api-model-cur{font-size:10px;color:#888;font-family:'Space Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-api-model-toggle{flex:0 0 auto;font-size:9px;letter-spacing:.08em;color:#666;font-family:'Space Mono',monospace;border:1px solid rgba(0,0,0,.2);padding:4px 7px;border-radius:2px;}
.gs-api-model-toggle:active{background:rgba(0,0,0,.05);}
.gs-api-models{border-top:1px dashed rgba(0,0,0,.14);max-height:150px;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.gs-api-models::-webkit-scrollbar{display:none;}
.gs-api-model{padding:9px 14px;font-size:11px;color:#444;font-family:'Space Mono',monospace;cursor:pointer;border-bottom:.5px solid rgba(0,0,0,.05);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gs-api-model:active{background:rgba(0,0,0,.04);}
.gs-api-model.on{color:#1a1a1a;font-weight:700;background:rgba(0,0,0,.04);}
.gs-api-model-loading{padding:12px 14px;font-size:10px;color:#999;font-family:'Space Mono',monospace;text-align:center;}
`;
    const tag = document.createElement('style');
    tag.id = 'gs-style';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function _injectDOM() {
    if (document.getElementById(SCREEN_ID)) return;
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.id = SCREEN_ID;
    screen.innerHTML = `
      <!-- ① 面具墙 -->
      <div class="gs-layer gs-layer-active" id="gs-persona-layer">
        <div class="gs-top">
          <div class="gs-top-back" onclick="GroupStoryModule.close()"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
          <div class="gs-top-info"><h1>Ensemble</h1><div class="gs-top-sub">SELECT PERSONA · 群像</div></div>
          <div class="gs-top-deco"></div>
        </div>
        <div class="gs-scroll"><div class="gs-grid" id="gs-persona-grid"></div></div>
      </div>

      <!-- ② 面具工作区 -->
      <div class="gs-layer" id="gs-workspace-layer">
        <div class="gs-top">
          <div class="gs-top-back" onclick="GroupStoryModule.backToWall()"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
          <div class="gs-top-info"><h1 id="gs-ws-persona-name" style="font-family:'Noto Serif SC',serif;letter-spacing:2px;">Persona</h1><div class="gs-top-sub">GROUP STORY WORKSPACE</div></div>
          <div class="gs-top-deco"></div>
        </div>
        <div class="gs-tabs">
          <div class="gs-tab on" data-tab="groups" onclick="GroupStoryModule.switchTab('groups')"><div class="gs-tab-title">我的群像</div><div class="gs-tab-sub">MY ENSEMBLES</div></div>
          <div class="gs-tab" data-tab="cast" onclick="GroupStoryModule.switchTab('cast')"><div class="gs-tab-title">选角</div><div class="gs-tab-sub">NEW CAST</div></div>
        </div>
        <div id="gs-tab-groups" style="flex:1;display:flex;flex-direction:column;min-height:0;">
          <div id="gs-groups-list"></div>
        </div>
        <div id="gs-tab-cast" style="flex:1;display:none;flex-direction:column;min-height:0;position:relative;">
          <div id="gs-cast-grid"></div>
          <div class="gs-castbar" id="gs-cast-bar">
            <div class="gs-castbar-avatars"></div>
            <div class="gs-castbar-info"><div class="gs-castbar-main gs-castbar-names">-</div><div class="gs-castbar-sub gs-castbar-subtxt">READY</div></div>
            <button class="gs-castbar-btn" onclick="GroupStoryModule.openCreateModal()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Group</span></button>
          </div>
        </div>

        <!-- 建群弹层 -->
        <div class="gs-modal" id="gs-create-modal">
          <div class="gs-modal-box">
            <div class="gs-modal-head"><div class="gs-modal-title">组建群像</div><div class="gs-modal-sub">NAME & COVER</div></div>
            <div class="gs-modal-body">
              <label class="gs-modal-avatar" id="gs-create-avatar-img">
                <input type="file" accept="image/*" style="display:none" onchange="GroupStoryModule.handleCreateAvatar(event)">
                <span class="gs-modal-avatar-pic" id="gs-create-avatar-pic"></span>
                <div class="gs-modal-avatar-hint">群组头像</div>
              </label>
              <div class="gs-modal-field-label">群像名称 / GROUP NAME</div>
              <input type="text" class="gs-modal-input" id="gs-create-name" placeholder="给这场群像起个名字...">
            </div>
            <div class="gs-modal-foot">
              <button class="gs-modal-btn ghost" onclick="GroupStoryModule.closeCreateModal()">取消</button>
              <button class="gs-modal-btn primary" onclick="GroupStoryModule.confirmCreate()">创建</button>
            </div>
          </div>
        </div>

        <!-- 编辑群组弹层 -->
        <div class="gs-modal" id="gs-edit-modal">
          <div class="gs-modal-box">
            <div class="gs-modal-head"><div class="gs-modal-title">编辑群像</div><div class="gs-modal-sub">EDIT NAME & COVER</div></div>
            <div class="gs-modal-body">
              <label class="gs-modal-avatar" id="gs-edit-avatar-img">
                <input type="file" accept="image/*" style="display:none" onchange="GroupStoryModule.handleEditAvatar(event)">
                <span class="gs-modal-avatar-pic" id="gs-edit-avatar-pic"></span>
                <div class="gs-modal-avatar-hint">群组头像</div>
              </label>
              <div class="gs-modal-field-label">群像名称 / GROUP NAME</div>
              <input type="text" class="gs-modal-input" id="gs-edit-name" placeholder="群像名称...">
            </div>
            <div class="gs-modal-foot">
              <button class="gs-modal-btn ghost" onclick="GroupStoryModule.closeEditModal()">取消</button>
              <button class="gs-modal-btn primary" onclick="GroupStoryModule.confirmEdit()">保存</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ③ 群像聊天页 -->
      <div class="gs-layer" id="gs-chat-layer">
        <div class="gs-chat-top">
          <div class="gs-chat-top-btn" onclick="GroupStoryModule.backToWorkspace()"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
          <div class="gs-chat-top-text"><div class="gs-chat-top-title" id="gs-chat-title">群像</div><div class="gs-chat-top-sub" id="gs-chat-sub">CAST</div></div>
          <div class="gs-chat-top-right">
            <div class="gs-chat-top-avatars" id="gs-chat-top-avatars"></div>
            <div class="gs-chat-top-btn" onclick="GroupStoryModule.openSettings()"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></div>
          </div>
        </div>

        <div id="gs-chat-stream"></div>

        <div class="gs-chat-bot">
          <div class="gs-chat-tools">
            <div class="gs-chat-tool" title="开始"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
            <div class="gs-chat-tool" title="召唤"><svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
            <div class="gs-chat-tool" title="总结"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
            <div class="gs-chat-tool" title="事件"><svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="16" r="1.5"/><circle cx="12" cy="12" r="1.5"/></svg></div>
            <div class="gs-chat-tk"><span class="gs-chat-tk-num" id="gs-chat-tk">0</span><span class="gs-chat-tk-label">tk</span></div>
          </div>
          <div class="gs-chat-input-row">
            <div class="gs-chat-add" onclick="GroupStoryModule.openAddMenu()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
            <div class="gs-chat-field"><textarea id="gs-chat-input" rows="1" placeholder="Write your line…"></textarea></div>
            <button class="gs-chat-send" onclick="GroupStoryModule.sendUserLine()"><svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
          </div>
        </div>

        <!-- 设置面板 -->
        <div class="gs-set-panel-root" id="gs-settings-panel">
          <div class="gs-set-top">
            <div class="gs-set-top-back" onclick="GroupStoryModule.closeSettings()"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></div>
            <div class="gs-set-top-info"><h1>Settings</h1><div class="gs-set-top-sub">ENSEMBLE · CONFIGURATION</div></div>
            <div class="gs-set-top-deco"></div>
          </div>
          <div class="gs-set-scroll">
            <div class="gs-set-sec"><div class="gs-set-sec-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><span class="gs-set-sec-title">Opening</span><div class="gs-set-sec-line"></div><span class="gs-set-sec-code">§01</span></div>
            <div class="gs-set-card">
              <div class="gs-set-label">Opening Message / 开场白 <span class="gs-set-label-tag">editable</span></div>
              <div class="gs-set-sub">铺垫群像的第一幕场景</div>
              <textarea class="gs-set-input" id="gs-set-opening" rows="2" placeholder="*深夜便利店，门铃响了一声...*"></textarea>
            </div>

            <div class="gs-set-sec"><div class="gs-set-sec-icon"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><span class="gs-set-sec-title">Generation</span><div class="gs-set-sec-line"></div><span class="gs-set-sec-code">§02</span></div>
            <div class="gs-set-card">
              <div class="gs-set-label">Max Reply Tokens / 回复字数</div>
              <div class="gs-set-sub">控制 AI 每次回复的最大 token 数</div>
              <div style="display:flex;align-items:center;gap:8px;">
                <input class="gs-set-input" id="gs-set-maxtokens" type="number" value="1200" min="100" max="8000" step="100" style="flex:1;font-family:'Space Mono',monospace;font-size:14px;font-weight:700;text-align:center;">
                <span style="font-family:'Space Mono',monospace;font-size:8px;color:rgba(0,0,0,.15);letter-spacing:1px;">TOKENS</span>
              </div>
            </div>

            <div class="gs-set-sec"><div class="gs-set-sec-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><span class="gs-set-sec-title">Context</span><div class="gs-set-sec-line"></div><span class="gs-set-sec-code">§03</span></div>
            <div class="gs-set-card">
              <div class="gs-set-label">Context Limit / 记忆轮数</div>
              <div class="gs-set-sub">每次请求发送最近多少轮对话给 AI</div>
              <div class="gs-set-slider-wrap"><div class="gs-set-slider-row">
                <input type="range" class="gs-set-slider" id="gs-set-context" min="4" max="60" step="2" value="20" oninput="document.getElementById('gs-set-context-val').textContent=this.value">
                <div class="gs-set-slider-display"><span class="gs-set-slider-val" id="gs-set-context-val">20</span><span class="gs-set-slider-unit">轮</span></div>
              </div></div>
            </div>

            <div class="gs-set-sec"><div class="gs-set-sec-icon"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div><span class="gs-set-sec-title">Narrative</span><div class="gs-set-sec-line"></div><span class="gs-set-sec-code">§04</span></div>
            <div class="gs-set-card">
              <div class="gs-set-label">Narrative POV / 叙事人称</div>
              <div class="gs-set-opts" id="gs-pov-opts">
                <div class="gs-set-opt" data-pov="1st" onclick="this.parentElement.querySelectorAll('.gs-set-opt').forEach(o=>o.classList.remove('on'));this.classList.add('on')"><div class="gs-set-opt-dot"></div><div class="gs-set-opt-body"><div class="gs-set-opt-title">第一人称沉浸</div><div class="gs-set-opt-desc">角色动作用「我」描写，对白照常</div></div></div>
                <div class="gs-set-opt" data-pov="2nd" onclick="this.parentElement.querySelectorAll('.gs-set-opt').forEach(o=>o.classList.remove('on'));this.classList.add('on')"><div class="gs-set-opt-dot"></div><div class="gs-set-opt-body"><div class="gs-set-opt-title">第二人称代入</div><div class="gs-set-opt-desc">镜头跟着你，称呼你为「你」</div></div></div>
                <div class="gs-set-opt on" data-pov="3rd" onclick="this.parentElement.querySelectorAll('.gs-set-opt').forEach(o=>o.classList.remove('on'));this.classList.add('on')"><div class="gs-set-opt-dot"></div><div class="gs-set-opt-body"><div class="gs-set-opt-title">第三人称旁观 <span style="font-size:7px;color:rgba(0,0,0,.25)">· 群像推荐</span></div><div class="gs-set-opt-desc">所有人用名字，像小说</div></div></div>
              </div>
            </div>

            <div class="gs-set-card" style="margin-top:8px;">
              <button class="gs-set-save" onclick="GroupStoryModule.saveSettings()"><svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg><span>Save Data</span></button>
              <button class="gs-set-danger" onclick="GroupStoryModule.clearHistory()"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>清空记录 · CLEAR LOG</span></button>
            </div>
          </div>
        </div>
      </div>
    `;
    // 挂到 .device 容器内（与其他 screen 同级），找不到则挂 body
    const host = document.querySelector('.device') || document.body;
    host.appendChild(screen);

    // 选角底栏 names 容器已在 HTML 中写死 class，无需后处理

    // 输入框自适应高度
    const ta = screen.querySelector('#gs-chat-input');
    if (ta) ta.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 60) + 'px';
    });
  }

})();

/* const 声明不会自动挂到 window；独立文件需显式暴露，
   供 HTML 内联 onclick 与主文件 addEventListener 访问。 */
window.GroupStoryModule = GroupStoryModule;