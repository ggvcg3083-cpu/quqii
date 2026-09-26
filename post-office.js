// ============================================================
// 时空邮局 PostOfficeModule — 全屏 overlay（风格对齐主站）
// PostOfficeModule.open() / .close()
// ============================================================
const PostOfficeModule = (() => {
  const MOCK_POOL = [
    { from: '匿名洋流', to: '未署名', body: '我在凌晨三点的码头听见你的名字，潮水把它吞下去了。若你收到，请当作海在回信。', tag: '漂流' },
    { from: '北回归线邮局', to: '局长亲启', body: '本件为时空折返件，请勿在因果闭合前拆阅副封。', tag: '机密' },
    { from: '旧灯塔守夜人', to: '任意港', body: '雾太大，我把信绑在信天翁腿上。它若迷航，便是命运另有收件人。', tag: '延误' },
    { from: '星轨投递站', to: '地表·你', body: '光年之外的问候延迟到达：昨天你抬头看的那颗星，当时也在看你。', tag: '星际' },
    { from: '雨季自动笔', to: '晒干的人', body: '墨迹在纸上晕成一小片湖。我把它折成船，放进你窗外的排水沟。', tag: '诗意' },
    { from: '遗忘症候群', to: '记得的人', body: '我不记得为何写下这封信。只记得信封里应有一枚不会生锈的纽扣。', tag: '失忆' },
    { from: '地下铁 7 号线', to: '同车陌生人', body: '你掉落的耳机线缠住了我的时间轴。车到站时，请把它当作归还宇宙。', tag: '都市' },
    { from: '折纸鲸鱼', to: '陆地', body: '纸受潮会沉。我在信里留了一行盐，愿你在需要时尝到海。', tag: '童话' },
  ];

  let _root = null;
  let _letters = [];
  let _loading = false;
  let _detailId = null;
  let _returnExpanded = false;
  let _replyDraftTimer = null;

  const PO_REPLY_STORE_KEY = 'post_office_reply_store_v1';
  const PO_SENT_REPLIES_KEY = 'post_office_sent_replies_v1';
  const PO_MAILBOX_KEY = 'post_office_mailbox_v1';

  function _loadReplyStore() {
    try {
      const raw = localStorage.getItem(PO_REPLY_STORE_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      if (!obj || typeof obj !== 'object') return { drafts: {} };
      if (!obj.drafts || typeof obj.drafts !== 'object') obj.drafts = {};
      return obj;
    } catch (_) {
      return { drafts: {} };
    }
  }

  function _writeReplyStore(store) {
    try {
      localStorage.setItem(PO_REPLY_STORE_KEY, JSON.stringify(store || { drafts: {} }));
    } catch (_) {}
  }

  function _getReplyDraft(id) {
    if (!id) return null;
    const store = _loadReplyStore();
    const d = store.drafts && store.drafts[id];
    return d && typeof d === 'object' ? d : null;
  }

  function _saveReplyDraft(id, text, meta) {
    if (!id) return;
    const v = String(text || '').trim();
    const store = _loadReplyStore();
    if (!v) {
      if (store.drafts && store.drafts[id]) {
        delete store.drafts[id];
        _writeReplyStore(store);
      }
      return;
    }
    store.drafts = store.drafts || {};
    store.drafts[id] = {
      id,
      text: v,
      meta: meta && typeof meta === 'object' ? meta : {},
      updatedAt: Date.now(),
    };
    _writeReplyStore(store);
  }

  function _deleteReplyDraft(id) {
    if (!id) return;
    const store = _loadReplyStore();
    if (store.drafts && store.drafts[id]) {
      delete store.drafts[id];
      _writeReplyStore(store);
    }
  }

  function _listReplyDrafts() {
    const store = _loadReplyStore();
    const drafts = Object.values(store.drafts || {}).filter(Boolean);
    drafts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return drafts;
  }

  function _fmtTime(ts) {
    try {
      const d = new Date(ts || 0);
      if (!ts || Number.isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    } catch (_) {
      return '';
    }
  }

  function _loadMailbox() {
    try {
      const raw = localStorage.getItem(PO_MAILBOX_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      if (!obj || typeof obj !== 'object') return { threads: {} };
      if (!obj.threads || typeof obj.threads !== 'object') obj.threads = {};
      return obj;
    } catch (_) {
      return { threads: {} };
    }
  }

  function _writeMailbox(store) {
    try {
      localStorage.setItem(PO_MAILBOX_KEY, JSON.stringify(store || { threads: {} }));
    } catch (_) {}
  }

  function _mailboxThreadIdFromLetter(letter) {
    if (!letter) return null;
    // 优先使用 threadId，保证无限回信都在同一个线索下
    return String(letter.threadId || letter.id);
  }

  function _mailboxUpsertOriginal(letter) {
    const tid = _mailboxThreadIdFromLetter(letter);
    if (!tid) return null;
    const now = Date.now();
    const store = _loadMailbox();
    store.threads = store.threads || {};
    const prev = store.threads[tid];
    const original = {
      id: tid,
      from: (letter.from || '未知发件'),
      to: (letter.to || '未知收件'),
      tag: (letter.tag || '无标签'),
      dimension: letter.dimension || null,
      body: (letter.body || ''),
      original: letter.original || '',
      translation: letter.translation || null,
      styleNote: letter.styleNote || '',
    };
    const thread = prev && typeof prev === 'object' ? prev : { id: tid, messages: [], createdAt: now };
    thread.id = tid;
    thread.original = thread.original && thread.original.body ? thread.original : original;
    thread.updatedAt = thread.updatedAt || now;
    if (!Array.isArray(thread.messages)) thread.messages = [];
    store.threads[tid] = thread;
    _writeMailbox(store);
    return tid;
  }

  function _mailboxAppend(tid, kind, body) {
    if (!tid) return;
    const v = String(body || '').trim();
    if (!v) return;
    const store = _loadMailbox();
    store.threads = store.threads || {};
    const now = Date.now();
    const thread = store.threads[tid] && typeof store.threads[tid] === 'object'
      ? store.threads[tid]
      : { id: tid, original: null, messages: [], createdAt: now };
    if (!Array.isArray(thread.messages)) thread.messages = [];
    thread.messages.push({ kind: kind || 'note', body: v, at: now });
    thread.updatedAt = now;
    store.threads[tid] = thread;
    _writeMailbox(store);
  }

  function _mailboxGetThread(tid) {
    if (!tid) return null;
    const store = _loadMailbox();
    const t = store.threads && store.threads[tid];
    return t && typeof t === 'object' ? t : null;
  }

  function _mailboxListThreads() {
    const store = _loadMailbox();
    const all = Object.values(store.threads || {}).filter(Boolean);
    all.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return all;
  }

  function _mailboxRemoveThread(tid) {
    if (!tid) return;
    const store = _loadMailbox();
    if (store.threads && store.threads[tid]) {
      delete store.threads[tid];
      _writeMailbox(store);
    }
  }

  function _mailboxCount() {
    return _mailboxListThreads().length;
  }

  function _loadSentReplies() {
    try {
      const raw = localStorage.getItem(PO_SENT_REPLIES_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(arr) ? arr : [];
      return list.filter(x => x && typeof x === 'object' && x.replyText && x.original && x.original.body);
    } catch (_) {
      return [];
    }
  }

  function _writeSentReplies(list) {
    try {
      const safe = Array.isArray(list) ? list.slice(0, 300) : [];
      localStorage.setItem(PO_SENT_REPLIES_KEY, JSON.stringify(safe));
    } catch (_) {}
  }

  function _saveSentReply(originalLetter, replyText) {
    const v = String(replyText || '').trim();
    if (!v) return null;
    const src = originalLetter && typeof originalLetter === 'object' ? originalLetter : null;
    if (!src || !src.body) return null;
    const now = Date.now();
    const row = {
      id: `sent-${now}-${Math.floor(Math.random() * 1e6)}`,
      threadId: src.threadId || src.id, // 核心修复：继承母本的线索ID
      createdAt: now,
      original: {
        id: src.id || null,
        from: src.from || '',
        to: src.to || '',
        tag: src.tag || '',
        dimension: src.dimension || null,
        body: src.body || '',
      },
      replyText: v,
    };
    const list = _loadSentReplies();
    list.unshift(row);
    _writeSentReplies(list);
    return row;
  }

  function _buildIncomingReplyMock(thread) {
    const o = thread && thread.original ? thread.original : {};
    const hint = (o.tag && `（${o.tag}）`) || '';
    const base = MOCK_POOL[Math.floor(Math.random() * MOCK_POOL.length)];
    const body = `你那封回信我收到了${hint}。\n\n${base.body}\n\n我把结尾折小一些，好让它更容易被洋流带回。`;
    return {
      id: `in-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      source: 'incoming_reply',
      tag: '回信',
      from: o.from || '未知发件',
      to: o.to || '未署名',
      body,
      kind: 'spacetime',
      dimension: o.dimension || null,
      original: body,
      translation: null,
      styleNote: '',
      replyToId: o.id || null,
    };
  }

  async function _fetchIncomingRepliesFromApi(activeApi, threads, maxCount) {
    const api = activeApi && activeApi.url && activeApi.key && activeApi.model ? activeApi : null;
    if (!api) return null;
    const list = Array.isArray(threads) ? threads : [];
    const k = Math.max(0, Math.min(Number(maxCount) || 0, list.length, 2));
    if (k <= 0) return [];
    const pick = [];
    const used = new Set();
    for (let i = 0; i < 18 && pick.length < k; i++) {
      const t = list[Math.floor(Math.random() * list.length)];
      if (!t || used.has(t.id)) continue;
      used.add(t.id);
      pick.push(t);
    }

    const system = [
      '你是一位文学家与邮局的回信人。',
      '目标：为每个「已寄出的回信」写出对方寄回来的「回信」。',
      '语言禁忌：严禁出现【系统、变量、量化、精准、轨迹、频率、机制、程序、运算、载体、维度、参数、逻辑闭环、数据分析、修正】等词及近义表达。',
      '写法：具体物象、感官与情绪；不要解释规则；不要出现 AI 腔。',
      '输出：只输出 JSON 数组；每项必须含 from/to/tag/body/dimension。',
    ].join('\\n');

    const user = pick.map((t, idx) => {
      const o = t.original || {};
      return [
        `# THREAD ${idx + 1}`,
        `原信 from=${o.from || ''} to=${o.to || ''} tag=${o.tag || ''} dimension=${o.dimension || ''}`,
        `原信正文：${o.body || ''}`,
        `我方回信（已寄出）：${t.replyText || ''}`,
        '现在请根据我方回信，写出「对方收信后的二次回信」。字数 240–420 字左右，中文；translation=null。',
      ].join('\\n');
    }).join('\\n\\n');

    const raw = await ApiHelper.chatCompletion(api, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    const arr = _extractJsonArray(raw);
    if (!arr || !arr.length) return null;
    const out = [];
    for (let i = 0; i < Math.min(arr.length, pick.length); i++) {
      const t = pick[i];
      const o = t.original || {};
      const row = arr[i] || {};
      const from = String(row.from ?? row['发件人'] ?? o.from ?? '').trim() || (o.from || '未知发件');
      const to = String(row.to ?? row['收件人'] ?? o.to ?? '').trim() || (o.to || '未署名');
      const tag = String(row.tag ?? row['标签'] ?? '回信').trim() || '回信';
      const body = String(row.body ?? row['正文'] ?? row.content ?? '').trim();
      const dim = row.dimension ?? row.维度;
      const dimension = dim ? String(dim).toUpperCase().slice(0, 1) : (o.dimension || null);
      if (!body) continue;
      out.push({
        id: `in-${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}`,
        threadId: t.threadId || o.id, // 核心修复：携带原线索ID
        source: 'incoming_reply',
        tag,
        from,
        to,
        body,
        kind: 'spacetime',
        dimension: 'ABCDEFG'.includes(String(dimension || '')) ? String(dimension) : (o.dimension || null),
        original: body,
        translation: null,
        styleNote: '',
        replyToId: o.id || null,
      });
    }
    return out;
  }

  function _pickIncomingRepliesForRound(n) {
    const sent = _loadSentReplies();
    if (!sent.length) return [];
    
    // 核心修复：按照 threadId 去重，只抓取每个对话串【最新】的一次回信进行生成，防止 AI 回复远古消息
    const latestPerThread = new Map();
    for (const s of sent) {
       const tid = s.threadId || s.original.id;
       if (!latestPerThread.has(tid)) {
          latestPerThread.set(tid, s);
       }
    }
    const uniqueSent = Array.from(latestPerThread.values());

    const roll = Math.random();
    const want = roll < 0.12 ? 2 : roll < 0.48 ? 1 : 0;
    const k = Math.min(want, uniqueSent.length, Math.max(0, Math.floor(n / 5)));
    if (k <= 0) return [];
    
    const out = [];
    const used = new Set();
    for (let i = 0; i < 16 && out.length < k; i++) {
      const t = uniqueSent[Math.floor(Math.random() * uniqueSent.length)];
      if (!t || used.has(t.id)) continue;
      used.add(t.id);
      out.push(t);
    }
    return out;
  }

  /** 未寄出的信 · 系统提示（全部为时空信件，无角色绑定） */
  function _buildUnsentLettersSystemPrompt(count) {
    const n = Math.max(1, Math.min(20, Number(count) || 5));
    const spacetimeBlock = `## 【时空信件】（本轮 ${n} 封）—— 极致差异化
**【强制约束】** 从以下 **A–G** 七个维度中，为每一封信指定互不重复的 \`dimension\` 字段（取值为 "A"～"G"）。若封数多于 7，从第 8 封起在不重复的前提下轮换，但仍须保证**身份 / 时代 / 文体**彼此显著不同。

- **维度 A [古典/古代]:** 宋朝词人、庞贝城面包师、江户艺伎、中世纪抄写员。
- **维度 B [黄金时代/近代]:** 19 世纪伦敦侦探、维多利亚女仆、泰坦尼克号乘客、民国学生。
- **维度 C [战争/动荡]:** 二战战壕里的士兵、冷战时期的间谍、流亡的贵族、沉船的幸存者。
- **维度 D [赛博/未来]:** 2077 年即将报废的仿生人、火星殖民地植物学家、最后一条鲸鱼的观察者。
- **维度 E [探险/边缘]:** 大航海时代的水手、极地科考队员、灯塔看守人、沙漠旅人。
- **维度 F [市井/烟火]:** 80 年代香港茶餐厅老板、深夜便利店店员、凌晨的清洁工。
- **维度 G [奇幻/非人]:** 活了太久的吸血鬼、森林里的鹿神、一面看尽世态炎凉的镜子。
- **要求：** 严格遵守**禁词表**；每封信从**文风库**中选各自适配的一种风格，可在 \`styleNote\` 写明作家名。`;

    const execBlock = `---
# 【局长信箱 · 机械执行】
- 本轮 JSON 数组长度必须 **恰好为 ${n}**。
- 每一条 \`kind\` 均为 \`"spacetime"\`，**不得**出现 \`"core"\`。
- 每条 \`dimension\` 须为 "A"～"G" 之一，并遵守上文差异化约束。`;

    const jsonBlock = `---
# 【JSON 输出（仅此一段，勿 markdown）】
只输出一个 JSON 数组。每个元素为对象，**必须**包含以下键（可用等价中文键名）：
- \`kind\`: 恒为 \`"spacetime"\`（可省略，省略则视为 spacetime）
- \`dimension\`: "A"|"B"|"C"|"D"|"E"|"F"|"G" 之一（此键仅为分类代号；**正文叙述中勿用禁词表中的「维度」二字**，可写「天向」「层面」等）
- \`from\` / 发件人，\`to\` / 收件人，\`tag\` / 标签（短标签，可含文风提示）
- \`original\`: 外语场景写外语原文；中文场景写中文
- \`translation\`: 外语场景写**文学级中文译本**；纯中文场景必须为 null
- \`body\`: **中文读者主展示文本**——若 \`translation\` 非空则 \`body\` 必须与 \`translation\` 完全一致；若 \`translation\` 为 null 则 \`body\` 与 \`original\` 一致（均为中文时二者相同）
- \`styleNote\`（可选）：如「张爱玲体」

**禁止**输出数组以外的任何字符。`;

    return `# 核心使命：生成来自不同时空的「未寄出的信」(The Unsent Letters)
你是一位精通多国语言的文学家，也是一位时空邮局的管理员。你需要从历史的长河或平行宇宙中打捞出信件。

# 【最高指令：语言禁忌 (Forbidden Words)】
**对全部信件强制生效。**
1. **绝对禁止理科/AI 腔词汇：** 严禁出现【系统、变量、量化、精准、轨迹、频率、机制、程序、运算、载体、维度、参数、逻辑闭环、数据分析、修正】等词及近义表达。
2. **感性逻辑：** 世界由**情绪、感官、光影、气味和具体物品**构成。
   - 错误示例：「这种情感超出了我的预设阈值。」
   - 正确示例：「这种感觉像野草一样疯长，怎么也压不住。」

# 【创作工具箱：文学风格库】
**每一封**信须从库中选一种不同文风，可在 \`styleNote\` 标明作家名。
1. **鲁迅:** 冷峻犀利，白描反讽，不动声色中见残酷。
2. **张爱玲:** 苍凉华丽，细节锋利，都市孤独与幽微算计。
3. **村上春树:** 爵士与疏离，小确幸与虚无并存。
4. **白先勇:** 繁华落尽，今昔对照，宿命苍凉。
5. **汪曾祺:** 烟火人间，闲适白描，平和中有深味。
6. **杜拉斯:** 破碎呓语，重复与欲望，炎热中的时间停滞。
7. **卡尔维诺:** 轻盈寓言，童话与哲学相融。
8. **川端康成:** 物哀幽玄，雪月花的徒劳之美。
9. **茨威格:** 心理极细，激情与毁灭欲。
10. **简·奥斯汀:** 克制反讽，理性句式下的深情波澜。
11. **王尔德:** 唯美悖论，金句与享乐中的悲观。
12. **马尔克斯:** 魔幻现实，循环时间，一本正经的荒诞与孤独。
13. **伍尔夫:** 意识流，存在瞬间，飞蛾扑火式敏感。
14. **沈从文:** 牧歌清澈，朴素的爱与哀愁。
15. **郁达夫:** 自剖颓废，零余者苦闷，病态坦诚。
16. **李清照:** 婉约愁绪，风雨黄花梧桐等意象。
17. **纳兰性德:** 悼亡深情，浅白词里的长恨。

${spacetimeBlock}

# 【内容与翻译规则】
- **字数：** 每封信正文（以 \`original\` 或中文 \`original\` 计）控制在 **400–600 字**（中文按字符计；外文按该语言习惯约相当体量）。
- **双语：**
  - **非中文语境**（如 19 世纪英国、未来城、吸血鬼等）：\`original\` 为外语原文；\`translation\` 为优美的中文文学译本。
  - **中文语境**（宋、民国、香港等）：\`original\` 为中文；\`translation\` **必须为 null**。
- **翻译标准：** 严禁机翻腔，须信、达、雅。

${execBlock}

${jsonBlock}`;
  }

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _mapLetterRow(o) {
    if (!o || typeof o !== 'object') return null;
    const kind = 'spacetime';
    const dimension = (() => {
      const d = o.dimension ?? o.维度;
      if (d == null || d === '') return null;
      const u = String(d).toUpperCase().slice(0, 1);
      return 'ABCDEFG'.includes(u) ? u : null;
    })();
    const from = String(o.from ?? o['发件人'] ?? o.sender ?? '').trim() || '未知发件';
    const to = String(o.to ?? o['收件人'] ?? o.recipient ?? '').trim() || '未知收件';
    const tag = String(o.tag ?? o['标签'] ?? o.label ?? '').trim() || '无标签';
    const original = String(o.original ?? o.原文 ?? '').trim();
    const tr = o.translation ?? o.译文;
    const translation = tr === null || tr === undefined || tr === '' ? null : String(tr).trim();
    let body = String(o.body ?? o['正文'] ?? o.content ?? o.text ?? '').trim();
    if (translation) body = translation;
    else if (!body && original) body = original;
    if (!body) return null;
    const styleNote = String(o.styleNote ?? o['文风'] ?? '').trim();
    return {
      from,
      to,
      tag,
      body,
      kind,
      dimension,
      original: original || (translation ? '' : body),
      translation,
      styleNote,
    };
  }

  function _extractJsonArray(text) {
    if (!text || typeof text !== 'string') return null;
    const t = text.trim();
    try {
      const a = JSON.parse(t);
      return Array.isArray(a) ? a : null;
    } catch (_) {
      const i = t.indexOf('[');
      const j = t.lastIndexOf(']');
      if (i === -1 || j <= i) return null;
      try {
        const a = JSON.parse(t.slice(i, j + 1));
        return Array.isArray(a) ? a : null;
      } catch (_) {
        return null;
      }
    }
  }

  function _randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function _buildMockLetters(n) {
    const out = [];
    const base = Date.now();
    for (let i = 0; i < n; i++) {
      const m = MOCK_POOL[i % MOCK_POOL.length];
      out.push({
        id: `m-${base}-${i}`,
        from: m.from,
        to: m.to,
        body: m.body + (i >= MOCK_POOL.length ? `（副本 ${i + 1}）` : ''),
        tag: m.tag,
        kind: 'spacetime',
        dimension: 'ABCDEFG'[i % 7],
        original: m.body,
        translation: null,
        styleNote: '',
      });
    }
    return out;
  }

  async function _fetchLettersFromApi(count) {
    const activeApi = await DB.api.getActive().catch(() => null);
    if (!activeApi || !activeApi.url || !activeApi.key || !activeApi.model) {
      return { ok: false, reason: 'no_api' };
    }
    const n = Math.max(5, Math.min(12, Number(count) || 5));
    const system = _buildUnsentLettersSystemPrompt(n);
    const user = [
      '请严格按系统提示创作「未寄出的信」（全部为时空信件）。',
      `本轮数组长度必须 = ${n}。`,
      '输出：仅 JSON 数组，勿 markdown，勿解释。',
    ].join('\n');
    const raw = await ApiHelper.chatCompletion(activeApi, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    const arr = _extractJsonArray(raw);
    if (!arr || arr.length === 0) return { ok: false, reason: 'parse' };
    const mapped = [];
    const base = Date.now();
    for (let i = 0; i < arr.length; i++) {
      const row = _mapLetterRow(arr[i]);
      if (row) mapped.push({ id: `l-${base}-${i}`, ...row });
    }
    if (mapped.length === 0) return { ok: false, reason: 'parse' };
    if (mapped.length > n) mapped.length = n;
    /* 若模型少给，用占位信补足到 n，避免列表过短 */
    let pad = 0;
    while (mapped.length < n) {
      const m = MOCK_POOL[pad % MOCK_POOL.length];
      mapped.push({
        id: `m-${base}-pad-${pad}`,
        from: m.from,
        to: m.to,
        body: `${m.body}（补位 ${pad + 1}）`,
        tag: m.tag,
        kind: 'spacetime',
        dimension: 'ABCDEFG'[pad % 7],
        original: m.body,
        translation: null,
        styleNote: '',
      });
      pad += 1;
    }
    return { ok: true, letters: mapped };
  }

  function _injectOnce() {
    if (_root) return;
    const style = document.createElement('style');
    style.id = 'post-office-style';
    style.textContent = `
#post-office-root {
  --po-serif: 'Playfair Display', 'Noto Serif SC', serif;
  --po-sans: 'Noto Sans SC', 'DM Sans', sans-serif;
  --po-mono: 'Space Mono', monospace;
  --po-stamp: var(--muyu-red, #8B3A33);
  --po-air-1: color-mix(in srgb, var(--po-stamp) 88%, #000 12%);
  --po-air-2: #3d4f6a;
  --po-air-3: color-mix(in srgb, var(--bg-device, #fafafa) 92%, var(--po-air-2) 8%);
  position: fixed; inset: 0; z-index: 1001;
  background:
    radial-gradient(ellipse 100% 48% at 50% -8%, color-mix(in srgb, var(--po-stamp) 9%, transparent) 0%, transparent 55%),
    radial-gradient(ellipse 70% 50% at 100% 18%, color-mix(in srgb, var(--po-air-2) 7%, transparent) 0%, transparent 45%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-card, #fff) 40%, var(--bg-device, #fafafa)) 0%, var(--bg-device, #fafafa) 28%, var(--bg-device, #fafafa) 100%);
  color: var(--text-main, #1a1a1a);
  font-family: var(--po-sans);
  overflow: hidden;
  transform: translateY(110%);
  transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
  pointer-events: none;
}
#post-office-root.po-open {
  transform: translateY(0);
  pointer-events: auto;
}
#post-office-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
#post-office-root .po-noise {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.035; z-index: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
[data-theme="dark"] #post-office-root .po-noise { opacity: 0.06; }
[data-theme="dark"] #post-office-root {
  background:
    radial-gradient(ellipse 90% 42% at 50% -5%, color-mix(in srgb, var(--po-stamp) 14%, transparent) 0%, transparent 50%),
    radial-gradient(ellipse 60% 45% at 0% 40%, rgba(80,120,180,0.08) 0%, transparent 42%),
    var(--bg-device, #1a1a1a);
}
#post-office-root .po-watermark {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  font-family: var(--po-serif); font-size: clamp(2.6rem, 15vw, 5.5rem); font-style: italic;
  color: var(--border-line, #e0e0e0); opacity: 0.22; pointer-events: none; z-index: 0; white-space: nowrap;
  letter-spacing: 0.02em;
}
[data-theme="dark"] #post-office-root .po-watermark { opacity: 0.08; }
#post-office-root .po-bg-letter {
  position: absolute; top: 12%; right: 4%; font-family: var(--po-serif); font-size: 120px; line-height: 1;
  color: var(--text-main, #111); opacity: 0.04; pointer-events: none; z-index: 0;
}
#post-office-root .po-scroll {
  position: relative; z-index: 2; height: 100%; overflow-y: auto;
  padding: 14px 22px calc(env(safe-area-inset-bottom, 0px) + 28px);
}
#post-office-root .po-scroll::-webkit-scrollbar { display: none; }

/* ── 顶栏：返回 / 信箱（固定在最上面） ── */
#post-office-root .po-topbar {
  position: relative;
  z-index: 5;
  margin: -14px -22px 14px;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) 22px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-device, #fafafa) 92%, transparent) 0%, color-mix(in srgb, var(--bg-device, #fafafa) 75%, transparent) 55%, transparent 100%);
  backdrop-filter: none;
}
[data-theme="dark"] #post-office-root .po-topbar {
  background: linear-gradient(180deg, rgba(26,26,26,0.92) 0%, rgba(26,26,26,0.68) 55%, transparent 100%);
}
#post-office-root .po-topbar-left { display: flex; align-items: center; }
#post-office-root.po-on-detail .po-topbar-left { display: none; }
#post-office-root.po-on-detail .po-topbar-right { display: none; }
#post-office-root .po-topbar-right { display: flex; align-items: center; gap: 10px; }

#post-office-root .po-view { display: none; }
#post-office-root .po-view.active { display: block; animation: po-fade 0.35s ease; }
@keyframes po-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ── 列表首页：叠纸台 + 执勤带 + 质感主按钮（整体比「极简版」更有戏、比第一版更克制） ── */
#post-office-root .po-hub-wrap {
  position: relative;
  margin-bottom: 24px;
  padding-bottom: 8px;
}
#post-office-root .po-hub-wrap::before {
  content: '';
  position: absolute;
  left: 5px; right: 5px; bottom: 0;
  height: 22px;
  border-radius: 22px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-line, #e0e0e0);
  opacity: 0.55;
  z-index: 0;
  box-shadow: 0 10px 28px rgba(0,0,0,0.06);
}
[data-theme="dark"] #post-office-root .po-hub-wrap::before {
  background: #1e1e1e;
  border-color: #333;
  opacity: 0.5;
  box-shadow: 0 12px 32px rgba(0,0,0,0.4);
}
#post-office-root .po-hub-wrap .po-hub { position: relative; z-index: 1; }

#post-office-root .po-hub {
  display: flex; align-items: stretch;
  border-radius: 22px 26px 24px 22px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 88%, var(--text-main, #111) 12%);
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--bg-card, #fff) 96%, var(--bg-body, #f4f1ec) 4%) 0%, var(--bg-card, #fff) 55%, var(--bg-card, #fff) 100%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, #fff 55%, transparent),
    0 18px 40px rgba(0,0,0,0.07);
}
[data-theme="dark"] #post-office-root .po-hub {
  border-color: #3a3a3a;
  background: linear-gradient(155deg, #2e2e2e 0%, var(--bg-card, #222) 50%, #1c1c1c 100%);
  box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 22px 48px rgba(0,0,0,0.42);
}

#post-office-root .po-hub-spine {
  width: 9px; flex-shrink: 0;
  background: repeating-linear-gradient(
    180deg,
    color-mix(in srgb, var(--po-air-1) 42%, var(--border-line, #e0e0e0)) 0 5px,
    var(--po-air-3) 5px 8px,
    color-mix(in srgb, var(--po-air-2) 35%, var(--border-line, #e0e0e0)) 8px 12px,
    var(--po-air-3) 12px 16px
  );
  opacity: 0.55;
  position: relative;
}
[data-theme="dark"] #post-office-root .po-hub-spine {
  opacity: 0.38;
  filter: saturate(0.85);
}
#post-office-root .po-hub-spine::after {
  content: ''; position: absolute; top: 12px; bottom: 12px; right: 0;
  border-right: 1px dotted color-mix(in srgb, var(--text-main, #111) 12%, transparent);
}

#post-office-root .po-hub-panel {
  flex: 1; min-width: 0; position: relative;
  padding: 20px 20px 20px 17px;
}
#post-office-root .po-hub-panel::before {
  content: ''; position: absolute; top: 0; left: 12px; right: 16px; height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--po-stamp) 22%, transparent), transparent);
  opacity: 0.55;
  pointer-events: none;
}

#post-office-root .po-top {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 14px; margin-bottom: 0; position: relative; z-index: 1;
}
#post-office-root .po-hub-titleblock { flex: 1; min-width: 0; }
#post-office-root .po-hub-tr {
  flex-shrink: 0;
  display: flex; flex-direction: column;
  align-items: center;
  gap: 10px;
}
#post-office-root .po-hub-monogram {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--po-serif); font-size: 1.05rem; font-weight: 600;
  color: color-mix(in srgb, var(--po-stamp) 88%, var(--text-main, #111) 12%);
  border: 1px solid color-mix(in srgb, var(--po-stamp) 32%, var(--border-line, #e0e0e0));
  background: color-mix(in srgb, var(--bg-card, #fff) 92%, var(--po-stamp) 8%);
  line-height: 1;
  box-shadow: 0 4px 14px rgba(0,0,0,0.05);
}
[data-theme="dark"] #post-office-root .po-hub-monogram {
  background: rgba(255,255,255,0.04);
  border-color: color-mix(in srgb, var(--po-stamp) 40%, #444);
}
#post-office-root .po-close {
  background: none;
  border: none;
  color: var(--text-sub, #888);
  font-family: var(--po-mono);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: color .3s;
  padding: 4px 0;
  margin-bottom: 6px;
}
[data-theme="dark"] #post-office-root .po-close {
  color: #aaa;
}
#post-office-root .po-close:hover {
  color: var(--text-main, #1a1a1a);
}
#post-office-root .po-close:active { color: var(--text-main, #1a1a1a); opacity: 0.7; }

#post-office-root .po-inbox-btn {
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid var(--border-line, #e8e8e8);
  background: color-mix(in srgb, var(--bg-body, #f2f2f2) 100%, transparent);
  cursor: pointer; font-size: 1rem; line-height: 1; color: var(--text-sub, #888);
  display: flex; align-items: center; justify-content: center;
  position: relative;
  transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.2s;
}
[data-theme="dark"] #post-office-root .po-inbox-btn {
  background: rgba(255,255,255,0.05);
  border-color: #3a3a3a;
  color: #aaa;
}
#post-office-root .po-inbox-btn:hover {
  color: var(--text-main, #1a1a1a);
  background: var(--bg-body, #eaeaea);
  border-color: color-mix(in srgb, var(--text-main, #111) 15%, var(--border-line, #e0e0e0));
}
#post-office-root .po-inbox-badge {
  position: absolute; right: -2px; top: -2px;
  min-width: 18px; height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--po-stamp);
  color: #fff;
  font-family: var(--po-mono);
  font-size: 0.42rem;
  letter-spacing: 0.08em;
  display: none;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,0.35);
}
#post-office-root .po-inbox-badge { display: none !important; }

#post-office-root .po-date-line {
  font-family: var(--po-mono); font-size: 0.48rem; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--text-sub, #888); margin-bottom: 8px;
}
#post-office-root .po-title {
  font-family: var(--po-serif); font-size: 2.2rem; font-weight: 700; font-style: italic;
  line-height: 1.05; letter-spacing: -0.025em; margin-bottom: 5px;
  color: var(--text-main, #1a1a1a);
}
#post-office-root .po-sub {
  font-size: 0.68rem; color: var(--text-sub, #666); letter-spacing: 0.14em;
  text-transform: uppercase; margin-bottom: 0;
  font-weight: 400;
}

#post-office-root .po-hub-band {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px;
  margin-top: 16px; margin-bottom: 18px;
  padding: 11px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-line, #e8e8e8);
  background: color-mix(in srgb, var(--bg-body, #f2f2f2) 55%, var(--bg-card, #fff) 45%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 70%, transparent);
}
[data-theme="dark"] #post-office-root .po-hub-band {
  background: rgba(0,0,0,0.2);
  border-color: #333;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}
#post-office-root .po-hub-duty {
  flex-shrink: 0;
  font-family: var(--po-mono); font-size: 0.42rem; letter-spacing: 0.22em;
  text-transform: uppercase;
  padding: 5px 10px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--po-stamp) 38%, var(--border-line, #e0e0e0));
  color: color-mix(in srgb, var(--po-stamp) 75%, var(--text-main, #111) 25%);
  background: color-mix(in srgb, var(--bg-card, #fff) 88%, var(--po-stamp) 12%);
}
[data-theme="dark"] #post-office-root .po-hub-duty {
  background: rgba(255,255,255,0.04);
}
#post-office-root .po-hub-band-sep {
  width: 1px; height: 18px; background: var(--border-line, #ddd); opacity: 0.85;
}
#post-office-root .po-hub-station {
  font-family: var(--po-mono); font-size: 0.52rem; letter-spacing: 0.16em;
  color: var(--text-main, #1a1a1a); font-weight: 600;
}
#post-office-root .po-hub-band-flex { flex: 1; min-width: 8px; }
#post-office-root .po-hub-coords {
  font-family: var(--po-mono); font-size: 0.46rem; letter-spacing: 0.08em;
  color: var(--text-sub, #888); text-align: right;
}

#post-office-root .po-catch-btn {
  width: 100%;
  display: flex; align-items: center; gap: 15px;
  text-align: left;
  border: 1px solid color-mix(in srgb, #000 65%, transparent);
  background: linear-gradient(168deg, #2a2a2a 0%, #141414 48%, #1f1f1f 100%);
  color: #f6f6f6;
  font-family: var(--po-sans);
  padding: 16px 18px;
  border-radius: 18px 22px 20px 18px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  margin-bottom: 18px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.11),
    0 2px 0 color-mix(in srgb, var(--po-stamp) 42%, transparent),
    0 14px 36px rgba(0,0,0,0.14);
  transition: transform 0.2s, opacity 0.2s, box-shadow 0.2s;
}
#post-office-root .po-catch-icon {
  flex-shrink: 0; width: 44px; height: 44px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.32rem;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
}
#post-office-root.po-catching .po-catch-btn { filter: saturate(1.08); }
#post-office-root.po-catching .po-catch-btn::before {
  content: '';
  position: absolute; inset: -40% -35%;
  background:
    radial-gradient(circle at 30% 55%, rgba(255,255,255,0.10) 0 12%, transparent 32%),
    radial-gradient(circle at 62% 42%, rgba(200,230,255,0.10) 0 10%, transparent 30%),
    radial-gradient(circle at 75% 70%, rgba(255,255,255,0.08) 0 9%, transparent 28%);
  transform: rotate(12deg);
  animation: po-catch-swell 1.25s ease-in-out infinite;
  pointer-events: none;
}
#post-office-root.po-catching .po-catch-btn::after {
  content: '';
  position: absolute; left: -10%; top: -40%;
  width: 60%; height: 180%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent);
  transform: rotate(18deg);
  animation: po-catch-scan 1.1s ease-in-out infinite;
  pointer-events: none;
  mix-blend-mode: screen;
}
#post-office-root.po-catching .po-catch-icon i { animation: po-waves 0.95s ease-in-out infinite; }
@keyframes po-waves {
  0% { transform: translateY(0) rotate(0deg); opacity: 0.92; }
  50% { transform: translateY(-2px) rotate(-6deg); opacity: 1; }
  100% { transform: translateY(0) rotate(0deg); opacity: 0.92; }
}
@keyframes po-catch-swell {
  0%, 100% { transform: rotate(12deg) scale(1); opacity: 0.72; }
  50% { transform: rotate(12deg) scale(1.04); opacity: 0.95; }
}
@keyframes po-catch-scan {
  0% { transform: translateX(-30%) rotate(18deg); opacity: 0; }
  35% { opacity: 0.85; }
  70% { opacity: 0.25; }
  100% { transform: translateX(240%) rotate(18deg); opacity: 0; }
}
#post-office-root .po-catch-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
#post-office-root .po-catch-text b {
  font-size: 0.9rem; font-weight: 600; letter-spacing: 0.1em;
}
#post-office-root .po-catch-text small {
  font-family: var(--po-mono); font-size: 0.44rem; letter-spacing: 0.1em;
  opacity: 0.62; text-transform: uppercase; font-weight: 400;
}
#post-office-root .po-catch-btn:disabled { opacity: 0.48; cursor: not-allowed; transform: none; }
#post-office-root .po-catch-btn:not(:disabled):active {
  transform: translateY(2px) scale(0.992);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 1px 0 color-mix(in srgb, var(--po-stamp) 35%, transparent),
    0 8px 22px rgba(0,0,0,0.12);
}
[data-theme="dark"] #post-office-root .po-catch-btn {
  background: linear-gradient(168deg, #f4f4f4 0%, #dcdcdc 45%, #ececec 100%);
  color: #111;
  border-color: rgba(0,0,0,0.12);
  box-shadow:
    inset 0 1px 0 #fff,
    0 2px 0 color-mix(in srgb, var(--po-stamp) 38%, transparent),
    0 14px 36px rgba(0,0,0,0.35);
}
[data-theme="dark"] #post-office-root .po-catch-icon {
  background: rgba(0,0,0,0.06);
  border-color: rgba(0,0,0,0.1);
}

#post-office-root .po-section-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 3px solid color-mix(in srgb, var(--po-stamp) 55%, var(--text-main, #111) 45%);
}
#post-office-root .po-section-label {
  font-family: var(--po-mono); font-size: 0.5rem; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--text-sub, #888); margin-bottom: 0;
}
#post-office-root .po-round-badge {
  flex-shrink: 0;
  font-family: var(--po-mono); font-size: 0.48rem; letter-spacing: 0.08em;
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--po-stamp) 28%, var(--border-line, #e0e0e0));
  color: color-mix(in srgb, var(--text-sub, #666) 70%, var(--po-stamp) 30%);
  background: color-mix(in srgb, var(--bg-card, #fff) 92%, var(--po-stamp) 8%);
}
[data-theme="dark"] #post-office-root .po-round-badge {
  background: rgba(255,255,255,0.05);
  border-color: color-mix(in srgb, var(--po-stamp) 35%, #333);
  color: color-mix(in srgb, #bbb 75%, var(--po-stamp) 25%);
}
#post-office-root .po-round-badge--busy {
  animation: po-badge-pulse 1.25s ease-in-out infinite;
}
@keyframes po-badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.58; }
}

#post-office-root .po-skel-stream { position: relative; padding-left: 4px; margin-bottom: 20px; }
#post-office-root .po-skel-stream::before {
  content: ''; position: absolute; left: 27px; top: 8px; bottom: 8px; width: 1px;
  background: repeating-linear-gradient(180deg, var(--border-line, #ddd) 0 5px, transparent 5px 11px);
  opacity: 0.7;
}
#post-office-root .po-catch-stage {
  position: relative;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 78%, var(--po-air-2) 22%);
  background:
    radial-gradient(ellipse 120% 55% at 50% -10%, color-mix(in srgb, var(--po-air-2) 10%, transparent) 0%, transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-card, #fff) 92%, var(--bg-body, #f2f2f2) 8%) 0%, var(--bg-body, #f2f2f2) 100%);
  box-shadow: 0 18px 44px rgba(0,0,0,0.06);
  padding: 18px 18px 16px;
  overflow: hidden;
}
[data-theme="dark"] #post-office-root .po-catch-stage {
  border-color: #333;
  background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.03) 100%);
  box-shadow: 0 26px 56px rgba(0,0,0,0.35);
}
#post-office-root .po-catch-stage::before {
  content: '';
  position: absolute; inset: 0;
  background:
    linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--po-stamp) 9%, transparent) 50%, transparent 100%),
    repeating-linear-gradient(180deg, transparent 0 10px, rgba(255,255,255,0.06) 10px 11px);
  opacity: 0.55;
  animation: po-catch-grid 2.4s linear infinite;
  pointer-events: none;
}
@keyframes po-catch-grid { from { transform: translateY(0); } to { transform: translateY(22px); } }
#post-office-root .po-catch-stage-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px;
  position: relative; z-index: 1;
  margin-bottom: 12px;
}
#post-office-root .po-catch-stage-title {
  font-family: var(--po-serif);
  font-style: italic;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-size: 1.15rem;
}
#post-office-root .po-catch-stage-sub {
  font-family: var(--po-mono);
  font-size: 0.52rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-sub, #777);
  white-space: nowrap;
}
#post-office-root .po-catch-ocean {
  position: relative;
  height: 104px;
  border-radius: 18px;
  border: 1px dashed color-mix(in srgb, var(--border-line, #e0e0e0) 78%, var(--po-air-2) 22%);
  background:
    radial-gradient(circle at 18% 40%, color-mix(in srgb, var(--po-air-2) 12%, transparent) 0%, transparent 52%),
    radial-gradient(circle at 70% 45%, color-mix(in srgb, var(--po-stamp) 10%, transparent) 0%, transparent 55%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-card, #fff) 85%, var(--po-air-2) 6%) 0%, color-mix(in srgb, var(--bg-body, #f2f2f2) 85%, var(--po-air-2) 7%) 100%);
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
}
[data-theme="dark"] #post-office-root .po-catch-ocean { box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
#post-office-root .po-catch-ocean::before {
  content: '';
  position: absolute; inset: -40% -20%;
  background:
    radial-gradient(circle at 25% 60%, rgba(255,255,255,0.22) 0 10%, transparent 42%),
    radial-gradient(circle at 55% 50%, rgba(255,255,255,0.14) 0 9%, transparent 40%),
    radial-gradient(circle at 78% 58%, rgba(255,255,255,0.18) 0 8%, transparent 44%);
  animation: po-catch-drift 1.6s ease-in-out infinite;
  opacity: 0.8;
}
@keyframes po-catch-drift {
  0%, 100% { transform: translateX(-2%) translateY(0) rotate(-1deg); }
  50% { transform: translateX(2%) translateY(-2%) rotate(1deg); }
}
#post-office-root .po-catch-env {
  position: absolute;
  left: var(--x);
  top: var(--y);
  width: 38px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--po-stamp) 25%, var(--border-line, #e0e0e0));
  background:
    linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.55) 100%);
  box-shadow: 0 10px 22px rgba(0,0,0,0.10);
  transform: rotate(var(--r));
  animation: po-env-float var(--d) ease-in-out infinite;
  opacity: 0.85;
}
[data-theme="dark"] #post-office-root .po-catch-env {
  background: rgba(255,255,255,0.10);
  border-color: #3a3a3a;
  box-shadow: 0 16px 32px rgba(0,0,0,0.5);
  opacity: 0.75;
}
#post-office-root .po-catch-env::before {
  content: '';
  position: absolute; left: 4px; right: 4px; top: 7px; height: 1px;
  background: color-mix(in srgb, var(--po-stamp) 26%, transparent);
  opacity: 0.65;
}
#post-office-root .po-catch-env::after {
  content: '';
  position: absolute; left: 8px; right: 8px; bottom: 6px; height: 1px;
  background: color-mix(in srgb, var(--po-air-2) 26%, transparent);
  opacity: 0.55;
}
@keyframes po-env-float {
  0%, 100% { transform: translateY(0) rotate(var(--r)); }
  50% { transform: translateY(-10px) rotate(calc(var(--r) + 2deg)); }
}
#post-office-root .po-catch-hint {
  position: relative; z-index: 1;
  margin-top: 12px;
  font-family: var(--po-mono);
  font-size: 0.48rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-sub, #777);
}
#post-office-root .po-skel { display: flex; flex-direction: column; gap: 18px; }
#post-office-root .po-skel-row {
  display: flex; align-items: stretch; gap: 10px;
}
#post-office-root .po-skel-mark {
  width: 44px; flex-shrink: 0; border-radius: 50%; border: 2px dashed var(--border-line, #e0e0e0);
  background: var(--bg-card, #fff); animation: po-shine 1.1s ease infinite;
  background-size: 200% 100%;
}
#post-office-root .po-skel-line {
  flex: 1; min-height: 76px; border-radius: 4px 20px 20px 12px;
  border: 1px solid var(--border-line, #e0e0e0);
  background: linear-gradient(90deg, var(--bg-body, #f2f2f2) 0%, var(--bg-card, #fff) 50%, var(--bg-body, #f2f2f2) 100%);
  background-size: 200% 100%; animation: po-shine 1.1s ease infinite;
}
[data-theme="dark"] #post-office-root .po-skel-mark,
[data-theme="dark"] #post-office-root .po-skel-line {
  border-color: var(--border-line, #333);
  background: linear-gradient(90deg, #1e1e1e 0%, #2a2a2a 50%, #1e1e1e 100%); background-size: 200% 100%;
}
@keyframes po-shine { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

/* 洋流时间轴列表：左轨 + 邮戳 + 信封（保留纵向阅读方向） */
#post-office-root .po-stream { position: relative; padding: 4px 0 28px 2px; }
#post-office-root .po-stream-line {
  position: absolute; left: 29px; top: 0; bottom: 0; width: 0; border-left: 1px dashed color-mix(in srgb, var(--text-sub, #888) 45%, transparent);
  pointer-events: none; z-index: 0;
}
#post-office-root .po-list { display: flex; flex-direction: column; gap: 20px; position: relative; z-index: 1; }

#post-office-root .po-card {
  display: flex; align-items: stretch; gap: 10px;
  cursor: pointer;
  transform-origin: 50% 0;
  animation: po-card-rise 0.55s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: calc(var(--i, 0) * 0.055s);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), filter 0.28s;
}
@keyframes po-card-rise {
  from { opacity: 0; transform: translateY(12px) rotate(var(--po-tilt, 0deg)); }
  to { opacity: 1; transform: translateY(0) rotate(var(--po-tilt, 0deg)); }
}
#post-office-root .po-card:nth-child(odd) { --po-tilt: -0.18deg; }
#post-office-root .po-card:nth-child(even) { --po-tilt: 0.16deg; }
#post-office-root .po-card:active { transform: translateY(2px) scale(0.985) rotate(var(--po-tilt, 0deg)); filter: brightness(0.97); }

#post-office-root .po-card-rail {
  width: 52px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: flex-start; align-items: center;
  padding-top: 6px; position: relative; z-index: 2;
}
#post-office-root .po-postmark {
  width: 46px; min-height: 86px; padding: 8px 4px;
  border: 2px dashed color-mix(in srgb, var(--text-main, #111) 22%, var(--border-line, #ccc));
  border-radius: 50%;
  background: radial-gradient(ellipse at 30% 25%, color-mix(in srgb, var(--bg-card, #fff) 85%, transparent) 0%, var(--bg-card, #fff) 55%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.06), inset 0 0 0 1px color-mix(in srgb, var(--border-line, #e0e0e0) 70%, transparent);
  display: flex; align-items: center; justify-content: center;
}
[data-theme="dark"] #post-office-root .po-postmark {
  background: radial-gradient(ellipse at 30% 25%, rgba(255,255,255,0.04) 0%, var(--bg-card, #222) 55%);
  box-shadow: 0 2px 16px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06);
}
#post-office-root .po-card-idx {
  writing-mode: vertical-rl; transform: rotate(180deg);
  font-family: var(--po-mono); font-size: 0.5rem; letter-spacing: 0.28em;
  color: color-mix(in srgb, var(--text-sub, #888) 70%, var(--text-main, #111) 30%);
  text-transform: uppercase; line-height: 1.35;
}
#post-office-root .po-postmark-cap {
  margin-top: 6px;
  font-family: var(--po-mono); font-size: 0.38rem; letter-spacing: 0.42em; color: var(--po-stamp);
  opacity: 0.88; white-space: nowrap;
}

#post-office-root .po-card-sleeve {
  flex: 1; min-width: 0; position: relative;
  border-radius: 3px 22px 22px 14px;
  border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 90%, var(--text-main, #111) 10%);
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--bg-card, #fff) 92%, var(--bg-body, #f2f2f2) 8%) 0%, var(--bg-card, #fff) 40%, var(--bg-card, #fff) 100%);
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--text-main, #111) 6%, transparent),
    0 14px 32px rgba(0,0,0,0.07);
  overflow: hidden;
}
[data-theme="dark"] #post-office-root .po-card--reply .po-card-sleeve {
  background: linear-gradient(165deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.03) 100%);
}
#post-office-root .po-card--reply .po-card-sleeve {
  border-color: color-mix(in srgb, var(--po-air-2) 32%, var(--border-line, #e0e0e0));
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--po-air-2) 16%, transparent),
    0 14px 34px rgba(0,0,0,0.075);
}
#post-office-root .po-card--reply .po-postmark-cap {
  color: color-mix(in srgb, var(--po-air-2) 72%, var(--po-stamp));
}
[data-theme="dark"] #post-office-root .po-card-sleeve {
  box-shadow: 0 1px 0 rgba(255,255,255,0.06), 0 14px 36px rgba(0,0,0,0.45);
  background: linear-gradient(165deg, #262626 0%, var(--bg-card, #222) 45%, var(--bg-card, #1c1c1c) 100%);
}
#post-office-root .po-card-sleeve::before {
  content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 5px; border-radius: 2px;
  background: repeating-linear-gradient(
    180deg,
    var(--po-air-1) 0 4px,
    var(--po-air-3) 4px 7px,
    var(--po-air-2) 7px 10px,
    var(--po-air-3) 10px 13px
  );
  opacity: 0.65;
}
[data-theme="dark"] #post-office-root .po-card-sleeve::before {
  opacity: 0.45;
}
#post-office-root .po-card-sleeve::after {
  content: ''; position: absolute; right: 0; top: 0; width: 42%; height: 100%;
  background: linear-gradient(105deg, transparent 0%, color-mix(in srgb, var(--po-stamp) 7%, transparent) 100%);
  pointer-events: none; opacity: 0.5;
}

#post-office-root .po-card-core { position: relative; z-index: 1; padding: 14px 16px 14px 20px; }
#post-office-root .po-card-top {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px;
}
#post-office-root .po-card-tag {
  font-family: var(--po-mono); font-size: 0.48rem; letter-spacing: 0.14em;
  text-transform: uppercase; flex-shrink: 0;
  padding: 5px 10px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--po-stamp) 45%, var(--border-line, #e0e0e0));
  color: color-mix(in srgb, var(--po-stamp) 75%, var(--text-main, #111) 25%);
  background: color-mix(in srgb, var(--po-stamp) 9%, var(--bg-card, #fff));
}
[data-theme="dark"] #post-office-root .po-card-tag {
  background: color-mix(in srgb, var(--po-stamp) 18%, transparent);
  color: color-mix(in srgb, var(--po-stamp) 55%, #fff 45%);
}
#post-office-root .po-card-to {
  font-family: var(--po-serif); font-size: 1.18rem; font-style: italic; font-weight: 600;
  color: var(--text-main, #1a1a1a); line-height: 1.15;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
#post-office-root .po-card-from {
  font-family: var(--po-mono); font-size: 0.52rem; letter-spacing: 0.08em;
  color: var(--text-sub, #777); margin-bottom: 8px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: 0.92;
}
#post-office-root .po-card-from em {
  font-style: normal; color: color-mix(in srgb, var(--text-sub, #888) 65%, var(--text-main, #111) 35%);
  margin-right: 4px; letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.45rem;
}
#post-office-root .po-card-sum {
  font-size: 0.78rem; color: var(--text-sub, #666); line-height: 1.6;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  font-family: var(--po-sans);
  border-top: 1px dashed color-mix(in srgb, var(--border-line, #e0e0e0) 85%, transparent);
  padding-top: 10px; margin-top: 2px;
}
#post-office-root .po-empty {
  text-align: center; padding: 28px 18px 32px;
  font-family: var(--po-serif); font-style: italic;
  color: var(--text-sub, #888); font-size: 1rem;
  border: 1px dashed var(--border-line, #e0e0e0);
  border-radius: 20px;
  background: color-mix(in srgb, var(--bg-card, #fff) 88%, var(--bg-body, #f2f2f2) 12%);
}
[data-theme="dark"] #post-office-root .po-empty {
  background: rgba(255,255,255,0.03);
  border-color: #333;
}
#post-office-root .po-empty small {
  display: block; margin-top: 10px; font-family: var(--po-mono); font-size: 0.52rem; letter-spacing: 0.14em;
  font-style: normal; text-transform: uppercase;
}

#post-office-root #po-view-detail { padding-top: 0; }
#post-office-root .po-detail-topnav {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; padding: 12px 14px 14px;
  border-radius: 16px;
  border: 1px solid var(--border-line, #e8e8e8);
  background: color-mix(in srgb, var(--bg-card, #fff) 90%, var(--bg-body, #f2f2f2) 10%);
  box-shadow: 0 8px 24px rgba(0,0,0,0.04);
}
[data-theme="dark"] #post-office-root .po-detail-topnav {
  border-color: #333;
  background: rgba(255,255,255,0.04);
  box-shadow: 0 10px 28px rgba(0,0,0,0.25);
}
#post-office-root .po-d-back {
  display: inline-flex; align-items: center; gap: 8px; border: none; background: none;
  font-family: var(--po-mono); font-size: 0.52rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--text-sub, #666); cursor: pointer; padding: 6px 0;
  position: relative;
}
#post-office-root .po-d-back::after {
  content: ''; position: absolute; left: 0; bottom: 2px; width: 100%; height: 1px;
  background: currentColor; transform: scaleX(0.35); transform-origin: left; opacity: 0.35;
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s;
}
#post-office-root .po-d-back:hover::after,
#post-office-root .po-d-back:active::after { transform: scaleX(1); opacity: 0.55; }
#post-office-root .po-d-back:active { opacity: 0.65; }
#post-office-root .po-detail-badge {
  font-family: var(--po-mono); font-size: 0.45rem; letter-spacing: 0.35em;
  color: var(--po-stamp); border: 1px dashed color-mix(in srgb, var(--po-stamp) 55%, var(--border-line, #ccc));
  padding: 8px 12px; border-radius: 999px; text-transform: uppercase; opacity: 0.92;
}

/* ── 拆信页：案卷夹 + 邮路格 + 信纸 ── */
#post-office-root .po-detail-dossier {
  position: relative;
  display: flex; align-items: stretch;
  border-radius: 20px 26px 24px 20px;
  border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 75%, var(--text-main, #111) 25%);
  background: color-mix(in srgb, var(--bg-card, #fff) 94%, var(--bg-body, #f2f2f2) 6%);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--text-main, #111) 4%, transparent),
    0 22px 48px rgba(0,0,0,0.08);
  overflow: hidden;
  animation: po-detail-unfold 0.58s cubic-bezier(0.16, 1, 0.3, 1) both;
}
[data-theme="dark"] #post-office-root .po-detail-dossier {
  box-shadow: 0 0 0 1px rgba(255,255,255,0.05), 0 26px 56px rgba(0,0,0,0.5);
  background: linear-gradient(145deg, #2a2a2a 0%, var(--bg-card, #222) 40%, #1e1e1e 100%);
}
@keyframes po-detail-unfold {
  from { opacity: 0; transform: translateY(20px) rotate(-0.6deg); }
  to { opacity: 1; transform: translateY(0) rotate(0); }
}

#post-office-root .po-detail-spine {
  width: 11px; flex-shrink: 0;
  background: repeating-linear-gradient(
    180deg,
    var(--po-air-1) 0 5px,
    var(--po-air-3) 5px 8px,
    var(--po-air-2) 8px 12px,
    var(--po-air-3) 12px 16px
  );
  opacity: 0.92;
  position: relative;
}
[data-theme="dark"] #post-office-root .po-detail-spine { opacity: 0.55; }
#post-office-root .po-detail-spine::after {
  content: ''; position: absolute; top: 12px; bottom: 12px; right: -1px;
  border-right: 1px dotted color-mix(in srgb, var(--text-main, #111) 18%, transparent);
}

#post-office-root .po-detail-body { flex: 1; min-width: 0; padding: 18px 18px 22px 16px; }

#post-office-root .po-detail-header {
  display: flex; gap: 14px; align-items: flex-start;
  margin-bottom: 20px; padding-bottom: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 90%, transparent);
}
#post-office-root .po-detail-seal {
  flex-shrink: 0; width: 52px; height: 52px; border-radius: 50%;
  border: 2px dashed color-mix(in srgb, var(--po-stamp) 70%, var(--border-line, #ccc));
  display: flex; align-items: center; justify-content: center;
  font-family: var(--po-mono); font-size: 0.5rem; letter-spacing: 0.12em; line-height: 1.25;
  color: var(--po-stamp); text-align: center;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--po-stamp) 12%, var(--bg-card, #fff)), var(--bg-card, #fff));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--po-stamp) 15%, transparent);
}
#post-office-root .po-detail-seal span { display: block; line-height: 1.35; }
#post-office-root .po-detail-header-main { flex: 1; min-width: 0; }
#post-office-root .po-detail-kicker {
  font-family: var(--po-mono); font-size: 0.48rem; letter-spacing: 0.28em; text-transform: uppercase;
  color: var(--text-sub, #888); margin-bottom: 6px;
}
#post-office-root .po-detail-h2 {
  font-family: var(--po-serif); font-size: 1.65rem; font-weight: 700; font-style: italic;
  line-height: 1.05; letter-spacing: -0.02em; color: var(--text-main, #1a1a1a); margin-bottom: 6px;
}
#post-office-root .po-detail-ref {
  font-family: var(--po-mono); font-size: 0.5rem; letter-spacing: 0.12em;
  color: color-mix(in srgb, var(--text-sub, #888) 80%, var(--po-stamp) 20%);
}

#post-office-root .po-routing {
  margin-bottom: 20px;
  padding: 14px 14px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-body, #f2f2f2) 88%, var(--po-stamp) 5%);
  border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 85%, var(--po-stamp) 15%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 60%, transparent);
}
[data-theme="dark"] #post-office-root .po-routing {
  background: color-mix(in srgb, #1a1a1a 92%, var(--po-stamp) 8%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}
#post-office-root .po-routing-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px;
}
#post-office-root .po-routing-cell--wide { grid-column: 1 / -1; }
#post-office-root .po-routing-key {
  display: block; font-family: var(--po-mono); font-size: 0.42rem; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--text-sub, #888); margin-bottom: 5px;
}
#post-office-root .po-routing-val {
  font-size: 0.82rem; font-weight: 500; color: var(--text-main, #111); line-height: 1.35;
  word-break: break-word;
}
#post-office-root .po-routing-val--serif {
  font-family: var(--po-serif); font-size: 1.05rem; font-style: italic; font-weight: 600;
}
#post-office-root .po-routing-tag {
  display: inline-block; margin-top: 2px;
  font-family: var(--po-mono); font-size: 0.48rem; letter-spacing: 0.14em;
  padding: 5px 12px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--po-stamp) 50%, var(--border-line, #e0e0e0));
  color: color-mix(in srgb, var(--po-stamp) 80%, var(--text-main, #111) 20%);
  background: color-mix(in srgb, var(--po-stamp) 10%, var(--bg-card, #fff));
}

#post-office-root .po-letter { margin-bottom: 22px; position: relative; }
#post-office-root .po-letter-perf {
  height: 10px; margin-bottom: 12px;
  background: repeating-linear-gradient(90deg,
    var(--border-line, #e0e0e0) 0, var(--border-line, #e0e0e0) 4px,
    transparent 4px, transparent 9px
  );
  opacity: 0.55; mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
#post-office-root .po-detail-section-label {
  display: block; font-family: var(--po-mono); font-size: 0.48rem; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--text-sub, #888); margin-bottom: 10px;
}
#post-office-root .po-letter-sheet {
  position: relative;
  padding: 22px 18px 24px;
  border-radius: 2px 16px 18px 4px;
  border: 1px solid var(--border-line, #e0e0e0);
  background-color: color-mix(in srgb, var(--bg-card, #fff) 92%, var(--bg-body, #f5f5f0) 8%);
  background-image:
    linear-gradient(90deg, color-mix(in srgb, var(--po-stamp) 6%, transparent) 0%, transparent 28%),
    repeating-linear-gradient(
      0deg,
      transparent, transparent 27px,
      color-mix(in srgb, var(--border-line, #e0e0e0) 45%, transparent) 27px,
      color-mix(in srgb, var(--border-line, #e0e0e0) 45%, transparent) 28px
    );
  font-family: var(--po-serif); font-size: 0.95rem; line-height: 28px;
  color: var(--text-main, #1a1a1a); white-space: pre-wrap;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 40%, transparent), 0 8px 28px rgba(0,0,0,0.05);
}
[data-theme="dark"] #post-office-root .po-letter-sheet {
  background-color: #242424;
  background-image:
    linear-gradient(90deg, color-mix(in srgb, var(--po-stamp) 10%, transparent) 0%, transparent 30%),
    repeating-linear-gradient(
      0deg,
      transparent, transparent 27px,
      rgba(255,255,255,0.06) 27px,
      rgba(255,255,255,0.06) 28px
    );
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04), 0 8px 28px rgba(0,0,0,0.35);
}
#post-office-root .po-letter-sheet::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--po-air-1), var(--po-air-2), var(--po-air-1));
  opacity: 0.35; border-radius: 2px 16px 0 0;
}
#post-office-root .po-letter-sheet--original {
  margin-bottom: 14px;
  font-family: var(--po-serif), 'Georgia', serif;
  font-size: 0.88rem;
  line-height: 1.75;
  font-style: italic;
  color: color-mix(in srgb, var(--text-main, #111) 88%, var(--text-sub, #666) 12%);
  background-image: none;
  padding: 16px 16px 18px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-line, #e0e0e0) 80%, transparent);
}

#post-office-root .po-docket {
  position: relative;
  padding: 24px 14px 4px;
  margin: 0 -4px 0 -2px;
  border-radius: 12px 4px 4px 12px;
  border: 1px dashed color-mix(in srgb, var(--text-main, #111) 22%, var(--border-line, #e0e0e0));
  background: color-mix(in srgb, var(--bg-body, #f2f2f2) 55%, var(--bg-card, #fff) 45%);
}
[data-theme="dark"] #post-office-root .po-docket {
  background: color-mix(in srgb, #222 70%, #181818 30%);
}
#post-office-root .po-docket-tab {
  position: absolute; top: -11px; left: 18px;
  display: inline-flex; align-items: baseline; gap: 10px;
  padding: 5px 14px 6px;
  background: var(--text-main, #1a1a1a); color: var(--bg-device, #fafafa);
  border-radius: 4px 4px 10px 4px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.15);
}
[data-theme="dark"] #post-office-root .po-docket-tab {
  background: #eaeaea; color: #111;
}
#post-office-root .po-docket-tab-en {
  font-family: var(--po-mono); font-size: 0.4rem; letter-spacing: 0.22em; opacity: 0.85;
}
#post-office-root .po-docket-tab-zh {
  font-family: var(--po-sans); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.12em;
}

#post-office-root .po-textarea {
  width: 100%; border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 90%, var(--text-main, #111) 10%);
  border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; resize: vertical; min-height: 96px;
  background: var(--bg-card, #fff); color: var(--text-main, #1a1a1a); font-family: var(--po-sans);
  font-size: 0.86rem; line-height: 26px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
#post-office-root .po-textarea:focus {
  border-color: color-mix(in srgb, var(--po-stamp) 45%, var(--border-line, #e0e0e0));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--po-stamp) 12%, transparent);
}
#post-office-root .po-textarea--ruled {
  min-height: 112px;
  background-image: repeating-linear-gradient(
    0deg,
    transparent, transparent 25px,
    color-mix(in srgb, var(--border-line, #e0e0e0) 55%, transparent) 25px,
    color-mix(in srgb, var(--border-line, #e0e0e0) 55%, transparent) 26px
  );
  background-color: color-mix(in srgb, var(--bg-card, #fff) 96%, var(--bg-body, #f2f2f2) 4%);
}
[data-theme="dark"] #post-office-root .po-textarea--ruled {
  background-image: repeating-linear-gradient(
    0deg,
    transparent, transparent 25px,
    rgba(255,255,255,0.07) 25px,
    rgba(255,255,255,0.07) 26px
  );
  background-color: #1e1e1e;
}

#post-office-root .po-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
#post-office-root .po-btn-solid {
  width: 100%; padding: 15px 16px; border: none; border-radius: 3px;
  background: var(--text-main, #1a1a1a); color: var(--bg-device, #fafafa);
  font-family: var(--po-sans); font-size: 0.78rem; font-weight: 600; letter-spacing: 0.18em; cursor: pointer;
  box-shadow: 0 2px 0 color-mix(in srgb, var(--po-stamp) 55%, transparent);
}
[data-theme="dark"] #post-office-root .po-btn-solid {
  background: var(--text-main, #f0f0f0); color: var(--bg-device, #111);
}
#post-office-root .po-btn-solid:active { opacity: 0.88; transform: translateY(1px); }

#post-office-root .po-toggle-ret {
  width: 100%; text-align: left;
  border: 1px dashed color-mix(in srgb, var(--text-sub, #888) 45%, var(--border-line, #ccc));
  background: color-mix(in srgb, var(--bg-card, #fff) 70%, transparent);
  color: var(--text-sub, #666); padding: 13px 16px; border-radius: 8px;
  font-family: var(--po-mono); font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase;
  cursor: pointer; margin-top: 2px;
}
#post-office-root .po-ret-panel {
  display: none; margin-top: 14px; padding: 14px 12px 4px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 80%, var(--po-stamp) 20%);
  background: color-mix(in srgb, var(--bg-card, #fff) 88%, var(--po-stamp) 4%);
}
#post-office-root .po-ret-panel.open { display: block; animation: po-ret-open 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes po-ret-open {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: none; }
}
#post-office-root .po-row-btns { display: flex; gap: 10px; margin-top: 12px; }
#post-office-root .po-btn-outline {
  flex: 1; padding: 12px 10px;
  border: 1px solid color-mix(in srgb, var(--po-stamp) 65%, var(--text-main, #111) 35%);
  background: transparent; color: var(--text-main, #1a1a1a);
  font-family: var(--po-sans); font-size: 0.76rem; font-weight: 500; letter-spacing: 0.08em; cursor: pointer; border-radius: 3px;
}
#post-office-root .po-btn-ghost {
  flex: 1; padding: 12px 10px;
  border: 1px solid var(--border-line, #e0e0e0);
  background: var(--bg-body, #f2f2f2); color: var(--text-main, #1a1a1a);
  font-size: 0.76rem; cursor: pointer; border-radius: 3px;
}

/* ── 回信箱：轻量弹窗 ── */
#post-office-root .po-modal {
  position: fixed; inset: 0; z-index: 1200;
  display: none;
}
#post-office-root .po-modal.open { display: block; }
#post-office-root .po-modal-backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(6px);
}
[data-theme="dark"] #post-office-root .po-modal-backdrop { background: rgba(0,0,0,0.62); }
#post-office-root .po-modal-panel {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: min(720px, calc(100vw - 34px));
  max-height: min(72vh, 640px);
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 70%, var(--po-stamp) 30%);
  background: color-mix(in srgb, var(--bg-card, #fff) 94%, var(--bg-body, #f2f2f2) 6%);
  box-shadow: 0 30px 80px rgba(0,0,0,0.35);
}
[data-theme="dark"] #post-office-root .po-modal-panel {
  background: rgba(30,30,30,0.92);
  border-color: #333;
  box-shadow: 0 36px 92px rgba(0,0,0,0.6);
}
#post-office-root .po-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 80%, transparent);
}
#post-office-root .po-modal-title {
  font-family: var(--po-serif); font-style: italic; font-weight: 700;
  font-size: 1.05rem;
}
#post-office-root .po-modal-close {
  border: 1px solid var(--border-line, #e0e0e0);
  background: var(--bg-body, #f2f2f2);
  width: 34px; height: 34px;
  border-radius: 10px; cursor: pointer;
  color: var(--text-main, #1a1a1a);
}
[data-theme="dark"] #post-office-root .po-modal-close {
  background: rgba(255,255,255,0.06);
  border-color: #333;
  color: rgba(255,255,255,0.88);
}
#post-office-root .po-modal-body {
  padding: 14px 16px 16px;
  overflow: auto;
  max-height: calc(min(72vh, 640px) - 58px);
}
#post-office-root .po-modal-sub {
  font-family: var(--po-mono);
  font-size: 0.52rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-sub, #777);
  margin: -6px 0 12px;
}
#post-office-root .po-reply-item {
  border: 1px solid color-mix(in srgb, var(--border-line, #e0e0e0) 84%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-card, #fff) 94%, var(--po-stamp) 3%);
  padding: 12px 12px 10px;
  margin-bottom: 12px;
}
#post-office-root .po-reply-item .po-textarea { margin-top: 10px; }
[data-theme="dark"] #post-office-root .po-reply-item {
  background: rgba(255,255,255,0.04);
  border-color: #333;
}
#post-office-root .po-reply-meta {
  display: flex; gap: 10px; flex-wrap: wrap;
  font-family: var(--po-mono);
  font-size: 0.5rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-sub, #777);
  margin-bottom: 8px;
}
#post-office-root .po-reply-text {
  white-space: pre-wrap;
  font-family: var(--po-sans);
  color: var(--text-main, #1a1a1a);
  line-height: 1.75;
  font-size: 0.9rem;
  border-top: 1px dashed color-mix(in srgb, var(--border-line, #e0e0e0) 80%, transparent);
  padding-top: 10px;
}
[data-theme="dark"] #post-office-root .po-reply-text { color: rgba(255,255,255,0.9); }
#post-office-root .po-reply-actions {
  display: flex; gap: 10px; margin-top: 10px;
}
#post-office-root .po-mini-btn {
  flex: 1;
  padding: 10px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-line, #e0e0e0);
  background: var(--bg-body, #f2f2f2);
  cursor: pointer;
  font-size: 0.78rem;
}
#post-office-root .po-mini-btn--danger {
  border-color: color-mix(in srgb, #c23b3b 55%, var(--border-line, #e0e0e0));
  background: color-mix(in srgb, #c23b3b 10%, var(--bg-body, #f2f2f2));
}
`;
    document.head.appendChild(style);

    _root = document.createElement('div');
    _root.id = 'post-office-root';
    _root.setAttribute('aria-hidden', 'true');
    _root.innerHTML = `
<div class="po-noise"></div>
<div class="po-watermark">Drift Mail</div>
<div class="po-bg-letter">P</div>
<div class="po-scroll">
  <div class="po-topbar">
    <div class="po-topbar-left">
      <button type="button" class="po-close" id="po-btn-close" aria-label="返回"><i class="ph ph-arrow-left"></i> Back</button>
    </div>
    <div class="po-topbar-right">
      <button type="button" class="po-inbox-btn" id="po-btn-inbox" aria-label="信箱">
        <i class="ph ph-tray"></i>
        <span class="po-inbox-badge" id="po-inbox-badge">0</span>
      </button>
    </div>
  </div>
  <div id="po-view-list" class="po-view active">
    <div class="po-hub-wrap">
      <div class="po-hub">
        <div class="po-hub-spine" aria-hidden="true"></div>
        <div class="po-hub-panel">
          <div class="po-top">
            <div class="po-hub-titleblock">
              <div class="po-date-line" id="po-date-line">CURRENT / ROUND</div>
              <h1 class="po-title">时空邮局</h1>
              <div class="po-sub">Post Office · 局长工作台</div>
            </div>
            <div class="po-hub-tr">
              <span class="po-hub-monogram" aria-hidden="true">邮</span>
            </div>
          </div>
          <div class="po-hub-band" id="po-hub-band">
            <span class="po-hub-duty">执勤</span>
            <span class="po-hub-band-sep" aria-hidden="true"></span>
            <span class="po-hub-station" id="po-station-id">ST-000</span>
            <span class="po-hub-band-flex" aria-hidden="true"></span>
            <span class="po-hub-coords" id="po-hub-coords">—</span>
          </div>
          <button type="button" class="po-catch-btn" id="po-btn-catch">
            <span class="po-catch-icon" aria-hidden="true"><i class="ph ph-waves"></i></span>
            <span class="po-catch-text">
              <b>捕捞信笺</b>
              <small>洋流采样</small>
            </span>
          </button>
          <div class="po-section-head">
            <span class="po-section-label">本轮截获 / INTERCEPT</span>
            <span id="po-round-badge" class="po-round-badge">待捕捞</span>
          </div>
        </div>
      </div>
    </div>
    <div id="po-list-area"></div>
  </div>
  <div id="po-view-detail" class="po-view">
    <div class="po-detail-topnav">
      <button type="button" class="po-d-back" id="po-detail-back"><i class="ph ph-arrow-left"></i> Back</button>
      <span class="po-detail-badge" aria-hidden="true">拆信台</span>
    </div>
    <div id="po-detail-inner"></div>
  </div>
</div>
<div class="po-modal" id="po-reply-modal" aria-hidden="true">
  <div class="po-modal-backdrop" id="po-reply-modal-backdrop"></div>
  <div class="po-modal-panel" role="dialog" aria-modal="true" aria-label="回信箱">
    <div class="po-modal-head">
      <div class="po-modal-title">信箱 · 收录</div>
      <button type="button" class="po-modal-close" id="po-reply-modal-close" aria-label="关闭">×</button>
    </div>
    <div class="po-modal-body" id="po-reply-modal-body"></div>
  </div>
</div>
`;
    document.body.appendChild(_root);

    _root.querySelector('#po-btn-close').onclick = () => close();
    _root.querySelector('#po-btn-catch').onclick = () => catchLetters();
    _root.querySelector('#po-detail-back').onclick = () => showList();
    _root.querySelector('#po-btn-inbox').onclick = () => _openReplyModal();
    _root.querySelector('#po-reply-modal-close').onclick = () => _closeReplyModal();
    _root.querySelector('#po-reply-modal-backdrop').onclick = () => _closeReplyModal();
  }

  function _summary(body) {
    const t = (body || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 56) return t;
    return t.slice(0, 54) + '…';
  }

  function _paintHubSession() {
    if (!_root) return;
    const now = new Date();
    const lat = 18 + (now.getDate() % 14);
    const lng = 108 + ((now.getHours() * 5 + now.getMinutes()) % 32);
    const sec = String((now.getMinutes() * 4 + now.getSeconds()) % 89).padStart(2, '0');
    const c = _root.querySelector('#po-hub-coords');
    if (c) c.textContent = `N${lat}° · E${lng}° · 扇区 ${sec}`;
    const s = _root.querySelector('#po-station-id');
    if (s) s.textContent = `ST-${String(Math.floor(100 + Math.random() * 899))}`;
  }

  function _updateHubRoundBadge() {
    if (!_root) return;
    const el = _root.querySelector('#po-round-badge');
    if (!el) return;
    if (_loading) {
      el.textContent = '洋流采样中…';
      el.classList.add('po-round-badge--busy');
      return;
    }
    el.classList.remove('po-round-badge--busy');
    el.textContent = !_letters.length ? '待捕捞' : `${_letters.length} 封在册`;
  }

  function _updateInboxBadge() {
    if (!_root) return;
    const b = _root.querySelector('#po-inbox-badge');
    if (!b) return;
    b.textContent = '';
    b.classList.remove('on');
    b.style.display = 'none';
  }

  function renderListArea() {
    _updateHubRoundBadge();
    _updateInboxBadge();
    const area = _root.querySelector('#po-list-area');
    if (_loading) {
      area.innerHTML = `
<div class="po-catch-stage" aria-label="捕捞中">
  <div class="po-catch-stage-head">
    <div class="po-catch-stage-title">洋流捕捞中</div>
    <div class="po-catch-stage-sub">SAMPLING · DRIFT</div>
  </div>
  <div class="po-catch-ocean" aria-hidden="true">
    <span class="po-catch-env" style="--x:8%;--y:52%;--r:-10deg;--d:1.25s"></span>
    <span class="po-catch-env" style="--x:22%;--y:30%;--r:6deg;--d:1.05s"></span>
    <span class="po-catch-env" style="--x:38%;--y:58%;--r:-2deg;--d:1.35s"></span>
    <span class="po-catch-env" style="--x:56%;--y:34%;--r:10deg;--d:1.15s"></span>
    <span class="po-catch-env" style="--x:72%;--y:54%;--r:-6deg;--d:1.28s"></span>
    <span class="po-catch-env" style="--x:84%;--y:28%;--r:2deg;--d:1.18s"></span>
  </div>
  <div class="po-catch-hint">PLEASE WAIT · 信笺上浮中…</div>
</div>`;
      return;
    }
    if (!_letters.length) {
      area.innerHTML = `<div class="po-empty">暂无信笺<br><small>点击「捕捞信笺」开始本轮工作</small></div>`;
      return;
    }
    const cards = _letters.map((L, idx) => `
<div class="po-card${L.source === 'incoming_reply' ? ' po-card--reply' : ''}" data-id="${_esc(L.id)}" style="--i:${idx}">
  <div class="po-card-rail" aria-hidden="true">
    <div class="po-postmark"><span class="po-card-idx">NO.${String(idx + 1).padStart(2, '0')}</span></div>
    <span class="po-postmark-cap">${L.source === 'incoming_reply' ? '回信' : '截获'}</span>
  </div>
  <div class="po-card-sleeve">
    <div class="po-card-core">
      <div class="po-card-top">
        <div class="po-card-to">${_esc(L.to)}</div>
        <span class="po-card-tag">${_esc(L.tag)}</span>
      </div>
      <div class="po-card-from"><em>自</em>${_esc(L.from)}</div>
      <div class="po-card-sum">${_esc(_summary(L.body))}</div>
    </div>
  </div>
</div>`).join('');
    area.innerHTML = `<div class="po-stream"><div class="po-stream-line" aria-hidden="true"></div><div class="po-list">${cards}</div></div>`;
    area.querySelectorAll('.po-card').forEach(el => {
      el.onclick = () => openDetail(el.getAttribute('data-id'));
    });
  }

  function _toast(msg) {
    if (typeof Toast !== 'undefined' && Toast.show) Toast.show(msg);
    else console.warn('[PostOffice]', msg);
  }

  function showList() {
    _detailId = null;
    _returnExpanded = false;
    _root.classList.remove('po-on-detail');
    _root.querySelector('#po-view-list').classList.add('active');
    _root.querySelector('#po-view-detail').classList.remove('active');
    renderListArea();
  }

  function openDetail(id) {
    const L = _letters.find(x => x.id === id);
    if (!L) return;
    const idx = _letters.findIndex(x => x.id === id);
    const no = idx >= 0 ? String(idx + 1).padStart(2, '0') : '--';
    const refRaw = String(L.id).replace(/[^a-zA-Z0-9]/g, '');
    const ref = (refRaw.slice(-8) || '--------').toUpperCase();
    const tr = L.translation && String(L.translation).trim();
    const kindLabel = L.source === 'incoming_reply' ? '回信（来信）' : '时空信';
    const dimPart = L.dimension ? ` · 扇位 ${L.dimension}` : '';
    const stylePart = '';
    const letterBody = tr
      ? `<span class="po-detail-section-label">原文 Original</span>
      <div class="po-letter-sheet po-letter-sheet--original">${_esc((L.original && String(L.original).trim()) || '（原文从略）')}</div>
      <span class="po-detail-section-label">中文展读</span>
      <div class="po-letter-sheet">${_esc(L.translation)}</div>`
      : `<span class="po-detail-section-label">密函正文 / Body</span>
      <div class="po-letter-sheet">${_esc(L.body)}</div>`;
    _detailId = id;
    _returnExpanded = false;
    _root.classList.add('po-on-detail');
    _root.querySelector('#po-view-list').classList.remove('active');
    _root.querySelector('#po-view-detail').classList.add('active');
    const inner = _root.querySelector('#po-detail-inner');
    inner.innerHTML = `
<div class="po-detail-dossier">
  <div class="po-detail-spine" aria-hidden="true"></div>
  <div class="po-detail-body">
    <header class="po-detail-header">
      <div class="po-detail-seal" aria-hidden="true"><span>拆封<br>验讫</span></div>
      <div class="po-detail-header-main">
        <p class="po-detail-kicker">${L.source === 'incoming_reply' ? 'Reply mail · received' : 'Drift mail · intercept'}</p>
        <h2 class="po-detail-h2">验讫拆阅</h2>
        <p class="po-detail-ref">案卷 NO.${no} · HASH ${ref}</p>
      </div>
    </header>
    <section class="po-routing" aria-label="邮路">
      <div class="po-routing-grid">
        <div class="po-routing-cell">
          <span class="po-routing-key">发件 From</span>
          <p class="po-routing-val">${_esc(L.from)}</p>
        </div>
        <div class="po-routing-cell">
          <span class="po-routing-key">收件 To</span>
          <p class="po-routing-val po-routing-val--serif">${_esc(L.to)}</p>
        </div>
        <div class="po-routing-cell po-routing-cell--wide">
          <span class="po-routing-key">稽核标签 Tag</span>
          <span class="po-routing-tag">${_esc(L.tag)}</span>
        </div>
        <div class="po-routing-cell po-routing-cell--wide">
          <span class="po-routing-key">类型</span>
          <p class="po-routing-val">${_esc(kindLabel)}${dimPart}${stylePart}</p>
        </div>
      </div>
    </section>
    <section class="po-letter" aria-label="正文">
      <div class="po-letter-perf" aria-hidden="true"></div>
      ${letterBody}
    </section>
    <section class="po-docket" aria-label="处置">
      <div class="po-docket-tab"><span class="po-docket-tab-en">DISPOSITION</span><span class="po-docket-tab-zh">局长处置联</span></div>
      <label class="po-detail-section-label" for="po-proxy-reply">代收件人回复（必填）</label>
      <textarea class="po-textarea po-textarea--ruled" id="po-proxy-reply" placeholder="以局长身份代笔回信摘要或全文…"></textarea>
      <div class="po-actions">
        <button type="button" class="po-btn-solid" id="po-btn-proxy">确认代投递</button>
        <button type="button" class="po-toggle-ret" id="po-btn-toggle-ret">展开退回区</button>
        <div class="po-ret-panel" id="po-ret-panel">
          <label class="po-detail-section-label" for="po-return-reason">退回理由（必填）</label>
          <textarea class="po-textarea po-textarea--ruled" id="po-return-reason" placeholder="说明退回原因…"></textarea>
          <div class="po-row-btns">
            <button type="button" class="po-btn-outline" id="po-btn-confirm-ret">确认退回</button>
            <button type="button" class="po-btn-ghost" id="po-btn-cancel-ret">取消</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>`;
    const btnRet = inner.querySelector('#po-btn-toggle-ret');
    const panel = inner.querySelector('#po-ret-panel');
    btnRet.onclick = () => {
      _returnExpanded = !_returnExpanded;
      panel.classList.toggle('open', _returnExpanded);
      btnRet.textContent = _returnExpanded ? '收起退回区' : '展开退回区';
    };
    inner.querySelector('#po-btn-proxy').onclick = () => doProxy();
    inner.querySelector('#po-btn-confirm-ret').onclick = () => doReturn();
    inner.querySelector('#po-btn-cancel-ret').onclick = () => {
      _returnExpanded = false;
      panel.classList.remove('open');
      inner.querySelector('#po-return-reason').value = '';
      btnRet.textContent = '展开退回区';
    };

    const ta = inner.querySelector('#po-proxy-reply');
    const existing = _getReplyDraft(id);
    if (ta && existing && existing.text) ta.value = existing.text;
    const meta = { from: L.from, to: L.to, tag: L.tag, dimension: L.dimension || null };
    if (ta) {
      ta.addEventListener('input', () => {
        clearTimeout(_replyDraftTimer);
        _replyDraftTimer = setTimeout(() => {
          _saveReplyDraft(id, (ta.value || '').trim(), meta);
        }, 600);
      });
    }

  }

  function _closeReplyModal() {
    const modal = _root && _root.querySelector('#po-reply-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function _copyText(text) {
    const t = String(text || '');
    if (!t) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  function _openReplyModal(focusId) {
    const modal = _root && _root.querySelector('#po-reply-modal');
    const body = _root && _root.querySelector('#po-reply-modal-body');
    if (!modal || !body) return;
    const threads = _mailboxListThreads();
    if (!threads.length) {
      body.innerHTML = `<div class="po-empty">信箱为空<br><small>你回信后，对话会被收录在此处</small></div>`;
    } else if (focusId) {
      const t = _mailboxGetThread(String(focusId));
      if (!t) {
        body.innerHTML = `<div class="po-empty">该条目不存在<br><small>可能已被删除</small></div>`;
      } else {
        const o = t.original || {};
        const head = `
<div class="po-reply-item" data-id="${_esc(t.id)}">
  <div class="po-reply-meta">THREAD · ${_esc(_fmtTime(t.updatedAt || t.createdAt))}</div>
  <div class="po-reply-text">${_esc(o.to || '未署名')} · <span style="opacity:.72">${_esc(o.tag || '')}</span></div>
  <div class="po-reply-actions">
    <button type="button" class="po-mini-btn" data-act="back">返回列表</button>
    <button type="button" class="po-mini-btn" data-act="copy">复制全部</button>
    <button type="button" class="po-mini-btn po-mini-btn--danger" data-act="del">删除</button>
  </div>
</div>`;
        const originalBlock = `
<div class="po-reply-item">
  <div class="po-reply-meta">ORIGINAL · FROM ${_esc(o.from || '')} · TO ${_esc(o.to || '')}</div>
  <div class="po-reply-text">${_esc(o.body || '')}</div>
</div>`;
        const msgs = Array.isArray(t.messages) ? t.messages : [];
        const msgBlocks = msgs.map(m => {
          const k = m.kind === 'incoming_reply' ? 'RECEIVED' : m.kind === 'user_reply' ? 'SENT' : 'NOTE';
          const meta = `${k} · ${_esc(_fmtTime(m.at || 0))}`;
          return `
<div class="po-reply-item">
  <div class="po-reply-meta">${meta}</div>
  <div class="po-reply-text">${_esc(m.body || '')}</div>
</div>`;
        }).join('');
        body.innerHTML = `${head}${originalBlock}${msgBlocks}`;

        const wrap = body.querySelector('.po-reply-item[data-id]');
        if (wrap) {
          wrap.querySelectorAll('button[data-act]').forEach(btn => {
            btn.onclick = async () => {
              const act = btn.getAttribute('data-act');
              if (act === 'back') _openReplyModal();
              else if (act === 'del') {
                _mailboxRemoveThread(t.id);
                _updateInboxBadge();
                _toast('已删除');
                _openReplyModal();
              } else if (act === 'copy') {
                const lines = [];
                lines.push(`【原信】${o.from || ''} → ${o.to || ''} (${o.tag || ''})`);
                lines.push(o.body || '');
                lines.push('');
                msgs.forEach(mm => {
                  lines.push(mm.kind === 'incoming_reply' ? '【对方回信】' : mm.kind === 'user_reply' ? '【我的回信】' : '【记录】');
                  lines.push(mm.body || '');
                  lines.push('');
                });
                const ok = await _copyText(lines.join('\n'));
                _toast(ok ? '已复制到剪贴板' : '复制失败');
              }
            };
          });
        }
      }
    } else {
      const cards = threads.map((t, idx) => {
        const o = t.original || {};
        const last = Array.isArray(t.messages) && t.messages.length ? t.messages[t.messages.length - 1] : null;
        const preview = last && last.body ? last.body : (o.body || '');
        const tag = o.tag || '收录';
        return `
<div class="po-card" data-id="${_esc(t.id)}" style="--i:${idx}">
  <div class="po-card-rail" aria-hidden="true">
    <div class="po-postmark"><span class="po-card-idx">BOX.${String(idx + 1).padStart(2, '0')}</span></div>
    <span class="po-postmark-cap">收录</span>
  </div>
  <div class="po-card-sleeve">
    <div class="po-card-core">
      <div class="po-card-top">
        <div class="po-card-to">${_esc(o.to || '未署名')}</div>
        <span class="po-card-tag">${_esc(tag)}</span>
      </div>
      <div class="po-card-from"><em>自</em>${_esc(o.from || '未知发件')}</div>
      <div class="po-card-sum">${_esc(_summary(preview))}</div>
    </div>
  </div>
</div>`;
      }).join('');
      body.innerHTML = `<div class="po-stream"><div class="po-stream-line" aria-hidden="true"></div><div class="po-list">${cards}</div></div>`;
      body.querySelectorAll('.po-card').forEach(el => {
        el.onclick = () => _openReplyModal(el.getAttribute('data-id'));
      });
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function removeById(id) {
    const before = _letters.length;
    _letters = _letters.filter(x => x.id !== id);
    const after = _letters.length;
    return { before, after, removed: before > after };
  }

  function _sendFromInbox(letterId, text) {
    const v = String(text || '').trim();
    if (!v) {
      _toast('请填写回信内容');
      return false;
    }
    const list = _loadInbox();
    const original = list.find(x => x && x.id === letterId);
    if (!original) {
      _toast('该信件不在信箱中');
      return false;
    }
    _saveReplyDraft(letterId, v, { from: original.from, to: original.to, tag: original.tag, dimension: original.dimension || null });
    _saveSentReply(original, v);
    _deleteReplyDraft(letterId);
    // 信箱保存“已回信”归档，不移除
    _inboxUpsert({
      id: original.id,
      from: original.from,
      to: original.to,
      tag: '已回',
      dimension: original.dimension || null,
      body: v,
      original: v,
      translation: null,
      styleNote: '',
      source: 'sent_reply',
    });
    _updateInboxBadge();
    _toast('回信已寄出');
    return true;
  }

  function doProxy() {
    const inner = _root.querySelector('#po-detail-inner');
    const ta = inner.querySelector('#po-proxy-reply');
    const v = (ta && ta.value || '').trim();
    if (!v) {
      _toast('请填写代收件人回复');
      return;
    }
    const id = _detailId;
    if (!id) return;
    const original = _letters.find(x => x.id === id);
    if (original) {
      _saveReplyDraft(id, v, { from: original.from, to: original.to, tag: original.tag, dimension: original.dimension || null });
      _saveSentReply(original, v);
      _deleteReplyDraft(id);
      const tid = _mailboxUpsertOriginal(original);
      _mailboxAppend(tid, 'user_reply', v);
      _updateInboxBadge();
    }
    removeById(id);
    if (_letters.length === 0) _toast('代投递已登记；本轮信笺已全部处置完毕');
    else _toast('代投递已登记，信笺已从本轮移除');
    showList();
  }

  function doReturn() {
    const inner = _root.querySelector('#po-detail-inner');
    const ta = inner.querySelector('#po-return-reason');
    const v = (ta && ta.value || '').trim();
    if (!v) {
      _toast('请填写退回理由');
      return;
    }
    const id = _detailId;
    if (!id) return;
    removeById(id);
    if (_letters.length === 0) {
      _toast('已退回；本轮信笺已全部处置完毕');
    } else {
      _toast('已退回，信笺已从本轮移除');
    }
    showList();
  }

  async function catchLetters() {
    _injectOnce();
    const btn = _root.querySelector('#po-btn-catch');
    const n = _randomInt(5, 12);
    _loading = true;
    _root.classList.add('po-catching');
    btn.disabled = true;
    renderListArea();

    let usedMock = false;
    let mockMsg = '';
    const activeApi = await DB.api.getActive().catch(() => null);
    try {
      const r = await _fetchLettersFromApi(n);
      if (r.ok && r.letters && r.letters.length) {
        _letters = r.letters;
      } else {
        usedMock = true;
        _letters = _buildMockLetters(n);
        if (r.reason === 'no_api') mockMsg = '未配置或未激活 API，已使用占位信笺';
        else mockMsg = '生成失败，已使用占位信笺';
      }
    } catch (e) {
      console.error(e);
      usedMock = true;
      mockMsg = '请求异常，已使用占位信笺';
      _letters = _buildMockLetters(n);
    }

    // 洋流回流：有概率收到「对方给你的回信」
    try {
      const threads = _pickIncomingRepliesForRound(n);
      if (threads.length) {
        let incoming = await _fetchIncomingRepliesFromApi(activeApi, threads, threads.length).catch(() => null);
        if (!incoming || !incoming.length) incoming = threads.map(t => _buildIncomingReplyMock(t));
        incoming = incoming.filter(Boolean);
        if (incoming.length) {
          // 收录到信箱线程：挂到原信 threadId 上
          incoming.forEach(rp => {
            const tid = rp && rp.replyToId ? String(rp.replyToId) : null;
            if (!tid) return;
            const thread = threads.find(x => x && x.original && String(x.original.id) === tid);
            if (thread && thread.original) {
              _mailboxUpsertOriginal({
                id: tid,
                from: thread.original.from,
                to: thread.original.to,
                tag: thread.original.tag,
                dimension: thread.original.dimension,
                body: thread.original.body,
                original: thread.original.body,
                translation: null,
                styleNote: '',
              });
            }
            _mailboxAppend(tid, 'incoming_reply', rp.body);
          });
          _updateInboxBadge();
          const keep = Math.max(0, n - incoming.length);
          _letters = _letters.slice(0, keep);
          const insertAt = Math.min(_letters.length, Math.max(0, 1 + Math.floor(Math.random() * 2)));
          _letters.splice(insertAt, 0, ...incoming);
          _letters = _letters.slice(0, n);
        }
      }
    } catch (_) {}

    // 不再把“捕捞到的信”自动塞进信箱：信箱只收“已回信”的记录

    _loading = false;
    _root.classList.remove('po-catching');
    btn.disabled = false;
    renderListArea();
    if (usedMock && mockMsg) _toast(mockMsg);
    else _toast(`本轮截获 ${_letters.length} 封`);
  }

  function open() {
    _injectOnce();
    const now = new Date();
    const line = _root.querySelector('#po-date-line');
    if (line) {
      line.textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} / ROUND`;
    }
    _paintHubSession();
    _root.classList.add('po-open');
    _root.setAttribute('aria-hidden', 'false');
    showList();
  }

  function close() {
    if (_root) {
      _root.classList.remove('po-open');
      _root.setAttribute('aria-hidden', 'true');
    }
    _detailId = null;
    _returnExpanded = false;
    _loading = false;
  }

  return { open, close };
})();