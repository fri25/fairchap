// ══════════════════════════════════════
// MODULE DÉPENSES
// ══════════════════════════════════════

// Catégories : libellé, icône Font Awesome et couleur (réutilisées dans
// les graphiques du dashboard, des statistiques et des rapports)
const CAT_META = {
  carburant:            { label: 'Carburant',       icon: 'fa-gas-pump',          color: '#f59e0b' },
  entretien_moto:       { label: 'Entretien moto',  icon: 'fa-screwdriver-wrench',color: '#3b82f6' },
  reparation:           { label: 'Réparation',      icon: 'fa-toolbox',           color: '#ef4444' },
  credit_communication: { label: 'Crédit comm.',    icon: 'fa-mobile-screen',     color: '#8b5cf6' },
  loyer:                { label: 'Loyer',           icon: 'fa-house',             color: '#06b6d4' },
  internet:             { label: 'Internet',        icon: 'fa-wifi',              color: '#0ea5e9' },
  electricite:          { label: 'Électricité',     icon: 'fa-bolt',              color: '#eab308' },
  achat_materiel:       { label: 'Achat matériel',  icon: 'fa-box-open',          color: '#64748b' },
  salaires:             { label: 'Salaires',        icon: 'fa-user-tie',          color: '#10b981' },
  assurance:            { label: 'Assurance',       icon: 'fa-shield-halved',     color: '#6366f1' },
  marketing:            { label: 'Marketing',       icon: 'fa-bullhorn',          color: '#f43f5e' },
  autres:               { label: 'Autres',          icon: 'fa-ellipsis',          color: '#94a3b8' },
};
function catMeta(cat) {
  return CAT_META[cat] || { label: cat || '—', icon: 'fa-receipt', color: '#94a3b8' };
}
// Pastille icône « 3D » colorée
function catIcon(cat, size = '') {
  const m = catMeta(cat);
  return `<span class="icon3d ${size}" style="--c:${m.color}"><i class="fa-solid ${m.icon}"></i></span>`;
}

let allDepenses      = [];
let filteredDepenses = [];
let depCatFilter     = '';  // catégorie sélectionnée via carte

const catOptions = (first) => `<option value="">${first}</option>` +
  Object.entries(CAT_META).map(([k, v]) =>
    `<option value="${k}" data-icon="${v.icon}" data-color="${v.color}">${v.label}</option>`).join('');

// ── Init sélecteurs mois/année + catégories ──
let depSelectorsReady = false;
function initDepSelectors() {
  if (depSelectorsReady) return; // garde la période choisie en revenant sur la vue
  depSelectorsReady = true;
  fillPeriodSelects(document.getElementById('dep-filter-mois'), document.getElementById('dep-filter-annee'));
  document.getElementById('dep-filter-cat').innerHTML = catOptions('Toutes les catégories');
  document.getElementById('dep-categorie').innerHTML  = catOptions('Sélectionner...');
  fcSync('dep-filter-cat');
  fcSync('dep-categorie');
}

// ── Chargement principal ──
async function loadDepenses() {
  const mois  = parseInt(document.getElementById('dep-filter-mois')?.value || new Date().getMonth()+1);
  const annee = parseInt(document.getElementById('dep-filter-annee')?.value || new Date().getFullYear());
  const { from, to } = monthRange(annee, mois);

  const { data, error } = await fetchAll(() => sb
    .from('depenses')
    .select('*')
    .gte('date_depense', from)
    .lte('date_depense', to)
    .order('date_depense', { ascending: false })
    .order('id'));

  if (error) { toast('Erreur chargement dépenses : ' + error.message, 'error'); return; }
  allDepenses = data;

  await refreshCmdSelectDep();

  depCatFilter = '';
  fcSet('dep-filter-cat', '');
  filterDepenses();
  renderDepCatCards();
  renderDepSummary();
}

async function refreshCmdSelectDep() {
  const { data } = await sb
    .from('commandes')
    .select('id, nom_client, date_course, prix_total')
    .order('date_course', { ascending: false })
    .limit(50);
  const sel = document.getElementById('dep-commande');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Non lié à une course spécifique</option>' +
    (data || []).map(c =>
      `<option value="${esc(c.id)}">${fmtDate(c.date_course)} · ${esc(c.nom_client || 'Sans nom')} · ${fmtFCFA(c.prix_total)}</option>`
    ).join('');
  fcSync('dep-commande');
}

