// ══════════════════════════════════════
// RÉPARTITION PREVIEW
// ══════════════════════════════════════
function updateRepartition() {
  const montant = parseFloat(document.getElementById('c-montant').value) || 0;
  const preview = document.getElementById('repartition-preview');
  if (montant <= 0) { preview.style.display = 'none'; return; }
  preview.style.display = 'block';
  // Chercher si le service a une répartition spécifique
  const svcId = document.getElementById('c-service').value;
  const svc = services.find(s => s.id === svcId);
  const pL = svc?.pct_livreur    || parametres.pct_livreur;
  const pC = svc?.pct_carburant  || parametres.pct_carburant;
  const pE = svc?.pct_entreprise || parametres.pct_entreprise;
  document.getElementById('rp-pct-l').textContent = pL;
  document.getElementById('rp-pct-c').textContent = pC;
  document.getElementById('rp-pct-e').textContent = pE;
  document.getElementById('rp-val-l').textContent = fmtFCFA(Math.round(montant * pL / 100));
  document.getElementById('rp-val-c').textContent = fmtFCFA(Math.round(montant * pC / 100));
  document.getElementById('rp-val-e').textContent = fmtFCFA(Math.round(montant * pE / 100));
}

// ══════════════════════════════════════
// SAVE COMMANDE
// ══════════════════════════════════════
async function saveCommande() {
  const montant = parseFloat(document.getElementById('c-montant').value) || 0;
  const depart  = document.getElementById('c-depart').value.trim();
  const arrivee = document.getElementById('c-arrivee').value.trim();
  const livId   = document.getElementById('c-livreur').value;
  if (!montant || !depart || !arrivee || !livId) {
    toast('Champs obligatoires manquants', 'error'); return;
  }
  const { data: cmd, error } = await sb.from('commandes').insert({
    nom_client:       document.getElementById('c-client').value.trim() || null,
    telephone_client: document.getElementById('c-tel').value.trim() || null,
    service_id:       document.getElementById('c-service').value || null,
    adresse_depart:   depart,
    adresse_arrivee:  arrivee,
    zone:             document.getElementById('c-zone').value.trim() || null,
    prix_total:       montant,
    date_course:      document.getElementById('c-date').value,
    heure_debut:      document.getElementById('c-heure').value || null,
    observations:     document.getElementById('c-obs').value.trim() || null,
    statut:           'en_cours',
    cree_par:         currentUser.id
  }).select().single();

  if (error) { toast('Erreur : ' + error.message, 'error'); return; }

  // Lier le livreur
  await sb.from('commandes_livreurs').insert({ commande_id: cmd.id, livreur_id: livId });

  closeModal('m-commande');
  toast('Course enregistrée avec répartition calculée !');
  renderDashboard();
}

// ══════════════════════════════════════
// MODULE COMMANDES
// ══════════════════════════════════════
let allCommandes   = [];   // données brutes depuis Supabase
let filteredCmds   = [];   // après filtres
let livreursMap    = {};   // id → nom
let servicesMap    = {};   // id → nom
let currentEditId  = null; // id en cours d'édition
let cmdPage        = 0;
const CMD_PER_PAGE = 15;

// ── Chargement principal ──
async function loadCommandes() {
  const { data, error } = await sb
    .from('commandes')
    .select(`
      id, date_course, heure_debut, nom_client, telephone_client,
      service_id, adresse_depart, adresse_arrivee, zone,
      prix_total, statut, observations, created_at,
      commandes_livreurs(livreur_id)
    `)
    .order('date_course', { ascending: false })
.order('heure_debut', { ascending: false });

  if (error) { toast('Erreur chargement commandes', 'error'); return; }
  allCommandes = data || [];

  // Peupler les filtres livreurs et services
  const livSel = document.getElementById('cmd-filter-livreur');
  livSel.innerHTML = '<option value="">Tous les livreurs</option>' +
    livreurs.map(l => `<option value="${l.id}">${l.nom}</option>`).join('');

  const svcSel = document.getElementById('cmd-filter-service');
  svcSel.innerHTML = '<option value="">Tous les services</option>' +
    services.map(s => `<option value="${s.id}">${s.nom_service}</option>`).join('');

  // Maps
  livreursMap = Object.fromEntries(livreurs.map(l => [l.id, l.nom]));
  servicesMap = Object.fromEntries(services.map(s => [s.id, s.nom_service]));

  // // Peupler selects du modal édition
  ['edit-service','edit-livreur'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'edit-service') {
      el.innerHTML = '<option value="">Sélectionner...</option>' +
        services.map(s => `<option value="${s.id}">${s.nom_service}</option>`).join('');
    } else {
      el.innerHTML = '<option value="">Sélectionner...</option>' +
        livreurs.map(l => `<option value="${l.id}">${l.nom}</option>`).join('');
    }
  });

  fcSync('cmd-filter-livreur');
  fcSync('cmd-filter-service');
  fcSync('edit-service');
  fcSync('edit-livreur');
  filterCommandes();
  renderCmdStats();
}
// ── Smart Filters Panel ──
function toggleSmartFilters() {
  const panel = document.getElementById('smart-filters-panel');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
  } else {
    panel.classList.add('open');
    closeAllFCSelects();
    setTimeout(() => {
      document.addEventListener('click', closePanelOutside, { once: true });
    }, 0);
  }
}

