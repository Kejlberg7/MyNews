const defaultTopics = [
  { id: 'local', label: 'Lokalt', icon: '⌂', intro: 'Nyt tæt på dig — Vinge og Frederikssund.' },
  { id: 'sport', label: 'Sport', icon: '●', intro: 'De største historier og resultater fra sportens verden.' },
  { id: 'football', label: 'Fodbold', icon: '⚽', intro: 'Kampe, transfers og historier fra fodboldens verden.' },
  { id: 'premier-league', label: 'Premier League', icon: '♦', intro: 'Seneste nyt fra den engelske Premier League.' },
  { id: 'superliga', label: 'Superligaen', icon: '▲', intro: 'Kampe, klubber og profiler i den danske Superliga.' },
  { id: 'liverpool', label: 'Liverpool', icon: '◆', intro: 'Alt det seneste om Liverpool FC.' },
  { id: 'fck', label: 'FCK', icon: '◎', intro: 'Nyheder, kampe og transfers fra F.C. København.' },
  { id: 'padel', label: 'Padel', icon: '◉', intro: 'Padelnyheder, turneringer og nyt fra sporten.' },
  { id: 'tech', label: 'Tech & AI', icon: '⌘', intro: 'Udviklingen inden for teknologi og kunstig intelligens.' },
  { id: 'ev', label: 'Biler & elbiler', icon: '↗', intro: 'Nyt om biler, elbiler og transport.' },
  { id: 'gaming', label: 'Spil', icon: '▣', intro: 'Nyt fra spilverdenen og gaming.' },
  { id: 'culture', label: 'Film & serier', icon: '▻', intro: 'Nyt om film, serier og streaming.' },
  { id: 'world', label: 'Verden', icon: '◎', intro: 'Vigtige internationale historier, som er værd at kende til.' },
  { id: 'surprise', label: 'Overraskelser', icon: '✦', intro: 'To historier om dagen fra områder, du måske ikke selv følger endnu.' },
];
const customTopicIcons = ['✦', '◌', '◇', '◈', '○'];
function storedTopics() {
  try {
    const value = JSON.parse(localStorage.getItem('interessefeed:topics') || '[]');
    return Array.isArray(value) ? value.filter((topic) => topic && typeof topic.label === 'string' && typeof topic.id === 'string').slice(0, 20) : [];
  } catch { return []; }
}
const topics = [...defaultTopics, ...storedTopics()];
function storedSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}
function storedObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
const state = { topic: 'all', items: [], saved: storedSet('interessefeed:saved'), seen: storedSet('interessefeed:seen'), feedback: storedObject('interessefeed:feedback'), readFilter: localStorage.getItem('interessefeed:read-filter') || 'all', lastUpdated: null, busy: false };
const els = {
  topicNavigation: document.querySelector('#topicNavigation'), storyList: document.querySelector('#storyList'), feedStatus: document.querySelector('#feedStatus'),
  emptyState: document.querySelector('#emptyState'), currentTopic: document.querySelector('#currentTopic'), pageTitle: document.querySelector('#pageTitle'),
  pageDescription: document.querySelector('#pageDescription'), sectionTitle: document.querySelector('#sectionTitle'), totalCount: document.querySelector('#totalCount'),
  lastUpdated: document.querySelector('#lastUpdated'), refreshButton: document.querySelector('#refreshButton'), sortSelect: document.querySelector('#sortSelect'),
  toast: document.querySelector('#toast'), sidebar: document.querySelector('#sidebar'), themeToggle: document.querySelector('#themeToggle'), readFilter: document.querySelector('#readFilter'),
  topicDialog: document.querySelector('#topicDialog'), topicForm: document.querySelector('#topicForm'), topicName: document.querySelector('#topicName'),
};
els.storyList.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.matches('[data-story-image]')) return;
  const container = image.closest('.post-image');
  const fallback = container?.querySelector('.post-image-fallback');
  if (!container || !fallback) return;
  fallback.hidden = false;
  container.replaceWith(fallback);
}, true);

function applyTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === 'dark';
  els.themeToggle.querySelector('.theme-icon').textContent = isDark ? '☀' : '☾';
  const label = isDark ? 'Skift til lyst tema' : 'Skift til mørkt tema';
  els.themeToggle.setAttribute('aria-label', label);
  els.themeToggle.title = label;
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#131815' : '#f6f5f0';
  if (persist) localStorage.setItem('interessefeed:theme', theme);
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function topicFor(id) { return topics.find((topic) => topic.id === id); }
function relativeTime(value) {
  if (!value) return 'Tidspunkt ukendt';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tidspunkt ukendt';
  return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
function validLink(value) {
  try { return new URL(value).protocol === 'https:' ? value : '#'; } catch { return '#'; }
}
function notify(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2300);
}
function renderTopics() {
  els.topicNavigation.innerHTML = topics.map(({ id, label, icon }) => `
    <button class="nav-item ${state.topic === id ? 'active' : ''}" data-topic="${id}">
      <span class="topic-emoji">${icon}</span><span class="topic-name">${escapeHtml(label)}</span>${id.startsWith('custom-') ? `<span class="remove-topic" data-remove-topic="${id}" role="button" tabindex="0" aria-label="Stop med at følge ${escapeHtml(label)}" title="Stop med at følge">×</span>` : ''}
    </button>`).join('');
  document.querySelectorAll('[data-topic]').forEach((button) => button.addEventListener('click', () => selectTopic(button.dataset.topic)));
  document.querySelectorAll('[data-remove-topic]').forEach((button) => {
    const remove = (event) => { event.stopPropagation(); removeTopic(button.dataset.removeTopic); };
    button.addEventListener('click', remove);
    button.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') remove(event); });
  });
}
function saveCustomTopics() {
  localStorage.setItem('interessefeed:topics', JSON.stringify(topics.filter((topic) => topic.id.startsWith('custom-'))));
}
function addTopic(label) {
  const cleanLabel = label.trim().replace(/\s+/g, ' ');
  if (!cleanLabel) return;
  if (topics.some((topic) => topic.label.toLocaleLowerCase('da') === cleanLabel.toLocaleLowerCase('da'))) return notify('Du følger allerede dette emne.');
  if (topics.length - defaultTopics.length >= 20) return notify('Du kan følge op til 20 egne emner.');
  const id = `custom-${Date.now().toString(36)}`;
  topics.push({ id, label: cleanLabel, query: cleanLabel, icon: customTopicIcons[topics.length % customTopicIcons.length], intro: `Seneste nyt om ${cleanLabel}.` });
  saveCustomTopics(); renderTopics(); selectTopic(id); refresh();
  notify(`${cleanLabel} er føjet til dit feed`);
}
function removeTopic(id) {
  const index = topics.findIndex((topic) => topic.id === id && id.startsWith('custom-'));
  if (index < 0) return;
  const [removed] = topics.splice(index, 1);
  state.items = state.items.filter((item) => item.topicId !== id);
  saveCustomTopics();
  if (state.topic === id) selectTopic('all');
  renderTopics(); renderStories();
  notify(`Du følger ikke længere ${removed.label}`);
}
function renderStories() {
  const isSavedView = state.topic === 'saved';
  let items = isSavedView ? state.items.filter((item) => state.saved.has(item.link)) : state.topic === 'all' ? state.items : state.items.filter((item) => item.topicId === state.topic || item.topicIds?.includes(state.topic));
  if (state.readFilter === 'read') items = items.filter((item) => state.seen.has(item.link));
  if (state.readFilter === 'unread') items = items.filter((item) => !state.seen.has(item.link));
  if (state.topic === 'surprise') items = items.slice(0, 2);
  if (els.sortSelect.value === 'oldest') items = [...items].reverse();
  if (els.sortSelect.value === 'biggest-unseen') {
    items = [...items].sort((a, b) => {
      const seenDifference = Number(state.seen.has(a.link)) - Number(state.seen.has(b.link));
      if (seenDifference) return seenDifference;
      const rankDifference = (Number.isFinite(a.feedRank) ? a.feedRank : 50) - (Number.isFinite(b.feedRank) ? b.feedRank : 50);
      return rankDifference || Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0);
    });
  }
  els.totalCount.textContent = String(state.items.length);
  els.storyList.innerHTML = items.map((item) => {
    const topic = topicFor(item.topicId);
    const safeLink = validLink(item.link);
    const source = item.source || 'Nyhedskilde';
    const topicLabel = state.topic !== 'all' && state.topic !== 'saved' ? topic?.label || item.topicLabel || 'Nyt' : item.topicLabel || 'Nyt';
    const isSeen = state.seen.has(item.link);
    const vote = state.feedback[item.link] || '';
    const imageUrl = item.imageUrl ? validLink(item.imageUrl) : '';
    const summary = item.summary || item.description || '';
    const sourceInitial = [...source.trim()][0]?.toLocaleUpperCase('da') || 'N';
    return `<article class="story-card ${isSeen ? 'seen' : ''}">
      <div class="post-head">
        <span class="post-avatar" aria-hidden="true">${escapeHtml(sourceInitial)}</span>
        <div class="post-byline"><strong>${escapeHtml(source)}</strong><span>${escapeHtml(topicLabel)}</span></div>
        <time class="story-time" datetime="${escapeHtml(item.publishedAt || '')}">${escapeHtml(relativeTime(item.publishedAt))}</time>
      </div>
      ${imageUrl ? `<div class="post-image"><img data-story-image src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" /><div class="post-image-fallback post-placeholder" hidden><span>${escapeHtml(topicLabel)}</span><strong>ET OVERBLIK<br />UDEN STØJ</strong><i aria-hidden="true">✳</i></div></div>` : `<div class="post-placeholder"><span>${escapeHtml(topicLabel)}</span><strong>ET OVERBLIK<br />UDEN STØJ</strong><i aria-hidden="true">✳</i></div>`}
      <div class="post-body">
        <h3>${escapeHtml(item.title)}</h3>
        ${summary ? `<p class="description">${escapeHtml(summary)}</p>` : ''}
        <div class="post-footer">
          <div class="source-line"><span class="source-dot"></span><span class="source-name">${escapeHtml(source)}</span></div>
          <div class="post-actions">
            <button class="feedback-button ${vote === 'like' ? 'selected' : ''}" data-vote="like" data-link="${escapeHtml(item.link)}" aria-label="${vote === 'like' ? 'Fjern like' : 'Like historien'}" aria-pressed="${vote === 'like'}" title="${vote === 'like' ? 'Du kan lide denne historie' : 'Jeg kan lide denne historie'}">👍</button>
            <button class="feedback-button ${vote === 'dislike' ? 'selected' : ''}" data-vote="dislike" data-link="${escapeHtml(item.link)}" aria-label="${vote === 'dislike' ? 'Fjern dislike' : 'Vis færre historier som denne'}" aria-pressed="${vote === 'dislike'}" title="${vote === 'dislike' ? 'Du vil se færre historier som denne' : 'Vis færre historier som denne'}">👎</button>
            <button class="read-state-button ${isSeen ? 'is-seen' : ''}" data-seen="${escapeHtml(item.link)}" aria-label="${isSeen ? 'Markér som ulæst' : 'Markér som læst'}" title="${isSeen ? 'Markér som ulæst' : 'Markér som læst'}">${isSeen ? '✓ Læst' : '○ Ulæst'}</button>
            <button class="save-button ${state.saved.has(item.link) ? 'saved' : ''}" data-save="${escapeHtml(item.link)}" aria-label="${state.saved.has(item.link) ? 'Fjern fra gemte' : 'Gem til senere'}" title="${state.saved.has(item.link) ? 'Fjern fra gemte' : 'Gem til senere'}">${state.saved.has(item.link) ? '★' : '☆'}</button>
            <a class="read-article" data-open="${escapeHtml(item.link)}" href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">Læs hele artiklen <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </div></article>`;
  }).join('');
  document.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', () => toggleSaved(button.dataset.save)));
  document.querySelectorAll('[data-vote]').forEach((button) => button.addEventListener('click', () => toggleFeedback(button.dataset.link, button.dataset.vote)));
  document.querySelectorAll('[data-seen]').forEach((button) => button.addEventListener('click', () => toggleSeen(button.dataset.seen)));
  document.querySelectorAll('[data-open]').forEach((link) => link.addEventListener('click', () => markSeen(link.dataset.open)));
  els.emptyState.classList.toggle('hidden', items.length > 0);
  els.storyList.classList.toggle('hidden', items.length === 0);
  document.querySelector('#emptyTitle').textContent = isSavedView ? 'Ingen gemte historier endnu' : 'Her er roligt lige nu';
  document.querySelector('#emptyText').textContent = isSavedView ? 'Tryk på stjernen ved en artikel, hvis du vil læse den senere.' : 'Der er ikke noget nyt at vise. Prøv igen lidt senere.';
}
function markSeen(link) {
  if (state.seen.has(link)) return;
  state.seen.add(link);
  localStorage.setItem('interessefeed:seen', JSON.stringify([...state.seen]));
  window.setTimeout(renderStories, 0);
}
function toggleSeen(link) {
  if (state.seen.has(link)) state.seen.delete(link); else state.seen.add(link);
  localStorage.setItem('interessefeed:seen', JSON.stringify([...state.seen]));
  renderStories();
}
function toggleFeedback(link, vote) {
  if (state.feedback[link] === vote) delete state.feedback[link]; else state.feedback[link] = vote;
  localStorage.setItem('interessefeed:feedback', JSON.stringify(state.feedback));
  renderStories();
  notify(vote === 'like' ? 'Tak — noteret som en historie, du kan lide.' : 'Tak — noteret, så vi senere kan justere dit udvalg.');
}
function renderHeader() {
  const topic = topicFor(state.topic);
  const title = state.topic === 'all' ? 'Alt nyt' : state.topic === 'saved' ? 'Gemt til senere' : topic?.label;
  els.currentTopic.textContent = title;
  els.sectionTitle.textContent = state.topic === 'saved' ? 'Dine gemte historier' : state.topic === 'all' ? 'Seneste historier' : state.topic === 'world' ? 'Vigtige historier fra verden' : state.topic === 'surprise' ? 'Dagens to overraskelser' : `Seneste om ${topic?.label.toLowerCase()}`;
  if (state.topic === 'all') {
    els.pageTitle.innerHTML = 'Gør plads til<br /><em>det, du følger.</em>';
    els.pageDescription.textContent = 'Nyt fra dine interesser, samlet ét sted. I rækkefølge efter tid — så du selv bestemmer, hvad der er vigtigt.';
  } else {
    els.pageTitle.innerHTML = `${escapeHtml(title)}<br /><em>uden støjen.</em>`;
    els.pageDescription.textContent = state.topic === 'saved' ? 'Historier, du har gemt på denne enhed, klar til at vende tilbage til.' : topic?.intro || '';
  }
}
function selectTopic(id) {
  state.topic = id;
  document.querySelectorAll('.navigation [data-topic]').forEach((button) => button.classList.toggle('active', button.dataset.topic === id));
  renderHeader(); renderStories();
  els.sidebar.classList.remove('open');
}
function toggleSaved(link) {
  if (state.saved.has(link)) state.saved.delete(link); else state.saved.add(link);
  localStorage.setItem('interessefeed:saved', JSON.stringify([...state.saved]));
  renderStories();
  notify(state.saved.has(link) ? 'Gemt til senere' : 'Fjernet fra dine gemte historier');
}
async function refresh() {
  if (state.busy) return;
  state.busy = true;
  els.refreshButton.disabled = true;
  els.refreshButton.querySelector('.refresh-icon').classList.add('spin');
  els.feedStatus.textContent = 'Henter de seneste historier …';
  try {
    const customTopics = topics.filter((topic) => topic.id.startsWith('custom-'));
    const requests = [fetch('/api/feed'), ...customTopics.map((topic) => fetch(`/api/feed?topic=${encodeURIComponent(topic.id)}&query=${encodeURIComponent(topic.query || topic.label)}&label=${encodeURIComponent(topic.label)}`))];
    const responses = await Promise.all(requests);
    const results = await Promise.all(responses.map((response) => response.json().then((result) => ({ response, result }))));
    const successful = results.filter(({ response, result }) => response.ok || result.items?.length);
    if (!successful.length) throw new Error('Nyhedsfeedet kunne ikke hentes lige nu.');
    const result = { items: successful.flatMap((entry) => entry.result.items || []), updatedAt: new Date().toISOString(), errors: results.reduce((sum, entry) => sum + (entry.result.errors || (entry.response.ok ? 0 : 1)), 0) };
    const byLink = new Map();
    for (const item of [...result.items, ...state.items]) if (!byLink.has(item.link)) byLink.set(item.link, item);
    state.items = [...byLink.values()].sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
    state.lastUpdated = new Date(result.updatedAt || Date.now());
    els.feedStatus.textContent = `${state.items.length} historier på tværs af ${topics.length} emner`;
    els.lastUpdated.textContent = `Opdateret ${new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' }).format(state.lastUpdated)}`;
    if (result.errors) notify('Nogle emner kunne ikke opdateres.');
    renderStories();
  } catch (error) {
    els.feedStatus.textContent = 'Kunne ikke hente historier';
    els.lastUpdated.textContent = 'Tjek din forbindelse, og prøv igen.';
    if (!state.items.length) { els.emptyState.classList.remove('hidden'); els.storyList.classList.add('hidden'); }
    notify(error.message || 'Noget gik galt.');
  } finally {
    state.busy = false;
    els.refreshButton.disabled = false;
    els.refreshButton.querySelector('.refresh-icon').classList.remove('spin');
  }
}

