const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ==================== 常量与名称映射 ====================
const stageNames = { collect: '素材采集', editor: '热点初筛', research: '事实素材', opinion: '网友讨论', benchmark: '对标拆解', angles: '角度与标题', write: '正文生产', review: '成稿检查' };
const platformNames = { toutiao: '今日头条', penguin: '企鹅号', baijiahao: '百家号', weitoutiao: '微头条', video60: '60秒口播' };

const videoStageNames = {
  ingest: '原片入库',
  separate: 'Demucs人声剥离',
  transcribe: 'Whisper时间戳',
  script: '中文文案重构',
  synthesize: 'TTS语音合成',
  mix: '伴奏母带混音',
  render: '成片与剪映草稿'
};

const videoVoices = {
  'zh-CN-YunxiNeural': '云希（热血解说·推荐）',
  'zh-CN-XiaoxiaoNeural': '晓晓（知性女声）',
  'zh-CN-YunjianNeural': '云健（纪录片·沉稳）',
  'zh-CN-liaoning-XiaobeiNeural': '东北老铁（幽默接地气）'
};

// ==================== 全局状态 ====================
let token = '';
let state = { topics: [], video_projects: [], jobs: [] };
let currentMode = 'portal'; // 'portal' | 'article' | 'video'

// 图文状态
let selected = null;
let detail = null;
let tab = 'collect';

// 视频状态
let selectedVideo = null;
let videoDetail = null;
let videoTab = 'ingest';

let refreshing = false;
let lastRender = '';
let lastVideoRender = '';
let topicsRender = '';
let videosRender = '';
let toastTimer;

// ==================== 工具函数 ====================
const time = v => v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '未知';

function toast(text) {
  $('#toast').textContent = text;
  $('#toast').style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').style.display = 'none', 6500);
}

async function api(path, args) {
  const r = await fetch(path, args === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hotdesk-Token': token },
    body: JSON.stringify(args)
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

const tool = (name, args = {}, background = false) => api(`/api/tool/${name}${background ? '?background=1' : ''}`, args);

function modal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  if (!$('#modal').open) $('#modal').showModal();
}
$('#close-modal').onclick = () => $('#modal').close();

const currentArtifact = s => detail?.artifacts.find(a => a.stage === s && a.valid);

function link(url, label) {
  try {
    if (!['https:', 'http:'].includes(new URL(url).protocol)) return esc(label);
    return `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>`;
  } catch {
    return esc(label);
  }
}

function guard(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      toast(e.message);
    }
  };
}

// ==================== 模式切换与双轨门户 ====================
function setMode(mode) {
  currentMode = mode;
  if (mode === 'article') {
    $('#btn-mode-article').classList.add('active');
    $('#btn-mode-video').classList.remove('active');
    $('#aside-article').style.display = 'block';
    $('#aside-video').style.display = 'none';
    renderTopics();
    if (selected) {
      renderDetail();
    } else {
      renderArticleWelcome();
    }
  } else if (mode === 'video') {
    $('#btn-mode-video').classList.add('active');
    $('#btn-mode-article').classList.remove('active');
    $('#aside-article').style.display = 'none';
    $('#aside-video').style.display = 'block';
    renderVideoProjects();
    if (selectedVideo) {
      renderVideoDetail();
    } else {
      renderVideoWelcome();
    }
  } else {
    $('#btn-mode-article').classList.remove('active');
    $('#btn-mode-video').classList.remove('active');
    $('#aside-article').style.display = 'none';
    $('#aside-video').style.display = 'none';
    renderPortalWelcome();
  }
}

$('#btn-mode-article').onclick = () => setMode('article');
$('#btn-mode-video').onclick = () => setMode('video');
$('.logo').onclick = () => setMode('portal');

function renderPortalWelcome() {
  $('#workspace').innerHTML = `
    <div class="portal-welcome">
      <span class="eyebrow">HOTDESK CREATIVE SUITE / 双轨创作中枢</span>
      <h1>自媒体双引擎 · 创作工坊</h1>
      <p class="muted">专为高品质内容创作者与自媒体团队打造。纸质图文与短视频汉化二创双轨并行，无缝协同本地 AI 与外部 Agent。</p>
      <div class="portal-cards">
        <div class="portal-card" id="card-enter-article">
          <div class="portal-icon">📝</div>
          <span class="badge-tech">深度图文引擎</span>
          <h2>纸质 / 图文文章创作</h2>
          <p class="portal-desc">聚焦全网热点捕捉、多源事实交叉验证与深度观点拆解。一键生成今日头条、百家号、企鹅号三平台差异化成稿与配图交付包。</p>
          <ul class="portal-flow">
            <li>✦ 全网多平台热搜实时雷达</li>
            <li>✦ 事实证据链与网友争议分析</li>
            <li>✦ 爆款标题、差异化读者价值切入</li>
            <li>✦ 三平台专属成稿与一键打包</li>
          </ul>
          <button id="btn-portal-article">进入图文工坊 →</button>
        </div>

        <div class="portal-card highlight" id="card-enter-video">
          <div class="portal-icon">🎬</div>
          <span class="badge-tech">短视频二创工业流</span>
          <h2>短视频二创工坊</h2>
          <p class="portal-desc">专攻海外高质量科技/演讲/游戏视频汉化二创。原生 Demucs 人声剥离保留纯净环境音，Whisper 精准时间戳，自适应微加速语音，-14.8 LUFS 工业级母带，剪映 4 轨直出。</p>
          <ul class="portal-flow">
            <li>✦ 原生 Demucs v4 人声彻底剥离</li>
            <li>✦ Faster-Whisper 字幕级时间戳对齐</li>
            <li>✦ 中文网感文案重构与双语对照</li>
            <li>✦ Edge-TTS 自适应微加速与母带混音</li>
            <li>✦ 剪映 Pro 4 轨道工程草稿一键导出</li>
          </ul>
          <button id="btn-portal-video">进入二创工坊 →</button>
        </div>
      </div>
    </div>`;

  $('#btn-portal-article').onclick = () => setMode('article');
  $('#card-enter-article').onclick = (e) => { if (e.target.tagName !== 'BUTTON') setMode('article'); };
  $('#btn-portal-video').onclick = () => setMode('video');
  $('#card-enter-video').onclick = (e) => { if (e.target.tagName !== 'BUTTON') setMode('video'); };
}

function renderArticleWelcome() {
  $('#workspace').innerHTML = `
    <div class="welcome">
      <span class="eyebrow">HOTDESK / 纸质图文创作</span>
      <h1>热点雷达与图文流水线</h1>
      <p class="muted">先从左侧选择热榜来源并点击「发现热点」，或直接在左侧输入新选题开启全流程。</p>
      <div class="intro-cards">
        <div>
          <h3>全网实时热搜</h3>
          <p>支持百度、B站、贴吧、微博、抖音、知乎等全网多平台榜单，自动聚合与交叉研判。</p>
        </div>
        <div>
          <h3>事实查证与观点拆解</h3>
          <p>杜绝空洞编造，基于客观真实素材提取证据链，剖析受众痛点与爆款切入点。</p>
        </div>
        <div>
          <h3>三平台成稿交付</h3>
          <p>头条、百家号、企鹅号定制化长文排版，一键打包标题、纯正文与精选配图。</p>
        </div>
      </div>
    </div>`;
}

