'use strict';

// ============================================================
// LifestyleModule — 角色行程与生活系统 (动态时空推演版 - 修复)
// ============================================================
const LifestyleModule = (() => {
    // ─────────────────────────────────────────────
    // 🌟 通用容错 JSON 解析：修复 AI 返回的几类常见非法格式
    //    1) 字符串内裸控制字符 (Bad control character)
    //    2) 键名缺双引号 / 用单引号 (Expected double-quoted property name)
    //    3) 末尾多余逗号 (trailing comma)
    // ─────────────────────────────────────────────
    function _safeParseJSON(raw) {
        const cleaned = String(raw).replace(/```json|```/g, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error('AI返回数据异常');
        let s = cleaned.substring(start, end + 1);

        // (1) 仅转义【字符串字面量内部】的裸控制字符
        const sanitizeCtrl = (str) => {
            let out = '', inStr = false, escaped = false;
            const map = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
            for (const ch of str) {
                if (escaped) { out += ch; escaped = false; continue; }
                if (ch === '\\') { out += ch; escaped = true; continue; }
                if (ch === '"') { inStr = !inStr; out += ch; continue; }
                if (inStr && ch <= '\u001F') { out += (map[ch] || ''); continue; }
                out += ch;
            }
            return out;
        };

        try {
            return JSON.parse(sanitizeCtrl(s));
        } catch (e1) {
            console.warn('[Lifestyle] 标准解析失败，启用格式修复：', e1.message);
            // (2)(3) 仅在【字符串外部】修结构问题，避免误伤正文内容
            let out = '', inStr = false, escaped = false;
            s = sanitizeCtrl(s);
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (escaped) { out += ch; escaped = false; continue; }
                if (ch === '\\') { out += ch; escaped = true; continue; }
                if (ch === '"') { inStr = !inStr; out += ch; continue; }
                if (inStr) { out += ch; continue; }
                // —— 以下都在字符串外部 ——
                // 单引号包裹的键/值 → 双引号
                if (ch === "'") {
                    let j = i + 1, inner = '';
                    while (j < s.length && s[j] !== "'") { inner += s[j]; j++; }
                    out += '"' + inner.replace(/"/g, '\\"') + '"';
                    i = j;
                    continue;
                }
                out += ch;
            }
            // 给裸键名补双引号： {key:  或  ,key:  →  "key":
            out = out.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
            // 去掉末尾多余逗号： ,}  ,]
            out = out.replace(/,(\s*[}\]])/g, '$1');
            return JSON.parse(out);
        }
    }

    let _initialized = false;
    let _chars =[];
    let _currentDetailCharId = null;
    let _currentWeekData =[];
    let _selectedDateIndex = 0;
    
    // UI 内部状态
    let _activeItiId = null; 
    let _currentSchedule = null; 

    function init() {
        if (_initialized) return;

        const style = document.createElement('style');
        style.innerHTML = `
            #lifestyle-screen {
                --bg-deep: #030303;     
                --card-bg: #111111;     
                --text-main: #fcfcfc;
                --text-sub: #888888;
                --divider: rgba(255, 255, 255, 0.08);
                --accent: #ffffff;
                background-color: var(--bg-deep);
                color: var(--text-main);
                z-index: 150; 
                overflow: hidden;
            }

            /* --- 公共背景 --- */
            #lifestyle-screen .ambient-bg {
                position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;
                background-image: 
                    radial-gradient(circle at 15% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 40%),
                    radial-gradient(circle at 85% 80%, rgba(255, 255, 255, 0.02) 0%, transparent 30%);
            }
            #lifestyle-screen .grid-overlay {
                position: absolute; inset: 0; width: 100%; height: 100%;
                background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
                background-size: 40px 40px; mask-image: linear-gradient(to bottom, black 20%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, black 20%, transparent 100%);
            }

            /* --- 视图切换机制 --- */
            .ls-view {
                position: absolute; inset: 0; width: 100%; height: 100%;
                transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.4s ease;
                overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
            }
            .ls-view::-webkit-scrollbar { display: none; }
            
            #ls-listView { z-index: 10; }
            #ls-detailView { z-index: 20; transform: translateX(100%); background: #F4F4F6; color: #111111; font-family: 'Inter', 'Noto Sans SC', sans-serif; }
            #ls-detailView.active { transform: translateX(0); }

            /* 第三层视图 - 具体动线页 */
            #ls-itineraryView { z-index: 30; transform: translateX(100%); background: #F4F4F6; color: #111111; font-family: 'Inter', 'Noto Sans SC', sans-serif; }
            #ls-itineraryView.active { transform: translateX(0); }

            /* =========================================
               List View 列表页样式 
               ========================================= */
            #ls-listView .top-nav {
                position: sticky; top: 0; width: 100%; padding: max(env(safe-area-inset-top, 20px), 24px) 20px 16px; z-index: 100;
                background: linear-gradient(to bottom, rgba(3,3,3,0.9) 0%, rgba(3,3,3,0.6) 60%, transparent 100%);
                backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; justify-content: space-between; align-items: center;
            }
            #ls-listView .back-btn { background: transparent; border: none; color: var(--text-main); font-size: 15px; font-weight: 300; letter-spacing: 0.5px; cursor: pointer; position: relative; padding-bottom: 4px; font-family: inherit; }
            #ls-listView .back-btn::after { content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 1px; background-color: var(--accent); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); transform-origin: left; }
            #ls-listView .back-btn:active::after { transform: scaleX(0.3); }
            #ls-listView .nav-decor { display: flex; align-items: center; gap: 8px; font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 2px; color: var(--text-sub); text-transform: uppercase; }
            #ls-listView .decor-line { width: 20px; height: 1px; background-color: var(--divider); }
            #ls-listView .list-container { padding: 20px 20px 60px; display: flex; flex-direction: column; gap: 28px; }
            #ls-listView .ls-card {
                background-color: var(--card-bg); border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.05); overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.4); cursor: pointer;
                transform: translateY(40px) scale(0.98); opacity: 0; transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease, box-shadow 0.3s ease;
            }
            #ls-listView .ls-card.in-view { transform: translateY(0) scale(1); opacity: 1; }
            #ls-listView .ls-card:active { transform: scale(0.96) !important; box-shadow: 0 10px 20px rgba(0,0,0,0.8); border-color: rgba(255, 255, 255, 0.1); }
            #ls-listView .card-img-wrap { position: relative; width: 100%; height: 320px; overflow: hidden; background: #1a1a1a; }
            #ls-listView .card-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
            #ls-listView .ls-card:active .card-img { transform: scale(1.05); }
            #ls-listView .card-img-gradient { position: absolute; bottom: 0; left: 0; width: 100%; height: 55%; background: linear-gradient(to top, var(--card-bg) 0%, transparent 100%); pointer-events: none; }
            #ls-listView .card-content { padding: 0 24px 24px; display: flex; flex-direction: column; gap: 20px; position: relative; z-index: 10; }
            #ls-listView .content-main { display: flex; justify-content: space-between; align-items: flex-end; margin-top: -16px; }
            #ls-listView .info-left { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; padding-right: 16px; }
            #ls-listView .char-title { font-family: 'Playfair Display', 'Noto Serif SC', serif; font-size: 26px; font-weight: 600; font-style: italic; color: var(--text-main); letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1; margin: 0; }
            #ls-listView .char-desc { font-family: 'Space Mono', monospace; font-size: 10px; color: var(--text-sub); line-height: 1.5; letter-spacing: 1px; text-transform: uppercase; }
            #ls-listView .stats-right { display: flex; gap: 16px; text-align: center; flex-shrink: 0; }
            #ls-listView .stat-item { display: flex; flex-direction: column; gap: 4px; }
            #ls-listView .stat-val { font-size: 15px; color: var(--text-main); font-weight: 300; font-family: 'Space Mono', monospace; }
            #ls-listView .stat-label { font-size: 9px; color: var(--text-sub); letter-spacing: 1px; text-transform: uppercase; }
            #ls-listView .stat-divider { width: 1px; background-color: var(--divider); height: 30px; align-self: center; }
            #ls-listView .hr-line { height: 1px; background-color: var(--divider); border: none; width: 100%; }
            #ls-listView .content-footer { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-sub); letter-spacing: 1px; font-family: 'Space Mono', monospace; text-transform: uppercase; }
            #ls-listView .footer-author span { color: #ccc; }
            #ls-listView .page-end { text-align: center; padding: 20px 0 40px; font-size: 10px; letter-spacing: 4px; color: #444; font-family: 'Space Mono', monospace; text-transform: uppercase; }

            /* =========================================
               Detail View 行程总览页 
               ========================================= */
            .ls-texture-overlay { position: absolute; inset: 0; z-index: 20; opacity: 0.04; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E"); pointer-events: none; mix-blend-mode: multiply; }
            .ls-detail-nav { position: absolute; top: 0; left: 0; width: 100%; padding: max(env(safe-area-inset-top, 24px), 24px) 24px 24px; z-index: 50; display: flex; justify-content: space-between; align-items: flex-start; background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%); }
            .ls-nav-btn-back { display: inline-flex; align-items: center; gap: 8px; background: none; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 500; letter-spacing: 2px; color: #fff; transition: all 0.4s ease; }
            .ls-nav-btn-back:hover { transform: translateX(-4px); }
            .ls-nav-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
            .ls-nav-id { font-family: 'Space Mono', monospace; font-size: 10px; color: #fff; letter-spacing: 2px; text-transform: uppercase;}
            .ls-nav-status { display: flex; align-items: center; gap: 4px; font-family: 'Space Mono', monospace; font-size: 8px; color: rgba(255,255,255,0.6); letter-spacing: 1px; }
            .ls-nav-status::before { content: ''; width: 4px; height: 4px; background: #fff; border-radius: 50%; animation: ls-pulse 2s infinite; }
            @keyframes ls-pulse { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }

            .ls-hero-section { position: relative; height: 55vh; width: 100%; overflow: hidden; }
            .ls-parallax-image { position: absolute; top: 0; left: 0; width: 100%; height: 130%; object-fit: cover; filter: contrast(105%) brightness(0.85); transform-origin: center; transition: transform 0.1s cubic-bezier(0.1, 0.5, 0.9, 0.5); }
            .ls-hero-cut { position: absolute; bottom: 0; left: 0; width: 100%; height: 80px; background: linear-gradient(to top, #F4F4F6 0%, rgba(244,244,246,0) 100%); }

            .ls-temporal-axis-wrapper { position: relative; margin-top: -40px; z-index: 30; padding: 0 16px; }
            .ls-axis-glass { background: rgba(255, 255, 255, 0.65); backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); padding: 16px 12px; }
            .ls-axis-track { display: flex; justify-content: space-between; align-items: center; position: relative; }
            .ls-axis-track::before { content: ''; position: absolute; left: 10px; right: 10px; top: 50%; transform: translateY(-50%); height: 1px; background: rgba(0,0,0,0.06); z-index: 0; }
            .ls-axis-node { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; padding: 4px; transition: all 0.3s ease; }
            .ls-node-day { font-family: 'Space Mono', monospace; font-size: 8px; color: #888; letter-spacing: 1px; transition: color 0.3s; }
            .ls-node-dot { width: 8px; height: 8px; border-radius: 50%; background: #FAFAFC; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; transition: all 0.4s ease; }
            .ls-node-dot.has-anomaly::after { content: ''; width: 4px; height: 4px; background: #D93A3A; border-radius: 50%; }
            .ls-node-date { font-family: 'Cormorant Garamond', serif; font-size: 16px; font-weight: 500; color: #aaa; line-height: 1; transition: color 0.3s; }
            .ls-axis-node.is-selected .ls-node-day { color: #111; font-weight: 700; }
            .ls-axis-node.is-selected .ls-node-date { color: #111; transform: scale(1.2); }
            .ls-axis-node.is-selected .ls-node-dot { background: #111; border-color: #111; box-shadow: 0 0 0 3px rgba(17,17,17,0.1); }
            .ls-axis-node.is-selected .ls-node-dot.has-anomaly::after { background: #fff; } 

            .ls-briefing-section { padding: 32px 24px 100px 24px; position: relative; z-index: 10; }
            .ls-bg-watermark { position: absolute; top: 0; left: 10px; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 120px; font-weight: 600; color: rgba(0,0,0,0.03); letter-spacing: -4px; z-index: -1; pointer-events: none; user-select: none; }
            .ls-briefing-content { transition: opacity 0.4s ease, transform 0.4s ease; }
            .ls-briefing-content.is-animating { opacity: 0; transform: translateY(10px); }

            .ls-brief-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 16px; }
            .ls-brief-title-wrap { display: flex; flex-direction: column; gap: 4px; }
            .ls-brief-label { font-family: 'Space Mono', monospace; font-size: 9px; color: #888; letter-spacing: 2px; text-transform: uppercase; }
            .ls-brief-date { font-family: 'Cormorant Garamond', serif; font-size: 36px; font-weight: 400; color: #111; line-height: 1; letter-spacing: -1px; text-transform: uppercase;}
            .ls-brief-status { font-family: 'Space Mono', monospace; font-size: 9px; padding: 4px 8px; border: 1px solid #111; border-radius: 20px; color: #111; letter-spacing: 1px; }

            .ls-brief-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
            .ls-data-block { display: flex; flex-direction: column; gap: 6px; }
            .ls-data-key { font-family: 'Space Mono', monospace; font-size: 9px; color: #888; letter-spacing: 1.5px; text-transform: uppercase; }
            .ls-data-val { font-size: 15px; font-weight: 400; color: #111; }
            .ls-data-val strong { font-family: 'Space Mono', monospace; font-size: 18px; font-weight: 700; }

            .ls-anomaly-module { display: none; margin-bottom: 32px; position: relative; padding-left: 16px; }
            .ls-anomaly-module::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #D93A3A; }
            .ls-anomaly-tag { font-family: 'Space Mono', monospace; font-size: 9px; color: #D93A3A; letter-spacing: 1px; margin-bottom: 6px; display: block; }
            .ls-anomaly-text { font-size: 13px; color: #444; font-weight: 300; line-height: 1.6; }

            .ls-actions-group { display: flex; flex-direction: column; gap: 16px; margin-top: 40px; }
            .ls-enter-action { display: flex; justify-content: space-between; align-items: center; width: 100%; background: none; border: none; cursor: pointer; padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.1); transition: all 0.3s ease; }
            .ls-enter-action:hover { border-bottom-color: #111; }
            .ls-enter-action:active { transform: scale(0.98); }
            .ls-action-text { font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #111; }
            .ls-action-arrow { color: #111; font-size: 18px; transition: transform 0.4s ease; }
            .ls-enter-action:hover .ls-action-arrow { transform: translateX(6px); }

            .ls-config-action { display: flex; justify-content: space-between; align-items: center; width: 100%; background: none; border: none; cursor: pointer; padding: 12px 0; transition: all 0.3s ease; opacity: 0.6; }
            .ls-config-action:hover { opacity: 1; }
            .ls-config-action:active { transform: scale(0.98); }
            .ls-config-text { font-family: 'Space Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: 2px; color: #111; }

            .ls-enter-action.is-disabled { cursor: default; border-bottom-color: rgba(0,0,0,0.05); }
            .ls-enter-action.is-disabled .ls-action-text { color: #aaa; }
            .ls-enter-action.is-disabled .ls-action-arrow { opacity: 0; }

            /* 空状态阻断 */
            .ls-empty-state-overlay {
                position: absolute; inset: 0; z-index: 40;
                background: rgba(244, 244, 246, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                padding: 32px; text-align: center; opacity: 0; pointer-events: none; transition: opacity 0.5s ease;
            }
            .ls-empty-state-overlay.active { opacity: 1; pointer-events: auto; }
            .ls-empty-icon { font-size: 40px; color: #111; margin-bottom: 16px; opacity: 0.8; }
            .ls-empty-title { font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 600; color: #111; margin-bottom: 8px; line-height: 1.2; }
            .ls-empty-desc { font-size: 12px; color: #666; margin-bottom: 32px; line-height: 1.6; }
            .ls-init-btn {
                background: #111; color: #fff; border: none; padding: 14px 28px; border-radius: 4px;
                font-family: 'Space Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px;
                text-transform: uppercase; cursor: pointer; box-shadow: 0 10px 20px rgba(0,0,0,0.1);
                transition: transform 0.2s, background 0.2s; display: flex; align-items: center; gap: 8px;
            }
            .ls-init-btn:active { transform: scale(0.95); background: #333; }

            /* =========================================
               Routine Config 面板样式
               ========================================= */
            .ls-modal-overlay {
                position: absolute; inset: 0; z-index: 500; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(5px);
                opacity: 0; pointer-events: none; transition: opacity 0.4s ease;
            }
            .ls-modal-overlay.active { opacity: 1; pointer-events: auto; }
            .ls-modal-sheet {
                position: absolute; bottom: 0; left: 0; width: 100%; max-height: 85vh;
                background: #F4F4F6; color: #111; border-radius: 24px 24px 0 0;
                transform: translateY(100%); transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
                display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,0.1);
            }
            .ls-modal-overlay.active .ls-modal-sheet { transform: translateY(0); }
            
            .ls-modal-header { padding: 24px 24px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.08); }
            .ls-modal-title { font-family: 'Space Mono', monospace; font-size: 12px; letter-spacing: 2px; font-weight: 700; text-transform: uppercase; }
            .ls-modal-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #111; }
            
            .ls-modal-body { padding: 24px; overflow-y: auto; flex: 1; scrollbar-width: none; }
            .ls-modal-body::-webkit-scrollbar { display: none; }
            
            .ls-routine-meta { display: flex; gap: 16px; margin-bottom: 24px; }
            .ls-meta-box { flex: 1; background: #fff; padding: 16px; border: 1px solid rgba(0,0,0,0.05); border-radius: 12px; }
            .ls-meta-label { font-family: 'Space Mono', monospace; font-size: 9px; color: #888; letter-spacing: 1px; margin-bottom: 8px; display: block; text-transform: uppercase;}
            .ls-meta-val { font-size: 16px; font-weight: 500; font-family: 'Space Mono', monospace; color: #111; }
            
            .ls-routine-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
            .ls-rt-tag { background: #111; color: #fff; font-family: 'Space Mono', monospace; font-size: 9px; padding: 4px 10px; border-radius: 20px; letter-spacing: 1px; text-transform: uppercase;}
            
            .ls-routine-timeline { display: flex; flex-direction: column; position: relative; padding-left: 20px; }
            .ls-routine-timeline::before { content: ''; position: absolute; left: 4px; top: 8px; bottom: 0; width: 1px; background: rgba(0,0,0,0.1); }
            .ls-rt-event { position: relative; margin-bottom: 24px; }
            .ls-rt-event::before { content: ''; position: absolute; left: -20px; top: 6px; width: 9px; height: 9px; border-radius: 50%; background: #F4F4F6; border: 2px solid #111; }
            .ls-rt-time { font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; color: #111; margin-bottom: 4px; }
            .ls-rt-title { font-family: 'Noto Serif SC', serif; font-size: 15px; font-weight: 600; color: #111; margin-bottom: 4px; }
            .ls-rt-loc { font-family: 'Space Mono', monospace; font-size: 9px; color: #888; letter-spacing: 1px; display: flex; align-items: center; gap: 8px;}
            
            /* 【底部安全区修复】动态补偿 iPhone 底部白条，避免 UI 贴底 */
            .ls-modal-footer { padding: 16px 24px calc(16px + env(safe-area-inset-bottom, 16px)); border-top: 1px solid rgba(0,0,0,0.08); background: #fff; }
            .ls-btn-rebuild { width: 100%; background: transparent; border: 1px solid #111; color: #111; padding: 14px; border-radius: 8px; font-family: 'Space Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;}
            .ls-btn-rebuild:active { background: #111; color: #fff; transform: scale(0.98); }

            /* =========================================
               View 3: 具体动线 (Itinerary Log) 样式
               ========================================= */
            #ls-itineraryView .iti-top-nav { position: absolute; top: 0; left: 0; width: 100%; padding: max(env(safe-area-inset-top, 24px), 24px) 24px 24px; z-index: 50; display: flex; align-items: center; background: linear-gradient(to bottom, rgba(244,244,246,1) 0%, rgba(244,244,246,0) 100%); }
            #ls-itineraryView .iti-nav-brand { font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 500; letter-spacing: 2px; color: #555; display: flex; align-items: center; gap: 8px; cursor: pointer;}
            #ls-itineraryView .iti-nav-brand:active { transform: translateX(-4px); }

            #ls-itineraryView .iti-main-scroll { position: relative; z-index: 5; height: 100%; width: 100%; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth; padding: 90px 24px 140px 24px; mask-image: linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%); }
            #ls-itineraryView .iti-main-scroll::-webkit-scrollbar { display: none; }

            .iti-header-typo { display: flex; flex-direction: column; margin-bottom: 70px; margin-top: 10px; }
            .iti-meta-row { display: flex; justify-content: space-between; font-family: 'Space Mono', monospace; font-size: 9px; color: #888; letter-spacing: 2px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 12px; margin-bottom: 20px; text-transform: uppercase;}
            .iti-day-huge { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 64px; line-height: 0.85; color: #111; font-weight: 300; letter-spacing: -2px; margin-left: -4px; }
            .iti-bottom-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
            .iti-exact-date { font-family: 'Space Mono', monospace; font-size: 11px; color: #444; letter-spacing: 1px; text-transform: uppercase;}
            .iti-cn-title { font-size: 13px; font-weight: 400; letter-spacing: 12px; color: #000; margin-right: -12px; }

            .iti-schedule-track { position: relative; display: flex; flex-direction: column; gap: 45px; padding-left: 10px; }
            .iti-spine-line { position: absolute; left: 17px; top: 10px; bottom: -50px; width: 1px; border-left: 1px dashed rgba(0, 0, 0, 0.15); z-index: 1; }
            
            .iti-schedule-item { position: relative; cursor: pointer; display: flex; flex-direction: column; padding-left: 30px; transition: all 0.4s ease;}
            .iti-crosshair { position: absolute; left: -22px; top: 40px; color: rgba(0,0,0,0.2); transition: all 0.5s ease; z-index: 2; font-size: 14px; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;}
            .iti-time-bg { position: absolute; top: -18px; left: 10px; font-family: 'Cormorant Garamond', serif; font-size: 60px; line-height: 1; font-weight: 300; color: rgba(0, 0, 0, 0.03); transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); letter-spacing: -2px; z-index: 1; pointer-events: none; }
            
            .iti-milk-glass-card { position: relative; z-index: 3; background: rgba(255, 255, 255, 0.4); backdrop-filter: blur(30px) saturate(150%); -webkit-backdrop-filter: blur(30px) saturate(150%); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 16px; padding: 24px; box-shadow: 0 8px 32px -8px rgba(0, 0, 0, 0.04); transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .iti-floating-icon { position: absolute; top: -16px; right: 20px; width: 36px; height: 36px; background: #111; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 15px rgba(0,0,0,0.2); transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); font-size: 18px;}

            .iti-card-header { display: flex; flex-direction: column; gap: 8px; padding-right: 30px; }
            .iti-item-no { font-family: 'Space Mono', monospace; font-size: 10px; color: #888; letter-spacing: 1px;}
            .iti-card-title { font-size: 17px; font-weight: 500; color: #222; letter-spacing: 0.5px; transition: color 0.3s; }
            .iti-card-location { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #666; font-weight: 300; }
            
            .iti-expand-panel { max-height: 0; opacity: 0; overflow: hidden; transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .iti-desc-text { font-size: 13px; line-height: 1.7; color: #555; font-weight: 300; margin-bottom: 20px; }

            /* States */
            .iti-schedule-item.is-past .iti-milk-glass-card { opacity: 0.65; box-shadow: none; border-color: rgba(0,0,0,0.05); }
            .iti-schedule-item.is-past .iti-crosshair { color: #111; transform: scale(0.6); border-radius: 50%; background: #ccc; content: ''; }
            .iti-schedule-item.is-past .iti-crosshair i { display: none; } 
            .iti-schedule-item.is-past .iti-time-bg { color: rgba(0, 0, 0, 0.015); }
            .iti-schedule-item.is-past .iti-floating-icon { background: #ccc; box-shadow: none; }

            .iti-schedule-item.is-active .iti-crosshair { color: #000; transform: rotate(90deg); }
            .iti-schedule-item.is-active .iti-time-bg { color: rgba(0, 0, 0, 0.85); transform: translateX(12px) translateY(-4px); }
            .iti-schedule-item.is-active .iti-milk-glass-card { background: rgba(255, 255, 255, 0.85); box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 1); transform: translateY(-2px); }
            .iti-schedule-item.is-active .iti-floating-icon::before { content: ''; position: absolute; inset: -2px; border-radius: 50%; border: 1px solid rgba(17, 17, 17, 0.3); animation: iti-ripple 2.5s cubic-bezier(0.2, 0.8, 0.2, 1) infinite; pointer-events: none; }
            .iti-schedule-item.is-active .iti-expand-panel { max-height: 250px; opacity: 1; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(0, 0, 0, 0.06); }
            @keyframes iti-ripple { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2); opacity: 0; } }

            .iti-schedule-item.is-deviation .iti-milk-glass-card { border: 1px solid rgba(217, 58, 58, 0.3); background: rgba(255, 255, 255, 0.8); box-shadow: 0 8px 30px rgba(217, 58, 58, 0.08); }
            .iti-schedule-item.is-deviation .iti-crosshair { color: #D93A3A; transform: rotate(45deg); }
            .iti-schedule-item.is-deviation .iti-floating-icon { background: #D93A3A; box-shadow: 0 6px 15px rgba(217, 58, 58, 0.3); }
            .iti-schedule-item.is-deviation .iti-card-title { text-decoration: line-through; color: #aaa; }
            .iti-dev-badge { color: #D93A3A; font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; display: block; margin-top: 8px; letter-spacing: 0.5px; }

            .iti-editorial-actions { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.05); }
            .iti-action-group { display: flex; gap: 16px; }
            .iti-action-btn { position: relative; background: none; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #888; transition: color 0.4s ease; padding-bottom: 4px; display: flex; align-items: center; gap: 6px; text-transform: uppercase;}
            .iti-action-btn::after { content: ''; position: absolute; left: 0; bottom: 0; width: 0; height: 1px; background: #111; transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
            .iti-action-btn:hover { color: #111; }
            .iti-action-btn.is-active { color: #111; }
            .iti-action-btn.is-active::after { width: 100%; }

            .iti-sync-btn { color: #111; font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 1px; display: flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; font-weight: 700;}
            .iti-sync-btn.is-synced { color: #D93A3A; }
            .iti-eq-visualizer { display: flex; align-items: flex-end; gap: 2px; height: 10px; margin-bottom: 2px; }
            .iti-eq-bar { width: 2px; height: 40%; background-color: currentColor; border-radius: 1px; transition: background-color 0.4s ease; }
            .iti-schedule-item.is-active .iti-eq-bar { animation: iti-eq-bounce 1s ease-in-out infinite alternate; }
            @keyframes iti-eq-bounce { from { height: 30%; } to { height: 100%; } }
            .iti-schedule-item.is-active .iti-eq-bar:nth-child(2) { animation-duration: 0.7s; }
            .iti-schedule-item.is-active .iti-eq-bar:nth-child(3) { animation-duration: 1.2s; }
        `;
        document.head.appendChild(style);

        // 2. 注入 HTML 结构 (包含 3 个视图)
        const screen = document.createElement('div');
        screen.id = 'lifestyle-screen';
        screen.className = 'screen';
        screen.innerHTML = `
            <div class="ambient-bg"><div class="grid-overlay"></div></div>
            
            <!-- View 1: 角色列表 -->
            <div class="ls-view active" id="ls-listView">
                <nav class="top-nav">
                    <button class="back-btn" onclick="Router.back()">Back</button>
                    <div class="nav-decor">
                        <span>ITINERARY</span>
                        <span class="decor-line"></span>
                        <span>VOL.01</span>
                    </div>
                </nav>
                <main class="list-container" id="ls-charList"></main>
                <div class="page-end">/// END OF RECORDS</div>
            </div>

            <!-- View 2: 行程概览页 -->
            <div class="ls-view" id="ls-detailView">
                <div class="ls-texture-overlay"></div>
                <nav class="ls-detail-nav">
                    <button class="ls-nav-btn-back" onclick="LifestyleModule.closeDetail()">
                        <i class="ph-bold ph-arrow-left"></i> ROSTER
                    </button>
                    <div class="ls-nav-meta">
                        <span class="ls-nav-id" id="ls-detail-id">UNKNOWN // 00</span>
                        <span class="ls-nav-status">LIVE SYNC</span>
                    </div>
                </nav>

                <section class="ls-hero-section">
                    <img src="" alt="Portrait" class="ls-parallax-image" id="ls-parallaxImg">
                    <div class="ls-hero-cut"></div>
                </section>

                <div class="ls-temporal-axis-wrapper">
                    <div class="ls-axis-glass">
                        <div class="ls-axis-track" id="ls-axisTrack"></div>
                    </div>
                </div>

                <section class="ls-briefing-section">
                    <div class="ls-bg-watermark">LOG.</div>
                    
                    <div class="ls-briefing-content" id="ls-briefingContent">
                        <div class="ls-brief-header">
                            <div class="ls-brief-title-wrap">
                                <span class="ls-brief-label" id="ls-briefLabel">TODAY'S BRIEF</span>
                                <h2 class="ls-brief-date" id="ls-briefDate">Thu, 24</h2>
                            </div>
                            <span class="ls-brief-status" id="ls-briefStatus">HIGH LOAD</span>
                        </div>

                        <div class="ls-brief-grid">
                            <div class="ls-data-block">
                                <span class="ls-data-key">Events</span>
                                <span class="ls-data-val"><strong id="ls-valEvents">00</strong> 项</span>
                            </div>
                            <div class="ls-data-block">
                                <span class="ls-data-key">Est. Time</span>
                                <span class="ls-data-val"><strong id="ls-valDuration">00</strong> H</span>
                            </div>
                        </div>

                        <div class="ls-anomaly-module" id="ls-anomalyModule">
                            <span class="ls-anomaly-tag">* DEVIATION DETECTED</span>
                            <p class="ls-anomaly-text" id="ls-anomalyText">...</p>
                        </div>

                        <div class="ls-actions-group">
                            <button class="ls-enter-action is-disabled" id="ls-btnEnterItinerary" onclick="LifestyleModule.openItinerary()">
                                <span class="ls-action-text" id="ls-btnEnterText">NO EVENTS SCHEDULED</span>
                                <i class="ph-bold ph-arrow-right ls-action-arrow"></i>
                            </button>
                            <button class="ls-config-action" onclick="LifestyleModule.openRoutineConfig()">
                                <span class="ls-config-text">ROUTINE CONFIG</span>
                                <i class="ph-bold ph-faders"></i>
                            </button>
                        </div>
                    </div>

                    <!-- 空状态阻断 -->
                    <div class="ls-empty-state-overlay" id="ls-emptyState">
                        <i class="ph-thin ph-clock-dashed ls-empty-icon"></i>
                        <h3 class="ls-empty-title">Uncharted Time</h3>
                        <p class="ls-empty-desc">系统暂未侦测到该角色的生活轨迹。<br>是否需要唤醒引擎，推演其作息架构？</p>
                        <button class="ls-init-btn" onclick="LifestyleModule.generateRoutine()">
                            <i class="ph-bold ph-sparkle"></i> INITIALIZE ROUTINE
                        </button>
                    </div>
                </section>
            </div>

            <!-- View 3: 具体动线页 (Itinerary Log) -->
            <div class="ls-view" id="ls-itineraryView">
                
                <nav class="iti-top-nav">
                    <span class="iti-nav-brand" onclick="LifestyleModule.closeItinerary()"><i class="ph-bold ph-arrow-left" style="font-size: 14px;"></i> BACK</span>
                </nav>

                <div class="iti-main-scroll">
                    <header class="iti-header-typo">
                        <div class="iti-meta-row">
                            <span>LOG // <span id="iti-logNo">00</span></span>
                            <span id="iti-gps">LAT 31.2°N / LON 121.4°E</span>
                        </div>
                        <h1 class="iti-day-huge" id="iti-dayName">Thursday</h1>
                        <div class="iti-bottom-row">
                            <div class="iti-exact-date" id="iti-dateStr">OCT 24, 2026</div>
                            <div class="iti-cn-title">今日动线</div>
                        </div>
                    </header>

                    <div class="iti-schedule-track" id="iti-scheduleTrack">
                        <!-- 动态渲染区 -->
                    </div>
                </div>
            </div>

            <!-- 【修复核心：将所有的 Modal 弹窗直接挂载到外层屏幕根节点，脱离滚动流，避免跟随内容滚动产生错位和空隙】 -->

            <!-- 作息可视化面板 (Bottom Sheet) -->
            <div class="ls-modal-overlay" id="ls-routineModal" onclick="LifestyleModule.closeRoutineConfig()">
                <div class="ls-modal-sheet" onclick="event.stopPropagation()">
                    <div class="ls-modal-header">
                        <span class="ls-modal-title">Routine Archival</span>
                        <button class="ls-modal-close" onclick="LifestyleModule.closeRoutineConfig()"><i class="ph-thin ph-x"></i></button>
                    </div>
                    <div class="ls-modal-body" id="ls-routineContent"></div>
                    <div class="ls-modal-footer">
                        <button class="ls-btn-rebuild" onclick="LifestyleModule.rebuildRoutine()">
                            <i class="ph-bold ph-arrows-clockwise"></i> RE-GENERATE ROUTINE
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- MODAL LAYER 2: 高定确认弹窗 (取代系统 confirm) -->
            <div class="ls-modal-overlay" id="ls-confirmOverlay" style="z-index: 600; display: flex; align-items: center; justify-content: center;">
                <div class="ls-modal-sheet" style="position: relative; bottom: auto; width: 85%; max-width: 320px; border-radius: 24px; transform: scale(0.9); transition: transform 0.3s ease; display: block;" onclick="event.stopPropagation()">
                    <div class="ls-modal-header" style="justify-content: center; padding-top: 28px;">
                        <span class="ls-modal-title" style="font-size: 14px; color: #111;">TEMPORAL RESET</span>
                    </div>
                    <div class="ls-modal-body" style="text-align: center; padding: 24px 20px 32px;">
                        <p style="font-size: 13px; line-height: 1.6; color: #555; margin-bottom: 0;">
                            确认要重新推演该角色的作息规律吗？<br>
                            <span style="font-size: 9px; color: #aaa; text-transform: uppercase; letter-spacing: 1px; display: block; margin-top: 8px;">
                                Current archives will be overwritten.
                            </span>
                        </p>
                    </div>
                    <div class="ls-modal-footer" style="display: flex; gap: 10px; padding: 0 20px 28px; border-top: none; background: transparent;">
                        <button class="ls-btn-rebuild" style="flex: 1; border: 1px solid #ddd; background: transparent; color: #888; font-size: 9px; padding: 12px 0;" onclick="document.getElementById('ls-confirmOverlay').classList.remove('active')">
                            CANCEL
                        </button>
                        <button class="ls-btn-rebuild" style="flex: 1; background: #111; color: #fff; border: none; font-size: 9px; padding: 12px 0;" id="ls-btn-confirm-exec">
                            CONFIRM
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- MODAL LAYER 3: 数据详情弹窗 (Context / Thoughts) -->
            <div class="ls-modal-overlay" id="ls-dataModal" style="z-index: 700; display: flex; align-items: center; justify-content: center;" onclick="document.getElementById('ls-dataModal').classList.remove('active')">
                <div class="ls-modal-sheet" style="position: relative; bottom: auto; width: 85%; max-width: 340px; border-radius: 16px; transform: scale(0.9); transition: transform 0.3s ease; display: block; background: rgba(255,255,255,0.9); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 20px 40px rgba(0,0,0,0.15);" onclick="event.stopPropagation()">
                    <div class="ls-modal-header" style="padding: 20px 24px 16px; border-bottom: 1px dashed rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
                        <span class="ls-modal-title" id="ls-dataModalTitle" style="font-family: 'Space Mono', monospace; font-size: 11px; color: #111; letter-spacing: 2px; font-weight: 700;">LOG.DETAILS</span>
                        <button class="ls-modal-close" style="background:none; border:none; font-size:18px; cursor:pointer; color:#111;" onclick="document.getElementById('ls-dataModal').classList.remove('active')"><i class="ph-thin ph-x"></i></button>
                    </div>
                    <div class="ls-modal-body" id="ls-dataModalContent" style="padding: 24px; text-align: left; max-height: 50vh; overflow-y: auto;">
                        <!-- 内容由 JS 动态注入 -->
                    </div>
                </div>
            </div>
        `;
        document.querySelector('.device').appendChild(screen);

        // 视差滚动绑定
        const detailView = document.getElementById('ls-detailView');
        const parallaxImg = document.getElementById('ls-parallaxImg');
        detailView.addEventListener('scroll', () => {
            const scrollY = detailView.scrollTop;
            if (scrollY < window.innerHeight * 0.6) {
                parallaxImg.style.transform = `translateY(${scrollY * 0.35}px)`;
            }
        });

        _initialized = true;
    }

    async function onEnter() {
        if (!_initialized) init();

        const listContainer = document.getElementById('ls-charList');
        if (!listContainer) return;

        try { _chars = await DB.characters.getAll(); } catch(e) { _chars =[]; }

        if (_chars.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; padding: 60px 20px; color:var(--text-sub); font-family:'Space Mono', monospace; font-size: 10px; letter-spacing: 2px;">NO IDENTITIES FOUND</div>`;
            return;
        }

        let html = '';
        for (const[idx, char] of _chars.entries()) {
            let avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&q=80'; 
            if (char.avatarUrl) {
                avatarUrl = await Assets.getUrl(char.avatarUrl).catch(() => avatarUrl) || avatarUrl;
            }

            const desc1 = char.title || 'CLASSIFIED IDENTITY';
            const desc2 = char.mbti ? `TYPE: ${char.mbti}` : 'SECTOR UNKNOWN';
            const syncRate = Math.floor(Math.random() * 20 + 80); 
            const freqRate = String(idx + 1).padStart(2, '0');

            html += `
            <div class="ls-card" onclick="LifestyleModule.openDetail('${char.id}')">
                <div class="card-img-wrap">
                    <img src="${avatarUrl}" alt="${char.name}" class="card-img">
                    <div class="card-img-gradient"></div>
                </div>
                <div class="card-content">
                    <div class="content-main">
                        <div class="info-left">
                            <h2 class="char-title">${char.name}</h2>
                            <div class="char-desc">${desc1}<br>${desc2}</div>
                        </div>
                        <div class="stats-right">
                            <div class="stat-item">
                                <span class="stat-val">${syncRate}%</span>
                                <span class="stat-label">SYNC</span>
                            </div>
                            <div class="stat-divider"></div>
                            <div class="stat-item">
                                <span class="stat-val">${freqRate}</span>
                                <span class="stat-label">INDEX</span>
                            </div>
                        </div>
                    </div>
                    <hr class="hr-line">
                    <div class="content-footer">
                        <div class="footer-author">HOST: <span>SYSTEM</span></div>
                        <div class="footer-time">STATUS: ACTIVE</div>
                    </div>
                </div>
            </div>`;
        }

        listContainer.innerHTML = html;

        setTimeout(() => {
            const observerOptions = { root: document.getElementById('ls-listView'), threshold: 0.15 };
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) entry.target.classList.add('in-view');
                });
            }, observerOptions);
            document.querySelectorAll('#ls-listView .ls-card').forEach(card => observer.observe(card));
        }, 50);
    }

    // ==========================================
    // 时间演算引擎核心 (Routine -> Schedule)
    // ==========================================
    function _addRandomOffset(timeStr, rng = Math.random, minOffset = -15, maxOffset = 15) {

    const [h, m] = timeStr.split(':').map(Number);
    let totalMins = h * 60 + m;

    const rand = typeof rng === 'function' ? rng() : Math.random();

    const offset =
        Math.floor(rand * (maxOffset - minOffset + 1))
        + minOffset;

    totalMins += offset;

    if (totalMins < 0) totalMins = 0;
    if (totalMins > 1439) totalMins = 1439;

    const nh = Math.floor(totalMins / 60);
    const nm = totalMins % 60;

    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

    function _guessIcon(title, type) {
        const t = (title + type).toLowerCase();
        if (t.includes('咖啡') || t.includes('茶') || t.includes('餐') || t.includes('饭') || t.includes('吃')) return 'ph-fill ph-coffee';
        if (t.includes('会') || t.includes('工作') || t.includes('处理') || t.includes('室')) return 'ph-fill ph-briefcase';
        if (t.includes('跑') || t.includes('运动') || t.includes('健身') || t.includes('普拉提')) return 'ph-fill ph-sneaker';
        if (t.includes('读') || t.includes('书') || t.includes('学习')) return 'ph-fill ph-book-open';
        if (t.includes('拍') || t.includes('相')) return 'ph-fill ph-camera';
        if (t.includes('影') || t.includes('片') || t.includes('剧')) return 'ph-fill ph-film-strip';
        if (t.includes('音乐') || t.includes('听') || t.includes('唱片')) return 'ph-fill ph-disc';
        if (t.includes('睡') || t.includes('息')) return 'ph-fill ph-bed';
        return 'ph-fill ph-wind'; 
    }
    
    // ===== 日变化系统 START =====

const SCHEDULE_VERSION = 2;

// 稳定随机（同一天固定，不同天变化）
function _hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function _makeRng(seedStr) {
    let seed = _hashString(seedStr) || 1;
    return function () {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function _pick(rng, arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(rng() * arr.length)];
}

// 每天抽一个“当天状态”
function _getDayProfile(charId, dateStr, routine) {
    const rng = _makeRng(`${charId}_${dateStr}`);

    const d = new Date(`${dateStr}T00:00:00`);
    const day = d.getDay();

    const isWeekend = day === 0 || day === 6;

    let mode = 'workday';
    let mood = 'steady';
    let volatility = 0.18;

    if (isWeekend) {
        mode = rng() < 0.5 ? 'weekend' : 'social';
        volatility = 0.28;
    } else {
        mode = rng() < 0.2 ? 'quiet' : 'workday';
    }

    const moodPool = isWeekend
        ?['lazy', 'social', 'relaxed', 'late']
        : ['steady', 'busy', 'quiet', 'tired'];

    mood = _pick(rng, moodPool) || mood;

    return {
        rng,
        mode,
        mood,
        volatility,
        isWeekend
    };
}

function _shouldInsertVariation(profile) {
    const { rng, volatility } = profile;
    return rng() < Math.max(0.15, volatility);
}

// 每天随机插一个生活碎片
function _buildVariationEvent(charId, dateStr, profile) {

    if (!_shouldInsertVariation(profile)) return null;

    const { rng, mode } = profile;

    const pools = {
        workday:[
            { time: '10:30', title: '临时补咖啡', location: '咖啡店' },
            { time: '13:10', title: '顺手处理杂事', location: '街区' },
            { time: '19:20', title: '下班后慢慢回家', location: '路上' }
        ],

        weekend:[
            { time: '11:00', title: '睡到自然醒', location: '住处' },
            { time: '15:30', title: '出门散步', location: '附近街区' },
            { time: '18:40', title: '随便找地方吃饭', location: '餐馆' }
        ],

        quiet:[
            { time: '14:20', title: '午睡 / 发呆', location: '住处' }
        ],

        social:[
            { time: '20:00', title: '晚间小聚', location: '外面' }
        ]
    };

    const pool = pools[mode] || pools.workday;

    const chosen = _pick(rng, pool);
    if (!chosen) return null;

    return {
        id: `ev_${Date.now()}_${Math.floor(rng() * 10000)}`,
        no: 'SEQ-00',
        time: chosen.time,
        title: chosen.title,
        location: chosen.location,
        icon: 'ph-fill ph-wind',
        state: 'future',
        description: '',
        type: '日常',
        devText: ''
    };
}

// ===== 日变化系统 END =====

    // ===== 补全缺失的轻微扰动函数 =====
function _maybeShuffleSmallWindow(events, profile) {
    if (!events || events.length <= 1) return events;
    const { rng, volatility } = profile;
    
    let result =[...events];
    for (let i = 0; i < result.length - 1; i++) {
        // 根据当天的波动率，有概率交换相邻且时间相差不到一小时的事件顺序（模拟真实生活中的小变数）
        if (rng() < volatility * 0.5) {
            const t1 = result[i].time.split(':').map(Number);
            const t2 = result[i+1].time.split(':').map(Number);
            const mins1 = t1[0] * 60 + t1[1];
            const mins2 = t2[0] * 60 + t2[1];
            
            if (Math.abs(mins2 - mins1) < 60) {
                const temp = result[i];
                result[i] = result[i+1];
                result[i+1] = temp;
                i++; // 避免连续交换
            }
        }
    }
    return result;
}

    // ==========================================
    // 拆分1：纯本地代码算法推演 (用于生成过去日子的临时假数据)
    // ==========================================
    async function _generateMathSchedule(charId, dateStr, routine, schedId) {
        const profile = _getDayProfile(charId, dateStr, routine);
        const rng = profile.rng;

        let newEvents =[];
        let seqCounter = 1;

        if (routine.wakeUp) {
            const wakeTitles =[
                { title: '晨间苏醒', desc: '一日之计的开始，准备迎接新的一天。' },
                { title: '慢慢醒来', desc: '今天醒得不算快，先缓一会儿。' },
                { title: '拖延起床', desc: '还想再赖一会儿床，但还是起来了。' }
            ];
            const wakePick = _pick(rng, wakeTitles) || wakeTitles[0];
            newEvents.push({ id: `ev_${Date.now()}_${seqCounter}`, no: `SEQ-${String(seqCounter++).padStart(2, '0')}`, time: _addRandomOffset(routine.wakeUp, rng, -12, 18), title: wakePick.title, location: '住处', icon: 'ph-fill ph-sun-horizon', state: 'future', description: wakePick.desc, type: '日常', devText: '' });
        }

        (routine.events ||[]).forEach(ev => {
            const isWorkLike = /工作|会议|处理|上班|通勤/.test(`${ev.title}${ev.location}${ev.type}`);
            let extraJitter = 15;
            if (profile.isWeekend) extraJitter += 8;
            if (profile.mode === 'social') extraJitter += 6;
            if (profile.mode === 'quiet') extraJitter -= 5;
            if (profile.mode === 'late') extraJitter += 10;
            if (profile.mood === 'tired') extraJitter += 8;
            if (isWorkLike && profile.isWeekend) extraJitter += 10;
            if (!isWorkLike && profile.mode === 'workday') extraJitter -= 2;
            extraJitter = Math.max(6, Math.min(35, extraJitter));

            newEvents.push({ id: `ev_${Date.now()}_${seqCounter}`, no: `SEQ-${String(seqCounter++).padStart(2, '0')}`, time: _addRandomOffset(ev.time, rng, -extraJitter, extraJitter), title: ev.title, location: ev.location || '未知', icon: _guessIcon(ev.title, ev.type), state: 'future', description: `预定于 ${ev.location} 进行 ${ev.title}。`, type: ev.type || '日常', devText: '' });
        });

        const variationEvent = _buildVariationEvent(charId, dateStr, profile);
        if (variationEvent) newEvents.push(variationEvent);

        if (routine.sleep) {
            const sleepTitles =[
                { title: '夜间休眠', desc: '结束一天的日程，进入休息状态。' },
                { title: '准备入睡', desc: '今天差不多该收尾了。' },
                { title: '夜里安静下来', desc: '把今天最后一点事情放下。' }
            ];
            const sleepPick = _pick(rng, sleepTitles) || sleepTitles[0];
            newEvents.push({ id: `ev_${Date.now()}_${seqCounter}`, no: `SEQ-${String(seqCounter++).padStart(2, '0')}`, time: _addRandomOffset(routine.sleep, rng, -10, 25), title: sleepPick.title, location: '住处', icon: 'ph-fill ph-moon', state: 'future', description: sleepPick.desc, type: '日常', devText: '' });
        }

        newEvents.sort((a, b) => a.time.localeCompare(b.time));
        if (typeof _maybeShuffleSmallWindow === 'function') {
            newEvents = _maybeShuffleSmallWindow(newEvents, profile);
        }
        newEvents.sort((a, b) => a.time.localeCompare(b.time));

        newEvents.forEach((ev, i) => ev.no = `SEQ-${String(i + 1).padStart(2, '0')}`);

        const newSchedule = {
            id: schedId, charId: String(charId), date: dateStr, version: SCHEDULE_VERSION,
            dayProfile: { mode: profile.mode, mood: profile.mood, isWeekend: profile.isWeekend },
            events: newEvents
        };
        await DB.schedules.put(newSchedule);
        return newSchedule;
    }

    // ==========================================
    // 拆分2：引擎总调度 (加入角色后台自主内省机制)
    // ==========================================
    const _scheduleLocks = new Map();

    async function _getOrCreateSchedule(charId, dateStr) {
        const schedId = `sch_${charId}_${dateStr}`;
        
        if (_scheduleLocks.has(schedId)) {
            return await _scheduleLocks.get(schedId);
        }

        const task = (async () => {
            let sched = null;
            try { sched = await DB.schedules.get(String(charId), dateStr); } catch (e) {}

            const routine = await DB.routines.get(String(charId));
            if (!routine) return null;

            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const isToday = (dateStr === todayStr);

            let isReflection = false; // 标记：今天是否已经排过期，正在进行“内省复查”

            if (sched && sched.version === SCHEDULE_VERSION) {
                if (!isToday) return sched;
                
                const TWO_HOURS = 2 * 60 * 60 * 1000;
                if (sched.generatedAt && (Date.now() - sched.generatedAt) < TWO_HOURS) {
                    return sched; // 2小时内，直接返回
                }
                // 🌟 超过2小时！我们不再粗暴删除它，而是把它保留下来，当作“内省”的底本！
                isReflection = true; 
            }

            if (dateStr > todayStr) return null;

            if (dateStr < todayStr) {
                return await _generateMathSchedule(charId, dateStr, routine, schedId);
            }

            // 💥【今日推演核心】触发后台内省或全新推演
            try {
                const activeApi = await DB.api.getActive();
                if (!activeApi) throw new Error('未配置 API');

                const char = await DB.characters.get(Number(charId)).catch(() => null);
                
                const rawMsgs = await DB.messages.getPage(String(charId), 0, 50).catch(() =>[]);
                
                const historyText = rawMsgs.reverse().map(m => {
                    const d = new Date(m.timestamp);
                    const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    const role = m.role === 'user' ? '用户' : (char?.name || '角色');
                    const txt = m.parts?.map(p => p.content || p.text || '').join('') || m.content;
                    return `[${timeStr}][${role}]: ${txt}`;
                }).join('\n');

                let worldBookBlock = '';
                try {
                    if (typeof WBModule !== 'undefined') {
                        const matched = WBModule.getMatchingEntries(historyText, String(charId), 'lifestyle');
                        if (matched.length) {
                            worldBookBlock = matched.map(e => e.content.trim()).join('\n\n');
                        }
                    }
                } catch(e) {}

                // 根据是全新的一天，还是中途复查，给角色不同的原始计划参考
                // 🌟 修复1：在传给大模型的旧计划里，把 description 也带上，防止它忘掉
                const currentPlanText = isReflection 
                    ? JSON.stringify(sched.events.map(e => ({ time: e.time, title: e.title, location: e.location, description: e.description })))
                    : '（今日尚无具体计划，请根据基础作息全新排期）';

                // 🌟 修复2：在输出要求里，强制大模型必须返回 description
                const prompt = `[系统后台：角色自主意识与行程管理]
你是拥有独立生活轨迹的生命【${char?.name || '角色'}】。现在系统时间是 ${todayStr}。
系统每隔一段时间会在后台唤醒你，让你审视自己的时间线。
${worldBookBlock ? `\n【当前世界设定与重要背景（行程安排务必参考此设定）】：\n${worldBookBlock}\n` : ''}
【你默认的枯燥作息（仅供参考）】：
起床：${routine.wakeUp || '08:00'} / 就寝：${routine.sleep || '23:00'}
常规：${JSON.stringify(routine.events ||[])}

【你目前为今天定下的计划】：
${currentPlanText}

【近期跨次元聊天记录】：
${historyText || '（暂无记录）'}

【你的任务】：
请作为一个活生生的人，思考最近的聊天记录是否改变了你的现实安排。
1. 如果聊天里用户对你发出了邀约，且你答应了，你必须修改计划去赴约！
2. 如果昨晚聊太晚，你可以主动推迟今天的起床时间。
3. 如果聊天记录没什么特别的，且你对目前的计划很满意，请选择保持原样 ("action": "keep")。

【输出要求】：严格返回 JSON 格式。
{
  "action": "keep" | "update",
  "reason": "【今日宏观独白】：你对今天整体计划的决策想法",
  "dayProfile": { "mode": "workday/weekend", "mood": "你此刻的心情" },
  "events":[
    { 
      "time": "HH:MM", 
      "title": "事件简述", 
      "location": "地点", 
      "type": "工作/日常/社交", 
      "description": "你在这个环境下的具体动作、正在经历的事（客观行为）",
      "thought": "【瞬时心境】：你在这一刻脑子里在想什么？（主观私密念头，不可遗漏）", 
      "isDeviation": true/false,
      "devText": "仅当isDeviation为true时填入简短备注"
    }
  ]
}`;

                console.groupCollapsed(`[Lifestyle] 🚀 阶段 2: 智能体内省判定 (Reflection) - ${todayStr}`);
                console.log("%c【系统状态】", "color:#d84315; font-weight:bold;", isReflection ? "复查已存在的今日行程" : "生成全新今日行程");
                console.log("%c【System Prompt】", "color:#9c2b2b; font-weight:bold;", "\n" + prompt);

                const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
                console.log("%c【AI 决策输出】", "color:#2d6a4a; font-weight:bold;", "\n" + response);

                const aiData = _safeParseJSON(response);
                console.log("%c【解析结果】", "color:#1976d2; font-weight:bold;", `行动: ${aiData.action} | 独白: ${aiData.reason}`);
                console.groupEnd();
                
                // 🌟 核心逻辑：如果 AI 觉得不需要改，只更新 TTL 时间戳即可！极大节省算力！
                if (aiData.action === 'keep' && isReflection && sched) {
                    sched.generatedAt = Date.now();
                    // 👉 存下此刻的内心独白
                    sched.reflectionReason = aiData.reason || sched.reflectionReason; 
                    await DB.schedules.put(sched);
                    return sched;
                }

                // 如果是新生成，或者 AI 决定更新行程：
                let seqCounter = 1;
                const newEvents = (aiData.events ||[]).map(ev => ({
                    id: `ev_${Date.now()}_${Math.floor(Math.random()*10000)}`,
                    no: `SEQ-${String(seqCounter++).padStart(2, '0')}`,
                    time: ev.time,
                    title: ev.title,
                    location: ev.location || '未知',
                    icon: _guessIcon(ev.title, ev.type), 
                    state: ev.isDeviation ? 'deviation' : 'future', 
                    description: ev.description || '',
                    thought: ev.thought || '', // 🌟 新增：接住这个时刻特有的内心戏！
                    type: ev.type || '日常',
                    devText: ev.devText || ''
                }));

                newEvents.sort((a, b) => a.time.localeCompare(b.time));
                newEvents.forEach((ev, i) => ev.no = `SEQ-${String(i + 1).padStart(2, '0')}`);

                const newSchedule = {
                    id: schedId,
                    charId: String(charId),
                    date: dateStr,
                    version: SCHEDULE_VERSION,
                    generatedAt: Date.now(), 
                    // 👉 存下本次排期时的内心独白
                    reflectionReason: aiData.reason || '按部就班地度过今天，没什么特别的想法。',
                    dayProfile: {
                        mode: aiData.dayProfile?.mode || 'workday',
                        mood: aiData.dayProfile?.mood || 'steady',
                        isWeekend: false
                    },
                    events: newEvents
                };

                await DB.schedules.put(newSchedule);
                return newSchedule;

            } catch(e) {
                console.groupEnd();
                console.warn('[Lifestyle] LLM 智能推演失败，执行兜底:', e.message);
                if (isReflection && sched) {
                    sched.generatedAt = Date.now();
                    await DB.schedules.put(sched);
                    return sched;
                }
                return await _generateMathSchedule(charId, dateStr, routine, schedId);
            }
        })();

        _scheduleLocks.set(schedId, task);
        try { return await task; } finally { _scheduleLocks.delete(schedId); }
    }

    function _evaluateScheduleState(schedule, isToday) {
        if (!schedule || !schedule.events) return;
        
        if (!isToday) {
            schedule.events.forEach(ev => {
                if (ev.state !== 'deviation') ev.state = 'past';
            });
            return;
        }

        const now = new Date();
        const nowTimeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        
        let activeIndex = -1;
        for (let i = schedule.events.length - 1; i >= 0; i--) {
            if (schedule.events[i].time <= nowTimeStr) {
                activeIndex = i;
                break;
            }
        }

        schedule.events.forEach((ev, i) => {
            if (ev.state === 'deviation') return; 
            if (i < activeIndex) ev.state = 'past';
            else if (i === activeIndex) ev.state = 'active';
            else ev.state = 'future';
        });
    }

    async function _buildWeekData() {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // 抹平具体时间，只比较日期
        const currentDayOfWeek = today.getDay() || 7; 
        const monday = new Date(today);
        monday.setDate(today.getDate() - currentDayOfWeek + 1);

        const days =['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const weekData =[];

        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            d.setHours(0, 0, 0, 0); // 对齐时间基准
            
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const isToday = d.getTime() === today.getTime();
            const isFuture = d.getTime() > today.getTime(); // 👈 核心：判断是否是还没到的未来

            let eventCount = 0;
            let hasAnomaly = false;
            let anomalyText = '';
            
            // 只有“过去”和“今天”才会去推演/读取详细行程
            if (_currentDetailCharId && !isFuture) {
                try {
                    const sch = await _getOrCreateSchedule(_currentDetailCharId, dateStr);
                    if (sch && sch.events) {
                        eventCount = sch.events.length;
                        const deviations = sch.events.filter(e => e.state === 'deviation');
                        if (deviations.length > 0) {
                            hasAnomaly = true;
                            // 用更具设计感的双斜杠分隔，而不是分号
anomalyText = deviations.map(d => d.devText || `[${d.title}] 发生突发变动`).join(' // ');
                        }
                    }
                } catch(e) {}
            }

            weekData.push({
                day: days[i],
                date: String(d.getDate()).padStart(2, '0'),
                fullDate: dateStr,
                isToday: isToday,
                isFuture: isFuture, // 把未来标识传下去
                events: eventCount,
                duration: eventCount > 0 ? Math.floor(eventCount * 2.5) : 0, 
                // 未来显示 UNKNOWN，其余按数量显示负载
                load: isFuture ? 'UNKNOWN' : (eventCount >= 6 ? 'HIGH LOAD' : (eventCount >= 3 ? 'NORMAL' : (eventCount > 0 ? 'CHILL' : 'VOID'))),
                hasAnomaly: hasAnomaly,
                anomalyText: anomalyText
            });

            if (isToday) _selectedDateIndex = i;
        }
        return weekData;
    }

    // ==========================================
    // 详情概览页逻辑 (Detail View)
    // ==========================================
    async function openDetail(charId) {
        _currentDetailCharId = charId;
        const char = _chars.find(c => String(c.id) === String(charId));
        if (!char) return;

        document.getElementById('ls-detail-id').textContent = `${char.name} // ${String(char.id).padStart(2,'0')}`;
        
        let avatarUrl = 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=600&auto=format&fit=crop';
        if (char.avatarUrl) {
            avatarUrl = await Assets.getUrl(char.avatarUrl).catch(() => avatarUrl) || avatarUrl;
        }
        document.getElementById('ls-parallaxImg').src = avatarUrl;

        const routine = await DB.routines.get(charId).catch(() => null);
        const emptyOverlay = document.getElementById('ls-emptyState');
        
        if (!routine) {
            emptyOverlay.classList.add('active');
            _currentWeekData = _buildFakeWeekData(); 
        } else {
            emptyOverlay.classList.remove('active');
            _currentWeekData = await _buildWeekData();
        }

        _renderTemporalAxis();
        _updateBriefingData();

        document.getElementById('ls-detailView').classList.add('active');
    }

    function _buildFakeWeekData() {
        const today = new Date();
        const days =['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const weekData =[];
        for (let i = 0; i < 7; i++) {
            weekData.push({ day: days[i], date: String(today.getDate()), fullDate: '', isToday: i===3, events:0, duration:0, load:'VOID', hasAnomaly:false });
            if (i===3) _selectedDateIndex = i;
        }
        return weekData;
    }

    function closeDetail() {
        document.getElementById('ls-detailView').classList.remove('active');
        _currentDetailCharId = null;
    }

    function _renderTemporalAxis() {
        const track = document.getElementById('ls-axisTrack');
        track.innerHTML = '';
        _currentWeekData.forEach((item, index) => {
            const isSelected = index === _selectedDateIndex;
            const anomalyClass = item.hasAnomaly ? 'has-anomaly' : '';
            const selectedClass = isSelected ? 'is-selected' : '';

            const node = document.createElement('div');
            node.className = `ls-axis-node ${selectedClass}`;
            node.innerHTML = `
                <span class="ls-node-day">${item.day.charAt(0)}</span>
                <div class="ls-node-dot ${anomalyClass}"></div>
                <span class="ls-node-date">${item.date}</span>
            `;
            node.onclick = () => {
                if (index === _selectedDateIndex) return;
                _selectedDateIndex = index;
                _updateAxisStyles();
                _updateBriefingWithAnimation();
            };
            track.appendChild(node);
        });
    }

    function _updateAxisStyles() {
        document.querySelectorAll('#ls-axisTrack .ls-axis-node').forEach((node, index) => {
            node.classList.toggle('is-selected', index === _selectedDateIndex);
        });
    }

    function _updateBriefingData() {
        const data = _currentWeekData[_selectedDateIndex];
        if (!data) return;

        // 1. 修复顶部小标签：未来不能叫“归档”
        let labelText = "ARCHIVE BRIEF";
        if (data.isToday) labelText = "TODAY'S BRIEF";
        else if (data.isFuture) labelText = "TEMPORAL FOG // 迷雾";
        document.getElementById('ls-briefLabel').textContent = labelText;

        document.getElementById('ls-briefDate').textContent = `${data.day}, ${data.date}`;
        document.getElementById('ls-briefStatus').textContent = data.load;
        document.getElementById('ls-valEvents').textContent = String(data.events).padStart(2, '0');
        document.getElementById('ls-valDuration').textContent = String(data.duration).padStart(2, '0');

        const anomalyModule = document.getElementById('ls-anomalyModule');
        if (data.hasAnomaly) {
            anomalyModule.style.display = 'block';
            document.getElementById('ls-anomalyText').textContent = data.anomalyText;
        } else {
            anomalyModule.style.display = 'none';
        }

        const btn = document.getElementById('ls-btnEnterItinerary');
        const btnText = document.getElementById('ls-btnEnterText');
        const configBtn = document.querySelector('.ls-config-action'); // 获取底部的 ROUTINE CONFIG 按钮

        if (data.isFuture) {
            // 是未来：阻断进入，并把底下的 Routine Config 完全隐藏
            btn.classList.add('is-disabled');
            btnText.textContent = 'AWAITING SYNC... (时空迷雾)';
            if (configBtn) configBtn.style.display = 'none'; 
        } else if (data.events > 0) {
            // 正常有行程：恢复显示
            btn.classList.remove('is-disabled');
            btnText.textContent = 'ENTER ITINERARY LOG';
            if (configBtn) configBtn.style.display = 'flex';
        } else {
            // 过去的空缺天数：恢复显示
            btn.classList.add('is-disabled');
            btnText.textContent = 'NO EVENTS ARCHIVED';
            if (configBtn) configBtn.style.display = 'flex';
        }
    }

    function _updateBriefingWithAnimation() {
        const content = document.getElementById('ls-briefingContent');
        content.classList.add('is-animating');
        setTimeout(async () => {
            _updateBriefingData();
            content.classList.remove('is-animating');
        }, 200); 
    }

    // ==========================================
    // View 3: 具体动线页 (Itinerary Log)
    // ==========================================
    async function openItinerary() {
        const btn = document.getElementById('ls-btnEnterItinerary');
        if (btn.classList.contains('is-disabled')) return;

        const data = _currentWeekData[_selectedDateIndex];
        if (!data || !data.fullDate) return;

        const schedule = await _getOrCreateSchedule(_currentDetailCharId, data.fullDate);
        if (!schedule) { Toast.show('行程数据丢失'); return; }
        
        _evaluateScheduleState(schedule, data.isToday);
        _currentSchedule = schedule;

        const dObj = new Date(data.fullDate);
        const dayNames =['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const monthNames =['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        
        document.getElementById('iti-logNo').textContent = String(dObj.getMonth()+1).padStart(2,'0') + String(dObj.getDate()).padStart(2,'0');
        document.getElementById('iti-dayName').textContent = dayNames[dObj.getDay()];
        document.getElementById('iti-dateStr').textContent = `${monthNames[dObj.getMonth()]} ${dObj.getDate()}, ${dObj.getFullYear()}`;
        
        const activeEv = schedule.events.find(e => e.state === 'active');
        _activeItiId = activeEv ? activeEv.id : null;
        
        _renderItineraryTrack();

        document.getElementById('ls-itineraryView').classList.add('active');
    }

    function closeItinerary() {
        document.getElementById('ls-itineraryView').classList.remove('active');
        _currentSchedule = null;
    }

    function _renderItineraryTrack() {
        const track = document.getElementById('iti-scheduleTrack');
        if (!_currentSchedule || !_currentSchedule.events) {
            track.innerHTML = ''; return;
        }

        track.innerHTML = _currentSchedule.events.map(item => {
            const stateClass = item.state === 'past' ? 'is-past' : 
                               item.state === 'deviation' ? 'is-deviation' : 
                               item.state === 'active' || item.id === _activeItiId ? 'is-active' : '';
            
            const devHtml = item.state === 'deviation' ? `<span class="iti-dev-badge">[DEVIATION] ${item.devText || '突发偏移'}</span>` : '';

            return `
            <div class="iti-schedule-item ${stateClass}" onclick="LifestyleModule.toggleItiCard('${item.id}')">
                <div class="iti-spine-line"></div>
                <div class="iti-crosshair"><i class="ph-bold ph-plus"></i></div>
                <div class="iti-time-bg">${item.time}</div>
                
                <div class="iti-milk-glass-card">
                    <div class="iti-floating-icon"><i class="${item.icon}"></i></div>
                    
                    <div class="iti-card-header">
                        <span class="iti-item-no">${item.no}</span>
                        <h3 class="iti-card-title">${item.title}</h3>
                        ${devHtml}
                        <div class="iti-card-location">
                            <i class="ph-bold ph-map-pin"></i>
                            <span>${item.location}</span>
                        </div>
                    </div>

                    <div class="iti-expand-panel">
                        <!-- 🌟 删掉了这里的 p 标签，强迫使用按钮查看详情 -->
                        <div class="iti-editorial-actions" style="border-top: none; padding-top: 0;">
                           <div class="iti-action-group">
                                <!-- 🌟 将 CONTEXT 改为 碎碎念 -->
                                <button class="iti-action-btn" onclick="event.stopPropagation(); LifestyleModule.showEventContext('${item.id}')">碎碎念</button>
                                <!-- 🌟 将 THOUGHTS 改为 内心 -->
                                <button class="iti-action-btn" onclick="event.stopPropagation(); LifestyleModule.showEventThoughts('${item.id}')">内心</button>
                            </div>
                            
                            <div class="iti-sync-btn" style="color: #D93A3A; cursor: default; pointer-events: none; flex-shrink: 0; white-space: nowrap; margin-left: auto;">
                                <div class="iti-eq-visualizer">
                                    <div class="iti-eq-bar"></div><div class="iti-eq-bar"></div><div class="iti-eq-bar"></div>
                                </div>
                                AUTO-SYNCED
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    function toggleItiCard(id) {
        _activeItiId = (_activeItiId === id) ? null : id;
        _renderItineraryTrack();
    }
    
    function showEventContext(id) {
        const ev = _currentSchedule.events.find(e => e.id === id);
        if(!ev) return;
        
        document.getElementById('ls-dataModalTitle').textContent = `碎碎念 // ${ev.no}`;
        
        document.getElementById('ls-dataModalContent').innerHTML = `
            <div style="font-family:'Space Mono', monospace; font-size:9px; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">[ Environmental Data ]</div>
            <div style="font-family:'Space Mono', monospace; font-size:12px; color:#111; font-weight:700; margin-bottom:6px;">LOC: ${ev.location}</div>
            <div style="font-family:'Space Mono', monospace; font-size:10px; color:#555; margin-bottom:20px;">TYPE: ${ev.type}</div>
            
            <div style="font-family:'Space Mono', monospace; font-size:9px; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">[ Action Observation ]</div>
            <div style="font-family:'Noto Sans SC', sans-serif; font-size:13px; color:#333; line-height:1.7; border-left:2px solid #111; padding-left:12px;">
                ${ev.description || '目标正在执行既定日程，无显著异常动作。'}
            </div>
        `;
        document.getElementById('ls-dataModal').classList.add('active');
    }

    function showEventThoughts(id) {
        const ev = _currentSchedule.events.find(e => e.id === id);
        if(!ev) return;
        
        document.getElementById('ls-dataModalTitle').textContent = `内心 // ${ev.no}`;
        
        // 读取全天的宏观决策
        let macroReason = _currentSchedule.reflectionReason || '（平稳度过今天，无特殊宏观想法）';
        // 读取此时此刻的内心戏
        let microThought = ev.thought || '（专注于眼前的事，脑子里暂时没有杂念）';
        
        let devHtml = '';
        if (ev.state === 'deviation') {
            devHtml = `
                <div style="font-family:'Space Mono', monospace; font-size:9px; color:#D93A3A; text-transform:uppercase; letter-spacing:1px; margin-top:20px; margin-bottom:12px;">[ Detected Deviation ]</div>
                <div style="font-family:'Noto Sans SC', sans-serif; font-size:13px; color:#D93A3A; line-height:1.7; border-left:2px solid #D93A3A; padding-left:12px;">
                    ${ev.devText}
                </div>
            `;
        }

        document.getElementById('ls-dataModalContent').innerHTML = `
            <div style="font-family:'Space Mono', monospace; font-size:9px; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">[ Macro Directive // 宏观决策 ]</div>
            <div style="font-family:'Noto Sans SC', sans-serif; font-size:12px; color:#666; line-height:1.6; font-style:italic; border-left:2px solid #ccc; padding-left:12px; margin-bottom:20px;">
                "${macroReason}"
            </div>

            <div style="font-family:'Space Mono', monospace; font-size:9px; color:#111; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">[ Instant Thought // 瞬时心境 ]</div>
            <div style="font-family:'Noto Sans SC', sans-serif; font-size:14px; color:#111; line-height:1.7; font-weight:500; border-left:2px solid #111; padding-left:12px;">
                "${microThought}"
            </div>
            ${devHtml}
        `;
        document.getElementById('ls-dataModal').classList.add('active');
    }

    // ==========================================
    // AI 唤醒作息引擎 (The Genesis - 阶段 1)
    // ==========================================
    async function generateRoutine() {
        if (!_currentDetailCharId) return;
        const char = _chars.find(c => String(c.id) === String(_currentDetailCharId));
        if (!char) return;

        const btn = document.querySelector('.ls-init-btn');
        if (btn) {
            btn.dataset.origText = btn.innerHTML;
            btn.innerHTML = `<i class="ph-bold ph-spinner" style="animation: spin 1s linear infinite;"></i> SYNCING...`;
            btn.style.pointerEvents = 'none';
        }

        try {
            const activeApi = await DB.api.getActive();
            if (!activeApi) throw new Error('未配置 API，无法推演作息');

            const prompt = `[系统后台调度：生成角色基础作息模板]
请根据以下角色档案，推理出 ta 在工作日的一个典型 24 小时作息框架。
角色名：${char.name}
性格与背景：${char.persona}
${char.mbti ? 'MBTI：' + char.mbti : ''}

【输出格式要求】：
严格返回 JSON 对象，不要任何其他废话。
{
  "wakeUp": "HH:MM", // 起床时间
  "sleep": "HH:MM", // 就寝时间
  "mainActivity": "核心身份与主线活动（如：独立插画师 / 医学生），10个字以内",
  "tags":["夜猫子", "工作狂", "规律作息"], // 描述生活状态的3个短标签
  "events":[
    // 请提供 5-8 个关键的时间锚点事件，贯穿起床到睡觉
    { "time": "08:00", "title": "手冲咖啡与晨读", "location": "家里阳台", "status": "正在喝咖啡", "type": "日常" },
    { "time": "10:00", "title": "处理核心业务", "location": "工作室", "status": "专心工作中", "type": "工作" }
  ]
}`;

            console.groupCollapsed(`[Lifestyle] 🧠 阶段 1: 基础作息推演 (Routine) - ${char.name}`);
            console.log("%c【System Prompt】", "color:#9c2b2b; font-weight:bold;", "\n" + prompt);

            const response = await ApiHelper.chatCompletion(activeApi,[{ role: 'user', content: prompt }]);
            
            console.log("%c【AI 原始输出】", "color:#2d6a4a; font-weight:bold;", "\n" + response);

            const routineData = _safeParseJSON(response);
            
            console.log("%c【解析成功】", "color:#1976d2; font-weight:bold;", routineData);
            console.groupEnd();

            routineData.charId = String(_currentDetailCharId);
            routineData.updatedAt = Date.now();

            await DB.routines.put(routineData);
            Toast.show('作息时间轴已成功推演 ✦');
            document.getElementById('ls-emptyState')?.classList.remove('active');
            
            _currentWeekData = await _buildWeekData();
            _renderTemporalAxis();
            _updateBriefingData();

            openRoutineConfig();

        } catch (e) {
            console.groupEnd(); // 防止报错时日志没闭合
            console.error('[Lifestyle] generateRoutine Error:', e);
            Toast.show('引擎唤醒失败：' + e.message);
        } finally {
            if (btn && btn.dataset.origText) {
                btn.innerHTML = btn.dataset.origText;
                btn.style.pointerEvents = 'auto';
            }
        }
    }
    // ==========================================
    // 作息管理面板 (Routine Config)
    // ==========================================
    async function openRoutineConfig() {
        if (!_currentDetailCharId) return;
        const routine = await DB.routines.get(_currentDetailCharId).catch(() => null);
        if (!routine) { Toast.show('系统缺失该角色作息数据，请先初始化'); return; }

        const contentBox = document.getElementById('ls-routineContent');
        const tagsHtml = (routine.tags ||[]).map(t => `<span class="ls-rt-tag">${t}</span>`).join('');
        const timelineHtml = (routine.events ||[]).map(ev => `
            <div class="ls-rt-event">
                <div class="ls-rt-time">${ev.time}</div>
                <div class="ls-rt-title">${ev.title}</div>
                <div class="ls-rt-loc"><i class="ph-fill ph-map-pin"></i> ${ev.location} &nbsp;&nbsp; <i class="ph-fill ph-user-focus"></i> ${ev.status}</div>
            </div>
        `).join('');

        contentBox.innerHTML = `
            <div style="font-family:'Playfair Display', 'Noto Serif SC', serif; font-style: italic; font-size: 22px; font-weight: 600; margin-bottom: 12px;">${routine.mainActivity || 'Daily Routine'}</div>
            <div class="ls-routine-tags">${tagsHtml}</div>
            <div class="ls-routine-meta">
                <div class="ls-meta-box"><span class="ls-meta-label">WAKE UP / 唤醒</span><span class="ls-meta-val">${routine.wakeUp || '--:--'}</span></div>
                <div class="ls-meta-box"><span class="ls-meta-label">SLEEP / 休眠</span><span class="ls-meta-val">${routine.sleep || '--:--'}</span></div>
            </div>
            <div style="font-family:'Space Mono', monospace; font-size:10px; color:#888; letter-spacing:2px; margin-bottom:16px; text-transform:uppercase;">Time Schedule</div>
            <div class="ls-routine-timeline">${timelineHtml}</div>
        `;

        document.getElementById('ls-routineModal').classList.add('active');
    }

    function closeRoutineConfig() {
        document.getElementById('ls-routineModal').classList.remove('active');
    }

    async function rebuildRoutine() {
        const confirmOverlay = document.getElementById('ls-confirmOverlay');
        const execBtn = document.getElementById('ls-btn-confirm-exec');
        
        // 显示确认弹窗
        confirmOverlay.classList.add('active');
        
        // 绑定一次性点击事件
        execBtn.onclick = async () => {
            confirmOverlay.classList.remove('active');
            closeRoutineConfig(); // 关闭底部的配置面板

            // 🌟 重要：清理今天该角色的排期缓存，迫使系统使用 50 条消息新逻辑重新推理
            if (_currentDetailCharId) {
                try {
                    const today = new Date();
                    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                    await DB.schedules.del(`sch_${_currentDetailCharId}_${dateStr}`);
                } catch(e) {}
            }

            // 显示“空状态”进行重新生成
            document.getElementById('ls-emptyState').classList.add('active');
            generateRoutine(); 
        };
    }

    // ==========================================
    // 暴露给 ChatModule 顶栏的状态接口
    // ==========================================
    async function getCurrentStatus(charId) {
    try {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        let schedule = null;
        try {
            schedule = await DB.schedules.get(String(charId), dateStr);
        } catch (e) {}

        // 1) 优先读当天 schedule
        if (schedule && Array.isArray(schedule.events) && schedule.events.length > 0) {
            let currentEvent = schedule.events[0];

            for (let i = schedule.events.length - 1; i >= 0; i--) {
                if (schedule.events[i].time <= nowTimeStr) {
                    currentEvent = schedule.events[i];
                    break;
                }
            }

            if (currentEvent.state === 'deviation') {
                return currentEvent.devText
                    ? `⚠ ${currentEvent.devText}`
                    : `⚠ ${currentEvent.title}`;
            }

            if (currentEvent.state === 'active') {
                return currentEvent.title || currentEvent.status || 'ACTIVE RECORD';
            }

            if (currentEvent.state === 'past') {
                return currentEvent.title ? `刚结束 ${currentEvent.title}` : 'ACTIVE RECORD';
            }

            return currentEvent.title || currentEvent.status || 'ACTIVE RECORD';
        }

        // 2) 没有当天 schedule，就回退到 routine
        const routine = await DB.routines.get(String(charId));
        if (!routine || !Array.isArray(routine.events) || routine.events.length === 0) {
            return 'ACTIVE RECORD';
        }

        let currentEv = routine.events[0];
        for (const ev of routine.events) {
            if (ev.time <= nowTimeStr) currentEv = ev;
            else break;
        }

        return currentEv.title || currentEv.status || 'ACTIVE RECORD';
    } catch (e) {
        return 'ACTIVE RECORD';
    }
}
    
    // 🌟 新增：提取今日生活轨迹，喂给大模型的 System Prompt
    async function getPromptContext(charId) {
        try {
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            
            // 获取今天的真实行程（带随机波动的）
            const sched = await _getOrCreateSchedule(charId, dateStr);
            if (!sched || !sched.events || sched.events.length === 0) return '';

            let text = '\n# 你的今日生活轨迹 (Today\'s Schedule)\n（请将此作为你今天的既定背景。不要生硬汇报，但在聊天中可极其自然地顺口提及你刚做完/正在做/接下来要去做的事，展现真实生活感。）\n';
            
            const nowTimeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            let currentEvent = sched.events[0];

            sched.events.forEach(ev => {
                const devMark = ev.state === 'deviation' ? '[突发变更] ' : '';
                text += `- ${ev.time} ${devMark}${ev.title} @ ${ev.location}\n`;
                if (ev.time <= nowTimeStr) currentEvent = ev; // 找到当前时间段的事件
            });

            if (currentEvent) {
                text += `\n**此刻（${nowTimeStr}）你的状态：** 正在【${currentEvent.location}】进行「${currentEvent.title}」。`;
                if (currentEvent.state === 'deviation') {
                    text += `（⚠️ 注意：此行程为突发状况：${currentEvent.devText || '计划变更'}，请在回复中表现出相应的反应）`;
                }
                text += '\n';
            }

            return text;
        } catch (e) {
            console.error('[Lifestyle] getPromptContext error', e);
            return '';
        }
    }

    return { 
        init, onEnter, openDetail, closeDetail, 
        generateRoutine, getCurrentStatus, 
        openRoutineConfig, closeRoutineConfig, rebuildRoutine,
        openItinerary, closeItinerary, toggleItiCard, 
        getPromptContext,showEventContext, 
        showEventThoughts
    };
})();