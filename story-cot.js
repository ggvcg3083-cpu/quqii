/* ============================================================================
 * story-cot.js — 单人剧情【自定义思维链 COT】独立子模块
 * ----------------------------------------------------------------------------
 * 干什么：把模型自己的思维链"卡掉"，换成用户写的思考方式——
 *   AI 在写剧情正文前，先按用户的「思考方式」在 <cot></cot> 里做一次简短思考，
 *   正文渲染前把思考段剥掉（顺手也剥推理模型漏出来的 <think>），
 *   思考内容存进消息（msg.cot），在「观测台 CONSOLE」里可看，不进正文。
 *
 * 设计约定：
 *   · 用户没写思考方式（或开关关闭）= 完全不注入，默认行为一字不变
 *   · 内置导演 prompt 原样不动，本模块只做纯增量注入
 *   · 宏：只认 {{char}} / {{user}}（大小写不敏感），裸词 char/user 不认（防误伤正文）
 *   · 隔离键：sc-cot-*-${charId}，与状态栏 sc-status-* 同风格、互不干扰
 *   · 自带弹窗 + 全套 CSS，零依赖主文件（仅用到全局 DB / Toast）
 *
 * 主文件 wiring（共 6 处，全部守卫式一行接入，详见每个函数注释）：
 *   1) <script src="story-cot.js"></script>（跟在 story-status.js 后面）
 *   2) ＋菜单 popover 加按钮 → StoryChatModule.openCotEditor()
 *   3) StoryChatModule return 里加 openCotEditor（照抄 openStatusEditor 三行）
 *   4) _buildStorySystemPrompt 末尾拼 await StoryCOT.buildPrompt(cid, charName, userName)
 *   5) _triggerAI 剥完 [NOVEL_IMG] 后调 StoryCOT.extract(finalContent)，
 *      cot 存 msg.cot（落库），clean 当正文
 *   6) openContextConsole 里 html += await StoryCOT.consoleHtml(cid)
 *
 * 暴露：window.StoryCOT = { isOn, openEditor, buildPrompt, extract, consoleHtml }
 * ========================================================================== */