function renderVideoWelcome() {
  $('#workspace').innerHTML = `
    <div class="welcome">
      <span class="eyebrow">HOTDESK / 短视频二创工坊</span>
      <h1>海外短视频汉化二创工业流水线</h1>
      <p class="muted">消灭原声老外发音 · 提纯原生环境背景音 · 中文网感重构 · 剪映 Pro 4 轨道直出</p>
      <div class="intro-cards">
        <div>
          <h3>1. Demucs 深度剥离</h3>
          <p>彻底分离老外人声与原片背景音/音效，保留最纯净的原声现场感，彻底杜绝声音混成一团。</p>
        </div>
        <div>
          <h3>2. Whisper 时间戳与文案</h3>
          <p>毫秒级逐句对齐原片节奏，重构符合国内短视频受众的高网感中文文案与痛点钩子。</p>
        </div>
        <div>
          <h3>3. 母带混音与剪映工程</h3>
          <p>自适应微加速咬合时间轴，-14.8 LUFS 工业级压限，自动生成剪映电脑版 4 轨独立草稿！</p>
        </div>
      </div>
      <div class="panel spacer">
        <h3>快速开启新视频二创</h3>
        <p class="muted">在左侧侧边栏输入项目名称与本地 MP4 绝对路径（或视频源链接），点击「＋ 创建」即可开启。</p>
      </div>
    </div>`;
}

// ==================== 1. 图文创作模块 ====================
function renderTopics() {
  const filter = ($('#filter')?.value || '').toLowerCase();
  $('#topic-count').textContent = state.topics.length;
  const signature = JSON.stringify([state.topics, selected, filter]);
  if (signature === topicsRender) return;
  topicsRender = signature;
  $('#topics').innerHTML = state.topics.filter(t => t.title.toLowerCase().includes(filter)).map(t => `
    <button class="topic ${t.id === selected ? 'active' : ''}" data-topic="${esc(t.id)}">
      <div class="topic-title">${esc(t.title)}</div>
      <div class="topic-meta">
        <span class="grade ${t.grade ? '' : 'unknown'}">${esc(t.grade || '待初筛')}</span>
        <span>${t.platform_count} 个平台</span>
        <span>${t.source_count} 份素材</span>
        <span>${esc(stageNames[t.next] || ({ done: '待人工确认', paused: '已暂停' }[t.next]))}</span>
      </div>
    </button>`).join('') || '<div class="empty">还没有热点。选择一个榜单，点击「发现热点」。</div>';
  document.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => openTopic(b.dataset.topic));
}

async function openTopic(id) {
  selected = id;
  detail = await api(`/api/topic/${id}`);
  tab = stageNames[detail.next] ? detail.next : 'write';
  lastRender = '';
  renderTopics();
  renderDetail();
}

function renderDetail() {
  if (!detail) return;
  const d = detail, ed = currentArtifact('editor')?.content;
  const facts = currentArtifact('research')?.content.facts;
  const claim = state.claims?.find(c => c.topic_id === d.id);
  $('#workspace').innerHTML = `
    <span class="eyebrow">TOPIC / ${esc(d.id)}</span>
    <h1 class="topic-heading">${esc(d.title)}</h1>
    <div class="muted">首次发现 ${esc(time(d.created_at))} · ${d.sources.length} 份素材 · 数据修订 ${d.revision}</div>
    <div class="actions spacer">
      <button id="task-button">${state.model_configured ? '自动推进工序' : '交给 Agent 继续'}</button>
      <button id="pause" class="quiet">${d.paused ? '继续任务' : '暂停任务'}</button>
      <button id="merge" class="quiet">合并同一事件</button>
      <button id="export" class="quiet" ${currentArtifact('write') ? '' : 'disabled'}>导出审核稿</button>
      <button id="approve" class="quiet" ${currentArtifact('review')?.content.verdict === 'pass' ? '' : 'disabled'}>${d.approved_artifact ? '已人工确认' : '人工确认成稿'}</button>
    </div>
    <div class="metrics">
      <div class="metric"><span>推荐等级</span><b>${esc(ed?.grade || '待初筛')}</b><small>${esc(ed?.recommendation || '尚无 AI 判断')}</small></div>
      <div class="metric"><span>榜单变化</span><b>${d.movements.length ? esc(d.movements.map(m => `${m.delta > 0 ? '↑' : m.delta < 0 ? '↓' : '→'}${Math.abs(m.delta)}`).join(' / ')) : '待积累'}</b><small>${d.movements.length ? '同平台已观测名次变化' : '需要连续榜单快照'}</small></div>
      <div class="metric"><span>跨平台数</span><b>${d.platform_count}</b><small>观察到的传播平台</small></div>
      <div class="metric"><span>争议度 / 饱和度</span><b>${esc(ed?.metrics.controversy.score ?? '—')} / ${esc(ed?.metrics.saturation.score ?? '—')}</b><small>样本判断，非全网统计</small></div>
      <div class="metric"><span>事实素材</span><b>${facts ? facts.filter(f => f.status === 'confirmed').length : '—'}</b><small>${facts ? '条有证据支持的主张' : '尚未查证'}</small></div>
    </div>
    ${ed ? `<div class="note">${esc(ed.reason)}</div>` : ''}
    ${claim ? `<p class="progress-text">${esc(claim.actor)} 正在处理 ${esc(stageNames[claim.stage])} · 租约至 ${esc(time(claim.expires_at))}</p>` : ''}
    <div class="steps">
      ${Object.entries(stageNames).map(([s, n]) => {
        const complete = s === 'collect' ? d.sources.some(x => x.kind !== 'hotlist') : Boolean(currentArtifact(s));
        return `<button class="step ${complete ? 'complete' : ''} ${d.next === s ? 'current' : ''} ${tab === s ? 'selected' : ''}" data-stage="${s}">${n}<span>${complete ? '已有结果' : d.next === s ? '等待处理' : '未开始'}</span></button>`;
      }).join('')}
    </div>
    <div class="tabs">
      <button id="tab-events" class="quiet">过程与版本</button>
      <button id="tab-sources" class="quiet">全部素材 / ${d.sources.length}</button>
    </div>
    <div class="panel" id="panel"></div>`;

  document.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => { tab = b.dataset.stage; renderDetail(); });
  $('#tab-events').onclick = () => { tab = 'history'; renderPanel(); };
  $('#tab-sources').onclick = () => { tab = 'sources'; renderPanel(); };
  $('#task-button').onclick = guard(async () => {
    if (state.model_configured) {
      await api('/api/generate', { topic_id: selected });
      toast('已开始推进；请看运行记录');
      await refresh();
    } else showTask();
  });
  $('#pause').onclick = guard(async () => { await api('/api/pause', { topic_id: selected, paused: !d.paused }); lastRender = ''; await refresh(); });
  $('#export').onclick = () => { window.location.href = `/api/export/${selected}`; };

  const packButton = document.createElement('button');
  packButton.className = 'quiet';
  packButton.id = 'publish-pack';
  packButton.textContent = '交付包 / 标题正文与图片';
  packButton.disabled = !currentArtifact('write');
  $('#export').after(packButton);

  packButton.onclick = guard(async () => {
    const pack = await tool('export_publish_pack', { topic_id: selected });
    modal('三平台交付包', `
      <p class="note ${pack.manifest.ready_for_handoff ? '' : 'warning'}">${pack.manifest.ready_for_handoff ? '稿件与配图齐备，等待人工确认' : '交付包待补全'} · 内容未发布</p>
      ${pack.manifest.warnings.map(w => `<p>${esc(w)}</p>`).join('')}
      <a href="${esc(pack.download_url)}" download>下载 ZIP：标题、纯正文、图片与插图说明</a>
      <p class="muted">解压后按平台复制标题和正文；所有配图集中在“图片”文件夹，按各平台的插图说明上传。</p>
      ${pack.upload_images ? `<p>本次上传图片：<code>${esc(pack.upload_images.directory)}</code></p><button class="quiet" id="copy-image-directory">复制图片文件夹路径</button><p class="muted">下一轮完整素材交付后，这个文件夹会自动换成本轮图片。</p>` : ''}
      ${pack.upload_warning ? `<p class="note warning">${esc(pack.upload_warning)}</p>` : ''}
      ${pack.upload_images?.cleanup_warning ? `<p class="note warning">${esc(pack.upload_images.cleanup_warning)}</p>` : ''}
      ${pack.manifest.platforms.map((p, i) => `
        <div class="draft">
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.title)}</p>
          <button class="quiet" data-copy-title="${i}">复制标题</button>
          <button class="quiet" data-copy-body="${i}">复制纯正文</button>
          <p>${p.images.length} 张配图</p>
          ${p.images.map(image => `<a href="/api/images/${esc(selected)}/${esc(image.id)}" target="_blank">${esc(image.caption)}</a>`).join(' · ')}
        </div>`).join('')}`);

    if (pack.upload_images) $('#copy-image-directory').onclick = guard(async () => {
      await navigator.clipboard.writeText(pack.upload_images.directory);
      toast('图片文件夹路径已复制，可粘贴到上传窗口');
    });
    const copyStatus = document.createElement('p');
    copyStatus.setAttribute('role', 'status');
    copyStatus.id = 'pack-copy-status';
    $('#modal-body').prepend(copyStatus);
    async function copyPack(value, label) {
      try {
        await navigator.clipboard.writeText(value);
        copyStatus.textContent = `${label}已复制`;
      } catch {
        copyStatus.textContent = '复制失败，请下载 ZIP 后打开对应文本文件复制';
      }
    }
    document.querySelectorAll('[data-copy-title]').forEach(b => b.onclick = () => copyPack(pack.manifest.platforms[Number(b.dataset.copyTitle)].title, '标题'));
    document.querySelectorAll('[data-copy-body]').forEach(b => b.onclick = () => copyPack(pack.manifest.platforms[Number(b.dataset.copyBody)].body, '纯正文'));
  });

  $('#approve').onclick = guard(async () => {
    await api('/api/approve', { topic_id: selected });
    toast('已记录人工确认，内容仍未发布');
    lastRender = '';
    await refresh();
  });

  $('#merge').onclick = () => {
    modal('合并同一事件', `
      <p class="note">请确认属于同一个具体事件。素材合并后重新分析，原话题和旧结果保留归档。</p>
      <select id="merge-target" class="full">
        ${state.topics.filter(t => t.id !== selected).map(t => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')}
      </select>
      <button id="merge-go" class="spacer">合并到所选话题</button>`);
    $('#merge-go').onclick = guard(async () => {
      const to = $('#merge-target').value;
      if (!to) throw new Error('没有其他话题');
      await tool('merge_topics', { from: selected, to });
      $('#modal').close();
      await openTopic(to);
      await refresh();
    });
  };

  renderPanel();
}

