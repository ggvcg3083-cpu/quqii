/* ============================================================
 * memory-rag.js — 记忆库 · P0(离散写入 + top-k 召回)+ 内置 UI
 * 目标:让每轮请求 token 恒定,不再随聊天变长而膨胀。
 *
 * 全自洽子模块(仿 group-story.js):
 *   - 逻辑层:抽取写入 / top-k 召回 / API 池轮询 failover
 *   - UI 层 :自注入样式 + DOM,自己一个 #memrag-screen,真接口驱动
 *   主文件只需:① <script src="memory-rag.js"> ② 召回/写入两处挂钩
 *             ③ 一个入口按钮调 MemoryRAG.open()
 *
 * 存储(走 DB.settings,零 DB_VERSION 迁移):
 *   memrag-items / memrag-api-pool / memrag-config
 *
 * 依赖:DB.settings/characters/messages、ApiHelper.chatCompletion/fetchModels、Toast
 * 记忆字段:{ id, content, character_ids[], timeline_id, source, scope, created_at, edited }
 * ============================================================ */

const MemoryRAG = (() => {
  'use strict';

  const SCREEN_ID = 'memrag-screen';
  const K_ITEMS  = 'memrag-items';
  const K_POOL   = 'memrag-api-pool';
  const K_CONFIG = 'memrag-config';

  const DEFAULT_CONFIG = { enabled:false, autoExtract:true, topk:5, interval:1 };

  let _mounted = false;

  const _toast = (m) => { try { Toast.show(m); } catch(_) { console.log('[MemoryRAG]', m); } };
  const _uid   = () => 'mr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const _esc   = (s) => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* 自带确认弹层(替代原生 confirm,FTP/PWA 全屏下原生弹窗会被吞)。返回 Promise<boolean>。 */
  function _confirm(message, { title='确认', okText='确定', cancelText='取消', danger=false } = {}) {
    return new Promise((resolve) => {
      const mask = document.getElementById('mr-mask-confirm');
      if (!mask) { resolve(false); return; }   // 弹层还没注入,稳妥返回 false
      document.getElementById('mr-cf-title').textContent = title;
      document.getElementById('mr-cf-body').textContent = message;
      const okBtn = document.getElementById('mr-cf-ok');
      const cancelBtn = document.getElementById('mr-cf-cancel');
      okBtn.textContent = okText; cancelBtn.textContent = cancelText;
      okBtn.classList.toggle('danger', !!danger);
      const done = (val) => {
        mask.classList.remove('show');
        okBtn.onclick = cancelBtn.onclick = mask.onclick = null;
        resolve(val);
      };
      okBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      mask.onclick = (e) => { if (e.target === mask) done(false); };
      mask.classList.add('show');
    });
  }

  /* ============================================================
   *  逻辑层
   * ============================================================ */

  /* ── 配置 ── */
  async function getConfig() {
    try { const c = await DB.settings.get(K_CONFIG); return { ...DEFAULT_CONFIG, ...(c||{}) }; }
    catch(_) { return { ...DEFAULT_CONFIG }; }
  }
  async function setConfig(patch) {
    const next = { ...(await getConfig()), ...patch };
    await DB.settings.set(K_CONFIG, next);
    return next;
  }
  async function isEnabled() { return (await getConfig()).enabled; }

  /* ── 记忆条目 CRUD ── */
  async function _loadItems() {
    try { const a = await DB.settings.get(K_ITEMS); return Array.isArray(a)?a:[]; } catch(_) { return []; }
  }
  async function _saveItems(arr) { await DB.settings.set(K_ITEMS, arr); }
  async function getAll() { return _loadItems(); }

  /* ── 去重:归一化后比对,同角色范围内查重 ── */
  // 归一化:去首尾、去标点空白、转小写,让"用户计划下周三搬家。"和"用户 计划下周三搬家"算同一条
  const _norm = (s) => String(s||'').toLowerCase().replace(/[\s\p{P}]/gu,'').trim();
  // 返回库里"实质相同"的已有条目(同一角色集合 + 文本互相包含),没有则 null
  function _findDup(items, content, charIds) {
    const n = _norm(content);
    if (!n) return null;
    const ids = (charIds||[]).map(String).sort().join(',');
    for (const it of items) {
      const iids = (it.character_ids||[]).map(String).sort().join(',');
      if (iids !== ids) continue;                 // 角色范围不同,不算重
      const ni = _norm(it.content);
      if (!ni) continue;
      // 完全相等,或一方包含另一方(抽取器常把同一事实换个说法重抽)
      if (ni === n || ni.includes(n) || n.includes(ni)) return it;
    }
    return null;
  }

  async function addItem({ content, character_ids=[], source='single', scope='character', timeline_id='main', _skipDedup=false }) {
    const items = await _loadItems();
    const c = String(content||'').trim();
    if (!c) return null;
    // 去重:命中则不新增,返回已有条目(让调用方知道"这条已经记过了")
    if (!_skipDedup) {
      const dup = _findDup(items, c, character_ids);
      if (dup) { console.log('[MemoryRAG] ↺ 去重:已存在,跳过', c.slice(0,20)); return dup; }
    }
    const item = {
      id:_uid(), content:c,
      character_ids:character_ids.map(String),
      timeline_id, source, scope,
      created_at:new Date().toISOString(), edited:false,
    };
    items.unshift(item);
    await _saveItems(items);
    return item;
  }
  async function updateItem(id, patch) {
    const items = await _loadItems();
    const i = items.findIndex(x=>x.id===id);
    if (i<0) return false;
    items[i] = { ...items[i], ...patch, edited:true };
    await _saveItems(items);
    return true;
  }
  async function deleteItem(id) {
    const items = await _loadItems();
    await _saveItems(items.filter(x=>x.id!==id));
    return true;
  }
  async function clearAll() { await _saveItems([]); }
  // 按来源清除(用于重导前清掉脏的 legacy 条目,不动手动/聊天抽取的)
  async function clearBySource(source) {
    const items = await _loadItems();
    const kept = items.filter(x => String(x.source||'single') !== String(source));
    const removed = items.length - kept.length;
    await _saveItems(kept);
    return removed;
  }

  /* ── API 预设池 ── */
  async function getPool() {
    try { const a = await DB.settings.get(K_POOL); return Array.isArray(a)?a:[]; } catch(_) { return []; }
  }
  async function savePool(pool) {
    // 落盘前清掉纯瞬时态:_fetching 若存进 DB 会让按钮重开后卡在"拉取中"
    // _status / _models 保留(绿灯、已拉取的模型列表值得跨会话留存)
    const clean = (pool||[]).map(p => { const q = { ...p }; delete q._fetching; return q; });
    await DB.settings.set(K_POOL, clean);
  }
  async function _activePool() {
    const pool = await getPool();
    return pool.filter(p=>p.enabled&&p.url&&p.key&&p.model).sort((a,b)=>(a.order??0)-(b.order??0));
  }

  /* ── 轮询 failover ── */
  async function _callWithFailover(messages, signal) {
    const pool = await _activePool();
    if (!pool.length) throw new Error('记忆库 API 池为空或全部禁用');
    let lastErr;
    for (const p of pool) {
      try {
        const profile = { url:p.url, key:p.key, model:p.model, temp:p.temp??0.3 };
        return await ApiHelper.chatCompletion(profile, messages, signal); // ✅ 成功即返回
      } catch(e) {
        lastErr = e;
        console.warn(`[MemoryRAG] API「${p.name||p.model}」失败,顺延:`, e.message);
      }
    }
    throw lastErr || new Error('记忆库 API 池全部不可用');
  }

  /* ── 写入:抽取 ── */
  // userName 由调用方传入(主文件的 _persona.name),让抽取出的事实用真名做主语,而非泛称"用户"
  const _extractSys = (userName) => {
    const u = (userName && userName.trim()) ? userName.trim() : '用户';
    return `你是一个记忆抽取器。从给定的一轮对话里,只提取关于【${u}】或【对话中的角色】的、值得长期记住的事实(偏好、经历、关系、性格、立场、承诺、重要事件等)。
忽略寒暄、情绪波动、一次性闲聊、剧情演绎里的虚构动作。
重要:事实的主语必须用对话里的真实名字。提到这位用户时,一律写成「${u}」,绝对不要写成「用户」「你」「我」等泛称。
严格只输出一个 JSON 数组,不要任何解释、不要 markdown 代码块。格式:
[{"content":"一句话事实,简洁中立,主语用真名","about":"user|char"}]
如果这轮没有值得长期记住的事实,输出空数组 []。`;
  };

  // 群聊专用:一轮里有真人用户 + 多个角色,必须讲清谁是谁,严防把用户的话安到角色头上
  const _extractSysGroup = (userName, memberNames=[]) => {
    const u = (userName && userName.trim()) ? userName.trim() : '用户';
    const members = memberNames.filter(Boolean);
    const list = members.length ? members.map(n=>`「${n}」`).join('、') : '(若干角色)';
    return `你是一个记忆抽取器,正在处理一段【群聊】记录。群里有一位真人用户和多个 AI 角色。

身份名单(务必严格区分,绝不能弄错谁说了什么):
- 真人用户:「${u}」 —— 这是真实的人。对话里以「${u}：」开头的发言,都是 ${u} 本人说的。
- AI 角色:${list} —— 这些是角色。以角色名开头的发言才是该角色说的。

从这轮群聊里提取值得长期记住的事实(偏好、经历、关系、性格、立场、承诺、重要事件)。
★铁律★ 谁说的话、谁的事,就归到谁名下。
- 「${u}：我下周搬家」→ 事实是"${u} 下周搬家",主语是 ${u},绝不能写成某个角色搬家。
- 「某角色：我养了猫」→ 主语是那个角色,不是 ${u}。
- 绝对不要把 ${u} 说的话或 ${u} 的事,安到任何角色头上;反之亦然。
忽略寒暄、情绪波动、一次性闲聊、纯剧情演绎动作。主语一律用真名,不要用"用户""角色""你""我"。

严格只输出一个 JSON 数组,不要解释、不要 markdown 代码块。格式:
[{"content":"一句话事实,主语是真名","about":"user|char"}]
没有值得记的就输出 []。`;
  };

  /* ── interval 节流:每 N 轮才真抽一次。计数按"角色集合+场景"分桶,各聊各的不互相干扰 ── */
  const K_TICK = 'memrag-ticks';
  async function _shouldExtract(cfg, presentCharIds, source) {
    const interval = Math.max(1, parseInt(cfg.interval,10) || 1);
    if (interval <= 1) return true;   // 每轮抽,不需要计数
    const bucket = (presentCharIds||[]).map(String).sort().join(',') + '|' + (source||'single');
    let ticks = {};
    try { ticks = (await DB.settings.get(K_TICK)) || {}; } catch(_) { ticks = {}; }
    const n = (ticks[bucket] || 0) + 1;
    ticks[bucket] = n % interval;     // 到 interval 清零
    try { await DB.settings.set(K_TICK, ticks); } catch(_) {}
    return n % interval === 0;        // 攒满 interval 轮才抽
  }

  async function extract(rawTurnText, presentCharIds=[], ctx={}) {
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.autoExtract) return [];
    if (!rawTurnText || !rawTurnText.trim()) return [];
    // 手动抽取(ctx.force)无视间隔;自动抽取按 interval 节流
    if (!ctx.force && !(await _shouldExtract(cfg, presentCharIds, ctx.source))) {
      return [];
    }

    const _sys = (ctx.source === 'group')
      ? _extractSysGroup(ctx.userName, ctx.memberNames || [])
      : _extractSys(ctx.userName);
    // 🔍 排查归属错误:打出"喂给抽取器的原文",看用户发言标的是真名还是被标成了角色名
    console.log(`[MemoryRAG] 抽取前原文 (source=${ctx.source}, 用户名=「${ctx.userName||'空'}」${ctx.memberNames?', 成员='+ctx.memberNames.join('/'):''}):\n${rawTurnText}`);
    const messages = [
      { role:'system', content:_sys },
      { role:'user',   content:`【本轮对话】\n${rawTurnText}\n\n请抽取值得长期记住的事实(JSON 数组):` },
    ];
    let raw;
    try { raw = await _callWithFailover(messages); }
    catch(e) { console.warn('[MemoryRAG] 抽取失败(池全挂):', e.message); return []; }

    let facts = [];
    try {
      const cleaned = String(raw).replace(/```json|```/g,'').trim();
      const m = cleaned.match(/\[[\s\S]*\]/);
      facts = JSON.parse(m?m[0]:cleaned);
      if (!Array.isArray(facts)) facts = [];
    } catch(_) { console.warn('[MemoryRAG] 抽取结果非 JSON,丢弃:', raw); return []; }

    const created = [];
    for (const f of facts) {
      if (!f || !f.content) continue;
      const item = await addItem({
        content:f.content, character_ids:presentCharIds.map(String),
        source:ctx.source||'single', scope:'character', timeline_id:ctx.timeline_id||'main',
      });
      if (item) created.push(item);
    }
    if (created.length) console.log(`[MemoryRAG] ✦ 抽取入库 ${created.length} 条`);
    return created;
  }

  /* ── 旧记忆导入:把做记忆库之前的「潜意识总结」(char-memory-{id} 的 summary 整段)拆成离散条目 ──
   * 一次性迁移。每个角色读旧 summary → 分块喂抽取器 → 入库标 source:'legacy'。
   * onProgress({ charName, done, total }) 供 UI 显示进度。
   */
  const _LEGACY_SYS = (userName, charName) => {
    const u = (userName && userName.trim()) ? userName.trim() : '用户';
    const c = (charName && charName.trim()) ? charName.trim() : '角色';
    return `下面是一段已有的"记忆档案/编年史"文本(此前用整段总结法积累的),记录的是【${c}】(AI 角色)和【${u}】(真人用户)之间的事。请把它拆解成一条条独立、可长期复用的事实。

★最重要的铁律★ 原文里所有"用户""你""TA(指用户)"这类泛称,在输出里**必须**替换成真名「${u}」。输出中绝对不允许再出现"用户"这两个字。
例:原文"用户喜欢吃辣" → 输出"${u} 喜欢吃辣"；原文"${c} 给用户做了饭" → 输出"${c} 给 ${u} 做了饭"。

身份对照(别搞反):
- 「${u}」= 真人用户(原文里的"用户/你"都是 TA)。
- 「${c}」= AI 角色,是 ${u} 的对话对象。

其他规则:
- 每条一句话,简洁中立。主语只用「${u}」或「${c}」,不许用"用户""角色""你""我"等任何泛称。
- 谁做的事写谁,不要张冠李戴。
- 合并重复,丢弃无意义的过渡句和纯剧情演绎动作。

严格只输出一个 JSON 数组,不要解释、不要 markdown 代码块。格式:[{"content":"一条事实"}]
没有可提取的事实就输出 []。`;
  };

  // 把长文按段切块,避免超上下文(粗略按字符数)
  function _chunk(text, size=1800) {
    const paras = String(text||'').split(/\n{2,}|\n/).filter(s=>s.trim());
    const chunks = []; let buf = '';
    for (const p of paras) {
      if ((buf + '\n' + p).length > size && buf) { chunks.push(buf); buf = p; }
      else { buf = buf ? (buf + '\n' + p) : p; }
    }
    if (buf.trim()) chunks.push(buf);
    return chunks;
  }

  async function importLegacy(onProgress, forcedUserName='', onlyCharIds=null) {
    if (typeof MemoryModule === 'undefined' || !MemoryModule.load) {
      throw new Error('找不到旧记忆模块 MemoryModule');
    }
    let chars = [];
    try { chars = await DB.characters.getAll(); } catch(_) {}
    // 只导指定角色(不传=全部)
    if (Array.isArray(onlyCharIds) && onlyCharIds.length) {
      const set = new Set(onlyCharIds.map(String));
      chars = chars.filter(ch => set.has(String(ch.id)));
    }
    const total = chars.length;
    let done = 0, totalCreated = 0, withSummary = 0;
    for (const ch of chars) {
      const cid = String(ch.id);
      let summary = '';
      try { const mem = await MemoryModule.load(cid); summary = (mem && mem.summary || '').trim(); } catch(_) {}
      if (summary) {
        withSummary++;
        // 名字优先级:导入框里你手填的 forcedUserName > 角色绑定的人设名 > 空(prompt 再 fallback)
        const userName = (forcedUserName && forcedUserName.trim()) ? forcedUserName.trim() : await _personaNameFor(cid);
        const charName = ch.name || ('#'+cid);
        console.log(`[MemoryRAG] 导入「${charName}」— 用户名解析为:「${userName||'(空,将回退为"用户")'}」${forcedUserName?'(来自输入框)':'(来自绑定)'}`);
        for (const piece of _chunk(summary)) {
          const messages = [
            { role:'system', content:_LEGACY_SYS(userName, charName) },
            { role:'user',   content:`【记忆档案片段】\n${piece}\n\n请拆成离散事实(JSON 数组):` },
          ];
          let raw;
          try { raw = await _callWithFailover(messages); }
          catch(e){ console.warn('[MemoryRAG] 导入抽取失败,跳过该片段:', e.message); continue; }
          let facts = [];
          try {
            const cleaned = String(raw).replace(/```json|```/g,'').trim();
            const m = cleaned.match(/\[[\s\S]*\]/);
            facts = JSON.parse(m?m[0]:cleaned);
            if (!Array.isArray(facts)) facts = [];
          } catch(_){ continue; }
          for (const f of facts) {
            if (!f || !f.content) continue;
            const item = await addItem({ content:f.content, character_ids:[cid], source:'legacy', scope:'character', timeline_id:'main' });
            if (item) totalCreated++;
          }
        }
      }
      done++;
      if (typeof onProgress === 'function') { try { onProgress({ charName: ch.name||('#'+cid), done, total }); } catch(_){} }
    }
    console.log(`[MemoryRAG] ✦ 旧记忆导入完成:${withSummary} 个角色有旧档案,共入库 ${totalCreated} 条`);
    return { total, withSummary, created: totalCreated };
  }

  /* ── 召回:top-k ──
   * opts.sources    : string[] 只召回这些 source(如 ['single'] / ['story']);不传=不限,兼容旧调用
   * opts.timeline_id: string   只召回该时间线(剧情隔离用);不传=不限
   * opts.excludeRecentTexts: string[] 排除最近已在上下文里的原文,避免重复
   */
  async function recall(presentCharIds=[], opts={}) {
    const cfg = await getConfig();
    if (!cfg.enabled) return '';
    const ids = presentCharIds.map(String);
    let items = await _loadItems();
    items = items.filter(m => Array.isArray(m.character_ids) && m.character_ids.some(cid=>ids.includes(String(cid))));
    // 场景过滤(为群像/剧情铺路;单聊不传则全召回,行为不变)
    if (Array.isArray(opts.sources) && opts.sources.length) {
      const set = new Set(opts.sources.map(String));
      items = items.filter(m => set.has(String(m.source||'single')));
    }
    if (opts.timeline_id) {
      items = items.filter(m => String(m.timeline_id||'main') === String(opts.timeline_id));
    }
    const recentBlob = (opts.excludeRecentTexts||[]).join('\n');
    if (recentBlob) items = items.filter(m => !recentBlob.includes(m.content));
    items.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const top = items.slice(0, cfg.topk||5);
    if (!top.length) return '';
    return top.map(m=>{
      const d=new Date(m.created_at);
      const p=n=>String(n).padStart(2,'0');
      const date=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
      return `- [${date}] ${m.content}`;
    }).join('\n');
  }

  function flattenTurn(msgs, userName='用户', charNameMap={}) {
    return (msgs||[]).filter(m=>m.role==='user'||m.role==='assistant').map(m=>{
      const who = m.role==='user' ? userName : (charNameMap[String(m.senderId||m.charId)]||'角色');
      const txt = m.content || (m.parts?m.parts.map(p=>p.content||'').join(''):'');
      return `${who}：${txt}`;
    }).join('\n');
  }

  /* ============================================================
   *  UI 层 —— 自注入,真接口
   * ============================================================ */
  const FALLBACK_BG = ['#1a1a1a','#4a4a4a','#5c5c5c','#8a8a8a','#3d3d3d','#6b6b6b','#2c2c2c','#7a7a7a'];
  const _hash = (s)=>{ let h=0; for(let i=0;i<s.length;i++) h=(h<<5)-h+s.charCodeAt(i); return h; };
  const _bgOf = (id)=>FALLBACK_BG[Math.abs(_hash(String(id)))%FALLBACK_BG.length];

  let _charMap = {};      // id -> {name,color}  (UI 渲染用,来自 DB.characters)
  let _uiSearch = '';
  let _uiCharFilter = 'all';

  async function _loadCharMap() {
    _charMap = {};
    try {
      const chars = await DB.characters.getAll();
      for (const c of chars) _charMap[String(c.id)] = { name:c.name||('#'+c.id), color:_bgOf(c.id) };
    } catch(_) {}
  }
  const _nameOf = (id)=> (_charMap[String(id)]||{}).name || ('#'+id);
  const _colorOf= (id)=> (_charMap[String(id)]||{}).color || '#999';

  function _injectStyles() {
    if (document.getElementById('memrag-style')) return;
    const css = `
#${SCREEN_ID}{z-index:160;--mr-bg:#f7f6f4;--mr-card:#fff;--mr-main:#1a1a1a;--mr-sub:#666;--mr-faint:#9a958d;--mr-line:#e3e0db;--mr-soft:rgba(18,18,18,.08);--mr-accent:#1a1a1a;--mr-red:#8B3A33;--mr-tag:rgba(18,18,18,.05);background:var(--mr-bg);font-family:'DM Sans','Noto Sans SC',sans-serif;color:var(--mr-main);}
[data-theme="dark"] #${SCREEN_ID}{--mr-bg:#141414;--mr-card:#1f1f1f;--mr-main:#f0f0f0;--mr-sub:#999;--mr-faint:#777;--mr-line:#333;--mr-soft:rgba(255,255,255,.08);--mr-accent:#f0f0f0;--mr-red:#d4796e;--mr-tag:rgba(255,255,255,.06);}
#${SCREEN_ID} .mr-wrap{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--mr-bg);}
#${SCREEN_ID} *{box-sizing:border-box;}
/* header */
#${SCREEN_ID} .mr-header{padding:calc(env(safe-area-inset-top,28px) + 12px) 22px 0;flex-shrink:0;position:relative;}
#${SCREEN_ID} .mr-back{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:1px;color:var(--mr-faint);cursor:pointer;margin-bottom:14px;display:inline-block;}
#${SCREEN_ID} .mr-kicker{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--mr-faint);margin-bottom:5px;}
#${SCREEN_ID} .mr-title{font-family:'Playfair Display',serif;font-size:1.9rem;font-weight:700;line-height:1;letter-spacing:-.5px;}
#${SCREEN_ID} .mr-title .cn{font-size:.9rem;font-weight:500;color:var(--mr-sub);margin-left:9px;letter-spacing:1px;font-family:'DM Sans','Noto Sans SC',sans-serif;}
#${SCREEN_ID} .mr-sub{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1rem;color:var(--mr-sub);margin-top:5px;}
/* token bar */
#${SCREEN_ID} .mr-tokenbar{margin-top:16px;display:flex;gap:9px;}
#${SCREEN_ID} .tk{flex:1;border:1px solid var(--mr-soft);border-radius:12px;padding:11px 13px;background:var(--mr-card);}
#${SCREEN_ID} .tk .lab{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--mr-faint);}
#${SCREEN_ID} .tk .num{font-family:'Playfair Display',serif;font-size:1.25rem;font-weight:600;margin-top:4px;}
#${SCREEN_ID} .tk .num small{font-size:.65rem;color:var(--mr-faint);font-weight:400;font-family:'DM Sans',sans-serif;}
#${SCREEN_ID} .tk.old .num{color:var(--mr-red);} #${SCREEN_ID} .tk.now .num{color:#3a6a4a;}
/* stats */
#${SCREEN_ID} .mr-stats{display:flex;margin-top:14px;border-top:1px solid var(--mr-soft);border-bottom:1px solid var(--mr-soft);}
#${SCREEN_ID} .mr-stat{flex:1;padding:10px 4px;text-align:center;border-right:1px solid var(--mr-soft);}
#${SCREEN_ID} .mr-stat:last-child{border-right:none;}
#${SCREEN_ID} .mr-stat .num{font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:600;line-height:1;}
#${SCREEN_ID} .mr-stat .lab{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--mr-faint);margin-top:5px;}
/* toolbar */
#${SCREEN_ID} .mr-toolbar{padding:14px 22px 8px;display:flex;gap:8px;flex-shrink:0;}
#${SCREEN_ID} .mr-search{flex:1;display:flex;align-items:center;gap:8px;background:var(--mr-tag);border-radius:10px;padding:9px 12px;}
#${SCREEN_ID} .mr-search input{flex:1;border:none;background:transparent;color:var(--mr-main);font-size:.85rem;font-family:inherit;}
#${SCREEN_ID} .mr-search input:focus{outline:none;}
#${SCREEN_ID} .mr-search .ic{font-size:14px;color:var(--mr-faint);}
#${SCREEN_ID} .mr-charsel{padding:9px 11px;border:1px solid var(--mr-line);border-radius:10px;background:var(--mr-card);font-family:'Space Mono',monospace;font-size:11px;color:var(--mr-sub);cursor:pointer;}
/* list */
#${SCREEN_ID} .mr-list{flex:1;overflow-y:auto;padding:4px 22px 96px;}
#${SCREEN_ID} .mr-day{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--mr-faint);margin:16px 0 9px;display:flex;align-items:center;gap:10px;}
#${SCREEN_ID} .mr-day::after{content:'';flex:1;height:1px;background:var(--mr-soft);}
#${SCREEN_ID} .mc{background:var(--mr-card);border:1px solid var(--mr-soft);border-radius:14px;padding:14px 15px;margin-bottom:10px;box-shadow:0 2px 14px rgba(0,0,0,.04);}
#${SCREEN_ID} .mc.editing{border-color:var(--mr-accent);}
#${SCREEN_ID} .mc-top{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
#${SCREEN_ID} .mc-avs{display:flex;}
#${SCREEN_ID} .mc-av{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--mr-card);margin-left:-7px;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:10px;font-weight:600;color:#fff;}
#${SCREEN_ID} .mc-av:first-child{margin-left:0;}
#${SCREEN_ID} .mc-names{font-size:.78rem;font-weight:600;}
#${SCREEN_ID} .mc-time{font-family:'Space Mono',monospace;font-size:10px;color:var(--mr-faint);margin-left:auto;}
#${SCREEN_ID} .mc-content{font-size:.9rem;line-height:1.6;}
#${SCREEN_ID} .mc-content[contenteditable="true"]{outline:none;background:var(--mr-tag);border-radius:8px;padding:8px;margin:-4px 0;}
#${SCREEN_ID} .mc-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
#${SCREEN_ID} .mc-tag{font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.5px;padding:3px 8px;border-radius:6px;background:var(--mr-tag);color:var(--mr-sub);text-transform:uppercase;}
#${SCREEN_ID} .mc-tag.src{background:transparent;border:1px solid var(--mr-soft);}
#${SCREEN_ID} .mc-tag.edited{color:var(--mr-faint);font-style:italic;text-transform:none;}
#${SCREEN_ID} .mc-acts{display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--mr-soft);}
#${SCREEN_ID} .mc-acts button{flex:1;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:7px;border:none;background:transparent;color:var(--mr-sub);cursor:pointer;border-radius:8px;}
#${SCREEN_ID} .mc-acts button:active{background:var(--mr-tag);}
#${SCREEN_ID} .mc-acts button.danger{color:var(--mr-red);}
#${SCREEN_ID} .mc-acts button.primary{color:var(--mr-accent);font-weight:700;}
#${SCREEN_ID} .mr-empty{text-align:center;padding:54px 30px;color:var(--mr-faint);}
#${SCREEN_ID} .mr-empty .big{font-family:'Playfair Display',serif;font-style:italic;font-size:1.25rem;margin-bottom:8px;color:var(--mr-sub);}
#${SCREEN_ID} .mr-empty .small{font-size:.82rem;line-height:1.6;}
/* fab */
#${SCREEN_ID} .mr-topact{position:absolute;top:calc(env(safe-area-inset-top,28px) + 10px);right:22px;display:flex;flex-direction:column;gap:7px;align-items:flex-end;z-index:5;}
#${SCREEN_ID} .tact{height:30px;border-radius:15px;border:1px solid var(--mr-line);background:var(--mr-card);color:var(--mr-sub);font-family:'Space Mono',monospace;font-size:9.5px;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;padding:0 12px;box-shadow:0 2px 8px rgba(0,0,0,.05);white-space:nowrap;}
#${SCREEN_ID} .tact.primary{background:var(--mr-accent);color:var(--mr-bg);border-color:var(--mr-accent);}
#${SCREEN_ID} .tact .plus{font-size:13px;line-height:1;}
/* footer */
#${SCREEN_ID} .mr-footer{position:absolute;left:0;right:0;bottom:0;padding:14px 22px calc(env(safe-area-inset-bottom,14px) + 14px);background:linear-gradient(to top,var(--mr-bg) 65%,transparent);display:flex;gap:10px;}
#${SCREEN_ID} .mr-foot{flex:1;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:11px;border:1px solid var(--mr-line);border-radius:11px;background:var(--mr-card);color:var(--mr-sub);cursor:pointer;text-align:center;}
/* modal */
#${SCREEN_ID} .mr-mask{position:absolute;inset:0;background:rgba(0,0,0,.4);z-index:20;display:none;align-items:flex-end;justify-content:center;}
#${SCREEN_ID} .mr-mask.show{display:flex;}
#${SCREEN_ID} .mr-modal{width:100%;max-height:86%;overflow-y:auto;background:var(--mr-bg);border-radius:22px 22px 0 0;padding:8px 22px calc(env(safe-area-inset-bottom,22px) + 22px);}
#${SCREEN_ID} .mr-grip{width:40px;height:4px;border-radius:2px;background:var(--mr-line);margin:10px auto 16px;}
#${SCREEN_ID} .mr-mtitle{font-family:'Playfair Display',serif;font-size:1.3rem;font-weight:600;margin-bottom:3px;}
#${SCREEN_ID} .mr-msub{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--mr-sub);margin-bottom:18px;font-size:.95rem;}
#${SCREEN_ID} .fld{margin-bottom:14px;}
#${SCREEN_ID} .fld label{display:block;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--mr-faint);margin-bottom:6px;}
#${SCREEN_ID} .fld input,#${SCREEN_ID} .fld select{width:100%;padding:11px 12px;border:1px solid var(--mr-line);border-radius:10px;background:var(--mr-card);color:var(--mr-main);font-family:inherit;font-size:.85rem;}
#${SCREEN_ID} .fld .hint{font-size:.72rem;color:var(--mr-faint);margin-top:6px;line-height:1.5;}
#${SCREEN_ID} .trow{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid var(--mr-soft);}
#${SCREEN_ID} .trow .lab{font-size:.85rem;font-weight:500;}
#${SCREEN_ID} .trow .lab small{display:block;font-weight:400;color:var(--mr-faint);font-size:.72rem;margin-top:3px;}
#${SCREEN_ID} .sw{width:44px;height:26px;border-radius:13px;background:var(--mr-line);position:relative;cursor:pointer;flex-shrink:0;transition:background .2s;}
#${SCREEN_ID} .sw::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .2s;}
#${SCREEN_ID} .sw.on{background:var(--mr-accent);} #${SCREEN_ID} .sw.on::after{left:21px;}
#${SCREEN_ID} .srow{padding:13px 0;border-bottom:1px solid var(--mr-soft);}
#${SCREEN_ID} .srow .top{display:flex;justify-content:space-between;font-size:.85rem;font-weight:500;margin-bottom:10px;}
#${SCREEN_ID} .srow .val{font-family:'Space Mono',monospace;color:var(--mr-accent);}
#${SCREEN_ID} .srow input[type=range]{width:100%;accent-color:var(--mr-accent);}
#${SCREEN_ID} .msave{width:100%;padding:14px;margin-top:18px;border:none;border-radius:11px;background:var(--mr-accent);color:var(--mr-bg);font-family:'Space Mono',monospace;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;}
#${SCREEN_ID} .note{background:var(--mr-tag);border-radius:12px;padding:13px;font-size:.78rem;line-height:1.6;color:var(--mr-sub);margin-bottom:16px;}
#${SCREEN_ID} .note b{color:var(--mr-main);}
/* api pool */
#${SCREEN_ID} .phead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
#${SCREEN_ID} .phead .pt{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--mr-faint);}
#${SCREEN_ID} .phead .padd{font-family:'Space Mono',monospace;font-size:11px;color:var(--mr-accent);cursor:pointer;border:1px dashed var(--mr-line);border-radius:8px;padding:4px 10px;}
#${SCREEN_ID} .pool{display:flex;flex-direction:column;gap:9px;margin-bottom:6px;}
#${SCREEN_ID} .ac{border:1px solid var(--mr-line);border-radius:12px;background:var(--mr-card);padding:12px 13px;}
#${SCREEN_ID} .ac.off{opacity:.5;}
#${SCREEN_ID} .ac-top{display:flex;align-items:center;gap:9px;margin-bottom:9px;}
#${SCREEN_ID} .ac-ord{font-family:'Space Mono',monospace;font-size:11px;color:var(--mr-faint);width:16px;text-align:center;flex-shrink:0;}
#${SCREEN_ID} .ac-name{flex:1;border:none;background:transparent;color:var(--mr-main);font-family:inherit;font-size:.85rem;font-weight:600;}
#${SCREEN_ID} .ac-name:focus{outline:none;}
#${SCREEN_ID} .ac-st{display:flex;align-items:center;gap:5px;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:var(--mr-faint);}
#${SCREEN_ID} .ac-dot{width:7px;height:7px;border-radius:50%;background:var(--mr-faint);}
#${SCREEN_ID} .ac-dot.ok{background:#3a8a4a;} #${SCREEN_ID} .ac-dot.err{background:var(--mr-red);} #${SCREEN_ID} .ac-dot.testing{background:#caa53a;}
#${SCREEN_ID} .ac-f{display:flex;flex-direction:column;gap:7px;}
#${SCREEN_ID} .ac-f input,#${SCREEN_ID} .ac-f select{width:100%;padding:8px 10px;border:1px solid var(--mr-soft);border-radius:8px;background:var(--mr-bg);color:var(--mr-main);font-family:'Space Mono',monospace;font-size:.74rem;}
#${SCREEN_ID} .ac-model{display:flex;gap:7px;}
#${SCREEN_ID} .ac-model input,#${SCREEN_ID} .ac-model select{flex:1;}
#${SCREEN_ID} .ac-fetch{flex-shrink:0;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.5px;text-transform:uppercase;padding:0 11px;border:1px solid var(--mr-line);border-radius:8px;background:var(--mr-card);color:var(--mr-sub);cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:5px;}
#${SCREEN_ID} .ac-fetch.loading{color:var(--mr-faint);pointer-events:none;}
#${SCREEN_ID} .spin{display:inline-block;width:9px;height:9px;border:1.5px solid var(--mr-line);border-top-color:var(--mr-sub);border-radius:50%;animation:mrspin .6s linear infinite;}
@keyframes mrspin{to{transform:rotate(360deg);}}
#${SCREEN_ID} .ac-ops{display:flex;gap:4px;margin-top:9px;align-items:center;}
#${SCREEN_ID} .ac-ops button{font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.5px;text-transform:uppercase;padding:5px 9px;border:1px solid var(--mr-soft);background:transparent;color:var(--mr-sub);border-radius:7px;cursor:pointer;}
#${SCREEN_ID} .ac-ops .sp{flex:1;}
#${SCREEN_ID} .ac-ops .del{color:var(--mr-red);border-color:transparent;}
/* char picker */
#${SCREEN_ID} .mr-pick-list{display:flex;flex-direction:column;gap:8px;margin-top:4px;max-height:54vh;overflow-y:auto;}
#${SCREEN_ID} .pk{display:flex;align-items:center;gap:11px;padding:12px 13px;border:1px solid var(--mr-line);border-radius:12px;background:var(--mr-card);cursor:pointer;}
#${SCREEN_ID} .pk:active{background:var(--mr-tag);}
#${SCREEN_ID} .pk.sel{border-color:var(--mr-accent);border-width:1.5px;}
#${SCREEN_ID} .pk-av{width:34px;height:34px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:14px;font-weight:600;color:#fff;}
#${SCREEN_ID} .pk-name{font-size:.9rem;font-weight:600;flex:1;}
#${SCREEN_ID} .pk-tick{font-family:'Space Mono',monospace;font-size:11px;color:var(--mr-accent);opacity:0;}
#${SCREEN_ID} .pk.sel .pk-tick{opacity:1;}
#${SCREEN_ID} .mr-pick-empty{text-align:center;padding:30px;color:var(--mr-faint);font-size:.85rem;line-height:1.6;}
/* legacy import */
#${SCREEN_ID} .mr-import{margin-top:22px;padding-top:18px;border-top:1px dashed var(--mr-line);}
#${SCREEN_ID} .mr-import-t{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--mr-faint);margin-bottom:7px;}
#${SCREEN_ID} .mr-import-d{font-size:.78rem;line-height:1.6;color:var(--mr-sub);margin-bottom:12px;}
#${SCREEN_ID} .mr-import-name{width:100%;padding:11px 12px;margin-bottom:10px;border:1px solid var(--mr-line);border-radius:10px;background:var(--mr-card);color:var(--mr-main);font-family:inherit;font-size:.85rem;}
#${SCREEN_ID} .mr-import-name:focus{outline:none;border-color:var(--mr-accent);}
#${SCREEN_ID} .mr-import-btn{width:100%;padding:12px;border:1px solid var(--mr-line);border-radius:11px;background:var(--mr-card);color:var(--mr-main);font-family:'Space Mono',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;}
#${SCREEN_ID} .mr-import-btn:disabled{opacity:.5;cursor:default;}
#${SCREEN_ID} .mr-import-row{display:flex;gap:9px;}
#${SCREEN_ID} .mr-import-row .mr-import-btn{flex:1;}
#${SCREEN_ID} .mr-import-btn.danger{color:var(--mr-red);border-color:var(--mr-red);}
/* import char multi-select */
#${SCREEN_ID} .mr-imp-tools{display:flex;gap:14px;margin:2px 0 12px;}
#${SCREEN_ID} .mr-imp-all{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--mr-accent);cursor:pointer;}
#${SCREEN_ID} .pk.multi .pk-tick{opacity:1;color:var(--mr-faint);}
#${SCREEN_ID} .pk.multi.sel .pk-tick{color:var(--mr-accent);}
#${SCREEN_ID} .pk-sub{font-family:'Space Mono',monospace;font-size:9px;color:var(--mr-faint);margin-left:auto;margin-right:8px;}
#${SCREEN_ID} .mr-import-prog{font-family:'Space Mono',monospace;font-size:10px;color:var(--mr-faint);margin-top:9px;text-align:center;min-height:14px;}
/* confirm modal */
#${SCREEN_ID} .mr-modal-sm{max-height:none;padding-bottom:calc(env(safe-area-inset-bottom,22px) + 18px);}
#${SCREEN_ID} .mr-cf-body{font-size:.86rem;line-height:1.65;color:var(--mr-sub);margin:6px 0 20px;white-space:pre-line;}
#${SCREEN_ID} .mr-cf-acts{display:flex;gap:10px;}
#${SCREEN_ID} .mr-cf-acts button{flex:1;padding:13px;border-radius:11px;font-family:'Space Mono',monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;}
#${SCREEN_ID} .mr-cf-cancel{border:1px solid var(--mr-line);background:var(--mr-card);color:var(--mr-sub);}
#${SCREEN_ID} .mr-cf-ok{border:none;background:var(--mr-accent);color:var(--mr-bg);}
#${SCREEN_ID} .mr-cf-ok.danger{background:var(--mr-red);}
`;
    const tag = document.createElement('style');
    tag.id = 'memrag-style';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function _injectDOM() {
    if (document.getElementById(SCREEN_ID)) return;
    const el = document.createElement('div');
    el.id = SCREEN_ID;
    el.className = 'screen';
    el.innerHTML = `
      <div class="mr-wrap">
        <div class="mr-header">
          <span class="mr-back" id="mr-back">‹ BACK</span>
          <div class="mr-topact">
            <button class="tact" id="mr-extract"><span class="plus">✦</span> 立即抽取</button>
            <button class="tact primary" id="mr-addblank"><span class="plus">+</span> 手动记一条</button>
          </div>
          <div class="mr-kicker">Memory Vault · Discrete Recall</div>
          <div class="mr-title">记忆库<span class="cn">Memory</span></div>
          <div class="mr-sub">不再整坨塞进去 — 散成条，每次只取最相关的几条</div>
          <div class="mr-tokenbar">
            <div class="tk old"><div class="lab">旧·总结大法</div><div class="num">递增 <small>越聊越长</small></div></div>
            <div class="tk now"><div class="lab">新·离散召回</div><div class="num" id="mr-tk-now">top-5 <small>恒定</small></div></div>
          </div>
          <div class="mr-stats">
            <div class="mr-stat"><div class="num" id="mr-st-total">—</div><div class="lab">条记忆</div></div>
            <div class="mr-stat"><div class="num" id="mr-st-char">—</div><div class="lab">个角色</div></div>
            <div class="mr-stat"><div class="num" id="mr-st-topk">5</div><div class="lab">每轮召回</div></div>
          </div>
        </div>
        <div class="mr-toolbar">
          <div class="mr-search"><span class="ic">⌕</span><input id="mr-search" placeholder="搜索记忆内容、角色…"></div>
          <select class="mr-charsel" id="mr-charfilter"><option value="all">全部角色</option></select>
        </div>
        <div class="mr-list" id="mr-list"></div>
        <div class="mr-footer">
          <div class="mr-foot" id="mr-open-api">⚙ 抽取 API 池</div>
          <div class="mr-foot" id="mr-open-recall">⚙ 召回设置</div>
        </div>

        <!-- API 池弹层 -->
        <div class="mr-mask" id="mr-mask-api">
          <div class="mr-modal">
            <div class="mr-grip"></div>
            <div class="mr-mtitle">抽取 API · 预设池</div>
            <div class="mr-msub">后台轮询 — 报错就自动跳下一个</div>
            <div class="note">每轮对话后，记忆库把原文发给池子里<b>第一个可用</b>的 API 抽取记忆；某个<b>报错/超时/限流</b>就自动顺延到下一个。把最稳的放最上面。</div>
            <div class="phead"><span class="pt">轮询顺序 · 从上到下</span><span class="padd" id="mr-api-add">＋ 加一个</span></div>
            <div class="pool" id="mr-pool"></div>
            <button class="msave" id="mr-api-save">保存预设池</button>
          </div>
        </div>

        <!-- 召回设置弹层 -->
        <div class="mr-mask" id="mr-mask-recall">
          <div class="mr-modal">
            <div class="mr-grip"></div>
            <div class="mr-mtitle">召回设置</div>
            <div class="mr-msub">每次对话往上下文里塞几条 — token 封顶的旋钮</div>
            <div class="trow"><div class="lab">启用新记忆库<small>关掉则回退旧的「潜意识总结」</small></div><div class="sw" id="mr-sw-enabled"></div></div>
            <div class="trow"><div class="lab">自动抽取<small>每轮对话后后台静默提炼</small></div><div class="sw" id="mr-sw-auto"></div></div>
            <div class="srow">
              <div class="top"><span>每轮召回条数 (top-k)</span><span class="val" id="mr-topk-val">5</span></div>
              <input type="range" min="1" max="20" value="5" id="mr-topk">
              <div class="hint" style="margin-top:8px;">不管库里存了多少条，每轮只取这么多 → token 恒定。</div>
            </div>
            <div class="srow">
              <div class="top"><span>自动抽取间隔</span><span class="val" id="mr-ivl-val">每轮</span></div>
              <input type="range" min="1" max="20" value="1" id="mr-ivl">
            </div>
            <button class="msave" id="mr-recall-save">保存</button>
            <div class="mr-import">
              <div class="mr-import-t">从旧记忆导入</div>
              <div class="mr-import-d">把做记忆库之前、每个角色「潜意识总结」里积累的内容,一次性拆成离散条目入库。会消耗抽取 API 额度,只需跑一次。</div>
              <input class="mr-import-name" id="mr-import-name" placeholder="你的名字(用户面具名,如 KK)— 留空则自动读取绑定">
              <div class="mr-import-row">
                <button class="mr-import-btn" id="mr-import-btn">↓ 导入旧记忆档案</button>
                <button class="mr-import-btn danger" id="mr-clear-legacy">清空已导入</button>
              </div>
              <div class="mr-import-prog" id="mr-import-prog"></div>
            </div>
          </div>
        </div>

        <!-- 手动记一条:角色选择弹层 -->
        <div class="mr-mask" id="mr-mask-pick">
          <div class="mr-modal">
            <div class="mr-grip"></div>
            <div class="mr-mtitle">这条记忆属于谁？</div>
            <div class="mr-msub">选一个角色 — 这条记忆只会在和 TA 聊天时被召回</div>
            <div class="mr-pick-list" id="mr-pick-list"></div>
          </div>
        </div>

        <!-- 通用确认弹层(替代原生 confirm,FTP/PWA 下原生弹窗会被吞) -->
        <div class="mr-mask" id="mr-mask-confirm">
          <div class="mr-modal mr-modal-sm">
            <div class="mr-grip"></div>
            <div class="mr-mtitle" id="mr-cf-title">确认</div>
            <div class="mr-cf-body" id="mr-cf-body"></div>
            <div class="mr-cf-acts">
              <button class="mr-cf-cancel" id="mr-cf-cancel">取消</button>
              <button class="mr-cf-ok" id="mr-cf-ok">确定</button>
            </div>
          </div>
        </div>

        <!-- 导入:角色多选弹层 -->
        <div class="mr-mask" id="mr-mask-imppick">
          <div class="mr-modal">
            <div class="mr-grip"></div>
            <div class="mr-mtitle">选择要导入的角色</div>
            <div class="mr-msub">只列出有旧记忆档案的角色 — 勾选后再导入,省时省额度</div>
            <div class="mr-imp-tools">
              <span class="mr-imp-all" id="mr-imp-selall">全选</span>
              <span class="mr-imp-all" id="mr-imp-none">清空</span>
            </div>
            <div class="mr-pick-list" id="mr-imp-list"></div>
            <button class="msave" id="mr-imp-go">导入选中角色</button>
          </div>
        </div>
      </div>`;
    const _host = document.querySelector('.device') || document.body;
    _host.appendChild(el);
    _bindEvents();
  }
  /* ── 事件绑定 ── */
  function _bindEvents() {
    const $ = (id)=>document.getElementById(id);
    $('mr-back').onclick = close;
    $('mr-search').oninput = (e)=>{ _uiSearch = e.target.value.trim().toLowerCase(); _renderList(); };
    $('mr-charfilter').onchange = (e)=>{ _uiCharFilter = e.target.value; _renderList(); };
    $('mr-extract').onclick = _onManualExtract;
    $('mr-addblank').onclick = _onAddBlank;
    $('mr-open-api').onclick = ()=>{ _poolLoaded=false; _renderPool(); $('mr-mask-api').classList.add('show'); };
    $('mr-open-recall').onclick = _openRecall;
    $('mr-api-add').onclick = _onApiAdd;
    $('mr-api-save').onclick = ()=>{ $('mr-mask-api').classList.remove('show'); _toast('预设池已保存'); };
    $('mr-recall-save').onclick = _onRecallSave;
    $('mr-import-btn').onclick = _onImportLegacy;
    $('mr-clear-legacy').onclick = _onClearLegacy;
    $('mr-imp-go').onclick = _runImport;
    $('mr-imp-selall').onclick = ()=>{ const d=_renderImpList._data||[]; _impSel=new Set(d.map(c=>c.id)); _renderImpList(d); };
    $('mr-imp-none').onclick  = ()=>{ _impSel=new Set(); _renderImpList(_renderImpList._data||[]); };
    [$('mr-mask-api'),$('mr-mask-recall'),$('mr-mask-pick'),$('mr-mask-imppick')].forEach(m=> m.onclick=(e)=>{ if(e.target===m) m.classList.remove('show'); });
    // 召回滑块实时
    $('mr-topk').oninput = (e)=>{ $('mr-topk-val').textContent=e.target.value; $('mr-st-topk').textContent=e.target.value; $('mr-tk-now').firstChild.textContent='top-'+e.target.value+' '; };
    $('mr-ivl').oninput  = (e)=>{ $('mr-ivl-val').textContent = e.target.value==1?'每轮':('每'+e.target.value+'轮'); };
    $('mr-sw-enabled').onclick = (e)=> e.currentTarget.classList.toggle('on');
    $('mr-sw-auto').onclick    = (e)=> e.currentTarget.classList.toggle('on');
  }

  /* ── 渲染:列表 ── */
  async function _renderList() {
    const list = document.getElementById('mr-list');
    if (!list) return;
    const all = await getAll();
    // 统计
    document.getElementById('mr-st-total').textContent = all.length;
    document.getElementById('mr-st-char').textContent = new Set(all.flatMap(m=>m.character_ids||[])).size;
    // 角色筛选下拉
    const sel = document.getElementById('mr-charfilter');
    const ids = [...new Set(all.flatMap(m=>m.character_ids||[]))];
    sel.innerHTML = `<option value="all">全部角色</option>` + ids.map(id=>`<option value="${id}" ${id===_uiCharFilter?'selected':''}>${_esc(_nameOf(id))}</option>`).join('');
    // 过滤排序
    let items = all
      .filter(m => _uiCharFilter==='all' || (m.character_ids||[]).includes(_uiCharFilter))
      .filter(m => !_uiSearch || (m.content||'').toLowerCase().includes(_uiSearch) || (m.character_ids||[]).some(id=>_nameOf(id).toLowerCase().includes(_uiSearch)))
      .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    if (!items.length) {
      list.innerHTML = `<div class="mr-empty"><div class="big">空空如也</div><div class="small">还没有记忆。聊几句，或点右下角「立即抽取」。</div></div>`;
      return;
    }
    let html='', lastDay='';
    for (const m of items) {
      const dl=_dayLabel(m.created_at);
      if (dl!==lastDay){ html+=`<div class="mr-day">${dl}</div>`; lastDay=dl; }
      html+=_card(m);
    }
    list.innerHTML = html;
    // 绑定卡片按钮
    list.querySelectorAll('[data-edit]').forEach(b=> b.onclick=()=>_startEdit(b.getAttribute('data-edit')));
    list.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>_onDel(b.getAttribute('data-del')));
  }

  function _card(m) {
    const srcMap={single:'单聊',group:'群聊',story:'剧情',ensemble:'群像'};
    const avs = (m.character_ids||[]).map(id=>`<div class="mc-av" style="background:${_colorOf(id)}">${_esc(_nameOf(id).charAt(0))}</div>`).join('');
    const names = (m.character_ids||[]).map(id=>_esc(_nameOf(id))).join(' · ');
    return `<div class="mc" id="mc-${m.id}">
      <div class="mc-top"><div class="mc-avs">${avs}</div><span class="mc-names">${names}</span><span class="mc-time">${_fmtTime(m.created_at)}</span></div>
      <div class="mc-content" id="mcc-${m.id}">${_esc(m.content)}</div>
      <div class="mc-tags"><span class="mc-tag src">${srcMap[m.source]||m.source||''}</span>${m.edited?`<span class="mc-tag edited">已手动编辑</span>`:''}</div>
      <div class="mc-acts" id="mca-${m.id}"><button data-edit="${m.id}">编辑</button><button class="danger" data-del="${m.id}">删除</button></div>
    </div>`;
  }

  function _startEdit(id) {
    const card=document.getElementById('mc-'+id), content=document.getElementById('mcc-'+id), acts=document.getElementById('mca-'+id);
    card.classList.add('editing');
    content.setAttribute('contenteditable','true'); content.focus();
    acts.innerHTML = `<button class="primary" id="mr-save-${id}">保存</button><button id="mr-cancel-${id}">取消</button>`;
    document.getElementById('mr-save-'+id).onclick = async ()=>{ await updateItem(id,{content:content.textContent.trim()}); _renderList(); };
    document.getElementById('mr-cancel-'+id).onclick = ()=> _renderList();
  }
  async function _onDel(id) {
    if (!await _confirm('删除这条记忆？', { okText:'删除', danger:true })) return;
    await deleteItem(id); _renderList();
  }
  async function _onAddBlank() {
    // 预选:当前筛选的角色 > 当前正在聊天的角色 > 不预选
    let preset = _uiCharFilter !== 'all' ? _uiCharFilter : '';
    if (!preset) { try { preset = document.getElementById('conv-screen')?.dataset.cvCharId || ''; } catch(_) {} }
    await _loadCharMap();
    const ids = Object.keys(_charMap);
    const box = document.getElementById('mr-pick-list');
    if (!ids.length) {
      box.innerHTML = `<div class="mr-pick-empty">还没有任何角色。先去创建一个角色,再来手动记忆。</div>`;
    } else {
      box.innerHTML = ids.map(id=>{
        const c = _charMap[id];
        return `<div class="pk ${id===preset?'sel':''}" data-pick="${id}">
          <div class="pk-av" style="background:${c.color}">${_esc((c.name||'#').charAt(0))}</div>
          <div class="pk-name">${_esc(c.name)}</div>
          <span class="pk-tick">✓ 选中</span>
        </div>`;
      }).join('');
      box.querySelectorAll('[data-pick]').forEach(el=>{
        el.onclick = ()=> _pickCharForBlank(el.getAttribute('data-pick'));
      });
    }
    document.getElementById('mr-mask-pick').classList.add('show');
  }
  // 选定角色后真正建条目
  async function _pickCharForBlank(cid) {
    document.getElementById('mr-mask-pick').classList.remove('show');
    const item = await addItem({ content:'（点编辑填写这条记忆…）', character_ids:[cid], source:'single', _skipDedup:true });
    if (item){ await _renderList(); setTimeout(()=>_startEdit(item.id),50); }
  }
  /* ── 取某角色绑定的人设名(给手动抽取用,复刻主文件 _getBoundPersona 的取名逻辑,零耦合改动) ── */
  async function _personaNameFor(charId) {
    // PersonaModule 在主文件是顶层 const,不一定挂在 window 上 —— 裸引用优先,window 兜底
    const PM = (typeof PersonaModule !== 'undefined') ? PersonaModule : (window.PersonaModule || null);
    try {
      const binding = await DB.bindings.get(String(charId)).catch(()=>null);
      const personaId = binding ? binding.personaId : PM?.getActiveId?.();
      const all = PM?.getAll?.() || [];
      const p = all.find(x => String(x.id) === String(personaId)) || all[0];
      const name = (p && p.name) ? p.name : '';
      console.log(`[MemoryRAG] _personaNameFor(${charId}): binding=${binding?('personaId='+binding.personaId):'无绑定'}, personaList=${all.length}条, 命中名=「${name||'空'}」`);
      return name;
    } catch(e) { console.warn('[MemoryRAG] _personaNameFor 出错:', e); return ''; }
  }

  async function _onManualExtract() {
    const cid = _uiCharFilter!=='all' ? _uiCharFilter : (document.getElementById('conv-screen')?.dataset.cvCharId || null);
    if (!cid){ _toast('先在上方选一个角色,再点立即抽取'); return; }
    try {
      const recent = await DB.messages.getPage(String(cid), 0, 6);
      const userName = await _personaNameFor(cid);
      const nameMap = { [String(cid)]: _nameOf(cid) };
      const txt = flattenTurn(recent, userName || '用户', nameMap);
      const created = await extract(txt, [cid], { source:'single', userName, force:true });
      _toast(created.length ? `抽取入库 ${created.length} 条` : '这段没有值得记的新事实');
      _renderList();
    } catch(e){ _toast('抽取失败:'+(e.message||'检查 API 池')); }
  }

  /* ── 渲染:API 池 ── */
  let _poolCache = [];
  let _poolLoaded = false;
  async function _loadPoolOnce() {
    _poolCache = await getPool();
    _poolLoaded = true;
  }
  async function _renderPool() {
    if (!_poolLoaded) await _loadPoolOnce();   // 只首次从 DB 读,之后全用内存,避免冲掉 _models
    const box = document.getElementById('mr-pool');
    const pool = [..._poolCache].sort((a,b)=>(a.order??0)-(b.order??0));
    if (!pool.length) { box.innerHTML = `<div class="hint" style="padding:10px 0;">还没有 API。点上面「＋ 加一个」添加第一个抽取 API。</div>`; return; }
    const stMap={ok:['ok','可用'],err:['err','报错'],testing:['testing','测试中'],idle:['','未测']};
    box.innerHTML = pool.map((p,i)=>{
      const st=stMap[p._status]||stMap.idle;
      const modelField = (p._models&&p._models.length)
        ? `<select data-f="model" data-id="${p.id}">${p._models.map(m=>`<option ${m===p.model?'selected':''}>${_esc(m)}</option>`).join('')}</select>`
        : `<input data-f="model" data-id="${p.id}" value="${_esc(p.model||'')}" placeholder="模型名 / 点右侧拉取">`;
      return `<div class="ac ${p.enabled?'':'off'}">
        <div class="ac-top"><span class="ac-ord">${i+1}</span><input class="ac-name" data-f="name" data-id="${p.id}" value="${_esc(p.name||'')}"><span class="ac-st"><span class="ac-dot ${st[0]}"></span>${st[1]}</span></div>
        <div class="ac-f">
          <input data-f="url" data-id="${p.id}" value="${_esc(p.url||'')}" placeholder="https://…/v1">
          <input data-f="key" data-id="${p.id}" type="password" value="${_esc(p.key||'')}" placeholder="sk-…">
          <div class="ac-model">${modelField}<button class="ac-fetch ${p._fetching?'loading':''}" data-fetch="${p.id}">${p._fetching?'<span class="spin"></span>拉取中':'↻ 拉取模型'}</button></div>
        </div>
        <div class="ac-ops">
          <button data-mv="${p.id}|-1" ${i===0?'disabled':''}>↑</button>
          <button data-mv="${p.id}|1" ${i===pool.length-1?'disabled':''}>↓</button>
          <button data-test="${p.id}">测试</button>
          <button data-toggle="${p.id}">${p.enabled?'禁用':'启用'}</button>
          <span class="sp"></span>
          <button class="del" data-delapi="${p.id}">删除</button>
        </div>
      </div>`;
    }).join('');
    // 绑定
    box.querySelectorAll('[data-f]').forEach(inp=> inp.onchange=()=>_poolUpd(inp.getAttribute('data-id'), inp.getAttribute('data-f'), inp.value));
    box.querySelectorAll('[data-fetch]').forEach(b=> b.onclick=()=>_poolFetch(b.getAttribute('data-fetch')));
    box.querySelectorAll('[data-mv]').forEach(b=> b.onclick=()=>{ const [id,d]=b.getAttribute('data-mv').split('|'); _poolMove(id,+d); });
    box.querySelectorAll('[data-test]').forEach(b=> b.onclick=()=>_poolTest(b.getAttribute('data-test')));
    box.querySelectorAll('[data-toggle]').forEach(b=> b.onclick=()=>_poolToggle(b.getAttribute('data-toggle')));
    box.querySelectorAll('[data-delapi]').forEach(b=> b.onclick=()=>_poolDel(b.getAttribute('data-delapi')));
  }
  async function _persistPool(){ await savePool(_poolCache); }
  function _poolUpd(id,f,v){ const p=_poolCache.find(x=>x.id===id); if(p){ p[f]=v; _persistPool(); } }
  async function _onApiAdd(){
    const order = Math.max(-1,..._poolCache.map(p=>p.order??0))+1;
    _poolCache.push({ id:_uid(), name:'新 API', url:'', key:'', model:'', enabled:true, order, _status:'idle' });
    await _persistPool(); _renderPool();
  }
  async function _poolDel(id){ if(!await _confirm('从池子里删掉这个 API？',{okText:'删除',danger:true}))return; _poolCache=_poolCache.filter(x=>x.id!==id); await _persistPool(); _renderPool(); }
  async function _poolToggle(id){ const p=_poolCache.find(x=>x.id===id); if(p)p.enabled=!p.enabled; await _persistPool(); _renderPool(); }
  async function _poolMove(id,dir){
    const sorted=[..._poolCache].sort((a,b)=>(a.order??0)-(b.order??0));
    const i=sorted.findIndex(p=>p.id===id), j=i+dir;
    if(j<0||j>=sorted.length)return;
    const oi=sorted[i].order; sorted[i].order=sorted[j].order; sorted[j].order=oi;
    await _persistPool(); _renderPool();
  }
  async function _poolTest(id){
    const p=_poolCache.find(x=>x.id===id); if(!p)return;
    if(!p.url||!p.key||!p.model){ _toast('先填好地址/Key/模型'); return; }
    p._status='testing'; _renderPool();
    try {
      await ApiHelper.chatCompletion({url:p.url,key:p.key,model:p.model,temp:0.1},[{role:'user',content:'ping'}]);
      p._status='ok';
    } catch(e){ p._status='err'; }
    await _persistPool();   // ✅ 落盘,绿灯/红灯在重开后仍在
    _renderPool();
  }
  async function _poolFetch(id){
    const p=_poolCache.find(x=>x.id===id); if(!p)return;
    if(!p.url||!p.key){ _toast('先填好地址和 Key'); return; }
    p._fetching=true; _renderPool();
    try {
      const models = await ApiHelper.fetchModels(p.url, p.key);
      p._models = models;
      if(!p.model && models.length) p.model = models[0];
    } catch(e){ _toast('拉取失败:'+(e.message||'检查地址/Key')); }
    finally { p._fetching=false; await _persistPool(); _renderPool(); }
  }

  /* ── 召回设置 ── */
  async function _openRecall() {
    const cfg = await getConfig();
    document.getElementById('mr-sw-enabled').classList.toggle('on', !!cfg.enabled);
    document.getElementById('mr-sw-auto').classList.toggle('on', !!cfg.autoExtract);
    document.getElementById('mr-topk').value = cfg.topk;
    document.getElementById('mr-topk-val').textContent = cfg.topk;
    document.getElementById('mr-ivl').value = cfg.interval;
    document.getElementById('mr-ivl-val').textContent = cfg.interval==1?'每轮':('每'+cfg.interval+'轮');
    document.getElementById('mr-mask-recall').classList.add('show');
  }
  async function _onRecallSave() {
    await setConfig({
      enabled:     document.getElementById('mr-sw-enabled').classList.contains('on'),
      autoExtract: document.getElementById('mr-sw-auto').classList.contains('on'),
      topk:        parseInt(document.getElementById('mr-topk').value,10),
      interval:    parseInt(document.getElementById('mr-ivl').value,10),
    });
    document.getElementById('mr-mask-recall').classList.remove('show');
    document.getElementById('mr-st-topk').textContent = document.getElementById('mr-topk').value;
    _toast('召回设置已保存');
  }
  let _importing = false;
  let _impSel = new Set();   // 多选弹层里勾选的 charId
  // 第一步:点导入 → 扫出有旧记忆的角色 → 弹多选
  async function _onImportLegacy() {
    if (_importing) return;
    const btn = document.getElementById('mr-import-btn');
    const prog = document.getElementById('mr-import-prog');
    btn.disabled = true; btn.textContent = '扫描中…';
    let withMem = [];
    try {
      let chars = [];
      try { chars = await DB.characters.getAll(); } catch(_) {}
      for (const ch of chars) {
        let summary = '';
        try { const mem = await MemoryModule.load(String(ch.id)); summary = (mem && mem.summary || '').trim(); } catch(_) {}
        if (summary) withMem.push({ id:String(ch.id), name:ch.name||('#'+ch.id), len:summary.length });
      }
    } catch(e) {
      _toast('扫描失败:'+(e.message||'')); btn.disabled=false; btn.textContent='↓ 导入旧记忆档案'; return;
    } finally {
      btn.disabled = false; btn.textContent = '↓ 导入旧记忆档案';
    }
    if (!withMem.length) { if(prog) prog.textContent='没有任何角色有旧记忆档案'; _toast('没找到旧记忆,无需导入'); return; }
    // 默认全选
    _impSel = new Set(withMem.map(c=>c.id));
    _renderImpList(withMem);
    document.getElementById('mr-mask-imppick').classList.add('show');
  }
  function _renderImpList(withMem) {
    const box = document.getElementById('mr-imp-list');
    box.innerHTML = withMem.map(c=>{
      const col = _colorOf(c.id);
      return `<div class="pk multi ${_impSel.has(c.id)?'sel':''}" data-imp="${c.id}">
        <div class="pk-av" style="background:${col}">${_esc(c.name.charAt(0))}</div>
        <div class="pk-name">${_esc(c.name)}</div>
        <span class="pk-sub">${c.len}字</span>
        <span class="pk-tick">${_impSel.has(c.id)?'☑':'☐'}</span>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-imp]').forEach(el=>{
      el.onclick = ()=>{
        const id = el.getAttribute('data-imp');
        if (_impSel.has(id)) _impSel.delete(id); else _impSel.add(id);
        _renderImpList(withMem);
      };
    });
    // 缓存供全选/清空用
    _renderImpList._data = withMem;
  }
  // 第二步:确认导入选中的角色
  async function _runImport() {
    if (_importing) return;
    const ids = [..._impSel];
    if (!ids.length) { _toast('至少选一个角色'); return; }
    document.getElementById('mr-mask-imppick').classList.remove('show');
    if (!await _confirm(`将导入 ${ids.length} 个角色的旧记忆,逐个调抽取 API 拆成条目。消耗 API 额度,可能花几分钟。`, { title:'开始导入？', okText:'开始导入' })) return;
    const forcedName = (document.getElementById('mr-import-name')?.value || '').trim();
    const btn = document.getElementById('mr-import-btn');
    const prog = document.getElementById('mr-import-prog');
    _importing = true; btn.disabled = true; btn.textContent = '导入中…';
    try {
      const res = await importLegacy(({ charName, done, total }) => {
        prog.textContent = `(${done}/${total}) 正在处理:${charName}`;
      }, forcedName, ids);
      prog.textContent = `✓ 完成 — ${res.withSummary} 个角色有旧档案,入库 ${res.created} 条`;
      _toast(`旧记忆导入完成,新增 ${res.created} 条`);
      await _renderList();
    } catch(e) {
      prog.textContent = '导入失败:' + (e.message||'检查抽取 API 池');
      _toast('导入失败:' + (e.message||'检查 API 池'));
    } finally {
      _importing = false; btn.disabled = false; btn.textContent = '↓ 导入旧记忆档案';
    }
  }
  async function _onClearLegacy() {
    if (!await _confirm('只删除「导入旧记忆」生成的条目(LEGACY 标记),你手动记的、聊天里抽取的都不会动。删完可以填好名字重新导入。', { title:'清空已导入的旧记忆？', okText:'清空', danger:true })) return;
    const removed = await clearBySource('legacy');
    await _renderList();
    const prog = document.getElementById('mr-import-prog');
    if (prog) prog.textContent = `✓ 已清除 ${removed} 条导入条目`;
    _toast(`已清除 ${removed} 条 LEGACY 记忆`);
  }

  /* ── 小工具 ── */
  function _fmtTime(iso){ const d=new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  function _dayLabel(iso){ const diff=Math.floor((new Date().setHours(0,0,0,0)-new Date(iso).setHours(0,0,0,0))/864e5); if(diff===0)return '今天'; if(diff===1)return '昨天'; const d=new Date(iso); return `${d.getMonth()+1}月${d.getDate()}日`; }

  /* ── 生命周期 ── */
  async function init() {
    _injectStyles();
    _injectDOM();
    _mounted = true;
  }
  async function open() {
    if (!_mounted) await init();
    await _loadCharMap();
    const cfg = await getConfig();
    document.getElementById('mr-st-topk').textContent = cfg.topk;
    document.getElementById('mr-tk-now').firstChild.textContent = 'top-'+cfg.topk+' ';
    await _renderList();
    document.getElementById(SCREEN_ID).classList.add('active');
    // 藏掉桌面底部 dock(它是 fixed,会透出来)
    try { document.getElementById('dock-wrapper')?.classList.add('hidden'); } catch(_) {}
  }
  function close() {
    const el = document.getElementById(SCREEN_ID);
    if (el) el.classList.remove('active');
    // 恢复桌面 dock
    try { document.getElementById('dock-wrapper')?.classList.remove('hidden'); } catch(_) {}
  }

  return {
    init, open, close,
    // 配置
    getConfig, setConfig, isEnabled,
    // 记忆 CRUD
    getAll, addItem, updateItem, deleteItem, clearAll, clearBySource,
    // API 池
    getPool, savePool,
    // 核心(供主文件挂钩)
    extract, recall, flattenTurn, importLegacy,
  };
})();

if (typeof window !== 'undefined') window.MemoryRAG = MemoryRAG;
// 自动初始化(仿 group-story.js 末尾)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { try { MemoryRAG.init(); } catch(e){ console.warn('MemoryRAG init failed', e); } });
  } else {
    try { MemoryRAG.init(); } catch(e){ console.warn('MemoryRAG init failed', e); }
  }
}