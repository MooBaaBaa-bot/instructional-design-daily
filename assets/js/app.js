/* ============================================================
   教学设计 · 每日一概念
   页面只负责展示 data/ 中已提交的内容：
   status.json 只指向最新一期，index.json 累积全部篇目。
   前端不改写日期、不生成文章、不预置未来内容。
   ============================================================ */

const TZ = 'Asia/Shanghai';
const STORE_KEY = 'idd.records.v1';
const BASE = new URL('.', window.location.href);

const state = {
  curriculum: null,
  index: null,
  status: null,
  articles: new Map(),
  route: 'today',
  lib: { q: '', theme: 'all', month: 'all', view: 'theme' },
  records: loadRecords(),
  observer: null,
  onScroll: null,
};

/* ---------------- 工具 ---------------- */

function el(id) { return document.getElementById(id); }

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shanghaiDate(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function fmtDateCn(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

function fmtShort(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${m} 月 ${d} 日`;
}

function fmtClock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function fmtStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')} ${fmtClock(iso)}`;
}

function weekdayCn(iso) {
  const d = new Date(`${iso}T12:00:00+08:00`);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, weekday: 'long' }).format(d);
}

function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('toast--show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('toast--show'), 2200);
}

async function fetchJSON(path) {
  const res = await fetch(new URL(path, BASE), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} 请求失败（${res.status}）`);
  return res.json();
}

function totalPlanned() {
  return state.curriculum.totalDays || state.curriculum.concepts.length || 30;
}

/* ---------------- 本地学习记录 ---------------- */

function emptyRecords() {
  return { version: 1, read: {}, fav: {}, notes: {}, marks: {}, updatedAt: null };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyRecords();
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      read: parsed.read && typeof parsed.read === 'object' ? parsed.read : {},
      fav: parsed.fav && typeof parsed.fav === 'object' ? parsed.fav : {},
      notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {},
      marks: parsed.marks && typeof parsed.marks === 'object' ? parsed.marks : {},
      updatedAt: parsed.updatedAt || null,
    };
  } catch (err) {
    console.warn('本地记录读取失败', err);
    return emptyRecords();
  }
}

function saveRecords() {
  state.records.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.records));
  } catch (err) {
    toast('浏览器存储不可用，记录未保存');
  }
}

/* ---------------- 数据加载 ---------------- */

async function bootstrap() {
  try {
    const [curriculum, index, status] = await Promise.all([
      fetchJSON('data/curriculum.json'),
      fetchJSON('data/index.json'),
      fetchJSON('data/status.json'),
    ]);
    state.curriculum = curriculum;
    state.index = index;
    state.status = status;
    state.index.articles.sort((a, b) => (a.date < b.date ? 1 : -1));
    renderHeaderStatus();
    renderTabs();
    await route();
    el('loading').hidden = true;
    el('app').hidden = false;
  } catch (err) {
    el('loading').innerHTML = `<p class="empty">内容加载失败：${esc(err.message)}<br>
      若你是用文件方式（file://）直接打开页面，请改用本地静态服务器预览，例如
      <code>python3 -m http.server 8000</code>。</p>`;
  }
}

async function getArticle(id) {
  if (state.articles.has(id)) return state.articles.get(id);
  const meta = state.index.articles.find((a) => a.id === id);
  if (!meta) return null;
  const article = await fetchJSON(meta.file);
  state.articles.set(id, article);
  return article;
}

/* ---------------- 页头与导航 ---------------- */

function renderHeaderStatus() {
  const today = shanghaiDate();
  const st = state.status;
  const dot = el('head-dot');
  const text = el('head-status-text');
  const prog = el('head-status-prog');
  prog.innerHTML = `已发布 <b>${st.publishedCount || 0}</b> / ${totalPlanned()} 篇`;

  if (!st.lastPublishedAt) {
    dot.className = 'dot dot--stale';
    text.textContent = '尚无发布记录';
    return;
  }
  const stale = st.lastPublishedDate !== today;
  dot.className = stale ? 'dot dot--stale' : 'dot';
  text.innerHTML = stale
    ? `今日尚未发布<span class="sep">·</span>最近一期 ${fmtShort(st.lastPublishedDate)}`
    : `今日已更新<span class="sep">·</span>${fmtClock(st.lastPublishedAt)}`;
}

function renderTabs() {
  el('tab-lib-count').textContent = state.index.articles.length;
  el('tab-mine-count').textContent = Object.keys(state.records.read).length || '';
}

const ROUTES = {
  today: 'view-today',
  path: 'view-path',
  library: 'view-library',
  mine: 'view-mine',
};

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [name, param] = hash.split('/');
  if (name === 'read' && param) return { name: 'read', id: decodeURIComponent(param) };
  if (ROUTES[name]) return { name, id: null };
  return { name: 'today', id: null };
}

function setActiveTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    const tabName = tab.dataset.route;
    const active = tabName === name || (name === 'read' && tabName === 'today');
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

function cleanupReader() {
  state.tocUpdate = null;
  state.pendingSel = null;
  hideHighlightBar();
  /* 先关备注框（会顺带保存未提交的文字），再清空当前文章引用 */
  closeMarkPopover(true);
  state.article = null;
  if (state.observer) { state.observer.disconnect(); state.observer = null; }
  if (state.onScroll) { window.removeEventListener('scroll', state.onScroll); state.onScroll = null; }
  const bar = el('readbar');
  if (bar) bar.hidden = true;
  const fill = el('readbar-fill');
  if (fill) fill.style.width = '0';
  const qnav = el('qnav');
  if (qnav) { qnav.hidden = true; qnav.innerHTML = ''; }
  closeQNav();
  document.body.classList.remove('has-qnav');
  const top = el('to-top');
  if (top) top.classList.remove('is-on');
}

async function route() {
  if (!state.curriculum || !state.index || !state.status) return;
  cleanupReader();
  const r = currentRoute();
  state.route = r.name;

  ['today', 'path', 'library', 'mine'].forEach((v) => { el(ROUTES[v]).hidden = true; });

  if (r.name === 'read') {
    await renderReader(r.id);
    setActiveTab('read');
    return;
  }

  setActiveTab(r.name);
  if (r.name === 'today') await renderToday();
  if (r.name === 'path') renderPath();
  if (r.name === 'library') renderLibrary();
  if (r.name === 'mine') renderMine();
  el(ROUTES[r.name]).hidden = false;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ---------------- 期号条 ---------------- */

function mastheadHTML(article, meta, opts = {}) {
  const total = totalPlanned();
  const stateText = opts.stateText || '';

  return `<header class="masthead">
    <div class="masthead__top">
      <span class="masthead__no">${String(article.day).padStart(2, '0')}</span>
      <span class="masthead__of">DAY / ${total}</span>
      <span class="masthead__rule" aria-hidden="true"></span>
      <span class="masthead__theme">${esc(article.theme)}</span>
      <span class="masthead__date">${esc(fmtDateCn(article.date))}<span class="masthead__weekday"> ${esc(weekdayCn(article.date))}</span></span>
      ${stateText ? `<span class="masthead__state${opts.stale ? ' masthead__state--stale' : ''}"><i class="dot"></i>${esc(stateText)}</span>` : ''}
    </div>
    <h1 class="masthead__title">${esc(article.titleZh)}</h1>
    <p class="masthead__en">${esc(article.titleEn)}</p>
    <p class="masthead__standfirst">${esc(article.oneLiner)}</p>
  </header>`;
}

/* ---------------- 今日 ---------------- */

async function renderToday() {
  const today = shanghaiDate();
  const st = state.status;
  const view = el('view-today');

  if (!st.lastConceptId) {
    view.innerHTML = `
      <div class="notice"><strong>还没有已发布的内容。</strong>
      第一篇会在下一次更新任务成功后出现在这里；在此之前，这个位置不显示任何预置文章。</div>
      <div class="page-head"><h1>准备中</h1>
      <p>30 天目录已经确定，可在「学习路径」查看。</p></div>`;
    view.hidden = false;
    return;
  }

  const article = await getArticle(st.lastConceptId);
  const publishedToday = st.lastPublishedDate === today;
  const meta = state.index.articles.find((a) => a.id === st.lastConceptId);

  const staleNote = publishedToday ? '' : `
    <div class="notice" role="status">
      <strong>今日尚未发布，以下是最近一期。</strong>
      今天是 ${esc(fmtDateCn(today))}，站内最新一期为 ${esc(fmtDateCn(st.lastPublishedDate))}。
      每日任务在 10:00 启动，检索、撰写、校验与部署需要几分钟；若已过 10:30 仍未出现，说明今天这次更新没有成功。
      页面不会把旧内容说成今天的更新。
    </div>`;

  view.innerHTML = readerHTML(article, {
    back: null,
    meta,
    notice: staleNote,
    stateText: publishedToday ? `今日 ${fmtClock(st.lastPublishedAt)} 发布` : `最近一期 ${fmtShort(article.date)}`,
    stale: !publishedToday,
  });
  mountReader(article, meta);
  mountQNav(article);
  view.hidden = false;
}

/* ---------------- 单篇阅读 ---------------- */

async function renderReader(id) {
  const view = el('view-today');
  const article = await getArticle(id);
  view.hidden = false;
  if (!article) {
    view.innerHTML = `<p class="empty">没有找到编号为「${esc(id)}」的内容。<br><a href="#/library">返回概念库</a></p>`;
    return;
  }
  const meta = state.index.articles.find((a) => a.id === id);
  view.innerHTML = readerHTML(article, {
    back: '#/library',
    meta,
    stateText: '已发布',
    stale: false,
  });
  mountReader(article, meta);
  mountQNav(article);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* 一句话讲明白：给完全不了解这个学科的人听的白话入口。
   放在 #article-body 之外，避免改变正文纯文本的字符偏移，
   已保存的划线定位不受影响。 */
function plainHTML(article) {
  const text = typeof article.plainTalk === 'string' ? article.plainTalk.trim() : '';
  if (!text) return '';
  return `
    <aside class="plain" aria-label="一句话讲明白这个概念">
      <p class="plain__label">一句话讲明白</p>
      <p class="plain__text">${esc(text)}</p>
      <p class="plain__hint">说给完全不了解这个学科的人听，他也能跟上。</p>
    </aside>`;
}

/* 图解与迁移：概念图 + 经典模型 + 应用案例。
   只在文章带 visual 字段时出现，插在「概念辨析」之后、教学情境之前。 */
function hasPlate(article) {
  const v = article && article.visual;
  if (!v) return false;
  const mind = v.mind && Array.isArray(v.mind.branches) && v.mind.branches.length;
  const model = v.model && v.model.name && (v.model.steps || []).length;
  const cases = Array.isArray(v.cases) && v.cases.length;
  return Boolean(mind || model || cases);
}

function plateHTML(article, v) {
  const mind = v.mind || {};
  const branches = (mind.branches || []).filter((b) => b && b.label && (b.items || []).length);
  const model = v.model && v.model.name ? v.model : null;
  const cases = (v.cases || []).filter((c) => c && c.name);

  const mindHTML = branches.length ? `
    <div class="mind">
      <p class="mind__core">${esc(mind.core || article.titleZh)}<span>${esc(mind.en || article.titleEn)}</span></p>
      <ul class="mind__branches">
        ${branches.map((b) => `<li class="mind__branch">
          <p class="mind__label">${esc(b.label)}</p>
          <ul class="mind__items">${(b.items || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </li>`).join('')}
      </ul>
    </div>` : '';

  const modelHTML = model ? `
    <div class="model">
      <p class="plate__label">经典模型</p>
      <h3 class="model__name">${esc(model.name)}${model.source ? `<span>${esc(model.source)}</span>` : ''}</h3>
      <ol class="model__steps">${(model.steps || []).map((s, i) => `<li>
        <b>${String(i + 1).padStart(2, '0')}</b><span>${esc(s)}</span></li>`).join('')}</ol>
      ${model.use ? `<p class="model__use">${esc(model.use)}</p>` : ''}
    </div>` : '';

  const casesHTML = cases.length ? `
    <div class="cases">
      <p class="plate__label">应用案例</p>
      <ul class="cases__list">${cases.map((c) => `<li class="case">
        <p class="case__head"><b>${esc(c.name)}</b>${c.tag ? `<span class="case__tag">${esc(c.tag)}</span>` : ''}</p>
        <p class="case__text">${esc(c.text)}</p>
        ${(c.source || c.link) ? `<p class="case__src">${esc(c.source || '')}${c.link
          ? `${c.source ? ' · ' : ''}<a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.linkLabel || '来源')}</a>` : ''}</p>` : ''}
      </li>`).join('')}</ul>
    </div>` : '';

  if (!mindHTML && !modelHTML && !casesHTML) return '';

  return `
    <section class="plate" id="sec-visual" aria-labelledby="sec-visual-h">
      <div class="plate__head">
        <p class="plate__kicker">图解与迁移</p>
        <h2 id="sec-visual-h">${esc(v.title || `一张图看懂「${article.titleZh}」`)}</h2>
        ${v.lead ? `<p class="plate__lead">${esc(v.lead)}</p>` : ''}
      </div>
      ${mindHTML}
      ${modelHTML}
      ${casesHTML}
    </section>`;
}

function readerHTML(article, opts = {}) {
  const n = article.sections.length;
  const tocItems = [];
  article.sections.forEach((s, i) => {
    tocItems.push(`
    <li><button class="toc__link" type="button" data-target="sec-${esc(s.key)}">
      <span class="toc__no">${String(i + 1).padStart(2, '0')}</span>${esc(s.heading)}
    </button></li>`);
    if (s.key === 'contrast' && hasPlate(article)) {
      tocItems.push(`
    <li><button class="toc__link toc__link--plate" type="button" data-target="sec-visual">
      <span class="toc__no">·</span>图解与迁移
    </button></li>`);
    }
  });
  const toc = tocItems.join('');

  return `
  <div class="reader">
    <div class="reader__main">
      ${opts.back ? `<p class="eyebrow"><a href="${esc(opts.back)}">← 概念库</a></p>` : ''}
      ${opts.notice || ''}
      ${mastheadHTML(article, opts.meta, opts)}
      ${plainHTML(article)}
      <div class="article" id="article-body"></div>
      <div class="article-actions" id="article-actions"></div>
      <div class="marks" id="article-marks"></div>
      <div class="note-editor" id="article-note"></div>
      ${pagerHTML(article.day)}
    </div>
    <aside class="reader__aside" aria-label="本篇目录">
      <nav class="toc">
        <div class="toc__head">
          <p class="toc__label">本篇目录</p>
          <button class="toc__collapse" type="button" aria-label="收起目录" title="收起目录（Alt+2）">收起<span aria-hidden="true">›</span></button>
        </div>
        <button class="toc__expand" type="button" aria-label="展开目录" title="展开目录（Alt+2）">本篇目录</button>
        <ul class="toc__list">${toc}</ul>
        <div class="toc__rail" aria-hidden="true"><span class="toc__rail-fill" id="toc-rail"></span></div>
        <p class="toc__foot">${n} 节${hasPlate(article) ? ' + 图解' : ''} · 约 ${article.readingMinutes} 分钟<br>正文 ${article.wordCount || '—'} 字</p>
      </nav>
    </aside>
  </div>`;
}

function mountReader(article, meta) {
  state.article = article;
  el('article-body').innerHTML = renderSections(article);
  applyFontSize();
  paintMarks(article);
  bindMarkList(article);
  mountActions(el('article-actions'), el('article-note'), article);
  setupTOC();
  setupProgress();
  bindPanelButtons(document.querySelector('.reader__aside'));
  renderTabs();
  if (state.pendingMark) {
    const mid = state.pendingMark;
    state.pendingMark = null;
    requestAnimationFrame(() => revealMark(mid));
  }
  if (meta) { /* 元信息已在页头展示，无需重复 */ }
}

/* ---------------- 阅读字号偏好 ---------------- */

const FONT_KEY = 'idd.fontsize.v1';
const FONT_STEPS = [
  { key: 's', label: '小', title: '小字号' },
  { key: 'm', label: '中', title: '默认字号' },
  { key: 'l', label: '大', title: '大字号' },
];

function currentFontSize() {
  try {
    const v = localStorage.getItem(FONT_KEY);
    return FONT_STEPS.some((s) => s.key === v) ? v : 'm';
  } catch (err) { return 'm'; }
}

function applyFontSize() {
  const body = el('article-body');
  if (body) body.dataset.size = currentFontSize();
}

/* ---------------- 左右栏开合 ---------------- */

const PANEL_KEY = 'idd.panels.v1';

function loadPanels() {
  try {
    const raw = JSON.parse(localStorage.getItem(PANEL_KEY) || '{}');
    return { qnav: raw.qnav === 'collapsed', toc: raw.toc === 'collapsed' };
  } catch (err) {
    return { qnav: false, toc: false };
  }
}

/* 把状态写回 body，宽度变量随 class 联动 */
function paintPanels() {
  const s = loadPanels();
  document.body.classList.toggle('qnav-collapsed', s.qnav);
  document.body.classList.toggle('toc-collapsed', s.toc);
}

function setPanel(name, collapsed) {
  const s = loadPanels();
  s[name] = !!collapsed;
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify({
      qnav: s.qnav ? 'collapsed' : 'open',
      toc: s.toc ? 'collapsed' : 'open',
    }));
  } catch (err) { /* 隐私模式下忽略 */ }
  if (name === 'qnav' && collapsed) closeQNav();
  paintPanels();
  /* 栏位变化后文档高度会变，重算一次进度 */
  if (typeof state.onScroll === 'function') state.onScroll();
}

function bindPanelButtons(root) {
  if (!root) return;
  const bind = (sel, fn) => {
    const node = root.querySelector(sel);
    if (node) node.addEventListener('click', fn);
  };
  bind('.qnav__collapse', () => setPanel('qnav', true));
  bind('.qnav__expand', () => setPanel('qnav', false));
  bind('.toc__collapse', () => setPanel('toc', true));
  bind('.toc__expand', () => setPanel('toc', false));
}

/* ---------------- 上一篇 / 下一篇 ---------------- */

function pagerHTML(day) {
  const concepts = [...state.curriculum.concepts].sort((a, b) => a.day - b.day);
  const pub = new Set(state.index.articles.map((a) => a.id));
  const prev = concepts.filter((c) => c.day < day && pub.has(c.id)).pop();
  const nextPub = concepts.find((c) => c.day > day && pub.has(c.id));
  const nextPlan = concepts.find((c) => c.day > day && !pub.has(c.id));
  if (!prev && !nextPub && !nextPlan) return '';

  const linked = (c, dir) => `<div class="pager__item pager__item--${dir}">
      <span class="pager__label">${dir === 'prev' ? '上一期' : '下一期'}</span>
      <a class="pager__title" href="#/read/${esc(c.id)}">${esc(c.titleZh)}<span class="pager__en">${esc(c.titleEn)}</span></a>
    </div>`;
  const pending = (c) => `<div class="pager__item pager__item--next">
      <span class="pager__label">下一期 · 计划中</span>
      <span class="pager__title pager__title--pending">${esc(c.titleZh)}<span class="pager__en">${esc(c.titleEn)} · 尚未发布</span></span>
    </div>`;
  const blank = (dir) => `<div class="pager__item pager__item--${dir}"></div>`;

  const left = prev ? linked(prev, 'prev') : blank('prev');
  const right = nextPub ? linked(nextPub, 'next') : (nextPlan ? pending(nextPlan) : blank('next'));
  return `<nav class="pager" aria-label="篇目导航">${left}${right}</nav>`;
}

/* ---------------- 文章渲染 ---------------- */

function renderSections(article) {
  const parts = [];
  article.sections.forEach((section, i) => {
    const no = String(i + 1).padStart(2, '0');
    let body = '';
    if (section.key === 'reflection') {
      body = `
        <div class="reflection">
          <p class="reflection__q">${esc(section.question)}</p>
          <details>
            <summary>参考思路（点击展开）</summary>
            <ul>${(section.answer || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
          </details>
        </div>`;
    } else if (section.key === 'reading') {
      body = `<ol class="reading-list">${(section.items || []).map(renderRef).join('')}</ol>`;
    } else {
      body = (section.blocks || []).map(renderBlock).join('');
    }
    parts.push(`
      <section class="section" id="sec-${esc(section.key)}" aria-labelledby="sec-${esc(section.key)}-h">
        <div class="section__head">
          <span class="section__no">${no}</span>
          <h2 id="sec-${esc(section.key)}-h">${esc(section.heading)}</h2>
        </div>
        ${body}
      </section>`);
    if (section.key === 'contrast' && hasPlate(article)) {
      parts.push(plateHTML(article, article.visual));
    }
  });
  return parts.join('');
}

function renderBlock(block) {
  switch (block.type) {
    case 'p':
      return `<p>${esc(block.text)}</p>`;
    case 'h':
      return `<h3>${esc(block.text)}</h3>`;
    case 'ul':
      return `<ul>${(block.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'ol':
      return `<ol>${(block.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ol>`;
    case 'note':
      return `<div class="callout callout--${esc(block.variant || 'evidence')}">
        <span class="callout__label">${esc(block.label || '')}</span>${esc(block.text)}</div>`;
    case 'table': {
      const head = (block.head || []).map((h) => `<th scope="col">${esc(h)}</th>`).join('');
      const rows = (block.rows || []).map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
      return `<div class="table-wrap"><table>
        ${block.caption ? `<caption>${esc(block.caption)}</caption>` : ''}
        <thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case 'flow': {
      const cols = (block.items || []).length;
      const nodes = (block.items || []).map((n, i) => `${i ? '<div class="flow__arrow" aria-hidden="true">↓</div>' : ''}
        <div class="flow__node"><b>${esc(n.label)}</b><span>${esc(n.desc || '')}</span></div>`).join('');
      return `<div class="flow" style="--cols:${cols}"><div class="flow__row">${nodes}</div></div>`;
    }
    default:
      return '';
  }
}

function renderRef(item) {
  const link = item.link
    ? `<a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${esc(item.link.replace(/^https?:\/\//, ''))}</a>`
    : '';
  return `<li>
    <span class="ref-title">${esc(item.authors)} (${esc(item.year)}). ${esc(item.title)}.</span>
    <span class="ref-src">${esc(item.source)}${link ? ' · ' + link : ''}</span>
    ${item.note ? `<span class="ref-note">${esc(item.note)}</span>` : ''}
    ${item.verified ? `<span class="ref-verify">来源核查：${esc(item.verified)}</span>` : ''}
  </li>`;
}

/* ---------------- 目录联动与阅读进度 ---------------- */

function setupTOC() {
  const links = [...document.querySelectorAll('.toc__link')];
  if (!links.length) return;
  const targets = links.map((l) => document.getElementById(l.dataset.target)).filter(Boolean);
  const setActive = (id) => {
    links.forEach((l) => {
      if (l.dataset.target === id) l.setAttribute('aria-current', 'true');
      else l.removeAttribute('aria-current');
    });
  };
  links.forEach((l) => {
    l.addEventListener('click', () => {
      const t = document.getElementById(l.dataset.target);
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  if (!targets.length) return;

  /* 以「越过视口上方 30%」为界判定当前小节，比可见性判断更贴合阅读位置 */
  const updateActive = () => {
    const line = window.innerHeight * 0.3;
    const atEnd = window.scrollY > 0
      && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
    let current = targets[0];
    targets.forEach((s) => {
      if (s.getBoundingClientRect().top <= line) current = s;
    });
    if (atEnd) current = targets[targets.length - 1];
    if (current) setActive(current.id);
  };
  state.tocUpdate = updateActive;
  updateActive();
  /* 首屏渲染后布局才稳定，下一帧再校正一次 */
  requestAnimationFrame(updateActive);
}

/* ---------------- 左侧快捷栏：概念筛选 ---------------- */

function qnavConcepts() {
  const live = new Map(state.index.articles.map((a) => [a.id, a]));
  return [...state.curriculum.concepts]
    .sort((a, b) => a.day - b.day)
    .map((c) => {
      const meta = live.get(c.id);
      return {
        id: c.id,
        day: c.day,
        titleZh: c.titleZh,
        titleEn: c.titleEn,
        theme: c.theme,
        published: !!meta,
        keywords: meta ? (meta.keywords || []) : [],
      };
    });
}

function mountQNav(article) {
  const nav = el('qnav');
  if (!nav) return;

  const all = qnavConcepts();
  if (!all.length) { nav.hidden = true; return; }
  const currentId = (article && article.id) || state.status.lastConceptId;
  const liveCount = all.filter((c) => c.published).length;

  const row = (c) => {
    const day = String(c.day).padStart(2, '0');
    const search = esc([c.titleZh, c.titleEn, c.theme, ...c.keywords].join(' ').toLowerCase());
    const inner = `<span class="qnav__day">${day}</span><span class="qnav__text">${esc(c.titleZh)}</span>`;
    return `<li class="qnav__row ${c.published ? 'is-live' : 'is-plan'}" data-search="${search}">
      ${c.published
        ? `<a class="qnav__link" href="#/read/${esc(c.id)}"${c.id === currentId ? ' aria-current="true"' : ''}>${inner}</a>`
        : `<span class="qnav__link qnav__link--plan" title="尚未发布">${inner}</span>`}
    </li>`;
  };

  const liveRows = all.filter((c) => c.published).map(row).join('');
  const planRows = all.filter((c) => !c.published).map(row).join('');

  nav.innerHTML = `
    <div class="qnav__head">
      <p class="qnav__title">学习内容</p>
      <button class="qnav__close" type="button" aria-label="关闭学习内容">关闭</button>
      <button class="qnav__collapse" type="button" aria-label="收起学习内容" title="收起学习内容（Alt+1）">收起<span aria-hidden="true">‹</span></button>
    </div>
    <button class="qnav__expand" type="button" aria-label="展开学习内容" title="展开学习内容（Alt+1）">学习内容</button>
    <div class="qnav__filter">
      <input id="qnav-q" type="search" autocomplete="off" placeholder="筛选概念" aria-label="按名称或关键词筛选概念">
    </div>
    <div class="qnav__scroll">
      <p class="qnav__group" data-group="live">已发布 <b>${liveCount}</b></p>
      <ul class="qnav__list" data-list="live">${liveRows || '<li class="qnav__none">暂无</li>'}</ul>
      <p class="qnav__group" data-group="plan">计划中 <b>${all.length - liveCount}</b></p>
      <ul class="qnav__list" data-list="plan">${planRows || '<li class="qnav__none">暂无</li>'}</ul>
      <p class="qnav__none" id="qnav-empty" hidden>没有匹配的概念</p>
    </div>
    <p class="qnav__foot">共 ${all.length} 天 · 已发布 ${liveCount} 篇</p>`;

  nav.hidden = false;
  document.body.classList.add('has-qnav');
  el('qnav-toggle').hidden = false;

  const input = el('qnav-q');
  const rows = [...nav.querySelectorAll('.qnav__row')];
  const apply = () => {
    const term = input.value.trim().toLowerCase();
    let hits = 0;
    rows.forEach((r) => {
      const ok = !term || r.dataset.search.includes(term);
      r.hidden = !ok;
      if (ok) hits += 1;
    });
    nav.querySelectorAll('.qnav__list').forEach((list) => {
      const group = list.dataset.list;
      const hasVisible = [...list.querySelectorAll('.qnav__row')].some((r) => !r.hidden);
      const head = nav.querySelector(`.qnav__group[data-group="${group}"]`);
      if (head) head.hidden = !hasVisible;
      list.hidden = !hasVisible;
    });
    const empty = el('qnav-empty');
    if (empty) empty.hidden = hits > 0;
  };

  input.addEventListener('input', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; apply(); }
    if (e.key === 'Enter') {
      const first = rows.find((r) => !r.hidden && r.querySelector('a'));
      if (first) first.querySelector('a').click();
    }
  });
  apply();

  const active = nav.querySelector('.qnav__link[aria-current="true"]');
  if (active) {
    const scroller = nav.querySelector('.qnav__scroll');
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      const top = active.offsetTop - scroller.clientHeight / 2;
      scroller.scrollTop = Math.max(0, top);
    }
  }

  nav.querySelector('.qnav__close').addEventListener('click', closeQNav);
  bindPanelButtons(nav);
}

/* ---------------- 抽屉开合 ---------------- */

function openQNav() {
  if (!document.body.classList.contains('has-qnav')) return;
  const toggle = el('qnav-toggle');
  if (toggle) toggle.classList.remove('is-tucked');
  document.body.classList.add('qnav-open');
  el('qnav-backdrop').hidden = false;
  const btn = el('qnav-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  const input = el('qnav-q');
  if (input && window.innerWidth < 1280) setTimeout(() => input.focus({ preventScroll: true }), 260);
}

function closeQNav() {
  document.body.classList.remove('qnav-open');
  const btn = el('qnav-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function setupQNavToggle() {
  const btn = el('qnav-toggle');
  const backdrop = el('qnav-backdrop');
  if (btn) {
    btn.addEventListener('click', () => {
      if (document.body.classList.contains('qnav-open')) closeQNav();
      else openQNav();
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeQNav);
}

function setupProgress() {
  const bar = el('readbar');
  const fill = el('readbar-fill');
  if (!bar || !fill) return;
  bar.hidden = false;
  const update = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
    const pct = `${(p * 100).toFixed(2)}%`;
    fill.style.width = pct;
    const rail = el('toc-rail');
    if (rail) rail.style.width = pct;
    if (typeof state.tocUpdate === 'function') state.tocUpdate();
  };
  update();
  state.onScroll = update;
  window.addEventListener('scroll', update, { passive: true });
}

/* ---------------- 页头收起、回到顶部、抽屉 ---------------- */

function setupChrome() {
  const head = el('site-head');
  const top = el('to-top');
  const navBtn = el('qnav-toggle');
  let ticking = false;
  let lastY = window.scrollY;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      const y = window.scrollY;
      if (head) head.classList.toggle('is-compact', y > 30);
      if (top) top.classList.toggle('is-on', y > 720);

      /* 向下阅读时收起浮动「学习内容」按钮，向上滚动时回来 */
      if (navBtn && !document.body.classList.contains('qnav-open')) {
        if (y > lastY + 6 && y > 280) navBtn.classList.add('is-tucked');
        else if (y < lastY - 6 || y < 120) navBtn.classList.remove('is-tucked');
      }
      lastY = y;
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (top) {
    top.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  setupQNavToggle();
}

/* ---------------- 阅读操作 ---------------- */

function mountActions(actionsEl, noteEl, article) {
  const id = article.id;
  const rec = state.records;
  const size = currentFontSize();

  actionsEl.innerHTML = `
    <button class="btn" type="button" data-act="read" aria-pressed="false"></button>
    <button class="btn" type="button" data-act="fav" aria-pressed="false"></button>
    <button class="btn btn--quiet" type="button" data-act="jump-note">写一条笔记</button>
    <button class="btn btn--quiet" type="button" data-act="copy">复制链接</button>
    <div class="fontctl" role="group" aria-label="正文字号">
      <span class="fontctl__label" aria-hidden="true">字号</span>
      ${FONT_STEPS.map((s) => `<button type="button" data-size="${s.key}" title="${esc(s.title)}" aria-label="${esc(s.title)}" aria-pressed="${s.key === size}">${esc(s.label)}</button>`).join('')}
    </div>
  `;

  const readBtn = actionsEl.querySelector('[data-act="read"]');
  const favBtn = actionsEl.querySelector('[data-act="fav"]');
  const paint = () => {
    readBtn.textContent = rec.read[id] ? '✓ 已读' : '标记已读';
    readBtn.setAttribute('aria-pressed', String(!!rec.read[id]));
    favBtn.textContent = rec.fav[id] ? '★ 已收藏' : '☆ 收藏';
    favBtn.setAttribute('aria-pressed', String(!!rec.fav[id]));
  };
  paint();

  readBtn.addEventListener('click', () => {
    if (rec.read[id]) delete rec.read[id];
    else rec.read[id] = new Date().toISOString();
    saveRecords();
    paint();
    renderTabs();
    toast(rec.read[id] ? '已标记为已读' : '已取消已读标记');
  });

  favBtn.addEventListener('click', () => {
    if (rec.fav[id]) delete rec.fav[id];
    else rec.fav[id] = new Date().toISOString();
    saveRecords();
    paint();
    toast(rec.fav[id] ? '已加入收藏' : '已取消收藏');
  });

  actionsEl.querySelector('[data-act="jump-note"]').addEventListener('click', () => {
    const ta = noteEl.querySelector('textarea');
    if (ta) { ta.focus(); ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  actionsEl.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const url = `${window.location.origin}${window.location.pathname}#/read/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('链接已复制');
    } catch (err) {
      const tmp = document.createElement('textarea');
      tmp.value = url;
      tmp.setAttribute('readonly', '');
      tmp.style.position = 'fixed';
      tmp.style.opacity = '0';
      document.body.appendChild(tmp);
      tmp.select();
      const ok = document.execCommand && document.execCommand('copy');
      tmp.remove();
      toast(ok ? '链接已复制' : '复制失败，请手动复制地址栏');
    }
  });

  actionsEl.querySelectorAll('[data-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.size;
      try { localStorage.setItem(FONT_KEY, next); } catch (err) { /* 忽略 */ }
      applyFontSize();
      actionsEl.querySelectorAll('[data-size]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.size === next));
      });
    });
  });

  noteEl.innerHTML = `
    <label for="note-input">我的笔记</label>
    <textarea id="note-input" placeholder="这个概念能用在哪个课程、哪次设计里？"></textarea>
    <p class="note-editor__hint"><span id="note-saved">笔记保存在当前浏览器（localStorage），不会上传。</span></p>
  `;
  const ta = noteEl.querySelector('textarea');
  ta.value = rec.notes[id] || '';
  const hint = noteEl.querySelector('#note-saved');
  let timer = null;
  ta.addEventListener('input', () => {
    clearTimeout(timer);
    hint.textContent = '正在保存…';
    timer = setTimeout(() => {
      const text = ta.value.trim();
      if (text) rec.notes[id] = ta.value;
      else delete rec.notes[id];
      saveRecords();
      hint.textContent = `已保存到本机 · ${fmtClock(new Date().toISOString())}`;
    }, 500);
  });
}

/* ---------------- 划线高亮与备注 ----------------
   划线以「正文纯文本的字符区间」定位：文章发布后不再改动，
   因此 start/end 不会漂移；写入 quote 作为校验，万一不匹配再按文本回退查找。
   数据只存本机 localStorage，随「导出记录」一并备份。 */

const MARK_META = {
  gold: { label: '重点', title: '黄色：重点句' },
  green: { label: '可用', title: '绿色：可迁移、可借鉴' },
  clay: { label: '疑问', title: '红色：存疑、待查' },
};
const MARK_COLORS = Object.keys(MARK_META);

function marksOf(articleId) {
  if (!state.records.marks[articleId]) state.records.marks[articleId] = [];
  return state.records.marks[articleId];
}

function newMarkId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* 正文文本索引：把 DOM 里的文本节点按顺序拼成一条字符串，记录每个节点的起点 */
function textIndex(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let text = '';
  let node = walker.nextNode();
  while (node) {
    nodes.push({ node, start: text.length });
    text += node.nodeValue;
    node = walker.nextNode();
  }
  return { text, nodes };
}

function textOffset(root, container, offset) {
  if (!root.contains(container)) return -1;
  const r = document.createRange();
  try {
    r.selectNodeContents(root);
    r.setEnd(container, offset);
  } catch (err) {
    return -1;
  }
  return r.toString().length;
}

function rangeToOffsets(range, root) {
  const start = textOffset(root, range.startContainer, range.startOffset);
  const end = textOffset(root, range.endContainer, range.endOffset);
  if (start < 0 || end <= start) return null;
  const { text } = textIndex(root);
  if (end > text.length) return null;
  return { start, end, quote: text.slice(start, end) };
}

function unwrapHighlights(root) {
  root.querySelectorAll('mark.hl').forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

function wrapRange(root, mk) {
  const { text, nodes } = textIndex(root);
  if (typeof mk.start !== 'number' || typeof mk.end !== 'number') return;
  if (mk.start < 0 || mk.end > text.length || mk.end <= mk.start) return;
  const color = MARK_COLORS.includes(mk.color) ? mk.color : 'gold';
  const label = String(mk.quote || '').replace(/\s+/g, ' ').trim().slice(0, 42);

  nodes.forEach(({ node, start }) => {
    const len = node.nodeValue.length;
    if (start >= mk.end || start + len <= mk.start) return;
    const from = Math.max(0, mk.start - start);
    const to = Math.min(len, mk.end - start);
    if (to <= from) return;
    let target = node;
    if (from > 0) target = target.splitText(from);
    if (to - from < target.nodeValue.length) target.splitText(to - from);
    if (!target.nodeValue) return;
    const mark = document.createElement('mark');
    mark.className = `hl hl--${color}${mk.note ? ' hl--noted' : ''}`;
    mark.dataset.markId = mk.id;
    mark.tabIndex = 0;
    mark.setAttribute('role', 'button');
    mark.setAttribute('aria-label', `划线「${label}」${mk.note ? '，含备注' : ''}，按回车可写备注`);
    if (mk.note) mark.title = mk.note;
    target.parentNode.insertBefore(mark, target);
    mark.appendChild(target);
  });
}

function paintMarks(article) {
  const body = el('article-body');
  if (!body || !article) return;
  unwrapHighlights(body);
  const list = marksOf(article.id);
  const { text } = textIndex(body);
  let moved = false;

  list.forEach((mk) => {
    if (!mk || !mk.id || typeof mk.start !== 'number' || typeof mk.end !== 'number') return;
    if (text.slice(mk.start, mk.end) !== mk.quote) {
      const at = mk.quote ? text.indexOf(mk.quote) : -1;
      if (at < 0) { mk.orphan = true; return; }
      mk.start = at;
      mk.end = at + mk.quote.length;
      mk.orphan = false;
      moved = true;
    } else {
      mk.orphan = false;
    }
    wrapRange(body, mk);
  });

  if (moved) saveRecords();
  renderMarkList(article);
}

/* ---- 选中文字后的浮动工具条 ---- */

function ensureHighlightUI() {
  if (el('hlbar')) return;

  const bar = document.createElement('div');
  bar.className = 'hlbar';
  bar.id = 'hlbar';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '划线工具');
  bar.innerHTML = `
    <span class="hlbar__label">划线</span>
    ${MARK_COLORS.map((c) => `<button class="hlbar__dot hlbar__dot--${c}" type="button" data-color="${c}" title="${esc(MARK_META[c].title)}" aria-label="${esc(MARK_META[c].title)}"></button>`).join('')}
    <span class="hlbar__sep" aria-hidden="true"></span>
    <button class="hlbar__btn" type="button" data-act="note">＋备注</button>
    <button class="hlbar__btn hlbar__btn--x" type="button" data-act="close" aria-label="取消划线">×</button>`;
  document.body.appendChild(bar);

  /* 按下时不抢焦点，否则选区会先被清掉 */
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  bar.addEventListener('click', (e) => {
    const colorBtn = e.target.closest('[data-color]');
    if (colorBtn) {
      createMarkFromSelection(colorBtn.dataset.color, false);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'note') createMarkFromSelection('gold', true);
    if (act.dataset.act === 'close') { hideHighlightBar(); clearSelection(); }
  });

  const pop = document.createElement('div');
  pop.className = 'hlpop';
  pop.id = 'hlpop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', '划线备注');
  pop.innerHTML = `
    <p class="hlpop__quote"></p>
    <label class="hlpop__sr" for="hlpop-text">备注</label>
    <textarea id="hlpop-text" rows="3" placeholder="写一句备注：为什么划这句？能用到哪门课？"></textarea>
    <p class="hlpop__hint"></p>
    <div class="hlpop__foot">
      <button class="btn btn--primary" type="button" data-act="save">保存</button>
      <button class="btn" type="button" data-act="del">删除划线</button>
      <button class="btn btn--quiet" type="button" data-act="close">关闭</button>
    </div>`;
  document.body.appendChild(pop);

  pop.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'save') {
      if (savePopoverNote()) toast('备注已保存');
      else toast('备注没有变化');
      closeMarkPopover(false);
    }
    if (act.dataset.act === 'del') deleteMark(state.popMarkId);
    if (act.dataset.act === 'close') closeMarkPopover(true);
  });
}

function showHighlightBar(rect) {
  const bar = el('hlbar');
  if (!bar) return;
  bar.hidden = false;
  const w = bar.offsetWidth;
  const h = bar.offsetHeight;
  const left = Math.min(Math.max(10, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 10);
  let top = rect.top - h - 10;
  if (top < 8) top = rect.bottom + 10;
  /* 选区在视口外（程序化选中、键盘选择）时，把工具条拉回可见范围 */
  top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - h - 8));
  bar.style.left = `${Math.round(left)}px`;
  bar.style.top = `${Math.round(top)}px`;
}

function hideHighlightBar() {
  const bar = el('hlbar');
  if (bar) bar.hidden = true;
}

function clearSelection() {
  const sel = window.getSelection();
  if (sel) sel.removeAllRanges();
}

function setupHighlighting() {
  ensureHighlightUI();
  let timer = null;
  const refresh = () => {
    const body = el('article-body');
    const sel = window.getSelection();
    if (!body || !sel || sel.rangeCount === 0 || sel.isCollapsed) { hideHighlightBar(); return; }
    const range = sel.getRangeAt(0);
    if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) { hideHighlightBar(); return; }
    const off = rangeToOffsets(range, body);
    if (!off) { hideHighlightBar(); return; }
    if (off.quote.replace(/\s+/g, ' ').trim().length < 2) { hideHighlightBar(); return; }
    if (off.quote.length > 800) { hideHighlightBar(); return; }
    state.pendingSel = off;
    showHighlightBar(range.getBoundingClientRect());
  };

  document.addEventListener('selectionchange', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 180);
  });
  /* 鼠标与触屏分别补一次，移动端拖动手柄时 selectionchange 会抖动 */
  document.addEventListener('mouseup', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 10);
  });
  document.addEventListener('touchend', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 260);
  });
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.hlbar, .hlpop')) return;
    hideHighlightBar();
  });
  window.addEventListener('scroll', () => { hideHighlightBar(); repositionPopover(); }, { passive: true });
  window.addEventListener('resize', () => { hideHighlightBar(); repositionPopover(); });
}

function createMarkFromSelection(color, withNote) {
  const article = state.article;
  const sel = state.pendingSel;
  if (!article || !sel) return;
  const list = marksOf(article.id);
  const overlap = list.filter((m) => m.start < sel.end && m.end > sel.start);

  /* 只有一处重叠且已写过备注：延长原划线，别把备注弄丢 */
  if (overlap.length === 1 && overlap[0].note) {
    const base = overlap[0];
    const body = el('article-body');
    base.start = Math.min(base.start, sel.start);
    base.end = Math.max(base.end, sel.end);
    base.quote = textIndex(body).text.slice(base.start, base.end);
    base.color = color;
    base.updatedAt = new Date().toISOString();
    saveRecords();
    hideHighlightBar();
    clearSelection();
    state.pendingSel = null;
    paintMarks(article);
    toast('已在原划线基础上延长，备注保留');
    return;
  }

  if (overlap.length) {
    state.records.marks[article.id] = list.filter((m) => !overlap.includes(m));
  }
  const mk = {
    id: newMarkId(),
    start: sel.start,
    end: sel.end,
    quote: sel.quote,
    color,
    note: '',
    createdAt: new Date().toISOString(),
  };
  marksOf(article.id).push(mk);
  saveRecords();
  hideHighlightBar();
  clearSelection();
  state.pendingSel = null;
  paintMarks(article);
  if (withNote) {
    const node = document.querySelector(`mark.hl[data-mark-id="${mk.id}"]`);
    openMarkEditor(mk, node || el('article-marks'), true);
  } else {
    toast(overlap.length ? '已划线，并替换了重叠的旧划线' : '已划线，点高亮处可写备注');
  }
}

/* ---- 备注弹层 ---- */

function positionPopover() {
  const pop = el('hlpop');
  const anchor = state.popAnchor;
  if (!pop || pop.hidden || !anchor || !document.contains(anchor)) return;
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
  let top = r.bottom + 10;
  if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 10);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function repositionPopover() {
  const pop = el('hlpop');
  if (pop && !pop.hidden) positionPopover();
}

function openMarkEditor(mk, anchor, isNew) {
  ensureHighlightUI();
  const pop = el('hlpop');
  if (!pop || !mk) return;
  closeMarkPopover(true);
  state.popMarkId = mk.id;
  state.popAnchor = anchor || null;
  pop.querySelector('.hlpop__quote').textContent = `“${String(mk.quote).replace(/\s+/g, ' ').trim()}”`;
  const ta = pop.querySelector('textarea');
  ta.value = mk.note || '';
  pop.querySelector('.hlpop__hint').textContent = isNew
    ? '关闭时会自动保存，也可以留空只做高亮。'
    : '修改后点保存；直接关闭也会自动保存。';
  pop.hidden = false;
  positionPopover();
  ta.focus({ preventScroll: true });
}

function savePopoverNote() {
  const article = state.article;
  const id = state.popMarkId;
  if (!article || !id) return false;
  const pop = el('hlpop');
  const mk = marksOf(article.id).find((m) => m.id === id);
  if (!pop || !mk) return false;
  const next = pop.querySelector('textarea').value.trim();
  if (next === (mk.note || '')) return false;
  mk.note = next;
  mk.updatedAt = new Date().toISOString();
  saveRecords();
  paintMarks(article);
  const node = document.querySelector(`mark.hl[data-mark-id="${id}"]`);
  if (node) state.popAnchor = node;
  repositionPopover();
  return true;
}

function closeMarkPopover(autoSave) {
  const pop = el('hlpop');
  if (!pop || pop.hidden) return;
  if (autoSave) savePopoverNote();
  pop.hidden = true;
  state.popMarkId = null;
  state.popAnchor = null;
}

function deleteMark(id) {
  const article = state.article;
  if (!article || !id) return;
  state.records.marks[article.id] = marksOf(article.id).filter((m) => m.id !== id);
  saveRecords();
  closeMarkPopover(false);
  paintMarks(article);
  toast('划线已删除');
}

function revealMark(id) {
  const node = document.querySelector(`mark.hl[data-mark-id="${id}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList.add('is-flash');
  setTimeout(() => node.classList.remove('is-flash'), 1400);
}

function jumpToMark(articleId, markId) {
  if (state.article && state.article.id === articleId) {
    revealMark(markId);
    return;
  }
  state.pendingMark = markId;
  window.location.hash = `#/read/${articleId}`;
}

/* ---- 文末的划线清单 ---- */

function renderMarkList(article) {
  const box = el('article-marks');
  if (!box) return;
  const list = marksOf(article.id)
    .filter((m) => m && !m.orphan && m.quote)
    .sort((a, b) => a.start - b.start);

  const head = `<div class="marks__head">
      <h2>本篇划线 <span class="marks__num">${list.length}</span></h2>
      <p class="marks__hint">选中正文任意片段即可高亮；点高亮处能写备注。划线只保存在本机浏览器。</p>
    </div>`;

  if (!list.length) {
    box.innerHTML = head;
    return;
  }

  const items = list.map((m, i) => `
    <li class="mark-item" data-mark-id="${esc(m.id)}">
      <button class="mark-item__quote" type="button" data-jump="${esc(m.id)}">
        <span class="mark-item__no">${String(i + 1).padStart(2, '0')}</span>
        <span class="mark-item__text">${esc(String(m.quote).replace(/\s+/g, ' ').trim())}</span>
      </button>
      <p class="mark-item__note">${m.note ? esc(m.note) : '<span class="mark-item__none">未写备注</span>'}</p>
      <div class="mark-item__act">
        <button type="button" data-edit="${esc(m.id)}">${m.note ? '改备注' : '加备注'}</button>
        <button type="button" data-del="${esc(m.id)}">删除</button>
      </div>
    </li>`).join('');

  box.innerHTML = `${head}<ol class="marks__list">${items}</ol>`;
}

function bindMarkList(article) {
  const box = el('article-marks');
  if (!box) return;
  box.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    const id = jump ? jump.dataset.jump : (edit ? edit.dataset.edit : (del ? del.dataset.del : null));
    if (!id) return;
    if (del) { deleteMark(id); return; }
    const mk = marksOf(article.id).find((m) => m.id === id);
    if (!mk) return;
    if (jump) { revealMark(id); return; }
    const node = document.querySelector(`mark.hl[data-mark-id="${id}"]`);
    openMarkEditor(mk, node || box);
  });

  const body = el('article-body');
  if (body) {
    body.addEventListener('click', (e) => {
      const mark = e.target.closest('mark.hl');
      if (!mark) return;
      const mk = marksOf(article.id).find((m) => m.id === mark.dataset.markId);
      if (mk) openMarkEditor(mk, mark);
    });
    body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const mark = e.target.closest('mark.hl');
      if (!mark) return;
      e.preventDefault();
      const mk = marksOf(article.id).find((m) => m.id === mark.dataset.markId);
      if (mk) openMarkEditor(mk, mark);
    });
  }
}

/* ---------------- 学习路径 ---------------- */

function renderPath() {
  const c = state.curriculum;
  const view = el('view-path');
  const published = new Set(state.index.articles.map((a) => a.id));
  const byId = new Map(state.index.articles.map((a) => [a.id, a]));
  const total = c.concepts.length;
  const done = c.concepts.filter((x) => published.has(x.id)).length;
  const currentStage = c.stages.find((stage) => c.concepts
    .filter((x) => x.stageId === stage.id)
    .some((x) => !published.has(x.id)));
  const nextConcept = state.status.nextConceptTitle || '';

  const segs = c.stages.map((stage) => {
    const items = c.concepts.filter((x) => x.stageId === stage.id);
    const hit = items.filter((x) => published.has(x.id)).length;
    const p = items.length ? Math.round((hit / items.length) * 100) : 0;
    return `<div class="track__seg" title="${esc(stage.name)}：已发布 ${hit} / ${items.length}"><span class="track__fill" style="--p:${p}%"></span></div>`;
  }).join('');

  const legend = c.levelTaxonomy.map((l) => `
    <div><dt>${esc(l.name)}</dt><dd>${esc(l.desc)}</dd></div>`).join('');

  let currentMarked = false;
  const stages = c.stages.map((stage) => {
    const items = c.concepts.filter((x) => x.stageId === stage.id);
    const hit = items.filter((x) => published.has(x.id)).length;
    const isCurrent = !currentMarked && hit < items.length;
    if (isCurrent) currentMarked = true;

    const rows = items.map((concept) => {
      const live = published.has(concept.id);
      const meta = byId.get(concept.id);
      const review = c.reviewDays.includes(concept.day) ? '<span class="plan__review">含本周回顾</span>' : '';
      const title = `${esc(concept.titleZh)}${review}
          <span class="plan__en">${esc(concept.titleEn)} · ${esc(concept.type)}</span>`;
      return `<li class="plan__row ${live ? 'plan__row--live' : 'plan__row--planned'}">
        <span class="plan__day">第 ${concept.day} 天</span>
        <span class="plan__title">${live
          ? `<a class="plan__link" href="#/read/${esc(concept.id)}">${title}</a>`
          : title}</span>
        <span class="plan__status ${live ? 'plan__status--live' : ''}">${live
          ? `已发布 · ${fmtShort(meta ? meta.date : concept.publishedDate)}`
          : '计划中'}</span>
      </li>`;
    }).join('');

    const p = items.length ? Math.round((hit / items.length) * 100) : 0;
    return `
      <section class="stage ${isCurrent ? 'stage--current' : ''}">
        <div class="stage__head">
          <span class="stage__no">STAGE ${String(stage.order).padStart(2, '0')}</span>
          <h2 class="stage__name">${esc(stage.name)}</h2>
          <span class="stage__en">${esc(stage.en)}</span>
          ${isCurrent ? '<span class="stage__badge">进行中</span>' : ''}
          <span class="stage__range">DAY ${stage.dayRange[0]}–${stage.dayRange[1]}</span>
        </div>
        <p class="stage__desc">${esc(stage.description)}</p>
        <div class="stage__bar">
          <span class="stage__bar-track"><span class="stage__bar-fill" style="--p:${p}%"></span></span>
          <span class="stage__bar-label">${hit} / ${items.length} 篇</span>
        </div>
        <ul class="plan">${rows}</ul>
      </section>`;
  }).join('');

  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Learning Path</p>
      <h1>学习路径</h1>
      <p>${esc(c.pathNote[0])}</p>
    </div>

    <div class="progress-block">
      <div class="progress-block__top">
        <span class="progress-block__num"><b>${done}</b> / ${total} 篇已发布</span>
        <span class="progress-block__note">每天新增一篇，旧文保留</span>
      </div>
      <div class="track" role="img" aria-label="各阶段已发布比例">${segs}</div>
      <p class="track__legend">六段对应六个阶段，深色为已发布比例；「进行中」为当前正在学习的阶段。</p>
      <p class="progress-block__next">${
        currentStage ? `当前阶段 · <b>${esc(currentStage.name)}</b>` : '全部阶段已完成'
      }${nextConcept ? `<span class="sep">/</span>下一篇 · <b>${esc(nextConcept)}</b>` : ''}</p>
    </div>

    <div class="path-note">
      ${c.pathNote.slice(1).map((p) => `<p>${esc(p)}</p>`).join('')}
      <p>${esc(c.reviewNote)}</p>
    </div>

    <dl class="legend">${legend}</dl>
    <p class="page-head__note">以上区分了理论、模型、原则、方法四个层级。同一主题下的名词常常不在同一层：例如“认知负荷理论”是理论，“脚手架”是由它推出的方法，而“建构性对齐”是从建构主义与目标分类中提炼的原则。把它们放在同一层讨论，是教学设计文档里最常见的混乱来源。</p>

    ${stages}
  `;
  view.hidden = false;
}

/* ---------------- 概念库 ---------------- */

function renderLibrary() {
  const view = el('view-library');
  const themes = [...new Set(state.index.articles.map((a) => a.theme))];
  const months = [...new Set(state.index.articles.map((a) => a.date.slice(0, 7)))].sort().reverse();

  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">Archive</p>
      <h1>概念库</h1>
      <p>已发布的全部概念累积在这里，不会因为新一期上线而消失。默认按学习路径的六个主题聚合，可切换为按发布时间浏览，或直接搜索中英文概念名与关键词。</p>
    </div>
    <div class="toolbar">
      <div class="field field--search">
        <label for="q">搜索</label>
        <input id="q" type="search" placeholder="中文或英文关键词，例如 学习、scaffolding、认知负荷" autocomplete="off">
      </div>
      <div class="field">
        <label for="theme">主题</label>
        <select id="theme">
          <option value="all">全部主题</option>
          ${themes.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="month">月份</label>
        <select id="month">
          <option value="all">全部</option>
          ${months.map((m) => `<option value="${esc(m)}">${esc(m.replace('-', ' 年 '))} 月</option>`).join('')}
        </select>
      </div>
      <div class="field field--view">
        <label>排列</label>
        <div class="segmented" role="group" aria-label="排列方式">
          <button type="button" data-view="theme" aria-pressed="true">按主题</button>
          <button type="button" data-view="time" aria-pressed="false">按时间</button>
        </div>
      </div>
    </div>
    <div class="result-line">
      <span id="result-count"></span>
      <span class="kbd-hint">按 <kbd>/</kbd> 聚焦搜索，<kbd>Esc</kbd> 清空</span>
    </div>
    <div id="lib-body"></div>
  `;
  view.hidden = false;

  const q = el('q');
  const themeSel = el('theme');
  const monthSel = el('month');
  q.value = state.lib.q;
  themeSel.value = state.lib.theme;
  monthSel.value = state.lib.month;

  const syncViewButtons = () => {
    view.querySelectorAll('[data-view]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.view === state.lib.view));
    });
  };
  syncViewButtons();

  const update = () => {
    state.lib.q = q.value;
    state.lib.theme = themeSel.value;
    state.lib.month = monthSel.value;
    renderLibList();
  };
  q.addEventListener('input', update);
  themeSel.addEventListener('change', update);
  monthSel.addEventListener('change', update);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { q.value = ''; update(); }
  });
  view.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.lib.view = btn.dataset.view;
      syncViewButtons();
      renderLibList();
    });
  });
  renderLibList();
}

function matches(article, query) {
  if (!query) return true;
  const hay = [
    article.titleZh, article.titleEn, article.oneLiner, article.theme, article.type,
    article.date, (article.keywords || []).join(' '),
  ].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((token) => hay.includes(token));
}

function highlight(text, query) {
  const safe = esc(text);
  if (!query) return safe;
  const tokens = query.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!tokens.length) return safe;
  return safe.replace(new RegExp(`(${tokens.join('|')})`, 'gi'), '<mark>$1</mark>');
}

function libItemHTML(a, query) {
  const rec = state.records;
  return `<li class="lib-item">
      <div class="lib-item__date">${esc(fmtShort(a.date))}<b>DAY ${String(a.day).padStart(2, '0')}</b></div>
      <div class="lib-item__body">
        <h3 class="lib-item__title"><a href="#/read/${esc(a.id)}">${highlight(a.titleZh, query)}</a></h3>
        <p class="lib-item__en">${highlight(a.titleEn, query)} · ${esc(a.type)}</p>
        <p class="lib-item__one">${highlight(a.oneLiner, query)}</p>
      </div>
      <div class="lib-item__side">
        ${rec.fav[a.id] ? '<span class="mark mark--fav">已收藏</span>' : ''}
        ${rec.read[a.id] ? '<span class="mark">已读</span>' : ''}
        ${rec.notes[a.id] ? '<span class="mark">有笔记</span>' : ''}
        <span>${a.readingMinutes} 分钟</span>
      </div>
    </li>`;
}

function renderLibList() {
  const { q, theme, month, view } = state.lib;
  const query = q.trim();
  const body = el('lib-body');
  const items = state.index.articles.filter((a) => {
    if (theme !== 'all' && a.theme !== theme) return false;
    if (month !== 'all' && !a.date.startsWith(month)) return false;
    return matches(a, query);
  });

  el('result-count').textContent = `共 ${items.length} 篇${query ? ` · 关键词「${query}」` : ''}${theme !== 'all' ? ` · ${theme}` : ''}`;

  if (!items.length) {
    body.innerHTML = `<p class="empty">没有匹配的内容。<br>换一个关键词，或把主题、月份重置为「全部」。</p>`;
    return;
  }

  if (view === 'time') {
    body.innerHTML = `<ul class="lib-list">${items.map((a) => libItemHTML(a, query)).join('')}</ul>`;
    return;
  }

  const order = state.curriculum.stages.map((s) => s.theme);
  const map = new Map();
  items.forEach((a) => {
    if (!map.has(a.theme)) map.set(a.theme, []);
    map.get(a.theme).push(a);
  });
  const keys = [...map.keys()].sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  body.innerHTML = keys.map((k) => {
    const stage = state.curriculum.stages.find((s) => s.theme === k);
    return `<section class="lib-group">
      <div class="lib-group__head">
        <h2 class="lib-group__name">${esc(k)}</h2>
        <span class="lib-group__count">${map.get(k).length} 篇</span>
        ${stage ? `<span class="lib-group__stage">STAGE ${String(stage.order).padStart(2, '0')} · DAY ${stage.dayRange[0]}–${stage.dayRange[1]}</span>` : ''}
      </div>
      <ul class="lib-list">${map.get(k).map((a) => libItemHTML(a, query)).join('')}</ul>
    </section>`;
  }).join('');
}

/* ---------------- 我的记录 ---------------- */

function renderMine() {
  const view = el('view-mine');
  const rec = state.records;
  const all = state.index.articles;
  const byId = new Map(all.map((a) => [a.id, a]));
  const readIds = Object.keys(rec.read).filter((id) => byId.has(id));
  const favIds = Object.keys(rec.fav).filter((id) => byId.has(id));
  const noteIds = Object.keys(rec.notes).filter((id) => byId.has(id) && rec.notes[id].trim());

  const markEntries = [];
  Object.entries(rec.marks).forEach(([aid, arr]) => {
    const a = byId.get(aid);
    if (!a || !Array.isArray(arr)) return;
    arr.forEach((m) => {
      if (m && m.quote) markEntries.push({ ...m, articleId: aid, article: a });
    });
  });
  markEntries.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const notedCount = markEntries.filter((m) => m.note).length;

  const st = state.status;
  const today = shanghaiDate();
  const publishedToday = st.lastPublishedDate === today;
  const total = totalPlanned();
  const pct = total ? Math.round(((st.publishedCount || 0) / total) * 100) : 0;

  const link = (a, when) => `<li><a href="#/read/${esc(a.id)}">${esc(a.titleZh)}</a><span class="when">${esc(when)}</span></li>`;

  const notesHtml = noteIds.length
    ? noteIds.map((id) => {
      const a = byId.get(id);
      return `<div class="note-card">
        <div class="note-card__head">
          <strong><a href="#/read/${esc(id)}">${esc(a.titleZh)}</a></strong>
          <span>${esc(a.date)}</span>
        </div>
        <p class="note-card__text">${esc(rec.notes[id])}</p>
      </div>`;
    }).join('')
    : '<p class="empty" style="padding:22px 0">还没有笔记。在任意文章底部可以写一条。</p>';

  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">My Learning</p>
      <h1>我的记录</h1>
      <p>已读、收藏、笔记与划线备注都只保存在当前浏览器（localStorage）。换设备、换浏览器或清理浏览数据都会丢失，建议定期导出备份。</p>
    </div>

    <div class="stats">
      <div><span class="stat__num">${readIds.length}</span><span class="stat__label">已读</span></div>
      <div><span class="stat__num">${favIds.length}</span><span class="stat__label">收藏</span></div>
      <div><span class="stat__num">${markEntries.length}</span><span class="stat__label">划线</span></div>
      <div><span class="stat__num">${notedCount}</span><span class="stat__label">划线备注</span></div>
      <div><span class="stat__num">${all.length}</span><span class="stat__label">已发布概念</span></div>
    </div>

    <div class="panel-grid">
      <div>
        <section class="panel">
          <h2>复习入口</h2>
          <p class="panel__hint">重新看一遍比多读一篇更有效。随机抽一条已学内容，或从收藏里挑。</p>
          <div class="data-actions">
            <button class="btn btn--primary" type="button" id="review-random" ${all.length ? '' : 'disabled'}>随机复习一条</button>
            <button class="btn" type="button" id="review-fav" ${favIds.length ? '' : 'disabled'}>从收藏中抽</button>
            <a class="btn" href="#/library">去概念库筛选</a>
          </div>
          <p class="note-editor__hint" id="review-hint">${
            readIds.length ? `当前已读 ${readIds.length} 篇，随机复习优先从已读中抽取。` : '还没有标记已读，随机复习会从全部已发布内容中抽取。'
          }</p>
        </section>

        <section class="panel">
          <h2>收藏 <span class="panel__num">${favIds.length}</span></h2>
          <ul class="mini-list">
            ${favIds.length
              ? favIds.sort((a, b) => (rec.fav[a] < rec.fav[b] ? 1 : -1)).map((id) => link(byId.get(id), rec.fav[id].slice(0, 10))).join('')
              : '<li class="none">还没有收藏。</li>'}
          </ul>
        </section>

        <section class="panel">
          <h2>已读 <span class="panel__num">${readIds.length}</span></h2>
          <ul class="mini-list">
            ${readIds.length
              ? readIds.sort((a, b) => (rec.read[a] < rec.read[b] ? 1 : -1)).map((id) => link(byId.get(id), rec.read[id].slice(0, 10))).join('')
              : '<li class="none">还没有标记已读。</li>'}
          </ul>
        </section>
      </div>

      <div>
        <section class="panel">
          <h2>划线标注 <span class="panel__num">${markEntries.length}</span></h2>
          <p class="panel__hint">点划线回到原文位置，按时间倒序排列；黄色为重点、绿色为可用、红色为疑问。</p>
          <div class="mark-cards">${
            markEntries.length
              ? markEntries.map((m) => `<div class="mark-card">
                  <div class="mark-card__head">
                    <strong><button type="button" class="mark-card__link" data-goto="${esc(m.articleId)}" data-mark="${esc(m.id)}">${esc(m.article.titleZh)}</button></strong>
                    <span>${esc(fmtShort(m.article.date))}</span>
                  </div>
                  <p class="mark-card__quote">“${esc(String(m.quote).replace(/\s+/g, ' ').trim())}”</p>
                  ${m.note ? `<p class="mark-card__note">${esc(m.note)}</p>` : ''}
                </div>`).join('')
              : '<p class="empty" style="padding:22px 0">还没有划线。在正文里选中一句话，就会浮出划线工具。</p>'
          }</div>
        </section>

        <section class="panel">
          <h2>我的笔记 <span class="panel__num">${noteIds.length}</span></h2>
          <p class="panel__hint">点击标题回到原文继续修改。</p>
          <div>${notesHtml}</div>
        </section>

        <section class="panel">
          <h2>备份与迁移</h2>
          <p class="panel__hint">导出为一个 JSON 文件，包含已读、收藏与笔记。导入时与现有记录合并，不覆盖已有内容。</p>
          <div class="data-actions">
            <button class="btn" type="button" id="export-btn">导出记录</button>
            <label class="btn" for="import-file" style="cursor:pointer">导入记录</label>
            <input id="import-file" type="file" accept="application/json,.json" hidden>
          </div>
          <p class="note-editor__hint" id="import-hint"></p>
        </section>

        <section class="panel">
          <h2>更新状态</h2>
          <dl class="status-list">
            <div><dt>最近成功更新</dt><dd class="${publishedToday ? 'ok' : 'warn'}">${esc(st.lastPublishedAt ? fmtStamp(st.lastPublishedAt) + '（北京时间）' : '尚无记录')}</dd></div>
            <div><dt>部署验证</dt><dd>${esc(st.deployVerifiedAt ? fmtStamp(st.deployVerifiedAt) + ' 线上已确认' : '尚未记录线上确认')}</dd></div>
            <div><dt>最新一期</dt><dd>${st.lastDay ? `第 ${st.lastDay} 天 · ${esc(st.lastConceptTitle)}` : '尚无记录'}</dd></div>
            <div><dt>今天</dt><dd class="${publishedToday ? 'ok' : 'warn'}">${esc(fmtDateCn(today))} · ${publishedToday ? '已发布' : '尚未发布'}</dd></div>
            <div><dt>进度</dt><dd>已发布 ${st.publishedCount || 0} / ${total} 篇${st.nextConceptTitle ? ` · 下一篇 ${esc(st.nextConceptTitle)}` : ''}
              <span class="mini-progress"><span style="width:${pct}%"></span></span></dd></div>
            <div><dt>更新时间</dt><dd>每日 ${esc(st.schedule.startTime)}（${esc(st.schedule.timezone)}）启动，生成与部署需要数分钟</dd></div>
          </dl>
          <div class="mechanism">
            <p>${esc(st.schedule.note)}</p>
            <p>${esc(st.deployNote)}</p>
            <p>内容分三层存放：<code>data/articles/</code> 每篇一个文件，只增不改；<code>data/index.json</code> 追加一条记录，概念库据此汇聚；<code>data/status.json</code> 覆盖为最新一期指针，首页只读它。因此失败时首页停在上一期并明确提示，已发布的内容不受影响。</p>
          </div>
        </section>
      </div>
    </div>
  `;
  view.hidden = false;

  el('review-random').addEventListener('click', () => {
    const pool = readIds.length ? readIds : all.map((a) => a.id);
    if (!pool.length) { toast('还没有已发布的内容'); return; }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    window.location.hash = `#/read/${pick}`;
  });

  el('review-fav').addEventListener('click', () => {
    if (!favIds.length) { toast('还没有收藏'); return; }
    const pick = favIds[Math.floor(Math.random() * favIds.length)];
    window.location.hash = `#/read/${pick}`;
  });

  el('export-btn').addEventListener('click', exportRecords);
  el('import-file').addEventListener('change', importRecords);

  view.querySelectorAll('.mark-card__link').forEach((btn) => {
    btn.addEventListener('click', () => jumpToMark(btn.dataset.goto, btn.dataset.mark));
  });
}

function exportRecords() {
  const payload = {
    app: '教学设计 · 每日一概念',
    version: 1,
    exportedAt: new Date().toISOString(),
    records: state.records,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daily-concept-records-${shanghaiDate()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出学习记录');
}

async function importRecords(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const hint = el('import-hint');
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const rec = data.records || data;
    if (!rec || typeof rec !== 'object' || !rec.read || typeof rec.read !== 'object') {
      throw new Error('文件格式不符合导出结构');
    }
    let merged = 0;
    for (const bucket of ['read', 'fav', 'notes']) {
      const src = rec[bucket] || {};
      for (const [id, value] of Object.entries(src)) {
        if (!(id in state.records[bucket])) merged += 1;
        if (bucket === 'notes') {
          if (!state.records.notes[id] || String(value).length > String(state.records.notes[id]).length) {
            state.records.notes[id] = value;
          }
        } else if (!state.records[bucket][id]) {
          state.records[bucket][id] = value;
        }
      }
    }
    /* 划线按 id 去重合并，避免同一句被重复导入 */
    for (const [aid, arr] of Object.entries(rec.marks || {})) {
      if (!Array.isArray(arr)) continue;
      if (!state.records.marks[aid]) state.records.marks[aid] = [];
      const exist = new Set(state.records.marks[aid].map((m) => m && m.id));
      arr.forEach((m) => {
        if (m && m.id && m.quote && !exist.has(m.id)) {
          state.records.marks[aid].push(m);
          exist.add(m.id);
          merged += 1;
        }
      });
    }
    saveRecords();
    hint.textContent = `导入完成，新增 ${merged} 条记录（原有记录已保留）。`;
    renderTabs();
    renderMine();
    toast('学习记录已导入');
  } catch (err) {
    hint.textContent = `导入失败：${err.message}`;
    toast('导入失败，请检查文件');
  } finally {
    e.target.value = '';
  }
}

/* ---------------- 事件 ---------------- */

window.addEventListener('hashchange', route);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const pop = el('hlpop');
    if (pop && !pop.hidden) { closeMarkPopover(true); return; }
    const bar = el('hlbar');
    if (bar && !bar.hidden) { hideHighlightBar(); return; }
  }
  if (e.key === 'Escape' && document.body.classList.contains('qnav-open')) {
    closeQNav();
    return;
  }
  /* Alt+H：把当前选中的文字直接标为黄色重点 */
  if (e.altKey && (e.code === 'KeyH' || e.key === 'h') && state.pendingSel) {
    e.preventDefault();
    createMarkFromSelection('gold', false);
    return;
  }
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
  if (e.key === '/' && !typing) {
    const q = el('q');
    if (q) {
      e.preventDefault();
      q.focus();
    }
  }
  /* Alt+1 收起/展开学习内容，Alt+2 收起/展开本篇目录 */
  if (e.altKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
    const name = e.code === 'Digit1' ? 'qnav' : 'toc';
    const cls = name === 'qnav' ? 'qnav-collapsed' : 'toc-collapsed';
    /* 右栏只在宽屏存在，窄屏不响应 */
    if (name === 'toc' && window.innerWidth < 1080) return;
    e.preventDefault();
    setPanel(name, !document.body.classList.contains(cls));
  }
});

paintPanels();
setupChrome();
setupHighlighting();
bootstrap();