function sourceHtml(s) {
  return `<div class="source-card">
    <span class="label">${esc(s.platform)}</span><span class="label">${esc(s.kind)}</span><small>${esc(s.id)}</small>
    <h3 class="spacer">${esc(s.title)}</h3>
    <p>${esc(s.body || '仅有榜单标题，尚无正文')}</p>
    ${link(s.url, '打开原文')} ${s.raw_hash ? ` · <a href="/api/raw/${esc(s.raw_hash)}" target="_blank">原始快照</a>` : ''}
    <div class="muted">采集 ${esc(time(s.observed_at))} · 发布 ${esc(time(s.published_at))}</div>
  </div>`;
}

function renderPanel() {
  const panel = $('#panel');
  if (!panel) return;
  if (tab === 'history') {
    panel.innerHTML = `<h3>版本档案</h3>${detail.artifacts.map(a => `
      <details><summary>${esc(stageNames[a.stage])} v${a.version} · ${a.valid ? '当前有效' : '已过期，保留可查'} · ${esc(a.actor)}</summary><pre>${esc(JSON.stringify(a.content, null, 2))}</pre></details>`).join('') || '<p class="muted">尚无工序结果</p>'}
      <h3 class="spacer">运行事件</h3>${detail.events.map(e => `
      <div class="event"><b>${esc(e.kind)}</b> <small>${esc(time(e.at))}</small><pre>${esc(JSON.stringify(e.payload, null, 2))}</pre></div>`).join('')}`;
    return;
  }
  if (tab === 'sources') {
    panel.innerHTML = `<h3>全部素材</h3>${detail.sources.map(sourceHtml).join('')}`;
    return;
  }
  if (tab === 'collect') {
    panel.innerHTML = `
      <div class="panel-title"><h2>素材采集</h2><span class="pill">公开页面 + 可见内容导入</span></div>
      <p class="muted">选择相关帖子再采集。B站采集视频简介和热门评论；贴吧采集可见楼层。小红书公开页可能仅有正文，登录页评论可由浏览器 Agent 导入。</p>
      <div class="row"><input id="collect-url" placeholder="粘贴帖子、视频或原始报道链接" aria-label="素材链接"><button id="collect-go">采集链接</button></div>
      <div class="row">
        <select id="search-platform">
          <option value="bilibili">哔哩哔哩</option>
          <option value="tieba">百度贴吧</option>
          <option value="xiaohongshu">小红书</option>
          <option value="reddit">Reddit</option>
        </select>
        <input id="search-query" value="${esc(detail.title)}" aria-label="检索关键词">
        <button id="search-go" class="quiet">查找帖子</button>
      </div>
      <div id="search-results"></div>
      <button id="import" class="quiet spacer">导入可见正文 / 评论</button>
      <h3 class="spacer">已入库素材</h3>${detail.sources.map(sourceHtml).join('') || '<p class="empty">暂无素材</p>'}`;

    $('#collect-go').onclick = guard(async () => {
      await tool('collect_url', { topic_id: selected, url: $('#collect-url').value }, true);
      toast('采集已开始，结果会显示在这里');
      await refresh();
    });
    $('#search-go').onclick = guard(async () => {
      const btn = $('#search-go');
      btn.disabled = true;
      try {
        const r = await tool('search_posts', { platform: $('#search-platform').value, query: $('#search-query').value });
        $('#search-results').innerHTML = `<p class="note">${esc(r.message)}</p>${r.search_url ? link(r.search_url, '在浏览器搜索小红书') : ''}${r.items.map(i => `
          <div class="search-result">${link(i.url, i.title)}<button class="quiet" data-collect="${esc(i.url)}">采集</button></div>`).join('')}`;
        document.querySelectorAll('[data-collect]').forEach(b => b.onclick = guard(async () => {
          await tool('collect_url', { topic_id: selected, url: b.dataset.collect }, true);
          toast('已开始采集');
        }));
      } finally {
        btn.disabled = false;
      }
    });
    $('#import').onclick = showImport;
    return;
  }

  const artifact = currentArtifact(tab);
  panel.innerHTML = `<div class="panel-title"><h2>${esc(stageNames[tab])}</h2><div class="actions"><button id="task-context" class="quiet">查看任务 / 交给 Agent</button>${artifact ? '<button id="edit-result" class="quiet">编辑结果</button><button id="rerun" class="quiet">重跑本步</button>' : ''}</div></div><div id="artifact-content"></div>`;
  $('#task-context').onclick = guard(() => showTask(tab));
  if (!artifact) {
    $('#artifact-content').innerHTML = `<div class="empty">这一步还没有结果。${detail.next === tab ? '资料已就绪，可以由 Agent 领取。' : '先完成前面的工序。'}<br>不会用占位文字伪装成已完成的 AI 分析。</div>`;
    return;
  }
  $('#rerun').onclick = guard(async () => {
    await tool('rerun_stage', { topic_id: selected, stage: tab });
    toast('本步与下游已标记待重做，历史版本仍保留');
    lastRender = '';
    await refresh();
  });
  $('#edit-result').onclick = () => editResult(artifact);
  const c = artifact.content, view = $('#artifact-content');
  if (tab === 'write') {
    view.innerHTML = c.drafts.map(d => `
      <div class="draft">
        <span class="label">${esc(platformNames[d.platform])}</span>
        <h3>${esc(d.title)}</h3>
        ${d.blocks.map(b => `<p>${esc(b.text)}</p><small>${esc(b.kind)} · ${esc(b.refs.join(' / '))}</small>`).join('')}
        ${(d.increments || []).length ? `<h4 class="spacer">信息增量</h4>${d.increments.map(i => `<div class="listline">${esc({ background: '来龙去脉', data: '数据', comparison: '对比', impact: '和读者的关系', counterintuitive: '反常识' }[i.type] || i.type)} · 第${i.block_index + 1}段：${esc(i.note)}</div>`).join('')}` : ''}
      </div>`).join('');
  } else if (tab === 'angles') {
    view.innerHTML = c.angles.map(a => `
      <div class="angle-card">
        <span class="label">${esc(a.id)}</span>
        <h3 class="spacer">${esc(a.name)}</h3>
        <p>${esc(a.hook)}</p>
        <p class="muted">读者价值：${esc(a.audience_value)}</p>
        ${a.titles.map(t => `<div class="listline">${esc(t)}</div>`).join('')}
        <button class="quiet spacer" data-angle="${esc(a.id)}">${detail.selected_angle === a.id ? '已选用' : '选用这个角度'}</button>
      </div>`).join('');
    document.querySelectorAll('[data-angle]').forEach(b => b.onclick = guard(async () => {
      await tool('select_angle', { topic_id: selected, angle_id: b.dataset.angle });
      toast('已选定角度，下游写作需更新');
      lastRender = '';
      await refresh();
    }));
  } else if (tab === 'research') {
    view.innerHTML = c.facts.map(f => `
      <div class="source-card">
        <span class="label">${esc(f.id)} · ${esc(f.status)}</span>
        <p><b>${esc(f.claim)}</b></p>
        <p class="muted">${esc(f.reason)}</p>
        ${f.evidence.map(e => `<blockquote>${esc(e.quote)}<br><small>${esc(e.source_id)}</small></blockquote>`).join('')}
      </div>`).join('') + `<div class="note">资料缺口：${esc(c.gaps.join('；') || '本轮未记录')}<br>截至 ${esc(c.as_of)}</div>`;
  } else if (tab === 'benchmark') {
    view.innerHTML = c.status === 'none_found' ? `<div class="note warning">没找到对标文章。试过：${esc(c.searched.join('、'))}</div>` : `
      ${c.items.map(i => `
        <div class="source-card">
          <span class="label">${i.tier === 'authority' ? '权威' : '爆款'} · ${esc(i.source_id)}</span>
          <p><b>${esc(i.angle)}</b></p>
          <p class="muted">结构：${esc(i.structure)}<br>标题套路：${esc(i.title_pattern)}<br>钩子：${esc(i.hook)}</p>
          <p>可学：${esc(i.strengths.join('；'))}</p>
          <p>漏掉：${esc(i.missed.join('；'))}</p>
        </div>`).join('')}
      <h3 class="spacer">大家都写了（不重复）</h3>${c.consensus.map(x => `<div class="listline">${esc(x)}</div>`).join('')}
      <h3 class="spacer">差异化切入点</h3>${c.gaps.map(g => `<div class="listline"><b>${esc(g.id)}</b> ${esc(g.text)}<br><small>${esc(g.why)}</small></div>`).join('')}`;
  } else if (tab === 'opinion') {
    view.innerHTML = `<div class="note">${esc(c.sample_note)}<br>${esc(c.limitations.join('；'))}</div>
      ${Object.entries({ focus: '讨论焦点', support: '支持观点', oppose: '反对观点', questions: '大家在问', platform_differences: '平台差异' }).map(([key, name]) => `
        <h3 class="spacer">${name}</h3>
        ${c[key].map(p => `<div class="listline">${esc(p.text)}<br><small>${esc(p.id)} · ${esc(p.source_ids.join(', '))}</small></div>`).join('') || '<p class="muted">本次样本未提取</p>'}`).join('')}
      <div class="chips">${c.keywords.map(k => `<span class="label">${esc(k)}</span>`).join('')}</div>`;
  } else if (tab === 'review') {
    view.innerHTML = `
      <div class="note ${c.verdict === 'pass' ? '' : 'warning'}">${esc(c.verdict === 'pass' ? '检查通过，等待人工确认' : c.verdict === 'revise' ? '需要修改' : '暂不可成稿')}：${esc(c.summary)}</div>
      ${c.issues.map(i => `<div class="listline">[${esc(i.severity)}] ${esc(i.platform)} · ${esc(i.text)}</div>`).join('')}`;
  } else {
    view.innerHTML = `<p>${esc(c.reason)}</p>${Object.entries(c.metrics).map(([name, m]) => `<div class="listline"><b>${esc(name)} · ${esc(m.score ?? '未知')}</b> / ${esc(m.confidence)}<br>${esc(m.reason)}</div>`).join('')}`;
  }
  view.insertAdjacentHTML('beforeend', `<details><summary>结构化结果 / v${artifact.version} / ${esc(artifact.actor)}</summary><pre>${esc(JSON.stringify(c, null, 2))}</pre></details>`);
}

