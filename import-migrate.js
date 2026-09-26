// ============================================================
// MigrateModule — KiKi 角色导入 (v3)
// ------------------------------------------------------------
// 专做 KiKi（本人旧项目）→ Chill 的角色迁移。KiKi 备份结构已知且固定，
// 直接按字段映射，零 API、最准、可一次批量导入多个角色。
//
// 识别：顶层含 dossiers 数组，元素含 character.name 即认定为 KiKi 备份。
// 映射：
//   character.name                         → name（角色名）
//   character.background + aiGenerated.*    → persona（拼成完整人设：
//        背景 / 性格 / 喜好 / 口头禅）
//   character.avatarAssetId → assets[id].fileName → zip 内 assets/<file>
//                                          → 头像，入库写 char-avatar-{id}
// 备份里的 api_presets / user_settings / chatHistory 等一律忽略，只取角色。
//
// 写库：DB.characters.add → 用返回 id 拼头像 key → DB.assets.set
//      → 回填 avatarUrl。与主文件保存角色的逻辑一致。
//
// 依赖（主文件顶层全局）：
//   DB.characters.add / DB.characters.put / DB.assets.set / Toast / fflate
//
// 入口：
//   openDataImport()  —— KiKi 备份 (.zip/.json)：勾选角色；
//                        选 1 个 → 填进新建表单（CharacterModule.fillForm）供调整后保存；
//                        选 多个 → 批量直接入库 + 刷新列表。
//   openTextImport()  —— 文档 (.txt/.docx)：正文整段填进表单的人设，图片自动忽略。
// 备注：仅迁移角色档案；聊天记录无法跨项目迁移。
// ============================================================
const MigrateModule = (() => {
  'use strict';

  // ---- 样式注入 ----
  (function _injectStyle() {
    if (document.getElementById('mig-style')) return;
    const st = document.createElement('style');
    st.id = 'mig-style';
    st.textContent = `
      .mig-overlay{position:fixed;inset:0;z-index:99999;background:rgba(10,10,10,.55);
        display:flex;align-items:center;justify-content:center;padding:20px;
        backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}
      .mig-card{background:#F4F3EE;color:#121212;width:100%;max-width:480px;
        max-height:88vh;overflow-y:auto;border-radius:10px;padding:22px 20px;
        box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:'DM Sans',sans-serif;}
      .mig-title{font-family:'Cormorant Garamond',serif;font-size:1.6rem;font-weight:700;margin-bottom:6px;}
      .mig-hint{font-size:.72rem;color:#666;line-height:1.5;margin-bottom:16px;}
      .mig-label{display:block;font-size:.66rem;letter-spacing:1px;text-transform:uppercase;
        color:#888;margin:12px 0 5px;}
      .mig-input,.mig-textarea{width:100%;box-sizing:border-box;background:#fff;
        border:1px solid #ddd;border-radius:6px;padding:10px 12px;font-size:.9rem;
        color:#121212;font-family:inherit;}
      .mig-textarea{min-height:160px;resize:vertical;line-height:1.55;}
      .mig-input:focus,.mig-textarea:focus{outline:none;border-color:#121212;}
      .mig-btns{display:flex;gap:10px;margin-top:20px;}
      .mig-btn-cancel,.mig-btn-ok{flex:1;padding:13px 0;border-radius:6px;font-size:.8rem;
        font-weight:600;letter-spacing:1px;cursor:pointer;border:none;font-family:inherit;}
      .mig-btn-cancel{background:transparent;border:1px solid #bbb;color:#555;}
      .mig-btn-ok{background:#121212;color:#fff;}
      .mig-btn-cancel:active,.mig-btn-ok:active{transform:scale(.97);}
      .mig-toolbar{display:flex;justify-content:space-between;align-items:center;
        margin-bottom:10px;font-size:.72rem;color:#666;}
      .mig-toolbar button{background:none;border:none;color:#121212;font-weight:600;
        font-size:.72rem;cursor:pointer;text-decoration:underline;font-family:inherit;}
      .mig-list{display:flex;flex-direction:column;gap:8px;}
      .mig-row{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #e3e3e3;
        border-radius:8px;padding:10px 12px;cursor:pointer;}
      .mig-row.sel{border-color:#121212;box-shadow:0 0 0 1px #121212 inset;}
      .mig-cb{width:18px;height:18px;flex-shrink:0;margin-top:2px;}
      .mig-av{width:42px;height:42px;border-radius:6px;object-fit:cover;flex-shrink:0;background:#eee;}
      .mig-meta{flex:1;min-width:0;}
      .mig-name{font-weight:700;font-size:.95rem;margin-bottom:2px;}
      .mig-prev{font-size:.72rem;color:#777;line-height:1.4;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    `;
    document.head.appendChild(st);
  })();

  const fflateAPI = () => (typeof fflate !== 'undefined' ? fflate : window.fflate);

  function _readText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('读取文件失败'));
      r.readAsText(file);
    });
  }

  // 解 zip → { json, files }
  async function _unzip(file) {
    const F = fflateAPI();
    if (!F) throw new Error('缺少 fflate，无法解压 zip');
    const buffer = await file.arrayBuffer();
    const files = await new Promise((res, rej) => {
      F.unzip(new Uint8Array(buffer), (err, data) => err ? rej(err) : res(data));
    });
    let json = null;
    for (const name of Object.keys(files)) {
      if (/\.json$/i.test(name)) {
        try { const obj = JSON.parse(F.strFromU8(files[name])); if (!json) json = obj; }
        catch (e) {}
      }
    }
    return { json, files };
  }

  // ============================================================
  // 结构识别：KiKi 系
  // ============================================================
  function _looksLikeKiki(json) {
    return !!(json && Array.isArray(json.dossiers) && json.dossiers.length &&
              json.dossiers[0] && json.dossiers[0].character &&
              typeof json.dossiers[0].character.name !== 'undefined');
  }

  function _parseKikiCharacters(json, files) {
    const assetMap = {};
    if (Array.isArray(json.assets)) {
      for (const a of json.assets) {
        if (a && typeof a.id !== 'undefined') assetMap[a.id] = a;
      }
    }

    return json.dossiers.map(d => {
      const c = d.character || {};
      const ai = d.aiGenerated || {};

      const segs = [];
      if (c.background) segs.push(String(c.background).trim());
      if (ai.detailedBackground) segs.push('【背景】\n' + String(ai.detailedBackground).trim());
      if (Array.isArray(ai.personality) && ai.personality.length)
        segs.push('【性格】' + ai.personality.join('、'));
      if (Array.isArray(ai.likes) && ai.likes.length)
        segs.push('【喜好】' + ai.likes.join('、'));
      if (ai.quote) segs.push('【口头禅】' + String(ai.quote).trim());
      const persona = segs.join('\n\n');

      let avatar = null;
      const aid = c.avatarAssetId;
      if (aid != null && assetMap[aid]) {
        const meta = assetMap[aid];
        const fname = meta.fileName || ('asset_' + aid);
        const path = Object.keys(files).find(k => k.endsWith('assets/' + fname) || k.endsWith(fname));
        if (path && files[path]) avatar = { bytes: files[path], type: meta.type || 'image/jpeg' };
      }

      return {
        name: String(c.name || '').trim() || '未命名角色',
        title: '', mbti: '', persona, customQ1: '', customQ2: '',
        _avatar: avatar,
      };
    });
  }

  // ============================================================
  // 多角色勾选面板
  // ============================================================
  function _showSelector(chars) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'mig-overlay';
      overlay.innerHTML = `
        <div class="mig-card">
          <div class="mig-title">选择要导入的角色</div>
          <div class="mig-hint">识别到 ${chars.length} 个角色。勾选要搬进 Chill 的，头像会一起带过来。聊天记录无法迁移。</div>
          <div class="mig-toolbar">
            <span id="mig-count"></span>
            <span><button id="mig-all">全选</button> · <button id="mig-none">全不选</button></span>
          </div>
          <div class="mig-list" id="mig-list"></div>
          <div class="mig-btns">
            <button class="mig-btn-cancel" id="mig-cancel">取消</button>
            <button class="mig-btn-ok" id="mig-ok">导入所选</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const listEl = overlay.querySelector('#mig-list');
      const countEl = overlay.querySelector('#mig-count');
      const selected = new Set(chars.map((_, i) => i));
      const avatarUrls = [];

      chars.forEach((ch, i) => {
        const row = document.createElement('div');
        row.className = 'mig-row sel';
        let avHtml = '<div class="mig-av"></div>';
        if (ch._avatar) {
          const url = URL.createObjectURL(new Blob([ch._avatar.bytes], { type: ch._avatar.type }));
          avatarUrls.push(url);
          avHtml = `<img class="mig-av" src="${url}">`;
        }
        row.innerHTML = `
          <input type="checkbox" class="mig-cb" checked>
          ${avHtml}
          <div class="mig-meta"><div class="mig-name"></div><div class="mig-prev"></div></div>`;
        row.querySelector('.mig-name').textContent = ch.name;
        row.querySelector('.mig-prev').textContent = (ch.persona || '（无人设）').slice(0, 80);
        const cb = row.querySelector('.mig-cb');
        const sync = () => {
          if (cb.checked) { selected.add(i); row.classList.add('sel'); }
          else { selected.delete(i); row.classList.remove('sel'); }
          countEl.textContent = `已选 ${selected.size} / ${chars.length}`;
        };
        row.onclick = (e) => { if (e.target !== cb) cb.checked = !cb.checked; sync(); };
        cb.onclick = (e) => e.stopPropagation();
        cb.onchange = sync;
        listEl.appendChild(row);
      });
      countEl.textContent = `已选 ${selected.size} / ${chars.length}`;

      const setAll = (v) => {
        listEl.querySelectorAll('.mig-row').forEach((row, i) => {
          const cb = row.querySelector('.mig-cb');
          cb.checked = v;
          if (v) selected.add(i); else selected.delete(i);
          row.classList.toggle('sel', v);
        });
        countEl.textContent = `已选 ${selected.size} / ${chars.length}`;
      };
      overlay.querySelector('#mig-all').onclick = () => setAll(true);
      overlay.querySelector('#mig-none').onclick = () => setAll(false);

      const close = (result) => { avatarUrls.forEach(URL.revokeObjectURL); overlay.remove(); resolve(result); };
      overlay.querySelector('#mig-cancel').onclick = () => close(null);
      overlay.querySelector('#mig-ok').onclick = () => {
        if (selected.size === 0) { Toast.show('至少勾选一个'); return; }
        close(chars.filter((_, i) => selected.has(i)));
      };
    });
  }

  // 读文档为纯文本（docx 走 mammoth，自动丢弃图片；txt 直读）
  async function _readDocToText(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'txt' || ext === 'text' || ext === 'md') {
      return await file.text();
    }
    if (ext === 'docx') {
      if (typeof mammoth === 'undefined') throw new Error('docx 解析库未加载，请检查网络');
      // extractRawText 只取文字，文档内嵌图片天然被排除
      const buf = await file.arrayBuffer();
      const res = await mammoth.extractRawText({ arrayBuffer: buf });
      return res.value || '';
    }
    if (ext === 'doc') {
      throw new Error('旧版 .doc 无法解析，请在 Word 里另存为 .docx 或 .txt');
    }
    throw new Error('仅支持 .txt 和 .docx');
  }

  // ============================================================
  // 批量入库（含头像）
  // ============================================================
  async function _commitMany(chars) {
    let ok = 0, fail = 0, firstErr = '';
    for (const ch of chars) {
      try {
        const charData = {
          name: ch.name, title: ch.title || '', mbti: ch.mbti || '',
          persona: ch.persona || '', customQ1: ch.customQ1 || '', customQ2: ch.customQ2 || '',
          avatarUrl: '', aiData: null,
        };
        const id = await DB.characters.add(charData);
        if (ch._avatar && ch._avatar.bytes) {
          try {
            const key = `char-avatar-${id}`;
            const blob = new Blob([ch._avatar.bytes], { type: ch._avatar.type || 'image/jpeg' });
            await DB.assets.set(key, blob, blob.type);
            await DB.characters.put({ ...charData, id, avatarUrl: key });
          } catch (avErr) {
            // 头像失败不影响角色本身已入库
            console.warn('[Migrate] 头像写入失败（角色已保存）', ch.name, avErr);
          }
        }
        ok++;
      } catch (e) {
        console.error('[Migrate] 入库失败', ch.name, e);
        if (!firstErr) firstErr = (e && e.message) ? e.message : String(e);
        fail++;
      }
    }
    if (fail && !ok) Toast.show(`导入失败：${firstErr || '未知错误'}`);
    else Toast.show(`导入完成：成功 ${ok} 个${fail ? `，失败 ${fail} 个（${firstErr}）` : ''}`);
    // 立即刷新当前屏：交给主模块统一处理（重读 DB + 重渲染 + 切列表层）
    // 注意：CharacterModule 是主文件的 const 全局，不挂在 window 上，需直接引用
    try {
      if (typeof CharacterModule !== 'undefined' && CharacterModule.refreshAfterImport) {
        await CharacterModule.refreshAfterImport();
      }
    } catch (e) { console.error('[Migrate] 刷新列表失败', e); }
  }

  // ============================================================
  // 入口：上传 KiKi 备份 (.zip / .json)
  // ============================================================
  function openDataImport() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,.zip';
    inp.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      Toast.show('正在读取 KiKi 备份…', 5000);

      let json = null, files = {};
      try {
        if (/\.zip$/i.test(file.name)) {
          const r = await _unzip(file); json = r.json; files = r.files;
        } else {
          json = JSON.parse(await _readText(file));
        }
      } catch (err) { Toast.show('读取失败：' + err.message); return; }

      if (!_looksLikeKiki(json)) {
        Toast.show('这不像是 KiKi 的备份包，无法识别角色');
        return;
      }

      const chars = _parseKikiCharacters(json, files);
      if (!chars.length) { Toast.show('备份里没有找到角色'); return; }
      const picked = await _showSelector(chars);
      if (!picked || !picked.length) return;

      if (picked.length === 1) {
        // 单选 → 填进当前表单，供调整后手动保存；失败则降级为直接入库
        const filled = _fillFormFromChar(picked[0]);
        if (filled) Toast.show('已填入表单，调整后点「保存档案」即可');
        else { await _commitMany(picked); }
      } else {
        // 多选 → 批量直接入库
        await _commitMany(picked);
      }
    };
    inp.click();
  }

  // 把一个解析后的角色塞进新建表单（含头像）。成功返回 true，否则 false
  function _fillFormFromChar(ch) {
    // CharacterModule 是主文件 const 全局，直接引用（不在 window 上）
    if (typeof CharacterModule === 'undefined' || typeof CharacterModule.fillForm !== 'function') return false;
    const fields = {
      name: ch.name || '', title: ch.title || '', mbti: ch.mbti || '',
      persona: ch.persona || '', customQ1: ch.customQ1 || '', customQ2: ch.customQ2 || '',
    };
    if (ch._avatar && ch._avatar.bytes) {
      fields.avatarBlob = new Blob([ch._avatar.bytes], { type: ch._avatar.type || 'image/jpeg' });
      fields.avatarType = ch._avatar.type || 'image/jpeg';
    }
    try { CharacterModule.fillForm(fields); return true; }
    catch (e) { console.error('[Migrate] fillForm 失败', e); return false; }
  }

  // ============================================================
  // 入口：上传文档 (.txt / .docx) —— 整段填进人设，图片自动剔除
  // ============================================================
  function openTextImport() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.txt,.text,.md,.docx,.doc';
    inp.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      Toast.show('正在读取文档…', 4000);
      let text;
      try { text = await _readDocToText(file); }
      catch (err) { Toast.show(err.message); return; }
      text = String(text || '').trim();
      if (!text) { Toast.show('文档里没有可读取的文字'); return; }
      // 直接填进当前表单：正文进人设，其余留空给用户补
      const filled = _fillFormFromChar({ name: '', persona: text });
      if (filled) Toast.show('已填入人设，补全名字后点「保存档案」');
      else Toast.show('无法填入表单，请重试');
    };
    inp.click();
  }

  return { openDataImport, openTextImport };
})();