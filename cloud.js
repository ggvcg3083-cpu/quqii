'use strict';

/**
 * ============================================================
 * CloudModule — Supabase 云原生同步引擎 (高定视觉版) + 诊断面板 + 自由备份
 * ============================================================
 */
const CloudModule = (() => {
  // 🌟 诊断日志系统 (最多保留最近 50 条记录)
  const _logs = [];
  function _log(level, title, detail = '') {
    const time = new Date().toLocaleTimeString();
    const logEntry = { time, level, title, detail: detail.toString() };
    _logs.push(logEntry);
    if (_logs.length > 50) _logs.shift(); // 保持数组不会无限大
    
    // 同步输出到控制台
    if (level === 'error') console.error(`[Cloud] ${title}`, detail);
    else if (level === 'warn') console.warn(`[Cloud] ${title}`, detail);
    else console.log(`[Cloud] ${title}`, detail);
  }

  // 1. 动态加载 Supabase SDK
  if (!window.supabase) {
    const script = document.createElement('script');
    script.src = "https://unpkg.com/@supabase/supabase-js@2";
    script.onload = () => _log('info', 'Supabase SDK 加载成功');
    script.onerror = () => _log('error', 'Supabase SDK 加载失败，请检查网络是否屏蔽了 unpkg.com');
    document.head.appendChild(script);
  }

  // 2. 专属高级 UI 样式
  const style = document.createElement('style');
  style.textContent = `
    #cloud-screen { z-index: 250; background: var(--s-bg); font-family: 'Noto Sans SC', sans-serif; }
    #cloud-screen .cloud-hint-box { font-family: 'Space Mono', monospace; font-size: 0.6rem; color: var(--s-text-secondary); line-height: 1.6; margin-top: 16px; background: rgba(0,0,0,0.02); padding: 16px; border: 1px dashed rgba(18,18,18,0.15); border-radius: 8px; text-transform: uppercase; letter-spacing: 1px; }
    [data-theme="dark"] #cloud-screen .cloud-hint-box { background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.15); }
    #cloud-screen .status-dot { display: inline-block; width: 6px; height: 6px; background: #2d6a4a; border-radius: 50%; margin-right: 6px; animation: cloud-pulse 2s infinite; vertical-align: middle; }
    @keyframes cloud-pulse { 0% { box-shadow: 0 0 0 0 rgba(45, 106, 74, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(45, 106, 74, 0); } 100% { box-shadow: 0 0 0 0 rgba(45, 106, 74, 0); } }
    
    /* 诊断面板样式 */
    #cloud-log-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #121212; z-index: 300; flex-direction: column; }
    #cloud-log-modal.active { display: flex; }
    .log-header { padding: 50px 20px 16px; background: #1a1a1a; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; color: #fff; }
    .log-content { flex: 1; overflow-y: auto; padding: 16px; font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #0f0; background: #0a0a0a; white-space: pre-wrap; word-break: break-all; }
    .log-item { margin-bottom: 10px; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 8px; }
    .log-item.error { color: #ff4a4a; }
    .log-item.warn { color: #ffcc00; }
    .log-item .log-time { opacity: 0.5; margin-right: 8px; }
  `;
  document.head.appendChild(style);

  // 3. 高级感 HTML 布局
  const cloudHTML = `
    <div id="cloud-screen" class="screen">
      <div class="bg-watermark">C</div>
      <div class="main-view">
        <button class="main-back-btn" onclick="CloudModule.close()">Back</button>
        <header class="main-header">
          <h1 class="main-title">Sync.</h1>
          <div class="main-subtitle">SUPABASE NEURAL LINK</div>
        </header>
        <div class="content-scroll" style="padding: 0;">
          
          <div class="form-section">
            <div class="section-title">节点接入 / Node Connection</div>
            <div class="input-wrapper" style="margin-bottom:12px;">
              <label class="label-text">Project URL / 项目地址</label>
              <input type="text" id="cloud-url" class="input-line" placeholder="https://xxxxx.supabase.co">
            </div>
            <div class="input-wrapper" style="margin-bottom:16px;">
              <label class="label-text">Anon Key / 匿名密钥</label>
              <input type="password" id="cloud-key" class="input-line" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
            </div>
            
            <div style="display:flex; gap:12px; margin-bottom: 24px;">
              <button class="btn-outline" style="flex:1; border-color:var(--s-text-secondary); color:var(--s-text-secondary);" onclick="CloudModule.clearConnection()">清空 / CLEAR</button>
              <button class="btn-outline" style="flex:1; border-color:var(--s-text-primary); color:var(--s-text-primary);" onclick="CloudModule.saveConnection()">保存 / SAVE</button>
            </div>
          </div>

          <div class="form-section">
            <div class="section-title">全量同步 / Global Sync</div>
            <div style="display:flex; gap:12px;">
              <button class="btn-outline" id="btn-sync-down" style="flex:1; border-color:var(--s-text-secondary); color:var(--s-text-secondary);" onclick="CloudModule.syncDown()">
                <i class="ph-light ph-cloud-arrow-down"></i> PULL / 拉取
              </button>
              <button class="btn-primary" id="btn-sync-up" style="flex:1; background:var(--s-text-primary); color:var(--s-bg);" onclick="CloudModule.syncUp(false)">
                <i class="ph-light ph-cloud-arrow-up"></i> PUSH / 上传
              </button>
            </div>

            <div class="toggle-row" style="margin-top: 16px; border-top: 1px dashed rgba(18,18,18,0.1); padding-top: 16px;">
              <div class="toggle-row-info">
                <div class="toggle-row-label" style="font-size:0.85rem; font-weight:600; color:var(--s-text-primary);">自动备份 (Auto Backup)</div>
                <div class="toggle-row-desc" style="font-size:0.6rem; color:var(--s-text-secondary); margin-top:4px;">应用退入后台时触发静默同步</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="cloud-auto-backup" onchange="CloudModule.toggleAutoBackup(this.checked)">
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
              </label>
            </div>

            <div class="toggle-row" style="margin-top: 16px; border-top: 1px dashed rgba(18,18,18,0.1); padding-top: 16px;">
              <div class="toggle-row-info">
                <div class="toggle-row-label" style="font-size:0.85rem; font-weight:600; color:var(--s-text-primary);">云端代答 (Cloud Reply)</div>
                <div class="toggle-row-desc" style="font-size:0.6rem; color:var(--s-text-secondary); margin-top:4px;">等回复时切到后台，改由云端跑完并推送（需已部署 cloud-reply 函数）</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="cloud-reply-enabled" onchange="CloudModule.toggleCloudReply(this.checked)">
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
              </label>
            </div>
            
            <!-- 🌟 新增：冷却时间选择器 -->
            <div class="input-wrapper" id="auto-backup-interval-wrapper" style="margin-top:12px; display:none;">
              <label class="label-text">同步冷却频率</label>
              <select id="cloud-backup-interval" class="input-line" onchange="CloudModule.changeBackupInterval(this.value)" style="background:transparent; appearance:none;">
                <option value="10">每 10 分钟</option>
                <option value="30">每 30 分钟</option>
                <option value="60">每 1 小时</option>
                <option value="360">每 6 小时</option>
                <option value="1440">每 24 小时</option>
              </select>
            </div>
            
            <div class="cloud-hint-box">
              <div><span class="status-dot"></span> Postgres & Storage Engine</div>
              <div style="margin-top:8px; padding-top:8px; border-top: 0.5px dashed rgba(18,18,18,0.1); opacity: 0.8; font-size:0.55rem; line-height:1.8;">
                • 文本与图片物理分离存储<br>
                • 无极扩容，安全传输<br>
                ⚠️ 拉取与上传均为全量覆盖操作
              </div>
            </div>
          </div>

          <div class="form-section" style="margin-top:32px;">
            <div class="section-title">神经元模块 / Neural Engine</div>
            <div style="font-size:0.75rem; color:var(--s-text-secondary); line-height:2.2; font-family:'Space Mono', monospace; text-transform: uppercase;">
              <i class="ph-light ph-database"></i> PgVector Long-term RAG<br>
              <i class="ph-light ph-brain"></i> Autonomous Edge Agent<br>
              <i class="ph-light ph-bell-ringing"></i> Web Push Notification
            </div>
            
            <div style="margin-top:16px; padding:16px; background:rgba(0,0,0,0.02); border:1px solid rgba(18,18,18,0.1); border-radius:8px;">
              <div style="font-size:0.85rem; font-weight:600; color:var(--s-text-primary); margin-bottom:8px;">开启真·离线推送</div>
              <div style="font-size:0.6rem; color:var(--s-text-secondary); margin-bottom:12px; line-height:1.5;">授权后，即使关闭浏览器，大模型也能在后台通过系统通知主动找你。</div>
              
              <div class="input-wrapper" style="margin-bottom:16px;">
                <label class="label-text">VAPID Public Key / 推送公钥</label>
                <input type="text" id="vapid-key" class="input-line" placeholder="BEl6... (用户自行填入)">
              </div>

              <button class="btn-outline" style="width:100%; border-color:var(--s-text-primary); color:var(--s-text-primary);" onclick="CloudModule.requestPushPermission()">
                <i class="ph-bold ph-bell-ringing"></i> 允许发送系统通知
              </button>
            </div>
          </div>

          <div class="form-section" style="margin-top:32px;">
            <div class="section-title">小红书解析 / XHS Parser</div>
            <div class="input-wrapper" style="margin-bottom:12px;">
              <label class="label-text">解析函数地址 / XHS Edge URL</label>
              <input type="text" id="xhs-edge-url" class="input-line" placeholder="https://xxxxx.supabase.co/functions/v1/xhs-fetch">
            </div>
            <button class="btn-outline" style="width:100%; border-color:var(--s-text-primary); color:var(--s-text-primary);" onclick="CloudModule.saveXhsUrl()">
              <i class="ph-bold ph-floppy-disk"></i> 保存地址 / SAVE
            </button>
            <div class="cloud-hint-box" style="margin-top:16px;">
              填入你自己部署的 xhs-fetch 函数地址。聊天里发小红书链接，角色会自动"读到"帖子并显示卡片。留空则关闭此功能。
            </div>
          </div>

          <!-- 🌟 新增：诊断日志入口 -->
          <div style="margin-top: 40px; margin-bottom: 20px; text-align: center;">
            <button class="btn-outline" style="border:none; font-size:0.65rem; font-family:'Space Mono', monospace; color:var(--s-text-secondary); text-decoration:underline;" onclick="CloudModule.openLogs()">
              <i class="ph-light ph-terminal"></i> 打开系统诊断日志 (Debug Logs)
            </button>
          </div>

        </div>
      </div>
    </div>
    
    <!-- 🌟 新增：诊断日志面板 HTML -->
    <div id="cloud-log-modal">
      <div class="log-header">
        <div style="font-weight:bold; font-family:'Space Mono', monospace;">SYSTEM DIAGNOSTICS</div>
        <button style="background:none; border:none; color:#fff; font-size:1rem;" onclick="document.getElementById('cloud-log-modal').classList.remove('active')"><i class="ph-light ph-x"></i></button>
      </div>
      <div class="log-content" id="cloud-log-content"></div>
    </div>
  `;
  
  function _injectHTML() {
    const device = document.querySelector('.device');
    if (device && !document.getElementById('cloud-screen')) {
      device.insertAdjacentHTML('beforeend', cloudHTML);
    }
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', _injectHTML);
  } else {
    _injectHTML();
  }

  // 渲染日志面板
  function openLogs() {
    const content = document.getElementById('cloud-log-content');
    content.innerHTML = _logs.length === 0 ? '<div style="opacity:0.5;">暂无日志记录...</div>' : '';
    
    _logs.forEach(log => {
      const div = document.createElement('div');
      div.className = `log-item ${log.level}`;
      div.innerHTML = `<span class="log-time">[${log.time}]</span> <b>${log.title}</b><br>${log.detail ? `<span style="opacity:0.7">${log.detail}</span>` : ''}`;
      content.appendChild(div);
    });
    
    document.getElementById('cloud-log-modal').classList.add('active');
  }

  async function _getRawDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('chillOS');
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  let _supabaseInstance = null;

  function _getSupabase() {
    if (_supabaseInstance) return _supabaseInstance;

    const url = document.getElementById('cloud-url').value.trim().replace(/\/$/, '');
    const key = document.getElementById('cloud-key').value.trim();
    
    if (!url || !key) {
      _log('warn', '连接失败', '用户未填写 URL 或 Key');
      Toast.show('请填写 Project URL 与 Anon Key');
      return null;
    }
    if (!window.supabase) {
      _log('error', '连接失败', 'Supabase SDK 尚未加载完毕');
      Toast.show('Supabase SDK 仍在加载，请稍等一秒');
      return null;
    }
    
    DB.settings.set('cloud-url', url);
    DB.settings.set('cloud-key', key);
    
    _log('info', '正在创建 Supabase 实例连接', `URL: ${url}`);
    _supabaseInstance = window.supabase.createClient(url, key);
    return _supabaseInstance;
  }

  async function _getSupabaseSilent() {
    if (_supabaseInstance) return _supabaseInstance;

    try {
      const url = await DB.settings.get('cloud-url');
      const key = await DB.settings.get('cloud-key');
      if (!url || !key || !window.supabase) return null;
      
      _supabaseInstance = window.supabase.createClient(url, key);
      return _supabaseInstance;
    } catch(e) { 
      _log('error', '静默获取数据库实例失败', e.message);
      return null; 
    }
  }

  async function open() {
    try {
      const savedUrl = await DB.settings.get('cloud-url');
      const savedKey = await DB.settings.get('cloud-key');
      const savedVapid = await DB.settings.get('cloud-vapid');
      const autoBackup = await DB.settings.get('cloud-auto-backup');
      const backupInterval = await DB.settings.get('cloud-backup-interval') || '360'; // 默认 6 小时
      
      if (savedUrl) document.getElementById('cloud-url').value = savedUrl;
      if (savedKey) document.getElementById('cloud-key').value = savedKey;
      if (savedVapid) document.getElementById('vapid-key').value = savedVapid;

      const savedXhsUrl = await DB.settings.get('xhs-edge-url');
      const xhsInput = document.getElementById('xhs-edge-url');
      if (xhsInput && savedXhsUrl) xhsInput.value = savedXhsUrl;
      
      const autoToggle = document.getElementById('cloud-auto-backup');
      if (autoToggle) {
        autoToggle.checked = !!autoBackup;
        document.getElementById('auto-backup-interval-wrapper').style.display = autoBackup ? 'block' : 'none';
      }
      
      const intervalSelect = document.getElementById('cloud-backup-interval');
      if (intervalSelect) intervalSelect.value = backupInterval;

      const cloudReplyToggle = document.getElementById('cloud-reply-enabled');
      if (cloudReplyToggle) {
        const cr = await DB.settings.get('cloud-reply-enabled');
        cloudReplyToggle.checked = !!cr;
      }

    } catch(e) {}
    document.getElementById('cloud-screen').classList.add('active');
  }

  function close() {
    document.getElementById('cloud-screen').classList.remove('active');
  }

  async function toggleAutoBackup(enabled) {
    try {
      await DB.settings.set('cloud-auto-backup', enabled);
      document.getElementById('auto-backup-interval-wrapper').style.display = enabled ? 'block' : 'none';
      if (enabled) {
         _log('info', '用户开启了自动备份功能');
         Toast.show('自动备份已开启');
      }
    } catch (e) {}
  }

  async function toggleCloudReply(enabled) {
    try {
      await DB.settings.set('cloud-reply-enabled', enabled);
      if (enabled) {
        _log('info', '用户开启了云端代答');
        Toast.show('云端代答已开启 ✦ 切后台等回复将由云端处理');
      } else {
        _log('info', '用户关闭了云端代答');
        Toast.show('云端代答已关闭，回复改回本地处理');
      }
    } catch (e) {}
  }

  async function changeBackupInterval(minutes) {
    try {
      await DB.settings.set('cloud-backup-interval', minutes);
      _log('info', `用户将自动备份冷却时间修改为: ${minutes} 分钟`);
      Toast.show(`冷却时间已更新为 ${minutes} 分钟`);
    } catch (e) {}
  }

  async function saveConnection() {
    const url = document.getElementById('cloud-url').value.trim().replace(/\/$/, '');
    const key = document.getElementById('cloud-key').value.trim();
    await DB.settings.set('cloud-url', url);
    await DB.settings.set('cloud-key', key);
    
    _supabaseInstance = null; // 重置实例，确保下次调用使用新配置
    _log('info', '用户手动保存了云端节点配置');
    if (typeof Toast !== 'undefined') Toast.show('节点配置已保存 ✦');
  }

  // 🌟 保存小红书解析函数地址（存于 DB.settings，前端 XhsShare 模块会读取）
  async function saveXhsUrl() {
    try {
      const url = (document.getElementById('xhs-edge-url').value || '').trim().replace(/\/$/, '');
      await DB.settings.set('xhs-edge-url', url);
      if (window.XhsShare && XhsShare.setEdgeUrl) XhsShare.setEdgeUrl(url);
      _log('info', '用户保存了小红书解析函数地址', url || '(已清空)');
      if (typeof Toast !== 'undefined') Toast.show(url ? '小红书地址已保存 ✦' : '已清空小红书地址');
    } catch (e) {
      _log('error', '保存小红书地址失败', e.message);
    }
  }

  async function clearConnection() {
    document.getElementById('cloud-url').value = '';
    document.getElementById('cloud-key').value = '';
    await DB.settings.set('cloud-url', '');
    await DB.settings.set('cloud-key', '');
    
    _supabaseInstance = null; // 重置实例
    _log('info', '用户清空了云端节点配置');
    if (typeof Toast !== 'undefined') Toast.show('配置已清空');
  }

  // ============================================================
  // ☁️ 云端代答（Cloud Reply）——把"等回复"交给杀不死的云端
  // ============================================================

  // 提交一条待云端处理的回复任务。
  // 成功返回该行的 id（字符串）；任何原因失败都返回 null（前端据此回退到本地 fetch）。
  async function submitCloudReply(charId, apiProfile, messages) {
    _log('info', '☁️ [云端代答] 进入 submitCloudReply', `charId: ${charId}`);
    try {
      const supabase = await _getSupabaseSilent();
      if (!supabase) {
        _log('warn', '☁️ [云端代答] 未连接云端 → 回退本地', '没有 cloud-url / cloud-key，或 SDK 未加载');
        return null; // 第一道：没连云端 → 回退本地
      }
      _log('info', '☁️ [云端代答] 已拿到 Supabase 实例，准备写入 pending_replies');

      const payloadInfo = `model: ${apiProfile?.model || '?'}, 消息数: ${Array.isArray(messages) ? messages.length : '?'}`;
      _log('info', '☁️ [云端代答] 任务内容', payloadInfo);

      const { data, error } = await supabase
        .from('pending_replies')
        .insert({
          char_id:     String(charId),
          api_profile: apiProfile,
          messages:    messages,
          status:      'pending'
        })
        .select('id')
        .single();

      if (error) {
        _log('error', '☁️ [云端代答] 写入 pending_replies 失败 → 回退本地', error.message || JSON.stringify(error));
        return null;
      }
      _log('info', '✅ [云端代答] 任务已提交成功！等待云端处理', `行 id: ${data.id}`);
      return data.id;
    } catch (e) {
      _log('error', '☁️ [云端代答] 提交异常 → 回退本地', e.message || String(e));
      return null; // 第三道兜底：表不存在/网络炸 → 回退本地
    }
  }

  // 拉取一条已完成的云端回复结果。
  // 返回 { status, result, error_msg } 或 null。读到后由调用方决定是否删除该行。
  async function fetchCloudReply(rowId) {
    try {
      const supabase = await _getSupabaseSilent();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('pending_replies')
        .select('status, result, error_msg')
        .eq('id', rowId)
        .single();
      if (error) return null;
      return data;
    } catch (e) { return null; }
  }

  // 删除一条已处理完的云端回复（拿到结果后清理，避免堆积 + 减少 key 留存）
  async function deleteCloudReply(rowId) {
    try {
      const supabase = await _getSupabaseSilent();
      if (!supabase) return;
      await supabase.from('pending_replies').delete().eq('id', rowId);
    } catch (e) { /* 静默 */ }
  }

  // 拉取所有 done 状态的回复（切回前台时批量收取，类似离线信箱）
  async function pollDoneReplies() {
    try {
      const supabase = await _getSupabaseSilent();
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('pending_replies')
        .select('id, char_id, result, status, error_msg')
        .eq('status', 'done');
      if (error || !data) return [];
      return data;
    } catch (e) { return []; }
  }

  // 辅助报错拦截，用于排查朋友遇到的奇怪问题
  function handleFetchError(e, action) {
    _log('error', `${action} 失败拦截`, e.message);
    if (e.message.includes('Failed to fetch')) {
       _log('error', `网络绝杀分析 [${action}]`, '浏览器底层阻断。原因可能为：\n1. URL 含有空格、换行或少了 https://\n2. 手机被墙或加速器/广告拦截器阻挡了 *.supabase.co 域名\n3. 苹果 Safari 设置里开启了"隐藏IP"防跟踪。');
       Toast.show('上传失败: 网络连接被阻断，请查看诊断日志！', 3000);
    } else if (e.message.includes('row-level security')) {
       _log('error', `权限锁拦截 [${action}]`, '数据库的 RLS(防盗门) 未关闭，拒绝前端写入。去 Supabase 后台把 chill_sync 表的 RLS 关掉！');
       Toast.show('上传失败: 数据库写权限未开放');
    } else {
       Toast.show(`操作失败: ${e.message}`);
    }
  }

  async function syncUp(isSilent = false) {
    const supabase = isSilent ? await _getSupabaseSilent() : _getSupabase();
    if (!supabase) return;

    if (!isSilent) {
      // 省略原生确认弹窗逻辑以缩短篇幅，你原本的代码里的 _showCloudConfirm 依然有效
      const confirmed = confirm("警告：上传将完全覆盖云端现有数据。\n确定要执行上传吗？");
      if (!confirmed) return;
    }

    _log('info', `准备执行数据全量上传 ${isSilent ? '(后台静默)' : '(手动)'}`);

    const btn = document.getElementById('btn-sync-up');
    let oriText = '';
    
    if (!isSilent && btn) {
      oriText = btn.innerHTML;
      btn.style.pointerEvents = 'none';
      btn.innerHTML = '<i class="ph-light ph-spinner" style="animation:spin 1s linear infinite"></i> 提取数据...';
    }

    try {
      const db = await _getRawDB();
      const stores = Array.from(db.objectStoreNames);
      const payload = { _meta: { version: db.version, timestamp: Date.now() }, assets_meta: [] };
      const assetsToUpload = [];

      for (const storeName of stores) {
        const records = await new Promise(res => {
          const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
          req.onsuccess = e => res(e.target.result);
        });

        if (storeName === 'assets') {
          for (const record of records) {
            payload.assets_meta.push({
              key: record.key, mimeType: record.mimeType, size: record.size, updatedAt: record.updatedAt
            });
            assetsToUpload.push(record);
          }
        } else {
          payload[storeName] = records;
        }
      }

      _log('info', '本地数据提取完毕，开始向 Supabase 写入 chill_sync 表...');
      if (!isSilent && btn) btn.innerHTML = '<i class="ph-light ph-spinner" style="animation:spin 1s linear infinite"></i> 上传神经突触...';
      
      // 先存 meta 行（_meta + assets_meta 索引，很小）
      const { error: metaErr } = await supabase.from('chill_sync').upsert({
        id: 'main_backup',
        data: { _meta: payload._meta, assets_meta: payload.assets_meta },
        updated_at: new Date()
      });
      if (metaErr) throw new Error(metaErr.message);

      // 按 objectStore 逐个 upsert（避免单次操作超出 statement_timeout）
      for (const storeName of stores) {
        if (storeName === 'assets') continue;
        const { error: storeErr } = await supabase.from('chill_sync').upsert({
          id: `main_backup_${storeName}`,
          data: payload[storeName] || [],
          updated_at: new Date()
        });
        if (storeErr) _log('warn', `写入 ${storeName} 失败`, storeErr.message);
      }
      _log('info', '✅ chill_sync 表数据上传成功！');

      let current = 0;
      const total = assetsToUpload.length;
      if (total > 0) _log('info', `准备上传 ${total} 个媒体文件至 chill_assets...`);
      
      for (const record of assetsToUpload) {
        current++;
        if (!isSilent && btn) btn.innerHTML = `<i class="ph-light ph-spinner" style="animation:spin 1s linear infinite"></i> 刻录媒体 (${current}/${total})`;
        const { error: storageErr } = await supabase.storage.from('chill_assets').upload(record.key, record.blob, { upsert: true, contentType: record.mimeType });
        if (storageErr) _log('warn', `图片上传失败 [${record.key}]`, storageErr.message);
      }

      // 备份成功后，记录时间戳
      await DB.settings.set('cloud-last-auto-backup-time', Date.now());

      if (!isSilent) {
        _log('info', '全量同步已彻底完成');
        Toast.show('✦ 云端连结完毕，档案已永存 ✦');
      } else {
        _log('info', '后台静默备份成功完成');
      }
    } catch(e) {
      handleFetchError(e, '全量上传(PUSH)');
    } finally {
      if (!isSilent && btn) {
        btn.innerHTML = oriText;
        btn.style.pointerEvents = 'auto';
      }
    }
  }

  async function syncDown() {
    const supabase = _getSupabase();
    if (!supabase) return;

    const confirmed = confirm("警告：从云端拉取将完全覆盖当前设备上的所有数据！\n确定执行吗？");
    if (!confirmed) return;

    _log('info', '准备从云端拉取 (PULL) 全量数据');
    const btn = document.getElementById('btn-sync-down');
    const oriText = btn.innerHTML;
    btn.style.pointerEvents = 'none';

    try {
      btn.innerHTML = '<i class="ph-light ph-spinner" style="animation:spin 1s linear infinite"></i> 连接数据库...';
      
      // 拉主 meta 行
      const { data: metaRecord, error: metaErr } = await supabase
        .from('chill_sync').select('data').eq('id', 'main_backup').single();
      if (metaErr) throw new Error(metaErr.message);
      if (!metaRecord?.data) throw new Error('未在云端找到主备份数据');

      // 拉各 store 行（新版分行格式）
      const { data: storeRecords } = await supabase
        .from('chill_sync').select('id, data').like('id', 'main_backup_%');

      // 合并（向后兼容旧版：旧版 main_backup 里有完整数据，storeRecords 为空时直接用）
      const cloudData = { ...metaRecord.data };
      for (const row of (storeRecords || [])) {
        const storeName = row.id.replace('main_backup_', '');
        cloudData[storeName] = row.data;
      }

      _log('info', '✅ 云端数据库拉取成功，准备清空本地 IndexedDB...');

      await DB.clearAll();
      const db = await _getRawDB();
      const stores = Array.from(db.objectStoreNames);

      const assetsMeta = cloudData.assets_meta || [];
      const total = assetsMeta.length;
      let current = 0;

      if (total > 0) {
        _log('info', `开始从 Storage 拉取 ${total} 个媒体文件...`);
        for (const meta of assetsMeta) {
          current++;
          btn.innerHTML = `<i class="ph-light ph-spinner" style="animation:spin 1s linear infinite"></i> 提取媒体 (${current}/${total})`;
          
          const { data: blobData, error: dlErr } = await supabase.storage.from('chill_assets').download(meta.key);
            
          if (blobData && !dlErr) {
            await new Promise((resolve, reject) => {
              const tx = db.transaction('assets', 'readwrite');
              const store = tx.objectStore('assets');
              store.put({ key: meta.key, blob: blobData, mimeType: meta.mimeType, size: meta.size, updatedAt: meta.updatedAt });
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            });
          } else {
             _log('warn', `媒体拉取失败 [${meta.key}]`, dlErr?.message);
          }
        }
      }

      _log('info', '媒体拉取完毕，开始重建本地索引...');
      btn.innerHTML = '<i class="ph-light ph-spinner" style="animation:spin 1s linear infinite"></i> 构建索引...';
      for (const storeName of stores) {
        if (storeName === 'assets') continue; 
        if (cloudData[storeName] && cloudData[storeName].length > 0) {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const item of cloudData[storeName]) store.put(item);
          await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
        }
      }

      _log('info', '✦ 数据重载完毕，系统准备重启');
      Toast.show('✦ 数据重载完毕！系统即将重启 ✦');
      setTimeout(() => location.reload(), 1500);

    } catch(e) {
      handleFetchError(e, '全量拉取(PULL)');
    } finally {
      btn.innerHTML = oriText;
      btn.style.pointerEvents = 'auto';
    }
  }
  
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function requestPushPermission() {
    _log('info', '用户请求通知权限');
    // App 壳内走 APNs 原生推送，PWA 走下面原有的 Web Push，同一个按钮两条腿
    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
      return _requestApnsPermission();
    }
    const vapidInput = document.getElementById('vapid-key').value.trim();
    if (!vapidInput) { Toast.show('请先填写 VAPID 推送公钥'); return; }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) { 
      _log('error', '设备不支持 Notification 或 SW');
      Toast.show('当前浏览器不支持系统级推送'); 
      return; 
    }
    
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { 
      _log('warn', '用户拒绝了系统通知权限');
      Toast.show('通知授权被拒绝，离线 Agent 无法工作'); 
      return; 
    }

    Toast.show('正在生成端对端加密通信令牌...', 3000);

    try {
      await DB.settings.set('cloud-vapid', vapidInput);
      const reg = await navigator.serviceWorker.ready;
      
      // 强制刷新：先清掉旧订阅（iOS APNs endpoint 会静默轮转，必须重新拿）
      const oldSub = await reg.pushManager.getSubscription();
      if (oldSub) {
        _log('info', '检测到旧订阅，先清除再重新订阅...');
        await oldSub.unsubscribe();
      }
      _log('info', '正在通过 VAPID 向浏览器申请全新订阅通道...');
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidInput)
      });

      const subData = JSON.parse(JSON.stringify(subscription));
      await DB.settings.set('push-subscription', subData);

      _log('info', '✅ 设备令牌订阅成功！', subData);
      Toast.show('设备令牌生成成功！正在同步到云端...', 3000);

      // 直接把订阅写入 main_backup.data.settings，云函数从那里读
      try {
        const supabase = await _getSupabaseSilent();
        if (!supabase) throw new Error('未连接云端');
        const { data: existingRow } = await supabase.from('chill_sync').select('data').eq('id', 'main_backup').single();
        const currentData = existingRow?.data || {};
        const settings = Array.isArray(currentData.settings) ? currentData.settings : [];
        const idx = settings.findIndex(s => s.key === 'push-subscription');
        if (idx >= 0) settings[idx] = { key: 'push-subscription', value: subData };
        else settings.push({ key: 'push-subscription', value: subData });
        await supabase.from('chill_sync').upsert({ id: 'main_backup', data: { ...currentData, settings }, updated_at: new Date() });
        _log('info', '✅ 推送订阅已直接写入 main_backup.settings，云函数可读');
        Toast.show('设备令牌已同步到云端，信使就位 ✦');
      } catch(syncErr) {
        _log('warn', '推送订阅同步云端失败，请手动备份一次', syncErr.message);
        Toast.show('令牌已生成，请手动备份一次确保云端生效');
      }

      reg.showNotification('Chill OS', {
        body: '神经链路对接完成，设备加密令牌已锁定。',
        icon: 'apple-touch-icon.png'
      });

    } catch (e) {
      _log('error', '订阅 Push Manager 失败', e.message);
      Toast.show('生成设备令牌失败，请检查公钥格式是否正确');
    }
  }

  // ============================================================
  // App 壳内推送（APNs）：拿设备令牌存成 apns-token 设置项，
  // 存法与 push-subscription 完全同款（DB.settings + 直写 main_backup.settings），
  // offline-agent 读到 apns-token 就走 APNs 中转，读不到照旧走 Web Push。
  // ============================================================
  async function _requestApnsPermission() {
    const PN = Capacitor.Plugins && Capacitor.Plugins.PushNotifications;
    if (!PN) { Toast.show('当前 App 版本不支持推送，请先更新 App'); return; }
    try {
      const perm = await PN.requestPermissions();
      if (perm.receive !== 'granted') {
        _log('warn', '用户拒绝了 App 通知权限');
        Toast.show('通知授权被拒绝，离线 Agent 无法工作');
        return;
      }
      Toast.show('正在生成设备加密令牌...', 3000);

      const token = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('注册超时，请检查网络后重试')), 15000);
        PN.addListener('registration', (r) => { clearTimeout(timer); resolve(r.value); });
        PN.addListener('registrationError', (e) => { clearTimeout(timer); reject(new Error(e && e.error ? e.error : '系统注册失败')); });
        PN.register();
      });

      await DB.settings.set('apns-token', token);
      _log('info', '✅ APNs 设备令牌获取成功', token);
      Toast.show('设备令牌生成成功！正在同步到云端...', 3000);

      // 直接把令牌写入 main_backup.data.settings，云函数从那里读（与 Web Push 同款）
      try {
        const supabase = await _getSupabaseSilent();
        if (!supabase) throw new Error('未连接云端');
        const { data: existingRow } = await supabase.from('chill_sync').select('data').eq('id', 'main_backup').single();
        const currentData = existingRow?.data || {};
        const settings = Array.isArray(currentData.settings) ? currentData.settings : [];
        const idx = settings.findIndex(s => s.key === 'apns-token');
        if (idx >= 0) settings[idx] = { key: 'apns-token', value: token };
        else settings.push({ key: 'apns-token', value: token });
        await supabase.from('chill_sync').upsert({ id: 'main_backup', data: { ...currentData, settings }, updated_at: new Date() });
        _log('info', '✅ APNs 令牌已写入 main_backup.settings，云函数可读');
        Toast.show('设备令牌已同步到云端，信使就位 ✦');
      } catch (syncErr) {
        _log('warn', 'APNs 令牌同步云端失败，请手动备份一次', syncErr.message);
        Toast.show('令牌已生成，请手动备份一次确保云端生效');
      }
    } catch (e) {
      _log('error', 'APNs 注册失败', e.message);
      Toast.show('生成设备令牌失败：' + e.message);
    }
    _syncApnsAvatars(); // 注册完顺手把头像弹药库补齐（失败不影响令牌）
  }

  // ============================================================
  // 通信通知的头像弹药库：把每个角色头像缩成 128px 缩图存进 App Group，
  // 通知扩展从那里读、给横幅换脸。只在壳内跑；老壳没装 Preferences 插件就静默跳过。
  // ============================================================
  async function _syncApnsAvatars() {
    try {
      if (!window.Capacitor || !Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) return;
      const Prefs = Capacitor.Plugins && Capacitor.Plugins.Preferences;
      if (!Prefs || typeof DB === 'undefined') return;
      await Prefs.configure({ group: 'group.xyz.ruiyaxin.chill' });
      const chars = await DB.characters.getAll().catch(() => []);
      let done = 0;
      for (const c of chars) {
        try {
          if (!c.avatarUrl) continue;
          const rec = await DB.assets.get(c.avatarUrl).catch(() => null);
          if (!rec || !rec.blob) continue;
          const bmp = await createImageBitmap(rec.blob);
          const size = 128;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          const s = Math.min(bmp.width, bmp.height);
          ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
          if (bmp.close) bmp.close();
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          await Prefs.set({ key: 'chill-avatar-' + String(c.id), value: dataUrl.split(',')[1] });
          done++;
        } catch (e) { /* 单个角色失败不拦别人 */ }
      }
      // 分享扩展的角色名单：让扩展知道每张脸是谁（读不到就只有头像没名字）
      try {
        const roster = chars.map(c => ({ id: String(c.id), name: c.name || '' }));
        await Prefs.set({ key: 'chill-chars', value: JSON.stringify(roster) });
      } catch (e) { /* 名单失败不拦头像 */ }
      // 分享扩展的云端地址：扩展往用户自己的 share-react 打，没配云端就不存
      try {
        const cloudUrl = await DB.settings.get('cloud-url');
        if (cloudUrl) await Prefs.set({ key: 'chill-cloud-url', value: String(cloudUrl).trim().replace(/\/+$/, '') });
      } catch (e) { /* 地址失败不拦别人 */ }
      // VoIP 来电令牌：壳启动时写进 Preferences，捡回来存 settings 同步云端（agent 打电话用）
      try {
        const vt = await Prefs.get({ key: 'chill-voip-token' });
        if (vt && vt.value) await DB.settings.set('voip-token', vt.value);
      } catch (e) { /* 令牌失败不拦别人 */ }
      _log('info', '✅ 通知头像缩图已同步到 App Group（' + done + '/' + chars.length + '）');
      if (typeof Toast !== 'undefined') Toast.show('通知头像已同步 ' + done + '/' + chars.length);
    } catch (e) {
      _log('warn', '通知头像同步失败', e.message);
      if (typeof Toast !== 'undefined') Toast.show('通知头像同步失败：' + e.message);
    }
  }

  // 壳内每次启动后台补一次头像缩图（新角色/换头像跟得上），PWA 里这行是空跑
  if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    setTimeout(_syncApnsAvatars, 8000);
  }

  // ============================================================
  // 新鲜层：把开了主动联络的角色的"最近30条+最后互动时间"轻量同步到云端。
  // 只推离线云函数真正需要的那点数据（几KB），不走 6 小时冷却的完整备份，
  // 解决"云端读的是旧快照、生成的主动消息不知最近聊了啥 / 刚聊完又被推"。
  // 写进 chill_sync 表 id='freshness'（复用现有表，RLS 已配好），offline-agent 读它盖快照。
  // ============================================================

  // 前台聊天时的"活跃心跳"：只更新云端某角色的 last_interaction 时间戳，
  // 让 cron 知道"这人现在正活跃"，避免用户正聊着又被离线 agent 戳一下。
  // 节流：同一角色最多每 90 秒往云端点一次，不刷屏写库。
  const _touchThrottle = {};
  async function touchInteraction(charId) {
    try {
      if (!charId) return;
      const key = String(charId);
      const now = Date.now();
      if (_touchThrottle[key] && now - _touchThrottle[key] < 90000) return;
      _touchThrottle[key] = now;
      const supabase = await _getSupabaseSilent();
      if (!supabase) return;
      // 读现有 freshness 行，只改这个角色的 last_interaction，其余不动
      const { data: row } = await supabase.from('chill_sync').select('data').eq('id', 'freshness').single();
      const fresh = (row && row.data) || {};
      const entry = fresh[key] || {};
      entry.last_interaction = now;
      fresh[key] = entry;
      await supabase.from('chill_sync').upsert({ id: 'freshness', data: fresh, updated_at: new Date() });
    } catch (e) { /* 静默，不影响聊天 */ }
  }

  async function syncFreshness() {
    try {
      const supabase = await _getSupabaseSilent();
      if (!supabase) return;
      const chars = await DB.characters.getAll().catch(() => []);
      const fresh = {};
      for (const c of chars) {
        const on = await DB.settings.get(`offline-toggle-${c.id}`).catch(() => false);
        if (!on) continue; // 只同步开了主动联络的角色，省流量
        const last = await DB.settings.get(`last-interaction-${c.id}`).catch(() => 0);
        const recent = await DB.messages.getPage(String(c.id), 0, 30).catch(() => []);
        // 只留云函数用得上的字段，别把整条消息（含图片 base64）推上去
        const slim = (recent || []).map(m => ({
          role: m.role,
          content: m.parts ? m.parts.map(p => p.content || p.text || '').join('') : (m.content || ''),
          timestamp: m.timestamp
        }));
        fresh[String(c.id)] = { last_interaction: last || 0, recent_msgs: slim };
      }
      if (!Object.keys(fresh).length) return;
      await supabase.from('chill_sync').upsert({ id: 'freshness', data: fresh, updated_at: new Date() });
      _log('info', `🍃 新鲜层已同步（${Object.keys(fresh).length} 个角色）`);
    } catch (e) {
      _log('warn', '新鲜层同步失败（不影响正常使用）', e.message);
    }
  }

  // 静默收取离线消息 (阅后即焚)
  // ============================================================
  async function checkOfflineMessages() {
    const supabase = await _getSupabaseSilent();
    if (!supabase) return;

    try {
      _log('info', '开始检查云端离线信箱...');
      const { data: offlineMsgs, error } = await supabase
        .from('cloud_offline_messages')
        .select('*');
        
      if (error) throw new Error(error.message);
      if (!offlineMsgs || offlineMsgs.length === 0) {
         // _log('info', '信箱为空'); // 避免太吵
         return;
      }

      _log('info', `📥 发现 ${offlineMsgs.length} 组离线消息，开始收取...`);

      for (const record of offlineMsgs) {
        const charId = record.char_id;
        const bubbles = record.content || [];
        let timestamp = new Date(record.created_at).getTime();

        for (const text of bubbles) {
          let displayContent = text;
          let msgParts = [{ type: 'text', content: text }];
          
          const audioMatch = text.match(/^\[AUDIO:(\d+):(.+)\]$/s);
          const emoteMatch = text.match(/^\[EMOTE:(.+)\]$/i);
          
          if (audioMatch) {
            msgParts = [{ type: 'audio', duration: parseInt(audioMatch[1]), transcript: audioMatch[2].trim() }];
            displayContent = `[语音消息 ${audioMatch[1]}秒]`;
          } else if (emoteMatch) {
            const keyword = emoteMatch[1].trim();
            if (typeof EmoteModule !== 'undefined') {
              const url = EmoteModule.getUrlByKeyword(keyword, charId);
              if (url) {
                msgParts = [{ type: 'image', url: url, description: `[表情包:${keyword}]` }];
                displayContent = `[表情包]`;
              } else {
                msgParts = [{ type: 'text', content: `*试图发送表情包：${keyword}*` }];
              }
            }
          }

          const msg = {
            charId: String(charId),
            role: 'assistant',
            parts: msgParts,
            content: displayContent,
            timestamp: timestamp++,
            status: 'sent',
            recalled: false,
            recallContent: '',
            recallThought: '',
            recallNewMsg: ''
          };

          const newId = await DB.messages.add(msg);
          msg.id = newId;

          if (typeof ConvModule !== 'undefined') {
            const screen = document.getElementById('conv-screen');
            if (screen && (screen.classList.contains('active') || screen.classList.contains('qr-active')) && screen.dataset.cvCharId === String(charId)) {
               if (ConvModule._appendNovelImageMessage) {
                 ConvModule._appendNovelImageMessage(msg).catch(()=>{});
               }
            }
          }
        }

        _log('info', `执行阅后即焚: 删除云端信件 ID ${record.id}`);
        await supabase.from('cloud_offline_messages').delete().eq('id', record.id);
        
        await DB.settings.set(`last-interaction-${charId}`, Date.now());
      }

      if (typeof NotifModule !== 'undefined') NotifModule.refresh();

    } catch (e) {
      _log('error', '离线消息收取失败', e.message);
    }
  }

  // ── 初始化挂载 ──
  async function init() {
    _log('info', 'CloudModule 初始化...');
    // 首次加载时查收离线信件
    await checkOfflineMessages();
    
    // 监听应用可见性变化
    document.addEventListener('visibilitychange', async () => {
      // 1. 切回前台：检查是否有信件
      if (document.visibilityState === 'visible') {
        checkOfflineMessages();
      } 
      // 2. 🌟 切到后台：触发静默备份检查
      else if (document.visibilityState === 'hidden') {
        // 新鲜层：退后台=大概率刚聊完，轻量同步一次（不受 6h 冷却限制）
        syncFreshness();
        try {
          const autoEnabled = await DB.settings.get('cloud-auto-backup');
          if (autoEnabled) {
            const lastBackupTime = await DB.settings.get('cloud-last-auto-backup-time') || 0;
            const now = Date.now();
            
            // 🌟 动态读取冷却时间 (默认 360 分钟 = 6 小时)
            const intervalMinutes = await DB.settings.get('cloud-backup-interval') || '360';
            const COOLDOWN = parseInt(intervalMinutes) * 60 * 1000;

            if (now - lastBackupTime > COOLDOWN) {
              _log('info', `💤 应用退至后台，已超过冷却时间 (${intervalMinutes}分钟)，触发自动上传`);
              syncUp(true);
            } else {
               const minsLeft = ((COOLDOWN - (now - lastBackupTime)) / (1000 * 60)).toFixed(1);
               // 注释掉下面这行以免频繁后台输出，需要排查时可打开
               // _log('info', `💤 后台同步冷却中，剩余 ${minsLeft} 分钟`);
            }
          }
        } catch(e) {
          _log('error', '自动备份检查触发失败', e.message);
        }
      }
    });
  }

  return { init, open, close, syncUp, syncDown, requestPushPermission, toggleAutoBackup, toggleCloudReply, changeBackupInterval, openLogs, saveConnection, clearConnection, submitCloudReply, fetchCloudReply, deleteCloudReply, pollDoneReplies, saveXhsUrl, syncFreshness, touchInteraction };
})();

window.CloudModule = CloudModule;

// 在文件末尾确保加载时执行初始化，并智能等待 DB 模块就绪
const _cloudInitTimer = setInterval(() => {
    if (typeof DB !== 'undefined') {
        clearInterval(_cloudInitTimer);
        if (CloudModule.init) CloudModule.init();
    }
}, 500);