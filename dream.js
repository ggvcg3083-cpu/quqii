/* ============================================================
   dream.js — ChillOS 做梦模块
   子模块，自注入 .device，DreamModule.open() 打开。
   依赖：DB.characters / DB.messages / DB.api / DB.assets / Assets
        ApiHelper.chatCompletion / NovelModule.generateImageBlob
        VoiceModule.synthesizeToAsset / PersonaModule(可选) / StoryMusic(可选)
   ============================================================ */
const DreamModule = (() => {
  let injected = false;
  let root = null;
  const state = { processing: false };

  // 省电模式：默认关。开启后减粒子、去光晕、限帧，缓解安卓卡顿
  const ECO_KEY = 'chill_dream_eco';
  let ecoMode = false;
  // 粒子引擎对外控制句柄（由 initParticles 填充）
  let particleEngine = null;

  // ---------- 样式 ----------
  const STYLE = `        /* =====================================================
           CSS 变量（来自梦境页）
           ===================================================== */
        #dream-root {
            --bg-silver: #dcdedc;
            --paper-white: #f5f5f5;
            --text-dark: #121212;
            --text-muted: #555555;
            --tag-bg: #1a1a1a;
            --font-typewriter: 'Special Elite', monospace;
            --font-gothic: 'Cinzel', serif;
            --font-serif: 'Noto Serif SC', serif;
            --tint-color: transparent;
        }

        /* =====================================================
           基础重置
           ===================================================== */
        #dream-root, #dream-root *, #dream-root *::before, #dream-root *::after {
            margin: 0; padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }
        #dream-root {
            width: 100%; height: 100%;
            overflow: hidden;
            font-family: var(--font-serif);
            user-select: none;
            -webkit-font-smoothing: antialiased;
            position: absolute; inset: 0; z-index: 5000;
        }

        /* =====================================================
           屏幕系统
           ===================================================== */
        #dream-root .app-screen {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
        }


        /* =====================================================
           SCREEN 1：角色星野（深色）
           ===================================================== */
        #dream-root #screen-chars {
            background-color: #03040b;
            z-index: 10;
        }

        #dream-root #bg-canvas {
            position: absolute;
            inset: 0;
            width: 100%; height: 100%;
            pointer-events: none;
        }

        #dream-root .ceiling-mask {
            position: absolute;
            top: -10vh; left: 0;
            width: 100vw; height: 25vh;
            background: linear-gradient(to bottom, rgba(30, 20, 50, 0.4) 0%, transparent 100%);
            filter: blur(20px);
            z-index: 1;
            pointer-events: none;
        }

        /* 返回按钮（左上角） */
        #dream-root #btn-char-back {
            position: absolute;
             top: max(20px, calc(env(safe-area-inset-top) + 10px));
            left: 20px;
            z-index: 20;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.6);
            font-family: var(--font-gothic);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 4px 0;
            transition: color 0.2s;
        }
        #btn-char-back i { font-size: 17px; }
        #btn-char-back:active { color: rgba(255,255,255,0.95); }

        /* 省电模式开关（右上角，呼应返回键） */
        #dream-root #btn-eco {
            position: absolute;
            top: max(20px, calc(env(safe-area-inset-top) + 10px));
            right: 20px;
            z-index: 20;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.35);
            font-family: var(--font-gothic);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 4px 0;
            transition: color 0.2s;
        }
        #dream-root #btn-eco i { font-size: 16px; }
        #dream-root #btn-eco:active { color: rgba(255,255,255,0.9); }
        /* 开启态：暖金高亮，跟梦境金色呼应 */
        #dream-root #btn-eco.on { color: rgba(255, 220, 130, 0.9); }

        /* 横向滚动 */
        #dream-root .scroll-gallery {
            position: absolute;
            inset: 0;
            z-index: 10;
            overflow-x: auto;
            overflow-y: hidden;
            -ms-overflow-style: none;
            scrollbar-width: none;
            scroll-snap-type: x mandatory;
            display: flex;
            align-items: flex-start;
        }
        .scroll-gallery::-webkit-scrollbar { display: none; }

        #dream-root .gallery-wrapper {
            display: inline-flex;
            align-items: flex-start;
            padding: 0 40vw;
            height: 100%;
        }

        /* 角色星辰单元 */
        #dream-root .chime-unit {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            scroll-snap-align: center;
            margin: 0 40px;
            transform-origin: top center;
            animation: sway var(--sway-time) infinite alternate ease-in-out;
        }
        @keyframes sway {
            0%   { transform: rotate(calc(var(--sway-deg) * -1)); }
            100% { transform: rotate(var(--sway-deg)); }
        }

        #dream-root .thread {
            width: 1px;
            height: var(--drop-height);
            background: linear-gradient(to bottom, transparent 0%, var(--thread-color) 100%);
            opacity: 0.8;
            box-shadow: 0 0 8px var(--thread-color);
        }

        #dream-root .orb-wrapper {
            position: relative;
            margin-top: -2px;
            cursor: pointer;
            transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .orb-wrapper:active { transform: scale(0.85); }

        #dream-root .orb {
            width: 64px; height: 64px;
            border-radius: 50%;
            background-size: cover;
            background-position: center;
            position: relative;
            z-index: 2;
            box-shadow: inset 0 0 20px rgba(0,0,0,0.6);
            transition: all 0.5s ease;
        }
        #dream-root .orb::after {
            content: '';
            position: absolute; inset: 0;
            border-radius: 50%;
            background: var(--tint-color);
            mix-blend-mode: overlay;
            transition: all 0.5s ease;
        }
        #dream-root .has-dream .orb {
            border: 2px solid rgba(255, 220, 100, 0.8);
            box-shadow: 0 0 40px rgba(255, 215, 0, 0.4), inset 0 0 15px rgba(255, 215, 0, 0.3);
        }
        .has-dream .orb::after { opacity: 0; }
        /* 有未读新梦：金框再加一层呼吸光，区别于已读的静态金色 */
        #dream-root .has-new .orb {
            animation: dreamPulse 2.4s ease-in-out infinite;
        }
        @keyframes dreamPulse {
            0%, 100% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.4), inset 0 0 15px rgba(255, 215, 0, 0.3); }
            50%      { box-shadow: 0 0 60px rgba(255, 215, 0, 0.75), inset 0 0 18px rgba(255, 215, 0, 0.45); }
        }
        #dream-root .no-dream .orb {
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 0 15px rgba(255, 255, 255, 0.1);
            filter: grayscale(30%) brightness(0.8);
        }
        .no-dream .orb::after { background: rgba(10, 20, 40, 0.6); }

        #dream-root .text-group {
            margin-top: 24px;
            display: flex; flex-direction: column; align-items: center;
            width: 160px;
        }
        #dream-root .char-name {
            color: rgba(255,255,255,0.95);
            font-size: 16px; letter-spacing: 6px;
            text-align: center;
            text-shadow: 0 2px 10px rgba(0,0,0,0.8);
            margin-left: 6px;
        }
        #dream-root .status-whisper {
            margin-top: 8px;
            font-size: 12px; letter-spacing: 2px;
            font-style: italic; text-align: center;
            transition: all 0.3s;
        }
        #dream-root .has-dream .status-whisper {
            color: #fde047; opacity: 1;
            text-shadow: 0 0 15px rgba(253, 224, 71, 0.6);
        }
        .no-dream .status-whisper { color: rgba(255,255,255,0.4); }

        #dream-root .click-halo {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            background: radial-gradient(circle, var(--halo-color) 0%, transparent 70%);
            width: 100%; height: 100%;
            opacity: 0;
            pointer-events: none;
            mix-blend-mode: screen;
        }
        #dream-root .click-halo.active {
            animation: halo-burst 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
        @keyframes halo-burst {
            0%   { width: 100%;  height: 100%;  opacity: 0.8; }
            100% { width: 400%;  height: 400%;  opacity: 0;   }
        }

        /* 进入梦境时星野淡出 */
        #dream-root #screen-chars.fading {
            animation: starFade 0.5s ease forwards;
        }
        @keyframes starFade {
            to { opacity: 0.3; }
        }


        /* =====================================================
           SCREEN 2：梦境日记（浅色）
           ===================================================== */
        #dream-root #screen-dreams {
            background-color: var(--bg-silver);
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.06'/%3E%3C/svg%3E");
            z-index: 20;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            /* 从屏幕底部滑入 */
            transform: translateY(100%);
            transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        #dream-root #screen-dreams.active {
            transform: translateY(0);
        }

        /* 内容居中容器 */
        #dream-root #app {
            width: 100%;
            max-width: 480px;
            margin: 0 auto;
            position: relative;
            color: var(--text-dark);
        }

        /* ----- view-list ----- */
        #dream-root #view-list {
            padding: max(70px, calc(env(safe-area-inset-top) + 60px)) 20px 80px;
            min-height: 100vh;
        }

        #dream-root .top-nav {
            position: absolute;
            top: max(20px, calc(env(safe-area-inset-top) + 10px));
            left: 20px; right: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 10;
        }

        #dream-root .nav-btn {
            background: transparent; border: none;
            color: var(--text-dark);
            font-size: 24px;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s;
        }
        .nav-btn:active { transform: scale(0.9); }

        /* 角色上下文 banner（嵌在 header 内） */
        #dream-root .char-context-strip {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 18px;
            padding-top: 18px;
            border-top: 1px solid rgba(0,0,0,0.12);
        }
        #dream-root .char-ctx-avatar {
            width: 30px; height: 30px;
            border-radius: 50%;
            background-size: cover;
            background-position: center;
            border: 1px solid #ccc;
            flex-shrink: 0;
        }
        #dream-root .char-ctx-name {
            font-family: var(--font-gothic);
            font-size: 11px; font-weight: 700;
            letter-spacing: 3px; text-transform: uppercase;
            color: var(--text-dark);
        }
        #dream-root .char-ctx-status {
            font-family: var(--font-serif);
            font-size: 11px;
            color: var(--text-muted);
            font-style: italic;
            margin-left: 4px;
        }

        #dream-root header {
            text-align: center;
            margin-bottom: 40px;
            position: relative;
            border-bottom: 2px solid var(--text-dark);
            padding-bottom: 20px;
        }
        #dream-root .header-meta {
            font-family: var(--font-typewriter);
            font-size: 10px; color: var(--text-muted);
            text-transform: uppercase; letter-spacing: 2px;
            margin-bottom: 10px;
        }
        #dream-root .title {
            font-family: var(--font-gothic);
            font-size: 46px; font-weight: 900;
            line-height: 1; letter-spacing: 6px;
            text-transform: uppercase; color: var(--text-dark);
            text-shadow: 2px 2px 0 rgba(255,255,255,0.7);
        }
        #dream-root .subtitle {
            font-family: var(--font-serif);
            font-size: 14px; font-weight: 700;
            color: var(--text-dark);
            margin-top: 8px; letter-spacing: 4px; font-style: italic;
        }
        #dream-root .btn-sleep {
            background: var(--text-dark); color: var(--paper-white);
            border: none; padding: 12px 24px;
            font-family: var(--font-serif); font-size: 13px;
            font-weight: 900; letter-spacing: 2px; cursor: pointer;
            margin-top: 30px;
            display: inline-flex; align-items: center; gap: 10px;
            box-shadow: 4px 4px 0 rgba(255,255,255,0.5);
            transition: transform 0.1s;
        }
        #dream-root .btn-sleep:active {
            transform: translate(2px, 2px);
            box-shadow: 2px 2px 0 rgba(255,255,255,0.5);
        }

        #dream-root #status-msg {
            font-family: var(--font-typewriter);
            font-size: 13px; color: var(--text-muted);
            text-align: center; margin-top: 40px;
            text-transform: uppercase;
        }

        #dream-root #dream-list {
            margin-top: 40px;
            display: flex; flex-direction: column; gap: 35px;
        }

        /* 梦境卡片 */
        #dream-root .dream-card {
            background-color: var(--paper-white);
            border: 1px solid #ccc; padding: 24px 20px;
            position: relative; cursor: pointer;
            box-shadow: 0 10px 25px rgba(0,0,0,0.05), inset 0 0 10px rgba(0,0,0,0.02);
            transition: transform 0.3s ease;
            animation: fadeIn 0.5s ease forwards;
        }
        .dream-card:active { transform: scale(0.98); }

        #dream-root .card-header {
            display: flex; justify-content: space-between; align-items: flex-start;
            margin-bottom: 20px;
        }
        #dream-root .moon-time {
            font-family: var(--font-typewriter); font-size: 11px;
            color: var(--text-muted); border-bottom: 1px solid #ddd;
            padding-bottom: 4px; display: flex; align-items: center; gap: 6px;
        }
        #dream-root .emotion-tag {
            background-color: var(--tag-bg); color: var(--paper-white);
            font-family: var(--font-typewriter); font-size: 10px;
            padding: 4px 8px; text-transform: uppercase; letter-spacing: 1px;
            box-shadow: 2px 2px 0 rgba(0,0,0,0.2);
            display: inline-flex; align-items: center; gap: 4px;
        }
        #dream-root .echo-text {
            font-family: var(--font-serif); font-size: 19px;
            font-weight: 900; line-height: 1.4; color: var(--text-dark);
            margin-bottom: 15px;
            background: rgba(255,255,255,0.9);
            display: inline;
            box-shadow: 2px 0 0 rgba(255,255,255,0.9), -2px 0 0 rgba(255,255,255,0.9);
        }
        #dream-root .card-snippet {
            font-family: var(--font-serif); font-size: 13px; line-height: 1.8;
            color: #444; margin-top: 15px;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden; text-align: justify;
        }
        .mini-aura { display: flex; gap: 4px; margin-top: 15px; }
        .mini-aura span { width: 12px; height: 4px; display: inline-block; }


        /* ----- view-detail ----- */
        #dream-root #view-detail {
            display: none;
            position: absolute; /* <--- 【修改这里】把 fixed 改成 absolute */
            top: 0; left: 50%;
            transform: translateX(-50%);
            width: 100%; max-width: 480px;
            height: 100%; height: 100dvh;
            background-color: var(--paper-white);
            z-index: 100;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }
        #dream-root #view-detail.active {
            display: block;
            animation: slideInUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        #dream-root .detail-nav {
            display: flex; align-items: center;
            padding: max(20px, calc(env(safe-area-inset-top) + 10px)) 20px 20px;
            background-color: var(--paper-white);
            position: sticky; top: 0; z-index: 20;
            border-bottom: 1px solid #eaeaea;
        }
        #dream-root .detail-nav .nav-btn {
            font-family: var(--font-gothic); font-size: 14px;
            font-weight: bold; gap: 6px; letter-spacing: 1px;
        }

        .modal-photo-wrap { width: 100%; position: relative; }
        #dream-root .modal-photo {
            width: 100%; max-height: 320px;
            object-fit: cover; display: block;
        }
        .aura-palette { display: flex; height: 8px; width: 100%; }
        .aura-color { flex: 1; }

        #dream-root .detail-body {
            padding: 25px 25px 0 25px;
            display: flex; flex-direction: column;
        }
        .detail-header { 
            margin-bottom: 30px; 
            padding-bottom: 30px; /* 撑开下方的空间 */
            position: relative;
            border-bottom: 1px dashed rgba(0,0,0,0.15); /* 加一条优雅的虚线 */
        }
        /* 在虚线正中间盖一个小星星 ✦ */
        .detail-header::after {
            content: '✦';
            position: absolute;
            bottom: -9px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 14px;
            color: var(--text-dark);
            background: var(--paper-white); /* 盖住背后的虚线 */
            padding: 0 15px;
        }
        
        #dream-root .dream-meta-info {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 15px;
        }
        #dream-root .lucidity-level {
            font-family: var(--font-serif); font-size: 11px;
            color: var(--text-muted); letter-spacing: 2px;
        }
        .lucidity-level span { color: var(--text-dark); margin-left: 4px; }
        
        #dream-root .modal-echo {
            font-size: 22px; font-weight: 900;
            line-height: 1.4; color: var(--text-dark);
            text-align: justify; /* 让标题两端对齐，右边不会空出一大块 */
        }

        /* 主播放器 */
        #dream-root .audio-luxury-player {
            display: flex; align-items: center; gap: 18px;
            padding: 16px 0; margin-bottom: 28px;
            border-top: 1px dashed #d0d0d0;
            border-bottom: 1px dashed #d0d0d0;
        }
        #dream-root .luxury-play-ring {
            position: relative; width: 42px; height: 42px;
            display: flex; justify-content: center; align-items: center;
            cursor: pointer; color: var(--text-dark);
            transition: opacity 0.2s;
        }
        .luxury-play-ring:active { opacity: 0.6; }
        .luxury-play-ring i { font-size: 18px; z-index: 2; }
        #dream-root .spin-ring {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            border: 1px solid #bbb; border-radius: 50%;
            border-left-color: transparent; border-right-color: transparent;
            transition: all 0.3s;
        }
        #dream-root .spin-ring.playing {
            border-color: var(--text-dark);
            border-left-color: transparent; border-right-color: transparent;
            animation: slowSpin 3s linear infinite;
        }
        #dream-root .luxury-audio-info {
            flex: 1; display: flex; flex-direction: column; gap: 10px;
        }
        #dream-root .luxury-audio-title {
            font-family: var(--font-gothic); font-size: 12px;
            font-weight: 700; letter-spacing: 3px; color: var(--text-dark);
        }
        #dream-root .luxury-progress-track {
            width: 100%; height: 1px; background: #e0e0e0; position: relative;
        }
        #dream-root .luxury-progress-fill {
            position: absolute; left: 0; top: 0;
            height: 100%; background: var(--text-dark); width: 0%;
            box-shadow: 0 0 6px 1px var(--text-dark);
        }
        #dream-root .progress-sparkle {
            position: absolute; right: -6px; top: -7px;
            font-size: 12px; color: var(--text-dark); line-height: 1;
            text-shadow: 0 0 6px var(--text-dark);
        }
        #dream-root .luxury-audio-time {
            font-family: var(--font-typewriter); font-size: 11px;
            color: var(--text-muted); min-width: 40px; text-align: right;
        }

        /* 正文区 */
        .text-content-area { padding-bottom: 30px; }
        #dream-root .modal-content-text {
            font-size: 14px; line-height: 1.8; color: #2a2a2a; text-align: justify;
        }
       #dream-root .modal-content-text::first-letter {
            float: left;
            font-family: var(--font-gothic); 
            font-size: 3.2rem; /* 稍微缩小一点点 */
            line-height: 1;    /* 恢复正常行高，防止溢出框体往上顶 */
            margin-right: 10px; 
            margin-top: 6px;   /* 稍微往下压，和第一行的文字对齐 */
            font-weight: 900; 
            color: var(--text-dark);
        }

        /* 现实锚点 */
        #dream-root .origins-box {
            border-top: 1px solid #ddd;
            padding: 25px; background: #fafafa;
        }
        #dream-root .origins-title {
            font-family: var(--font-gothic); font-size: 12px; color: #666;
            margin-bottom: 12px; text-transform: uppercase;
            letter-spacing: 2px; font-weight: bold;
        }
        .origins-list { list-style: none; }
        #dream-root .origins-list li {
            font-family: var(--font-serif); font-size: 12px; color: #444;
            margin-bottom: 6px;
            display: flex; align-items: flex-start; gap: 8px; line-height: 1.5;
        }
        .origins-list li::before { content: '✦'; font-size: 10px; color: var(--text-dark); margin-top: 2px; }

        /* 梦中呓语 */
        #dream-root .whispers-box {
            padding: 30px 25px 50px 25px;
            background: #fdfdfd;
            border-top: 1px dashed #dcdcdc;
        }
        #dream-root .voice-bar {
            border: 1px solid #e0e0e0; background: #ffffff;
            padding: 10px 14px;
            display: flex; align-items: center; gap: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.02);
        }
        #dream-root .btn-whisper-play {
            width: 32px; height: 32px; border-radius: 50%;
            border: 1px solid var(--text-dark); background: transparent;
            color: var(--text-dark);
            display: flex; justify-content: center; align-items: center;
            cursor: pointer; transition: all 0.3s;
        }
        .btn-whisper-play:active { background: #f0f0f0; }
        #dream-root .voice-track-container {
            flex: 1; position: relative; height: 24px;
            display: flex; align-items: center;
        }
        #dream-root .voice-progress-bg {
            position: absolute; left: 0; top: 50%;
            width: 100%; height: 1px; background: #eee;
        }
        #dream-root .voice-progress-fill {
            position: absolute; left: 0; top: 50%;
            width: 0%; height: 1px; background: var(--text-dark);
            transition: width 0.1s linear;
            box-shadow: 0 0 6px 1px var(--text-dark);
        }
        #dream-root .voice-wave {
            position: absolute; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: space-evenly;
            opacity: 0; transition: opacity 0.3s; pointer-events: none;
        }
        #dream-root .voice-wave.is-playing { opacity: 1; }
        #dream-root .wave-line {
            width: 1px; height: 2px;
            background-color: #888; border-radius: 1px;
        }
        .voice-wave.is-playing .wave-line { animation: voiceDance 1s infinite alternate ease-in-out; }
        .voice-wave.is-playing .wave-line:nth-child(1) { animation-delay: 0.0s; }
        .voice-wave.is-playing .wave-line:nth-child(2) { animation-delay: 0.2s; }
        .voice-wave.is-playing .wave-line:nth-child(3) { animation-delay: 0.4s; }
        .voice-wave.is-playing .wave-line:nth-child(4) { animation-delay: 0.1s; }
        .voice-wave.is-playing .wave-line:nth-child(5) { animation-delay: 0.5s; }
        .voice-wave.is-playing .wave-line:nth-child(6) { animation-delay: 0.3s; }
        .voice-wave.is-playing .wave-line:nth-child(7) { animation-delay: 0.6s; }
        #dream-root .voice-time {
            font-family: var(--font-typewriter); font-size: 11px;
            color: var(--text-muted); min-width: 32px; text-align: right;
        }
        #dream-root .btn-transcript-toggle {
            width: 100%; background: none; border: none;
            padding: 16px 0 0 0;
            display: flex; justify-content: space-between; align-items: center;
            font-family: var(--font-gothic); font-size: 10px;
            letter-spacing: 1px; text-transform: uppercase; color: #666; cursor: pointer;
        }
        #dream-root .transcript-content {
            max-height: 0; overflow: hidden;
            transition: max-height 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s;
            opacity: 0;
        }
        #dream-root .transcript-content.open { max-height: 300px; opacity: 1; }
        #dream-root .transcript-text {
            margin-top: 15px; padding-left: 12px;
            border-left: 1px solid #121212;
            font-family: var(--font-serif); font-size: 13px;
            line-height: 1.8; color: var(--text-dark); font-style: italic;
        }

        /* =====================================================
           动画关键帧
           ===================================================== */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(15px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInUp {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes voiceDance {
            0%   { height: 2px;  opacity: 0.3; }
            100% { height: 14px; opacity: 1; }
        }
        @keyframes slowSpin { 100% { transform: rotate(360deg); } }


        /* ===== 设置弹窗（做梦模块自加）===== */
        #dream-root .dream-settings-mask{position:absolute;inset:0;z-index:9000;background:rgba(0,0,0,.55);
            backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;}
        #dream-root .dream-settings-mask.active{display:flex;animation:fadeIn .25s ease;}
        #dream-root .dream-settings-card{width:300px;max-width:84%;background:var(--paper-white);border-radius:20px;
            padding:26px 24px 22px;box-shadow:0 24px 60px rgba(0,0,0,.4);font-family:var(--font-serif);color:var(--text-dark);}
        #dream-root .ds-title{font-family:var(--font-gothic);font-size:19px;font-weight:700;letter-spacing:1px;margin-bottom:4px;}
        #dream-root .ds-sub{font-family:var(--font-typewriter);font-size:11px;color:var(--text-muted);margin-bottom:20px;letter-spacing:1px;}
        #dream-root .ds-row{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-top:1px solid rgba(0,0,0,.08);}
        #dream-root .ds-row-label{display:flex;flex-direction:column;gap:2px;}
        #dream-root .ds-row-cn{font-size:14px;font-weight:500;}
        #dream-root .ds-row-en{font-family:var(--font-typewriter);font-size:10px;color:var(--text-muted);letter-spacing:.5px;}
        #dream-root .ds-toggle{width:46px;height:26px;border-radius:13px;background:#ccc;position:relative;cursor:pointer;
            transition:background .25s;flex-shrink:0;}
        #dream-root .ds-toggle::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;
            background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .25s;}
        #dream-root .ds-toggle.on{background:var(--tag-bg);}
        #dream-root .ds-toggle.on::after{transform:translateX(20px);}
        #dream-root .ds-done{margin-top:22px;width:100%;padding:12px;border:none;border-radius:12px;background:var(--tag-bg);
            color:#fff;font-family:var(--font-gothic);font-size:14px;font-weight:700;letter-spacing:2px;cursor:pointer;}
        #dream-root .ds-done:active{transform:scale(.97);}
        /* 可展开配置区 */
        #dream-root .ds-config{max-height:0;overflow:hidden;transition:max-height .3s ease;}
        #dream-root .ds-config.open{max-height:320px;}
        #dream-root .ds-config-inner{padding:10px 0 4px;display:flex;flex-direction:column;gap:10px;}
        #dream-root .ds-field-label{font-family:var(--font-typewriter);font-size:10px;color:var(--text-muted);
            letter-spacing:.5px;margin-bottom:4px;text-transform:uppercase;}
        #dream-root .ds-input,#dream-root .ds-textarea{width:100%;border:none;border-bottom:1px solid rgba(0,0,0,.18);
            background:transparent;font-family:var(--font-serif);font-size:13px;color:var(--text-dark);
            padding:6px 2px;outline:none;resize:none;}
        #dream-root .ds-textarea{border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:8px;line-height:1.5;}
        #dream-root .ds-input::placeholder,#dream-root .ds-textarea::placeholder{color:#bbb;}
        #dream-root .ds-config-hint{font-size:10px;color:var(--text-muted);line-height:1.5;}
        #dream-root .ds-gear-mini{font-size:11px;color:#3a6ea5;cursor:pointer;margin-left:6px;opacity:.8;}
        #dream-root .ds-gear-mini:active{opacity:.5;}
`;

  // ---------- 结构 ----------
  const HTML = `    <div id="screen-chars" class="app-screen">

        <canvas id="bg-canvas"></canvas>
        <div class="ceiling-mask"></div>

        <!-- 左上角返回按钮 -->
        <button id="btn-char-back" >
            <i class="ph-bold ph-caret-left"></i> Back
        </button>

        <!-- 右上角省电模式开关（默认关，安卓卡顿用） -->
        <button id="btn-eco" aria-label="省电模式" title="省电模式：减轻卡顿">
            <i class="ph ph-leaf"></i> <span id="eco-label">Eco</span>
        </button>

        <!-- 横向滚动角色区 -->
        <div class="scroll-gallery" id="scrollContainer">
            <div class="gallery-wrapper" id="galleryWrapper"></div>
        </div>

    </div>


    <!-- ====================================================
         SCREEN 2：梦境日记
         ==================================================== -->
    <div id="screen-dreams" class="app-screen">
        <div id="app">

            <!-- 视图 1：梦境列表 -->
            <div id="view-list">
                <nav class="top-nav">
                    <button class="nav-btn" id="btn-back-to-chars" aria-label="返回角色列表">
                        <i class="ph-bold ph-caret-left"></i>
                    </button>
                    <button class="nav-btn" id="dream-settings-btn" aria-label="设置">
                        <i class="ph-bold ph-gear"></i>
                    </button>
                </nav>

                <header>
                    <div class="header-meta">Vol. 01 — Subconscious Fragments</div>
                    <div class="title">Somnium</div>
                    <div class="subtitle">夜 想 曲</div>

                    <!-- 角色 banner -->
                    <div class="char-context-strip">
                        <div class="char-ctx-avatar" id="char-ctx-avatar"></div>
                        <div>
                            <span class="char-ctx-name" id="char-ctx-name"></span>
                            <span class="char-ctx-status" id="char-ctx-status"></span>
                        </div>
                    </div>

                    <button class="btn-sleep" id="btn-sleep">
                        <i class="ph-fill ph-moon-stars" style="font-size:18px;"></i> 潜入梦境
                    </button>
                </header>

                <div id="status-msg">No echoes found. Close your eyes.</div>
                <div id="dream-list"></div>
            </div>

            <!-- 视图 2：梦境详情（fixed overlay） -->
            <div id="view-detail">
                <nav class="detail-nav">
                    <button class="nav-btn" id="btn-back" style="font-family:var(--font-gothic);font-size:14px;font-weight:bold;gap:6px;letter-spacing:1px;">
                        <i class="ph-bold ph-caret-left"></i> BACK
                    </button>
                    <button class="nav-btn" id="btn-dream-del" aria-label="删除这个梦" style="margin-left:auto;color:#b84242;font-size:18px;">
                        <i class="ph ph-trash"></i>
                    </button>
                </nav>

                <div class="modal-photo-wrap" id="m-photo-wrap" style="display:none;">
                    <img src="" class="modal-photo" id="m-img" alt="Dream Snapshot">
                    <div class="aura-palette" id="m-aura"></div>
                </div>

                <div class="detail-body">
                    <div class="detail-header">
                        <div class="dream-meta-info">
                            <div class="emotion-tag" id="m-tag"><i class="ph-fill ph-tag"></i> <span></span></div>
                            <div class="lucidity-level" id="m-lucidity"></div>
                        </div>
                        <div class="modal-echo" id="m-echo"></div>
                    </div>

                    <div class="audio-luxury-player" id="m-player" style="display:none;">
                        <div class="luxury-play-ring" id="btn-playToggle">
                            <div class="spin-ring" id="play-spin-ring"></div>
                            <i class="ph-fill ph-play" id="play-icon"></i>
                        </div>
                        <div class="luxury-audio-info">
                            <div class="luxury-audio-title" id="m-track">SOUNDSCAPE 01</div>
                            <div class="luxury-progress-track">
                                <div class="luxury-progress-fill" id="player-progress">
                                    <span class="progress-sparkle">✦</span>
                                </div>
                            </div>
                        </div>
                        <div class="luxury-audio-time" id="player-time">00:00</div>
                    </div>

                    <div class="text-content-area">
                        <div class="modal-content-text" id="m-content"></div>
                    </div>
                </div>

                <div class="origins-box">
                    <div class="origins-title">Anchors / 现实锚点</div>
                    <ul class="origins-list" id="m-origins"></ul>
                </div>

                <div class="whispers-box" id="m-whispers-box" style="display:none;">
                    <div class="origins-title" style="margin-bottom:12px;">Echoes / 梦中呓语</div>
                    <div class="voice-bar">
                        <button class="btn-whisper-play" id="btn-whisper-play">
                            <i class="ph-fill ph-play" id="w-play-icon"></i>
                        </button>
                        <div class="voice-track-container">
                            <div class="voice-progress-bg"></div>
                            <div class="voice-progress-fill" id="w-progress"></div>
                            <div class="voice-wave" id="w-wave">
                                <span class="wave-line"></span><span class="wave-line"></span>
                                <span class="wave-line"></span><span class="wave-line"></span>
                                <span class="wave-line"></span><span class="wave-line"></span>
                                <span class="wave-line"></span>
                            </div>
                        </div>
                        <div class="voice-time" id="w-time">00:00</div>
                    </div>
                    <button class="btn-transcript-toggle" id="btn-transcript-toggle">
                        Reveal Transcript <i class="ph-bold ph-plus" id="w-toggle-icon"></i>
                    </button>
                    <div class="transcript-content" id="w-transcript">
                        <div class="transcript-text" id="m-whisper-text"></div>
                    </div>
                </div>

            </div><!-- /view-detail -->

        </div><!-- /app -->

    <!-- 设置弹窗（居中） -->
    <div class="dream-settings-mask" id="dream-settings-mask">
        <div class="dream-settings-card">
            <div class="ds-title">Dream Settings</div>
            <div class="ds-sub">做 梦 偏 好</div>
            <div class="ds-row">
                <div class="ds-row-label">
                    <span class="ds-row-cn">生成配图 <i class="ph-bold ph-sliders-horizontal ds-gear-mini" id="ds-cfg-image" title="提示词"></i></span>
                    <span class="ds-row-en">Dream Image</span>
                </div>
                <div class="ds-toggle" id="ds-toggle-image" data-key="image"></div>
            </div>
            <div class="ds-config" id="ds-config-image">
                <div class="ds-config-inner">
                    <div>
                        <div class="ds-field-label">正向提示词 / Positive（画风前缀）</div>
                        <textarea class="ds-textarea" id="ds-img-pos" rows="2" placeholder="选填。梦境专属画风/质感前缀，英文逗号分隔。留空则用「生图设置」的全局正向词。"></textarea>
                    </div>
                    <div>
                        <div class="ds-field-label">负向提示词 / Negative</div>
                        <textarea class="ds-textarea" id="ds-img-neg" rows="2" placeholder="选填。留空则用生图设置的全局负向词。"></textarea>
                    </div>
                </div>
            </div>

            <div class="ds-row">
                <div class="ds-row-label">
                    <span class="ds-row-cn">梦境配乐 <i class="ph-bold ph-sliders-horizontal ds-gear-mini" id="ds-cfg-music" title="API / Cookie"></i></span>
                    <span class="ds-row-en">Soundscape (NetEase)</span>
                </div>
                <div class="ds-toggle" id="ds-toggle-music" data-key="music"></div>
            </div>
            <div class="ds-config" id="ds-config-music">
                <div class="ds-config-inner">
                    <div>
                        <div class="ds-field-label">网易云 API 地址</div>
                        <input class="ds-input" id="ds-music-api" type="text" placeholder="如 https://your-netease-api.vercel.app">
                    </div>
                    <div>
                        <div class="ds-field-label">Cookie（MUSIC_U）</div>
                        <textarea class="ds-textarea" id="ds-music-cookie" rows="2" placeholder="网易云登录后的 Cookie，用于抓取需要会员/登录的歌曲。"></textarea>
                    </div>
                    <div class="ds-config-hint">填好后打开上面的开关即可。配乐由网易云抓取真实歌曲。</div>
                </div>
            </div>

            <div class="ds-row">
                <div class="ds-row-label">
                    <span class="ds-row-cn">生成呓语</span>
                    <span class="ds-row-en">Whisper (TTS)</span>
                </div>
                <div class="ds-toggle" id="ds-toggle-whisper" data-key="whisper"></div>
            </div>
            <button class="ds-done" id="ds-done-btn">DONE</button>
        </div>
    </div>
    </div><!-- /screen-dreams -->
`;

  /* 注入到 .device */
  function inject() {
    if (injected) return;
    const device = document.querySelector('.device');
    if (!device) { console.error('[Dream] .device not found'); return; }

    const style = document.createElement('style');
    style.id = 'dream-style';
    style.textContent = STYLE;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.id = 'dream-root';
    root.style.display = 'none';
    root.innerHTML = HTML;
    device.appendChild(root);

    injected = true;
    initParticles();
    bindAll();
  }

  /* ================================================================
     1. 粒子引擎（角色星野背景）
     ================================================================ */
  function initParticles() {
    const canvas = root.querySelector('#bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    let fireflies = [], nebulas = [], meteors = [];
    let rafId = null;
    let running = false;
    let lastFrame = 0;

    // 当前档位参数
    function tier() {
      return ecoMode
        ? { fireflyCount: 45, nebulaCount: 4, meteorCount: 2, glow: false, fps: 30, lighter: false }
        : { fireflyCount: 150, nebulaCount: 8, meteorCount: 3, glow: true, fps: 60, lighter: true };
    }

    // —— 预渲染发光精灵：把「带光晕的点」画一次到离屏 canvas，之后 drawImage 贴，
    //    彻底避免每帧 shadowBlur（安卓最贵的操作）——
    const spriteCache = {}; // key: `${colorKey}` -> canvas
    function getGlowSprite(rgb, glow) {
      const key = rgb + (glow ? '_g' : '_p');
      if (spriteCache[key]) return spriteCache[key];
      const S = glow ? 16 : 6;        // 精灵尺寸：发光版留出光晕余量
      const oc = document.createElement('canvas');
      oc.width = oc.height = S;
      const octx = oc.getContext('2d');
      const cx = S / 2;
      if (glow) {
        const g = octx.createRadialGradient(cx, cx, 0, cx, cx, cx);
        g.addColorStop(0,   `rgba(${rgb},1)`);
        g.addColorStop(0.4, `rgba(${rgb},0.6)`);
        g.addColorStop(1,   `rgba(${rgb},0)`);
        octx.fillStyle = g;
        octx.fillRect(0, 0, S, S);
      } else {
        // 省电：实心小圆，无光晕
        octx.beginPath();
        octx.arc(cx, cx, cx - 1, 0, Math.PI * 2);
        octx.fillStyle = `rgba(${rgb},0.9)`;
        octx.fill();
      }
      spriteCache[key] = oc;
      return oc;
    }

    function resize() {
      const r = root.getBoundingClientRect();
      width = canvas.width = r.width || 390;
      height = canvas.height = r.height || 844;
      // 尺寸变了，星云渐变缓存失效，重建
      nebulas.forEach(n => n._buildGradient && n._buildGradient());
    }
    window.removeEventListener('resize', resize); // 防多次 init 叠加监听
    window.addEventListener('resize', resize);

      class Firefly {
          constructor() { this.reset(); this.y = Math.random() * height; }
          reset() {
              this.x      = Math.random() * width;
              this.y      = height + Math.random() * 100;
              this.size   = Math.random() * 1.5 + 0.5;
              const isGold = Math.random() > 0.7;
              this.rgb     = isGold ? '255,230,100' : '255,255,255';
              this.alpha   = isGold ? (Math.random() * 0.8 + 0.2) : (Math.random() * 0.5 + 0.1);
              this.speedY  = -(Math.random() * 0.3 + 0.1);
              this.speedX  = (Math.random() - 0.5) * 0.2;
              this.angle   = Math.random() * Math.PI * 2;
              this.swing   = Math.random() * 0.5;
          }
          update() {
              this.y += this.speedY;
              this.angle += 0.02;
              this.x += Math.sin(this.angle) * this.swing + this.speedX;
              if (this.y < -10) this.reset();
          }
          draw(glow) {
              const sprite = getGlowSprite(this.rgb, glow);
              const d = this.size * (glow ? 6 : 3);  // 贴图直径
              ctx.globalAlpha = this.alpha;
              ctx.drawImage(sprite, this.x - d / 2, this.y - d / 2, d, d);
              ctx.globalAlpha = 1;
          }
      }

      class Nebula {
          constructor() {
              this.x = Math.random() * width;
              this.y = Math.random() * height;
              this.radius = Math.random() * 200 + 150;
              const colors = ['rgba(58,28,94,0.03)','rgba(27,39,85,0.04)','rgba(74,28,64,0.02)'];
              this.color = colors[Math.floor(Math.random() * colors.length)];
              this.vx = (Math.random() - 0.5) * 0.2;
              this.vy = (Math.random() - 0.5) * 0.2;
              this._grad = null;
              this._buildGradient();
          }
          // 渐变只在创建/resize 时建一次，不每帧重建
          _buildGradient() {
              const g = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
              g.addColorStop(0, this.color); g.addColorStop(1, 'transparent');
              this._grad = g;
          }
          update() {
              this.x += this.vx; this.y += this.vy;
              if (this.x < -this.radius || this.x > width  + this.radius) this.vx *= -1;
              if (this.y < -this.radius || this.y > height + this.radius) this.vy *= -1;
          }
          draw() {
              // 用 translate 把缓存渐变搬到当前位置
              ctx.save();
              ctx.translate(this.x, this.y);
              ctx.fillStyle = this._grad;
              ctx.beginPath();
              ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
          }
      }

      class Meteor {
          constructor() { this.reset(); }
          reset() {
              this.active  = false;
              this.x       = Math.random() * width * 1.5;
              this.y       = -(Math.random() * 200);
              this.length  = Math.random() * 80 + 40;
              this.speed   = Math.random() * 5 + 3;
              this.vx      = -this.speed;
              this.vy      =  this.speed;
              this.opacity = 0;
          }
          spawn() { this.reset(); this.active = true; this.opacity = 1; }
          update() {
              if (!this.active) return;
              this.x += this.vx; this.y += this.vy;
              this.opacity -= 0.01;
              if (this.opacity <= 0 || this.x < -100 || this.y > height + 100) this.active = false;
          }
          draw() {
              if (!this.active) return;
              ctx.beginPath();
              ctx.moveTo(this.x, this.y);
              ctx.lineTo(this.x - this.vx * this.length * 0.2, this.y - this.vy * this.length * 0.2);
              const g = ctx.createLinearGradient(
                  this.x, this.y,
                  this.x - this.vx * this.length * 0.2,
                  this.y - this.vy * this.length * 0.2
              );
              g.addColorStop(0, `rgba(255,255,255,${this.opacity})`);
              g.addColorStop(1, 'transparent');
              ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.stroke();
          }
      }

    // 按当前档位（重）建粒子
    function build() {
      resize();
      const t = tier();
      fireflies = []; nebulas = []; meteors = [];
      for (let i = 0; i < t.fireflyCount; i++) fireflies.push(new Firefly());
      for (let i = 0; i < t.nebulaCount;  i++) nebulas.push(new Nebula());
      for (let i = 0; i < t.meteorCount;  i++) meteors.push(new Meteor());
    }

    function frame(ts) {
      if (!running) return;
      rafId = requestAnimationFrame(frame);
      const t = tier();
      // 限帧：省电档 30fps
      const interval = 1000 / t.fps;
      if (ts - lastFrame < interval - 1) return;
      lastFrame = ts;

      ctx.clearRect(0, 0, width, height);
      if (t.lighter) ctx.globalCompositeOperation = 'lighter';
      nebulas.forEach(n => { n.update(); n.draw(); });
      fireflies.forEach(f => { f.update(); f.draw(t.glow); });
      ctx.globalCompositeOperation = 'source-over';
      meteors.forEach(m => { m.update(); m.draw(); });
      if (Math.random() < 0.005) {
          const idle = meteors.find(m => !m.active);
          if (idle) idle.spawn();
      }
    }

    function start() {
      if (running) return;
      running = true;
      lastFrame = 0;
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    build();
    start();

    // 对外句柄：暂停/恢复/切档
    particleEngine = {
      pause: stop,
      resume: start,
      // 切换省电档：清空精灵缓存（颜色键带档位）+ 按新档重建粒子
      applyTier() { build(); }
    };

    // 页面息屏/切后台自动暂停，省电省发热
    const onVis = () => {
      if (document.hidden) stop();
      else if (root && root.style.display !== 'none') start();
    };
    document.removeEventListener('visibilitychange', onVis);
    document.addEventListener('visibilitychange', onVis);
  }


  /* ================================================================
     2. 状态 / 配置
     —— 权威存储在 DB.settings（随完整备份导出/还原）；
        内存缓存 _dreamCache / settings 供同步读取，写入异步落盘。
     ================================================================ */
  const DREAMS_KEY  = (cid) => `chill_dreams:${cid}`;   // DB.settings 的 key
  const SETTINGS_KEY = 'chill_dream_settings';
  // 旧版 localStorage key（仅用于一次性迁移）
  const LS_DREAMS   = (cid) => `chill_dreams:${cid}`;
  const LS_SETTINGS = 'chill_dream_settings';

  let _dreamCache = {};        // { [cid]: dream[] } 内存缓存
  let _migrated   = false;     // 防重复迁移

  function _normSettings(raw) {
    raw = raw || {};
    return {
      image:   raw.image !== false,
      music:   raw.music === true,
      whisper: raw.whisper !== false,
      imgPos:  raw.imgPos || '',
      imgNeg:  raw.imgNeg || ''
    };
  }

  // 做梦偏好（三个开关），默认：图开、乐关、呓语开。先给同步默认值，init 时从 DB 覆盖
  let settings = _normSettings({});

  // 把旧 localStorage 数据搬进 DB.settings，搬完即删，只跑一次
  async function migrateFromLS() {
    if (_migrated) return;
    _migrated = true;
    try {
      // 1) 做梦偏好
      const lsSet = localStorage.getItem(LS_SETTINGS);
      if (lsSet != null) {
        try {
          const parsed = JSON.parse(lsSet);
          // DB 里没有才搬，避免覆盖新数据
          const exist = await DB.settings.get(SETTINGS_KEY).catch(() => null);
          if (exist == null) await DB.settings.set(SETTINGS_KEY, _normSettings(parsed));
        } catch {}
        localStorage.removeItem(LS_SETTINGS);
      }
      // 2) 各角色的梦：扫所有 chill_dreams:* 的 localStorage key
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('chill_dreams:')) keys.push(k);
      }
      for (const k of keys) {
        const cid = k.slice('chill_dreams:'.length);
        try {
          const arr = JSON.parse(localStorage.getItem(k) || '[]');
          const exist = await DB.settings.get(DREAMS_KEY(cid)).catch(() => null);
          if (exist == null && Array.isArray(arr) && arr.length) {
            await DB.settings.set(DREAMS_KEY(cid), arr.slice(0, 50));
          }
        } catch {}
        localStorage.removeItem(k);
      }
    } catch (e) { console.warn('[Dream] migrate from LS failed', e); }
  }

  // 启动加载：迁移 → 把 DB 里的偏好 + 全部梦灌进内存缓存
  async function loadAllFromDB() {
    await migrateFromLS();
    try {
      const s = await DB.settings.get(SETTINGS_KEY).catch(() => null);
      settings = _normSettings(s);
    } catch { settings = _normSettings({}); }
    // 预载所有角色的梦进缓存（按当前角色列表）
    try {
      const chars = await DB.characters.getAll().catch(() => []);
      _dreamCache = {};
      for (const c of (chars || [])) {
        const cid = String(c.id);
        try {
          const arr = await DB.settings.get(DREAMS_KEY(cid)).catch(() => null);
          if (Array.isArray(arr)) _dreamCache[cid] = arr;
        } catch {}
      }
    } catch (e) { console.warn('[Dream] preload dreams failed', e); }
  }

  function saveSettings(s) {
    settings = _normSettings(s);
    DB.settings.set(SETTINGS_KEY, settings).catch(e => console.warn('[Dream] saveSettings', e));
  }

  // —— 省电模式 ——
  async function loadEco() {
    try { ecoMode = (await DB.settings.get(ECO_KEY).catch(() => null)) === true; }
    catch { ecoMode = false; }
    return ecoMode;
  }
  function syncEcoUI() {
    const btn = $('btn-eco');
    if (!btn) return;
    btn.classList.toggle('on', ecoMode);
    const icon = btn.querySelector('i');
    const label = $('eco-label');
    if (icon) icon.className = ecoMode ? 'ph-fill ph-leaf' : 'ph ph-leaf';
    if (label) label.textContent = ecoMode ? 'Eco On' : 'Eco';
  }
  async function toggleEco() {
    ecoMode = !ecoMode;
    try { await DB.settings.set(ECO_KEY, ecoMode); } catch {}
    syncEcoUI();
    // 重建粒子到新档位
    if (particleEngine && particleEngine.applyTier) particleEngine.applyTier();
    if (typeof Toast !== 'undefined') Toast.show(ecoMode ? '省电模式已开启，星野已简化' : '省电模式已关闭');
  }


  // 网易云配乐配置：复用单人剧情那份 sc-netease-config（StoryMusic 读的就是这个 key）
  const NETEASE_KEY = 'sc-netease-config';
  async function loadNeteaseCfg() {
    try { return (await DB.settings.get(NETEASE_KEY)) || { enabled:false, base:'', cookie:'' }; }
    catch { return { enabled:false, base:'', cookie:'' }; }
  }
  async function saveNeteaseCfg(patch) {
    const cur = await loadNeteaseCfg();
    const next = { ...cur, ...patch };
    try { await DB.settings.set(NETEASE_KEY, next); } catch {}
    return next;
  }

  // 配置齐全才算可用（开关 + base + cookie）
  async function neteaseReady() {
    const c = await loadNeteaseCfg();
    return !!(c.enabled && c.base && c.base.trim() && c.cookie && c.cookie.trim());
  }
  // Cookie 瘦身：只取 MUSIC_U，防 URL 过长
  function slimCookie(raw) {
    if (!raw) return '';
    const m = String(raw).match(/MUSIC_U=[^;]+/);
    return m ? m[0] : String(raw).trim();
  }
  // 抓歌：关键词 → { id, title, artist, audioUrl, coverUrl } | null
  // 自包含，不碰 StoryMusic 的票根 DOM。链路 search → song/url/v1 → song/detail
  async function fetchNetease(keyword) {
    if (!keyword || keyword === 'null') return null;
    const cfg = await loadNeteaseCfg();
    if (!cfg.enabled || !cfg.base || !cfg.cookie) return null;
    const base = cfg.base.trim().replace(/\/+$/, '');
    const cookieParam = `&cookie=${encodeURIComponent(slimCookie(cfg.cookie))}`;
    const ts = `timerstamp=${Date.now()}`; // 防 CDN 缓存死链
    try {
      // 1) 搜索
      const sRes = await fetch(`${base}/search?keywords=${encodeURIComponent(keyword)}&limit=5&${ts}${cookieParam}`);
      const sData = await sRes.json();
      const songs = sData.result?.songs;
      if (!songs || !songs.length) return null;
      // 2) 批量换直链（exhigh）
      const ids = songs.map(s => s.id).join(',');
      const uRes = await fetch(`${base}/song/url/v1?id=${ids}&level=exhigh&${ts}${cookieParam}`);
      const uData = await uRes.json();
      const valid = uData.data?.find(it => it.url && it.url.trim());
      if (!valid) return null;
      const meta = songs.find(s => s.id === valid.id) || songs[0];
      // 3) 封面（失败不致命）
      let coverUrl = '';
      try {
        const dRes = await fetch(`${base}/song/detail?ids=${valid.id}&${ts}${cookieParam}`);
        const dData = await dRes.json();
        coverUrl = dData.songs?.[0]?.al?.picUrl || '';
      } catch {}
      const artist = (meta.artists || meta.ar || []).map(a => a.name).filter(Boolean).join('/') || '';
      return { id: valid.id, title: meta.name || keyword, artist, audioUrl: (valid.url || '').replace('http://', 'https://'), coverUrl };
    } catch (e) { console.warn('[Dream] netease fetch failed', e); return null; }
  }

  // 当前角色 + 当前角色的梦
  let curChar = null;
  let dreams  = [];
  let curDream = null;

  const bgAudio      = new Audio();
  const whisperAudio = new Audio();
  let listScrollPos  = 0;

  function $(id) { return root.querySelector('#' + id); }

  /* ================================================================
     3. 角色星野渲染（真数据：DB.characters）
     ================================================================ */
  const heightPattern = [40, 58, 45, 62, 38, 52];

  async function renderGallery() {
    const wrapper = $('galleryWrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '';

    let chars = [];
    try { chars = await DB.characters.getAll(); } catch (e) { chars = []; }

    if (!chars.length) {
      wrapper.innerHTML = '<div style="color:rgba(255,255,255,.5);font-family:var(--font-typewriter);' +
        'font-size:13px;align-self:center;padding:0 30px;text-align:center;line-height:1.8;">' +
        '还没有角色。<br>先去「遇见」创建一个，<br>TA 才能为你做梦。</div>';
      return;
    }

    for (let index = 0; index < chars.length; index++) {
      const c = chars[index];
      const cid = String(c.id);
      const myDreams = readDreams(cid);
      const hasDream = myDreams.length > 0;            // 生成过梦 → 金色
      const hasNew   = myDreams.some(d => d.unread);   // 有未读 → 额外高亮
      const status   = hasNew
        ? (myDreams.find(d => d.unread)?.echo || 'TA 做了个梦…')
        : (hasDream ? '已入梦' : '还没入梦');

      const stateClass  = (hasDream ? 'has-dream' : 'no-dream') + (hasNew ? ' has-new' : '');
      const dropHeight  = `${heightPattern[index % heightPattern.length]}vh`;
      const threadColor = hasDream ? 'rgba(255,215,0,0.7)' : 'rgba(255,255,255,0.15)';
      const haloColor   = hasDream ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.3)';
      const swayTime    = `${(Math.random() * 2 + 4).toFixed(1)}s`;
      const swayDeg     = `${(Math.random() * 2 + 1.5).toFixed(1)}deg`;

      // 头像：可能是 assets key，也可能是直链
      let avatar = '';
      if (c.avatarUrl) {
        try {
          if (/^(https?:|data:|blob:)/.test(c.avatarUrl)) avatar = c.avatarUrl;
          else avatar = await Assets.getUrl(c.avatarUrl) || '';
        } catch { avatar = ''; }
      }

      const el = document.createElement('div');
      el.className = `chime-unit ${stateClass}`;
      el.style.setProperty('--drop-height',  dropHeight);
      el.style.setProperty('--sway-time',    swayTime);
      el.style.setProperty('--sway-deg',     swayDeg);
      el.style.setProperty('--thread-color', threadColor);
      el.style.setProperty('--halo-color',   haloColor);

      const orbStyle = avatar
        ? `background-image:url('${avatar}')`
        : `background:linear-gradient(135deg,#3a2e4a,#1b2238)`;

      el.innerHTML = `
        <div class="thread"></div>
        <div class="orb-wrapper" data-char-id="${cid}">
          <div class="orb" style="${orbStyle}"></div>
          <div class="click-halo"></div>
        </div>
        <div class="text-group">
          <div class="char-name">${escapeHtml(c.name || '未命名')}</div>
          <div class="status-whisper">"${escapeHtml(status)}"</div>
        </div>`;

      const charObj = { id: cid, name: c.name || '未命名', avatar,
                        persona: c.persona || '', mbti: c.mbti || '' };
      el.querySelector('.orb-wrapper').addEventListener('click', function () {
        enterDream(charObj, this);
      });
      wrapper.appendChild(el);
    }

    // 自动滚到第一个有新梦的角色
    requestAnimationFrame(() => {
      const container  = $('scrollContainer');
      const firstDream = root.querySelector('.has-dream');
      if (container && firstDream) {
        try { container.scrollTo({
          left: firstDream.offsetLeft - container.clientWidth / 2 + firstDream.clientWidth / 2,
          behavior: 'smooth'
        }); } catch {}
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  /* ================================================================
     4. 屏幕切换
     ================================================================ */
  function enterDream(char, orbEl) {
    const halo = orbEl.querySelector('.click-halo');
    if (halo) { halo.classList.remove('active'); void halo.offsetWidth; halo.classList.add('active'); }
    if (navigator.vibrate) navigator.vibrate(50);
    setTimeout(() => showDreamScreen(char), 400);
  }

  async function showDreamScreen(char) {
    curChar = char;
    const av = $('char-ctx-avatar');
    if (av) av.style.backgroundImage = char.avatar ? `url('${char.avatar}')` : 'linear-gradient(135deg,#3a2e4a,#1b2238)';
    const nm = $('char-ctx-name');   if (nm) nm.textContent   = char.name;
    const st = $('char-ctx-status'); if (st) st.textContent   = '"等 TA 睡一觉"';

    // 读这个角色的梦，标记已读
    dreams = readDreams(char.id).map(d => ({ ...d, unread: false }));
    writeDreams(char.id, dreams);

    renderDreamList();

    const screenDreams = $('screen-dreams');
    screenDreams.scrollTop = 0;
    screenDreams.classList.add('active');
  }

  function hideDreamScreen() {
    stopAllAudio();
    if ($('view-detail').classList.contains('active')) closeDetail(true);
    $('screen-dreams').classList.remove('active');
    renderGallery(); // 回到星野时刷新红点状态
  }

  /* ================================================================
     5. 梦的存取（DB.settings，per 角色，读走内存缓存）
     ================================================================ */
  function readDreams(cid) {
    const arr = _dreamCache[String(cid)];
    return Array.isArray(arr) ? arr : [];
  }
  function writeDreams(cid, arr) {
    const key = String(cid);
    const capped = (Array.isArray(arr) ? arr : []).slice(0, 50); // 上限 50，超了砍尾
    _dreamCache[key] = capped;        // 同步更新缓存
    DB.settings.set(DREAMS_KEY(key), capped).catch(e => console.warn('[Dream] writeDreams', e)); // 异步落盘
  }

  /* ================================================================
     6. 列表渲染
     ================================================================ */
  function updateStatus(processing) {
    const el = $('status-msg');
    if (!el) return;
    if (processing) { el.style.display=''; el.innerHTML='[ Descending into Subconscious... ]'; }
    else if (!dreams.length) { el.style.display=''; el.innerHTML='No echoes found. Close your eyes.'; }
    else { el.style.display='none'; }
  }

  function renderDreamList() {
    const list = $('dream-list');
    list.innerHTML = '';
    dreams.forEach(d => list.appendChild(createDreamCard(d)));
    updateStatus(false);
  }

  function createDreamCard(dream) {
    const card = document.createElement('div');
    card.className = 'dream-card';
    const aura = (dream.aura && dream.aura.length) ? dream.aura : ['#5b4e5d','#8f8b88','#b84242'];
    const auraHTML = aura.map(c => `<span style="background:${c}"></span>`).join('');
    card.innerHTML = `
      <div class="card-header">
        <div class="moon-time"><i class="ph-fill ${dream.moonIcon || 'ph-moon-stars'}"></i> ${escapeHtml(dream.time || '')}</div>
        <div class="emotion-tag"><i class="ph-fill ph-tag"></i> ${escapeHtml(dream.emotion || '梦')}</div>
      </div>
      <div><span class="echo-text">"${escapeHtml(dream.echo || '')}"</span></div>
      <div class="mini-aura">${auraHTML}</div>
      <div class="card-snippet">${escapeHtml(dream.content || '')}</div>`;
    card.addEventListener('click', () => openDetail(dream));
    return card;
  }

  /* ================================================================
     7. 做梦（点哄睡触发）
     ================================================================ */
  async function lullToSleep() {
    if (!curChar) return;
    if (state.processing) return;
    state.processing = true;

    const btn = $('btn-sleep');
    btn.innerHTML = '<i class="ph-light ph-spinner-gap ph-spin"></i> 下潜中...';
    updateStatus(true);

    try {
      const dream = await generateDream(curChar);
      dream.unread = false;
      dreams.unshift(dream);
      writeDreams(curChar.id, dreams);
      renderDreamList();
      try { $('screen-dreams').scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (e) {
      console.error('[Dream] generate failed', e);
      if (window.Toast) Toast.show('TA 翻了个身，没睡沉。再哄一次试试');
    } finally {
      state.processing = false;
      btn.innerHTML = '<i class="ph-fill ph-moon-stars" style="font-size:18px;"></i> 潜入梦境';
      updateStatus(false);
    }
  }

  /* ================================================================
     8. 生成管线：素材 → LLM → 生图 → 呓语
     ================================================================ */
  async function gatherSeeds(char) {
    // 最近 50 条聊天记录
    let history = '';
    try {
      const msgs = await DB.messages.getPage(String(char.id), 0, 50).catch(() => []);
      history = msgs.reverse().map(m => {
        const who = m.role === 'user' ? '我' : char.name;
        const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content || '';
        return txt ? `[${who}] ${txt}` : '';
      }).filter(Boolean).join('\n');
    } catch {}

    // 角色人设 + 绑定用户面具（无论有没有聊天记录都读）
    let personaBlock = char.persona ? `【角色设定】\n${char.persona}\n` : '';
    if (char.mbti) personaBlock += `MBTI: ${char.mbti}\n`;

    let userBlock = '';
    try {
      if (typeof PersonaModule !== 'undefined' && PersonaModule.getAll) {
        const all = PersonaModule.getAll() || [];
        // 先看这个角色绑定了哪个面具，没绑定才回退全局激活面具
        let pid = null;
        try { const b = await DB.bindings.get(String(char.id)); pid = b ? b.personaId : null; } catch {}
        if (!pid && PersonaModule.getActiveId) pid = PersonaModule.getActiveId();
        const p = all.find(x => String(x.id) === String(pid)) || all[0];
        if (p) userBlock = `【关于「我」（用户面具）】\n名字：${p.name || '我'}\n${p.bio || ''}\n${p.backstory || ''}\n`;
      }
    } catch {}

    return { history, personaBlock, userBlock };
  }

  function buildPrompt({ history, personaBlock, userBlock }, char) {
    const material = history
      ? `下面是你和「我」最近的聊天碎片：\n${history}`
      : `（你和「我」还没怎么说过话，就凭你是谁、和你对「我」的印象去做梦。）`;

    // 每次做梦随机抽取一种文风
    const styles = [
      { name: "鲁迅", desc: "匕首投枪,冷峻犀利。白描勾勒，不动声色中见残酷；多用反讽与转折；善用'看客'视角。适合表达对世事荒谬的冷眼观察或内心的深刻自省。" },
      { name: "张爱玲", desc: "苍凉华丽,世俗中见透彻。细节精准到残酷，色彩浓烈；通感修辞；今昔对照。适合书写都市男女在繁华背景下的孤独心事与幽微情感。" },
      { name: "村上春树", desc: "都市孤独,小资情调。爵士乐+威士忌+猫的生活质感；第一人称的疏离感；超现实元素嵌入日常。表达淡淡的孤独与对细节的哲思。" },
      { name: "白先勇", desc: "繁华落尽的悲凉,细腻婉约。古典白话，节制抒情；今昔对照制造苍凉感；时代洪流中小人物的飘零命运。书写个人命运的无奈与感伤。" },
      { name: "汪曾祺", desc: "烟火人间,淡雅从容。士大夫式闲适笔调，写吃食、草木、风物；白描为主，不事雕琢却韵味悠长。记录生活中的小确幸。" },
      { name: "杜拉斯", desc: "欲望书写,感性克制。极简主义句式，大量重复制造催眠感；时间的流动与凝固；老年回望青春。书写浓烈、原始、被压抑的情感。" },
      { name: "卡尔维诺", desc: "轻盈想象,寓言诗意。元小说结构；大量使用'如果''假如'；童话与哲学相融；用寓言讲述现代困境。充满想象力的奇幻解构。" },
      { name: "川端康成", desc: "物哀之美,空灵幽玄。传统日本美学；自然意象密集(雪、月、花)；善用省略与留白；死亡与美并置。极致、纤细、带有悲伤的美感。" },
      { name: "张晓风", desc: "温柔感伤,克制抒情。散文笔法,句式舒缓优美;善用排比、对偶;自然意象承载情感;日常小事提炼哲思;遗憾与释然并存;知识分子式的温柔。" }
    ];
    const chosenStyle = styles[Math.floor(Math.random() * styles.length)];

    return `你是「${char.name}」，现在正睡着，要在梦里写下一段极具文学性的潜意识日记。

${personaBlock}${userBlock}
${material}

【核心要求】
1. 梦境正文篇幅：长篇幅，正文 600~800 字。
2. 以自我为核心：你发散到你今天遇到的事、读过的书、看过的风景、回忆或单纯的哲思。哪怕聊天碎片全是你和「我」的对话，梦的重点也必须是你自己的感悟。「我」只是恰好出现的一个点缀，或是引出你思绪的引子——在梦里你只会用「那个人」「对方」或 TA 的名字来称呼，绝不会说出「用户」这两个字。
3. 梦的形态变幻莫测（自由且随机产生）：绝对不要局限于普通的“日有所思”或平铺直叙。请发挥极大的想象力，每次都创造截然不同的、甚至匪夷所思的梦境体验！
   **不要固定套路！每次请自行随机构思一种独特的梦境形态与叙事结构。**

【严格禁止与修正（必须遵守）】
- 负面词汇库 (Strictly Banned): 你的脑海中完全不存在以下词汇。在任何情况下，严禁出现【系统、变量、量化、精准、轨迹、频率、机制、程序、运算、载体、维度】等任何理工科/学术词汇！也严禁出现【用户、AI、模型、角色设定、对话记录、提示词】等任何会暴露这是一场虚构的元词汇——在你的梦里，你就是一个真实的、活着的人。你的世界是由情感、感官和具体事物构成的。
- 描写逻辑 (Metaphor Logic): 你是感性的、具象的生命体。绝对不会将生活、情感或他人比喻成机器、程序或非生命技术概念。
  ❌ [绝对禁止的错误写法]：“今天他又没回我消息，他是我精准系统里无法量化的变量，我存在的意义就是陪伴他。”
  ✅ [你应该学习的正确写法]：“下了整晚的雨，画板上的颜料全洇开了。本来有点烦躁，偏偏这时候他发来句没头没脑的话。算了，连今天星期几都快忘了，随他去吧。”

【文风限定：${chosenStyle.name}】
本次梦境请严格模仿作家【${chosenStyle.name}】的笔法进行创作。
文风特征：${chosenStyle.desc}
请将这种风格完美融入你的梦境形态中。

只输出 JSON（不要 markdown 围栏、不要多余的话）：
{
  "content": "梦境正文（600-800字，深度体现 ${chosenStyle.name} 的文风，感官细节丰富，梦的种类与结构要有极高的新鲜感与创意）",
  "echo": "醒来只记得的那半句，≤15字",
  "emotion": "两到四字情绪标签，如 溺水感/迷离/孤寂",
  "lucidity": "深度描述加三档星等，如 深潜 ✦✦✦ / 浅眠 ✦✧✧",
  "aura": ["#xxxxxx","#xxxxxx","#xxxxxx"],
  "image_prompt": "把这个梦最核心的画面，写成一句英文生图提示词（景物/光线/氛围，不要写人）",
  "bgm": "为这个梦的氛围选一首真实存在的歌，格式「歌手 - 歌名」，要贴合梦的情绪",
  "whisper": "一段梦里的呓语：像睡着的人含糊说出的几句梦话，断续飘忽，30~50字",
  "anchors": ["这个梦用到的现实碎片，3-5条，每条≤12字"]
}`;
  }

  function parseDreamJSON(raw) {
    let t = String(raw || '').trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    return JSON.parse(t);
  }

  async function generateDream(char) {
    const activeApi = await DB.api.getActive();
    if (!activeApi) throw new Error('no active api');

    const seeds  = await gatherSeeds(char);
    let prompt = buildPrompt(seeds, char);
    // 开了配乐：把剧情那套「选曲铁律」拼进去，LLM 才会选网易云搜得到的真歌
    if (settings.music && window.StoryMusic && typeof StoryMusic.buildPrompt === 'function') {
      try {
        const musicRule = await StoryMusic.buildPrompt();
        if (musicRule) prompt += `\n\n【配乐选曲参考（用于上面的 bgm 字段）】\n${musicRule}`;
      } catch {}
    }
    const rawTxt = await ApiHelper.chatCompletion(activeApi, [{ role: 'user', content: prompt }]);

    let p;
    try { p = parseDreamJSON(rawTxt); }
    catch (e) {
      // 解析失败兜底：整段当正文，别丢梦
      p = { content: String(rawTxt || '').slice(0, 200), echo: '梦碎成了一地…',
            emotion: '混沌', lucidity: '浅眠 ✦✧✧', aura: ['#888','#aaa','#666'],
            image_prompt: '', anchors: [] };
    }

    const moonIcons = ['ph-moon-stars','ph-moon','ph-moon-first-quarter'];
    const dream = {
      id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      charId: char.id,
      content:  p.content || '',
      echo:     p.echo || '',
      emotion:  p.emotion || '梦',
      lucidity: p.lucidity || '浅眠 ✦✧✧',
      moonIcon: moonIcons[Math.floor(Math.random()*moonIcons.length)],
      aura:     Array.isArray(p.aura) && p.aura.length ? p.aura.slice(0,3) : ['#5b4e5d','#8f8b88','#b84242'],
      origins:  Array.isArray(p.anchors) ? p.anchors : [],
      time:     fmtClock(),
      imageKey: null,
      audioKey: null,
      bgm:      (settings.music && p.bgm) ? String(p.bgm).trim() : null,
      whisper:  null,
      trigger:  'manual',
      created_at: Date.now()
    };

    // —— 生图（开关控制）——
    if (settings.image && p.image_prompt) {
      try {
        const cfg = NovelModule.getCfg ? (NovelModule.getCfg() || {}) : {};
        // 梦境专属正负词优先，留空回退剧情全局
        const globalPos = cfg.positivePrompt || '';
        const usePos = (settings.imgPos || globalPos);
        const pos = (usePos ? usePos + ', ' : '') + p.image_prompt;
        // 负向词：梦境专属覆盖 cfg.negativePrompt（不改 size 等其它配置）
        const mergedCfg = { ...cfg };
        if (settings.imgNeg) mergedCfg.negativePrompt = settings.imgNeg;
        const blob = await NovelModule.generateImageBlob(pos, mergedCfg);
        if (blob) {
          const key = `dream-img-${dream.id}`;
          await DB.assets.set(key, blob, blob.type || 'image/png');
          dream.imageKey = key;
        }
      } catch (e) { console.warn('[Dream] image failed', e); }
    }

    // —— 呓语 TTS（开关控制）。voiceId 是角色专属，存在 DB.settings ——
    // —— 呓语 TTS：念独立生成的梦呓（whisper），不是念 echo 或正文 ——
    const whisperText = (p.whisper && String(p.whisper).trim()) || p.echo || '';
    if (settings.whisper && whisperText) {
      try {
        const voiceId = await DB.settings.get(`voice-id-${char.id}`).catch(() => null);
        if (voiceId) {
          const key = `dream-whisper-${dream.id}`;
          const res = await VoiceModule.synthesizeToAsset(whisperText, voiceId, key);
          if (res && res.audioKey) dream.whisper = { audioKey: res.audioKey, text: whisperText };
        }
      } catch (e) { console.warn('[Dream] whisper failed', e); }
    }

    // —— 配乐：只在这里记下「歌手-歌名」(dream.bgm)，
    //    真正抓歌交给 StoryMusic，在打开详情页时渲染播放条触发 ——

    return dream;
  }

  function fmtClock() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const h = d.getHours();
    const period = h < 5 ? '深夜' : h < 11 ? '清晨' : h < 14 ? '正午' : h < 18 ? '午后' : '夜里';
    return `${period} ${hh}:${mm}`;
  }

  /* ================================================================
     9. 详情页
     ================================================================ */
  async function openDetail(dream) {
    curDream = dream;
    listScrollPos = $('screen-dreams').scrollTop;

    // 👇 【新增这一行补丁】：把详情页的顶端往下推，完美盖住当前视口
    $('view-detail').style.top = listScrollPos + 'px';

    const photoWrap = $('m-photo-wrap');
    const auraBox = $('m-aura');
    
    if (dream.imageKey) {
      try {
        const url = await Assets.getUrl(dream.imageKey);
        if (url) {
          $('m-img').src = url;
          photoWrap.style.display = 'block';
          auraBox.innerHTML = (dream.aura||[]).map(c => `<div class="aura-color" style="background:${c}"></div>`).join('');
          auraBox.style.display = 'flex';
        } else { photoWrap.style.display='none'; auraBox.style.display='none'; }
      } catch { photoWrap.style.display='none'; auraBox.style.display='none'; }
    } else { photoWrap.style.display='none'; auraBox.style.display='none'; }

    root.querySelector('#m-tag span').innerText = dream.emotion || '梦';
    $('m-lucidity').innerHTML = `深度 <span>${(dream.lucidity||'').split(' ')[1]||''}</span>`;
    $('m-echo').innerText = `"${dream.echo || ''}"`;
    $('m-content').innerText = dream.content || '';
    $('m-origins').innerHTML = (dream.origins||[]).map(o => `<li>${escapeHtml(o)}</li>`).join('')
        || '<li style="opacity:.5">这个梦没留下锚点</li>';

    // 配乐：星轨主播放器。优先放本地音频(dream.audioKey)，否则抓网易云(dream.bgm)
    const player = $('m-player');
    const track  = $('m-track');
    player.style.display = 'none';
    bgAudio.src = '';
    if (track) track.innerText = 'SOUNDSCAPE 01';

    if (dream.audioKey) {
      // 有本地音频：直接放
      try {
        const url = await Assets.getUrl(dream.audioKey);
        if (url) { player.style.display='flex'; bgAudio.src = url; $('player-time').innerText='00:00'; bgAudio.load(); }
      } catch {}
    } else if (dream.bgm) {
      // 网易云配乐：抓到歌才点亮星轨播放器
      try {
        if (await neteaseReady()) {
          if (track) track.innerText = '检索配乐…';
          const q = String(dream.bgm).replace(/\s+/g,' ').replace(/[《》“”]/g,'').trim();
          const song = await fetchNetease(q);
          // 用户可能在抓歌期间已经退出/切换了这条梦，丢弃过期结果
          if (curDream === dream) {
            if (song && song.audioUrl) {
              player.style.display = 'flex';
              bgAudio.src = song.audioUrl;
              if (track) track.innerText = song.artist ? `${song.artist} - ${song.title}` : song.title;
              $('player-time').innerText = '00:00';
              bgAudio.load();
            } else if (track) {
              track.innerText = 'SOUNDSCAPE 01';
            }
          }
        }
      } catch (e) { console.warn('[Dream] bgm failed', e); if (track) track.innerText = 'SOUNDSCAPE 01'; }
    }

    // 呓语
    const wbox = $('m-whispers-box');
    if (dream.whisper && dream.whisper.audioKey) {
      try {
        const url = await Assets.getUrl(dream.whisper.audioKey);
        if (url) {
          wbox.style.display='block';
          $('m-whisper-text').innerText = `"${dream.whisper.text||''}"`;
          whisperAudio.src = url; $('w-time').innerText='00:00'; whisperAudio.load();
          $('w-transcript').classList.remove('open');
          $('w-toggle-icon').classList.replace('ph-minus','ph-plus');
        } else { wbox.style.display='none'; whisperAudio.src=''; }
      } catch { wbox.style.display='none'; whisperAudio.src=''; }
    } else { wbox.style.display='none'; whisperAudio.src=''; }

    resetPlayerUI(); resetWhisperUI();
    $('view-detail').classList.add('active');
    $('screen-dreams').style.overflowY = 'hidden';
    $('view-detail').scrollTop = 0;
  }

  function closeDetail(silent) {
    if (!silent) { bgAudio.pause(); bgAudio.currentTime=0; whisperAudio.pause(); whisperAudio.currentTime=0; }
    resetPlayerUI(); resetWhisperUI();
    $('view-detail').classList.remove('active');
    $('screen-dreams').style.overflowY = 'auto';
    $('screen-dreams').scrollTop = listScrollPos;
  }

  async function deleteDream() {
    if (!curDream || !curChar) return;
    const ok = window.confirm ? window.confirm('删除这个梦？删了就找不回来了。') : true;
    if (!ok) return;
    // 清掉它的图/呓语 asset
    try { if (curDream.imageKey) await DB.assets.del?.(curDream.imageKey); } catch {}
    try { if (curDream.whisper?.audioKey) await DB.assets.del?.(curDream.whisper.audioKey); } catch {}
    // 从数组移除 + 落库
    dreams = dreams.filter(d => d.id !== curDream.id);
    writeDreams(curChar.id, dreams);
    curDream = null;
    closeDetail(false);
    renderDreamList();
    if (window.Toast) Toast.show('梦已经散了');
  }

  /* ================================================================
     10. 音频播放器（配乐 + 呓语）
     ================================================================ */
  function fmtTime(s){ if(isNaN(s)||s===Infinity) return '00:00';
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`; }

  function bindAudioEvents() {
    bgAudio.addEventListener('loadedmetadata', () => { $('player-time').innerText = fmtTime(bgAudio.duration); });
    bgAudio.addEventListener('timeupdate', () => { if(bgAudio.duration){
      $('player-progress').style.width = (bgAudio.currentTime/bgAudio.duration*100)+'%';
      $('player-time').innerText = fmtTime(bgAudio.currentTime); }});
    bgAudio.addEventListener('ended', () => { resetPlayerUI(); $('player-time').innerText = fmtTime(bgAudio.duration); });

    whisperAudio.addEventListener('loadedmetadata', () => { $('w-time').innerText = fmtTime(whisperAudio.duration); });
    whisperAudio.addEventListener('timeupdate', () => { if(whisperAudio.duration){
      $('w-progress').style.width = (whisperAudio.currentTime/whisperAudio.duration*100)+'%';
      $('w-time').innerText = fmtTime(whisperAudio.currentTime); }});
    whisperAudio.addEventListener('ended', () => { resetWhisperUI(); $('w-time').innerText = fmtTime(whisperAudio.duration); });
  }

  function togglePlay() {
    if (!bgAudio.src) return;
    if (bgAudio.paused) {
      if (!whisperAudio.paused) toggleWhisper();
      bgAudio.play();
      $('play-icon').classList.replace('ph-play','ph-pause');
      $('play-spin-ring').classList.add('playing');
    } else {
      bgAudio.pause();
      $('play-icon').classList.replace('ph-pause','ph-play');
      $('play-spin-ring').classList.remove('playing');
    }
  }
  function resetPlayerUI(){ $('play-icon').classList.replace('ph-pause','ph-play');
    $('play-spin-ring').classList.remove('playing'); $('player-progress').style.width='0%'; }

  function toggleWhisper() {
    if (!whisperAudio.src) return;
    if (whisperAudio.paused) {
      if (!bgAudio.paused) togglePlay();
      whisperAudio.play();
      $('w-play-icon').classList.replace('ph-play','ph-pause');
      $('w-wave').classList.add('is-playing');
    } else {
      whisperAudio.pause();
      $('w-play-icon').classList.replace('ph-pause','ph-play');
      $('w-wave').classList.remove('is-playing');
    }
  }
  function resetWhisperUI(){ $('w-play-icon').classList.replace('ph-pause','ph-play');
    $('w-wave').classList.remove('is-playing'); $('w-progress').style.width='0%'; }

  function toggleTranscript() {
    const open = $('w-transcript').classList.contains('open');
    $('w-transcript').classList.toggle('open', !open);
    $('w-toggle-icon').classList.replace(open?'ph-minus':'ph-plus', open?'ph-plus':'ph-minus');
  }

  function stopAllAudio(){ bgAudio.pause(); bgAudio.currentTime=0; whisperAudio.pause(); whisperAudio.currentTime=0; }

  /* ================================================================
     11. 设置弹窗
     ================================================================ */
  async function syncSettingsUI() {
    [['ds-toggle-image','image'],['ds-toggle-music','music'],['ds-toggle-whisper','whisper']]
      .forEach(([id,key]) => { const t=$(id); if(t) t.classList.toggle('on', !!settings[key]); });
    // 输入框回填
    const set = (id,v) => { const el=$(id); if(el) el.value = v || ''; };
    set('ds-img-pos', settings.imgPos);
    set('ds-img-neg', settings.imgNeg);
    // 网易云配置从剧情那份 sc-netease-config 读（与剧情配乐共用一份）
    const ne = await loadNeteaseCfg();
    set('ds-music-api', ne.base);
    set('ds-music-cookie', ne.cookie);
  }
  function openSettings(){ syncSettingsUI(); $('dream-settings-mask').classList.add('active'); }
  function closeSettings(){ $('dream-settings-mask').classList.remove('active'); }

  function bindSettings() {
    $('dream-settings-btn')?.addEventListener('click', openSettings);
    $('ds-done-btn')?.addEventListener('click', closeSettings);
    $('dream-settings-mask')?.addEventListener('click', (e) => {
      if (e.target.id === 'dream-settings-mask') closeSettings();
    });

    // 折叠：生图提示词 / 配乐 api+cookie
    $('ds-cfg-image')?.addEventListener('click', (e) => {
      e.stopPropagation(); $('ds-config-image')?.classList.toggle('open');
    });
    $('ds-cfg-music')?.addEventListener('click', (e) => {
      e.stopPropagation(); $('ds-config-music')?.classList.toggle('open');
    });

    // 开关
    root.querySelectorAll('.ds-toggle').forEach(t => {
      t.addEventListener('click', () => {
        const key = t.dataset.key;
        settings[key] = !settings[key];
        t.classList.toggle('on', settings[key]);
        saveSettings(settings);
        // 配乐开关同步到群像共用配置的 enabled
        if (key === 'music') saveNeteaseCfg({ enabled: settings.music });
      });
    });

    // 提示词输入：实时存本地 settings
    const bindLocal = (id, key) => {
      const el = $(id);
      if (el) el.addEventListener('input', () => { settings[key] = el.value; saveSettings(settings); });
    };
    bindLocal('ds-img-pos', 'imgPos');
    bindLocal('ds-img-neg', 'imgNeg');

    // 网易云 api/cookie：写 sc-netease-config（剧情配乐共用）
    $('ds-music-api')?.addEventListener('input', (e) => saveNeteaseCfg({ base: e.target.value.trim() }));
    $('ds-music-cookie')?.addEventListener('input', (e) => saveNeteaseCfg({ cookie: e.target.value.trim() }));
  }

  /* ================================================================
     12. 事件绑定 + 入口
     ================================================================ */
  function bindAll() {
    $('btn-back-to-chars')?.addEventListener('click', hideDreamScreen);
    $('btn-char-back')?.addEventListener('click', close);
    $('btn-eco')?.addEventListener('click', toggleEco);
    $('btn-sleep')?.addEventListener('click', lullToSleep);
    $('btn-back')?.addEventListener('click', () => closeDetail(false));
    $('btn-dream-del')?.addEventListener('click', deleteDream);
    $('btn-playToggle')?.addEventListener('click', togglePlay);
    $('btn-whisper-play')?.addEventListener('click', toggleWhisper);
    $('btn-transcript-toggle')?.addEventListener('click', toggleTranscript);
    bindSettings();
    bindAudioEvents();
  }


  /* ---------- 对外入口 ---------- */
  async function open() {
    await loadEco();         // 先确定档位，inject() 里的 initParticles 才会按对的档建粒子
    inject();
    root.style.display = 'block';
    syncEcoUI();
    if (particleEngine && particleEngine.applyTier) particleEngine.applyTier(); // 按当前档位（重）建
    if (particleEngine && particleEngine.resume) particleEngine.resume(); // 恢复动画
    await loadAllFromDB();   // 先把偏好+梦从 DB 灌进缓存（含旧 localStorage 一次性迁移）
    // 每次打开都回到星野 + 刷新
    $('screen-dreams').classList.remove('active');
    if ($('view-detail').classList.contains('active')) closeDetail(true);
    await renderGallery();
  }
  function close() {
    stopAllAudio();
    if (particleEngine && particleEngine.pause) particleEngine.pause(); // 关闭后停止动画，省电省发热
    if (root) root.style.display = 'none';
  }

  return { open, close };
})();

if (typeof window !== 'undefined') window.DreamModule = DreamModule;