// ── Résumé global ──
function renderDepSummary() {
  const total  = allDepenses.reduce((s, d) => s + Number(d.montant), 0);
  const max    = allDepenses.length ? Math.max(...allDepenses.map(d => Number(d.montant))) : 0;
  const catMap = {};
  allDepenses.forEach(d => { catMap[d.categorie] = (catMap[d.categorie] || 0) + Number(d.montant); });
  const topCat = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0];

  document.getElementById('dep-total-mois').textContent = fmtFCFA(total);
  document.getElementById('dep-nb-mois').textContent    = allDepenses.length;
  document.getElementById('dep-max-mois').textContent   = max ? fmtFCFA(max) : '—';
  document.getElementById('dep-cat-top').innerHTML      = topCat
    ? `${catIcon(topCat[0], 'sm')} ${esc(catMeta(topCat[0]).label)}` : '—';
}

// ── Cartes par catégorie ──
function renderDepCatCards() {
  const catMap = {};
  allDepenses.forEach(d => {
    if (!catMap[d.categorie]) catMap[d.categorie] = { total: 0, count: 0 };
    catMap[d.categorie].total += Number(d.montant);
    catMap[d.categorie].count++;
  });
  const total = Object.values(catMap).reduce((s, x) => s + x.total, 0);

  const grid = document.getElementById('dep-cat-grid');
  if (!Object.keys(catMap).length) { grid.innerHTML = ''; return; }

  grid.innerHTML = Object.entries(catMap)
    .sort((a,b) => b[1].total - a[1].total)
    .map(([cat, stats]) => {
      const meta = catMeta(cat);
      const pct = total ? Math.round(stats.total / total * 100) : 0;
      return `<div class="dep-cat-card ${depCatFilter === cat ? 'selected' : ''}" style="--c:${meta.color}" onclick="toggleDepCat('${esc(cat)}')">
        <div class="dep-cat-top">${catIcon(cat)}<span class="dep-cat-pct">${pct}%</span></div>
        <div class="dep-cat-nom">${esc(meta.label)}</div>
        <div class="dep-cat-total">${fmtFCFA(stats.total)}</div>
        <div class="dep-cat-count">${stats.count} dépense${stats.count > 1 ? 's' : ''}</div>
        <div class="dep-cat-bar"><span style="width:${pct}%"></span></div>
      </div>`;
    }).join('');
}

function toggleDepCat(cat) {
  depCatFilter = depCatFilter === cat ? '' : cat;
  fcSet('dep-filter-cat', depCatFilter);
  renderDepCatCards();
  filterDepenses();
}

