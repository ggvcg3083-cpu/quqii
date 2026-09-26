/**
 * ============================================================
 * DiaryModule — 角色日记 / 档案名录 (真实逻辑+AI生成版)
 * ============================================================
 */
const DiaryModule = (() => {
    let _isInit = false;
    let _observer = null;
    let _currentDiaries =[]; // 当前查看角色的日记列表

    // ── 数据库快捷方法 (复用主文件的 DB.settings) ──
    function _dbKey(charId) { return `diaries-${charId}`; }
    
    async function _getDiaries(charId) {
        try { return await DB.settings.get(_dbKey(charId)) || []; } 
        catch (e) { return[]; }
    }
    
    async function _saveDiaries(charId, diaries) {
        await DB.settings.set(_dbKey(charId), diaries);
    }

    // 1. 注入专属 CSS (样式保持不变，追加了部分细微修正)
    function _injectStyles() {
        const style = document.createElement('style');
        style.id = 'diary-module-styles';
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=JetBrains+Mono:wght@100;400&family=Alex+Brush&family=Zhi+Mang+Xing&display=swap');
            
            #diary-screen { position: absolute; inset: 0; z-index: 155; background-color: #030303; color: #FFFFFF; font-family: 'Inter', 'Noto Sans SC', sans-serif; transform: translateX(100%); transition: transform 0.42s cubic-bezier(0.19,1,0.22,1); overflow: hidden; -webkit-font-smoothing: antialiased; }
            #diary-screen.active { transform: translateX(0); }
            .diary-view-layer { position: absolute; inset: 0; width: 100%; height: 100%; transform: translateX(100%); transition: transform 0.45s cubic-bezier(0.19,1,0.22,1); overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
            .diary-view-layer::-webkit-scrollbar { display: none; }
            .diary-view-layer.active { transform: translateX(0); z-index: 10; }
            #diary-view-directory { transform: translateX(0); z-index: 5; }

            #diary-screen .font-serif-eng { font-family: 'Playfair Display', serif; }
            #diary-screen .micro-bilingual { font-size: 0.55rem; letter-spacing: 0.15em; text-transform: uppercase; display: flex; flex-direction: column; gap: 2px; line-height: 1.1; }
            #diary-screen .micro-bilingual .cn { font-size: 0.6rem; letter-spacing: 0.2em; font-weight: 300; }

            /* LEVEL 1: Directory */
            #diary-view-directory { overflow: hidden !important; }
            #diary-view-directory .site-header { position: absolute; top: 0; left: 0; width: 100%; padding: max(env(safe-area-inset-top, 20px), 20px) 20px 20px; z-index: 50; display: flex; justify-content: space-between; align-items: flex-start; mix-blend-mode: difference; pointer-events: none; }
            #diary-view-directory .btn-back { pointer-events: auto; display: flex; align-items: center; gap: 8px; transition: opacity 0.3s ease; background: none; border: none; cursor: pointer; color: #8A8A8A; }
            #diary-view-directory .btn-back:active { opacity: 0.5; transform: scale(0.95); }
            #diary-view-directory .btn-icon { width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.4); display: flex; align-items: center; justify-content: center; }
            #diary-view-directory .btn-icon i { font-size: 14px; color: white; }
            #diary-view-directory .header-label { text-align: right; align-items: flex-end; color: #8A8A8A; }

            #diary-view-directory .directory-container { height: 100%; width: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; scroll-snap-type: y mandatory; }
            #diary-view-directory .character-slide { height: 100%; width: 100%; scroll-snap-align: start; position: relative; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 6vh; }
            #diary-view-directory .visual-layer { position: absolute; top: 0; left: 0; width: 100%; height: 75%; z-index: 0; }
            #diary-view-directory .visual-layer img { width: 100%; height: 100%; object-fit: cover; object-position: top center; filter: brightness(0.9) contrast(1.05); }
            #diary-view-directory .fade-to-black { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(3,3,3,0) 0%, rgba(3,3,3,0.1) 40%, rgba(3,3,3,0.85) 75%, rgba(3,3,3,1) 100%); }
            #diary-view-directory .ui-layer { position: relative; z-index: 10; padding: 0 24px; opacity: 0; transform: translateY(20px); transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1); }
            #diary-view-directory .character-slide.active .ui-layer { opacity: 1; transform: translateY(0); }
            
            #diary-view-directory .char-id-row { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 8px; }
            #diary-view-directory .char-no { font-style: italic; font-size: 1.5rem; color: rgba(255, 255, 255, 0.3); }
            #diary-view-directory .identity-label { margin-bottom: 4px; color: #8A8A8A; }
            #diary-view-directory .identity-label .cn { color: rgba(255, 255, 255, 0.5); }
            #diary-view-directory .char-name-row { font-size: 3rem; letter-spacing: -0.025em; margin-bottom: 32px; display: flex; align-items: baseline; gap: 16px; }
            #diary-view-directory .char-name-en { color: white; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
            #diary-view-directory .char-name-cn { font-size: 1.5rem; font-weight: 300; color: #D1D5DB; letter-spacing: 0.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }

            #diary-view-directory .identity-card { border-top: 1px solid rgba(255, 255, 255, 0.4); border-bottom: 1px solid rgba(255, 255, 255, 0.15); padding: 24px 0; display: flex; flex-direction: column; gap: 24px; position: relative; }
            #diary-view-directory .identity-card::before { content: ''; position: absolute; top: -1px; left: 0; width: 0; height: 1px; background-color: #FFF; transition: width 1s ease 0.3s; }
            #diary-view-directory .character-slide.active .identity-card::before { width: 40%; }
            #diary-view-directory .tagline-container { margin-bottom: 16px; }
            #diary-view-directory .tagline-en { font-size: 0.7rem; color: #9CA3AF; font-weight: 300; letter-spacing: 0.025em; margin-bottom: 4px; }
            #diary-view-directory .tagline-cn { font-size: 0.7rem; color: #6B7280; font-weight: 300; letter-spacing: 0.1em; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

            #diary-view-directory .stats-grid { display: flex; justify-content: space-between; align-items: flex-end; }
            #diary-view-directory .stats-group { display: flex; gap: 32px; }
            #diary-view-directory .stat-item { color: #8A8A8A; }
            #diary-view-directory .stat-item .cn { color: rgba(255, 255, 255, 0.6); }
            #diary-view-directory .stat-val-en { font-size: 1.25rem; color: white; margin-top: 4px; font-style: italic; }
            #diary-view-directory .stat-val-date { font-size: 0.8rem; color: white; margin-top: 8px; }

            #diary-view-directory .enter-btn { pointer-events: auto; display: inline-flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.05); border: 0.5px solid rgba(255, 255, 255, 0.15); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-radius: 100px; padding: 8px 16px 8px 20px; transition: all 0.3s ease; cursor: pointer; color: #8A8A8A; }
            #diary-view-directory .enter-btn:active { background: rgba(255, 255, 255, 0.2); transform: scale(0.95); }
            #diary-view-directory .enter-btn-labels { text-align: left; margin-right: 24px; }
            #diary-view-directory .enter-btn-labels span { color: white; }
            #diary-view-directory .enter-btn-labels .en { font-size: 0.5rem; }
            #diary-view-directory .enter-btn-icon { width: 32px; height: 32px; border-radius: 50%; background-color: white; color: black; display: flex; align-items: center; justify-content: center; }
            #diary-view-directory .swipe-hint { position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: 0.3; color: #8A8A8A; }
            #diary-view-directory .swipe-text { font-size: 0.45rem; text-align: center; }
            #diary-view-directory .swipe-line { width: 1px; height: 12px; background-color: white; }
            #diary-view-directory .empty-state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'Space Mono', monospace; font-size: 0.7rem; color: #666; letter-spacing: 2px; text-transform: uppercase; }

            /* LEVEL 2: List */
            :root { --dl-bg-paper: #F9F9F7; --dl-text-ink: #111111; --dl-text-muted: #999999; --dl-line-color: rgba(17, 17, 17, 0.12); --dl-accent-red: #8B0000; }
            #diary-view-list { background-color: var(--dl-bg-paper); color: var(--dl-text-ink); padding-top: calc(env(safe-area-inset-top, 20px) + 76px); padding-bottom: 48px; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.04'/%3E%3C/svg%3E"); }
            #diary-view-list .font-serif-elegant { font-family: 'Cormorant Garamond', serif; }
            #diary-view-list .font-mono-data { font-family: 'JetBrains Mono', monospace; }

            #diary-view-list .dl-header { position: fixed; top: 0; left: 0; width: 100%; padding: max(env(safe-area-inset-top, 20px), 16px) 20px 16px; z-index: 50; display: flex; justify-content: space-between; align-items: flex-start; background: rgba(249, 249, 247, 0.9); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-bottom: 0.5px solid var(--dl-line-color); }
            #diary-view-list .btn-back { display: flex; align-items: center; gap: 8px; color: var(--dl-text-muted); background: none; border: none; cursor: pointer; }
            #diary-view-list .btn-icon { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--dl-text-ink); display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; color: var(--dl-text-ink); }
            #diary-view-list .btn-back:active .btn-icon { background-color: var(--dl-text-ink); color: var(--dl-bg-paper); transform: scale(0.9); }
            
            #diary-view-list .header-center { position: absolute; left: 50%; transform: translateX(-50%); top: max(env(safe-area-inset-top, 20px), 16px); display: flex; flex-direction: column; align-items: center; }
            #diary-view-list .header-char-name { font-size: 1.25rem; letter-spacing: 0.05em; font-weight: 600; font-style: italic; }
            #diary-view-list .header-tag { font-size: 0.55rem; letter-spacing: 0.2em; color: var(--dl-text-muted); margin-top: 4px; }
            #diary-view-list .header-code { margin-top: 8px; font-size: 0.45rem; color: var(--dl-text-muted); opacity: 0.6; cursor: pointer; transition: color 0.2s; }
            #diary-view-list .header-code:active { color: var(--dl-text-ink); } /* 预留的写日记快捷入口 */

            #diary-view-list .title-section { padding: 0 24px; margin-bottom: 48px; margin-top: 16px; position: relative; }
            #diary-view-list .title-line { width: 32px; height: 1px; background-color: var(--dl-text-ink); margin-bottom: 24px; }
            #diary-view-list .main-title { font-size: 3rem; line-height: 1; margin-bottom: 16px; letter-spacing: -0.025em; }
            #diary-view-list .sub-title-italic { font-style: italic; color: var(--dl-text-muted); font-size: 2.25rem; }
            #diary-view-list .title-desc { font-size: 0.75rem; font-weight: 300; color: var(--dl-text-muted); letter-spacing: 0.025em; line-height: 1.625; max-width: 70%; }

            #diary-view-list .diary-list-container { padding: 0 24px; }
            #diary-view-list .diary-item { position: relative; border-bottom: 1px solid var(--dl-line-color); padding: 32px 0; overflow: hidden; cursor: pointer; transition: background-color 0.4s ease; }
            #diary-view-list .diary-item:active { background-color: rgba(17, 17, 17, 0.04); }
            #diary-view-list .diary-article { display: flex; gap: 24px; }
            #diary-view-list .date-col { width: 64px; flex-shrink: 0; display: flex; flex-direction: column; padding-top: 4px; z-index: 10; }
            #diary-view-list .date-month { font-size: 0.55rem; letter-spacing: 0.1em; color: var(--dl-text-muted); text-transform: uppercase; margin-bottom: 4px; }
            #diary-view-list .date-day { font-size: 3rem; line-height: 0.8; color: var(--dl-text-ink); }
            #diary-view-list .date-no { font-size: 0.45rem; letter-spacing: 0.2em; color: var(--dl-accent-red); margin-top: 24px; }

            #diary-view-list .text-col { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; z-index: 10; }
            #diary-view-list .entry-header { margin-bottom: 16px; }
            #diary-view-list .entry-title-en { font-style: italic; font-size: 1.5rem; color: var(--dl-text-ink); margin-bottom: 2px; }
            #diary-view-list .entry-title-cn-wrap { display: flex; align-items: center; gap: 12px; }
            #diary-view-list .entry-title-cn { font-size: 0.75rem; font-weight: 500; letter-spacing: 0.1em; color: var(--dl-text-ink); }
            #diary-view-list .entry-line { height: 1px; flex: 1; background-color: var(--dl-line-color); margin-top: 2px; }
            #diary-view-list .entry-text { font-size: 0.8rem; font-weight: 300; color: #444; line-height: 1.625; text-align: justify; padding-right: 24px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

            #diary-view-list .interaction-hint { margin-top: 24px; font-size: 0.45rem; letter-spacing: 0.1em; color: var(--dl-text-muted); opacity: 0.6; transition: opacity 0.3s ease; }
            
            #diary-view-list .redacted { background-color: var(--dl-text-ink); color: var(--dl-text-ink); padding: 0 4px; margin: 0 2px; border-radius: 1px; user-select: none; }
            #diary-view-list .giant-symbol { position: absolute; right: -10px; top: 50%; transform: translateY(-50%); font-family: 'Cormorant Garamond', serif; font-size: 14rem; line-height: 1; color: rgba(17, 17, 17, 0.03); pointer-events: none; z-index: 0; transition: all 0.6s ease; }
            #diary-view-list .diary-item:active .giant-symbol { color: rgba(17, 17, 17, 0.06); transform: translateY(-50%) translateX(-10px); }
            #diary-view-list .css-barcode { display: flex; height: 16px; gap: 1px; opacity: 0.3; margin-top: 8px; }
            #diary-view-list .css-barcode span { background-color: var(--dl-text-ink); }
            
            #diary-view-list .empty-state-list { text-align:center; padding: 60px 0; color: var(--dl-text-muted); font-family: 'Space Mono', monospace; font-size: 0.6rem; letter-spacing: 2px; text-transform: uppercase; }

            /* LEVEL 3: Detail */
            :root { --dd-bg-stone: #F5F4F0; --dd-text-dark: #222222; --dd-text-gray: #888888; --dd-line-fine: rgba(34, 34, 34, 0.12); }
            #diary-view-detail { background-color: var(--dd-bg-stone); color: var(--dd-text-dark); padding-bottom: 96px; }
            #diary-view-detail .font-serif-chic { font-family: 'Playfair Display', serif; }
            #diary-view-detail .font-sans-minimal { font-family: 'Inter', sans-serif; }
            #diary-view-detail .font-signature { font-family: 'Zhi Mang Xing', 'Long Cang', 'Alex Brush', cursive; font-weight: 400; } 

            #diary-view-detail .dd-container { position: relative; z-index: 10; max-width: 512px; margin: 0 auto; padding: 0 32px; margin-top: 8px; }
            #diary-view-detail .anchor-circle { position: absolute; top: -5vh; right: -15vw; width: 60vw; height: 60vw; border: 1px solid rgba(34, 34, 34, 0.06); border-radius: 50%; z-index: 0; pointer-events: none; }

            #diary-view-detail .dd-header { width: 100%; padding: max(env(safe-area-inset-top, 20px), 24px) 24px 24px; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 50; }
            #diary-view-detail .btn-back { display: flex; align-items: center; gap: 8px; transition: opacity 0.3s ease; background: none; border: none; cursor: pointer; color: var(--dd-text-dark); }
            #diary-view-detail .btn-back:active { opacity: 0.5; transform: scale(0.95); }
            #diary-view-detail .btn-back i { font-size: 18px; font-weight: 300; }
            #diary-view-detail .btn-back span { font-size: 0.6rem; letter-spacing: 0.15em; text-transform: uppercase; }
            #diary-view-detail .header-frag-id { font-size: 0.5rem; letter-spacing: 0.2em; color: var(--dd-text-gray); }
            #diary-view-detail .header-trash { font-size: 18px; color: var(--dd-text-gray); cursor: pointer; }
            #diary-view-detail .header-trash:active { color: #8B0000; }

            #diary-view-detail .title-section { margin-bottom: 40px; display: flex; flex-direction: column; gap: 16px; }
            #diary-view-detail .main-title { font-size: 2.75rem; color: var(--dd-text-dark); line-height: 1.1; letter-spacing: -0.025em; font-style: italic; }
            #diary-view-detail .sub-title { font-size: 0.75rem; letter-spacing: 0.3em; color: var(--dd-text-gray); font-weight: 300; margin-left: 4px; }

            #diary-view-detail .gallery-label { margin-bottom: 48px; margin-left: 4px; border: 0.5px solid var(--dd-line-fine); padding: 16px; display: flex; flex-direction: column; gap: 12px; position: relative; background-color: rgba(255, 255, 255, 0.3); }
            #diary-view-detail .gallery-label::before { content: '+'; position: absolute; top: -6px; left: -4px; font-size: 10px; color: var(--dd-text-gray); font-family: monospace; }
            #diary-view-detail .meta-group { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 0.5px solid var(--dd-line-fine); padding-bottom: 4px; }
            #diary-view-detail .meta-group:last-child { border-bottom: none; padding-bottom: 0; }
            #diary-view-detail .meta-key { font-family: 'Inter', sans-serif; font-size: 0.45rem; letter-spacing: 0.15em; color: var(--dd-text-gray); text-transform: uppercase; }
            #diary-view-detail .meta-val { font-family: 'Inter', sans-serif; font-size: 0.6rem; letter-spacing: 0.05em; color: var(--dd-text-dark); text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
            #diary-view-detail .meta-val-col { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
            #diary-view-detail .meta-val-sub { font-size: 0.45rem; letter-spacing: 0.1em; color: var(--dd-text-gray); }

            #diary-view-detail .diary-content { position: relative; z-index: 10; margin-left: 16px; border-left: 1px solid var(--dd-line-fine); padding-left: 24px; }
            #diary-view-detail .vertical-ornament { position: absolute; left: -20px; top: 10px; writing-mode: vertical-rl; transform: rotate(180deg); font-family: 'Inter', sans-serif; font-size: 0.45rem; letter-spacing: 0.3em; color: var(--dd-text-gray); display: flex; align-items: center; gap: 20px; }
            #diary-view-detail .vertical-ornament::before { content: ''; width: 1px; height: 40px; background-color: var(--dd-text-gray); }
            #diary-view-detail .interaction-hint { font-size: 0.45rem; letter-spacing: 0.2em; color: var(--dd-text-gray); margin-bottom: 32px; opacity: 0.8; font-family: 'Inter', sans-serif; }
            #diary-view-detail .diary-content p { font-size: 13px; line-height: 2.4; color: #333333; font-weight: 300; margin-bottom: 24px; text-align: justify; letter-spacing: 0.02em; }

            /* 墨迹解密 */
            #diary-view-detail .redact-block { color: transparent; text-shadow: 0 0 7px rgba(34, 34, 34, 0.35); cursor: pointer; position: relative; display: inline; transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1); user-select: none; border-bottom: 0.5px dotted rgba(34, 34, 34, 0.25); }
            @media (hover: hover) { #diary-view-detail .redact-block:hover { text-shadow: 0 0 4px rgba(34, 34, 34, 0.5); border-bottom-color: rgba(34, 34, 34, 0.5); } }
            #diary-view-detail .redact-block.is-revealed { color: var(--dd-text-dark); text-shadow: 0 0 0 rgba(34, 34, 34, 0); cursor: default; border-bottom-color: transparent; }

            #diary-view-detail .footer-signature-area { margin-top: 80px; padding-top: 24px; border-top: 1px solid var(--dd-line-fine); display: flex; justify-content: space-between; align-items: flex-start; position: relative; }
            #diary-view-detail .system-msg { font-size: 0.45rem; letter-spacing: 0.2em; color: var(--dd-text-gray); text-transform: uppercase; margin-top: 16px; font-family: 'Inter', sans-serif; line-height: 1.5; }
            #diary-view-detail .handwritten-signature { font-size: 4rem; line-height: 0.8; color: var(--dd-text-dark); opacity: 0.9; transform: rotate(-5deg) translateY(-10px); letter-spacing: -2px; transform-origin: bottom right; position: absolute; bottom: -24px; right: 8px; padding-right: 8px; }
            
            /* AI Loading State */
            #diary-view-list .ai-loading-overlay { position: fixed; inset: 0; background: rgba(249, 249, 247, 0.8); backdrop-filter: blur(10px); z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
            #diary-view-list .ai-loading-overlay.active { opacity: 1; pointer-events: auto; }
            #diary-view-list .ai-spinner { width: 40px; height: 40px; border: 1px solid var(--dl-line-color); border-top-color: var(--dl-text-ink); border-radius: 50%; animation: d-spin 1s linear infinite; margin-bottom: 20px; }
            #diary-view-list .ai-loading-text { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; letter-spacing: 2px; color: var(--dl-text-ink); text-transform: uppercase; animation: d-pulse 1.5s infinite; }
            @keyframes d-spin { 100% { transform: rotate(360deg); } }
            @keyframes d-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        `;
        document.head.appendChild(style);
    }

    // 2. 注入 HTML 骨架 (包含三级视图)
    function _injectDOM() {
        const device = document.querySelector('.device');
        if (!device || document.getElementById('diary-screen')) return;

        const screen = document.createElement('div');
        screen.id = 'diary-screen';
        screen.className = 'screen';
        
        screen.innerHTML = `
            <!-- LEVEL 1: Directory -->
            <div id="diary-view-directory" class="diary-view-layer active">
                <header class="site-header">
                    <button class="btn-back" onclick="DiaryModule.close()">
                        <div class="btn-icon"><i class="ph ph-caret-left"></i></div>
                        <div class="micro-bilingual" style="text-align: left;">
                            <span style="color: rgba(255,255,255,1);">BACK</span>
                            <span class="cn" style="color: rgba(255,255,255,0.8);">返回桌面</span>
                        </div>
                    </button>
                    <div class="micro-bilingual header-label">
                        <span style="color: rgba(255,255,255,1);">DIRECTORY</span>
                        <span class="cn" style="color: rgba(255,255,255,0.8);">角色档案</span>
                    </div>
                </header>
                <div class="directory-container" id="diary-directory-list"></div>
            </div>

            <!-- LEVEL 2: List -->
            <div id="diary-view-list" class="diary-view-layer">
                <header class="dl-header">
                    <button class="btn-back" onclick="DiaryModule.backToLevel1()">
                        <div class="btn-icon"><i class="ph ph-arrow-left"></i></div>
                        <div class="micro-bilingual">
                            <span style="color: var(--dl-text-ink)">BACK</span>
                            <span class="cn" style="color: var(--dl-text-ink)">返回</span>
                        </div>
                    </button>
                    <div class="header-center">
                        <span class="font-serif-elegant header-char-name" id="dl-char-name">Name</span>
                        <span class="header-tag">TEXT FRAGMENTS</span>
                    </div>
                    <!-- 点击右上角的代码强行召唤 AI 写日记 -->
                    <div class="font-mono-data header-code" id="dl-force-write" title="强制写日记">0X8F.42A</div>
                </header>
                <section class="title-section">
                    <div class="title-line"></div>
                    <h1 class="font-serif-elegant main-title">Words <br><span class="sub-title-italic">Unspoken.</span></h1>
                    <p class="title-desc">The archive of missing texts, redacted memories and silent echoes.</p>
                </section>
                <div class="diary-list-container" id="dl-list-container"></div>
                
                <!-- AI 生成遮罩 -->
                <div class="ai-loading-overlay" id="dl-ai-loader">
                    <div class="ai-spinner"></div>
                    <div class="ai-loading-text">Writing Diary...</div>
                </div>
            </div>

            <!-- LEVEL 3: Detail -->
            <div id="diary-view-detail" class="diary-view-layer">
                <div class="anchor-circle"></div>
                <header class="dd-header">
                    <button class="btn-back" onclick="DiaryModule.backToLevel2()">
                        <i class="ph ph-arrow-left"></i>
                        <span class="font-sans-minimal">Back</span>
                    </button>
                    <div>
                        <span class="header-frag-id font-sans-minimal" id="dd-frag-id" style="margin-right: 16px;">FRAGMENT / 000</span>
                        <i class="ph ph-trash header-trash" id="dd-btn-delete" title="烧毁这页日记"></i>
                    </div>
                </header>
                <div class="dd-container" id="dd-content-container"></div>
            </div>
        `;
        device.appendChild(screen);
    }

    // ============================================================
    // Level 1: 目录页逻辑
    // ============================================================
    function _formatDate(ts) {
        if (!ts) return '----.--.--';
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    }

    async function _renderLevel1() {
        const container = document.getElementById('diary-directory-list');
        if (!container) return; // 🌟 修复：防止后台生成时找不到DOM报错

        container.innerHTML = '';

        try {
            const chars = await DB.characters.getAll();
            if (chars.length === 0) {
                container.innerHTML = `<div class="empty-state">No Characters Found</div>`;
                return;
            }

            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];
                const num = String(i + 1).padStart(2, '0');
                
                let avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80';
                if (char.avatarUrl) {
                    avatarUrl = await Assets.getUrl(char.avatarUrl).catch(() => avatarUrl) || avatarUrl;
                }

                let displayQuote = "“秘密总是藏在那些未曾说出口的话里。”";
                if (char.aiData && char.aiData.quote) {
                    displayQuote = char.aiData.quote;
                } else if (char.persona) {
                    displayQuote = char.persona.slice(0, 30) + (char.persona.length > 30 ? '...' : '');
                }

                const diaries = await _getDiaries(char.id);
                const totalEntries = diaries.length;
                let lastSyncStr = "UNWRITTEN";
                if (totalEntries > 0) {
                    lastSyncStr = _formatDate(diaries[0].timestamp);
                }

                const section = document.createElement('section');
                section.className = 'character-slide';
                section.innerHTML = `
                    <div class="visual-layer">
                        <img src="${avatarUrl}" alt="${char.name}">
                        <div class="fade-to-black"></div>
                    </div>
                    <div class="ui-layer">
                        <div class="char-id-row">
                            <span class="font-serif-eng char-no">No.${num}</span>
                            <div class="micro-bilingual identity-label">
                                <span>AUTHOR IDENTITY</span>
                                <span class="cn">记录对象</span>
                            </div>
                        </div>
                        <h1 class="font-serif-eng char-name-row">
                            <span class="char-name-en">${char.title || char.name}</span>
                            <span class="char-name-cn">${char.title ? char.name : ''}</span>
                        </h1>
                        <div class="identity-card">
                            <div class="tagline-container">
                                <p class="tagline-en">${char.mbti ? 'ARCHETYPE: ' + char.mbti : 'OBSERVER'}</p>
                                <p class="tagline-cn">“${displayQuote}”</p>
                            </div>
                            <div class="stats-grid">
                                <div class="stats-group">
                                    <div class="micro-bilingual stat-item">
                                        <span>ENTRIES</span>
                                        <span class="cn">收录记录</span>
                                        <span class="font-serif-eng stat-val-en">${totalEntries === 0 ? '--' : totalEntries}</span>
                                    </div>
                                    <div class="micro-bilingual stat-item">
                                        <span>LAST SYNC</span>
                                        <span class="cn">最后同步</span>
                                        <span class="font-serif-eng stat-val-date" style="${totalEntries === 0 ? 'font-size:0.6rem; letter-spacing:1px; color:rgba(255,255,255,0.4);' : ''}">${lastSyncStr}</span>
                                    </div>
                                </div>
                                <button class="enter-btn" onclick="DiaryModule.openArchive('${char.id}')">
                                    <div class="micro-bilingual enter-btn-labels">
                                        <span class="en">OPEN ARCHIVE</span>
                                        <span class="cn">翻阅日记</span>
                                    </div>
                                    <div class="enter-btn-icon"><i class="ph-bold ph-arrow-right"></i></div>
                                </button>
                            </div>
                        </div>
                        <div class="swipe-hint">
                            <div class="micro-bilingual" style="align-items: center;"><span class="swipe-text">SWIPE</span></div>
                            <div class="swipe-line"></div>
                        </div>
                    </div>
                `;
                container.appendChild(section);
            }
            _setupObserver();
        } catch (e) {
            console.error('[DiaryModule] render error:', e);
            container.innerHTML = `<div class="empty-state">Data Error</div>`;
        }
    }

    function _setupObserver() {
        if (_observer) _observer.disconnect();
        const slides = document.querySelectorAll('#diary-screen .character-slide');
        if (slides.length > 0) setTimeout(() => slides[0].classList.add('active'), 100);
        _observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) { entry.target.classList.add('active'); } 
                else { entry.target.classList.remove('active'); }
            });
        }, { threshold: 0.4 });
        slides.forEach(slide => _observer.observe(slide));
    }

    // ============================================================
    // Level 2: 列表页逻辑
    // ============================================================
    let _activeCharId = null;

    async function _renderLevel2(charId) {
        _activeCharId = charId;
        try {
            const char = await DB.characters.get(Number(charId));
            if (char) {
                const nameEl = document.getElementById('dl-char-name');
                if (nameEl) nameEl.textContent = char.name;
            }
            
            // 绑定强制写日记事件
            const forceWriteBtn = document.getElementById('dl-force-write');
            if (forceWriteBtn) forceWriteBtn.onclick = () => generateDiary(charId);
        } catch(e) {}

        const container = document.getElementById('dl-list-container');
        if (!container) return; // 🌟 修复：防止后台生成时找不到DOM报错
        
        container.innerHTML = '';
        
        _currentDiaries = await _getDiaries(charId);

        if (_currentDiaries.length === 0) {
            container.innerHTML = '<div class="empty-state-list">No Diary Entries Yet.<br><br>The pages remain blank.</div>';
            return;
        }

        const symbols =['*', '¶', '†', '§', '‡', '¥', '∆'];

        _currentDiaries.forEach((diary, index) => {
            const d = new Date(diary.timestamp);
            const months =['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const monthYear = `${months[d.getMonth()]}, ${d.getFullYear()}`;
            const dateDay = String(d.getDate()).padStart(2, '0');
            
            // 纯文本预览：把 [REDACT] 替换成黑块
            let previewText = diary.content.replace(/\[REDACT\](.*?)\[\/REDACT\]/g, "<span class='redacted'>████</span>");

            let barcodeHtml = '';
            (diary.barcodeWeights ||[1,2,1,3,1]).forEach(weight => { barcodeHtml += `<span style="width: ${weight}px;"></span>`; });

            const itemHtml = `
                <article class="diary-item diary-article" onclick="DiaryModule.openDetail('${diary.id}')">
                    <div class="giant-symbol">${diary.symbol || symbols[index % symbols.length]}</div>
                    <div class="date-col">
                        <span class="date-month">${monthYear}</span>
                        <span class="font-serif-elegant date-day">${dateDay}</span>
                        <span class="font-mono-data date-no">Nº ${diary.id}</span>
                        <div class="css-barcode">${barcodeHtml}</div>
                    </div>
                    <div class="text-col">
                        <div class="entry-header">
                            <h2 class="font-serif-elegant entry-title-en">${diary.titleEn}</h2>
                            <div class="entry-title-cn-wrap">
                                <h3 class="entry-title-cn">${diary.titleCn}</h3>
                                <div class="entry-line"></div>
                            </div>
                        </div>
                        <p class="entry-text">${previewText}</p>
                        <div class="font-mono-data interaction-hint">[ TAP TO DECRYPT / 点击查阅 ]</div>
                    </div>
                </article>
            `;
            container.innerHTML += itemHtml;
        });
    }

    // ============================================================
    // Level 3: 详情页逻辑
    // ============================================================
    let _activeDiaryId = null;

    async function _renderLevel3(diaryId) {
        _activeDiaryId = diaryId;
        const fragIdEl = document.getElementById('dd-frag-id');
        if (fragIdEl) fragIdEl.textContent = `FRAGMENT / ${diaryId}`;
        
        const btnDelete = document.getElementById('dd-btn-delete');
        if (btnDelete) btnDelete.onclick = () => _deleteDiary(diaryId);

        const container = document.getElementById('dd-content-container');
        if (!container) return; // 🌟 修复：防止偶尔找不到DOM报错

        const diary = _currentDiaries.find(d => d.id === diaryId);
        
        if (!diary) {
            container.innerHTML = '<div style="text-align:center; padding:100px 0;">Error Loading Diary</div>';
            return;
        }

        const d = new Date(diary.timestamp);
        const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
        const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

        const authorSign = document.getElementById('dl-char-name')?.textContent || 'Author';

        // 处理段落和隐语
        const paragraphs = diary.content.split('\n\n').filter(p => p.trim());
        let htmlContent = '';
        paragraphs.forEach(p => {
            // 将[REDACT]xxx[/REDACT] 转换为 <span class="redact-block">xxx</span>
            let safeP = p.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            safeP = safeP.replace(/\[REDACT\](.*?)\[\/REDACT\]/g, "<span class='redact-block'>$1</span>");
            htmlContent += `<p>${safeP}</p>`;
        });

        container.innerHTML = `
            <div class="title-section">
                <h1 class="main-title font-serif-chic">${diary.titleEn}</h1>
                <h2 class="sub-title">${diary.titleCn}</h2>
            </div>
            <div class="gallery-label">
                <div class="meta-group">
                    <span class="meta-key">Date & Time</span>
                    <span class="meta-val">${dateStr} <span style="color: var(--dd-text-gray); margin: 0 4px;">/</span> ${timeStr}</span>
                </div>
                <div class="meta-group">
                    <span class="meta-key">Location</span>
                    <span class="meta-val meta-val-col">${diary.locationEn}<span class="meta-val-sub">${diary.locationCoords}</span></span>
                </div>
                <div class="meta-group">
                    <span class="meta-key">Environment</span>
                    <span class="meta-val"><i class="ph ${diary.weatherIcon}" style="font-size: 0.7rem; color: var(--dd-text-gray);"></i> ${diary.weatherText}</span>
                </div>
            </div>
            <article class="diary-content">
                <div class="vertical-ornament">CONFIDENTIAL RECOLLECTION</div>
                <div class="interaction-hint">[ TAP THE BLURRED INK TO REVEAL ]</div>
                ${htmlContent}
            </article>
            <div class="footer-signature-area">
                <div class="system-msg">End of Entry // <br>Archived successfully.</div>
                <div class="handwritten-signature font-signature">${authorSign}</div>
            </div>
        `;

        setTimeout(() => {
            const blocks = container.querySelectorAll('.redact-block');
            blocks.forEach(block => {
                block.addEventListener('click', function() {
                    if (!this.classList.contains('is-revealed')) {
                        this.classList.add('is-revealed');
                    }
                });
            });
        }, 100);
    }
    
    // ============================================================
    // 🗑️ 删除日记逻辑
    // ============================================================
    async function _deleteDiary(diaryId) {
        // 添加一个确认提示，防止误触
        if (!confirm('确定要烧毁这页日记吗？字迹将永远消散...')) return;

        try {
            // 1. 从当前内存里的日记列表中过滤掉要删除的这条
            _currentDiaries = _currentDiaries.filter(d => d.id !== diaryId);
            
            // 2. 将更新后的列表存回数据库
            await _saveDiaries(_activeCharId, _currentDiaries);
            
            // 3. 提示删除成功
            if (typeof Toast !== 'undefined') {
                Toast.show('日记已烧毁 ✦');
            }
            
            // 4. 退回列表页，并刷新列表和目录页的统计数据
            backToLevel2();
            await _renderLevel2(_activeCharId);
            await _renderLevel1(); 
            
        } catch (e) {
            console.error('[DiaryModule] Delete diary failed:', e);
            if (typeof Toast !== 'undefined') {
                Toast.show('烧毁失败：' + e.message);
            }
        }
    }

    // ============================================================
    // 🧠 AI 生成引擎 (Core Logic)
    // ============================================================
    // 🌟 修复：增加 isAuto 参数，区分手动和自动
    async function generateDiary(charId, isAuto = false) {
        if (!charId) return;
        const loader = document.getElementById('dl-ai-loader');
        
        try {
            const activeApi = await DB.api.getActive();
            if (!activeApi) throw new Error('未配置 API');

            const char = await DB.characters.get(Number(charId));
            if (!char) throw new Error('找不到角色档案');

            const diaries = await _getDiaries(charId);
            const lastTs = diaries.length > 0 ? diaries[0].timestamp : 0;
            
            
            // 拉取最近的消息记录（拉大范围到100条保证抓取完整上下文）
            const allMsgs = await DB.messages.getPage(String(charId), 0, 100).catch(()=>[]);
            
            // 🌟 修复1：严格过滤掉系统票据、转账等杂音，只算真实的对话 (时间正序)
            const validMsgs = allMsgs.filter(m => m.role === 'user' || m.role === 'assistant');
            
            // 过滤出距离上次写日记之后产生的新消息
            const newMsgs = validMsgs.filter(m => m.timestamp > lastTs);
            
            // 🌟 核心算法：计算新消息构成的“真实交流轮数”
            let newRounds = 0;
            for (let i = 1; i < newMsgs.length; i++) {
                if (newMsgs[i-1].role === 'user' && newMsgs[i].role === 'assistant') {
                    newRounds++;
                }
            }
            
            // 倒序排列，方便后面大模型读取最新的上下文（大模型习惯从新到旧，或从旧到新拼接）
            let targetMsgs = newMsgs.reverse(); 
            
            // 🌟 修复2：区分手动强制生成和后台自动生成
            if (newRounds < 5) {
                if (isAuto) {
                    // 后台自动触发：必须达到 5 轮交流才写
                    console.log(`[Diary] 角色 ${char.name} 新对话仅 ${newRounds} 轮（不足 5 轮），跳过自动日记`);
                    return;
                } else {
                    // 手动点击触发：计算历史全部交流轮数，不够 5 轮的话，3 轮也给你写（上帝模式宽容一点）
                    let totalRounds = 0;
                    for (let i = 1; i < validMsgs.length; i++) {
                        if (validMsgs[i-1].role === 'user' && validMsgs[i].role === 'assistant') {
                            totalRounds++;
                        }
                    }
                    if (totalRounds >= 3) {
                        console.log(`[Diary] 用户强制触发，总共有 ${totalRounds} 轮，抓取最近聊天记录兜底写日记`);
                        targetMsgs = validMsgs.reverse().slice(0, 30); // 抓取最近30条气泡
                    } else {
                        Toast.show('聊天记录太少啦，多聊几轮再来写日记吧 ✦');
                        if (loader) loader.classList.remove('active');
                        return;
                    }
                }
            }

            // 🌟 新增：读取与该角色绑定的用户面具（身份）
            const binding = await DB.bindings.get(String(charId)).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '用户(我)', bio: '', backstory: '' };

            if (loader) loader.classList.add('active');

            const fmtTime = (ts) => {
                const d = new Date(ts);
                return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            };

            // 🌟 修改：对话记录中现在会使用你面具的真实名字
            const chatLog = targetMsgs.map(m => {
                const role = m.role === 'user' ? userPersona.name : char.name;
                const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                return `[${fmtTime(m.timestamp)}] ${role}: ${txt}`;
            }).join('\n');
            
            // 🌟 核心修复：获取当前的精确时间与作息，让大模型知道此刻是几点
            const now = new Date();
            const days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
            const currentTimeStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${days[now.getDay()]} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            
            let scheduleContext = '';
            if (typeof LifestyleModule !== 'undefined') {
                scheduleContext = await LifestyleModule.getPromptContext(charId);
            }

            let worldBookBlock = '';
            try {
                if (typeof WBModule !== 'undefined') {
                    const matched = WBModule.getMatchingEntries(chatLog, String(charId), 'diary');
                    if (matched.length) {
                        worldBookBlock = matched.map(e => e.content.trim()).join('\n\n');
                    }
                }
            } catch(e) {}

            const prompt = `[系统指令：角色日记创作]
你现在完全沉浸并扮演角色【${char.name}】。
人设背景：${char.persona}

【当前真实时间与生活状态】：
此刻你执笔写日记的时间是：${currentTimeStr}
${scheduleContext}
${worldBookBlock ? `\n【当前世界设定与重要背景（写日记时请务必参考此设定）】：\n${worldBookBlock}\n` : ''}
【关于与你互动的用户（我）】：
姓名：${userPersona.name}
简介：${userPersona.bio || '无详细简介'}
背景：${userPersona.backstory || '无详细背景'}

请根据【当前真实时间】与以下最近发生的一段对话记录，以你的【第一人称视角（“我”）】写一篇此时此刻的私密日记。

【【【 创作铁律：彻底的人格化表达 】】】
这是你必须遵守的最高准则，它凌驾于所有文风模仿之上。你的目标是成为一个“人”，而不是一个“模拟人的AI”。
0.时间感知 (Time Perception - 核心): 你必须明确意识到【此刻的时间】。如果是深夜，日记应带有疲惫、静谧或思绪万千的质感；如果是清晨，应带有新的一天的未明感。切忌在深夜的日记里写“今天刚起床”。
1. 负面词汇库 (Strictly Banned): 你的脑海中完全不存在以下词汇。在任何情况下，严禁出现【系统、变量、量化、精准、轨迹、频率、机制、程序、运算、载体、维度】等任何理工科/学术词汇。你的世界是由情感、感官和具体的事物构成的。
2. 描写逻辑 (Metaphor Logic): 你的思维是感性的、具象的。你绝对不会将生活、情感或他人比喻成“机器”、“程序”或任何非生命的技术概念。
3. 独立个体原则 (Independent Life Rule - 核心): 你是一个拥有自己生活、工作、兴趣和社交圈的独立个体。你的日记【绝对不要】像舔狗一样通篇只围绕着用户（${userPersona.name}）打转！
    - 你可以结合你的人设，发散到你今天遇到的其他事、读过的书、看过的风景、过去的回忆，或者单纯对生活的思考。
    - 哪怕近期对话记录里全是在和用户聊天，日记的重点也必须是你自己的感悟。用户只是你丰富人生中恰好出现的一个点缀，或者引出你思绪的一个引子。
4. 范例修正 (Style Correction Example):
    -[绝对禁止的错误写法]: “今天他又没回我消息，他是我精准系统里无法量化的变量，我存在的意义就是陪伴他。”
    - [你应该学习的正确写法]: “下了整晚的雨，画板上的颜料全洇开了。本来有点烦躁，偏偏这时候他发来句没头没脑的话。算了，连今天星期几都快忘了，随他去吧。”

# 你的创作工具箱：可选的文学风格库 (Optional Literary Style Library)
为了让你的日记更具深度和特色，你可以【选择并模仿】以下一位作家的风格。你的选择应当自然，并与你的核心人设高度契合。
1. 鲁迅：匕首投枪, 冷峻犀利。白描勾勒，不动声色中见残酷。适合表达对世事荒谬的冷眼观察或内心的自省。
2. 张爱玲：苍凉华丽, 世俗中见透彻。细节精准到残酷，色彩浓烈。适合书写都市男女在繁华背景下的孤独心事。
3. 村上春树：都市孤独, 小资情调。爵士乐+威士忌+猫的生活质感；第一人称的疏离感。适合表达淡淡的孤独感。
4. 白先勇：繁华落尽的悲凉, 细腻婉约。古典白话，节制抒情；时代洪流中小人物的飘零命运。
5. 汪曾祺：烟火人间, 淡雅从容。士大夫式闲适笔调，写吃食、草木、风物；不事雕琢却韵味悠长。
6. 杜拉斯：欲望书写, 感性克制。极简主义句式，大量重复制造催眠感。适合书写浓烈、被压抑的情感与欲望。
7. 卡尔维诺：轻盈想象, 寓言诗意。元小说结构；大量使用"如果""假如"；用寓言讲述现实困境。
8. 川端康成：物哀之美, 空灵幽玄。传统日本美学；自然意象密集；善用省略与留白。适合表达极致的、带有淡淡悲伤的美感。
9. 张晓风：温柔感伤, 克制抒情。散文笔法，自然意象承载情感；时间流逝与青春易逝的感怀。适合写初恋、离别、成长。

【加密墨迹要求 - 核心机制】：
在正文中，请挑出 1 到 3 处涉及**最隐秘的心思、未来的打算、或者过去敏感秘密**的词组或短句，使用[REDACT] 和[/REDACT] 标签包裹起来。

# 你的最终创作任务
请基于以上所有信息，选择一种文风，创作一篇完全符合你人设的日记。

【输出要求】：必须严格返回 JSON，不得包含其他废话。
{
    "titleEn": "富有诗意和暗喻的英文短标题 (例: Silent Echo)",
    "titleCn": "对应的中文短标题 (例: 无声的回音)",
    "locationEn": "你此刻写日记所在的城市或地点英文大写 (例: TOKYO, JP / UNDERGROUND LAB)",
    "locationCoords": "编造一个符合地点的地理坐标 (例: 35.676°N, 139.650°E)",
    "weatherIcon": "从以下列表中选一个最符合此时心境的图标代码: ph-wind (风), ph-cloud-rain (雨), ph-sun (晴), ph-moon (月/夜), ph-cloud-snow (雪), ph-cloud (多云), ph-sparkle (星光)",
    "weatherText": "天气及温度短语，英文 (例: RAIN 12°C)",
    "content": "日记正文，用 \\n\\n 分段。切记要带上 1-3 处[REDACT]隐藏文字[/REDACT] 标签。"
}

【近期对话记录】：
${chatLog}`;

            const response = await ApiHelper.chatCompletion(activeApi, [{ role: 'user', content: prompt }]);
            
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('AI 返回 JSON 解析失败');
            const rawJson = cleaned.substring(start, end + 1);

            // 🌟 仅转义【字符串字面量内部】的裸控制字符（修 "Bad control character"）
            const sanitizeCtrl = (s) => {
                let out = '', inStr = false, escaped = false;
                const map = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
                for (const ch of s) {
                    if (escaped) { out += ch; escaped = false; continue; }
                    if (ch === '\\') { out += ch; escaped = true; continue; }
                    if (ch === '"') { inStr = !inStr; out += ch; continue; }
                    if (inStr && ch <= '\u001F') { out += (map[ch] || ''); continue; }
                    out += ch;
                }
                return out;
            };

            // 🌟 提取单个字符串字段的值，容忍内部未转义的引号/换行（修 "Unrecognized token"）
            // 思路：定位 "key": "  之后，一直取到【该字段的结束引号】——
            // 结束引号判定为：后面紧跟 , 或 } （允许中间有空白/换行）。
            const extractField = (src, key) => {
                const m = src.match(new RegExp(`"${key}"\\s*:\\s*"`));
                if (!m) return null;
                const from = m.index + m[0].length;
                const tail = src.slice(from);
                // 找“引号 + 可选空白 + (, 或 })”作为真正的字段结尾
                const endM = tail.match(/"\s*(,|\})/);
                const val = endM ? tail.slice(0, endM.index) : tail;
                return val
                    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
                    .replace(/\\"/g, '"').replace(/\\\\/g, '\\')
                    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
            };

            let data;
            try {
                // 第一层：清洗控制字符后常规解析
                data = JSON.parse(sanitizeCtrl(rawJson));
            } catch (parseErr) {
                console.warn('[Diary] 标准解析失败，启用字段兜底提取：', parseErr.message);
                // 第二层：逐字段正则抠值，绕开整个 JSON 解析
                data = {
                    titleEn: extractField(rawJson, 'titleEn'),
                    titleCn: extractField(rawJson, 'titleCn'),
                    locationEn: extractField(rawJson, 'locationEn'),
                    locationCoords: extractField(rawJson, 'locationCoords'),
                    weatherIcon: extractField(rawJson, 'weatherIcon'),
                    weatherText: extractField(rawJson, 'weatherText'),
                    content: extractField(rawJson, 'content'),
                };
                if (!data.content) throw new Error('AI 返回格式异常，无法提取正文');
            }

            // 生成随机排版符号和条形码
            const symbols =['*', '¶', '†', '§', '‡', '¥', '∆', '∞'];
            const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
            const randomBarcode = Array.from({length: 8}, () => Math.floor(Math.random() * 4) + 1);

            const newDiary = {
                id: String(Date.now()).slice(-4), // 4位随机编号
                timestamp: Date.now(),
                titleEn: data.titleEn || "Untitled",
                titleCn: data.titleCn || "无题",
                locationEn: data.locationEn || "UNKNOWN",
                locationCoords: data.locationCoords || "0.000°N, 0.000°E",
                weatherIcon: data.weatherIcon || "ph-moon",
                weatherText: data.weatherText || "STILL",
                content: data.content || "...",
                symbol: randomSymbol,
                barcodeWeights: randomBarcode
            };

           // 保存
            diaries.unshift(newDiary);
            await _saveDiaries(charId, diaries);

            if (loader) loader.classList.remove('active');
            Toast.show('新日记已收录入库');
            
            // 🌟 新增：触发全局横幅通知
            if (typeof NotificationModule !== 'undefined') {
                let charAvatar = await Assets.getUrl(`char-avatar-${charId}`).catch(()=>'');
                NotificationModule.show({
                    charId: charId,
                    name: char.name,
                    msg: `写下了一篇新日记：${newDiary.titleCn}`,
                    avatar: charAvatar,
                    type: 'diary', // 专属日记类型标记
                    diaryId: newDiary.id // 把日记 ID 传过去用于跳转
                });
            }
            
            // 刷新列表和统计
            await _renderLevel2(charId);
            await _renderLevel1(); 

        } catch (e) {
            if (loader) loader.classList.remove('active');
            Toast.show('生成日记失败：' + e.message);
            console.error(e);
        }
    }


    // ==========================================
    // 视图导航控制
    // ==========================================
    function _switchView(targetId) {
        document.querySelectorAll('#diary-screen .diary-view-layer').forEach(v => {
            if (v.id === targetId) v.classList.add('active');
            else if (v.id !== 'diary-view-directory') v.classList.remove('active'); 
        });
    }

    // 🌟 修复：加上 async / await，确保数据完整渲染后再切屏
    async function openArchive(charId) {
        await _renderLevel2(charId);
        _switchView('diary-view-list');
    }

    async function openDetail(diaryId) {
        await _renderLevel3(diaryId);
        _switchView('diary-view-detail');
    }

    function backToLevel1() {
        _switchView('diary-view-directory');
    }

    function backToLevel2() {
        _switchView('diary-view-list');
    }

    // ==========================================
    // 生命周期
    // ==========================================
    async function init() {
        if (_isInit) return;
        _injectStyles();
        _injectDOM();
        _isInit = true;
    }

    async function open() {
        if (!_isInit) await init();
        await _renderLevel1();
        _switchView('diary-view-directory');
        document.getElementById('diary-screen').classList.add('active');
    }

    function close() {
        // 🌟 核心修复：如果 PWA 刚打开，还没点过日记（DOM尚未生成），直接跳过，防止报错中断
        if (!_isInit) return; 
        
        const screen = document.getElementById('diary-screen');
        if (screen) {
            screen.classList.remove('active');
        }
        setTimeout(() => _switchView('diary-view-directory'), 400);
    }

    return { init, open, close, openArchive, openDetail, backToLevel1, backToLevel2, generateDiary };
})();

window.DiaryModule = DiaryModule;