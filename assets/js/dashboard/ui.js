// ══════════════════════════════════════
// UTILITAIRES
// ══════════════════════════════════════

// Échappe une valeur avant de l'insérer dans du HTML (protection XSS)
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Texte sans accents ni casse, pour les recherches
function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Récupère TOUTES les lignes d'une requête, page par page.
// Supabase plafonne chaque réponse (1000 lignes par défaut) : sans ça,
// les listes et les totaux sont tronqués sans prévenir.
// buildQuery doit renvoyer une requête NEUVE avec un tri stable (finir par .order('id')).
async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; ) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    if (!data.length) return { data: rows, error: null };
    rows.push(...data);
    from += data.length;
  }
}

// Appel RPC avec message d'erreur uniforme
async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    console.error(`[rpc ${name}]`, error);
    toast(`Erreur serveur (${name}) : ${error.message}`, 'error');
    return null;
  }
  return data;
}

// Dates au format YYYY-MM-DD en heure LOCALE
// (toISOString() passe en UTC : entre minuit et 1 h, « aujourd'hui » devenait la veille)
function isoDate(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function monthRange(annee, mois) {
  const pad = String(mois).padStart(2, '0');
  return { from: `${annee}-${pad}-01`, to: `${annee}-${pad}-${new Date(annee, mois, 0).getDate()}` };
}
function yearRange(annee) { return { from: `${annee}-01-01`, to: `${annee}-12-31` }; }

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

// Remplit un couple de selects mois / année (de la première année d'activité à l'an prochain)
function fillPeriodSelects(mSel, aSel) {
  const now = new Date();
  if (mSel) mSel.innerHTML = MONTHS_FR.map((m, i) =>
    `<option value="${i + 1}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  if (aSel) {
    const years = [];
    for (let y = Math.min(2026, now.getFullYear()); y <= now.getFullYear() + 1; y++) years.push(y);
    aSel.innerHTML = years.map(y =>
      `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`).join('');
  }
  if (mSel) fcSync(mSel.id);
  if (aSel) fcSync(aSel.id);
}

const STATUTS = {
  en_attente: { label: 'En attente', icon: 'fa-hourglass-half' },
  en_cours:   { label: 'En cours',   icon: 'fa-person-biking' },
  'livré':    { label: 'Livrée',     icon: 'fa-circle-check' },
  'annulé':   { label: 'Annulée',    icon: 'fa-circle-xmark' },
};
function statutBadge(statut) {
  const s = STATUTS[statut] || { label: statut, icon: 'fa-circle' };
  return `<span class="badge badge-${esc(statut)}"><i class="fa-solid ${s.icon}"></i> ${esc(s.label)}</span>`;
}

// ══════════════════════════════════════
// FCSELECT & FLATPICKR UTILITIES
// ══════════════════════════════════════
class FCSelect {
  constructor(el) {
    this.select = el;
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'fc-select-wrap';
    this.select.parentNode.insertBefore(this.wrapper, this.select);
    this.wrapper.appendChild(this.select);

    this.selectedDiv = document.createElement('div');
    this.selectedDiv.className = 'fc-select-selected';
    this.wrapper.appendChild(this.selectedDiv);

    this.optionsDiv = document.createElement('div');
    this.optionsDiv.className = 'fc-select-options';
    this.wrapper.appendChild(this.optionsDiv);

    this.render();

    this.selectedDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllFCSelects(this);
      this.wrapper.classList.toggle('open');
    });

    this.observer = new MutationObserver(() => this.render());
    this.observer.observe(this.select, { childList: true });
  }

  // Libellé d'une option : icône facultative (data-icon) + texte échappé
  label(opt) {
    if (!opt) return '';
    const icon = opt.dataset.icon ? `<i class="fa-solid ${esc(opt.dataset.icon)} fc-opt-icon" style="color:${esc(opt.dataset.color || 'inherit')}"></i>` : '';
    return icon + `<span>${esc(opt.text)}</span>`;
  }

  render() {
    this.optionsDiv.innerHTML = '';
    const options = Array.from(this.select.options);
    const selOpt = this.select.options[this.select.selectedIndex];
    this.selectedDiv.innerHTML = `<span class="fc-sel-label">${this.label(selOpt)}</span><i class="fa-solid fa-chevron-down"></i>`;

    options.forEach((opt, index) => {
      const div = document.createElement('div');
      div.className = 'fc-select-option' + (index === this.select.selectedIndex ? ' selected' : '');
      div.innerHTML = this.label(opt);
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select.selectedIndex = index;
        this.wrapper.classList.remove('open');
        this.select.dispatchEvent(new Event('change'));
        this.render();
      });
      this.optionsDiv.appendChild(div);
    });
  }
  sync() { this.render(); }
}

const fcInstances = new Map();
function initFCSelects() {
  document.querySelectorAll('select.fselect, select.filter-select').forEach(sel => {
    if (!fcInstances.has(sel)) fcInstances.set(sel, new FCSelect(sel));
  });
  document.addEventListener('click', () => closeAllFCSelects());
}
function closeAllFCSelects(except) {
  fcInstances.forEach(inst => { if (inst !== except) inst.wrapper.classList.remove('open'); });
}
function fcSync(id) {
  const el = document.getElementById(id);
  if (el && fcInstances.has(el)) fcInstances.get(el).sync();
}
// Change la valeur d'un select ET de son habillage personnalisé
function fcSet(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value ?? '';
  fcSync(id);
}

let fpInstances = {};
function initDatePickers() {
  if (flatpickr.l10ns.fr) flatpickr.localize(flatpickr.l10ns.fr);

  document.querySelectorAll('.finput-date').forEach(el => {
    if (el.id === 'dash-date-picker') return; // instance dédiée (initDashDatePicker)
    const opts = { dateFormat: "Y-m-d", disableMobile: true };

    // Filtre de dates des commandes : si une borne est vide, elle prend la date du jour
    if (el.id === 'cmd-filter-date-from' || el.id === 'cmd-filter-date-to') {
      const otherId = el.id === 'cmd-filter-date-from' ? 'cmd-filter-date-to' : 'cmd-filter-date-from';
      opts.onChange = function(selectedDates, dateStr) {
        const other = document.getElementById(otherId);
        if (dateStr && other && !other.value) fpSet(otherId, isoDate());
        filterCommandes();
        updateFilterBadge();
      };
    }

    fpInstances[el.id] = flatpickr(el, opts);
  });

  const timeOpts = { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, disableMobile: true };
  document.querySelectorAll('input[type="time"], .finput-time').forEach(el => {
    if (el.type === 'time') el.type = 'text';
    fpInstances[el.id] = flatpickr(el, timeOpts);
  });
}
function fpSet(id, val) {
  if (fpInstances[id]) {
    if (val) fpInstances[id].setDate(val, false); else fpInstances[id].clear();
  } else { const el = document.getElementById(id); if (el) el.value = val || ''; }
}

// ══════════════════════════════════════
// AUTOCOMPLÉTION
// Clavier : ↑ ↓ pour choisir, Entrée pour valider la suggestion
// surlignée (la première l'est d'office), Échap pour fermer.
// ══════════════════════════════════════
function attachAutocomplete(input, { source, onPick, min = 1, max = 8 }) {
  if (!input || input.dataset.ac) return;
  input.dataset.ac = '1';
  input.setAttribute('autocomplete', 'off');

  const box = document.createElement('div');
  box.className = 'ac-box';
  box.hidden = true;
  input.parentNode.appendChild(box);

  let items = [], active = -1;

  const close = () => { box.hidden = true; items = []; active = -1; };
  const highlight = (i) => {
    active = i;
    box.querySelectorAll('.ac-item').forEach((el, j) => el.classList.toggle('active', j === i));
    box.querySelector('.ac-item.active')?.scrollIntoView({ block: 'nearest' });
  };
  const pick = (i) => {
    const it = items[i];
    if (!it) return;
    input.value = it.value;
    close();
    onPick?.(it);
    input.dispatchEvent(new Event('change'));
  };

  const refresh = () => {
    const q = norm(input.value);
    if (q.length < min) return close();
    // Les suggestions qui COMMENCENT par la saisie d'abord, puis les plus fréquentes
    items = source()
      .map(it => ({ it, n: norm(it.value) + ' ' + norm(it.sub) }))
      .filter(x => x.n.includes(q))
      .sort((a, b) => (b.n.startsWith(q) - a.n.startsWith(q)) || ((b.it.n || 0) - (a.it.n || 0)))
      .slice(0, max)
      .map(x => x.it);
    // Saisie déjà identique à l'unique suggestion : inutile d'insister
    if (!items.length || (items.length === 1 && norm(items[0].value) === q)) return close();

    box.innerHTML = items.map((it, i) => `
      <div class="ac-item" data-i="${i}">
        <div class="ac-main">${esc(it.value)}</div>
        ${it.sub ? `<div class="ac-sub">${esc(it.sub)}</div>` : ''}
        ${it.n ? `<span class="ac-count">${it.n}×</span>` : ''}
      </div>`).join('');
    box.hidden = false;
    highlight(0);
  };

  input.addEventListener('input', refresh);
  input.addEventListener('focus', () => { if (input.value) refresh(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight((active + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight((active - 1 + items.length) % items.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (active >= 0) { if (e.key === 'Enter') e.preventDefault(); pick(active); }
    }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  box.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.ac-item');
    if (el) { e.preventDefault(); pick(Number(el.dataset.i)); }
  });
}

// ══════════════════════════════════════
// SÉLECTEUR DE LIVREURS (plusieurs possibles par course)
// ══════════════════════════════════════
function renderLivreurPicker(containerId, selectedIds = []) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const sel = new Set(selectedIds);
  // Livreurs actifs + éventuels inactifs déjà affectés à cette course
  const list = allLivreurs.filter(l => l.actif || sel.has(l.id));
  if (!list.length) {
    el.innerHTML = `<div class="td-muted" style="font-size:12px">Aucun livreur actif — ajoutez-en dans Paramètres.</div>`;
    return;
  }
  el.innerHTML = list.map(l => `
    <button type="button" class="liv-chip ${sel.has(l.id) ? 'on' : ''}" data-id="${esc(l.id)}" aria-pressed="${sel.has(l.id)}">
      <span class="liv-chip-av">${esc(l.nom.slice(0, 2).toUpperCase())}</span>
      ${esc(livreurLabel(l))}${l.actif ? '' : ' <em>(inactif)</em>'}
    </button>`).join('');
  el.querySelectorAll('.liv-chip').forEach(b => b.addEventListener('click', () => {
    b.classList.toggle('on');
    b.setAttribute('aria-pressed', b.classList.contains('on'));
  }));
}
function getPickedLivreurs(containerId) {
  return [...document.querySelectorAll(`#${containerId} .liv-chip.on`)].map(b => b.dataset.id);
}
function livreurLabel(l) { return l.nom + (l.prenom ? ' ' + l.prenom : ''); }

// ══════════════════════════════════════
// UI INIT
// ══════════════════════════════════════
function initDashDatePicker() {
  flatpickr('#dash-date-picker', {
    locale: 'fr',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'j M Y',
    maxDate: 'today',
    onChange: () => renderDashboard()
  });
}

function resetDashDate() {
  const fp = document.getElementById('dash-date-picker')?._flatpickr;
  if (fp) fp.clear();
  renderDashboard();
}

function initUI() {
  // Date header
  const now = new Date();
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dateStr = now.toLocaleDateString('fr-FR', opts);
  document.getElementById('header-date').textContent = dateStr;
  const dashDateEl = document.getElementById('dash-date');
  if (dashDateEl) dashDateEl.textContent = dateStr;
  const footerYear = document.getElementById('footer-year');
  if (footerYear) footerYear.textContent = now.getFullYear();

  // Greeting
  const h = now.getHours();
  const greet = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const prenom = currentProfil?.prenom || currentProfil?.nom || '';
  document.getElementById('dash-greeting').textContent = `${greet}${prenom ? ', ' + prenom : ''} 👋`;

  // Navigation
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', () => {
      navigate(el.dataset.view);
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  initDashDatePicker();
}

// ══════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════
const pageTitles = {
  dashboard: 'Dashboard',
  commandes: 'Commandes',
  depenses: 'Dépenses',
  statistiques: 'Statistiques',
  clients: 'Clients',
  rapport: 'Rapports PDF',
  parametres: 'Paramètres'
};
const pageCTA = {
  dashboard:    { label: 'Nouvelle course', action: () => openNewCommande() },
  commandes:    { label: 'Nouvelle course', action: () => openNewCommande() },
  depenses:     { label: 'Ajouter dépense', action: () => openNewDepense() },
  statistiques: { label: null },
  clients:      { label: null },
  rapport:      { label: null },
  parametres:   { label: null }
};
// Vues réservées à l'administrateur (le RLS protège aussi les données côté base)
const ADMIN_VIEWS = ['statistiques', 'clients', 'rapport', 'parametres'];

function navigate(v) {
  if (ADMIN_VIEWS.includes(v) && !isAdmin) v = 'dashboard';
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('[data-view]').forEach(el => el.classList.remove('active'));
  const view = document.getElementById('view-' + v);
  if (view) view.classList.add('active');
  document.querySelectorAll(`[data-view="${v}"]`).forEach(el => el.classList.add('active'));
  document.getElementById('page-title').textContent = pageTitles[v] || v;
  const cta = pageCTA[v];
  const ctaBtn = document.getElementById('header-cta');
  if (cta?.label) {
    ctaBtn.style.display = 'flex';
    ctaBtn.querySelector('.cta-text').textContent = cta.label;
    ctaBtn.onclick = cta.action;
  } else {
    ctaBtn.style.display = 'none';
  }
  S.view = v;
  if (v === 'dashboard')    renderDashboard();
  if (v === 'commandes')    loadCommandes();
  if (v === 'depenses')     { initDepSelectors();  loadDepenses(); }
  if (v === 'statistiques') { initStatSelectors(); loadStats(); }
  if (v === 'clients')      loadClients();
  if (v === 'rapport')      initRapportSelectors();
  if (v === 'parametres')   initParamView();
}

// Rafraîchit la vue courante après une écriture
function refreshCurrentView() {
  if (S.view === 'dashboard') renderDashboard();
  if (S.view === 'commandes') loadCommandes();
  if (S.view === 'depenses')  loadDepenses();
}

// ══════════════════════════════════════
// SIDEBAR MOBILE
// ══════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('mob-overlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mob-overlay').classList.remove('show');
}

// ══════════════════════════════════════
// MODAL
// ══════════════════════════════════════
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
document.querySelectorAll('.moverlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); })
);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.moverlay.open').forEach(o => o.classList.remove('open'));
});

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
let toastTimer;
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ══════════════════════════════════════
// FORMATAGE
// ══════════════════════════════════════
function fmtFCFA(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal', maximumFractionDigits: 0 })
    .format(Number(n || 0)) + ' FCFA';
}
function fmtK(v) { return Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'K' : v; }
function fmtDate(d) { return d ? parseDate(d).toLocaleDateString('fr-FR') : '—'; }
