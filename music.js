// ============================================================
// music.js — Moon Story 音乐模块 (集成桌面悬浮先锋播放器)
// 用法：主文件引入后调用 MusicModule.open() / MusicModule.close()
// ============================================================
const MusicModule = (() => {

  // ================================================================
  // MusicDB — 独立 IndexedDB，持久化音频/歌词/歌单
  // ================================================================
  const MusicDB = (() => {
    let _db = null;
    function _open() {
      return new Promise((res, rej) => {
        const req = indexedDB.open('MusicModuleDB_v2', 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          ['playlists', 'audio', 'lyrics'].forEach(n => {
            if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' });
          });
        };
        req.onsuccess = e => { _db = e.target.result; res(); };
        req.onerror = () => rej(req.error);
      });
    }
    function _s(name, mode) { return _db.transaction(name, mode).objectStore(name); }
    const init    = () => _db ? Promise.resolve() : _open();
    const get     = (s, k) => new Promise((r,j) => { const q=_s(s,'readonly').get(k); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
    const getAll  = s     => new Promise((r,j) => { const q=_s(s,'readonly').getAll(); q.onsuccess=()=>r(q.result||[]); q.onerror=()=>j(q.error); });
    const put     = (s,v) => new Promise((r,j) => { const q=_s(s,'readwrite').put(v); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });
    const del     = (s,k) => new Promise((r,j) => { const q=_s(s,'readwrite').delete(k); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });
    return { init, get, getAll, put, del };
  })();

  // ── 注入 CSS（全部 scope 在 #music-root 下，除悬浮窗外）──
  const _injectCSS = () => {
    if (document.getElementById('music-module-style')) return;
    const style = document.createElement('style');
    style.id = 'music-module-style';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,700&family=Courier+Prime:ital,wght@0,400;0,700&family=Space+Grotesk:wght@300;400;600&family=VT323&display=swap');

      #music-root {
        --ms-bg: #030305;
        --ms-text-main: #f4f4f5;
        --ms-text-sub: #888890;
        --ms-accent: #d4d4d8;
        --ms-border: rgba(255,255,255,0.15);
        --ms-glass: rgba(10,10,15,0.75);
        --ms-font-en: 'Cinzel', serif;
        --ms-font-zh: 'Noto Sans SC', sans-serif;

        position: fixed; inset: 0; z-index: 1000;
        background: var(--ms-bg);
        color: var(--ms-text-main);
        font-family: var(--ms-font-zh);
        overflow: hidden;
        transform: translateY(100%);
        transition: transform 0.45s cubic-bezier(0.19,1,0.22,1);
      }
      #music-root.ms-open { transform: translateY(0); }

      #music-root * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      #music-root ::-webkit-scrollbar { display: none; }

      /* 噪点 */
      #ms-noise { position: absolute; inset: 0; pointer-events: none; z-index: 9999; opacity: 0.04;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }

      /* 星空画布 */
      #ms-canvas { position: absolute; inset: 0; z-index: 0; pointer-events: none; }

      /* view 切换 */
      #music-root .ms-view {
        position: absolute; inset: 0; overflow-y: auto; padding-bottom: 120px;
        opacity: 0; pointer-events: none; transition: opacity 0.4s ease; z-index: 10;
      }
      #music-root .ms-view.active { opacity: 1; pointer-events: auto; }

      /* 通用字体 */
      #music-root .ms-title-en { font-family: var(--ms-font-en); font-size: 2rem; letter-spacing: 4px; font-weight: 400; text-transform: uppercase; }
      #music-root .ms-text-light { color: var(--ms-text-sub); font-size: 0.85rem; font-weight: 300; }

      /* header - 加入安全距离，适配PWA沉浸式 */
      #music-root .ms-header { display:flex; align-items:center; justify-content:space-between; padding:calc(env(safe-area-inset-top, 0px) + 25px) 25px 20px; position:sticky; top:0;
        background: linear-gradient(to bottom,rgba(3,3,5,1) 0%,rgba(3,3,5,0) 100%); z-index:20; }
      #music-root .ms-back-btn { font-size:1.6rem; color:var(--ms-text-main); cursor:pointer; padding: 5px; margin-left: -5px; transition:color 0.3s; }
      #music-root .ms-back-btn:active { color:var(--ms-text-sub); }
      #music-root .ms-icon-btn { font-size:1.5rem; color:var(--ms-text-main); cursor:pointer; transition:color 0.3s; padding:5px; }
      #music-root .ms-icon-btn:active { color:var(--ms-text-sub); }

      /* input / select */
      #music-root input[type="text"],
      #music-root input[type="password"] {
        background:transparent; border:none; border-bottom:1px solid var(--ms-border);
        color:var(--ms-text-main); padding:12px 0; font-family:var(--ms-font-zh);
        outline:none; width:100%; transition:border-color 0.3s; font-size:1rem;
      }
      #music-root input:focus { border-bottom-color: var(--ms-accent); }
      #music-root input::placeholder { color:rgba(255,255,255,0.2); font-weight:300; }
      #music-root .ms-btn-ghost {
        background:transparent; border:1px solid var(--ms-border); color:var(--ms-text-main);
        padding:12px 24px; border-radius:30px; font-family:var(--ms-font-zh); font-weight:300;
        letter-spacing:1px; cursor:pointer; transition:all 0.3s; backdrop-filter:blur(5px);
      }
      #music-root .ms-btn-ghost:active { background:rgba(255,255,255,0.1); }

      /* ── 本地 Hub ── */
      #ms-local-view { padding:0; }
      #music-root .ms-local-top-bar { display:flex; justify-content:space-between; align-items:center; padding:calc(env(safe-area-inset-top, 0px) + 25px) 25px 20px; position:sticky; top:0; z-index:20; background:linear-gradient(to bottom,rgba(3,3,5,1) 30%,rgba(3,3,5,0) 100%); }
      #music-root .ms-local-top-bar .ms-title-en { font-size:1.5rem; letter-spacing:3px; }
      #music-root .ms-top-bar-actions { display:flex; align-items:center; gap:20px; }
      
      /* 优化：带有下划线动画的 BACK 按钮 */
      #music-root .ms-text-back-btn { font-family:var(--ms-font-en); font-size:0.95rem; color:var(--ms-text-main); letter-spacing:2px; cursor:pointer; position:relative; padding-bottom:4px; transition:color 0.3s; }
      #music-root .ms-text-back-btn::after { content:''; position:absolute; bottom:0; left:0; width:100%; height:1px; background:var(--ms-text-main); transition:transform 0.3s cubic-bezier(0.2,1,0.2,1); transform-origin:right; }
      #music-root .ms-text-back-btn:hover { color:var(--ms-text-sub); }
      #music-root .ms-text-back-btn:hover::after { transform:scaleX(0.6); background:var(--ms-text-sub); }

      /* 优化：收纳菜单胶囊按钮 */
      #music-root .ms-dropdown-wrap { position:relative; }
      #music-root .ms-menu-trigger { display:flex; align-items:center; justify-content:center; width:38px; height:38px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:50%; cursor:pointer; font-size:1.2rem; color:var(--ms-text-main); backdrop-filter:blur(10px); transition:all 0.3s; }
      #music-root .ms-menu-trigger:active { background:rgba(255,255,255,0.1); transform:scale(0.92); }
      
      /* 下拉菜单面板 */
      #music-root .ms-dropdown-menu { position:absolute; top:calc(100% + 10px); right:0; background:rgba(15,15,20,0.85); border:1px solid var(--ms-border); border-radius:12px; padding:6px; min-width:120px; backdrop-filter:blur(25px); -webkit-backdrop-filter:blur(25px); box-shadow:0 10px 30px rgba(0,0,0,0.5); opacity:0; pointer-events:none; transform:translateY(-10px); transition:all 0.3s cubic-bezier(0.2,0.8,0.2,1); z-index:100; }
      #music-root .ms-dropdown-menu.active { opacity:1; pointer-events:auto; transform:translateY(0); }
      
      /* 菜单项 */
      #music-root .ms-dropdown-item { display:flex; align-items:center; gap:10px; padding:12px 16px; border-radius:8px; font-size:0.9rem; color:var(--ms-text-main); cursor:pointer; transition:background 0.2s; white-space:nowrap; letter-spacing:1px; }
      #music-root .ms-dropdown-item i { font-size:1.1rem; color:var(--ms-text-sub); }
      #music-root .ms-dropdown-item:active { background:rgba(255,255,255,0.08); }
      #music-root .ms-local-page-title { padding:10px 25px 30px; }
      #music-root .ms-local-page-title h2 { font-family:var(--ms-font-en); font-size:2.2rem; font-weight:400; color:#fff; letter-spacing:2px; line-height:1.2; }
      #music-root .ms-local-page-title p { color:var(--ms-text-sub); font-size:0.85rem; margin-top:8px; letter-spacing:2px; text-transform:uppercase; font-family:var(--ms-font-en); }
      #ms-local-pl-render { padding:0 25px; display:flex; flex-direction:column; gap:20px; }

      /* 画册风歌单卡片 */
      #music-root .ms-art-card { display:flex; align-items:stretch; gap:20px; padding:15px 0; border-bottom:1px solid rgba(255,255,255,0.06); cursor:pointer; transition:background 0.3s; }
      #music-root .ms-art-card:active { background:rgba(255,255,255,0.02); }
      #music-root .ms-art-cover-wrap { position:relative; width:110px; height:110px; flex-shrink:0; border:1px solid rgba(255,255,255,0.1); border-radius:4px; overflow:hidden; }
      #music-root .ms-art-cover { width:100%; height:100%; background-size:cover; background-position:center; filter:grayscale(20%); transition:filter 0.4s,transform 0.4s; }
      #music-root .ms-art-card:hover .ms-art-cover { filter:grayscale(0%); transform:scale(1.05); }
      #music-root .ms-art-edit-btn { position:absolute; bottom:5px; right:5px; background:rgba(0,0,0,0.7); width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.9rem; backdrop-filter:blur(2px); }
      #music-root .ms-art-edit-btn:active { background:#fff; color:#000; }
      #music-root .ms-art-del-btn { position:absolute; top:5px; right:5px; background:rgba(0,0,0,0.7); width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.6); font-size:0.85rem; backdrop-filter:blur(2px); transition:all 0.2s; }
      #music-root .ms-art-del-btn:active { background:rgba(220,60,60,0.9); color:#fff; }
      #music-root .ms-art-info { flex:1; display:flex; flex-direction:column; justify-content:space-between; padding:2px 0; }
      #music-root .ms-art-top { display:flex; justify-content:space-between; align-items:flex-start; }
      #music-root .ms-art-num { font-family:var(--ms-font-en); font-size:0.9rem; color:rgba(255,255,255,0.3); font-weight:700; }
      #music-root .ms-art-title-en { font-family:var(--ms-font-en); font-size:1.4rem; letter-spacing:2px; font-weight:400; line-height:1.1; margin-top:5px; color:#fff; }
      #music-root .ms-art-bottom { display:flex; justify-content:space-between; align-items:flex-end; }
      #music-root .ms-art-title-zh { font-size:0.8rem; color:var(--ms-text-sub); letter-spacing:1px; font-weight:300; }
      #music-root .ms-art-count { font-family:var(--ms-font-en); font-size:0.75rem; color:var(--ms-text-main); border-bottom:1px solid rgba(255,255,255,0.3); padding-bottom:2px; letter-spacing:1px; }

      /* ── API 连接页 ── */
      #ms-api-login-view { display:flex; flex-direction:column; justify-content:center; padding:40px 30px; }
      #music-root .ms-api-login-box { text-align:center; animation:ms-fadeUp 0.6s ease forwards; }
      #music-root .ms-api-input-wrap { position:relative; margin:40px 0 30px; }
      #music-root .ms-api-input-wrap i { position:absolute; left:0; top:50%; transform:translateY(-50%); color:var(--ms-text-sub); font-size:1.2rem; }
      #music-root .ms-api-input-wrap input { padding-left:35px; }

      /* ── 登录页 ── */
      #music-root .ms-login-tabs { display:flex; justify-content:center; gap:25px; margin-bottom:40px; }
      #music-root .ms-login-tab { color:var(--ms-text-sub); font-size:0.9rem; cursor:pointer; transition:color 0.3s; position:relative; padding-bottom:5px; }
      #music-root .ms-login-tab.active { color:var(--ms-text-main); }
      #music-root .ms-login-tab.active::after { content:''; position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:15px; height:2px; background:var(--ms-text-main); border-radius:2px; }
      #music-root .ms-login-panel { display:none; flex-direction:column; gap:25px; align-items:center; }
      #music-root .ms-login-panel.active { display:flex; animation:ms-fadeUp 0.5s ease forwards; }
      #music-root .ms-qr-box { width:160px; height:160px; background:rgba(255,255,255,0.03); border:1px solid var(--ms-border); display:flex; align-items:center; justify-content:center; border-radius:15px; position:relative; overflow:hidden; }
      #music-root .ms-qr-img { width:85%; height:85%; background:repeating-linear-gradient(45deg,rgba(255,255,255,0.4) 0,rgba(255,255,255,0.4) 2px,transparent 2px,transparent 5px); }

      /* ── 主页 ── */
      #ms-home-view { padding:40px 0; }
      #music-root .ms-user-profile { display:flex; align-items:center; justify-content:space-between; padding:0 25px; margin-bottom:35px; margin-top: calc(env(safe-area-inset-top, 0px)); }
      #music-root .ms-user-info { display:flex; align-items:center; gap:15px; }
      #music-root .ms-avatar { width:45px; height:45px; border-radius:50%; background-color:#333; background-size:cover; background-position:center; border:1px solid rgba(255,255,255,0.2); }
      #music-root .ms-greeting { font-size:1.1rem; font-weight:300; }
      #music-root .ms-header-actions { display:flex; gap:15px; }
      #music-root .ms-home-grid { padding:0 25px 40px; display:flex; flex-direction:column; gap:15px; }
      #music-root .ms-grid-card { position:relative; border-radius:16px; overflow:hidden; cursor:pointer; border:1px solid rgba(255,255,255,0.08); box-shadow:0 8px 25px rgba(0,0,0,0.5); background-size:cover; background-position:center; transition:transform 0.2s; }
      #music-root .ms-grid-card:active { transform:scale(0.97); }
      #music-root .ms-card-overlay { position:absolute; inset:0; background:linear-gradient(135deg,rgba(15,15,20,0.85) 0%,rgba(15,15,20,0.4) 50%,rgba(15,15,20,0.8) 100%); z-index:1; pointer-events:none; }
      #music-root .ms-card-content { position:relative; z-index:2; padding:22px; display:flex; flex-direction:column; height:100%; justify-content:space-between; }
      #music-root .ms-card-icon-top { align-self:flex-end; font-size:1.5rem; color:rgba(255,255,255,0.4); }
      #music-root .ms-card-text { margin-top:auto; }
      #music-root .ms-card-title-en { font-family:var(--ms-font-en); font-size:1.5rem; letter-spacing:2px; margin-bottom:4px; color:var(--ms-text-main); text-shadow:0 2px 10px rgba(0,0,0,0.8); }
      #music-root .ms-card-title-zh { font-size:0.85rem; color:#a0a0a5; font-weight:300; letter-spacing:1px; }
      #music-root .ms-card-main { height:180px; }
      #music-root .ms-card-sub-group { display:flex; gap:15px; }
      #music-root .ms-card-sub { flex:1; height:150px; }
      #music-root .ms-card-sub .ms-card-title-en { font-size:1.1rem; letter-spacing:1px; }

      /* ── 歌单列表 ── */
      #ms-playlists-view,#ms-songlist-view,#ms-search-view { padding:0; }
      #music-root .ms-pl-list { padding:0 20px; display:flex; flex-direction:column; gap:20px; }
      #music-root .ms-pl-card { display:flex; align-items:center; gap:15px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; }
      #music-root .ms-pl-cover { width:65px; height:65px; border-radius:12px; background-color:#222; background-size:cover; background-position:center; border:1px solid rgba(255,255,255,0.1); flex-shrink:0; }
      #music-root .ms-pl-info { flex:1; }
      #music-root .ms-pl-name { font-size:1.05rem; margin-bottom:6px; letter-spacing:1px; }

      /* ── 歌曲列表页 ── */
      #music-root .ms-sl-header { width:100%; height:35vh; background-size:cover; background-position:center; position:relative; display:flex; flex-direction:column; justify-content:flex-end; padding:30px 25px; }
      #music-root .ms-sl-header::after { content:''; position:absolute; inset:0; background:linear-gradient(to bottom,transparent 0%,var(--ms-bg) 100%); pointer-events:none; }
      #music-root .ms-sl-top-bar { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 25px); left:25px; right:25px; z-index:10; display:flex; justify-content:space-between; align-items:center; }
      #music-root .ms-sl-title-box { position:relative; z-index:2; margin-bottom:10px; }
      #music-root .ms-sl-title { font-size:2.2rem; font-family:var(--ms-font-en); margin-bottom:8px; text-shadow:0 2px 15px rgba(0,0,0,0.9); }
      #music-root .ms-song-list { padding:10px 25px; }
      #music-root .ms-song-item { display:flex; align-items:center; padding:16px 0; border-bottom:1px solid rgba(255,255,255,0.03); cursor:pointer; }
      #music-root .ms-song-index { width:35px; font-family:var(--ms-font-en); color:rgba(255,255,255,0.3); font-size:1rem; }
      #music-root .ms-song-info { flex:1; overflow:hidden; }
      #music-root .ms-song-name { font-size:1.05rem; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:400; }
      #music-root .ms-song-artist { font-size:0.8rem; color:var(--ms-text-sub); }
      #music-root .ms-song-item.playing .ms-song-name { color:#fff; text-shadow:0 0 8px rgba(255,255,255,0.5); }
      #music-root .ms-song-item.playing .ms-song-index { color:#fff; }

      /* ── 搜索 ── */
      #music-root .ms-search-box { position:relative; margin:20px 25px; }
      #music-root .ms-search-icon { position:absolute; left:0; top:50%; transform:translateY(-50%); color:var(--ms-text-sub); font-size:1.2rem; }
      #music-root .ms-search-box input { padding-left:35px; font-size:1.1rem; border-bottom:2px solid rgba(255,255,255,0.2); }

      /* ── 弹窗 ── */
      #music-root .ms-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:10100; opacity:0; pointer-events:none; transition:opacity 0.3s; }
      #music-root .ms-modal-overlay.active { opacity:1; pointer-events:auto; }
      #music-root .ms-modal-content { background:rgba(15,15,20,0.9); width:85%; padding:30px; border-radius:20px; border:1px solid var(--ms-border); box-shadow:0 0 40px rgba(0,0,0,0.8); position:relative; }
      #music-root .ms-modal-title { margin-bottom:25px; font-weight:400; text-align:center; letter-spacing:2px; }
      #music-root .ms-upload-area { border:1px dashed var(--ms-border); padding:20px; text-align:center; border-radius:10px; margin-bottom:20px; color:var(--ms-text-sub); font-size:0.95rem; cursor:pointer; transition:background 0.2s; }
      #music-root .ms-upload-area:active { background:rgba(255,255,255,0.05); }
      #music-root .ms-modal-actions { display:flex; justify-content:space-between; margin-top:30px; }
      #music-root .ms-modal-btn { padding:10px 25px; border-radius:25px; border:1px solid var(--ms-border); background:transparent; color:#fff; cursor:pointer; }

      /* ── 上传工作台 ── */
      #music-root .ms-action-sheet { position:absolute; bottom:-100%; left:0; width:100%; background:rgba(15,15,20,0.95); backdrop-filter:blur(20px); border-top-left-radius:20px; border-top-right-radius:20px; padding:25px 25px 40px; transition:bottom 0.4s cubic-bezier(0.2,0.8,0.2,1); border-top:1px solid rgba(255,255,255,0.1); box-shadow:0 -10px 40px rgba(0,0,0,0.5); }
      #music-root .ms-modal-overlay.active .ms-action-sheet { bottom:0; }
      #music-root .ms-sheet-btn { flex:1; padding:12px; border-radius:10px; border:1px dashed rgba(255,255,255,0.2); text-align:center; color:var(--ms-text-main); font-size:0.95rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(255,255,255,0.02); }
      #music-root .ms-sheet-btn:active { background:rgba(255,255,255,0.08); }
      #ms-pending-list { max-height:180px; overflow-y:auto; margin:15px 0; border-radius:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.05); }
      #music-root .ms-pending-item { display:flex; align-items:center; justify-content:space-between; padding:12px 15px; border-bottom:1px solid rgba(255,255,255,0.03); }
      #music-root .ms-pending-item:last-child { border-bottom:none; }
      #music-root .ms-pending-name { font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; }
      #music-root .ms-pending-type { font-size:0.7rem; color:var(--ms-text-sub); font-family:var(--ms-font-en); background:rgba(255,255,255,0.1); padding:3px 6px; border-radius:4px; margin-right:10px; }
      #music-root .ms-pending-del { color:rgba(255,255,255,0.4); cursor:pointer; font-size:1.2rem; }
      #music-root .ms-pending-del:active { color:#ff6b6b; }
      #music-root .ms-sheet-confirm { width:100%; padding:16px; border-radius:30px; background:var(--ms-text-main); color:var(--ms-bg); font-weight:500; font-size:1.05rem; border:none; cursor:pointer; letter-spacing:2px; margin-top:10px; }
      #music-root .ms-sheet-confirm:active { transform:scale(0.98); }

      /* ── 迷你播放器 ── */
      #ms-mini-player {
        position:absolute; bottom:-90px; left:15px; right:15px; height:65px;
        background:var(--ms-glass); backdrop-filter:blur(15px); -webkit-backdrop-filter:blur(15px);
        border:1px solid var(--ms-border); border-radius:35px; display:flex; align-items:center;
        padding:0 15px 0 10px; z-index:40; transition:bottom 0.5s cubic-bezier(0.2,0.8,0.2,1);
        cursor:pointer; box-shadow:0 10px 30px rgba(0,0,0,0.5);
      }
      #ms-mini-player.visible { bottom:20px; }
      #music-root .ms-mp-cover { width:45px; height:45px; border-radius:50%; background-color:#333; background-size:cover; margin-right:15px; border:1px solid rgba(255,255,255,0.2); animation:ms-rotateCover 12s linear infinite; animation-play-state:paused; }
      #music-root .ms-mp-cover.spinning { animation-play-state:running; }
      #music-root .ms-mp-info { flex:1; overflow:hidden; display:flex; flex-direction:column; justify-content:center; }
      #music-root .ms-mp-title { font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:3px; font-weight:400; }
      #music-root .ms-mp-artist { font-size:0.75rem; color:var(--ms-text-sub); }
      #music-root .ms-mp-controls { display:flex; align-items:center; gap:12px; color:var(--ms-text-main); font-size:1.8rem; padding-right:5px; }
      #music-root .ms-mp-btn { cursor:pointer; transition:transform 0.2s; }
      #music-root .ms-mp-btn:active { transform:scale(0.9); }
      #music-root .ms-mp-btn.play-pause { font-size:2.2rem; }

      /* ── 全屏播放器 ── */
      #ms-full-player {
        position:absolute; top:100%; left:0; width:100%; height:100%;
        background:rgba(3,3,5,0.85); backdrop-filter:blur(25px); -webkit-backdrop-filter:blur(25px);
        z-index:50; transition:top 0.5s cubic-bezier(0.2,0.8,0.2,1);
        display:flex; flex-direction:column; padding:25px 20px;
        padding-top: calc(env(safe-area-inset-top, 0px) + 25px);
      }
      #ms-full-player.expanded { top:0; }
      #music-root .ms-fp-header { display:flex; justify-content:space-between; align-items:center; padding:10px 0; }
      #music-root .ms-fp-header i { font-size:1.6rem; cursor:pointer; padding:10px; margin-left: -10px; }
      #music-root .ms-fp-title-area { text-align:center; }
      #music-root .ms-fp-source { font-size:0.65rem; color:var(--ms-text-sub); letter-spacing:2px; text-transform:uppercase; margin-bottom:4px; }
      #music-root .ms-fp-art-wrap { flex:1; display:flex; align-items:center; justify-content:center; margin-top:2vh; }
      #music-root .ms-fp-art { width:280px; height:280px; border-radius:50%; background-size:cover; background-position:center; box-shadow:0 0 50px rgba(255,255,255,0.08),inset 0 0 30px rgba(0,0,0,0.6); animation:ms-rotateCover 25s linear infinite; animation-play-state:paused; position:relative; border:1px solid rgba(255,255,255,0.1); }
      #music-root .ms-fp-art::before { content:''; position:absolute; inset:-2px; border-radius:50%; background:radial-gradient(circle at 30% 30%,rgba(255,255,255,0.15),transparent 60%); pointer-events:none; }
      #music-root .ms-fp-art.spinning { animation-play-state:running; }
      #music-root .ms-fp-info { margin-bottom:20px; text-align:center; }
      #music-root .ms-fp-song-title { font-size:1.8rem; font-family:var(--ms-font-en); margin-bottom:8px; text-shadow:0 0 10px rgba(255,255,255,0.2); }
      #music-root .ms-fp-song-artist { font-size:0.95rem; color:var(--ms-text-sub); font-weight:300; }
      
      /* 歌词视窗重构：平滑滚动 */
      #music-root .ms-fp-lyrics { height:100px; overflow:hidden; text-align:center; margin-bottom:30px; position:relative; -webkit-mask-image: linear-gradient(to bottom, transparent, black 15%, black 85%, transparent); mask-image: linear-gradient(to bottom, transparent, black 15%, black 85%, transparent); }
      #music-root .ms-lyric-scroll { transition: transform 0.4s cubic-bezier(0.2,0.8,0.2,1); padding-top: 35px; }
      #music-root .ms-lyric-line { font-size:0.9rem; color:rgba(255,255,255,0.4); font-weight:300; min-height: 30px; line-height:30px; transition:all 0.4s ease; padding: 0 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #music-root .ms-lyric-line.active { color:#fff; font-size:1.05rem; text-shadow:0 0 8px rgba(255,255,255,0.3); font-weight:400; transform: scale(1.05); }

      /* 进度条 */
      #music-root .ms-progress-wrap { display:flex; align-items:center; gap:15px; margin-bottom:40px; font-size:0.75rem; color:var(--ms-text-sub); font-family:'Cinzel',monospace; }
      #music-root .ms-progress-bar-wrap { flex:1; position:relative; height:24px; display:flex; align-items:center; }
      #music-root input[type="range"] { -webkit-appearance:none; width:100%; background:transparent; height:100%; position:absolute; z-index:3; margin:0; outline:none; }
      #music-root input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; background:#fff; border-radius:50%; box-shadow:0 0 10px rgba(255,255,255,1); cursor:pointer; }
      #music-root input[type="range"]:active::-webkit-slider-thumb { transform:scale(1.3); }
      #music-root .ms-progress-track { position:absolute; width:100%; height:3px; background:rgba(255,255,255,0.1); border-radius:2px; z-index:1; }
      #music-root .ms-progress-fill { position:absolute; height:3px; border-radius:2px; z-index:2; width:0%; background:linear-gradient(90deg,rgba(255,255,255,0.3) 0%,rgba(255,255,255,1) 50%,rgba(255,255,255,0.3) 100%); background-size:200% 100%; box-shadow:0 0 8px rgba(255,255,255,0.6); animation:ms-flowLight 2s linear infinite; }

      /* 控制按钮 */
      #music-root .ms-fp-controls { display:flex; align-items:center; justify-content:space-between; padding:0 10px 30px; }
      #music-root .ms-ctrl-icon { font-size:1.6rem; color:var(--ms-text-sub); cursor:pointer; transition:all 0.2s; padding:10px; }
      #music-root .ms-ctrl-icon:active { color:var(--ms-text-main); transform:scale(0.9); }
      #music-root .ms-ctrl-icon.active { color:var(--ms-text-main); text-shadow:0 0 10px rgba(255,255,255,0.5); }
      #music-root .ms-ctrl-main { display:flex; align-items:center; gap:20px; }
      #music-root .ms-ctrl-play { font-size:3.8rem; color:var(--ms-text-main); text-shadow:0 0 20px rgba(255,255,255,0.2); }
      #music-root .ms-ctrl-step { font-size:2.5rem; color:var(--ms-text-main); }

      /* 动画 */
      @keyframes ms-rotateCover { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes ms-fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes ms-fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes ms-flowLight { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
      #music-root .ms-fade-in { animation:ms-fadeIn 0.6s ease forwards; opacity:0; }

      /* ── 歌曲操作按钮 ── */
      #music-root .ms-song-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
      #music-root .ms-lrc-badge { font-size:0.55rem; padding:2px 5px; border:1px solid rgba(255,255,255,0.25); border-radius:3px; color:rgba(180,220,180,0.8); font-family:var(--ms-font-en); cursor:pointer; letter-spacing:1px; transition:all 0.2s; }
      #music-root .ms-lrc-badge:active { color:#ff6b6b; border-color:#ff6b6b; }
      #music-root .ms-song-del { font-size:1.1rem; color:rgba(255,255,255,0.2); cursor:pointer; padding:4px; transition:color 0.2s; }
      #music-root .ms-song-del:active { color:#ff6b6b; }
      /* ── 待上传列表匹配标签 ── */
      #music-root .ms-lrc-match { font-size:0.65rem; color:rgba(120,200,120,0.9); font-family:var(--ms-font-en); letter-spacing:0.5px; white-space:nowrap; }
      #music-root .ms-lrc-match.unmatched { color:rgba(255,140,100,0.8); }

      /* =========================================
         桌面悬浮播放器皮肤样式 (全局)
         ========================================= */
      #ms-floating-widget { position: fixed; z-index: 9999; top: 100px; left: 50%; transform: translateX(-50%); cursor: grab; user-select: none; touch-action: none; transition: transform 0.1s; }
      #ms-floating-widget:active { cursor: grabbing; }
      #ms-floating-widget.dragging { transform: translateX(-50%) scale(0.97) rotate(-1deg); }
      
      .ms-player-card { position: relative; box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
      .ms-player-card .p-btn { background: none; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: opacity 0.2s, transform 0.1s; }
      .ms-player-card .p-btn:active { transform: scale(0.85); }
      .ms-player-card .close-btn { position: absolute; z-index: 10; }

      /* 风格 A: The Wash Label (修复版) */
.ms-style-label { width: 260px; background: #FDFDFB; color: #1A1A1A; padding: 25px 20px; border-radius: 1px; }
.ms-style-label::before { content: ''; position: absolute; top: 6px; left: 6px; right: 6px; bottom: 6px; border: 1px dashed #D0D0D0; pointer-events: none; }
.ms-style-label .close-btn { top: 12px; right: 12px; font-size: 14px; color: #999; }
.ms-style-label .margiela-numbers { font-family: 'Space Grotesk', sans-serif; font-size: 11px; letter-spacing: 3px; text-align: center; color: #B0B0B0; margin-bottom: 25px; line-height: 1.8; }
.ms-style-label .margiela-numbers span.active { display: inline-flex; justify-content: center; align-items: center; width: 16px; height: 16px; border: 1px solid #1A1A1A; border-radius: 50%; color: #1A1A1A; transform: translateY(1px); }
.ms-style-label .song-title { font-family: 'Bodoni Moda', serif; font-size: 18px; text-align: center; margin-bottom: 25px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ms-style-label .controls { display: flex; justify-content: center; gap: 30px; position: relative; z-index: 2; }
.ms-style-label .p-btn { font-size: 20px; color: #1A1A1A; }

      /* 风格 B: Thermal Receipt */
      .ms-style-receipt { width: 240px; background: #FDF1F5; color: #2B2829; padding: 30px 20px 20px 20px; mask-image: radial-gradient(circle at 4px 0px, transparent 4px, black 4.5px); mask-size: 12px 100%; mask-position: top; -webkit-mask-image: radial-gradient(circle at 4px 0px, transparent 4px, black 4.5px); -webkit-mask-size: 12px 100%; -webkit-mask-position: top; }
      .ms-style-receipt .close-btn { top: 15px; right: 15px; font-size: 16px; }
      .ms-style-receipt .receipt-header { font-family: 'Courier Prime', monospace; font-size: 10px; text-align: center; text-transform: uppercase; border-bottom: 1px dashed #CFAEB8; padding-bottom: 15px; margin-bottom: 20px; }
      .ms-style-receipt .barcode { width: 100%; height: 40px; margin-bottom: 15px; opacity: 0.8; background: repeating-linear-gradient(to right, #2B2829, #2B2829 2px, transparent 2px, transparent 4px, #2B2829 4px, #2B2829 5px, transparent 5px, transparent 8px, #2B2829 8px, #2B2829 12px, transparent 12px, transparent 14px); }
      .ms-style-receipt .song-title { font-family: 'Courier Prime', monospace; font-size: 15px; font-weight: bold; text-align: center; margin-bottom: 20px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ms-style-receipt .controls { display: flex; justify-content: space-between; padding: 0 10px; }
      .ms-style-receipt .p-btn { font-size: 24px; color: #2B2829; }

      /* 风格 C: Y2K Chrome */
      .ms-style-chrome { width: 270px; background: linear-gradient(135deg, #E6E6E6 0%, #FFFFFF 20%, #B3B3B3 50%, #E6E6E6 80%, #8C8C8C 100%); border-radius: 8px; padding: 20px; box-shadow: inset 2px 2px 3px rgba(255,255,255,0.8), inset -2px -2px 5px rgba(0,0,0,0.3); border: 1px solid #A0A0A0; }
      .ms-style-chrome .close-btn { top: 5px; right: 25px; font-size: 14px; color: #555; text-shadow: 1px 1px 0 #fff; }
      .ms-style-chrome .lcd-screen { background: #8FA491; border: 2px solid #5A6A5C; box-shadow: inset 2px 2px 5px rgba(0,0,0,0.5), 1px 1px 0 rgba(255,255,255,0.8); padding: 15px; text-align: center; margin-bottom: 20px; border-radius: 3px; position: relative; }
      .ms-style-chrome .song-title { font-family: 'VT323', monospace; font-size: 20px; color: #111; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ms-style-chrome .controls { display: flex; justify-content: space-around; background: #D0D0D0; padding: 10px; border-radius: 40px; box-shadow: inset 1px 1px 4px rgba(0,0,0,0.3), 1px 1px 2px #fff; }
      .ms-style-chrome .p-btn { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(180deg, #F0F0F0, #B0B0B0); box-shadow: 2px 2px 5px rgba(0,0,0,0.4), inset 1px 1px 2px #fff; font-size: 18px; color: #222; border: 1px solid #999; }

      /* 风格 D: Cassette (修复版) */
.ms-style-cassette { width: 290px; height: 160px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 12px; color: #fff; padding: 15px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
.ms-style-cassette .close-btn { top: 12px; right: 12px; font-size: 16px; opacity: 0.6; color: #fff; }
.ms-style-cassette .tape-reels { display: flex; justify-content: space-between; padding: 0 40px; position: absolute; top: 45px; left: 0; width: 100%; pointer-events: none; }
.ms-style-cassette .reel { width: 50px; height: 50px; border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; background: repeating-conic-gradient(from 0deg, transparent 0deg 30deg, rgba(255,255,255,0.15) 30deg 60deg); }
.ms-style-cassette.spinning .reel { animation: ms-rotateCover 2.5s linear infinite; }
.ms-style-cassette .reel::after { content: ''; width: 12px; height: 12px; background: rgba(255,255,255,0.6); border-radius: 50%; }
.ms-style-cassette .center-window { position: absolute; top: 50px; left: 50%; transform: translateX(-50%); width: 100px; height: 40px; background: rgba(0,0,0,0.4); border-radius: 4px; box-shadow: inset 0 0 12px rgba(0,0,0,0.8); pointer-events:none; }
.ms-style-cassette .song-title { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 600; background: rgba(0,0,0,0.5); padding: 4px 12px; border-radius: 20px; text-align: center; margin: 0 auto; width: max-content; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative; z-index: 2;}
.ms-style-cassette .controls { display: flex; justify-content: center; gap: 20px; position: relative; z-index: 2; background: rgba(0,0,0,0.3); padding: 6px 15px; border-radius: 30px; margin: 0 auto; width: max-content; border: 1px solid rgba(255,255,255,0.1); }
.ms-style-cassette .p-btn { font-size: 18px; color: #fff; }

      /* 风格 E: Hangtag */
      .ms-style-hangtag { width: 170px; background: #ECEAE4; color: #1A1A1A; padding: 65px 20px 20px 20px; border-radius: 2px; }
      .ms-style-hangtag .hangtag-string { position: absolute; top: -45px; left: 50%; transform: translateX(-50%); width: 20px; height: 60px; border: 2px solid #222; border-bottom: none; border-radius: 10px 10px 0 0; z-index: -1; pointer-events: none; }
      .ms-style-hangtag::before { content: ''; position: absolute; top: 15px; left: 50%; transform: translateX(-50%); width: 16px; height: 16px; border-radius: 50%; background: #111; border: 3px solid #C5C2BA; box-shadow: inset 1px 1px 5px rgba(0,0,0,0.9); z-index: 2; }
      .ms-style-hangtag .close-btn { top: -15px; right: -15px; font-size: 14px; color: #000; background: #fff; width: 24px; height: 24px; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
      .ms-style-hangtag .brand-name { font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 600; text-align: center; margin-bottom: 5px; }
      .ms-style-hangtag .song-title { font-family: 'Bodoni Moda', serif; font-size: 18px; font-style: italic; text-align: center; margin: 15px 0 20px; line-height: 1.1; word-wrap: break-word; }
      .ms-style-hangtag .mini-barcode { width: 100%; height: 15px; background: repeating-linear-gradient(to right, #1A1A1A, #1A1A1A 2px, transparent 2px, transparent 3px, #1A1A1A 3px, #1A1A1A 4px, transparent 4px, transparent 6px, #1A1A1A 6px, #1A1A1A 8px, transparent 8px, transparent 9px); margin-bottom: 25px; opacity: 0.8; }
      .ms-style-hangtag .controls { display: flex; justify-content: space-between; align-items: center; padding: 0 5px; }
      .ms-style-hangtag .p-btn { font-size: 20px; color: #1A1A1A; }
      
      /* UI 选择页 - 专属展示台背景 */
      #ms-ui-view .ms-ui-grid { display: flex; flex-direction: column; gap: 30px; padding: 20px 25px 60px; align-items: center; }
      
      .ms-ui-preview-card { 
        position: relative; 
        transform: scale(0.85); 
        transform-origin: center center; 
        transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1); 
        opacity: 0.5; 
        cursor: pointer; 
        
        /* 核心：添加深灰网格展示台背景 */
        width: 100%; 
        max-width: 360px; 
        min-height: 240px; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        background: linear-gradient(135deg, #1c1c1e 0%, #121214 100%);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px;
        box-shadow: inset 0 0 30px rgba(0,0,0,0.8);
        overflow: hidden;
      }
      
      /* 给展示台加一点网格底纹，让亚克力材质透底更清晰 */
      .ms-ui-preview-card::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
        background-size: 14px 14px;
        pointer-events: none;
      }

      .ms-ui-preview-card.active { 
        transform: scale(1); 
        opacity: 1; 
        border-color: rgba(255,255,255,0.25);
        box-shadow: 0 20px 40px rgba(0,0,0,0.6), inset 0 0 30px rgba(0,0,0,0.8);
        z-index: 10; 
      }
      
      .ms-ui-preview-card .ms-player-card { pointer-events: none; z-index: 2; }
    `;
    document.head.appendChild(style);
  };

  // ── 注入 HTML ──
  const _injectHTML = () => {
    if (document.getElementById('music-root')) return;
    const root = document.createElement('div');
    root.id = 'music-root';
    root.innerHTML = `
      <div id="ms-noise"></div>
      <div id="ms-canvas"></div>
      
      <audio id="ms-audio" preload="metadata" style="display:none"></audio>
      <input type="file" id="ms-file-img" accept="image/*" style="display:none">
      <input type="file" id="ms-file-music" multiple style="display:none">
      <input type="file" id="ms-file-lrc" multiple style="display:none">

      <!-- 本地 Hub -->
      <div id="ms-local-view" class="ms-view active">
        <div class="ms-local-top-bar">
          <div class="ms-title-en" style="font-size:1.5rem;letter-spacing:3px;">Moon</div>
          <div class="ms-top-bar-actions">
            
            <!-- 收纳下拉菜单 -->
            <div class="ms-dropdown-wrap" id="ms-local-dropdown">
              <div class="ms-menu-trigger" id="ms-menu-trigger" title="操作">
                <i class="ph ph-dots-three"></i>
              </div>
              <div class="ms-dropdown-menu" id="ms-dropdown-menu">
                <div class="ms-dropdown-item" id="ms-btn-create-pl">
                  <i class="ph ph-folder-plus"></i> 歌单
                </div>
                <div class="ms-dropdown-item" id="ms-btn-go-api">
                  <i class="ph ph-cloud-sun"></i> 云端
                </div>
                <div class="ms-dropdown-item" id="ms-btn-go-ui">
                  <i class="ph ph-palette"></i> 皮肤
                </div>
              </div>
            </div>

            <!-- BACK 按钮 -->
            <div class="ms-text-back-btn" id="ms-btn-exit" title="关闭模块">BACK</div>

          </div>
        </div>
        <div class="ms-local-page-title ms-fade-in">
          <h2>LOCAL<br>SPACE</h2>
          <p>独立星空 • 你的私人音乐库</p>
        </div>
        <div id="ms-local-pl-render" class="ms-fade-in" style="animation-delay:0.1s;"></div>
      </div>

      <!-- API 连接页 -->
      <div id="ms-api-login-view" class="ms-view">
        <div class="ms-header">
          <i class="ph ph-caret-left ms-back-btn" id="ms-btn-api-back"></i>
        </div>
        <div class="ms-api-login-box">
          <i class="ph ph-planet" style="font-size:3.5rem;color:var(--ms-text-sub);margin-bottom:20px;"></i>
          <h2 class="ms-title-en" style="margin-bottom:10px;font-size:1.8rem;">CLOUD CONNECT</h2>
          <p class="ms-text-light" style="margin-bottom:20px;">连接网易云，同步你的音乐宇宙</p>
          <div class="ms-api-input-wrap">
            <i class="ph ph-globe"></i>
            <input type="text" id="ms-api-url-input" placeholder="输入 API 地址，如 https://api.xxx.com" value="">
          </div>
          <button class="ms-btn-ghost" style="width:100%;padding:15px;font-size:1.05rem;" id="ms-btn-connect-api">确 认 连 接</button>
          <div id="ms-btn-api-guide" style="margin-top:20px; color:var(--ms-text-sub); text-decoration:underline; cursor:pointer; font-size:0.85rem; letter-spacing:1px;">如何部署 API ？</div>
        </div>
      </div>

      <!-- 账号登录页 -->
      <div id="ms-login-view" class="ms-view">
        <div class="ms-header">
          <i class="ph ph-caret-left ms-back-btn" id="ms-btn-login-back"></i>
        </div>
        <div style="display:flex;flex-direction:column;justify-content:center;padding:0 30px;height:75vh;">
          <div class="ms-title-en" style="margin-bottom:50px;font-size:2.5rem;text-shadow:0 0 20px rgba(255,255,255,0.2);text-align:center;">Moon<br>Story</div>
          <div class="ms-login-tabs">
            <div class="ms-login-tab active" data-tab="qr">扫码登录</div>
            <div class="ms-login-tab" data-tab="pwd">密码登录</div>
            <div class="ms-login-tab" data-tab="code">验证码</div>
          </div>
          <div id="ms-login-qr" class="ms-login-panel active">
            <div class="ms-qr-box">
              <img id="ms-qr-img" style="width:85%;height:85%;display:block;" src="" alt="">
              <div id="ms-qr-loading" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);border-radius:15px;display:flex;align-items:center;justify-content:center;">
                <i class="ph ph-spinner" style="font-size:24px;color:#fff;animation:ms-spin 1s linear infinite;"></i>
              </div>
            </div>
            <p class="ms-text-light" id="ms-qr-status" style="letter-spacing:1px;">等待扫码</p>
            <button class="ms-btn-ghost" style="padding:8px 20px;font-size:0.8rem;" id="ms-btn-refresh-qr">刷新二维码</button>
          </div>
          <div id="ms-login-pwd" class="ms-login-panel">
            <input type="text" id="ms-pwd-phone" placeholder="输入手机号">
            <input type="password" id="ms-pwd-pass" placeholder="输入密码">
            <button class="ms-btn-ghost" style="width:100%;margin-top:20px;" id="ms-btn-pwd-login">登 录</button>
          </div>
          <div id="ms-login-code" class="ms-login-panel">
            <input type="text" id="ms-code-phone" placeholder="输入手机号">
            <div style="display:flex;width:100%;gap:15px;align-items:flex-end;">
              <input type="text" id="ms-code-val" placeholder="验证码" style="flex:1;">
              <button class="ms-btn-ghost" style="padding:10px 15px;font-size:0.8rem;white-space:nowrap;border-radius:10px;" id="ms-btn-send-code">获取</button>
            </div>
            <button class="ms-btn-ghost" style="width:100%;margin-top:20px;" id="ms-btn-code-login">登 录</button>
          </div>
        </div>
      </div>

      <!-- 主页 -->
      <div id="ms-home-view" class="ms-view">
        <div class="ms-user-profile">
          <div class="ms-user-info">
            <div class="ms-avatar" id="ms-user-avatar"></div>
            <div>
              <div class="ms-text-light" style="font-size:0.65rem;letter-spacing:1px;">CLOUD CONNECTED</div>
              <div class="ms-greeting ms-title-en" style="font-size:1.1rem;" id="ms-user-name">—</div>
            </div>
          </div>
          <div class="ms-header-actions">
            <i class="ph ph-planet ms-icon-btn" id="ms-btn-logout" title="返回本地空间"></i>
          </div>
        </div>
        <div class="ms-home-grid">
          <div class="ms-grid-card ms-card-main" id="ms-card-playlist" style="background-image:url('https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=600&q=80');">
            <div class="ms-card-overlay"></div>
            <div class="ms-card-content">
              <i class="ph ph-vinyl-record ms-card-icon-top"></i>
              <div class="ms-card-text">
                <div class="ms-card-title-en">MY PLAYLISTS</div>
                <div class="ms-card-title-zh">我的歌单</div>
              </div>
            </div>
          </div>
          <div class="ms-card-sub-group">
            <div class="ms-grid-card ms-card-sub" id="ms-card-daily" style="background-image:url('https://images.unsplash.com/photo-1532767153582-b1a0e5145009?auto=format&fit=crop&w=600&q=80');">
              <div class="ms-card-overlay"></div>
              <div class="ms-card-content">
                <i class="ph ph-moon ms-card-icon-top"></i>
                <div class="ms-card-text">
                  <div class="ms-card-title-en">DAILY<br>ECHO</div>
                  <div class="ms-card-title-zh">每日推荐</div>
                </div>
              </div>
            </div>
            <div class="ms-grid-card ms-card-sub" id="ms-card-search" style="background-image:url('https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&w=600&q=80');">
              <div class="ms-card-overlay"></div>
              <div class="ms-card-content">
                <i class="ph ph-magnifying-glass ms-card-icon-top"></i>
                <div class="ms-card-text">
                  <div class="ms-card-title-en">SEEK<br>STARS</div>
                  <div class="ms-card-title-zh">搜索</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 皮肤选择页 -->
      <div id="ms-ui-view" class="ms-view">
        <div class="ms-header">
          <i class="ph ph-caret-left ms-back-btn" id="ms-btn-ui-back"></i>
          <span class="ms-title-en" style="font-size:1.2rem;">Skins</span>
          <div style="font-family:var(--ms-font-en);font-size:0.8rem;cursor:pointer;" id="ms-btn-apply-ui">APPLY</div>
        </div>
        <div style="text-align:center; color:var(--ms-text-sub); font-size:0.8rem; margin-bottom:20px;">退出音乐模块后，播放器将悬浮于桌面</div>
        <div class="ms-ui-grid" id="ms-ui-grid">
          <!-- A -->
<div class="ms-ui-preview-card" data-skin="label">
  <div class="ms-player-card ms-style-label">
    <!-- 还原了 margiela-numbers 的完整三行 -->
    <div class="margiela-numbers">
      0 1 2 3 4 5 6 7 8 9<br>
      10 11 12 13 14 15 16<br>
      17 18 19 <span class="active">20</span> 21 22 23
    </div>
    <div class="song-title">The Wash Label</div>
    <div class="controls">
      <div class="p-btn"><i class="ph-light ph-skip-back"></i></div>
      <div class="p-btn"><i class="ph-light ph-play"></i></div>
      <div class="p-btn"><i class="ph-light ph-skip-forward"></i></div>
    </div>
  </div>
</div>
          <!-- B -->
          <div class="ms-ui-preview-card" data-skin="receipt">
            <div class="ms-player-card ms-style-receipt">
              <div class="receipt-header">Chill OS Player</div>
              <div class="barcode"></div>
              <div class="song-title">Thermal Receipt</div>
              <div class="controls">
                <div class="p-btn"><i class="ph ph-arrow-left"></i></div>
                <div class="p-btn"><i class="ph ph-play"></i></div>
                <div class="p-btn"><i class="ph ph-arrow-right"></i></div>
              </div>
            </div>
          </div>
          <!-- C -->
          <div class="ms-ui-preview-card" data-skin="chrome">
            <div class="ms-player-card ms-style-chrome">
              <div class="lcd-screen"><div class="song-title">Y2K Chrome</div></div>
              <div class="controls">
                <div class="p-btn"><i class="ph-fill ph-rewind"></i></div>
                <div class="p-btn"><i class="ph-fill ph-play"></i></div>
                <div class="p-btn"><i class="ph-fill ph-fast-forward"></i></div>
              </div>
            </div>
          </div>
          <!-- D -->
          <div class="ms-ui-preview-card" data-skin="cassette">
            <div class="ms-player-card ms-style-cassette">
              <div class="tape-reels"><div class="reel"></div><div class="reel"></div></div>
              <div class="center-window"></div>
              <div class="song-info"><div class="song-title">Cassette</div></div>
              <div class="controls">
                <div class="p-btn"><i class="ph-fill ph-caret-left"></i></div>
                <div class="p-btn"><i class="ph-fill ph-play"></i></div>
                <div class="p-btn"><i class="ph-fill ph-caret-right"></i></div>
              </div>
            </div>
          </div>
          <!-- E -->
          <div class="ms-ui-preview-card" data-skin="hangtag">
            <div class="ms-player-card ms-style-hangtag">
              <div class="hangtag-string"></div>
              <div class="brand-info"><div class="brand-name">ARTICLE</div></div>
              <div class="song-title">The Hangtag</div>
              <div class="mini-barcode"></div>
              <div class="controls">
                <div class="p-btn"><i class="ph ph-skip-back"></i></div>
                <div class="p-btn"><i class="ph ph-play"></i></div>
                <div class="p-btn"><i class="ph ph-skip-forward"></i></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 歌单列表页 -->
      <div id="ms-playlists-view" class="ms-view">
        <div class="ms-header">
          <i class="ph ph-caret-left ms-back-btn" id="ms-btn-pl-back"></i>
          <span class="ms-title-en" style="font-size:1.2rem;">Playlists</span>
          <div style="width:24px;"></div>
        </div>
        <div class="ms-pl-list" id="ms-pl-list-render"></div>
      </div>

      <!-- 歌曲列表页 -->
      <div id="ms-songlist-view" class="ms-view">
        <div class="ms-sl-header" id="ms-sl-header-bg">
          <div class="ms-sl-top-bar">
            <i class="ph ph-caret-left ms-back-btn" id="ms-btn-sl-back" style="text-shadow:0 2px 4px rgba(0,0,0,0.8);"></i>
            <i class="ph ph-upload-simple ms-icon-btn" id="ms-sl-upload-btn" style="text-shadow:0 2px 4px rgba(0,0,0,0.8);display:none;"></i>
          </div>
          <div class="ms-sl-title-box">
            <h2 class="ms-sl-title" id="ms-sl-title">标题</h2>
            <div class="ms-text-light" id="ms-sl-desc" style="color:rgba(255,255,255,0.7);">描述</div>
          </div>
        </div>
        <div class="ms-song-list" id="ms-song-list-render"></div>
      </div>

      <!-- 搜索页 -->
      <div id="ms-search-view" class="ms-view">
        <div class="ms-header">
          <i class="ph ph-caret-left ms-back-btn" id="ms-btn-search-back"></i>
          <span class="ms-title-en" style="font-size:1.2rem;">Search</span>
          <div style="width:24px;"></div>
        </div>
        <div class="ms-search-box">
          <i class="ph ph-magnifying-glass ms-search-icon"></i>
          <input type="text" id="ms-search-input" placeholder="输入歌名或歌手...">
        </div>
        <div class="ms-song-list" id="ms-search-results"></div>
      </div>

      <!-- 迷你播放器 -->
      <div id="ms-mini-player">
        <div class="ms-mp-cover" id="ms-mp-cover"></div>
        <div class="ms-mp-info">
          <div class="ms-mp-title" id="ms-mp-title">未播放</div>
          <div class="ms-mp-artist" id="ms-mp-artist">—</div>
        </div>
        <div class="ms-mp-controls" id="ms-mp-controls">
          <i class="ph ph-skip-back-circle ms-mp-btn" id="ms-mp-prev"></i>
          <i class="ph ph-play-circle ms-mp-btn play-pause" id="ms-mp-play"></i>
          <i class="ph ph-skip-forward-circle ms-mp-btn" id="ms-mp-next"></i>
        </div>
      </div>

      <!-- 全屏播放器 -->
      <div id="ms-full-player">
        <div class="ms-fp-header">
          <i class="ph ph-caret-down ms-ctrl-icon" id="ms-fp-close"></i>
          <div class="ms-fp-title-area">
            <div class="ms-fp-source">PLAYING NOW</div>
            <div class="ms-text-light" id="ms-fp-pl-name" style="font-size:0.8rem;color:#fff;"></div>
          </div>
          <i class="ph ph-dots-three ms-ctrl-icon" style="opacity:0;pointer-events:none;"></i>
        </div>
        <div class="ms-fp-art-wrap">
          <div class="ms-fp-art" id="ms-fp-art"></div>
        </div>
        <div class="ms-fp-info">
          <div class="ms-fp-song-title" id="ms-fp-title">Title</div>
          <div class="ms-fp-song-artist" id="ms-fp-artist">Artist</div>
        </div>
        <div class="ms-fp-lyrics">
          <div class="ms-lyric-scroll" id="ms-lyric-scroll">
            <div class="ms-lyric-line active">纯音乐</div>
          </div>
        </div>
        <div class="ms-progress-wrap">
          <span id="ms-time-current">00:00</span>
          <div class="ms-progress-bar-wrap">
            <div class="ms-progress-track"></div>
            <div class="ms-progress-fill" id="ms-progress-fill"></div>
            <input type="range" id="ms-progress-bar" value="0" min="0" max="100" step="0.1">
          </div>
          <span id="ms-time-total">00:00</span>
        </div>
        <div class="ms-fp-controls">
          <i class="ph ph-repeat ms-ctrl-icon" id="ms-mode-btn"></i>
          <div class="ms-ctrl-main">
            <i class="ph ph-skip-back-circle ms-ctrl-icon ms-ctrl-step" id="ms-fp-prev"></i>
            <i class="ph ph-play-circle ms-ctrl-icon ms-ctrl-play" id="ms-fp-play"></i>
            <i class="ph ph-skip-forward-circle ms-ctrl-icon ms-ctrl-step" id="ms-fp-next"></i>
          </div>
          <i class="ph ph-list ms-ctrl-icon" id="ms-fp-to-list"></i>
        </div>
      </div>

      <!-- 新建歌单弹窗 -->
      <div class="ms-modal-overlay" id="ms-modal-create-pl">
        <div class="ms-modal-content">
          <h3 class="ms-modal-title ms-title-en" style="font-size:1.2rem;">NEW STORY</h3>
          <div class="ms-upload-area" id="ms-new-pl-cover" style="background-size:cover;background-position:center;height:120px;display:flex;align-items:center;justify-content:center;">
            <span><i class="ph ph-camera"></i> 点击上传封面</span>
          </div>
          <input type="text" id="ms-new-pl-name" placeholder="为这段故事命名">
          <div class="ms-modal-actions">
            <button class="ms-modal-btn" id="ms-btn-cancel-create" style="border-color:transparent;color:var(--ms-text-sub);">取消</button>
            <button class="ms-modal-btn" id="ms-btn-confirm-create">创 建</button>
          </div>
        </div>
      </div>

      <!-- API 教程弹窗 -->
      <div class="ms-modal-overlay" id="ms-modal-api-guide">
        <div class="ms-modal-content" style="max-height:80vh; overflow-y:auto; padding: 30px 25px;">
          <h3 class="ms-modal-title ms-title-en" style="font-size:1.1rem; margin-bottom: 20px;">API GUIDE</h3>
          <div class="ms-text-light" style="font-size:0.9rem; line-height:1.6; text-align:left;">
            <p style="margin-bottom:12px; color:#fff;">本模块需要接入 NeteaseCloudMusicApi 才能访问云端数据，请自行部署以保证数据安全。</p>
            <p style="margin-bottom:8px; font-weight: 400; color:#d4d4d8;"><b>方法一：Vercel 一键部署（免费）</b></p>
            <ol style="margin-bottom:15px; padding-left:20px;">
              <li>在 GitHub 搜索 <code>NeteaseCloudMusicApi</code> 并 Fork 该项目。</li>
              <li>登录 Vercel，Import 刚才 Fork 的仓库并部署。</li>
              <li>部署完成后，将生成的域名（如 <code>https://api-xxx.vercel.app</code>）填入上个页面的输入框。</li>
            </ol>
            <p style="margin-bottom:8px; font-weight: 400; color:#d4d4d8;"><b>方法二：服务器部署</b></p>
            <ol style="padding-left:20px;">
              <li>在服务器 <code>git clone</code> 该项目。</li>
              <li>运行 <code>npm install</code> 与 <code>node app.js</code>。</li>
              <li>建议使用 Nginx 反向代理并配置 HTTPS。</li>
            </ol>
          </div>
          <div class="ms-modal-actions" style="justify-content:center; margin-top:20px;">
            <button class="ms-modal-btn" id="ms-btn-close-guide" style="width: 100%;">我知道了</button>
          </div>
        </div>
      </div>

      <!-- 上传工作台 -->
      <div class="ms-modal-overlay" id="ms-modal-upload">
        <div class="ms-action-sheet">
          <div style="width:40px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;margin:0 auto 20px;"></div>
          <div style="text-align:center;font-family:var(--ms-font-en);letter-spacing:2px;font-size:1.1rem;margin-bottom:15px;">UPLOAD CENTER</div>
          <div style="display:flex;gap:10px;margin-bottom:10px;">
            <div class="ms-sheet-btn" id="ms-btn-add-music"><i class="ph ph-music-notes-plus" style="font-size:1.2rem;"></i> 添加音乐</div>
            <div class="ms-sheet-btn" id="ms-btn-add-lrc"><i class="ph ph-text-aa" style="font-size:1.2rem;"></i> 导入歌词</div>
          </div>
          <div class="ms-sheet-btn" id="ms-btn-add-url" style="margin-bottom:10px;"><i class="ph ph-link" style="font-size:1.2rem;"></i> 添加音乐链接</div>
          <div id="ms-url-input-panel" style="display:none;background:rgba(0,0,0,0.3);border-radius:10px;padding:15px;border:1px solid rgba(255,255,255,0.06);margin-bottom:10px;">
            <input type="text" id="ms-url-audio-url" placeholder="音乐直链（mp3 / m4a / flac / ogg…）" style="font-size:0.9rem;">
            <input type="text" id="ms-url-audio-name" placeholder="歌曲名称（留空则自动从链接提取）" style="margin-top:12px;font-size:0.9rem;">
            <div id="ms-btn-url-confirm" style="width:100%;margin-top:14px;padding:10px;border-radius:20px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.04);color:#fff;cursor:pointer;font-size:0.88rem;letter-spacing:2px;text-align:center;">添 加</div>
          </div>
          <div id="ms-pending-list"></div>
          <button class="ms-sheet-confirm" id="ms-btn-confirm-upload">确 认 上 传</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
  };

  // ── 状态 ──
  let _apiBase = '';
  let _cookie = '';
  let _isLoggedIn = false;
  let _userProfile = null;
  let _qrKey = '';
  let _qrTimer = null;
  
  let _viewStack =[]; // 页面栈管理
  let _initialized = false;
  let _dbReady = false; // DB 初始化标志

  // 歌词状态
  let _lyrics =[]; 
  let _currentLyricIdx = -1;

  const _DEFAULT_COVER = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=600&q=80';

  let _localPlaylists =[
    { id: 'l1', name: '默认漫游指南', titleEn: 'DEFAULT', count: 0, cover: _DEFAULT_COVER, songs: [], isLocal: true }
  ];
  let _currentPlaylistObj = null;
  let _currentPlaylist =[];
  let _currentIdx = -1;
  let _isPlaying = false;
  let _playMode = 0; // 0 顺序 1 随机 2 单曲循环
  let _isDragging = false;
  let _contextIsLocal = true;
  let _pendingFiles =[];
  let _uploadImgTargetId = null;
  let _tempCover = '';
  const _playModeIcons = ['ph-repeat', 'ph-shuffle', 'ph-repeat-once'];
  
  let _activeSkin = localStorage.getItem('ms_active_skin') || null;
  let _floatingWidget = null; // 挂载在主页 body 上的悬浮窗实例

  // 本地音频 Blob URL 缓存（key=songId, val=blobUrl）
  const _blobCache = new Map();

  // DOM 快捷访问
  const _$ = id => document.getElementById(id);

  // ================================================================
  // DB 持久化辅助
  // ================================================================
  async function _ensureDB() {
    if (_dbReady) return;
    await MusicDB.init();
    _dbReady = true;
  }

  async function _loadPlaylistsFromDB() {
    try {
      await _ensureDB();
      const rows = await MusicDB.getAll('playlists');
      if (rows && rows.length > 0) _localPlaylists = rows;
    } catch(e) { console.warn('[MusicModule] 读取歌单失败:', e); }
  }

  async function _savePlaylistToDB(pl) {
    try {
      await _ensureDB();
      // 存储时排除 session-only 的 blob url
      const meta = { ...pl, songs: (pl.songs || []).map(s => { if (s.isUrl) return { ...s }; const {url,...r}=s; return r; }) };
      await MusicDB.put('playlists', meta);
    } catch(e) { console.warn('[MusicModule] 保存歌单失败:', e); }
  }

  async function _getLocalPlaybackUrl(song) {
    if (_blobCache.has(song.id)) return _blobCache.get(song.id);
    try {
      const data = await MusicDB.get('audio', song.id);
      if (data && data.data) {
        const blob = new Blob([data.data], { type: data.mimeType || 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        _blobCache.set(song.id, url);
        return url;
      }
    } catch(e) { console.warn('[MusicModule] 加载本地音频失败:', e); }
    return null;
  }

  async function _deleteSong(songId) {
    if (!_currentPlaylistObj) return;
    _currentPlaylistObj.songs = _currentPlaylistObj.songs.filter(s => s.id !== songId);
    _currentPlaylistObj.count = _currentPlaylistObj.songs.length;
    try { await MusicDB.del('audio', songId); } catch(e) {}
    try { await MusicDB.del('lyrics', `lrc_${songId}`); } catch(e) {}
    if (_blobCache.has(songId)) { URL.revokeObjectURL(_blobCache.get(songId)); _blobCache.delete(songId); }
    await _savePlaylistToDB(_currentPlaylistObj);
    _renderLocalPlaylists();
    _renderSongList(_currentPlaylistObj.songs, _$('ms-song-list-render'));
    if (typeof Toast !== 'undefined') Toast.show('已删除');
  }

  async function _deleteSongLrc(songId) {
    if (!_currentPlaylistObj) return;
    const song = _currentPlaylistObj.songs.find(s => s.id === songId);
    if (!song) return;
    try { await MusicDB.del('lyrics', song.lrcId || `lrc_${songId}`); } catch(e) {}
    song.hasLrc = false; song.lrcId = null;
    if (_currentIdx >= 0 && _currentPlaylist[_currentIdx]?.id === songId) {
      _lyrics = []; _renderLyricsDOM();
    }
    await _savePlaylistToDB(_currentPlaylistObj);
    _renderSongList(_currentPlaylistObj.songs, _$('ms-song-list-render'));
    if (typeof Toast !== 'undefined') Toast.show('歌词已删除');
  }

  async function _deletePlaylist(pl) {
    // 级联删除：清理歌单内所有歌曲的音频和歌词
    for (const song of (pl.songs || [])) {
      try { await MusicDB.del('audio', song.id); } catch(e) {}
      try { await MusicDB.del('lyrics', song.lrcId || `lrc_${song.id}`); } catch(e) {}
      if (_blobCache.has(song.id)) { URL.revokeObjectURL(_blobCache.get(song.id)); _blobCache.delete(song.id); }
    }
    // 从 IndexedDB 删除歌单记录
    try { await MusicDB.del('playlists', pl.id); } catch(e) { console.warn('[MusicModule] 删除歌单记录失败:', e); }
    // 从内存数组移除
    _localPlaylists = _localPlaylists.filter(p => p.id !== pl.id);
    // 如果当前正在播放该歌单里的歌，停止播放
    if (_currentPlaylistObj?.id === pl.id) {
      const audio = _$('ms-audio');
      if (audio) { audio.pause(); audio.src = ''; }
      _isPlaying = false;
      _currentPlaylist = [];
      _currentPlaylistObj = null;
      _currentIdx = -1;
      _updatePlayUI();
    }
    _renderLocalPlaylists();
    if (typeof Toast !== 'undefined') Toast.show('歌单已删除');
  }

  // ================================================================
  // 智能 LRC 文件名匹配
  // ================================================================
  function _normalizeName(name) {
    return (name || '')
      .replace(/\.[^.]+$/, '')        // 去扩展名
      .replace(/[-_·•]/g, ' ')        // 统一分隔符
      .replace(/[（(【\[《<][^）)\]】>《]*[）)\]】>]/g, '')  // 去括号内容
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function _nameSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1.0;
    if (a.includes(b) || b.includes(a)) return 0.85;
    const ta = a.split(/\s+/).filter(t => t.length > 0);
    const tb = b.split(/\s+/).filter(t => t.length > 0);
    if (!ta.length || !tb.length) return 0;
    const common = ta.filter(t => tb.includes(t) && t.length > 1);
    return (2 * common.length) / (ta.length + tb.length);
  }

  function _updatePendingMatches() {
    const audioItems = _pendingFiles.filter(f => f.type === 'AUDIO');
    const lrcItems = _pendingFiles.filter(f => f.type === 'LRC');
    const candidates = [
      ...audioItems.map(a => ({ id: a.songId, title: _normalizeName(a.file.name), display: a.file.name.replace(/\.[^.]+$/, '') })),
      ...(_currentPlaylistObj?.songs || []).map(s => ({ id: s.id, title: _normalizeName(s.title), display: s.title }))
    ];
    lrcItems.forEach(lrc => {
      const lrcName = _normalizeName(lrc.file.name);
      let best = null, bestScore = 0.3;
      candidates.forEach(c => {
        const sc = _nameSimilarity(lrcName, c.title);
        if (sc > bestScore) { bestScore = sc; best = c; }
      });
      lrc.matchedId = best?.id || null;
      lrc.matchedName = best?.display || null;
    });
  }

  // ── 配置本地持久化 ──
  function _saveConfig() {
    localStorage.setItem('ms_music_config', JSON.stringify({
      apiBase: _apiBase, cookie: _cookie, profile: _userProfile
    }));
  }
  function _loadConfig() {
    try {
      const conf = JSON.parse(localStorage.getItem('ms_music_config'));
      if (conf) {
        _apiBase = conf.apiBase || '';
        _cookie = conf.cookie || '';
        _userProfile = conf.profile || null;
      }
    } catch(e) {}
  }

  // ── 导航栈逻辑 ──
  function _navTo(viewId) {
    document.querySelectorAll('#music-root .ms-view').forEach(v => v.classList.remove('active'));
    _$(viewId)?.classList.add('active');
    if (_viewStack[_viewStack.length - 1] !== viewId) {
      _viewStack.push(viewId);
    }
    _contextIsLocal = (viewId === 'ms-local-view');
  }

  function _navBack() {
    if (_viewStack.length > 1) {
      _viewStack.pop();
      const prevView = _viewStack[_viewStack.length - 1];
      document.querySelectorAll('#music-root .ms-view').forEach(v => v.classList.remove('active'));
      _$(prevView)?.classList.add('active');
      _contextIsLocal = (prevView === 'ms-local-view');
    } else {
      close();
    }
  }

  function _openModal(id) { _$(id)?.classList.add('active'); }
  function _closeModal(id) { _$(id)?.classList.remove('active'); }
  function _toggleFullPlayer() { _$('ms-full-player')?.classList.toggle('expanded'); }

  // ── 桌面悬浮窗逻辑 ──
  const _getSkinHTML = (skin, songName, isPlay) => {
    const playIcon = isPlay ? 'ph-pause' : 'ph-play';
    const title = songName || 'No Music';
    
    switch(skin) {
      case 'label': return `
  <div class="ms-player-card ms-style-label" id="ms-floating-skin">
    <button class="p-btn close-btn" id="ms-fw-close"><i class="ph ph-x"></i></button>
    <div class="margiela-numbers">
      0 1 2 3 4 5 6 7 8 9<br>
      10 11 12 13 14 15 16<br>
      17 18 19 <span class="active" id="ms-fw-label-num">20</span> 21 22 23
    </div>
    <div class="song-title" id="ms-fw-title">${title}</div>
    <div class="controls">
      <button class="p-btn" id="ms-fw-prev"><i class="ph-light ph-skip-back"></i></button>
      <button class="p-btn" id="ms-fw-play"><i class="ph-light ${playIcon}"></i></button>
      <button class="p-btn" id="ms-fw-next"><i class="ph-light ph-skip-forward"></i></button>
    </div>
  </div>`;
      case 'receipt': return `
        <div class="ms-player-card ms-style-receipt" id="ms-floating-skin">
          <button class="p-btn close-btn" id="ms-fw-close"><i class="ph ph-x"></i></button>
          <div class="receipt-header">Chill OS Player</div>
          <div class="barcode"></div>
          <div class="song-title" id="ms-fw-title">${title}</div>
          <div class="controls">
            <button class="p-btn" id="ms-fw-prev"><i class="ph ph-arrow-left"></i></button>
            <button class="p-btn" id="ms-fw-play"><i class="ph ${playIcon}"></i></button>
            <button class="p-btn" id="ms-fw-next"><i class="ph ph-arrow-right"></i></button>
          </div>
        </div>`;
      case 'chrome': return `
        <div class="ms-player-card ms-style-chrome" id="ms-floating-skin">
          <button class="p-btn close-btn" id="ms-fw-close"><i class="ph-fill ph-x-circle"></i></button>
          <div class="lcd-screen"><div class="song-title" id="ms-fw-title">${title}</div></div>
          <div class="controls">
            <button class="p-btn" id="ms-fw-prev"><i class="ph-fill ph-rewind"></i></button>
            <button class="p-btn" id="ms-fw-play"><i class="ph-fill ${playIcon}"></i></button>
            <button class="p-btn" id="ms-fw-next"><i class="ph-fill ph-fast-forward"></i></button>
          </div>
        </div>`;
      case 'cassette': return `
        <div class="ms-player-card ms-style-cassette ${isPlay ? 'spinning' : ''}" id="ms-floating-skin">
          <button class="p-btn close-btn" id="ms-fw-close"><i class="ph ph-x"></i></button>
          <div class="tape-reels"><div class="reel"></div><div class="reel"></div></div>
          <div class="center-window"></div>
          <div class="song-info"><div class="song-title" id="ms-fw-title">${title}</div></div>
          <div class="controls">
            <button class="p-btn" id="ms-fw-prev"><i class="ph-fill ph-caret-left"></i></button>
            <button class="p-btn" id="ms-fw-play"><i class="ph-fill ${playIcon}"></i></button>
            <button class="p-btn" id="ms-fw-next"><i class="ph-fill ph-caret-right"></i></button>
          </div>
        </div>`;
      case 'hangtag': return `
        <div class="ms-player-card ms-style-hangtag" id="ms-floating-skin">
          <div class="hangtag-string"></div>
          <button class="p-btn close-btn" id="ms-fw-close"><i class="ph ph-x"></i></button>
          <div class="brand-info"><div class="brand-name">Chill OS</div></div>
          <div class="song-title" id="ms-fw-title">${title}</div>
          <div class="mini-barcode"></div>
          <div class="controls">
            <button class="p-btn" id="ms-fw-prev"><i class="ph ph-skip-back"></i></button>
            <button class="p-btn" id="ms-fw-play"><i class="ph ${playIcon}"></i></button>
            <button class="p-btn" id="ms-fw-next"><i class="ph ph-skip-forward"></i></button>
          </div>
        </div>`;
      default: return '';
    }
  };

  const _renderFloatingWidget = () => {
    if (!_activeSkin) return;
    if (_floatingWidget) _floatingWidget.remove();
    
    let songName = 'No Music';
    if (_currentIdx >= 0 && _currentPlaylist[_currentIdx]) {
      const s = _currentPlaylist[_currentIdx];
      songName = s.title || s.name || 'Unknown';
    }

    _floatingWidget = document.createElement('div');
    _floatingWidget.id = 'ms-floating-widget';
    _floatingWidget.innerHTML = _getSkinHTML(_activeSkin, songName, _isPlaying);
    
    // 挂载到 body (Main OS 桌面)
    document.body.appendChild(_floatingWidget);

    // 绑定内部播放器控制
    _floatingWidget.querySelector('#ms-fw-close').onclick = (e) => {
      e.stopPropagation();
      _floatingWidget.remove();
      _floatingWidget = null;
      const audio = _$('ms-audio');
      if (audio) audio.pause();
      _isPlaying = false;
      _updatePlayUI();
    };
    
    _floatingWidget.querySelector('#ms-fw-prev').onclick = (e) => { e.stopPropagation(); _prevSong(); };
    _floatingWidget.querySelector('#ms-fw-next').onclick = (e) => { e.stopPropagation(); _nextSong(); };
    _floatingWidget.querySelector('#ms-fw-play').onclick = (e) => { e.stopPropagation(); _togglePlay(); };

    // 绑定拖拽逻辑
    let isDragging = false, startX, startY, currentX = 0, currentY = 0;
    
    const dragStart = (e) => {
      if (e.target.closest('.p-btn')) return;
      isDragging = true;
      _floatingWidget.classList.add('dragging');
      const touch = e.type.includes('mouse') ? e : e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    };
    
    const dragMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const touch = e.type.includes('mouse') ? e : e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      _floatingWidget.style.transform = `translateX(-50%) translate(${currentX + dx}px, ${currentY + dy}px)`;
    };
    
    const dragEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      _floatingWidget.classList.remove('dragging');
      const touch = e.type.includes('mouse') ? e : e.changedTouches[0];
      currentX += touch.clientX - startX;
      currentY += touch.clientY - startY;
    };

    _floatingWidget.addEventListener('mousedown', dragStart);
    _floatingWidget.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);
  };

  // ── API 请求 ──
  async function _api(path) {
    if (!_apiBase) throw new Error('API Base URL not set');
    const sep = path.includes('?') ? '&' : '?';
    const cookieParam = _cookie ? `${sep}cookie=${encodeURIComponent(_cookie)}` : '';
    const res = await fetch(`${_apiBase}${path}${cookieParam}`);
    return res.json();
  }

  // ── UI 更新 ──
  function _updateProfileUI() {
    const nameEl = _$('ms-user-name');
    const avatarEl = _$('ms-user-avatar');
    if (nameEl) nameEl.textContent = _userProfile?.nickname || '—';
    if (avatarEl && _userProfile?.avatarUrl) avatarEl.style.backgroundImage = `url('${_userProfile.avatarUrl}')`;
  }

  // ── 扫码登录 ──
  async function _startQR() {
    _$('ms-qr-loading').style.display = 'flex';
    _$('ms-qr-status').textContent = '获取二维码中...';
    try {
      const keyData = await _api('/login/qr/key?timestamp=' + Date.now());
      _qrKey = keyData.data?.unikey;
      const qrData = await _api(`/login/qr/create?key=${_qrKey}&qrimg=true&timestamp=${Date.now()}`);
      const img = _$('ms-qr-img');
      img.src = qrData.data?.qrimg || '';
      _$('ms-qr-loading').style.display = 'none';
      _$('ms-qr-status').textContent = '请用网易云 App 扫码';
      _pollQR();
    } catch(e) {
      _$('ms-qr-status').textContent = '获取失败，请检查 API 地址';
      _$('ms-qr-loading').style.display = 'none';
    }
  }

  function _pollQR() {
    if (_qrTimer) clearInterval(_qrTimer);
    _qrTimer = setInterval(async () => {
      try {
        const data = await _api(`/login/qr/check?key=${_qrKey}&timestamp=${Date.now()}`);
        const code = data.code;
        if (code === 800) { _$('ms-qr-status').textContent = '二维码已过期，请刷新'; clearInterval(_qrTimer); }
        if (code === 801) { _$('ms-qr-status').textContent = '等待扫码...'; }
        if (code === 802) { _$('ms-qr-status').textContent = '已扫码，请在手机确认'; }
        if (code === 803) {
          clearInterval(_qrTimer);
          _cookie = data.cookie || '';
          await _afterLogin();
        }
      } catch(e) {}
    }, 2000);
  }

  async function _afterLogin() {
    try {
      const data = await _api('/user/account?timestamp=' + Date.now());
      if (data.profile) {
        _userProfile = data.profile;
        _isLoggedIn = true;
        _saveConfig();
        _updateProfileUI();
      }
      _navTo('ms-home-view');
    } catch(e) { _navTo('ms-home-view'); }
  }

  // ── 手机号 + 密码登录 ──
  async function _loginWithPassword() {
    const phone = _$('ms-pwd-phone').value.trim();
    const pass = _$('ms-pwd-pass').value.trim();
    if (!phone || !pass) return alert('请输入手机号和密码');
    
    const btn = _$('ms-btn-pwd-login');
    btn.textContent = '登录中...';
    btn.disabled = true;

    try {
      const url = `/login/cellphone?phone=${phone}&password=${encodeURIComponent(pass)}&timestamp=${Date.now()}`;
      const data = await _api(url);
      if (data.code === 200) {
        _cookie = data.cookie || '';
        await _afterLogin();
      } else if (data.code === 10004 || (data.message && data.message.includes('安全风险'))) {
        alert("⚠️ 触发网易云风控拦截！\n\n原因：API部署在云端，异地IP登录被网易云判断为安全风险（Code: 10004）。\n\n💡 强烈建议：请切换到【扫码登录】，使用网易云 App 扫码，扫码模式不受异地IP限制！");
      } else {
        alert(data.message || data.msg || `登录失败，错误码：${data.code}`);
      }
    } catch (e) {
      alert('网络请求出错，请按 F12 查看控制台报错');
    } finally {
      btn.textContent = '登 录';
      btn.disabled = false;
    }
  }

  // ── 获取验证码 ──
  async function _sendSmsCode() {
    const phone = _$('ms-code-phone').value.trim();
    if (!phone) return alert('请输入手机号');
    
    const btn = _$('ms-btn-send-code');
    btn.disabled = true;
    
    try {
      const url = `/captcha/sent?phone=${phone}&timestamp=${Date.now()}`;
      const data = await _api(url);

      if (data.code === 200) {
        let countdown = 60;
        btn.textContent = `${countdown}s`;
        const timer = setInterval(() => {
          countdown--;
          if (countdown <= 0) {
            clearInterval(timer);
            btn.textContent = '获取';
            btn.disabled = false;
          } else {
            btn.textContent = `${countdown}s`;
          }
        }, 1000);
      } else {
        alert(data.message || data.msg || `发送失败，错误码：${data.code}`);
        btn.disabled = false;
      }
    } catch (e) {
      alert('请求出错，请按 F12 查看控制台报错');
      btn.disabled = false;
    }
  }

  // ── 手机号 + 验证码登录 ──
  async function _loginWithCode() {
    const phone = _$('ms-code-phone').value.trim();
    const code = _$('ms-code-val').value.trim();
    if (!phone || !code) return alert('请输入手机号和验证码');
    
    const btn = _$('ms-btn-code-login');
    btn.textContent = '登录中...';
    btn.disabled = true;

    try {
      const url = `/login/cellphone?phone=${phone}&captcha=${code}&timestamp=${Date.now()}`;
      const data = await _api(url);

      if (data.code === 200) {
        _cookie = data.cookie || '';
        await _afterLogin();
      } else if (data.code === 10004 || (data.message && data.message.includes('安全风险'))) {
        alert("⚠️ 触发网易云风控拦截！\n\n原因：API部署在云端，异地IP登录被网易云判断为安全风险（Code: 10004）。\n\n💡 强烈建议：请切换到【扫码登录】，使用网易云 App 扫码，扫码模式不受异地IP限制！");
      } else {
        alert(data.message || data.msg || `登录失败，错误码：${data.code}`);
      }
    } catch (e) {
      alert('网络请求出错，请按 F12 查看控制台报错');
    } finally {
      btn.textContent = '登 录';
      btn.disabled = false;
    }
  }

  // ── 渲染本地歌单 ──
  function _renderLocalPlaylists() {
    const container = _$('ms-local-pl-render');
    if (!container) return;
    container.innerHTML = '';
    _localPlaylists.forEach((pl, i) => {
      const el = document.createElement('div');
      el.className = 'ms-art-card ms-fade-in';
      el.style.animationDelay = `${i * 0.08}s`;
      const idx = String(i + 1).padStart(2, '0');
      el.innerHTML = `
        <div class="ms-art-cover-wrap">
          <div class="ms-art-cover" id="ms-lpl-cover-${i}" style="background-image:url('${pl.cover}')"></div>
          ${pl.id !== 'l1' ? `<div class="ms-art-del-btn" id="ms-lpl-del-${i}" title="删除歌单"><i class="ph ph-trash"></i></div>` : ''}
          <div class="ms-art-edit-btn" id="ms-lpl-edit-${i}"><i class="ph ph-camera"></i></div>
        </div>
        <div class="ms-art-info">
          <div class="ms-art-top">
            <h3 class="ms-art-title-en">${pl.titleEn || 'RECORD'}</h3>
            <span class="ms-art-num">${idx}</span>
          </div>
          <div class="ms-art-bottom">
            <p class="ms-art-title-zh">${pl.name}</p>
            <p class="ms-art-count">${pl.count} TRACKS</p>
          </div>
        </div>`;
      el.onclick = () => _openSongList(pl);
      const delBtn = el.querySelector(`#ms-lpl-del-${i}`);
      if (delBtn) delBtn.onclick = e => {
        e.stopPropagation();
        if (confirm(`确认删除歌单「${pl.name}」？\n歌单内所有歌曲将一并删除。`)) _deletePlaylist(pl);
      };
      el.querySelector(`#ms-lpl-edit-${i}`).onclick = e => {
        e.stopPropagation();
        _uploadImgTargetId = `ms-lpl-cover-${i}`;
        _$('ms-file-img').click();
      };
      container.appendChild(el);
    });
  }

  // ── 云端歌单列表 ──
  async function _loadCloudPlaylists() {
    _navTo('ms-playlists-view');
    const container = _$('ms-pl-list-render');
    container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">加载中...</div>';
    
    if (!_userProfile || !_userProfile.userId) {
      container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">未获取到用户ID，请尝试重新登录</div>';
      return;
    }

    try {
      const data = await _api(`/user/playlist?uid=${_userProfile.userId}&limit=100`);
      const lists = data.playlist ||[];
      container.innerHTML = '';
      
      if (lists.length === 0) {
        container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">这片星域有些安静，暂无歌单</div>';
        return;
      }

      lists.forEach((pl, i) => {
        const el = document.createElement('div');
        el.className = 'ms-pl-card ms-fade-in';
        el.style.animationDelay = `${i * 0.05}s`;
        el.innerHTML = `
          <div class="ms-pl-cover" style="background-image:url('${pl.coverImgUrl}')"></div>
          <div class="ms-pl-info">
            <div class="ms-pl-name">${pl.name}</div>
            <div class="ms-text-light" style="font-size:0.75rem;">${pl.trackCount} 首</div>
          </div>
          <i class="ph ph-caret-right ms-text-light" style="padding:10px;"></i>`;
        el.onclick = () => _loadCloudSongList(pl);
        container.appendChild(el);
      });
    } catch(e) {
      console.error('[MusicModule] 加载云端歌单失败', e);
      container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">加载失败，请检查网络或重新登录</div>';
    }
  }

  async function _loadDailyRec() {
    _navTo('ms-songlist-view');
    _$('ms-sl-title').textContent = 'DAILY ECHO';
    _$('ms-sl-desc').textContent = '每日推荐';
    _$('ms-sl-upload-btn').style.display = 'none';
    const container = _$('ms-song-list-render');
    container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">加载中...</div>';
    try {
      const data = await _api('/recommend/songs');
      const songs = (data.data?.dailySongs ||[]).map(s => ({
        id: s.id, title: s.name,
        artist: s.ar?.map(a => a.name).join(' / ') || '',
        cover: s.al?.picUrl || '', isCloud: true
      }));
      _currentPlaylist = songs;
      _currentPlaylistObj = { name: '每日推荐', isLocal: false };
      _$('ms-fp-pl-name').textContent = '每日推荐';
      _renderSongList(songs, container);
    } catch(e) {
      container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">加载失败</div>';
    }
  }

  async function _loadCloudSongList(pl) {
    _navTo('ms-songlist-view');
    _$('ms-sl-title').textContent = pl.name.toUpperCase().slice(0, 16);
    _$('ms-sl-desc').textContent = `${pl.name} • ${pl.trackCount} 首`;
    _$('ms-sl-header-bg').style.backgroundImage = `url('${pl.coverImgUrl}')`;
    _$('ms-fp-pl-name').textContent = pl.name;
    _$('ms-sl-upload-btn').style.display = 'none';
    const container = _$('ms-song-list-render');
    container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">加载中...</div>';
    try {
      const data = await _api(`/playlist/track/all?id=${pl.id}&limit=1000`);
      const songs = (data.songs ||[]).map(s => ({
        id: s.id, title: s.name,
        artist: s.ar?.map(a => a.name).join(' / ') || '',
        cover: s.al?.picUrl || '', isCloud: true
      }));
      _currentPlaylist = songs;
      _currentPlaylistObj = pl;
      _renderSongList(songs, container);
    } catch(e) {
      container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">加载失败</div>';
    }
  }

  function _openSongList(pl) {
    _currentPlaylistObj = pl;
    _navTo('ms-songlist-view');
    _$('ms-sl-title').textContent = (pl.titleEn || 'STORY').toUpperCase();
    _$('ms-sl-desc').textContent = `${pl.name} • ${pl.count} Tracks`;
    _$('ms-sl-header-bg').style.backgroundImage = `url('${pl.cover}')`;
    _$('ms-fp-pl-name').textContent = pl.name;
    _$('ms-sl-upload-btn').style.display = pl.isLocal ? 'block' : 'none';
    _currentPlaylist = pl.songs;
    const container = _$('ms-song-list-render');
    _renderSongList(pl.songs, container);
  }

  function _renderSongList(songs, container) {
    container.innerHTML = '';
    const isLocal = !!_currentPlaylistObj?.isLocal;
    if (!songs.length) {
      container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">这片星域有些安静</div>';
      return;
    }
    songs.forEach((song, i) => {
      const el = document.createElement('div');
      el.className = 'ms-song-item ms-fade-in';
      el.style.animationDelay = `${i * 0.03}s`;
      const rightSide = isLocal
        ? `<div class="ms-song-actions">
             ${song.hasLrc ? `<span class="ms-lrc-badge" data-id="${song.id}" title="点击删除歌词">LRC</span>` : ''}
             <i class="ph ph-trash ms-song-del" data-id="${song.id}"></i>
           </div>`
        : `<i class="ph ph-play-circle ms-text-light"></i>`;
      el.innerHTML = `
        <div class="ms-song-index">${String(i + 1).padStart(2, '0')}</div>
        <div class="ms-song-info">
          <div class="ms-song-name">${song.title || song.name}</div>
          <div class="ms-song-artist">${song.artist || ''}</div>
        </div>
        ${rightSide}`;
      el.onclick = (e) => {
        if (e.target.closest?.('.ms-song-del') || e.target.closest?.('.ms-lrc-badge')) return;
        _playSong(i);
      };
      if (isLocal) {
        const delBtn = el.querySelector('.ms-song-del');
        if (delBtn) delBtn.onclick = async e => {
          e.stopPropagation();
          if (confirm(`确认删除「${song.title || song.name}」？`)) await _deleteSong(song.id);
        };
        const lrcBadge = el.querySelector('.ms-lrc-badge');
        if (lrcBadge) lrcBadge.onclick = async e => {
          e.stopPropagation();
          if (confirm(`确认删除「${song.title || song.name}」的歌词？`)) await _deleteSongLrc(song.id);
        };
      }
      container.appendChild(el);
    });
  }

  // ── 搜索 ──
  async function _handleSearch() {
    const q = _$('ms-search-input')?.value.trim();
    const container = _$('ms-search-results');
    if (!q) { container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">在这片云端寻找你的声音</div>'; return; }
    container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">搜索中...</div>';
    try {
      const data = await _api(`/search?keywords=${encodeURIComponent(q)}&limit=30`);
      const songs = (data.result?.songs ||[]).map(s => ({
        id: s.id, title: s.name,
        artist: s.artists?.map(a => a.name).join(' / ') || '',
        cover: '', isCloud: true
      }));
      _currentPlaylist = songs;
      container.innerHTML = '';
      if (!songs.length) { container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">未发现相关信号</div>'; return; }
      songs.forEach((song, i) => {
        const el = document.createElement('div');
        el.className = 'ms-song-item ms-fade-in';
        el.innerHTML = `
          <div class="ms-song-info" style="margin-left:10px;">
            <div class="ms-song-name">${song.title}</div>
            <div class="ms-song-artist">${song.artist}</div>
          </div>`;
        el.onclick = () => { _playSong(i); _toggleFullPlayer(); };
        container.appendChild(el);
      });
    } catch(e) {
      container.innerHTML = '<div class="ms-text-light" style="text-align:center;padding:40px;">搜索失败</div>';
    }
  }

  // ── 歌词处理 ──
  function _parseLyrics(lrc) {
    const lines = lrc.split('\n');
    const result = [];
    const regex = /\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\](.*)/;
    lines.forEach(line => {
      const match = regex.exec(line);
      if (match) {
        const m = parseInt(match[1]);
        const s = parseFloat(match[2]);
        const text = match[3].trim();
        if (text) result.push({ time: m * 60 + s, text });
      }
    });
    return result;
  }

  function _renderLyricsDOM() {
    const container = _$('ms-lyric-scroll');
    if (!_lyrics.length) {
      container.innerHTML = '<div class="ms-lyric-line active">纯音乐 / 暂无歌词</div>';
      container.style.transform = `translateY(0px)`;
      return;
    }
    container.innerHTML = _lyrics.map((l, i) => `<div class="ms-lyric-line" id="lyric-line-${i}">${l.text}</div>`).join('');
    container.style.transform = `translateY(0px)`;
  }

  async function _fetchLyrics(song) {
    _lyrics =[];
    _currentLyricIdx = -1;
    _$('ms-lyric-scroll').innerHTML = '<div class="ms-lyric-line active">加载歌词中...</div>';
    _$('ms-lyric-scroll').style.transform = `translateY(0px)`;

    if (song.isCloud && song.id) {
      try {
        const data = await _api(`/lyric?id=${song.id}`);
        if (data && data.lrc && data.lrc.lyric) {
          _lyrics = _parseLyrics(data.lrc.lyric);
        }
      } catch(e) {}
    } else if (!song.isCloud && song.hasLrc) {
      try {
        const lrcId = song.lrcId || `lrc_${song.id}`;
        const data = await MusicDB.get('lyrics', lrcId);
        if (data && data.text) {
          _lyrics = _parseLyrics(data.text);
        }
      } catch(e) { console.warn('[MusicModule] 读取本地歌词失败:', e); }
    }
    _renderLyricsDOM();
  }

  // ── 播放器 ──
  async function _playSong(idx) {
    if (idx < 0 || idx >= _currentPlaylist.length) return;
    _currentIdx = idx;
    const song = _currentPlaylist[idx];
    const audio = _$('ms-audio');

    // 更新 UI
    const title = song.title || song.name || '—';
    const artist = song.artist || '—';
    _$('ms-mp-title').textContent = title;
    _$('ms-mp-artist').textContent = artist;
    _$('ms-fp-title').textContent = title;
    _$('ms-fp-artist').textContent = artist;
    
    // 同步给桌面悬浮窗
    const fwTitle = document.getElementById('ms-fw-title');
    if (fwTitle) fwTitle.textContent = title;
    
    // 更新马吉拉皮肤圈圈内的数字
const fwLabelNum = document.getElementById('ms-fw-label-num');
if (fwLabelNum) {
  // 简单地用播放列表索引来变化数字
  fwLabelNum.textContent = 17 + idx;
}

    if (song.cover) {
      _$('ms-mp-cover').style.backgroundImage = `url('${song.cover}')`;
      _$('ms-fp-art').style.backgroundImage = `url('${song.cover}')`;
    }
    
    // 获取播放链接与歌词
    let url = song.url || '';
    if (song.isCloud && song.id) {
      try {
        const data = await _api(`/song/url/v1?id=${song.id}&level=exhigh&randomCNIP=true`);
        url = (data.data?.[0]?.url || '').replace('http://', 'https://');
        if (!song.cover) {
          const detail = await _api(`/song/detail?ids=${song.id}`);
          const pic = detail.songs?.[0]?.al?.picUrl;
          if (pic) {
            _currentPlaylist[idx].cover = pic;
            _$('ms-mp-cover').style.backgroundImage = `url('${pic}')`;
            _$('ms-fp-art').style.backgroundImage = `url('${pic}')`;
          }
        }
      } catch(e) {}
    } else if (!song.isCloud && !song.isUrl) {
      url = await _getLocalPlaybackUrl(song);
    }
    
    _fetchLyrics(song);

    if (!url) { console.warn('[MusicModule] 无法获取播放链接'); if(window.Toast)Toast.show('无法获取播放链接'); return; }
    audio.onerror = function(){ const c=audio.error; const msg='音频加载失败: '+(c?'code='+c.code+' '+({1:'MEDIA_ERR_ABORTED',2:'MEDIA_ERR_NETWORK',3:'MEDIA_ERR_DECODE',4:'MEDIA_ERR_SRC_NOT_SUPPORTED'}[c.code]||'UNKNOWN'):'unknown')+' url='+url.slice(0,80); console.error('[MusicModule]',msg); if(window.Toast)Toast.show(msg); };
    audio.src = url;
    audio.play().then(() => {
      _isPlaying = true;
      _updatePlayUI();
      _$('ms-mini-player').classList.add('visible');
      document.querySelectorAll('#ms-song-list-render .ms-song-item').forEach(el => el.classList.remove('playing'));
      const items = document.querySelectorAll('#ms-song-list-render .ms-song-item');
      if (items[idx]) items[idx].classList.add('playing');
    }).catch(e => { console.warn('[MusicModule] 播放失败', e); if(window.Toast)Toast.show('播放失败: '+e.message); _isPlaying = false; _updatePlayUI(); });
  }

  function _togglePlay() {
    const audio = _$('ms-audio');
    if (!audio.src && _currentPlaylist.length) { _playSong(0); return; }
    _isPlaying ? audio.pause() : audio.play();
    _isPlaying = !_isPlaying;
    _updatePlayUI();
  }

  function _nextSong() {
    if (!_currentPlaylist.length) return;
    let next = _currentIdx + 1;
    if (_playMode === 1) next = Math.floor(Math.random() * _currentPlaylist.length);
    else if (next >= _currentPlaylist.length) next = 0;
    _playSong(next);
  }

  function _prevSong() {
    const audio = _$('ms-audio');
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    let prev = _currentIdx - 1;
    if (prev < 0) prev = _currentPlaylist.length - 1;
    _playSong(prev);
  }

  function _toggleMode() {
    _playMode = (_playMode + 1) % 3;
    const btn = _$('ms-mode-btn');
    if (btn) btn.className = `ph ${_playModeIcons[_playMode]} ms-ctrl-icon`;
    _$('ms-audio').loop = (_playMode === 2);
  }

  function _updatePlayUI() {
    const play = _isPlaying;
    const mpPlay = _$('ms-mp-play');
    const fpPlay = _$('ms-fp-play');
    const cover = _$('ms-mp-cover');
    const art = _$('ms-fp-art');
    if (mpPlay) mpPlay.className = `ph ${play ? 'ph-pause-circle' : 'ph-play-circle'} ms-mp-btn play-pause`;
    if (fpPlay) fpPlay.className = `ph ${play ? 'ph-pause-circle' : 'ph-play-circle'} ms-ctrl-icon ms-ctrl-play`;
    play ? cover?.classList.add('spinning') : cover?.classList.remove('spinning');
    play ? art?.classList.add('spinning') : art?.classList.remove('spinning');

    // 同步给桌面悬浮窗图标
    const fwPlay = document.getElementById('ms-fw-play');
    if (fwPlay) {
      const i = fwPlay.querySelector('i');
      if (_activeSkin === 'label' || _activeSkin === 'receipt' || _activeSkin === 'hangtag') {
        i.className = play ? (i.className.includes('ph-light') ? 'ph-light ph-pause' : 'ph ph-pause') : (i.className.includes('ph-light') ? 'ph-light ph-play' : 'ph ph-play');
      } else {
        i.className = play ? 'ph-fill ph-pause-circle' : 'ph-fill ph-play-circle';
      }
    }
    const fwCassette = document.getElementById('ms-floating-skin');
    if (fwCassette && fwCassette.classList.contains('ms-style-cassette')) {
      play ? fwCassette.classList.add('spinning') : fwCassette.classList.remove('spinning');
    }
  }

  function _fmtTime(s) {
    if (isNaN(s) || s === Infinity) return '00:00';
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }

  // ── 上传逻辑 ──
  function _renderPendingList() {
    const container = _$('ms-pending-list');
    if (!container) return;
    if (!_pendingFiles.length) {
      container.innerHTML = '<div style="text-align:center;padding:25px;color:rgba(255,255,255,0.3);font-size:0.85rem;">暂未选择文件</div>';
      return;
    }
    container.innerHTML = '';
    _pendingFiles.forEach(item => {
      const el = document.createElement('div');
      el.className = 'ms-pending-item ms-fade-in';
      const displayName = item.type === 'URL_AUDIO'
        ? item.title
        : item.file.name;
      const matchInfo = item.type === 'LRC'
        ? (item.matchedName
            ? `<span class="ms-lrc-match">→ ${item.matchedName}</span>`
            : `<span class="ms-lrc-match unmatched">→ 未匹配</span>`)
        : '';
      el.innerHTML = `
        <div style="display:flex;align-items:center;flex:1;overflow:hidden;margin-right:10px;gap:6px;flex-wrap:wrap;">
          <span class="ms-pending-type">${item.type === 'URL_AUDIO' ? 'URL' : item.type}</span>
          <span class="ms-pending-name">${displayName}</span>
          ${matchInfo}
        </div>
        <i class="ph ph-x-circle ms-pending-del" data-id="${item.id}"></i>`;
      el.querySelector('.ms-pending-del').onclick = () => {
        _pendingFiles = _pendingFiles.filter(f => f.id != item.id);
        _updatePendingMatches();
        _renderPendingList();
      };
      container.appendChild(el);
    });
  }

  async function _confirmUpload() {
    if (!_pendingFiles.length || !_currentPlaylistObj) return;
    const btn = _$('ms-btn-confirm-upload');
    if (btn) { btn.textContent = '处理中...'; btn.disabled = true; }
    try {
      const audioItems = _pendingFiles.filter(f => f.type === 'AUDIO');
      const urlItems   = _pendingFiles.filter(f => f.type === 'URL_AUDIO');
      const lrcItems   = _pendingFiles.filter(f => f.type === 'LRC');

      // ① 处理音频文件 → 写入 IndexedDB
      const newSongs = [];
      for (const item of audioItems) {
        const songId = item.songId;
        try {
          const ab = await item.file.arrayBuffer();
          await MusicDB.put('audio', { id: songId, mimeType: item.file.type || 'audio/mpeg', data: ab });
          newSongs.push({
            id: songId,
            title: item.file.name.replace(/\.[^.]+$/, ''),
            artist: 'Local',
            cover: _currentPlaylistObj.cover,
            hasLrc: false,
            lrcId: null,
            isCloud: false
          });
        } catch(e) { console.error('[MusicModule] 音频存储失败:', e); }
      }

      // ① - URL 类型歌曲 → 直接写入歌单，无需存 blob
      for (const item of urlItems) {
        newSongs.push({
          id: item.songId,
          title: item.title,
          artist: 'URL',
          cover: _currentPlaylistObj.cover,
          url: item.url,
          hasLrc: false,
          lrcId: null,
          isCloud: false,
          isUrl: true
        });
      }

      // ② 处理 LRC — 按匹配结果写入 IndexedDB
      const songLookup = new Map();
      newSongs.forEach(s => songLookup.set(s.id, s));
      (_currentPlaylistObj.songs || []).forEach(s => songLookup.set(s.id, s));

      let lrcCount = 0;
      for (const item of lrcItems) {
        if (!item.matchedId) continue;
        const song = songLookup.get(item.matchedId);
        if (!song) continue;
        try {
          const text = await item.file.text();
          const lrcId = `lrc_${song.id}`;
          await MusicDB.put('lyrics', { id: lrcId, songId: song.id, text });
          song.hasLrc = true;
          song.lrcId  = lrcId;
          lrcCount++;
        } catch(e) { console.error('[MusicModule] 歌词存储失败:', e); }
      }

      // ③ 更新歌单并持久化
      newSongs.forEach(s => _currentPlaylistObj.songs.push(s));
      _currentPlaylistObj.count = _currentPlaylistObj.songs.length;
      await _savePlaylistToDB(_currentPlaylistObj);

      _renderLocalPlaylists();
      _openSongList(_currentPlaylistObj);

      let msg = `已添加 ${newSongs.length} 首`;
      if (lrcCount > 0) msg += `，歌词匹配 ${lrcCount} 首`;
      if (typeof Toast !== 'undefined') Toast.show(msg);
    } catch(e) {
      console.error('[MusicModule] 上传失败:', e);
    } finally {
      _pendingFiles = [];
      _closeModal('ms-modal-upload');
      if (btn) { btn.textContent = '确 认 上 传'; btn.disabled = false; }
    }
  }

  // ── Three.js 星空 ──
  let _threeRenderer = null;
  function _initThree() {
    if (_threeRenderer) return;
    if (!window.THREE) return;
    const container = _$('ms-canvas');
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030305, 0.002);
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 30, 80); camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const canvas2d = document.createElement('canvas'); canvas2d.width = 16; canvas2d.height = 16;
    const ctx = canvas2d.getContext('2d');
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.5, 'rgba(200,220,255,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16);

    const count = 2000, geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = Math.random() * 120, sa = r * 1, ba = (i % 3) / 3 * Math.PI * 2;
      const rnd = v => Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * v;
      pos[i*3] = Math.cos(ba+sa)*r + rnd(0.5*r);
      pos[i*3+1] = rnd(0.25*r);
      pos[i*3+2] = Math.sin(ba+sa)*r + rnd(0.5*r);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 1.2, map: new THREE.CanvasTexture(canvas2d), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xe0e8ff });
    const galaxy = new THREE.Points(geo, mat); galaxy.rotation.x = 0.2; scene.add(galaxy);

    const clock = new THREE.Clock(); let mx = 0;
    document.addEventListener('touchmove', e => { mx = (e.touches[0].clientX - window.innerWidth / 2) * 0.05; }, { passive: true });
    (function animate() { requestAnimationFrame(animate); galaxy.rotation.y = clock.getElapsedTime() * 0.05; camera.position.x += (mx - camera.position.x) * 0.05; camera.lookAt(0, 0, 0); renderer.render(scene, camera); })();
    _threeRenderer = renderer;
  }

  // ── 绑定所有事件 ──
  const _bindEvents = () => {
    const audio = _$('ms-audio');

    _$('ms-btn-exit').onclick = () => close();

    const menuTrigger = _$('ms-menu-trigger');
    const dropMenu = _$('ms-dropdown-menu');
    if (menuTrigger && dropMenu) {
      menuTrigger.onclick = (e) => {
        e.stopPropagation();
        dropMenu.classList.toggle('active');
      };
      document.addEventListener('click', (e) => {
        if (!dropMenu.contains(e.target) && !menuTrigger.contains(e.target)) {
          dropMenu.classList.remove('active');
        }
      });
    }

    _$('ms-btn-create-pl').onclick = () => {
      if(dropMenu) dropMenu.classList.remove('active');
      _openModal('ms-modal-create-pl');
    };
    
    _$('ms-btn-go-api').onclick = async () => {
      if(dropMenu) dropMenu.classList.remove('active');
      if (_cookie && _apiBase && _userProfile) {
        _updateProfileUI();
        _isLoggedIn = true;
        _navTo('ms-home-view');
        try {
          const data = await _api('/user/account?timestamp=' + Date.now());
          if (!data.profile) {
            _cookie = ''; _userProfile = null; _isLoggedIn = false;
            _saveConfig();
          }
        } catch(e) {}
        return;
      }
      _navTo('ms-api-login-view');
    };

    // 打开 UI 选择页
    _$('ms-btn-go-ui').onclick = () => {
      if(dropMenu) dropMenu.classList.remove('active');
      document.querySelectorAll('.ms-ui-preview-card').forEach(c => c.classList.remove('active'));
      if (_activeSkin) {
        const activeCard = document.querySelector(`.ms-ui-preview-card[data-skin="${_activeSkin}"]`);
        if (activeCard) activeCard.classList.add('active');
      }
      _navTo('ms-ui-view');
    };

    _$('ms-btn-ui-back').onclick = _navBack;

    // 选择皮肤点击交互
    document.querySelectorAll('.ms-ui-preview-card').forEach(card => {
      card.onclick = () => {
        document.querySelectorAll('.ms-ui-preview-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      };
    });

    // 应用 UI 按钮
    _$('ms-btn-apply-ui').onclick = () => {
      const activeCard = document.querySelector('.ms-ui-preview-card.active');
      if (activeCard) {
        _activeSkin = activeCard.dataset.skin;
        localStorage.setItem('ms_active_skin', _activeSkin);
        if (typeof Toast !== 'undefined') Toast.show('皮肤已应用，退出模块即可在桌面显示');
      } else {
        _activeSkin = null;
        localStorage.removeItem('ms_active_skin');
        if (typeof Toast !== 'undefined') Toast.show('已取消皮肤');
      }
      _navBack();
    };

    _$('ms-btn-api-back').onclick = _navBack;
    _$('ms-btn-connect-api').onclick = async () => {
      const url = _$('ms-api-url-input')?.value.trim();
      if (url) {
        _apiBase = url.replace(/\/$/, '');
        _saveConfig();
        if (_cookie) {
           try {
             const data = await _api('/user/account?timestamp=' + Date.now());
             if (data.profile) {
               _userProfile = data.profile;
               _isLoggedIn = true;
               _saveConfig();
               _updateProfileUI();
               _navTo('ms-home-view');
               return;
             }
           } catch(e) {}
        }
        _navTo('ms-login-view');
        _startQR();
      } else {
        alert("请先输入您的 API 地址");
      }
    };
    _$('ms-btn-api-guide').onclick = () => _openModal('ms-modal-api-guide');
    _$('ms-btn-close-guide').onclick = () => _closeModal('ms-modal-api-guide');

    _$('ms-btn-login-back').onclick = () => { if (_qrTimer) clearInterval(_qrTimer); _navBack(); };
    _$('ms-btn-refresh-qr').onclick = () => _startQR();
    document.querySelectorAll('#music-root .ms-login-tab').forEach(tab => {
      tab.onclick = function() {
        document.querySelectorAll('#music-root .ms-login-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#music-root .ms-login-panel').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        _$('ms-login-' + this.dataset.tab)?.classList.add('active');
        if (this.dataset.tab === 'qr' && !_qrKey) _startQR();
      };
    });
    
    _$('ms-btn-pwd-login').onclick = _loginWithPassword;
    _$('ms-btn-send-code').onclick = _sendSmsCode;
    _$('ms-btn-code-login').onclick = _loginWithCode;

    _$('ms-card-playlist').onclick = () => _loadCloudPlaylists();
    _$('ms-card-daily').onclick = () => _loadDailyRec();
    _$('ms-card-search').onclick = () => _navTo('ms-search-view');
    _$('ms-btn-logout').onclick = () => _navTo('ms-local-view'); 

    _$('ms-btn-pl-back').onclick = _navBack;
    _$('ms-btn-sl-back').onclick = _navBack;
    _$('ms-sl-upload-btn').onclick = () => {
      _pendingFiles = [];
      _renderPendingList();
      const panel = _$('ms-url-input-panel');
      if (panel) panel.style.display = 'none';
      _openModal('ms-modal-upload');
    };
    _$('ms-btn-search-back').onclick = _navBack;
    _$('ms-search-input').oninput = _handleSearch;

    _$('ms-mini-player').onclick = () => _toggleFullPlayer();
    _$('ms-mp-controls').onclick = e => e.stopPropagation();
    _$('ms-mp-prev').onclick = _prevSong;
    _$('ms-mp-play').onclick = _togglePlay;
    _$('ms-mp-next').onclick = _nextSong;
    _$('ms-fp-close').onclick = _toggleFullPlayer;
    _$('ms-fp-prev').onclick = _prevSong;
    _$('ms-fp-play').onclick = _togglePlay;
    _$('ms-fp-next').onclick = _nextSong;
    _$('ms-mode-btn').onclick = _toggleMode;
    _$('ms-fp-to-list').onclick = () => { _toggleFullPlayer(); _navTo('ms-songlist-view'); };

    const bar = _$('ms-progress-bar');
    const fill = _$('ms-progress-fill');
    bar.addEventListener('input', e => {
      _isDragging = true; fill.style.width = `${e.target.value}%`;
      if (audio.duration) _$('ms-time-current').textContent = _fmtTime((e.target.value / 100) * audio.duration);
    });
    bar.addEventListener('change', e => {
      _isDragging = false;
      if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
    });

    audio.addEventListener('timeupdate', () => {
      if (!_isDragging && audio.duration) {
        const pct = (audio.currentTime / audio.duration) * 100;
        bar.value = pct; fill.style.width = `${pct}%`;
        _$('ms-time-current').textContent = _fmtTime(audio.currentTime);
      }
      if (_lyrics.length > 0) {
        const ct = audio.currentTime;
        let idx = -1;
        for (let i = 0; i < _lyrics.length; i++) {
          if (ct >= _lyrics[i].time - 0.3) idx = i;
          else break;
        }
        if (idx >= 0 && idx !== _currentLyricIdx) {
          if (_currentLyricIdx >= 0) {
            const oldEl = _$('lyric-line-' + _currentLyricIdx);
            if (oldEl) oldEl.classList.remove('active');
          }
          _currentLyricIdx = idx;
          const newEl = _$('lyric-line-' + idx);
          if (newEl) newEl.classList.add('active');
          _$('ms-lyric-scroll').style.transform = `translateY(-${idx * 30}px)`;
        }
      }
    });
    audio.addEventListener('loadedmetadata', () => { _$('ms-time-total').textContent = _fmtTime(audio.duration); });
    audio.addEventListener('ended', () => { if (_playMode !== 2) _nextSong(); });

    _$('ms-file-img').onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        const el = _$(_uploadImgTargetId);
        if (el) el.style.backgroundImage = `url('${ev.target.result}')`;
        if (_uploadImgTargetId === 'ms-new-pl-cover') {
          _tempCover = ev.target.result;
          _$('ms-new-pl-cover').innerHTML = '';
        } else if (_uploadImgTargetId && _uploadImgTargetId.startsWith('ms-lpl-cover-')) {
          const idx = parseInt(_uploadImgTargetId.replace('ms-lpl-cover-', ''));
          if (_localPlaylists[idx]) {
            _localPlaylists[idx].cover = ev.target.result;
            await _savePlaylistToDB(_localPlaylists[idx]);
          }
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    };
    _$('ms-file-music').onchange = e => {
      Array.from(e.target.files).forEach(f => {
        const songId = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        _pendingFiles.push({ id: Date.now() + Math.random(), songId, type: 'AUDIO', file: f });
      });
      _updatePendingMatches();
      _renderPendingList();
      e.target.value = '';
    };
    _$('ms-file-lrc').onchange = e => {
      Array.from(e.target.files).forEach(f => {
        _pendingFiles.push({ id: Date.now() + Math.random(), type: 'LRC', file: f, matchedId: null, matchedName: null });
      });
      _updatePendingMatches();
      _renderPendingList();
      e.target.value = '';
    };
    _$('ms-btn-add-music').onclick = () => _$('ms-file-music').click();
    _$('ms-btn-add-lrc').onclick = () => _$('ms-file-lrc').click();

    // URL 添加按钮 — 展开/收起输入面板
    _$('ms-btn-add-url').onclick = () => {
      const panel = _$('ms-url-input-panel');
      if (!panel) return;
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) setTimeout(() => _$('ms-url-audio-url')?.focus(), 50);
    };

    // URL 确认添加
    _$('ms-btn-url-confirm').onclick = () => {
      const rawUrl = (_$('ms-url-audio-url')?.value || '').trim();
      if (!rawUrl) { if (typeof Toast !== 'undefined') Toast.show('请输入音乐链接'); return; }
      // 简单校验：必须是 http/https
      if (!/^https?:\/\//i.test(rawUrl)) { if (typeof Toast !== 'undefined') Toast.show('请输入有效的 http/https 链接'); return; }
      // 提取默认名称（取 pathname 最后一段，去掉扩展名）
      let defaultName = '未知歌曲';
      try {
        const pathname = new URL(rawUrl).pathname;
        const seg = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
        if (seg) defaultName = seg.replace(/\.[^.]+$/, '');
      } catch(e) {}
      const customName = (_$('ms-url-audio-name')?.value || '').trim();
      const title = customName || defaultName;
      const songId = 'url_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      _pendingFiles.push({ id: Date.now() + Math.random(), songId, type: 'URL_AUDIO', url: rawUrl, title });
      _updatePendingMatches();
      _renderPendingList();
      // 清空输入并收起面板
      if (_$('ms-url-audio-url')) _$('ms-url-audio-url').value = '';
      if (_$('ms-url-audio-name')) _$('ms-url-audio-name').value = '';
      _$('ms-url-input-panel').style.display = 'none';
      if (typeof Toast !== 'undefined') Toast.show(`已加入：${title}`);
    };

    _$('ms-btn-confirm-upload').onclick = _confirmUpload;

    _$('ms-btn-cancel-create').onclick = () => _closeModal('ms-modal-create-pl');
    _$('ms-new-pl-cover').onclick = () => { _uploadImgTargetId = 'ms-new-pl-cover'; _$('ms-file-img').click(); };
    _$('ms-btn-confirm-create').onclick = async () => {
      const name = _$('ms-new-pl-name')?.value.trim();
      if (!name) return;
      const newPl = { id: 'p_' + Date.now(), name, titleEn: 'NEW RECORD', count: 0, cover: _tempCover || _DEFAULT_COVER, songs:[], isLocal: true };
      _localPlaylists.push(newPl);
      await _savePlaylistToDB(newPl);
      _renderLocalPlaylists();
      _$('ms-new-pl-name').value = ''; _tempCover = '';
      _$('ms-new-pl-cover').innerHTML = '<span><i class="ph ph-camera"></i> 点击上传封面</span>';
      _closeModal('ms-modal-create-pl');
    };

    ['ms-modal-create-pl', 'ms-modal-upload', 'ms-modal-api-guide'].forEach(id => {
      const el = _$(id);
      if (el) {
        el.onclick = e => { if (e.target === el) _closeModal(id); };
      }
    });
  }; 

  // ── 公开方法 ──
  async function open() {
    _loadConfig();
    if (!_initialized) {
      _injectCSS();
      _injectHTML();
      _bindEvents();
      _initialized = true;
    }

    if (_floatingWidget) {
      _floatingWidget.remove();
      _floatingWidget = null;
    }

    _ensureDB().then(() => _loadPlaylistsFromDB()).then(() => {
      _renderLocalPlaylists();
    }).catch(e => console.warn('[MusicModule] DB 恢复失败:', e));
    
    const apiUrlInput = _$('ms-api-url-input');
    if (apiUrlInput) apiUrlInput.value = _apiBase || '';
    if (_userProfile) { 
      _updateProfileUI(); 
      _isLoggedIn = true; 
    }
    
    _renderLocalPlaylists();
    
    _viewStack = ['ms-local-view'];
    document.querySelectorAll('#music-root .ms-view').forEach(v => v.classList.remove('active'));
    const localView = _$('ms-local-view');
    if (localView) localView.classList.add('active');
    _contextIsLocal = true;

    setTimeout(() => {
      const root = document.getElementById('music-root');
      if (root) root.classList.add('ms-open');
    }, 20);

    if (window.THREE) {
      _initThree();
    } else {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = _initThree;
      document.head.appendChild(s);
    }
  }

  function close() {
    const root = document.getElementById('music-root');
    if (root) {
      root.classList.remove('ms-open');
    }
    const fullPlayer = _$('ms-full-player');
    if (fullPlayer) {
      fullPlayer.classList.remove('expanded');
    }
    _renderFloatingWidget();
  }
  
  // ==========================================
  // 新增：供外部(CoupleModule)调用的互通接口
  // ==========================================
  
  // 🌟 1. 静默初始化：不仅拉取数据，还要把底层播放器偷偷挂载好
  async function silentInit() {
    // 如果还没初始化过 DOM，就静默注入 HTML 和绑定事件 (不弹出版面)
    if (!_initialized) {
      _injectCSS();
      _injectHTML();
      _bindEvents();
      _initialized = true;
    }
    
    _loadConfig();
    await _ensureDB();
    await _loadPlaylistsFromDB();
    if (_cookie && _apiBase && _userProfile) {
      _isLoggedIn = true;
    }
  }

  // 🌟 2. 混合拉取所有歌单
  async function getExposedPlaylists() {
    const lists = [..._localPlaylists];
    if (_isLoggedIn && _userProfile) {
      try {
        // 加上 timestamp 防止网易云接口数据被死缓存
        const data = await _api(`/user/playlist?uid=${_userProfile.userId}&limit=100&timestamp=${Date.now()}`);
        if (data.playlist) data.playlist.forEach(p => lists.push(p));
      } catch(e) { console.warn("拉取云端歌单失败", e); }
    }
    return lists;
  }

  async function getExposedSongs(pl) {
    if (pl.isLocal) return pl.songs ||[];
    try {
      const data = await _api(`/playlist/track/all?id=${pl.id}&limit=200&timestamp=${Date.now()}`);
      return (data.songs ||[]).map(s => ({
        id: s.id, title: s.name, artist: s.ar?.map(a => a.name).join(' / ') || '', cover: s.al?.picUrl || '', isCloud: true
      }));
    } catch(e) { return[]; }
  }

  async function playExposedSong(song, plSongs, plObj) {
    _currentPlaylist = plSongs;
    _currentPlaylistObj = plObj;
    const idx = _currentPlaylist.findIndex(s => s.id === song.id);
    if (idx !== -1) {
      await _playSong(idx);
      return true;
    }
    return false;
  }

  async function searchAndPlayCloud(keyword) {
    try {
      const data = await _api(`/search?keywords=${encodeURIComponent(keyword)}&limit=1`);
      const s = data.result?.songs?.[0];
      if (s) {
        const song = { id: s.id, title: s.name, artist: s.artists?.map(a => a.name).join(' / ') || '', cover: s.album?.artist?.img1v1Url || '', isCloud: true };
        _currentPlaylist = [song];
        _currentPlaylistObj = { name: 'AI 点歌', isLocal: false };
        await _playSong(0);
        return song;
      }
    } catch(e){}
    return null;
  }

  function getCurrentState() {
    const song = (_currentIdx >= 0 && _currentPlaylist.length > _currentIdx) ? _currentPlaylist[_currentIdx] : null;
    return { isPlaying: _isPlaying, song: song, lyrics: _lyrics ||[] };
  }

  return { 
    open, close, _navTo, 
    // 暴露给外部的接口
    silentInit, getExposedPlaylists, getExposedSongs, playExposedSong, searchAndPlayCloud, getCurrentState 
  };
})();