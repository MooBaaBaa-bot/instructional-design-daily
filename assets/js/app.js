/* ============================================================
   教学设计 · 每日一概念
   页面只负责展示 data/ 中已提交的内容，不生成文章、不改写日期。
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
  lib: { q: '', theme: 'all', month: 'all' },
  records: loadRecords(),
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

function shanghaiClock(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  return {
    hour: Number(p.find((x) => x.type === 'hour').value),
    minute: Number(p.find((x) => x.type === 'minute').value),
  };
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

function fmtStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const time = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return `${date.replace(/\//g, '-')} ${time}`;
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

/* ---------------- 本地学习记录 ---------------- */

function emptyRecords() {
  return { version: 1, read: {}, fav: {}, notes: {}, updatedAt: null };
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
  if (!st.lastPublishedAt) {
    dot.className = 'dot dot--stale';
    text.textContent = '尚无发布记录';
    return;
  }
  const stale = st.lastPublishedDate !== today;
  dot.className = stale ? 'dot dot--stale' : 'dot';
  text.innerHTML = stale
    ? `今日（${fmtShort(today)}）尚未发布<span class="sep">·</span>最近一期 ${fmtShort(st.lastPublishedDate)}`
    : `今日已更新<span class="sep">·</span>${fmtStamp(st.lastPublishedAt)}`;
}