function closePanelOutside(e) {
  const wrap = document.getElementById('smart-filters-wrap');
  const panel = document.getElementById('smart-filters-panel');
  if (!wrap || !panel) return;
  if (!wrap.contains(e.target)) {
    panel.classList.remove('open');
  } else if (panel.classList.contains('open')) {
    setTimeout(() => {
      document.addEventListener('click', closePanelOutside, { once: true });
    }, 0);
  }
}

function updateFilterBadge() {
  const badge = document.getElementById('cmd-filter-badge');
  if (!badge) return;
  const statut   = document.getElementById('cmd-filter-statut')?.value || '';
  const livId    = document.getElementById('cmd-filter-livreur')?.value || '';
  const svcId    = document.getElementById('cmd-filter-service')?.value || '';
  const dateFrom = document.getElementById('cmd-filter-date-from')?.value || '';
  const dateTo   = document.getElementById('cmd-filter-date-to')?.value || '';
  const count = [statut, livId, svcId, dateFrom, dateTo].filter(v => v !== '').length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}
// ── Stats mini-bar ──
function renderCmdStats() {
  const total    = allCommandes.length;
  const livrees  = allCommandes.filter(c => c.statut === 'livré').length;
  const encours  = allCommandes.filter(c => c.statut === 'en_cours').length;
  const annulees = allCommandes.filter(c => c.statut === 'annulé').length;
  const revenus  = allCommandes
    .filter(c => c.statut === 'livré')
    .reduce((s, c) => s + (c.prix_total || 0), 0);

  document.getElementById('cstat-total').textContent    = total;
  document.getElementById('cstat-livrees').textContent  = livrees;
  document.getElementById('cstat-encours').textContent  = encours;
  document.getElementById('cstat-annulees').textContent = annulees;
  document.getElementById('cstat-revenus').textContent  = fmtFCFA(revenus);
}