function showImport() {
  modal('导入实际可见的素材', `
    <p class="muted">每行评论保存为独立样本。请保留原链接，不要填写模型编造的网友评论。</p>
    <div class="row">
      <select id="import-platform"><option value="xiaohongshu">小红书</option><option value="tieba">贴吧</option><option value="bilibili">B站</option><option value="reddit">Reddit</option><option value="web">公开 Web</option></select>
      <select id="import-kind"><option value="post">帖子正文</option><option value="comment">评论（每行一条）</option><option value="article">事实来源 / 报道</option></select>
    </div>
    <input class="full" id="import-url" placeholder="原文 URL">
    <label>标题 / 采样说明</label><input class="full" id="import-title" placeholder="例如：某帖默认排序前 10 条评论">
    <label>正文或评论</label><textarea id="import-body" rows="8"></textarea>
    <button id="import-go" class="spacer">保存素材</button>`);
  $('#import-go').onclick = guard(async () => {
    const kind = $('#import-kind').value, body = $('#import-body').value;
    if (!body.trim()) throw new Error('请填写实际素材');
    const texts = kind === 'comment' ? body.split('\n').filter(t => t.trim()) : [body];
    await tool('import_sources', { topic_id: selected, sources: texts.map(body => ({ platform: $('#import-platform').value, kind, title: $('#import-title').value, url: $('#import-url').value, body, metadata: { sample: '用户手动导入' } })) });
    $('#modal').close();
    lastRender = '';
    await refresh();
    toast('已保存，受影响的分析需重新生成');
  });
}

async function showTask(stage) {
  const actual = stage || detail.next;
  if (!stageNames[actual] || actual === 'collect') return toast('请先采集至少一份正文；完成后即可交给 Agent。');
  const task = await tool('get_task', { topic_id: selected, stage: actual });
  modal('交给 Agent · ' + stageNames[actual], `
    <p class="note">在已接入 Hotdesk 的 Agent 中发送下面的任务。各 Agent 共用这个看板；当前页面会自动刷新。</p>
    <pre id="agent-prompt">${esc(`使用 hotdesk 工具处理话题 ${selected}，先读项目 skills/hotdesk/SKILL.md。按默认读者利益打法连续完成三平台稿件、实际核对并 collect_image 保存配图，完成图文审稿后 export_publish_pack。缺资料先补资料；ready_for_handoff 为 true 才交付完整包；不得编造评论或发布。`)}</pre>
    <button id="copy-task" class="quiet">复制任务指令</button>
    <details><summary>本步完整输入与 JSON 输出范例</summary><pre>${esc(JSON.stringify(task, null, 2))}</pre></details>`);
  $('#copy-task').onclick = guard(async () => {
    await navigator.clipboard.writeText($('#agent-prompt').textContent);
    toast('已复制');
  });
}

