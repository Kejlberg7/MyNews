const topics = [
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
];
const state = { topic: 'all', items: [], saved: new Set(JSON.parse(localStorage.getItem('interessefeed:saved') || '[]')), lastUpdated: null, busy: false };
const els = {
  topicNavigation: document.querySelector('#topicNavigation'), storyList: document.querySelector('#storyList'), feedStatus: document.querySelector('#feedStatus'),
  emptyState: document.querySelector('#emptyState'), currentTopic: document.querySelector('#currentTopic'), pageTitle: document.querySelector('#pageTitle'),
  pageDescription: document.querySelector('#pageDescription'), sectionTitle: document.querySelector('#sectionTitle'), totalCount: document.querySelector('#totalCount'),
  lastUpdated: document.querySelector('#lastUpdated'), refreshButton: document.querySelector('#refreshButton'), sortSelect: document.querySelector('#sortSelect'),
  toast: document.querySelector('#toast'), sidebar: document.querySelector('#sidebar'),
};

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
      <span class="topic-emoji">${icon}</span><span>${escapeHtml(label)}</span>
    </button>`).join('');
  document.querySelectorAll('[data-topic]').forEach((button) => button.addEventListener('click', () => selectTopic(button.dataset.topic)));
}
function renderStories() {
  const isSavedView = state.topic === 'saved';
  let items = isSavedView ? state.items.filter((item) => state.saved.has(item.link)) : state.topic === 'all' ? state.items : state.items.filter((item) => item.topicId === state.topic);
  if (els.sortSelect.value === 'oldest') items = [...items].reverse();
  els.totalCount.textContent = String(state.items.length);
  els.storyList.innerHTML = items.map((item) => {
    const topic = topicFor(item.topicId);
    const safeLink = validLink(item.link);
    const source = item.source || 'Nyhedskilde';
    return `<article class="story-card">
      <div class="story-top"><span class="topic-pill">${escapeHtml(topic?.label || item.topicLabel || 'Nyt')}</span><span class="story-time">${escapeHtml(relativeTime(item.publishedAt))}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      ${item.description ? `<p class="description">${escapeHtml(item.description)}</p>` : ''}
      <div class="story-bottom"><div class="source-line"><span class="source-dot"></span><span class="source-name">${escapeHtml(source)}</span></div>
        <div class="story-actions"><button class="save-button ${state.saved.has(item.link) ? 'saved' : ''}" data-save="${escapeHtml(item.link)}" aria-label="${state.saved.has(item.link) ? 'Fjern fra gemte' : 'Gem til senere'}" title="${state.saved.has(item.link) ? 'Fjern fra gemte' : 'Gem til senere'}">${state.saved.has(item.link) ? '★' : '☆'}</button><a class="open-link" href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer" aria-label="Åbn artiklen hos ${escapeHtml(source)}" title="Åbn artikel">↗</a></div>
      </div></article>`;
  }).join('');
  document.querySelectorAll('[data-save]').forEach((button) => button.addEventListener('click', () => toggleSaved(button.dataset.save)));
  els.emptyState.classList.toggle('hidden', items.length > 0);
  els.storyList.classList.toggle('hidden', items.length === 0);
  document.querySelector('#emptyTitle').textContent = isSavedView ? 'Ingen gemte historier endnu' : 'Her er roligt lige nu';
  document.querySelector('#emptyText').textContent = isSavedView ? 'Tryk på stjernen ved en artikel, hvis du vil læse den senere.' : 'Der er ikke noget nyt at vise. Prøv igen lidt senere.';
}
function renderHeader() {
  const topic = topicFor(state.topic);
  const title = state.topic === 'all' ? 'Alt nyt' : state.topic === 'saved' ? 'Gemt til senere' : topic?.label;
  els.currentTopic.textContent = title;
  els.sectionTitle.textContent = state.topic === 'saved' ? 'Dine gemte historier' : state.topic === 'all' ? 'Seneste historier' : `Seneste om ${topic?.label.toLowerCase()}`;
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
    const response = await fetch('/api/feed');
    const result = await response.json();
    if (!response.ok && !result.items?.length) throw new Error('Nyhedsfeedet kunne ikke hentes lige nu.');
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
els.refreshButton.addEventListener('click', refresh);
document.querySelector('#emptyRefresh').addEventListener('click', refresh);
els.sortSelect.addEventListener('change', renderStories);
document.querySelector('#menuToggle').addEventListener('click', () => els.sidebar.classList.toggle('open'));
document.addEventListener('click', (event) => { if (els.sidebar.classList.contains('open') && !els.sidebar.contains(event.target) && !event.target.closest('#menuToggle')) els.sidebar.classList.remove('open'); });
renderHeader(); refresh();