function renderTabs() {
  const count = state.index.articles.length;
  el('tab-lib-count').textContent = count;
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
  if (name === 'read' && param) return { name: 'read', id: param };
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

async function route() {
  if (!state.curriculum || !state.index || !state.status) return;
  const r = currentRoute();
  state.route = r.name;

  ['today', 'path', 'library', 'mine'].forEach((v) => { el(ROUTES[v]).hidden = true; });

  if (r.name === 'read') {
    await renderReader(r.id, { standalone: true });
    setActiveTab('read');
    return;
  }

  setActiveTab(r.name);
  if (r.name === 'today') await renderToday();
  if (r.name === 'path') renderPath();
  if (r.name === 'library') renderLibrary();
  if (r.name === 'mine') renderMine();
  el(ROUTES[r.name]).hidden = false;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- 今日 ---------------- */

async function renderToday() {
  const today = shanghaiDate();
  const st = state.status;
  const publishedToday = st.lastPublishedDate === today;
  const view = el('view-today');

  if (!st.lastConceptId) {
    view.innerHTML = `
      <div class="today-banner" role="status"><strong>还没有已发布的内容。</strong>
      第一篇会在下一次更新任务成功后出现在这里。在此之前，这个位置不会显示任何预置文章。</div>
      <div class="page-head"><h1>准备中</h1>
      <p>学习路径已经确定，可在「学习路径」查看 30 天目录。</p></div>`;
    view.hidden = false;
    return;
  }

  const article = await getArticle(st.lastConceptId);
  view.innerHTML = `
    <div class="today-banner ${publishedToday ? 'today-banner--ok' : ''}" role="status">
      ${publishedToday
        ? `<strong>今日已更新。</strong>${fmtDateCn(today)} ${weekdayCn(today)} · 第 ${article.day} 天 · 最近一次成功更新于 ${fmtStamp(st.lastPublishedAt)}（北京时间）。`
        : `<strong>今日尚未发布，下面是最近一期的内容。</strong>今天是 ${fmtDateCn(today)}，站内的最新一期为 ${fmtDateCn(st.lastPublishedDate)}。每日任务在 10:00 启动，检索、撰写、校验与部署需要几分钟；若已过 10:30 仍未出现，说明今天这次更新没有成功，页面不会用旧内容伪装成更新。`}
    </div>
    <article class="article-wrap">
      <header class="article-head">
        <p class="article-head__day">DAY ${String(article.day).padStart(2, '0')} · ${esc(article.theme)}</p>
        <h1>${esc(article.titleZh)}</h1>
        <p class="article-head__en">${esc(article.titleEn)}</p>
        <div class="article-head__meta">
          <span class="chip chip--theme">${esc(article.theme)}</span>
          <span class="chip chip--type">${esc(article.type)}</span>
          <span>${esc(fmtDateCn(article.date))}</span>
          <span>约 ${article.readingMinutes} 分钟</span>
          <span>正文 ${article.wordCount || ''} 字</span>
        </div>
      </header>
      <div class="article" id="article-body"></div>
      <div class="article-actions" id="today-actions"></div>
      <div class="note-editor" id="today-note"></div>
    </article>
  `;
  el('article-body').innerHTML = renderSections(article);
  mountActions(el('today-actions'), el('today-note'), article);
  view.hidden = false;
}

/* ---------------- 阅读器（历史文章） ---------------- */

async function renderReader(id, opts = {}) {
  const view = el('view-today');
  const article = await getArticle(id);
  view.hidden = false;
  if (!article) {
    view.innerHTML = `<p class="empty">没有找到编号为「${esc(id)}」的内容。<br><a href="#/library">返回概念库</a></p>`;
    return;
  }
  const meta = state.index.articles.find((a) => a.id === id);
  view.innerHTML = `
    <p class="eyebrow"><a href="#/library">← 历史概念库</a></p>
    <article class="article-wrap">
      <header class="article-head">
        <p class="article-head__day">DAY ${String(article.day).padStart(2, '0')} · ${esc(article.theme)}</p>
        <h1>${esc(article.titleZh)}</h1>
        <p class="article-head__en">${esc(article.titleEn)}</p>
        <div class="article-head__meta">
          <span class="chip chip--theme">${esc(article.theme)}</span>
          <span class="chip chip--type">${esc(article.type)}</span>
          <span>${esc(fmtDateCn(article.date))}</span>
          <span>约 ${article.readingMinutes} 分钟</span>
          ${meta && meta.updatedAt ? `<span>更新于 ${fmtStamp(meta.updatedAt)}</span>` : ''}
        </div>
      </header>
      <div class="article" id="article-body"></div>
      <div class="article-actions" id="today-actions"></div>
      <div class="note-editor" id="today-note"></div>
    </article>
  `;
  el('article-body').innerHTML = renderSections(article);
  mountActions(el('today-actions'), el('today-note'), article);
  if (!opts.silent) window.scrollTo({ top: 0 });
}

/* ---------------- 文章渲染 ---------------- */

function renderSections(article) {
  return article.sections.map((section, i) => {
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
    return `
      <section class="section" aria-labelledby="sec-${section.key}">
        <div class="section__head">
          <span class="section__no">${no}</span>
          <h2 id="sec-${section.key}">${esc(section.heading)}</h2>
        </div>
        ${body}
      </section>`;
  }).join('');
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

/* ---------------- 阅读操作 ---------------- */

function mountActions(actionsEl, noteEl, article) {
  const id = article.id;
  const rec = state.records;

  actionsEl.innerHTML = `
    <button class="btn" type="button" data-act="read" aria-pressed="${!!rec.read[id]}"></button>
    <button class="btn" type="button" data-act="fav" aria-pressed="${!!rec.fav[id]}"></button>
    <button class="btn btn--quiet" type="button" data-act="jump-note">写笔记</button>
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
    noteEl.querySelector('textarea').focus();
  });

  noteEl.innerHTML = `
    <label for="note-input">我的笔记</label>
    <textarea id="note-input" placeholder="写给自己：这个概念能用在哪个课程、哪次设计里？"></textarea>
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
      hint.textContent = `已保存到本机 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }, 500);
  });
}

/* ---------------- 学习路径 ---------------- */

function renderPath() {
  const c = state.curriculum;
  const view = el('view-path');
  const published = new Set(state.index.articles.map((a) => a.id));
  const byId = new Map(state.index.articles.map((a) => [a.id, a]));

  const legend = c.levelTaxonomy.map((l) => `
    <div><dt>${esc(l.name)}</dt><dd>${esc(l.desc)}</dd></div>`).join('');

  const stages = c.stages.map((stage) => {
    const items = c.concepts.filter((x) => x.stageId === stage.id);
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
    return `
      <section class="stage">
        <div class="stage__head">
          <span class="stage__no">STAGE ${String(stage.order).padStart(2, '0')}</span>
          <h2 class="stage__name">${esc(stage.name)}</h2>
          <span class="stage__en">${esc(stage.en)}</span>
          <span class="stage__range">DAY ${stage.dayRange[0]}–${stage.dayRange[1]}</span>
        </div>
        <p class="stage__desc">${esc(stage.description)}</p>
        <ul class="plan">${rows}</ul>
      </section>`;
  }).join('');

  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">LEARNING PATH</p>
      <h1>学习路径</h1>
      ${c.pathNote.map((p) => `<p>${esc(p)}</p>`).join('')}
      <p>${esc(c.reviewNote)}</p>
    </div>
    <dl class="legend">${legend}</dl>
    <p class="explain" style="margin-bottom:32px">以上区分了理论、模型、原则、方法四个层级。同一主题下的名词常常不在同一层：例如“认知负荷理论”是理论，“脚手架”是由它推出的方法，
      而“建构性对齐”是从建构主义与目标分类中提炼的原则。把它们放在同一层讨论，是教学设计文档里最常见的混乱来源。</p>
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
      <p class="eyebrow">ARCHIVE</p>
      <h1>历史概念库</h1>
      <p>已发布的全部概念，按发布日期倒序。可按主题筛选、按月份浏览，或直接搜索中英文概念名与关键词。</p>
    </div>
    <div class="toolbar">
      <div class="field field--search">
        <label for="q">搜索</label>
        <input id="q" type="search" placeholder="输入中文或英文关键词，例如 学习、scaffolding、认知负荷" autocomplete="off">
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
    </div>
    <div class="result-line">
      <span id="result-count"></span>
      <span class="kbd-hint">按 <kbd>/</kbd> 聚焦搜索，<kbd>Esc</kbd> 清空</span>
    </div>
    <ul class="lib-list" id="lib-list"></ul>
  `;
  view.hidden = false;

  const q = el('q');
  const themeSel = el('theme');
  const monthSel = el('month');
  q.value = state.lib.q;
  themeSel.value = state.lib.theme;
  monthSel.value = state.lib.month;

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

function renderLibList() {
  const { q, theme, month } = state.lib;
  const rec = state.records;
  const list = el('lib-list');
  const items = state.index.articles.filter((a) => {
    if (theme !== 'all' && a.theme !== theme) return false;
    if (month !== 'all' && !a.date.startsWith(month)) return false;
    return matches(a, q.trim());
  });

  el('result-count').textContent = `共 ${items.length} 篇${q ? ` · 关键词「${q.trim()}」` : ''}`;

  if (!items.length) {
    list.innerHTML = `<li class="empty">没有匹配的内容。<br>换一个关键词，或把主题、月份重置为「全部」。</li>`;
    return;
  }

  list.innerHTML = items.map((a) => `
    <li class="lib-item">
      <div class="lib-item__date">${esc(a.date)}<br>DAY ${String(a.day).padStart(2, '0')}</div>
      <div class="lib-item__body">
        <h3 class="lib-item__title"><a href="#/read/${esc(a.id)}">${highlight(a.titleZh, q.trim())}</a></h3>
        <p class="lib-item__en">${highlight(a.titleEn, q.trim())}</p>
        <p class="lib-item__one">${highlight(a.oneLiner, q.trim())}</p>
      </div>
      <div class="lib-item__side">
        <span class="chip chip--theme">${esc(a.theme)}</span>
        ${rec.fav[a.id] ? '<span class="mark mark--fav">已收藏</span>' : ''}
        ${rec.read[a.id] ? '<span class="mark">已读</span>' : ''}
        ${rec.notes[a.id] ? '<span class="mark">有笔记</span>' : ''}
        <span>${a.readingMinutes} 分钟</span>
      </div>
    </li>`).join('');
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

  const st = state.status;
  const today = shanghaiDate();
  const publishedToday = st.lastPublishedDate === today;

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
    : '<p class="empty" style="padding:24px 0">还没有笔记。</p>';

  view.innerHTML = `
    <div class="page-head">
      <p class="eyebrow">MY LEARNING</p>
      <h1>我的记录</h1>
      <p>已读、收藏与笔记只保存在当前浏览器（localStorage）。换设备、换浏览器或清理浏览数据都会丢失，建议定期导出备份。</p>
    </div>

    <div class="panel-grid">
      <div>
        <div class="stat-row">
          <div><span class="stat__num">${readIds.length}</span><span class="stat__label">已读</span></div>
          <div><span class="stat__num">${favIds.length}</span><span class="stat__label">收藏</span></div>
          <div><span class="stat__num">${noteIds.length}</span><span class="stat__label">有笔记</span></div>
          <div><span class="stat__num">${all.length}</span><span class="stat__label">已发布概念</span></div>
        </div>

        <section class="panel">
          <h2>复习</h2>
          <p class="panel__hint">重新看一遍比第一次读懂更重要。随机抽一条已学内容，或从收藏开始。</p>
          <div class="data-actions">
            <button class="btn btn--primary" type="button" id="review-random">随机复习一条</button>
            <a class="btn" href="#/library">去概念库筛选</a>
          </div>
        </section>

        <section class="panel" style="margin-top:38px">
          <h2>收藏 (${favIds.length})</h2>
          <p class="panel__hint">按收藏时间倒序。</p>
          <ul class="mini-list">
            ${favIds.length ? favIds.sort((a, b) => (rec.fav[a] < rec.fav[b] ? 1 : -1)).map((id) => link(byId.get(id), rec.fav[id].slice(0, 10))).join('') : '<li style="color:var(--ink-3)">还没有收藏。</li>'}
          </ul>
        </section>

        <section class="panel" style="margin-top:38px">
          <h2>已读 (${readIds.length})</h2>
          <ul class="mini-list">
            ${readIds.length ? readIds.sort((a, b) => (rec.read[a] < rec.read[b] ? 1 : -1)).map((id) => link(byId.get(id), rec.read[id].slice(0, 10))).join('') : '<li style="color:var(--ink-3)">还没有标记已读。</li>'}
          </ul>
        </section>
      </div>

      <div>
        <section class="panel">
          <h2>我的笔记</h2>
          <p class="panel__hint">共 ${noteIds.length} 条。点击标题回到原文继续修改。</p>
          <div id="notes-panel">${notesHtml}</div>
        </section>

        <section class="panel" style="margin-top:38px">
          <h2>备份与迁移</h2>
          <p class="panel__hint">导出为一个 JSON 文件，包含已读、收藏与笔记。导入时会与现有记录合并，不会覆盖已有内容。</p>
          <div class="data-actions">
            <button class="btn" type="button" id="export-btn">导出记录</button>
            <label class="btn" for="import-file" style="cursor:pointer">导入记录</label>
            <input id="import-file" type="file" accept="application/json,.json" hidden>
          </div>
          <p class="note-editor__hint" id="import-hint"></p>
        </section>

        <section class="panel" style="margin-top:38px">
          <h2>更新状态</h2>
          <dl class="status-list">
            <div><dt>最近成功更新</dt><dd class="${publishedToday ? 'ok' : 'warn'}">${esc(st.lastPublishedAt ? fmtStamp(st.lastPublishedAt) + '（北京时间）' : '尚无记录')}</dd></div>
            <div><dt>最新一期</dt><dd>${st.lastDay ? `第 ${st.lastDay} 天 · ${esc(st.lastConceptTitle)}` : '尚无记录'}</dd></div>
            <div><dt>今天</dt><dd class="${publishedToday ? 'ok' : 'warn'}">${esc(fmtDateCn(today))} · ${publishedToday ? '已发布' : '尚未发布'}</dd></div>
            <div><dt>进度</dt><dd>已发布 ${st.publishedCount} / 计划 ${st.totalPlanned} 篇</dd></div>
            <div><dt>下一篇</dt><dd>${esc(st.nextConceptTitle || '—')}</dd></div>
            <div><dt>更新时间</dt><dd>每日 ${esc(st.schedule.startTime)}（${esc(st.schedule.timezone)}）启动，生成与部署需要数分钟</dd></div>
          </dl>
          <div class="explain">
            <p>${esc(st.schedule.note)}</p>
            <p>${esc(st.deployNote)}</p>
          </div>
        </section>
      </div>
    </div>
  `;
  view.hidden = false;

  el('review-random').addEventListener('click', () => {
    const pool = (readIds.length ? readIds : all.map((a) => a.id));
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    window.location.hash = `#/read/${pick}`;
  });

  el('export-btn').addEventListener('click', exportRecords);
  el('import-file').addEventListener('change', importRecords);
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
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
  if (e.key === '/' && !typing) {
    const q = el('q');
    if (q) {
      e.preventDefault();
      q.focus();
    }
  }
});

bootstrap();