// ── Filtres ──
function filterCommandes() {
  const q        = (document.getElementById('cmd-search')?.value || '').toLowerCase();
  const statut   = document.getElementById('cmd-filter-statut')?.value || '';
  const livId    = document.getElementById('cmd-filter-livreur')?.value || '';
  const svcId    = document.getElementById('cmd-filter-service')?.value || '';
  const dateFrom = document.getElementById('cmd-filter-date-from')?.value || '';
  const dateTo   = document.getElementById('cmd-filter-date-to')?.value || '';

  filteredCmds = allCommandes.filter(c => {
    if (statut && c.statut !== statut) return false;
    if (svcId  && c.service_id !== svcId) return false;
    if (dateFrom && c.date_course < dateFrom) return false;
    if (dateTo   && c.date_course > dateTo)   return false;
    if (livId) {
      const livIds = (c.commandes_livreurs || []).map(cl => cl.livreur_id);
      if (!livIds.includes(livId)) return false;
    }
    if (q) {
      const hay = [c.nom_client, c.adresse_depart, c.adresse_arrivee, c.zone,
                   servicesMap[c.service_id], c.telephone_client]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  cmdPage = 0;
  renderCmdTable();
}

// ── Rendu table ──
function renderCmdTable() {
  const tbody    = document.getElementById('cmd-tbody');
  const pagDiv   = document.getElementById('cmd-pagination');
  const total    = filteredCmds.length;
  const pages    = Math.ceil(total / CMD_PER_PAGE);
  const start    = cmdPage * CMD_PER_PAGE;
  const slice    = filteredCmds.slice(start, start + CMD_PER_PAGE);

  document.getElementById('cmd-count-label').textContent =
    `${total} course${total > 1 ? 's' : ''}`;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty">
        <i class="fa-solid fa-motorcycle"></i>
        <p>Aucune course trouvée</p>
        <div class="empty-action">
          <button class="header-btn btn-primary btn-sm" onclick="openModal('m-commande')">
            <i class="fa-solid fa-plus"></i> Nouvelle course
          </button>
        </div>
      </div>
    </td></tr>`;
    pagDiv.style.display = 'none';
    return;
  }

  tbody.innerHTML = slice.map(c => {
    const livNoms = (c.commandes_livreurs || [])
      .map(cl => livreursMap[cl.livreur_id] || '?')
      .join(', ') || '—';
    const svcNom  = servicesMap[c.service_id] || '—';
    const dt      = c.date_course ? new Date(c.date_course).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—';
    const heure   = c.heure_debut ? c.heure_debut.slice(0, 5) : '—';
    const trajet  = `<div style="font-size:12px"><span style="color:var(--blue)">▲</span> ${truncate(c.adresse_depart, 28)}</div>
                     <div style="font-size:12px;margin-top:2px"><span style="color:var(--red)">▼</span> ${truncate(c.adresse_arrivee, 28)}</div>`;

    return `<tr>
      <td>
        <div style="font-weight:600;font-size:13px">${dt}</div>
        <div class="td-muted">${heure}</div>
      </td>
      <td>
        <div style="font-weight:500">${c.nom_client || '<span class="td-muted">—</span>'}</div>
        ${c.telephone_client ? `<div class="td-muted">${c.telephone_client}</div>` : ''}
      </td>
      <td class="td-muted" style="font-size:12px">${svcNom}</td>
      <td>${trajet}${c.zone ? `<div class="td-muted" style="font-size:11px;margin-top:3px"><i class="fa-solid fa-location-dot" style="color:var(--blue);margin-right:3px"></i>${c.zone}</div>` : ''}</td>
      <td style="font-size:12px;font-weight:500">${livNoms}</td>
      <td class="td-mono" style="color:var(--blue)">${fmtFCFA(c.prix_total)}</td>
      <td><span class="badge badge-${c.statut}">${c.statut.replace('_', ' ')}</span></td>
      <td>
        <div class="row-actions">
          <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openDetail('${c.id}')" title="Voir détail">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openEdit('${c.id}')" title="Modifier">
            <i class="fa-solid fa-pen"></i>
          </button>
          ${c.statut === 'en_cours' ? `
          <button class="header-btn btn-sm" style="background:rgba(13,184,122,.12);color:var(--success);border:none;padding:6px 10px;font-size:11px" onclick="marquerLivre('${c.id}')" title="Marquer livrée">
            <i class="fa-solid fa-check"></i>
          </button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Pagination
  if (pages > 1) {
    pagDiv.style.display = 'flex';
    document.getElementById('pag-info').textContent =
      `${start + 1}–${Math.min(start + CMD_PER_PAGE, total)} sur ${total}`;
    const btns = document.getElementById('pag-btns');
    btns.innerHTML = `
      <button class="pag-btn" onclick="changePage(${cmdPage - 1})" ${cmdPage === 0 ? 'disabled' : ''}>
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      ${Array.from({ length: pages }, (_, i) =>
        `<button class="pag-btn ${i === cmdPage ? 'active' : ''}" onclick="changePage(${i})">${i + 1}</button>`
      ).join('')}
      <button class="pag-btn" onclick="changePage(${cmdPage + 1})" ${cmdPage === pages - 1 ? 'disabled' : ''}>
        <i class="fa-solid fa-chevron-right"></i>
      </button>`;
  } else {
    pagDiv.style.display = 'none';
  }
}

function changePage(p) { cmdPage = p; renderCmdTable(); document.getElementById('view-commandes').scrollTop = 0; }
function truncate(str, n) { return str && str.length > n ? str.slice(0, n) + '…' : (str || '—'); }

// ── Voir détail ──
async function openDetail(id) {
  const cmd = allCommandes.find(c => c.id === id);
  if (!cmd) return;

  document.getElementById('det-client').textContent  = cmd.nom_client || '—';
  document.getElementById('det-tel').textContent     = cmd.telephone_client || '—';
  document.getElementById('det-date').textContent    = cmd.date_course ? new Date(cmd.date_course).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : '—';
  document.getElementById('det-heure').textContent   = cmd.heure_debut ? cmd.heure_debut.slice(0,5) : '—';
  document.getElementById('det-service').textContent = servicesMap[cmd.service_id] || '—';
  document.getElementById('det-zone').textContent    = cmd.zone || '—';
  document.getElementById('det-depart').textContent  = cmd.adresse_depart || '—';
  document.getElementById('det-arrivee').textContent = cmd.adresse_arrivee || '—';
  document.getElementById('detail-id-display').textContent = `ID : ${id.slice(0,8).toUpperCase()}`;

  const obs = document.getElementById('det-obs-wrap');
  if (cmd.observations) {
    obs.style.display = 'block';
    document.getElementById('det-obs').textContent = cmd.observations;
  } else { obs.style.display = 'none'; }

  // Statut badge
  const sb_el = document.getElementById('detail-statut-badge');
  sb_el.className = `badge badge-${cmd.statut}`;
  sb_el.textContent = cmd.statut.replace('_', ' ');

  // Livreurs
  const livNoms = (cmd.commandes_livreurs || [])
    .map(cl => livreursMap[cl.livreur_id] || '?').join(', ');
  document.getElementById('detail-livreur-badge').textContent =
    livNoms ? `🏍️ ${livNoms}` : '';

  // Actions rapides
  const acts = document.getElementById('detail-actions-rapides');
  acts.innerHTML = '';
  if (cmd.statut === 'en_cours') {
    acts.innerHTML = `
      <button class="header-btn btn-sm" style="background:rgba(13,184,122,.12);color:var(--success);border:1px solid rgba(13,184,122,.2)" onclick="marquerLivre('${id}');closeModal('m-detail')">
        <i class="fa-solid fa-check"></i> Marquer livrée
      </button>
      <button class="header-btn btn-sm" style="background:rgba(239,68,68,.1);color:var(--danger);border:1px solid rgba(239,68,68,.2)" onclick="changerStatut('${id}','annulé');closeModal('m-detail')">
        <i class="fa-solid fa-xmark"></i> Annuler
      </button>`;
  }

  // Répartition financière
  const { data: rep } = await sb
    .from('repartition_financiere')
    .select('*')
    .eq('commande_id', id)
    .single();

  if (rep) {
    document.getElementById('det-part-l').textContent = fmtFCFA(rep.part_livreur);
    document.getElementById('det-part-c').textContent = fmtFCFA(rep.part_carburant);
    document.getElementById('det-part-e').textContent = fmtFCFA(rep.part_entreprise);
    document.getElementById('det-pct-l').textContent  = rep.pct_livreur + '%';
    document.getElementById('det-pct-c').textContent  = rep.pct_carburant + '%';
    document.getElementById('det-pct-e').textContent  = rep.pct_entreprise + '%';
  } else {
    ['det-part-l','det-part-c','det-part-e','det-pct-l','det-pct-c','det-pct-e']
      .forEach(id => document.getElementById(id).textContent = '—');
  }
  document.getElementById('det-total').textContent = fmtFCFA(cmd.prix_total);
  document.getElementById('btn-detail-edit').setAttribute('data-id', id);
  openModal('m-detail');
}

function editFromDetail() {
  const id = document.getElementById('btn-detail-edit').getAttribute('data-id');
  closeModal('m-detail');
  openEdit(id);
}

// ── Ouvrir édition ──
function openEdit(id) {
  const cmd = allCommandes.find(c => c.id === id);
  if (!cmd) return;
  currentEditId = id;
  document.getElementById('edit-id').value        = id;
  document.getElementById('edit-client').value    = cmd.nom_client || '';
  document.getElementById('edit-tel').value       = cmd.telephone_client || '';
  document.getElementById('edit-depart').value    = cmd.adresse_depart || '';
  document.getElementById('edit-arrivee').value   = cmd.adresse_arrivee || '';
  document.getElementById('edit-zone').value      = cmd.zone || '';
  document.getElementById('edit-montant').value   = cmd.prix_total || '';
  document.getElementById('edit-obs').value       = cmd.observations || '';
  document.getElementById('edit-date').value      = cmd.date_course || '';
  document.getElementById('edit-statut').value    = cmd.statut || 'en_cours';
  document.getElementById('edit-service').value   = cmd.service_id || '';
  // Livreur principal
  const livId = cmd.commandes_livreurs?.[0]?.livreur_id || '';
  document.getElementById('edit-livreur').value = livId;
  updateEditRepartition();
  openModal('m-edit-commande');
}

function updateEditRepartition() {
  const montant = parseFloat(document.getElementById('edit-montant').value) || 0;
  const prev = document.getElementById('edit-repartition-preview');
  if (montant <= 0) { prev.style.display = 'none'; return; }
  prev.style.display = 'block';
  const svcId = document.getElementById('edit-service').value;
  const svc = services.find(s => s.id === svcId);
  const pL = svc?.pct_livreur    || parametres.pct_livreur;
  const pC = svc?.pct_carburant  || parametres.pct_carburant;
  const pE = svc?.pct_entreprise || parametres.pct_entreprise;
  document.getElementById('erp-pct-l').textContent = pL;
  document.getElementById('erp-pct-c').textContent = pC;
  document.getElementById('erp-pct-e').textContent = pE;
  document.getElementById('erp-val-l').textContent = fmtFCFA(Math.round(montant * pL / 100));
  document.getElementById('erp-val-c').textContent = fmtFCFA(Math.round(montant * pC / 100));
  document.getElementById('erp-val-e').textContent = fmtFCFA(Math.round(montant * pE / 100));
}

// ── Mettre à jour une commande ──
async function updateCommande() {
  const id      = document.getElementById('edit-id').value;
  const montant = parseFloat(document.getElementById('edit-montant').value) || 0;
  const depart  = document.getElementById('edit-depart').value.trim();
  const arrivee = document.getElementById('edit-arrivee').value.trim();
  const livId   = document.getElementById('edit-livreur').value;
  if (!montant || !depart || !arrivee || !livId) { toast('Champs obligatoires manquants', 'error'); return; }

  const { error } = await sb.from('commandes').update({
    nom_client:       document.getElementById('edit-client').value.trim() || null,
    telephone_client: document.getElementById('edit-tel').value.trim() || null,
    service_id:       document.getElementById('edit-service').value || null,
    adresse_depart:   depart,
    adresse_arrivee:  arrivee,
    zone:             document.getElementById('edit-zone').value.trim() || null,
    prix_total:       montant,
    date_course:      document.getElementById('edit-date').value,
    statut:           document.getElementById('edit-statut').value,
    observations:     document.getElementById('edit-obs').value.trim() || null,
    updated_at:       new Date().toISOString()
  }).eq('id', id);

  if (error) { toast('Erreur mise à jour : ' + error.message, 'error'); return; }

  // Mettre à jour le livreur
  await sb.from('commandes_livreurs').delete().eq('commande_id', id);
  await sb.from('commandes_livreurs').insert({ commande_id: id, livreur_id: livId });

  closeModal('m-edit-commande');
  toast('Course mise à jour ✓');
  await loadCommandes();
  if (S.view === 'dashboard') renderDashboard();
}

// ── Marquer livrée ──
async function marquerLivre(id) {
  const { error } = await sb.from('commandes')
    .update({ statut: 'livré', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { toast('Erreur', 'error'); return; }
  toast('Course marquée comme livrée ✓');
  await loadCommandes();
  if (S.view === 'dashboard') renderDashboard();
}

// ── Changer statut ──
async function changerStatut(id, statut) {
  await sb.from('commandes').update({ statut, updated_at: new Date().toISOString() }).eq('id', id);
  toast(`Statut → ${statut}`);
  await loadCommandes();
  if (S.view === 'dashboard') renderDashboard();
}

// ── Supprimer ──
function confirmDelete() {
  closeModal('m-edit-commande');
  openModal('m-confirm-delete');
}

async function deleteCommande() {
  if (!currentEditId) return;
  const { error } = await sb.from('commandes').delete().eq('id', currentEditId);
  if (error) { toast('Erreur suppression', 'error'); openModal('m-edit-commande'); closeModal('m-confirm-delete'); return; }
  closeModal('m-confirm-delete');
  currentEditId = null;
  toast('Course supprimée');
  await loadCommandes();
  if (S.view === 'dashboard') renderDashboard();
}

