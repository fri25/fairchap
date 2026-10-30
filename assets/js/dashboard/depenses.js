// ══════════════════════════════════════
// MODULE DÉPENSES
// ══════════════════════════════════════

const CAT_META = {
  carburant:            { label: 'Carburant',           icon: '⛽', color: '#f59e0b' },
  entretien_moto:       { label: 'Entretien moto',      icon: '🔧', color: '#3b82f6' },
  reparation:           { label: 'Réparation',          icon: '🛠️', color: '#ef4444' },
  credit_communication: { label: 'Crédit comm.',        icon: '📱', color: '#8b5cf6' },
  loyer:                { label: 'Loyer',               icon: '🏠', color: '#06b6d4' },
  internet:             { label: 'Internet',            icon: '📡', color: '#0ea5e9' },
  electricite:          { label: 'Électricité',         icon: '💡', color: '#fbbf24' },
  achat_materiel:       { label: 'Achat matériel',      icon: '📦', color: '#64748b' },
  salaires:             { label: 'Salaires',            icon: '👤', color: '#10b981' },
  assurance:            { label: 'Assurance',           icon: '🛡️', color: '#6366f1' },
  marketing:            { label: 'Marketing',           icon: '📣', color: '#f43f5e' },
  autres:               { label: 'Autres',              icon: '📋', color: '#94a3b8' },
};

let allDepenses      = [];
let filteredDepenses = [];
let depCatFilter     = '';  // catégorie sélectionnée via carte

// ── Init sélecteurs mois/année ──
function initDepSelectors() {
  const now = new Date();
  const mSel = document.getElementById('dep-filter-mois');
  const aSel = document.getElementById('dep-filter-annee');
  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  mSel.innerHTML = MONTHS_FR.map((m, i) =>
    `<option value="${i+1}" ${i+1 === now.getMonth()+1 ? 'selected' : ''}>${m}</option>`
  ).join('');
  aSel.innerHTML = [2026,2027,2028,2029,2030].map(y =>
    `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`
  ).join('');

  // Peupler filtre catégorie
  const catSel = document.getElementById('dep-filter-cat');
  catSel.innerHTML = '<option value="">Toutes les catégories</option>' +
    Object.entries(CAT_META).map(([k, v]) =>
      `<option value="${k}">${v.icon} ${v.label}</option>`
    ).join('');
}

