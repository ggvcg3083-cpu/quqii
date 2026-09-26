'use strict';

/**
 * ============================================================
 * SubjectsModule — 档案提取系统 (UI整合版 + 真实角色列表 + 音乐解析)
 * ============================================================
 */
const SubjectsModule = (() => {

    // 1. 注入所需的全部字体
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Inter:wght@300;400;600;800;900&family=Noto+Serif+SC:wght@400;600;700;900&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,600;1,700&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Libre+Barcode+39+Extended+Text&family=Great+Vibes&family=Zhi+Mang+Xing&family=Nunito:wght@400;600;800;900&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    // 2. 注入专属样式
    const style = document.createElement('style');
    style.textContent = `
        #subjects-screen {
            /* 局部变量隔离 */
            --archive-bg: #080808; --card-bg: #f4f4f4; 
            --bg-light: #f2f2f3; --surface-white: #ffffff; --surface-dark: #1a1a1a;
            --text-dark: #111111; --text-gray: #888888; --text-light: #cccccc;
            --accent-green: #d1e8d5; --accent-pink: #ff3366; 
            --bg-dark: #121212; --paper-color: #fcfcf9; --ink-color: #1a1a1a; 
            --ink-faded: #666666; --stamp-red: #d32f2f; 
            --font-sans: 'Inter', -apple-system, sans-serif;
            --font-serif-en: 'Playfair Display', serif; --font-serif-cn: 'Noto Serif SC', serif;
            --font-hand: 'Caveat', cursive; --font-mono: 'Space Mono', monospace;
            --font-sign: 'Great Vibes', 'Zhi Mang Xing', cursive;
            --bg-color: #050505; --text-main: #f0f0f0; --text-muted: #666666; 
            --line-color: rgba(255, 255, 255, 0.15); --accent-color: #e0e0e0;
            --font-hand-cn: 'Zhi Mang Xing', cursive; --font-hand-en: 'Caveat', cursive;

            position: absolute; inset: 0; width: 100%; height: 100%;
            z-index: 180;
            transform: translateX(100%);
            transition: transform 0.42s cubic-bezier(0.19, 1, 0.22, 1), background-color 0.3s ease;
            display: flex; flex-direction: column; overflow: hidden;
            background-color: var(--archive-bg);
            -webkit-tap-highlight-color: transparent;
        }

        #subjects-screen.active { transform: translateX(0); }

        #subjects-screen .page-view {
            width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden;
            display: none; position: absolute; top: 0; left: 0;
            scrollbar-width: none;
        }
        #subjects-screen .page-view::-webkit-scrollbar { display: none; }
        
        #subjects-screen .page-view.active { display: flex; justify-content: center; }

        /* ================= 视图 0：角色存档页 (Archive) ================= */
        #subjects-screen #view-archive { color: var(--text-light); font-family: var(--font-sans); }

        #subjects-screen .archive-container {
            width: 100%; max-width: 430px; min-height: 100vh; position: relative;
            display: flex; flex-direction: column; padding-bottom: 50px;
            background: radial-gradient(circle at 50% -20%, rgba(255, 255, 255, 0.05) 0%, transparent 40%);
        }

        #subjects-screen .archive-header { padding: calc(env(safe-area-inset-top, 20px) + 20px) 20px 20px; display: flex; align-items: center; }
        #subjects-screen .back-btn-archive {
            display: inline-flex; align-items: center; gap: 4px; color: var(--text-light);
            font-size: 12px; font-weight: 600; text-transform: lowercase;
            background: rgba(255,255,255,0.1); padding: 6px 12px; border-radius: 20px;
            backdrop-filter: blur(4px); cursor: pointer; transition: 0.2s; border: none; outline: none;
        }
        #subjects-screen .back-btn-archive:active { opacity: 0.5; }

        #subjects-screen .hero-section { padding: 10px 20px 40px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        #subjects-screen .hero-icon { font-size: 32px; margin-bottom: -10px; z-index: 1; }
        #subjects-screen .hero-title { font-size: 54px; font-weight: 900; letter-spacing: -3px; text-transform: lowercase; line-height: 1; position: relative; }
        #subjects-screen .hero-subtitle { font-size: 9px; letter-spacing: 4px; text-transform: uppercase; color: #888; margin-top: 10px; }

        #subjects-screen .grid-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 0 20px; }

        #subjects-screen .sub-card {
            background-color: var(--card-bg); border-radius: 12px; padding: 10px;
            display: flex; flex-direction: column; position: relative; color: var(--text-dark);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); cursor: pointer; transition: transform 0.2s;
        }
        #subjects-screen .sub-card:active { transform: scale(0.96); }

        #subjects-screen .card-top-bar { font-size: 7px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; text-align: center; color: #555; }
        #subjects-screen .img-wrapper { width: 100%; aspect-ratio: 4 / 5; border-radius: 8px; overflow: hidden; position: relative; background: #222; }
        #subjects-screen .card-img { width: 100%; height: 100%; object-fit: cover; filter: contrast(1.05) saturate(1.1); }
        #subjects-screen .img-wrapper::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to top, var(--card-bg) 0%, rgba(244,244,244,0) 100%); pointer-events: none; }
        #subjects-screen .card-number { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: var(--text-dark); color: var(--text-light); font-size: 10px; font-weight: 800; padding: 4px 6px; border-radius: 4px; z-index: 2; box-shadow: 2px 2px 10px rgba(0,0,0,0.2); }
        #subjects-screen .card-bottom { position: relative; margin-top: -30px; z-index: 2; display: flex; flex-direction: column; align-items: center; overflow: hidden; width: 100%; }
        #subjects-screen .pinyin-tag { font-family: var(--font-sans); font-size: 7px; font-weight: 800; color: #666; letter-spacing: 2.5px; margin-bottom: -5px; z-index: 3; text-transform: uppercase; }
        #subjects-screen .card-signature { font-family: var(--font-sign); color: var(--text-dark); line-height: 1.2; transform: rotate(-5deg); margin-left: -5px; text-shadow: 1.5px 1.5px 0px #f4f4f4, -1.5px -1.5px 0px #f4f4f4; white-space: nowrap; }
        #subjects-screen .card-footer { display: flex; align-items: center; justify-content: flex-end; width: 100%; gap: 4px; margin-top: 4px; padding-right: 4px; }
        #subjects-screen .card-type { font-size: 11px; font-weight: 800; letter-spacing: -0.5px; text-transform: lowercase; }
        #subjects-screen .dots-icon { font-size: 14px; color: #888; }
        #subjects-screen .bottom-pill { margin: 40px auto 0; background: linear-gradient(90deg, #fff 0%, #888 100%); height: 4px; width: 120px; border-radius: 2px; display: flex; justify-content: space-between; align-items: center; padding: 0 4px; }
        #subjects-screen .bottom-pill::before, #subjects-screen .bottom-pill::after { content: ''; width: 4px; height: 4px; background: var(--archive-bg); border-radius: 50%; }

        /* ================= 视图 1：主页 Dashboard ================= */
        #subjects-screen #view-dashboard {
            color: var(--text-dark); font-family: var(--font-sans);
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.04'/%3E%3C/svg%3E");
        }

        #subjects-screen .dash-container { width: 100%; max-width: 430px; position: relative; padding-bottom: 120px; }
        #subjects-screen .dash-header { padding: calc(env(safe-area-inset-top, 20px) + 10px) 20px 20px; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 100; }
        #subjects-screen .dash-btn-back { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dark); background: #fff; padding: 8px 14px; border-radius: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.04); cursor: pointer; }
        #subjects-screen .dash-status { font-size: 9px; font-family: var(--font-serif-en); font-style: italic; color: var(--text-gray); display: flex; align-items: center; gap: 4px; }
        #subjects-screen .dot-live { width: 4px; height: 4px; background: #ff3b30; border-radius: 50%; animation: ph-pulse 2s infinite; }

        #subjects-screen .svg-doodles { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
        #subjects-screen .stroke-hand { fill: none; stroke: var(--text-dark); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }

        #subjects-screen .moodboard { position: relative; width: 100%; min-height: 900px; padding: 0 20px; }
        #subjects-screen .mod-title { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-gray); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        #subjects-screen .mod-title .cn { font-family: var(--font-serif-cn); font-weight: 700; font-size: 10px; letter-spacing: 0; color: var(--text-dark); }

        #subjects-screen .photo-card { position: absolute; top: 10px; left: 20px; width: 130px; height: 170px; background: #fff; padding: 6px 6px 20px 6px; box-shadow: 0 8px 20px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04); transform: rotate(-4deg); z-index: 10; }
        #subjects-screen .photo-img { width: 100%; height: 100%; object-fit: cover; filter: contrast(1.1); }
        #subjects-screen .tape { position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 50px; height: 16px; background: rgba(255, 255, 255, 0.4); border: 1px solid rgba(255,255,255,0.8); box-shadow: 0 1px 3px rgba(0,0,0,0.05); backdrop-filter: blur(2px); z-index: 11; }

        #subjects-screen .name-typography { position: absolute; top: 40px; left: 140px; z-index: 5; pointer-events: none; }
        #subjects-screen .name-en { font-size: 72px; font-weight: 900; letter-spacing: -4px; color: transparent; -webkit-text-stroke: 1.5px var(--text-light); line-height: 0.8; margin-left: -20px; }
        #subjects-screen .name-cn { font-family: var(--font-serif-cn); font-size: 48px; font-weight: 900; color: var(--surface-dark); position: absolute; top: 20px; left: 30px; }

        #subjects-screen .widget-search { position: absolute; top: 140px; right: 20px; width: 220px; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); border: 1px solid rgba(0,0,0,0.08); border-radius: 30px; padding: 10px 14px; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); z-index: 15; cursor: pointer; }
        #subjects-screen .search-input { font-size: 11px; color: var(--text-gray); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        #subjects-screen .widget-music { position: absolute; top: 220px; left: 20px; width: 160px; background: var(--surface-dark); border-radius: 40px; padding: 8px 12px 8px 8px; display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 16px rgba(0,0,0,0.15); z-index: 10; cursor: pointer; transition: transform 0.2s;}
        #subjects-screen .widget-music:active { transform: scale(0.95); }
        #subjects-screen .vinyl-record { width: 32px; height: 32px; border-radius: 50%; background: conic-gradient(from 0deg, #333, #111, #555, #111, #333); border: 1px solid #555; display: flex; justify-content: center; align-items: center; animation: ph-spin 3s linear infinite; }
        #subjects-screen .vinyl-record::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #ff3366; }
        #subjects-screen .music-text { color: #fff; display: flex; flex-direction: column; }
        #subjects-screen .m-title { font-size: 10px; font-weight: 600; white-space: nowrap; }
        #subjects-screen .m-artist { font-size: 8px; color: #aaa; font-family: var(--font-serif-en); font-style: italic; }

        #subjects-screen .widget-chat { position: absolute; top: 230px; right: 20px; width: 190px; z-index: 5; }
        #subjects-screen .bubble-bg { background: #fff; opacity: 0.5; border-radius: 16px; padding: 16px; position: absolute; top: -5px; right: -5px; width: 100%; height: 100%; transform: rotate(3deg); }
        #subjects-screen .bubble-main { background: var(--accent-green); border-radius: 16px 16px 4px 16px; padding: 14px; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.05); color: #1a331a; font-size: 12px; line-height: 1.4; font-weight: 500; }
        #subjects-screen .bubble-main::before { content: '“'; font-family: var(--font-serif-en); font-size: 24px; position: absolute; top: 0px; left: 4px; opacity: 0.2; }

        #subjects-screen .widget-time { position: absolute; top: 310px; left: 20px; width: 140px; }
        #subjects-screen .time-big { font-size: 28px; font-weight: 900; letter-spacing: -1px; line-height: 1; margin-bottom: 4px;}
        #subjects-screen .time-big span { font-size: 12px; font-weight: 500; color: var(--text-gray); }
        #subjects-screen .line-chart { width: 100%; height: 30px; margin-top: 8px;}

        #subjects-screen .widget-notes { position: absolute; top: 360px; right: 20px; width: 190px; background: transparent; z-index: 10; cursor: pointer; transition: transform 0.2s; }
        #subjects-screen .widget-notes:active { transform: scale(0.97); }
        #subjects-screen .notes-paper { background: #fdfaf0; padding: 16px 16px 20px 24px; border-radius: 2px; box-shadow: 2px 4px 15px rgba(0,0,0,0.05); transform: rotate(-2deg); position: relative; border-left: 1px solid #ddd; }
        #subjects-screen .notes-paper::before { content: ''; position: absolute; top: 0; left: 8px; width: 1px; height: 100%; background: #e8cca7; opacity: 0.5; }
        #subjects-screen .handwriting { font-family: var(--font-hand); font-size: 20px; color: #333; line-height: 1.1; }

        #subjects-screen .widget-cart { position: absolute; top: 450px; left: 20px; width: 175px; background: #fff; padding: 12px 14px; box-shadow: 0 6px 15px rgba(0,0,0,0.05); transform: rotate(2deg); display: flex; align-items: center; z-index: 10; border-radius: 2px; border: 1px solid #f0f0f0; border-right: 1px dashed #ccc; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
        #subjects-screen .widget-cart:active { transform: rotate(2deg) scale(0.95); box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        #subjects-screen .widget-cart::before { content: ''; position: absolute; left: -5px; top: 50%; transform: translateY(-50%); width: 10px; height: 10px; background: var(--bg-light); border-radius: 50%; box-shadow: inset -2px 0 3px rgba(0,0,0,0.03); }
        #subjects-screen .widget-cart::after { content: ''; position: absolute; right: -5px; top: 50%; transform: translateY(-50%); width: 10px; height: 10px; background: var(--bg-light); border-radius: 50%; box-shadow: inset 2px 0 3px rgba(0,0,0,0.03); }
        #subjects-screen .cart-left { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        #subjects-screen .cart-desc { font-size: 8px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        #subjects-screen .cart-price { font-family: var(--font-serif-en); font-size: 22px; font-weight: 900; line-height: 1; color: var(--text-dark); margin-top: 2px; }
        #subjects-screen .cart-divider { width: 1px; height: 35px; border-left: 1px dashed #ddd; margin: 0 10px; }
        #subjects-screen .cart-right { display: flex; flex-direction: column; align-items: center; gap: 4px; padding-right: 4px;}
        #subjects-screen .stamp-paid { font-size: 7px; font-weight: 900; color: var(--accent-pink); border: 1px solid var(--accent-pink); padding: 1px 3px; border-radius: 2px; transform: rotate(-10deg); letter-spacing: 0.5px; }
        #subjects-screen .barcode-small { font-family: 'Libre Barcode 39 Extended Text', cursive; font-size: 26px; opacity: 0.4; line-height: 0.5; margin-top: 4px; }

       /* 将 top 改为 540px 让它下移，right 改为 20px 让它稍微靠右 */
#subjects-screen .sticker-group { position: absolute; top: 540px; right: 20px; display: flex; flex-direction: column; gap: 16px; z-index: 15; }
        #subjects-screen .dymo-label { background: #181818; color: #fff; font-family: var(--font-sans); font-weight: 800; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; padding: 6px 12px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 2px 2px 0px rgba(0,0,0,0.2); cursor: pointer; transition: transform 0.2s;}
        #subjects-screen .dymo-label:active { transform: scale(0.95); }
        #subjects-screen .dymo-label::before, #subjects-screen .dymo-label::after { content: ''; position: absolute; width: 4px; height: 100%; background: transparent; border-left: 2px dotted var(--bg-light); top: 0; }
        #subjects-screen .dymo-label::before { left: -2px; }
        #subjects-screen .dymo-label::after { right: -2px; }
        #subjects-screen .dymo-1 { transform: rotate(-4deg); align-self: flex-end; }
        #subjects-screen .dymo-2 { transform: rotate(3deg); margin-right: 15px; }

        #subjects-screen .widget-editorial-pet { position: absolute; top: 590px; left: 20px; width: calc(100% - 40px); background: #ffffff; border: 1px solid #eaeaea; padding: 24px; box-shadow: 0 15px 40px rgba(0,0,0,0.06); border-radius: 2px; overflow: hidden; z-index: 10; cursor: pointer; transition: transform 0.2s;}
        #subjects-screen .widget-editorial-pet:active { transform: scale(0.98); }
        #subjects-screen .tape-black { position: absolute; top: -8px; left: 30px; width: 45px; height: 18px; background: #222; transform: rotate(-3deg); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        #subjects-screen .ed-top-info { display: flex; justify-content: space-between; font-size: 8px; font-weight: 800; letter-spacing: 2px; color: #888; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 16px; }
        #subjects-screen .ed-title-en { font-family: var(--font-serif-en); font-size: 38px; font-weight: 900; line-height: 0.9; color: #111; letter-spacing: -1px; }
        #subjects-screen .ed-title-en i { font-weight: 600; color: #666; }
        #subjects-screen .ed-title-cn { font-family: var(--font-serif-cn); font-size: 14px; font-weight: 700; color: #555; margin-top: 4px; letter-spacing: 1px; }
        #subjects-screen .ed-content-box { position: relative; margin-top: 24px; min-height: 120px; }
        #subjects-screen .ed-art-img { position: absolute; right: -20px; bottom: 0px; width: 90px; height: 90px; border-radius: 50%; object-fit: cover; mix-blend-mode: multiply; opacity: 0.8; pointer-events: none; }
        #subjects-screen .ed-star-sticker { position: absolute; right: 45px; top: 0px; font-size: 28px; color: var(--accent-pink); transform: rotate(15deg); text-shadow: 2px 2px 0 rgba(0,0,0,0.1); }
        #subjects-screen .ed-text-row { margin-bottom: 12px; position: relative; z-index: 2; width: 75%; }
        #subjects-screen .ed-label { display: inline-block; font-size: 8px; font-weight: 800; background: #111; color: #fff; padding: 2px 6px; border-radius: 2px; margin-right: 6px; vertical-align: top; margin-top: 2px; }
        #subjects-screen .ed-value { display: inline-block; width: calc(100% - 60px); font-size: 11px; color: #333; line-height: 1.6; }
        #subjects-screen .ed-value.highlight { font-family: var(--font-serif-cn); font-size: 13px; font-weight: 900; font-style: italic; color: #111; }

        @keyframes ph-spin { 100% { transform: rotate(360deg); } }
        @keyframes ph-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        /* ================= 视图 2：详情 小票页 Receipt ================= */
        #subjects-screen #view-receipt { color: #fff; font-family: var(--font-mono); background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E"); }

        #subjects-screen .receipt-container { width: 100%; max-width: 430px; position: relative; padding-bottom: 80px; }
        #subjects-screen .receipt-header { padding: calc(env(safe-area-inset-top, 20px) + 20px) 20px 0; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; mix-blend-mode: difference; }
        #subjects-screen .receipt-btn-back { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #fff; font-family: var(--font-sans); cursor: pointer; }

        #subjects-screen .printer-slot { position: absolute; top: 0; left: 0; width: 100%; height: 60px; background: linear-gradient(to bottom, var(--bg-dark) 40%, transparent 100%); z-index: 50; pointer-events: none; }
        #subjects-screen .receipt-wrapper { width: 88%; margin: 60px auto 40px; position: relative; transform: translateY(-120%); opacity: 0;}
        #subjects-screen .animate-print { animation: printOut 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; animation-delay: 0.1s; }
        @keyframes printOut { 0% { transform: translateY(-120%); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }

        #subjects-screen .receipt-paper { background-color: var(--paper-color); color: var(--ink-color); padding: 40px 20px 50px; position: relative; box-shadow: 0 30px 60px rgba(0,0,0,0.6); background-image: linear-gradient(90deg, rgba(0,0,0,0.01) 0%, transparent 10%, transparent 90%, rgba(0,0,0,0.02) 100%); }
        #subjects-screen .receipt-tape-top { position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(1deg); width: 80px; height: 20px; background: #111; box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 10; }
        #subjects-screen .receipt-paper::after { content: ""; position: absolute; bottom: -8px; left: 0; right: 0; height: 8px; background-size: 16px 16px; background-image: linear-gradient(135deg, var(--paper-color) 25%, transparent 25%), linear-gradient(-135deg, var(--paper-color) 25%, transparent 25%); background-position: 0 0; }

        #subjects-screen .r-header { text-align: center; margin-bottom: 24px; }
        #subjects-screen .r-logo { font-family: var(--font-serif-en); font-size: 28px; font-weight: 900; line-height: 1; letter-spacing: -1px; margin-bottom: 6px; text-transform: uppercase; }
        #subjects-screen .r-sub-logo { font-size: 10px; letter-spacing: 2px; color: var(--ink-faded); }
        #subjects-screen .r-meta { font-size: 10px; display: flex; justify-content: space-between; border-bottom: 1px dashed var(--ink-faded); padding-bottom: 10px; margin-bottom: 20px; line-height: 1.5; }
        #subjects-screen .r-divider { text-align: center; letter-spacing: 2px; color: var(--ink-faded); font-size: 12px; margin: 16px 0; overflow: hidden; white-space: nowrap; }
        #subjects-screen .r-divider::before { content: "------------------------------------------------"; }

        #subjects-screen .item-group { margin-bottom: 16px; position: relative; }
        #subjects-screen .item-row { display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; font-weight: 700; }
        #subjects-screen .item-cn { font-family: var(--font-serif-cn); font-size: 15px; font-weight: 900; color: var(--ink-color); margin: 4px 0 2px; line-height: 1.3; max-width: 80%; }
        #subjects-screen .item-status { font-size: 9px; color: var(--ink-faded); text-transform: uppercase; letter-spacing: 1px; }
        #subjects-screen .status-badge { display: inline-block; border: 1px solid var(--ink-color); padding: 1px 4px; border-radius: 2px; font-weight: 700; }
        #subjects-screen .status-badge.abandon { border-color: var(--ink-faded); color: var(--ink-faded); text-decoration: line-through; }

        #subjects-screen .r-total-section { margin-top: 30px; }
        #subjects-screen .total-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
        #subjects-screen .total-grand { display: flex; justify-content: space-between; align-items: flex-end; font-size: 14px; font-weight: 700; border-top: 2px solid var(--ink-color); padding-top: 10px; margin-top: 10px; }
        #subjects-screen .total-grand span:last-child { font-size: 24px; letter-spacing: -1px; }

        #subjects-screen .r-barcode-section { text-align: center; margin-top: 30px; }
        #subjects-screen .barcode-font { font-family: 'Libre Barcode 39 Extended Text', cursive; font-size: 48px; line-height: 0.6; color: var(--ink-color); }
        #subjects-screen .barcode-text { font-size: 9px; letter-spacing: 4px; margin-top: 12px; }

        #subjects-screen .stamp-red { position: absolute; top: 200px; right: -10px; font-family: var(--font-serif-en); font-size: 22px; font-weight: 900; color: var(--stamp-red); border: 2px solid var(--stamp-red); padding: 4px 10px; transform: rotate(-15deg); opacity: 0.8; pointer-events: none; mix-blend-mode: multiply; }
        #subjects-screen .handwriting-note { font-family: var(--font-hand); font-size: 22px; color: var(--stamp-red); transform: rotate(-5deg); z-index: 10; text-shadow: 1px 1px 0 rgba(255,255,255,0.5); }
        #subjects-screen .hw-1 { top: 380px; left: 10px; transform: rotate(-8deg); }
        #subjects-screen .hw-2 { position: relative; display: block; font-size: 18px; transform: rotate(2deg); white-space: normal; max-width: 95%; margin: 20px auto 10px; text-align: center; line-height: 1.3; word-wrap: break-word; }
        #subjects-screen .hw-circle { position: absolute; top: 345px; left: -10px; width: 140px; height: 35px; border: 1.5px solid var(--stamp-red); border-radius: 50%; transform: rotate(-3deg); pointer-events: none; }

        #subjects-screen .pinned-photo { position: absolute; top: 70px; left: -12px; width: 85px; height: 105px; background: #fff; padding: 4px 4px 16px; transform: rotate(-8deg); box-shadow: 0 10px 20px rgba(0,0,0,0.3); z-index: 20; border: 1px solid #eee; transition: transform 0.3s ease; }
        #subjects-screen .pinned-photo:active { transform: rotate(-12deg) scale(1.05); z-index: 30;}
        #subjects-screen .p-img { width: 100%; height: 100%; object-fit: cover; }
        #subjects-screen .paperclip { position: absolute; top: -12px; left: 15px; width: 12px; height: 35px; border: 2px solid #888; border-radius: 10px; transform: rotate(15deg); box-shadow: 2px 2px 2px rgba(0,0,0,0.2); z-index: 21; }
        #subjects-screen .paperclip::after { content: ''; position: absolute; top: 4px; left: 1px; width: 4px; height: 18px; border: 2px solid #888; border-top: none; border-radius: 0 0 4px 4px; }
        #subjects-screen .side-editorial { position: fixed; left: 10px; top: 50%; transform: translateY(-50%) rotate(-180deg); writing-mode: vertical-rl; font-family: var(--font-sans); font-size: 8px; font-weight: 800; letter-spacing: 4px; color: rgba(255,255,255,0.2); text-transform: uppercase; }

        /* ================= 视图 3：浏览器日志 Browser Logs ================= */
        #subjects-screen #view-browser-logs { color: var(--text-main); font-family: var(--font-sans); background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E"); }

        #subjects-screen .bg-typography { position: absolute; top: 15%; left: -10%; font-family: var(--font-serif-en); font-size: 160px; font-weight: 700; line-height: 0.8; color: transparent; -webkit-text-stroke: 1px rgba(255,255,255,0.03); pointer-events: none; z-index: 0; text-transform: uppercase; }
        #subjects-screen .bg-typography span { display: block; margin-left: 20%; font-style: italic;}
        #subjects-screen .bg-curves { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
        #subjects-screen .thin-line { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 0.8; }

        #subjects-screen .header { padding: calc(env(safe-area-inset-top, 20px) + 10px) 20px 20px; position: relative; z-index: 10; display: flex; flex-direction: column; gap: 20px; }
        #subjects-screen .top-nav { display: flex; justify-content: space-between; align-items: center; width: 100%; } 
        #subjects-screen .btn-back { display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: var(--text-main); text-decoration: none; cursor:pointer; }
        #subjects-screen .header-stars { color: var(--text-muted); font-size: 16px; letter-spacing: 4px;}

        #subjects-screen .ghost-search-bar { width: 100%; border: 1px solid var(--line-color); border-radius: 40px; padding: 12px 20px; display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); }
        #subjects-screen .search-icon { font-size: 14px; color: var(--text-muted); }
        #subjects-screen .typewriter-text { font-family: var(--font-serif-cn); font-size: 12px; color: var(--text-main); white-space: nowrap; overflow: hidden; border-right: 1px solid var(--text-main); animation: typing 4s steps(30, end) infinite, blink 0.75s step-end infinite; }

        @keyframes typing { 0%, 20% { width: 0; } 50%, 80% { width: 100%; } 100% { width: 0; } }
        @keyframes blink { from, to { border-color: transparent } 50% { border-color: var(--text-main); } }

        #subjects-screen .page-title { padding: 20px; position: relative; z-index: 10; }
        #subjects-screen .t-en { font-family: var(--font-serif-en); font-size: 42px; font-weight: 400; line-height: 1; letter-spacing: -1px; text-transform: capitalize; }
        #subjects-screen .t-en i { font-style: italic; color: #888; }
        #subjects-screen .t-cn { font-family: var(--font-serif-cn); font-size: 10px; letter-spacing: 4px; color: var(--text-muted); margin-top: 12px; text-transform: uppercase; }

        #subjects-screen .list-container { padding: 0 20px; position: relative; z-index: 10; display: flex; flex-direction: column; gap: 30px; margin-top: 20px; }
        #subjects-screen .log-item { display: flex; gap: 16px; cursor: pointer; position: relative; transition: opacity 0.3s; }
        #subjects-screen .log-item:active { opacity: 0.5; }
        #subjects-screen .log-item::before { content: ''; position: absolute; top: -15px; left: 0; width: 100%; height: 1px; background: linear-gradient(90deg, var(--line-color) 0%, transparent 100%); }
        #subjects-screen .log-number { font-family: var(--font-serif-en); font-style: italic; font-size: 32px; font-weight: 400; color: #555; line-height: 0.8; width: 45px; }
        #subjects-screen .log-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        #subjects-screen .log-query { font-family: var(--font-serif-cn); font-size: 16px; font-weight: 600; line-height: 1.4; color: var(--text-main); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        #subjects-screen .log-meta { display: flex; justify-content: space-between; align-items: center; font-size: 9px; font-family: var(--font-sans); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
        #subjects-screen .btn-view { border: 1px solid var(--text-muted); padding: 2px 8px; border-radius: 20px; color: var(--text-main); }

        /* 详情拉页 (Modal) */
        #subjects-screen .detail-modal { position: fixed; top: 100%; left: 0; width: 100%; height: 100%; background: rgba(5,5,5,0.7); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 1000; display: flex; flex-direction: column; justify-content: flex-end; transition: top 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); align-items: center; }
        #subjects-screen .detail-modal.active { top: 0; }
        #subjects-screen .btn-close-modal { position: absolute; top: calc(env(safe-area-inset-top, 20px) + 20px); right: 20px; width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: center; align-items: center; color: #fff; cursor: pointer; z-index: 1010; }
        #subjects-screen .modal-content-card { background: #0a0a0a; max-height: 85vh; height: auto; border-top-left-radius: 30px; border-top-right-radius: 30px; border-top: 1px solid rgba(255,255,255,0.1); padding: 40px 30px; position: relative; overflow-y: auto; overflow-x: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05); width: 100%; max-width: 430px; margin-top: auto; }
        #subjects-screen .modal-star { position: absolute; top: 30px; left: 30px; color: var(--text-muted); font-size: 24px; }
        #subjects-screen .m-section-query { margin-top: 40px; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 24px; margin-bottom: 24px; }
        #subjects-screen .m-label { font-size: 9px; font-weight: 800; letter-spacing: 2px; color: #777; text-transform: uppercase; margin-bottom: 10px; }
        #subjects-screen .m-query-text { font-family: var(--font-serif-cn); font-size: 24px; font-weight: 900; line-height: 1.3; letter-spacing: 1px; color: #fff; }
        #subjects-screen .m-section-os { position: relative; width: 100%; display: flex; flex-direction: column; }
        #subjects-screen .m-sys-box { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 16px 16px 24px 16px; margin-bottom: 10px; }
        #subjects-screen .m-sys-result { font-family: var(--font-sans); font-size: 12px; line-height: 1.6; color: #d0d0d0; }
        #subjects-screen .m-handwriting-os { position: relative; display: block; width: 100%; box-sizing: border-box; margin-top: -20px; margin-left: 5px; padding-right: 15px; font-family: var(--font-hand-cn); font-size: 26px; color: #f0f0f0; line-height: 1.3; transform: rotate(-2deg); text-shadow: 2px 2px 10px rgba(0,0,0,0.8); word-wrap: break-word; white-space: normal; z-index: 2; }
        #subjects-screen .m-handwriting-os span.en { font-family: var(--font-hand-en); font-size: 30px; }
        #subjects-screen .m-footer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 50px; font-size: 8px; color: var(--text-muted); letter-spacing: 2px; text-transform: uppercase; }

        /* ================= 视图 4：音乐解析 Music (Audio Vibe) ================= */
        #subjects-screen #view-music {
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
            color: #f0f0f0; font-family: var(--font-sans);
        }
        #subjects-screen #view-music .music-container { width: 100%; max-width: 430px; position: relative; min-height: 100%; padding-bottom: 80px; }

        /* 音乐顶部区域 */
        #subjects-screen #view-music .music-header { padding: calc(env(safe-area-inset-top, 20px) + 20px) 20px 10px; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 10; }
        #subjects-screen #view-music .music-btn-back { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #f0f0f0; text-decoration: none; cursor:pointer; }
        #subjects-screen #view-music .music-meta-text { font-size: 9px; font-family: var(--font-mono); color: #666666; letter-spacing: 1px; }

        #subjects-screen #view-music .music-page-title { padding: 10px 20px 30px; text-align: center; }
        #subjects-screen #view-music .m-title-en { font-family: var(--font-serif-en); font-size: 38px; font-weight: 800; line-height: 1; letter-spacing: -1px; text-transform: uppercase; }
        #subjects-screen #view-music .m-title-cn { font-family: var(--font-serif-cn); font-size: 10px; color: #666666; margin-top: 8px; letter-spacing: 4px; }
        #subjects-screen #view-music .m-title-stars { color: #cc2936; font-size: 14px; margin-top: 4px; }

        /* 音乐主播放器 */
        #subjects-screen #view-music .player-section { padding: 0 20px; position: relative; z-index: 5; }
        #subjects-screen #view-music .player-card {
            background: #151515; border-radius: 20px; padding: 30px 20px; position: relative;
            border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 20px 40px rgba(0,0,0,0.8);
            mask-image: radial-gradient(circle at 0% 50%, transparent 15px, black 16px), radial-gradient(circle at 100% 50%, transparent 15px, black 16px);
            mask-size: 51% 100%; mask-repeat: no-repeat; mask-position: left top, right top;
            -webkit-mask-image: radial-gradient(circle at 0% 50%, transparent 15px, black 16px), radial-gradient(circle at 100% 50%, transparent 15px, black 16px);
            -webkit-mask-size: 51% 100%; -webkit-mask-repeat: no-repeat; -webkit-mask-position: left top, right top;
        }
        #subjects-screen #view-music .card-top-line { position: absolute; top: 10px; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); }

        #subjects-screen #view-music .album-art-module { display: flex; justify-content: center; align-items: center; height: 160px; position: relative; margin-bottom: 30px; }
        
        #subjects-screen #view-music .css-vinyl {
            width: 140px; height: 140px; border-radius: 50%;
            background: repeating-radial-gradient(#111 0px, #111 2px, #181818 3px, #111 4px);
            position: absolute; right: 40px; 
            box-shadow: 0 0 20px rgba(0,0,0,0.5), inset 0 0 10px rgba(255,255,255,0.05);
            display: flex; justify-content: center; align-items: center; animation: ph-m-spin 4s linear infinite;
        }
        #subjects-screen #view-music .css-vinyl::before {
            content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 50%;
            background: conic-gradient(transparent 0deg, rgba(255,255,255,0.1) 45deg, transparent 90deg, transparent 180deg, rgba(255,255,255,0.1) 225deg, transparent 270deg);
        }
        #subjects-screen #view-music .vinyl-label { width: 50px; height: 50px; border-radius: 50%; background: #ddd; z-index: 2; position: relative; display: flex; justify-content: center; align-items: center; border: 2px solid #333; }
        #subjects-screen #view-music .vinyl-label::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #080808; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5); }

        #subjects-screen #view-music .css-sleeve {
            width: 140px; height: 140px; background: linear-gradient(135deg, #2a2a2a, #0a0a0a);
            position: absolute; left: 50px; z-index: 5; border-radius: 4px;
            box-shadow: 10px 0 20px rgba(0,0,0,0.6), inset 1px 1px 0 rgba(255,255,255,0.1);
            overflow: hidden; display: flex; justify-content: center; align-items: center;
        }
        #subjects-screen #view-music .sleeve-text {
            font-family: var(--font-serif-en); font-size: 80px; font-weight: 900;
            color: rgba(255,255,255,0.05); line-height: 0.8; letter-spacing: -5px;
            text-transform: uppercase; word-wrap: break-word; text-align: center;
            background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.1));
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }

        @keyframes ph-m-spin { 100% { transform: rotate(360deg); } }

        #subjects-screen #view-music .track-info-area { text-align: center; position: relative; }
        #subjects-screen #view-music .track-name { font-family: var(--font-serif-en); font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 4px; transition: opacity 0.3s;}
        #subjects-screen #view-music .track-artist { font-size: 10px; font-family: var(--font-mono); color: #666666; text-transform: uppercase; letter-spacing: 2px; }

        #subjects-screen #view-music .vibe-waveform {
            width: 100%; height: 40px; margin-top: 20px;
            display: flex; align-items: center; justify-content: center; gap: 4px;
        }
        #subjects-screen #view-music .wave-bar { width: 2px; background: #666666; border-radius: 2px; height: 4px; transition: height 0.2s, background 0.3s; }
        #subjects-screen #view-music .vibe-waveform.active .wave-bar { background: #cc2936; animation: ph-m-heartbeat 0.8s infinite alternate; }
        #subjects-screen #view-music .vibe-waveform.active .wave-bar:nth-child(2n) { animation-delay: 0.2s; }
        #subjects-screen #view-music .vibe-waveform.active .wave-bar:nth-child(3n) { animation-delay: 0.4s; }

        @keyframes ph-m-heartbeat { 0% { height: 4px; } 100% { height: 30px; } }

        #subjects-screen #view-music .player-status {
            margin-top: 20px; padding-top: 16px; border-top: 1px dashed rgba(255,255,255,0.1);
            display: flex; justify-content: space-between; align-items: center; 
            font-family: var(--font-mono); font-size: 9px; color: #666666; min-height: 48px;
        }
        #subjects-screen #view-music .status-label { flex-shrink: 0; }
        #subjects-screen #view-music .status-pill {
            background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 10px; 
            color: #f0f0f0; font-weight: 700; flex-shrink: 0; font-family: var(--font-sans);
        }
        #subjects-screen #view-music .track-os-inline {
            flex: 1; padding: 0 12px; font-family: var(--font-serif-cn); font-size: 11px;
            color: #cc2936; text-align: right; line-height: 1.4; opacity: 0; transition: opacity 0.5s ease;
            text-transform: none; letter-spacing: 0; display: -webkit-box; -webkit-line-clamp: 2;
            -webkit-box-orient: vertical; overflow: hidden;
        }
        #subjects-screen #view-music .track-os-inline.active { opacity: 1; }

        /* 音乐情绪列表 */
        #subjects-screen #view-music .playlist-section { padding: 30px 20px; }
        #subjects-screen #view-music .playlist-title {
            font-size: 8px; font-family: var(--font-mono); color: #666666;
            letter-spacing: 2px; text-transform: uppercase; margin-bottom: 20px;
            display: flex; align-items: center; gap: 8px;
        }
        #subjects-screen #view-music .playlist-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.1); }

        #subjects-screen #view-music .track-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
            cursor: pointer; transition: opacity 0.3s;
        }
        #subjects-screen #view-music .track-item:active { opacity: 0.5; }
        #subjects-screen #view-music .t-left { display: flex; flex-direction: column; gap: 4px; }
        #subjects-screen #view-music .t-name { font-family: var(--font-serif-en); font-size: 16px; font-weight: 600; color: #fff; }
        #subjects-screen #view-music .t-artist { font-size: 9px; font-family: var(--font-mono); color: #666; text-transform: uppercase; letter-spacing: 1px; }
        
        #subjects-screen #view-music .t-right { display: flex; align-items: center; gap: 12px; }
        #subjects-screen #view-music .mood-tag { font-family: var(--font-serif-cn); font-size: 10px; font-weight: 700; color: #aaa; border: 1px solid #333; padding: 2px 8px; border-radius: 2px; }
        #subjects-screen #view-music .playing-indicator { width: 12px; height: 12px; border-radius: 50%; background: transparent; border: 2px solid #cc2936; display: none; }
        #subjects-screen #view-music .track-item.active .playing-indicator { display: block; }
        #subjects-screen #view-music .track-item.active .t-name { color: #cc2936; }

        /* ================= 视图 5：通讯拦截 (Intercept) ================= */
        #subjects-screen #view-intercept-list,
        #subjects-screen #view-intercept-detail { background-color: #f4f4f5; color: #111111; }
        
        #subjects-screen .ic-app-container { width: 100%; max-width: 430px; margin: 0 auto; position: relative; min-height: 100vh; overflow-x: hidden; padding-bottom: 20px; }
        #subjects-screen #view-intercept-detail .ic-app-container { height: 100%; padding-bottom: 0; }
        #subjects-screen #view-intercept-list .btn-back, #subjects-screen #view-intercept-detail .btn-back { color: #111111; }
        #subjects-screen .ic-header { padding: calc(env(safe-area-inset-top, 20px) + 20px) 20px 20px; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 10; }
        #subjects-screen .ic-meta-text { font-size: 9px; font-family: var(--font-serif-en); font-style: italic; color: #888888; letter-spacing: 1px;}
        #subjects-screen .ic-page-title-box { padding: 10px 20px 30px; border-bottom: 1px solid rgba(0,0,0,0.05); }
        #subjects-screen .ic-title-en { font-family: var(--font-serif-en); font-size: 46px; font-weight: 800; line-height: 0.9; letter-spacing: -2px; text-transform: uppercase; }
        #subjects-screen .ic-title-en span { color: #888888; font-style: italic; font-weight: 400; }
        #subjects-screen .ic-title-cn { font-family: var(--font-serif-cn); font-size: 11px; font-weight: 700; color: #111111; margin-top: 12px; letter-spacing: 2px; }

        #subjects-screen .ic-chat-list { padding: 30px 20px; display: flex; flex-direction: column; gap: 24px; }
        #subjects-screen .ic-chat-card { display: flex; align-items: center; gap: 16px; background: #fff; padding: 16px; border-radius: 2px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); cursor: pointer; position: relative; transition: transform 0.2s, box-shadow 0.2s; border-left: 2px solid transparent; }
        #subjects-screen .ic-chat-card:active { transform: scale(0.98); }
        #subjects-screen .ic-chat-card.group { border-left-color: #111111; } 
        #subjects-screen .ic-avatar-box { width: 54px; height: 54px; flex-shrink: 0; background: #eee; border-radius: 50%; overflow: hidden; filter: grayscale(100%) contrast(1.2); }
        #subjects-screen .ic-avatar-box img { width: 100%; height: 100%; object-fit: cover; }
        #subjects-screen .ic-chat-info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
        #subjects-screen .ic-chat-name { font-family: var(--font-serif-en); font-size: 18px; font-weight: 800; letter-spacing: -0.5px; display: flex; justify-content: space-between; align-items: baseline; }
        #subjects-screen .ic-chat-name .time { font-family: var(--font-sans); font-size: 9px; font-weight: 400; color: #888888; letter-spacing: 0; }
        #subjects-screen .ic-chat-preview { font-size: 12px; color: #888888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-serif-cn); }
        #subjects-screen .ic-chat-type { position: absolute; top: -8px; right: 10px; background: #111; color: #fff; font-size: 8px; padding: 2px 6px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }

        /* 详情页特有样式 */
        #subjects-screen .ic-cd-header { padding: calc(env(safe-area-inset-top, 20px) + 10px) 20px 20px; background: rgba(244,244,245,0.8); backdrop-filter: blur(10px); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); position: sticky; top: 0; z-index: 20; }
        #subjects-screen .ic-cd-title { font-family: var(--font-serif-en); font-size: 16px; font-weight: 800; display: flex; flex-direction: column; line-height: 1.1;}
        #subjects-screen .ic-cd-title span { font-family: var(--font-sans); font-size: 8px; color: #888888; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;}
        #subjects-screen .ic-decode-switch-wrapper { display: flex; align-items: center; gap: 8px; }
        #subjects-screen .ic-decode-label { font-size: 9px; font-weight: 800; letter-spacing: 1px; color: #111111; transition: color 0.3s; }
        #subjects-screen .ic-decode-label.active { color: #d32f2f; }
        #subjects-screen .ic-switch { position: relative; display: inline-block; width: 36px; height: 18px; }
        #subjects-screen .ic-switch input { opacity: 0; width: 0; height: 0; }
        #subjects-screen .ic-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ddd; transition: .4s; border-radius: 20px; }
        #subjects-screen .ic-slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        #subjects-screen .ic-switch input:checked + .ic-slider { background-color: #d32f2f; }
        #subjects-screen .ic-switch input:checked + .ic-slider:before { transform: translateX(18px); }

        #subjects-screen .ic-chat-flow { flex: 1; padding: 20px; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 20px; }
        #subjects-screen .ic-msg-wrapper { display: flex; flex-direction: column; position: relative; width: 100%; }
        #subjects-screen .ic-msg-wrapper.left { align-items: flex-start; }
        #subjects-screen .ic-msg-wrapper.right { align-items: flex-end; }
        #subjects-screen .ic-msg-meta { font-size: 8px; color: #aaa; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
        #subjects-screen .ic-bubble { max-width: 80%; padding: 12px 16px; font-size: 13px; line-height: 1.5; position: relative; font-family: var(--font-serif-cn); font-weight: 600; transition: opacity 0.3s, filter 0.3s; }
        #subjects-screen .ic-bubble.left { background: #fff; color: #111111; border-radius: 12px 12px 12px 2px; box-shadow: 2px 4px 15px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.02); }
        #subjects-screen .ic-bubble.right { background: #111111; color: #fff; border-radius: 12px 12px 2px 12px; box-shadow: -2px 4px 15px rgba(0,0,0,0.08); }

        /* OS 批注样式 */
        #subjects-screen .ic-inner-os { position: absolute; font-family: var(--font-hand-cn); color: #d32f2f; font-size: 24px; line-height: 1.2; white-space: normal; word-wrap: break-word; width: 90%; max-width: 300px; pointer-events: none; opacity: 0; transform: scale(0.9) rotate(0deg); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 10; text-shadow: 1px 1px 0px #f4f4f5, -1px -1px 0px #f4f4f5, 2px 2px 5px rgba(0,0,0,0.1); }
        #subjects-screen .ic-inner-os.en { font-family: var(--font-hand-en); font-size: 26px; }

        /* Decode Mode 启用状态 */
        #subjects-screen #view-intercept-detail.decode-mode .ic-inner-os { opacity: 1; transform: scale(1) rotate(auto); }
        #subjects-screen #view-intercept-detail.decode-mode .ic-bubble { opacity: 0.4; filter: grayscale(100%); } 
        #subjects-screen #view-intercept-detail.decode-mode .ic-msg-wrapper.right .ic-bubble { opacity: 0.6; } 

        #subjects-screen .ic-os-1 { top: -20px; left: 5%; transform: rotate(-3deg); text-align: left; }
        #subjects-screen #view-intercept-detail.decode-mode .ic-os-1 { transform: rotate(-5deg); }
        #subjects-screen .ic-os-2 { bottom: -25px; right: 5%; transform: rotate(2deg); text-align: right; }
        #subjects-screen #view-intercept-detail.decode-mode .ic-os-2 { transform: rotate(4deg); }
        #subjects-screen .ic-os-3 { top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-10deg); font-size: 40px; border: 2px solid #d32f2f; padding: 4px 10px; border-radius: 4px; width: auto; max-width: none;}
        #subjects-screen #view-intercept-detail.decode-mode .ic-os-3 { transform: translate(-50%, -50%) rotate(-15deg); }

        #subjects-screen .ic-scratch-out { text-decoration: line-through; text-decoration-color: rgba(255,255,255,0.4); text-decoration-thickness: 2px; color: #888; }
        #subjects-screen .ic-cd-footer { padding: 20px 20px calc(env(safe-area-inset-bottom, 20px) + 20px) 20px; background: #fff; border-top: 1px solid rgba(0,0,0,0.05); }
        #subjects-screen .ic-fake-input { width: 100%; background: #f0f0f0; border-radius: 20px; padding: 12px 16px; font-size: 12px; color: #aaa; display: flex; justify-content: space-between; align-items: center; }

        /* ================= 视图 7：时间碎片 (Time Fragments) ================= */
        #subjects-screen #view-time-fragments { background-color: #e9e4df; color: #3a3532; font-family: var(--font-sans); }
        
        #subjects-screen .tf-app-container { width: 100%; max-width: 430px; margin: 0 auto; position: relative; padding-bottom: calc(env(safe-area-inset-bottom, 20px) + 40px); overflow-x: hidden; min-height: 100vh; }
        
        #subjects-screen .tf-bg-text-large { position: absolute; top: 120px; left: -20px; font-family: var(--font-serif-en); font-size: 140px; font-weight: 900; color: #ffffff; opacity: 0.4; line-height: 0.8; pointer-events: none; z-index: 0; transform: rotate(-5deg); }
        
        #subjects-screen .tf-header { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 24px; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 10; }
        #subjects-screen .tf-btn-back { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #3a3532; text-decoration: none; background: #ffffff; padding: 8px 16px; border-radius: 30px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); cursor: pointer; transition: transform 0.2s; border: none; outline: none;}
        #subjects-screen .tf-btn-back:active { transform: scale(0.95); }
        #subjects-screen .tf-meta-text { font-size: 10px; font-weight: 700; color: #6b5e55; letter-spacing: 1px; text-transform: uppercase; }
        
        #subjects-screen .tf-hero-section { padding: 10px 24px 30px; position: relative; z-index: 10; }
        #subjects-screen .tf-hero-title { font-family: var(--font-serif-en); font-size: 48px; font-weight: 900; line-height: 0.9; letter-spacing: -1.5px; color: #3a3532; text-transform: capitalize; position: relative; }
        #subjects-screen .tf-hero-title i { font-style: italic; color: #8c7362; font-weight: 400; }
        #subjects-screen .tf-hero-subtitle { font-family: var(--font-serif-cn); font-size: 11px; color: #6b5e55; margin-top: 12px; letter-spacing: 2px; }
        
        #subjects-screen .tf-total-time { margin-top: 20px; display: inline-flex; align-items: baseline; gap: 4px; background: #3a3532; color: #ffffff; padding: 8px 16px; border-radius: 20px; }
        #subjects-screen .tf-total-time .num { font-size: 20px; font-weight: 800; line-height: 1; }
        #subjects-screen .tf-total-time .txt { font-size: 10px; font-weight: 500; letter-spacing: 1px; opacity: 0.8; }
        
        #subjects-screen .tf-scrapboard { position: relative; width: 100%; min-height: 660px; padding: 0 20px; z-index: 10; }
        
        #subjects-screen .tf-doodles { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
        #subjects-screen .tf-stroke-pen { fill: none; stroke: #6b5e55; stroke-width: 1.5; stroke-linecap: round; }
        #subjects-screen .tf-floating-heart { position: absolute; font-size: 32px; color: #ffffff; opacity: 0.8; z-index: 5; transform: rotate(15deg); }
        
        #subjects-screen .tf-flip-card-container { position: absolute; perspective: 1000px; cursor: pointer; z-index: 10; -webkit-tap-highlight-color: transparent;}
        
        #subjects-screen .tf-card-1 { top: 20px; left: 20px; width: 260px; height: 140px; transform: rotate(-3deg); }
        #subjects-screen .tf-card-2 { top: 160px; right: 20px; width: 220px; height: 160px; transform: rotate(4deg); }
        #subjects-screen .tf-card-3 { top: 320px; left: 10px; width: 200px; height: 180px; transform: rotate(-6deg); }
        #subjects-screen .tf-card-4 { top: 480px; right: 30px; width: 240px; height: 130px; transform: rotate(2deg); }
        
        #subjects-screen .tf-flip-card-inner { position: relative; width: 100%; height: 100%; text-align: left; transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1); transform-style: preserve-3d; box-shadow: 5px 15px 30px rgba(92, 84, 78, 0.15); border-radius: 16px; }
        
        #subjects-screen .tf-flip-card-container.flipped .tf-flip-card-inner { transform: rotateY(180deg); }
        #subjects-screen .tf-flip-card-container:active .tf-flip-card-inner { transform: scale(0.96); }
        #subjects-screen .tf-flip-card-container.flipped:active .tf-flip-card-inner { transform: rotateY(180deg) scale(0.96); }
        
        #subjects-screen .tf-flip-card-front, #subjects-screen .tf-flip-card-back { position: absolute; width: 100%; height: 100%; -webkit-backface-visibility: hidden; backface-visibility: hidden; border-radius: 16px; overflow: hidden; }
        
        #subjects-screen .tf-flip-card-front { background-color: #ffffff; padding: 16px 20px; display: flex; flex-direction: column; border: 1px solid rgba(0,0,0,0.03); }
        #subjects-screen .tf-fc-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 8px; margin-bottom: 12px; }
        #subjects-screen .tf-fc-app { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; color: #3a3532; letter-spacing: -0.5px; }
        #subjects-screen .tf-fc-app i { font-size: 18px; color: #8c7362; }
        #subjects-screen .tf-fc-time { font-family: var(--font-serif-en); font-size: 24px; font-weight: 800; color: #3a3532; line-height: 1; }
        #subjects-screen .tf-fc-reason { font-family: var(--font-serif-cn); font-size: 12px; color: #6b5e55; line-height: 1.5; flex: 1; }
        #subjects-screen .tf-fc-hint { align-self: flex-end; font-size: 9px; font-weight: 800; color: #a39990; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 4px; margin-top: 8px;}
        #subjects-screen .tf-fc-hint i { animation: tf-bounceX 1.5s infinite; }
        
        @keyframes tf-bounceX { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
        
        #subjects-screen .tf-flip-card-back { background-color: #f5f2eb; transform: rotateY(180deg); padding: 20px 24px; display: flex; flex-direction: column; justify-content: center; background-image: linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px); background-size: 100% 24px; }
        
        #subjects-screen .tf-fc-truth { font-family: var(--font-serif-cn); font-size: 13px; color: #3a3532; line-height: 1.6; border-left: 2px solid #8c7362; padding-left: 10px; word-wrap: break-word; white-space: normal; }
        #subjects-screen .tf-fc-truth .en { font-family: var(--font-serif-en); font-style: italic; font-weight: 600; font-size: 14px; color: #8c7362; }
        
        #subjects-screen .tf-tape { position: absolute; top: -8px; left: 50%; transform: translateX(-50%) rotate(2deg); width: 40px; height: 16px; background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(2px); box-shadow: 0 1px 3px rgba(0,0,0,0.05); z-index: 10; }
        
        #subjects-screen .tf-pill-label { position: absolute; background: #3a3532; color: #ffffff; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 6px 12px; border-radius: 20px; z-index: 15; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        #subjects-screen .tf-pill-1 { top: 220px; left: 20px; transform: rotate(-10deg); background: #ffffff; color: #3a3532; }
        #subjects-screen .tf-pill-2 { top: 400px; right: 10px; transform: rotate(5deg); }
        
        #subjects-screen .tf-overlap-text { position: absolute; font-family: var(--font-serif-en); font-style: italic; font-size: 28px; color: #6b5e55; opacity: 0.4; z-index: 12; pointer-events: none; }
        #subjects-screen .tf-ot-1 { top: 120px; right: 20px; transform: rotate(-10deg); }
        #subjects-screen .tf-ot-2 { top: 460px; left: 20px; transform: rotate(5deg); }

        /* ================= 视图 8：备忘录 Notes ================= */
        #subjects-screen #view-notes {
            /* 局部变量映射，确保不污染外部 */
            --n-bg-color: #f8f8f9; --n-text-dark: #121212; --n-text-gray: #666666;
            --n-text-light: #aaaaaa; --n-line-color: rgba(0, 0, 0, 0.08);

            background-color: var(--n-bg-color); color: var(--n-text-dark);
            font-family: var(--font-sans);
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
        }

        #subjects-screen #view-notes .notes-container { width: 100%; max-width: 430px; position: relative; padding-bottom: 100px; margin: 0 auto; }
        #subjects-screen #view-notes .n-header { padding: calc(env(safe-area-inset-top, 20px) + 10px) 24px 24px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; background: linear-gradient(to bottom, var(--n-bg-color) 70%, transparent); }
        #subjects-screen #view-notes .n-btn-back { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--n-text-dark); text-decoration: none; cursor: pointer; }
        #subjects-screen #view-notes .n-meta-text { font-size: 9px; font-weight: 700; color: var(--n-text-gray); letter-spacing: 2px; }

        #subjects-screen #view-notes .hero-section { padding: 10px 24px 40px; position: relative; }
        #subjects-screen #view-notes .hero-title { font-family: var(--font-serif-en); font-size: 56px; font-weight: 900; line-height: 0.9; letter-spacing: -2px; color: var(--n-text-dark); text-transform: uppercase; border-bottom: 2px solid var(--n-text-dark); padding-bottom: 20px; margin-bottom: 16px; }
        #subjects-screen #view-notes .hero-title i { font-style: italic; font-weight: 400; color: var(--n-text-gray); }
        #subjects-screen #view-notes .hero-desc { font-family: var(--font-serif-cn); font-size: 11px; font-weight: 500; color: var(--n-text-gray); letter-spacing: 2px; text-transform: uppercase; }

        #subjects-screen #view-notes .module-section { padding: 0 24px 40px; position: relative; }
        #subjects-screen #view-notes .mod-header { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: var(--n-text-light); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        #subjects-screen #view-notes .mod-header::after { content: ''; flex: 1; height: 1px; background: var(--n-line-color); }

        #subjects-screen #view-notes .todo-list { display: flex; flex-direction: column; gap: 12px; }
        #subjects-screen #view-notes .todo-item { display: flex; align-items: flex-start; gap: 12px; font-family: var(--font-serif-cn); font-size: 14px; line-height: 1.5; color: var(--n-text-dark); }
        #subjects-screen #view-notes .checkbox { width: 14px; height: 14px; flex-shrink: 0; margin-top: 3px; border: 1px solid var(--n-text-gray); display: flex; justify-content: center; align-items: center; }
        #subjects-screen #view-notes .todo-item.checked .checkbox { background: var(--n-text-dark); border-color: var(--n-text-dark); }
        #subjects-screen #view-notes .todo-item.checked .checkbox::after { content: ''; width: 4px; height: 8px; border: solid #fff; border-width: 0 1px 1px 0; transform: rotate(45deg); margin-top: -2px; }
        #subjects-screen #view-notes .todo-item.checked .todo-text { color: var(--n-text-gray); }
        #subjects-screen #view-notes .todo-text { flex: 1; font-weight: 500; }
        #subjects-screen #view-notes .text-strike { text-decoration: line-through; color: var(--n-text-light); }
        #subjects-screen #view-notes .text-breakdown { font-family: var(--font-serif-en); font-style: italic; font-weight: 600; color: var(--n-text-dark); font-size: 15px; margin-top: 4px; display: block;}
        #subjects-screen #view-notes .text-breakdown.cn { font-family: var(--font-serif-cn); }

        #subjects-screen #view-notes .risk-assessment { background: #ffffff; border: 1px solid var(--n-line-color); padding: 24px 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.02); position: relative; }
        #subjects-screen #view-notes .risk-tag { position: absolute; top: -8px; left: 20px; background: var(--n-bg-color); padding: 0 8px; font-size: 8px; font-weight: 800; letter-spacing: 1px; color: var(--n-text-gray); }
        #subjects-screen #view-notes .risk-title { font-family: var(--font-serif-cn); font-size: 16px; font-weight: 900; line-height: 1.3; text-align: center; margin-bottom: 24px; padding: 0 10px; }
        #subjects-screen #view-notes .pros-cons-grid { display: grid; grid-template-columns: 1fr 1px 1fr; gap: 16px; border-bottom: 1px solid var(--n-line-color); padding-bottom: 20px; margin-bottom: 20px; }
        #subjects-screen #view-notes .pc-divider { background: var(--n-line-color); }
        #subjects-screen #view-notes .pc-col { display: flex; flex-direction: column; gap: 12px; }
        #subjects-screen #view-notes .pc-head { font-size: 9px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: var(--n-text-light); text-align: center; }
        #subjects-screen #view-notes .pc-item { font-family: var(--font-serif-cn); font-size: 12px; color: var(--n-text-gray); line-height: 1.5; text-align: center; }
        #subjects-screen #view-notes .risk-conclusion { font-family: var(--font-serif-cn); font-size: 13px; font-style: italic; font-weight: 700; text-align: center; color: var(--n-text-dark); position: relative; }
        #subjects-screen #view-notes .risk-conclusion::before { content: '“'; position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-family: var(--font-serif-en); font-size: 60px; color: var(--n-line-color); z-index: 0; line-height: 1; }
        #subjects-screen #view-notes .risk-conclusion span { position: relative; z-index: 1; }

        #subjects-screen #view-notes .dictionary-list { display: flex; flex-direction: column; }
        #subjects-screen #view-notes .dict-item { border-bottom: 1px solid var(--n-line-color); }
        #subjects-screen #view-notes .dict-header { padding: 20px 0; display: flex; justify-content: space-between; align-items: baseline; cursor: pointer; transition: opacity 0.3s; }
        #subjects-screen #view-notes .dict-header:active { opacity: 0.5; }
        #subjects-screen #view-notes .dh-left { display: flex; align-items: baseline; gap: 12px; }
        #subjects-screen #view-notes .dh-num { font-family: var(--font-serif-en); font-style: italic; font-size: 18px; font-weight: 600; color: var(--n-text-light); }
        #subjects-screen #view-notes .dh-title { font-family: var(--font-sans); font-size: 13px; font-weight: 800; letter-spacing: -0.5px; text-transform: uppercase; }
        #subjects-screen #view-notes .dh-icon { font-size: 12px; color: var(--n-text-light); transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
        #subjects-screen #view-notes .dict-content { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
        
        #subjects-screen #view-notes .dict-content-inner { overflow: hidden; font-family: var(--font-serif-cn); font-size: 13px; line-height: 1.6; }
        #subjects-screen #view-notes .dict-content-inner p { padding-bottom: 24px; margin-top: 4px; }
        #subjects-screen #view-notes .dict-official { display: block; color: var(--n-text-gray); margin-bottom: 16px; padding: 0 4px; }
        #subjects-screen #view-notes .dict-note { display: block; background: #ffffff; border: 1px solid var(--n-line-color); border-radius: 2px; padding: 16px 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); font-style: italic; font-weight: 700; color: var(--n-text-dark); position: relative; }
        #subjects-screen #view-notes .dict-note::before { content: '↳ PRIVATE NOTE'; display: block; font-family: var(--font-sans); font-size: 8px; font-style: normal; font-weight: 800; letter-spacing: 1px; color: var(--n-text-light); margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px dashed var(--n-line-color); padding-bottom: 8px; }
        #subjects-screen #view-notes .dict-note.en { font-family: var(--font-serif-en); font-size: 14px; }
        
        #subjects-screen #view-notes .dict-item.active .dict-content { grid-template-rows: 1fr; }
        #subjects-screen #view-notes .dict-item.active .dh-icon { transform: rotate(45deg); color: var(--n-text-dark); }
        #subjects-screen #view-notes .dict-item.active .dh-title { color: var(--n-text-gray); }

        /* ================= 视图 9：推荐 Curated Index ================= */
        #subjects-screen #view-recommend {
            --r-bg-color: #f7f7f8; --r-surface-white: #ffffff;
            --r-text-main: #1a1a1a; --r-text-gray: #777777; --r-text-light: #b0b0b0;
            --r-line-color: rgba(0, 0, 0, 0.1); --r-accent-color: #2b2b2b;
            
            background-color: var(--r-bg-color); color: var(--r-text-main);
            font-family: var(--font-sans);
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.04'/%3E%3C/svg%3E");
        }

        #subjects-screen #view-recommend .recommend-container { width: 100%; max-width: 430px; position: relative; padding-bottom: 100px; margin: 0 auto; }
        #subjects-screen #view-recommend .r-header { padding: calc(env(safe-area-inset-top, 20px) + 10px) 24px 24px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; background: linear-gradient(to bottom, var(--r-bg-color) 80%, transparent); }
        #subjects-screen #view-recommend .r-btn-back { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--r-text-main); text-decoration: none; cursor: pointer; }
        #subjects-screen #view-recommend .r-meta-text { font-family: var(--font-mono); font-size: 9px; font-weight: 700; color: var(--r-text-gray); letter-spacing: 2px; text-transform: uppercase; }

        #subjects-screen #view-recommend .hero-section { padding: 10px 24px 40px; position: relative; }
        #subjects-screen #view-recommend .hero-title { font-family: var(--font-serif-en); font-size: 52px; font-weight: 900; line-height: 0.9; letter-spacing: -2px; color: var(--r-text-main); text-transform: uppercase; border-bottom: 2px solid var(--r-text-main); padding-bottom: 20px; margin-bottom: 16px; }
        #subjects-screen #view-recommend .hero-title i { font-style: italic; font-weight: 400; color: var(--r-text-gray); }
        #subjects-screen #view-recommend .hero-desc { font-family: var(--font-serif-cn); font-size: 11px; font-weight: 600; color: var(--r-text-gray); letter-spacing: 2px; text-transform: uppercase; }

        #subjects-screen #view-recommend .index-list { display: flex; flex-direction: column; gap: 30px; padding: 0 20px; }

        #subjects-screen #view-recommend .item-card { background: var(--r-surface-white); border: 1px solid var(--r-line-color); position: relative; overflow: hidden; }
        #subjects-screen #view-recommend .card-top-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--r-line-color); font-family: var(--font-mono); font-size: 9px; color: var(--r-text-light); text-transform: uppercase; letter-spacing: 1px; }
        #subjects-screen #view-recommend .category-tag { font-weight: 700; color: var(--r-text-main); display: flex; align-items: center; gap: 6px; }

        #subjects-screen #view-recommend .card-body { padding: 24px 20px; }
        #subjects-screen #view-recommend .item-title { font-family: var(--font-serif-cn); font-size: 20px; font-weight: 800; color: var(--r-text-main); line-height: 1.3; margin-bottom: 4px; }
        #subjects-screen #view-recommend .item-subtitle { font-size: 11px; color: var(--r-text-gray); font-weight: 500; margin-bottom: 20px; }

        #subjects-screen #view-recommend .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; padding: 16px; background: var(--r-bg-color); border: 1px solid rgba(0,0,0,0.03); }
        #subjects-screen #view-recommend .metric { display: flex; flex-direction: column; gap: 4px; }
        #subjects-screen #view-recommend .m-label { font-family: var(--font-mono); font-size: 8px; color: var(--r-text-gray); text-transform: uppercase; letter-spacing: 1px; }
        #subjects-screen #view-recommend .m-value { font-size: 11px; font-weight: 700; color: var(--r-text-main); }
        #subjects-screen #view-recommend .stars { letter-spacing: 2px; color: var(--r-text-main); font-size: 12px; }
        #subjects-screen #view-recommend .stars.dim { color: var(--r-text-light); }

        #subjects-screen #view-recommend .official-review { font-family: var(--font-sans); font-size: 13px; color: var(--r-text-main); line-height: 1.6; margin-bottom: 24px; }
        #subjects-screen #view-recommend .official-review strong { font-family: var(--font-serif-cn); font-size: 14px; font-weight: 800; }

        #subjects-screen #view-recommend .btn-reveal { width: 100%; display: flex; justify-content: space-between; align-items: center; background: transparent; border: 1px solid var(--r-text-main); padding: 10px 16px; font-family: var(--font-mono); font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--r-text-main); cursor: pointer; transition: all 0.3s; }
        #subjects-screen #view-recommend .btn-reveal:active { background: rgba(0,0,0,0.05); }
        #subjects-screen #view-recommend .btn-reveal i { transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
        #subjects-screen #view-recommend .item-card.expanded .btn-reveal i { transform: rotate(180deg); color: #fff; }
        #subjects-screen #view-recommend .item-card.expanded .btn-reveal { background: var(--r-text-main); color: #fff; border-color: var(--r-text-main); }

        #subjects-screen #view-recommend .private-wrapper { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); background: #111111; }
        #subjects-screen #view-recommend .item-card.expanded .private-wrapper { grid-template-rows: 1fr; }
        #subjects-screen #view-recommend .private-inner { overflow: hidden; }
        #subjects-screen #view-recommend .private-content { padding: 30px 24px 40px; text-align: center; }
        #subjects-screen #view-recommend .private-tag { font-family: var(--font-mono); font-size: 8px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 3px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 24px; }
        #subjects-screen #view-recommend .private-tag::before, #subjects-screen #view-recommend .private-tag::after { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.15); }
        #subjects-screen #view-recommend .private-text { font-family: var(--font-serif-cn); font-size: 14px; line-height: 1.8; font-style: italic; font-weight: 400; color: #ffffff; letter-spacing: 0.5px; }
        #subjects-screen #view-recommend .private-text span.en { font-family: var(--font-serif-en); font-size: 15px; font-weight: 400; color: rgba(255,255,255,0.5); letter-spacing: 1px; }
        
        /* ================= 视图 10：邮件 Mail ================= */
        #subjects-screen #view-mail {
            --m-bg-base: #f9f9fa; --m-surface-white: #ffffff;
            --m-text-main: #111111; --m-text-secondary: #666666; --m-text-tertiary: #999999;
            --m-border-color: rgba(0, 0, 0, 0.06); --m-accent-blue: #007aff;
            
            background-color: var(--m-bg-base); color: var(--m-text-main); font-family: var(--font-sans);
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
        }

        #subjects-screen #view-mail .mail-app-container { width: 100%; max-width: 430px; position: relative; height: 100%; overflow: hidden; background: var(--m-bg-base); margin: 0 auto; }
        
        /* 内部滑动：列表视图 */
        #subjects-screen #view-mail .list-view { width: 100%; height: 100%; display: flex; flex-direction: column; transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
        #subjects-screen #view-mail .list-header { padding: calc(env(safe-area-inset-top, 20px) + 10px) 20px 10px; display: flex; flex-direction: column; gap: 16px; background: var(--m-bg-base); z-index: 10; }
        #subjects-screen #view-mail .header-top { display: flex; justify-content: space-between; align-items: center; }
        #subjects-screen #view-mail .m-back-btn { font-size: 14px; font-weight: 600; color: var(--m-text-secondary); text-decoration: none; display: flex; align-items: center; gap: 4px; cursor: pointer;}
        #subjects-screen #view-mail .page-title { font-family: var(--font-serif-en); font-size: 36px; font-weight: 800; letter-spacing: -1px; }
        #subjects-screen #view-mail .search-bar { background: rgba(0,0,0,0.04); border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; gap: 8px; color: var(--m-text-tertiary); font-size: 14px; }
        
        #subjects-screen #view-mail .mail-list-container { flex: 1; overflow-y: auto; padding-bottom: 40px; scrollbar-width: none; }
        #subjects-screen #view-mail .mail-list-container::-webkit-scrollbar { display: none; }
        
        #subjects-screen #view-mail .mail-item { padding: 16px 20px; border-bottom: 1px solid var(--m-border-color); cursor: pointer; transition: background 0.2s; display: flex; flex-direction: column; gap: 4px; }
        #subjects-screen #view-mail .mail-item:active { background: rgba(0,0,0,0.02); }
        #subjects-screen #view-mail .mi-top { display: flex; justify-content: space-between; align-items: baseline; }
        #subjects-screen #view-mail .mi-sender { font-size: 15px; font-weight: 700; color: var(--m-text-main); }
        #subjects-screen #view-mail .mi-time { font-size: 12px; color: var(--m-text-tertiary); }
        #subjects-screen #view-mail .mi-subject { font-family: var(--font-serif-cn); font-size: 14px; font-weight: 700; color: var(--m-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #subjects-screen #view-mail .mi-preview { font-size: 13px; color: var(--m-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; margin-top: 2px;}

        /* 内部滑动：详情视图 */
        #subjects-screen #view-mail .detail-view { position: absolute; top: 0; left: 100%; width: 100%; height: 100%; background: var(--m-surface-white); z-index: 100; display: flex; flex-direction: column; transition: left 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
        #subjects-screen #view-mail .detail-view.active { left: 0; }
        #subjects-screen #view-mail .detail-nav { padding: calc(env(safe-area-inset-top, 20px) + 10px) 20px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--m-border-color); background: var(--m-surface-white); }
        #subjects-screen #view-mail .m-nav-btn { font-size: 20px; color: var(--m-text-secondary); cursor: pointer; display: flex; align-items: center;}
        #subjects-screen #view-mail .mail-scroll-area { flex: 1; overflow-y: auto; display: flex; flex-direction: column; scrollbar-width: none;}
        #subjects-screen #view-mail .mail-scroll-area::-webkit-scrollbar { display: none;}
        
        #subjects-screen #view-mail .real-mail-headers { padding: 20px 20px 16px; border-bottom: 1px solid var(--m-border-color); }
        #subjects-screen #view-mail .rm-subject { font-family: var(--font-serif-cn); font-size: 22px; font-weight: 800; line-height: 1.3; margin-bottom: 16px; color: var(--m-text-main); }
        #subjects-screen #view-mail .rm-info-row { display: flex; margin-bottom: 6px; font-size: 13px; line-height: 1.4; }
        #subjects-screen #view-mail .rm-label { width: 50px; color: var(--m-text-tertiary); font-weight: 500; }
        #subjects-screen #view-mail .rm-value { flex: 1; color: var(--m-text-secondary); }
        #subjects-screen #view-mail .rm-value strong { color: var(--m-text-main); font-weight: 600; }
        
        #subjects-screen #view-mail .real-mail-body { padding: 24px 20px 40px; font-size: 14px; line-height: 1.6; color: var(--m-text-main); flex: 1;}
        #subjects-screen #view-mail .receipt-format { font-family: var(--font-mono); font-size: 12px; }
        #subjects-screen #view-mail .receipt-total { font-size: 32px; font-weight: 700; border-bottom: 2px solid var(--m-text-main); padding-bottom: 16px; margin-bottom: 16px; }
        #subjects-screen #view-mail .receipt-row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed var(--m-border-color); padding-bottom: 8px;}
        #subjects-screen #view-mail .receipt-map { width: 100%; height: 120px; background: #eee; margin-top: 20px; border-radius: 8px; display: flex; justify-content: center; align-items: center; color: #aaa; }
        #subjects-screen #view-mail .promo-format { text-align: center; font-family: var(--font-serif-cn); }
        #subjects-screen #view-mail .promo-logo { font-family: var(--font-serif-en); font-size: 28px; letter-spacing: 4px; margin-bottom: 20px; }
        #subjects-screen #view-mail .promo-img { width: 100%; height: 200px; background: #f0f0f0; margin: 20px 0; object-fit: cover; filter: grayscale(100%); }
        #subjects-screen #view-mail .promo-btn { display: inline-block; padding: 10px 30px; background: var(--m-text-main); color: #fff; text-decoration: none; font-family: var(--font-sans); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-top: 20px; }

        #subjects-screen #view-mail .draft-reply-section { background: var(--m-bg-base); border-top: 1px solid var(--m-border-color); padding: 20px calc(env(safe-area-inset-bottom, 20px) + 20px); margin-top: auto; }
        #subjects-screen #view-mail .draft-header { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: var(--m-text-tertiary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
        #subjects-screen #view-mail .draft-header span { display: flex; align-items: center; gap: 4px; color: var(--m-accent-blue); }
        #subjects-screen #view-mail .draft-input-box { background: var(--m-surface-white); border: 1px solid var(--m-border-color); border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.02); position: relative; }
        #subjects-screen #view-mail .draft-text { font-family: var(--font-serif-cn); font-size: 14px; line-height: 1.6; color: var(--m-text-main); min-height: 60px; }
        #subjects-screen #view-mail .blinking-cursor { display: inline-block; width: 2px; height: 14px; background-color: var(--m-accent-blue); animation: m-blink 1s step-end infinite; vertical-align: middle; margin-left: 2px; }
        @keyframes m-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        #subjects-screen #view-mail .draft-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--m-border-color); }
        #subjects-screen #view-mail .action-icons i { font-size: 18px; color: var(--m-text-tertiary); margin-right: 12px; }
        #subjects-screen #view-mail .send-btn-fake { background: rgba(0, 122, 255, 0.1); color: rgba(0, 122, 255, 0.4); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: not-allowed; }
        
        /* ================= 视图 11：饲养手册 Care Protocol ================= */
        #subjects-screen #view-care {
            --c-bg-grad-1: #dbe7ef; --c-bg-grad-2: #d6e2d1; --c-bg-grad-3: #f3eee6;
            --c-glass-bg: rgba(255, 255, 255, 0.65); --c-glass-border: rgba(255, 255, 255, 0.9);
            --c-text-dark: #4a4542; --c-text-gray: #827b77;
            --c-accent-sage: #9bb096; --c-accent-blue: #92adc2; --c-accent-brown: #7c6d63;
            --c-font-sans: 'Nunito', sans-serif;

            background: linear-gradient(135deg, var(--c-bg-grad-1) 0%, var(--c-bg-grad-2) 50%, var(--c-bg-grad-3) 100%);
            color: var(--c-text-dark);
            font-family: var(--c-font-sans);
        }

        #subjects-screen #view-care .care-container { 
            width: 100%; 
            max-width: 430px; 
            margin: 0 auto; 
            padding: calc(env(safe-area-inset-top, 20px) + 10px) 16px calc(env(safe-area-inset-bottom, 20px) + 20px); 
            overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
        }
        #subjects-screen #view-care .care-container::-webkit-scrollbar { display: none; }
        
        #subjects-screen #view-care.active { display: block; }
        
        #subjects-screen #view-care .bg-floating-text { position: absolute; font-family: var(--font-serif-en); font-size: 80px; font-weight: 700; color: rgba(255,255,255,0.4); z-index: 0; pointer-events: none; }
        #subjects-screen #view-care .bg-text-1 { top: 60px; right: -20px; font-style: italic; }
        #subjects-screen #view-care .bg-text-2 { top: 450px; left: -10px; color: rgba(255,255,255,0.3); }

        #subjects-screen #view-care .top-bar { display: flex; justify-content: space-between; align-items: center; background: var(--c-glass-bg); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); padding: 12px 20px; border-radius: 30px; border: 2px solid var(--c-glass-border); margin-bottom: 24px; position: relative; z-index: 10; box-shadow: 0 4px 15px rgba(160, 182, 198, 0.15); }
        #subjects-screen #view-care .top-search { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--c-text-gray); font-weight: 600; cursor: pointer; transition: opacity 0.2s;}
        #subjects-screen #view-care .top-search:active { opacity: 0.5; }
        #subjects-screen #view-care .top-toggle { width: 32px; height: 18px; background: var(--c-accent-sage); border-radius: 10px; position: relative; }
        #subjects-screen #view-care .top-toggle::after { content: ''; position: absolute; right: 2px; top: 2px; width: 14px; height: 14px; background: #fff; border-radius: 50%; }

        #subjects-screen #view-care .glass-card { background: var(--c-glass-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 2px solid var(--c-glass-border); border-radius: 28px; padding: 20px; position: relative; z-index: 10; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(146, 173, 194, 0.15); }
        
        #subjects-screen #view-care .floating-circle-btn { position: absolute; width: 36px; height: 36px; background: var(--c-text-dark); color: #fff; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 16px; border: 3px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.1); z-index: 20; cursor: pointer; transition: transform 0.2s; overflow: hidden; }
        #subjects-screen #view-care .floating-circle-btn:active { transform: scale(0.9); }
        #subjects-screen #view-care .btn-pos-1 { top: -10px; right: 20px; background: var(--c-accent-brown); }
        #subjects-screen #view-care .btn-pos-2 { bottom: -10px; left: 40px; background: var(--c-accent-blue); }

        #subjects-screen #view-care .status-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        #subjects-screen #view-care .sh-title { font-size: 12px; font-weight: 800; color: var(--c-accent-sage); text-transform: uppercase; letter-spacing: 1px; font-style: italic;}
        #subjects-screen #view-care .sh-badge { font-size: 10px; font-weight: 800; background: var(--c-accent-blue); color: #fff; padding: 4px 10px; border-radius: 12px; }

        #subjects-screen #view-care .rings-container { display: flex; justify-content: space-around; align-items: center; padding: 10px 0; }
        #subjects-screen #view-care .ring-box { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        #subjects-screen #view-care .circular-chart { width: 64px; height: 64px; border-radius: 50%; display: flex; justify-content: center; align-items: center; background: conic-gradient(var(--c-accent-sage) 20%, rgba(255,255,255,0.5) 0); }
        #subjects-screen #view-care .circular-chart.blue { background: conic-gradient(var(--c-accent-blue) 85%, rgba(255,255,255,0.5) 0); }
        #subjects-screen #view-care .circular-inner { width: 48px; height: 48px; background: var(--c-bg-grad-3); border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 13px; font-weight: 900; color: var(--c-text-dark); }
        #subjects-screen #view-care .ring-label { font-size: 10px; font-weight: 700; color: var(--c-text-gray); }

        #subjects-screen #view-care .chat-section { position: relative; padding: 10px 0; display: flex; flex-direction: column; gap: 12px; }
        #subjects-screen #view-care .chat-bubble { padding: 12px 16px; font-size: 13px; font-weight: 700; line-height: 1.4; max-width: 85%; position: relative; }
        #subjects-screen #view-care .bubble-left { align-self: flex-start; background: #fff; color: var(--c-text-dark); border-radius: 20px 20px 20px 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); font-family: var(--font-serif-cn); }
        #subjects-screen #view-care .bubble-right { align-self: flex-end; background: var(--c-accent-brown); color: #fff; border-radius: 20px 20px 4px 20px; box-shadow: 0 4px 10px rgba(124, 109, 99, 0.3); display: flex; align-items: center; gap: 8px; }

        #subjects-screen #view-care .fake-input-bar { margin-top: 10px; background: #fff; border-radius: 20px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border: 2px solid var(--c-glass-border); }
        #subjects-screen #view-care .input-text { font-size: 11px; font-weight: 700; color: var(--c-text-gray); }
        #subjects-screen #view-care .input-icons { display: flex; gap: 8px; color: var(--text-light); font-size: 16px; }

        #subjects-screen #view-care .rules-card { background: var(--c-accent-sage); color: #fff; border-color: rgba(255,255,255,0.3); }
        #subjects-screen #view-care .rules-title { font-family: var(--font-serif-en); font-size: 28px; font-weight: 700; font-style: italic; margin-bottom: 12px; }
        #subjects-screen #view-care .rule-text { font-family: var(--font-serif-cn); font-size: 14px; font-weight: 700; line-height: 1.5; margin-bottom: 16px; }
        
        #subjects-screen #view-care .mini-profile { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.2); padding: 8px 12px; border-radius: 20px; width: fit-content; }
        #subjects-screen #view-care .mp-dot { width: 8px; height: 8px; background: #fff; border-radius: 50%; }
        #subjects-screen #view-care .mp-text { font-size: 10px; font-weight: 800; letter-spacing: 1px; }

        #subjects-screen #view-care .bottom-dock { position: sticky; bottom: calc(env(safe-area-inset-bottom, 20px) + 20px); margin: 20px auto 0; left: auto; transform: none; width: max-content; background: var(--c-glass-bg); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); padding: 12px 24px; border-radius: 30px; border: 2px solid #fff; display: flex; gap: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); z-index: 100; }
        #subjects-screen #view-care .dock-icon { font-size: 22px; color: var(--c-text-dark); cursor: pointer; transition: transform 0.2s;}
        #subjects-screen #view-care .dock-icon:active { transform: scale(0.9); }
        #subjects-screen #view-care .dock-icon.active { color: var(--c-accent-brown); }
        /* ================= 自定义 Confirm 弹窗 ================= */
        #subjects-screen .subjects-confirm-overlay {
            position: absolute; inset: 0; background: rgba(0,0,0,0.4); 
            backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
            z-index: 99999; display: flex; justify-content: center; align-items: center;
            opacity: 0; pointer-events: none; transition: opacity 0.3s ease;
        }
        #subjects-screen .subjects-confirm-overlay.active {
            opacity: 1; pointer-events: auto;
        }
        #subjects-screen .subjects-confirm-box {
            background: #ffffff; width: 80%; max-width: 300px; border-radius: 24px; 
            padding: 24px 20px 20px; display: flex; flex-direction: column; align-items: center; text-align: center;
            transform: translateY(20px) scale(0.95); transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1);
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
        }
        #subjects-screen .subjects-confirm-overlay.active .subjects-confirm-box {
            transform: translateY(0) scale(1);
        }
        #subjects-screen .sc-icon { font-size: 42px; color: #cc2936; margin-bottom: 12px; }
        #subjects-screen .sc-title { font-family: var(--font-serif-en); font-size: 22px; font-weight: 800; color: #111; margin-bottom: 8px; line-height: 1.2; }
        #subjects-screen .sc-desc { font-size: 12px; color: #666; line-height: 1.6; margin-bottom: 24px; font-family: var(--font-serif-cn); }
        #subjects-screen .sc-actions { display: flex; gap: 10px; width: 100%; }
        #subjects-screen .sc-btn { flex: 1; padding: 12px 0; border-radius: 12px; font-size: 13px; font-weight: 700; border: none; outline: none; cursor: pointer; transition: transform 0.2s, background 0.2s; font-family: var(--font-sans); }
        #subjects-screen .sc-btn:active { transform: scale(0.96); }
        #subjects-screen .sc-btn.cancel { background: #f2f2f3; color: #555; }
        #subjects-screen .sc-btn.confirm { background: #111111; color: #fff; }
       /* ==========================================================
   CSS 样式修复包
   ========================================================== */

/* 1. 修复顶部中文字符少于四个字时意外换行的问题 */
#subjects-screen .name-cn, 
#subjects-screen .ic-cd-title { 
    white-space: nowrap !important; 
}

/* 2. 修复【时间碎片】背面字数多导致被截断的问题 (允许上下滑动) */
#subjects-screen .tf-flip-card-back {
    justify-content: flex-start !important;
    overflow-y: auto !important;
    padding-top: 24px !important;
    padding-bottom: 24px !important;
    scrollbar-width: none;
}
#subjects-screen .tf-flip-card-back::-webkit-scrollbar { display: none; }

/* 3. 修复【聊天室拦截】红色批注字体过大、字数多时满屏重叠的问题 */
#subjects-screen .ic-inner-os {
    font-size: 17px !important; /* 原为24px，显著缩小防重叠 */
    line-height: 1.4 !important;
    max-width: 240px !important;
}
#subjects-screen .ic-inner-os.en {
    font-size: 19px !important;
}

/* 4. 修复【音乐模块】OS文字过长被省略号截断的问题 (解除2行限制，支持滚动) */
#subjects-screen #view-music .track-os-inline {
    display: block !important;
    -webkit-line-clamp: unset !important;
    overflow-y: auto !important;
    max-height: 60px;
    scrollbar-width: none;
}
#subjects-screen #view-music .track-os-inline::-webkit-scrollbar { display: none; }
    `;
    document.head.appendChild(style);
    
    // 3. 注入 HTML (包裹在 #subjects-screen 内)
    const htmlContent = `
    <div id="subjects-screen" class="screen">
        <!-- ================= 视图 0：存档 Archive ================= -->
        <div id="view-archive" class="page-view active">
            <div class="archive-container">
                <header class="archive-header">
                    <button class="back-btn-archive" onclick="SubjectsModule.close()">back</button>
                </header>

                <div class="hero-section">
                    <i class="ph-fill ph-sparkle hero-icon"></i>
                    <h1 class="hero-title">subjects</h1>
                    <div class="hero-subtitle">data extracted • archive</div>
                </div>

                <div class="grid-container" id="subjects-grid-container">
                    <!-- JS 动态渲染真实角色列表 -->
                </div>

                <div class="bottom-pill"></div>
            </div>
        </div>

        <!-- ================= 视图 1：主页 Dashboard ================= -->
        <div id="view-dashboard" class="page-view">
            <div class="dash-container">
                <div class="dash-header">
                    <div class="dash-btn-back" onclick="SubjectsModule.openArchive()">
                        <i class="ph ph-arrow-left"></i> Return
                    </div>
                    <!-- 右侧加上刷新按钮 -->
                    <div class="dash-status" style="display:flex; align-items:center; gap:8px;">
                        <span class="dot-live"></span> SYSTEM ACTIVE
                        <div onclick="SubjectsModule.refreshData()" style="background: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer; transition: transform 0.2s;" onmousedown="this.style.transform='scale(0.9)'" onmouseup="this.style.transform='scale(1)'">
                            <i class="ph ph-arrows-clockwise" style="font-size: 12px; font-weight: bold; color: var(--text-dark);"></i>
                        </div>
                    </div>
                </div>

                <div class="moodboard">
                    <svg class="svg-doodles">
                        <ellipse cx="90" cy="100" rx="75" ry="95" class="stroke-hand" stroke-dasharray="4 4" transform="rotate(-15 90 100)" opacity="0.3"/>
                        <path d="M 170 110 Q 220 100 240 135" class="stroke-hand" marker-end="url(#arrow)" />
                        <path d="M 320 220 L 350 190 L 380 220" class="stroke-hand" opacity="0.5"/>
                        <defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="2" refY="2.5" orient="auto"><path d="M 0 0 L 5 2.5 L 0 5 z" fill="var(--text-dark)" /></marker></defs>
                    </svg>

                    <!-- 动态角色照片与名字 -->
                    <div class="photo-card">
                        <div class="tape"></div>
                        <img src="" alt="Subject Photo" class="photo-img" id="dash-avatar">
                    </div>
                    <div class="name-typography">
                        <div class="name-en" id="dash-name-en">LOADING</div>
                        <div class="name-cn" id="dash-name-cn">加载中</div>
                    </div>

                    <div class="widget-search" onclick="SubjectsModule.openBrowserLogs()">
                        <i class="ph ph-magnifying-glass" style="font-size: 14px; font-weight: bold;"></i>
                        <div class="search-input" id="dash-search-preview">...</div>
                        <div style="background: #eee; padding: 4px; border-radius: 50%; display: flex;"><i class="ph ph-x" style="font-size: 8px;"></i></div>
                    </div>

                    <div class="widget-music" onclick="SubjectsModule.openMusic()">
                        <div class="vinyl-record"></div>
                        <div class="music-text"><span class="m-title" id="dash-music-title">...</span><span class="m-artist" id="dash-music-artist">...</span></div>
                        <i class="ph-fill ph-waveform" style="color: #fff; margin-left: auto; font-size: 16px; opacity: 0.5;"></i>
                    </div>

                    <div class="widget-chat" onclick="SubjectsModule.openInterceptList()" style="cursor: pointer; transition: transform 0.2s;" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">
                        <div class="mod-title">Messages <span class="cn">聊天室</span></div>
                        <div style="position: relative;">
                            <div class="bubble-bg"></div>
                            <div class="bubble-main" id="dash-chat-preview">“...”</div>
                        </div>
                    </div>

                    <div class="widget-time" onclick="SubjectsModule.openTimeFragments()" style="cursor: pointer; transition: transform 0.2s;" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">
                        <div class="mod-title">Screen Time <span class="cn">用时</span></div>
                        <div class="time-big" id="dash-screen-time">0<span>h</span> 0<span>m</span></div>
                        <svg class="line-chart" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M 0 25 L 20 20 L 40 28 L 60 10 L 80 15 L 100 5" fill="none" stroke="var(--text-dark)" stroke-width="2" stroke-linecap="round"/><circle cx="100" cy="5" r="3" fill="var(--text-dark)"/></svg>
                    </div>

                    <div class="widget-notes" onclick="SubjectsModule.openNotes()" style="cursor: pointer; transition: transform 0.2s;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
                        <div class="mod-title" style="justify-content: flex-end;">Notes <span class="cn">备忘录</span></div>
                        <div class="notes-paper">
                            <div class="handwriting" id="dash-notes-preview">...</div>
                            <i class="ph-fill ph-push-pin" style="position: absolute; top: 10px; right: 10px; color: #ccc;"></i>
                        </div>
                    </div>

                    <div class="widget-cart" onclick="SubjectsModule.openReceipt()">
                        <div class="cart-left">
                            <div class="mod-title" style="margin-bottom: 2px;">Receipt <span class="cn">清单</span></div>
                            <div class="cart-desc" id="dash-receipt-desc">0 Items Included</div>
                            <div class="cart-price" id="dash-receipt-price">$0.00</div>
                        </div>
                        <div class="cart-divider"></div>
                        <div class="cart-right">
                            <div class="stamp-paid">PAID</div>
                            <div class="barcode-small">TKT</div>
                        </div>
                    </div>

                    <div class="sticker-group">
                        <div class="dymo-label dymo-1" onclick="SubjectsModule.openRecommend()"><i class="ph ph-map-trifold"></i> 推荐</div>
                        <div class="dymo-label dymo-2" onclick="SubjectsModule.openMailApp()"><i class="ph ph-envelope-simple-open"></i> 邮件</div>
                    </div>

                    <div class="widget-editorial-pet" onclick="SubjectsModule.openCare()" style="cursor: pointer; transition: transform 0.2s;" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
                        <div class="tape-black"></div>
                        <div class="ed-top-info"><span>OBSERVATION FILE</span><span id="dash-care-no">NO. 000</span></div>
                        <div class="ed-title-en">PET <i>HUMAN</i></div><div class="ed-title-cn">饲养观察手册</div>
                        <div class="ed-content-box">
                            <div class="ed-star-sticker">✦</div>
                            <!-- 动态绑定面具头像 -->
                            <img src="" class="ed-art-img" id="dash-user-avatar" alt="user avatar" style="display:none;">
                            <div class="ed-text-row"><span class="ed-label">TARGET</span><span class="ed-value" id="dash-care-target">...</span></div>
                            <div class="ed-text-row"><span class="ed-label">STATUS</span><span class="ed-value" id="dash-care-status">...</span></div>
                            <div class="ed-text-row"><span class="ed-label">RATING</span><span class="ed-value highlight" id="dash-care-rating">...</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ================= 视图 2：详情 小票页 ================= -->
        <div id="view-receipt" class="page-view">
            <div class="receipt-container">
                <div class="receipt-header">
                    <div class="receipt-btn-back" onclick="SubjectsModule.closeReceipt()">
                        <i class="ph ph-arrow-left"></i> RETURN
                    </div>
                    <i class="ph ph-printer" style="color: #fff; font-size: 18px;"></i>
                </div>
                
                <div class="side-editorial" id="receipt-side-log">CONFIDENTIAL LOGS • 202X</div>
                <div class="printer-slot"></div>

                <div class="receipt-wrapper" id="receipt-paper-wrapper">
                    <div class="pinned-photo">
                        <div class="paperclip"></div>
                        <img src="https://i.postimg.cc/fTRy16Nt/IMG-0019.jpg" alt="Evidence" class="p-img">
                        <div style="font-family: var(--font-hand); font-size: 14px; color: #111; text-align: center; margin-top: 2px;" id="receipt-photo-text">Subject</div>
                    </div>

                    <div class="receipt-paper">
                        <div class="receipt-tape-top"></div>
                        <div class="r-header"><div class="r-logo">Void Mrt.</div><div class="r-sub-logo">EMOTIONAL COMMERCE</div></div>
                        <div class="r-meta">
                            <div id="receipt-meta-date">DATE: ---<br>TIME: ---</div>
                            <div style="text-align: right;">TRX: #<span id="receipt-trx-id">----</span><br>CASHIER: SYSTEM</div>
                        </div>
                        <div class="r-divider"></div>

                        <div id="receipt-items-container">
                            <!-- JS 动态渲染小票项目 -->
                        </div>

                        <div class="r-divider"></div>
                        <div class="r-total-section">
                            <div class="total-row"><span>SUBTOTAL</span><span id="receipt-subtotal">$0.00</span></div>
                            <div class="total-row"><span>EMOTIONAL TAX (15%)</span><span id="receipt-tax">$0.00</span></div>
                            <div class="total-grand"><span>TOTAL</span><span id="receipt-total">$0.00</span></div>
                        </div>
                        <div class="handwriting-note hw-2" id="receipt-hw-bottom">...</div>
                        <div class="r-barcode-section">
                            <div class="barcode-font" id="receipt-barcode">SHEN-ERROR-404</div>
                            <div class="barcode-text">CUSTOMER COPY</div>
                        </div>
                    </div> 
                </div>
            </div>
        </div>

        <!-- ================= 视图 3：浏览器日志 Browser Logs ================= -->
        <div id="view-browser-logs" class="page-view">
            <div class="app-container">
                <div class="bg-typography">LOGS<br><span>SYS</span></div>
                <svg class="bg-curves">
                    <path d="M -50 200 Q 200 100 450 300" class="thin-line"/>
                    <path d="M 400 -50 Q 300 400 -50 500" class="thin-line"/>
                    <circle cx="350" cy="450" r="100" class="thin-line" stroke-dasharray="2 4"/>
                </svg>

                <header class="header">
                    <div class="top-nav">
                        <div class="btn-back" onclick="SubjectsModule.openDashboard()"><i class="ph ph-arrow-left"></i> RETURN</div>
                        <div class="header-stars">✦ ✦</div>
                    </div>
                    <div class="ghost-search-bar">
                        <i class="ph ph-magnifying-glass search-icon"></i>
                        <div class="typewriter-text" id="browser-top-typing">...</div>
                    </div>
                </header>

                <div class="page-title">
                    <h1 class="t-en">Mind <i>Slices</i></h1>
                    <div class="t-cn">系统后台检索档案</div>
                </div>

                <div class="list-container" id="logs-list">
                    <!-- JS 动态渲染日志列表 -->
                </div>
            </div>

            <!-- 详情页：杂志拉页 (Modal) -->
            <div class="detail-modal" id="detail-modal">
                <div class="btn-close-modal" onclick="SubjectsModule.closeModal()">
                    <i class="ph ph-x"></i>
                </div>
                <div class="modal-content-card">
                    <i class="ph-fill ph-sparkle modal-star"></i>
                    <div class="m-section-query">
                        <div class="m-label">Target Query</div>
                        <div class="m-query-text" id="modal-query"></div>
                    </div>
                    <div class="m-section-os">
                        <div class="m-label">System Analysis</div>
                        <div class="m-sys-box">
                            <div class="m-sys-result" id="modal-sys"></div>
                        </div>
                        <div class="m-handwriting-os" id="modal-os"></div>
                    </div>
                    <div class="m-footer-bar">
                        <span>UNRESOLVED THREAD</span>
                        <span id="modal-thread-id">0x000000</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ================= 视图 4：音乐解析 Music (Audio Vibe) ================= -->
        <div id="view-music" class="page-view">
            <div class="music-container">
                <header class="music-header">
                    <a href="javascript:void(0)" class="music-btn-back" onclick="SubjectsModule.openDashboard()"><i class="ph ph-arrow-left"></i> Return</a>
                    <div class="music-meta-text">FREQ: 432Hz</div>
                </header>

                <div class="music-page-title">
                    <h1 class="m-title-en">Vibe <i>Analysis</i></h1>
                    <div class="m-title-cn">系统音频情绪解析记录</div>
                    <div class="m-title-stars">✦ ✦</div>
                </div>

                <div class="player-section">
                    <div class="player-card">
                        <div class="card-top-line"></div>
                        <div class="album-art-module">
                            <div class="css-vinyl" id="ph-m-vinyl">
                                <div class="vinyl-label" id="ph-m-vinyl-color"></div>
                            </div>
                            <div class="css-sleeve">
                                <div class="sleeve-text" id="ph-m-cover-text">...</div>
                            </div>
                        </div>
                        <div class="track-info-area">
                            <div class="track-name" id="ph-m-now-title">...</div>
                            <div class="track-artist" id="ph-m-now-artist">...</div>
                        </div>
                        <div class="vibe-waveform" id="ph-m-waveform">
                            <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                            <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                            <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                        </div>
                        <div class="player-status">
                            <span class="status-label">STATUS</span>
                            <div class="track-os-inline" id="ph-m-now-os"></div>
                            <span class="status-pill" id="ph-m-now-mood">...</span>
                        </div>
                    </div>
                </div>

                <div class="playlist-section">
                    <div class="playlist-title"><i class="ph ph-headphones"></i> Mood Frequency Logs</div>
                    <div id="ph-m-playlist-container">
                        <!-- JS 动态渲染音乐列表 -->
                    </div>
                </div>
            </div>
        </div>
        
        <!-- ================= 视图 5：拦截通讯录 ================= -->
        <div id="view-intercept-list" class="page-view">
            <div class="ic-app-container">
                <header class="ic-header">
                    <a href="javascript:void(0)" class="btn-back" onclick="SubjectsModule.openDashboard()"><i class="ph ph-arrow-left"></i> RETURN</a>
                    <div class="ic-meta-text" id="intercept-log-count">EXTRACTED: 0 LOGS</div>
                </header>

                <div class="ic-page-title-box">
                    <h1 class="ic-title-en">Comm <span>Intercept</span></h1>
                    <div class="ic-title-cn">已截获通讯记录分析</div>
                </div>

                <div class="ic-chat-list" id="intercept-list-container">
                    <!-- JS 动态渲染拦截列表 -->
                </div>
            </div>
        </div>

        <!-- ================= 视图 6：拦截通讯详情页 ================= -->
        <div id="view-intercept-detail" class="page-view">
            <div class="ic-app-container" style="display: flex; flex-direction: column;">
                <div class="ic-cd-header">
                    <a href="javascript:void(0)" class="btn-back" onclick="SubjectsModule.openInterceptList()"><i class="ph ph-arrow-left"></i></a>
                    <div class="ic-cd-title" id="ic-chat-title">Chat Name<span>0 MEMBERS</span></div>
                    <div class="ic-decode-switch-wrapper">
                        <span class="ic-decode-label" id="ic-decode-text">DECODE</span>
                        <label class="ic-switch">
                            <input type="checkbox" id="ic-decode-toggle" onchange="SubjectsModule.toggleDecode()">
                            <span class="ic-slider"></span>
                        </label>
                    </div>
                </div>

                <div class="ic-chat-flow" id="ic-chat-flow">
                    <!-- JS 动态渲染对话流与潜意识OS -->
                </div>

                <div class="ic-cd-footer">
                    <div class="ic-fake-input">
                        <span>Subject is typing...</span>
                        <i class="ph-fill ph-paper-plane-right"></i>
                    </div>
                </div>
            </div>
        </div>

        <!-- ================= 视图 7：时间碎片 (Time Fragments) ================= -->
        <div id="view-time-fragments" class="page-view">
            <div class="tf-app-container">
                <div class="tf-bg-text-large">SECRETS</div>
                
                <header class="tf-header">
                    <button class="tf-btn-back" onclick="SubjectsModule.openDashboard()"><i class="ph ph-arrow-left"></i> Return</button>
                    <div class="tf-meta-text">DAILY LOGS</div>
                </header>
                
                <div class="tf-hero-section">
                    <h1 class="tf-hero-title">Time <i>Fragments</i></h1>
                    <div class="tf-hero-subtitle">私人注意力解剖图鉴</div>
                    <div class="tf-total-time">
                        <span class="num" id="tf-total-num">0H 0M</span>
                        <span class="txt">/ TOTAL SCREEN TIME</span>
                    </div>
                </div>
                
                <div class="tf-scrapboard" id="tf-scrapboard-container">
                    <svg class="tf-doodles">
                        <path d="M 150 160 C 200 180, 250 140, 280 180" class="tf-stroke-pen" stroke-dasharray="4 4" />
                        <path d="M 100 480 C 150 520, 200 460, 250 500" class="tf-stroke-pen" />
                    </svg>
                    <i class="ph-fill ph-heart tf-floating-heart" style="top: 290px; right: 40px;"></i>
                    <i class="ph-fill ph-sparkle tf-floating-heart" style="top: 100px; left: 30px; color: #8c7362; font-size: 20px;"></i>
                    
                    <!-- JS 动态渲染翻转卡片 -->
                </div>
            </div>
        </div>

        <!-- ================= 视图 8：备忘录 Notes ================= -->
        <div id="view-notes" class="page-view">
            <div class="notes-container">
                <header class="n-header">
                    <a href="javascript:void(0)" class="n-btn-back" onclick="SubjectsModule.openDashboard()"><i class="ph ph-arrow-left"></i> Return</a>
                    <div class="n-meta-text">SYNC: JUST NOW</div>
                </header>

                <div class="hero-section">
                    <h1 class="hero-title">The<br><i>Archive</i></h1>
                    <div class="hero-desc">加密备忘录 / 查阅权限：最高</div>
                </div>

                <div class="module-section">
                    <div class="mod-header"><i class="ph-fill ph-check-square-offset"></i> Daily Routine</div>
                    <div class="todo-list" id="notes-todo-list">
                        <!-- JS 动态渲染 -->
                    </div>
                </div>

                <div class="module-section">
                    <div class="mod-header"><i class="ph-fill ph-scales"></i> Risk Assessment</div>
                    <div class="risk-assessment">
                        <div class="risk-tag" id="notes-risk-tag">FILE: 001</div>
                        <div class="risk-title" id="notes-risk-title">...</div>
                        <div class="pros-cons-grid" id="notes-pc-grid">
                            <!-- JS 动态渲染 -->
                        </div>
                        <div class="risk-conclusion">
                            <span id="notes-risk-conclusion">...</span>
                        </div>
                    </div>
                </div>

                <div class="module-section" style="margin-top: 20px;">
                    <div class="mod-header"><i class="ph-fill ph-book-open-text"></i> Subject Dictionary</div>
                    <div class="dictionary-list" id="notes-dict-list">
                        <!-- JS 动态渲染 -->
                    </div>
                </div>
            </div>
        </div>

        <!-- ================= 视图 9：推荐 Curated Index ================= -->
        <div id="view-recommend" class="page-view">
            <div class="recommend-container">
                <header class="r-header">
                    <a href="javascript:void(0)" class="r-btn-back" onclick="SubjectsModule.openDashboard()"><i class="ph ph-arrow-left"></i> Return</a>
                    <div class="r-meta-text">AUTHORIZATION: GRANTED</div>
                </header>

                <div class="hero-section">
                    <h1 class="hero-title">Curated<br><i>Index</i></h1>
                    <div class="hero-desc">系统侦测 / 个人品味与生活志</div>
                </div>

                <div class="index-list" id="recommend-list-container">
                    <!-- JS 动态渲染推荐卡片 -->
                </div>
            </div>
        </div>

        <!-- ================= 视图 10：邮件 Mail ================= -->
        <div id="view-mail" class="page-view">
            <div class="mail-app-container">
                <div class="list-view" id="mail-list-view">
                    <div class="list-header">
                        <div class="header-top">
                            <a href="javascript:void(0)" class="m-back-btn" onclick="SubjectsModule.openDashboard()"><i class="ph ph-caret-left"></i> Folders</a>
                            <i class="ph ph-note-pencil" style="font-size: 20px; color: var(--m-accent-blue);"></i>
                        </div>
                        <h1 class="page-title">Inbox</h1>
                        <div class="search-bar"><i class="ph ph-magnifying-glass"></i> Search</div>
                    </div>

                    <div class="mail-list-container" id="mail-list-container">
                        <!-- JS 动态渲染邮件列表 -->
                    </div>
                </div>

                <div class="detail-view" id="mail-detail-view">
                    <div class="detail-nav">
                        <div class="m-nav-btn" onclick="SubjectsModule.closeMailDetail()"><i class="ph ph-caret-left"></i></div>
                        <div style="display:flex; gap:20px;">
                            <i class="ph ph-archive m-nav-btn"></i>
                            <i class="ph ph-trash m-nav-btn"></i>
                            <i class="ph ph-share-fat m-nav-btn"></i>
                        </div>
                    </div>
                    <div class="mail-scroll-area">
                        <div class="real-mail-headers">
                            <div class="rm-subject" id="mail-subject">...</div>
                            <div class="rm-info-row"><div class="rm-label">From:</div><div class="rm-value" id="mail-from">...</div></div>
                            <div class="rm-info-row"><div class="rm-label">To:</div><div class="rm-value"><strong>Subject</strong> &lt;user@personal.net&gt;</div></div>
                            <div class="rm-info-row"><div class="rm-label">Date:</div><div class="rm-value" id="mail-date">...</div></div>
                        </div>
                        <div class="real-mail-body" id="mail-body">...</div>
                        <div class="draft-reply-section">
                            <div class="draft-header">Draft Saved <span id="mail-draft-target"><i class="ph-fill ph-arrow-u-down-left"></i> Reply</span></div>
                            <div class="draft-input-box">
                                <div class="draft-text"><span id="mail-draft-content">...</span><span class="blinking-cursor"></span></div>
                                <div class="draft-actions">
                                    <div class="action-icons"><i class="ph ph-image"></i><i class="ph ph-paperclip"></i><i class="ph ph-text-aa"></i></div>
                                    <div class="send-btn-fake"><i class="ph-fill ph-paper-plane-tilt" style="margin-right:4px;"></i> Send</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ================= 视图 11：饲养手册 Care Protocol ================= -->
        <div id="view-care" class="page-view">
            <div class="care-container">
                <div class="bg-floating-text bg-text-1">Target</div>
                <div class="bg-floating-text bg-text-2">Subject</div>

                <div class="top-bar">
                    <div class="top-search" onclick="SubjectsModule.openDashboard()">
                        <i class="ph ph-magnifying-glass" style="font-size: 16px; color: var(--c-text-dark);"></i>
                        System / <span id="care-sys-id">Subject_01</span>
                    </div>
                    <div class="top-toggle"></div>
                </div>

                <div class="glass-card">
                    <!-- 动态绑定面具头像 -->
                    <div class="floating-circle-btn btn-pos-1" style="overflow: hidden;">
                        <img src="" id="care-user-avatar" style="width:100%;height:100%;object-fit:cover;display:none;">
                        <i class="ph-fill ph-heart" id="care-heart-icon"></i>
                    </div>
                    <div class="status-header">
                        <span class="sh-title">Vital Signs Monitoring</span>
                        <span class="sh-badge">SYSTEM ACTIVE</span>
                    </div>
                    <div class="rings-container">
                        <div class="ring-box">
                            <div class="circular-chart" id="care-ring-1"><div class="circular-inner" id="care-val-1">--%</div></div>
                            <div class="ring-label" id="care-label-1">...</div>
                        </div>
                        <div class="ring-box">
                            <div class="circular-chart blue" id="care-ring-2"><div class="circular-inner" id="care-val-2">--%</div></div>
                            <div class="ring-label" id="care-label-2">...</div>
                        </div>
                    </div>
                    <div style="text-align: center; margin-top: 16px; font-size: 11px; font-weight: 700; color: var(--c-text-gray);" id="care-monitoring-text">
                        "..."
                    </div>
                </div>

                <div class="glass-card">
                    <div class="floating-circle-btn btn-pos-2" style="bottom: 60px; left: -10px;"><i class="ph-fill ph-plus"></i></div>
                    <div class="status-header" style="margin-bottom: 8px;">
                        <span class="sh-title" style="color: var(--c-accent-blue);">Message Decrypt</span>
                    </div>
                    <div class="chat-section">
                        <div class="chat-bubble bubble-left" id="care-chat-user">...</div>
                        <div class="chat-bubble bubble-right" id="care-chat-ai"><i class="ph-fill ph-robot"></i> ...</div>
                        <div class="fake-input-bar">
                            <div class="input-text">
                                <i class="ph-fill ph-warning-circle" style="color: var(--c-accent-brown); margin-right: 4px; vertical-align: bottom;"></i>
                                Translation: <span id="care-chat-translation">...</span>
                            </div>
                            <div class="input-icons"><i class="ph ph-camera"></i></div>
                        </div>
                    </div>
                </div>

                <div class="glass-card rules-card">
                    <div class="rules-title">Protocol 01</div>
                    <div class="rule-text" id="care-rule-text">...</div>
                    <div class="mini-profile">
                        <div class="mp-dot"></div>
                        <div class="mp-text" id="care-author-text">AUTHOR: SYSTEM CORE</div>
                    </div>
                </div>

                <div class="glass-card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 60px;">
                    <div>
                        <div style="font-size: 13px; font-weight: 800; color: var(--c-accent-blue); margin-bottom: 4px;">Ambient Sound</div>
                        <div style="font-family: var(--font-serif-cn); font-size: 11px; font-weight: 700; color: var(--c-text-gray);" id="care-ambient-text">...</div>
                    </div>
                    <div style="width: 40px; height: 40px; background: var(--c-surface-white); border-radius: 50%; display: flex; justify-content: center; align-items: center; color: var(--c-accent-blue); box-shadow: 0 4px 10px rgba(0,0,0,0.05);"><i class="ph-fill ph-waveform"></i></div>
                </div>

                <div class="bottom-dock">
                    <i class="ph-fill ph-house dock-icon active"></i>
                    <i class="ph-fill ph-chat-teardrop-text dock-icon"></i>
                    <i class="ph-fill ph-link dock-icon"></i>
                    <i class="ph-fill ph-magnifying-glass dock-icon"></i>
                </div>
            </div>
        </div>
        <!-- ================= 全局弹窗：自定义 Confirm ================= -->
        <div id="subjects-confirm-modal" class="subjects-confirm-overlay">
            <div class="subjects-confirm-box">
                <div class="sc-icon"><i class="ph-fill ph-warning-circle"></i></div>
                <div class="sc-title" id="sc-title">System Reset</div>
                <div class="sc-desc" id="sc-desc">确定要清空数据吗？</div>
                <div class="sc-actions">
                    <button class="sc-btn cancel" id="sc-btn-cancel">取消</button>
                    <button class="sc-btn confirm" id="sc-btn-confirm">确认清空</button>
                </div>
            </div>
        </div>

    </div> <!-- 这里是你原来就有的 #subjects-screen 的闭合标签 -->
    `;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => document.querySelector('.device')?.insertAdjacentHTML('beforeend', htmlContent));
    } else {
        document.querySelector('.device')?.insertAdjacentHTML('beforeend', htmlContent);
    }
    
    // ============================================================
    // 状态与缓存管理
    // ============================================================
    let _initialized = false;
    let _activeSubjectId = null;
    let _char = null;
    let _persona = null;
    let _userAvatarUrl = '';
    let _charAvatarUrl = '';
    
    // 存储当前角色的手机各项数据: { dashboard: {...}, music: [...], notes: {...}, ... }
    let _subjectDataCache = {}; 
    let _currentTrackIndex = 0;

    // ============================================================
    // 核心 AI 数据推演引擎 (Lazy Load)
    // ============================================================
    // 统一的加载动画遮罩
    function _showLoading(show, text = "DECRYPTING DATA...") {
        let loader = document.getElementById('subjects-global-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'subjects-global-loader';
            loader.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
                    <i class="ph-thin ph-aperture" style="font-size:40px; color:var(--text-main,#fff); animation: ph-spin 2s linear infinite;"></i>
                    <div style="font-family:var(--font-mono); font-size:10px; letter-spacing:4px; color:var(--text-main,#fff);">${text}</div>
                </div>
            `;
            loader.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); z-index:9999; display:flex; justify-content:center; align-items:center; opacity:0; pointer-events:none; transition:opacity 0.3s;';
            document.getElementById('subjects-screen').appendChild(loader);
        }
        if (show) {
            loader.style.opacity = '1';
            loader.style.pointerEvents = 'auto';
        } else {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
        }
    }

    // 根据模块调用大模型生成数据
    async function _generateModuleData(moduleKey) {
        _showLoading(true, `EXTRACTING [${moduleKey.toUpperCase()}]...`);
        try {
            const activeApi = await ApiModule.getSecondaryApi();
            if (!activeApi) throw new Error('未配置 API');

            // 提取上下文
            const msgs = await DB.messages.getPage(String(_activeSubjectId), 0, 30).catch(()=>[]);
            const historyText = msgs.reverse().filter(m => m.role === 'user' || m.role === 'assistant').map(m => {
                const roleName = m.role === 'user' ? (_persona?.name || '我') : _char.name;
                const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                return `[${roleName}]: ${txt}`;
            }).join('\n');

            // 🌟 1. 自动提取角色专属的《世界书》与全局常驻背景 (仅限勾选了 subjects 注入范围的)
            let worldBookContext = '';
            try {
                if (typeof DB.worldInfo !== 'undefined') {
                    const allWBs = await DB.worldInfo.getAll().catch(()=>[]);
                    const activeWBs = allWBs.filter(wb => {
                        if (wb.enabled === false) return false;
                        if (!wb.scope || !wb.scope.includes('subjects')) return false; // 必须勾选了查手机注入
                        // 判断是否绑定了当前角色，或全局
                        const isForThisChar = wb.characterIds && wb.characterIds.includes(String(_activeSubjectId));
                        const isGlobal = !wb.characterIds || wb.characterIds.length === 0;
                        return isForThisChar || isGlobal;
                    });
                    if (activeWBs.length > 0) {
                        worldBookContext = activeWBs.map(wb => wb.content.trim()).join('\n\n');
                    }
                }
            } catch(e) {}

            // 🌟 2. 提取面具详细背景
            const userBg = _persona ? `${_persona.bio ? '简介：' + _persona.bio : ''} ${_persona.backstory ? '背景：' + _persona.backstory : ''}`.trim() : '';

            let schema = '';
            let promptRule = '';

            // --- 动态定义每个模块的 JSON 结构与规则 ---
            switch(moduleKey) {
                case 'dashboard':
                    promptRule = `推演该角色手机主屏幕的概览状态。`;
                    schema = `{ "search": "最近搜索记录的一句话(如:如何暗示...)", "music_title": "当前播放歌曲名", "music_artist": "歌手名", "chat_preview": "聊天室最新一条未发出的内心吐槽", "time_h": "使用手机小时数(数字)", "time_m": "分钟数", "notes_preview": "备忘录里的一句短碎碎念", "receipt_desc": "购物清单包含几项", "receipt_price": "购物总价(如: $45.00)", "care_target": "饲养手册记录目标(通常为我的名字或代号)", "care_status": "当前状态(如: 水分摄入过低...)", "care_rating": "评级(如: 难养，但凑合)" }`;
                    break;
                case 'music':
                    promptRule = `根据角色当前的心理状态，推演ta网易云/Spotify的最近播放列表(4首歌)。歌曲需符合ta的品味。`;
                    schema = `[ { "title": "歌名", "artist": "歌手", "coverText": "封面4个字母简写(如:NGHT)", "labelColor": "黑胶唱片中心颜色(十六进制,如:#cc2936)", "mood": "听这首歌时的情绪标签(如:试图冷静)", "os": "听歌时的内心OS(吐槽或感慨)" } ]`;
                    break;
                case 'browser':
                    promptRule = `推演角色最近的5条浏览器搜索记录，反映ta近期的困惑、焦虑或秘密查阅的内容。`;
                    schema = `[ { "query": "搜索词(如: 人类生气时的脑电波特征)", "sysResult": "搜索结果摘要", "innerOS": "查阅该词条时的内心真实想法(傲娇或无奈)" } ]`;
                    break;
                case 'time':
                    promptRule = `推演角色的屏幕使用时间碎片(4个App)，记录表面的官方用途和背后的真实真相。`;
                    schema = `{ "totalNum": "总时长(如:8H 15M)", "items":[ { "app": "应用名(Social/Maps/Chat/Music/Camera/Browser中选)", "time": "使用时长(如:2H 15M)", "reason": "官方记录(如:浏览艺术设计参考)", "truth": "内心真相(如:其实在反复看她的照片)" } ] }`;
                    break;
                case 'notes':
                    promptRule = `推演角色的私人备忘录。包含待办事项、风险评估和专属词典(记录关于我的细节)。`;
                    schema = `{ "todos":[ { "text": "表面待办事项", "isStrike": true/false(是否划掉), "breakdown": "划掉后暴露的真实想法或补充说明(可空)" } ], "risk": { "title": "关于某件小事的风险评估(如:要不要问她周末出不出来)", "pros": ["好处1", "好处2"], "cons": ["坏处1", "坏处2"], "conclusion": "最终执行结果与自嘲" }, "dict":[ { "title": "词典条目标题(如:饮食忌口备份)", "official": "客观记录", "private": "私人批注(如:下次记得偷偷帮她准备)" } ] }`;
                    break;
                case 'receipt':
                    promptRule = `推演角色最近的一张电子购物小票，包含4件商品，反映ta暗戳戳的关心或情绪消费。`;
                    schema = `{ "date": "日期(如:2026.10.24)", "time": "时间(如:02:43 AM)", "trxId": "四位数字+字母", "items":[ { "name": "商品名(如:高纯度赛博猫条/耐心补充剂)", "status": "PURCHASED/ABANDONED/OUT OF STOCK", "desc": "商品状态描述", "qty": 1, "price": 24.00, "total": 24.00 } ], "subtotal": 33.90, "tax": 5.08, "total": 38.98, "hw": "小票底部的手写涂鸦/吐槽" }`;
                    break;
                case 'recommend':
                    promptRule = `推演系统根据角色品味和最近的聊天记录推送的4个精选内容，以及角色看这些推荐时联想到'我'的私人评注。`;
                    schema = `[ { "category": "分类(Gastronomy/Cinematography/Publications/Daily Essentials)", "id": "001", "title": "项目名称", "subtitle": "副标题", "score": "3.5", "m1Label": "指标1", "m1Val": "值", "m2Label": "指标2", "m2Val": "值", "m3Label": "指标3", "m3Val": "值", "review": "官方客观评价", "private": "角色的私人联想(如:正好路过顺便带她去)" } ]`;
                    break;
                case 'mail':
                    promptRule = `推演角色的电子邮箱，包含4封真实的收件(打车、广告、HR、订阅号等)，以及ta针对每封邮件写了却没发出去的、与'我'相关的草稿。`;
                    schema = `[ { "sender": "发件人名字", "time": "日期时间", "subject": "邮件标题", "preview": "列表预览", "fromHtml": "发件人邮箱格式(如:<strong>Uber</strong> <...)", "bodyHtml": "邮件正文(支持HTML标签)", "draftTarget": "草稿目标(如:Reply to Sender / Forward to: Her)", "draftContent": "傲娇/纠结的内心草稿内容" } ]`;
                    break;
                case 'care':
    promptRule = `
【核心背景】：
这是角色手机里一个名为《碳基生物交互行为准则》的私人App。
在角色眼里，你（${_persona?.name || '用户'}）是一个虽然逻辑经常报错、情绪极度不稳定，但却让他不得不动用 90% 后台算力去关注的“珍稀样本”。
这不是真正的机器报告，而是他以“系统自居”的形式写给你的、带温情与观察的私人手册。

【任务要求】：
请结合你们最近的聊天记录，以“假装冷淡实则细腻观察”的语气填入：

1. **ring1Label & ring1Val**: 监测一个感性指标（如：[乖巧程度]、[安全感余额]、[心虚指数]、[对我的依赖性]）。
2. **ring2Label & ring2Val**: 监测一个生存指标（如：[生存电量]、[情绪稳定性]、[想我的频率]、[撒娇带宽]）。
3. **monitoring**: 对我当前状态的总结。语气要像系统通知，内容要有“被你打败了”的无奈感或深度关注。
   - 示例："监测到样本近期频繁出现逻辑断层（傻笑），推测受本系统发出的语音信息影响。建议保持现状，无需干预。"
4. **chatUser**: 摘录一句我最近发过的、最让你触动（或让你觉得我很笨/很可爱）的话。
5. **chatAi**: 你当时针对这句话给出的“体面、理性、甚至有点嫌弃”的回复。
6. **translation**: 【核心灵魂】这句冷淡回复背后，你当时真实的内心波动。
   - 示例：如果官方回复是“无聊”，内心译文可能是“别再这么看我了，我的核心频率快要过热宕机了。”
7. **ruleText**: 总结一条针对我的“饲养守则(Protocol)”。
   - 示例："当样本表现出‘假装生气’行为时，禁用法理逻辑。唯一有效干预手段为：无条件妥协。备注：样本在此状态下抵抗力为零。"
8. **ambient**: “后台窃听”模块。记录你捕捉到的一个关于我的微小生活细节，以及你的批注。

【禁止项】：
- 绝对禁止写成通用的AI客服话术。
- 禁止出现“好的”、“作为AI”等废话。
- 语言要带有【${_char.name}】的性格色彩：可以腹黑、可以闷骚、可以强势，但重点是那种“专门为你建立一套规则”的偏爱感。`;

    schema = `{ 
        "ring1Label": "中文标签", "ring1Val": "XX%", 
        "ring2Label": "中文标签", "ring2Val": "XX%", 
        "monitoring": "带性格色彩的总结", 
        "chatUser": "我的原话", 
        "chatAi": "你的官方冷淡回复", 
        "translation": "你的傲娇/深情潜台词", 
        "ruleText": "专属我的应对法则", 
        "ambient": "微小的细节监控与私人批注" 
    }`;
                    break;
              case 'intercept':
                    promptRule = `推演被系统拦截的 3-4段通讯记录。
【极其重要的规则】：这些记录必须是角色和**其他人、同事、朋友或NPC**的聊天！**绝对不能**是你和我（用户）之间的聊天记录！即使是群聊，群成员里也绝对不能有我！`;
                    schema = `[ { "isGroup": true/false, "name": "群名或单聊对象(不能是我)", "members": 3, "time": "时间", "preview": "最新消息预览", "flow":[ {"sender": "对方或群友", "time": "时间", "text": "消息内容", "isRight": false, "os": ""}, {"sender": "ME", "time": "时间", "text": "回复内容", "isRight": true, "os": "内心真实批注(红字，必须精简，禁止OOC，绝对不要超过20个字！)"} ] } ]`;
                    break;  
            }

            const prompt = `[系统最高优先指令：深度数据逆向解析]
你现在需要深度代入角色【${_char.name}】的思维逻辑。
你的核心人设：${_char.persona}
${worldBookContext ? `【附加世界观与背景设定】：\n${worldBookContext}\n` : ''}互动对象（我）：${_persona?.name || '用户'}
${userBg ? `对象的详细设定：${userBg}\n` : ''}【你们近期的聊天记录（极度重要，请提取最新情绪状态）】：
${historyText || '（暂无聊天记录）'}

【全局强制规则】：
1. 无论角色设定为何种国籍或母语，**所有生成的文本（包含聊天记录、内心独白、备忘录等）必须 100% 使用中文**，绝对禁止输出任何外语！
2. 文风要像真实的手机界面文本，切忌生硬的AI感。

【任务】：
${promptRule}

【严格输出格式】：
只返回以下 JSON 数据结构，绝对不能包含任何 markdown 代码块标记(\`\`\`json)或额外解释。必须是合法的 JSON！
${schema}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            let cleaned = response.replace(/```json|```/g, '').trim();
            // 使用正则寻找第一个出现的 { 或 [
const start = cleaned.search(/[\{\[]/);
// 寻找最后出现的 } 或 ] 的最大索引值
const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));

if (start === -1 || end === -1) throw new Error('大模型未返回合法 JSON');
const data = JSON.parse(cleaned.substring(start, end + 1));
            
            // 存入缓存，并写入数据库持久化
            _subjectDataCache[moduleKey] = data;
            await DB.settings.set(`subject-data-${_activeSubjectId}`, _subjectDataCache);

        } catch (e) {
            console.error(`[SubjectsModule] 生成 ${moduleKey} 数据失败:`, e);
            Toast.show(`推演失败，请重试`);
        } finally {
            _showLoading(false);
        }
    }

    // 通用获取数据方法 (如果缓存没有，就调取生成)
    async function _ensureModuleData(moduleKey) {
        if (!_subjectDataCache[moduleKey]) {
            await _generateModuleData(moduleKey);
        }
        return _subjectDataCache[moduleKey];
    }

    // ============================================================
    // 渲染各视图的方法
    // ============================================================

    // 1. Dashboard 渲染 (已移除独立 API 请求，直接拉取各模块的缓存)
    function _renderDashboard() {
        const d_browser = _subjectDataCache.browser;
        const d_music = _subjectDataCache.music;
        const d_intercept = _subjectDataCache.intercept;
        const d_time = _subjectDataCache.time;
        const d_notes = _subjectDataCache.notes;
        const d_receipt = _subjectDataCache.receipt;
        const d_care = _subjectDataCache.care;

        document.getElementById('dash-search-preview').innerText = d_browser?.[0]?.query || '...';
        document.getElementById('dash-music-title').innerText = d_music?.[0]?.title || '...';
        document.getElementById('dash-music-artist').innerText = d_music?.[0]?.artist || '...';
        
        let chatPreview = '...';
        if (d_intercept) {
            const single = d_intercept.single || (Array.isArray(d_intercept) ? (d_intercept.find(d => d.single)?.single || d_intercept[1]) : null);
            if (single?.preview) chatPreview = single.preview;
        }
        document.getElementById('dash-chat-preview').innerText = `“${chatPreview}”`;
        
        if (d_time?.totalNum) {
            const match = String(d_time.totalNum).match(/(\d+)[hH].*?(\d+)[mM]/);
            if (match) {
                document.getElementById('dash-screen-time').innerHTML = `${match[1]}<span>h</span> ${match[2]}<span>m</span>`;
            } else {
                document.getElementById('dash-screen-time').innerHTML = `<span style="font-size:20px; font-weight:800; letter-spacing:0">${d_time.totalNum}</span>`;
            }
        } else {
            document.getElementById('dash-screen-time').innerHTML = `0<span>h</span> 0<span>m</span>`;
        }
        
        document.getElementById('dash-notes-preview').innerHTML = d_notes?.todos?.[0]?.text?.replace(/\n/g, '<br>') || '...';
        document.getElementById('dash-receipt-desc').innerText = d_receipt?.items ? `包含 ${d_receipt.items.length} 项物品` : '0 Items Included';
        
        // 处理金额防错（兼容模型直接输出带¥符号的情况）
        let priceStr = '¥0.00';
        if (d_receipt?.total) {
            const num = parseFloat(String(d_receipt.total).replace(/[^\d.-]/g, ''));
            if (!isNaN(num)) priceStr = `¥${num.toFixed(2)}`;
            else priceStr = d_receipt.total;
        }
        document.getElementById('dash-receipt-price').innerText = priceStr;
        
        document.getElementById('dash-care-target').innerText = _persona?.name || '...';
        document.getElementById('dash-care-status').innerText = d_care?.monitoring ? d_care.monitoring.substring(0, 15) + '...' : '...';
        document.getElementById('dash-care-rating').innerText = d_care?.ruleText ? '档案已记录' : '...';
        
        // 生成一个虚假的编号
        document.getElementById('dash-care-no').innerText = `NO. ${String(Math.floor(Math.random()*99)).padStart(3,'0')}`;
    }
    
    // 唤起自定义弹窗的逻辑 (使用 Promise 实现异步拦截)
    function _showConfirmModal(title, desc) {
        return new Promise((resolve) => {
            const modal = document.getElementById('subjects-confirm-modal');
            if (!modal) return resolve(false);

            document.getElementById('sc-title').innerHTML = title;
            document.getElementById('sc-desc').innerHTML = desc;

            const btnCancel = document.getElementById('sc-btn-cancel');
            const btnConfirm = document.getElementById('sc-btn-confirm');

            // 通过克隆节点清除可能残留的旧点击事件
            const newBtnCancel = btnCancel.cloneNode(true);
            const newBtnConfirm = btnConfirm.cloneNode(true);
            btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
            btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

            const closePopup = (res) => {
                modal.classList.remove('active');
                setTimeout(() => resolve(res), 300); // 等待淡出动画结束后再往下走
            };

            newBtnCancel.addEventListener('click', () => closePopup(false));
            newBtnConfirm.addEventListener('click', () => closePopup(true));

            // 显示弹窗
            modal.classList.add('active');
        });
    }

    // 一键清空当前角色的所有生成缓存，并同步数据库
    async function refreshData() {
        if (!_activeSubjectId) return;
        
        // 唤起自定义弹窗并等待用户选择
        const confirmed = await _showConfirmModal(
            'System Reset', 
            '确认清空该角色的所有推演数据吗？<br>清除后，下次点击模块将重新进行 AI 推演。'
        );
        
        // 如果用户点了“取消”，直接退出
        if (!confirmed) return;
        
        // 1. 清空内存缓存
        _subjectDataCache = {};
        
        // 2. 覆盖数据库中的缓存
        await DB.settings.set(`subject-data-${_activeSubjectId}`, _subjectDataCache);
        
        // 3. 重新渲染首页（此时全部重置为点点点占位符）
        _renderDashboard();
        
        // 4. 弹出成功提示
        if (typeof Toast !== 'undefined') {
            Toast.show('数据已清空，点击各模块可重新生成');
        } else {
            alert('数据已清空，点击各模块可重新生成');
        }
    }

    // 2. Receipt 小票渲染
    async function _renderReceiptView() {
        const data = await _ensureModuleData('receipt');
        if (!data) return;

        document.getElementById('receipt-meta-date').innerHTML = `DATE: ${data.date}<br>TIME: ${data.time}`;
        document.getElementById('receipt-trx-id').innerText = data.trxId;

        const container = document.getElementById('receipt-items-container');
        container.innerHTML = (data.items ||[]).map((item, idx) => {
            const isAbandon = item.status.includes('ABANDON') || item.status.includes('OUT');
            const stamp = item.status.includes('ABANDON') ? '<div class="stamp-red">DENIED</div>' : '';
            return `
            <div class="item-group">
                ${stamp}
                <div class="item-row"><span>ITEM 0${idx+1}</span><span class="status-badge ${isAbandon ? 'abandon' : ''}">${item.status}</span></div>
                <div class="item-cn" style="${isAbandon ? 'color:#888;' : ''}">${item.name}</div>
                <div class="item-status">${item.desc}</div>
                <div class="item-row" style="margin-top: 6px; ${isAbandon ? 'color:#888;' : ''}">
                    <span>${item.qty} x $${parseFloat(item.price).toFixed(2)}</span>
                    <span style="${isAbandon ? 'text-decoration:line-through;' : ''}">$${parseFloat(item.total).toFixed(2)}</span>
                </div>
            </div>`;
        }).join('');

        document.getElementById('receipt-subtotal').innerText = `$${parseFloat(data.subtotal).toFixed(2)}`;
        document.getElementById('receipt-tax').innerText = `$${parseFloat(data.tax).toFixed(2)}`;
        document.getElementById('receipt-total').innerText = `$${parseFloat(data.total).toFixed(2)}`;
        document.getElementById('receipt-hw-bottom').innerText = data.hw || '';
        document.getElementById('receipt-photo-text').innerText = _char?.name || 'Subject';
    }

    // 3. Browser Logs 渲染
    async function _renderBrowserView() {
        const data = await _ensureModuleData('browser');
        if (!data) return;

        const container = document.getElementById('logs-list');
        container.innerHTML = (data ||[]).map((log, idx) => `
            <div class="log-item" onclick="SubjectsModule.openModal(${idx})">
                <div class="log-number">0${idx+1}</div>
                <div class="log-content">
                    <div class="log-query">${log.query}</div>
                    <div class="log-meta"><span>JUST NOW</span><span class="btn-view">VIEW</span></div>
                </div>
            </div>
        `).join('');

        // 初始化搜索框打字机文本
        if (data.length > 0) {
            document.getElementById('browser-top-typing').innerText = data[0].query;
        }
    }

    // 4. Music 渲染
    async function _renderMusicView() {
        const data = await _ensureModuleData('music');
        if (!data) return;

        const container = document.getElementById('ph-m-playlist-container');
        container.innerHTML = (data ||[]).map((track, idx) => `
            <div class="track-item ${idx === _currentTrackIndex ? 'active' : ''}" onclick="SubjectsModule.playTrack(${idx})">
                <div class="t-left">
                    <div class="t-name">${track.title}</div>
                    <div class="t-artist">${track.artist}</div>
                </div>
                <div class="t-right">
                    <div class="mood-tag">[ ${track.mood} ]</div>
                    <div class="playing-indicator"></div>
                </div>
            </div>
        `).join('');

        if (data.length > 0 && _currentTrackIndex === 0) {
            playTrack(0, true); // 强制刷新第一首
        }
    }
    
    // 5. Intercept 渲染 (动态数量支持)
    async function _renderInterceptView() {
        let data = await _ensureModuleData('intercept');
        if (!data) return;

        // 规范化数据：无论之前缓存的是对象还是新生成的数组，都转为数组
        let chatList =[];
        if (Array.isArray(data)) {
            chatList = data;
        } else if (typeof data === 'object') {
            chatList = Object.values(data).filter(d => d && typeof d === 'object' && d.name);
        }

        // 兜底防白屏
        if (chatList.length === 0) {
            chatList =[
                { isGroup: true, name: 'GROUP CHAT', time: 'JUST NOW', preview: '解析失败...', members: 3, flow: [] }
            ];
        }

        // 存回缓存，方便详情页按索引拉取
        _subjectDataCache.intercept_list = chatList;

        document.getElementById('intercept-log-count').innerText = `EXTRACTED: ${chatList.length} LOGS`;
        
        const container = document.getElementById('intercept-list-container');
        container.innerHTML = chatList.map((chat, idx) => {
            const isGroup = chat.isGroup || chat.members > 2;
            const avatarUrl = isGroup 
                ? "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=150&auto=format&fit=crop" 
                : "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=150&auto=format&fit=crop";
            
            return `
            <div class="ic-chat-card ${isGroup ? 'group' : ''}" onclick="SubjectsModule.openInterceptDetail(${idx})">
                ${isGroup ? '<div class="ic-chat-type">GROUP</div>' : ''}
                <div class="ic-avatar-box"><img src="${avatarUrl}" alt="avatar"></div>
                <div class="ic-chat-info">
                    <div class="ic-chat-name">${chat.name} <span class="time">${chat.time}</span></div>
                    <div class="ic-chat-preview">${chat.preview}</div>
                </div>
            </div>`;
        }).join('');
    }

    // 6. Time Fragments 渲染
    async function _renderTimeView() {
        const data = await _ensureModuleData('time');
        if (!data) return;

        document.getElementById('tf-total-num').innerText = data.totalNum || '0H 0M';
        
        const icons =['ph-instagram-logo', 'ph-map-pin', 'ph-chat-circle-text', 'ph-headphones'];
        const tapes =['left: 20%;', 'left: 80%;', '', 'left: 70%;'];
        const classes =['tf-card-1', 'tf-card-2', 'tf-card-3', 'tf-card-4'];

        const container = document.getElementById('tf-scrapboard-container');
        // 保留原有的 doodle 等背景元素，仅替换卡片
        const cardsHtml = (data.items ||[]).slice(0,4).map((item, idx) => `
            <div class="tf-flip-card-container ${classes[idx]}" onclick="this.classList.toggle('flipped')">
                <div class="tf-flip-card-inner">
                    <div class="tf-tape" style="${tapes[idx]}"></div>
                    <div class="tf-flip-card-front">
                        <div class="tf-fc-header">
                            <div class="tf-fc-app"><i class="ph-fill ${icons[idx]}"></i> ${item.app}</div>
                            <div class="tf-fc-time">${item.time}</div>
                        </div>
                        <div class="tf-fc-reason"><strong>Official Record：</strong><br>${item.reason}</div>
                        <div class="tf-fc-hint">Tap to uncover <i class="ph ph-arrow-right"></i></div>
                    </div>
                    <div class="tf-flip-card-back">
                        <div class="tf-fc-truth">${item.truth}</div>
                    </div>
                </div>
            </div>
        `).join('');

        // 重新拼接整个容器
        container.innerHTML = `
            <svg class="tf-doodles">
                <path d="M 150 160 C 200 180, 250 140, 280 180" class="tf-stroke-pen" stroke-dasharray="4 4" />
                <path d="M 100 480 C 150 520, 200 460, 250 500" class="tf-stroke-pen" />
            </svg>
            <i class="ph-fill ph-heart tf-floating-heart" style="top: 290px; right: 40px;"></i>
            <i class="ph-fill ph-sparkle tf-floating-heart" style="top: 100px; left: 30px; color: #8c7362; font-size: 20px;"></i>
            ${cardsHtml}
            <div class="tf-overlap-text tf-ot-1">always checking...</div>
            <div class="tf-pill-label tf-pill-1"><i class="ph ph-eye"></i> OBSERVE</div>
            <div class="tf-pill-label tf-pill-2">JEALOUS <i class="ph-fill ph-star"></i></div>
            <div class="tf-overlap-text tf-ot-2">so annoying</div>
        `;
    }

    // 7. Notes 渲染
    async function _renderNotesView() {
        const data = await _ensureModuleData('notes');
        if (!data) return;

        document.getElementById('notes-todo-list').innerHTML = (data.todos ||[]).map(t => `
            <div class="todo-item ${t.isStrike ? '' : 'checked'}">
                <div class="checkbox"></div>
                <div class="todo-text">
                    ${t.isStrike ? `<span class="text-strike">${t.text}</span>` : t.text}
                    ${t.breakdown ? `<br><span class="text-breakdown cn" style="color: var(--n-text-gray);">${t.breakdown}</span>` : ''}
                </div>
            </div>
        `).join('');

        if (data.risk) {
            document.getElementById('notes-risk-title').innerText = data.risk.title;
            document.getElementById('notes-pc-grid').innerHTML = `
                <div class="pc-col"><div class="pc-head">Pros</div>${(data.risk.pros||[]).map(p=>`<div class="pc-item">${p}</div>`).join('')}</div>
                <div class="pc-divider"></div>
                <div class="pc-col"><div class="pc-head">Cons</div>${(data.risk.cons||[]).map(c=>`<div class="pc-item">${c}</div>`).join('')}</div>
            `;
            document.getElementById('notes-risk-conclusion').innerHTML = data.risk.conclusion;
        }

        document.getElementById('notes-dict-list').innerHTML = (data.dict ||[]).map((d, idx) => `
            <div class="dict-item" onclick="SubjectsModule.toggleNotesDict(this)">
                <div class="dict-header">
                    <div class="dh-left"><span class="dh-num">0${idx+1}</span><span class="dh-title">${d.title}</span></div>
                    <i class="ph ph-plus dh-icon"></i>
                </div>
                <div class="dict-content">
                    <div class="dict-content-inner">
                        <p>
                            <span class="dict-official">${d.official}</span>
                            <span class="dict-note">${d.private}</span>
                        </p>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 8. Recommend 渲染
    async function _renderRecommendView() {
        const data = await _ensureModuleData('recommend');
        if (!data) return;

        const icons = { Gastronomy: 'ph-fork-knife', Cinematography: 'ph-film-strip', Publications: 'ph-book-open', 'Daily Essentials': 'ph-coffee' };
        
        document.getElementById('recommend-list-container').innerHTML = (data ||[]).map((item, idx) => {
            const icon = icons[item.category] || 'ph-star';
            
            // 绘制星星
            let starHtml = '';
            const score = parseFloat(item.score || 0);
            for(let i=1; i<=5; i++) {
                if (i <= score) starHtml += '✦ ';
                else starHtml += '<span class="dim">✧ </span>';
            }

            return `
            <div class="item-card" onclick="SubjectsModule.toggleRecommendCard(this)">
                <div class="card-top-bar">
                    <div class="category-tag"><i class="ph-fill ${icon}"></i> ${item.category}</div>
                    <div>ID. 00${idx+1}</div>
                </div>
                <div class="card-body">
                    <div class="item-title">${item.title}</div>
                    <div class="item-subtitle">${item.subtitle}</div>
                    <div class="metrics-grid">
                        <div class="metric"><span class="m-label">Score</span><span class="m-value stars">${starHtml}</span></div>
                        <div class="metric"><span class="m-label">${item.m1Label}</span><span class="m-value">${item.m1Val}</span></div>
                        <div class="metric"><span class="m-label">${item.m2Label}</span><span class="m-value">${item.m2Val}</span></div>
                        <div class="metric"><span class="m-label">${item.m3Label}</span><span class="m-value">${item.m3Val}</span></div>
                    </div>
                    <div class="official-review">${item.review}</div>
                    <button class="btn-reveal"><span>View Private Motif</span><i class="ph ph-caret-down"></i></button>
                </div>
                <div class="private-wrapper">
                    <div class="private-inner">
                        <div class="private-content">
                            <div class="private-tag">Private Analysis</div>
                            <div class="private-text">${item.private}</div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // 9. Mail 渲染
    async function _renderMailView() {
        const data = await _ensureModuleData('mail');
        if (!data) return;

        document.getElementById('mail-list-container').innerHTML = (data ||[]).map((mail, idx) => `
            <div class="mail-item" onclick="SubjectsModule.openMailDetail(${idx})">
                <div class="mi-top"><span class="mi-sender">${mail.sender}</span><span class="mi-time">${mail.time}</span></div>
                <div class="mi-subject">${mail.subject}</div>
                <div class="mi-preview">${mail.preview}</div>
            </div>
        `).join('');
    }

    // 10. Care Protocol 渲染
    async function _renderCareView() {
        const data = await _ensureModuleData('care');
        if (!data) return;

        // 动态设置面具头像或占位图标
        const careAvatar = document.getElementById('care-user-avatar');
        const careHeart = document.getElementById('care-heart-icon');
        if (_userAvatarUrl) {
            careAvatar.src = _userAvatarUrl;
            careAvatar.style.display = 'block';
            careHeart.style.display = 'none';
        } else {
            careAvatar.style.display = 'none';
            careHeart.style.display = 'block';
        }

        document.getElementById('care-sys-id').innerText = _char?.name || 'Subject_01';
        
        document.getElementById('care-label-1').innerText = data.ring1Label;
        document.getElementById('care-val-1').innerText = data.ring1Val;
        document.getElementById('care-label-2').innerText = data.ring2Label;
        document.getElementById('care-val-2').innerText = data.ring2Val;
        
        document.getElementById('care-monitoring-text').innerHTML = `"${data.monitoring}"`;
        document.getElementById('care-chat-user').innerHTML = data.chatUser;
        document.getElementById('care-chat-ai').innerHTML = `<i class="ph-fill ph-robot"></i> ${data.chatAi}`;
        document.getElementById('care-chat-translation').innerHTML = data.translation;
        
        document.getElementById('care-rule-text').innerHTML = data.ruleText;
        document.getElementById('care-ambient-text').innerHTML = data.ambient;
    }


    // ============================================================
    // 对外的视图切换与控制方法
    // ============================================================

    function _switchView(viewId, bgColor) {
        document.getElementById('subjects-screen').querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        document.getElementById('subjects-screen').style.backgroundColor = bgColor;
    }

    async function openDashboard(charId) {
        if (charId) {
            _activeSubjectId = charId;
            try {
                _char = await DB.characters.get(Number(charId));
                _charAvatarUrl = await Assets.getUrl(`char-avatar-${charId}`).catch(() => '') || '';
                
                // 获取绑定的面具头像
                const binding = await DB.bindings.get(String(charId)).catch(() => null);
                const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
                const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
                _persona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0];
                if (_persona && _persona.imgKey) {
                    _userAvatarUrl = await Assets.getUrl(_persona.imgKey).catch(() => '') || '';
                } else {
                    _userAvatarUrl = '';
                }

                // 读取已有缓存
                const savedData = await DB.settings.get(`subject-data-${charId}`);
                if (savedData) _subjectDataCache = savedData;
                else _subjectDataCache = {};

            } catch (e) {
                console.error(e);
            }
        }

        // 更新 Dashboard 基本 UI
        if (_char) {
            document.getElementById('dash-name-en').innerText = (_char.title || _char.name).replace(/[^a-zA-Z]/g, '').toUpperCase() || 'UNKNOWN';
            document.getElementById('dash-name-cn').innerText = _char.name;
            const avatarEl = document.getElementById('dash-avatar');
            if (avatarEl) avatarEl.src = _charAvatarUrl || 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=400&auto=format&fit=crop';
            
            // 补充：渲染首页观测手册的“我的”头像
            const dashUserAvatar = document.getElementById('dash-user-avatar');
            if (dashUserAvatar) {
                if (_userAvatarUrl) {
                    dashUserAvatar.src = _userAvatarUrl;
                    dashUserAvatar.style.display = 'block';
                } else {
                    dashUserAvatar.style.display = 'none';
                }
            }
        }

        _switchView('view-dashboard', 'var(--bg-light)');
        
        // 触发数据加载
        if (_activeSubjectId) {
            await _renderDashboard();
        }
    }

    function openArchive() {
        _activeSubjectId = null;
        _switchView('view-archive', 'var(--archive-bg)');
    }

    async function openReceipt() {
        await _renderReceiptView();
        _switchView('view-receipt', 'var(--bg-dark)');
        const paperWrapper = document.getElementById('receipt-paper-wrapper');
        if (paperWrapper) {
            paperWrapper.classList.remove('animate-print');
            void paperWrapper.offsetWidth; // 触发重绘
            paperWrapper.classList.add('animate-print');
        }
    }

    function closeReceipt() {
        _switchView('view-dashboard', 'var(--bg-light)');
    }

    async function openBrowserLogs() {
        await _renderBrowserView();
        _switchView('view-browser-logs', 'var(--bg-color)');
    }

    function openModal(index) {
        if (!_subjectDataCache.browser || !_subjectDataCache.browser[index]) return;
        const data = _subjectDataCache.browser[index];
        document.getElementById('modal-query').innerText = data.query;
        document.getElementById('modal-sys').innerText = data.sysResult;
        
        const osElement = document.getElementById('modal-os');
        osElement.innerHTML = data.innerOS;
        const rotate = (Math.random() * 4 - 2).toFixed(1); 
        osElement.style.transform = `rotate(${rotate}deg)`;

        setTimeout(() => {
            document.getElementById('detail-modal').classList.add('active');
        }, 50);
    }

    function closeModal() {
        document.getElementById('detail-modal').classList.remove('active');
    }

    async function openMusic() {
        await _renderMusicView();
        _switchView('view-music', '#080808');
        setTimeout(() => {
            document.getElementById('ph-m-waveform')?.classList.add('active');
            document.getElementById('ph-m-now-os')?.classList.add('active');
        }, 300);
    }

    function playTrack(index, force = false) {
        if (!force && _currentTrackIndex === index) return;
        _currentTrackIndex = index;
        
        const data = _subjectDataCache.music;
        if (!data || !data[index]) return;
        const track = data[index];

        // 重新渲染列表高亮
        const items = document.querySelectorAll('#ph-m-playlist-container .track-item');
        items.forEach((el, i) => {
            if (i === index) el.classList.add('active');
            else el.classList.remove('active');
        });

        const waveform = document.getElementById('ph-m-waveform');
        const osElement = document.getElementById('ph-m-now-os');
        const titleElement = document.getElementById('ph-m-now-title');
        const vinyl = document.getElementById('ph-m-vinyl');

        if(waveform) waveform.classList.remove('active');
        if(osElement) osElement.classList.remove('active');
        if(titleElement) titleElement.style.opacity = 0;
        if(vinyl) vinyl.style.animationDuration = '1s';

        setTimeout(() => {
            if(titleElement) { titleElement.innerText = track.title; titleElement.style.opacity = 1; }
            const artistEl = document.getElementById('ph-m-now-artist');
            if(artistEl) artistEl.innerText = track.artist;
            const moodEl = document.getElementById('ph-m-now-mood');
            if(moodEl) moodEl.innerText = track.mood;
            const coverEl = document.getElementById('ph-m-cover-text');
            if(coverEl) coverEl.innerText = track.coverText;
            const colorEl = document.getElementById('ph-m-vinyl-color');
            if(colorEl) colorEl.style.backgroundColor = track.labelColor || '#333';
            
            if(osElement) {
                osElement.innerHTML = track.os;
                osElement.classList.add('active');
            }
            if(waveform) waveform.classList.add('active'); 
            if(vinyl) vinyl.style.animationDuration = '4s'; 
        }, 300);
    }

    async function openInterceptList() {
        await _renderInterceptView();
        _switchView('view-intercept-list', '#f4f4f5');
    }

    function openInterceptDetail(index) {
        // 从刚才在列表页处理好的数组缓存里，按索引精确拿数据
        const chatList = _subjectDataCache.intercept_list;
        if (!chatList || !chatList[index]) {
            console.error('无法找到对应的聊天记录索引:', index);
            return;
        }
        const chatData = chatList[index];

        document.getElementById('ic-chat-title').innerHTML = `${chatData.name}<span>${chatData.members || 2} MEMBERS</span>`;
        
        const flowContainer = document.getElementById('ic-chat-flow');
        flowContainer.innerHTML = (chatData.flow || []).map((msg, idx) => {
            const align = msg.isRight ? 'right' : 'left';
            const osHtml = msg.os ? `<div class="ic-inner-os ic-os-${idx % 3 + 1}">${msg.os}</div>` : '';
            return `
            <div class="ic-msg-wrapper ${align}">
                <div class="ic-msg-meta">${msg.sender} // ${msg.time}</div>
                <div class="ic-bubble ${align}">
                    ${msg.text}
                </div>
                ${osHtml}
            </div>`;
        }).join('');

        _switchView('view-intercept-detail', '#f4f4f5');
        
        // 重置 Decode 开关状态，确保每次点进来都是关闭的
        const toggle = document.getElementById('ic-decode-toggle');
        if(toggle) toggle.checked = false;
        
        const view = document.getElementById('view-intercept-detail');
        if(view) view.classList.remove('decode-mode');
        
        const decodeText = document.getElementById('ic-decode-text');
        if(decodeText) {
            decodeText.classList.remove('active');
            decodeText.innerText = 'DECODE';
        }
    }

    function toggleDecode() {
        const view = document.getElementById('view-intercept-detail');
        const toggle = document.getElementById('ic-decode-toggle');
        const text = document.getElementById('ic-decode-text');
        
        if (toggle.checked) {
            view.classList.add('decode-mode');
            text.classList.add('active');
            text.innerText = 'UNLOCKED';
        } else {
            view.classList.remove('decode-mode');
            text.classList.remove('active');
            text.innerText = 'DECODE';
        }
    }
    
    async function openTimeFragments() {
        await _renderTimeView();
        _switchView('view-time-fragments', '#e9e4df');
        const cards = document.querySelectorAll('#view-time-fragments .tf-flip-card-container');
        cards.forEach(card => card.classList.remove('flipped'));
    }
    
    async function openNotes() {
        await _renderNotesView();
        _switchView('view-notes', '#f8f8f9');
    }

    function toggleNotesDict(element) {
        document.querySelectorAll('#view-notes .dict-item').forEach(el => { if(el !== element) el.classList.remove('active'); });
        element.classList.toggle('active');
    }
    
    async function openRecommend() {
        await _renderRecommendView();
        _switchView('view-recommend', '#f7f7f8');
    }

    function toggleRecommendCard(cardElement) {
        document.querySelectorAll('#view-recommend .item-card').forEach(card => {
            if (card !== cardElement) card.classList.remove('expanded');
        });
        cardElement.classList.toggle('expanded');
    }

    async function openMailApp() {
        await _renderMailView();
        document.getElementById('mail-detail-view').classList.remove('active');
        document.getElementById('mail-list-view').style.transform = 'translateX(0)';
        _switchView('view-mail', '#f9f9fa');
    }

    function openMailDetail(index) {
        const data = _subjectDataCache.mail;
        if (!data || !data[index]) return;
        const mail = data[index];

        document.getElementById('mail-subject').innerHTML = mail.subject;
        document.getElementById('mail-from').innerHTML = mail.fromHtml || `<strong>${mail.sender}</strong>`;
        document.getElementById('mail-date').innerText = mail.time;
        document.getElementById('mail-body').innerHTML = mail.bodyHtml;
        document.getElementById('mail-draft-target').innerHTML = mail.draftTarget;
        document.getElementById('mail-draft-content').innerHTML = mail.draftContent;

        document.getElementById('mail-list-view').style.transform = 'translateX(-30%)';
        document.getElementById('mail-detail-view').classList.add('active');
    }

    function closeMailDetail() {
        document.getElementById('mail-detail-view').classList.remove('active');
        document.getElementById('mail-list-view').style.transform = 'translateX(0)';
    }

    async function openCare() {
        await _renderCareView();
        _switchView('view-care', 'transparent');
    }

    // 🌟 加载真实的角色列表
    async function _loadRealCharacters() {
        try {
            const chars = await DB.characters.getAll();
            const container = document.getElementById('subjects-grid-container');
            if (!container) return;

            if (chars.length === 0) {
                container.innerHTML = '<div style="grid-column: span 2; text-align: center; font-size: 0.8rem; color: var(--text-dim); margin-top:40px;">暂无角色档案，请先在首页创建</div>';
                return;
            }

            let html = '';
            for (let i = 0; i < chars.length; i++) {
                const c = chars[i];
                let avatarUrl = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=400&auto=format&fit=crop';
                if (c.avatarUrl) avatarUrl = await Assets.getUrl(c.avatarUrl).catch(() => avatarUrl) || avatarUrl;
                else avatarUrl = await Assets.getUrl(`char-avatar-${c.id}`).catch(() => avatarUrl) || avatarUrl;

                const no = String(i + 1).padStart(2, '0');
                const pinyin = c.name.toUpperCase(); 
                const type = c.mbti ? c.mbti.toLowerCase() : 'ai node';

                const nameLen = c.name.length;
                const sigSize = nameLen <= 4 ? 34 : nameLen <= 6 ? 26 : nameLen <= 8 ? 20 : 15;
                const signatureHtml = pinyin 
                    ? `<div class="pinyin-tag">${pinyin}</div><div class="card-signature" style="font-size:${sigSize}px">${c.name}</div>`
                    : `<div class="card-signature" style="font-size:${sigSize}px">${c.name}</div>`;

                html += `
                    <div class="sub-card" onclick="SubjectsModule.openDashboard('${c.id}')">
                        <div class="card-top-bar">s u b j e c t s i u s e</div>
                        <div class="img-wrapper">
                            <img src="${avatarUrl}" alt="${c.name}" class="card-img">
                            <div class="card-number">${no}</div>
                        </div>
                        <div class="card-bottom">
                            ${signatureHtml}
                            <div class="card-footer">
                                <span class="card-type">${type}</span>
                                <i class="ph ph-dots-three-vertical dots-icon"></i>
                            </div>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = html;
        } catch(e) {
            console.error(e);
        }
    }

    // ============================================================
    // 暴露 API
    // ============================================================
    async function open() {
        // 🌟 核心修复：去掉 if (!_initialized) 的拦截
        // 让它每次点开查手机时，都强制去数据库重新拉取最新的角色列表！
        await _loadRealCharacters();
        _initialized = true; // 状态标记保留，防呆

        openArchive(); 
        document.getElementById('subjects-screen').classList.add('active');
    }

    function close() {
        document.getElementById('subjects-screen').classList.remove('active');
        _activeSubjectId = null;
    }

    return {
        open, close,
        openArchive, openDashboard, openReceipt, closeReceipt, 
        openBrowserLogs, openModal, closeModal,
        openMusic, playTrack,
        openInterceptList, openInterceptDetail, toggleDecode,
        openTimeFragments, openNotes, toggleNotesDict, 
        openRecommend, toggleRecommendCard,
        openMailApp, openMailDetail, closeMailDetail,
        openCare,refreshData
    };

})();

window.SubjectsModule = SubjectsModule;