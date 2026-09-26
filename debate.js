'use strict';

/**
 * ============================================================
 * DebateModule — 观点修罗场 (支持存档与读档版)
 * ============================================================
 */
const DebateModule = (() => {

  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;800&family=Space+Grotesk:wght@300;500;700&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  const style = document.createElement('style');
  style.textContent = `
    :root {
      --db-bg-base: #030303; --db-text-pure: #ffffff; --db-text-dim: #888888;
      --db-glass-bg: rgba(18, 18, 18, 0.6); --db-glass-border: rgba(255, 255, 255, 0.08);
      --db-glass-highlight: rgba(255, 255, 255, 0.15); --db-blur-strong: blur(40px);
      --db-font-serif-en: 'Cinzel', serif; --db-font-serif-zh: 'Songti SC', 'STSong', 'Noto Serif SC', 'PT Serif', 'SimSun', serif;
      --db-font-sans-en: 'Space Grotesk', sans-serif; --db-font-sans-zh: 'Inter', sans-serif;
    }
    #debate-screen {
      position: absolute; inset: 0; width: 100%; height: 100%; background-color: var(--db-bg-base);
      color: var(--db-text-pure); font-family: var(--db-font-sans-zh); z-index: 180; 
      transform: translateX(100%); transition: transform 0.42s cubic-bezier(0.19, 1, 0.22, 1);
      display: flex; flex-direction: column; overflow: hidden;
    }
    #debate-screen.active { transform: translateX(0); }
    #debate-screen .ambient-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    #debate-screen .ambient-glow { position: absolute; width: 60vh; height: 60vh; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%); filter: blur(40px); top: 10%; left: -20%; }
    #debate-screen .destiny-line { position: absolute; width: 100%; height: 100%; top: 0; left: 0; opacity: 0.1; }
    #debate-screen .destiny-line path { stroke: #fff; stroke-width: 0.5; fill: none; }
    #debate-screen .vert-text { position: absolute; left: 12px; top: 30%; transform: rotate(-90deg) translateX(-50%); transform-origin: left top; font-family: var(--db-font-sans-en); font-size: 0.6rem; letter-spacing: 0.3em; color: var(--db-text-dim); opacity: 0.5; white-space: nowrap; }

    #debate-screen .app-container { width: 100%; height: 100%; position: relative; z-index: 10; display: flex; flex-direction: column; }
    #debate-screen .db-view { display: none; flex: 1; flex-direction: column; height: 100%; position: relative;}
    #debate-screen .db-view.active { display: flex; animation: emerge 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes emerge { from { opacity: 0; filter: blur(10px); transform: scale(0.98); } to { opacity: 1; filter: blur(0); transform: scale(1); } }

    #debate-screen .setup-scroll { flex: 1; overflow-y: auto; padding: calc(env(safe-area-inset-top, 20px) + 24px) 24px 120px; scrollbar-width: none; }
    #debate-screen .setup-scroll::-webkit-scrollbar { display: none; }

    #debate-screen .btn-back-setup { position: absolute; top: calc(env(safe-area-inset-top, 20px) + 20px); right: 24px; z-index: 50; background: transparent; border: none; color: var(--db-text-dim); font-family: var(--db-font-sans-en); font-size: 0.75rem; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; border-bottom: 1px solid var(--db-text-dim); padding-bottom: 2px; transition: 0.3s; }
    #debate-screen .btn-back-setup:active { color: var(--db-text-pure); border-bottom-color: var(--db-text-pure); opacity: 0.5; }

    #debate-screen .hero-header { position: relative; margin-bottom: 56px; margin-top: 40px; }
    #debate-screen .hero-header .bg-text { font-family: var(--db-font-sans-en); font-size: 4rem; font-weight: 700; color: rgba(255,255,255,0.02); letter-spacing: -2px; position: absolute; top: -20px; left: -10px; z-index: -1; text-transform: uppercase; }
    #debate-screen .hero-header .title-en { font-family: var(--db-font-serif-en); font-size: 1.2rem; letter-spacing: 0.4em; color: var(--db-text-dim); margin-bottom: 8px; display: block; }
   #debate-screen .hero-header .title-zh { 
  font-family: var(--db-font-serif-zh); 
  font-size: 2.6rem; 
  font-weight: 400; /* 关键：去掉笨重的加粗，回归纤细优雅 */
  letter-spacing: 6px; /* 拉开字间距，增加呼吸感 */
  line-height: 1.2; 
  /* 银色金属渐变质感 */
  background: linear-gradient(180deg, #FFFFFF 0%, #888888 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  /* 增加深渊微光 */
  filter: drop-shadow(0 4px 12px rgba(255,255,255,0.15));
}

    #debate-screen .sect { margin-bottom: 40px; opacity: 0.3; pointer-events: none; transition: opacity 0.5s ease; flex-shrink: 0; }
    #debate-screen .sect.unlocked { opacity: 1; pointer-events: auto; }
    #debate-screen .sect-title { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    #debate-screen .sect-title .num { font-family: var(--db-font-sans-en); font-size: 0.7rem; color: var(--db-text-pure); background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 100px; }
    #debate-screen .sect-title .zh { font-family: var(--db-font-sans-zh); font-size: 0.85rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--db-text-dim); }

    /* 存档列表样式 */
    #debate-screen .archive-list { display: flex; gap: 16px; overflow-x: auto; scrollbar-width: none; padding-bottom: 10px; }
    #debate-screen .archive-list::-webkit-scrollbar { display: none; }
    #debate-screen .db-archive-card { position: relative; min-width: 200px; background: rgba(20,20,20,0.6); border: 1px solid var(--db-glass-border); border-radius: 16px; padding: 16px; cursor: pointer; transition: 0.3s; flex-shrink: 0; }
    #debate-screen .db-archive-card:hover { border-color: rgba(255,255,255,0.2); background: rgba(30,30,30,0.8); }
    #debate-screen .db-archive-name { font-family: var(--db-font-serif-zh); font-size: 1rem; font-weight: 700; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #debate-screen .db-archive-meta { font-family: var(--db-font-sans-en); font-size: 0.6rem; color: var(--db-text-dim); letter-spacing: 1px; display: flex; justify-content: space-between; }
    #debate-screen .db-archive-del { position: absolute; top: 12px; right: 12px; color: #D32F2F; background: transparent; border: none; cursor: pointer; opacity: 0.5; transition: 0.3s; }
    #debate-screen .db-archive-card:hover .db-archive-del { opacity: 1; }

    /* 身份设置区 */
    #debate-screen .identity-box { display:flex; align-items:center; gap:16px; background:var(--db-glass-bg); padding:16px; border:1px solid var(--db-glass-border); border-radius:16px; transition:0.3s; }
    #debate-screen .identity-box:hover { border-color: rgba(255,255,255,0.2); }
    #debate-screen .id-avatar-wrap { position:relative; width:56px; height:56px; border-radius:50%; flex-shrink:0; cursor:pointer; border:1px solid var(--db-text-dim); }
    #debate-screen .id-avatar-wrap img { width:100%; height:100%; object-fit:cover; border-radius:50%; }
    #debate-screen .id-avatar-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.5); border-radius:50%; display:flex; align-items:center; justify-content:center; opacity:0; transition:0.2s; }
    #debate-screen .id-avatar-wrap:hover .id-avatar-overlay { opacity:1; }
    #debate-screen .id-name-input { background:transparent; border:none; border-bottom:1px solid var(--db-text-dim); color:var(--db-text-pure); font-family:var(--db-font-serif-en); font-size:1.2rem; outline:none; width:100%; padding-bottom:4px; font-weight:700; letter-spacing:1px; transition:0.3s;}
    #debate-screen .id-name-input:focus { border-bottom-color: var(--db-text-pure); }

    /* 卡片与网格 */
    #debate-screen .mode-list { display: flex; flex-direction: column; gap: 16px; }
    #debate-screen .mode-card { position: relative; overflow: hidden; padding: 24px; cursor: pointer; background: linear-gradient(145deg, rgba(30,30,30,0.5), rgba(10,10,10,0.8)); border: 1px solid var(--db-glass-border); border-radius: 20px; display: flex; justify-content: space-between; align-items: center; transition: all 0.4s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); flex-shrink: 0; }
    #debate-screen .mode-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--db-text-pure); transform: scaleY(0); transform-origin: center; transition: 0.4s; }
    #debate-screen .mode-left { display: flex; flex-direction: column; }
    #debate-screen .mode-left .en-title { font-family: var(--db-font-serif-en); font-size: 1.8rem; line-height: 1; margin-bottom: 8px; color: var(--db-text-dim); transition: 0.4s; }
    #debate-screen .mode-left .desc { font-family: var(--db-font-sans-en); font-size: 0.65rem; letter-spacing: 0.1em; color: rgba(255,255,255,0.4); text-transform: uppercase; }
    #debate-screen .mode-right { text-align: right; }
    #debate-screen .mode-right .zh-title { font-family: var(--db-font-serif-zh); font-size: 1.2rem; font-weight: 700; margin-bottom: 4px; }
    #debate-screen .mode-card:hover { border-color: rgba(255,255,255,0.2); transform: translateY(-2px); }
    #debate-screen .mode-card.active { border-color: var(--db-text-pure); background: rgba(255,255,255,0.05); }
    #debate-screen .mode-card.active::before { transform: scaleY(1); }
    #debate-screen .mode-card.active .mode-left .en-title { color: var(--db-text-pure); text-shadow: 0 0 15px rgba(255,255,255,0.5); }

    #debate-screen .slit-input { border-radius: 16px; padding: 4px 4px 4px 16px; display: flex; align-items: center; margin-bottom: 16px; position: relative; border: 1px solid var(--db-glass-border); background: var(--db-glass-bg); backdrop-filter: blur(20px); }
    #debate-screen .slit-input input { flex: 1; border: none; background: transparent; font-family: var(--db-font-serif-zh); font-size: 1.1rem; color: var(--db-text-pure); outline: none; }
    #debate-screen .slit-input input::placeholder { font-family: var(--db-font-sans-zh); font-size: 0.9rem; color: var(--db-text-dim); }

    #debate-screen .cast-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    #debate-screen .target-card { position: relative; cursor: pointer; border-radius: 16px; overflow: hidden; flex-shrink: 0; border: 1.5px solid transparent; transition: 0.3s; }
    #debate-screen .target-img { width: 100%; aspect-ratio: 3/4; object-fit: cover; filter: contrast(1.1) brightness(0.85); transition: all 0.5s ease; border-radius: 16px; display: block; }
    #debate-screen .target-info { position: absolute; bottom: 0; left: 0; width: 100%; padding: 32px 16px 16px; background: linear-gradient(to top, rgba(0,0,0,0.95), transparent); display: flex; flex-direction: column; pointer-events: none; }
    #debate-screen .target-info .name { font-family: var(--db-font-serif-en); font-size: 1.2rem; font-weight: 700; letter-spacing: 1px; color: var(--db-text-pure); }
    #debate-screen .target-info .db-role-tag { font-family: var(--db-font-sans-en); font-size: 0.55rem; color: var(--db-text-dim); letter-spacing: 0.15em; margin-top: 4px; text-transform: uppercase; border: none; padding: 0; background: transparent; }
    #debate-screen .target-card.active { border-color: var(--db-text-pure); box-shadow: 0 10px 30px rgba(255,255,255,0.05); }
    #debate-screen .target-card.active .target-img { filter: contrast(1.1) brightness(1.1); transform: scale(1.05); }

    #debate-screen .stance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    #debate-screen .stance-card { padding: 16px; border: 1px solid var(--db-glass-border); border-radius: 16px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: 0.3s; background: rgba(20,20,20,0.5); flex-shrink: 0; }
    #debate-screen .stance-card .zh { font-family: var(--db-font-serif-zh); font-size: 1.1rem; font-weight: 700; }
    #debate-screen .stance-card .en { font-family: var(--db-font-sans-en); font-size: 0.6rem; letter-spacing: 0.1em; color: var(--db-text-dim); }
    #debate-screen .stance-card.active { border-color: var(--db-text-pure); background: rgba(255,255,255,0.1); }
    #debate-screen .stance-card.active .en { color: var(--db-text-pure); }

    #debate-screen .dock-bar { position: absolute; bottom: 0; left: 0; width: 100%; padding: 24px; z-index: 20; background: linear-gradient(to top, var(--db-bg-base) 60%, transparent); }
    #debate-screen .btn-execute { width: 100%; padding: 20px 0; border-radius: 100px; color: var(--db-text-pure); background: rgba(255,255,255,0.05); font-family: var(--db-font-sans-en); font-size: 1rem; letter-spacing: 0.3em; text-transform: uppercase; border: 1px solid var(--db-glass-border); cursor: pointer; transition: 0.5s; opacity: 0.3; pointer-events: none; display: flex; justify-content: center; align-items: center; backdrop-filter: var(--db-blur-strong); }
    #debate-screen .btn-execute.ready { opacity: 1; pointer-events: auto; }
    #debate-screen .btn-execute.ready:hover { background: var(--db-text-pure); color: var(--db-bg-base); box-shadow: 0 0 30px rgba(255,255,255,0.2); }

    /* ARENA VIEW */
    #debate-screen .arena-header { padding: calc(env(safe-area-inset-top, 20px) + 16px) 24px 16px; z-index: 20; background: linear-gradient(to bottom, rgba(3,3,3,1) 40%, transparent); }
    #debate-screen .ah-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    #debate-screen .nav-btn { width: 36px; height: 36px; border-radius: 50%; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: var(--db-text-pure); display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; transition: 0.3s; }
    #debate-screen .nav-btn:hover { background: rgba(255,255,255,0.1); }
    #debate-screen .status-zone { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 100px; border: 1px solid var(--db-glass-border); backdrop-filter: blur(10px); }
    #debate-screen .status-text { font-family: var(--db-font-sans-en); font-size: 0.65rem; letter-spacing: 0.15em; text-transform: uppercase; }
    #debate-screen .status-star { font-family: var(--db-font-serif-en); font-size: 0.8rem; animation: starPulse 2s infinite; }
    #debate-screen .ah-topic { font-family: var(--db-font-serif-zh); font-size: 1.1rem; font-weight: 500; text-align: center; color: var(--db-text-pure); padding: 0 12px; line-height: 1.5; word-break: break-word; }

    #debate-screen .arena-stream { flex: 1; overflow-y: auto; padding: 16px 24px 140px; display: flex; flex-direction: column; gap: 24px; scroll-behavior: smooth; scrollbar-width: none; position: relative; z-index: 10; }
    #debate-screen .arena-stream::-webkit-scrollbar { display: none; }

    #debate-screen .dialogue-card { background: rgba(15, 15, 15, 0.7); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 1px solid var(--db-glass-border); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; gap: 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.5); animation: cardIn 0.6s cubic-bezier(0.16, 1, 0.3, 1); position: relative; overflow: hidden; flex-shrink: 0; }
    #debate-screen .dialogue-card.user { border-color: rgba(255, 255, 255, 0.2); background: rgba(25, 25, 25, 0.8); }
    #debate-screen .card-header { display: flex; justify-content: space-between; align-items: flex-start; }
    #debate-screen .card-user-info { display: flex; align-items: center; gap: 12px; }
    #debate-screen .card-avatar { width: 44px; height: 44px; border-radius: 12px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); }
    #debate-screen .card-name-stack { display: flex; flex-direction: column; gap: 2px; }
    #debate-screen .card-name { font-family: var(--db-font-serif-en); font-size: 1.05rem; font-weight: 700; letter-spacing: 0.5px; color: var(--db-text-pure);}
    #debate-screen .dialogue-card.user .card-name { font-family: var(--db-font-serif-zh); }
    #debate-screen .card-handle { font-family: var(--db-font-sans-en); font-size: 0.6rem; color: var(--db-text-dim); letter-spacing: 0.05em; text-transform: uppercase; }
    #debate-screen .card-header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    #debate-screen .card-tag { font-family: var(--db-font-sans-en); font-size: 0.55rem; letter-spacing: 0.2em; color: var(--db-text-pure); border: 1px solid var(--db-glass-border); padding: 3px 8px; border-radius: 100px; text-transform: uppercase; line-height: 1; }
    #debate-screen .card-time { font-family: var(--db-font-sans-en); font-size: 0.55rem; color: var(--db-text-dim); letter-spacing: 0.05em; }
    #debate-screen .card-content { font-family: var(--db-font-serif-zh); font-size: 13px; line-height: 1.8; color: rgba(255,255,255,0.9); text-align: justify; letter-spacing: 0.5px; position: relative; z-index: 2; }
    #debate-screen .dialogue-card.user .card-content { color: var(--db-text-pure); font-weight: 500; }

    /* 路人共振/弹幕折叠卡片 */
    #debate-screen .passerby-box { width: 88%; margin: 16px auto 8px; background: rgba(20, 20, 20, 0.4); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 0.5px solid rgba(255, 255, 255, 0.06); border-radius: 16px; overflow: hidden; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05); flex-shrink: 0; }
    #debate-screen .pb-header { padding: 14px; font-family: 'Space Mono', monospace; font-size: 0.6rem; color: rgba(255,255,255,0.4); text-align: center; letter-spacing: 2px; text-transform: uppercase; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: 0.3s; background: rgba(0,0,0,0.3); }
    #debate-screen .pb-header:active { background: rgba(255,255,255,0.05); }
    #debate-screen .pb-header i { transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); font-size: 0.9rem; }
    #debate-screen .passerby-box.open .pb-header i { transform: rotate(180deg); color: #fff; }
    #debate-screen .passerby-box.open .pb-header { color: rgba(255,255,255,0.8); border-bottom: 0.5px solid rgba(255,255,255,0.04); }
    #debate-screen .pb-content { display: none; flex-direction: column; gap: 20px; padding: 20px 20px 24px; }
    #debate-screen .passerby-box.open .pb-content { display: flex; animation: emerge 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
    #debate-screen .pb-item { display: flex; flex-direction: column; gap: 6px; position: relative; padding-left: 14px; }
    #debate-screen .pb-item::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 0; width: 1px; background: linear-gradient(to bottom, rgba(255,255,255,0.3), transparent); }
    #debate-screen .pb-user { font-family: 'Space Mono', monospace; font-size: 0.55rem; color: rgba(255,255,255,0.3); letter-spacing: 1px; }
    #debate-screen .pb-text { font-family: var(--db-font-sans-zh); font-size: 0.8rem; color: rgba(255,255,255,0.85); line-height: 1.6; text-align: justify; font-weight: 300; }

    #debate-screen .arena-bottom { position: absolute; bottom: 0; left: 0; width: 100%; padding: 0 24px calc(env(safe-area-inset-bottom, 20px) + 12px); background: linear-gradient(to top, rgba(0,0,0,0.95) 50%, transparent); z-index: 20; }
    #debate-screen .console-panel { background: rgba(18, 18, 18, 0.85); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 1px solid var(--db-glass-highlight); border-radius: 20px; padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); }
    #debate-screen .console-actions { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--db-glass-border); padding-bottom: 10px; }
    #debate-screen .action-btn { background: transparent; border: none; font-family: var(--db-font-sans-en); font-size: 0.6rem; letter-spacing: 0.15em; color: var(--db-text-dim); cursor: pointer; text-transform: uppercase; transition: 0.3s; display: flex; align-items: center; gap: 6px; }
    #debate-screen .action-btn:hover { color: var(--db-text-pure); }
   #debate-screen .console-input-row { display: flex; align-items: center; gap: 12px; }
    #debate-screen .console-input-row textarea { 
      flex: 1; border: none; background: transparent; font-family: var(--db-font-sans-zh); 
      font-size: 13px; color: var(--db-text-pure); outline: none; resize: none; 
      min-height: 20px; max-height: 100px; padding: 4px 0 0; line-height: 1.5;
    }
    #debate-screen .console-input-row textarea::placeholder { color: var(--db-text-dim); }
    #debate-screen .console-input-row textarea:disabled { opacity: 0.5; }
    #debate-screen .send-btn { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 1px solid var(--db-glass-border); color: var(--db-text-pure); display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; transition: 0.3s; flex-shrink: 0;}
    #debate-screen .send-btn:active { transform: scale(0.9); }
    #debate-screen .typing-dots { display: flex; gap: 4px; padding: 4px 0; }
    #debate-screen .tdot { width: 5px; height: 5px; background: rgba(255,255,255,0.3); border-radius: 50%; animation: fadeDot 1s infinite alternate; }
    #debate-screen .tdot:nth-child(2) { animation-delay: 0.3s; }
    #debate-screen .tdot:nth-child(3) { animation-delay: 0.6s; }
    #debate-screen .sys-banner { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 12px 0; opacity: 0.6; }
    #debate-screen .sys-banner::before, #debate-screen .sys-banner::after { content: ''; height: 1px; flex: 1; background: var(--db-glass-border); }
    #debate-screen .sys-banner-text { font-family: var(--db-font-sans-zh); font-size: 0.65rem; letter-spacing: 0.1em; color: var(--db-text-dim); white-space: nowrap; }

    /* Modal (存档命名) */
    #debate-screen .db-modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); z-index: 999; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: 0.3s; }
    #debate-screen .db-modal-overlay.active { opacity: 1; pointer-events: auto; }
    #debate-screen .db-modal-box { background: #111; border: 1px solid var(--db-glass-border); border-radius: 20px; padding: 32px 24px; width: 85%; max-width: 320px; box-shadow: 0 30px 60px rgba(0,0,0,0.5); transform: translateY(20px); transition: 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
    #debate-screen .db-modal-overlay.active .db-modal-box { transform: translateY(0); }
    #debate-screen .db-modal-title { font-family: var(--db-font-serif-en); font-size: 1.2rem; color: var(--db-text-pure); margin-bottom: 16px; text-align: center; }
    #debate-screen .db-modal-input { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 12px; font-family: var(--db-font-sans-zh); color: var(--db-text-pure); font-size: 1rem; outline: none; margin-bottom: 24px; text-align: center; }
    #debate-screen .db-modal-actions { display: flex; gap: 12px; }
    #debate-screen .db-modal-btn { flex: 1; padding: 12px 0; border-radius: 100px; font-family: var(--db-font-sans-en); font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; border: none; transition: 0.2s; }
    #debate-screen .db-modal-btn.cancel { background: transparent; color: var(--db-text-dim); border: 1px solid var(--db-text-dim); }
    #debate-screen .db-modal-btn.confirm { background: var(--db-text-pure); color: #000; }
    /* 🌟 新增：重Roll按钮样式 */
    #debate-screen .chr-top { display: flex; align-items: center; gap: 8px; }
    #debate-screen .reroll-btn { background: transparent; border: none; color: var(--db-text-dim); cursor: pointer; font-size: 0.85rem; padding: 2px; transition: 0.4s; display: flex; align-items: center; justify-content: center; }
    #debate-screen .reroll-btn:active { transform: rotate(180deg); color: var(--db-text-pure); }
    /* 🌟 裁决报告 Modal & Clickable Banner */
    #debate-screen .verdict-content { font-family: 'Space Mono', var(--db-font-serif-zh); white-space: pre-wrap; line-height: 1.8; font-size: 0.8rem; color: rgba(255,255,255,0.85); text-align: left; }
    #debate-screen .verdict-content strong { color: var(--db-text-pure); font-weight: 700; }
    #debate-screen .sys-banner.clickable { cursor: pointer; transition: 0.3s; }
    #debate-screen .sys-banner.clickable:hover .sys-banner-text { color: var(--db-text-pure); text-shadow: 0 0 8px rgba(255,255,255,0.5); }
    #debate-screen .sys-banner.clickable i { margin-right: 6px; font-size: 0.8rem; }
  `;
  document.head.appendChild(style);

  // 2. 注入 HTML (修正嵌套版)
  const htmlContent = `
    <div id="debate-screen" class="screen">
      <div class="ambient-layer">
        <div class="ambient-glow"></div>
        <svg class="destiny-line" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M -10,0 C 40,30 60,70 110,100" /><path d="M 110,0 C 60,30 40,70 -10,100" opacity="0.5"/></svg>
        <div class="vert-text">SYS.PROTOCOL // VER.5.0</div>
      </div>

      <div class="app-container">
        <!-- SETUP VIEW -->
        <div id="db-view-setup" class="db-view active">
          <button class="btn-back-setup" onclick="DebateModule.close()">BACK</button>
          <div class="setup-scroll">
            <div class="hero-header">
              <div class="bg-text">SESSION</div>
              <span class="title-en">DIALECTICAL ARENA</span>
              <h1 class="title-zh">观点修罗场</h1>
            </div>

            <!-- 00. 存档列表区 -->
            <div class="sect unlocked" id="db-sec-archives" style="display:none;">
              <div class="sect-title"><span class="num">00</span><span class="zh">读取档案坐标</span></div>
              <div class="archive-list" id="db-archive-list"></div>
            </div>

            <!-- ID. 身份设置区 -->
            <div class="sect unlocked" id="db-sec-identity">
              <div class="sect-title"><span class="num">ID</span><span class="zh">参战身份覆写</span></div>
              <div class="identity-box">
                <div class="id-avatar-wrap" onclick="document.getElementById('db-user-avatar-upload').click()">
                  <img id="db-user-avatar-preview" src="">
                  <div class="id-avatar-overlay"><i class="ph-bold ph-camera" style="color:#fff;"></i></div>
                </div>
                <input type="text" id="db-user-name-input" class="id-name-input" placeholder="输入你的代号..." onblur="DebateModule.saveIdentity()">
              </div>
              <input type="file" id="db-user-avatar-upload" accept="image/*" style="display:none" onchange="DebateModule.handleAvatarUpload(event)">
            </div>

            <!-- 01. 模式选择 -->
            <div class="sect unlocked" id="db-sec-mode">
              <div class="sect-title"><span class="num">01</span><span class="zh">空间协议模式</span></div>
              <div class="mode-list">
                <div class="mode-card" onclick="DebateModule.selectMode('1v1', this)">
                  <div class="mode-left"><span class="en-title">1 V 1</span><span class="desc">Single Entity Confrontation</span></div>
                  <div class="mode-right"><div class="zh-title">单体对决</div></div>
                </div>
                <div class="mode-card" onclick="DebateModule.selectMode('rt', this)">
                  <div class="mode-left"><span class="en-title">MULTI</span><span class="desc">Simultaneous Agent Injection</span></div>
                  <div class="mode-right"><div class="zh-title">多重映射</div></div>
                </div>
              </div>
            </div>

            <!-- 02. 注入核心数据 -->
            <div class="sect" id="db-sec-topic">
              <div class="sect-title"><span class="num">02</span><span class="zh">注入核心数据</span></div>
              <div class="slit-input">
                <input type="text" id="db-inp-custom-topic" placeholder="键入哲学或现实探讨..." oninput="DebateModule.customTopic(this.value)">
                <button class="icon-btn" onclick="DebateModule.promptSaveTopic()"><i class="ph-light ph-asterisk"></i></button>
              </div>
              <!-- 议题标签库 -->
              <div id="db-topic-tags" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;"></div>
            </div>

            <!-- 03. 选择代理节点 -->
            <div class="sect" id="db-sec-cast">
              <div class="sect-title">
                <span class="num">03</span><span class="zh">选择代理节点</span>
                <span class="num" id="db-cast-limit" style="margin-left:auto; background:transparent;">0/1</span>
              </div>
              <div class="cast-grid" id="db-cast-grid"></div>
            </div>

            <!-- 04. 锚定自身坐标 -->
            <div class="sect" id="db-sec-stance" style="display: none;">
              <div class="sect-title"><span class="num">04</span><span class="zh">锚定自身坐标</span></div>
              <div class="stance-grid">
                <div class="stance-card" onclick="DebateModule.selectStance('pro', this)"><span class="zh">正向拥护</span><span class="en">PROPOSER</span></div>
                <div class="stance-card" onclick="DebateModule.selectStance('con', this)"><span class="zh">逆向解构</span><span class="en">OPPONENT</span></div>
              </div>
            </div>
          </div> <!-- End setup-scroll -->

          <div class="dock-bar">
            <button class="btn-execute" id="db-btn-start" onclick="DebateModule.start()"><span>Initialize Protocol</span></button>
          </div>
        </div>

        <!-- ARENA VIEW -->
        <div id="db-view-arena" class="db-view">
          <div class="arena-header">
            <div class="ah-top">
              <button class="nav-btn" onclick="DebateModule.exit()"><i class="ph-light ph-caret-left"></i></button>
              <div class="status-zone">
                <span class="status-star" id="db-status-dot">✦</span>
                <span class="status-text" id="db-turn-indicator">STANDBY</span>
              </div>
              <button class="nav-btn" onclick="DebateModule.promptSaveRoom()"><i class="ph-light ph-floppy-disk"></i></button>
            </div>
            <div class="ah-topic" id="db-arena-topic">加载中...</div>
          </div>
          <div class="arena-stream" id="db-arena-stream"></div>
          <div class="arena-bottom">
            <div class="console-panel">
              <div class="console-actions">
                <button class="action-btn" onclick="DebateModule.conclude()"><i class="ph-light ph-power"></i> 终止程序</button>
                <button class="action-btn skip" id="db-btn-skip" onclick="DebateModule.skipTurn()"><i class="ph-bold ph-fast-forward"></i> 跳过回合</button>
              </div>
              <div class="console-input-row">
                <textarea id="db-inp-judge" rows="1" placeholder="输入论点覆写指令...（回车换行）"></textarea>
                <button class="send-btn" id="db-send-btn" onclick="DebateModule.userSpeak()"><i class="ph-bold ph-paper-plane-right"></i></button>
              </div>
            </div>
          </div>
        </div>
      </div> <!-- End app-container -->

      <!-- Modals (置于顶层) -->
      <div class="db-modal-overlay" id="db-save-modal">
        <div class="db-modal-box">
          <div class="db-modal-title">SAVE SESSION</div>
          <input type="text" id="db-save-name-input" class="db-modal-input" placeholder="给这场修罗场命名...">
          <div class="db-modal-actions">
            <button class="db-modal-btn cancel" onclick="document.getElementById('db-save-modal').classList.remove('active')">CANCEL</button>
            <button class="db-modal-btn confirm" onclick="DebateModule.confirmSaveRoom()">CONFIRM</button>
          </div>
        </div>
      </div>
    
      <div class="db-modal-overlay" id="db-save-topic-modal">
        <div class="db-modal-box">
          <div class="db-modal-title">SAVE TOPIC</div>
          <input type="text" id="db-save-topic-name" class="db-modal-input" placeholder="给这个议题起个短名...">
          <div class="db-modal-actions">
            <button class="db-modal-btn cancel" onclick="document.getElementById('db-save-topic-modal').classList.remove('active')">CANCEL</button>
            <button class="db-modal-btn confirm" onclick="DebateModule.confirmSaveTopic()">SAVE</button>
          </div>
        </div>
      </div>
      <!-- 裁决报告 Modal -->
      <div class="db-modal-overlay" id="db-verdict-modal">
        <div class="db-modal-box" style="max-width: 400px; width: 90%; background: rgba(10,10,10,0.95); border: 1px solid rgba(255,255,255,0.15);">
          <div class="db-modal-title" style="letter-spacing: 4px; color: #fff; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 12px; margin-bottom: 16px;">THE VERDICT</div>
          <div id="db-verdict-content" class="verdict-content">报告生成中...</div>
          <div class="db-modal-actions" style="margin-top: 24px;">
            <button class="db-modal-btn confirm" style="width: 100%;" onclick="document.getElementById('db-verdict-modal').classList.remove('active')">ACKNOWLEDGE / 确认查阅</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.querySelector('.device')?.insertAdjacentHTML('beforeend', htmlContent));
  } else {
    document.querySelector('.device')?.insertAdjacentHTML('beforeend', htmlContent);
  }

  // ============================================================
  // 数据与状态
  // ============================================================
  const State = {
    roomId: null, // 当前房间的 ID（如果是读档的）
    mode: null, topic: null, chars:[], userStance: null,
    userName: 'User', userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
  };
  
  let _turnQueue =[];
  let _turnIndex = 0;
  let _isProcessing = false;
  let _realChars =[];
  let _history =[]; // { role:'agent'|'user', charId, name, text, roleEng, time, bystanders:[] }
  let _initialized = false;

  function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  // ============================================================
  // 存档系统逻辑 (Archiving)
  // ============================================================
  async function loadArchives() {
    try {
      const rooms = await DB.settings.get('debate-rooms') ||[];
      const listEl = document.getElementById('db-archive-list');
      const secEl = document.getElementById('db-sec-archives');
      
      if (rooms.length === 0) {
        secEl.style.display = 'none';
        return;
      }
      secEl.style.display = 'block';
      
      listEl.innerHTML = rooms.sort((a,b) => b.updatedAt - a.updatedAt).map(r => `
        <div class="db-archive-card" onclick="DebateModule.resumeRoom('${r.id}')">
          <div class="db-archive-name">${r.name}</div>
          <div class="db-archive-meta">
            <span>${r.mode === '1v1' ? '单体对决' : '多重映射'}</span>
            <span>${r.history.length} ROUNDS</span>
          </div>
          <button class="db-archive-del" onclick="event.stopPropagation(); DebateModule.deleteRoom('${r.id}')"><i class="ph-bold ph-x"></i></button>
        </div>
      `).join('');
    } catch(e) {}
  }

  function promptSaveRoom() {
    document.getElementById('db-save-name-input').value = State.topic || '未命名对决';
    document.getElementById('db-save-modal').classList.add('active');
  }

  async function confirmSaveRoom() {
    const name = document.getElementById('db-save-name-input').value.trim();
    if (!name) return Toast.show('名称不能为空');

    document.getElementById('db-save-modal').classList.remove('active');
    
    const roomData = {
      id: State.roomId || ('db_' + Date.now()),
      name: name,
      mode: State.mode,
      topic: State.topic,
      chars: State.chars,
      userStance: State.userStance,
      history: _history,
      turnIndex: _turnIndex,
      turnQueue: _turnQueue,
      updatedAt: Date.now()
    };

    State.roomId = roomData.id; // 更新当前 ID

    try {
      let rooms = await DB.settings.get('debate-rooms') ||[];
      const idx = rooms.findIndex(r => r.id === roomData.id);
      if (idx >= 0) rooms[idx] = roomData;
      else rooms.push(roomData);
      await DB.settings.set('debate-rooms', rooms);
      Toast.show('空间数据已存入矩阵');
      loadArchives(); // 刷新 Setup 列表
    } catch(e) { console.error(e); Toast.show('存档失败'); }
  }

  async function deleteRoom(id) {
    if (!confirm('确定销毁该档案？')) return;
    try {
      let rooms = await DB.settings.get('debate-rooms') ||[];
      rooms = rooms.filter(r => r.id !== id);
      await DB.settings.set('debate-rooms', rooms);
      loadArchives();
    } catch(e) {}
  }
  
  // 🌟 自动同步进度到现有存档
  async function _autoSaveProgress() {
    if (!State.roomId) return; // 如果是新开局还没点过保存，不自动建档
    try {
      let rooms = await DB.settings.get('debate-rooms') || [];
      const idx = rooms.findIndex(r => r.id === State.roomId);
      if (idx >= 0) {
        rooms[idx].history = _history;
        rooms[idx].turnIndex = _turnIndex;
        rooms[idx].turnQueue = _turnQueue;
        rooms[idx].updatedAt = Date.now();
        await DB.settings.set('debate-rooms', rooms);
        console.log("[Debate] 进度已自动同步至存档");
      }
    } catch(e) { console.warn("自动存档失败", e); }
  }

  function resumeRoom(id) {
    DB.settings.get('debate-rooms').then(rooms => {
      const r = (rooms ||[]).find(x => x.id === id);
      if (!r) return;

      // 恢复 State
      State.roomId = r.id;
      State.mode = r.mode;
      State.topic = r.topic;
      State.chars = r.chars;
      State.userStance = r.userStance;
      _history = r.history || [];
      _turnQueue = r.turnQueue ||[];
      _turnIndex = r.turnIndex || 0;

      document.getElementById('db-view-setup').classList.remove('active');
      document.getElementById('db-view-arena').classList.add('active');
      document.getElementById('db-arena-topic').textContent = `「 ${State.topic} 」`;
      
      _renderHistory();
      _updateTurnUI();
    });
  }

  function _renderHistory() {
    const stream = document.getElementById('db-arena-stream');
    stream.innerHTML = '';
    
    _history.forEach(m => {
    
    // 🌟 新增：处理裁决报告的读档渲染
      if (m.role === 'sys-verdict') {
        const msgIdx = _history.indexOf(m);
        stream.innerHTML += `
          <div class="sys-banner clickable" onclick="DebateModule.showVerdict(${msgIdx})">
            <span class="sys-banner-text" style="color:var(--db-text-pure); font-weight:700;">
              <i class="ph-bold ph-scales"></i>${m.text}
            </span>
          </div>`;
        return;
      }
      
      // 1. 系统消息
      if (m.role === 'sys') {
        stream.innerHTML += `<div class="sys-banner"><span class="sys-banner-text">${m.text}</span></div>`;
        return;
      }

      // 2. 头像和名字
      let avatarUrl = State.userAvatar;
      let handle = '@user_host';
      if (m.role === 'agent') {
        const c = _realChars.find(x => String(x.id) === m.charId);
        if (c) { avatarUrl = c._avatar; handle = c._handle; }
      }

      // 3. 吃瓜群众弹幕折叠框
      let passerbyHtml = '';
      if (m.bystanders && m.bystanders.length > 0) {
        const pbItems = m.bystanders.map(b => {
          const fakeId = 'ANON_' + Math.floor(Math.random() * 9000 + 1000);
          return `<div class="pb-item"><div class="pb-user">${fakeId}</div><div class="pb-text">${b}</div></div>`;
        }).join('');
        passerbyHtml = `
          <div class="passerby-box" onclick="this.classList.toggle('open')">
            <div class="pb-header">
              <i class="ph-bold ph-wifi-high"></i><span>Intercepted ${m.bystanders.length} Signals</span><i class="ph-bold ph-caret-down"></i>
            </div>
            <div class="pb-content">${pbItems}</div>
          </div>`;
      }

      // 4. 兼容老存档ID
      if (!m.id) m.id = `db-msg-${Math.random().toString(36).substr(2,9)}`;

      // 5. 🌟 核心：右侧按钮组（把播放按钮、重Roll按钮和标签拼在一起）
      let tagAreaHtml = `<span class="card-tag" style="border-color:var(--db-text-pure);">${m.roleEng}</span>`;
      if (m.role === 'agent') {
        const msgIdx = _history.indexOf(m);
        tagAreaHtml = `
          <div class="chr-top">
            <button onclick="DebateModule.playVoice(${msgIdx}, '${m.charId}', this)" style="background:transparent;border:none;color:var(--db-text-dim);cursor:pointer;font-size:1.1rem;transition:0.2s;" onmousedown="this.style.color='#fff'" onmouseup="this.style.color='var(--db-text-dim)'" title="语音播报"><i class="ph-fill ph-waveform"></i></button>
            <button class="reroll-btn" onclick="DebateModule.rerollMsg('${m.id}')" title="重新生成"><i class="ph-bold ph-arrows-clockwise"></i></button>
            <span class="card-tag">${m.roleEng}</span>
          </div>`;
      }

      // 6. 渲染到页面
      stream.innerHTML += `
        <div class="dialogue-card ${m.role === 'user' ? 'user' : ''}" id="${m.id}">
          <div class="card-header">
            <div class="card-user-info">
              <img src="${avatarUrl}" class="card-avatar" ${m.role==='user'?'style="border-color:var(--db-text-pure);"':''}>
              <div class="card-name-stack"><span class="card-name">${m.name}</span><span class="card-handle">${handle}</span></div>
            </div>
            <div class="card-header-right">
              ${tagAreaHtml}
              <span class="card-time">${m.time}</span>
            </div>
          </div>
          <div class="card-content">${m.text}</div>
        </div>
        ${passerbyHtml}
      `;
    });
    _scrollToBottom();
  }
  
  // ============================================================
  // 议题库 (Topic Management)
  // ============================================================
  async function loadTopics() {
    try {
      let topics = await DB.settings.get('debate-saved-topics');
      // 如果没存过，给两个初始范例
      if (!topics || topics.length === 0) {
        topics =[
          { name: '预知分手', text: '如果能预知必定分手，还要不要开始？' },
          { name: '控制欲边界', text: '爱一个人，控制欲是本能还是病态？' }
        ];
      }
      const container = document.getElementById('db-topic-tags');
      if (container) {
        container.innerHTML = topics.map(t => {
          // 巧妙处理文本里的单引号防报错
          const safeText = String(t.text).replace(/'/g, "\\'");
          return `<span class="num" style="cursor:pointer; opacity:0.7; font-size:0.6rem; padding:4px 10px; border:1px solid var(--db-glass-border); border-radius:100px; transition:0.2s;" 
                    onclick="DebateModule.selectTopic('${safeText}', this)" 
                    onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
                # ${t.name}
              </span>`;
        }).join('');
      }
    } catch(e) { console.error(e); }
  }

  function promptSaveTopic() {
    const text = document.getElementById('db-inp-custom-topic').value.trim();
    if (!text) { Toast.show('请先输入议题内容'); return; }
    
    document.getElementById('db-save-topic-name').value = '';
    document.getElementById('db-save-topic-modal').classList.add('active');
    setTimeout(() => document.getElementById('db-save-topic-name').focus(), 300);
  }

  async function confirmSaveTopic() {
    const name = document.getElementById('db-save-topic-name').value.trim();
    const text = document.getElementById('db-inp-custom-topic').value.trim();
    
    if (!name) { Toast.show('请输入短名标签'); return; }

    try {
      let topics = await DB.settings.get('debate-saved-topics') || [] || [];
      
      // 检查是否已经存在同名议题
      if (topics.some(t => t.name === name)) {
        Toast.show('标签名已存在，请换一个');
        return;
      }

      topics.push({ name: name, text: text });
      await DB.settings.set('debate-saved-topics', topics);
      
      // 关闭弹窗
      document.getElementById('db-save-topic-modal').classList.remove('active');
      Toast.show('议题已封存至本地库');
      
      // 立即刷新下方的标签列表
      loadTopics();
    } catch(e) {
      console.error(e);
      Toast.show('保存议题失败');
    }
  }

  // ============================================================
  // Setup 逻辑 (真实数据直连)
  // ============================================================
  async function _initSetup() {
    try {
      const profile = await DB.settings.get('global-profile');
      State.userName = profile?.name || 'User';
      if (profile && profile.avatarKey) {
        State.userAvatar = await Assets.getUrl(profile.avatarKey).catch(() => State.userAvatar) || State.userAvatar;
      }
      const debateName = await DB.settings.get('debate-user-name');
      const debateAv = await DB.settings.get('debate-user-avatar');
      if (debateName) State.userName = debateName;
      if (debateAv) State.userAvatar = await Assets.getUrl(debateAv).catch(() => State.userAvatar) || State.userAvatar;

      document.getElementById('db-user-name-input').value = State.userName;
      document.getElementById('db-user-avatar-preview').src = State.userAvatar;

      _realChars = await DB.characters.getAll();
    } catch(e) { _realChars =[]; }

    const grid = document.getElementById('db-cast-grid');
    if (!grid) return;

    if (_realChars.length === 0) {
      grid.innerHTML = '<div style="grid-column: span 2; text-align: center; font-size: 0.8rem; color: var(--db-text-dim);">暂无角色档案，请先在首页创建</div>';
      _initialized = true; return;
    }

    let html = '';
    for (const c of _realChars) {
      let avatarUrl = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=300'; 
      if (c.avatarUrl) avatarUrl = await Assets.getUrl(c.avatarUrl).catch(() => avatarUrl) || avatarUrl;
      else avatarUrl = await Assets.getUrl(`char-avatar-${c.id}`).catch(() => avatarUrl) || avatarUrl;

      const handle = '@' + c.name.toLowerCase().replace(/\s+/g, '_');
      const tag = c.mbti ? c.mbti + ' NODE' : 'AI NODE';
      c._avatar = avatarUrl; c._handle = handle; c._tag = tag;

      html += `
        <div class="target-card" data-id="${c.id}" onclick="DebateModule.selectChar('${c.id}', this)">
          <div class="corner-1"></div><div class="corner-2"></div>
          <img src="${avatarUrl}" class="target-img">
          <div class="target-info">
            <span class="name">${c.name}</span>
            <span class="db-role-tag">${tag}</span>
          </div>
        </div>`;
    }
    grid.innerHTML = html;
    
    // 初始化存档列表
    loadArchives();
    
    _initialized = true;
    await loadTopics();
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const key = `debate-avatar-${Date.now()}`;
      const url = await Assets.save(key, file, 400, 0.85);
      await DB.settings.set('debate-user-avatar', key);
      State.userAvatar = url;
      document.getElementById('db-user-avatar-preview').src = url;
    } catch(err) {}
    e.target.value = '';
  }

  function saveIdentity() {
    const name = document.getElementById('db-user-name-input').value.trim();
    if (name) {
      State.userName = name;
      DB.settings.set('debate-user-name', name).catch(()=>{});
    }
  }

  function selectMode(m, el) {
    State.mode = m;
    _singleSelect(el, '.mode-card');
    document.getElementById('db-sec-topic').classList.add('unlocked');
    document.getElementById('db-cast-limit').textContent = m === '1v1' ? '0/1' : '0/3';
    State.chars =[];
    document.querySelectorAll('#debate-screen .target-card').forEach(i => i.classList.remove('active'));
    document.getElementById('db-sec-stance').style.display = m === '1v1' ? 'block' : 'none';
    _checkReady();
  }

  function selectTopic(text, el) { State.topic = text; document.getElementById('db-inp-custom-topic').value = text; document.getElementById('db-sec-cast').classList.add('unlocked'); _checkReady(); }
  function customTopic(val) { if (val.trim()) { State.topic = val.trim(); document.getElementById('db-sec-cast').classList.add('unlocked'); } else { State.topic = null; } _checkReady(); }
  
  function selectChar(id, el) {
    if (State.mode === '1v1') {
      State.chars = [id];
      document.querySelectorAll('#debate-screen .target-card').forEach(i => i.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('db-cast-limit').textContent = '1/1';
      document.getElementById('db-sec-stance').classList.add('unlocked');
    } else {
      const idx = State.chars.indexOf(id);
      if (idx > -1) { State.chars.splice(idx, 1); el.classList.remove('active'); } 
      else { if (State.chars.length >= 3) return; State.chars.push(id); el.classList.add('active'); }
      document.getElementById('db-cast-limit').textContent = `0${State.chars.length}/03`;
    }
    _checkReady();
  }

  function selectStance(stance, el) { State.userStance = stance; _singleSelect(el, '.stance-card'); _checkReady(); }
  function _singleSelect(el, selector) { el.parentElement.querySelectorAll(selector).forEach(c => c.classList.remove('active')); el.classList.add('active'); }

  function _checkReady() {
    const btn = document.getElementById('db-btn-start');
    let ready = false;
    if (State.mode === '1v1') ready = State.topic && State.chars.length === 1 && State.userStance;
    else if (State.mode === 'rt') ready = State.topic && State.chars.length >= 2;
    btn.classList.toggle('ready', ready);
  }
  
  // ============================================================
  // 世界书中枢读取引擎 (WorldBook Extractor)
  // ============================================================
  async function _getWorldBookContext(charIdArray) {
    if (typeof DB.worldInfo === 'undefined') return '';
    try {
      const allWBs = await DB.worldInfo.getAll().catch(()=>[]);
      const activeWBs = allWBs.filter(wb => {
        if (wb.enabled === false) return false;
        if (!wb.scope || !wb.scope.includes('debate')) return false; // 🌟 必须勾选了“辩论注入”才生效
        
        const isGlobal = !wb.characterIds || wb.characterIds.length === 0;
        let isForTheseChars = false;
        if (wb.characterIds) {
          for (const id of charIdArray) {
            if (wb.characterIds.includes(String(id))) {
              isForTheseChars = true; break;
            }
          }
        }
        return isGlobal || isForTheseChars;
      });
      if (activeWBs.length > 0) return activeWBs.map(wb => wb.content.trim()).join('\n\n');
    } catch(e) { console.warn("[Debate] 提取世界书失败", e); }
    return '';
  }

  // ============================================================
  // Arena 引擎与真 API 接入
  // ============================================================
  function start() {
    State.roomId = null; // 新开局，清空 ID
    document.getElementById('db-view-setup').classList.remove('active');
    document.getElementById('db-view-arena').classList.add('active');
    document.getElementById('db-arena-topic').textContent = `「 ${State.topic} 」`;
    document.getElementById('db-arena-stream').innerHTML = '';

    _turnQueue = []; _turnIndex = 0; _history =[];

    if (State.mode === '1v1') {
      const oppId = String(State.chars[0]);
      if (State.userStance === 'pro') _turnQueue = ['user', oppId]; else _turnQueue =[oppId, 'user'];
      _sysMsg(`系统链接已建立 // ${State.userStance === 'pro' ? '等待用户接入' : '对方节点生成中'}`);
    } else {
      State.chars.forEach(id => _turnQueue.push(String(id)));
      _turnQueue.push('user');
      _sysMsg('多重映射阵列 // 已激活');
    }

    _updateTurnUI();
    if (_turnQueue[_turnIndex] !== 'user') setTimeout(nextTurn, 1000);
  }

  function _updateTurnUI() {
    const currentId = _turnQueue[_turnIndex];
    const isUserTurn = currentId === 'user';
    const btnSkip = document.getElementById('db-btn-skip');
    const indicator = document.getElementById('db-turn-indicator');
    const star = document.getElementById('db-status-dot');
    const inp = document.getElementById('db-inp-judge');
    const sendBtn = document.getElementById('db-send-btn');
    
    if (isUserTurn) {
      btnSkip.style.opacity = '1'; btnSkip.style.pointerEvents = 'auto';
      indicator.textContent = 'USER_TURN'; star.style.animation = 'none'; star.style.opacity = '1';
      inp.placeholder = "注入你的逻辑..."; inp.disabled = false; sendBtn.disabled = false;
    } else {
      btnSkip.style.opacity = '0.3'; btnSkip.style.pointerEvents = 'none';
      const char = _realChars.find(c => String(c.id) === currentId);
      indicator.textContent = `SYNC_${char ? char.name : 'UNKNOWN'}`;
      star.style.animation = 'starPulse 1.5s infinite';
      inp.placeholder = "等待节点响应..."; inp.disabled = true; sendBtn.disabled = true;
    }
  }

  function skipTurn() { 
    if (_turnQueue[_turnIndex] !== 'user') return; 
    
    const tag = State.mode === '1v1' ? (State.userStance === 'pro' ? 'PROPOSER' : 'OPPONENT') : 'ORIGIN_NODE';
    const timeStr = getCurrentTime();

    // 🌟 核心逻辑：存入一条“放弃发言”的历史，让大模型看到并针对性反击！
    _history.push({ 
      role: 'user', charId: 'user', name: State.userName, 
      text: "*保持沉默，放弃了本回合发言权*", roleEng: tag, time: timeStr, bystanders:[] 
    });

    // 在界面上打个系统提示
    _sysMsg(`${State.userName} 放弃了本轮反驳机会`);

    _advanceTurn(); 
    setTimeout(nextTurn, 1000); 
    
    // 静默保存进度
    if (typeof _autoSaveProgress === 'function') _autoSaveProgress();
  }

  async function nextTurn() {
    if (_isProcessing) return;
    const currentId = _turnQueue[_turnIndex];
    if (currentId === 'user') return;

    _isProcessing = true;
    const char = _realChars.find(c => String(c.id) === currentId);
    if (!char) { _advanceTurn(); _isProcessing = false; return; }

    // 给这条消息生成永久唯一 ID
    const msgId = `db-msg-${Date.now()}`;
    const typingId = msgId;
    const stream = document.getElementById('db-arena-stream');
    let roleEng = 'AGENT';
    let stanceDesc = '自由辩论';
    if (State.mode === '1v1') {
      roleEng = State.userStance === 'pro' ? 'OPPONENT' : 'PROPOSER';
      stanceDesc = State.userStance === 'pro' ? '反方（坚决反对该观点）' : '正方（坚决支持该观点）';
    } else {
      // 🌟 多人模式：分配节点编号，赋予自由开火权
      roleEng = `NODE_0${State.chars.indexOf(currentId) + 1}`;
      stanceDesc = '根据你的性格，自由且极端地选择站队。你可以认同某人、反驳某人，或者无差别嘲讽所有人！';
    }
    
    stream.innerHTML += `
      <div class="dialogue-card" id="${typingId}">
        <div class="card-header">
          <div class="card-user-info">
            <img src="${char._avatar}" class="card-avatar">
            <div class="card-name-stack"><span class="card-name">${char.name}</span><span class="card-handle">${char._handle}</span></div>
          </div>
          <div class="card-header-right"><span class="card-tag">${roleEng}</span><span class="card-time">${getCurrentTime()}</span></div>
        </div>
        <div class="card-content"><div class="typing-dots"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>
      </div>`;
    _scrollToBottom();

    let mainReply = "信号丢失，生成失败。";
    let bystanders =[];
    const timeStr = getCurrentTime();

    try {
      const activeApi = await DB.api.getActive();
      if (!activeApi) throw new Error('未配置 API');

      const historyStr = _history.map(m => {
        if (m.role === 'sys') return '';
        return `[${m.name}]: ${m.text}`;
      }).filter(Boolean).join('\n');
      
      // 🌟 核心：根据模式动态彻底拆分 Prompt，并强制注入全中文禁令
      let prompt = '';
      const worldBookContext = await _getWorldBookContext([char.id]);
      
      if (State.mode === '1v1') {
        prompt = `[系统指令：1V1 观点修罗场]
你是【${char.name}】，你的性格档案：${char.persona}
${worldBookContext ? `【附加世界观与设定】：\n${worldBookContext}\n` : ''}当前辩论话题：【${State.topic}】
你的立场：【${stanceDesc}】。即使与你本性冲突，你也必须用你的性格去捍卫这个立场！

【全局语言规则（极度重要）】：
无论你的角色背景是哪国人，所有的对话、路人吐槽必须 **100% 仅使用中文** 输出！绝对禁止出现任何英语、日语或其他外语单词！

【场上记录】：
${historyStr || '（你是第一个发言的，请抛出极具杀伤力的开场白）'}

【回复要求（极其重要）】：
1. 你的主发言必须极具攻击性、一针见血，直接嘲讽或反击对方上一句话的漏洞，限制在80字以内！
2. 保持角色独有的腔调，绝不说废话。
3. 必须顺便模拟 5 到 8 个正在围观这场对决的【匿名路人/吃瓜群众】的弹幕吐槽。
4. 严格使用 ||| 作为分隔符！

【输出格式严格如下】：
主发言内容 ||| 路人1的吐槽 ||| 路人2的吐槽 ||| 路人3的吐槽 ||| 路人4的吐槽 ||| 路人5的吐槽`;

      } else {
        prompt = `[系统指令：多重映射 大乱斗]
你是【${char.name}】，你的性格档案：${char.persona}
${worldBookContext ? `【附加世界观与设定】：\n${worldBookContext}\n` : ''}当前争论话题：【${State.topic}】
你的立场策略：【${stanceDesc}】

【全局语言规则（极度重要）】：
无论你的角色背景是哪国人，所有的对话、路人吐槽必须 **100% 仅使用中文** 输出！绝对禁止出现任何英语、日语或其他外语单词！

【场上记录】：
${historyStr || '（你是第一个发言的，请抛出极具杀伤力的开场白确立你的阵营）'}

【回复要求（极其重要）】：
1. 这是一场多方混战。仔细阅读场上记录，抓出你最看不惯的那个人（可以带上他的名字）进行一针见血的嘲讽/反驳；或者拉帮结派赞同某人。限制在80字以内！
2. 保持角色独有的腔调，绝不说废话。
3. 必须顺便模拟 5 到 8 个正在围观这场大乱斗的【匿名路人/吃瓜群众】的弹幕吐槽（路人可以拱火、拉偏架）。
4. 严格使用 ||| 作为分隔符！

【输出格式严格如下】：
主发言内容 ||| 路人1的吐槽 ||| 路人2的吐槽 ||| 路人3的吐槽 ||| 路人4的吐槽 ||| 路人5的吐槽`;
      }

      const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
      
      const parts = response.split('|||').map(s => s.trim()).filter(Boolean);
      mainReply = parts[0] || mainReply; 
      bystanders = parts.slice(1);

    } catch(e) { console.error('[Debate] API Error', e); }

   // 🌟 修复 1：把当前卡片的唯一 ID 存入历史记录中，供重 Roll 时精准制导
    _history.push({
      id: typingId, 
      role: 'agent', charId: currentId, name: char.name,
      text: mainReply, roleEng: roleEng, time: timeStr, bystanders: bystanders
    });

    const msgIdx = _history.length - 1;
    
    // 🌟 修复 2：把 播放按钮 和 重Roll按钮 一起加入卡片
    const playBtnHtml = `<button onclick="DebateModule.playVoice(${msgIdx}, '${currentId}', this)" style="background:transparent;border:none;color:var(--db-text-dim);cursor:pointer;font-size:1.1rem;transition:0.2s;" onmousedown="this.style.color='#fff'" onmouseup="this.style.color='var(--db-text-dim)'" title="语音播报"><i class="ph-fill ph-waveform"></i></button>`;
    const rerollBtnHtml = `<button class="reroll-btn" onclick="DebateModule.rerollMsg('${typingId}')" title="重新生成该回复"><i class="ph-bold ph-arrows-clockwise"></i></button>`;

    const mainCardHtml = `
      <div class="card-header">
        <div class="card-user-info">
          <img src="${char._avatar}" class="card-avatar">
          <div class="card-name-stack"><span class="card-name">${char.name}</span><span class="card-handle">${char._handle}</span></div>
        </div>
        <div class="card-header-right">
          <div class="chr-top">
            ${playBtnHtml}
            ${rerollBtnHtml}
            <span class="card-tag">${roleEng}</span>
          </div>
          <span class="card-time">${timeStr}</span>
        </div>
      </div>
      <div class="card-content">${mainReply}</div>`;

    let passerbyHtml = '';
    if (bystanders.length > 0) {
      const pbItems = bystanders.map(b => {
        const fakeId = 'ANON_' + Math.floor(Math.random() * 9000 + 1000);
        return `<div class="pb-item"><div class="pb-user">${fakeId}</div><div class="pb-text">${b}</div></div>`;
      }).join('');
      passerbyHtml = `
        <div class="passerby-box" onclick="this.classList.toggle('open')">
          <div class="pb-header">
            <i class="ph-bold ph-wifi-high"></i><span>Intercepted ${bystanders.length} Signals</span><i class="ph-bold ph-caret-down"></i>
          </div>
          <div class="pb-content">${pbItems}</div>
        </div>`;
    }

    // 🌟 修复 3：外层替换的 div 必须加上 id="${typingId}"，否则点击重Roll时会找不到目标卡片！
    document.getElementById(typingId).outerHTML = `
      <div class="dialogue-card" id="${typingId}">
        ${mainCardHtml}
      </div>
      ${passerbyHtml}
    `;
    _scrollToBottom();

    _advanceTurn();
    _isProcessing = false;
    _autoSaveProgress();
    if(_turnQueue[_turnIndex] !== 'user') setTimeout(nextTurn, 1000);
  }
  
  // 🌟 重塑时空 (Re-roll Message)
  
  async function rerollMsg(msgId) {
    if (_isProcessing) return Toast.show('当前系统忙碌，请稍后');

    const msgIndex = _history.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;
    const targetMsg = _history[msgIndex];
    if (targetMsg.role !== 'agent') return;

    const char = _realChars.find(c => String(c.id) === targetMsg.charId);
    if (!char) return;

    _isProcessing = true;
    const cardEl = document.getElementById(msgId);
    if (!cardEl) { _isProcessing = false; return; }

    // 1. 变回打字状态
    const contentDiv = cardEl.querySelector('.card-content');
    const oldHtml = contentDiv.innerHTML;
    contentDiv.innerHTML = `<div class="typing-dots"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div>`;
    
    // 隐藏掉紧跟在它后面的路人弹幕折叠框
    const nextSib = cardEl.nextElementSibling;
    let oldPasserbyEl = null;
    if (nextSib && nextSib.classList.contains('passerby-box')) {
       oldPasserbyEl = nextSib;
       oldPasserbyEl.style.display = 'none';
    }

    // 2. 截取这条消息【之前】的历史记录作为上下文
    const contextHistory = _history.slice(0, msgIndex);
    const historyStr = contextHistory.map(m => {
      if (m.role === 'sys') return '';
      return `[${m.name}]: ${m.text}`;
    }).filter(Boolean).join('\n');

    let stanceDesc = '自由辩论';
    if (State.mode === '1v1') stanceDesc = State.userStance === 'pro' ? '反方（坚决反对该观点）' : '正方（坚决支持该观点）';
    else stanceDesc = '根据你的性格，自由且极端地选择站队。你可以认同某人、反驳某人，或者无差别嘲讽所有人！';

   // 🌟 核心：重 Roll 时也根据模式区分 Prompt，并注入中文指令
    let prompt = '';
    const worldBookContext = await _getWorldBookContext([char.id]);
    
    if (State.mode === '1v1') {
        prompt = `[系统指令：1V1 观点修罗场]
你是【${char.name}】，你的性格档案：${char.persona}
${worldBookContext ? `【附加世界观与设定】：\n${worldBookContext}\n` : ''}当前辩论话题：【${State.topic}】
你的立场：【${stanceDesc}】。即使与你本性冲突，你也必须用你的性格去捍卫这个立场！

【全局语言规则（极度重要）】：
所有对话、路人吐槽必须 **100% 仅使用中文** 输出！绝对禁止输出任何外语！

【场上记录】：
${historyStr || '（你是第一个发言的，请抛出极具杀伤力的开场白）'}

【回复要求（极其重要）】：
1. 极具攻击性、一针见血，直接嘲讽或反击对方上一句话的漏洞，限制在80字以内！
2. 必须顺便模拟 5 到 8 个正在围观的【匿名路人/吃瓜群众】的弹幕吐槽。
3. 严格使用 ||| 作为分隔符！

【输出格式严格如下】：
主发言内容 ||| 路人1的吐槽 ||| 路人2的吐槽`;
    } else {
        prompt = `[系统指令：多重映射 大乱斗]
你是【${char.name}】，你的性格档案：${char.persona}
${worldBookContext ? `【附加世界观与设定】：\n${worldBookContext}\n` : ''}当前争论话题：【${State.topic}】
你的立场策略：【${stanceDesc}】

【全局语言规则（极度重要）】：
所有对话、路人吐槽必须 **100% 仅使用中文** 输出！绝对禁止输出任何外语！

【场上记录】：
${historyStr || '（你是第一个发言的，请抛出极具杀伤力的开场白确立你的阵营）'}

【回复要求（极其重要）】：
1. 这是一场多方混战。抓出你最看不惯的那个人进行嘲讽/反驳；或者拉帮结派赞同某人。限制在80字以内！
2. 必须顺便模拟 5 到 8 个正在围观的【匿名路人/吃瓜群众】的弹幕吐槽。
3. 严格使用 ||| 作为分隔符！

【输出格式严格如下】：
主发言内容 ||| 路人1的吐槽 ||| 路人2的吐槽`;
    }

    try {
      const activeApi = await DB.api.getActive();
      if (!activeApi) throw new Error('未配置 API');

      const response = await ApiHelper.chatCompletion(activeApi, [{ role: 'user', content: prompt }]);
      const parts = response.split('|||').map(s => s.trim()).filter(Boolean);
      const mainReply = parts[0] || "信号丢失，生成失败。"; 
      const bystanders = parts.slice(1);

      // 3. 更新历史数据
      _history[msgIndex].text = mainReply;
      _history[msgIndex].bystanders = bystanders;

      // 4. 更新界面
      contentDiv.innerHTML = mainReply;
      if (oldPasserbyEl) oldPasserbyEl.remove(); // 删掉旧弹幕
      
      if (bystanders.length > 0) {
        const pbItems = bystanders.map(b => {
          const fakeId = 'ANON_' + Math.floor(Math.random() * 9000 + 1000);
          return `<div class="pb-item"><div class="pb-user">${fakeId}</div><div class="pb-text">${b}</div></div>`;
        }).join('');
        const passerbyHtml = `
          <div class="passerby-box" onclick="this.classList.toggle('open')">
            <div class="pb-header">
              <i class="ph-bold ph-wifi-high"></i><span>Intercepted ${bystanders.length} Signals</span><i class="ph-bold ph-caret-down"></i>
            </div>
            <div class="pb-content">${pbItems}</div>
          </div>`;
          cardEl.insertAdjacentHTML('afterend', passerbyHtml);
      }

      if (typeof _autoSaveProgress === 'function') _autoSaveProgress();

    } catch (e) {
      Toast.show('重塑失败，维持原状');
      contentDiv.innerHTML = oldHtml;
      if (oldPasserbyEl) oldPasserbyEl.style.display = '';
    } finally {
      _isProcessing = false;
    }
  }

  function userSpeak() {
    const inp = document.getElementById('db-inp-judge');
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';

    const currentId = _turnQueue[_turnIndex];
    const isUserTurn = currentId === 'user';
    const tag = isUserTurn ? (State.mode === '1v1' ? (State.userStance === 'pro' ? 'PROPOSER' : 'OPPONENT') : 'ORIGIN_NODE') : 'INTERRUPT';
    const timeStr = getCurrentTime();

    _history.push({ 
      role: 'user', charId: 'user', name: State.userName, 
      text: text, roleEng: tag, time: timeStr, bystanders:[] 
    });

    const stream = document.getElementById('db-arena-stream');
    stream.innerHTML += `
      <div class="dialogue-card user">
        <div class="card-header">
          <div class="card-user-info">
            <img src="${State.userAvatar}" class="card-avatar" style="border-color:var(--db-text-pure);">
            <div class="card-name-stack">
              <span class="card-name">${State.userName}</span>
              <span class="card-handle">@user_host</span>
            </div>
          </div>
          <div class="card-header-right">
            <span class="card-tag" style="border-color:var(--db-text-pure);">${tag}</span>
            <span class="card-time">${timeStr}</span>
          </div>
        </div>
        <div class="card-content">${text}</div>
      </div>
    `;
    _scrollToBottom();

    if (isUserTurn) { 
      _advanceTurn(); 
      setTimeout(nextTurn, 1000); 
    }
    _autoSaveProgress();
  }

  function _advanceTurn() {
    _turnIndex++;
    if (_turnIndex >= _turnQueue.length) { _turnIndex = 0; }
    _updateTurnUI();
  }

  async function conclude() {
    if (_isProcessing || _history.length === 0) return Toast.show('当前缺乏足够的辩论数据');
    _isProcessing = true;

    // 1. 锁定面板，进入清算模式
    document.getElementById('db-turn-indicator').textContent = 'ANALYZING...';
    document.getElementById('db-status-dot').style.animation = 'starPulse 0.5s infinite';
    document.getElementById('db-inp-judge').disabled = true;
    document.getElementById('db-inp-judge').placeholder = "空间已锁定，系统正在生成裁决报告...";
    document.getElementById('db-btn-skip').style.opacity = '0.3';
    document.getElementById('db-btn-skip').style.pointerEvents = 'none';
    document.getElementById('db-send-btn').disabled = true;

    // 2. 独立执行裁决 & 散场遗言
    await _generateVerdict();
    await _runEpilogue();

    // 3. 彻底离线
    document.getElementById('db-turn-indicator').textContent = 'OFFLINE';
    document.getElementById('db-status-dot').style.animation = 'none';
    document.getElementById('db-status-dot').style.opacity = '0.2';
    document.getElementById('db-inp-judge').placeholder = "会话已彻底终止";
    _isProcessing = false;
    _autoSaveProgress();
  }
  
  // ============================================================
  // ⚖️ 审判与散场引擎 (Verdict & Epilogue)
  // ============================================================
  
  // 打开裁决面板的辅助函数
  function showVerdict(index) {
    const report = _history[index]?.reportData || "报告数据丢失";
    document.getElementById('db-verdict-content').innerHTML = report.replace(/\n/g, '<br>');
    document.getElementById('db-verdict-modal').classList.add('active');
  }

  async function _generateVerdict() {
    const historyStr = _history.map(m => {
      if (m.role === 'sys' || m.role === 'sys-verdict') return '';
      return `[${m.name}]: ${m.text}`;
    }).filter(Boolean).join('\n');

    const worldBookContext = await _getWorldBookContext(State.chars); // 读取所有参战者的背景

    const prompt = `[最高级系统指令：审判者]
这是一场代号为【${State.topic}】的观点修罗场。以下是全部对话记录。
${worldBookContext ? `【本场修罗场的专属世界观背景】：\n${worldBookContext}\n` : ''}请你作为一个绝对理智、没有任何感情、甚至带点冷酷嘲讽的【上帝法官】，对这场辩论进行裁决。

【全局语言规则】：
你的最终裁决报告必须 **100% 仅使用中文** 输出。

【场上记录】：
${historyStr || '（无记录）'}

输出格式要求：不要超过300字，用冰冷的档案风格。必须包含以下三个小标题：
【冲突焦点】：一句话总结他们到底在吵什么。
【场上MVP】：点名全场发言最犀利/最清醒的人，并给出理由。
【最终判词】：给出一个带有深刻哲理，或者极其讽刺的结案陈词。`;

    let report = "裁决引擎异常，无法生成最终报告。";
    try {
      const activeApi = await DB.api.getActive();
      if (activeApi) {
        report = await ApiHelper.chatCompletion(activeApi,[{  role: 'user', content: prompt }]);
      }
    } catch(e) { console.error('Verdict Error', e); }

    // 存入一条特殊的历史记录
    _history.push({
      role: 'sys-verdict',
      text: 'FINAL VERDICT GENERATED // 点击查阅最终裁决报告',
      reportData: report
    });

    const msgIdx = _history.length - 1;
    const stream = document.getElementById('db-arena-stream');
    stream.innerHTML += `
      <div class="sys-banner clickable" onclick="DebateModule.showVerdict(${msgIdx})">
        <span class="sys-banner-text" style="color:var(--db-text-pure); font-weight:700;">
          <i class="ph-bold ph-scales"></i>FINAL VERDICT GENERATED // 点击查阅最终裁决
        </span>
      </div>`;
    _scrollToBottom();
  }

  async function _runEpilogue() {
    // 遍历所有参战的 AI 节点，让他们一人说一句遗言
    for (const charId of State.chars) {
      const char = _realChars.find(c => String(c.id) === String(charId));
      if (!char) continue;

      const typingId = `db-epilogue-${char.id}-${Date.now()}`;
      const stream = document.getElementById('db-arena-stream');
      const timeStr = getCurrentTime();
      
      stream.innerHTML += `
        <div class="dialogue-card" id="${typingId}">
          <div class="card-header">
            <div class="card-user-info">
              <img src="${char._avatar}" class="card-avatar" style="filter: grayscale(100%); opacity:0.7;">
              <div class="card-name-stack"><span class="card-name">${char.name}</span><span class="card-handle">${char._handle}</span></div>
            </div>
            <div class="card-header-right"><span class="card-tag">SYSTEM_EXIT</span><span class="card-time">${timeStr}</span></div>
          </div>
          <div class="card-content"><div class="typing-dots"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>
        </div>`;
      _scrollToBottom();

      let epilogueText = "……";
      try {
        // 🌟 修复：提取带名字的完整记录，并塞入 Prompt
        const historyStr = _history.map(m => {
          if (m.role === 'sys' || m.role === 'sys-verdict') return '';
          return `[${m.name}]: ${m.text}`;
        }).filter(Boolean).join('\n');

        const worldBookContext = await _getWorldBookContext([char.id]);

        const prompt = `[系统指令：强制断开连接前夕]
你是【${char.name}】，你的性格档案：${char.persona}。
${worldBookContext ? `【附加世界观与设定】：\n${worldBookContext}\n` : ''}刚才你们进行了一场关于【${State.topic}】的激烈辩论，现在上帝按下了“终止程序”按钮，你们的数据连接即将被切断，你们即将散场。

【全局语言规则（极度重要）】：
无论你是哪国人，你的遗言必须 **100% 仅使用中文** 输出！绝对不要夹杂外语！

【刚才的场上记录】：
${historyStr}

【回复要求】：
结合上面的场上记录，根据你的立场和你独特的性格，说出你在断开连接前的**最后一句话**。
可以是对整个话题的一声叹息，可以是对某个对手的最后一次白眼，或者是漫不经心的告别。
不要讲道理了！限制在 30 个字以内！不要带任何括号动作描写！直接输出你的台词。`;

        const activeApi = await DB.api.getActive();
        if (activeApi) {
          epilogueText = await ApiHelper.chatCompletion(activeApi, [{ role: 'user', content: prompt }]);
        }
      } catch(e) {}

      // 更新历史（散场遗言不包含路人弹幕，也没有重Roll和播放按钮，突出苍凉感）
      _history.push({
        role: 'agent', charId: char.id, name: char.name,
        text: epilogueText, roleEng: 'SYSTEM_EXIT', time: timeStr
      });

      document.getElementById(typingId).innerHTML = `
        <div class="card-header">
          <div class="card-user-info">
            <img src="${char._avatar}" class="card-avatar" style="filter: grayscale(100%); opacity:0.7;">
            <div class="card-name-stack"><span class="card-name">${char.name}</span><span class="card-handle">${char._handle}</span></div>
          </div>
          <div class="card-header-right"><span class="card-tag" style="opacity:0.5;">SYSTEM_EXIT</span><span class="card-time">${timeStr}</span></div>
        </div>
        <div class="card-content" style="opacity:0.8; font-style:italic;">${epilogueText}</div>`;
      _scrollToBottom();
    }
  }

  function exit() {
    document.getElementById('db-view-arena').classList.remove('active');
    document.getElementById('db-view-setup').classList.add('active');
  }

  function _sysMsg(text) {
    _history.push({ role: 'sys', text: text });
    const stream = document.getElementById('db-arena-stream');
    stream.innerHTML += `
      <div class="sys-banner">
        <span class="sys-banner-text">${text}</span>
      </div>`;
    _scrollToBottom();
  }

  function _scrollToBottom() {
    const el = document.getElementById('db-arena-stream');
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }
  
  // ── 接入 MiniMax 语音朗读 ──
  async function playVoice(index, charId, btn) {
    if (typeof VoiceModule === 'undefined') { 
      Toast.show('语音模块未加载'); 
      return; 
    }
    
    // 从数据库读取该角色在私聊里配置的音色 ID
    const voiceId = await DB.settings.get(`voice-id-${charId}`);
    if (!voiceId) { 
      Toast.show('请先去私聊的【设置-Voice】里为该角色填写音色 ID'); 
      return; 
    }
    
    const msg = _history[index];
    if (!msg || !msg.text) return;

    // 组合一个缓存 Key，避免重复消耗 API
    const cacheKey = `db-voice-${State.roomId || 'temp'}-${index}`;
    
    // 直接调用主文件的音频播放引擎！
    await VoiceModule.playAudioBubble(cacheKey, msg.text, voiceId, btn);
  }

  // ============================================================
  // 对外暴露的 API
  // ============================================================
  async function open() {
    if (!_initialized) await _initSetup();
    
    // 每次打开刷新一下存档列表，防止跨标签操作导致数据不同步
    loadArchives();
    
    document.getElementById('db-view-arena').classList.remove('active');
    document.getElementById('db-view-setup').classList.add('active');
    document.getElementById('debate-screen').classList.add('active');
  }
  
  function close() {
    document.getElementById('debate-screen').classList.remove('active');
  }

  return { 
    open, close, 
    selectMode, selectTopic, customTopic, selectChar, selectStance, handleAvatarUpload, saveIdentity,
    start, nextTurn, userSpeak, conclude, exit, skipTurn,
    promptSaveRoom, confirmSaveRoom, deleteRoom, resumeRoom,promptSaveTopic,confirmSaveTopic,rerollMsg,playVoice,showVerdict
  };
})();

window.DebateModule = DebateModule;