document.querySelectorAll('.navigation [data-topic]').forEach((button) => button.addEventListener('click', () => selectTopic(button.dataset.topic)));
renderTopics();
document.querySelector('#todayLabel').textContent = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
document.querySelector('#dateLine').textContent = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase();
applyTheme(document.documentElement.dataset.theme || 'light', false);
els.themeToggle.addEventListener('click', toggleTheme);
els.refreshButton.addEventListener('click', refresh);
document.querySelector('#emptyRefresh').addEventListener('click', refresh);
els.sortSelect.addEventListener('change', renderStories);
els.readFilter.value = ['all', 'read', 'unread'].includes(state.readFilter) ? state.readFilter : 'all';
state.readFilter = els.readFilter.value;
els.readFilter.addEventListener('change', () => {
  state.readFilter = els.readFilter.value;
  localStorage.setItem('interessefeed:read-filter', state.readFilter);
  renderStories();
});
document.querySelector('#menuToggle').addEventListener('click', () => els.sidebar.classList.toggle('open'));
document.querySelector('#addTopicButton').addEventListener('click', () => { els.topicDialog.showModal(); window.setTimeout(() => els.topicName.focus(), 0); });
els.topicForm.addEventListener('submit', (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault(); addTopic(els.topicName.value); els.topicForm.reset(); els.topicDialog.close();
});
document.addEventListener('click', (event) => { if (els.sidebar.classList.contains('open') && !els.sidebar.contains(event.target) && !event.target.closest('#menuToggle')) els.sidebar.classList.remove('open'); });
renderHeader(); refresh();