function editResult(artifact) {
  modal('编辑工序结果', `
    <p class="note warning">保存会让下游旧结果失效。请保留 JSON 字段、事实和评论引用编号。历史版本不会删除。</p>
    <textarea id="edit-json" class="edit-area">${esc(JSON.stringify(artifact.content, null, 2))}</textarea>
    <button id="save-edit" class="spacer">保存为新版本</button>`);
  $('#save-edit').onclick = guard(async () => {
    const content = JSON.parse($('#edit-json').value);
    await api('/api/edit', { topic_id: selected, stage: artifact.stage, artifact_id: artifact.id, content });
    $('#modal').close();
    lastRender = '';
    await refresh();
  });
}

// ==================== 2. 短视频二创模块 ====================
function renderVideoProjects() {
  const list = state.video_projects || [];
  const filter = ($('#filter-video')?.value || '').toLowerCase();
  $('#video-count').textContent = list.length;
  const signature = JSON.stringify([list, selectedVideo, filter]);
  if (signature === videosRender) return;
  videosRender = signature;

  $('#video-projects').innerHTML = list.filter(p => p.title.toLowerCase().includes(filter)).map(p => `
    <button class="topic ${p.id === selectedVideo ? 'active' : ''}" data-video="${esc(p.id)}">
      <div class="topic-title">${esc(p.title)}</div>
      <div class="topic-meta">
        <span class="grade ${p.stage === 'completed' ? '' : 'unknown'}">${esc(videoStageNames[p.stage] || p.stage)}</span>
        <span>${p.duration ? (p.duration.toFixed(1) + 's') : '待检测'}</span>
        <span>${esc(time(p.created_at))}</span>
      </div>
    </button>`).join('') || '<div class="empty">暂无二创项目。在上方填写名称与本地 MP4 绝对路径创建。</div>';

  document.querySelectorAll('[data-video]').forEach(b => b.onclick = () => openVideoProject(b.dataset.video));
}

async function openVideoProject(id) {
  selectedVideo = id;
  videoDetail = await api(`/api/video_project/${id}`);
  videoTab = videoDetail.stage || 'ingest';
  if (!videoStageNames[videoTab]) videoTab = 'ingest';
  lastVideoRender = '';
  renderVideoProjects();
  renderVideoDetail();
}

function renderVideoDetail() {
  if (!videoDetail) return;
  const p = videoDetail;
  const meta = p.data || {};
  const isComplete = (s) => {
    const order = ['ingest', 'separate', 'transcribe', 'script', 'synthesize', 'mix', 'render'];
    const idx = order.indexOf(s);
    if (p.stage === 'completed') return true;
    if (s === 'ingest') return Boolean(p.video_path);
    if (s === 'separate') return Boolean(meta.no_vocals_path);
    if (s === 'transcribe') return Boolean(meta.segments);
    if (s === 'script') return Boolean(meta.script_path);
    if (s === 'synthesize') return Boolean(meta.dub_track_path);
    if (s === 'mix') return Boolean(meta.mixed_audio_path);
    if (s === 'render') return Boolean(meta.master_mp4_path);
    return order.indexOf(p.stage) > idx;
  };

  $('#workspace').innerHTML = `
    <span class="eyebrow">VIDEO CREATION / ${esc(p.id)}</span>
    <h1 class="topic-heading">${esc(p.title)}</h1>
    <div class="muted">原片源：${esc(p.source_url || p.video_path || '未提供')} · 分辨率：${p.width || 1920}x${p.height || 1080} · 时长：${p.duration ? (p.duration.toFixed(1) + 's') : '待检测'} · 路线 A（纯伴奏+全中文二创）</div>
    <div class="actions spacer">
      <button id="btn-video-autorun" class="quiet">⚡ 一键自动跑通</button>
      <button id="btn-video-agent" class="quiet">交给 Agent 二创</button>
      <button id="btn-video-draft" class="quiet" ${meta.jianying_draft_path ? '' : 'disabled'}>查看剪映草稿</button>
      ${meta.master_mp4_path ? `<a class="quiet button" style="text-decoration:none;display:inline-block;" href="/api/video_asset/${p.id}/master_1080p.mp4" download>下载成片 1080P</a>` : ''}
      <button id="btn-video-del" class="quiet danger">删除项目</button>
    </div>

    <!-- 7 步交互工序条 -->
    <div class="steps">
      ${Object.entries(videoStageNames).map(([s, n]) => {
        const comp = isComplete(s);
        const curr = p.stage === s || (p.stage === 'completed' && s === 'render');
        return `<button class="step ${comp ? 'complete' : ''} ${curr ? 'current' : ''} ${videoTab === s ? 'selected' : ''}" data-vstage="${s}">
          ${n}<span>${comp ? '已有结果' : curr ? '待推进' : '未开始'}</span>
        </button>`;
      }).join('')}
    </div>

    <div class="panel" id="video-panel"></div>`;

  document.querySelectorAll('[data-vstage]').forEach(b => b.onclick = () => {
    videoTab = b.dataset.vstage;
    renderVideoDetail();
  });

  $('#btn-video-autorun').onclick = guard(async () => {
    await autoRunVideo(p.id);
  });

  $('#btn-video-agent').onclick = () => showVideoAgentModal(p);

  $('#btn-video-draft').onclick = () => {
    modal('剪映 4 轨独立草稿工程', `
      <p class="note">项目已导出至剪映草稿目录，打开 Windows 剪映电脑版主页即可直接打开与精修！</p>
      <div class="listline"><b>草稿项目名：</b> <code>hotdesk_${esc(p.id)}</code></div>
      <div class="listline"><b>草稿工程绝对路径：</b><br><code>${esc(meta.jianying_draft_path || '生成中…')}</code></div>
      <p class="muted">剪映工程内包含独立 4 轨道：<br>1. 视频原画轨<br>2. 剥离后的无老外纯背景音效轨 (BGM/SFX)<br>3. 中文 TTS 语音配音轨 (已对齐节奏)<br>4. 智能解耦花字字幕轨</p>
      <button class="quiet spacer" id="copy-draft-path">复制工程路径</button>`);
    $('#copy-draft-path').onclick = guard(async () => {
      await navigator.clipboard.writeText(meta.jianying_draft_path || '');
      toast('草稿路径已复制');
    });
  };

  $('#btn-video-del').onclick = guard(async () => {
    if (!confirm(`确定要彻底删除视频项目「${p.title}」及其所有衍生音频视频缓存吗？`)) return;
    await tool('delete_video_project', { project_id: p.id });
    selectedVideo = null;
    videoDetail = null;
    toast('视频项目已删除');
    await refresh();
    setMode('video');
  });

  renderVideoPanel();
}

