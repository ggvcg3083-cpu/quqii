// updater.js
'use strict';

const UpdateModule = (() => {
  // 🌟 每次更新时，只需要修改这个版本号和下面的更新内容即可！
  const CURRENT_VERSION = 'v4.5.9';
  const VERSION_KEY = 'chillos-last-version';
  const READ_SECONDS = 20; // ⏳ 强制阅读秒数：按钮锁定，倒计时结束才能点（测试期=1，正式分发改回20）

 const CHANGELOG = [
  "✦ 思维链 COT 新增【预设 · 存好几套思考方式，换着用不用重填】（线下剧情模式）：在「思维链 (COT)」编辑器顶部多了一栏预设——把当前这套思考方式「存为」一个预设，之后在下拉里一点就能载入，不用每次重写。预设所有角色通用，温柔向、高张力、专治八股各存一套，换角色换玩法随手切。",
  "✦ 全新功能【思维链 COT · 让角色落笔前先「想」一遍】（线下剧情模式）：给剧情角色装一个可自定义的思考步骤——它写正文前会先按你写的思路想一遍（比如「此刻的情绪」「上一幕的张力」「下一步往哪推」），想完再动笔。好处两个：一是回复更贴人、更接得住前文，不再答非所问；二是你能在思考步骤里加「落笔前自检」，专治剧情里常冒的八股翻译腔（「空气中弥漫着」「嘴角勾起一抹弧度」）、超雄爹味、OOC——世界书压不住的，让它自己过一遍脑子收回来。剧情聊天页 ＋菜单 →「思维链 (COT)」开启并填写；不写就完全不影响，一切照旧。附带示例模板一键插入，思考长度上限可调；角色想了什么，在＋菜单「观测台」里能看到。详见配套说明。",
  "✦ 全新功能【环境感知 · 让 TA 感知到你此刻的真实处境】：给角色装上对现实环境的感知。开启后，你每次聊天（以及视频通话时），角色会自然地带出你那边的真实天气、你所在的城区街道，甚至你背景在放的声音——「你那边在下雨啊，带把伞」「这么晚还没睡」「背景在放歌？」。像真人一样偶尔提起，而不是机械播报。桌面「音画设置 → 环境感知」进入，开个开关即可。详见配套教程。",
  "✦ 环境感知【位置 + 天气 + 地名 · 零配置，开箱即用】：位置、天气、地名三样纯本地采集，用免费公开接口，不需要任何部署，打开总开关、允许定位就能用。地名会把经纬度转成「城市 · 城区 · 街道」，让角色聊起你所在的地段。设置页底部「测试采集」可一键自检，绿勾即生效。",
  "✦ 环境感知【环境音 · 让角色「听见」你的背景声】：录 4 秒环境音交给能听懂音频的 AI，返回「在听音乐 / 有人交谈 / 安静 / 雨声」等标签注入对话，视频通话里角色也能听见并自然反应。环境音走你自己的 Supabase 中转、原始录音不保存；在环境感知页选一个已配好的 API（可与聊天不同，如单独用 Gemini）、拉取并选一个支持音频的模型即可。详见配套教程。",
  "✦ 环境感知【隐私与自检 · 全程可控、手机可排错】：所有开关默认关闭，不开就完全不采集；位置天气纯本地处理，环境音只留文字标签、录音不上传第三方。每项采集成功 / 失败都在设置页「测试采集」里直接显示原因，手机上也能排查。",
];

  // 动态注入弹窗的 CSS 样式
  function injectCSS() {
    if (document.getElementById('updater-css')) return;
    const style = document.createElement('style');
    style.id = 'updater-css';
    style.textContent = `
      .upd-overlay {
        position: absolute; inset: 0; z-index: 9999;
        background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none; transition: opacity 0.4s ease;
      }
      .upd-overlay.active { opacity: 1; pointer-events: auto; }
      .upd-card {
        background: var(--bg-card, #fff); border: 1px solid var(--border-line, #e0e0e0);
        border-radius: 24px; padding: 32px 24px; width: 85%; max-width: 320px;
        box-shadow: 0 40px 80px rgba(0,0,0,0.15); position: relative; overflow: hidden;
        transform: translateY(20px) scale(0.95); transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
      }
      .upd-overlay.active .upd-card { transform: translateY(0) scale(1); }
      .upd-watermark {
        position: absolute; top: -30px; right: -20px; font-family: 'Playfair Display', serif;
        font-size: 160px; font-style: italic; font-weight: 300; color: var(--text-main, #121212);
        opacity: 0.03; line-height: 1; pointer-events: none; z-index: 0;
      }
      .upd-header { margin-bottom: 24px; position: relative; z-index: 1; }
      .upd-title { font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 600; font-style: italic; color: var(--text-main, #121212); line-height: 1; }
      .upd-version { font-family: 'Space Mono', monospace; font-size: 0.65rem; color: var(--text-sub, #888); letter-spacing: 2px; text-transform: uppercase; margin-top: 8px; font-weight: 700; }
      .upd-list { position: relative; z-index: 1; max-height: 40vh; overflow-y: auto; margin-bottom: 32px; padding-right: 4px; }
      .upd-list::-webkit-scrollbar { display: none; }
      .upd-item { font-family: 'Noto Sans SC', sans-serif; font-size: 0.85rem; color: var(--text-main, #333); line-height: 1.6; margin-bottom: 12px; }
      .upd-btn {
        width: 100%; padding: 14px 0; background: var(--text-main, #121212); color: var(--bg-device, #fff);
        border: none; border-radius: 100px; font-family: 'Space Mono', monospace; font-size: 0.8rem;
        font-weight: 600; letter-spacing: 2px; text-transform: uppercase; cursor: pointer;
        position: relative; z-index: 1; transition: transform 0.2s; box-shadow: 0 10px 20px rgba(0,0,0,0.1);
      }
      .upd-btn:active { transform: scale(0.96); }
      .upd-btn.counting {
        background: var(--text-sub, #999); cursor: not-allowed; box-shadow: none; opacity: 0.65;
      }
      .upd-btn.counting:active { transform: none; }
    `;
    document.head.appendChild(style);
  }

  // 动态创建并插入 DOM
  function createModal() {
    if (document.getElementById('updater-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'updater-overlay';
    overlay.className = 'upd-overlay';
    
    let listHtml = CHANGELOG.map(item => `<div class="upd-item">${item}</div>`).join('');

    overlay.innerHTML = `
      <div class="upd-card">
        <div class="upd-watermark">U</div>
        <div class="upd-header">
          <div class="upd-title">System Update</div>
          <div class="upd-version">VERSION // ${CURRENT_VERSION}</div>
        </div>
        <div class="upd-list">${listHtml}</div>
        <button class="upd-btn counting" id="upd-confirm-btn" disabled onclick="UpdateModule.closeAndSave()">${READ_SECONDS}s</button>
      </div>
    `;
    // 挂载到 body 或者 device 容器内
    const device = document.querySelector('.device') || document.body;
    device.appendChild(overlay);
  }

  function checkUpdate() {
    // 使用 localStorage 进行简单的本地版本校验
    const savedVersion = localStorage.getItem(VERSION_KEY);
    
    // 如果没有记录（新用户）或者版本号变了（老用户更新了），则弹出
    if (savedVersion !== CURRENT_VERSION) {
      injectCSS();
      createModal();
      // 稍微延迟一下，配合系统的进入动画，显得更丝滑
      setTimeout(() => {
        const overlay = document.getElementById('updater-overlay');
        if (overlay) overlay.classList.add('active');
        startCountdown();
      }, 800);
    }
  }

  // ⏳ 按钮倒计时：READ_SECONDS 秒内锁定，结束后解锁为 Got it
  function startCountdown() {
    const btn = document.getElementById('upd-confirm-btn');
    if (!btn) return;
    let left = READ_SECONDS;
    btn.classList.add('counting');
    btn.disabled = true;
    btn.textContent = `${left}s`;
    const timer = setInterval(() => {
      left--;
      if (left > 0) {
        btn.textContent = `${left}s`;
      } else {
        clearInterval(timer);
        btn.classList.remove('counting');
        btn.disabled = false;
        btn.textContent = 'Got it';
      }
    }, 1000);
  }

  function closeAndSave() {
    const btn = document.getElementById('upd-confirm-btn');
    if (btn && btn.disabled) return; // 倒计时未结束，不允许关闭
    const overlay = document.getElementById('updater-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      // 记录最新版本号，下次就不弹了
      localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
      // 等待动画结束后移除 DOM
      setTimeout(() => overlay.remove(), 400);
    }
  }

  return { checkUpdate, closeAndSave };
})();