// ── Filtres ──
function filterDepenses() {
  const q   = norm(document.getElementById('dep-search')?.value);
  const cat = document.getElementById('dep-filter-cat')?.value || '';
  if (cat !== depCatFilter) { depCatFilter = cat; renderDepCatCards(); }

  filteredDepenses = allDepenses.filter(d => {
    if (cat && d.categorie !== cat) return false;
    if (q) {
      const hay = norm([d.description, d.responsable, d.prestataire, catMeta(d.categorie).label].filter(Boolean).join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderDepTable();
}

function resetDepFilters() {
  document.getElementById('dep-search').value = '';
  depCatFilter = '';
  fcSet('dep-filter-cat', '');
  renderDepCatCards();
  filterDepenses();
}

// ── Rendu table ──
function renderDepTable() {
  const tbody = document.getElementById('dep-tbody');
  const total = filteredDepenses.reduce((s, d) => s + Number(d.montant), 0);
  document.getElementById('dep-count-label').textContent =
    `${filteredDepenses.length} dépense${filteredDepenses.length > 1 ? 's' : ''} · ${fmtFCFA(total)}`;

  if (!filteredDepenses.length) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty">
        <i class="fa-solid fa-receipt"></i>
        <p>Aucune dépense trouvée</p>
        <div class="empty-action">
          <button class="header-btn btn-primary btn-sm" onclick="openNewDepense()">
            <i class="fa-solid fa-plus"></i> Ajouter une dépense
          </button>
        </div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filteredDepenses.map(d => {
    const meta = catMeta(d.categorie);
    return `<tr>
      <td style="font-weight:600">${fmtDate(d.date_depense)}</td>
      <td><span class="cat-pill" style="--c:${meta.color}"><i class="fa-solid ${meta.icon}"></i> ${esc(meta.label)}</span></td>
      <td style="color:var(--text2);font-size:13px">${d.description ? esc(d.description) : '<span class="td-muted">—</span>'}</td>
      <td class="td-muted">${esc(d.responsable || '—')}</td>
      <td class="td-muted">${esc(d.prestataire || '—')}</td>
      <td class="td-mono" style="color:var(--red)">${fmtFCFA(d.montant)}</td>
      <td>
        <div class="row-actions">
          <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openEditDepense('${esc(d.id)}')" title="Modifier"><i class="fa-solid fa-pen"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Ouvrir modal nouvelle dépense ──
function openNewDepense() {
  initDepSelectors();
  document.getElementById('dep-edit-id').value = '';
  document.getElementById('dep-modal-titre').textContent = 'Nouvelle dépense';
  document.getElementById('dep-save-btn').innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer';
  document.getElementById('dep-del-wrap').style.display = 'none';
  fpSet('dep-date', isoDate());
  ['dep-montant', 'dep-description', 'dep-responsable', 'dep-prestataire']
    .forEach(id => document.getElementById(id).value = '');
  fcSet('dep-categorie', '');
  fcSet('dep-commande', '');
  openModal('m-depense');
}

// ── Ouvrir édition ──
function openEditDepense(id) {
  const dep = allDepenses.find(d => d.id === id);
  if (!dep) return;
  document.getElementById('dep-edit-id').value       = id;
  document.getElementById('dep-modal-titre').textContent = 'Modifier la dépense';
  document.getElementById('dep-save-btn').innerHTML  = '<i class="fa-solid fa-check"></i> Mettre à jour';
  document.getElementById('dep-del-wrap').style.display = 'block';
  fpSet('dep-date', dep.date_depense || '');
  document.getElementById('dep-montant').value       = dep.montant || '';
  document.getElementById('dep-description').value   = dep.description || '';
  document.getElementById('dep-responsable').value   = dep.responsable || '';
  document.getElementById('dep-prestataire').value   = dep.prestataire || '';
  fcSet('dep-categorie', dep.categorie || '');
  // Course liée hors des 50 dernières : on l'ajoute pour ne pas perdre le lien
  const sel = document.getElementById('dep-commande');
  if (dep.commande_id && ![...sel.options].some(o => o.value === dep.commande_id)) {
    sel.insertAdjacentHTML('beforeend', `<option value="${esc(dep.commande_id)}">Course liée (${esc(dep.commande_id.slice(0, 8))})</option>`);
  }
  fcSet('dep-commande', dep.commande_id || '');
  openModal('m-depense');
}

// ── Enregistrer dépense ──
async function saveDepense() {
  const editId    = document.getElementById('dep-edit-id').value;
  const montant   = parseFloat(document.getElementById('dep-montant').value) || 0;
  const categorie = document.getElementById('dep-categorie').value;
  const date      = document.getElementById('dep-date').value;
  if (!montant || montant <= 0 || !categorie || !date) { toast('Date, catégorie et montant requis', 'error'); return; }

  const payload = {
    date_depense: date,
    montant,
    categorie,
    description:  document.getElementById('dep-description').value.trim() || null,
    responsable:  document.getElementById('dep-responsable').value.trim() || null,
    prestataire:  document.getElementById('dep-prestataire').value.trim() || null,
    commande_id:  document.getElementById('dep-commande').value || null
  };

  const { error } = editId
    ? await sb.from('depenses').update(payload).eq('id', editId)
    : await sb.from('depenses').insert(payload);

  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  closeModal('m-depense');
  toast(editId ? 'Dépense mise à jour ✓' : 'Dépense enregistrée ✓');
  refreshCurrentView();
}

// ── Supprimer dépense ──
async function deleteDepense() {
  const id = document.getElementById('dep-edit-id').value;
  if (!id || !confirm('Supprimer cette dépense ?')) return;
  const { error } = await sb.from('depenses').delete().eq('id', id);
  if (error) { toast('Erreur suppression : ' + error.message, 'error'); return; }
  closeModal('m-depense');
  toast('Dépense supprimée');
  refreshCurrentView();
}