function renderVideoPanel() {
  const panel = $('#video-panel');
  if (!panel || !videoDetail) return;
  const p = videoDetail;
  const meta = p.data || {};

  // 1. 原片入库
  if (videoTab === 'ingest') {
    panel.innerHTML = `
      <div class="panel-title">
        <h2>原片视频源与规格探测</h2>
        <span class="badge-tech">1080P Probed</span>
      </div>
      <p class="muted">确认视频原画源。支持本地 MP4 绝对路径或网络链接抓取入库。</p>
      <div class="video-preview-box">
        <video class="video-player" controls preload="metadata" src="/api/video_asset/${p.id}/raw_video.mp4">
          您的浏览器不支持 HTML5 Video
        </video>
      </div>
      <div class="listline"><b>本地文件：</b> <code>${esc(p.video_path)}</code></div>
      <div class="listline"><b>规格数据：</b> 分辨率 ${p.width || 1920}x${p.height || 1080} · 时长 ${p.duration ? (p.duration.toFixed(1) + ' 秒') : '未知'}</div>
      <button class="spacer" id="btn-do-separate">执行 Demucs 人声彻底剥离 →</button>`;

    $('#btn-do-separate').onclick = guard(async () => {
      toast('正在启动 Demucs v4 分离人声与伴奏，可能需要几十秒，请查看底部运行记录…');
      await tool('separate_video_audio', { project_id: p.id }, true);
      await refresh();
    });
    return;
  }

  // 2. Demucs 人声剥离
  if (videoTab === 'separate') {
    panel.innerHTML = `
      <div class="panel-title">
        <h2>Demucs v4 伴奏与环境音提纯</h2>
        <span class="badge-tech">HTDemucs Two-Stems</span>
      </div>
      <div class="note">
        利用 Demucs v4 Hybrid Transformer 深度模型，从原始音频中彻底剥离老外人声，仅保留纯净的现场环境背景音与原声音乐。
      </div>
      <div class="audio-player-card spacer">
        <h3>🎵 提纯后的原声背景音 / 伴奏轨 (no_vocals.wav)</h3>
        <p class="muted">纯净的环境音效、游戏音效或背景乐，保留现场沉浸感：</p>
        <audio controls preload="metadata" src="/api/video_asset/${p.id}/no_vocals.wav"></audio>
      </div>
      <div class="audio-player-card">
        <h3>🗣️ 剥离出的老外英文原声 (vocals.wav)</h3>
        <p class="muted">已与背景乐分离，专供 Whisper 提取精准时间戳：</p>
        <audio controls preload="metadata" src="/api/video_asset/${p.id}/vocals.wav"></audio>
      </div>
      <button class="spacer" id="btn-do-transcribe">下一步：Whisper 毫秒级语音转录 →</button>`;

    $('#btn-do-transcribe').onclick = guard(async () => {
      toast('正在启动 Whisper 转录，请稍候…');
      await tool('transcribe_video_audio', { project_id: p.id }, true);
      await refresh();
    });
    return;
  }

  // 3. Whisper 时间戳
  if (videoTab === 'transcribe') {
    const segments = meta.segments || [];
    panel.innerHTML = `
      <div class="panel-title">
        <h2>Whisper 语音转录与时间戳</h2>
        <span class="badge-tech">${segments.length} Segments</span>
      </div>
      <div class="note">
        使用 Faster-Whisper 毫秒级提取原始英语对白，精准锚定每一句话的起止绝对时间戳。
      </div>
      ${segments.length ? `
        <table class="script-table">
          <thead>
            <tr><th style="width:120px;">时间轴</th><th>英文原句 (${segments.length} 句)</th></tr>
          </thead>
          <tbody>
            ${segments.map(s => `
              <tr>
                <td class="script-time">${s.start.toFixed(2)}s ~ ${s.end.toFixed(2)}s</td>
                <td>${esc(s.en_text)}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : '<p class="empty">尚未转录音频时间戳，请点击下方按钮启动。</p>'}
      <button class="spacer" id="btn-do-script">重构中文网感文案 →</button>`;

    $('#btn-do-script').onclick = () => {
      videoTab = 'script';
      renderVideoDetail();
    };
    return;
  }

  // 4. 中文文案重构 (双语对照与在线编辑)
  if (videoTab === 'script') {
    const segments = meta.segments || [];
    panel.innerHTML = `
      <div class="panel-title">
        <h2>中文网感文案重构 (双语剧本对照)</h2>
        <span class="badge-tech">Net-Sense Copywriting</span>
      </div>
      <div class="note">
        【2026 短视频网感铁律】：句式短促、信息密集、突出戏剧冲突与读者痛点。直接在表格中编辑修改配音台词，点击「保存文案修订」生效。
      </div>
      <div class="row spacer" style="align-items:center;">
        <label>选择 TTS 默认音色：</label>
        <select id="video-voice-select">
          ${Object.entries(videoVoices).map(([v, n]) => `<option value="${v}" ${p.voice === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <button id="btn-save-script" class="quiet">💾 保存文案修订</button>
      </div>

      <table class="script-table">
        <thead>
          <tr><th style="width:100px;">时间轴</th><th style="width:38%;">原片英文</th><th>中文汉化二创文案 (可直接编辑)</th></tr>
        </thead>
        <tbody>
          ${segments.map((s, idx) => `
            <tr>
              <td class="script-time">${s.start.toFixed(2)}s ~ ${s.end.toFixed(2)}s<br><small class="muted">${(s.end - s.start).toFixed(1)}s</small></td>
              <td style="color:#57685e;font-size:12px;">${esc(s.en_text)}</td>
              <td>
                <input class="script-zh-input" data-zh-idx="${idx}" value="${esc(s.zh_text || s.en_text)}" placeholder="输入通俗接地气的中文配音台词…">
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      <button class="spacer" id="btn-do-synth">执行 Edge-TTS 自适应微加速合成 →</button>`;

    $('#btn-save-script').onclick = guard(async () => {
      const inputs = document.querySelectorAll('[data-zh-idx]');
      const updated = [...segments];
      inputs.forEach(inp => {
        const i = Number(inp.dataset.zhIdx);
        if (updated[i]) updated[i].zh_text = inp.value.trim();
      });
      await tool('rewrite_video_script', { project_id: p.id, segments: updated });
      toast('文案修订已保存！');
      await refresh();
    });

    $('#btn-do-synth').onclick = guard(async () => {
      // 先保存文案
      const inputs = document.querySelectorAll('[data-zh-idx]');
      const updated = [...segments];
      inputs.forEach(inp => {
        const i = Number(inp.dataset.zhIdx);
        if (updated[i]) updated[i].zh_text = inp.value.trim();
      });
      await tool('rewrite_video_script', { project_id: p.id, segments: updated });
      const voice = $('#video-voice-select').value;
      toast(`正在使用 ${videoVoices[voice] || voice} 合成语音配音…`);
      await tool('synthesize_video_voiceover', { project_id: p.id, voice }, true);
      await refresh();
    });
    return;
  }

  // 5. TTS 语音合成
  if (videoTab === 'synthesize') {
    panel.innerHTML = `
      <div class="panel-title">
        <h2>Edge-TTS 自适应微加速配音轨</h2>
        <span class="badge-tech">Adaptive atempo</span>
      </div>
      <div class="note">
        系统根据原视频各句持续时间，采用 atempo 算法自动微加速或微缩，确保每一句中文配音精准咬合原片口型与画面节奏，无生硬断层。
      </div>
      <div class="audio-player-card spacer">
        <h3>🎙️ 完整中文配音轨 (full_dubbing_track.wav)</h3>
        <p class="muted">使用音色：${esc(videoVoices[p.voice] || p.voice || '默认云希')}</p>
        <audio controls preload="metadata" src="/api/video_asset/${p.id}/full_dubbing_track.wav"></audio>
      </div>
      <button class="spacer" id="btn-do-mix">执行 EBU R128 工业母带混音 →</button>`;

    $('#btn-do-mix').onclick = guard(async () => {
      toast('正在进行 -14.8 LUFS 动态压限工业混音…');
      await tool('mix_video_audio', { project_id: p.id }, true);
      await refresh();
    });
    return;
  }

  // 6. 伴奏母带混音
  if (videoTab === 'mix') {
    panel.innerHTML = `
      <div class="panel-title">
        <h2>工业级母带混音与响度平衡</h2>
        <span class="badge-tech">EBU R128 (-14.8 LUFS)</span>
      </div>
      <div class="note">
        【2026 工业混音标准】：原声伴奏衰减至 35% 避让人声，AI 中文配音提升至 135%，应用动态压限算法，母带总响度稳定在 -14.8 LUFS，彻底杜绝背景音轰隆喧宾夺主。
      </div>
      <div class="audio-player-card spacer">
        <h3>🎚️ 工业级母带成片音轨 (mixed_final_audio.wav)</h3>
        <p class="muted">人声清晰透亮，背景原声恰到好处：</p>
        <audio controls preload="metadata" src="/api/video_asset/${p.id}/mixed_final_audio.wav"></audio>
      </div>
      <button class="spacer" id="btn-do-render">最终合成：渲染 1080P 成片与导出剪映草稿 →</button>`;

    $('#btn-do-render').onclick = guard(async () => {
      toast('正在渲染 1080P 高清成片并构建剪映 4 轨草稿，请查看下方运行记录…');
      await tool('render_video_master', { project_id: p.id }, true);
      await refresh();
    });
    return;
  }

  // 7. 成片与剪映草稿
  if (videoTab === 'render') {
    panel.innerHTML = `
      <div class="panel-title">
        <h2>1080P 成片成稿与剪映 Pro 4 轨道工程</h2>
        <span class="badge-tech">Ready for Distribution</span>
      </div>
      <div class="note">
        二创完成！成片已嵌合高对比智能字幕；同时已生成剪映电脑版 4 轨道独立工程，可随时在剪映中二次微调。
      </div>

      <div class="video-preview-box spacer">
        <video class="video-player" controls preload="metadata" src="/api/video_asset/${p.id}/master_1080p.mp4">
          您的浏览器不支持 HTML5 Video
        </video>
      </div>

      <div class="actions spacer">
        <a class="button quiet" href="/api/video_asset/${p.id}/master_1080p.mp4" download="hotdesk_${p.id}_1080p.mp4">📥 下载 1080P 成片 MP4</a>
        <button id="btn-show-draft-info" class="quiet">🎬 查看剪映草稿工程详情</button>
      </div>

      <div class="panel spacer" style="background:#f8faf7;">
        <h3>剪映 Pro (CapCut) 4 轨道独立解耦特性</h3>
        <p class="muted">打开 Windows 剪映电脑版，直接点击 <code>hotdesk_${esc(p.id)}</code> 草稿：</p>
        <ul>
          <li><strong>轨道 1 (视频原画)</strong>：原始 1080P 画面保持绝对清晰无损。</li>
          <li><strong>轨道 2 (纯净伴奏)</strong>：Demucs 提取的现场环境与音效，音量适度。</li>
          <li><strong>轨道 3 (中文配音)</strong>：自适应微加速的 Edge-TTS 高音质中文解说。</li>
          <li><strong>轨道 4 (花字字幕)</strong>：毫秒级时间戳对应的中文文本，字体与样式自由修改。</li>
        </ul>
      </div>`;

    $('#btn-show-draft-info').onclick = () => {
      $('#btn-video-draft').click();
    };
  }
}

// 自动跑通全流程辅助
async function autoRunVideo(id) {
  toast('开始自动跑通二创流水线…');
  let p = await api(`/api/video_project/${id}`);

  // 1. Demucs
  if (!p.data?.no_vocals_path) {
    toast('【第 1/5 步】正在执行 Demucs 人声剥离…');
    await tool('separate_video_audio', { project_id: id });
    p = await api(`/api/video_project/${id}`);
  }

  // 2. Whisper
  if (!p.data?.segments) {
    toast('【第 2/5 步】正在执行 Faster-Whisper 时间戳转录…');
    await tool('transcribe_video_audio', { project_id: id });
    p = await api(`/api/video_project/${id}`);
  }

  // 3. Script
  if (!p.data?.script_path) {
    toast('【第 3/5 步】正在初始化中文二创剧本文案…');
    const segs = p.data?.segments || [];
    const withZh = segs.map(s => ({ ...s, zh_text: s.zh_text || s.en_text }));
    await tool('rewrite_video_script', { project_id: id, segments: withZh });
    p = await api(`/api/video_project/${id}`);
  }

  // 4. TTS
  if (!p.data?.dub_track_path) {
    toast('【第 4/5 步】正在执行 Edge-TTS 语音合成与自适应微加速…');
    await tool('synthesize_video_voiceover', { project_id: id, voice: p.voice || 'zh-CN-YunxiNeural' });
    p = await api(`/api/video_project/${id}`);
  }

  // 5. Mix
  if (!p.data?.mixed_audio_path) {
    toast('【第 5/5 步】正在执行 -14.8 LUFS 动态压限工业母带混音…');
    await tool('mix_video_audio', { project_id: id });
    p = await api(`/api/video_project/${id}`);
  }

  // 6. Render
  if (!p.data?.master_mp4_path) {
    toast('【最终渲染】正在渲染 1080P 成片并导出剪映 4 轨工程草稿…');
    await tool('render_video_master', { project_id: id });
  }

  toast('🎉 全流程自动二创完成！');
  await refresh();
  await openVideoProject(id);
}

function showVideoAgentModal(p) {
  modal('交给外部 Agent 执行 MCP 二创', `
    <p class="note">任何支持 MCP (Model Context Protocol) 的客户端（如 Antigravity, Claude Code, Cursor, Windsurf, Codex）均可直接驱动 Hotdesk 视频生产工具！</p>
    <pre id="video-agent-prompt">${esc(`请使用 hotdesk MCP 工具处理短视频二创项目 ${p.id}：
1. 检查状态：get_video_project({ project_id: "${p.id}" })
2. 如果未分离人声：调用 separate_video_audio({ project_id: "${p.id}" })
3. 提取时间戳：调用 transcribe_video_audio({ project_id: "${p.id}" })
4. 以 2026 短视频网感重构高爆点中文台词：调用 rewrite_video_script({ project_id: "${p.id}", segments: [...] })
5. 合成配音：调用 synthesize_video_voiceover({ project_id: "${p.id}", voice: "zh-CN-YunxiNeural" })
6. 工业母带混音：调用 mix_video_audio({ project_id: "${p.id}" })
7. 导出成片与剪映草稿：调用 render_video_master({ project_id: "${p.id}" })`)}</pre>
    <button id="copy-video-agent-prompt" class="quiet">复制 Agent 指令</button>
    <h3 class="spacer">MCP Client stdio 配置示例</h3>
    <pre>{\n  "mcpServers": {\n    "hotdesk": {\n      "command": "node",\n      "args": ["${window.location.origin.includes('127.0.0.1') ? 'D:/GitHub/hotdesk/src/mcp.mjs' : 'src/mcp.mjs'}"]\n    }\n  }\n}</pre>`);

  $('#copy-video-agent-prompt').onclick = guard(async () => {
    await navigator.clipboard.writeText($('#video-agent-prompt').textContent);
    toast('已复制 Agent 指令');
  });
}

// 创建视频项目事件
$('#create-video').onclick = guard(async () => {
  const title = $('#new-video-title').value.trim();
  const url = $('#new-video-url').value.trim();
  if (!title) throw new Error('请输入二创项目名称');
  const created = await tool('create_video_project', {
    title,
    url: url.startsWith('http') ? url : '',
    file_path: !url.startsWith('http') ? url : ''
  });
  $('#new-video-title').value = '';
  $('#new-video-url').value = '';
  toast('视频项目创建成功！');
  await refresh();
  await openVideoProject(created.id);
});

$('#filter-video').oninput = renderVideoProjects;

// ==================== 3. 运行记录与全局刷新 ====================
function renderJobs() {
  $('#jobs').innerHTML = state.jobs.slice(0, 7).map(j => {
    const r = j.result;
    const summary = j.error || r?.message || (
      j.kind === 'discover' && r ? `已导入 ${r.count} 个热点` :
      j.kind === 'collect_url' && r ? `入库 ${r.count} 份新素材，其中评论样本 ${r.comments} 条。${r.warnings?.join('；') || ''}` :
      j.kind === 'search_posts' && r ? `找到 ${r.items?.length || 0} 条候选帖子` :
      j.kind === 'collect_image' && r?.image ? `已保存配图：${r.image.caption}` :
      j.kind === 'model_pipeline' && r ? `已完成 ${r.completed?.length || 0} 道工序` :
      j.kind === 'separate_video_audio' ? 'Demucs 人声彻底剥离完成' :
      j.kind === 'transcribe_video_audio' ? 'Whisper 时间戳转录完成' :
      j.kind === 'synthesize_video_voiceover' ? 'Edge-TTS 语音合成与微加速完成' :
      j.kind === 'mix_video_audio' ? '-14.8 LUFS 母带混音完成' :
      j.kind === 'render_video_master' ? '1080P 成片与剪映 4 轨草稿导出完成' :
      '等待返回结果…'
    );
    const status = r?.status === 'needs_browser' ? 'needs_input' : r?.status === 'partial' ? 'partial' : j.status;
    return `
      <div class="job ${status === 'failed' ? 'error' : ''}">
        <span>${esc(({ running: '进行中', completed: '已完成', partial: '部分完成', needs_input: '待浏览器补充', empty: '未取得结果', failed: '失败', interrupted: '已中断' })[status] || status)}</span>
        <span>${esc(({ discover: '发现热点', collect_url: '采集素材', search_posts: '搜索帖子', collect_image: '保存配图', model_pipeline: 'AI 生产', separate_video_audio: 'Demucs分离', transcribe_video_audio: 'Whisper转录', synthesize_video_voiceover: 'TTS合成', mix_video_audio: '母带混音', render_video_master: '成片渲染' })[j.kind] || j.kind)}<br>${esc(j.input.title || j.input.source || j.input.platform || j.input.project_id || '')}</span>
        <div class="job-result">${esc(summary)}<details><summary>运行详情</summary><pre>${esc(JSON.stringify(r || j.input, null, 2))}</pre></details></div>
        <span>${esc(time(j.updated_at))}</span>
      </div>`;
  }).join('') || '<p class="muted">暂时没有运行记录。</p>';
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    state = await api('/api/state');
    $('#connection').textContent = '● 本地服务在线';

    // 渲染各自侧边栏
    renderTopics();
    renderVideoProjects();
    renderJobs();

    // 动态同步 RSS 选项
    const select = $('#discovery-source');
    if (select) {
      const value = select.value;
      select.querySelectorAll('[data-feed]').forEach(e => e.remove());
      for (const f of state.config.feeds) {
        const o = document.createElement('option');
        o.value = `rss:${f.id}`;
        o.textContent = `RSS · ${f.name}`;
        o.dataset.feed = '1';
        select.append(o);
      }
      select.value = value;
    }

    // 刷新文章详情
    if (selected && currentMode === 'article') {
      const fresh = await api(`/api/topic/${selected}`);
      const signature = JSON.stringify([fresh.updated_at, fresh.revision, fresh.artifacts.map(a => a.id), fresh.images?.map(i => i.id), fresh.paused, fresh.approved_artifact, state.claims]);
      detail = fresh;
      if (signature !== lastRender && !$('#modal').open) {
        lastRender = signature;
        renderDetail();
      }
    }

    // 刷新视频详情
    if (selectedVideo && currentMode === 'video') {
      const freshV = await api(`/api/video_project/${selectedVideo}`);
      const vSig = JSON.stringify([freshV.updated_at, freshV.stage, freshV.data]);
      videoDetail = freshV;
      if (vSig !== lastVideoRender && !$('#modal').open) {
        lastVideoRender = vSig;
        renderVideoDetail();
      }
    }
  } catch (e) {
    $('#connection').textContent = '● 连接中断';
  } finally {
    refreshing = false;
  }
}

// 全局按钮监听
$('#filter').oninput = renderTopics;
$('#discover').onclick = guard(async () => {
  await tool('discover', { source: $('#discovery-source').value, limit: 12 }, true);
  toast('正在获取榜单，运行记录会显示结果');
  await refresh();
});
$('#create').onclick = guard(async () => {
  const t = await tool('create_topic', { title: $('#new-title').value });
  $('#new-title').value = '';
  await refresh();
  await openTopic(t.id);
});
$('#new-title').onkeydown = e => { if (e.key === 'Enter') $('#create').click(); };

$('#settings').onclick = () => {
  modal('数据源设置', `
    <p class="muted">RSS 支持原生 Feed 与 RSSHub 路由。数据源按需拉取，第一版不启动后台定时采集。</p>
    <label>TrendRadar news/*.db 绝对路径（只读接入）</label>
    <input id="tr-path" class="full" value="${esc(state.config.trendradar_path)}" placeholder="D:\\TrendRadar\\output\\news\\2026-09-28.db">
    <label>NewsNow 上游地址</label>
    <input id="nn-base" class="full" value="${esc(state.config.newsnow_base)}">
    <label>RSS 源 JSON</label>
    <textarea id="feeds-json" rows="8">${esc(JSON.stringify(state.config.feeds, null, 2))}</textarea>
    <p class="muted">示例：[{"id":"myfeed","name":"我的来源","url":"https://example.com/feed.xml"}]<br>本地 RSSHub 可加 "allowLocal": true。密钥只从环境变量读取，不存入网页设置。</p>
    <button id="save-config">保存</button>`);
  $('#save-config').onclick = guard(async () => {
    await api('/api/config', { feeds: JSON.parse($('#feeds-json').value), trendradar_path: $('#tr-path').value, newsnow_base: $('#nn-base').value });
    $('#modal').close();
    await refresh();
    toast('配置已保存');
  });
};

$('#agent-help').onclick = () => modal('Agent & MCP 接入', `
  <p>本项目原生暴露全套自媒体生产工具给 Codex、Claude Code、Antigravity、Cursor 或任何支持 MCP 协议的 Agent。网页与外部 Agent 共享同一套 SQLite 数据与媒体文件。</p>
  <h3>MCP (stdio) 客户端配置</h3>
  <pre>{\n  "mcpServers": {\n    "hotdesk": {\n      "command": "node",\n      "args": ["${window.location.origin.includes('127.0.0.1') ? 'D:/GitHub/hotdesk/src/mcp.mjs' : 'src/mcp.mjs'}"]\n    }\n  }\n}</pre>
  <h3>图文与视频双轨工具集</h3>
  <p class="muted">
    <strong>图文：</strong><code>discover</code>, <code>collect_url</code>, <code>import_sources</code>, <code>get_task</code>, <code>claim_task</code>, <code>submit_result</code>, <code>collect_image</code>, <code>export_publish_pack</code><br>
    <strong>视频：</strong><code>create_video_project</code>, <code>get_video_project</code>, <code>separate_video_audio</code>, <code>transcribe_video_audio</code>, <code>rewrite_video_script</code>, <code>synthesize_video_voiceover</code>, <code>mix_video_audio</code>, <code>render_video_master</code>
  </p>
  <h3>CLI 命令行</h3>
  <pre>node src/cli.mjs tools\nnode src/cli.mjs list_topics\nnode src/cli.mjs list_video_projects</pre>
`);

// 初始化启动
(async () => {
  try {
    token = (await api('/api/session')).token;
    renderPortalWelcome(); // 默认首屏呈现双轨门户
    await refresh();
    setInterval(refresh, 4000);
  } catch (e) {
    toast(e.message);
  }
})();
