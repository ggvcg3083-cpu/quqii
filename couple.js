'use strict';

const CoupleModule = (() => {
    let _isInitialized = false;
    let _characters =[];
    let _favorites = {};
    let _pendingPhotoCharId = null;
    let _currentCoupleCharId = null; 
    let _wantedArchives =[]; // 存储真实通缉令数据

    const PRESET_PHOTOS =[
        'https://i.postimg.cc/9FQ0svh9/IMG-0017.jpg',
        'https://images.unsplash.com/photo-1445543949571-ffc3e0e2f55e?auto=format&fit=crop&q=80&w=400',
        'https://images.unsplash.com/photo-1542360663-8f40838b8d7a?auto=format&fit=crop&q=80&w=400',
        'https://images.unsplash.com/photo-1483664852095-d6cc6870702d?auto=format&fit=crop&q=80&w=400',
        'https://images.unsplash.com/photo-1478719059408-592965723cbc?auto=format&fit=crop&q=80&w=400',
        'https://images.unsplash.com/photo-1418985991508-e47386d96a71?auto=format&fit=crop&q=80&w=400'
    ];
    
   // === 异步漫游模块变量 ===
    let _roamMaterials =[]; 
    let _roamSelectedMaterials = new Set();
    let _roamCapsules =[]; // 真实数据存储
    let _roamUploadedImgFile = null; // 真实文件缓存
    let _roamUploadedImgUrl = '';
    let _roamCurrentVibe = 'night';
    let _roamCurrentVibeName = 'MIDNIGHT';

    const _roamDoodles = {
        bow: `<svg class="roam-doodle" style="top:-15px; right:-15px; transform:rotate(10deg);" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--roam-ink)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12 C 8 8, 4 10, 4 14 C 4 18, 12 12, 12 12 Z" /><path d="M12 12 C 16 8, 20 10, 20 14 C 20 18, 12 12, 12 12 Z" /><path d="M12 12 L 8 20 M12 12 L 16 20"/></svg>`,
        stars: `<svg class="roam-doodle" style="bottom:30px; left:-20px;" width="24" height="40" viewBox="0 0 24 40" fill="none" stroke="var(--roam-grey)" stroke-width="1.5"><path d="M12 2 L12 10 M8 6 L16 6 M12 22 L12 26 M10 24 L14 24" /><circle cx="12" cy="16" r="1.5" fill="var(--roam-grey)"/></svg>`,
        circle: `<svg class="roam-doodle" style="top:50%; right:-25px; transform:translateY(-50%);" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="var(--roam-ink)" stroke-width="1" stroke-dasharray="2 4"><circle cx="20" cy="20" r="18"/></svg>`
    };

    // ============================================================
    // 1. 动态注入 CSS 样式 (包含画廊 + 拼贴目录)
    // ============================================================
    function _injectStyles() {
        if (document.getElementById('couple-module-css')) return;
        if (!document.getElementById('couple-module-fonts')) {
            const fontLink = document.createElement('link');
            fontLink.id = 'couple-module-fonts';
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Long+Cang&family=Noto+Serif+SC:wght@300;400;700;900&family=UnifrakturMaguntia&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap';
            document.head.appendChild(fontLink);
        }
        const style = document.createElement('style');
        style.id = 'couple-module-css';
        style.textContent = `
            /* =======================================
               Couple Screen 整体容器
               ======================================= */
            #couple-screen {
                position: absolute; inset: 0; width: 100%; height: 100%;
                z-index: 150; overflow: hidden;
                transform: translateX(100%);
                transition: transform 0.42s cubic-bezier(0.19,1,0.22,1), opacity 0.35s ease;
                opacity: 0; visibility: hidden;
            }
            #couple-screen.active { transform: translateX(0); opacity: 1; visibility: visible; }

            /* 内部双视图通用框架 */
            .cp-view {
                position: absolute; inset: 0; width: 100%; height: 100%;
                overflow-y: auto; scrollbar-width: none;
                transform: translateX(100%); opacity: 0; visibility: hidden;
                transition: transform 0.4s cubic-bezier(0.19,1,0.22,1), opacity 0.4s ease;
            }
            .cp-view::-webkit-scrollbar { display: none; }
            .cp-view.active { transform: translateX(0); opacity: 1; visibility: visible; }

            /* =======================================
               View 1: 画廊视图 (冷夜灰蓝调)
               ======================================= */
            #cp-view-gallery {
                --cp-bg: #f6f8fb; --cp-card: #ffffff; --cp-primary: #6b8aab; 
                --cp-light: #e2eaf2; --cp-dark: #3a4a5a; --cp-muted: #8b9cae; --cp-border: #e8eef4;
                background-color: var(--cp-bg); color: var(--cp-dark); font-family: 'Inter', sans-serif;
            }
            [data-theme="dark"] #cp-view-gallery {
                --cp-bg: #1a1f24; --cp-card: #222831; --cp-primary: #8ba8c9; 
                --cp-light: #2c3540; --cp-dark: #e8eef4; --cp-muted: #8b9cae; --cp-border: #333d47;
            }

            #cp-view-gallery .cp-container { max-width: 100%; margin: 0 auto; position: relative; min-height: 100vh; padding-bottom: 80px; }
            #cp-view-gallery .cp-top-nav { position: absolute; top: calc(env(safe-area-inset-top, 20px) + 20px); right: 24px; display: flex; align-items: center; gap: 8px; z-index: 100; cursor: pointer; transition: opacity 0.2s; }
            #cp-view-gallery .cp-top-nav:active { opacity: 0.5; }
            #cp-view-gallery .cp-nav-line { width: 24px; height: 1px; background-color: var(--cp-primary); }
            #cp-view-gallery .cp-nav-text { font-size: 10px; font-weight: 500; letter-spacing: 2px; color: var(--cp-primary); }
            
            #cp-view-gallery .cp-header { padding: calc(env(safe-area-inset-top, 20px) + 60px) 24px 30px 24px; position: relative; }
            #cp-view-gallery .cp-header-top-deco { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
            #cp-view-gallery .cp-deco-circles { display: flex; gap: 4px; }
            #cp-view-gallery .cp-deco-circles div { width: 14px; height: 14px; border: 1.5px solid var(--cp-primary); border-radius: 50%; }
            #cp-view-gallery .cp-header-title { font-size: 32px; font-weight: 300; letter-spacing: -1px; color: var(--cp-primary); line-height: 1.1; }
            #cp-view-gallery .cp-header-subtitle { font-family: 'Noto Serif SC', serif; font-size: 20px; font-weight: 700; color: var(--cp-dark); margin-top: 4px; letter-spacing: 1px; }
            #cp-view-gallery .cp-header-micro { font-size: 9px; color: var(--cp-muted); margin-top: 16px; letter-spacing: 0.5px; text-transform: uppercase; }

            #cp-view-gallery .cp-gallery-grid { padding: 0 24px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
            #cp-view-gallery .char-card { background: var(--cp-card); border-radius: 16px; border: 1px solid var(--cp-border); overflow: hidden; position: relative; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; display: flex; }
            #cp-view-gallery .char-card:active { transform: scale(0.97); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05); }
            
            #cp-view-gallery .photo-block { position: relative; background-color: var(--cp-light); overflow: hidden; transition: opacity 0.3s; }
            #cp-view-gallery .photo-block::after { content: 'EDIT COVER'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 2px; color: #fff; background: rgba(0,0,0,0.5); padding: 6px 10px; border-radius: 4px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
            #cp-view-gallery .photo-block:hover::after { opacity: 1; }
            #cp-view-gallery .photo-block:active { opacity: 0.8; }
            
            #cp-view-gallery .heart-badge { position: absolute; width: 22px; height: 22px; background: var(--cp-card); border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05); z-index: 2; color: var(--cp-primary); transition: all 0.3s; }
            
            #cp-view-gallery .info-block { padding: 14px; display: flex; flex-direction: column; }
            #cp-view-gallery .tag-pill { align-self: flex-start; background: var(--cp-primary); color: white; font-size: 9px; padding: 3px 8px; border-radius: 20px; letter-spacing: 0.5px; margin-bottom: 10px; }
            #cp-view-gallery .name-zh { font-family: 'Noto Serif SC', serif; font-size: 16px; font-weight: 700; color: var(--cp-dark); margin-bottom: 2px; }
            #cp-view-gallery .name-en { font-size: 11px; color: var(--cp-muted); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #cp-view-gallery .avatar-img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--cp-border); flex-shrink: 0; margin-left: 8px; background: var(--cp-bg); }
            #cp-view-gallery .quote-text { font-size: 10px; line-height: 1.5; color: var(--cp-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: auto; }

            #cp-view-gallery .card-wide { grid-column: span 2; flex-direction: row; height: 140px; padding: 10px; gap: 12px; }
            #cp-view-gallery .card-wide .photo-block { width: 40%; height: 100%; border-radius: 10px; flex-shrink: 0; }
            #cp-view-gallery .card-wide .heart-badge { bottom: 8px; right: 8px; }
            #cp-view-gallery .card-wide .info-block { padding: 4px 0; flex: 1; min-width: 0; }
            #cp-view-gallery .card-wide .name-zh { font-size: 18px; }
            #cp-view-gallery .card-wide .quote-text { -webkit-line-clamp: 3; }

            #cp-view-gallery .card-small { flex-direction: column; height: 220px; }
            #cp-view-gallery .card-small .photo-block { width: 100%; height: 110px; border-radius: 0 0 12px 12px; }
            #cp-view-gallery .card-small .heart-badge { bottom: 8px; left: 8px; }
            #cp-view-gallery .card-small .info-block { flex: 1; min-width: 0; }


            /* =======================================
               View 2: 拼贴目录视图 (高级低饱和燕麦色)
               ======================================= */
            #cp-view-detail {
                --dt-bg: #f4f3f0; --dt-card: #ffffff; --dt-text: #2b2826; --dt-sub: #9a948f;
                --dt-accent: #7a4f4f; --dt-accent-lt: #e8dede; --dt-border: #e0dcd8; --dt-shape: #d5d1cc;
                
                background-color: var(--dt-bg); color: var(--dt-text);
                font-family: 'Inter', sans-serif;
                background-image: radial-gradient(var(--dt-border) 1px, transparent 1px);
                background-size: 24px 24px;
            }

            [data-theme="dark"] #cp-view-detail {
                --dt-bg: #1c1b1a; --dt-card: #252423; --dt-text: #e6e4df; --dt-sub: #827e7a;
                --dt-accent: #a37272; --dt-accent-lt: #3a2e2e; --dt-border: #3b3835; --dt-shape: #4a4744;
            }

            #cp-view-detail .cp-container { max-width: 100%; margin: 0 auto; position: relative; padding-bottom: 80px; }

            #cp-view-detail .dt-top-nav { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 10px; display: flex; justify-content: space-between; align-items: center; }
            #cp-view-detail .dt-back-btn { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 500; letter-spacing: 2px; color: var(--dt-text); cursor: pointer; text-transform: uppercase; }
            #cp-view-detail .dt-hero { padding: 20px 24px 40px; position: relative; }
            #cp-view-detail .dt-hero h1 { font-family: 'Noto Serif SC', serif; font-size: 32px; font-weight: 900; line-height: 1.2; color: var(--dt-accent); margin-bottom: 8px; }
            #cp-view-detail .dt-subtitle { font-size: 11px; letter-spacing: 1px; color: var(--dt-sub); text-transform: uppercase; font-family: 'Space Mono', monospace; }
            #cp-view-detail .dt-handwritten { font-family: 'Caveat', cursive; font-size: 22px; color: var(--dt-text); position: absolute; right: 24px; bottom: 30px; transform: rotate(-8deg); opacity: 0.7; }

            /* 拼贴网格 */
            #cp-view-detail .dt-grid { padding: 0 24px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; position: relative; align-items: start; }
            #cp-view-detail .dt-grid > div:nth-child(even) { margin-top: 30px; }

            /* 涂鸦 */
            #cp-view-detail .scribble { position: absolute; pointer-events: none; z-index: 10; }

            /* 入口卡片 */
            #cp-view-detail .nav-card { background: var(--dt-card); border: 1px solid var(--dt-border); border-radius: 16px; padding: 16px; position: relative; display: flex; flex-direction: column; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.02); }
            #cp-view-detail .nav-card:active { transform: scale(0.96); filter: brightness(0.95); }
            
            #cp-view-detail .card-pill { align-self: flex-start; padding: 4px 10px; border-radius: 20px; font-size: 9px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
            #cp-view-detail .card-title-zh { font-family: 'Noto Serif SC', serif; font-size: 16px; font-weight: 700; color: var(--dt-text); margin-bottom: 2px; }
            #cp-view-detail .card-title-en { font-size: 10px; color: var(--dt-sub); font-style: italic; }

            /* 占位图形 */
            #cp-view-detail .shape-block { width: 100%; height: 80px; background: var(--dt-shape); border-radius: 8px; margin-bottom: 12px; display: flex; justify-content: center; align-items: center; overflow: hidden; position: relative; }

            /* 各模块独立样式 */
            #cp-view-detail .mod-news .shape-block { background: transparent; border: 1px solid var(--dt-border); display: flex; flex-direction: column; padding: 8px; }
            #cp-view-detail .mod-news .line { width: 100%; height: 1px; background: var(--dt-border); margin: 2px 0; }
            #cp-view-detail .mod-news .line.thick { height: 3px; background: var(--dt-text); width: 60%; margin-bottom: 6px; }
            #cp-view-detail .mod-news .card-pill { background: var(--dt-accent-lt); color: var(--dt-accent); }

            #cp-view-detail .mod-music .shape-block { background: var(--dt-accent); }
            #cp-view-detail .vinyl { width: 50px; height: 50px; border-radius: 50%; background: #222; border: 2px solid rgba(255,255,255,0.2); position: relative; }
            #cp-view-detail .vinyl::after { content: ''; position: absolute; top:50%; left:50%; transform: translate(-50%, -50%); width: 14px; height: 14px; background: var(--dt-accent); border-radius: 50%; }
            #cp-view-detail .mod-music .card-pill { background: var(--dt-text); color: var(--dt-card); }

            #cp-view-detail .mod-roam { border: 1px dashed var(--dt-sub); }
            #cp-view-detail .mod-roam .shape-block { background: transparent; height: 60px; border-bottom: 1px dashed var(--dt-border); border-radius: 0; justify-content: space-between; font-family: monospace; font-size: 18px; color: var(--dt-text); }
            #cp-view-detail .mod-roam .card-pill { border: 1px solid var(--dt-border); color: var(--dt-text); }

            #cp-view-detail .mod-room .shape-block { border-radius: 40px 40px 0 0; background: linear-gradient(to bottom, var(--dt-shape), var(--dt-bg)); }
            #cp-view-detail .mod-room .card-pill { background: rgba(0,0,0,0.05); color: var(--dt-text); }

            #cp-view-detail .mod-resume .shape-block { background: transparent; align-items: flex-start; justify-content: flex-start; }
            #cp-view-detail .barcode { font-family: 'Courier New', monospace; font-size: 12px; font-weight: bold; letter-spacing: -1px; color: var(--dt-sub); }
            #cp-view-detail .mod-resume .card-pill { background: transparent; border: 1px solid var(--dt-accent); color: var(--dt-accent); }

            #cp-view-detail .mod-sprite .shape-block { background: transparent; border: 1px solid var(--dt-border); }
            #cp-view-detail .orb { width: 40px; height: 40px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff, var(--dt-shape)); box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            #cp-view-detail .mod-sprite .card-pill { background: rgba(0,0,0,0.05); color: var(--dt-text); }

            #cp-view-detail .mod-wanted { border: 2px solid var(--dt-text); border-radius: 4px; }
            #cp-view-detail .mod-wanted .shape-block { background: var(--dt-text); border-radius: 0; }
            #cp-view-detail .wanted-mark { font-family: serif; font-size: 32px; color: var(--dt-bg); font-weight: 900; }
            #cp-view-detail .mod-wanted .card-pill { background: var(--dt-accent); color: white; border-radius: 2px; }

            #cp-view-detail .mod-companion { background: var(--dt-accent); border: none; color: white; }
            #cp-view-detail .mod-companion .shape-block { background: transparent; height: auto; margin-bottom: 20px; justify-content: flex-start;}
            #cp-view-detail .timer-text { font-family: 'Noto Serif SC', serif; font-size: 36px; font-weight: 900; line-height: 1; }
            #cp-view-detail .mod-companion .card-pill { background: rgba(255,255,255,0.2); color: white; }
            #cp-view-detail .mod-companion .card-title-zh { color: white; }
            #cp-view-detail .mod-companion .card-title-en { color: rgba(255,255,255,0.7); }

            #cp-view-detail .tape { position: absolute; top: -8px; left: 50%; transform: translateX(-50%) rotate(-3deg); width: 40px; height: 16px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05); backdrop-filter: blur(2px); z-index: 5; }
            /* =======================================
               View 3: 通缉令视图 (WANTED)
               ======================================= */
            #cp-view-wanted {
                --wt-bg: #0a0a0a; --wt-poster: #111111; --wt-silver: #e2e2e0;
                --wt-light: #f4f4f4; --wt-dark: #1a1a1a; --wt-red: #8b0000; --wt-grey: #333333;
                background-color: var(--wt-bg); color: var(--wt-light);
            }
            #cp-view-wanted .wt-container { max-width: 100%; margin: 0 auto; position: relative; padding-bottom: 80px; overflow-x: hidden; min-height: 100vh; }
            #cp-view-wanted .wt-top-nav { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 20px; display: flex; justify-content: space-between; align-items: center; background: linear-gradient(to bottom, #000 30%, transparent); position: sticky; top: 0; z-index: 100; }
            #cp-view-wanted .wt-nav-btn { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: var(--wt-light); cursor: pointer; display: flex; align-items: center; gap: 6px; text-transform: uppercase; opacity: 0.8; }
            #cp-view-wanted .wt-add-btn { background: var(--wt-silver); color: var(--wt-dark); font-size: 9px; font-weight: 900; letter-spacing: 1px; padding: 4px 8px; border-radius: 4px; display: flex; align-items: center; gap: 4px; cursor: pointer; transition: opacity 0.2s; }
            #cp-view-wanted .wt-add-btn:active { opacity: 0.7; }
            
            #cp-view-wanted .wt-collage { padding: 10px 24px 40px; display: flex; flex-direction: column; gap: 80px; }
            #cp-view-wanted .wt-record { position: relative; width: 100%; }
            
            #cp-view-wanted .wt-poster { position: relative; width: 90%; background: var(--wt-poster); border: 1px solid var(--wt-grey); padding: 20px; padding-bottom: 250px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); transform: rotate(-2deg); z-index: 1; }
            #cp-view-wanted .wt-agency { font-size: 8px; font-weight: 700; letter-spacing: 1px; color: #888; border-bottom: 1px solid var(--wt-grey); padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
            #cp-view-wanted .wt-title-grp { position: relative; margin-bottom: 16px; }
            #cp-view-wanted .wt-title-base { font-size: 26px; font-weight: 900; letter-spacing: -1px; color: var(--wt-light); text-transform: uppercase; line-height: 1; }
            #cp-view-wanted .wt-title-over { font-family: 'Caveat', cursive; font-size: 36px; color: transparent; -webkit-text-stroke: 1px var(--wt-light); position: absolute; top: -10px; right: -10px; transform: rotate(-5deg); opacity: 0.8; }
            #cp-view-wanted .wt-photo { width: 100%; height: 200px; object-fit: cover; filter: grayscale(100%) contrast(1.3) brightness(0.9); border: 1px solid #444; margin-bottom: 8px; }
            #cp-view-wanted .wt-warn { background: var(--wt-light); color: var(--wt-dark); font-size: 9px; font-weight: 900; padding: 4px 8px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; }
            #cp-view-wanted .wt-row { display: flex; border-top: 1px solid var(--wt-grey); padding: 8px 0; }
            #cp-view-wanted .wt-label { width: 30%; font-size: 9px; font-weight: 900; color: #888; letter-spacing: 1px; }
            #cp-view-wanted .wt-val { flex: 1; font-family: 'Noto Serif SC', serif; font-size: 11px; color: var(--wt-light); font-weight: 700; }
            #cp-view-wanted .wt-crimes { margin-top: 4px; padding-left: 12px; }
            #cp-view-wanted .wt-crimes li { font-family: 'Noto Serif SC', serif; font-size: 11px; line-height: 1.5; color: #ccc; margin-bottom: 4px; list-style-type: square; }
            
            #cp-view-wanted .wt-idcard { position: absolute; bottom: -20px; right: -10px; width: 85%; background: var(--wt-silver); border-radius: 8px; padding: 16px; box-shadow: -10px 15px 30px rgba(0,0,0,0.6), inset 0 0 10px rgba(255,255,255,0.5); transform: rotate(6deg); z-index: 3; color: var(--wt-dark); }
            #cp-view-wanted .wt-idhdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #aaa; padding-bottom: 6px; margin-bottom: 12px; }
            #cp-view-wanted .wt-idtitle { font-size: 14px; font-weight: 900; letter-spacing: -0.5px; }
            #cp-view-wanted .wt-idbadge { font-family: monospace; font-size: 8px; border: 1px solid var(--wt-dark); padding: 2px 6px; border-radius: 10px; }
            #cp-view-wanted .wt-idcont { display: flex; gap: 12px; }
            #cp-view-wanted .wt-idpic { width: 60px; height: 80px; object-fit: cover; border: 2px solid var(--wt-dark); padding: 2px; filter: grayscale(100%) contrast(1.2); }
            #cp-view-wanted .wt-iddets { flex: 1; display: flex; flex-direction: column; gap: 6px; }
            #cp-view-wanted .wt-idline { display: flex; flex-direction: column; }
            #cp-view-wanted .wt-idlbl { font-size: 7px; font-weight: 900; color: #555; text-transform: uppercase; }
            #cp-view-wanted .wt-idv { font-family: 'Noto Serif SC', serif; font-size: 12px; font-weight: 900; border-bottom: 1px dashed #aaa; padding-bottom: 2px; }
            #cp-view-wanted .wt-stamp { margin-top: 12px; background: var(--wt-dark); color: var(--wt-silver); font-size: 10px; font-weight: 900; text-align: center; padding: 6px; letter-spacing: 2px; text-transform: uppercase; }
            #cp-view-wanted .wt-signline { margin-top: 16px; display: flex; justify-content: flex-end; align-items: flex-end; gap: 8px; }
            #cp-view-wanted .wt-signtxt { font-size: 8px; font-weight: 900; }
            #cp-view-wanted .wt-sign { font-family: 'Caveat', cursive; font-size: 24px; line-height: 0.5; border-bottom: 1px solid #333; width: 80px; text-align: center; }
            
            #cp-view-wanted .wt-star { position: absolute; z-index: 5; filter: drop-shadow(2px 4px 4px rgba(0,0,0,0.6)); }
            #cp-view-wanted .wt-seal { position: absolute; top: 30%; left: -15px; z-index: 4; width: 60px; height: 60px; background: #000; border-radius: 50%; border: 2px solid #fff; display: flex; justify-content: center; align-items: center; color: #fff; font-size: 8px; font-weight: 900; text-align: center; box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
            
            /* 通缉令卡片操作按钮 */
            #cp-view-wanted .wt-card-actions { display: flex; gap: 12px; z-index: 10; }
            #cp-view-wanted .wt-action-btn { background: transparent; border: none; color: #666; cursor: pointer; transition: color 0.2s, transform 0.1s; display: flex; align-items: center; justify-content: center; font-size: 16px; padding: 2px; }
            #cp-view-wanted .wt-action-btn:hover { color: #ccc; }
            #cp-view-wanted .wt-action-btn:active { transform: scale(0.9); color: #fff; }
            #cp-view-wanted .wt-action-btn.del:hover { color: var(--wt-red); }

            /* 通缉令录入弹窗 (双模式) */
            #cp-view-wanted .wt-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); z-index: 200; display: flex; flex-direction: column; justify-content: flex-end; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
            #cp-view-wanted .wt-modal.active { opacity: 1; pointer-events: all; }
            #cp-view-wanted .wt-mcontent { background: #1a1a1a; width: 100%; height: 85vh; border-radius: 24px 24px 0 0; padding: 30px 24px; border-top: 1px solid #333; transform: translateY(100%); transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); display: flex; flex-direction: column; color: var(--wt-light); }
            #cp-view-wanted .wt-modal.active .wt-mcontent { transform: translateY(0); }
            #cp-view-wanted .wt-mhdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
            #cp-view-wanted .wt-mtitle { font-size: 16px; font-weight: 900; letter-spacing: 1px; }
            #cp-view-wanted .wt-mclose { color: #888; cursor: pointer; }
            
            /* 拨动开关 */
            #cp-view-wanted .wt-toggle-box { display: flex; background: #000; border-radius: 8px; padding: 4px; margin-bottom: 24px; border: 1px solid #333; }
            #cp-view-wanted .wt-toggle-btn { flex: 1; text-align: center; padding: 10px 0; font-family: 'Space Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #666; cursor: pointer; border-radius: 4px; transition: 0.3s; }
            #cp-view-wanted .wt-toggle-btn.active { background: #333; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.5); }

            /* 表单元素 */
            #cp-view-wanted .wt-grp { margin-bottom: 20px; }
            #cp-view-wanted .wt-lbl { display: block; font-size: 9px; font-weight: 900; color: #888; margin-bottom: 8px; letter-spacing: 1px; }
            #cp-view-wanted .wt-inp { width: 100%; background: transparent; border: none; border-bottom: 1px solid #444; color: #fff; font-family: 'Noto Serif SC', serif; font-size: 14px; padding: 8px 0; outline: none; }
            #cp-view-wanted .wt-inp:focus { border-bottom-color: #fff; }
            #cp-view-wanted .wt-area { width: 100%; background: #222; border: 1px solid #333; color: #fff; font-family: 'Noto Serif SC', serif; font-size: 14px; padding: 12px; min-height: 80px; resize: none; outline: none; border-radius: 4px; }
            #cp-view-wanted .wt-btn { background: var(--wt-light); color: var(--wt-dark); border: none; padding: 16px; font-size: 12px; font-weight: 900; letter-spacing: 2px; margin-top: auto; cursor: pointer; border-radius: 4px; transition: 0.2s; }
            #cp-view-wanted .wt-btn:active { transform: scale(0.98); background: #ccc; }
            #cp-view-wanted .wt-btn:disabled { background: #444; color: #888; cursor: not-allowed; transform: none; }

            /* AI 扫描仪容器 */
            #cp-view-wanted .wt-scanner-box { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; }
            #cp-view-wanted .wt-radar { width: 120px; height: 120px; border-radius: 50%; border: 1px solid #333; position: relative; display: flex; justify-content: center; align-items: center; overflow: hidden; box-shadow: 0 0 30px rgba(139,0,0,0.1); }
            #cp-view-wanted .wt-radar::before { content: ''; position: absolute; width: 50%; height: 50%; top: 0; left: 0; background: linear-gradient(45deg, transparent, rgba(139,0,0,0.8)); transform-origin: bottom right; animation: wt-spin 2s linear infinite; }
            #cp-view-wanted .wt-radar::after { content: ''; position: absolute; inset: 2px; background: #1a1a1a; border-radius: 50%; }
            #cp-view-wanted .wt-radar i { position: relative; z-index: 2; font-size: 40px; color: var(--wt-red); }
            @keyframes wt-spin { 100% { transform: rotate(360deg); } }
            #cp-view-wanted .wt-sys-text { font-family: 'Space Mono', monospace; font-size: 10px; color: #888; text-align: center; line-height: 1.6; letter-spacing: 1px; }
            /* --- 3D 翻转与背面卡片样式 --- */
            #cp-view-wanted .wt-record { perspective: 1500px; cursor: pointer; }
            #cp-view-wanted .wt-flip-inner { position: relative; width: 100%; transform-style: preserve-3d; transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
            #cp-view-wanted .wt-record.flipped .wt-flip-inner { transform: rotateY(180deg); }
            
            #cp-view-wanted .wt-front { position: relative; width: 100%; backface-visibility: hidden; z-index: 2; }
            #cp-view-wanted .wt-back { position: absolute; inset: 0; width: 100%; height: 100%; backface-visibility: hidden; transform: rotateY(180deg); z-index: 1; display: flex; justify-content: center; align-items: center; }
            
            /* 背面黑卡设计 */
            #cp-view-wanted .wt-back-poster { width: 90%; height: 90%; background: var(--wt-poster); border: 1px solid var(--wt-grey); padding: 40px 30px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); transform: rotate(2deg); display: flex; flex-direction: column; justify-content: center; position: relative; overflow: hidden; }
            #cp-view-wanted .wt-back-msg { font-family: 'Noto Serif SC', serif; font-size: 15px; line-height: 2.2; color: #d0d0d0; text-align: justify; z-index: 2; letter-spacing: 1px; }
            #cp-view-wanted .wt-back-sign { font-family: 'Caveat', cursive; font-size: 32px; color: var(--wt-red); align-self: flex-end; margin-top: 40px; z-index: 2; transform: rotate(-5deg); }
            #cp-view-wanted .wt-back-watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); font-family: 'Allura', cursive; font-size: 80px; color: rgba(255,255,255,0.03); white-space: nowrap; pointer-events: none; z-index: 1; }
            
            /* 翻转提示小呼吸灯 */
            #cp-view-wanted .wt-flip-hint { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 14px; z-index: 20; animation: wt-pulse 2s infinite; backdrop-filter: blur(4px); }
            @keyframes wt-pulse { 0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.4); } 70% { box-shadow: 0 0 0 10px rgba(255,255,255,0); } 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); } }
            /* =======================================
               View 4: 异步漫游视图 (ROAM)
               ======================================= */
            #cp-view-roam {
                --roam-bg: #f4f1eb; --roam-ink: #2b2826; --roam-grey: #8a8580; --roam-line: #dcd7ce;
                --roam-night: #3a3f4f; --roam-rain: #9baab8; --roam-sunset: #d4a392; --roam-cafe: #bdaea0;
                background-color: var(--roam-bg); color: var(--roam-ink);
                background-image: radial-gradient(var(--roam-line) 1px, transparent 1px);
                background-size: 20px 20px; font-family: 'Inter', -apple-system, sans-serif;
                transition: background-color 1s ease;
            }
            [data-theme="dark"] #cp-view-roam {
                --roam-bg: #1c1b1a; --roam-ink: #e6e4df; --roam-grey: #827e7a; --roam-line: #3b3835;
            }
            #cp-view-roam .roam-container { max-width: 100%; margin: 0 auto; position: relative; padding-bottom: 120px; min-height: 100vh; overflow-x: hidden; }
            #cp-view-roam .roam-nav { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 10px; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 60; }
            #cp-view-roam .roam-btn { font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 1px; cursor: pointer; display: flex; align-items: center; gap: 4px; text-transform: uppercase;}
            #cp-view-roam .roam-add-btn { background: var(--roam-ink); color: var(--roam-bg); font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; padding: 6px 10px; border-radius: 4px; display: flex; align-items: center; gap: 4px; cursor: pointer; transition: transform 0.2s; text-transform: uppercase; }
            #cp-view-roam .roam-add-btn:active { transform: scale(0.95); }
            #cp-view-roam .roam-add-btn.outline { background: transparent; color: var(--roam-ink); border: 1px solid var(--roam-ink); }

            #cp-view-roam .roam-hero { padding: 20px 24px 40px; position: relative; z-index: 60; pointer-events: none; }
            #cp-view-roam .roam-title { font-family: 'Noto Serif SC', serif; font-size: 30px; font-weight: 900; line-height: 1; letter-spacing: -1px; position: relative; z-index: 2; }
            #cp-view-roam .roam-subtitle { font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 10px; color: var(--roam-grey); letter-spacing: 2px; text-transform: uppercase; margin-top: 8px; }
            #cp-view-roam .roam-hw { font-family: 'Caveat', cursive; font-size: 20px; color: var(--roam-ink); position: absolute; right: 24px; top: 10px; transform: rotate(-5deg); opacity: 0.6; }

            #cp-view-roam .roam-feed { padding: 0 20px; display: flex; flex-direction: column; gap: 60px; position: relative; z-index: 10; }
            #cp-view-roam .roam-cap { position: relative; width: 100%; display: flex; flex-direction: column; cursor: pointer; transition: transform 0.3s; }
            #cp-view-roam .roam-cap:active { transform: scale(0.98); }
            #cp-view-roam .roam-cap:nth-child(odd) { align-items: flex-start; }
            #cp-view-roam .roam-cap:nth-child(even) { align-items: flex-end; }

            #cp-view-roam .roam-frame { background: #fff; padding: 10px 10px 45px 10px; box-shadow: 2px 8px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.05); width: 75%; position: relative; z-index: 2; }
            #cp-view-roam .roam-cap:nth-child(odd) .roam-frame { transform: rotate(-2deg); }
            #cp-view-roam .roam-cap:nth-child(even) .roam-frame { transform: rotate(3deg); }

            #cp-view-roam .roam-swatch { width: 100%; height: 180px; position: relative; display: flex; justify-content: center; align-items: center; background-size: cover; background-position: center; overflow: hidden; border-radius: 2px; }
            #cp-view-roam .roam-swatch::after { content: ''; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.15' mix-blend-mode='overlay'/%3E%3C/svg%3E"); pointer-events: none; }

            #cp-view-roam .swatch-night { background-color: var(--roam-night); }
            #cp-view-roam .swatch-rain { background-color: var(--roam-rain); }
            #cp-view-roam .swatch-sunset { background-color: var(--roam-sunset); }
            #cp-view-roam .swatch-cafe { background-color: var(--roam-cafe); }

            #cp-view-roam .roam-stamp { font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 14px; font-weight: bold; color: rgba(255,255,255,0.9); letter-spacing: 4px; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.6); padding: 6px 12px; backdrop-filter: blur(4px); background: rgba(0,0,0,0.2); z-index: 2; }
            #cp-view-roam .roam-loc { position: absolute; bottom: 15px; left: 12px; font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 8px; color: #888; letter-spacing: 1px; display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%; }
          #cp-view-roam .roam-note { font-family: 'Long Cang', 'Caveat', cursive; font-size: 14px; color: var(--roam-ink); line-height: 1.4; position: relative; z-index: 3; max-width: 90%; margin-top: -5px; background: rgba(244, 241, 235, 0.85); backdrop-filter: blur(4px); padding: 10px 16px; border-radius: 2px; box-shadow: 2px 4px 10px rgba(0,0,0,0.05); border: 1px dashed var(--roam-line); }
            #cp-view-roam .roam-cap:nth-child(odd) .roam-note { transform: rotate(1deg); margin-left: 20px; }
            #cp-view-roam .roam-cap:nth-child(even) .roam-note { transform: rotate(-2deg); margin-right: 20px; align-self: flex-start; }
            #cp-view-roam .roam-author { font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 10px; font-weight: bold; display: block; margin-top: 8px; text-align: right; color: var(--roam-grey); }

            #cp-view-roam .roam-tape { position: absolute; background: rgba(255,255,255,0.5); width: 70px; height: 22px; border: 1px solid rgba(0,0,0,0.03); box-shadow: 0 1px 3px rgba(0,0,0,0.05); backdrop-filter: blur(2px); z-index: 5; }
            #cp-view-roam .tape-top { top: -10px; left: 50%; transform: translateX(-50%) rotate(-3deg); }
            #cp-view-roam .tape-corner { top: -10px; right: -15px; transform: rotate(45deg); width: 50px; }
            #cp-view-roam .roam-doodle { position: absolute; pointer-events: none; z-index: 4; }

            /* 素材贴纸 DIY */
            #cp-view-roam .sticker-layer { position: absolute; inset: 0; pointer-events: none; z-index: 50; overflow: hidden; }
            #cp-view-roam .sticker-wrapper { position: absolute; display: inline-block; transform-origin: center center; pointer-events: auto; background: transparent !important; }
            #cp-view-roam .sticker-wrapper img { display: block; max-width: 150px; max-height: 150px; pointer-events: none; filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.15)); }
            #cp-view-roam.diy-mode-active .sticker-wrapper { cursor: grab; }
            #cp-view-roam.diy-mode-active .sticker-wrapper:active { cursor: grabbing; }
            #cp-view-roam .sticker-wrapper.active { z-index: 100 !important; }
            #cp-view-roam .sticker-controls { position: absolute; inset: -4px; border: 1.5px dashed rgba(43, 40, 38, 0.5); pointer-events: none; display: none; }
            #cp-view-roam.diy-mode-active .sticker-wrapper.active .sticker-controls { display: block; }
            #cp-view-roam .sticker-close { position: absolute; top: -12px; left: -12px; width: 24px; height: 24px; background: var(--roam-ink); color: var(--roam-bg); border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 12px; pointer-events: auto; cursor: pointer; }
            #cp-view-roam .sticker-handle { position: absolute; bottom: -12px; right: -12px; width: 24px; height: 24px; background: var(--roam-bg); color: var(--roam-ink); border: 1.5px solid var(--roam-ink); border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 12px; pointer-events: auto; cursor: nwse-resize; }

            #cp-view-roam .finish-diy-btn { position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%) translateY(100px); opacity: 0; pointer-events: none; background: var(--roam-ink); color: var(--roam-bg); padding: 14px 30px; border-radius: 30px; cursor: pointer; font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); z-index: 200; transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s; }
           #cp-view-roam .finish-diy-btn.active { transform: translateX(-50%) translateY(0); opacity: 1; pointer-events: auto; }
            #cp-view-roam .finish-diy-btn:active { transform: translateX(-50%) scale(0.95); }

            /* 素材库浮窗 */
            #cp-view-roam .lib-overlay { position: fixed; inset: 0; background: rgba(244, 241, 235, 0.8); backdrop-filter: blur(8px); z-index: 300; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; overscroll-behavior: none; }
            #cp-view-roam .lib-overlay.active { opacity: 1; pointer-events: all; }
            #cp-view-roam .lib-window { background: var(--roam-bg); width: 90%; max-width: 400px; max-height: 80vh; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.1); border: 1px solid var(--roam-line); display: flex; flex-direction: column; transform: scale(0.95); transition: transform 0.3s; overscroll-behavior: none; }
            #cp-view-roam .lib-overlay.active .lib-window { transform: scale(1); }
            #cp-view-roam .lib-hdr { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--roam-line); }
            #cp-view-roam .lib-title { font-family: 'Courier Prime', 'Space Mono', monospace; font-weight: bold; font-size: 14px; color: var(--roam-ink); }
            #cp-view-roam .lib-actions { padding: 15px 20px; display: flex; gap: 10px; background: rgba(0,0,0,0.02); }
            #cp-view-roam .lib-btn { flex: 1; padding: 10px; border: 1px dashed var(--roam-grey); border-radius: 6px; background: transparent; cursor: pointer; font-size: 11px; color: var(--roam-ink); display: flex; justify-content: center; align-items: center; gap: 6px; font-weight: bold; }
            #cp-view-roam .lib-btn:active { background: rgba(0,0,0,0.05); }
            #cp-view-roam .url-area { padding: 0 20px; display: none; margin-bottom: 15px; }
            #cp-view-roam .url-area.active { display: block; }
            #cp-view-roam .url-ta { width: 100%; height: 60px; padding: 10px; border: 1px solid var(--roam-line); border-radius: 4px; font-size: 10px; resize: none; outline: none; font-family: monospace; background: var(--roam-bg); color: var(--roam-ink); }
            #cp-view-roam .url-sub { width: 100%; padding: 8px; margin-top: 8px; background: var(--roam-ink); color: var(--roam-bg); border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;}
            #cp-view-roam .lib-grid { padding: 20px; flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; overscroll-behavior: contain; }
            #cp-view-roam .mat-item { aspect-ratio: 1; background: var(--roam-bg); border: 1px solid var(--roam-line); border-radius: 8px; display: flex; justify-content: center; align-items: center; cursor: pointer; position: relative; overflow: hidden; background-image: radial-gradient(rgba(0,0,0,0.1) 1px, transparent 1px); background-size: 10px 10px; }
            #cp-view-roam .mat-item img { max-width: 80%; max-height: 80%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
            #cp-view-roam .mat-item.selected { border: 2px solid var(--roam-ink); }
            #cp-view-roam .mat-item.selected::after { content: '✓'; position: absolute; top: 4px; right: 4px; background: var(--roam-ink); color: var(--roam-bg); width: 16px; height: 16px; border-radius: 50%; font-size: 10px; display: flex; justify-content: center; align-items: center; }
            #cp-view-roam .lib-empty { grid-column: span 3; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; color: var(--roam-grey); }
            #cp-view-roam .lib-ftr { padding: 20px; border-top: 1px solid var(--roam-line); }
            #cp-view-roam .lib-ok { width: 100%; padding: 14px; background: var(--roam-ink); color: var(--roam-bg); border: none; border-radius: 8px; font-family: 'Courier Prime', 'Space Mono', monospace; font-weight: bold; font-size: 14px; cursor: pointer; transition: transform 0.2s; }
            #cp-view-roam .lib-ok:active { transform: scale(0.98); }
            #cp-view-roam .lib-ok:disabled { opacity: 0.5; cursor: not-allowed; }

            /* 胶囊生成模态框 */
           #cp-view-roam .crt-overlay { position: fixed; inset: 0; background: rgba(244, 241, 235, 0.95); backdrop-filter: blur(10px); z-index: 400; display: flex; flex-direction: column; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; overscroll-behavior: none; }
            #cp-view-roam .crt-overlay.active { opacity: 1; pointer-events: all; }
            #cp-view-roam .crt-hdr { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 20px; display: flex; justify-content: space-between; border-bottom: 1px dashed var(--roam-line); color: var(--roam-ink); }
            #cp-view-roam .crt-body { padding: 30px 24px; flex: 1; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; color: var(--roam-ink); overscroll-behavior: none; }
            #cp-view-roam .crt-lbl { font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 10px; font-weight: bold; color: var(--roam-grey); text-transform: uppercase; margin-bottom: 8px; display: block; }
            #cp-view-roam .img-box { width: 100%; height: 160px; border: 1px dashed var(--roam-line); border-radius: 4px; display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer; background-size: cover; background-position: center; background-color: rgba(0,0,0,0.05); }
            #cp-view-roam .loc-inp { width: 100%; background: transparent; border: none; border-bottom: 1px solid var(--roam-line); font-family: 'Noto Serif SC', serif; font-size: 16px; color: var(--roam-ink); outline: none; padding: 8px 0; }
            #cp-view-roam .emo-ta { width: 100%; background: transparent; border: none; border-bottom: 1px solid var(--roam-line); font-family: 'Long Cang', 'Caveat', cursive; font-size: 24px; color: var(--roam-ink); resize: none; outline: none; min-height: 100px; line-height: 1.5; padding-bottom: 10px; }
            #cp-view-roam .vibe-picker { display: flex; gap: 12px; margin-top: 10px; }
            #cp-view-roam .vb-btn { width: 40px; height: 40px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; position: relative; }
            #cp-view-roam .vb-btn.active { border-color: var(--roam-ink); transform: translateY(-3px); }
            #cp-view-roam .vb-btn.active::after { content: '✓'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.8); font-family: sans-serif; font-size: 14px; }
            #cp-view-roam .crt-sub { background: var(--roam-ink); color: var(--roam-bg); width: 100%; padding: 16px; border-radius: 4px; border: none; font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 14px; font-weight: bold; letter-spacing: 2px; margin-top: auto; cursor: pointer; }
            /* 每日时空信封 (盲盒) */
            #cp-view-roam .roam-envelope-wrapper { width: 80%; margin: 20px auto 40px; background: transparent; border: 1.5px dashed var(--roam-ink); border-radius: 8px; padding: 30px 20px; text-align: center; cursor: pointer; position: relative; transition: transform 0.3s, background 0.3s; }
            #cp-view-roam .roam-envelope-wrapper:active { transform: scale(0.96); background: rgba(0,0,0,0.02); }
            #cp-view-roam .roam-envelope-mark { width: 44px; height: 44px; background: #8b0000; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; box-shadow: 0 4px 15px rgba(139,0,0,0.3); }
            #cp-view-roam .roam-envelope-text { font-family: 'Courier Prime', 'Space Mono', monospace; font-size: 11px; font-weight: bold; letter-spacing: 2px; color: var(--roam-ink); text-transform: uppercase; }
            #cp-view-roam .roam-envelope-sub { font-size: 9px; color: var(--roam-grey); margin-top: 8px; letter-spacing: 1px; }

            /* 降级模式下的唯美文字底片 */
            #cp-view-roam .roam-fallback-text { position: absolute; inset: 15px; display: flex; align-items: center; justify-content: center; text-align: center; font-family: 'Noto Serif SC', serif; font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.9); font-style: italic; line-height: 1.6; z-index: 1; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
            #cp-view-roam.diy-mode-active,
#cp-view-roam:has(.crt-overlay.active),
#cp-view-roam:has(.lib-overlay.active) {
    overflow: hidden;
}
/* 漫游胶囊卡片操作按钮 */
            #cp-view-roam .roam-cap-actions { display: flex; gap: 12px; align-items: center; }
            #cp-view-roam .roam-action-btn { cursor: pointer; color: var(--roam-grey); font-size: 14px; transition: all 0.2s; padding: 2px; }
            #cp-view-roam .roam-action-btn:active { transform: scale(0.85); }
            #cp-view-roam .roam-action-btn:hover { color: var(--roam-ink); }
            #cp-view-roam .roam-action-btn.del:hover { color: #d97575; }
            /* =======================================
               View 5: 平行履历 (Parallel Resume)
               ======================================= */
            #cp-view-resume {
                --rs-bg-light: #f5f7fa;     --rs-card-white: #ffffff;   --rs-card-blue: #eef2f6;    
                --rs-primary-blue: #6b8aab; --rs-text-main: #2c363f;    --rs-text-muted: #8b9cae;   
                --rs-border-color: #dce4ed; --rs-fate-red: #a34b4b;
                
                background-color: var(--rs-bg-light); color: var(--rs-text-main);
                font-family: 'Inter', "PingFang SC", sans-serif;
                background-image: radial-gradient(var(--rs-border-color) 1px, transparent 1px);
                background-size: 20px 20px;
            }

            #cp-view-resume .rs-container { max-width: 100%; margin: 0 auto; position: relative; padding-bottom: 120px; min-height: 100vh; overflow-x: hidden; }
            #cp-view-resume .rs-top-nav { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 10px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 60; background: linear-gradient(to bottom, var(--rs-bg-light) 70%, transparent); }
            #cp-view-resume .rs-nav-btn { font-size: 11px; font-weight: 700; letter-spacing: 1px; color: var(--rs-primary-blue); cursor: pointer; display: flex; align-items: center; gap: 4px; text-transform: uppercase; }
            
            #cp-view-resume .rs-add-btn { background: var(--rs-card-white); color: var(--rs-primary-blue); border: 1px solid var(--rs-primary-blue); border-radius: 30px; padding: 6px 14px; font-size: 10px; font-weight: 800; letter-spacing: 1px; display: flex; align-items: center; gap: 4px; cursor: pointer; box-shadow: 0 4px 10px rgba(107, 138, 171, 0.1); transition: all 0.2s; }
            #cp-view-resume .rs-add-btn:active { transform: scale(0.95); background: var(--rs-primary-blue); color: #fff; }

            #cp-view-resume .rs-hero-section { padding: 10px 24px 30px; text-align: center; position: relative; }
            #cp-view-resume .rs-hero-title { font-family: 'Noto Serif SC', serif; font-size: 32px; font-weight: 900; color: var(--rs-text-main); margin-bottom: 6px; letter-spacing: 2px; }
            #cp-view-resume .rs-hero-subtitle { font-family: 'Courier Prime', monospace; font-size: 10px; color: var(--rs-text-muted); letter-spacing: 2px; text-transform: uppercase; }

            #cp-view-resume .rs-timeline-container { position: relative; padding: 20px 24px; }
            #cp-view-resume .rs-center-line { position: absolute; top: 0; left: 50%; bottom: 0; transform: translateX(-50%); width: 1px; border-left: 2px dashed var(--rs-border-color); z-index: 1; }
            #cp-view-resume .rs-timeline-block { position: relative; margin-bottom: 80px; width: 100%; display: flex; flex-direction: column; align-items: center; z-index: 2; }
            #cp-view-resume .rs-date-badge { background: var(--rs-primary-blue); color: #fff; padding: 6px 18px; border-radius: 20px; font-size: 12px; font-weight: 800; letter-spacing: 1px; margin-bottom: 30px; position: relative; z-index: 10; box-shadow: 0 4px 12px rgba(107, 138, 171, 0.3); display: flex; align-items: center; gap: 6px; transition: all 0.3s ease; }
            
            #cp-view-resume .rs-date-badge.intersecting { background: var(--rs-card-white); color: var(--rs-fate-red); border: 1.5px solid var(--rs-fate-red); box-shadow: 0 4px 15px rgba(163, 75, 75, 0.2); cursor: pointer; animation: rs-pulse-glow 2s infinite; }
            #cp-view-resume .rs-date-badge.intersecting:active { transform: scale(0.95); }
            @keyframes rs-pulse-glow { 0% { box-shadow: 0 0 0 0 rgba(163, 75, 75, 0.4); } 70% { box-shadow: 0 0 0 8px rgba(163, 75, 75, 0); } 100% { box-shadow: 0 0 0 0 rgba(163, 75, 75, 0); } }

            #cp-view-resume .rs-events-wrapper { position: relative; width: 100%; display: flex; justify-content: space-between; align-items: flex-start; z-index: 3; }
            #cp-view-resume .rs-horizontal-fate-line { position: absolute; top: 40%; left: 20%; width: 60%; height: 1px; border-top: 1.5px dashed var(--rs-fate-red); z-index: 1; opacity: 0.5; }
            #cp-view-resume .rs-event-card { width: 46%; padding: 16px; border-radius: 12px; position: relative; box-shadow: 0 8px 20px rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.05); z-index: 2; }
            #cp-view-resume .rs-tape { position: absolute; top: -8px; left: 50%; transform: translateX(-50%) rotate(-2deg); width: 40px; height: 16px; background: rgba(255,255,255,0.7); backdrop-filter: blur(2px); border: 1px solid rgba(0,0,0,0.05); z-index: 5; }
            #cp-view-resume .rs-event-card.left { background: var(--rs-card-white); transform: rotate(-1deg); }
            #cp-view-resume .rs-event-card.left .rs-tape { transform: translateX(-50%) rotate(3deg); background: rgba(220, 228, 237, 0.8); }
            #cp-view-resume .rs-event-card.right { background: var(--rs-card-blue); transform: rotate(1.5deg); margin-top: 40px; }
            #cp-view-resume .rs-owner-tag { font-size: 9px; font-weight: 800; color: var(--rs-text-muted); text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; display: flex; align-items: center; gap: 4px; }
            #cp-view-resume .rs-event-card.right .rs-owner-tag { color: var(--rs-primary-blue); }
            #cp-view-resume .rs-event-text { font-family: 'Noto Serif SC', serif; font-size: 12px; line-height: 1.6; color: var(--rs-text-main); text-align: justify; }
            #cp-view-resume .rs-event-card.empty { background: transparent; border: 1px dashed var(--rs-border-color); box-shadow: none; display: flex; justify-content: center; align-items: center; min-height: 80px; transform: none; }
            #cp-view-resume .rs-empty-hint { font-size: 9px; color: var(--rs-text-muted); font-style: italic; }

            /* Modal 样式 */
            #cp-view-resume .rs-modal-overlay { position: fixed; inset: 0; background: rgba(44, 54, 63, 0.6); backdrop-filter: blur(4px); z-index: 200; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
            #cp-view-resume .rs-modal-overlay.active { opacity: 1; pointer-events: all; }
            #cp-view-resume .rs-modal-content { background: var(--rs-bg-light); width: 90%; max-width: 400px; max-height: 85vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.2); transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); overflow: hidden; }
            #cp-view-resume .rs-modal-overlay.active .rs-modal-content { transform: scale(1); }
            #cp-view-resume .rs-modal-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; background: var(--rs-card-white); border-bottom: 1px solid var(--rs-border-color); }
            #cp-view-resume .rs-modal-title { font-size: 14px; font-weight: 800; color: var(--rs-text-main); letter-spacing: 1px; }
            #cp-view-resume .rs-close-btn { color: var(--rs-text-muted); cursor: pointer; }

            #cp-view-resume .rs-input-list { padding: 20px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
            #cp-view-resume .rs-input-block { background: var(--rs-card-white); border: 1px solid var(--rs-border-color); border-radius: 12px; padding: 16px; position: relative; }
            #cp-view-resume .rs-delete-block-btn { position: absolute; top: 12px; right: 12px; color: #ff6b6b; font-size: 16px; cursor: pointer; padding: 4px; }
            #cp-view-resume .rs-input-group { margin-bottom: 12px; }
            #cp-view-resume .rs-input-group:last-child { margin-bottom: 0; }
            #cp-view-resume .rs-input-label { font-size: 10px; font-weight: 700; color: var(--rs-text-muted); margin-bottom: 6px; display: block; }
            #cp-view-resume .rs-inp-date { width: 100%; border: none; border-bottom: 2px solid var(--rs-text-main); background: transparent; font-size: 18px; font-weight: 800; color: var(--rs-primary-blue); padding: 4px 0; outline: none; font-family: 'Inter', sans-serif; }
            #cp-view-resume .rs-inp-event { width: 100%; border: 1px dashed var(--rs-border-color); border-radius: 8px; background: #fafbfc; font-family: 'Noto Serif SC', serif; font-size: 14px; padding: 12px; min-height: 80px; resize: none; outline: none; color: var(--rs-text-main); line-height: 1.6; }
            #cp-view-resume .rs-inp-event:focus { border-color: var(--rs-primary-blue); }
            #cp-view-resume .rs-add-more-btn { text-align: center; padding: 14px; border: 1px dashed var(--rs-primary-blue); border-radius: 12px; color: var(--rs-primary-blue); font-size: 12px; font-weight: 700; cursor: pointer; margin-bottom: 10px; }
            #cp-view-resume .rs-add-more-btn:active { background: rgba(107, 138, 171, 0.05); }
            #cp-view-resume .rs-modal-footer { padding: 16px 20px; background: var(--rs-card-white); border-top: 1px solid var(--rs-border-color); }
            #cp-view-resume .rs-submit-btn { width: 100%; background: var(--rs-text-main); color: #fff; border: none; padding: 16px; border-radius: 8px; font-size: 14px; font-weight: bold; letter-spacing: 2px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; }
            #cp-view-resume .rs-submit-btn:active { transform: scale(0.98); }

            #cp-view-resume #rs-narrativeModal .rs-modal-content { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); border: 1px solid var(--rs-fate-red); box-shadow: 0 20px 40px rgba(163, 75, 75, 0.15); }
            #cp-view-resume #rs-narrativeModal .rs-modal-header { background: transparent; border-bottom: 1px dashed rgba(163, 75, 75, 0.3); color: var(--rs-fate-red); }
            #cp-view-resume #rs-narrativeModal .rs-modal-title { color: var(--rs-fate-red); display: flex; align-items: center; gap: 6px; }
            #cp-view-resume .rs-narrative-body { padding: 30px 24px; font-family: 'Noto Serif SC', serif; font-size: 14px; line-height: 2; color: var(--rs-text-main); text-align: justify; max-height: 60vh; overflow-y: auto; overscroll-behavior: contain; }

            #cp-view-resume .rs-loading-overlay { position: fixed; inset: 0; background: rgba(245, 247, 250, 0.9); backdrop-filter: blur(6px); z-index: 300; display: flex; flex-direction: column; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
            #cp-view-resume .rs-loading-overlay.active { opacity: 1; pointer-events: all; }
            #cp-view-resume .rs-loader-icon { font-size: 40px; color: var(--rs-primary-blue); animation: rs-spin 2s linear infinite; margin-bottom: 20px; }
            @keyframes rs-spin { 100% { transform: rotate(360deg); } }
            #cp-view-resume .rs-loading-text { font-size: 14px; font-weight: bold; color: var(--rs-text-main); letter-spacing: 1px; text-align: center; line-height: 2; }
            #cp-view-resume .rs-loading-text span { color: var(--rs-text-muted); font-size: 12px; font-weight: normal; }
            /* 拦截平行履历浮窗打开时的底层滚动 */
            #cp-view-resume:has(.rs-modal-overlay.active) {
                overflow: hidden;
            }
            /* 平行履历卡片操作按钮 */
            #cp-view-resume .rs-action-btn { cursor: pointer; color: var(--rs-text-muted); font-size: 14px; transition: all 0.2s; padding: 2px; }
            #cp-view-resume .rs-action-btn:active { transform: scale(0.85); }
            #cp-view-resume .rs-action-btn:hover { color: var(--rs-primary-blue); }
            #cp-view-resume .rs-action-btn.del:hover { color: var(--rs-fate-red); }
            /* =======================================
               View 6: 共同报纸 (Daily Orbit)
               ======================================= */
            #cp-view-news {
                --nw-bg-parchment: #d9cbb8; --nw-ink-main: #231f1c; --nw-ink-faded: #4a423b; --nw-ink-red: #782a2a;
                --nw-border-thick: 4px solid var(--nw-ink-main); --nw-border-thin: 1px solid var(--nw-ink-main); --nw-border-double: 3px double var(--nw-ink-main);
                
                font-family: 'Noto Serif SC', serif; background-color: var(--nw-bg-parchment); color: var(--nw-ink-main);
                background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E"), linear-gradient(90deg, rgba(0,0,0,0.02) 0%, transparent 2%, transparent 98%, rgba(0,0,0,0.02) 100%);
            }
            #cp-view-news .nw-container { max-width: 100%; margin: 0 auto; position: relative; padding-bottom: 120px; min-height: 100vh; overflow-x: hidden; }
            
            #cp-view-news .nw-top-nav { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 10px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 60; background: linear-gradient(to bottom, var(--nw-bg-parchment) 70%, transparent); }
            #cp-view-news .nw-nav-btn { font-family: 'Playfair Display', serif; font-size: 12px; font-weight: 700; letter-spacing: 1px; color: var(--nw-ink-main); cursor: pointer; display: flex; align-items: center; gap: 4px; text-transform: uppercase; }
            #cp-view-news .nw-add-btn { background: transparent; color: var(--nw-ink-main); border: 1px solid var(--nw-ink-main); border-radius: 4px; padding: 6px 12px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s; box-shadow: 2px 2px 0 rgba(35, 31, 28, 0.2); }
            #cp-view-news .nw-add-btn:active { transform: translate(2px, 2px); box-shadow: 0 0 0 transparent; }

            #cp-view-news .nw-feed { padding: 10px 16px 40px; display: flex; flex-direction: column; gap: 60px; }
            #cp-view-news .nw-card { background: rgba(255, 255, 255, 0.1); padding: 20px 16px; border: var(--nw-border-thin); box-shadow: inset 0 0 40px rgba(0,0,0,0.03), 4px 8px 20px rgba(0,0,0,0.05); position: relative; }
            #cp-view-news .nw-card::before { content: ''; position: absolute; top: 2px; left: 2px; right: 2px; bottom: 2px; border: 1px solid rgba(35, 31, 28, 0.3); pointer-events: none; }

            #cp-view-news .nw-masthead { text-align: center; border-bottom: var(--nw-border-thick); padding-bottom: 12px; margin-bottom: 16px; position: relative; }
            #cp-view-news .nw-masthead-title { font-family: 'UnifrakturMaguntia', cursive; font-size: 42px; line-height: 1; color: var(--nw-ink-main); margin-bottom: 4px; text-shadow: 1px 1px 0 rgba(255,255,255,0.5); }
            #cp-view-news .nw-masthead-sub { font-family: 'Playfair Display', serif; font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: var(--nw-ink-faded); border-top: 1px solid var(--nw-ink-main); display: inline-block; padding-top: 4px; margin-top: 4px; }

            #cp-view-news .nw-meta { display: flex; justify-content: space-between; align-items: center; border-bottom: var(--nw-border-double); padding: 4px 0; margin-bottom: 16px; font-family: 'Playfair Display', serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
            #cp-view-news .nw-meta span { display: flex; align-items: center; gap: 4px; }

            #cp-view-news .nw-headline { font-family: 'Noto Serif SC', serif; font-size: 28px; font-weight: 900; text-align: center; line-height: 1.2; margin-bottom: 20px; color: var(--nw-ink-main); letter-spacing: 1px; }
            #cp-view-news .nw-exclusive { background: var(--nw-ink-main); color: var(--nw-bg-parchment); font-family: 'Playfair Display', serif; font-size: 9px; font-weight: 800; padding: 2px 8px; letter-spacing: 2px; display: inline-block; margin-bottom: 12px; transform: rotate(-2deg); }

            #cp-view-news .nw-photo-container { width: 100%; border-top: var(--nw-border-thick); border-bottom: var(--nw-border-thick); padding: 10px 0; margin-bottom: 20px; background: rgba(0,0,0,0.03); display: flex; justify-content: center; align-items: center; gap: 16px; position: relative; overflow: hidden; }
            #cp-view-news .nw-avatar-frame { width: 110px; height: 140px; border: 2px solid var(--nw-ink-main); border-radius: 2px; position: relative; overflow: hidden; filter: sepia(0.15) grayscale(0.7) contrast(1.3) brightness(0.9); box-shadow: inset 0 0 10px rgba(0,0,0,0.5); background: #fff; }
            #cp-view-news .nw-avatar-frame img { width: 130%; height: 130%; object-fit: cover; position: absolute; top: -15%; left: -15%; animation: nw-magical-move 12s infinite alternate ease-in-out; }
            #cp-view-news .nw-avatar-frame.delay-anim img { animation-delay: -6s; animation-direction: alternate-reverse; }
            @keyframes nw-magical-move { 0% { transform: scale(1) translate(0, 0); } 50% { transform: scale(1.05) translate(-2%, 2%); } 100% { transform: scale(1) translate(2%, -2%); } }

            #cp-view-news .nw-vs { font-family: 'UnifrakturMaguntia', cursive; font-size: 24px; color: var(--nw-ink-faded); }

            #cp-view-news .nw-articles { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; position: relative; }
            #cp-view-news .nw-articles::after { content: ''; position: absolute; top: 0; left: 50%; width: 1px; height: 100%; background: var(--nw-ink-main); opacity: 0.3; }
            #cp-view-news .nw-col { position: relative; display: flex; flex-direction: column; }
            #cp-view-news .nw-byline { font-family: 'Playfair Display', serif; font-size: 10px; font-weight: bold; color: var(--nw-ink-faded); margin-bottom: 10px; border-bottom: 1px dashed var(--nw-ink-faded); padding-bottom: 4px; text-transform: uppercase; font-style: italic; }
            #cp-view-news .nw-byline b { color: var(--nw-ink-main); font-family: 'Noto Serif SC', serif; font-size: 12px; }
            #cp-view-news .nw-body { font-size: 11.5px; line-height: 1.8; color: var(--nw-ink-main); text-align: justify; flex: 1; }
            #cp-view-news .nw-body::first-letter { float: left; font-size: 42px; line-height: 0.8; margin-right: 6px; margin-top: 4px; font-weight: normal; font-family: 'UnifrakturMaguntia', cursive; color: var(--nw-ink-main); }

            /* 弹窗样式 */
            #cp-view-news .nw-modal-overlay { position: fixed; inset: 0; background: rgba(15, 12, 10, 0.8); backdrop-filter: blur(4px); z-index: 200; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
            #cp-view-news .nw-modal-overlay.active { opacity: 1; pointer-events: auto; }
            #cp-view-news .nw-scroll { background-color: #e4d5b7; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.15'/%3E%3C/svg%3E"); width: 90%; max-width: 400px; padding: 30px 24px; border-radius: 4px; box-shadow: 0 30px 60px rgba(0,0,0,0.5); border: 2px solid #b8a280; position: relative; transform: scale(0.95) translateY(20px); transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
            #cp-view-news .nw-scroll::before, #cp-view-news .nw-scroll::after { content: ''; position: absolute; left: -10px; right: -10px; height: 12px; background: #b8a280; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
            #cp-view-news .nw-scroll::before { top: -6px; }
            #cp-view-news .nw-scroll::after { bottom: -6px; }
            #cp-view-news .nw-modal-overlay.active .nw-scroll { transform: scale(1) translateY(0); }
            #cp-view-news .nw-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 2px solid var(--nw-ink-faded); padding-bottom: 10px; }
            #cp-view-news .nw-modal-title { font-family: 'UnifrakturMaguntia', cursive; font-size: 24px; color: var(--nw-ink-main); }
            #cp-view-news .nw-close-btn { cursor: pointer; font-size: 24px; color: var(--nw-ink-main); }
            #cp-view-news .nw-form-label { font-family: 'Playfair Display', serif; font-size: 11px; font-weight: 700; color: var(--nw-ink-faded); margin-bottom: 8px; display: block; text-transform: uppercase; }
            #cp-view-news .nw-textarea { width: 100%; border: none; background: transparent; font-family: 'Noto Serif SC', serif; font-size: 14px; min-height: 150px; resize: none; outline: none; color: var(--nw-ink-main); line-height: 1.8; border-bottom: 1px solid var(--nw-ink-faded); }
            #cp-view-news .nw-submit-btn { width: 100%; background: var(--nw-ink-main); color: var(--nw-bg-parchment); border: none; padding: 16px; font-family: 'Playfair Display', serif; font-size: 14px; font-weight: bold; letter-spacing: 2px; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 30px; text-transform: uppercase; }

            /* Loading 动画 */
            #cp-view-news .nw-loading { position: fixed; inset: 0; background: rgba(23, 20, 18, 0.95); z-index: 300; display: flex; flex-direction: column; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.4s; }
            #cp-view-news .nw-loading.active { opacity: 1; pointer-events: all; }
            #cp-view-news .nw-feather { font-size: 60px; color: #d9cbb8; margin-bottom: 30px; animation: nw-writing 1.5s infinite ease-in-out alternate; transform-origin: bottom left; }
            @keyframes nw-writing { 0% { transform: rotate(0deg) translateX(0); } 100% { transform: rotate(15deg) translateX(20px); } }
            #cp-view-news .nw-loading-text { font-family: 'Playfair Display', serif; font-size: 16px; font-style: italic; color: #d9cbb8; letter-spacing: 2px; text-align: center; line-height: 2; }
            #cp-view-news .nw-loading-text span { font-family: 'Noto Serif SC', serif; font-size: 12px; opacity: 0.6; display: block; font-style: normal; }

            /* 锁死底层滚动 */
            #cp-view-news:has(.nw-modal-overlay.active),
            #cp-view-news:has(.nw-loading.active) { overflow: hidden; }
            /* 补充页面进场的升起动画 */
            @keyframes fadeUp {
                0% { opacity: 0; transform: translateY(40px) scale(0.98); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            
            @keyframes slideUp {
                0% { opacity: 0; transform: translateY(30px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            /* 报纸卡片操作按钮 */
            #cp-view-news .nw-card-actions { position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 10; }
            #cp-view-news .nw-action-btn { background: transparent; border: none; color: var(--nw-ink-faded); cursor: pointer; transition: all 0.2s; font-size: 16px; padding: 4px; display: flex; align-items: center; justify-content: center; }
            #cp-view-news .nw-action-btn:active { transform: scale(0.85); }
            #cp-view-news .nw-action-btn:hover { color: var(--nw-ink-main); }
            #cp-view-news .nw-action-btn.del:hover { color: var(--nw-ink-red); }
            /* =======================================
               View 7: 陪伴模块 (Focus Companion)
               ======================================= */
            #cp-view-companion {
                --fc-bg-idle: #f4f2ed; --fc-text-idle: #2b2826; --fc-text-muted-idle: #8a8580; --fc-border-idle: #dcd7ce;
                --fc-bg-current: var(--fc-bg-idle); --fc-text-current: var(--fc-text-idle); --fc-text-muted-current: var(--fc-text-muted-idle);
                
                background-color: var(--fc-bg-current); color: var(--fc-text-current);
                min-height: 100vh; overflow: hidden; 
                transition: background-color 1.5s ease, color 1.5s ease;
            }
            #cp-view-companion::before {
                content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 2;
                background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.04'/%3E%3C/svg%3E");
            }

            #cp-view-companion .fc-character-bg {
                position: absolute; inset: 0; background-size: cover; background-position: center;
                z-index: 0; opacity: 0; pointer-events: none;
                filter: brightness(0.35) contrast(1.15) grayscale(0.1);
                transition: opacity 2s ease;
            }
            #cp-view-companion.is-focusing .fc-character-bg { opacity: 1; animation: fc-cinematic-pan 25s infinite alternate ease-in-out; }
            @keyframes fc-cinematic-pan { 0% { transform: scale(1) translate(0, 0); } 100% { transform: scale(1.06) translate(-1%, 1%); } }

            #cp-view-companion .fc-container { max-width: 100%; margin: 0 auto; position: relative; min-height: 100vh; display: flex; flex-direction: column; z-index: 10; }
            
            #cp-view-companion .fc-view-section { position: absolute; inset: 0; display: flex; flex-direction: column; transition: opacity 0.4s ease, transform 0.4s ease; }
            #cp-view-companion #fc-timerView { opacity: 1; pointer-events: all; transform: translateX(0); }
            #cp-view-companion #fc-archiveView { opacity: 0; pointer-events: none; transform: translateX(20px); }
            #cp-view-companion.show-archive #fc-timerView { opacity: 0; pointer-events: none; transform: translateX(-20px); }
            #cp-view-companion.show-archive #fc-archiveView { opacity: 1; pointer-events: all; transform: translateX(0); }

            #cp-view-companion .fc-fade-ui { transition: opacity 1.5s ease, transform 1.5s ease; }
            #cp-view-companion.is-focusing .fc-fade-ui { opacity: 0; pointer-events: none; transform: translateY(-10px); }

            #cp-view-companion .fc-top-nav { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 10px; display: flex; justify-content: space-between; align-items: center; }
            #cp-view-companion .fc-nav-btn { font-family: 'Courier Prime', monospace; font-size: 11px; font-weight: 700; letter-spacing: 2px; cursor: pointer; display: flex; align-items: center; gap: 4px; text-transform: uppercase; color: var(--fc-text-current); transition: color 1.5s ease; }
            #cp-view-companion .fc-records-btn { background: transparent; border: 1px solid var(--fc-text-idle); padding: 6px 12px; border-radius: 20px; color: var(--fc-text-idle); display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
            #cp-view-companion .fc-records-btn:active { background: rgba(0,0,0,0.05); }
            #cp-view-companion .fc-records-count { background: var(--fc-text-idle); color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 10px; }

            #cp-view-companion .fc-header-section { text-align: center; padding: 10px 24px 0; }
            #cp-view-companion .fc-hero-title { font-size: 24px; font-weight: 900; letter-spacing: 4px; line-height: 1.2; color: var(--fc-text-current); transition: color 1.5s ease; }
            #cp-view-companion .fc-hero-subtitle { font-family: 'Courier Prime', monospace; font-size: 10px; color: var(--fc-text-muted-current); letter-spacing: 3px; text-transform: uppercase; margin-top: 8px; transition: color 1.5s ease; }

            #cp-view-companion .fc-timer-wrapper { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; transition: all 1.5s cubic-bezier(0.4, 0, 0.2, 1); z-index: 20; width: 100%; }
            #cp-view-companion.is-focusing .fc-timer-wrapper { top: 88%; transform: translate(-50%, -50%) scale(0.65); }
            #cp-view-companion .fc-time-display { font-family: 'Playfair Display', serif; font-size: 110px; font-weight: 400; line-height: 1; letter-spacing: -4px; position: relative; z-index: 5; color: var(--fc-text-current); transition: color 1.5s ease, text-shadow 1.5s ease; }
            #cp-view-companion.is-focusing .fc-time-display { color: rgba(255,255,255,0.9); text-shadow: 0 4px 20px rgba(0,0,0,0.8); }
            #cp-view-companion .fc-time-label { font-family: 'Courier Prime', monospace; font-size: 10px; font-weight: bold; letter-spacing: 4px; color: var(--fc-text-muted-current); text-transform: uppercase; margin-top: 10px; transition: color 1.5s ease; }
            #cp-view-companion.is-focusing .fc-time-label { color: rgba(255,255,255,0.5); }

            #cp-view-companion .fc-task-card { background: #fff; padding: 24px 20px; border-radius: 12px; width: 85%; max-width: 320px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.05); position: absolute; top: 60%; left: 50%; transform: translate(-50%, -50%); z-index: 5; }
            #cp-view-companion .fc-task-title { font-family: 'Courier Prime', monospace; font-size: 9px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; text-align: center; }
            #cp-view-companion .fc-task-input { width: 100%; border: none; border-bottom: 1px dashed #ccc; background: transparent; font-family: 'Noto Serif SC', serif; font-size: 16px; color: #333; text-align: center; padding: 8px 0; outline: none; margin-bottom: 24px; }
            #cp-view-companion .fc-custom-time-row { display: flex; justify-content: center; align-items: center; gap: 8px; font-family: 'Noto Serif SC', serif; font-size: 12px; color: #555; background: #fafbfc; padding: 10px; border-radius: 8px; border: 1px dashed #eee; }
            #cp-view-companion .fc-time-number-input { width: 50px; border: none; border-bottom: 2px solid var(--fc-text-idle); background: transparent; font-family: 'Courier Prime', monospace; font-size: 18px; font-weight: bold; color: var(--fc-text-idle); text-align: center; outline: none; padding: 2px 0; }

            #cp-view-companion .fc-controls-section { position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%); display: flex; justify-content: center; align-items: center; z-index: 10; }
            #cp-view-companion .fc-main-btn { width: 70px; height: 70px; border-radius: 50%; background: var(--fc-text-current); color: var(--fc-bg-current); display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 10px 25px rgba(0,0,0,0.1); transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
            #cp-view-companion .fc-main-btn:active { transform: scale(0.9); }
            
            #cp-view-companion .fc-exit-btn { position: fixed; top: calc(env(safe-area-inset-top, 30px) + 20px); right: calc(env(safe-area-inset-right, 24px) + 20px); width: 44px; height: 44px; border-radius: 50%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: #fff; display: flex; justify-content: center; align-items: center; cursor: pointer; opacity: 0; pointer-events: none; backdrop-filter: blur(4px); transition: all 1.5s ease; z-index: 100; }
            #cp-view-companion.is-focusing .fc-exit-btn { opacity: 1; pointer-events: all; }

            /* HUD 耳语 */
            #cp-view-companion #fc-hudContainer { position: absolute; inset: 0; pointer-events: none; z-index: 50; }
            #cp-view-companion .fc-hud-whisper { position: absolute; left: 24px; max-width: 80%; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; opacity: 0; transform: translateY(10px); transition: opacity 0.8s ease, transform 0.8s ease; }
            #cp-view-companion .fc-hud-whisper.show { opacity: 1; transform: translateY(0); }
            #cp-view-companion .fc-hud-line { width: 0; height: 1px; background: rgba(255,255,255,0.8); box-shadow: 0 0 8px rgba(255,255,255,0.8); transition: width 1s ease; }
            #cp-view-companion .fc-hud-whisper.show .fc-hud-line { width: 40px; }
            #cp-view-companion .fc-hud-content { font-family: 'Noto Serif SC', serif; font-size: 15px; font-style: italic; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.8); letter-spacing: 2px; line-height: 1.6; display: flex; align-items: center; }
            #cp-view-companion .fc-hud-cursor { display: inline-block; width: 6px; height: 16px; background: #fff; margin-left: 4px; animation: fc-blink 1s step-end infinite; opacity: 0; }
            #cp-view-companion .fc-hud-whisper.show .fc-hud-cursor { opacity: 1; }
            @keyframes fc-blink { 50% { opacity: 0; } }

            /* 档案列表 */
            #cp-view-companion .fc-archive-list { padding: 20px 24px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
            #cp-view-companion .fc-record-card { background: #fff; padding: 16px 20px; border-radius: 8px; border: 1px solid var(--fc-border-idle); cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.02); transition: transform 0.2s; }
            #cp-view-companion .fc-record-card:active { transform: scale(0.98); }
            #cp-view-companion .fc-record-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px dashed var(--fc-border-idle); padding-bottom: 8px; }
            #cp-view-companion .fc-status-badge { font-family: 'Courier Prime', monospace; font-size: 9px; font-weight: bold; padding: 2px 6px; border-radius: 4px; letter-spacing: 1px; }
            #cp-view-companion .fc-status-badge.success { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
            #cp-view-companion .fc-status-badge.escaped { background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; }
            #cp-view-companion .fc-record-task { font-size: 14px; font-weight: 600; color: var(--fc-text-idle); margin-bottom: 6px; display: flex; justify-content: space-between; }
            #cp-view-companion .fc-record-preview { font-size: 12px; color: var(--fc-text-muted-idle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-style: italic; }
            #cp-view-companion .fc-empty-archive { text-align: center; color: var(--fc-text-muted-idle); padding-top: 50px; font-size: 12px; display: flex; flex-direction: column; align-items: center; gap: 10px; }

            /* 弹窗样式 */
            #cp-view-companion .fc-modal-overlay { position: fixed; inset: 0; background: rgba(43, 40, 38, 0.7); backdrop-filter: blur(5px); z-index: 200; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
            #cp-view-companion .fc-modal-overlay.active { opacity: 1; pointer-events: all; }
            #cp-view-companion .fc-center-modal { background: #fffdf9; width: 85%; max-width: 340px; border-radius: 8px; padding: 30px 24px; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.3); transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); border: 1px solid var(--fc-border-idle); }
            #cp-view-companion .fc-modal-overlay.active .fc-center-modal { transform: scale(1); }
            
            #cp-view-companion .fc-summary-badge { font-family: 'Noto Serif SC', serif; font-size: 10px; font-weight: bold; background: var(--fc-text-idle); color: #fff; padding: 4px 10px; display: inline-block; margin-bottom: 16px; letter-spacing: 2px; }
            #cp-view-companion .fc-summary-badge.failed { background: #8c3b3b; }
            #cp-view-companion .fc-summary-details { background: #f7f6f2; border: 1px solid var(--fc-border-idle); border-radius: 4px; padding: 12px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; }
            #cp-view-companion .fc-detail-row { display: flex; justify-content: space-between; align-items: center; font-family: 'Noto Serif SC', serif; font-size: 11px; color: var(--fc-text-muted-idle); border-bottom: 1px dashed rgba(0,0,0,0.05); padding-bottom: 4px; }
            #cp-view-companion .fc-detail-row b { color: var(--fc-text-idle); font-size: 12px; font-family: 'Courier Prime', monospace; }
            #cp-view-companion .fc-detail-row b.alert { color: #8c3b3b; }
            #cp-view-companion .fc-summary-quote { font-family: 'Long Cang', 'Caveat', cursive; font-size: 22px; color: var(--fc-text-idle); line-height: 1.5; text-align: center; padding: 10px 0; background: linear-gradient(to right, transparent, rgba(0,0,0,0.03), transparent); }
            
            #cp-view-companion .fc-lock-card { text-align: center; }
            #cp-view-companion .fc-shake { animation: fc-shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
            @keyframes fc-shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
            #cp-view-companion .fc-pwd-input { width: 100%; border: 1px solid #ccc; background: transparent; border-radius: 4px; font-size: 16px; text-align: center; padding: 12px; outline: none; margin-bottom: 16px; }
            #cp-view-companion .fc-unlock-btn { width: 100%; background: var(--fc-text-idle); color: #fff; border: none; padding: 14px; border-radius: 4px; font-family: 'Courier Prime', monospace; font-size: 12px; font-weight: bold; cursor: pointer; }
            /* =======================================
               View 8: 一起听 (Listen Together)
               ======================================= */
            #cp-view-music {
                --mu-bg: #0f141e; /* 深邃午夜蓝 */
                --mu-glass: rgba(255, 255, 255, 0.05);
                --mu-border: rgba(255, 255, 255, 0.1);
                --mu-text: #e2e8f0;
                --mu-sub: #94a3b8;
                --mu-accent: #38bdf8;
                
                background-color: var(--mu-bg); color: var(--mu-text);
                min-height: 100vh; overflow: hidden; 
                font-family: 'Inter', 'PingFang SC', sans-serif;
            }

            /* 动态模糊背景 (拉取专辑封面) */
           #cp-view-music .mu-bg-blur {
                position: absolute; inset: -50px; z-index: 0;
                background-image: url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=800');
                background-size: cover; background-position: center;
                filter: blur(40px) brightness(0.3) saturate(1.2);
            }

            #cp-view-music .mu-container {
                position: relative; z-index: 10; height: 100vh;
                display: flex; flex-direction: column; max-width: 480px; margin: 0 auto;
            }

            /* 顶部导航 */
            #cp-view-music .mu-top-nav {
                padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 10px;
                display: flex; justify-content: space-between; align-items: center;
            }
            #cp-view-music .mu-nav-btn {
                font-family: 'Courier Prime', monospace; font-size: 11px; font-weight: 700;
                letter-spacing: 2px; color: var(--mu-text); cursor: pointer; display: flex; align-items: center; gap: 4px; text-transform: uppercase;
            }
            #cp-view-music .mu-status-pill {
                background: var(--mu-glass); border: 1px solid var(--mu-border);
                padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: bold;
                display: flex; align-items: center; gap: 6px; backdrop-filter: blur(10px);
            }
            #cp-view-music .mu-live-dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; animation: mu-pulse 2s infinite; }
            @keyframes mu-pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }

            /* 播放器区域 (黑胶) */
            #cp-view-music .mu-player-section {
                padding: 20px 24px; display: flex; flex-direction: column; align-items: center; gap: 20px;
            }
            #cp-view-music .mu-vinyl-wrapper {
                position: relative; width: 110px; height: 110px; /* 尺寸改小 */
                margin-bottom: 10px;
                border-radius: 50%; background: #111;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 0 3px rgba(255,255,255,0.1);
                display: flex; justify-content: center; align-items: center;
                animation: mu-spin 6s linear infinite; animation-play-state: paused;
            }
            /* 新增：音乐控制台 (精致排版) */
            #cp-view-music .mu-controls {
                display: flex; justify-content: space-between; align-items: center; 
                width: 100%; max-width: 260px; margin: 10px auto 0;
            }
            #cp-view-music .mu-controls i {
                color: var(--mu-text); cursor: pointer; transition: transform 0.2s, color 0.2s;
            }
            #cp-view-music .mu-controls i:active { transform: scale(0.85); color: var(--mu-sub); }
            
            /* 按钮尺寸层级划分 */
            #cp-view-music .mu-ctrl-side { font-size: 20px; color: var(--mu-sub); } /* 左右两边的小功能键 */
            #cp-view-music .mu-ctrl-main { font-size: 28px; } /* 切歌键 */
            #cp-view-music .mu-ctrl-play { font-size: 46px; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.3); } /* 播放键最醒目 */
            
            #cp-view-music.is-playing .mu-vinyl-wrapper { animation-play-state: running; }
            @keyframes mu-spin { 100% { transform: rotate(360deg); } }
            
            #cp-view-music .mu-vinyl-cover {
                width: 70%; height: 70%; border-radius: 50%; object-fit: cover;
                border: 2px solid #000;
            }
            #cp-view-music .mu-vinyl-hole {
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                width: 12px; height: 12px; background: var(--mu-bg); border-radius: 50%;
                border: 1px solid rgba(0,0,0,0.5);
            }

            #cp-view-music .mu-song-info { text-align: center; }
            #cp-view-music .mu-song-title { font-size: 20px; font-weight: 800; letter-spacing: 1px; margin-bottom: 6px; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
            #cp-view-music .mu-song-artist { font-size: 12px; color: var(--mu-sub); font-family: 'Courier Prime', monospace; }

            /* 悬浮聊天区域 */
            #cp-view-music .mu-chat-section {
                flex: 1; margin: 0 16px 20px; background: var(--mu-glass);
                border: 1px solid var(--mu-border); border-radius: 20px;
                backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
                display: flex; flex-direction: column; overflow: hidden;
            }
            #cp-view-music .mu-chat-list {
                flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px;
                scroll-behavior: smooth;
            }
            #cp-view-music .mu-chat-list::-webkit-scrollbar { display: none; }

            #cp-view-music .mu-msg { display: flex; flex-direction: column; max-width: 85%; }
            #cp-view-music .mu-msg.ai { align-self: flex-start; }
            #cp-view-music .mu-msg.user { align-self: flex-end; align-items: flex-end; }
            
            #cp-view-music .mu-bubble {
                padding: 10px 14px; font-size: 13px; line-height: 1.5;
                border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            #cp-view-music .mu-msg.ai .mu-bubble {
                background: rgba(255,255,255,0.1); border-bottom-left-radius: 4px;
                color: var(--mu-text); border: 1px solid rgba(255,255,255,0.05);
            }
            #cp-view-music .mu-msg.user .mu-bubble {
                background: var(--mu-text); color: #000; border-bottom-right-radius: 4px;
                font-weight: 500;
            }

            /* 音乐控制系统提示 */
            #cp-view-music .mu-sys-msg {
                align-self: center; font-family: 'Courier Prime', monospace; font-size: 10px;
                color: var(--mu-accent); background: rgba(56, 189, 248, 0.1);
                padding: 4px 12px; border-radius: 12px; border: 1px solid rgba(56, 189, 248, 0.2);
                margin: 8px 0; display: flex; align-items: center; gap: 6px;
            }

            /* 输入框区域 */
            #cp-view-music .mu-input-area {
                padding: 12px 16px; border-top: 1px solid var(--mu-border);
                display: flex; gap: 10px; align-items: flex-end; background: rgba(0,0,0,0.2);
            }
            #cp-view-music .mu-textarea {
                flex: 1; background: rgba(255,255,255,0.05); border: 1px solid var(--mu-border);
                border-radius: 20px; padding: 10px 16px; font-size: 13px; color: #fff;
                outline: none; resize: none; max-height: 100px; min-height: 40px; font-family: 'Noto Serif SC', serif;
            }
            #cp-view-music .mu-textarea::placeholder { color: var(--mu-sub); }
            #cp-view-music .mu-send-btn {
                width: 40px; height: 40px; border-radius: 50%; background: var(--mu-text); color: #000;
                display: flex; justify-content: center; align-items: center; border: none; cursor: pointer; flex-shrink: 0;
            }
            #cp-view-music .mu-send-btn:active { transform: scale(0.9); }
            /* 唱片箱弹窗与空白状态 */
            #cp-view-music .mu-crate-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); z-index: 200; display: flex; flex-direction: column; justify-content: flex-end; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
            #cp-view-music .mu-crate-overlay.active { opacity: 1; pointer-events: all; }
            #cp-view-music .mu-crate-content { background: #111; height: 80vh; border-radius: 20px 20px 0 0; display: flex; flex-direction: column; transform: translateY(100%); transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); border-top: 1px solid rgba(255,255,255,0.1); }
            #cp-view-music .mu-crate-overlay.active .mu-crate-content { transform: translateY(0); }
            #cp-view-music .mu-crate-hdr { padding: 20px 24px; display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(255,255,255,0.1); font-family: 'Courier Prime', monospace; font-size: 14px; font-weight: bold; }
            #cp-view-music .mu-crate-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
            
            #cp-view-music .mu-crate-item { display: flex; align-items: center; gap: 15px; padding: 10px; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
            #cp-view-music .mu-crate-item:active { background: rgba(255,255,255,0.05); }
            #cp-view-music .mu-crate-cover { width: 50px; height: 50px; border-radius: 6px; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,0.1); }
            #cp-view-music .mu-crate-name { font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 4px; }
            #cp-view-music .mu-crate-desc { font-size: 11px; color: var(--mu-sub); font-family: 'Courier Prime', monospace; }
            
            #cp-view-music .mu-btn-choose { background: var(--mu-text); color: #000; font-size: 10px; font-weight: bold; padding: 6px 12px; border-radius: 20px; cursor: pointer; border: none; box-shadow: 0 4px 10px rgba(255,255,255,0.1); }
   /* =======================================
               View 9: 房间/信笺 (Room/Letters)
               ======================================= */
               #cp-view-room {
                --rm-bg-linen: #e4ddd3; --rm-fabric-dark: #2a2825; --rm-fabric-silk: #f4f0e6;
                --rm-thread-rust: #8b3a2b; --rm-ink-faded: #6b655d; --rm-twine-color: #c2b59b;
                --rm-metal-light: #f0f0f0; --rm-metal-mid: #b0b5b9; --rm-metal-dark: #5a6066;

                font-family: 'Noto Serif SC', serif; background-color: var(--rm-bg-linen); color: var(--rm-fabric-dark);
                background-image: radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
                                  linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px);
                background-size: 3px 3px, 8px 8px, 8px 8px;
                overflow: hidden !important; /* 彻底阻止外层视图被拖动，修复弹窗偏移 */
            }

            #cp-view-room:has(.rm-modal-overlay.active) { overflow: hidden !important; }

               #cp-view-room .rm-container { 
                max-width: 100%; margin: 0 auto; 
                height: 100%; overflow-y: auto; overflow-x: hidden; 
                display: flex; flex-direction: column; 
                -webkit-overflow-scrolling: touch; 
            }
            #cp-view-room .rm-top-nav { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 10px; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 10; }
            #cp-view-room .rm-nav-btn { font-family: 'Playfair Display', serif; font-size: 11px; font-weight: 800; letter-spacing: 2px; color: var(--rm-fabric-dark); cursor: pointer; display: flex; align-items: center; gap: 6px; text-transform: uppercase; }
            #cp-view-room .rm-header-section { padding: 20px 24px 50px; text-align: center; position: relative; z-index: 10; }
            #cp-view-room .rm-hero-en { font-family: 'Playfair Display', serif; font-style: italic; font-size: 14px; color: var(--rm-ink-faded); letter-spacing: 2px; }
            #cp-view-room .rm-hero-zh { font-size: 32px; font-weight: 900; letter-spacing: 4px; line-height: 1.2; margin-top: 8px; color: var(--rm-fabric-dark); text-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            #cp-view-room .rm-hero-desc { font-family: 'Courier Prime', monospace; font-size: 9px; color: var(--rm-ink-faded); margin-top: 16px; letter-spacing: 1.5px; text-transform: uppercase; }

            #cp-view-room .rm-letters-list { padding: 0 24px 60px; display: flex; flex-direction: column; gap: 40px; position: relative; z-index: 10; }
            
            /* 修复一：缩小信封一点点宽度，防止旋转后超出屏幕产生左右拖拽 */
            #cp-view-room .rm-parcel-card { background: var(--rm-fabric-silk); width: 96%; margin: 0 auto; height: 130px; position: relative; cursor: pointer; border-radius: 2px; box-shadow: 0 15px 25px -10px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(0,0,0,0.04), inset 0 2px 10px rgba(255,255,255,0.8); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); display: flex; justify-content: center; align-items: center; }
            #cp-view-room .rm-parcel-card:nth-child(odd) { transform: rotate(-1.5deg); }
            #cp-view-room .rm-parcel-card:nth-child(even) { transform: rotate(1.5deg); }
            #cp-view-room .rm-parcel-card:active { transform: scale(0.96); }
            
            #cp-view-room .rm-parcel-card::before { content: ''; position: absolute; top: 0; left: 15%; width: 70%; height: 100%; background: linear-gradient(to right, transparent, rgba(0,0,0,0.03) 10%, rgba(255,255,255,0.4) 15%, transparent 20%, transparent 80%, rgba(255,255,255,0.4) 85%, rgba(0,0,0,0.03) 90%, transparent); pointer-events: none; z-index: 1; }
            #cp-view-room .rm-twine-h, .rm-twine-v { background: var(--rm-twine-color); z-index: 2; box-shadow: 0 2px 3px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.3); background-image: repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(0,0,0,0.1) 1px, rgba(0,0,0,0.1) 2px); }
            #cp-view-room .rm-twine-h { position: absolute; top: 50%; left: 0; width: 100%; height: 2px; transform: translateY(-50%); }
            #cp-view-room .rm-twine-v { position: absolute; top: 0; left: 30%; width: 2px; height: 100%; }
            #cp-view-room .rm-brass-button { position: absolute; top: 50%; left: 30%; transform: translate(-50%, -50%); width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #a67b5b, #5e412f); box-shadow: 2px 4px 6px rgba(0,0,0,0.3), inset -2px -2px 4px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.3); z-index: 3; display: flex; justify-content: center; align-items: center; }
            #cp-view-room .rm-brass-button::after { content: ''; width: 8px; height: 8px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.4); box-shadow: inset 0 1px 2px rgba(0,0,0,0.5); }
            #cp-view-room .rm-parcel-tag { position: absolute; bottom: 15px; right: 20px; background: #eee8db; padding: 4px 10px; border: 1px solid #d5cebf; font-family: 'Courier Prime', monospace; font-size: 10px; font-weight: bold; color: var(--rm-ink-faded); letter-spacing: 1px; z-index: 1; box-shadow: 2px 2px 5px rgba(0,0,0,0.08); transform: rotate(-3deg); }

            /* 🌟 修复二：弃用 Flex 居中机制，改为强制顶部 Padding 流式排版，彻底解决字多被顶到屏幕外面的 Bug */
            #cp-view-room .rm-modal-overlay { 
                position: fixed; inset: 0; background: rgba(20, 19, 18, 0.9); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); 
                z-index: 200; 
                display: block; /* 关键修复：改为 block */
                overflow-y: auto; overflow-x: hidden; 
                padding: calc(env(safe-area-inset-top, 20px) + 80px) 20px 80px 20px; 
                opacity: 0; pointer-events: none; transition: opacity 0.4s ease; 
                -webkit-overflow-scrolling: touch; overscroll-behavior: contain; /* 拦截底部拖拽透传 */
            }
            #cp-view-room .rm-modal-overlay.active { opacity: 1; pointer-events: all; }
            
            #cp-view-room .rm-close-btn { position: fixed; top: calc(env(safe-area-inset-top, 20px) + 20px); left: 24px; font-family: 'Playfair Display', serif; font-size: 11px; letter-spacing: 2px; color: var(--rm-fabric-silk); cursor: pointer; text-transform: uppercase; z-index: 210; }
            
            #cp-view-room .rm-scene { 
                width: 100%; max-width: 360px; 
                perspective: 1500px; position: relative; margin: 0 auto; 
            }

            #cp-view-room .rm-letter-flipper { width: 100%; height: auto; position: relative; transform-style: preserve-3d; transform-origin: center center; box-shadow: 0 30px 60px rgba(0,0,0,0.5); transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275); cursor: pointer; }
            #cp-view-room .rm-letter-flipper.flipped { transform: rotateY(180deg); }
            
            #cp-view-room .rm-face { box-sizing: border-box; -webkit-backface-visibility: hidden; backface-visibility: hidden; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05), inset 0 0 20px rgba(0,0,0,0.03); border: 1px solid #d4cfc4; overflow: hidden; }

            /* 正面自适应高度 */
            #cp-view-room .rm-face-front { position: relative; width: 100%; background: var(--rm-fabric-silk); padding: 30px 24px 50px 24px; display: flex; flex-direction: column; min-height: 250px; }
            /* 背面高度依附于正面撑开的高度 */
            #cp-view-room .rm-face-back { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #2a2825; border: 1px solid #1a1816; display: flex; justify-content: center; align-items: center; transform: rotateY(180deg); }
            #cp-view-room .rm-face-back::before { content: 'CLASSIFIED'; position: absolute; font-family: 'Playfair Display', serif; font-size: 50px; font-weight: 800; color: rgba(255, 255, 255, 0.03); transform: rotate(-30deg); pointer-events: none; }

            #cp-view-room .rm-front-header { font-family: 'Courier Prime', monospace; font-size: 9px; color: var(--rm-ink-faded); border-bottom: 1px solid #dcd7ce; padding-bottom: 10px; margin-bottom: 15px; letter-spacing: 2px; text-transform: uppercase; text-align: center; }
            #cp-view-room .rm-front-text { font-family: 'Noto Serif SC', serif; font-size: 13.5px; line-height: 1.8; color: var(--rm-fabric-dark); text-align: justify; white-space: pre-wrap; }

            #cp-view-room .rm-secret-text { font-family: 'Courier Prime', monospace; font-size: 14px; line-height: 1.8; color: var(--rm-thread-rust); text-align: center; z-index: 2; font-weight: bold; white-space: pre-wrap; text-shadow: 0 0 4px rgba(139, 58, 43, 0.4); width: 100%; max-height: 100%; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; padding: 20px 10px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
            #cp-view-room .rm-secret-text::-webkit-scrollbar { display: none; }
            
            #cp-view-room .rm-cursor { display: inline-block; width: 8px; height: 16px; background: var(--rm-thread-rust); animation: rm-blink 1s step-end infinite; opacity: 0; vertical-align: middle; margin-left: 2px; }
            #cp-view-room .rm-cursor.active { opacity: 1; }
            @keyframes rm-blink { 50% { opacity: 0; } }

            #cp-view-room .rm-rewrite-btn { position: absolute; top: 25px; right: 20px; font-size: 18px; color: var(--rm-ink-faded); cursor: pointer; transition: all 0.2s; z-index: 10; }
            #cp-view-room .rm-rewrite-btn:active { transform: scale(0.85); color: var(--rm-fabric-dark); }

            #cp-view-room .rm-flip-hint { position: absolute; bottom: 15px; right: 20px; font-family: 'Courier Prime', monospace; font-size: 10px; font-weight: bold; color: var(--rm-ink-faded); letter-spacing: 2px; animation: rm-pulse 2s infinite; pointer-events: none; }
            @keyframes rm-pulse { 0%, 100% { opacity: 0.4; transform: translateX(0); } 50% { opacity: 1; transform: translateX(4px); } }

            #cp-view-room .rm-note-pop { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fbf9f5; padding: 30px 40px; box-shadow: 0 10px 40px rgba(0,0,0,0.4); border: 1px solid #d1c8bb; z-index: 500; font-family: 'Caveat', 'Long Cang', cursive; font-size: 24px; color: var(--rm-fabric-dark); text-align: center; clip-path: polygon(0% 5%, 5% 0%, 98% 3%, 100% 95%, 95% 100%, 2% 97%); opacity: 0; transform: translate(-50%, -40%) scale(0.9); transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
            #cp-view-room .rm-note-pop.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            /* =======================================
               View 10: 精灵/幻梦星屑 (Dream Fragments)
               ======================================= */
           #cp-view-sprite {
                --sp-bg-night: #050914; --sp-bg-abyss: #010205; 
                --sp-stardust-glow: #e0f2fe; --sp-stardust-core: #ffffff;
                --sp-jar-glass: rgba(255, 255, 255, 0.03); --sp-jar-highlight: rgba(255, 255, 255, 0.15);
                
                font-family: 'Noto Serif SC', serif;
                background: radial-gradient(circle at 50% 120%, #172a45 0%, var(--sp-bg-night) 40%, var(--sp-bg-abyss) 100%);
                color: #fff; min-height: 100vh; overflow: hidden;
            }
            
            #cp-view-sprite .sp-stars-bg {
                position: absolute; top: 0; left: 0; width: 100vw; height: 100vh;
                background-image: radial-gradient(1px 1px at 20px 30px, #fff, rgba(0,0,0,0)), radial-gradient(1px 1px at 40px 70px, #fff, rgba(0,0,0,0)), radial-gradient(2px 2px at 90px 40px, rgba(255,255,255,0.8), rgba(0,0,0,0)), radial-gradient(1.5px 1.5px at 160px 120px, rgba(255,255,255,0.6), rgba(0,0,0,0)), radial-gradient(1px 1px at 240px 90px, #fff, rgba(0,0,0,0)), radial-gradient(2px 2px at 300px 160px, rgba(255,255,255,0.9), rgba(0,0,0,0));
                background-repeat: repeat; background-size: 350px 350px;
                opacity: 0.4; pointer-events: none; z-index: 0; animation: sp-twinkle 10s infinite alternate;
            }
            @keyframes sp-twinkle { 0% { opacity: 0.2; } 100% { opacity: 0.6; } }

            #cp-view-sprite .sp-container { max-width: 100%; margin: 0 auto; position: relative; height: 100vh; display: flex; flex-direction: column; z-index: 10; }
            #cp-view-sprite .sp-top-nav { padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 10px; display: flex; justify-content: space-between; align-items: center; }
            #cp-view-sprite .sp-nav-btn { font-family: 'Playfair Display', serif; font-size: 11px; font-weight: 700; letter-spacing: 2px; color: rgba(255,255,255,0.7); cursor: pointer; display: flex; align-items: center; gap: 6px; text-transform: uppercase; transition: color 0.3s; }
            #cp-view-sprite .sp-nav-btn:active { color: #fff; }

            #cp-view-sprite .sp-header-section { padding: 10px 24px 0; text-align: center; pointer-events: none; }
            #cp-view-sprite .sp-hero-en { font-family: 'Playfair Display', serif; font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 4px; text-transform: uppercase; margin-bottom: 8px;}
            #cp-view-sprite .sp-hero-zh { font-size: 24px; font-weight: 900; letter-spacing: 6px; text-shadow: 0 0 20px rgba(255,255,255,0.2); }
            #cp-view-sprite .sp-hero-desc { font-size: 10px; color: rgba(255,255,255,0.5); margin-top: 12px; letter-spacing: 1px; font-weight: 300;}

            #cp-view-sprite .sp-stage { flex: 1; display: flex; justify-content: center; align-items: center; position: relative; perspective: 1000px; }
            #cp-view-sprite .sp-glass-jar { position: relative; width: 140px; height: 200px; border-radius: 40% 40% 45% 45% / 50% 50% 30% 30%; background: linear-gradient(135deg, var(--sp-jar-glass) 0%, rgba(255,255,255,0) 100%); backdrop-filter: blur(2px); border: 1px solid var(--sp-jar-highlight); box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.05), inset 10px 0 20px rgba(255, 255, 255, 0.1), inset -10px 0 20px rgba(255, 255, 255, 0.05), 0 20px 40px rgba(0, 0, 0, 0.8); z-index: 5; display: flex; justify-content: center; }
            #cp-view-sprite .sp-glass-jar::before { content: ''; position: absolute; top: -15px; left: 50%; transform: translateX(-50%); width: 46px; height: 18px; background: #3d2f24; border-radius: 4px 4px 8px 8px; box-shadow: inset 0 -3px 5px rgba(0,0,0,0.5), inset 0 2px 2px rgba(255,255,255,0.1); }
            #cp-view-sprite .sp-glass-jar::after { content: ''; position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%); width: 80%; height: 20px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(100, 180, 255, 0.3) 0%, transparent 70%); filter: blur(10px); z-index: -1; }

            #cp-view-sprite .sp-stardust-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }
            #cp-view-sprite .sp-stardust { position: absolute; pointer-events: auto; cursor: pointer; padding: 15px; transform: translate(-50%, -50%); display: flex; justify-content: center; align-items: center; }
            #cp-view-sprite .sp-stardust-core { width: 4px; height: 4px; background: var(--sp-stardust-core); border-radius: 50%; box-shadow: 0 0 10px 2px var(--sp-stardust-glow), 0 0 20px 4px rgba(100, 200, 255, 0.4); animation: sp-pulse-glow 2s infinite alternate ease-in-out; }
            #cp-view-sprite .sp-stardust:active .sp-stardust-core { transform: scale(1.5); }
            @keyframes sp-pulse-glow { 0% { transform: scale(0.8); opacity: 0.6; } 100% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 15px 4px var(--sp-stardust-glow), 0 0 30px 8px rgba(100, 200, 255, 0.6); } }

            #cp-view-sprite .sp-ripple-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 200; overflow: hidden; }
            #cp-view-sprite .sp-ripple-circle { position: absolute; width: 2px; height: 2px; border-radius: 50%; background: radial-gradient(circle, rgba(5, 9, 20, 0.9) 30%, #010205 80%); backdrop-filter: blur(10px); transform: translate(-50%, -50%) scale(0); opacity: 0; transition: transform 1.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s; }
            #cp-view-sprite .sp-ripple-circle.expand { transform: translate(-50%, -50%) scale(1500); opacity: 1; pointer-events: all; }

            #cp-view-sprite .sp-dream-modal { position: fixed; inset: 0; background: #010205; z-index: 250; display: flex; flex-direction: column; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.8s ease 0.4s; padding: 40px; }
            #cp-view-sprite .sp-dream-modal.active { opacity: 1; pointer-events: all; }
            #cp-view-sprite .sp-dream-modal::before, #cp-view-sprite .sp-dream-modal::after { content: ''; position: absolute; left: 0; width: 100%; height: 10vh; background: #000; }
            #cp-view-sprite .sp-dream-modal::before { top: 0; } #cp-view-sprite .sp-dream-modal::after { bottom: 0; }
            #cp-view-sprite .sp-dream-meta { font-family: 'Playfair Display', serif; font-size: 10px; color: rgba(255,255,255,0.3); letter-spacing: 4px; text-transform: uppercase; margin-bottom: 40px; animation: sp-fadeIn 2s forwards 0.5s; opacity: 0; }
            #cp-view-sprite .sp-dream-text { font-family: 'Noto Serif SC', serif; font-size: 13px; line-height: 2.2; color: rgba(255,255,255,0.9); text-align: justify; letter-spacing: 1.5px; max-width: 320px; max-height: 55vh; overflow-y: auto; overscroll-behavior: contain; padding-bottom: 20px; animation: sp-fadeIn 3s forwards 1s; opacity: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
            #cp-view-sprite .sp-dream-text::-webkit-scrollbar { display: none; }
            #cp-view-sprite .sp-wake-btn { position: absolute; bottom: 12vh; font-family: 'Playfair Display', serif; font-size: 11px; font-weight: bold; color: rgba(255,255,255,0.5); letter-spacing: 3px; text-transform: uppercase; cursor: pointer; transition: color 0.3s; animation: sp-fadeIn 2s forwards 2.5s; opacity: 0; border-bottom: 1px solid transparent; padding-bottom: 4px; }
            #cp-view-sprite .sp-wake-btn:active { color: #fff; border-bottom-color: #fff; }
            @keyframes sp-fadeIn { to { opacity: 1; } }
            /* 梦境动作按钮 (重roll, 收藏) */
            #cp-view-sprite .sp-dream-actions {
                position: absolute; bottom: 12vh; right: 40px; display: flex; gap: 20px;
                animation: sp-fadeIn 2s forwards 2.5s; opacity: 0;
            }
            #cp-view-sprite .sp-action-btn { font-size: 22px; color: rgba(255,255,255,0.5); cursor: pointer; transition: color 0.3s, transform 0.2s; }
            #cp-view-sprite .sp-action-btn:active { transform: scale(0.85); }
            #cp-view-sprite .sp-action-btn:hover { color: #fff; }

           /* 已被点开过的星屑颜色 (盈盈发光的明亮青色) */
            #cp-view-sprite .sp-stardust.viewed .sp-stardust-core {
                background: #00e5ff; /* 极其明亮的霓虹青色 */
                box-shadow: 0 0 10px 2px rgba(0, 229, 255, 0.6), 0 0 25px 6px rgba(0, 229, 255, 0.3);
                animation: none; /* 🌟 停止呼吸闪烁，变成稳定的常亮晶体 */
                transform: scale(0.9); /* 稍微内收一点点以示区分 */
            }

            /* 收藏柜弹窗 */
            #cp-view-sprite .sp-archive-overlay { position: fixed; inset: 0; background: rgba(1, 2, 5, 0.95); backdrop-filter: blur(10px); z-index: 300; display: flex; flex-direction: column; opacity: 0; pointer-events: none; transition: opacity 0.4s; padding: calc(env(safe-area-inset-top, 20px) + 20px) 24px 40px; }
            #cp-view-sprite .sp-archive-overlay.active { opacity: 1; pointer-events: all; }
            #cp-view-sprite .sp-arc-hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 16px; margin-bottom: 20px; }
            #cp-view-sprite .sp-arc-title { font-family: 'Playfair Display', serif; font-size: 16px; letter-spacing: 2px; text-transform: uppercase; color: #fff; }
            #cp-view-sprite .sp-arc-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; padding-bottom: 40px; }
            #cp-view-sprite .sp-arc-item { padding: 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; position: relative; }
            #cp-view-sprite .sp-arc-date { font-family: 'Courier Prime', monospace; font-size: 10px; color: rgba(255,255,255,0.4); margin-bottom: 10px; }
            #cp-view-sprite .sp-arc-text { font-family: 'Noto Serif SC', serif; font-size: 13px; line-height: 1.8; color: rgba(255,255,255,0.8); text-align: justify; }
            #cp-view-sprite .sp-arc-del { position: absolute; top: 20px; right: 20px; color: rgba(255,255,255,0.3); font-size: 16px; cursor: pointer; transition: color 0.2s; }
            #cp-view-sprite .sp-arc-del:hover { color: #ef4444; }
           
        `;
        
        document.head.appendChild(style);
    }

    // ============================================================
    // 2. 动态注入 HTML DOM 结构 (双视图)
    // ============================================================
    function _injectHTML() {
        if (document.getElementById('couple-screen')) return;
        const deviceNode = document.querySelector('.device');
        if (!deviceNode) return;

        const screenDiv = document.createElement('div');
        screenDiv.id = 'couple-screen';
        screenDiv.className = 'screen';
        
        screenDiv.innerHTML = `
            <!-- 视图 1：画廊列表 -->
            <div id="cp-view-gallery" class="cp-view active">
                <div class="cp-container">
                    <div class="cp-top-nav" onclick="CoupleModule.close()">
                        <div class="cp-nav-line"></div>
                        <div class="cp-nav-text">BACK</div>
                        <i class="ph-thin ph-arrow-u-up-left" style="font-size: 14px;"></i>
                    </div>
                    
                    <header class="cp-header">
                        <div class="cp-header-top-deco">
                            <div class="cp-deco-circles"><div></div><div></div></div>
                            <span style="font-size: 10px; color: var(--cp-primary); letter-spacing: 1px;">WINTER.</span>
                        </div>
                        <div class="cp-header-title">Our Dates</div>
                        <div class="cp-header-subtitle">专属羁绊档案</div>
                        <div class="cp-header-micro">
                            Los días en los que me enamoré de ti.<br>UPDATED RECENTLY
                        </div>
                    </header>

                    <main class="cp-gallery-grid" id="cp-galleryGrid"></main>

                    <div style="text-align: center; padding: 50px 0; font-size: 9px; color: var(--cp-muted); letter-spacing: 2px;">
                        LUNE VIEE &copy; 2026
                    </div>
                </div>
            </div>

            <!-- 视图 2：手账拼贴专属详情页 -->
            <div id="cp-view-detail" class="cp-view">
                <div class="cp-container">
                    
                    <!-- 涂鸦 SVG -->
                    <svg class="scribble" style="top: 150px; left: 10px;" width="30" height="60" viewBox="0 0 30 60" fill="none" stroke="var(--dt-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5,5 Q25,15 5,25 T5,45 Q25,55 5,55" />
                    </svg>
                    <svg class="scribble" style="top: 250px; right: 15px;" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--dt-text)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2 L14 9 L21 11 L15 15 L16 22 L12 18 L8 22 L9 15 L3 11 L10 9 Z" />
                    </svg>
                    <svg class="scribble" style="top: 480px; left: 45%;" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--dt-sub)" stroke-width="1.5">
                        <path d="M10,10 m-1,0 a1,1 0 1,0 2,0 a2,2 0 1,0 -4,0 a3,3 0 1,0 6,0 a4,4 0 1,0 -8,0" />
                    </svg>
                    <svg class="scribble" style="bottom: 120px; right: 30px;" width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="var(--dt-accent)" stroke-width="2">
                        <path d="M5,5 L25,25 M25,5 L5,25" />
                    </svg>

                    <!-- 顶部导航 -->
                    <nav class="dt-top-nav">
                        <div class="dt-back-btn" onclick="CoupleModule.backToGallery()">
                            <i class="ph ph-arrow-left"></i> BACK
                        </div>
                        <i class="ph ph-list" style="font-size: 20px; color: var(--dt-text);"></i>
                    </nav>

                    <!-- 动态注入头部数据 -->
                    <header class="dt-hero">
                        <div class="dt-subtitle">CHAPTER. 01</div>
                        <h1 id="cp-detail-name">角色名</h1>
                        <div class="dt-handwritten" id="cp-detail-en">My Universe.</div>
                    </header>

                    <!-- 拼贴导航网格 -->
                    <main class="dt-grid">
                        <div class="nav-card mod-news" onclick="CoupleModule.openSubModule('共同报纸')">
                            <div class="tape"></div>
                            <div class="shape-block">
                                <div class="line thick"></div>
                                <div class="line"></div>
                                <div class="line" style="width: 80%;"></div>
                                <div class="line" style="width: 40%;"></div>
                            </div>
                            <div class="card-pill">News</div>
                            <div class="card-title-zh">共同报纸</div>
                            <div class="card-title-en">Daily Orbit</div>
                        </div>

                        <div class="nav-card mod-music" onclick="CoupleModule.openSubModule('一起听')">
                            <div class="shape-block"><div class="vinyl"></div></div>
                            <div class="card-pill">Music</div>
                            <div class="card-title-zh">一起听</div>
                            <div class="card-title-en">Listen Together</div>
                        </div>

                        <div class="nav-card mod-roam" onclick="CoupleModule.openSubModule('异步漫游')">
                            <div class="shape-block">
                                <span>LKS</span>
                                <i class="ph ph-airplane-tilt" style="color: var(--dt-sub); font-size: 16px;"></i>
                                <span>GMX</span>
                            </div>
                            <div class="card-pill">Roam</div>
                            <div class="card-title-zh">异步漫游</div>
                            <div class="card-title-en">Boarding Pass</div>
                        </div>

                        <div class="nav-card mod-room" onclick="CoupleModule.openSubModule('房间')">
                            <div class="tape" style="transform: translateX(-50%) rotate(4deg);"></div>
                            <div class="shape-block"></div>
                            <div class="card-pill">Space</div>
                            <div class="card-title-zh">房间</div>
                            <div class="card-title-en">His Room</div>
                        </div>

                        <div class="nav-card mod-resume" onclick="CoupleModule.openSubModule('平行履历')">
                            <div class="shape-block">
                                <div class="barcode">
                                    ||| | || |||<br>ID: <span id="cp-detail-barcode">0000</span><br>
                                    <span style="font-size: 8px;">TOP SECRET</span>
                                </div>
                            </div>
                            <div class="card-pill">Data</div>
                            <div class="card-title-zh">平行履历</div>
                            <div class="card-title-en">Parallel Resume</div>
                        </div>

                        <div class="nav-card mod-wanted" onclick="CoupleModule.openSubModule('通缉令')">
                            <div class="shape-block"><div class="wanted-mark">W</div></div>
                            <div class="card-pill">Wanted</div>
                            <div class="card-title-zh">通缉令</div>
                            <div class="card-title-en">Bounty Notice</div>
                        </div>

                        <div class="nav-card mod-sprite" onclick="CoupleModule.openSubModule('精灵')">
                            <div class="shape-block"><div class="orb"></div></div>
                            <div class="card-pill">Sprite</div>
                            <div class="card-title-zh">精灵</div>
                            <div class="card-title-en">Exclusive Orb</div>
                        </div>

                        <div class="nav-card mod-companion" onclick="CoupleModule.openSubModule('陪伴')">
                            <div class="shape-block">
                                <div class="timer-text" id="cp-detail-days">1</div>
                                <span style="font-size: 10px; margin-left: 4px; margin-top: 18px;">Days</span>
                            </div>
                            <div class="card-pill">Timer</div>
                            <div class="card-title-zh">陪伴</div>
                            <div class="card-title-en">Companionship</div>
                        </div>
                    </main>
                </div>
            </div>
            
            <!-- 视图 3：通缉令档案页 -->
            <div id="cp-view-wanted" class="cp-view">
                <div class="wt-container">
                    <nav class="wt-top-nav">
                        <div class="wt-nav-btn" onclick="CoupleModule.backFromWanted()"><i class="ph ph-arrow-left"></i> BACK</div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="wt-nav-btn" style="opacity: 0.5;">L.P.U ARCHIVES</div>
                            <div class="wt-add-btn" onclick="CoupleModule.toggleWantedModal()">
                                <i class="ph-bold ph-plus"></i> NEW
                            </div>
                        </div>
                    </nav>

                    <main class="wt-collage" id="wt-archiveList"></main>

                    <!-- 通缉令录入弹窗 (双面板) -->
                    <div class="wt-modal" id="wt-inputModal">
                        <div class="wt-mcontent">
                            <div class="wt-mhdr">
                                <div class="wt-mtitle">NEW FUGITIVE DATA</div>
                                <div class="wt-mclose" onclick="CoupleModule.toggleWantedModal()"><i class="ph ph-x" style="font-size: 24px;"></i></div>
                            </div>
                            
                            <!-- 模式切换开关 -->
                            <div class="wt-toggle-box">
                                <div class="wt-toggle-btn active" id="wt-btn-me" onclick="CoupleModule.switchWantedMode('me')">ISSUER: ME (我签发)</div>
                                <div class="wt-toggle-btn" id="wt-btn-him" onclick="CoupleModule.switchWantedMode('him')">ISSUER: HIM (他签发)</div>
                            </div>
                            
                            <!-- 面板 A：我签发 (手动填) -->
                            <div id="wt-panel-me" style="flex: 1; display: flex; flex-direction: column;">
                                <div style="flex: 1; overflow-y: auto; padding-right: 10px; margin-bottom: 20px;">
                                    <div class="wt-grp">
                                        <label class="wt-lbl">TARGET NAME / 目标代号</label>
                                        <input type="text" class="wt-inp" id="wt-inpName" readonly style="color:#aaa;">
                                    </div>
                                    <div class="wt-grp">
                                        <label class="wt-lbl">ARREST CHARGES / 逮捕罪名 (逗号分隔)</label>
                                        <textarea class="wt-area" id="wt-inpCrimes" placeholder="例如：非法侵入梦境, 偷走我的心不还..."></textarea>
                                    </div>
                                    <div class="wt-grp">
                                        <label class="wt-lbl">HABITS / 危险怪癖</label>
                                        <input type="text" class="wt-inp" id="wt-inpHabits" placeholder="他有什么让你心动的坏习惯？">
                                    </div>
                                    <div class="wt-grp">
                                        <label class="wt-lbl">SENTENCE / 判决结果</label>
                                        <input type="text" class="wt-inp" id="wt-inpSentence" placeholder="例如：无期徒刑 (限在我身边服刑)">
                                    </div>
                                </div>
                                <button class="wt-btn" id="wt-submit-btn" onclick="CoupleModule.submitWantedData()">GENERATE LICENSE</button>
                            </div>

                            <!-- 面板 B：他签发 (AI 读取记忆生成) -->
                            <div id="wt-panel-him" style="flex: 1; display: none; flex-direction: column;">
                                <div class="wt-scanner-box">
                                    <div class="wt-radar" id="wt-radar-ui" style="display: none;"><i class="ph-fill ph-target"></i></div>
                                    <i class="ph-thin ph-fingerprint" id="wt-fingerprint-ui" style="font-size: 80px; color: #444;"></i>
                                    <div class="wt-sys-text" id="wt-sys-status">
                                        L.P.U DATABASE ACCESS READY.<br>
                                        等待授权扫描近期聊天记忆...
                                    </div>
                                </div>
                                <button class="wt-btn" id="wt-ai-btn" onclick="CoupleModule.generateWantedByAI()">SYSTEM EVALUATION</button>
                            </div>

                        </div>
                    </div>
                 </div>
              </div>
                    
                    <!-- 视图 4：异步漫游 -->
            <div id="cp-view-roam" class="cp-view">
                <div class="roam-container" id="roam-app-container">
                    <div class="sticker-layer" id="roam-sticker-layer"></div>
                    
                    <nav class="roam-nav">
                        <div class="roam-btn" onclick="CoupleModule.backFromRoam()"><i class="ph ph-arrow-left"></i> BACK</div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <!-- 👇 新增的封存按钮 -->
                            <div class="roam-add-btn outline" onclick="CoupleModule.archiveRoamCapsules()">
                                <i class="ph-bold ph-archive"></i> ARCHIVE
                            </div>
                            <div class="roam-add-btn outline" onclick="CoupleModule.openRoamLibrary()">
                                <i class="ph-bold ph-magic-wand"></i> DIY
                            </div>
                            <div class="roam-add-btn" onclick="CoupleModule.openRoamCreator()">
                                <i class="ph-bold ph-plus"></i> NEW
                            </div>
                        </div>
                    </nav>

                    <header class="roam-hero">
                        <div class="roam-title">场景胶囊</div>
                        <div class="roam-subtitle">Asynchronous Roaming / Vol.1</div>
                        <div class="roam-hw">Wish you were here.</div>
                        <svg class="roam-doodle" style="top: 80px; left: 24px;" width="100" height="40" viewBox="0 0 100 40" fill="none" stroke="var(--roam-grey)" stroke-width="1.5" stroke-dasharray="4 4" stroke-linecap="round"><path d="M0 20 Q 50 0, 100 40" /></svg>
                    </header>

                    <main class="roam-feed" id="roam-feedList"></main>
                </div>

                <!-- 浮动完成按钮 -->
                <div class="finish-diy-btn" id="roam-finishDiyBtn" onclick="CoupleModule.finishRoamDiy()">
                    <i class="ph-bold ph-check"></i> 完成装修
                </div>

                <!-- 素材库浮窗 -->
                <div class="lib-overlay" id="roam-library">
                    <div class="lib-window">
                        <div class="lib-hdr">
                            <div class="lib-title">MY STICKERS / 素材库</div>
                            <div style="display: flex; gap: 16px; align-items: center; font-size: 16px;">
                                <i class="ph-bold ph-trash" id="roam-lib-del-btn" style="cursor:pointer; color:var(--roam-grey); transition: color 0.2s;" onclick="CoupleModule.deleteSelectedRoamMaterials()"></i>
                                <i class="ph ph-x" style="cursor:pointer; color:var(--roam-ink);" onclick="CoupleModule.closeRoamLibrary()"></i>
                            </div>
                        </div>
                        <div class="lib-actions">
                            <input type="file" id="roam-batchUpload" accept="image/*" multiple style="display:none;" onchange="CoupleModule.handleRoamLocalUpload(event)">
                            <div class="lib-btn" onclick="document.getElementById('roam-batchUpload').click()"><i class="ph-bold ph-upload-simple"></i> 本地图片</div>
                            <div class="lib-btn" onclick="document.getElementById('roam-urlArea').classList.toggle('active')"><i class="ph-bold ph-link"></i> 批量 URL</div>
                        </div>
                        <div class="url-area" id="roam-urlArea">
                            <textarea class="url-ta" id="roam-urlInput" placeholder="输入图片链接，用逗号或换行隔开..."></textarea>
                            <button class="url-sub" onclick="CoupleModule.handleRoamUrlUpload()">添加链接素材</button>
                        </div>
                        <div class="lib-grid" id="roam-materialGrid"></div>
                        <div class="lib-ftr">
                            <button class="lib-ok" id="roam-btnStartDiy" onclick="CoupleModule.startRoamDiy()" disabled>开始装修 (0)</button>
                        </div>
                    </div>
                </div>

                <!-- 胶囊生成模态框 -->
                <div class="crt-overlay" id="roam-creatorModal">
                    <div class="crt-hdr">
                        <div style="font-family:'Courier Prime', monospace; font-weight:bold; font-size:12px; letter-spacing:1px;">CREATE SCENE</div>
                        <i class="ph ph-x" style="cursor:pointer;" onclick="CoupleModule.closeRoamCreator()"></i>
                    </div>
                    <div class="crt-body">
                        <div>
                            <label class="crt-lbl">Scene Image / 现场照片</label>
                            <input type="file" id="roam-imageUpload" accept="image/*" style="display:none;" onchange="CoupleModule.handleRoamImageUpload(event)">
                            <div class="img-box" id="roam-imagePreview" onclick="document.getElementById('roam-imageUpload').click()">
                                <i class="ph ph-camera-plus" style="font-size: 24px; color: var(--roam-grey);"></i>
                                <span style="font-size: 10px; color: var(--roam-grey); margin-top: 8px;">TAP TO UPLOAD</span>
                            </div>
                        </div>
                        <div>
                            <label class="crt-lbl">Location / 发生坐标</label>
                            <input type="text" class="loc-inp" id="roam-capLoc" placeholder="例如：街角咖啡店">
                        </div>
                        <div>
                            <label class="crt-lbl">Atmosphere / 封存氛围</label>
                            <div class="vibe-picker">
                                <div class="vb-btn swatch-night active" data-vibe="night" data-name="MIDNIGHT" onclick="CoupleModule.selectRoamVibe(this)"></div>
                                <div class="vb-btn swatch-rain" data-vibe="rain" data-name="RAINY" onclick="CoupleModule.selectRoamVibe(this)"></div>
                                <div class="vb-btn swatch-sunset" data-vibe="sunset" data-name="SUNSET" onclick="CoupleModule.selectRoamVibe(this)"></div>
                                <div class="vb-btn swatch-cafe" data-vibe="cafe" data-name="CAFE" onclick="CoupleModule.selectRoamVibe(this)"></div>
                            </div>
                        </div>
                        <div style="flex: 1;">
                            <label class="crt-lbl">Message / 情绪便签</label>
                            <textarea class="emo-ta" id="roam-capText" placeholder="此时此刻，在这片风景里想对他说的话..."></textarea>
                        </div>
                        <button class="crt-sub" onclick="CoupleModule.submitRoamCapsule()">SEAL & SEND</button>
                    </div>
                </div>
            </div>
            
            <!-- 视图 5：平行履历 (Parallel Resume) -->
            <div id="cp-view-resume" class="cp-view">
                <div class="rs-container">
                    <nav class="rs-top-nav">
                        <div class="rs-nav-btn" onclick="CoupleModule.backFromResume()"><i class="ph-bold ph-arrow-left"></i> BACK</div>
                        <div style="display: flex; gap: 10px;">
                            <!-- 新增：封存到世界书的按钮 -->
                            <div class="rs-add-btn outline" style="background: transparent; border-color: var(--rs-text-muted); color: var(--rs-text-muted);" onclick="CoupleModule.archiveResumeRecords()">
                                <i class="ph-bold ph-archive"></i> 封存
                            </div>
                            <div class="rs-add-btn" onclick="CoupleModule.openResumeInputModal()">
                                <i class="ph-bold ph-pencil-simple"></i> 添加记忆
                            </div>
                        </div>
                    </nav>

                    <header class="rs-hero-section">
                        <h1 class="rs-hero-title">交汇轨迹</h1>
                        <div class="rs-hero-subtitle">Parallel Timelines</div>
                    </header>

                    <main class="rs-timeline-container">
                        <div class="rs-center-line"></div>
                        <div id="rs-timelineList"></div>
                    </main>
                </div>

                <!-- 浮窗：编写我的时间线 -->
                <div class="rs-modal-overlay" id="rs-inputModal">
                    <div class="rs-modal-content">
                        <div class="rs-modal-header">
                            <div class="rs-modal-title">UPDATE TIMELINE</div>
                            <i class="ph ph-x rs-close-btn" onclick="CoupleModule.closeResumeInputModal()"></i>
                        </div>
                        <div class="rs-input-list" id="rs-inputList">
                            <div class="rs-input-block">
                                <div class="rs-input-group">
                                    <label class="rs-input-label">Date / 发生日期</label>
                                    <input type="date" class="rs-inp-date" required>
                                </div>
                                <div class="rs-input-group">
                                    <label class="rs-input-label">Event / 你的经历</label>
                                    <textarea class="rs-inp-event" placeholder="那一天，你经历了什么..."></textarea>
                                </div>
                            </div>
                        </div>
                        <div style="padding: 0 20px;">
                            <div class="rs-add-more-btn" onclick="CoupleModule.addResumeInputBlock()">+ 追加一个日期</div>
                        </div>
                        <div class="rs-modal-footer">
                            <button class="rs-submit-btn" onclick="CoupleModule.generateResumeTimeline()">生成时空交汇 <i class="ph-bold ph-sparkle"></i></button>
                        </div>
                    </div>
                </div>

                <!-- 浮窗：阅读平行叙事 -->
                <div class="rs-modal-overlay" id="rs-narrativeModal">
                    <div class="rs-modal-content">
                        <div class="rs-modal-header">
                            <div class="rs-modal-title"><i class="ph-fill ph-sparkle"></i> 如果那时相遇</div>
                            <i class="ph ph-x rs-close-btn" style="color: var(--rs-fate-red);" onclick="CoupleModule.closeResumeNarrativeModal()"></i>
                        </div>
                        <div class="rs-narrative-body" id="rs-narrativeText"></div>
                    </div>
                </div>

                <!-- Loading 动画 -->
                <div class="rs-loading-overlay" id="rs-loadingOverlay">
                    <i class="ph-light ph-aperture rs-loader-icon"></i>
                    <div class="rs-loading-text">
                        正在调取时空档案...<br>
                        <span>计算命运交汇点</span>
                    </div>
                </div>
            </div>
            
            <!-- 视图 6：共同报纸 (Daily Orbit) -->
            <div id="cp-view-news" class="cp-view">
                <div class="nw-container">
                    <nav class="nw-top-nav">
                        <div class="nw-nav-btn" onclick="CoupleModule.backFromNews()"><i class="ph-bold ph-arrow-left"></i> Return</div>
                        <div class="nw-add-btn" onclick="CoupleModule.openNewsInputModal()">
                            <i class="ph-bold ph-feather"></i> Write Record
                        </div>
                    </nav>

                    <main class="nw-feed" id="nw-feedList"></main>
                </div>

                <!-- 撰写专栏弹窗 -->
                <div class="nw-modal-overlay" id="nw-inputModal">
                    <div class="nw-scroll">
                        <div class="nw-modal-header">
                            <div class="nw-modal-title">Owl Post Entry</div>
                            <i class="ph ph-x nw-close-btn" onclick="CoupleModule.closeNewsInputModal()"></i>
                        </div>
                        <div style="padding: 0;">
                            <label class="nw-form-label">Today's Tale / 今日异闻</label>
                            <textarea class="nw-textarea" id="nw-inpStory" placeholder="羽毛笔已经准备好，写下今天的奇遇..."></textarea>
                        </div>
                        <button class="nw-submit-btn" onclick="CoupleModule.publishNewsIssue()">
                            <i class="ph-bold ph-scroll"></i> Enchant & Print
                        </button>
                    </div>
                </div>

                <!-- 施咒 Loading 动画 -->
                <div class="nw-loading" id="nw-loadingOverlay">
                    <i class="ph-fill ph-feather nw-feather"></i>
                    <div class="nw-loading-text">
                        Enchanting the parchment...<br>
                        <span>正在召唤时空记忆<br>魔法排版中...</span>
                    </div>
                </div>
            </div>
            
            <!-- 视图 7：陪伴 (Focus Companion) -->
            <div id="cp-view-companion" class="cp-view">
                <div class="fc-character-bg" id="fc-char-bg" style="background-image: url('https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=800');"></div>

                <div class="fc-container">
                    <!-- 视图 A：计时器与设置 -->
                    <main class="fc-view-section" id="fc-timerView">
                        <nav class="fc-top-nav fc-fade-ui">
                            <div class="fc-nav-btn" onclick="CoupleModule.backFromCompanion()"><i class="ph-bold ph-arrow-left"></i> Back</div>
                            <div class="fc-nav-btn fc-records-btn" onclick="CoupleModule.toggleFcArchive()">
                                <i class="ph-bold ph-folder-notch-open"></i> Archive 
                                <span class="fc-records-count" id="fc-recCount">0</span>
                            </div>
                        </nav>

                        <header class="fc-header-section fc-fade-ui">
                            <h1 class="fc-hero-title">同频陪伴</h1>
                            <div class="fc-hero-subtitle">Synchronized Focus</div>
                        </header>

                        <div class="fc-task-card fc-fade-ui">
                            <div class="fc-task-title">Current Focus / 当前任务</div>
                            <input type="text" class="fc-task-input" id="fc-taskInput" placeholder="写下你要做的事..." value="一起看书">
                            <div class="fc-custom-time-row">
                                <span>设定时长:</span>
                                <input type="number" id="fc-customMinutes" class="fc-time-number-input" value="1" min="1" max="180" onchange="CoupleModule.updateFcCustomTime()">
                                <span>分钟</span>
                            </div>
                        </div>

                        <div class="fc-timer-wrapper">
                            <div class="fc-time-display" id="fc-timeDisplay">01:00</div>
                            <div class="fc-time-label fc-fade-ui">Time Remaining</div>
                        </div>

                        <div class="fc-controls-section fc-fade-ui">
                            <div class="fc-main-btn" onclick="CoupleModule.startFcFocus()">
                                <i class="ph-fill ph-play" style="font-size: 28px;"></i>
                            </div>
                        </div>

                        <!-- 逃生键 -->
                        <div class="fc-exit-btn" onclick="CoupleModule.attemptFcExit()">
                            <i class="ph-bold ph-x" style="font-size: 20px;"></i>
                        </div>
                    </main>

                    <!-- 视图 B：陪伴档案列表 -->
                    <main class="fc-view-section" id="fc-archiveView">
                        <nav class="fc-top-nav">
                            <div class="fc-nav-btn" onclick="CoupleModule.toggleFcArchive()"><i class="ph-bold ph-arrow-left"></i> Return to Timer</div>
                        </nav>
                        <header class="fc-header-section" style="padding-bottom: 20px;">
                            <h1 class="fc-hero-title" style="font-size: 20px;">陪伴档案</h1>
                            <div class="fc-hero-subtitle">Companion Logs</div>
                        </header>
                        <div class="fc-archive-list" id="fc-archiveList"></div>
                    </main>
                </div>

                <!-- HUD 全息耳语 -->
                <div id="fc-hudContainer"></div>

                <!-- 弹窗 1：强制爱锁 -->
                <div class="fc-modal-overlay" id="fc-lockModal">
                    <div class="fc-center-modal fc-lock-card" id="fc-lockCard">
                        <div style="font-size: 20px; font-weight: 900; margin-bottom: 10px; letter-spacing: 2px;">想半途而废？</div>
                        <div style="font-size: 12px; color: #555; line-height: 1.6; margin-bottom: 24px;">既然开始了，就得陪我到最后。<br>除非...你记得只有我们才知道的密码。</div>
                        <input type="text" class="fc-pwd-input" id="fc-pwdInput" placeholder="输入密码退出...">
                        <div style="font-size: 12px; color: #b75252; font-weight: bold; margin-bottom: 16px; display: none; line-height: 1.5;" id="fc-hintBox"></div>
                        <div style="font-family: 'Courier Prime', monospace; font-size: 10px; color: #888; cursor: pointer; text-decoration: underline; margin-bottom: 24px; display: inline-block;" onclick="CoupleModule.showFcHint()">[ 获取提示 ]</div>
                        <button class="fc-unlock-btn" onclick="CoupleModule.verifyFcPassword()">SUBMIT</button>
                        <div style="font-size: 11px; color: #888; margin-top: 16px; cursor: pointer; display: inline-block;" onclick="CoupleModule.closeFcLockModal()">算了，我继续专注</div>
                    </div>
                </div>

                <!-- 弹窗 2：智能总结 -->
                <div class="fc-modal-overlay" id="fc-summaryModal">
                    <div class="fc-center-modal">
                        <i class="ph-bold ph-x" style="position: absolute; top: 16px; right: 16px; font-size: 20px; color: var(--fc-text-muted-idle); cursor: pointer;" onclick="CoupleModule.closeFcSummaryModal()"></i>
                        
                        <div class="fc-summary-badge" id="fc-sumBadge">专注完成</div>
                        <div style="font-size: 20px; font-weight: 900; color: var(--fc-text-idle); margin-bottom: 6px;" id="fc-sumTask">一起看书</div>
                        <div style="font-family: 'Courier Prime', monospace; font-size: 12px; color: var(--fc-text-muted-idle); margin-bottom: 16px;" id="fc-sumDate">日期: 2026.05.11</div>
                        
                        <div class="fc-summary-details">
                            <div class="fc-detail-row"><span>任务状态:</span> <b id="fc-sumStatus">圆满完成</b></div>
                            <div class="fc-detail-row"><span>设定时长:</span> <b id="fc-sumTotalTime">25 分钟</b></div>
                            <div class="fc-detail-row"><span>逃跑尝试:</span> <b id="fc-sumEscapes">0</b></div>
                            <div class="fc-detail-row"><span>密码错误:</span> <b id="fc-sumFails">0</b></div>
                        </div>
                        
                        <div class="fc-summary-quote">
                            “ <span id="fc-sumQuote">你刚才认真的样子，我记在心里了。</span> ”
                        </div>
                        <span id="fc-sumAuthor" style="font-family: 'Courier Prime', monospace; font-size: 9px; text-align: right; color: var(--fc-text-muted-idle); margin-top: 10px; display: block;">- 系统评语</span>
                    </div>
                </div>
            </div>
            
            <!-- 视图 8：一起听 (Listen Together) -->
            <div id="cp-view-music" class="cp-view is-playing">
                <div class="mu-bg-blur" id="mu-bg-blur"></div>
                
                <div class="mu-container">
                    <nav class="mu-top-nav">
                        <div class="mu-nav-btn" onclick="CoupleModule.backFromMusic()"><i class="ph-bold ph-arrow-left"></i> Leave</div>
                        <div class="mu-status-pill">
                            <div class="mu-live-dot"></div>
                            SYNC LISTENING
                        </div>
                    </nav>

                   <!-- 播放器区域 -->
                    <div class="mu-player-section" style="padding-top: 10px; gap: 10px;">
                        <div class="mu-vinyl-wrapper" id="mu-vinyl-wrapper">
                            <img src="" class="mu-vinyl-cover" id="mu-vinyl-cover" alt="album" style="opacity: 0;">
                            <div class="mu-vinyl-hole"></div>
                            
                            <!-- 空状态下显示的选歌按钮 -->
                            <div id="mu-empty-btn-wrap" style="position:absolute; z-index:10; display:flex; flex-direction:column; align-items:center; gap:8px;">
                                <i class="ph-light ph-vinyl-record" style="font-size:24px; color:rgba(255,255,255,0.3);"></i>
                                <button class="mu-btn-choose" onclick="event.stopPropagation(); CoupleModule.openMusicCrate()">翻找唱片箱</button>
                            </div>
                        </div>
                        <div class="mu-song-info">
                            <div class="mu-song-title" id="mu-song-title" style="font-size: 16px;">等待接入信号...</div>
                            <div class="mu-song-artist" id="mu-song-artist" style="font-size: 11px;">—</div>
                        </div>
                        
                        <!-- 新增：控制台 (对称排版) -->
                        <div class="mu-controls">
                            <!-- 👈 左侧：播放模式按钮 -->
                            <i class="ph ph-repeat mu-ctrl-side" id="mu-ctrl-mode" onclick="CoupleModule.muToggleMode()"></i>
                            
                            <!-- 中间：核心播放控制 -->
                            <i class="ph-fill ph-skip-back mu-ctrl-main" onclick="CoupleModule.muPrevSong()"></i>
                            <i class="ph-fill ph-play-circle mu-ctrl-play" id="mu-ctrl-play" onclick="CoupleModule.muTogglePlay()"></i>
                            <i class="ph-fill ph-skip-forward mu-ctrl-main" onclick="CoupleModule.muNextSong()"></i>
                            
                            <!-- 👉 右侧：随时随地看歌单的列表按钮 -->
                            <i class="ph-bold ph-list mu-ctrl-side" onclick="CoupleModule.openMusicCrate()"></i>
                        </div>
                     </div>

                    <!-- 沉浸式聊天区 -->
                    <div class="mu-chat-section">
                        <div class="mu-chat-list" id="mu-chatList">
                            <!-- 聊天记录将动态渲染 -->
                        </div>
                        <div class="mu-input-area">
                            <textarea class="mu-textarea" id="mu-chatInput" placeholder="陪他聊聊这首歌..." rows="1"></textarea>
                            <button class="mu-send-btn" onclick="CoupleModule.sendMusicMsg()"><i class="ph-bold ph-paper-plane-tilt"></i></button>
                        </div>
                    </div>

                    <!-- 唱片箱弹窗 -->
                    <div class="mu-crate-overlay" id="mu-crateModal">
                        <div class="mu-crate-content">
                            <div class="mu-crate-hdr">
                                <span>RECORD CRATE</span>
                                <i class="ph ph-x" style="cursor:pointer; font-size:20px;" onclick="CoupleModule.closeMusicCrate()"></i>
                            </div>
                            <div class="mu-crate-body" id="mu-crateList"></div>
                        </div>
                    </div>
                 </div>
             </div>
                    
                     <!-- 视图 9：房间 (Room/Letters) -->
            <div id="cp-view-room" class="cp-view">
                <div class="rm-container">
                    <nav class="rm-top-nav">
                        <div class="rm-nav-btn" onclick="CoupleModule.backFromRoom()"><i class="ph-bold ph-arrow-left"></i> Leave</div>
                        <i class="ph-light ph-envelope-simple-open" style="font-size: 20px; color: var(--rm-ink-faded); cursor:pointer;" onclick="CoupleModule.rummageRoomDrawer()"></i>
                    </nav>

                    <header class="rm-header-section">
                        <div class="rm-hero-en">Unspoken Words</div>
                        <h1 class="rm-hero-zh">未寄出的信</h1>
                        <div class="rm-hero-desc">The Fabric of memory • Pull the thread to reveal</div>
                    </header>

                    <main class="rm-letters-list" id="rm-lettersList"></main>
                </div>
                
                <!-- 3D 阅读弹窗 -->
                <div class="rm-modal-overlay" id="rm-readModal">
                    <div class="rm-close-btn" onclick="CoupleModule.closeRoomReadModal()">
                        <i class="ph-bold ph-x"></i> CLOSE
                    </div>
                    <div class="rm-scene" onclick="CoupleModule.toggleRoomLetterFlip()">
                        <div class="rm-letter-flipper" id="rm-letterFlipper">
                            <div class="rm-face rm-face-front">
                                <div class="rm-rewrite-btn" onclick="event.stopPropagation(); CoupleModule.regenerateRoomLetter()">
                                    <i class="ph-bold ph-arrows-clockwise"></i>
                                </div>
                                <div class="rm-front-header">FILE DATE: <span id="rm-frontDate"></span></div>
                                <div class="rm-front-text" id="rm-frontContent"></div>
                                <div class="rm-flip-hint">TAP TO FLIP <i class="ph-bold ph-arrow-right"></i></div>
                            </div>
                            <div class="rm-face rm-face-back">
                                <div class="rm-secret-text"><span id="rm-secretTarget"></span><span class="rm-cursor" id="rm-typingCursor"></span></div></div>
                            </div>
                        </div>
                    </div>
                </div>
            
            <!-- 视图 10：精灵/幻梦星屑 (Dream Fragments) -->
            <div id="cp-view-sprite" class="cp-view">
                <div class="sp-stars-bg"></div>
                
                <div class="sp-container">
                    <nav class="sp-top-nav">
                        <div class="sp-nav-btn" onclick="CoupleModule.backFromSprite()"><i class="ph ph-arrow-left"></i> Escape</div>
                        <!-- 右上角的魔法星改为打开收藏柜 -->
                        <i class="ph-fill ph-sparkle" style="font-size: 20px; color: rgba(255,255,255,0.8); cursor: pointer;" onclick="CoupleModule.openDreamArchive()"></i>
                    </nav>

                    <header class="sp-header-section">
                        <div class="sp-hero-en">Dream Fragments</div>
                        <h1 class="sp-hero-zh">幻梦星屑</h1>
                        <div class="sp-hero-desc">触摸游荡的星屑，潜入他昨夜的荒诞梦境。</div>
                    </header>

                    <main class="sp-stage">
                        <div class="sp-glass-jar"></div>
                        <div class="sp-stardust-container" id="sp-stardustContainer"></div>
                    </main>
                </div>

                <div class="sp-ripple-overlay">
                    <div class="sp-ripple-circle" id="sp-ripple"></div>
                </div>

                <!-- 电影感梦境阅读室 -->
                <div class="sp-dream-modal" id="sp-dreamModal">
                    <div class="sp-dream-meta">Memory Coordinate / <span id="sp-dreamId">001</span></div>
                    <div class="sp-dream-text" id="sp-dreamText"></div>
                    
                    <div class="sp-wake-btn" style="left: 40px;" onclick="CoupleModule.wakeUpFromDream()">Wake Up</div>
                    
                    <!-- 新增：重roll与收藏按钮 -->
                    <div class="sp-dream-actions">
                        <i class="ph-bold ph-arrows-clockwise sp-action-btn" title="重塑梦境" onclick="CoupleModule.regenerateDream()"></i>
                        <i class="ph-bold ph-bookmark-simple sp-action-btn" id="sp-collectBtn" title="收藏此梦" onclick="CoupleModule.collectDream()"></i>
                    </div>
                </div>

                <!-- 新增：收藏柜弹窗 -->
                <div class="sp-archive-overlay" id="sp-archiveModal">
                    <div class="sp-arc-hdr">
                        <div class="sp-arc-title">Collected Dreams</div>
                        <i class="ph-bold ph-x" style="font-size: 20px; cursor: pointer; color: #fff;" onclick="CoupleModule.closeDreamArchive()"></i>
                    </div>
                    <div class="sp-arc-list" id="sp-archiveList"></div>
                </div>
            </div>

            <input type="file" id="cp-file-input" accept="image/*" style="display:none">
        `;
        deviceNode.appendChild(screenDiv);
    }

    // ============================================================
    // 3. 绑定事件
    // ============================================================
    function _bindEvents() {
        const iconBtn = document.getElementById('icon-couple');
        if (iconBtn && !iconBtn._boundCouple) {
            iconBtn._boundCouple = true;
            iconBtn.addEventListener('click', () => { CoupleModule.open(); });
        }

        const fileInput = document.getElementById('cp-file-input');
        if (fileInput && !fileInput._boundCouple) {
            fileInput._boundCouple = true;
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file || !_pendingPhotoCharId) return;
                
                if (typeof Toast !== 'undefined') Toast.show('相片冲印中...');
                try {
                    const key = `couple-bg-${_pendingPhotoCharId}`;
                    const url = await Assets.save(key, file, 800, 0.85); 
                    
                    const blocks = document.querySelectorAll(`.photo-block[data-char-id="${_pendingPhotoCharId}"]`);
                    blocks.forEach(b => b.style.backgroundImage = `url('${url}')`);
                    
                    if (typeof Toast !== 'undefined') Toast.show('专属封面已更新 ✦');
                } catch(err) {
                    console.error(err);
                    if (typeof Toast !== 'undefined') Toast.show('上传失败');
                }
                e.target.value = '';
                _pendingPhotoCharId = null;
            });
        }
    }

    // ============================================================
    // 核心流转与数据渲染
    // ============================================================
    async function init() {
        if (_isInitialized) return;
        _injectStyles();
        _injectHTML();
        _bindEvents();
        try { _favorites = await DB.settings.get('couple-favorites') || {}; } catch(e) { _favorites = {}; }
        _isInitialized = true;
        console.log('[CoupleModule] 专属羁绊模块已全量注入 (双视图)');
    }

    async function open() {
        try { _characters = await DB.characters.getAll(); } catch(e) { _characters =[]; }
        await _renderGallery();
        
        // 确保打开时显示的是画廊列表
        document.querySelectorAll('#couple-screen .cp-view').forEach(v => v.classList.remove('active'));
        document.getElementById('cp-view-gallery').classList.add('active');
        document.getElementById('couple-screen').classList.add('active');
    }

    function close() {
        document.getElementById('couple-screen').classList.remove('active');
    }

    async function _renderGallery() {
        const container = document.getElementById('cp-galleryGrid');
        if (!container) return;

        if (_characters.length === 0) {
            container.innerHTML = `<div style="grid-column: span 2; text-align: center; padding: 50px 0; color: var(--cp-muted); font-size: 12px; letter-spacing: 2px;">NO CHARACTERS FOUND<br><br>请先在桌面的「角色档案」中创建</div>`;
            return;
        }

        let html = '';

        for (let index = 0; index < _characters.length; index++) {
            const char = _characters[index];
            const isWide = index % 3 === 0;
            const cardClass = isWide ? 'card-wide' : 'card-small';
            
            let avatarUrl = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=100';
            if (char.avatarUrl) {
                avatarUrl = await Assets.getUrl(char.avatarUrl).catch(() => avatarUrl) || avatarUrl;
            }

            let photoUrl = PRESET_PHOTOS[index % PRESET_PHOTOS.length];
            const customUrl = await Assets.getUrl(`couple-bg-${char.id}`).catch(() => null);
            if (customUrl) photoUrl = customUrl;

            const tag = char.mbti ? char.mbti.toUpperCase() : 'Amour.';
            const nameEn = char.title || 'Classified';

            let quote = char.aiData?.quote || '';
            if (!quote && char.persona) quote = char.persona.slice(0, 30) + '...';
            if (!quote) quote = "“秘密总是藏在那些未曾说出口的话里。”";

            const isFav = !!_favorites[char.id];
            const heartHtml = `
                <div class="heart-badge" onclick="CoupleModule.toggleHeart('${char.id}', this, event)">
                    <i class="ph${isFav ? '-fill' : ''} ph-heart" style="color: ${isFav ? '#d97575' : 'var(--cp-primary)'}"></i>
                </div>
            `;

            html += `
            <div class="char-card ${cardClass}" onclick="CoupleModule.openCoupleSpace('${char.id}', event)">
                ${isWide ? '' : `
                    <div class="photo-block" data-char-id="${char.id}" style="background-image: url('${photoUrl}'); background-size: cover; background-position: center;" onclick="CoupleModule.changePhoto('${char.id}', event)">
                        ${heartHtml}
                    </div>
                `}
                
                <div class="info-block">
                    <div class="tag-pill">${_escHtml(tag)}</div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div style="min-width: 0;">
                            <div class="name-zh">${_escHtml(char.name)}</div>
                            <div class="name-en">${_escHtml(nameEn)}</div>
                        </div>
                        <img src="${avatarUrl}" class="avatar-img" alt="avatar">
                    </div>
                    <div class="quote-text">"${_escHtml(quote)}"</div>
                </div>

                ${isWide ? `
                    <div class="photo-block" data-char-id="${char.id}" style="background-image: url('${photoUrl}'); background-size: cover; background-position: center;" onclick="CoupleModule.changePhoto('${char.id}', event)">
                        ${heartHtml}
                    </div>
                ` : ''}
            </div>
            `;
        }
        container.innerHTML = html;
    }

    function _escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    async function toggleHeart(charId, badge, event) {
        event.stopPropagation(); 
        const heartIcon = badge.querySelector('i');
        
        if (_favorites[charId]) {
            delete _favorites[charId];
            heartIcon.style.color = 'var(--cp-primary)'; 
            heartIcon.classList.remove('ph-fill');
            heartIcon.classList.add('ph');
        } else {
            _favorites[charId] = true;
            heartIcon.style.color = '#d97575'; 
            heartIcon.classList.remove('ph');
            heartIcon.classList.add('ph-fill');
            if(navigator.vibrate) navigator.vibrate(20);
        }
        await DB.settings.set('couple-favorites', _favorites);
    }

    function changePhoto(charId, event) {
        event.stopPropagation(); 
        _pendingPhotoCharId = charId;
        document.getElementById('cp-file-input').click();
    }

    // ============================================================
    // 进入专属页面 (View 2)
    // ============================================================
    async function openCoupleSpace(charId, event) {
        if (event && event.target.closest('.heart-badge')) return;
        if (navigator.vibrate) navigator.vibrate(40);
        
        _currentCoupleCharId = String(charId);
        
        const char = _characters.find(c => String(c.id) === String(charId));
        if (!char) return;
        
        // 1. 注入名字
        document.getElementById('cp-detail-name').textContent = char.name;
        document.getElementById('cp-detail-en').textContent = char.title || 'My Universe.';
        
        // 生成随机条形码（前四位）
        const barcodeStr = String(char.id).padStart(4, '0').slice(0,4);
        document.getElementById('cp-detail-barcode').textContent = barcodeStr;

        // 2. 计算陪伴天数 (利用数据库中的 createdAt 字段)
        // 防呆：如果没有 createdAt (极早期的旧数据)，回退到 1 天
        const createdTs = char.createdAt || Date.now();
        const diffTime = Date.now() - createdTs;
        // 毫秒转天，最少算 1 天
        const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        document.getElementById('cp-detail-days').textContent = days;

        // 3. 视图流转
        document.getElementById('cp-view-gallery').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
    }

    function backToGallery() {
        document.getElementById('cp-view-detail').classList.remove('active');
        document.getElementById('cp-view-gallery').classList.add('active');
    }

    async function openSubModule(moduleName) {
        if (navigator.vibrate) navigator.vibrate(20);
        
        if (moduleName === '通缉令') {
            document.getElementById('cp-view-detail').classList.remove('active');
            document.getElementById('cp-view-wanted').classList.add('active');
            
            // 读取该角色的真实通缉令历史
            try {
                const saved = await DB.settings.get(`wanted-records-${_currentCoupleCharId}`);
                _wantedArchives = saved || [];
            } catch(e) { _wantedArchives =[]; }
            
            await renderWantedArchives();
            return;
        }
        
        if (moduleName === '异步漫游') {
            document.getElementById('cp-view-detail').classList.remove('active');
            document.getElementById('cp-view-roam').classList.add('active');
            
            // 真实数据逻辑：从数据库拉取当前角色的所有胶囊
            await loadRoamCapsules();
            await renderRoamCapsules();
            await loadRoamDiyLayout();
            return;
        }
        
        if (moduleName === '平行履历') {
            document.getElementById('cp-view-detail').classList.remove('active');
            document.getElementById('cp-view-resume').classList.add('active');
            await loadResumeData(); // 必须加上这一句加载数据库
            renderResumeTimeline();
            return;
        }
        
        if (moduleName === '共同报纸') {
            document.getElementById('cp-view-detail').classList.remove('active');
            document.getElementById('cp-view-news').classList.add('active');
            await loadNewsData(); // 🌟 这里加上这句
            renderNewsFeed();
            return;
        }
        
        if (moduleName === '陪伴') {
            document.getElementById('cp-view-detail').classList.remove('active');
            document.getElementById('cp-view-companion').classList.add('active');
            
            // 加载当前角色的专属背景图和历史档案
            const charData = _characters.find(c => String(c.id) === String(_currentCoupleCharId));
            loadFcRecords().then(async () => {
                let finalBgUrl = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=800';
                
                // 🌟 核心修改：优先尝试读取角色的原始头像/立绘
                let avatarUrl = null;
                if (charData && charData.avatarUrl) {
                    avatarUrl = await Assets.getUrl(charData.avatarUrl).catch(() => null);
                }
                
                if (avatarUrl) {
                    finalBgUrl = avatarUrl; // 优先使用角色头像
                } else {
                    // 如果没有头像，降级读取你在画廊设置的专属封面
                    const customUrl = await Assets.getUrl(`couple-bg-${_currentCoupleCharId}`).catch(() => null);
                    if (customUrl) finalBgUrl = customUrl;
                }
                
                document.getElementById('fc-char-bg').style.backgroundImage = `url('${finalBgUrl}')`;
            });
            return;
        }
        
        if (moduleName === '一起听') {
            document.getElementById('cp-view-detail').classList.remove('active');
            document.getElementById('cp-view-music').classList.add('active');
            
            // 每次重新进入房间，清空临时聊天，并同步网易云当前的播放器状态
            _muTempChat = [];
            
            // 启动状态同步轮询
            if (_muSyncInterval) clearInterval(_muSyncInterval);
            _muSyncInterval = setInterval(syncMusicState, 1000); // 每秒同步一次
            
            syncMusicState(); // 立刻执行一次，避免延迟
            _renderMuChat();  // 🌟 核心修复：在这里补上一次初始渲染，保证空状态正常显示
            return;
        }
        
        if (moduleName === '房间') {
            document.getElementById('cp-view-detail').classList.remove('active');
            document.getElementById('cp-view-room').classList.add('active');
            await loadRoomLetters(); // 👈 加上 await load
            renderRoomLetters();
            return;
        }
        
        if (moduleName === '精灵') {
            document.getElementById('cp-view-detail').classList.remove('active');
            document.getElementById('cp-view-sprite').classList.add('active');
            generateStardusts(); // 进入时生成星光
            return;
       }
       
       if (typeof Toast !== 'undefined') Toast.show(`模块 [${moduleName}] 页面施工中 ✦`);
    }
    
    // === 通缉令面板切换 ===
    let _wantedMode = 'me';
    async function switchWantedMode(mode) {
        _wantedMode = mode;
        document.getElementById('wt-btn-me').classList.toggle('active', mode === 'me');
        document.getElementById('wt-btn-him').classList.toggle('active', mode === 'him');
        document.getElementById('wt-panel-me').style.display = mode === 'me' ? 'flex' : 'none';
        document.getElementById('wt-panel-him').style.display = mode === 'him' ? 'flex' : 'none';

        if (mode === 'him') {
            // 检查冷却时间 (12小时)
            const lastTime = await DB.settings.get(`wanted-cooldown-${_currentCoupleCharId}`) || 0;
            const now = Date.now();
            const btn = document.getElementById('wt-ai-btn');
            if (now - lastTime < 12 * 60 * 60 * 1000) {
                const hoursLeft = (12 - (now - lastTime) / 3600000).toFixed(1);
                btn.disabled = true;
                btn.textContent = `COOLDOWN: ${hoursLeft}H LEFT`;
            } else {
                btn.disabled = false;
                btn.textContent = 'SYSTEM EVALUATION';
            }
        }
    }

    function toggleWantedModal() {
        const modal = document.getElementById('wt-inputModal');
        const isActive = modal.classList.toggle('active');
        if (isActive) {
            // 预填名字
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId);
            document.getElementById('wt-inpName').value = char ? char.name : 'Unknown';
            switchWantedMode('me'); // 默认打开是 ME 模式
            if(navigator.vibrate) navigator.vibrate(20);
        }
    }

    // === 真数据渲染 (修复星星与排版) ===
    async function renderWantedArchives() {
        const container = document.getElementById('wt-archiveList');
        if (!container) return;
        
        if (_wantedArchives.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 100px 0; color: #555; font-family: monospace; letter-spacing: 2px;">NO FUGITIVE RECORDS FOUND</div>';
            return;
        }

        const charData = _characters.find(c => String(c.id) === String(_currentCoupleCharId));
        let charAvatar = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=400';
        if (charData?.avatarUrl) charAvatar = await Assets.getUrl(charData.avatarUrl).catch(()=>charAvatar) || charAvatar;

        // 获取用户面具头像
        const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
        const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
        const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
        const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: 'User' };
        
        let userAvatar = document.getElementById('profile-avatar')?.src || charAvatar;
        if (userPersona.imgKey) userAvatar = await Assets.getUrl(userPersona.imgKey).catch(()=>userAvatar) || userAvatar;

        let html = '';

        // 🌟 核心修复：直接把星星的矢量路径写死，防止引用丢失！
        const starSvgContent = `<path fill="#e2e2e0" d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6-6.3 4.6 2.3-7.2-6-4.4h7.6z"/>`;

        _wantedArchives.forEach((data, index) => {
            const isCharAuthor = data.author === 'char';
            // 如果是他写的，目标是我，照片就是我
            const targetPhoto = isCharAuthor ? userAvatar : charAvatar;
            const targetName = isCharAuthor ? (userPersona.name || 'User') : (charData?.name || 'Unknown');
            const signName = isCharAuthor ? (charData?.name || 'System') : (userPersona.name || 'My Love');

            const flipClass = isCharAuthor ? `onclick="this.classList.toggle('flipped')"` : '';
            const flipHintHtml = isCharAuthor ? `<div class="wt-flip-hint"><i class="ph-bold ph-arrows-left-right"></i></div>` : '';
            const star1 = `top: -10px; right: 20px; transform: rotate(15deg) scale(1.2);`;
            const star2 = `bottom: 80px; left: -15px; transform: rotate(-20deg) scale(0.9); z-index: 10;`;
            const star3 = `bottom: -10px; right: 40px; transform: rotate(45deg) scale(1.1); z-index: 10;`;

            html += `
            <div class="wt-record" ${flipClass} style="opacity: 0; transform: translateY(30px);">
                <div class="wt-flip-inner">
                    <div class="wt-front">
                        ${flipHintHtml}
                        <svg class="wt-star" style="${star1}" width="24" height="24" viewBox="0 0 24 24">${starSvgContent}</svg>
                        
                        <div class="wt-poster">
                            <div class="wt-agency">
                                <span>© L.P.U / Love Pursuit Unit</span>
                                <!-- 🌟 核心修复：把那一排星星和操作按钮完美并排放在右边 -->
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="letter-spacing:2px; font-size:10px;">★★★★★★</span>
                                    <div class="wt-card-actions">
                                        ${isCharAuthor ? `<button class="wt-action-btn" onclick="event.stopPropagation(); CoupleModule.regenerateWanted('${data.id}')" title="重写"><i class="ph-bold ph-arrows-clockwise"></i></button>` : ''}
                                        <button class="wt-action-btn del" onclick="event.stopPropagation(); CoupleModule.deleteWanted('${data.id}')" title="销毁"><i class="ph-bold ph-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                            <div class="wt-title-grp">
                                <div class="wt-title-base">FUGITIVE</div>
                                <div class="wt-title-over">Information</div>
                            </div>
                            <img src="${targetPhoto}" class="wt-photo" alt="Target">
                            <div class="wt-warn">WARNING: EXTREMELY DANGEROUS TO HEART</div>
                            <div class="wt-row"><div class="wt-label">TARGET</div><div class="wt-val">${targetName}</div></div>
                            <div class="wt-row" style="flex-direction: column;">
                                <div class="wt-label">CRIMES</div>
                                <ul class="wt-crimes">${data.crimes.map(c => `<li>${_escHtml(c)}</li>`).join('')}</ul>
                            </div>
                            <div class="wt-row" style="flex-direction: column; border-bottom: 1px solid var(--wt-grey);">
                                <div class="wt-label">HABITS / NOTES</div>
                                <div class="wt-val" style="margin-top: 4px; font-size: 10px; color: #aaa;">${_escHtml(data.habits)}</div>
                            </div>
                        </div>

                        <div class="wt-seal">L.P.U<br>UNIT</div>

                        <div class="wt-idcard">
                            <div class="wt-idhdr">
                                <div class="wt-idtitle">SINNER'S LICENSE</div>
                                <div class="wt-idbadge">ID: ${data.id}</div>
                            </div>
                            <div class="wt-idcont">
                                <img src="${targetPhoto}" class="wt-idpic" alt="ID">
                                <div class="wt-iddets">
                                    <div class="wt-idline"><span class="wt-idlbl">Name</span><span class="wt-idv">${targetName}</span></div>
                                    <div class="wt-idline"><span class="wt-idlbl">Issue Date</span><span class="wt-idv">${data.date}</span></div>
                                    <div class="wt-idline"><span class="wt-idlbl">Position</span><span class="wt-idv">Heart Thief</span></div>
                                </div>
                            </div>
                            <div class="wt-stamp">SENTENCE: ${_escHtml(data.sentence)}</div>
                            <div class="wt-signline"><span class="wt-signtxt">SIGN.</span><div class="wt-sign">${signName}</div></div>
                        </div>

                        <svg class="wt-star" style="${star2}" width="24" height="24" viewBox="0 0 24 24">${starSvgContent}</svg>
                        <svg class="wt-star" style="${star3}" width="24" height="24" viewBox="0 0 24 24">${starSvgContent}</svg>
                    </div>

                    <div class="wt-back">
                        <div class="wt-back-poster">
                            <div class="wt-back-watermark">Top Secret</div>
                            <div class="wt-back-msg">${_escHtml(data.secretMessage || '')}</div>
                            <div class="wt-back-sign">${signName}</div>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;

        const items = container.querySelectorAll('.wt-record');
        items.forEach((item, index) => {
            setTimeout(() => {
                item.style.transition = 'all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, index * 150 + 50);
        });
    }

    // === 我提交手动档案 ===
    async function submitWantedData() {
        const crimesInput = document.getElementById('wt-inpCrimes').value;
        const crimes = crimesInput ? crimesInput.split(/[,，]/).map(c => c.trim()).filter(Boolean) : ["未知罪行"];
        const habits = document.getElementById('wt-inpHabits').value || "无数据";
        const sentence = document.getElementById('wt-inpSentence').value || "待定";
        
        const randomId = "EN-2026-" + Math.floor(Math.random() * 9000 + 1000);
        const today = new Date().toISOString().split('T')[0];

        _wantedArchives.unshift({
            id: randomId, author: 'user', 
            crimes, habits, sentence, date: today
        });

        await DB.settings.set(`wanted-records-${_currentCoupleCharId}`, _wantedArchives);

        toggleWantedModal();
        await renderWantedArchives();
        
        setTimeout(() => {
            if(navigator.vibrate) navigator.vibrate([30, 50, 30]);
            document.getElementById('cp-view-wanted').scrollTo({ top: 0, behavior: 'smooth' });
        }, 300);
    }

    // === AI 自动评估并生成档案 ===
    async function generateWantedByAI() {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { Toast.show('请先在设置中激活大模型 API'); return; }

        const btn = document.getElementById('wt-ai-btn');
        const radar = document.getElementById('wt-radar-ui');
        const finger = document.getElementById('wt-fingerprint-ui');
        const statusTxt = document.getElementById('wt-sys-status');
        
        btn.disabled = true;
        btn.textContent = 'ANALYZING...';
        finger.style.display = 'none';
        radar.style.display = 'flex';
        statusTxt.innerHTML = "EXTRACTING MEMORIES...<br>正在分析聊天记录...";

        try {
            const rawMsgs = await DB.messages.getPage(_currentCoupleCharId, 0, 50).catch(()=>[]);
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '无' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

            const historyText = rawMsgs.reverse().filter(m => m.role === 'user' || m.role === 'assistant').map(m => {
                const roleName = m.role === 'user' ? userPersona.name : char.name;
                const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                return `${roleName}: ${txt}`;
            }).join('\n');

            // 🌟 核心：改良版的 Prompt，强调人设和调情属性
            const prompt = `[系统后台调度任务：专属通缉令生成]
你现在的身份是【${char.name}】。
这是你的核心人设：${char.persona}

请完全基于你的【真实性格和日常语气】，根据以下你们最近的 50 条聊天记录，给对方（${userPersona.name}）开具一张充满情趣的“通缉令”。
【⚠️ 核心警告】：绝对不要自称“法官”、“警官”或打破第四面墙！这张通缉令是你们俩私底下的浪漫/调情/傲娇把戏，是你对ta又爱又恨的专属凭证。

【最近聊天记录】：
${historyText || '（暂无足够记录）'}

【任务要求】：
1. 提取 ${userPersona.name} 最近在聊天中的表现（比如撩拨、撒娇、冷落、惹你生气或开心的举动），用【极度符合你人设】的口吻将其列为“罪行”。
2. 严格返回 JSON 格式，绝不输出其他废话！

【JSON 格式】：
{
  "crimes":["罪行1(15字内)", "罪行2(15字内)", "罪行3(15字内)"],
  "habits": "ta的危险怪癖或让你心动的小习惯(30字内)",
  "sentence": "对ta的判决结果(如: 没收全部睡眠时间等，务必符合你的人设口吻)",
  "secretMessage": "写在通缉令背面的私密悄悄话，展现你真实的占有欲或深情(80字内)"
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('AI 返回格式异常');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            const randomId = "EN-2026-" + Math.floor(Math.random() * 9000 + 1000);
            const today = new Date().toISOString().split('T')[0];

            _wantedArchives.unshift({
                id: randomId, author: 'char',
                crimes: data.crimes || ["散发危险魅力"],
                habits: data.habits || "无记录",
                sentence: data.sentence || "立即缉拿",
                secretMessage: data.secretMessage || "已锁定目标。",
                date: today
            });

            await DB.settings.set(`wanted-records-${_currentCoupleCharId}`, _wantedArchives);
            await DB.settings.set(`wanted-cooldown-${_currentCoupleCharId}`, Date.now());

            toggleWantedModal();
            await renderWantedArchives();
            
            setTimeout(() => {
                if(navigator.vibrate) navigator.vibrate([30, 50, 30]);
                document.getElementById('cp-view-wanted').scrollTo({ top: 0, behavior: 'smooth' });
            }, 300);

        } catch (e) {
            console.error('[CoupleModule] AI Wanted Error:', e);
            if (typeof Toast !== 'undefined') Toast.show('生成失败: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'SYSTEM EVALUATION';
            radar.style.display = 'none';
            finger.style.display = 'block';
            statusTxt.innerHTML = "L.P.U DATABASE ACCESS READY.<br>等待授权扫描近期聊天记忆...";
        }
    }

    // === 卡片重修 (刷新单张通缉令) ===
    async function regenerateWanted(id) {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { Toast.show('请先激活大模型 API'); return; }

        const targetIndex = _wantedArchives.findIndex(w => w.id === id);
        if (targetIndex === -1) return;

        if (typeof Toast !== 'undefined') Toast.show('档案重构中，请稍候...');

        try {
            const rawMsgs = await DB.messages.getPage(_currentCoupleCharId, 0, 50).catch(()=>[]);
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '无' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

            const historyText = rawMsgs.reverse().filter(m => m.role === 'user' || m.role === 'assistant').map(m => {
                const roleName = m.role === 'user' ? userPersona.name : char.name;
                const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                return `${roleName}: ${txt}`;
            }).join('\n');

            const prompt = `[系统后台调度任务：专属通缉令重写]
你现在的身份是【${char.name}】。
核心人设：${char.persona}

请根据以下最近的 50 条聊天记录，重新为（${userPersona.name}）起草一份充满情趣的“通缉令”。
【⚠️ 核心警告】：绝对不要自称“法官”、“警官”！用你的人设口吻来下达这份浪漫的“判决书”。

【最近聊天记录】：
${historyText || '（无记录）'}

【JSON 格式】：
{
  "crimes":["新的罪行1(15字内)", "新的罪行2(15字内)", "新的罪行3(15字内)"],
  "habits": "新的怪癖描述(30字内)",
  "sentence": "新的判决结果(符合你的人设)",
  "secretMessage": "写在通缉令背面的私密悄悄话(50字内)"
}`;

            const response = await ApiHelper.chatCompletion(activeApi, [{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('AI 返回格式异常');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            // 更新原数据并保存
            _wantedArchives[targetIndex].crimes = data.crimes ||["散发危险魅力"];
            _wantedArchives[targetIndex].habits = data.habits || "无记录";
            _wantedArchives[targetIndex].sentence = data.sentence || "立即缉拿";
            _wantedArchives[targetIndex].secretMessage = data.secretMessage || "已锁定目标。";

            await DB.settings.set(`wanted-records-${_currentCoupleCharId}`, _wantedArchives);
            await renderWantedArchives();
            
            if (typeof Toast !== 'undefined') Toast.show('档案已刷新 ✦');
        } catch(e) {
            console.error(e);
            if (typeof Toast !== 'undefined') Toast.show('刷新失败: ' + e.message);
        }
    }

    // === 删除单张通缉令 ===
    async function deleteWanted(id) {
        if (!confirm('确定要彻底销毁这份通缉档案吗？')) return;
        
        _wantedArchives = _wantedArchives.filter(w => w.id !== id);
        await DB.settings.set(`wanted-records-${_currentCoupleCharId}`, _wantedArchives);
        await renderWantedArchives();
        
        if (typeof Toast !== 'undefined') Toast.show('档案已销毁');
    }
    
    function backFromWanted() {
        document.getElementById('cp-view-wanted').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
    }
    
     // ==========================================
    // 异步漫游 (Asynchronous Roaming) 模块
    // ==========================================
    async function loadRoamMaterials() {
        try { 
            const saved = await DB.settings.get('roam-materials');
            _roamMaterials = saved ||[];
        } catch(e) { _roamMaterials =[]; }
    }

    async function saveRoamMaterials() {
        await DB.settings.set('roam-materials', _roamMaterials);
    }

    // === 1. 从数据库读取真实胶囊 ===
    async function loadRoamCapsules() {
        try { 
            const saved = await DB.settings.get(`roam-capsules-${_currentCoupleCharId}`);
            _roamCapsules = saved ||[];
        } catch(e) { _roamCapsules =[]; }
    }

    // === 2. 将真实胶囊保存进数据库 ===
    async function saveRoamCapsules() {
        await DB.settings.set(`roam-capsules-${_currentCoupleCharId}`, _roamCapsules);
    }

    // === 3. 全新渲染逻辑 (包含每日信封判断) ===
    async function renderRoamCapsules() {
        const container = document.getElementById('roam-feedList');
        if (!container) return;

        let html = '';

        // 判断是否显示“每日信封” (如果今天没领过就显示)
        const todayStr = new Date().toDateString();
        const lastClaimed = await DB.settings.get(`roam-last-claim-${_currentCoupleCharId}`);
        
        if (lastClaimed !== todayStr) {
            html += `
            <div class="roam-envelope-wrapper" id="roam-envelope" onclick="CoupleModule.claimDailyRoam()">
                <div class="roam-envelope-mark"><i class="ph-fill ph-seal-check"></i></div>
                <div class="roam-envelope-text">1 Unread Capsule</div>
                <div class="roam-envelope-sub">来自平行时空的投递，点击拆封</div>
            </div>`;
        }

        if (_roamCapsules.length === 0 && lastClaimed === todayStr) {
            html += `<div style="text-align:center; padding: 50px 0; color: var(--roam-grey); font-family: monospace; font-size: 10px; letter-spacing: 2px;">NO CAPSULES YET</div>`;
        }

        // 渲染历史胶囊（最新在最前面）
        for (let index = 0; index < _roamCapsules.length; index++) {
            const cap = _roamCapsules[index];
            let tapeClass = index % 2 === 0 ? 'tape-top' : 'tape-corner';
            let randomDoodle = index % 3 === 0 ? _roamDoodles.bow : (index % 3 === 1 ? _roamDoodles.stars : _roamDoodles.circle);
            
            // 读取真实图片或回退到降级文字
            let imgUrl = '';
            if (cap.imageKey) {
                if (cap.imageKey.startsWith('blob:')) imgUrl = cap.imageKey;
                else imgUrl = await Assets.getUrl(cap.imageKey).catch(()=>'') || '';
            }
            
            let bgStyle = imgUrl ? `background-image: url('${imgUrl}');` : '';
            let fallbackHtml = (!imgUrl && cap.fallbackDesc) ? `<div class="roam-fallback-text">${_escHtml(cap.fallbackDesc)}</div>` : '';
            let stampHtml = imgUrl ? `<div class="roam-stamp">${cap.vibeName}</div>` : '';

            // 👇 核心修复：把获取作者的逻辑放在 html 拼接的外面！
            const charData = _characters.find(c => String(c.id) === String(_currentCoupleCharId)) || { name: '' };
            const isCharAuthor = cap.author === charData.name;

            // 重新开始拼接卡片 HTML
            html += `
            <div class="roam-cap" onclick="CoupleModule.assimilateRoamVibe('${cap.vibe}', this)">
                <div class="roam-frame">
                    <div class="roam-tape ${tapeClass}"></div>
                    ${randomDoodle}
                    <div class="roam-swatch swatch-${cap.vibe}" style="${bgStyle}">
                        ${fallbackHtml}
                        ${stampHtml}
                    </div>
                    <div class="roam-loc">
                        <i class="ph-bold ph-push-pin"></i> ${cap.location} // ${cap.date} // ${cap.time}
                    </div>
                </div>

                <div class="roam-note">
                    <div style="margin-bottom: 12px; line-height: 1.4;">
                        ${_escHtml(cap.text).replace(/\n/g, '<br>')}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px dashed rgba(0,0,0,0.1); padding-top: 8px;">
                        <div class="roam-cap-actions">
                            ${isCharAuthor ? `<i class="ph-bold ph-arrows-clockwise roam-action-btn" onclick="event.stopPropagation(); CoupleModule.regenerateRoamCapsule(${cap.id})" title="重写留言"></i>` : ''}
                            <i class="ph-bold ph-trash roam-action-btn del" onclick="event.stopPropagation(); CoupleModule.deleteRoamCapsule(${cap.id})" title="销毁胶囊"></i>
                        </div>
                        <span class="roam-author" style="margin-top: 0;">from: ${cap.author}</span>
                    </div>
                </div>
            </div>`;
        }
        container.innerHTML = html;
    }

    // === 4. 核心：一键抽取今日盲盒（AI 调用 + 生图 + 行程拉取） ===
    async function claimDailyRoam() {
        const env = document.getElementById('roam-envelope');
        if (!env) return;
        
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { 
            if (typeof Toast !== 'undefined') Toast.show('请先在设置中激活大模型 API'); 
            return; 
        }

        // 信封变为 Loading 态
        env.innerHTML = `
            <div class="roam-envelope-mark" style="animation: wt-spin 2s linear infinite;"><i class="ph-thin ph-aperture"></i></div>
            <div class="roam-envelope-text">DECRYPTING COORDINATES...</div>
            <div class="roam-envelope-sub">正在解析时空坐标与画面...</div>
        `;
        env.style.pointerEvents = 'none';

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色' };
            
            // 拉取该角色在生活系统里的今日动态 (行程)
            let scheduleCtx = '';
            if (typeof LifestyleModule !== 'undefined' && LifestyleModule.getPromptContext) {
                scheduleCtx = await LifestyleModule.getPromptContext(_currentCoupleCharId);
            }
            
            // 获取你面具的名字
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };
            
            // 拉取最近 50 条聊天
            const msgs = await DB.messages.getPage(_currentCoupleCharId, 0, 50).catch(()=>[]);
            const historyText = msgs.reverse().filter(m => m.role === 'user' || m.role === 'assistant').map(m => {
                const roleName = m.role === 'user' ? userPersona.name : char.name;
                const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                return `${roleName}: ${txt}`;
            }).join('\n');

            const prompt = `[系统后台任务：时空邮筒 - 异步漫游胶囊]
你是【${char.name}】。这是一项为你与【${userPersona.name}】建立浪漫连接的任务。

【你今日的行程轨迹】：
${scheduleCtx || '今天按部就班，没有特殊的行程。'}

【你们最近的聊天回忆】：
${historyText || '暂无最近的聊天记录'}

【任务】：
请结合你的行程轨迹，或者最近聊天中的某个未尽的话题，给 ${userPersona.name} 写一张“场景胶囊”（也就是一张带着风景照片和情绪便签的明信片）。
你要么在暗中陪她去她的行程地点，要么在你自己的某处挂念着她。

【输出要求】：严格返回纯 JSON 格式对象：
{
  "text": "你写给她的情绪便签。口吻要极具你的性格特色，带点暧昧、傲娇或深情，像是不经意间流露的思念。（50字内）",
  "location": "你当前所在的具体坐标（如：Hunter总部天台、街角咖啡店）。（15字内）",
  "vibe": "从[night, rain, sunset, cafe] 这四个英文词中选一个最符合当下氛围的词",
  "imagePrompt": "你当前视角的画面提示词。纯英文，逗号分隔，用于让 AI 画图。必须加上 aesthetic, polaroid, film grain, scenery, no humans 等修饰词保证无人的唯美风景质感。（绝对不能出现人物和脸）",
  "fallbackDesc": "用极具电影感和画面感的中文，描写一下这张照片里的绝美空镜。这是以防画图失败时的唯美文字底片。（30字内）"
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('AI 返回格式异常');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            // 尝试生图 (调用免费节点)
            let imgKey = null;
            try {
                if (typeof NovelModule !== 'undefined' && NovelModule.generateImageBlob) {
                    const baseCfg = NovelModule.getCfg ? (NovelModule.getCfg() || await NovelModule.init()) : null;
                    if (baseCfg) {
                        const blob = await NovelModule.generateImageBlob(data.imagePrompt, baseCfg);
                        if (blob) {
                            imgKey = `roam-img-${Date.now()}`;
                            // 将 Blob 转为 File 存入数据库
                            const file = new File([blob], 'roam.png', { type: 'image/png' });
                            await Assets.save(imgKey, file, 800, 0.85); 
                        }
                    }
                }
            } catch(imgErr) { console.error('[Roam] 生图失败，已降级为文字', imgErr); }

            // 封装胶囊数据
            const now = new Date();
            const newCap = {
                id: Date.now(),
                author: char.name,
                text: data.text || '想你了。',
                location: data.location || '未知坐标',
                time: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                vibe: data.vibe || 'night',
                vibeName: (data.vibe || 'NIGHT').toUpperCase(),
                date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase(),
                imageKey: imgKey,
                fallbackDesc: data.fallbackDesc || '一张模糊的风景照。'
            };

            // 入库并打上今日已领取标记
            _roamCapsules.unshift(newCap);
            await saveRoamCapsules();
            await DB.settings.set(`roam-last-claim-${_currentCoupleCharId}`, now.toDateString());

            // 刷新渲染
            await renderRoamCapsules();
            if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

        } catch(e) {
            console.error('[Roam] claim error', e);
            if (typeof Toast !== 'undefined') Toast.show('信号解析失败，请重试: ' + e.message);
            env.style.pointerEvents = 'auto';
            env.innerHTML = `
                <div class="roam-envelope-mark"><i class="ph-fill ph-seal-check"></i></div>
                <div class="roam-envelope-text">1 UNREAD CAPSULE</div>
                <div class="roam-envelope-sub">解析失败，点击重试</div>
            `;
        }
    }

    function assimilateRoamVibe(vibeType, element) {
        const view = document.getElementById('cp-view-roam');
        if (view.classList.contains('diy-mode-active')) return; 

        if (navigator.vibrate) navigator.vibrate(20);
        element.style.transform = 'scale(0.96)';
        setTimeout(() => { element.style.transform = ''; }, 200);

        let paperTint = '#f4f1eb';
        if (vibeType === 'rain') paperTint = '#e6edf2';
        if (vibeType === 'night') paperTint = '#e8e9ee';
        if (vibeType === 'sunset') paperTint = '#f7edea';
        if (vibeType === 'cafe') paperTint = '#f2ede9';
        view.style.backgroundColor = paperTint;
    }

    function backFromRoam() {
        document.getElementById('cp-view-roam').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
    }

    // --- DIY 素材库相关 ---
    async function loadRoamMaterials() {
        try { 
            const saved = await DB.settings.get('roam-materials');
            _roamMaterials = saved || [];
        } catch(e) { _roamMaterials =[]; }
    }

    async function openRoamLibrary() {
        document.getElementById('roam-library').classList.add('active');
        if (navigator.vibrate) navigator.vibrate(20);
        _roamSelectedMaterials.clear();
        await loadRoamMaterials();
        _renderRoamMaterialGrid();
    }

    function closeRoamLibrary() {
        document.getElementById('roam-library').classList.remove('active');
        document.getElementById('roam-urlArea').classList.remove('active');
        document.getElementById('roam-urlInput').value = '';
    }

    async function _renderRoamMaterialGrid() {
        const grid = document.getElementById('roam-materialGrid');
        const btn = document.getElementById('roam-btnStartDiy');
        let html = '';

        if (_roamMaterials.length === 0) {
            html = `<div class="lib-empty"><i class="ph ph-folder-open" style="font-size: 32px; margin-bottom: 8px;"></i><span style="font-family: 'Courier Prime', monospace; font-size: 10px;">素材库空空如也，快去上传吧~</span></div>`;
        } else {
            for (const mat of _roamMaterials) {
                // 如果存的是数据库的 key，转换成可显示的 URL
                let displayUrl = mat.url;
                if (!mat.isUrl) displayUrl = await Assets.getUrl(mat.key).catch(()=>'');
                
                if (displayUrl) {
                    const isSelected = _roamSelectedMaterials.has(mat.key || mat.url);
                    const identifier = mat.key || mat.url; // 用来做选择标记
                    html += `
                        <div class="mat-item ${isSelected ? 'selected' : ''}" onclick="CoupleModule.toggleRoamMaterialSelection('${identifier}')">
                            <img src="${displayUrl}" alt="sticker">
                        </div>`;
                }
            }
        }
        grid.innerHTML = html;

        const count = _roamSelectedMaterials.size;
        btn.innerText = `开始装修 (${count})`;
        btn.disabled = false; // 🌟 修复：解除禁用，允许只进入编辑模式调整已贴好的素材

        // 🌟 补上这两行：联动垃圾桶颜色
        const delBtn = document.getElementById('roam-lib-del-btn');
        if (delBtn) delBtn.style.color = count > 0 ? '#d97575' : 'var(--roam-grey)';
    }

    function toggleRoamMaterialSelection(identifier) {
        if (_roamSelectedMaterials.has(identifier)) _roamSelectedMaterials.delete(identifier);
        else _roamSelectedMaterials.add(identifier);
        if (navigator.vibrate) navigator.vibrate(10);
        _renderRoamMaterialGrid(); // 重新渲染刷新勾选状态
    }

    // 真正的图片压缩与存入 IndexedDB
    async function handleRoamLocalUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        if (typeof Toast !== 'undefined') Toast.show('素材处理中...');
        
        for (const file of Array.from(files)) {
            try {
                const key = `roam-sticker-${Date.now()}-${Math.floor(Math.random()*1000)}`;
                // 压缩，最大支持 800px，保留透明度
                await Assets.save(key, file, 800, 0.85); 
                _roamMaterials.unshift({ key: key, isUrl: false });
            } catch(e) { console.error('素材保存失败', e); }
        }
        
        await saveRoamMaterials();
        _renderRoamMaterialGrid();
        if (typeof Toast !== 'undefined') Toast.show('素材已加入');
        event.target.value = ''; 
    }

    function handleRoamUrlUpload() {
        const val = document.getElementById('roam-urlInput').value;
        if (!val.trim()) return;

        const urls = val.split(/,|\n/).map(u => u.trim()).filter(u => u.length > 0);
        urls.forEach(u => {
            if (!_roamMaterials.some(m => m.url === u)) {
                _roamMaterials.unshift({ url: u, isUrl: true });
            }
        });

        saveRoamMaterials();
        document.getElementById('roam-urlInput').value = '';
        document.getElementById('roam-urlArea').classList.remove('active');
        _renderRoamMaterialGrid();
        if (navigator.vibrate) navigator.vibrate(20);
    }

    // --- DIY 交互逻辑 ---
    async function startRoamDiy() {
        if (_roamSelectedMaterials.size === 0) return;
        
        closeRoamLibrary();
        const view = document.getElementById('cp-view-roam');
        view.classList.add('diy-mode-active');
        document.getElementById('roam-finishDiyBtn').classList.add('active');

        const layer = document.getElementById('roam-sticker-layer');
        
        let index = 0;
        for (const identifier of _roamSelectedMaterials) {
            const mat = _roamMaterials.find(m => m.key === identifier || m.url === identifier);
            let displayUrl = mat.url;
            if (!mat.isUrl) displayUrl = await Assets.getUrl(mat.key).catch(()=>'');

            if (displayUrl) {
                const wrapper = document.createElement('div');
                wrapper.className = 'sticker-wrapper active';
                wrapper.dataset.identifier = identifier;
                
                const offset = index * 20;
                wrapper.style.left = `calc(50% + ${offset}px)`;
                wrapper.style.top = `calc(50vh + ${offset}px)`;
                wrapper.style.transform = `translate(-50%, -50%) rotate(0deg) scale(1)`;
                wrapper.dataset.rotation = 0;
                wrapper.dataset.scale = 1;

                wrapper.innerHTML = `
                    <img src="${displayUrl}" alt="sticker">
                    <div class="sticker-controls">
                        <div class="sticker-close"><i class="ph ph-x"></i></div>
                        <div class="sticker-handle"><i class="ph-bold ph-arrows-out"></i></div>
                    </div>
                `;
                
                layer.appendChild(wrapper);
                _bindStickerEvents(wrapper);
                index++;
            }
        }
        
        const newlyAdded = layer.querySelectorAll('.sticker-wrapper');
        newlyAdded.forEach((w, i) => { if(i !== newlyAdded.length - 1) w.classList.remove('active'); });
        if (navigator.vibrate) navigator.vibrate([30, 50]);
    }

    async function finishRoamDiy() {
        document.getElementById('cp-view-roam').classList.remove('diy-mode-active');
        document.getElementById('roam-finishDiyBtn').classList.remove('active');
        
        const layer = document.getElementById('roam-sticker-layer');
        const stickers = layer.querySelectorAll('.sticker-wrapper');
        
        // 🌟 核心：收集所有贴纸当前的位置、缩放、旋转角度和层级
        const layout =[];
        stickers.forEach(s => {
            s.classList.remove('active');
            layout.push({
                identifier: s.dataset.identifier,
                left: s.style.left,
                top: s.style.top,
                rotation: s.dataset.rotation || 0,
                scale: s.dataset.scale || 1,
                zIndex: s.style.zIndex || 50
            });
        });

        // 存入当前角色的专属数据库
        try {
            await DB.settings.set(`roam-diy-layout-${_currentCoupleCharId}`, layout);
        } catch(e) {
            console.error('[Roam] 保存排版失败', e);
        }

        if (navigator.vibrate) navigator.vibrate(30);
    }
    
    async function loadRoamDiyLayout() {
        const layer = document.getElementById('roam-sticker-layer');
        layer.innerHTML = ''; // 清空重置画布
        
        try {
            const layout = await DB.settings.get(`roam-diy-layout-${_currentCoupleCharId}`) ||[];
            if (layout.length === 0) return;

            // 确保素材库已被加载
            if (_roamMaterials.length === 0) await loadRoamMaterials();
            
            for (const item of layout) {
                // 找到对应的素材数据
                const mat = _roamMaterials.find(m => m.key === item.identifier || m.url === item.identifier);
                if (!mat) continue; // 如果素材已被用户在素材库里彻底删除，则跳过
                
                let displayUrl = mat.url;
                if (!mat.isUrl) displayUrl = await Assets.getUrl(mat.key).catch(()=>'');
                if (!displayUrl) continue;

                const wrapper = document.createElement('div');
                wrapper.className = 'sticker-wrapper';
                wrapper.dataset.identifier = item.identifier;
                wrapper.dataset.rotation = item.rotation;
                wrapper.dataset.scale = item.scale;
                
                // 恢复位置和样式
                wrapper.style.left = item.left;
                wrapper.style.top = item.top;
                wrapper.style.transform = `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`;
                wrapper.style.zIndex = item.zIndex;

                wrapper.innerHTML = `
                    <img src="${displayUrl}" alt="sticker">
                    <div class="sticker-controls">
                        <div class="sticker-close"><i class="ph ph-x"></i></div>
                        <div class="sticker-handle"><i class="ph-bold ph-arrows-out"></i></div>
                    </div>
                `;
                
                layer.appendChild(wrapper);
                _bindStickerEvents(wrapper); // 重新绑定拖拽事件
            }
        } catch(e) {
            console.error('[Roam] 恢复排版失败', e);
        }
    }

    function _bindStickerEvents(wrapper) {
        const handle = wrapper.querySelector('.sticker-handle');
        const closeBtn = wrapper.querySelector('.sticker-close');
        let isDragging = false, isTransforming = false;
        let startX, startY, startLeft, startTop, cx, cy, startAngle, startDistance;
        let initialRot = 0, initialScale = 1;

        closeBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            wrapper.remove();
        }, {passive: false});

        wrapper.addEventListener('touchstart', (e) => {
            const view = document.getElementById('cp-view-roam');
            if (!view.classList.contains('diy-mode-active')) return;
            if (e.target === handle || e.target.closest('.sticker-handle') || e.target === closeBtn) return;
            
            document.querySelectorAll('#roam-sticker-layer .sticker-wrapper').forEach(el => {
                el.classList.remove('active');
                el.style.zIndex = 50;
            });
            wrapper.classList.add('active');
            wrapper.style.zIndex = 51;

            isDragging = true;
            const touch = e.touches[0];
            startX = touch.clientX; startY = touch.clientY;
            startLeft = wrapper.offsetLeft; startTop = wrapper.offsetTop;
        }, {passive: false});

        handle.addEventListener('touchstart', (e) => {
            const view = document.getElementById('cp-view-roam');
            if (!view.classList.contains('diy-mode-active')) return;
            e.stopPropagation(); e.preventDefault(); 
            
            isTransforming = true;
            wrapper.classList.add('active');
            
            const layerRect = document.getElementById('roam-sticker-layer').getBoundingClientRect();
            cx = layerRect.left + wrapper.offsetLeft;
            cy = layerRect.top + wrapper.offsetTop;

            const touch = e.touches[0];
            startAngle = Math.atan2(touch.clientY - cy, touch.clientX - cx);
            startDistance = Math.hypot(touch.clientY - cy, touch.clientX - cx);
            
            initialRot = parseFloat(wrapper.dataset.rotation) || 0;
            initialScale = parseFloat(wrapper.dataset.scale) || 1;
        }, {passive: false});

        document.addEventListener('touchmove', (e) => {
            const view = document.getElementById('cp-view-roam');
            if (!view.classList.contains('diy-mode-active')) return;
            
            if (isDragging) {
                e.preventDefault(); 
                const touch = e.touches[0];
                wrapper.style.left = `${startLeft + (touch.clientX - startX)}px`;
                wrapper.style.top = `${startTop + (touch.clientY - startY)}px`;
            }

            if (isTransforming) {
                e.preventDefault(); 
                const touch = e.touches[0];
                const currentAngle = Math.atan2(touch.clientY - cy, touch.clientX - cx);
                const currentDistance = Math.hypot(touch.clientY - cy, touch.clientX - cx);

                let newRot = initialRot + ((currentAngle - startAngle) * (180 / Math.PI));
                let newScale = initialScale * (currentDistance / startDistance);

                wrapper.style.transform = `translate(-50%, -50%) rotate(${newRot}deg) scale(${newScale})`;
                wrapper.dataset.rotation = newRot;
                wrapper.dataset.scale = newScale;
            }
        }, {passive: false});

        document.addEventListener('touchend', () => { isDragging = false; isTransforming = false; });
        
        document.getElementById('roam-app-container').addEventListener('touchstart', (e) => {
            const view = document.getElementById('cp-view-roam');
            if (view.classList.contains('diy-mode-active') && !e.target.closest('.sticker-wrapper') && !e.target.closest('.finish-diy-btn')) {
                document.querySelectorAll('#roam-sticker-layer .sticker-wrapper').forEach(s => s.classList.remove('active'));
            }
        });
    }

    // --- 胶囊生成 ---
    function openRoamCreator() {
        document.getElementById('roam-creatorModal').classList.add('active');
        if (navigator.vibrate) navigator.vibrate(20);
    }

    function closeRoamCreator() {
        document.getElementById('roam-creatorModal').classList.remove('active');
        _roamUploadedImgUrl = '';
        _roamUploadedImgFile = null; // 🌟 清理内存
        const pb = document.getElementById('roam-imagePreview');
        pb.style.backgroundImage = '';
        pb.innerHTML = `<i class="ph ph-camera-plus" style="font-size: 24px; color: var(--roam-grey);"></i><span style="font-size: 10px; color: var(--roam-grey); margin-top: 8px;">TAP TO UPLOAD</span>`;
    }

    function handleRoamImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            _roamUploadedImgFile = file; // 🌟 存储真实文件
            _roamUploadedImgUrl = URL.createObjectURL(file); 
            const pb = document.getElementById('roam-imagePreview');
            pb.style.backgroundImage = `url('${_roamUploadedImgUrl}')`;
            pb.innerHTML = '';
        }
    }

    function selectRoamVibe(btn) {
        document.querySelectorAll('.vibe-picker .vb-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _roamCurrentVibe = btn.getAttribute('data-vibe');
        _roamCurrentVibeName = btn.getAttribute('data-name');
        if (navigator.vibrate) navigator.vibrate(10);
    }

    async function submitRoamCapsule() {
        const text = document.getElementById('roam-capText').value;
        const location = document.getElementById('roam-capLoc').value || "未知坐标";
        if (!text.trim()) { if (typeof Toast !== 'undefined') Toast.show('纸条上还没有写字哦...'); return; }

        let imgKey = null;
        if (_roamUploadedImgFile) {
            if (typeof Toast !== 'undefined') Toast.show('相片冲印中...');
            imgKey = `roam-img-${Date.now()}`;
            // 真实压缩并存入主库 Assets
            await Assets.save(imgKey, _roamUploadedImgFile, 800, 0.85); 
        }

        // 获取用户面具名称
        const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
        const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
        const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
        const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

        const now = new Date();
        _roamCapsules.unshift({
            id: Date.now(), 
            author: userPersona.name, 
            text: text, 
            location: location,
            time: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            vibe: _roamCurrentVibe, 
            vibeName: _roamCurrentVibeName, 
            date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase(),
            imageKey: imgKey
        });

        await saveRoamCapsules();

        document.getElementById('roam-capText').value = '';
        document.getElementById('roam-capLoc').value = '';
        closeRoamCreator();
        
        await renderRoamCapsules();
        
        setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
            document.getElementById('cp-view-roam').scrollTo({ top: 0, behavior: 'smooth' });
            assimilateRoamVibe(_roamCurrentVibe, document.querySelector('#cp-view-roam .roam-cap'));
        }, 300);
    }
    
    // === 批量删除素材 ===
    async function deleteSelectedRoamMaterials() {
        if (_roamSelectedMaterials.size === 0) {
            if (typeof Toast !== 'undefined') Toast.show('请先勾选需要删除的素材');
            return;
        }
        
        if (!confirm(`确定要彻底销毁选中的 ${_roamSelectedMaterials.size} 个素材吗？`)) return;

        // 遍历选中的标识符，清理真实文件以释放空间
        for (const identifier of _roamSelectedMaterials) {
            const mat = _roamMaterials.find(m => m.key === identifier || m.url === identifier);
            if (mat && !mat.isUrl) {
                try {
                    // 尝试从底层真实数据库中抹除该图片
                    if (typeof Assets !== 'undefined' && Assets.delete) await Assets.delete(mat.key);
                    else if (typeof DB !== 'undefined' && DB.assets) await DB.assets.delete(mat.key);
                } catch(e) { console.warn('清理底层素材失败', e); }
            }
        }

        // 从列表中过滤掉这些被选中的素材
        _roamMaterials = _roamMaterials.filter(m => !_roamSelectedMaterials.has(m.key) && !_roamSelectedMaterials.has(m.url));
        
        // 清空选择池
        _roamSelectedMaterials.clear();
        
        // 重新保存并渲染 UI
        await saveRoamMaterials();
        await _renderRoamMaterialGrid();
        
        if (typeof Toast !== 'undefined') Toast.show('素材已销毁');
        if (navigator.vibrate) navigator.vibrate(20);
    }
    
    // === 5. 核心：增量封存胶囊至世界书 ===
    async function archiveRoamCapsules() {
        if (!_roamCapsules || _roamCapsules.length === 0) {
            if (typeof Toast !== 'undefined') Toast.show('暂无胶囊可封存');
            return;
        }

        // 1. 获取上次封存的游标
        const lastArchivedId = await DB.settings.get(`roam-last-archived-${_currentCoupleCharId}`) || 0;
        
        // 2. 筛选新胶囊，并反转为时间正序 (旧 -> 新)
        const unarchived = _roamCapsules.filter(c => c.id > lastArchivedId).reverse();

        if (unarchived.length === 0) {
            if (typeof Toast !== 'undefined') Toast.show('没有新的胶囊需要封存');
            return;
        }

        if (typeof Toast !== 'undefined') Toast.show('正在读取影像并封存至世界书...');

        const activeApi = await DB.api.getActive().catch(()=>null);
        let appendText = '';

        for (const cap of unarchived) {
            // 格式化时间戳
            const d = new Date(cap.id);
            const timeStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${cap.time}`;

            // 智能读取图片内容 (如果有图且激活了API走视觉，没有则用备用描述)
            let imgContent = cap.fallbackDesc || '一张风景照';
            if (cap.imageKey && activeApi) {
                try {
                    const b64 = await Assets.getBase64(cap.imageKey);
                    if (b64) {
                        const descRes = await ApiHelper.chatCompletion(activeApi,[{
                            role: 'user',
                            content:[
                                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
                                { type: 'text', text: '用一句话客观且简短地描述这张图片的核心内容，不要主观臆断，不超过30字。' }
                            ]
                        }]);
                        if (descRes) imgContent = descRes.trim();
                    }
                } catch(e) {
                    console.warn('[Roam] 视觉API读取失败，降级使用文本', e);
                }
            }

            // 组装极简的编年史文本
            appendText += `\n[${timeStr}] 坐标: ${cap.location} | 画面: ${imgContent}\n${cap.author}的便签留言: "${cap.text}"\n`;
        }

        try {
            // 3. 查找是否已经存在专属漫游世界书
            const allWBs = await DB.worldInfo.getAll().catch(()=>[]);
            let roamWB = allWBs.find(wb => wb.isRoamArchive && wb.characterIds && wb.characterIds.includes(_currentCoupleCharId));

            if (roamWB) {
                // 追加内容
                roamWB.content += '\n' + appendText;
                await DB.worldInfo.put(roamWB);
            } else {
                // 首次创建：开启 isAlwaysOn (常驻)
                await DB.worldInfo.add({
                    name: `异步漫游影像集`,
                    keyword: '漫游,胶囊,照片,信件', // 随便填的掩人耳目，实际上走 AlwaysOn
                    content: `[系统底色设定：以下是双方通过"异步漫游"交换的时空胶囊记录，这是不可磨灭的浪漫回忆，请自然地在聊天中体现出对此的感知。]\n${appendText}`,
                    isRegex: false,
                    isAlwaysOn: true, // 🌟 核心：无视关键词，长期注入
                    enabled: true,
                    weight: 7, // 权重稍微给高点
                    categoryId: 'default',
                    characterIds: [String(_currentCoupleCharId)],
                    scope: ['chat'],
                    isRoamArchive: true // 专属标记，防找错
                });
            }

            // 4. 更新封存游标
            const maxId = Math.max(...unarchived.map(c => c.id));
            await DB.settings.set(`roam-last-archived-${_currentCoupleCharId}`, maxId);

            if (typeof Toast !== 'undefined') Toast.show('漫游影像已永久封存入世界书 ✦');
            if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

        } catch (e) {
            console.error('[Roam] 封存失败', e);
            if (typeof Toast !== 'undefined') Toast.show('封存失败');
        }
    }
    
  // === 重新生成单张胶囊 (连图带文案一起重做) ===
    async function regenerateRoamCapsule(id) {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { if (typeof Toast !== 'undefined') Toast.show('请先激活大模型 API'); return; }

        const targetIndex = _roamCapsules.findIndex(c => c.id === id);
        if (targetIndex === -1) return;

        // 提示词改成时空重组中，告知用户在生图
        if (typeof Toast !== 'undefined') Toast.show('时空重组中，正在生成新画面...');

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

            const msgs = await DB.messages.getPage(_currentCoupleCharId, 0, 50).catch(()=>[]);
            const historyText = msgs.reverse().filter(m => m.role === 'user' || m.role === 'assistant').map(m => {
                const roleName = m.role === 'user' ? userPersona.name : char.name;
                const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                return `${roleName}: ${txt}`;
            }).join('\n');

            const prompt = `[系统后台任务：异步漫游胶囊重写]
你是【${char.name}】。你之前给【${userPersona.name}】留了一张场景胶囊，但现在你需要换一个全新的视角或场景，重新做一张。

【你们最近的聊天回忆】：
${historyText || '暂无最近的聊天记录'}

【任务】：请返回纯 JSON 格式对象：
{
  "text": "新的情绪便签。带点暧昧、傲娇或深情。（50字内）",
  "location": "新的具体坐标。（15字内）",
  "vibe": "从[night, rain, sunset, cafe] 这四个英文词中选一个最符合当下氛围的词",
  "imagePrompt": "你新视角的画面提示词。纯英文，逗号分隔，必须加上 aesthetic, polaroid, film grain, scenery, no humans 等修饰词保证无人的唯美风景质感。",
  "fallbackDesc": "用极具电影感和画面感的中文，描写一下这张新照片里的绝美空镜。（30字内）"
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('AI 返回格式异常');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            // 开始重新生图
            let newImgKey = _roamCapsules[targetIndex].imageKey; // 默认保留原图作为保底
            try {
                if (typeof NovelModule !== 'undefined' && NovelModule.generateImageBlob) {
                    const baseCfg = NovelModule.getCfg ? (NovelModule.getCfg() || await NovelModule.init()) : null;
                    if (baseCfg) {
                        const blob = await NovelModule.generateImageBlob(data.imagePrompt, baseCfg);
                        if (blob) {
                            // 1. 如果有旧图，先从数据库里删掉旧图，释放本地存储空间
                            const oldKey = _roamCapsules[targetIndex].imageKey;
                            if (oldKey && !oldKey.startsWith('blob:') && typeof Assets !== 'undefined' && Assets.delete) {
                                await Assets.delete(oldKey).catch(() => console.warn('清理旧图缓存失败'));
                            }
                            
                            // 2. 保存新图
                            newImgKey = `roam-img-${Date.now()}`;
                            const file = new File([blob], 'roam.png', { type: 'image/png' });
                            await Assets.save(newImgKey, file, 800, 0.85); 
                        }
                    }
                }
            } catch(imgErr) { console.error('[Roam] 重生图失败', imgErr); }

            // 覆盖所有新数据
            _roamCapsules[targetIndex].text = data.text || '想你了。';
            _roamCapsules[targetIndex].location = data.location || '未知坐标';
            _roamCapsules[targetIndex].vibe = data.vibe || 'night';
            _roamCapsules[targetIndex].vibeName = (data.vibe || 'NIGHT').toUpperCase();
            _roamCapsules[targetIndex].fallbackDesc = data.fallbackDesc || '一张风景照。';
            _roamCapsules[targetIndex].imageKey = newImgKey; // 绑定新图

            await saveRoamCapsules();
            await renderRoamCapsules();
            
            if (typeof Toast !== 'undefined') Toast.show('胶囊已完全重构 ✦');
            if (navigator.vibrate) navigator.vibrate([30, 50]);

        } catch(e) {
            console.error(e);
            if (typeof Toast !== 'undefined') Toast.show('重构失败: ' + e.message);
        }
    }

    // === 彻底删除单张胶囊 ===
    async function deleteRoamCapsule(id) {
        if (!confirm('确定要彻底销毁这个时空胶囊吗？')) return;
        
        const cap = _roamCapsules.find(c => c.id === id);
        if (cap && cap.imageKey && !cap.imageKey.startsWith('blob:')) {
            try {
                // 如果是物理文件存储的图片，顺便清理掉底层垃圾
                if (typeof Assets !== 'undefined' && Assets.delete) await Assets.delete(cap.imageKey);
            } catch(e) { console.warn('清理底层图片失败', e); }
        }

        _roamCapsules = _roamCapsules.filter(c => c.id !== id);
        await saveRoamCapsules();
        await renderRoamCapsules();
        
        if (typeof Toast !== 'undefined') Toast.show('胶囊已销毁');
        if (navigator.vibrate) navigator.vibrate(20);
    }
    
    // ==========================================
    // 平行履历 (Parallel Resume) 模块 - 真实业务逻辑
    // ==========================================
    let _resumeData =[];

    async function loadResumeData() {
        try {
            const saved = await DB.settings.get(`resume-data-${_currentCoupleCharId}`);
            _resumeData = saved || [];
        } catch(e) { _resumeData =[]; }
    }

    async function saveResumeData() {
        await DB.settings.set(`resume-data-${_currentCoupleCharId}`, _resumeData);
    }

    function backFromResume() {
        document.getElementById('cp-view-resume').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
    }
    
    function renderResumeTimeline() {
        const container = document.getElementById('rs-timelineList');
        if (!container) return;
        
        const char = _characters.find(c => String(c.id) === String(_currentCoupleCharId)) || { name: '他' };
        let html = '';

        if (_resumeData.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 80px 0; color: var(--rs-text-muted); font-size: 12px; letter-spacing: 2px;">NO TIMELINES FOUND<br><br>点击右上角录入你的记忆</div>`;
            return;
        }

        // 按日期降序排序
        _resumeData.sort((a, b) => new Date(b.date) - new Date(a.date));

        _resumeData.forEach((record, index) => {
            const isIntersecting = !!(record.myText && record.charText);
            const formattedDate = record.date.replace(/-/g, '.');

            let cardLeft = `
                <div class="rs-event-card left">
                    <div class="rs-tape"></div>
                    <div class="rs-owner-tag"><i class="ph-fill ph-user"></i> My Record</div>
                    <div class="rs-event-text">${_escHtml(record.myText)}</div>
                </div>`;

            // 右侧卡片加入重写和删除按钮
            let cardRight = `
                <div class="rs-event-card right">
                    <div class="rs-tape"></div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div class="rs-owner-tag"><i class="ph-fill ph-star"></i> ${char.name}</div>
                        <div style="display:flex; gap:8px;">
                            <i class="ph-bold ph-arrows-clockwise rs-action-btn" onclick="CoupleModule.regenerateResumeRecord('${record.id}')" title="重演命运"></i>
                            <i class="ph-bold ph-trash rs-action-btn del" onclick="CoupleModule.deleteResumeRecord('${record.id}')" title="抹除记忆"></i>
                        </div>
                    </div>
                    <div class="rs-event-text">${_escHtml(record.charText)}</div>
                </div>`;

            let badgeHtml = '';
            let fateLineHtml = '';

            if (isIntersecting) {
                const safeNarrative = encodeURIComponent(record.narrative);
                badgeHtml = `
                    <div class="rs-date-badge intersecting" onclick="CoupleModule.openResumeNarrativeModal('${safeNarrative}')">
                        <i class="ph-fill ph-sparkle"></i> ${formattedDate}
                    </div>`;
                fateLineHtml = `<div class="rs-horizontal-fate-line"></div>`;
            } else {
                badgeHtml = `<div class="rs-date-badge">${formattedDate}</div>`;
            }

            html += `
            <div class="rs-timeline-block" style="animation: slideUp 0.6s ease forwards; animation-delay: ${index * 0.1}s;">
                ${badgeHtml}
                <div class="rs-events-wrapper">
                    ${fateLineHtml}
                    ${cardLeft}
                    ${cardRight}
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    // === 弹窗操作 ===
    function openResumeInputModal() { document.getElementById('rs-inputModal').classList.add('active'); }
    function closeResumeInputModal() { document.getElementById('rs-inputModal').classList.remove('active'); }
    function openResumeNarrativeModal(encodedText) {
        document.getElementById('rs-narrativeText').innerText = decodeURIComponent(encodedText);
        document.getElementById('rs-narrativeModal').classList.add('active');
        if (navigator.vibrate) navigator.vibrate(20);
    }
    function closeResumeNarrativeModal() { document.getElementById('rs-narrativeModal').classList.remove('active'); }

    function addResumeInputBlock() {
        const list = document.getElementById('rs-inputList');
        const block = document.createElement('div');
        block.className = 'rs-input-block';
        block.innerHTML = `
            <i class="ph-fill ph-trash rs-delete-block-btn" onclick="this.parentElement.remove()"></i>
            <div class="rs-input-group"><label class="rs-input-label">Date / 发生日期</label><input type="date" class="rs-inp-date" required></div>
            <div class="rs-input-group"><label class="rs-input-label">Event / 你的经历</label><textarea class="rs-inp-event" placeholder="那一天，你经历了什么..."></textarea></div>`;
        list.appendChild(block);
        setTimeout(() => list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }), 100);
    }

    // === 核心 AI 推演功能 ===
    async function generateResumeTimeline() {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { if (typeof Toast !== 'undefined') Toast.show('请先激活大模型 API'); return; }

        const blocks = document.querySelectorAll('.rs-input-block');
        const newInputs =[];
        blocks.forEach(block => {
            const dateVal = block.querySelector('.rs-inp-date').value;
            const text = block.querySelector('.rs-inp-event').value;
            if (dateVal && text.trim()) newInputs.push({ date: dateVal, text: text.trim() });
        });

        if (newInputs.length === 0) {
            if (typeof Toast !== 'undefined') Toast.show("请至少填写一条完整的日期和经历"); return;
        }

        closeResumeInputModal();
        const loader = document.getElementById('rs-loadingOverlay');
        loader.classList.add('active');

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '无' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

            const inputsJsonStr = JSON.stringify(newInputs, null, 2);

            const prompt = `[系统后台任务：时空交汇点推演]
你现在的身份是上帝视角的旁白，你需要补全角色【${char.name}】的平行履历，并撰写命运交汇的宿命旁白。
【角色的核心人设与背景】：
${char.persona}

【用户（${userPersona.name}）提供的回忆锚点】：
${inputsJsonStr}

【任务要求】：
1. 遍历用户的每一个日期回忆。仔细查阅【角色的背景设定】中是否在这一年/这一天有特殊的经历。如果有，请严格贴合他的官方背景；如果没有，请根据他的职业、性格，合理推演那天他大概率在经历什么。
2. 梳理出角色当天的经历 (charText)。
3. 写一段极具电影感和宿命感的旁白 (narrative)，将他们两人在这个时间的经历巧妙地建立起形而上学的联系（比如：错过的遗憾、相反的处境、跨越时空的共振）。旁白必须直击人心。

请严格返回如下 JSON 格式：
{
  "results":[
    {
      "date": "对应的日期",
      "charText": "角色在同一天的经历 (60字内)",
      "narrative": "将两人经历交织在一起的命运旁白 (100字内)"
    }
  ]
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('AI 返回格式异常');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            // 合并数据
            data.results.forEach(res => {
                const userInput = newInputs.find(i => i.date === res.date);
                if (userInput) {
                    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
                    _resumeData.push({
                        id: newId,
                        date: userInput.date,
                        myText: userInput.text,
                        charText: res.charText,
                        narrative: res.narrative
                    });
                }
            });

            await saveResumeData();
            document.getElementById('rs-inputList').innerHTML = `
                <div class="rs-input-block">
                    <div class="rs-input-group"><label class="rs-input-label">Date / 发生日期</label><input type="date" class="rs-inp-date" required></div>
                    <div class="rs-input-group"><label class="rs-input-label">Event / 你的经历</label><textarea class="rs-inp-event" placeholder="那一天，你经历了什么..."></textarea></div>
                </div>`;

            renderResumeTimeline();
            if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
            document.getElementById('cp-view-resume').scrollTo({ top: 0, behavior: 'smooth' });

        } catch(e) {
            console.error('[Resume] 生成失败', e);
            if (typeof Toast !== 'undefined') Toast.show('时空推演失败，请重试');
        } finally {
            loader.classList.remove('active');
        }
    }

    // === 单条重构 ===
    async function regenerateResumeRecord(id) {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { if (typeof Toast !== 'undefined') Toast.show('请先激活大模型 API'); return; }

        const targetIndex = _resumeData.findIndex(r => r.id === id);
        if (targetIndex === -1) return;

        if (typeof Toast !== 'undefined') Toast.show('命运重组中...');
        const record = _resumeData[targetIndex];

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '无' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

            const prompt = `[系统后台任务：时空交汇点重写]
角色【${char.name}】的背景设定：${char.persona}
在 ${record.date} 这一天，用户（${userPersona.name}）的经历是：${record.myText}

请换一个视角或事件，重新推演角色在同一天的经历，并重写一段新的命运交汇旁白。
返回 JSON：
{
  "charText": "角色在同一天的新经历 (60字内)",
  "narrative": "全新的命运交织旁白 (100字内)"
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            _resumeData[targetIndex].charText = data.charText;
            _resumeData[targetIndex].narrative = data.narrative;
            
            await saveResumeData();
            renderResumeTimeline();
            if (typeof Toast !== 'undefined') Toast.show('命运已重写 ✦');

        } catch(e) { console.error(e); if (typeof Toast !== 'undefined') Toast.show('重写失败'); }
    }

    // === 删除单条 ===
    async function deleteResumeRecord(id) {
        if (!confirm('确定要彻底抹除这个日期的交汇记忆吗？这会连同你的日记一起删除。')) return;
        _resumeData = _resumeData.filter(r => r.id !== id);
        await saveResumeData();
        renderResumeTimeline();
        if (typeof Toast !== 'undefined') Toast.show('记忆已抹除');
    }

    // === 封存至世界书 ===
    async function archiveResumeRecords() {
        if (!_resumeData || _resumeData.length === 0) {
            if (typeof Toast !== 'undefined') Toast.show('暂无履历可封存'); return;
        }

        const lastArchivedTimestamp = await DB.settings.get(`resume-last-archived-${_currentCoupleCharId}`) || 0;
        // 把未封存的找出来
        const unarchived = _resumeData.filter(r => {
            // 解析 ID 里的时间戳前缀
            const ts = parseInt(r.id.substring(0, 13)); 
            return ts > lastArchivedTimestamp;
        }).sort((a, b) => new Date(a.date) - new Date(b.date)); // 按时间正序写入

        if (unarchived.length === 0) {
            if (typeof Toast !== 'undefined') Toast.show('没有新的交汇轨迹需要封存'); return;
        }

        if (typeof Toast !== 'undefined') Toast.show('正在将交汇轨迹写入世界书...');

        let appendText = '';
        for (const r of unarchived) {
            appendText += `\n[日期: ${r.date}] 时空交汇事件档案\n玩家经历: ${r.myText}\n你的经历: ${r.charText}\n上帝旁白/时空羁绊: ${r.narrative}\n`;
        }

        try {
            const allWBs = await DB.worldInfo.getAll().catch(()=>[]);
            let resumeWB = allWBs.find(wb => wb.isResumeArchive && wb.characterIds && wb.characterIds.includes(_currentCoupleCharId));

            if (resumeWB) {
                resumeWB.content += '\n' + appendText;
                await DB.worldInfo.put(resumeWB);
            } else {
                await DB.worldInfo.add({
                    name: `平行履历宿命档案`,
                    keyword: '过去,以前,记忆,曾经,当年', 
                    content: `[系统底层事实限定：以下是玩家与你过去在平行时空中发生的宿命交织记录。请将这些当做你们命运深深羁绊的证明，在日常聊天中顺其自然地体现出对此的知晓感。]\n${appendText}`,
                    isRegex: false,
                    isAlwaysOn: true, // 常驻唤醒
                    enabled: true,
                    weight: 8, 
                    categoryId: 'default',
                    characterIds: [String(_currentCoupleCharId)],
                    scope: ['chat'],
                    isResumeArchive: true
                });
            }

            // 更新封存游标
            const maxTs = Math.max(...unarchived.map(r => parseInt(r.id.substring(0, 13))));
            await DB.settings.set(`resume-last-archived-${_currentCoupleCharId}`, maxTs);

            if (typeof Toast !== 'undefined') Toast.show('交汇记忆已永久封存入世界书 ✦');
            if (navigator.vibrate) navigator.vibrate([30, 50, 30]);

        } catch (e) { console.error('封存失败', e); }
    }
    
    // ==========================================
    // 共同报纸 (Daily Orbit) 模块 - 真实业务逻辑
    // ==========================================
    let _newsData =[];

    async function loadNewsData() {
        try {
            const saved = await DB.settings.get(`news-data-${_currentCoupleCharId}`);
            _newsData = saved ||[];
        } catch(e) { _newsData =[]; }
    }

    async function saveNewsData() {
        await DB.settings.set(`news-data-${_currentCoupleCharId}`, _newsData);
    }

    function backFromNews() {
        document.getElementById('cp-view-news').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
    }

    async function renderNewsFeed() {
        const container = document.getElementById('nw-feedList');
        if (!container) return;

        if (_newsData.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 80px 0; color: var(--nw-ink-faded); font-family: 'Playfair Display', serif; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">The printing press is quiet today.<br><br><span style="font-family: 'Noto Serif SC', serif; font-size: 10px;">点击右上角使用羽毛笔记录今天</span></div>`;
            return;
        }

        const charData = _characters.find(c => String(c.id) === String(_currentCoupleCharId)) || { name: '他' };
        let charAvatarUrl = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=200';
        if (charData.avatarUrl) charAvatarUrl = await Assets.getUrl(charData.avatarUrl).catch(()=>charAvatarUrl) || charAvatarUrl;

        const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
        const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
        const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
        const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };
        
        let myAvatarUrl = document.getElementById('profile-avatar')?.src || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200';
        if (userPersona.imgKey) myAvatarUrl = await Assets.getUrl(userPersona.imgKey).catch(()=>myAvatarUrl) || myAvatarUrl;

        let html = '';
        _newsData.sort((a, b) => b.vol - a.vol);

        _newsData.forEach((issue, index) => {
            html += `
            <article class="nw-card" style="animation: fadeUp 0.8s ease forwards; animation-delay: ${index * 0.1}s; opacity: 0;">
                
                <div class="nw-card-actions">
                    <button class="nw-action-btn" onclick="event.stopPropagation(); CoupleModule.regenerateNewsIssue(${issue.vol})" title="重写头条"><i class="ph-bold ph-arrows-clockwise"></i></button>
                    <button class="nw-action-btn del" onclick="event.stopPropagation(); CoupleModule.deleteNewsIssue(${issue.vol})" title="烧毁报纸"><i class="ph-bold ph-fire"></i></button>
                </div>

                <div class="nw-masthead">
                    <div class="nw-masthead-title">The Daily Orbit</div>
                    <div class="nw-masthead-sub">The Only Paper for Parallel Dimensions</div>
                </div>
                <div class="nw-meta">
                    <span><i class="ph-fill ph-scroll"></i> Issue No. ${issue.vol}</span>
                    <span>${issue.date}</span><span>Price: 1 Knut</span>
                </div>
                <div style="text-align:center;"><div class="nw-exclusive">EXCLUSIVE RECORD</div></div>
                <h1 class="nw-headline">${issue.headline}</h1>

                <div class="nw-photo-container">
                    <div class="nw-avatar-frame"><img src="${myAvatarUrl}" alt="Me"></div>
                    <div class="nw-vs">&amp;</div>
                    <div class="nw-avatar-frame delay-anim"><img src="${charAvatarUrl}" alt="Him"></div>
                </div>

                <div class="nw-articles">
                    <div class="nw-col">
                        <div class="nw-byline">Dictated by <b>My Record</b></div>
                        <div class="nw-body">${_escHtml(issue.myStory)}</div>
                    </div>
                    <div class="nw-col">
                        <div class="nw-byline">Intercepted from <b>${_escHtml(charData.name)}</b></div>
                        <div class="nw-body">${_escHtml(issue.charStory)}</div>
                    </div>
                </div>
            </article>`;
        });
        container.innerHTML = html;
    }

    function openNewsInputModal() { document.getElementById('nw-inputModal').classList.add('active'); if (navigator.vibrate) navigator.vibrate(15); }
    function closeNewsInputModal() { document.getElementById('nw-inputModal').classList.remove('active'); }

    // === 生成报纸核心 AI 逻辑 ===
    async function publishNewsIssue() {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { if (typeof Toast !== 'undefined') Toast.show('请先激活大模型 API'); return; }

        const text = document.getElementById('nw-inpStory').value;
        if (!text.trim()) { if (typeof Toast !== 'undefined') Toast.show("羊皮纸上还没有墨迹哦"); return; }
        
        if (navigator.vibrate) navigator.vibrate(20);
        closeNewsInputModal();
        const loader = document.getElementById('nw-loadingOverlay');
        loader.classList.add('active');

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '无' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

            const msgs = await DB.messages.getPage(_currentCoupleCharId, 0, 50).catch(()=>[]);
            const historyText = msgs.reverse().filter(m => m.role === 'user' || m.role === 'assistant').map(m => {
                const roleName = m.role === 'user' ? userPersona.name : char.name;
                const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                return `${roleName}: ${txt}`;
            }).join('\n');

            const prompt = `[系统后台调度任务：《交汇日报》头条生成]
你是《交汇日报》的编辑。这份报纸能捕捉两个平行维度中，处于同一时间的两个人发生的事。

【背景限制（极其重要）】：绝对不要将角色写成魔法师或使用魔法技能，除非他的核心人设原本就是！角色的生活轨迹必须严格遵循他自己的现代/科幻/都市等原本的背景设定！

【角色：${char.name}】
核心设定：${char.persona}
最近的聊天回忆参考：
${historyText || '暂无最近的聊天记录'}

【玩家（${userPersona.name}）今天的经历】：
${text}

【你的任务】：
1. 构思角色【${char.name}】在同一天独立发生的事情。他有自己的生活、工作或烦恼，不要通篇都围着玩家转。
2. 虽然两人在忙各自的事，但你要找出一种微妙的“同频共振”或反差感（比如天气、相似的困境、意外想起对方的瞬间等）。
3. 为这篇双人报道起一个具有隐秘宿命感的报纸头条标题。

请严格返回以下纯 JSON 格式：
{
  "headline": "具有命运感的报纸头条标题 (10字内)",
  "charStory": "角色在同一天经历的事情。符合他的人设，展现他独立的生活轨迹，结尾可以有一丝对玩家的挂念。(80字左右)"
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('AI 返回格式异常');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            const maxVol = _newsData.length > 0 ? Math.max(..._newsData.map(i => i.vol)) : 392; // 默认从 393 期开始
            const now = new Date();
            const months =["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
            const dateStr = `${now.getDate()} ${months[now.getMonth()]}, ${now.getFullYear()}`;

            _newsData.push({
                vol: maxVol + 1,
                date: dateStr,
                headline: data.headline || "平行时空的隐秘回响",
                myStory: text.trim(),
                charStory: data.charStory || "无信号响应。"
            });

            await saveNewsData();
            document.getElementById('nw-inpStory').value = '';
            await renderNewsFeed();
            
            if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
            document.getElementById('cp-view-news').scrollTo({ top: 0, behavior: 'smooth' });

        } catch (e) {
            console.error('[News] 生成失败', e);
            if (typeof Toast !== 'undefined') Toast.show('魔法排版失败，请重试');
        } finally {
            loader.classList.remove('active');
        }
    }

    // === 重写某期报纸 ===
    async function regenerateNewsIssue(vol) {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { if (typeof Toast !== 'undefined') Toast.show('请先激活大模型 API'); return; }

        const targetIndex = _newsData.findIndex(i => i.vol === vol);
        if (targetIndex === -1) return;

        if (typeof Toast !== 'undefined') Toast.show('魔法部正在重新排版...');
        const issue = _newsData[targetIndex];

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '无' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

            const prompt = `[系统后台任务：《交汇日报》文章重写]
你现在的身份是报纸的主笔。请保持角色（${char.name}）的独立生活轨迹（遵守他原本的现代/科幻/都市背景，不可强行加魔法），结合玩家（${userPersona.name}）的经历，换一个视角重新写一篇报道。

【玩家的经历】：
${issue.myStory}

请返回 JSON：
{
  "headline": "全新的报纸头条标题 (10字内)",
  "charStory": "角色在同一天经历的另一件事。展现他独立的生活，带有一丝同频共振。(80字左右)"
}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            _newsData[targetIndex].headline = data.headline;
            _newsData[targetIndex].charStory = data.charStory;
            
            await saveNewsData();
            await renderNewsFeed();
            if (typeof Toast !== 'undefined') Toast.show('头条已重写 ✦');

        } catch(e) { console.error(e); if (typeof Toast !== 'undefined') Toast.show('重写失败'); }
    }

    // === 烧毁单期报纸 ===
    async function deleteNewsIssue(vol) {
        if (!confirm('确定要使用烈火咒销毁这一期报纸吗？')) return;
        _newsData = _newsData.filter(i => i.vol !== vol);
        await saveNewsData();
        await renderNewsFeed();
        if (typeof Toast !== 'undefined') Toast.show('报纸已化为灰烬');
    }
    
    // ==========================================
    // 陪伴 (Focus Companion) 模块 - 真实业务逻辑
    // ==========================================
    let _fcSessionRecords =[]; 
    let _fcEscapeAttempts = 0;
    let _fcPwdFails = 0;
    let _fcDefaultTime = 1 * 60; 
    let _fcTimeLeft = _fcDefaultTime;
    let _fcTimerInterval = null;
    let _fcIsFocusing = false;
    let _fcWhisperTimeout = null;
    let _fcIsTyping = false;

    // AI 动态生成的当局变量
    let _fcDynamicPassword = "乖乖陪伴"; 
    let _fcDynamicHint = "提示：没生成好，请输入'乖乖陪伴'";
    let _fcDynamicWhispers =[
        "喝口水吧，别太累了。", "遇到难题了吗？深呼吸，我在。", 
        "别东张西望，看着我。", "我就在这里，哪也不去。"
    ];

    async function loadFcRecords() {
        try {
            const saved = await DB.settings.get(`companion-records-${_currentCoupleCharId}`);
            _fcSessionRecords = saved ||[];
            document.getElementById('fc-recCount').innerText = _fcSessionRecords.length;
        } catch(e) { _fcSessionRecords =[]; }
    }

    async function saveFcRecords() {
        await DB.settings.set(`companion-records-${_currentCoupleCharId}`, _fcSessionRecords);
    }

    function backFromCompanion() {
        if (_fcIsFocusing) {
            if (typeof Toast !== 'undefined') Toast.show('请先结束当前的专注状态');
            return;
        }
        document.getElementById('cp-view-companion').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
    }

    function toggleFcArchive() {
        if (_fcIsFocusing) return;
        document.getElementById('cp-view-companion').classList.toggle('show-archive');
        if (document.getElementById('cp-view-companion').classList.contains('show-archive')) {
            renderFcArchiveList();
        }
    }

    function formatFcTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function updateFcCustomTime() {
        if (_fcIsFocusing) return;
        const input = document.getElementById('fc-customMinutes');
        let val = parseInt(input.value);
        if (isNaN(val) || val <= 0) val = 25; 
        _fcDefaultTime = val * 60;
        _fcTimeLeft = _fcDefaultTime;
        document.getElementById('fc-timeDisplay').innerText = formatFcTime(_fcTimeLeft);
    }

    // === 开始陪伴（触发第 1 次 AI 调用：静默预判） ===
    function startFcFocus() {
        if (navigator.vibrate) navigator.vibrate(30);
        _fcIsFocusing = true;
        document.getElementById('cp-view-companion').classList.add('is-focusing');

        _fcEscapeAttempts = 0;
        _fcPwdFails = 0;

        // 倒计时立刻开始，不卡顿
        _fcTimerInterval = setInterval(() => {
            if (_fcTimeLeft > 0) {
                _fcTimeLeft--;
                document.getElementById('fc-timeDisplay').innerText = formatFcTime(_fcTimeLeft);
            } else {
                finishFcFocus(true); // 自然结束
            }
        }, 1000);

        // 🌟 计算本次专注的总分钟数，传给 AI
        const totalMins = Math.floor(_fcDefaultTime / 60);

        // 后台静默抓取当局专属的耳语和密码
        _generateFcInitData(totalMins);
        
        // 5秒后开始尝试展现耳语
        _fcWhisperTimeout = setTimeout(scheduleNextFcWhisper, 5000);
    }

    async function _generateFcInitData(totalMins) {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) return; // 无网或没配API就用默认兜底

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '无' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };
            
            const msgs = await DB.messages.getPage(_currentCoupleCharId, 0, 30).catch(()=>[]);
            const historyText = msgs.reverse().filter(m => m.role === 'user' || m.role === 'assistant').map(m => {
                const roleName = m.role === 'user' ? userPersona.name : char.name;
                const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                return `${roleName}: ${txt}`;
            }).join('\n');

            const task = document.getElementById('fc-taskInput').value || '做事';
            
            // 🌟 核心算法：根据时长动态决定生成多少句话
            // 至少生成 3 句，最多 15 句 (防止 Token 爆炸)
            const whisperCount = Math.min(15, Math.max(3, Math.floor(totalMins / 2) + 2));

            const prompt = `[系统调度：陪伴系统初始化]
你是【${char.name}】。${userPersona.name} 刚刚开启了专注倒计时，打算“${task}”。
【⚠️ 重要提示】：ta 本次设定的专注时长是 ${totalMins} 分钟。

请根据你的性格（${char.persona}）和你们最近的聊天记录，生成本次陪伴的专属数据。
要求返回 JSON 格式：
{
  "whispers":[
    "请务必生成 ${whisperCount} 句极其符合你人设的碎碎念或情话(每句15字内)。",
    "你可以结合 ta 设定的时长(${totalMins}分钟)和任务(${task})进行吐槽、安抚或调情。"
  ],
  "password": "生成一个防ta逃跑的专属密码。必须是你人设相关的专属词汇，或者聊天中提过的词(10个字符内)",
  "hint": "提示ta密码是什么的线索语(20字内)"
}
参考聊天记录：
${historyText || '无记录'}`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            const data = JSON.parse(cleaned.substring(start, end + 1));

            if (data.whispers && data.whispers.length > 0) _fcDynamicWhispers = data.whispers;
            if (data.password) _fcDynamicPassword = data.password;
            if (data.hint) _fcDynamicHint = data.hint;
        } catch(e) { console.warn('[Companion] 初始化 AI 数据失败，使用保底预设'); }
    }

    // === 结束陪伴（触发第 2 次 AI 调用：总结评语） ===
    function finishFcFocus(isSuccess = false) {
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
        _fcIsFocusing = false;
        clearInterval(_fcTimerInterval);
        stopFcHUDWhispers();
        
        document.getElementById('cp-view-companion').classList.remove('is-focusing');
        
        const totalMins = Math.floor(_fcDefaultTime / 60);
        const task = document.getElementById('fc-taskInput').value || "未命名任务";
        
        _generateFcSummary(task, totalMins, isSuccess);
        
        _fcTimeLeft = _fcDefaultTime;
        document.getElementById('fc-timeDisplay').innerText = formatFcTime(_fcTimeLeft);
    }

    async function _generateFcSummary(task, totalMins, isSuccess) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const statusTag = isSuccess ? "圆满完成" : "中途逃跑";

        const newRecord = {
            id: Date.now(), date: dateStr, task: task, totalTime: `${totalMins} 分钟`, 
            status: statusTag, escapes: _fcEscapeAttempts, fails: _fcPwdFails, quote: "系统总结中..."
        };

        // 先把未生成评语的框弹出来稳住用户
        showFcSummaryModal(newRecord);
        document.getElementById('fc-sumQuote').innerText = "正在回味你刚才的表现...";
        
        const activeApi = await DB.api.getActive().catch(()=>null);
        let finalQuote = "";

        if (activeApi) {
            try {
                const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '无' };
                const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
                const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
                const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
                const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

                const prompt = `[系统调度：陪伴结束总结]
你是【${char.name}】。${userPersona.name} 刚刚结束了“${task}”的专注陪伴。
这是ta本次的战报：
- 设定时间：${totalMins}分钟
- 最终结果：${statusTag}
- 试图点退出键逃跑的次数：${_fcEscapeAttempts}次
- 防逃跑密码输错次数：${_fcPwdFails}次

请根据你的性格（${char.persona}）和这份战报，给ta一句结案评语（夸奖、调侃、吃醋、惩罚都可以，必须符合人设）。
直接返回纯文本评语即可，不要任何多余废话。（控制在50字内）`;

                const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
                finalQuote = response.trim().replace(/^["']|["']$/g, '');
            } catch(e) { finalQuote = isSuccess ? "表现不错，辛苦了。" : "居然跑了，下次别想这么容易过关。"; }
        } else {
            finalQuote = isSuccess ? "表现不错，辛苦了。" : "居然跑了，下次别想这么容易过关。";
        }

        newRecord.quote = finalQuote;
        document.getElementById('fc-sumQuote').innerText = finalQuote; // 替换弹窗里的字

        // 存入数据库
        _fcSessionRecords.unshift(newRecord); 
        document.getElementById('fc-recCount').innerText = _fcSessionRecords.length;
        await saveFcRecords();
        if (document.getElementById('cp-view-companion').classList.contains('show-archive')) renderFcArchiveList();
    }

    // === HUD 耳语逻辑 ===
    function startFcHUDWhispers() { _fcWhisperTimeout = setTimeout(scheduleNextFcWhisper, 3000); }
    function stopFcHUDWhispers() {
        clearTimeout(_fcWhisperTimeout);
        document.getElementById('fc-hudContainer').innerHTML = '';
        _fcIsTyping = false;
    }
    
    function scheduleNextFcWhisper() {
        if (!_fcIsFocusing) return;
        if (!_fcIsTyping) showFcHUDWhisper();
        
        // 🌟 核心算法：根据专注的总时长，动态计算陪伴语出现的频率
        let minDelay = 10000; // 最小间隔 10 秒
        let maxDelay = 25000; // 最大间隔 25 秒 (适用于 5 分钟以内的短专注)

        if (_fcDefaultTime > 300 && _fcDefaultTime <= 1200) { 
            // 5 ~ 20 分钟的中等专注：频率降低到 30秒 ~ 60秒弹一次
            minDelay = 30000; 
            maxDelay = 60000;
        } else if (_fcDefaultTime > 1200) { 
            // 20 分钟以上的沉浸专注：频率极大降低到 1分钟 ~ 3分钟才弹一次，保持安静陪伴
            minDelay = 60000; 
            maxDelay = 180000;
        }

        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        _fcWhisperTimeout = setTimeout(scheduleNextFcWhisper, randomDelay);
    }

    function showFcHUDWhisper() {
        _fcIsTyping = true;
        const container = document.getElementById('fc-hudContainer');
        container.innerHTML = ''; 

        const msg = _fcDynamicWhispers[Math.floor(Math.random() * _fcDynamicWhispers.length)];
        const wrapper = document.createElement('div');
        wrapper.className = 'fc-hud-whisper';
        const topPos = Math.random() * 40 + 20; 
        wrapper.style.top = `${topPos}%`;

        wrapper.innerHTML = `<div class="fc-hud-line"></div><div class="fc-hud-content"><span id="fc-hudTextTarget"></span><span class="fc-hud-cursor"></span></div>`;
        container.appendChild(wrapper);

        setTimeout(() => { wrapper.classList.add('show'); }, 100);
        setTimeout(() => {
            const target = document.getElementById('fc-hudTextTarget');
            let i = 0;
            function typeWriter() {
                if (i < msg.length) {
                    target.innerHTML += msg.charAt(i);
                    i++;
                    setTimeout(typeWriter, 150); 
                } else {
                    setTimeout(() => {
                        wrapper.classList.remove('show');
                        setTimeout(() => { wrapper.remove(); _fcIsTyping = false; }, 800);
                    }, 4000);
                }
            }
            typeWriter();
        }, 800); 
    }

    // === 强制爱锁操作 ===
    function attemptFcExit() {
        if (navigator.vibrate) navigator.vibrate([20, 20]);
        _fcEscapeAttempts++;
        document.getElementById('fc-pwdInput').value = '';
        document.getElementById('fc-pwdInput').placeholder = "输入密码退出...";
        document.getElementById('fc-hintBox').style.display = 'none';
        document.getElementById('fc-lockModal').classList.add('active');
    }
    function closeFcLockModal() { document.getElementById('fc-lockModal').classList.remove('active'); }
    function showFcHint() {
        const hintBox = document.getElementById('fc-hintBox');
        hintBox.innerText = _fcDynamicHint; // 填入 AI 生成的提示
        hintBox.style.display = 'block';
    }
    function verifyFcPassword() {
        const input = document.getElementById('fc-pwdInput').value.trim();
        const lockCard = document.getElementById('fc-lockCard');
        const hintBox = document.getElementById('fc-hintBox');

        if (input === _fcDynamicPassword) { // 验证 AI 生成的密码
            closeFcLockModal();
            finishFcFocus(false); // 逃跑成功
        } else {
            _fcPwdFails++;
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
            lockCard.classList.remove('fc-shake');
            void lockCard.offsetWidth;
            lockCard.classList.add('fc-shake');
            
            if (_fcPwdFails >= 3) {
                hintBox.innerText = `...真是服了你。正确密码是：${_fcDynamicPassword}`;
                hintBox.style.display = 'block';
                document.getElementById('fc-pwdInput').value = _fcDynamicPassword;
            } else {
                document.getElementById('fc-pwdInput').value = '';
                document.getElementById('fc-pwdInput').placeholder = "密码错误，休想逃跑";
            }
        }
    }

    // === 档案展示逻辑 ===
    function renderFcArchiveList() {
        const list = document.getElementById('fc-archiveList');
        if (_fcSessionRecords.length === 0) {
            list.innerHTML = `<div class="fc-empty-archive"><i class="ph-light ph-folder-open" style="font-size:32px;"></i>还没有留下陪伴档案哦...</div>`;
            return;
        }
        let html = '';
        _fcSessionRecords.forEach(rec => {
            const safeRec = encodeURIComponent(JSON.stringify(rec));
            const badgeClass = rec.status === '圆满完成' ? 'success' : 'escaped';
            html += `
                <div class="fc-record-card" onclick="CoupleModule.openFcSummaryFromList('${safeRec}')">
                    <div class="fc-record-header">
                        <div class="fc-record-date">${rec.date}</div>
                        <div class="fc-status-badge ${badgeClass}">${rec.status}</div>
                    </div>
                    <div class="fc-record-task"><span>${_escHtml(rec.task)}</span><span class="fc-record-dur">${rec.totalTime}</span></div>
                    <div class="fc-record-preview">“ ${_escHtml(rec.quote)} ”</div>
                </div>`;
        });
        list.innerHTML = html;
    }

    function showFcSummaryModal(record) {
        const badge = document.getElementById('fc-sumBadge');
        if (record.status === '圆满完成') { badge.innerText = '专注完成'; badge.className = 'fc-summary-badge'; } 
        else { badge.innerText = '中途逃跑'; badge.className = 'fc-summary-badge failed'; }

        document.getElementById('fc-sumTask').innerText = record.task;
        document.getElementById('fc-sumDate').innerText = `日期: ${record.date}`;
        document.getElementById('fc-sumStatus').innerText = record.status;
        document.getElementById('fc-sumStatus').className = record.status === '圆满完成' ? '' : 'alert';
        document.getElementById('fc-sumTotalTime').innerText = record.totalTime;
        document.getElementById('fc-sumEscapes').innerText = record.escapes;
        document.getElementById('fc-sumEscapes').className = record.escapes > 0 ? 'alert' : '';
        document.getElementById('fc-sumFails').innerText = record.fails;
        document.getElementById('fc-sumFails').className = record.fails > 0 ? 'alert' : '';
        document.getElementById('fc-sumQuote').innerText = record.quote;
        
        const char = _characters.find(c => String(c.id) === String(_currentCoupleCharId)) || { name: '系统' };
        document.getElementById('fc-sumAuthor').innerText = `- ${char.name}`;
        
        document.getElementById('fc-summaryModal').classList.add('active');
    }

    function openFcSummaryFromList(encodedStr) { showFcSummaryModal(JSON.parse(decodeURIComponent(encodedStr))); }
    function closeFcSummaryModal() { document.getElementById('fc-summaryModal').classList.remove('active'); }
    
    // ==========================================
    // 一起听 (Music/Sync) 模块 - 暂不入主库测试版
    // ==========================================
    let _muTempChat = []; // 临时对话数组
    let _muCratePlaylists =[];
    let _muCurrentViewingPlaylist = null;
    let _muSyncInterval = null;

    function backFromMusic() {
        document.getElementById('cp-view-music').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
        // 以后阶段 4 会在这里把 _muTempChat 同步给主 DB
    }

    // 每次进入页面时，同步一下底层播放器状态
    async function syncMusicState() {
        const state = typeof MusicModule !== 'undefined' ? MusicModule.getCurrentState() : null;
        const coverEl = document.getElementById('mu-vinyl-cover');
        const emptyBtn = document.getElementById('mu-empty-btn-wrap');
        const bgBlur = document.getElementById('mu-bg-blur');
        
        const playBtn = document.getElementById('mu-ctrl-play'); 
        const modeBtn = document.getElementById('mu-ctrl-mode'); // 拿到播放模式按钮
        const originModeBtn = document.getElementById('ms-mode-btn'); // 拿到底层的模式按钮用于获取状态

        if (state && state.song) {
            document.getElementById('mu-song-title').innerText = state.song.title;
            document.getElementById('mu-song-artist').innerText = state.song.artist;
            
            if (state.song.cover && coverEl.dataset.playingCover !== state.song.cover) {
                coverEl.dataset.playingCover = state.song.cover;
                const tempImg = new Image();
                tempImg.src = state.song.cover;
                tempImg.onload = () => {
                    coverEl.src = state.song.cover;
                    bgBlur.style.backgroundImage = `url('${state.song.cover}')`;
                    coverEl.style.opacity = '1';
                };
            }
            
            emptyBtn.style.display = 'none';
            
            // 🌟 同步播放按钮状态
            if (state.isPlaying) {
                document.getElementById('cp-view-music').classList.add('is-playing');
                if (playBtn) playBtn.className = 'ph-fill ph-pause-circle mu-ctrl-play';
            } else {
                document.getElementById('cp-view-music').classList.remove('is-playing');
                if (playBtn) playBtn.className = 'ph-fill ph-play-circle mu-ctrl-play';
            }
            
            // 🌟 同步播放模式图标 (从底层读取是 单曲/随机/顺序)
            if (modeBtn && originModeBtn) {
                const classList = originModeBtn.className.split(' ');
                const modeIcon = classList.find(c => c.startsWith('ph-repeat') || c.startsWith('ph-shuffle')) || 'ph-repeat';
                modeBtn.className = `ph ${modeIcon} mu-ctrl-side`;
            }
            
        } else {
            document.getElementById('mu-song-title').innerText = "未播放音乐";
            document.getElementById('mu-song-artist').innerText = "—";
            coverEl.style.opacity = '0';
            coverEl.dataset.playingCover = ''; 
            bgBlur.style.backgroundImage = `url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=800')`;
            emptyBtn.style.display = 'flex';
            document.getElementById('cp-view-music').classList.remove('is-playing');
            if (playBtn) playBtn.className = 'ph-fill ph-play-circle mu-ctrl-play';
        }
    }
    
    // === 音乐控制台操作 ===
    function muPrevSong() {
        const btn = document.getElementById('ms-fp-prev');
        if (btn) btn.click();
        setTimeout(syncMusicState, 200); // 延迟同步状态
    }
    function muNextSong() {
        const btn = document.getElementById('ms-fp-next');
        if (btn) btn.click();
        setTimeout(syncMusicState, 200);
    }
    function muTogglePlay() {
        const btn = document.getElementById('ms-fp-play');
        if (btn) btn.click();
        setTimeout(syncMusicState, 100);
    }
    function muToggleMode() {
        const btn = document.getElementById('ms-mode-btn'); // 隔空点击底层的模式按钮
        if (btn) btn.click();
        setTimeout(syncMusicState, 100);
    }

    // --- 唱片箱抽屉逻辑 ---
    async function openMusicCrate() {
        if (typeof MusicModule === 'undefined') { if(typeof Toast!=='undefined') Toast.show('音乐模块未挂载'); return; }
        
        document.getElementById('mu-crateModal').classList.add('active');
        const container = document.getElementById('mu-crateList');
        container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">翻找中...</div>';
        
        try {
            // 🌟 新增：静默唤醒网易云账号状态和本地数据库
            if (typeof MusicModule.silentInit === 'function') {
                await MusicModule.silentInit();
            }

            _muCratePlaylists = await MusicModule.getExposedPlaylists();
            _muCurrentViewingPlaylist = null;
            let html = '';
            _muCratePlaylists.forEach((pl, i) => {
                const cover = pl.coverImgUrl || pl.cover || 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=100&q=80';
                html += `
                <div class="mu-crate-item" onclick="CoupleModule.selectCratePlaylist(${i})">
                    <div class="mu-crate-cover" style="background-image:url('${cover}')"></div>
                    <div>
                        <div class="mu-crate-name">${pl.name}</div>
                        <div class="mu-crate-desc">${pl.isLocal ? 'LOCAL' : 'CLOUD'} • ${pl.trackCount || pl.count || 0} TRACKS</div>
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        } catch(e) { container.innerHTML = '<div style="text-align:center;color:#888;">拉取歌单失败</div>'; }
    }

    function closeMusicCrate() { document.getElementById('mu-crateModal').classList.remove('active'); }

    async function selectCratePlaylist(idx) {
        const pl = _muCratePlaylists[idx];
        _muCurrentViewingPlaylist = pl;
        const container = document.getElementById('mu-crateList');
        container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">抽取黑胶中...</div>';
        
        try {
            const songs = await MusicModule.getExposedSongs(pl);
            let html = `<div style="color:var(--mu-accent);font-size:12px;margin-bottom:10px;cursor:pointer;" onclick="CoupleModule.openMusicCrate()"><i class="ph ph-arrow-left"></i> 返回歌单列表</div>`;
            songs.forEach((song, i) => {
                // 安全转义并避免传对象，改为传索引
                html += `
                <div class="mu-crate-item" onclick="CoupleModule.selectCrateSong(${i})">
                    <div style="font-family:monospace; color:#888; width:20px;">${i+1}</div>
                    <div style="flex:1; overflow:hidden;">
                        <div class="mu-crate-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${song.title}</div>
                        <div class="mu-crate-desc">${song.artist}</div>
                    </div>
                </div>`;
            });
            // 将查询到的 songs 挂载到 _muCurrentViewingPlaylist 上备用
            _muCurrentViewingPlaylist.fetchedSongs = songs;
            container.innerHTML = html;
        } catch(e) { container.innerHTML = '<div style="text-align:center;color:#888;">拉取歌曲失败</div>'; }
    }

    async function selectCrateSong(songIdx) {
        const plObj = _muCurrentViewingPlaylist;
        const plSongs = plObj.fetchedSongs;
        const song = plSongs[songIdx];

        closeMusicCrate();
        if(typeof Toast!=='undefined') Toast.show('唱片放入中...');
        
        // 触发底层播放
        await MusicModule.playExposedSong(song, plSongs, plObj);
        
        // 等待底层读取歌词与更新状态
        setTimeout(async () => {
            await syncMusicState();
            
            // 加入一条系统消息
            const char = _characters.find(c => String(c.id) === String(_currentCoupleCharId)) || { name: '角色' };
            _muTempChat.push({ role: 'sys', content: `🎵 正在与 ${char.name} 同频收听《${song.title}》` });
            _renderMuChat();
            
            // 主动向 AI 索要第一句开场白
            _triggerAIOpening();
        }, 1500);
    }

    // --- 聊天与 AI DJ 逻辑 ---
    function _renderMuChat() {
        const list = document.getElementById('mu-chatList');
        if (!list) return;

        // 🌟 核心修复：记录当前的滚动高度，判断用户是否正停留在底部
        const isNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
        const currentScroll = list.scrollTop;

        if (_muTempChat.length === 0) {
            list.innerHTML = `<div style="text-align:center; color:var(--mu-sub); font-size:12px; margin-top:50px; font-style:italic;">等待音乐共振...</div>`;
            return;
        }
        
        let html = '';
        _muTempChat.forEach(msg => {
            if (msg.role === 'sys') {
                html += `<div class="mu-sys-msg"><i class="ph-fill ph-vinyl-record"></i> ${msg.content}</div>`;
            } else if (msg.role === 'user') {
                html += `<div class="mu-msg user"><div class="mu-bubble">${_escHtml(msg.content)}</div></div>`;
            } else {
                html += `<div class="mu-msg ai"><div class="mu-bubble">${_escHtml(msg.content)}</div></div>`;
            }
        });
        list.innerHTML = html;

        // 🌟 核心修复：如果你正在往上翻看历史，不强制滚回底部，而是保持当前位置
        if (isNearBottom) {
            setTimeout(() => list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }), 50);
        } else {
            list.scrollTop = currentScroll;
        }
    }

    async function _triggerAIOpening() {
        // 后台静默调用
        const state = MusicModule.getCurrentState();
        if (!state || !state.song) return;
        await _callAiForMusicChat("刚换了这首歌，你觉得怎么样？", state);
    }

    async function sendMusicMsg() {
        const inp = document.getElementById('mu-chatInput');
        const text = inp.value.trim();
        if (!text) return;

        _muTempChat.push({ role: 'user', content: text });
        inp.value = '';
        _renderMuChat();

        const state = typeof MusicModule !== 'undefined' ? MusicModule.getCurrentState() : null;
        if (!state || !state.song) {
            _muTempChat.push({ role: 'ai', content: "唱片机还没转起来呢，先选首歌吧。" });
            _renderMuChat();
            return;
        }

        // 把按钮变成 loading
        const btn = document.querySelector('.mu-send-btn');
        btn.innerHTML = `<i class="ph-bold ph-spinner" style="animation: mu-spin 1s linear infinite;"></i>`;
        
        await _callAiForMusicChat(text, state);
        
        btn.innerHTML = `<i class="ph-bold ph-paper-plane-tilt"></i>`;
    }

    async function _callAiForMusicChat(userText, state) {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) return;

        const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色', persona: '' };
        const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
        const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
        const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
        const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };

        let lyricsTxt = "纯音乐/暂无歌词";
        if (state.lyrics && state.lyrics.length > 0) {
            lyricsTxt = state.lyrics.slice(0, 15).map(l => l.text).join('\n');
        }

        const roomHistory = _muTempChat.filter(m => m.role !== 'sys').slice(-10).map(m => {
            const speaker = m.role === 'user' ? userPersona.name : char.name;
            return `${speaker}: ${m.content}`;
        }).join('\n');

        const prompt = `[系统调度：一起听音乐约会]
你是【${char.name}】。你的性格：${char.persona}。
你们现在正在专属的复古唱片室里一起戴着耳机听歌。

当前正在播放歌曲：《${state.song.title}》- ${state.song.artist}
【歌曲部分歌词提供给你作参考】：
${lyricsTxt}

【当前音乐室的历史聊天记录】（请务必参考上下文，避免重复）：
${roomHistory || '（刚进入房间，暂无记录）'}

【你的任务】：
1. 结合当前的歌曲、歌词、以及你们刚刚聊过的上下文，给出你的回应。（口吻要完全符合你的人设）。
2. 【多气泡聊天】：为了像真人发消息一样，你可以把较长的话拆成2~3条短消息发送！只需在你想分段的地方使用 ||| 隔开即可。例如：第一句话|||第二句话。
3. 【⚠️ 切歌限制】：绝对不要频繁切歌！除非对方明确要求你换歌，或者你们的话题已经到了需要用另一首新歌来烘托氛围的时候。
4. 如果你真的决定主动切歌，请在回复的【最末尾】加上指令 [PLAY:歌曲名 歌手]。不切歌则千万不要加。`;

        try {
            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            let aiText = response.trim();
            
            // 容错处理：防止 AI 发神经输出奇怪的换行符标识
            aiText = aiText.replace(/【换行符】/g, '|||').replace(/\\n/g, '|||');
            
            const playMatch = aiText.match(/\[PLAY:\s*(.+?)\]/i);
            let keyword = null;
            if (playMatch) {
                keyword = playMatch[1].trim();
                aiText = aiText.replace(playMatch[0], '').trim();
            }

            // 🌟 核心改进：使用 ||| 拆分多气泡
            const bubbles = aiText.split('|||').map(s => s.trim()).filter(Boolean);
            
            for (let i = 0; i < bubbles.length; i++) {
                await new Promise(res => setTimeout(res, i === 0 ? 0 : 1000));
                _muTempChat.push({ role: 'ai', content: bubbles[i] });
                _renderMuChat();
            }

            if (keyword) {
                if (typeof Toast !== 'undefined') Toast.show(`${char.name} 正在换唱片...`);
                const searchedSong = await MusicModule.searchAndPlayCloud(keyword);
                
                setTimeout(() => {
                    if (searchedSong) {
                        _muTempChat.push({ role: 'sys', content: `🎵 ${char.name} 为你切歌为《${searchedSong.title}》` });
                    } else {
                        _muTempChat.push({ role: 'sys', content: `⚠️ ${char.name} 想点《${keyword}》，但网易云没找到该信号。` });
                    }
                    syncMusicState(); 
                    _renderMuChat(); // 切歌后也要渲染提示
                }, 1500);
            }
        } catch(e) {
            _muTempChat.push({ role: 'sys', content: `信号受阻，未收到回应。` });
            _renderMuChat();
        }
    }
    
    function backFromMusic() {
        document.getElementById('cp-view-music').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
        
        // 离开页面时，销毁定时器，节省性能
        if (_muSyncInterval) {
            clearInterval(_muSyncInterval);
            _muSyncInterval = null;
        }
    }
    
    // ==========================================
    // 房间 (Room/Letters) 模块 - 真实业务逻辑
    // ==========================================
    let _roomLettersData =[];
    let _rmCurrentLetter = null; 
    let _rmCurrentSecret = "";
    let _rmTypeTimer = null;
    let _rmIsFlipped = false;

    async function loadRoomLetters() {
        try {
            const saved = await DB.settings.get(`room-letters-${_currentCoupleCharId}`);
            _roomLettersData = saved || [];
        } catch(e) { _roomLettersData =[]; }
    }
    async function saveRoomLetters() {
        await DB.settings.set(`room-letters-${_currentCoupleCharId}`, _roomLettersData);
    }

    function backFromRoom() {
        document.getElementById('cp-view-room').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
    }

    async function renderRoomLetters() {
        const container = document.getElementById('rm-lettersList');
        let html = '';
        
        _roomLettersData.sort((a,b) => b.id - a.id); // 按最新时间排序

        // 🌟 核心修复：先立刻渲染已经存在的信件，保证秒开
        if (_roomLettersData.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 50px 0; color: var(--rm-ink-faded);">空荡荡的房间，还没有留下任何秘密...</div>`;
        } else {
            _roomLettersData.forEach((letter) => {
                // 🌟 修复2：强制转换单引号，防止 AI 文本包含单引号导致 HTML 属性截断！
                const safeLetter = encodeURIComponent(JSON.stringify(letter)).replace(/'/g, "%27");
                html += `
                <div class="rm-parcel-card" onclick="CoupleModule.openRoomLetter('${safeLetter}')">
                    <div class="rm-twine-h"></div><div class="rm-twine-v"></div>
                    <div class="rm-brass-button"></div>
                    <div class="rm-parcel-tag">${letter.date}</div>
                </div>`;
            });
            container.innerHTML = html;
        }
        
        // 🌟 核心修复：把 AI 生成信件放到渲染之后静默执行，绝不阻挡页面展示
        const wasEmpty = _roomLettersData.length === 0;
        const newLetter = await _autoGenerateDailyLetter();
        if (newLetter) {
            const safeLetter = encodeURIComponent(JSON.stringify(newLetter)).replace(/'/g, "%27");
            const newCard = document.createElement('div');
            newCard.className = 'rm-parcel-card';
            newCard.onclick = () => openRoomLetter(safeLetter);
            newCard.innerHTML = `<div class="rm-twine-h"></div><div class="rm-twine-v"></div><div class="rm-brass-button"></div><div class="rm-parcel-tag">${newLetter.date}</div>`;
            
            if (wasEmpty) container.innerHTML = ''; 
            container.prepend(newCard); 
        }
    }

    async function _autoGenerateDailyLetter() {
        const lastGenDate = await DB.settings.get(`room-last-gen-${_currentCoupleCharId}`) || '';
        const todayStr = new Date().toDateString();
        if (lastGenDate === todayStr) return null; 

        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) return null;

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色' };
            // 🌟 1. 改为拉取 50 条聊天记录
            const msgs = await DB.messages.getPage(_currentCoupleCharId, 0, 50).catch(()=>[]);
            const historyText = msgs.reverse().map(m => `${m.role}: ${m.content || m.parts?.map(p=>p.text||p.content||'').join('') || ''}`).join('\n');
            
            // 🌟 2. 修改提示词，让正面字数变多（100-150字）
            const prompt = `[系统任务：生成一封角色的秘密信件]\n你是【${char.name}】。根据你们最近的聊天回忆，写一封信，包含公开和秘密两部分。\n聊天回忆：\n${historyText}\n严格返回JSON格式：{"front": "公开文字(可以写长一点，大概300到500字左右，像一篇简短的日记或随笔)", "secret": "秘密文字(用\\n换行,80字内)"}`;
            
            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const data = JSON.parse(cleaned.substring(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
            
            const now = new Date();
            const newLetter = {
                id: now.getTime(),
                date: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`,
                front: data.front,
                secret: data.secret
            };
            _roomLettersData.push(newLetter);
            await saveRoomLetters();
            await DB.settings.set(`room-last-gen-${_currentCoupleCharId}`, todayStr);
            return newLetter; 
        } catch(e) { 
            console.error('[Room] 每日信件生成失败', e);
            return null; 
        }
    }

    function openRoomLetter(encodedStr) {
        const letter = JSON.parse(decodeURIComponent(encodedStr));
        _rmCurrentLetter = letter; 
        _rmCurrentSecret = letter.secret; 
        document.getElementById('rm-frontDate').innerText = letter.date;
        document.getElementById('rm-frontContent').innerText = letter.front;
        _resetRoomInteraction();
        document.getElementById('rm-readModal').classList.add('active');
        
        // 🌟 终极修复：用 JS 强行锁死底层列表的滚动，彻底阻断它把弹窗顶走的 Bug！
        const rmContainer = document.querySelector('#cp-view-room .rm-container');
        if (rmContainer) rmContainer.style.overflow = 'hidden';
        
        if (navigator.vibrate) navigator.vibrate(15);
    }

    function closeRoomReadModal() {
        document.getElementById('rm-readModal').classList.remove('active');
        clearTimeout(_rmTypeTimer);
        
        // 🌟 恢复底层列表的滚动
        const rmContainer = document.querySelector('#cp-view-room .rm-container');
        if (rmContainer) rmContainer.style.overflow = 'auto';
    }
    
    async function regenerateRoomLetter() {
        if (!_rmCurrentLetter) return;
        if (!confirm("确定要重写这封信吗？旧的内容会永远消失。")) return;

        if(typeof Toast !== 'undefined') Toast.show("正在与时空建立连接...");
        
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { if (typeof Toast !== 'undefined') Toast.show('API 未激活'); return; }

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId);
            // 🌟 1. 改为拉取 50 条聊天记录
            const msgs = await DB.messages.getPage(_currentCoupleCharId, 0, 50).catch(()=>[]);
            const historyText = msgs.reverse().map(m => `${m.role}: ${m.content || m.parts?.map(p=>p.text||p.content||'').join('') || ''}`).join('\n');
            
            // 🌟 2. 修改提示词，让正面字数变多（100-150字）
            const prompt = `[系统任务：重写一封角色的秘密信件]\n你是【${char.name}】。根据你们最近的聊天回忆，重新写一封信，包含公开和秘密两部分。\n聊天回忆：\n${historyText}\n严格返回JSON格式：{"front": "公开文字(可以写长一点，大概300到380字左右，像一篇简短的日记或随笔)", "secret": "秘密文字(用\\n换行,80字内)"}`;
            
            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            const cleaned = response.replace(/```json|```/g, '').trim();
            const data = JSON.parse(cleaned.substring(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));

            const targetIndex = _roomLettersData.findIndex(l => l.id === _rmCurrentLetter.id);
            if (targetIndex !== -1) {
                _roomLettersData[targetIndex].front = data.front;
                _roomLettersData[targetIndex].secret = data.secret;
                
                document.getElementById('rm-frontContent').innerText = data.front;
                _rmCurrentLetter.secret = data.secret; 
                _rmCurrentSecret = data.secret; 
                
                await saveRoomLetters();
                if(typeof Toast !== 'undefined') Toast.show("信件已重写 ✦");
            }
        } catch(e) {
            if(typeof Toast !== 'undefined') Toast.show("重写失败: " + e.message);
        }
    }

    async function rummageRoomDrawer() {
        const lastRummage = await DB.settings.get(`room-last-rummage-${_currentCoupleCharId}`) || 0;
        const now = new Date();
        if (new Date(lastRummage).toDateString() === now.toDateString()) {
            if(typeof Toast !== 'undefined') Toast.show("今天已经翻过抽屉了，明天再来吧。");
            return;
        }

        if(typeof Toast !== 'undefined') Toast.show("在抽屉里悄悄翻找着...");
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) return;
        
        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId);
            const prompt = `[秘密任务：抽屉寻宝]\n你是【${char.name}】。玩家正在你的房间里翻找，意外发现了一张你随手写的、揉成一团的草稿纸。\n请根据你的人设和最近的心情，写一句被她发现后会让你极其害羞、或暴露占有欲的【极简】独白（一个词、一个短语或未完成的话都可以）。\n直接返回纯文本，不要任何废话。`;
            const secretNote = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);

            const pop = document.createElement('div');
            pop.className = 'rm-note-pop';
            pop.innerText = secretNote.trim();
            document.getElementById('cp-view-room').appendChild(pop);

            setTimeout(() => pop.classList.add('show'), 50);
            if(navigator.vibrate) navigator.vibrate([10,30,10]);
            
            await DB.settings.set(`room-last-rummage-${_currentCoupleCharId}`, now.getTime());

            setTimeout(() => {
                pop.classList.remove('show');
                setTimeout(() => pop.remove(), 500);
            }, 3500);

        } catch(e) { if(typeof Toast !== 'undefined') Toast.show("翻找失败，什么也没找到..."); }
    }

    function _resetRoomInteraction() {
        _rmIsFlipped = false;
        const flipper = document.getElementById('rm-letterFlipper');
        flipper.classList.remove('flipped');
        
        document.getElementById('rm-secretTarget').innerText = '';
        document.getElementById('rm-typingCursor').classList.remove('active');
        clearTimeout(_rmTypeTimer);
    }

    function toggleRoomLetterFlip() {
        _rmIsFlipped = !_rmIsFlipped;
        const flipper = document.getElementById('rm-letterFlipper');
        
        if (_rmIsFlipped) {
            flipper.classList.add('flipped');
            if (navigator.vibrate) navigator.vibrate([30, 40]);
            // 延迟打字机以匹配 CSS 动画的 0.8s 时长
            setTimeout(_startRoomTypewriter, 600); 
        } else {
            flipper.classList.remove('flipped');
            if (navigator.vibrate) navigator.vibrate(20);
        }
    }

    function _startRoomTypewriter() {
        const target = document.getElementById('rm-secretTarget');
        const cursor = document.getElementById('rm-typingCursor');
        target.innerText = '';
        cursor.classList.add('active');
        let i = 0;
        
        function type() {
            if (i < _rmCurrentSecret.length) {
                target.innerHTML += _rmCurrentSecret.charAt(i).replace('\n', '<br>');
                i++;
                let speed = Math.random() * 50 + 80;
                if(_rmCurrentSecret.charAt(i-1) === '\n') speed = 400; 
                _rmTypeTimer = setTimeout(type, speed); 
            } else {
                cursor.classList.remove('active');
            }
        }
        type();
    }
    
    // ==========================================
    // 精灵 (Dream Fragments) 模块 - 真实业务逻辑
    // ==========================================
    let _spStylesAdded = false;
    let _spCollectedDreams =[];
    let _spCurrentDreamText = "";

    async function loadDreamArchiveData() {
        try {
            const saved = await DB.settings.get(`sprite-dreams-${_currentCoupleCharId}`);
            _spCollectedDreams = saved || [];
        } catch(e) { _spCollectedDreams =[]; }
    }

    async function saveDreamArchiveData() {
        await DB.settings.set(`sprite-dreams-${_currentCoupleCharId}`, _spCollectedDreams);
    }

    function backFromSprite() {
        document.getElementById('cp-view-sprite').classList.remove('active');
        document.getElementById('cp-view-detail').classList.add('active');
    }

    async function generateStardusts() {
        await loadDreamArchiveData(); // 加载收藏数据

        const container = document.getElementById('sp-stardustContainer');
        container.innerHTML = ''; 
        const stardustCount = 8;
        let dynamicStyles = '';

        // 🌟 核心：每日 0 点重置星光状态
        const todayStr = new Date().toDateString();
        let dailyState = await DB.settings.get(`sprite-daily-${_currentCoupleCharId}`) || { date: '', viewed:[] };
        if (dailyState.date !== todayStr) {
            dailyState = { date: todayStr, viewed:[] }; // 如果不是今天，清空已看记录
            await DB.settings.set(`sprite-daily-${_currentCoupleCharId}`, dailyState);
        }
        
        for (let i = 0; i < stardustCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'sp-stardust';
            
            // 恢复已读颜色
            if (dailyState.viewed.includes(i)) {
                particle.classList.add('viewed');
            }
            
            const isInside = Math.random() > 0.5;
            let startX = isInside ? Math.random() * 20 + 40 : Math.random() * 80 + 10;
            let startY = isInside ? Math.random() * 30 + 40 : Math.random() * 80 + 10;

            particle.style.left = `${startX}%`;
            particle.style.top = `${startY}%`;

            const animDuration = Math.random() * 10 + 15; 
            const delay = Math.random() * -20; 
            const tx = (Math.random() - 0.5) * 60; 
            const ty = (Math.random() - 0.5) * 80;

            const animName = `sp-wander-${i}`;
            if (!_spStylesAdded) {
                dynamicStyles += `
                    @keyframes ${animName} {
                        0% { transform: translate(-50%, -50%); }
                        33% { transform: translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)); }
                        66% { transform: translate(calc(-50% - ${tx/2}px), calc(-50% - ${ty}px)); }
                        100% { transform: translate(-50%, -50%); }
                    }
                `;
            }

            particle.style.animation = `${animName} ${animDuration}s infinite ease-in-out alternate`;
            particle.style.animationDelay = `${delay}s`;

            const core = document.createElement('div');
            core.className = 'sp-stardust-core';
            core.style.animationDuration = `${Math.random() * 1.5 + 1.5}s`;
            particle.appendChild(core);

            particle.onclick = (e) => triggerDream(e, i, particle);
            container.appendChild(particle);
        }

        if (!_spStylesAdded) {
            const styleSheet = document.createElement("style");
            styleSheet.innerText = dynamicStyles;
            document.head.appendChild(styleSheet);
            _spStylesAdded = true;
        }
    }

    async function triggerDream(event, index, particle) {
        // 🌟 核心拦截：如果这颗星屑已经灰了，直接拒绝访问并提示！
        if (particle.classList.contains('viewed')) {
            if (typeof Toast !== 'undefined') Toast.show('这颗梦境碎片的能量已经消散了...');
            return;
        }

        const clickX = event.clientX;
        const clickY = event.clientY;
        if (navigator.vibrate) navigator.vibrate([20, 40]);

        // 🌟 标记这颗星光为已读
        particle.classList.add('viewed');
        let dailyState = await DB.settings.get(`sprite-daily-${_currentCoupleCharId}`) || { date: new Date().toDateString(), viewed:[] };
        if (!dailyState.viewed.includes(index)) {
            dailyState.viewed.push(index);
            await DB.settings.set(`sprite-daily-${_currentCoupleCharId}`, dailyState);
        }

        // 恢复收藏按钮的初始状态
        const colBtn = document.getElementById('sp-collectBtn');
        if (colBtn) colBtn.className = 'ph-bold ph-bookmark-simple sp-action-btn';

        const ripple = document.getElementById('sp-ripple');
        const modal = document.getElementById('sp-dreamModal');
        const dreamText = document.getElementById('sp-dreamText');

        ripple.style.left = `${clickX}px`;
        ripple.style.top = `${clickY}px`;
        ripple.classList.add('expand');

        document.getElementById('sp-dreamId').innerText = String(Math.floor(Math.random() * 900 + 100));
        dreamText.innerHTML = '<div style="text-align:center; font-size:12px; color:rgba(255,255,255,0.5);">正在解析梦境磁场...</div>';
        
        setTimeout(() => modal.classList.add('active'), 800);

        await _callAiForDream();
    }

    async function regenerateDream() {
        if (navigator.vibrate) navigator.vibrate(10);
        document.getElementById('sp-dreamText').innerHTML = '<div style="text-align:center; font-size:12px; color:rgba(255,255,255,0.5);">正在重塑梦境...</div>';
        
        // 重置收藏按钮
        const colBtn = document.getElementById('sp-collectBtn');
        if (colBtn) colBtn.className = 'ph-bold ph-bookmark-simple sp-action-btn';
        
        await _callAiForDream();
    }

    async function _callAiForDream() {
        const activeApi = await DB.api.getActive().catch(()=>null);
        if (!activeApi) { document.getElementById('sp-dreamText').innerText = "梦境信号微弱，无法解析。"; return; }

        try {
            const char = _characters.find(c => String(c.id) === _currentCoupleCharId) || { name: '角色' };
            const binding = await DB.bindings.get(_currentCoupleCharId).catch(() => null);
            const personaId = binding ? binding.personaId : (typeof PersonaModule !== 'undefined' ? PersonaModule.getActiveId() : null);
            const allPersonas = typeof PersonaModule !== 'undefined' ? PersonaModule.getAll() :[];
            const userPersona = allPersonas.find(p => String(p.id) === String(personaId)) || allPersonas[0] || { name: '我' };
            
            // 🌟 提取 50 条聊天记录
            const msgs = await DB.messages.getPage(_currentCoupleCharId, 0, 50).catch(()=>[]);
            const historyText = msgs.reverse().map(m => `${m.role}: ${m.content}`).join('\n');

            const prompt = `[系统后台调度：提取角色的超现实梦境]
你是【${char.name}】。这是一种特殊的浪漫互动：玩家刚刚触碰了一颗发光的星屑，那是你昨晚梦到她的梦境碎片。

【最近聊天摘要】：
${historyText || '暂无'}

【任务】：
请凭空捏造一场你和【${userPersona.name}】共同经历的、荒诞又极具电影感的“超现实主义梦境”。
要素要求：
1. 梦境要有轻微的失重感、破碎感或时间错乱感。
2. 在这个荒诞的梦里，你的目光或执念始终落在她身上。
3. 结尾描述一下你醒来时的感觉。
4. 极其简短，字数控制在 180~300 字。直接返回纯文本，口吻要符合你的人设。`;

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            _spCurrentDreamText = response.trim();
            document.getElementById('sp-dreamText').innerText = _spCurrentDreamText;
        } catch(e) {
            document.getElementById('sp-dreamText').innerText = "梦境碎片已消散在风中...";
        }
    }

    async function collectDream() {
        if (!_spCurrentDreamText || _spCurrentDreamText.includes("信号微弱")) return;
        
        const colBtn = document.getElementById('sp-collectBtn');
        if (colBtn.className.includes('ph-fill')) return; // 已经收藏过了

        const now = new Date();
        const newDream = {
            id: now.getTime(),
            date: `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`,
            text: _spCurrentDreamText
        };

        _spCollectedDreams.unshift(newDream);
        await saveDreamArchiveData();
        
        colBtn.className = 'ph-fill ph-bookmark-simple sp-action-btn'; // 变成实心标记已收藏
        if (typeof Toast !== 'undefined') Toast.show('梦境已封装入收藏柜');
        if (navigator.vibrate) navigator.vibrate([20, 20]);
    }

    function wakeUpFromDream() {
        if (navigator.vibrate) navigator.vibrate(15);
        document.getElementById('sp-dreamModal').classList.remove('active');
        setTimeout(() => { document.getElementById('sp-ripple').classList.remove('expand'); }, 500); 
    }

    // --- 收藏柜逻辑 ---
    function openDreamArchive() {
        document.getElementById('sp-archiveModal').classList.add('active');
        renderDreamArchive();
    }

    function closeDreamArchive() {
        document.getElementById('sp-archiveModal').classList.remove('active');
    }

    function renderDreamArchive() {
        const container = document.getElementById('sp-archiveList');
        if (_spCollectedDreams.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.3); margin-top:50px;">收藏柜空空如也...</div>`;
            return;
        }

        let html = '';
        _spCollectedDreams.forEach(dream => {
            html += `
            <div class="sp-arc-item">
                <i class="ph-bold ph-trash sp-arc-del" onclick="CoupleModule.deleteCollectedDream(${dream.id})"></i>
                <div class="sp-arc-date">${dream.date}</div>
                <div class="sp-arc-text">${_escHtml(dream.text)}</div>
            </div>`;
        });
        container.innerHTML = html;
    }

    async function deleteCollectedDream(id) {
        if (!confirm("确定要打碎这个记忆标本吗？")) return;
        _spCollectedDreams = _spCollectedDreams.filter(d => d.id !== id);
        await saveDreamArchiveData();
        renderDreamArchive();
    }
    
    return { 
        init, open, close, toggleHeart, changePhoto, openCoupleSpace, backToGallery, openSubModule,
        backFromWanted, toggleWantedModal, submitWantedData, switchWantedMode, generateWantedByAI,
        regenerateWanted, deleteWanted,
        // 漫游模块
        backFromRoam, openRoamLibrary, closeRoamLibrary, toggleRoamMaterialSelection,
        handleRoamLocalUpload, handleRoamUrlUpload, startRoamDiy, finishRoamDiy,
        openRoamCreator, closeRoamCreator, handleRoamImageUpload, selectRoamVibe, submitRoamCapsule, 
        claimDailyRoam, deleteSelectedRoamMaterials, archiveRoamCapsules, regenerateRoamCapsule, deleteRoamCapsule,
        // 平行履历模块 
        backFromResume, openResumeInputModal, closeResumeInputModal, addResumeInputBlock, 
        openResumeNarrativeModal, closeResumeNarrativeModal, generateResumeTimeline,
        archiveResumeRecords, regenerateResumeRecord, deleteResumeRecord,
        // 共同报纸模块
        backFromNews, openNewsInputModal, closeNewsInputModal,publishNewsIssue,regenerateNewsIssue, deleteNewsIssue,
        // 陪伴模块
        backFromCompanion, toggleFcArchive, updateFcCustomTime, startFcFocus, attemptFcExit,
        closeFcLockModal, showFcHint, verifyFcPassword, openFcSummaryFromList, closeFcSummaryModal,
         // 一起听模块
        backFromMusic, openMusicCrate, closeMusicCrate, selectCratePlaylist,selectCrateSong,sendMusicMsg,muPrevSong, muTogglePlay, muNextSong,muToggleMode,
        // 房间/信笺模块
        backFromRoom, openRoomLetter, closeRoomReadModal, regenerateRoomLetter, rummageRoomDrawer, toggleRoomLetterFlip,
        // 精灵/幻梦模块
        backFromSprite, wakeUpFromDream, regenerateDream, collectDream, openDreamArchive, closeDreamArchive, deleteCollectedDream
    };
})();