// ── Chargement principal ──
async function loadDepenses() {
  const mois  = parseInt(document.getElementById('dep-filter-mois')?.value || new Date().getMonth()+1);
  const annee = parseInt(document.getElementById('dep-filter-annee')?.value || new Date().getFullYear());
  const pad   = String(mois).padStart(2,'0');
  const from  = `${annee}-${pad}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const to    = `${annee}-${pad}-${lastDay}`;

  const { data, error } = await sb
    .from('depenses')
    .select('*')
    .gte('date_depense', from)
    .lte('date_depense', to)
    .order('date_depense', { ascending: false });

  if (error) { toast('Erreur chargement dépenses', 'error'); return; }
  allDepenses = data || [];

  // Peupler select commandes dans modal
  await refreshCmdSelectDep();

  depCatFilter = '';
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
  if (sel) {
    sel.innerHTML = '<option value="">— Non lié à une course spécifique</option>' +
      (data || []).map(c =>
        `<option value="${c.id}">${c.date_course ? new Date(c.date_course).toLocaleDateString('fr-FR') : ''} · ${c.nom_client || 'Sans nom'} · ${fmtFCFA(c.prix_total)}</option>`
      ).join('');
  }
}

// ── Résumé global ──
function renderDepSummary() {
  const total  = allDepenses.reduce((s, d) => s + d.montant, 0);
  const nb     = allDepenses.length;
  const max    = allDepenses.length ? Math.max(...allDepenses.map(d => d.montant)) : 0;
  // Catégorie dominante
  const catMap = {};
  allDepenses.forEach(d => { catMap[d.categorie] = (catMap[d.categorie] || 0) + d.montant; });
  const topCat = Object.entries(catMap).sort((a,b) => b[1]-a[1])[0];

  document.getElementById('dep-total-mois').textContent = fmtFCFA(total);
  document.getElementById('dep-nb-mois').textContent    = nb;
  document.getElementById('dep-max-mois').textContent   = max ? fmtFCFA(max) : '—';
  document.getElementById('dep-cat-top').textContent    = topCat ? (CAT_META[topCat[0]]?.icon || '') + ' ' + (CAT_META[topCat[0]]?.label || topCat[0]) : '—';
}

// ── Cartes par catégorie ──
function renderDepCatCards() {
  const catMap = {};
  allDepenses.forEach(d => {
    if (!catMap[d.categorie]) catMap[d.categorie] = { total: 0, count: 0 };
    catMap[d.categorie].total += d.montant;
    catMap[d.categorie].count++;
  });

  const grid = document.getElementById('dep-cat-grid');
  if (!Object.keys(catMap).length) { grid.innerHTML = ''; return; }

  grid.innerHTML = Object.entries(catMap)
    .sort((a,b) => b[1].total - a[1].total)
    .map(([cat, stats]) => {
      const meta = CAT_META[cat] || { label: cat, icon: '📋', color: '#94a3b8' };
      const selected = depCatFilter === cat ? 'selected' : '';
      return `<div class="dep-cat-card ${selected}" onclick="toggleDepCat('${cat}')">
        <div class="dep-cat-icon">${meta.icon}</div>
        <div class="dep-cat-nom">${meta.label}</div>
        <div class="dep-cat-total">${fmtFCFA(stats.total)}</div>
        <div class="dep-cat-count">${stats.count} dépense${stats.count > 1 ? 's' : ''}</div>
      </div>`;
    }).join('');
}

function toggleDepCat(cat) {
  depCatFilter = depCatFilter === cat ? '' : cat;
  document.getElementById('dep-filter-cat').value = depCatFilter;
  renderDepCatCards();
  filterDepenses();
}

// ── Filtres ──
function filterDepenses() {
  const q   = (document.getElementById('dep-search')?.value || '').toLowerCase();
  const cat = document.getElementById('dep-filter-cat')?.value || depCatFilter || '';

  filteredDepenses = allDepenses.filter(d => {
    if (cat && d.categorie !== cat) return false;
    if (q) {
      const hay = [d.description, d.responsable, d.prestataire, CAT_META[d.categorie]?.label]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderDepTable();
}

function resetFilters() {
  document.getElementById('cmd-search').value = '';
  document.getElementById('cmd-filter-statut').value = '';
  document.getElementById('cmd-filter-livreur').value = '';
  document.getElementById('cmd-filter-service').value = '';
  if (fpInstances['cmd-filter-date-from']) fpInstances['cmd-filter-date-from'].clear();
  if (fpInstances['cmd-filter-date-to'])   fpInstances['cmd-filter-date-to'].clear();
  fcSync('cmd-filter-statut');
  fcSync('cmd-filter-livreur');
  fcSync('cmd-filter-service');
  updateFilterBadge();
  filterCommandes();
}

// ── Rendu table ──
function renderDepTable() {
  const tbody = document.getElementById('dep-tbody');
  document.getElementById('dep-count-label').textContent =
    `${filteredDepenses.length} dépense${filteredDepenses.length > 1 ? 's' : ''}`;

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
    const meta  = CAT_META[d.categorie] || { label: d.categorie, icon: '📋', color: '#94a3b8' };
    const dt    = d.date_depense ? new Date(d.date_depense).toLocaleDateString('fr-FR') : '—';
    return `<tr>
      <td style="font-weight:600">${dt}</td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(0,0,0,.04);padding:3px 9px;border-radius:99px;font-size:11px;font-weight:600;color:var(--text2)">
          ${meta.icon} ${meta.label}
        </span>
      </td>
      <td style="color:var(--text2);font-size:13px">${d.description || '<span class="td-muted">—</span>'}</td>
      <td class="td-muted">${d.responsable || '—'}</td>
      <td class="td-muted">${d.prestataire || '—'}</td>
      <td class="td-mono" style="color:var(--red)">${fmtFCFA(d.montant)}</td>
      <td>
        <div class="row-actions">
          <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openEditDepense('${d.id}')" title="Modifier">
            <i class="fa-solid fa-pen"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Ouvrir modal nouvelle dépense ──
function openNewDepense() {
  document.getElementById('dep-edit-id').value = '';
  document.getElementById('dep-modal-titre').textContent = 'Nouvelle dépense';
  document.getElementById('dep-save-btn').innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer';
  document.getElementById('dep-del-wrap').style.display = 'none';
  // Reset champs
  const now = new Date().toISOString().split('T')[0];
  document.getElementById('dep-date').value         = now;
  document.getElementById('dep-montant').value      = '';
  document.getElementById('dep-categorie').value    = '';
  document.getElementById('dep-description').value  = '';
  document.getElementById('dep-responsable').value  = '';
  document.getElementById('dep-prestataire').value  = '';
  document.getElementById('dep-commande').value     = '';
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
  document.getElementById('dep-date').value          = dep.date_depense || '';
  document.getElementById('dep-montant').value       = dep.montant || '';
  document.getElementById('dep-categorie').value     = dep.categorie || '';
  document.getElementById('dep-description').value   = dep.description || '';
  document.getElementById('dep-responsable').value   = dep.responsable || '';
  document.getElementById('dep-prestataire').value   = dep.prestataire || '';
  document.getElementById('dep-commande').value      = dep.commande_id || '';
  openModal('m-depense');
}

// ── Enregistrer dépense ──
async function saveDepense() {
  const editId   = document.getElementById('dep-edit-id').value;
  const montant  = parseFloat(document.getElementById('dep-montant').value) || 0;
  const categorie = document.getElementById('dep-categorie').value;
  const date     = document.getElementById('dep-date').value;
  if (!montant || !categorie || !date) { toast('Date, catégorie et montant requis', 'error'); return; }

  const payload = {
    date_depense: date,
    montant,
    categorie,
    description:  document.getElementById('dep-description').value.trim() || null,
    responsable:  document.getElementById('dep-responsable').value.trim() || null,
    prestataire:  document.getElementById('dep-prestataire').value.trim() || null,
    commande_id:  document.getElementById('dep-commande').value || null,
    cree_par:     currentUser?.id || null
  };

  let error;
  if (editId) {
    ({ error } = await sb.from('depenses').update(payload).eq('id', editId));
  } else {
    ({ error } = await sb.from('depenses').insert(payload));
  }

  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  closeModal('m-depense');
  toast(editId ? 'Dépense mise à jour ✓' : 'Dépense enregistrée ✓');
  await loadDepenses();
  if (S.view === 'dashboard') renderDashboard();
}

// ── Supprimer dépense ──
async function deleteDepense() {
  const id = document.getElementById('dep-edit-id').value;
  if (!id || !confirm('Supprimer cette dépense ?')) return;
  const { error } = await sb.from('depenses').delete().eq('id', id);
  if (error) { toast('Erreur suppression', 'error'); return; }
  closeModal('m-depense');
  toast('Dépense supprimée');
  await loadDepenses();
  if (S.view === 'dashboard') renderDashboard();
}

