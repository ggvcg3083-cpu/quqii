/**
 * ============================================================
 * EditorialModule — OS 观测志 / 周刊系统 (静态 UI 修复版)
 * ============================================================
 */
const EditorialModule = (() => {
    let _initialized = false;
    let _botPosts =[]; // 存放 Bot 页面的所有帖子
    let _isDecrypting = false; // 防并发锁
    let _isRefreshingPinned = false; // 爆料贴刷新并发锁
    let _replyTargetMap = {}; // 记录每个帖子当前正在回复谁：{ postId: 'TargetName' }
    let _interviews =[]; // 存放所有盲采数据
    let _isGeneratingInterview = false; // 防止重复点击生成
    
    // --- 盲采数据库操作与轮盘抽卡 ---
    async function _loadInterviews() {
        try { _interviews = await DB.settings.get('ed-blind-interviews') ||[]; } 
        catch(e) { _interviews =[]; }
    }
    
    async function _saveInterviews() {
        await DB.settings.set('ed-blind-interviews', _interviews);
    }

    // 从不重复池子里抽取一个角色
    async function _pickUniqueCharForInterview() {
        let pool = await DB.settings.get('ed-blind-pool');
        const chars = await DB.characters.getAll().catch(()=>[]);
        if (chars.length === 0) return null;

        // 如果池子空了（或者第一次运行），重新把所有人丢进池子
        if (!pool || pool.length === 0) {
            pool = chars.map(c => String(c.id));
        }

        // 随机抽一个
        const idx = Math.floor(Math.random() * pool.length);
        const charId = pool[idx];
        
        // 抽出后从池子剔除，保存池子
        pool.splice(idx, 1);
        await DB.settings.set('ed-blind-pool', pool);

        return chars.find(c => String(c.id) === charId);
    }

    // --- 辅助：时间戳转换为相对时间 ---
    function _timeAgo(ts) {
        const diff = Date.now() - ts;
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'Just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        const d = Math.floor(h / 24);
        if (d === 1) return 'Yesterday';
        return `${d}d ago`;
    }

    // --- 辅助：读取和保存 Bot 帖子 ---
    async function _loadBotPosts() {
        try { _botPosts = await DB.settings.get('ed-bot-posts') || []; } 
        catch(e) { _botPosts =[]; }
    }
    async function _saveBotPosts() {
        await DB.settings.set('ed-bot-posts', _botPosts);
    }

    // --- 新增：点击评论准备回复 ---
    function prepareReply(postId, targetName) {
        _replyTargetMap[postId] = targetName;
        // 找到对应帖子的输入框
        const postCard = document.querySelector(`.collage-post [onclick="EditorialModule.handleCommentsClick('${postId}', this)"]`).closest('.collage-post');
        if (postCard) {
            const input = postCard.querySelector('.receipt-input');
            if (input) {
                input.placeholder = `回复 ${targetName}...`;
                input.focus();
            }
        }
    }
    
    // --- 新增：盲采区点击评论准备回复 ---
    function prepareInterviewReply(interviewId, targetName) {
        _replyTargetMap[interviewId] = targetName;
        // 找到对应盲采卡片的输入框
        const sendBtn = document.querySelector(`.editorial-card .btn-edit-send[onclick="EditorialModule.submitAnonAnswer(this, '${interviewId}')"]`);
        if (sendBtn) {
            const input = sendBtn.previousElementSibling.querySelector('input');
            if (input) {
                input.placeholder = `回复 ${targetName}...`;
                input.focus();
            }
        }
    }

    // ── 1. 注入专属字体与样式 (沙盒化，严防污染全局) ──
    function _injectStyles() {
        if (!document.getElementById('font-jetbrains')) {
            const fontLink = document.createElement('link');
            fontLink.id = 'font-jetbrains';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap';
            fontLink.rel = 'stylesheet';
            document.head.appendChild(fontLink);
        }

        const style = document.createElement('style');
        style.id = 'editorial-css';
        style.textContent = `
            #editorial-screen {
                --bg-cream: #f4f3ef;      
                --sage-green: #a3b19b;    
                --dusty-blue: #a2b5bf;    
                --text-dark: #3a3b3c;     
                --text-muted: #8c857e; 
                --occult-dark: #2c3439; 
                --white-glass: rgba(255, 255, 255, 0.7);
                --shadow-soft: 0 10px 40px rgba(163, 177, 155, 0.15);
                --shadow-float: 0 8px 24px rgba(0, 0, 0, 0.06);
                --border-thick: 2px solid #ffffff; 
                --border-thin: 1px solid var(--text-dark); 
                
                background-color: var(--bg-cream);
                color: var(--text-dark);
                overflow-x: hidden;
                overflow-y: auto;
                scrollbar-width: none;
                z-index: 150; 
                transform: translateX(100%);
                transition: transform 0.42s cubic-bezier(0.19,1,0.22,1), opacity 0.35s ease;
                padding-bottom: env(safe-area-inset-bottom, 20px);
            }
            #editorial-screen::-webkit-scrollbar { display: none; }
            #editorial-screen.active { transform: translateX(0); }
            #editorial-screen * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

            /* 巨大背景英文字 */
            #editorial-screen .deco-text {
                position: absolute; font-family: 'Playfair Display', serif; font-style: italic;
                font-weight: 700; color: var(--sage-green); opacity: 0.15; z-index: 0;
                pointer-events: none; user-select: none; white-space: nowrap;
            }
            #editorial-screen .deco-1 { top: 60px; left: -20px; font-size: 7rem; }
            #editorial-screen .deco-2 { top: 450px; right: -40px; font-size: 6rem; color: var(--dusty-blue); }

            /* 顶部导航 */
            #editorial-screen .ed-header {
                position: sticky; top: 0; z-index: 100; padding: max(env(safe-area-inset-top, 20px), 20px) 20px 20px;
                display: flex; justify-content: space-between; align-items: center;
                background: rgba(244, 243, 239, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            }
            #editorial-screen .btn-back {
                display: flex; align-items: center; gap: 4px; background: var(--text-dark); color: #fff;
                padding: 8px 16px; border-radius: 100px; font-family: 'Inter', sans-serif; font-size: 0.8rem;
                font-weight: 500; cursor: pointer; border: var(--border-thick); box-shadow: var(--shadow-float);
            }
            #editorial-screen .header-tabs {
                display: flex; gap: 6px; background: var(--white-glass); border-radius: 100px;
                padding: 4px; border: var(--border-thick);
            }
            #editorial-screen .ed-tab {
                padding: 6px 14px; font-size: 0.75rem; font-weight: 600; color: var(--text-muted);
                border-radius: 100px; cursor: pointer; transition: 0.3s;
            }
            #editorial-screen .ed-tab.active { background: var(--sage-green); color: #fff; }

            /* ================= 【视图 1：首页】 ================= */
            #ed-view-home .page-title { padding: 10px 24px 24px; position: relative; z-index: 2; }
            #ed-view-home .page-title h1 { font-size: 1.8rem; font-weight: 900; color: var(--text-dark); line-height: 1.2; letter-spacing: -0.5px; }
            #ed-view-home .page-title .subtitle { font-family: 'Playfair Display', serif; font-size: 0.9rem; color: var(--sage-green); font-style: italic; margin-bottom: 4px; }
            #ed-view-home .pill-tag { display: inline-flex; align-items: center; gap: 6px; background: var(--white-glass); border: var(--border-thick); padding: 6px 14px; border-radius: 100px; font-family: 'Inter', sans-serif; font-size: 0.75rem; font-weight: 700; color: var(--text-dark); margin-bottom: 16px; box-shadow: var(--shadow-float); }
            #ed-view-home .pill-tag i { color: var(--sage-green); font-size: 1rem; }
            
            /* Quotes */
            #ed-view-home .quotes-section { padding: 0 20px; position: relative; z-index: 2; margin-bottom: 36px; }
            #ed-view-home .folder-card { background: var(--sage-green); border-radius: 0 24px 24px 24px; padding: 24px; position: relative; box-shadow: var(--shadow-soft); border: var(--border-thick); margin-bottom: 20px; margin-top: 20px; }
            #ed-view-home .folder-tab { position: absolute; top: -24px; left: -2px; background: var(--sage-green); border: var(--border-thick); border-bottom: none; padding: 4px 16px; border-radius: 12px 12px 0 0; font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; color: #fff; font-size: 0.85rem; }
            #ed-view-home .folder-card .quote-mark { font-family: 'Playfair Display', serif; font-size: 4rem; color: rgba(255,255,255,0.2); position: absolute; top: -10px; right: 20px; line-height: 1; }
            #ed-view-home .folder-card .text { font-size: 1.05rem; font-weight: 700; line-height: 1.6; color: #ffffff; margin-bottom: 20px; position: relative; z-index: 1; }
            #ed-view-home .author-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.9); padding: 4px 12px 4px 4px; border-radius: 100px; border: var(--border-thick); }
            #ed-view-home .author-badge img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
            #ed-view-home .author-badge .name { font-size: 0.75rem; font-weight: 700; color: var(--sage-green); }
            
            #ed-view-home .bubble-quotes { display: flex; flex-direction: column; gap: 12px; }
            #ed-view-home .bubble-card { background: #ffffff; border: var(--border-thick); padding: 16px; box-shadow: var(--shadow-float); position: relative; }
            #ed-view-home .bubble-card:nth-child(1) { border-radius: 20px 20px 20px 4px; }
            #ed-view-home .bubble-card:nth-child(2) { border-radius: 20px 20px 4px 20px; margin-left: 20px; background: var(--dusty-blue); }
            #ed-view-home .bubble-card:nth-child(2) .text { color: #fff; }
            #ed-view-home .bubble-card:nth-child(2) .author-name { color: #fff; opacity: 0.9; }
            #ed-view-home .bubble-card .text { font-size: 0.85rem; font-weight: 500; color: var(--text-dark); margin-bottom: 12px; line-height: 1.5; }
            #ed-view-home .bubble-author { display: flex; align-items: center; gap: 6px; }
            #ed-view-home .bubble-author img { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; }
            #ed-view-home .bubble-author .author-name { font-size: 0.7rem; color: var(--text-muted); font-weight: 600;}

            /* Hot Topic */
            #ed-view-home .topic-section { padding: 0 20px; margin-bottom: 36px; position: relative; z-index: 2; }
            #ed-view-home .topic-ticket { background: #ffffff; border-radius: 20px; padding: 20px; box-shadow: var(--shadow-float); position: relative; }
            #ed-view-home .topic-inner { border: 1px dashed var(--dusty-blue); border-radius: 12px; padding: 16px; }
            #ed-view-home .topic-title { font-size: 1rem; font-weight: 800; color: var(--text-dark); margin-bottom: 8px; line-height: 1.4; }
            #ed-view-home .topic-desc { font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 16px; }
            #ed-view-home .topic-btn { background: var(--text-dark); color: #fff; border: none; padding: 8px 20px; border-radius: 100px; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 6px; width: max-content; }

            /* Active Entity */
            #ed-view-home .active-section { padding: 0 20px; margin-bottom: 36px; position: relative; z-index: 2; }
            #ed-view-home .active-widget { background: var(--white-glass); border: var(--border-thick); border-radius: 24px; padding: 20px; box-shadow: var(--shadow-float); }
            #ed-view-home .active-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-weight: 700; font-size: 0.95rem; }
            #ed-view-home .active-grid { display: flex; align-items: center; position: relative; height: 60px; }
            #ed-view-home .circle-avatar { width: 50px; height: 50px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: var(--shadow-float); position: absolute; background: #e9e9e9; }
            #ed-view-home .circle-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
            #ed-view-home .circle-avatar:nth-child(1) { left: 0; z-index: 3; }
            #ed-view-home .circle-avatar:nth-child(2) { left: 35px; z-index: 2; }
            #ed-view-home .circle-avatar:nth-child(3) { left: 70px; z-index: 1; }
            #ed-view-home .typing-bubble { position: absolute; right: 0; background: var(--dusty-blue); color: #fff; padding: 6px 14px; border-radius: 100px 100px 100px 4px; font-size: 0.75rem; font-weight: 600; border: 2px solid #fff; box-shadow: var(--shadow-float); display: flex; align-items: center; gap: 4px; }

            /* Danmaku */
            #ed-view-home .danmaku-section { position: relative; padding: 10px 0 30px; z-index: 2; width: 100%; overflow: hidden; }
            #ed-view-home .danmaku-title { padding: 0 20px 24px; font-family: 'Inter', sans-serif; font-size: 0.8rem; font-weight: 700; color: var(--sage-green); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 6px; }
            #ed-view-home .danmaku-container { width: 100%; overflow: hidden; display: flex; flex-direction: column; gap: 28px; position: relative; padding: 10px 0; }
            #ed-view-home .danmaku-mask { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, var(--bg-cream) 0%, transparent 10%, transparent 90%, var(--bg-cream) 100%); pointer-events: none; z-index: 10; }
            #ed-view-home .track { display: flex; align-items: center; white-space: nowrap; width: max-content; }
            #ed-view-home .track-1 { animation: ed-scroll-left 35s linear infinite; }
            #ed-view-home .track-2 { animation: ed-scroll-right 40s linear infinite; padding-left: 50px; }
            #ed-view-home .collage-item { display: inline-flex; align-items: center; margin-right: 36px; position: relative; gap: 6px; white-space: nowrap; }
            #ed-view-home .type-memo { background: #ffffff; padding: 10px 18px; font-size: 0.85rem; font-weight: 500; color: var(--text-dark); border-radius: 2px 12px 3px 10px; box-shadow: 2px 4px 12px rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.03); }
            #ed-view-home .type-memo::after { content: ''; position: absolute; top: -8px; left: 50%; transform: translateX(-50%) rotate(-4deg); width: 32px; height: 14px; background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.05); backdrop-filter: blur(4px); }
            #ed-view-home .type-tape { background: rgba(163, 177, 155, 0.4); color: var(--text-dark); padding: 6px 16px; font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; font-size: 0.95rem; border-left: 2px dashed rgba(255,255,255,0.6); border-right: 2px dashed rgba(255,255,255,0.6); }
            #ed-view-home .type-dymo { background: var(--text-dark); color: #ffffff; font-family: 'Inter', sans-serif; text-transform: uppercase; font-size: 0.75rem; font-weight: 700; padding: 6px 12px; border-radius: 2px; box-shadow: 1px 2px 4px rgba(0,0,0,0.2); letter-spacing: 0.5px; }
            #ed-view-home .type-highlight { background: linear-gradient(transparent 55%, rgba(162, 181, 191, 0.5) 55%); font-size: 0.85rem; font-weight: 700; color: var(--text-dark); padding: 0 6px; }
            #ed-view-home .track-1 .collage-item:nth-child(1) { transform: rotate(-2deg) translateY(5px); }
            #ed-view-home .track-1 .collage-item:nth-child(2) { transform: rotate(3deg) translateY(-8px); }
            #ed-view-home .track-1 .collage-item:nth-child(3) { transform: rotate(-1deg) translateY(8px); }
            #ed-view-home .track-1 .collage-item:nth-child(4) { transform: rotate(2deg) translateY(-2px); }
            #ed-view-home .track-2 .collage-item:nth-child(1) { transform: rotate(2deg) translateY(-8px); }
            #ed-view-home .track-2 .collage-item:nth-child(2) { transform: rotate(-3deg) translateY(6px); }
            #ed-view-home .track-2 .collage-item:nth-child(3) { transform: rotate(1deg) translateY(-4px); }
            #ed-view-home .track-2 .collage-item:nth-child(4) { transform: rotate(-2deg) translateY(5px); }

            @keyframes ed-scroll-left { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
            @keyframes ed-scroll-right { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }

            /* ================= 【视图 2：Bot 投稿专版】 ================= */
            #ed-view-bot { padding: 0 20px 40px; position: relative; z-index: 2; }
            #ed-view-bot .bot-page-title { margin-bottom: 24px; padding-top: 10px; }
            #ed-view-bot .bot-page-title h1 { font-size: 1.6rem; font-weight: 900; color: var(--text-dark); margin-bottom: 4px; }
            #ed-view-bot .bot-page-title p { font-family: 'Playfair Display', serif; font-size: 0.85rem; color: var(--sage-green); font-style: italic; }

            #ed-view-bot .collage-feed { display: flex; flex-direction: column; gap: 40px; }
            #ed-view-bot .collage-post { position: relative; display: flex; flex-direction: column; }
            #ed-view-bot .post-watermark { position: absolute; top: -20px; right: -10px; font-family: 'Playfair Display', serif; font-size: 4.5rem; font-weight: 700; font-style: italic; color: rgba(0,0,0,0.03); pointer-events: none; z-index: 0; line-height: 1; }
            #ed-view-bot .post-meta-tag { position: relative; z-index: 3; align-self: flex-start; font-family: 'Inter', sans-serif; font-size: 0.65rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 4px 12px; border-radius: 4px 12px 4px 4px; margin-bottom: -10px; margin-left: 16px; box-shadow: var(--shadow-float); }
            
            #ed-view-bot .tag-bot { background: #2a2a2a; color: #fff; }
            #ed-view-bot .tag-role { background: var(--sage-green); color: #fff; }
            #ed-view-bot .tag-user { background: var(--dusty-blue); color: #fff; }
            #ed-view-bot .tag-guest { background: #e0dcd3; color: var(--text-dark); }

            /* Bot面板 */
            #ed-view-bot .widget-bot-pinned { background: rgba(30, 30, 30, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.2); position: relative; z-index: 2; color: #fff; }
            #ed-view-bot .widget-bot-pinned .post-text { font-size: 0.95rem; line-height: 1.6; color: #f4f3ef; margin-bottom: 20px; }
            #ed-view-bot .pin-deco { position: absolute; top: -10px; right: 20px; font-size: 1.8rem; color: #d4a373; transform: rotate(15deg); filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); }

            /* 角色/用户面板 */
            #ed-view-bot .widget-polaroid-post { position: relative; z-index: 2; width: 100%; }
            #ed-view-bot .post-content-widget { width: 100%; background: rgba(255,255,255,0.85); backdrop-filter: blur(12px); border: var(--border-thick); border-radius: 16px; padding: 24px 20px; box-shadow: var(--shadow-soft); position: relative; z-index: 3; }
            #ed-view-bot .post-content-widget .author-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
            #ed-view-bot .author-row img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(0,0,0,0.05); }
            #ed-view-bot .author-row .name { font-weight: 800; font-size: 0.85rem; color: var(--text-dark); }
            #ed-view-bot .author-row .time { font-family: 'Inter', sans-serif; font-size: 0.65rem; color: var(--text-muted); margin-left: auto; }
            #ed-view-bot .post-content-widget .post-text { font-size: 0.9rem; line-height: 1.6; color: var(--text-dark); margin-bottom: 20px; }

            /* 相片点缀 */
            #ed-view-bot .mini-polaroid { position: absolute; top: -15px; right: 15px; width: 60px; height: 70px; background: #fff; padding: 4px; padding-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: rotate(8deg); z-index: 5; border: 1px solid rgba(0,0,0,0.05); }
            #ed-view-bot .mini-polaroid img { width: 100%; height: 100%; object-fit: cover; }
            #ed-view-bot .mini-tape { position: absolute; top: -6px; left: 50%; transform: translateX(-50%) rotate(-8deg); width: 24px; height: 10px; background: rgba(163, 177, 155, 0.4); border-left: 1px dashed rgba(255,255,255,0.8); border-right: 1px dashed rgba(255,255,255,0.8); z-index: 6; }
            #ed-view-bot .mini-stamp { position: absolute; top: -10px; right: 20px; width: 44px; height: 44px; background: var(--dusty-blue); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Playfair Display', serif; font-size: 1.2rem; font-style: italic; box-shadow: 0 4px 10px rgba(0,0,0,0.1); transform: rotate(-15deg); z-index: 5; border: 2px dashed rgba(255,255,255,0.8); }

            /* 互动条与评论 */
            #ed-view-bot .interaction-bar { display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed rgba(0,0,0,0.1); padding-top: 16px; }
            #ed-view-bot .widget-bot-pinned .interaction-bar { border-top-color: rgba(255,255,255,0.15); }
            #ed-view-bot .action-btn { display: flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--text-muted); font-size: 0.8rem; font-weight: 600; cursor: pointer; }
            #ed-view-bot .widget-bot-pinned .action-btn { color: #a8a39f; }
            #ed-view-bot .action-btn i { font-size: 1.1rem; }

            #ed-view-bot .receipt-comments { display: none; width: 90%; margin: 0 auto; background: #faf9f6; border: 1px solid rgba(0,0,0,0.06); border-top: none; border-radius: 0 0 12px 12px; padding: 24px 20px 20px; position: relative; z-index: 1; margin-top: -12px; box-shadow: 0 10px 20px rgba(0,0,0,0.04); background-image: radial-gradient(circle at 10px 0, transparent 10px, #faf9f6 11px); background-size: 20px 100%; background-repeat: repeat-x; background-position: top; }
            #ed-view-bot .receipt-comments.dark-receipt { background: #2a2a2a; color: #e0dcd3; border: 1px solid rgba(255,255,255,0.1); background-image: radial-gradient(circle at 10px 0, transparent 10px, #2a2a2a 11px); }
            #ed-view-bot .receipt-list { display: flex; flex-direction: column; gap: 14px; }
            #ed-view-bot .receipt-item { font-size: 0.8rem; line-height: 1.5; color: var(--text-dark); padding-bottom: 10px; border-bottom: 1px dotted rgba(0,0,0,0.15); }
            #ed-view-bot .dark-receipt .receipt-item { color: #e0dcd3; border-bottom-color: rgba(255,255,255,0.15); }
            #ed-view-bot .receipt-item:last-child { border-bottom: none; padding-bottom: 0;}
            #ed-view-bot .receipt-item .c-name { font-family: 'Inter', sans-serif; font-weight: 700; margin-right: 8px; text-transform: uppercase; font-size: 0.7rem; color: var(--sage-green); }
            #ed-view-bot .dark-receipt .receipt-item .c-name { color: #d4a373; }
            #ed-view-bot .receipt-input-area { display: flex; align-items: center; margin-top: 20px; gap: 12px; width: 100%; box-sizing: border-box; }
            #ed-view-bot .receipt-input { flex-grow: 1; width: 0; background: transparent; border: none; border-bottom: 2px solid rgba(0,0,0,0.8); padding: 4px 0; font-family: 'Noto Sans SC', sans-serif; font-size: 0.8rem; color: var(--text-dark); outline: none; border-radius: 0; }
            #ed-view-bot .dark-receipt .receipt-input { border-bottom-color: rgba(255,255,255,0.8); color: white; }
            #ed-view-bot .receipt-input::placeholder { font-style: italic; color: rgba(0,0,0,0.3); }
            #ed-view-bot .dark-receipt .receipt-input::placeholder { color: rgba(255,255,255,0.3); }
            #ed-view-bot .btn-receipt-send { flex-shrink: 0; background: var(--text-dark); color: #fff; border: none; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 0.7rem; padding: 6px 12px; border-radius: 4px; cursor: pointer; text-transform: uppercase; }
            #ed-view-bot .dark-receipt .btn-receipt-send { background: #fff; color: #000; }

            /* ================= 【视图 3: 盲采 (完整修复版)】 ================= */
            #ed-view-interview { padding: 0 24px 40px; position: relative; z-index: 2; }
            #ed-view-interview .editorial-title { margin-bottom: 40px; padding-top: 20px; border-bottom: var(--border-thin); padding-bottom: 20px; }
            #ed-view-interview .editorial-title .eng-sub { font-family: 'Inter', sans-serif; font-size: 0.65rem; font-weight: 700; color: var(--sage-green); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }
            #ed-view-interview .editorial-title h1 { font-family: 'Playfair Display', serif; font-size: 2.2rem; font-weight: 700; font-style: italic; color: var(--text-dark); line-height: 1.1; }
            #ed-view-interview .editorial-title h1 span { font-family: 'Noto Sans SC', sans-serif; font-size: 1.6rem; font-weight: 400; font-style: normal; }
            #ed-view-interview .interview-feed { display: flex; flex-direction: column; gap: 48px; }
            #ed-view-interview .editorial-card { display: flex; flex-direction: column; position: relative; }
            #ed-view-interview .edit-meta { display: flex; justify-content: space-between; align-items: center; font-family: 'Inter', sans-serif; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 24px; }
            #ed-view-interview .edit-meta .timestamp { color: var(--text-dark); font-weight: 700; }
            #ed-view-interview .edit-body { display: flex; gap: 16px; margin-bottom: 32px; }
            #ed-view-interview .edit-q-mark { font-family: 'Playfair Display', serif; font-size: 3.5rem; font-weight: 700; line-height: 0.8; color: var(--sage-green); margin-top: -4px; }
            #ed-view-interview .edit-question { font-family: 'Noto Sans SC', sans-serif; font-size: 1.1rem; font-weight: 500; line-height: 1.7; color: var(--text-dark); letter-spacing: 0.5px; }
            #ed-view-interview .edit-toggle-btn { display: flex; justify-content: space-between; align-items: center; border: var(--border-thin); padding: 12px 16px; background: transparent; color: var(--text-dark); font-family: 'Inter', sans-serif; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: all 0.3s ease; border-radius: 4px; }
            #ed-view-interview .editorial-card.open .edit-toggle-btn { background: var(--text-dark); color: #ffffff; }
            #ed-view-interview .edit-answers-panel { display: none; margin-top: 24px; padding-left: 20px; border-left: 2px solid rgba(163, 177, 155, 0.3); }
            #ed-view-interview .editorial-card.open .edit-answers-panel { display: block; animation: ed-fadeIn 0.4s ease; }
            #ed-view-interview .edit-answer-list { display: flex; flex-direction: column; gap: 28px; }
            #ed-view-interview .edit-answer-item { display: flex; flex-direction: column; gap: 6px; }
            #ed-view-interview .anon-header { display: flex; justify-content: space-between; align-items: center; font-family: 'Inter', sans-serif; text-transform: uppercase; }
            #ed-view-interview .anon-id { font-size: 0.65rem; font-weight: 700; letter-spacing: 1px; color: var(--text-dark); display: flex; align-items: center; gap: 6px; }
            #ed-view-interview .anon-id::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--dusty-blue); }
            #ed-view-interview .anon-time { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.5px; font-family: 'JetBrains Mono', monospace; }
            #ed-view-interview .anon-text { font-family: 'Noto Sans SC', sans-serif; font-size: 0.85rem; font-weight: 400; line-height: 1.6; color: var(--text-dark); }
            #ed-view-interview .edit-input-area { margin-top: 36px; display: flex; align-items: flex-end; gap: 16px; }
            #ed-view-interview .edit-input-wrapper { flex-grow: 1; position: relative; }
            #ed-view-interview .edit-input { width: 100%; background: transparent; border: none; border-bottom: 1px dashed var(--text-muted); padding: 8px 0; font-family: 'Noto Sans SC', sans-serif; font-size: 0.85rem; color: var(--text-dark); outline: none; transition: border-bottom 0.3s; }
            #ed-view-interview .edit-input:focus { border-bottom: 1px solid var(--text-dark); }
            #ed-view-interview .edit-input::placeholder { color: rgba(0,0,0,0.3); font-weight: 400; font-style: italic; }
            #ed-view-interview .btn-edit-send { background: transparent; color: var(--sage-green); border: none; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; padding-bottom: 8px; }


            /* ================= 【视图 4：周刊页 (修复裁边)】 ================= */
            #ed-view-weekly { padding: 0 20px 60px; position: relative; z-index: 2; overflow-x: hidden; }
            #ed-view-weekly .tarot-roles { display: flex; gap: 16px; overflow-x: auto; padding: 10px 10px 30px; margin-bottom: 20px; scrollbar-width: none; }
            #ed-view-weekly .tarot-roles::-webkit-scrollbar { display: none; }
            #ed-view-weekly .tarot-card { width: 72px; height: 110px; background: #fff; border: 1px solid var(--text-dark); padding: 4px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; flex-shrink: 0; opacity: 0.5; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; box-shadow: 2px 2px 0 rgba(0,0,0,0.05); }
            #ed-view-weekly .tarot-card.active { opacity: 1; transform: translateY(-8px) scale(1.05); box-shadow: 4px 6px 0 var(--dusty-blue); border-color: var(--dusty-blue); }
            #ed-view-weekly .tarot-img { width: 100%; height: 75px; object-fit: cover; filter: grayscale(100%) contrast(1.2); border: 1px solid rgba(0,0,0,0.1); }
            #ed-view-weekly .tarot-card.active .tarot-img { filter: grayscale(0%) contrast(1); }
            #ed-view-weekly .tarot-name { font-family: 'Playfair Display', serif; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dark); padding-bottom: 2px; }

            #ed-view-weekly .weekly-header-title { font-family: 'Playfair Display', serif; font-size: 3rem; font-weight: 700; font-style: italic; color: var(--text-dark); line-height: 1; margin-bottom: 40px; padding-left: 10px; }

            #ed-view-weekly .collage-block { margin-bottom: 60px; position: relative; }
            #ed-view-weekly .collage-title { font-family: 'Inter', sans-serif; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: var(--text-dark); margin-bottom: 16px; padding-left: 10px; display: flex; align-items: center; gap: 6px; }

            /* 星图 */
            #ed-view-weekly .star-map-board { background: var(--occult-dark); padding: 30px 24px; border-radius: 4px; box-shadow: 4px 6px 20px rgba(0,0,0,0.1); position: relative; overflow: hidden; color: #e0e0e0; }
            #ed-view-weekly .star-map-board::after { content: ''; position: absolute; top: -20px; right: -20px; width: 150px; height: 150px; border-radius: 50%; border: 1px dashed rgba(255,255,255,0.15); pointer-events: none; }
            #ed-view-weekly .star-map-board::before { content: ''; position: absolute; bottom: 10px; left: -30px; width: 200px; height: 1px; background: rgba(255,255,255,0.1); transform: rotate(-35deg); pointer-events: none; }
            #ed-view-weekly .s-tension-text { font-size: 0.9rem; line-height: 1.8; position: relative; z-index: 2; font-weight: 300; }
            #ed-view-weekly .s-tension-text::first-letter { font-family: 'Playfair Display', serif; font-size: 3.5rem; float: left; margin-right: 12px; line-height: 0.8; color: var(--dusty-blue); font-style: italic; margin-top: 4px; }

            /* 街拍 */
            #ed-view-weekly .spy-photo-wrap { position: relative; padding: 10px; }
            #ed-view-weekly .washi-tape-1 { position: absolute; top: 0; left: 10%; width: 60px; height: 18px; background: rgba(163, 177, 155, 0.5); transform: rotate(-4deg); z-index: 5; border-left: 2px dashed rgba(255,255,255,0.6); }
            #ed-view-weekly .washi-tape-2 { position: absolute; bottom: 30px; right: -5px; width: 45px; height: 18px; background: rgba(162, 181, 191, 0.5); transform: rotate(78deg); z-index: 5; border-right: 2px dashed rgba(255,255,255,0.6); }
            #ed-view-weekly .spy-polaroid { background: #fff; padding: 8px 8px 30px 8px; box-shadow: 4px 6px 16px rgba(0,0,0,0.06); transform: rotate(2deg); position: relative; border: 1px solid rgba(0,0,0,0.05); }
            #ed-view-weekly .spy-img { width: 100%; height: 220px; object-fit: cover; filter: grayscale(100%) contrast(1.5) blur(2px); opacity: 0.85; background: #000; }
            #ed-view-weekly .spy-caption { position: absolute; bottom: 8px; left: 12px; font-family: 'Inter', sans-serif; font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }

            /* 塔罗名句 */
            #ed-view-weekly .quote-tarot-card { background: #fff; border: 1px solid var(--text-dark); padding: 32px 24px; position: relative; box-shadow: -4px 4px 0 var(--sage-green); }
            #ed-view-weekly .quote-tarot-card .q-mark { position: absolute; top: -15px; left: 16px; font-family: 'Playfair Display', serif; font-size: 5rem; color: rgba(0,0,0,0.05); line-height: 1; }
            #ed-view-weekly .quote-tarot-text { font-family: 'Noto Sans SC', sans-serif; font-size: 1rem; font-weight: 500; line-height: 1.8; position: relative; z-index: 1; margin-bottom: 20px; color: var(--text-dark); }
            #ed-view-weekly .quote-tarot-source { font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; text-transform: uppercase; color: var(--text-muted); text-align: right; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 12px; }

            /* 收据诗 */
            #ed-view-weekly .receipt-slip { background: #fff; padding: 24px; border: 1px solid rgba(0,0,0,0.08); border-top: 2px dashed rgba(0,0,0,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.03); position: relative; }
            #ed-view-weekly .receipt-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
            #ed-view-weekly .receipt-code { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; font-weight: 700; color: var(--text-dark); letter-spacing: 1px; }
            #ed-view-weekly .receipt-poem { font-size: 0.85rem; line-height: 1.6; color: var(--text-muted); }
            #ed-view-weekly .barcode-footer { height: 35px; width: 100%; margin-top: 30px; opacity: 0.8; background: repeating-linear-gradient(90deg, var(--text-dark), var(--text-dark) 2px, transparent 2px, transparent 5px, var(--text-dark) 5px, var(--text-dark) 6px, transparent 6px, transparent 10px, var(--text-dark) 10px, var(--text-dark) 14px, transparent 14px, transparent 16px); }

            /* 机密剧本 */
            #ed-view-weekly .script-dossier { background: var(--white-glass); backdrop-filter: blur(8px); padding: 24px 20px; border: 1px solid rgba(0,0,0,0.05); box-shadow: var(--shadow-float); position: relative; }
            #ed-view-weekly .confidential-stamp { position: absolute; top: -10px; right: -10px; font-family: 'Inter', sans-serif; font-size: 0.65rem; font-weight: 800; color: #d64045; border: 2px solid #d64045; padding: 2px 8px; transform: rotate(15deg); letter-spacing: 2px; opacity: 0.7; }
            #ed-view-weekly .script-line { display: flex; gap: 12px; margin-bottom: 16px; font-size: 0.85rem; line-height: 1.6; }
            #ed-view-weekly .script-line:last-child { margin-bottom: 0; }
            #ed-view-weekly .script-speaker { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 1rem; color: var(--dusty-blue); width: 24px; flex-shrink: 0; text-align: right; }
            #ed-view-weekly .script-dialog { color: var(--text-dark); }
            #ed-view-weekly .script-action { color: var(--text-muted); font-style: italic; }

            @keyframes ed-fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
            /* ================= 【首页：倒计时封面】 ================= */
            .ed-cover-view {
                position: absolute; inset: 0; z-index: 50;
                background: var(--bg-cream);
                display: flex; flex-direction: column; align-items: center; justify-content: center;
            }
            .ed-cover-timer {
                font-family: 'JetBrains Mono', monospace; font-size: 2.5rem; font-weight: 800;
                color: var(--sage-green); letter-spacing: 2px; margin-bottom: 24px;
            }
            .ed-cover-title {
                font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700; font-style: italic;
                color: var(--text-dark); margin-bottom: 8px;
            }
            .ed-cover-subtitle {
                font-family: 'Inter', sans-serif; font-size: 0.75rem; letter-spacing: 4px;
                text-transform: uppercase; color: var(--text-muted); margin-bottom: 60px;
            }
            .ed-btn-generate {
                background: var(--text-dark); color: #fff; border: none; padding: 16px 32px;
                border-radius: 100px; font-family: 'Space Mono', monospace; font-size: 0.8rem;
                font-weight: 700; letter-spacing: 2px; text-transform: uppercase; cursor: pointer;
                box-shadow: 0 10px 30px rgba(0,0,0,0.15); transition: transform 0.2s;
                display: flex; align-items: center; gap: 10px;
            }
            .ed-btn-generate:active { transform: scale(0.95); }
            .ed-cover-loading {
                display: flex; flex-direction: column; align-items: center; gap: 16px;
                font-family: 'Space Mono', monospace; font-size: 0.75rem; color: var(--sage-green);
                text-transform: uppercase; letter-spacing: 2px;
            }
            .ed-cover-loading i { font-size: 2rem; animation: ed-spin 1s linear infinite; }
            @keyframes ed-spin { 100% { transform: rotate(360deg); } }
            
            /* 顶部小倒计时 */
            .ed-header-countdown {
                font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; color: var(--text-muted);
                letter-spacing: 1px; margin-top: 4px; display: none;
            }
        `;
        document.head.appendChild(style);
    }

    // ── 2. 注入 HTML DOM ──
    function _injectHTML() {
        const screen = document.createElement('div');
        screen.id = 'editorial-screen';
        screen.className = 'screen';
        
        screen.innerHTML = `
            <!-- 巨大装饰字 -->
            <div class="deco-text deco-1">Aesthetic</div>
            <div class="deco-text deco-2">Archive</div>

            <!-- 顶部 Header -->
            <header class="ed-header">
                <button class="btn-back" onclick="EditorialModule.close()">
                    <i class="ph-bold ph-caret-left"></i> BACK
                </button>
                <div class="header-tabs">
                    <div class="ed-tab active" data-target="ed-view-home">首页</div>
                    <div class="ed-tab" data-target="ed-view-bot">Bot投稿</div>
                    <div class="ed-tab" data-target="ed-view-interview">盲采</div>
                    <div class="ed-tab" data-target="ed-view-weekly">周刊</div>
                </div>
            </header>

         <!-- ================= 【视图 1：首页】 ================= -->
            <div id="ed-view-home" style="display: block; position: relative; min-height: 100vh;">
                
                <!-- 状态 A: 倒计时封面 / 提取按钮 -->
                <div id="ed-home-cover" class="ed-cover-view">
                    <div class="ed-cover-title">THE OBSERVERS</div>
                    <div class="ed-cover-subtitle">Weekly Editorial</div>
                    <div class="ed-cover-timer" id="ed-cover-timer">--:--:--</div>
                    
                    <button id="ed-btn-generate" class="ed-btn-generate" style="display:none;" onclick="EditorialModule.generateWeekly()">
                        <i class="ph-bold ph-asterisk"></i> 提取本周档案
                    </button>
                    
                    <div id="ed-cover-loading" class="ed-cover-loading" style="display:none;">
                        <i class="ph-thin ph-circle-notch"></i>
                        <span>检索全网数据排版中...</span>
                    </div>
                </div>

                <!-- 状态 B: 真实内容 (默认隐藏) -->
                <div id="ed-home-content" style="display: none;">
                    <div class="page-title">
                        <div class="subtitle" id="ed-issue-number">Vol. -- / The Observers</div>
                        <h1>每周金句与观测档案</h1>
                        <div class="ed-header-countdown" id="ed-header-countdown">NEXT ISSUE: --:--:--</div>
                    </div>

                    <section class="quotes-section">
                        <div class="pill-tag"><i class="ph-fill ph-quotes"></i> Top Quotes</div>
                        
                        <!-- 金句 1 -->
                        <div class="folder-card">
                            <div class="folder-tab">Rank 01</div>
                            <div class="quote-mark">“</div>
                            <div class="text" id="ed-q1-text">...</div>
                            <div class="author-badge">
                                <img id="ed-q1-img" src="https://i.postimg.cc/BQnbRd0D/IMG-0015.jpg" alt="">
                                <span class="name" id="ed-q1-author">...</span>
                            </div>
                        </div>
                        
                        <div class="bubble-quotes">
                            <!-- 金句 2 -->
                            <div class="bubble-card">
                                <div class="text" id="ed-q2-text">...</div>
                                <div class="bubble-author">
                                    <img id="ed-q2-img" src="https://i.postimg.cc/BQnbRd0D/IMG-0015.jpg" alt=""><span class="author-name" id="ed-q2-author">...</span>
                                </div>
                            </div>
                            <!-- 金句 3 -->
                            <div class="bubble-card">
                                <div class="text" id="ed-q3-text">...</div>
                                <div class="bubble-author">
                                    <img id="ed-q3-img" src="https://i.postimg.cc/BQnbRd0D/IMG-0015.jpg" alt=""><span class="author-name" id="ed-q3-author">...</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="topic-section">
                        <div class="pill-tag" style="color: var(--dusty-blue);"><i class="ph-fill ph-fire" style="color: var(--dusty-blue);"></i> Hot Topic</div>
                        <div class="topic-ticket">
                            <div class="topic-inner">
                                <div class="topic-title" id="ed-topic-title">...</div>
                                <div class="topic-desc" id="ed-topic-desc">...</div>
                                <button class="topic-btn" onclick="EditorialModule.showMessage('话题板开发中')"><i class="ph-bold ph-chat-circle-text"></i> 去讨论</button>
                            </div>
                        </div>
                    </section>

                    <section class="active-section">
                        <div class="active-widget">
                            <div class="active-header"><span>每周活跃实体</span><i class="ph-bold ph-dots-three"></i></div>
                            <div class="active-grid" id="ed-active-grid">
                                <!-- JS 动态注入头像 -->
                            </div>
                        </div>
                    </section>

                    <section class="danmaku-section">
                        <div class="danmaku-title"><i class="ph-fill ph-users"></i> Live Chatter</div>
                        <div class="danmaku-container">
                            <div class="danmaku-mask"></div>
                            <div class="track track-1" id="track-1"></div>
                            <div class="track track-2" id="track-2"></div>
                        </div>
                    </section>
                </div>
            </div>

            <!-- ================= 【视图 2：Bot 投稿专版】 ================= -->
            <div id="ed-view-bot" style="display: none;">
                
                <!-- 标题与按钮并排 -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-top: 10px;">
                    <div class="bot-page-title" style="margin-bottom: 0; padding-top: 0;">
                        <h1>观测者备忘录</h1>
                        <p>Observer's Memos & Submissions</p>
                    </div>
                    <button id="btn-refresh-bot" onclick="EditorialModule.forceGenerateNewPosts(this)" 
                            style="display: flex; align-items: center; gap: 4px; background: transparent; color: var(--text-dark); border: 1px dashed var(--text-muted); padding: 5px 10px; border-radius: 100px; font-family: 'Space Mono', monospace; font-size: 0.65rem; font-weight: 700; cursor: pointer; transition: all 0.2s; margin-top: 6px; flex-shrink: 0;">
                        <i class="ph-bold ph-radar"></i> FETCH
                    </button>
                </div>

                <div class="collage-feed">
                    
                    <!-- 1. 全知视角 Bot -->
                    <div class="collage-post">
                        <div class="post-watermark">Pinned</div>
                        <div class="post-meta-tag tag-bot"><i class="ph-fill ph-eye"></i> Observer</div>
                        
                        <div class="widget-bot-pinned">
                            <i class="ph-fill ph-push-pin pin-deco"></i>
                            <div class="post-text">
                                【私密观测】刚偷看后台数据发现，某位主打“冰山高冷”人设的实体，在凌晨趁没人聊天的时候，偷偷把用户发的小猫视频循环播放了 17 次。我不说是谁，请当事人好自为之。
                            </div>
                            <div class="interaction-bar">
                                <button class="action-btn" onclick="EditorialModule.toggleLike(this)"><i class="ph ph-heart"></i> 1.2k</button>
                                <button class="action-btn" onclick="EditorialModule.toggleReceiptComments(this)"><i class="ph ph-list-dashes"></i> View Records</button>
                            </div>
                        </div>

                        <div class="receipt-comments dark-receipt">
                            <div class="receipt-list">
                                <div class="receipt-item"><span class="c-name">Alistair</span>...手滑而已。</div>
                                <div class="receipt-item"><span class="c-name">吃瓜路人</span>哈哈哈哈我就知道他私下是个猫控！</div>
                            </div>
                            <div class="receipt-input-area">
                                <input type="text" class="receipt-input" placeholder="Enter log...">
                                <button class="btn-receipt-send" onclick="EditorialModule.publishReceiptComment(this)">Submit</button>
                            </div>
                        </div>
                    </div>

                    <!-- 2. 角色投稿 -->
                    <div class="collage-post">
                        <div class="post-watermark">Daily</div>
                        <div class="post-meta-tag tag-role"><i class="ph-fill ph-star"></i> Role</div>
                        
                        <div class="widget-polaroid-post">
                            <div class="post-content-widget">
                                <div class="mini-polaroid">
                                    <div class="mini-tape"></div>
                                    <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop" alt="Photo">
                                </div>
                                <div class="author-row">
                                    <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100&auto=format&fit=crop" alt="Naevy">
                                    <span class="name">Naevy</span>
                                    <span class="time">10m ago</span>
                                </div>
                                <div class="post-text">
                                    刚买的冰咖啡彻底洒在了新鞋上。今天可以说是完美开局。<br>有人要借我一双鞋吗？在线等。
                                </div>
                                <div class="interaction-bar">
                                    <button class="action-btn" onclick="EditorialModule.toggleLike(this)"><i class="ph ph-heart"></i> 452</button>
                                    <button class="action-btn" onclick="EditorialModule.toggleReceiptComments(this)"><i class="ph ph-list-dashes"></i> View Notes</button>
                                </div>
                            </div>
                        </div>

                        <div class="receipt-comments">
                            <div class="receipt-list">
                                <div class="receipt-item"><span class="c-name">Everette</span>建议直接赤脚，更符合你的气质。</div>
                                <div class="receipt-item"><span class="c-name">Naevy的狗</span>别管鞋了宝宝，脚没事吧😭</div>
                            </div>
                            <div class="receipt-input-area">
                                <input type="text" class="receipt-input" placeholder="Write a note...">
                                <button class="btn-receipt-send" onclick="EditorialModule.publishReceiptComment(this)">Send</button>
                            </div>
                        </div>
                    </div>

                    <!-- 3. User 投稿 -->
                    <div class="collage-post">
                        <div class="post-watermark">User</div>
                        <div class="post-meta-tag tag-user"><i class="ph-fill ph-user"></i> User</div>
                        
                        <div class="widget-polaroid-post">
                            <div class="post-content-widget">
                                <div class="mini-stamp">♡</div>
                                <div class="author-row">
                                    <img src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=100&auto=format&fit=crop" alt="User">
                                    <span class="name">星夜流转</span>
                                    <span class="time">2h ago</span>
                                </div>
                                <div class="post-text">
                                    今天终于和心推搭上话了！！！虽然只是我单方面发了一长串感悟，对方只回了一个“嗯”，但我觉得我们的灵魂产生了共鸣！✨
                                </div>
                                <div class="interaction-bar">
                                    <button class="action-btn" onclick="EditorialModule.toggleLike(this)"><i class="ph ph-heart"></i> 128</button>
                                    <button class="action-btn" onclick="EditorialModule.toggleReceiptComments(this)"><i class="ph ph-list-dashes"></i> View Notes</button>
                                </div>
                            </div>
                        </div>

                        <div class="receipt-comments">
                            <div class="receipt-list">
                                <div class="receipt-item"><span class="c-name">路人甲</span>恭喜姐妹！这波是双向奔赴没跑了。</div>
                            </div>
                            <div class="receipt-input-area">
                                <input type="text" class="receipt-input" placeholder="Write a note...">
                                <button class="btn-receipt-send" onclick="EditorialModule.publishReceiptComment(this)">Send</button>
                            </div>
                        </div>
                    </div>

                    <!-- 4. 路人投稿 -->
                    <div class="collage-post">
                        <div class="post-meta-tag tag-guest"><i class="ph-fill ph-ghost"></i> Guest</div>
                        
                        <div class="widget-polaroid-post">
                            <div class="post-content-widget">
                                <div class="author-row">
                                    <div style="width: 32px; height: 32px; border-radius: 50%; background: #e0dcd3; display: flex; align-items: center; justify-content: center;"><i class="ph-fill ph-ghost" style="color: #a8a39f;"></i></div>
                                    <span class="name">路过的打工人</span>
                                    <span class="time">Yesterday</span>
                                </div>
                                <div class="post-text">
                                    感觉这周大家都在发糖，只有我在默默赶明天的 DDL 吗？谁懂那种观测别人幸福，自己敲键盘敲到手抽筋的痛苦。
                                </div>
                                <div class="interaction-bar">
                                    <button class="action-btn" onclick="EditorialModule.toggleLike(this)"><i class="ph ph-heart"></i> 34</button>
                                    <button class="action-btn" onclick="EditorialModule.toggleReceiptComments(this)"><i class="ph ph-list-dashes"></i> Add Notes</button>
                                </div>
                            </div>
                        </div>

                        <div class="receipt-comments">
                            <div class="receipt-list"></div>
                            <div class="receipt-input-area">
                                <input type="text" class="receipt-input" placeholder="Write a note...">
                                <button class="btn-receipt-send" onclick="EditorialModule.publishReceiptComment(this)">Send</button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- ================= 【视图 3: 盲采 (清理假数据版)】 ================= -->
            <div id="ed-view-interview" style="display: none;">
                <div class="editorial-title">
                    <div class="eng-sub">Anonymous Interviews</div>
                    <h1>Blind <span>观测盲采</span></h1>
                </div>

                <div class="interview-feed">
                    <!-- JS 动态注入真实生成的盲采卡片，不再有假数据 -->
                </div>
            </div>

            <!-- ================= 【视图 4：周刊页 (动态版)】 ================= -->
<div id="ed-view-weekly" style="display: none; min-height: 100vh;">
                
                <!-- 状态 A: 时间未到 (倒计时封面) -->
                <div id="ed-weekly-cover" class="ed-cover-view">
                    <div class="ed-cover-title">DEEP DIVE</div>
                    <div class="ed-cover-subtitle">Character Archives</div>
                    <div class="ed-cover-timer" id="ed-weekly-timer">--:--:--</div>
                    <div style="font-family:'Noto Sans SC'; font-size:0.75rem; color:var(--text-muted);">深潜档案将在下个周期解锁</div>
                </div>

                <!-- 状态 B: 时间已到，展示塔罗牌和内容 -->
                <div id="ed-weekly-content" style="display:none;">
                    <div class="tarot-roles" id="ed-weekly-tarots">
                        <!-- JS 动态注入所有角色的塔罗牌 -->
                    </div>

                    <div class="weekly-header-title" id="ed-weekly-issue-title">Issue. --</div>

                    <!-- 生成控制面板 (未生成 / 数据不足 时显示) -->
                    <div id="ed-weekly-action-box" style="margin-bottom: 40px; padding: 30px 20px; text-align: center; border: 1px dashed rgba(0,0,0,0.1); border-radius: 12px; background: rgba(255,255,255,0.5);">
                        <div id="ed-wk-status-text" style="font-family:'Noto Sans SC'; font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;"></div>
                        <button id="ed-btn-gen-weekly" class="ed-btn-generate" style="margin: 0 auto;" onclick="EditorialModule.generateWeeklyRole()">
                            <i class="ph-bold ph-fingerprint"></i> 解密专属深潜档案
                        </button>
                    </div>

                    <!-- 报告展示区 (生成后显示) -->
                    <div id="ed-weekly-report-box" style="display:none;">
                        <!-- 0. 重新生成 -->
                        <div style="text-align:center; margin-bottom:24px;">
                            <button class="ed-btn-generate" style="margin:0 auto;" onclick="EditorialModule.rerollWeekly()">
                                <i class="ph-bold ph-arrows-clockwise"></i> 重新生成
                            </button>
                        </div>
                        <!-- 1. 情感拉扯观察室 -->
                        <div class="collage-block">
                            <div class="collage-title"><i class="ph-bold ph-planet"></i> Tension Matrix</div>
                            <div class="star-map-board"><div class="s-tension-text" id="ed-wk-tension"></div></div>
                        </div>

                        <!-- 2. 狗仔队与街拍 -->
                        <div class="collage-block">
                            <div class="collage-title"><i class="ph-bold ph-aperture"></i> Paparazzi Lens</div>
                            <div class="spy-photo-wrap">
                                <div class="washi-tape-1"></div><div class="washi-tape-2"></div>
                                <div class="spy-polaroid">
                                    <img class="spy-img" id="ed-wk-spy-img" src="" alt="Spy Shot">
                                    <div class="spy-caption" id="ed-wk-spy-time"></div>
                                </div>
                            </div>
                            <div style="font-family: 'Noto Sans SC', sans-serif; font-size: 0.8rem; font-style: italic; color: var(--text-muted); text-align: center; margin-top: 12px; padding: 0 10px;" id="ed-wk-spy-caption"></div>
                        </div>

                        <!-- 3. 本周金句大赏 -->
                        <div class="collage-block">
                            <div class="collage-title"><i class="ph-bold ph-quotes"></i> Quotes of the week</div>
                            <div class="quote-tarot-card">
                                <div class="q-mark">“</div>
                                <div class="quote-tarot-text" id="ed-wk-quote"></div>
                                <div class="quote-tarot-source">From: Subconscious Log</div>
                            </div>
                        </div>

                        <!-- 4. 数据诗 -->
                        <div class="collage-block">
                            <div class="collage-title"><i class="ph-bold ph-receipt"></i> Data Poetry</div>
                            <div class="receipt-slip">
                                <div class="receipt-row">
                                    <div class="receipt-code" id="ed-wk-poem1-code"></div>
                                    <div class="receipt-poem" id="ed-wk-poem1-text"></div>
                                </div>
                                <div class="receipt-row">
                                    <div class="receipt-code" id="ed-wk-poem2-code"></div>
                                    <div class="receipt-poem" id="ed-wk-poem2-text"></div>
                                </div>
                                <div class="barcode-footer"></div>
                            </div>
                        </div>

                        <!-- 5. 幕后专访 -->
                        <div class="collage-block">
                            <div class="collage-title"><i class="ph-bold ph-cassette-tape"></i> Behind The Wall</div>
                            <div class="script-dossier">
                                <div class="confidential-stamp">OBSERVED</div>
                                <div id="ed-wk-script-container"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.querySelector('.device').appendChild(screen);
    }

    // ── 3. 绑定 UI 交互 ──
    function _bindEvents() {
        const screen = document.getElementById('editorial-screen');
        if (!screen) return;

        // 标签切换
        screen.querySelectorAll('.ed-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                screen.querySelectorAll('.ed-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
              const targetId = e.target.getAttribute('data-target');
                
                // 然后再进行判断
                if (targetId === 'ed-view-bot') {
                    _checkBotFeedState();
                } else if (targetId === 'ed-view-interview') {
                    _checkInterviewState();
                } else if (targetId === 'ed-view-weekly') {
                    _checkWeeklyState(); // <-- 点击周刊时触发状态机检查
                }
                
                screen.querySelector('#ed-view-home').style.display = 'none';
                screen.querySelector('#ed-view-bot').style.display = 'none';
                screen.querySelector('#ed-view-interview').style.display = 'none';
                screen.querySelector('#ed-view-weekly').style.display = 'none';
                
                const targetView = screen.querySelector('#' + targetId);
                if(targetView) {
                    targetView.style.display = 'block';
                    screen.scrollTo({ top: 0, behavior: 'smooth' }); 
                }
            });
        });

        // 无缝滚动弹幕（首页）
        const t1 = screen.querySelector('#track-1');
        const t2 = screen.querySelector('#track-2');
        if (t1) t1.innerHTML += t1.innerHTML; 
        if (t2) t2.innerHTML += t2.innerHTML;
    }

    // ── 模块公开方法 ──

    function init() {
        if (_initialized) return;
        _injectStyles();
        _injectHTML();
        _bindEvents();
        _initialized = true;
        console.log('[EditorialModule] 观测志系统已加载 ✦');
    }

    function open() {
        if (!_initialized) init();
        // 保证从其他全屏页切过来不冲突
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('editorial-screen').classList.add('active');
        _checkHomeState();
    }

    function close() {
        const screen = document.getElementById('editorial-screen');
        if (screen) {
            screen.classList.remove('active');
            // 回退到主页
            document.getElementById('home-screen')?.classList.add('active');
        }
    }

    function showMessage(msg) {
        if (window.Toast && window.Toast.show) {
            window.Toast.show(msg);
        } else {
            console.log('Message:', msg);
        }
    }

    // --- 互动静态逻辑暴露给内联 onclick 使用 ---

    function toggleLike(btn) {
        const icon = btn.querySelector('i');
        if (icon.classList.contains('ph-heart')) {
            icon.classList.replace('ph-heart', 'ph-fill');
            icon.style.color = '#e25555';
            let num = parseInt(btn.innerText.replace(/[^0-9]/g, '')) || 0;
            btn.innerHTML = `<i class="ph-fill ph-heart" style="color:#e25555;"></i> ${num + 1}`;
        } else {
            icon.classList.replace('ph-fill', 'ph-heart');
            icon.style.color = '';
            let num = parseInt(btn.innerText.replace(/[^0-9]/g, '')) || 0;
            btn.innerHTML = `<i class="ph ph-heart"></i> ${num - 1}`;
        }
    }

    function toggleReceiptComments(btn) {
        const postCard = btn.closest('.collage-post');
        const receipt = postCard.querySelector('.receipt-comments');
        if (receipt.style.display === 'block') {
            receipt.style.display = 'none';
        } else {
            receipt.style.display = 'block';
        }
    }

    // --- 用户发送评论 ---
    async function publishReceiptComment(btn, postId) {
        const input = btn.previousElementSibling;
        let text = input.value.trim();
        if (!text) {
            showMessage('笔记内容不能为空哦');
            return;
        }

        // 处理“回复xxx”的前缀
        const targetName = _replyTargetMap[postId];
        if (targetName) {
            text = `回复 ${targetName}：${text}`;
        }

        // 获取用户名字
        let userName = '我';
        try {
            const profile = await DB.settings.get('global-profile');
            if (profile && profile.name) userName = profile.name;
        } catch(e) {}

        const post = _botPosts.find(p => p.id === postId);
        if (!post) return;

        const now = new Date();
        post.comments.push({
            name: userName,
            text: text,
            time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
        });

        await _saveBotPosts();

        // 重新渲染评论列表
        const listEl = btn.closest('.receipt-comments').querySelector('.receipt-list');
        _renderCommentsList(listEl, post.comments, post.type === 'pinned', post.authorName, postId);

        // 清空输入框并重置状态
        input.value = '';
        input.placeholder = 'Enter log...';
        delete _replyTargetMap[postId];

        // 🌟 触发大模型后台盖楼
        _generateCommentReplies(postId, listEl);
    }

    // --- 大模型后台盖楼 (帖主下场 + 路人围观) ---
    async function _generateCommentReplies(postId, listEl) {
        const post = _botPosts.find(p => p.id === postId);
        if (!post) return;

        // 在评论区底部加入 Loading 动画
        const loadingId = 'loading-' + Date.now();
        const isDark = post.type === 'pinned';
        const loadingColor = isDark ? '#d4a373' : '#a3b19b';
        const loadingHtml = `<div class="receipt-item" id="${loadingId}" style="color:${loadingColor}; font-style:italic; font-family:'Space Mono',monospace; font-size:0.7rem; border-bottom:none;"><i class="ph-thin ph-circle-notch" style="animation: ed-spin 1s linear infinite;"></i> 信号解密中...</div>`;
        listEl.insertAdjacentHTML('beforeend', loadingHtml);

        try {
            const activeApi = await ApiModule.getSecondaryApi();
            if (!activeApi) throw new Error('API 未配置');

            let authorPersona = '';
            let userPersonaStr = '';

            // 如果是角色发的贴，提取角色的背景和用户当前的面具
            if (post.type === 'role' && post.charId) {
                const char = await DB.characters.get(Number(post.charId));
                if (char) authorPersona = char.persona || '';

                // 获取用户跟这个角色聊天的专属面具
                const binding = await DB.bindings.get(String(post.charId)).catch(()=>null);
                const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
                const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
                const userPersonaObj = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0];
                if (userPersonaObj) {
                    userPersonaStr = `用户当前的面具身份是：【${userPersonaObj.name}】。背景简介：${userPersonaObj.bio} ${userPersonaObj.backstory}`;
                }
            }

            // 把之前的评论拼起来作为上下文
            const contextComments = post.comments.map(c => `[${c.name}]: ${c.text}`).join('\n');

            const prompt = `你是一个社交论坛的造物主。用户刚刚在一条动态下发表了评论。
请为这篇帖子生成 3-5 条后续的互动评论，形成“盖楼”效果。

帖子作者：${post.authorName}
帖子内容：${post.content}
${authorPersona ? `帖子作者背景设定：${authorPersona}` : ''}
${userPersonaStr ? `【重点】${userPersonaStr}` : ''}

【当前的评论区上下文】：
${contextComments}

【任务要求】：
1. 必须根据用户最后一条评论的内容进行互动。
2. 如果帖子作者是具体的角色（有背景设定），那么【帖子作者本人】必须亲自下场回复用户！回复的语气必须严格符合 ta 的人设，以及符合对用户面具身份的态度（是暧昧、傲娇还是死对头）。
3. 此外，你可以随机附带 3-5 条路人NPC（如：吃瓜群众、ANON. 99X、精神稳定状态0）的吐槽、附和或看热闹的评论。
4. 语气要有强烈的“活人网感”、短平快、不客气、拒绝AI味。
5. 🚧【分寸下限】：可以毒舌、抬杠、阴阳、看热闹，但绝不许人身攻击与辱骂（针对长相、身材、智商、出身、性别、性取向、地域、家庭的羞辱）、脏话侮辱、威胁诅咒、引战仇恨。要"好笑有梗"而不是"恶心踩人"，冲突停在互相调侃，不能滑向网暴。
6. 严格返回 JSON 数组，格式：[{"name":"评论者名称", "text":"评论内容"}]`;

            const response = await ApiHelper.chatCompletion(activeApi,[{  role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('[');
            const end = cleaned.lastIndexOf(']');
            const newComments = JSON.parse(cleaned.substring(start, end + 1));

            // 打上时间戳并存入
            let baseTime = Date.now();
            newComments.forEach(c => {
                baseTime += Math.floor(Math.random() * 30000) + 5000; // 错开 5~30秒的回复间隔 
                const d = new Date(baseTime);
                post.comments.push({
                    name: c.name,
                    text: c.text,
                    time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
                });
            });

            await _saveBotPosts();
            _renderCommentsList(listEl, post.comments, post.type === 'pinned', post.authorName, postId);

        } catch(e) {
            console.error('[Reply Gen Error]', e);
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) {
                loadingEl.innerHTML = `<span style="color:#d64045;"><i class="ph-bold ph-warning"></i> 信号丢失，对方暂无回应。</span>`;
                setTimeout(() => { if (loadingEl) loadingEl.remove(); }, 3000);
            }
        }
    }

    function toggleAnswers(btn) {
        const card = btn.closest('.editorial-card');
        const icon = btn.querySelector('.btn-icon');
        const textSpan = btn.querySelector('.btn-text');
        
        card.classList.toggle('open');
        
        if (card.classList.contains('open')) {
            icon.classList.replace('ph-plus', 'ph-minus');
            textSpan.innerText = 'Hide Responses';
        } else {
            icon.classList.replace('ph-minus', 'ph-plus');
            const list = card.querySelector('.edit-answer-list');
            const count = list.querySelectorAll('.edit-answer-item').length;
            textSpan.innerText = `View ${count} Response${count > 1 ? 's' : ''}`;
        }
    }

    // --- 用户提交自己的盲采回答 ---
    async function submitAnonAnswer(btn, interviewId) {
        const input = btn.previousElementSibling.querySelector('input');
        let text = input.value.trim();
        if (!text) { showMessage('回应不能为空'); return; }

        // 🌟 新增：处理“回复xxx”的前缀
        const targetName = _replyTargetMap[interviewId];
        if (targetName) {
            text = `回复 ${targetName}：${text}`;
        }

        const intv = _interviews.find(i => i.id === interviewId);
        if (!intv) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        
        const randomID = Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0');
        const newAns = { id: `YOU. ${randomID}`, time: timeStr, text: text };

        intv.answers.push(newAns);
        await _saveInterviews();

        const list = btn.closest('.edit-answers-panel').querySelector('.edit-answer-list');
        const newEl = document.createElement('div');
        newEl.className = 'edit-answer-item';
        newEl.style.cssText = 'animation: ed-fadeIn 0.4s ease; cursor:pointer; transition: opacity 0.2s;';
        newEl.setAttribute('onclick', `EditorialModule.prepareInterviewReply('${interviewId}', '${newAns.id}')`);
        newEl.onmouseover = function(){ this.style.opacity = 0.7; };
        newEl.onmouseout = function(){ this.style.opacity = 1; };
        
        newEl.innerHTML = `
            <div class="anon-header">
                <div class="anon-id" style="color:var(--sage-green);">${newAns.id}</div>
                <div class="anon-time">${newAns.time}</div>
            </div>
            <div class="anon-text">${_escHtml(newAns.text)}</div>
        `;
        list.appendChild(newEl);
        
        const toggleBtn = btn.closest('.editorial-card').querySelector('.edit-toggle-btn .btn-text');
        if (toggleBtn) toggleBtn.innerText = `View ${intv.answers.length} Responses`;

        // 🌟 还原输入框状态
        input.value = '';
        input.placeholder = 'Add your response...';
        
        showMessage(`已匿名归档:[${newAns.id}]`);

        // 呼叫大模型反击 (把刚才的 targetName 传过去)
        _generateInterviewReplies(interviewId, list, targetName);
        
        delete _replyTargetMap[interviewId]; // 传完再清理
    }
    
    // --- 大模型后台盖楼 (针对用户的靶向追击与修罗场) ---
    async function _generateInterviewReplies(interviewId, listEl, targetName) {
        const intv = _interviews.find(i => i.id === interviewId);
        if (!intv) return;

        const loadingId = 'loading-int-' + Date.now();
        const loadingHtml = `<div class="edit-answer-item" id="${loadingId}" style="animation: ed-fadeIn 0.4s ease; margin-top: 10px;">
            <div class="anon-text" style="color:var(--sage-green); font-style:italic; font-family:'Space Mono',monospace; font-size:0.75rem;"><i class="ph-thin ph-circle-notch" style="animation: ed-spin 1s linear infinite;"></i> 正在捕获深网回应...</div>
        </div>`;
        listEl.insertAdjacentHTML('beforeend', loadingHtml);

        try {
            const activeApi = await ApiModule.getSecondaryApi();
            if (!activeApi) throw new Error('API 未配置');

            const allChars = await DB.characters.getAll().catch(()=>[]);
            let castContext = '';
            for (const c of allChars) {
                const binding = await DB.bindings.get(String(c.id)).catch(()=>null);
                const pId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
                const allP = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
                const userObj = allP.find(p => String(p.id) === String(pId)) || allP[0];
                let userMask = userObj ? `用户面具为【${userObj.name}】：${userObj.bio}` : '';
                castContext += `ID:${c.id} | 名字:${c.name} | 设定:${c.persona} | ${userMask}\n`;
            }

           // 🎯 核心逻辑：找出用户刚才回复的那个 ANON 是哪个角色！
            let targetCharInstruction = '';
            if (targetName) {
                const targetAns = intv.answers.find(a => a.id === targetName);
                if (targetAns && targetAns.realCharId && targetAns.realCharId !== 'npc' && targetAns.realCharId !== 'user') {
                    const targetChar = allChars.find(c => String(c.id) === String(targetAns.realCharId));
                    if (targetChar) {
                        targetCharInstruction = `
🔥🔥🔥【绝对指令】：系统监测到用户刚刚点击回复了 ${targetName}。
而 ${targetName} 的真实身份其实是【${targetChar.name}】！
所以，本次生成的回复中，【${targetChar.name}】必须亲自下场回复用户的发言！ta必须维持 ${targetName} 这个匿名代号，但语气必须彻底暴露 ta 对绑定用户面具的态度（比如吃醋、傲娇、或者是被戳穿伪装后的嘴硬）。`;
                    }
                }
            }

            const contextAnswers = intv.answers.map(a => `[${a.id}]: ${a.text}`).join('\n');

            const prompt = `你是一个匿名论坛的主理人。用户（代号 YOU. XXXX）刚刚提交了回答。
请生成 5-8 条后续互动，制造评论区的“修罗场”或“熟人掉马”效果。

【当前所有角色的真实设定字典】：
${castContext}

【当前的盲采问答记录】：
${contextAnswers}
${targetCharInstruction}

【任务要求】：
1. 参演的角色如果有回应，依然必须使用他们原本抽到的 ANON 代号。
2. 其他在线的角色如果看到了用户的发言，可以下场“吃瓜”、“调侃”或“暗示”。
3. 也可以加入路人NPC（如：ANON. 99X，真实身份设为 npc）在旁边吃瓜看戏。
4. 语气极度活人感，拒绝AI的客套！营造在群里熟人互损、高段位拉扯的氛围。
5. ⚠️【安全与礼貌警告】：绝对禁止使用脏话、恶俗词汇、辱骂或真正恶毒的人身攻击。任何“破防”、“吃醋”或“拆台”都必须是有分寸、带点傲娇或幽默感的，绝不能让用户感到被网暴或恶臭攻击！

严格返回 JSON 数组（必须附带真实身份 realCharId，如果是NPC填 "npc"）：[{"id":"代号", "text":"评论内容", "realCharId": "角色真实ID或npc"}]`;

            const response = await ApiHelper.chatCompletion(activeApi,[{  role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('[');
            const end = cleaned.lastIndexOf(']');
            const newAnswers = JSON.parse(cleaned.substring(start, end + 1));

            let baseTime = Date.now();
            newAnswers.forEach(a => {
                baseTime += Math.floor(Math.random() * 15000) + 5000; 
                const d = new Date(baseTime);
                const newAnsObj = {
                    id: a.id,
                    realCharId: a.realCharId,
                    text: a.text,
                    time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
                };
                intv.answers.push(newAnsObj);
                
                const newEl = document.createElement('div');
                newEl.className = 'edit-answer-item';
                newEl.style.cssText = 'animation: ed-fadeIn 0.4s ease; cursor:pointer; transition: opacity 0.2s;';
                newEl.setAttribute('onclick', `EditorialModule.prepareInterviewReply('${interviewId}', '${newAnsObj.id}')`);
                newEl.onmouseover = function(){ this.style.opacity = 0.7; };
                newEl.onmouseout = function(){ this.style.opacity = 1; };
                
                newEl.innerHTML = `
                    <div class="anon-header">
                        <div class="anon-id">${_escHtml(newAnsObj.id)}</div>
                        <div class="anon-time">${newAnsObj.time}</div>
                    </div>
                    <div class="anon-text">${_escHtml(newAnsObj.text)}</div>
                `;
                listEl.appendChild(newEl);
            });

            await _saveInterviews();

            const toggleBtn = listEl.closest('.editorial-card').querySelector('.edit-toggle-btn .btn-text');
            if (toggleBtn) toggleBtn.innerText = `View ${intv.answers.length} Responses`;

        } catch(e) {
            console.error('[Interview Reply Gen Error]', e);
        } finally {
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
        }
    }

    function selectWeeklyRole(clickedItem) {
        const parent = clickedItem.parentElement;
        parent.querySelectorAll('.tarot-card').forEach(item => {
            item.classList.remove('active');
        });
        clickedItem.classList.add('active');
        
        const roleName = clickedItem.querySelector('.tarot-name').innerText;
        // 动态更新街拍文案名字
        const screen = document.getElementById('editorial-screen');
        screen.querySelectorAll('.dynamic-role-name').forEach(el => el.innerText = roleName);
        
        showMessage(`Switching to ${roleName}'s archives...`);
    }
    
    // ============================================================
    // 核心逻辑：首页时间轴与大模型生成引擎
    // ============================================================
    let _clockTimer = null;

    // 1. 获取本周日中午12点的时间戳
    function _getSundayNoonData() {
        const now = new Date();
        const d = new Date(now);
        
        let lastSun = new Date(d);
        lastSun.setHours(12, 0, 0, 0);
        
        // 如果今天是周日，且过了12点，那上一个节点就是今天
        if (d.getDay() === 0 && d.getHours() >= 12) {
            // keep lastSun as today 12:00
        } else {
            // 倒推到上一个周日
            const daysToSubtract = d.getDay() === 0 ? 7 : d.getDay();
            lastSun.setDate(d.getDate() - daysToSubtract);
        }

        const nextSun = new Date(lastSun);
        nextSun.setDate(nextSun.getDate() + 7);

        return {
            lastIssueId: 'ISSUE_' + lastSun.getTime(),
            nextUnlockTime: nextSun.getTime(),
            nowTime: now.getTime()
        };
    }

    // 2. 检查首页状态 (控制封面或内容的显示)
    async function _checkHomeState() {
        const timeData = _getSundayNoonData();
        let saved = null;
        try { saved = await DB.settings.get('ed-weekly-data'); } catch(e) {}

        const cover = document.getElementById('ed-home-cover');
        const content = document.getElementById('ed-home-content');
        const timerEl = document.getElementById('ed-cover-timer');
        const btnGen = document.getElementById('ed-btn-generate');

        if (saved && saved.issueId === timeData.lastIssueId) {
            // ✅ 已经生成了本周的数据 -> 隐藏封面，显示内容
            cover.style.display = 'none';
            content.style.display = 'block';
            _renderHomeData(saved.data);
            _startHeaderCountdown(timeData.nextUnlockTime);
            // 更新期号 UI
            const issueEl = document.getElementById('ed-issue-number');
            if (issueEl) issueEl.textContent = `Vol. ${timeData.lastIssueId.slice(-4)} / The Observers`;
        } else {
            // ❌ 还没生成本周的数据 -> 显示封面
            content.style.display = 'none';
            cover.style.display = 'flex';
            
            timerEl.style.display = 'none'; 
            btnGen.style.display = 'flex';
        }
    }

    // 3. 顶部小倒计时 (等下一期)
    function _startHeaderCountdown(targetTime) {
        if (_clockTimer) clearInterval(_clockTimer);
        const el = document.getElementById('ed-header-countdown');
        el.style.display = 'block';

        _clockTimer = setInterval(() => {
            const diff = targetTime - Date.now();
            if (diff <= 0) {
                clearInterval(_clockTimer);
                _checkHomeState(); 
                return;
            }
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / 1000 / 60) % 60);
            el.textContent = `NEXT ISSUE: ${String(d).padStart(2,'0')}D ${String(h).padStart(2,'0')}H ${String(m).padStart(2,'0')}M`;
        }, 1000);
    }

    // 4. 辅助：根据名字找头像 (修复：去角色库查真实头像配置)
    async function _getAvatarByName(name) {
        try {
            const chars = await DB.characters.getAll();
            const char = chars.find(c => c.name.includes(name) || name.includes(c.name));
            if (char) {
                if (char.avatarUrl) {
                    const url = await Assets.getUrl(char.avatarUrl);
                    if (url) return url;
                }
                // 没上传头像的角色，使用系统默认的清冷肖像
                return 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80'; 
            }

            let userName = '用户';
            const profile = await DB.settings.get('profile');
            if (profile && profile.name) userName = profile.name;

            if (name.includes(userName) || userName.includes(name) || name === '用户' || name === '我') {
                const url = await Assets.getUrl('avatar');
                if (url) return url;
                // 用户默认头像
                return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80'; 
            }
        } catch(e) {}
        return 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80';
    }

    // 5. 将生成的 JSON 数据灌入 DOM (修复：去角色库查真实头像配置)
    async function _renderHomeData(data) {
        for (let i = 0; i < 3; i++) {
            if (data.quotes && data.quotes[i]) {
                const q = data.quotes[i];
                document.getElementById(`ed-q${i+1}-text`).textContent = q.text;
                document.getElementById(`ed-q${i+1}-author`).textContent = q.author;
                document.getElementById(`ed-q${i+1}-img`).src = await _getAvatarByName(q.author);
            }
        }
        
        if (data.topic) {
            document.getElementById('ed-topic-title').textContent = data.topic.title;
            document.getElementById('ed-topic-desc').textContent = data.topic.desc;
        }

        const grid = document.getElementById('ed-active-grid');
        grid.innerHTML = '';
        if (data.topChars && data.topChars.length > 0) {
            const allChars = await DB.characters.getAll().catch(()=>[]);
            for (const cid of data.topChars) {
                let url = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80'; 
                if (String(cid).startsWith('blob:')) {
                    url = cid; // 极小概率的历史脏数据兜底
                } else {
                    const char = allChars.find(c => String(c.id) === String(cid));
                    if (char && char.avatarUrl) {
                        url = await Assets.getUrl(char.avatarUrl).catch(()=>'') || url;
                    }
                }
                grid.innerHTML += `<div class="circle-avatar"><img src="${url}" alt=""></div>`;
            }
        }
        grid.innerHTML += `<div class="typing-bubble"><i class="ph-bold ph-dots-three"></i> Active</div>`;

        if (data.danmaku && data.danmaku.length > 0) {
            const t1 = document.getElementById('track-1');
            const t2 = document.getElementById('track-2');
            t1.innerHTML = ''; t2.innerHTML = '';
            const styles =['type-memo', 'type-tape', 'type-dymo', 'type-highlight'];
            data.danmaku.forEach((text, i) => {
                const style = styles[i % styles.length];
                const html = `<div class="collage-item ${style}">${text}</div>`;
                if (i % 2 === 0) t1.innerHTML += html;
                else t2.innerHTML += html;
            });
            t1.innerHTML += t1.innerHTML;
            t2.innerHTML += t2.innerHTML;
        }
    }

    // 6. 核心：大模型提取逻辑 (修复：注入用户的真实名字，不存死链)
    async function generateWeekly() {
        document.getElementById('ed-btn-generate').style.display = 'none';
        document.getElementById('ed-cover-loading').style.display = 'flex';

        try {
            const activeApi = await ApiModule.getSecondaryApi();
            if (!activeApi) throw new Error('请先在设置中配置并激活 API');

            let userName = '我';
            try {
                const profile = await DB.settings.get('profile');
                if (profile && profile.name) userName = profile.name;
            } catch(e) {}

            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const allChars = await DB.characters.getAll();
            let allMsgs =[];
            
            for (const c of allChars) {
                const msgs = await DB.messages.getPage(String(c.id), 0, 500).catch(()=>[]);
                const recent = msgs.filter(m => m.timestamp >= sevenDaysAgo && m.role !== 'system_ticket');
                allMsgs = allMsgs.concat(recent.map(m => ({ ...m, charName: c.name, cid: c.id })));
            }

            if (typeof GroupChatModule !== 'undefined') {
                const gcs = GroupChatModule.getAll();
                for (const gc of gcs) {
                    const msgs = await DB.messages.getPage(gc.id, 0, 500).catch(()=>[]);
                    const recent = msgs.filter(m => m.timestamp >= sevenDaysAgo && m.role !== 'system_ticket');
                    allMsgs = allMsgs.concat(recent.map(m => ({ ...m, charName: 'GroupMember' })));
                }
            }

            allMsgs.sort((a,b) => a.timestamp - b.timestamp);

            if (allMsgs.length < 15) {
                throw new Error('本周数据不足，无法生成观测志。多聊聊天吧！');
            }

            const charCounts = {};
            allMsgs.forEach(m => {
                if (m.cid) charCounts[m.cid] = (charCounts[m.cid] || 0) + 1;
            });
            // 🌟 修复：只提取排名前3的角色 ID
            const topCharIds = Object.entries(charCounts).sort((a,b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

            const historyText = allMsgs.map(m => `[${m.role === 'user' ? userName : m.charName}]: ${m.content}`).join('\n').slice(-4000);

            const prompt = `你是一个拥有极高审美和洞察力的观测者。请阅读过去 7 天的聊天记录片段：
${historyText}

【任务】：提取并生成本周的观测档案。
1. 3句“本周金句”：必须是记录里的原话，不可修改。挑选最有情感张力、最荒谬或最搞笑的句子。
2. 1个“热门话题”：根据这周的聊天趋势，总结一个类似知乎/豆瓣风格的讨论话题，并写一段简短的客观背景描述。
3. 8条“弹幕留言”：以路人、系统精灵或其他没出场角色的口吻，对这周的【金句】和【话题】进行犀利、一针见血或搞笑的吐槽。

严格输出 JSON 格式，绝不包含其他废话：
{
  "quotes":[
    { "text": "原话内容", "author": "说话人的名字" },
    { "text": "原话内容", "author": "说话人的名字" },
    { "text": "原话内容", "author": "说话人的名字" }
  ],
  "topic": {
    "title": "话题标题",
    "desc": "简短背景描述"
  },
  "danmaku":[
    "弹幕1", "弹幕2", "弹幕3", "弹幕4", "弹幕5", "弹幕6", "弹幕7", "弹幕8"
  ]
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('AI 返回数据解析失败');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            // 🌟 修复：存入的是 ID 数组，而不是临时 blob 链接
            data.topChars = topCharIds; 

            const timeData = _getSundayNoonData();
            await DB.settings.set('ed-weekly-data', {
                issueId: timeData.lastIssueId,
                data: data
            });

            showMessage('排版完毕，即将展现');
            setTimeout(() => { _checkHomeState(); }, 1000);

        } catch (e) {
            console.error('[Editorial] Generate Error:', e);
            showMessage(e.message || '生成失败');
            document.getElementById('ed-btn-generate').style.display = 'flex';
            document.getElementById('ed-cover-loading').style.display = 'none';
        }
    }
    
    // --- 核心 1：进入 Bot 页面时的状态检查 ---
    async function _checkBotFeedState() {
        await _loadBotPosts();
        const now = Date.now();
        let pinned = _botPosts.find(p => p.type === 'pinned');

        // 判定 1：置顶帖 24 小时轮回
        if (!pinned || (now - pinned.timestamp > 24 * 60 * 60 * 1000)) {
            // 删除旧置顶
            _botPosts = _botPosts.filter(p => p.type !== 'pinned');
            // 异步去生成新置顶，此时先用旧数据渲染一遍，免得白屏
            _generatePinnedPost(); 
        }

        // 判定 2：路人随机发帖 (30%概率，距上次路人发帖超过 6 小时)
        const lastGuest = _botPosts.find(p => p.type === 'guest');
        if (!lastGuest || (now - lastGuest.timestamp > 6 * 60 * 60 * 1000)) {
            if (Math.random() < 0.3) _generateGuestPost();
        }

        _renderBotFeed(); // 渲染上屏
    }

    // --- 核心 2：生成置顶爆料 (全知视角) ---
    async function _generatePinnedPost() {
        try {
            const activeApi = await ApiModule.getSecondaryApi()
            if (!activeApi) return;

            // 抓取过去 24 小时记录寻找蛛丝马迹
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const allChars = await DB.characters.getAll();
            let allMsgs =[];
            const activeCharIds = new Set(); // 记录24h内真正出场过的角色
            for (const c of allChars) {
                const msgs = await DB.messages.getPage(String(c.id), 0, 100).catch(()=>[]);
                const recent = msgs.filter(m => m.timestamp >= oneDayAgo);
                if (recent.length > 0) activeCharIds.add(String(c.id));
                allMsgs = allMsgs.concat(recent);
            }
            allMsgs.sort((a,b) => a.timestamp - b.timestamp);
            
            let historyText = allMsgs.map(m => `[${m.role === 'user' ? '用户' : m.charName}]: ${m.content}`).join('\n').slice(-3000);
            if (!historyText) historyText = "今日观测站风平浪静，暂无数据。";

            // 只注入「这24小时真正出场」的角色人设，避免无关角色误导 AI 瞎编排
            const personaCards = allChars
                .filter(c => activeCharIds.has(String(c.id)) && c.persona)
                .map(c => `· ${c.name}：${String(c.persona).slice(0, 200)}`)
                .join('\n');
            const personaBlock = personaCards
                ? `\n【涉及人物的真实人设档案】（爆料必须符合 ta 们的真实性格，不许编出与设定矛盾的人）：\n${personaCards}\n`
                : '';

            // 收集这24h用户实际用到的面具（按出场角色查绑定，去重）。用户在不同角色处可能戴不同面具，全列出来让 AI 自己对应
            let userMaskBlock = '';
            try {
                const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() : [];
                if (allPersonas.length) {
                    const maskMap = new Map(); // personaId -> persona对象，天然去重
                    for (const cid of activeCharIds) {
                        const binding = await DB.bindings.get(String(cid)).catch(()=>null);
                        const pId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
                        const pObj = allPersonas.find(p => String(p.id) === String(pId)) || allPersonas[0];
                        if (pObj && !maskMap.has(String(pObj.id))) maskMap.set(String(pObj.id), pObj);
                    }
                    const maskCards = [...maskMap.values()]
                        .map(p => `· ${p.name}：${String((p.bio || '') + ' ' + (p.backstory || '')).trim().slice(0, 200)}`)
                        .join('\n');
                    if (maskCards) {
                        userMaskBlock = `\n【"用户"的真实面具档案】（记录里标为"用户"的就是 ta，爆料涉及"用户"时必须符合下面的面具设定，不许编排成矛盾的样子）：\n${maskCards}\n`;
                    }
                }
            } catch(e) { console.error('[Pinned UserMask]', e); }

            const prompt = `你是一个匿名八卦博主（风格复刻《Gossip Girl》的 Gossip Girl）。
你刚刚获取了过去24小时的所有私密频道的聊天记录：
${historyText}
${personaBlock}${userMaskBlock}
【任务】：
从上面【真实存在的聊天记录】里，挑出一个最具反差感、最暧昧、或者最社死的真实细节（比如某人半夜的撤回、嘴硬心软的转账、情绪波动的瞬间、暗戳戳的吃醋），用毒舌、玩味、看透一切的"吃瓜"口吻爆料出来。

【事实红线 · 最高优先级】：
1. 你爆的"料"必须能在上面的聊天记录里找到原始出处。只允许对真实发生的事做夸张化的解读和调侃，绝对禁止编造记录里根本没有的人物、事件、对话或情节。
2. 爆料里涉及的角色言行，必须符合上方【人设档案】里 ta 的真实性格设定。绝对禁止把 ta 编排成与人设矛盾的样子（例如把高冷的人写成话痨、把没出场的关系硬安上去）。拿不准就别写。
3. 记录里标为"用户"的发言，对应上方【用户面具档案】。爆到"用户"时同样必须符合 ta 的面具设定，不许凭空给用户安上矛盾的性格、关系或行为。
4. 宁可点到为止、留白暗示，也不要为了戏剧性而虚构。你是在"放大真相"，不是在"写小说"。
5. 如果记录确实平淡、找不到任何可爆的点（例如记录为空或只是日常寒暄），就不要硬编。这种情况下只输出三个字：__SKIP__，不要输出任何爆料。

【语气要求】：
1. 不要像机器汇报数据，不要用"根据数据分析"这种词。
2. 语气拽、高傲、有网感（笑死、救命、别太爱了、我都不好意思点破 等）。
3. 可以毒舌、可以阴阳，但调侃的是"事"不是恶意攻击"人"，不要人身侮辱、不要外貌/身份羞辱。
4. 结尾可加"XOXO""祝你好运"之类的标志性挑衅。
5. 控制在 80 字以内，直接输出爆料正文，不要任何前言。`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);

            // 真空兜底：AI 判定无料可爆时跳过，绝不硬塞捏造帖
            const _clean = (response || '').trim();
            if (!_clean || _clean.includes('__SKIP__')) {
                console.log('[Bot Pinned] 今日无真实爆点，跳过生成');
                return;
            }
            _botPosts.push({
                id: 'ed_bot_' + Date.now(),
                type: 'pinned',
                authorName: 'Observer',
                content: response.trim(),
                timestamp: Date.now(),
                likes: Math.floor(Math.random() * 2000) + 100,
                comments:[] 
            });
            await _saveBotPosts();
            _renderBotFeed(); 
        } catch(e) { console.error('[Bot Pinned Gen Error]', e); }
    }

    // --- 核心 3：按需解密评论 (懒加载) ---
    async function _decryptComments(postId, btn) {
        if (_isDecrypting) { showMessage('解密通道拥挤，请稍候'); return; }
        const post = _botPosts.find(p => p.id === postId);
        if (!post) return;

        _isDecrypting = true;
        btn.innerHTML = `<i class="ph-thin ph-circle-notch" style="animation: ed-spin 1s linear infinite;"></i> Decrypting...`;

        try {
            const activeApi = await ApiModule.getSecondaryApi();
            let authorPersona = '';

           // 如果是角色发的，查出他的背景设定，用于召唤亲友团
            if (post.type === 'role' && post.charId) {
                const char = await DB.characters.get(Number(post.charId));
                if (char) authorPersona = char.persona || '';
            }

            // --- 新增：获取用户名字，设置防火墙防止AI串戏 ---
            let userName = '我';
            try {
                const profile = await DB.settings.get('profile');
                if (profile && profile.name) userName = profile.name;
            } catch(e) {}

            const prompt = `你是一个社交论坛的“造物主”。请为以下这篇帖子生成 10-15 条极具“活人感”的评论区互动记录。
帖子作者：${post.authorName}
帖子内容：${post.content}
作者背景设定：${authorPersona || '（无。此人是路人或系统NPC）'}

【排版要求】：
严格输出 JSON 数组，格式必须为：[{"name":"评论者名称", "text":"评论内容"}]

【🔥 核心修罗场规则】：
1. 帖主必须下场互动：生成的评论中，必须有 1-2 条是【帖子作者本人】（即 "${post.authorName}"）回复其他人的评论！例如别人吐槽ta，ta直接在评论区怼回去。格式参考："@某某 闭嘴吧你。"
2. 关系网调用：如果作者是具体角色，必须从ta的背景设定中提取出死对头、亲属、或暧昧对象来评论。语气必须完全符合他们的关系。
3. 路人代号：对于无关的路人，请使用充满网感的 ID（如：ANON. 7A9F、熬夜冠军、精神稳定状态0、纯爱战神）。
4. 拒绝AI味：评论必须短平快！大量使用人类上网习惯的表达（如：绝了、笑死、666、啊？、救命、什么鬼、已截图）。绝对不要端着！
5. ⚠️【禁止串戏警告】（极度重要）：你生成的评论列表中，**绝对不能**出现用户（即“${userName}”或“我”）的发言！所有的路人仅仅是网上的陌生网友。帖子作者在回复这些路人时，必须把他们当做【素不相识的陌生吃瓜网友】，绝对不能把任何路人当做“${userName}”来产生互动！
6. 🚧【分寸下限】（必须遵守）：可以毒舌、抬杠、阴阳怪气、看热闹，这是网感；但绝对不许出现以下内容——人身攻击与辱骂（针对长相、身材、智商、出身、性别、性取向、地域、家庭的羞辱）、脏话和侮辱性绰号、人身威胁、诅咒、引战仇恨言论、以及任何让人单纯感到被冒犯而非觉得好笑的恶意。目标是"好笑、有梗、有network感"，不是"恶心、攻击、踩人"。冲突要停在"互相调侃"，不能滑到"网暴"。`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('[');
            const end = cleaned.lastIndexOf(']');
            if (start === -1 || end === -1) throw new Error('解析失败');
            
            const comments = JSON.parse(cleaned.substring(start, end + 1));
            
            let baseTime = post.timestamp + 60000;
            post.comments = comments.map(c => {
                baseTime += Math.floor(Math.random() * 600000); 
                const d = new Date(baseTime);
                return {
                    name: c.name,
                    text: c.text,
                    time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
                };
            });

            await _saveBotPosts();
            
            const listEl = btn.closest('.collage-post').querySelector('.receipt-list');
            // 注意：这里传了 post.authorName 进去，为了高亮帖主！
            _renderCommentsList(listEl, post.comments, post.type === 'pinned', post.authorName, postId);
            
            btn.innerHTML = `<i class="ph ph-list-dashes"></i> Hide Notes`;
            btn.closest('.collage-post').querySelector('.receipt-comments').style.display = 'block';

        } catch(e) {
            console.error('[Decrypt Error]', e);
            showMessage('解密失败，信号干扰');
            btn.innerHTML = `<i class="ph ph-list-dashes"></i> View Notes`;
        } finally {
            _isDecrypting = false;
        }
    }

    // --- 核心：路人随机发帖 ---
    async function _generateGuestPost() {
    try {
        const activeApi = await ApiModule.getSecondaryApi();
        
        const prompt = `你是网络上一个真实存在的普通用户，此刻随手发了一条动态。

直接输出一条最近让你有感而发的碎碎念。

要求：
1. 必须有真实的小红书味——可以是某个瞬间的感受、一个奇怪的发现、莫名其妙的共情点、或者让人忍不住想评论的切入角
2. 语气、内容、格式完全自由，不限题材，不要自我重复，每次都要是完全不同的情绪和场景
3. 同时自己起一个符合内容气质的小红书风格用户名（比如：会发光的石头、三点一刻的月亮、戒不掉摆烂的Q、etc，风格随内容走）
4. 字数 20-60 字

严格返回 JSON：{"name": "用户名", "content": "动态内容"}`;

        const response = await ApiHelper.chatCompletion(activeApi, [{ role: 'user', content: prompt }]);
        const cleaned = response.replace(/```json|```/g, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        const data = JSON.parse(cleaned.substring(start, end + 1));

        _botPosts.push({
            id: 'ed_guest_' + Date.now(),
            type: 'guest',
            authorName: data.name || '匿名路人',
            content: data.content?.trim() || response.trim(),
            timestamp: Date.now(),
            likes: Math.floor(Math.random() * 50),
            comments: []
        });
        await _saveBotPosts();
    } catch(e) {}
}
    
    // --- 核心：角色主动投稿 (提取私聊记忆) ---
    async function _generateRolePost(specificCharId = null) {
        try {
            const activeApi = await ApiModule.getSecondaryApi();
            if (!activeApi) return;

            const chars = await DB.characters.getAll();
            if (chars.length === 0) return;

            const char = specificCharId ? chars.find(c => String(c.id) === String(specificCharId)) : chars[Math.floor(Math.random() * chars.length)];
            if (!char) return;

            const msgs = await DB.messages.getPage(String(char.id), 0, 30).catch(()=>[]);
            const historyText = msgs.reverse().filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => `[${m.role === 'user' ? '用户' : char.name}]: ${m.content}`).join('\n');

            const prompt = `你现在是【${char.name}】。
你的性格设定是：${char.persona}
这是你最近和用户的私聊记录：
${historyText || '（暂无聊天记录）'}

【任务】：
你刚刚放下手机，随手给一个叫"观测志"的匿名系统投递了一则碎碎念/动态。
内容必须源自你们【刚聊过的话题】或是你【没有在聊天里说出口的潜台词】。

【红线警告】：
1. 100% 贴合你的人设！口语化、随性。
2. 绝对不要像AI写小作文，不要用排比句！
3. 字数控制在10-50字，直接输出动态正文。`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            
            _botPosts.push({
                id: 'ed_role_' + Date.now(),
                type: 'role',
                charId: String(char.id), 
                authorName: char.name,
                avatarUrl: '', // 🌟 修复：坚决不存临时生成的 blob 链接
                content: response.trim(),
                timestamp: Date.now(),
                likes: Math.floor(Math.random() * 300) + 10,
                comments:[]
            });
            await _saveBotPosts();
        } catch(e) { console.error('[Role Post Gen Error]', e); }
    }

    // --- 核心：手动刷新波段 (生成 1角色 + 1~2路人) ---
    async function forceGenerateNewPosts(btn) {
        if (!btn) btn = document.getElementById('btn-refresh-bot');
        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="ph-thin ph-circle-notch" style="animation: ed-spin 1s linear infinite;"></i> 信号捕获中...`;
        }

        try {
            // 1. 生成 1 个角色内心独白帖
            await _generateRolePost();
            
            // 2. 随机生成 1 到 2 个路人发疯帖
            const guestCount = Math.random() > 0.5 ? 2 : 1;
            for (let i = 0; i < guestCount; i++) {
                await _generateGuestPost();
            }
            
            // 3. 渲染上屏
            _renderBotFeed();
            showMessage('波段刷新成功，已拦截最新信号 ✦');
        } catch (e) {
            showMessage('信号干扰，刷新失败');
            console.error(e);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml || `<i class="ph-bold ph-arrows-clockwise"></i> Refresh`;
            }
        }
    }
    
    // --- 核心 4：动态渲染 Bot 页面 (修复：支持异步解析活图片) ---
    async function _renderBotFeed() {
        const feed = document.querySelector('#ed-view-bot .collage-feed');
        if (!feed) return;
        feed.innerHTML = '';

        if (_botPosts.length === 0) {
            feed.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-muted); font-family: monospace;">[ DATA STREAM EMPTY ]</div>';
            return;
        }

        const pinned = _botPosts.find(p => p.type === 'pinned');
        const others = _botPosts.filter(p => p.type !== 'pinned').sort((a,b) => b.timestamp - a.timestamp);
        
        if (pinned) feed.appendChild(await _createPostElement(pinned));
        for (const p of others) {
            feed.appendChild(await _createPostElement(p));
        }
    }

    async function _createPostElement(post) {
        const div = document.createElement('div');
        div.className = 'collage-post';

        let actualAvatarUrl = post.avatarUrl;
        
        // 修复：提取真实的投稿人头像
        if (post.type === 'role' && post.charId && (!actualAvatarUrl || actualAvatarUrl.startsWith('blob:'))) {
            try {
                const char = (await DB.characters.getAll()).find(c => String(c.id) === String(post.charId));
                if (char && char.avatarUrl) {
                    actualAvatarUrl = await Assets.getUrl(char.avatarUrl).catch(()=>'');
                }
            } catch(e){}
            if (!actualAvatarUrl) actualAvatarUrl = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80';
        } else if (post.type === 'user' && (!actualAvatarUrl || actualAvatarUrl.startsWith('blob:'))) {
            actualAvatarUrl = await Assets.getUrl('avatar').catch(()=>'') || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=100&auto=format&fit=crop';
        }

        let watermark = 'Daily'; let tagClass = 'tag-role'; let icon = 'ph-star'; let typeName = 'Role';
        if (post.type === 'pinned') { watermark = 'Pinned'; tagClass = 'tag-bot'; icon = 'ph-eye'; typeName = 'Observer'; }
        else if (post.type === 'user') { watermark = 'User'; tagClass = 'tag-user'; icon = 'ph-user'; typeName = 'User'; }
        else if (post.type === 'guest') { watermark = 'Guest'; tagClass = 'tag-guest'; icon = 'ph-ghost'; typeName = 'Guest'; }

        const delBtnHtml = post.type !== 'pinned' ? 
            `<button class="action-btn" style="margin-left:auto; color:#d64045;" onclick="EditorialModule.deleteBotPost('${post.id}')"><i class="ph-bold ph-trash"></i></button>` : '';

        let innerHtml = `
            <div class="post-watermark">${watermark}</div>
            <div class="post-meta-tag ${tagClass}"><i class="ph-fill ${icon}"></i> ${typeName}</div>
        `;

        if (post.type === 'pinned') {
            innerHtml += `
            <div class="widget-bot-pinned">
                <i class="ph-fill ph-push-pin pin-deco"></i>
                <div class="post-text">${_escHtml(post.content)}</div>
                <div class="interaction-bar">
                    <button class="action-btn" onclick="EditorialModule.toggleLike(this)"><i class="ph-fill ph-heart" style="color:#d64045;"></i> ${post.likes}</button>
                    <button class="action-btn" onclick="EditorialModule.handleCommentsClick('${post.id}', this)"><i class="ph ph-list-dashes"></i> View Records</button>
                    <button class="action-btn" style="margin-left:auto; color:var(--sage-green);" onclick="EditorialModule.refreshPinnedPost(this)"><i class="ph-bold ph-arrows-clockwise"></i></button>
                    ${delBtnHtml}
                </div>
            </div>`;
        } else {
            // 🌟 修复核心：把路人和普通角色严格拆开，路人绝对不用 <img> 标签！
            let avatarHtml = '';
            if (post.type === 'guest') {
                avatarHtml = `<div style="width: 32px; height: 32px; border-radius: 50%; background: #e0dcd3; display: flex; align-items: center; justify-content: center;"><i class="ph-fill ph-ghost" style="color: #a8a39f;"></i></div>`;
            } else {
                avatarHtml = `<img src="${actualAvatarUrl}" alt="">`;
            }

            innerHtml += `
            <div class="widget-polaroid-post">
                <div class="post-content-widget">
                    ${post.type === 'role' ? `
                    <div class="mini-polaroid">
                        <div class="mini-tape"></div>
                        <img src="${actualAvatarUrl}" alt="">
                    </div>` : '<div class="mini-stamp">♡</div>'}
                    
                    <div class="author-row">
                        ${avatarHtml}
                        <span class="name">${_escHtml(post.authorName)}</span>
                        <span class="time">${_timeAgo(post.timestamp)}</span>
                    </div>
                    <div class="post-text">${_escHtml(post.content)}</div>
                    <div class="interaction-bar">
                        <button class="action-btn" onclick="EditorialModule.toggleLike(this)"><i class="ph-fill ph-heart" style="color:#d64045;"></i> ${post.likes}</button>
                        <button class="action-btn" onclick="EditorialModule.handleCommentsClick('${post.id}', this)"><i class="ph ph-list-dashes"></i> View Notes</button>
                        ${delBtnHtml}
                    </div>
                </div>
            </div>`;
        }

        const isDark = post.type === 'pinned' ? 'dark-receipt' : '';
        innerHtml += `
            <div class="receipt-comments ${isDark}">
                <div class="receipt-list"></div>
                <div class="receipt-input-area">
                    <input type="text" class="receipt-input" placeholder="Enter log...">
                    <button class="btn-receipt-send" onclick="EditorialModule.publishReceiptComment(this, '${post.id}')">Submit</button>
                </div>
            </div>
        `;
        
        div.innerHTML = innerHtml;
        return div;
    }

    // --- 渲染已有评论列表 (带楼主高亮与点击回复) ---
    function _renderCommentsList(listEl, comments, isDark, postAuthorName, postId) {
        listEl.innerHTML = comments.map(c => {
            const isAuthor = c.name === postAuthorName;
            const nameColor = isAuthor ? '#d64045' : (isDark ? '#d4a373' : '#a3b19b');
            const authorBadge = isAuthor ? `<span style="font-size:0.5rem; background:#d64045; color:#fff; padding:1px 4px; border-radius:2px; margin-left:4px; vertical-align:middle; font-weight:800; letter-spacing:1px;">AUTHOR</span>` : '';
            
            return `
            <div class="receipt-item" onclick="EditorialModule.prepareReply('${postId}', '${_escHtml(c.name)}')" style="cursor:pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1">
                <span class="c-name" style="color:${nameColor};">${_escHtml(c.name)}${authorBadge}</span> 
                ${_escHtml(c.text)}
            </div>`;
        }).join('');
    }
    
    // (在模块内部补充这两个函数)
    async function deleteBotPost(postId) {
        if (!confirm('确认彻底销毁此条观测记录？')) return;
        _botPosts = _botPosts.filter(p => p.id !== postId);
        await _saveBotPosts();
        _renderBotFeed();
        showMessage('记录已物理抹除');
    }

    // --- 刷新爆料贴：清掉旧的（连带评论）并重新生成 ---
    async function refreshPinnedPost(btn) {
        if (_isRefreshingPinned) { showMessage('正在重新观测，请稍候'); return; }
        if (_isDecrypting) { showMessage('评论解密中，请稍后再刷新'); return; }
        _isRefreshingPinned = true;

        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="ph-thin ph-circle-notch" style="animation: ed-spin 1s linear infinite;"></i>`;
        }

        try {
            // 清掉旧的爆料贴，post.comments 一并随之删除
            _botPosts = _botPosts.filter(p => p.type !== 'pinned');
            await _saveBotPosts();

            // 重新生成（_generatePinnedPost 内部含 __SKIP__ 兜底 + _renderBotFeed）
            await _generatePinnedPost();

            // 若本轮无真实爆点被跳过，pinned 不会回来，给个提示并刷新视图
            if (!_botPosts.some(p => p.type === 'pinned')) {
                _renderBotFeed();
                showMessage('暂无新的可爆细节，已清空旧爆料');
            } else {
                showMessage('已重新观测');
            }
        } catch(e) {
            console.error('[Refresh Pinned Error]', e);
            showMessage('刷新失败，信号干扰');
        } finally {
            _isRefreshingPinned = false;
            if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
        }
    }

    // --- 处理点击“View Notes”按钮的逻辑 ---
    function handleCommentsClick(postId, btn) {
        const post = _botPosts.find(p => p.id === postId);
        if (!post) return;
        
        const receipt = btn.closest('.collage-post').querySelector('.receipt-comments');
        
        // 如果已经是打开的，就收起
        if (receipt.style.display === 'block') {
            receipt.style.display = 'none';
            btn.innerHTML = `<i class="ph ph-list-dashes"></i> View Records`;
            return;
        }

        // 如果还没生成过评论，触发大模型解密 (Decrypting)
        if (!post.comments || post.comments.length === 0) {
            _decryptComments(postId, btn);
        } else {
            // 已经生成过了，直接展开并渲染
            const listEl = receipt.querySelector('.receipt-list');
            
            // 👇 就是这行！补充了第四个参数 post.authorName，用来判断谁是楼主 👇
            _renderCommentsList(listEl, post.comments, post.type === 'pinned', post.authorName, postId);
            
            receipt.style.display = 'block';
            btn.innerHTML = `<i class="ph ph-list-dashes"></i> Hide Notes`;
        }
    }
    
    // --- 核心：生成一篇盲采 (全员修罗场版) ---
    async function _generateBlindInterview(isFirstTime = false) {
        if (_isGeneratingInterview) return;
        _isGeneratingInterview = true;

        const feedEl = document.querySelector('#ed-view-interview .interview-feed');
        if (isFirstTime && feedEl) {
            feedEl.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; padding: 60px 0; color:var(--sage-green);"><i class="ph-thin ph-circle-notch" style="animation: ed-spin 1s linear infinite; font-size:2rem; margin-bottom:12px;"></i><span style="font-family:'Space Mono', monospace; font-size:0.75rem;">正在连线暗网盲采频道...</span></div>`;
        }

        try {
            const activeApi = await ApiModule.getSecondaryApi();
            if (!activeApi) throw new Error('API未配置');

            const allChars = await DB.characters.getAll().catch(()=>[]);
            if (allChars.length === 0) throw new Error('没有可用角色');

            // 抓取全员的设定、面具和最近的聊天情绪
            let castContext = '';
            for (const c of allChars) {
                const binding = await DB.bindings.get(String(c.id)).catch(()=>null);
                const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
                const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
                const userObj = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0];
                let userMaskStr = userObj ? `面对的用户面具是【${userObj.name}】：${userObj.bio}` : '无特定绑定';

                // 为了省Token，每人只抓取最近5条消息体会语气
                const msgs = await DB.messages.getPage(String(c.id), 0, 5).catch(()=>[]);
                const moodText = msgs.filter(m => m.role === 'assistant').map(m => m.content).join(' | ');

                castContext += `
【真实角色 ID: ${c.id} | 名字: ${c.name}】
性格设定: ${c.persona}
${userMaskStr}
最近语气参考: ${moodText || '暂无'}
-----------------`;
            }

            const prompt = `你是一个匿名论坛的版主。本次提问，系统内所有的角色都潜伏在观众席里。

【参演角色名单与底层设定】：
${castContext}

【任务流程】：
1. 抛出一个关于人性、情感或日常趣事的盲采发问（不要任何标题、前缀或标号，直接发问！语气像玩真心话大冒险一样）。
2. 生成 10-15 条匿名回答（代号统一为 ANON. XXXX 格式）。

【🔥 极度重要的高阶修罗场玩法】：
- 参演名单中的【所有角色】都必须下场回答！但必须隐藏在 ANON 代号背后。
- 【伪装法则】：角色作答时，可以正常发挥，也可以【故意模仿绑定的用户语气】来混淆视听，或者互相【调侃拆台】。
- 【路人掺水】：可以混入几个真正的路人NPC（吐槽或吃瓜），NPC的真实角色ID填 "npc"。
- 路人与角色之间可以互相回复（如："回复 ANON. 1B22：你这也太明显了吧"）。

【⚠️ 安全与底线警告】：
绝对禁止使用脏话、恶毒谩骂、人身攻击或低俗恶臭词汇。即使是角色之间的“互损”或对用户的“吃醋”，也必须是高段位的、幽默的或带有暧昧张力的拉扯，绝对不能让用户感到被冒犯或遭到网络暴力。

【底层格式严格要求】：
严格输出 JSON，绝对不能暴露角色的真名在页面上！必须附带 realCharId 以供底层追踪：
{
  "question": "盲采问题正文...",
  "answers":[
    {"id": "ANON. 7A9F", "text": "回答内容...", "realCharId": "1"}, 
    {"id": "ANON. B211", "text": "回复 ANON. 7A9F：你这是在自欺欺人。", "realCharId": "npc"}
  ]
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            let baseTime = Date.now() - 3600000; 
            const finalAnswers = data.answers.map(a => {
                baseTime += Math.floor(Math.random() * 60000) + 10000;
                const d = new Date(baseTime);
                return {
                    id: a.id,
                    realCharId: a.realCharId, // 🌟 底层偷偷记录真实的身份
                    text: a.text,
                    time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
                };
            });

            const issueNum = String(_interviews.length + 1).padStart(3, '0');
            const newInt = {
                id: 'ed_int_' + Date.now(),
                issue: `Issue N° ${issueNum}`,
                timestamp: Date.now(),
                question: data.question,
                answers: finalAnswers
            };
            
            _interviews.unshift(newInt);
            await _saveInterviews();

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            await DB.settings.set('ed-blind-next-time', tomorrow.getTime() + Math.floor(Math.random() * 24 * 60 * 60 * 1000));

            _renderInterviews();

        } catch(e) {
            console.error('[Blind Interview Error]', e);
            if (isFirstTime && feedEl) feedEl.innerHTML = `<div style="color:#d64045; text-align:center; padding: 40px;">连线失败，频道受干扰。</div>`;
        } finally {
            _isGeneratingInterview = false;
        }
    }
    
    // --- 新增：刷新单篇盲采 (重新生成问题+回答，原地覆写) ---
    async function refreshInterview(interviewId, btn) {
        if (_isGeneratingInterview) {
            showMessage('请等待当前盲采生成完成');
            return;
        }
        const intv = _interviews.find(i => i.id === interviewId);
        if (!intv) return;

        _isGeneratingInterview = true;
        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="ph-thin ph-circle-notch" style="animation: ed-spin 1s linear infinite;"></i>`;
        }

        try {
            const activeApi = await ApiModule.getSecondaryApi();
            if (!activeApi) throw new Error('API未配置');

            const allChars = await DB.characters.getAll().catch(()=>[]);
            if (allChars.length === 0) throw new Error('没有可用角色');

            // 抓取全员的设定、面具和最近的聊天情绪
            let castContext = '';
            for (const c of allChars) {
                const binding = await DB.bindings.get(String(c.id)).catch(()=>null);
                const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
                const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
                const userObj = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0];
                let userMaskStr = userObj ? `面对的用户面具是【${userObj.name}】：${userObj.bio}` : '无特定绑定';

                const msgs = await DB.messages.getPage(String(c.id), 0, 5).catch(()=>[]);
                const moodText = msgs.filter(m => m.role === 'assistant').map(m => m.content).join(' | ');

                castContext += `
【真实角色 ID: ${c.id} | 名字: ${c.name}】
性格设定: ${c.persona}
${userMaskStr}
最近语气参考: ${moodText || '暂无'}
-----------------`;
            }

            const prompt = `你是一个匿名论坛的版主。本次提问，系统内所有的角色都潜伏在观众席里。

【参演角色名单与底层设定】：
${castContext}

【任务流程】：
1. 抛出一个关于人性、情感或日常趣事的盲采发问（不要任何标题、前缀或标号，直接发问！语气像玩真心话大冒险一样）。换一个全新的角度，不要和老问题雷同。
2. 生成 10-15 条匿名回答（代号统一为 ANON. XXXX 格式）。

【🔥 极度重要的高阶修罗场玩法】：
- 参演名单中的【所有角色】都必须下场回答！但必须隐藏在 ANON 代号背后。
- 【伪装法则】：角色作答时，可以正常发挥，也可以【故意模仿绑定的用户语气】来混淆视听，或者互相【调侃拆台】。
- 【路人掺水】：可以混入几个真正的路人NPC（吐槽或吃瓜），NPC的真实角色ID填 "npc"。
- 路人与角色之间可以互相回复（如："回复 ANON. 1B22：你这也太明显了吧"）。

【⚠️ 安全与底线警告】：
绝对禁止使用脏话、恶毒谩骂、人身攻击或低俗恶臭词汇。即使是角色之间的“互损”或对用户的“吃醋”，也必须是高段位的、幽默的或带有暧昧张力的拉扯，绝对不能让用户感到被冒犯或遭到网络暴力。

【底层格式严格要求】：
严格输出 JSON，绝对不能暴露角色的真名在页面上！必须附带 realCharId 以供底层追踪：
{
  "question": "盲采问题正文...",
  "answers":[
    {"id": "ANON. 7A9F", "text": "回答内容...", "realCharId": "1"}, 
    {"id": "ANON. B211", "text": "回复 ANON. 7A9F：你这是在自欺欺人。", "realCharId": "npc"}
  ]
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            let baseTime = Date.now() - 3600000;
            const finalAnswers = data.answers.map(a => {
                baseTime += Math.floor(Math.random() * 60000) + 10000;
                const d = new Date(baseTime);
                return {
                    id: a.id,
                    realCharId: a.realCharId,
                    text: a.text,
                    time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
                };
            });

            // 原地覆写：只换问题和回答，保留 id / issue 编号 / 时间戳排序
            intv.question = data.question;
            intv.answers = finalAnswers;
            await _saveInterviews();
            _renderInterviews();
            showMessage('盲采已重新连线 ✦');

        } catch(e) {
            console.error('[Refresh Interview Error]', e);
            showMessage('连线失败，频道受干扰');
            if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
        } finally {
            _isGeneratingInterview = false;
        }
    }

    // --- 检查盲采页面状态 ---
    async function _checkInterviewState() {
        await _loadInterviews();
        
        // 1. 如果一条都没有，触发首次加载
        if (_interviews.length === 0) {
            _generateBlindInterview(true);
            return;
        }
        
        // 2. 检查是否到了今天的“随机盲采生成时间”
        const nextTime = await DB.settings.get('ed-blind-next-time');
        if (!nextTime || Date.now() >= nextTime) {
            // 后台静默生成，不打扰当前渲染
            _generateBlindInterview(false);
        }

        _renderInterviews();
    }

    // --- 渲染盲采列表 ---
    function _renderInterviews() {
        const feed = document.querySelector('#ed-view-interview .interview-feed');
        if (!feed) return;
        feed.innerHTML = '';

        _interviews.forEach(intv => {
            const dateObj = new Date(intv.timestamp);
            const dateStr = `${String(dateObj.getMonth()+1).padStart(2,'0')}.${String(dateObj.getDate()).padStart(2,'0')} // ${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;

            // 🌟 修复：加上 onclick 事件和悬停效果
            const ansHtml = intv.answers.map(a => `
                <div class="edit-answer-item" onclick="EditorialModule.prepareInterviewReply('${intv.id}', '${_escHtml(a.id)}')" style="cursor:pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1">
                    <div class="anon-header">
                        <div class="anon-id">${_escHtml(a.id)}</div>
                        <div class="anon-time">${a.time}</div>
                    </div>
                    <div class="anon-text">${_escHtml(a.text)}</div>
                </div>
            `).join('');

            const cardHtml = `
            <div class="editorial-card">
                <div class="edit-meta">
                    <span class="issue">${intv.issue}</span>
                    <span style="display:flex; align-items:center; gap:10px;">
                        <span class="timestamp">${dateStr}</span>
                        <button onclick="EditorialModule.refreshInterview('${intv.id}', this)" title="重新生成这篇盲采" style="background:transparent; border:none; cursor:pointer; color:var(--text-muted); padding:2px; display:flex; align-items:center; font-size:0.9rem;" onmouseover="this.style.color='var(--text-dark)'" onmouseout="this.style.color='var(--text-muted)'"><i class="ph-bold ph-arrows-clockwise"></i></button>
                    </span>
                </div>
                <div class="edit-body">
                    <div class="edit-q-mark">Q.</div>
                    <div class="edit-question">${_escHtml(intv.question)}</div>
                </div>
                <button class="edit-toggle-btn" onclick="EditorialModule.toggleAnswers(this)">
                    <span class="btn-text">View ${intv.answers.length} Responses</span>
                    <i class="ph-bold ph-plus btn-icon"></i>
                </button>
                <div class="edit-answers-panel">
                    <div class="edit-answer-list">${ansHtml}</div>
                    <div class="edit-input-area">
                        <div class="edit-input-wrapper">
                            <input type="text" class="edit-input" placeholder="Add your response...">
                        </div>
                        <button class="btn-edit-send" onclick="EditorialModule.submitAnonAnswer(this, '${intv.id}')">Send</button>
                    </div>
                </div>
            </div>`;
            
            feed.innerHTML += cardHtml;
        });
    }
    
    // 工具函数
    function _escHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    
    // ============================================================
    // 核心逻辑：周刊档案 (Weekly Deep Dive)
    // ============================================================
    let _currentWeeklyCharId = null;
    let _isGeneratingWeekly = false;
    let _weeklyTimer = null;

    async function _checkWeeklyState() {
        const cover = document.getElementById('ed-weekly-cover');
        const content = document.getElementById('ed-weekly-content');

        // 彻底移除全屏封锁！用户应该直接进来看塔罗牌
        if (cover) cover.style.display = 'none';
        if (content) content.style.display = 'block';

        // 直接初始化顶部塔罗牌
        _initWeeklyTarots(); 
    }

    async function _initWeeklyTarots() {
        const chars = await DB.characters.getAll().catch(()=>[]);
        const container = document.getElementById('ed-weekly-tarots');
        container.innerHTML = '';
        
        for (const c of chars) {
            let avatar = await Assets.getUrl(c.avatarUrl).catch(()=>'') || 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80';
            const card = document.createElement('div');
            card.className = 'tarot-card';
            card.onclick = () => selectWeeklyRole(card, c.id);
            card.innerHTML = `
                <img class="tarot-img" src="${avatar}" alt="">
                <span class="tarot-name">${c.name}</span>
            `;
            container.appendChild(card);
        }
        
        // 默认选中第一个
        if (chars.length > 0) {
            selectWeeklyRole(container.firstChild, chars[0].id);
        }
    }

    async function selectWeeklyRole(cardEl, charId) {
        if (_isGeneratingWeekly) {
            showMessage('请等待当前档案解密完成');
            return;
        }

        const parent = cardEl.parentElement;
        parent.querySelectorAll('.tarot-card').forEach(item => item.classList.remove('active'));
        cardEl.classList.add('active');
        
        _currentWeeklyCharId = charId;
        const timeData = _getSundayNoonData();
        document.getElementById('ed-weekly-issue-title').textContent = `Issue. ${timeData.lastIssueId.slice(-4)}`;

        // 获取并检查数据
        let weeklyDB = await DB.settings.get('ed-weekly-deepdive') || {};
        if (weeklyDB.issueId !== timeData.lastIssueId) {
            weeklyDB = { issueId: timeData.lastIssueId, roles: {} };
        }

        const reportBox = document.getElementById('ed-weekly-report-box');
        const actionBox = document.getElementById('ed-weekly-action-box');
        const statusText = document.getElementById('ed-wk-status-text');
        const btnGen = document.getElementById('ed-btn-gen-weekly');

        if (weeklyDB.roles[charId]) {
            // 已生成，渲染报告
            actionBox.style.display = 'none';
            reportBox.style.display = 'block';
            _renderWeeklyReport(weeklyDB.roles[charId]);
        } else {
            // 未生成，计算该角色近7天的消息数
            reportBox.style.display = 'none';
            actionBox.style.display = 'block';
            
            const sevenDaysAgo = timeData.nextUnlockTime - 14 * 24 * 60 * 60 * 1000; // 上上个周日
            const msgs = await DB.messages.getPage(String(charId), 0, 1000).catch(()=>[]);
            const validMsgs = msgs.filter(m => m.timestamp >= sevenDaysAgo && m.role !== 'system_ticket');
            
            if (validMsgs.length < 100) {
                statusText.innerHTML = `数据样本不足 (<span style="color:#d64045;">${validMsgs.length}/100</span>) 条。<br>无法生成深潜档案，请增加本周互动。`;
                btnGen.style.display = 'none';
            } else {
                statusText.innerHTML = `已收集到 ${validMsgs.length} 条有效观测样本。<br>符合深潜条件。`;
                btnGen.style.display = 'flex';
                btnGen.innerHTML = `<i class="ph-bold ph-fingerprint"></i> 解密专属深潜档案`;
            }
        }
    }

    async function generateWeeklyRole() {
        if (!_currentWeeklyCharId || _isGeneratingWeekly) return;
        _isGeneratingWeekly = true;

        const btnGen = document.getElementById('ed-btn-gen-weekly');
        btnGen.innerHTML = `<i class="ph-thin ph-circle-notch" style="animation: ed-spin 1s linear infinite;"></i> 神经网直连解密中...`;

        try {
            const activeApi = await ApiModule.getSecondaryApi();
            const char = await DB.characters.get(Number(_currentWeeklyCharId));
            
            const timeData = _getSundayNoonData();
            const sevenDaysAgo = timeData.nextUnlockTime - 14 * 24 * 60 * 60 * 1000;
            const msgs = await DB.messages.getPage(String(char.id), 0, 500).catch(()=>[]);
            const historyText = msgs.reverse().filter(m => m.timestamp >= sevenDaysAgo && m.role !== 'system_ticket')
                .map(m => `[${m.role}]: ${m.content}`).join('\n').slice(-4000);

            const prompt = `你是一个顶级心理侧写师。请根据以下角色【${char.name}】（设定：${char.persona}）本周的聊天记录，生成一份极具电影感和偷窥感的深度情感档案。
记录片段：
${historyText}

要求返回严格的 JSON 格式：
{
  "tension": "【情感拉扯矩阵】100字，冷峻分析ta文字下隐藏的情绪、占有欲或潜台词，开头第一个字必须适合做巨大首字母排版。",
  "spyCaption": "【狗仔队街拍文案】用第三人称描述这周某天下午观测到ta的一个画面（带有隐喻），比如：周五下午，观测视窗捕捉到ta独自在看雨，他在想谁不言而喻。",
  "spyImagePrompt": "【AI生图提示词】为上面那段文案生成一句英文的画面描述提示词（要求黑白胶片质感、高模糊噪点、空景、极其高级的莫兰迪氛围）。",
  "quote": "【本周名句】从聊天记录中提取出ta说过的一句最深情或最刻薄的原话。",
  "poem1": { "code": "[RECALL_XX等自编代号]", "text": "【数据诗】提取一个聊天数据点（如深夜闲聊、撤回、语气词），写一段冷酷又浪漫的短评。" },
  "poem2": { "code": "[HEART_BEAT等]", "text": "【数据诗2】同上，另一个视角的短评。" },
  "script":[
    {"speaker": "Q.", "dialog": "本周你似乎在故意逃避某个话题？", "action": ""},
    {"speaker": "A.", "dialog": "没有。", "action": "(没有看镜头)"},
    {"speaker": "Q.", "dialog": "进一步的追问...", "action": ""},
    {"speaker": "A.", "dialog": "对方的破防或沉默回应", "action": "(掐灭了烟)"}
  ]
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            // 🌟 尝试调用生图 API
            let finalImageUrl = 'https://images.unsplash.com/photo-1473186578172-c141e6798cf4?q=80&w=600&auto=format&fit=crop';
            if (ApiHelper.generateImage && data.spyImagePrompt) {
                try {
                    showMessage('正在洗印胶片照片...');
                    const base64Img = await ApiHelper.generateImage(data.spyImagePrompt);
                    if (base64Img) finalImageUrl = base64Img; // 如果你的是返回 base64
                } catch (imgE) { console.error('生图失败，使用氛围图兜底'); }
            }
            data.spyImageUrl = finalImageUrl;

            // 存入数据库
            let weeklyDB = await DB.settings.get('ed-weekly-deepdive') || {};
            if (weeklyDB.issueId !== timeData.lastIssueId) weeklyDB = { issueId: timeData.lastIssueId, roles: {} };
            weeklyDB.roles[char.id] = data;
            await DB.settings.set('ed-weekly-deepdive', weeklyDB);

            showMessage('深潜档案解密完成');
            
            // 重新渲染当前角色状态
            const activeCard = document.querySelector('#ed-weekly-tarots .tarot-card.active');
            selectWeeklyRole(activeCard, char.id);

        } catch(e) {
            console.error('[Weekly Deep Dive Error]', e);
            showMessage('解密失败，数据波动异常');
            btnGen.innerHTML = `<i class="ph-bold ph-fingerprint"></i> 解密专属深潜档案`;
        } finally {
            _isGeneratingWeekly = false;
        }
    }

    async function rerollWeekly() {
        if (_isGeneratingWeekly) { showMessage('请等待当前档案解密完成'); return; }
        if (!_currentWeeklyCharId) return;
        if (!confirm('重新生成会覆盖当前档案，确定？')) return;

        // 切回生成态，让 generateWeeklyRole 的 loading 反馈可见
        document.getElementById('ed-weekly-report-box').style.display = 'none';
        const actionBox = document.getElementById('ed-weekly-action-box');
        actionBox.style.display = 'block';
        const btnGen = document.getElementById('ed-btn-gen-weekly');
        btnGen.style.display = 'flex';
        document.getElementById('ed-wk-status-text').innerHTML = '正在重新解密专属深潜档案...';

        // 复用现有生成逻辑：内部会用新数据覆写同角色档案并重新渲染
        await generateWeeklyRole();
    }

    function _renderWeeklyReport(data) {
        document.getElementById('ed-wk-tension').innerHTML = _escHtml(data.tension);
        document.getElementById('ed-wk-spy-img').src = data.spyImageUrl || 'https://images.unsplash.com/photo-1473186578172-c141e6798cf4?q=80&w=600&auto=format&fit=crop';
        
        const now = new Date();
        document.getElementById('ed-wk-spy-time').innerText = `CAPTURED // ${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} 15:00 PM`;
        document.getElementById('ed-wk-spy-caption').innerText = data.spyCaption;
        
        document.getElementById('ed-wk-quote').innerText = data.quote;
        
        document.getElementById('ed-wk-poem1-code').innerText = data.poem1.code;
        document.getElementById('ed-wk-poem1-text').innerText = data.poem1.text;
        document.getElementById('ed-wk-poem2-code').innerText = data.poem2.code;
        document.getElementById('ed-wk-poem2-text').innerText = data.poem2.text;

        const scriptHtml = data.script.map(line => `
            <div class="script-line">
                <div class="script-speaker">${_escHtml(line.speaker)}</div>
                <div class="script-dialog">${_escHtml(line.dialog)} <span class="script-action">${_escHtml(line.action)}</span></div>
            </div>
        `).join('');
        document.getElementById('ed-wk-script-container').innerHTML = scriptHtml;
    }

    return { 
        init, 
        open, 
        close, 
        showMessage,
        toggleLike, 
        toggleReceiptComments, 
        publishReceiptComment,
        toggleAnswers, 
        submitAnonAnswer, 
        refreshInterview,
        selectWeeklyRole,
        generateWeekly,
        _checkHomeState,
        deleteBotPost, 
        refreshPinnedPost,
        handleCommentsClick,
        forceGenerateNewPosts,
        addAgentRolePost: _generateRolePost,   prepareReply,_checkInterviewState,prepareInterviewReply,selectWeeklyRole,generateWeeklyRole,rerollWeekly
    };
})();

// 将模块暴露到 window
window.EditorialModule = EditorialModule;