const StoryCOT = (() => {
  'use strict';

  const _DB = () => (typeof DB !== 'undefined' ? DB : null);
  const _toast = (m) => { try { if (typeof Toast !== 'undefined' && Toast.show) Toast.show(m); } catch (e) {} };
  const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ── 存储键：sc- 前缀 + charId 隔离 ───────────────────────── */
  const K_ON  = (cid) => `sc-cot-on-${cid}`;
  const K_TXT = (cid) => `sc-cot-txt-${cid}`;
  const K_LEN = (cid) => `sc-cot-len-${cid}`;
  const K_PRESETS = 'sc-cot-presets';            // 全局共享预设池（不绑角色），存 [{name,txt,len}]

  const LEN_DEFAULT = 500;                       // 思考长度上限默认值（字）
  const _clampLen = (v) => Math.min(2000, Math.max(50, parseInt(v, 10) || LEN_DEFAULT));

  /* ── 预设池读写（全局共享，所有角色通用）──────────────────────
   * 存一个 JSON 数组在 DB.settings 的 sc-cot-presets 键里。
   * 载入 = 把某套思考方式+长度填进当前编辑框（不立即落库，用户再点保存才生效）。 */
  async function _getPresets() {
    const db = _DB(); if (!db) return [];
    try {
      const raw = await db.settings.get(K_PRESETS);
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(arr) ? arr.filter(p => p && p.name) : [];
    } catch (e) { return []; }
  }
  async function _setPresets(arr) {
    const db = _DB(); if (!db) return false;
    try { await db.settings.set(K_PRESETS, JSON.stringify(arr || [])); return true; }
    catch (e) { return false; }
  }

  /* ── 用户示例模板（编辑器里一键插入，教结构用）────────────────
   * 前半是"怎么想"，后半是"落笔前自检"——治剧情模式常见的八股词/超雄/OOC。
   * 用户可自由删改，雷点因人而异（有人烦翻译腔、有人专烦爹味）。 */
  const EXAMPLE_TPL =
`1. {{char}} 此刻的情绪和真实想法是什么？和表面言行有什么落差？
2. {{user}} 刚才的言行透露了什么？{{char}} 有没有接住？
3. 这一幕的张力点在哪？下一步往哪推最自然（环境变化 / NPC / 情感转折选一个）？
4. 一句话定基调：节奏、氛围、镜头感。

—— 落笔前自检（写完正文前，在脑子里过一遍，有问题就改）——
5. 八股/翻译腔自查：有没有"空气中弥漫着""嘴角勾起一抹弧度""不容置疑的气息""危险地眯起眼""低沉的嗓音在耳边响起"这类 AI 烂梗和翻译腔？有就删掉，换成 {{char}} 这个具体的人会有的、带体感的写法。
6. 超雄/爹味自查：这段的强势、命令、占有欲，是 {{char}} 人设本来就有的，还是我自己滑成了霸总爹味？对照人设——不该霸道的角色别硬凹，该温柔的地方别端着。
7. OOC 自查：这段话、这个反应，{{char}} 真的会这么说这么做吗？有没有为了推剧情让 TA 突然变了个人？不像就收回来。
8. 人称/节奏：人称对不对、有没有把 {{user}} 写成工具人、这一段是不是又臭又长该收了。`;

  /* ── 存储读写 ─────────────────────────────────────────────── */
  async function _getOn(cid) {
    const db = _DB(); if (!db || cid == null) return false;
    try { return !!(await db.settings.get(K_ON(cid))); } catch (e) { return false; }
  }
  async function _getTxt(cid) {
    const db = _DB(); if (!db || cid == null) return '';
    try { return String((await db.settings.get(K_TXT(cid))) || ''); } catch (e) { return ''; }
  }
  async function _getLen(cid) {
    const db = _DB(); if (!db || cid == null) return LEN_DEFAULT;
    try { return _clampLen(await db.settings.get(K_LEN(cid))); } catch (e) { return LEN_DEFAULT; }
  }
  // 生效条件 = 开关开 且 用户真的写了内容
  async function isOn(cid) {
    if (!(await _getOn(cid))) return false;
    return !!(await _getTxt(cid)).trim();
  }

  /* ── 宏替换：只认 {{char}} / {{user}}，大小写不敏感 ─────────── */
  function _fillMacros(text, charName, userName) {
    return String(text || '')
      .replace(/\{\{\s*char\s*\}\}/gi, charName || '角色')
      .replace(/\{\{\s*user\s*\}\}/gi, userName || '用户');
  }

  /* ── ④ 提示词段：拼进 _buildStorySystemPrompt 末尾 ───────────
   *   没启用/没内容 → 返回 ''（什么都不注入，默认行为不变） */
  async function buildPrompt(cid, charName, userName) {
    if (!(await isOn(cid))) return '';
    const userTxt = _fillMacros((await _getTxt(cid)).trim(), charName, userName);
    if (!userTxt) return '';
    const lenCap = await _getLen(cid);
    return `
# ⚠️ 输出格式·最高优先级·硬性要求（凌驾于其它所有写作规则之上）
你这次回复的【第一个字符必须是 <】，回复【必须以 <cot> 开头】。不以 <cot> 开头的回复一律视为格式错误、无效回复。
执行顺序不可颠倒：先输出 <cot>思考</cot>，紧接着才写剧情正文。无论前面那些"电影导演/字数/分镜"的要求多强，都不能让你跳过 <cot> 直接写正文——思考是这次回复的第一步，没有例外。

标准格式长这样（严格照此结构，思考内容换成你自己按下面思考方式想的）：
<cot>
（在这里按「思考方式」逐条简短思考）
</cot>
（这里开始写剧情正文）

规则：
1. <cot> 内按下面的「思考方式」逐条想。平实白话，不追求文学性，总长 ${lenCap} 字以内。
2. 【必须逐条走完，不许中途停】下面「思考方式」里有几条你就想几条，从第一条到最后一条一条都不能跳——尤其排在后面的检查/自检类条目（越靠后越容易被你偷懒略过，恰恰不能略）。只想了前几条就去写正文，属于严重格式错误。走完全部条目，</cot> 才能闭合。
3. 这是你唯一允许的思考步骤——不要再用任何其它形式的推理（包括 <think> 等），走完所有条目后立即进正文。
4. 剧情正文里绝对不能出现 <cot> 标签或思考内容；正文的字数、排版、人称等既定规则不变，思考不计入正文字数。

## 思考方式（<cot> 里就按这个想，有几条走几条，一条都不许跳）
${userTxt}

# 再强调两点：① 你的回复必须从 <cot> 这三个字符开始（第一个字不是 < 就重来）；② </cot> 闭合前，上面每一条都得想到，特别是最后那几条自检类的，漏一条都算没做完。`;
  }

  /* ── ⑤ 剥离：AI 回复到手后调用 ────────────────────────────────
   *   返回 { clean: 干净正文, cot: 思考文本('' 表示没有) }
   *   顺手把推理模型内联漏出的 <think>/<thinking> 一起剥掉（历史 bug 白送修复）。 */
  function extract(raw) {
    const found = [];
    let clean = String(raw || '');
    // 1) 正常闭合的 <cot>/<think>/<thinking> 成对剥离（可能多段）
    clean = clean.replace(/<(cot|think|thinking)>([\s\S]*?)<\/\1\s*>/gi, (_, tag, inner) => {
      if (inner.trim()) found.push(inner.trim());
      return '';
    });
    // 2) 兜底：模型忘写闭标签 → 从开标签吞到第一个空行（没有空行则吞到结尾）
    clean = clean.replace(/<(cot|think|thinking)>([\s\S]*?)(?=\n\s*\n|$)/i, (_, tag, inner) => {
      if (inner.trim()) found.push(inner.trim());
      return '';
    });
    // 3) 清掉游离的残缺标签
    clean = clean.replace(/<\/?(cot|think|thinking)\s*>/gi, '');
    return { clean: clean.trim(), cot: found.join('\n\n') };
  }

  /* ── ⑥ 观测台段落：拼进 openContextConsole 的 html ──────────── */
  async function consoleHtml(cid) {
    const db = _DB(); if (!db || cid == null) return '';
    const on = await isOn(cid);
    let latestCot = '', latestTs = 0, newestNoCot = false;
    if (on) {
      try {
        // charId 存的是字符串，getPage 要 String，否则取空（同 cloud 侧的坑）
        const msgs = await db.messages.getPage(String(cid), 0, 30).catch(() => []);
        let seenAssistant = false;
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (!m || m.role !== 'assistant') continue;
          // 最新那条角色消息若没 cot，单独标记出来，别让人误以为"没更新"
          if (!seenAssistant && !m.cot) newestNoCot = true;
          seenAssistant = true;
          if (m.cot) { latestCot = m.cot; latestTs = m.timestamp; break; }
        }
      } catch (e) {}
    }
    let bodyHtml;
    if (!on) {
      bodyHtml = '<div style="color:var(--sc-gray); font-style:italic;">未启用（＋菜单 → 思维链 COT 里开启并填写思考方式）</div>';
    } else if (!latestCot) {
      bodyHtml = '<div style="color:var(--sc-gray); font-style:italic;">已启用，等待下一条 AI 回复后可见思考记录</div>';
    } else {
      const d = new Date(latestTs);
      const pad = (n) => String(n).padStart(2, '0');
      const ts = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      bodyHtml = `<div style="background:rgba(0,0,0,0.02); padding:8px; border-radius:6px; border:0.5px solid rgba(0,0,0,0.05);">
          <div style="font-family:'Space Mono', monospace; font-size:9px; color:var(--sc-gray); margin-bottom:4px; display:flex; justify-content:space-between;">
            <span>最近一次思考</span><span>${ts}</span>
          </div>
          <div style="white-space:pre-wrap; line-height:1.6;">${_esc(latestCot)}</div>
        </div>`;
    }
    // 最新一条角色回复没输出思维链 → 明确提示，别让人以为观测台坏了/没更新
    const noCotHint = (on && newestNoCot)
      ? '<div style="color:#b5651d; font-style:italic; margin-top:6px; font-size:0.9em;">⚠️ 最新这条回复没有输出思维链（模型这次没按 &lt;cot&gt; 格式返回，多为模型不遵格式所致）。上面显示的是更早一条有思维链的记录。</div>'
      : '';
    return `<div style="margin-bottom:20px;">
        <div style="font-family:'Space Mono', monospace; font-size:10px; color:var(--sc-gray); margin-bottom:8px; border-bottom:1px dashed var(--sc-line); padding-bottom:4px;">CHAIN OF THOUGHT / 思维链 (${on ? 'ON' : 'OFF'})</div>
        ${bodyHtml}
        ${noCotHint}
      </div>`;
  }

  /* ── ②③ 编辑器：底部抽屉弹窗 ─────────────────────────────── */
  function _ensureRoot() {
    let root = document.getElementById('sct-dialog-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sct-dialog-root';
      root.className = 'sct-dlg';
      // 挂 body：剧情容器有 transform，内部 fixed 不相对视口（同 story-status 的坑）
      document.body.appendChild(root);
    }
    return root;
  }

  function _presetOptionsHtml(presets) {
    return ['<option value="">选择预设载入…</option>']
      .concat(presets.map((p, i) => `<option value="${i}">${_esc(p.name)}</option>`))
      .join('');
  }

  async function openEditor(cid) {
    if (cid == null) { _toast('未指定角色'); return; }
    const on = await _getOn(cid);
    const txt = await _getTxt(cid);
    const len = await _getLen(cid);
    let presets = await _getPresets();
    const root = _ensureRoot();

    root.innerHTML = `
      <div class="sct-dlg-box">
        <div class="sct-dlg-head">
          <div class="sct-dlg-title">思维链</div>
          <div class="sct-dlg-sub">CUSTOM COT · 卡掉默认思考</div>
        </div>
        <div class="sct-dlg-body">
          <div class="sct-toggle-row">
            <div>
              <div class="sct-tg-main">启用自定义思维链</div>
              <div class="sct-tg-sub">AI 先按你的思考方式想一遍再写正文；思考不进正文，观测台可看</div>
            </div>
            <div class="sct-switch${on ? ' on' : ''}" id="sct-switch"><div class="sct-switch-knob"></div></div>
          </div>

          <div class="sct-sec-h">预设 / PRESETS <span>存好几套，换着用不用重填</span></div>
          <div class="sct-preset-row">
            <select class="sct-preset-sel" id="sct-preset-sel">${_presetOptionsHtml(presets)}</select>
            <button class="sct-preset-btn" id="sct-preset-save" title="把当前这套思考方式存成预设">存为</button>
            <button class="sct-preset-btn danger" id="sct-preset-del" title="删除选中的预设">删除</button>
          </div>

          <div class="sct-sec-h">思考方式 / HOW TO THINK <span>写给 AI 的思考步骤</span></div>
          <div class="sct-chips">
            <button class="sct-chip" data-k="{{char}}">{{char}}</button>
            <button class="sct-chip" data-k="{{user}}">{{user}}</button>
          </div>
          <textarea class="sct-ta" id="sct-txt" rows="9" spellcheck="false" placeholder="写下你希望角色在动笔前思考的步骤，一行一条。&#10;&#10;· {{char}} 会被替换成角色名，{{user}} 替换成你的名字&#10;· 留空 = 不启用，剧情走默认方式&#10;· 思考内容不会出现在正文里，想看去＋菜单的观测台&#10;· 想治八股词/超雄/OOC？在这里写落笔前自检，示例模板里有现成的&#10;&#10;不知道怎么写？点下面「插入示例模板」。">${_esc(txt)}</textarea>
          <div class="sct-btns">
            <button class="sct-mini" id="sct-example">插入示例模板</button>
            <button class="sct-mini" id="sct-clear">清空</button>
          </div>
          <div class="sct-len-row">
            <div>
              <div class="sct-tg-main" style="font-size:13px;">思考长度上限</div>
              <div class="sct-tg-sub">50–2000 字，留空 = ${LEN_DEFAULT}</div>
            </div>
            <input type="number" class="sct-len-input" id="sct-len" min="50" max="2000" step="50" value="${len}" placeholder="${LEN_DEFAULT}">
          </div>
          <div class="sct-tip">思考按这个上限消耗 token，通常仍比模型自带的长推理省得多，回复也更快。</div>
        </div>
        <div class="sct-dlg-foot">
          <button class="sct-dlg-btn ghost" id="sct-cancel">取消</button>
          <button class="sct-dlg-btn primary" id="sct-save">保存</button>
        </div>
      </div>`;

    let _on = on;
    const swEl = root.querySelector('#sct-switch');
    const taEl = root.querySelector('#sct-txt');
    swEl.onclick = () => { _on = !_on; swEl.classList.toggle('on', _on); };
    root.querySelectorAll('.sct-chip').forEach(c => {
      c.onclick = () => {
        const s = taEl.selectionStart, v = taEl.value, ins = c.dataset.k;
        taEl.value = v.slice(0, s) + ins + v.slice(taEl.selectionEnd);
        taEl.focus(); const p = s + ins.length; taEl.setSelectionRange(p, p);
      };
    });
    root.querySelector('#sct-example').onclick = () => {
      if (taEl.value.trim() && !confirm('已有内容，用示例模板覆盖？')) return;
      taEl.value = EXAMPLE_TPL; taEl.focus();
    };
    root.querySelector('#sct-clear').onclick = () => { taEl.value = ''; taEl.focus(); };

    /* ── 预设：载入 / 存为 / 删除 ── */
    const selEl = root.querySelector('#sct-preset-sel');
    const lenEl = root.querySelector('#sct-len');
    const _refreshPresetSel = (keepIdx) => {
      selEl.innerHTML = _presetOptionsHtml(presets);
      if (keepIdx != null && presets[keepIdx]) selEl.value = String(keepIdx);
    };
    // 载入：把选中预设填进编辑框，不立即落库（用户还要点保存才生效）
    selEl.onchange = () => {
      const i = parseInt(selEl.value, 10);
      if (isNaN(i) || !presets[i]) return;
      taEl.value = String(presets[i].txt || '');
      if (lenEl) lenEl.value = _clampLen(presets[i].len);
      taEl.focus();
    };
    // 存为：把当前思考方式+长度存成一套预设
    root.querySelector('#sct-preset-save').onclick = async () => {
      const val = taEl.value.trim();
      if (!val) { _toast('思考方式是空的，先写点内容'); return; }
      let name = prompt('给这套预设起个名字：', '');
      if (name == null) return;
      name = name.trim();
      if (!name) { _toast('名字不能为空'); return; }
      const lenVal = _clampLen(lenEl?.value);
      const exist = presets.findIndex(p => p.name === name);
      if (exist >= 0) {
        if (!confirm(`已有预设「${name}」，覆盖它？`)) return;
        presets[exist] = { name, txt: val, len: lenVal };
      } else {
        presets.push({ name, txt: val, len: lenVal });
      }
      if (await _setPresets(presets)) {
        _refreshPresetSel(exist >= 0 ? exist : presets.length - 1);
        _toast(`预设「${name}」已存 ✦`);
      } else { _toast('预设保存失败'); }
    };
    // 删除：删掉下拉里选中的那套
    root.querySelector('#sct-preset-del').onclick = async () => {
      const i = parseInt(selEl.value, 10);
      if (isNaN(i) || !presets[i]) { _toast('先在下拉里选一套预设'); return; }
      const nm = presets[i].name;
      if (!confirm(`删除预设「${nm}」？当前编辑框里的内容不受影响。`)) return;
      presets.splice(i, 1);
      if (await _setPresets(presets)) { _refreshPresetSel(); _toast(`预设「${nm}」已删`); }
      else { _toast('删除失败'); }
    };

    const close = () => { root.classList.remove('active'); setTimeout(() => { root.innerHTML = ''; }, 350); };
    root.querySelector('#sct-cancel').onclick = close;
    root.onclick = (e) => { if (e.target === root) close(); };
    root.querySelector('#sct-save').onclick = async () => {
      const db = _DB(); if (!db) { _toast('存储不可用'); return; }
      const val = taEl.value.trim();
      const lenVal = _clampLen(root.querySelector('#sct-len')?.value);
      try {
        await db.settings.set(K_ON(cid), _on);
        await db.settings.set(K_TXT(cid), val);
        await db.settings.set(K_LEN(cid), lenVal);
        _toast(_on && val ? '思维链已启用 ✦' : '已保存（未生效：' + (!_on ? '开关未开' : '内容为空') + '）');
        close();
      } catch (e) { _toast('保存失败'); }
    };

    requestAnimationFrame(() => root.classList.add('active'));
  }

  /* ── 自注入 CSS（视觉与 story-status 同一语言）──────────────── */
  function _injectCSS() {
    if (document.getElementById('sct-cot-style')) return;
    const css = `
    .sct-dlg{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:flex-end;justify-content:center;
      background:rgba(20,18,16,0);pointer-events:none;transition:background .28s ease;}
    .sct-dlg.active{background:rgba(20,18,16,.46);pointer-events:auto;}
    .sct-dlg-box{width:100%;max-width:440px;max-height:92vh;overflow-y:auto;background:#F4F1EA;color:#1A1A1A;
      border-radius:18px 18px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.25);transform:translateY(100%);
      transition:transform .32s cubic-bezier(.16,1,.3,1);-webkit-overflow-scrolling:touch;}
    .sct-dlg.active .sct-dlg-box{transform:translateY(0);}
    .sct-dlg-box::-webkit-scrollbar{display:none;}
    .sct-dlg-head{padding:20px 22px 12px;border-bottom:1px solid rgba(0,0,0,.08);position:sticky;top:0;background:#F4F1EA;z-index:2;}
    .sct-dlg-title{font-family:'Noto Serif SC',serif;font-size:17px;font-weight:600;letter-spacing:.05em;}
    .sct-dlg-sub{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.2em;color:#8a8478;margin-top:3px;text-transform:uppercase;}
    .sct-dlg-body{padding:16px 22px;}
    .sct-dlg-foot{padding:12px 22px max(env(safe-area-inset-bottom,16px),16px);display:flex;gap:10px;
      border-top:1px solid rgba(0,0,0,.08);position:sticky;bottom:0;background:#F4F1EA;}
    .sct-dlg-btn{flex:1;padding:11px 0;border-radius:10px;font-family:'Space Mono',monospace;font-size:12px;
      letter-spacing:.08em;cursor:pointer;border:1px solid transparent;transition:.18s;}
    .sct-dlg-btn.ghost{background:transparent;border-color:rgba(0,0,0,.2);color:#5a554c;}
    .sct-dlg-btn.primary{background:#1A1A1A;color:#F4F1EA;}
    .sct-dlg-btn.primary:active{transform:scale(.97);}
    .sct-toggle-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:6px 0 14px;}
    .sct-tg-main{font-family:'Noto Serif SC',serif;font-size:14px;font-weight:600;}
    .sct-tg-sub{font-size:11px;color:#8a8478;margin-top:3px;line-height:1.4;}
    .sct-switch{width:46px;height:26px;border-radius:13px;background:rgba(0,0,0,.18);position:relative;flex-shrink:0;cursor:pointer;transition:background .22s;}
    .sct-switch.on{background:#8a2c2c;}
    .sct-switch-knob{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .22s;box-shadow:0 1px 3px rgba(0,0,0,.3);}
    .sct-switch.on .sct-switch-knob{transform:translateX(20px);}
    .sct-sec-h{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;
      color:#1A1A1A;margin:14px 0 10px;display:flex;align-items:center;gap:8px;border-top:1px dashed rgba(0,0,0,.15);padding-top:14px;}
    .sct-sec-h span{font-size:9px;color:#a39c8f;letter-spacing:.05em;text-transform:none;}
    .sct-preset-row{display:flex;gap:8px;align-items:center;margin-bottom:2px;}
    .sct-preset-sel{flex:1;min-width:0;background:#FBFAF7;border:1px solid rgba(0,0,0,.15);border-radius:8px;
      padding:9px 11px;font-family:'Noto Serif SC',serif;font-size:13px;color:#1A1A1A;outline:none;
      box-sizing:border-box;-webkit-appearance:none;appearance:none;cursor:pointer;}
    .sct-preset-sel:focus{border-color:#8a2c2c;}
    .sct-preset-btn{flex-shrink:0;padding:9px 12px;border:1px solid rgba(0,0,0,.2);border-radius:8px;background:transparent;
      font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.05em;color:#5a554c;cursor:pointer;transition:.16s;}
    .sct-preset-btn:active{background:rgba(0,0,0,.05);}
    .sct-preset-btn.danger{color:#8a2c2c;border-color:rgba(138,44,44,.35);}
    .sct-preset-btn.danger:active{background:rgba(138,44,44,.08);}
    .sct-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:9px;}
    .sct-chip{border:1px solid rgba(0,0,0,.2);background:#FBFAF7;border-radius:20px;padding:3px 9px;
      font-family:'Space Mono',monospace;font-size:10px;color:#3a352e;cursor:pointer;transition:.16s;}
    .sct-chip:active{background:#1A1A1A;color:#fff;}
    .sct-ta{width:100%;resize:vertical;background:#FBFAF7;border:1px solid rgba(0,0,0,.15);border-radius:8px;
      padding:10px 12px;font-family:'Noto Serif SC',serif;font-size:13px;line-height:1.7;color:#1A1A1A;
      outline:none;box-sizing:border-box;}
    .sct-ta:focus{border-color:#8a2c2c;}
    .sct-btns{display:flex;gap:8px;margin-top:8px;}
    .sct-mini{flex:1;padding:8px 0;border:1px solid rgba(0,0,0,.2);border-radius:7px;background:transparent;
      font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.05em;color:#5a554c;cursor:pointer;transition:.16s;}
    .sct-mini:active{background:rgba(0,0,0,.05);}
    .sct-tip{font-size:11px;line-height:1.6;color:#7a7468;margin-top:10px;}
    .sct-len-row{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:12px;
      padding-top:12px;border-top:1px dashed rgba(0,0,0,.15);}
    .sct-len-input{width:88px;flex-shrink:0;background:#FBFAF7;border:1px solid rgba(0,0,0,.15);border-radius:8px;
      padding:9px 11px;font-family:'Space Mono',monospace;font-size:13px;color:#1A1A1A;text-align:center;
      outline:none;box-sizing:border-box;}
    .sct-len-input:focus{border-color:#8a2c2c;}
    `;
    const st = document.createElement('style');
    st.id = 'sct-cot-style';
    st.textContent = css;
    document.head.appendChild(st);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _injectCSS);
    else _injectCSS();
  }

  /* ── 导出 ─────────────────────────────────────────────────── */
  return {
    isOn,          // (cid) → bool（开关开 且 有内容）
    openEditor,    // (cid) ＋菜单入口
    buildPrompt,   // (cid, charName, userName) → 提示词段 | ''
    extract,       // (raw) → { clean, cot }
    consoleHtml,   // (cid) → 观测台 html 段
  };
})();
if (typeof window !== 'undefined') window.StoryCOT = StoryCOT;
