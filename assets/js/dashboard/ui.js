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

  render() {
    this.optionsDiv.innerHTML = '';
    const options = Array.from(this.select.options);
    const selOpt = this.select.options[this.select.selectedIndex];
    this.selectedDiv.innerHTML = `<span>${selOpt ? selOpt.text : ''}</span><i class="fa-solid fa-chevron-down"></i>`;

    options.forEach((opt, index) => {
      const div = document.createElement('div');
      div.className = 'fc-select-option' + (index === this.select.selectedIndex ? ' selected' : '');
      div.innerHTML = opt.text;
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select.selectedIndex = index;
        this.selectedDiv.innerHTML = `<span>${opt.text}</span><i class="fa-solid fa-chevron-down"></i>`;
        this.wrapper.classList.remove('open');
        this.select.dispatchEvent(new Event('change'));
        Array.from(this.optionsDiv.children).forEach(c => c.classList.remove('selected'));
        div.classList.add('selected');
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

let fpInstances = {};
function initDatePickers() {
  if (flatpickr.l10ns.fr) flatpickr.localize(flatpickr.l10ns.fr);
  const todayStr = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };

  document.querySelectorAll('.finput-date').forEach(el => {
    const opts = { dateFormat: "Y-m-d", disableMobile: true };

    // Auto-fill logic for cmd date filters
    if (el.id === 'cmd-filter-date-from') {
      opts.onChange = function(selectedDates, dateStr) {
        filterCommandes();
        updateFilterBadge();
        // If date-to is empty, auto-set to today
        const toEl = document.getElementById('cmd-filter-date-to');
        if (dateStr && toEl && !toEl.value) {
          fpSet('cmd-filter-date-to', todayStr());
        }
      };
    } else if (el.id === 'cmd-filter-date-to') {
      opts.onChange = function(selectedDates, dateStr) {
        filterCommandes();
        updateFilterBadge();
        // If date-from is empty, auto-set to today
        const fromEl = document.getElementById('cmd-filter-date-from');
        if (dateStr && fromEl && !fromEl.value) {
          fpSet('cmd-filter-date-from', todayStr());
        }
      };
    } else {
      opts.onChange = function() { filterCommandes && filterCommandes(); };
    }

    fpInstances[el.id] = flatpickr(el, opts);
  });

  const timeOpts = { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, disableMobile: true };
  document.querySelectorAll('input[type="time"], #c-heure').forEach(el => {
    if(el.type==='time') el.type='text';
    fpInstances[el.id] = flatpickr(el, timeOpts);
  });
}
function fpSet(id, val) {
  if (fpInstances[id]) fpInstances[id].setDate(val);
  else { const el = document.getElementById(id); if(el) el.value = val; }
}


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
  if (fp) {
    fp.clear();
    fp.setDate(new Date(), true);
  }
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

  // Greeting
  const h = now.getHours();
  const greet = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const prenom = currentProfil?.prenom || currentProfil?.nom || '';
  document.getElementById('dash-greeting').textContent = `${greet}${prenom ? ', ' + prenom : ''} 👋`;

  // Default date/heure modal
  fpSet('c-date', now.toISOString().split('T')[0]);
  fpSet('c-heure', now.toTimeString().slice(0, 5));

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
  rapport: 'Rapport PDF',
  parametres: 'Paramètres'
};
const pageCTA = {
  dashboard:    { label: 'Nouvelle course', action: "openModal('m-commande')" },
  commandes:    { label: 'Nouvelle course', action: "openModal('m-commande')" },
  depenses:     { label: 'Ajouter dépense', action: "openNewDepense()" },
  statistiques: { label: null },
  clients:      { label: null },
  rapport:      { label: null },
  parametres:   { label: null }
};

function navigate(v) {
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
    ctaBtn.onclick = new Function(cta.action);
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

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
let toastTimer;
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ══════════════════════════════════════
// FORMATAGE
// ══════════════════════════════════════
function fmtFCFA(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal', maximumFractionDigits: 0 })
    .format(Number(n || 0)) + ' FCFA';
}
function fmtDate(d) { return new Date(d).toLocaleDateString('fr-FR'); }

