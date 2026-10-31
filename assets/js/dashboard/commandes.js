// ══════════════════════════════════════
// RÉPARTITION PREVIEW
// Même calcul que la base : % du service s'il en a, sinon % globaux ;
// la part entreprise prend le reste (la somme fait toujours le prix).
// ══════════════════════════════════════
function repartitionPct(svcId) {
  const svc = allServices.find(s => s.id === svcId);
  return svc && svc.pct_livreur != null
    ? { l: +svc.pct_livreur, c: +svc.pct_carburant, e: +svc.pct_entreprise }
    : { l: +parametres.pct_livreur, c: +parametres.pct_carburant, e: +parametres.pct_entreprise };
}

function renderRepartition(prefix, previewId, montant, svcId) {
  const preview = document.getElementById(previewId);
  if (montant <= 0) { preview.style.display = 'none'; return; }
  preview.style.display = 'block';
  const p = repartitionPct(svcId);
  const partL = Math.round(montant * p.l / 100);
  const partC = Math.round(montant * p.c / 100);
  document.getElementById(`${prefix}-pct-l`).textContent = p.l;
  document.getElementById(`${prefix}-pct-c`).textContent = p.c;
  document.getElementById(`${prefix}-pct-e`).textContent = p.e;
  document.getElementById(`${prefix}-val-l`).textContent = fmtFCFA(partL);
  document.getElementById(`${prefix}-val-c`).textContent = fmtFCFA(partC);
  document.getElementById(`${prefix}-val-e`).textContent = fmtFCFA(montant - partL - partC);
}

function updateRepartition() {
  renderRepartition('rp', 'repartition-preview',
    parseFloat(document.getElementById('c-montant').value) || 0,
    document.getElementById('c-service').value);
}
function updateEditRepartition() {
  renderRepartition('erp', 'edit-repartition-preview',
    parseFloat(document.getElementById('edit-montant').value) || 0,
    document.getElementById('edit-service').value);
}

// Choisir un service pré-remplit le montant avec son prix de base (si vide)
function onServiceChange(prefix) {
  const svc = allServices.find(s => s.id === document.getElementById(`${prefix}-service`).value);
  const m = document.getElementById(`${prefix}-montant`);
  if (svc && !m.value && +svc.prix_base > 0) m.value = svc.prix_base;
  prefix === 'c' ? updateRepartition() : updateEditRepartition();
}

// ══════════════════════════════════════
// FORMULAIRES DE COURSE : autocomplétion
// ══════════════════════════════════════
function initCommandeForms() {
  const clients = () => suggestions.clients.map(c => ({ value: c.nom, sub: c.tel || '', n: c.n, tel: c.tel }));
  const clientsParTel = () => suggestions.clients.filter(c => c.tel)
    .map(c => ({ value: c.tel, sub: c.nom, n: c.n, nom: c.nom }));
  const lieux = () => suggestions.lieux.map(l => ({ value: l.nom, n: l.n }));
  const zones = () => suggestions.zones.map(z => ({ value: z.nom, n: z.n }));

  ['c', 'edit'].forEach(p => {
    const telInput = document.getElementById(`${p}-tel`);
    const nomInput = document.getElementById(`${p}-client`);
    // Choisir un client remplit son téléphone, et inversement
    attachAutocomplete(nomInput, { source: clients, onPick: it => { if (it.tel) telInput.value = it.tel; } });
    attachAutocomplete(telInput, { source: clientsParTel, min: 3, onPick: it => { nomInput.value = it.nom; } });
    attachAutocomplete(document.getElementById(`${p}-depart`),  { source: lieux });
    attachAutocomplete(document.getElementById(`${p}-arrivee`), { source: lieux });
    attachAutocomplete(document.getElementById(`${p}-zone`),    { source: zones });
  });
}

// ══════════════════════════════════════
// NOUVELLE COURSE
// ══════════════════════════════════════
function openNewCommande(prefill = {}) {
  ['c-client', 'c-tel', 'c-depart', 'c-arrivee', 'c-zone', 'c-montant', 'c-obs'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('c-client').value = prefill.nom || '';
  document.getElementById('c-tel').value    = prefill.tel || '';
  fcSet('c-service', '');
  fcSet('c-statut', 'en_cours');
  const now = new Date();
  fpSet('c-date', isoDate(now));
  fpSet('c-heure', now.toTimeString().slice(0, 5));
  // Un seul livreur actif : pré-sélectionné
  renderLivreurPicker('c-livreurs', livreurs.length === 1 ? [livreurs[0].id] : []);
  updateRepartition();
  openModal('m-commande');
  setTimeout(() => document.getElementById(prefill.nom ? 'c-depart' : 'c-client').focus(), 50);
}

async function saveCommande() {
  const montant = parseFloat(document.getElementById('c-montant').value) || 0;
  const depart  = document.getElementById('c-depart').value.trim();
  const arrivee = document.getElementById('c-arrivee').value.trim();
  const livIds  = getPickedLivreurs('c-livreurs');
  if (!montant || !depart || !arrivee || !livIds.length) {
    toast('Champs obligatoires : départ, arrivée, montant et au moins un livreur', 'error'); return;
  }
  const btn = document.getElementById('c-save-btn');
  btn.disabled = true;
  const cmd = await rpc('creer_commande', {
    p_nom_client:       document.getElementById('c-client').value.trim() || null,
    p_telephone_client: document.getElementById('c-tel').value.trim() || null,
    p_service_id:       document.getElementById('c-service').value || null,
    p_adresse_depart:   depart,
    p_adresse_arrivee:  arrivee,
    p_zone:             document.getElementById('c-zone').value.trim() || null,
    p_prix_total:       montant,
    p_date_course:      document.getElementById('c-date').value || null,
    p_heure_debut:      document.getElementById('c-heure').value || null,
    p_observations:     document.getElementById('c-obs').value.trim() || null,
    p_statut:           document.getElementById('c-statut').value || 'en_cours',
    p_livreur_ids:      livIds
  });
  btn.disabled = false;
  if (!cmd) return;

  rememberSuggestions(cmd);
  closeModal('m-commande');
  toast('Course enregistrée ✓');
  refreshCurrentView();
}

// ══════════════════════════════════════
// MODULE COMMANDES
// ══════════════════════════════════════
let allCommandes   = [];   // TOUTES les courses visibles (sans limite de 1000)
let filteredCmds   = [];   // après filtres
let currentEditId  = null; // id en cours d'édition
let cmdPage        = 0;
const CMD_PER_PAGE = 20;

// ── Chargement principal ──
async function loadCommandes() {
  const t0 = performance.now();
  const { data, error } = await fetchAll(() => sb
    .from('commandes')
    .select(`
      id, date_course, heure_debut, nom_client, telephone_client,
      service_id, adresse_depart, adresse_arrivee, zone,
      prix_total, statut, observations, created_at, cree_par,
      commandes_livreurs(livreur_id)
    `)
    .order('date_course', { ascending: false })
    .order('heure_debut', { ascending: false, nullsFirst: false })
    .order('id'));

  if (error) { toast('Erreur chargement commandes : ' + error.message, 'error'); return; }
  allCommandes = data;
  console.info(`[commandes] ${data.length} courses chargées en ${Math.round(performance.now() - t0)} ms`);

  // Filtres livreurs et services (inactifs inclus : ils ont un historique)
  const livSel = document.getElementById('cmd-filter-livreur');
  const keepLiv = livSel.value;
  livSel.innerHTML = '<option value="">Tous les livreurs</option>' +
    allLivreurs.map(l => `<option value="${esc(l.id)}">${esc(livreurLabel(l))}</option>`).join('');
  livSel.value = keepLiv;

  const svcSel = document.getElementById('cmd-filter-service');
  const keepSvc = svcSel.value;
  svcSel.innerHTML = '<option value="">Tous les services</option>' +
    allServices.map(s => `<option value="${esc(s.id)}">${esc(s.nom_service)}</option>`).join('');
  svcSel.value = keepSvc;

  fcSync('cmd-filter-livreur');
  fcSync('cmd-filter-service');
  filterCommandes(false);
  renderCmdStats();
}

// ── Smart Filters Panel ──
function toggleSmartFilters() {
  const panel = document.getElementById('smart-filters-panel');
  if (!panel) return;
  if (panel.classList.contains('open')) {
    panel.classList.remove('open');
  } else {
    panel.classList.add('open');
    closeAllFCSelects();
    setTimeout(() => document.addEventListener('click', closePanelOutside, { once: true }), 0);
  }
}

function closePanelOutside(e) {
  const wrap = document.getElementById('smart-filters-wrap');
  const panel = document.getElementById('smart-filters-panel');
  if (!wrap || !panel) return;
  if (!wrap.contains(e.target)) {
    panel.classList.remove('open');
  } else if (panel.classList.contains('open')) {
    setTimeout(() => document.addEventListener('click', closePanelOutside, { once: true }), 0);
  }
}

function updateFilterBadge() {
  const badge = document.getElementById('cmd-filter-badge');
  if (!badge) return;
  const count = ['cmd-filter-statut', 'cmd-filter-livreur', 'cmd-filter-service', 'cmd-filter-date-from', 'cmd-filter-date-to']
    .filter(id => (document.getElementById(id)?.value || '') !== '').length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

// ── Stats mini-bar (sur la sélection filtrée) ──
function renderCmdStats() {
  const list = filteredCmds;
  const by = s => list.filter(c => c.statut === s).length;
  document.getElementById('cstat-total').textContent    = list.length;
  document.getElementById('cstat-livrees').textContent  = by('livré');
  document.getElementById('cstat-encours').textContent  = by('en_cours') + by('en_attente');
  document.getElementById('cstat-annulees').textContent = by('annulé');
  document.getElementById('cstat-revenus').textContent  =
    fmtFCFA(list.filter(c => c.statut === 'livré').reduce((s, c) => s + Number(c.prix_total || 0), 0));
}

// ── Filtres ──
function filterCommandes(resetPage = true) {
  const q        = norm(document.getElementById('cmd-search')?.value);
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
    if (livId && !(c.commandes_livreurs || []).some(cl => cl.livreur_id === livId)) return false;
    if (q) {
      const hay = norm([c.nom_client, c.adresse_depart, c.adresse_arrivee, c.zone,
                        servicesMap[c.service_id], c.telephone_client, c.observations].filter(Boolean).join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (resetPage) cmdPage = 0;
  cmdPage = Math.min(cmdPage, Math.max(0, Math.ceil(filteredCmds.length / CMD_PER_PAGE) - 1));
  renderCmdTable();
  renderCmdStats();
}

function livreursNoms(c) {
  return (c.commandes_livreurs || []).map(cl => livreursMap[cl.livreur_id] || '?').join(', ');
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
    `${total} course${total > 1 ? 's' : ''}${total !== allCommandes.length ? ` sur ${allCommandes.length}` : ''}`;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty">
        <i class="fa-solid fa-motorcycle"></i>
        <p>Aucune course trouvée</p>
        <div class="empty-action">
          <button class="header-btn btn-primary btn-sm" onclick="openNewCommande()">
            <i class="fa-solid fa-plus"></i> Nouvelle course
          </button>
        </div>
      </div>
    </td></tr>`;
    pagDiv.style.display = 'none';
    return;
  }

  tbody.innerHTML = slice.map(c => {
    const dt    = c.date_course ? parseDate(c.date_course).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—';
    const heure = c.heure_debut ? c.heure_debut.slice(0, 5) : '—';
    const id    = esc(c.id);
    return `<tr>
      <td>
        <div style="font-weight:600;font-size:13px">${dt}</div>
        <div class="td-muted">${esc(heure)}</div>
      </td>
      <td>
        <div style="font-weight:500">${c.nom_client ? esc(c.nom_client) : '<span class="td-muted">—</span>'}</div>
        ${c.telephone_client ? `<div class="td-muted">${esc(c.telephone_client)}</div>` : ''}
      </td>
      <td class="td-muted" style="font-size:12px">${esc(servicesMap[c.service_id] || '—')}</td>
      <td>
        <div class="trajet"><span class="trajet-dot dep"></span>${esc(truncate(c.adresse_depart, 28))}</div>
        <div class="trajet"><span class="trajet-dot arr"></span>${esc(truncate(c.adresse_arrivee, 28))}</div>
        ${c.zone ? `<div class="td-muted" style="font-size:11px;margin-top:3px"><i class="fa-solid fa-location-dot" style="color:var(--blue);margin-right:3px"></i>${esc(c.zone)}</div>` : ''}
      </td>
      <td style="font-size:12px;font-weight:500">${esc(livreursNoms(c) || '—')}</td>
      <td class="td-mono" style="color:var(--blue)">${fmtFCFA(c.prix_total)}</td>
      <td>${statutBadge(c.statut)}</td>
      <td>
        <div class="row-actions">
          <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openDetail('${id}')" title="Voir détail"><i class="fa-solid fa-eye"></i></button>
          <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openEdit('${id}')" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          ${c.statut === 'en_cours' || c.statut === 'en_attente' ? `
          <button class="header-btn btn-sm btn-success-soft" onclick="marquerLivre('${id}')" title="Marquer livrée"><i class="fa-solid fa-check"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Pagination compacte : 1 … 4 5 [6] 7 8 … 42
  if (pages > 1) {
    pagDiv.style.display = 'flex';
    document.getElementById('pag-info').textContent =
      `${start + 1}–${Math.min(start + CMD_PER_PAGE, total)} sur ${total}`;
    const nums = [...new Set([0, pages - 1, cmdPage - 2, cmdPage - 1, cmdPage, cmdPage + 1, cmdPage + 2])]
      .filter(i => i >= 0 && i < pages).sort((a, b) => a - b);
    let html = `<button class="pag-btn" onclick="changePage(${cmdPage - 1})" ${cmdPage === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>`;
    nums.forEach((i, k) => {
      if (k && i - nums[k - 1] > 1) html += `<span class="pag-gap">…</span>`;
      html += `<button class="pag-btn ${i === cmdPage ? 'active' : ''}" onclick="changePage(${i})">${i + 1}</button>`;
    });
    html += `<button class="pag-btn" onclick="changePage(${cmdPage + 1})" ${cmdPage === pages - 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>`;
    document.getElementById('pag-btns').innerHTML = html;
  } else {
    pagDiv.style.display = 'none';
  }
}

function changePage(p) { cmdPage = p; renderCmdTable(); document.getElementById('main').scrollTop = 0; }
function truncate(str, n) { return str && str.length > n ? str.slice(0, n) + '…' : (str || '—'); }

function resetFilters() {
  document.getElementById('cmd-search').value = '';
  ['cmd-filter-statut', 'cmd-filter-livreur', 'cmd-filter-service'].forEach(id => fcSet(id, ''));
  fpSet('cmd-filter-date-from', '');
  fpSet('cmd-filter-date-to', '');
  updateFilterBadge();
  filterCommandes();
}

// ── Voir détail ──
async function openDetail(id) {
  const cmd = allCommandes.find(c => c.id === id);
  if (!cmd) return;

  document.getElementById('det-client').textContent  = cmd.nom_client || '—';
  document.getElementById('det-tel').textContent     = cmd.telephone_client || '—';
  document.getElementById('det-date').textContent    = cmd.date_course ? parseDate(cmd.date_course).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : '—';
  document.getElementById('det-heure').textContent   = cmd.heure_debut ? cmd.heure_debut.slice(0,5) : '—';
  document.getElementById('det-service').textContent = servicesMap[cmd.service_id] || '—';
  document.getElementById('det-zone').textContent    = cmd.zone || '—';
  document.getElementById('det-depart').textContent  = cmd.adresse_depart || '—';
  document.getElementById('det-arrivee').textContent = cmd.adresse_arrivee || '—';
  document.getElementById('detail-id-display').textContent = `ID : ${id.slice(0,8).toUpperCase()}`;

  const obs = document.getElementById('det-obs-wrap');
  obs.style.display = cmd.observations ? 'block' : 'none';
  document.getElementById('det-obs').textContent = cmd.observations || '';

  document.getElementById('detail-statut-badge').outerHTML =
    statutBadge(cmd.statut).replace('<span class="badge', '<span id="detail-statut-badge" class="badge');

  const livNoms = livreursNoms(cmd);
  document.getElementById('detail-livreur-badge').textContent = livNoms ? `🏍️ ${livNoms}` : '';

  // Actions rapides
  const acts = document.getElementById('detail-actions-rapides');
  acts.innerHTML = '';
  if (cmd.statut === 'en_cours' || cmd.statut === 'en_attente') {
    const safeId = esc(id);
    acts.innerHTML = `
      ${cmd.statut === 'en_attente' ? `<button class="header-btn btn-sm btn-info-soft" onclick="changerStatut('${safeId}','en_cours');closeModal('m-detail')"><i class="fa-solid fa-person-biking"></i> Démarrer</button>` : ''}
      <button class="header-btn btn-sm btn-success-soft" onclick="marquerLivre('${safeId}');closeModal('m-detail')"><i class="fa-solid fa-check"></i> Marquer livrée</button>
      <button class="header-btn btn-sm btn-danger-soft" onclick="changerStatut('${safeId}','annulé');closeModal('m-detail')"><i class="fa-solid fa-xmark"></i> Annuler</button>`;
  }

  ['det-part-l','det-part-c','det-part-e','det-pct-l','det-pct-c','det-pct-e']
    .forEach(k => document.getElementById(k).textContent = '…');
  document.getElementById('det-total').textContent = fmtFCFA(cmd.prix_total);
  document.getElementById('btn-detail-edit').setAttribute('data-id', id);
  openModal('m-detail');

  // Répartition financière (absente pour une course annulée)
  const { data: rep } = await sb.from('repartition_financiere').select('*').eq('commande_id', id).maybeSingle();
  if (rep) {
    document.getElementById('det-part-l').textContent = fmtFCFA(rep.part_livreur);
    document.getElementById('det-part-c').textContent = fmtFCFA(rep.part_carburant);
    document.getElementById('det-part-e').textContent = fmtFCFA(rep.part_entreprise);
    document.getElementById('det-pct-l').textContent  = rep.pct_livreur + '%';
    document.getElementById('det-pct-c').textContent  = rep.pct_carburant + '%';
    document.getElementById('det-pct-e').textContent  = rep.pct_entreprise + '%';
  } else {
    ['det-part-l','det-part-c','det-part-e','det-pct-l','det-pct-c','det-pct-e']
      .forEach(k => document.getElementById(k).textContent = '—');
  }
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
  document.getElementById('edit-montant').value   = cmd.prix_total ?? '';
  document.getElementById('edit-obs').value       = cmd.observations || '';
  fpSet('edit-date', cmd.date_course || '');
  fpSet('edit-heure', cmd.heure_debut ? cmd.heure_debut.slice(0, 5) : '');
  fcSet('edit-statut', cmd.statut || 'en_cours');
  // Service inactif : on l'ajoute temporairement pour ne pas le perdre
  const svcSel = document.getElementById('edit-service');
  if (cmd.service_id && !services.some(s => s.id === cmd.service_id)) {
    svcSel.insertAdjacentHTML('beforeend', `<option value="${esc(cmd.service_id)}">${esc(servicesMap[cmd.service_id] || 'Service supprimé')} (inactif)</option>`);
  }
  fcSet('edit-service', cmd.service_id || '');
  renderLivreurPicker('edit-livreurs', (cmd.commandes_livreurs || []).map(cl => cl.livreur_id));
  updateEditRepartition();
  openModal('m-edit-commande');
}

// ── Mettre à jour une course (une seule transaction côté base) ──
async function updateCommande() {
  const id      = document.getElementById('edit-id').value;
  const montant = parseFloat(document.getElementById('edit-montant').value) || 0;
  const depart  = document.getElementById('edit-depart').value.trim();
  const arrivee = document.getElementById('edit-arrivee').value.trim();
  const livIds  = getPickedLivreurs('edit-livreurs');
  if (!montant || !depart || !arrivee || !livIds.length) {
    toast('Champs obligatoires : départ, arrivée, montant et au moins un livreur', 'error'); return;
  }

  const cmd = await rpc('modifier_commande', {
    p_id:               id,
    p_nom_client:       document.getElementById('edit-client').value.trim() || null,
    p_telephone_client: document.getElementById('edit-tel').value.trim() || null,
    p_service_id:       document.getElementById('edit-service').value || null,
    p_adresse_depart:   depart,
    p_adresse_arrivee:  arrivee,
    p_zone:             document.getElementById('edit-zone').value.trim() || null,
    p_prix_total:       montant,
    p_date_course:      document.getElementById('edit-date').value || null,
    p_heure_debut:      document.getElementById('edit-heure').value || null,
    p_statut:           document.getElementById('edit-statut').value,
    p_observations:     document.getElementById('edit-obs').value.trim() || null,
    p_livreur_ids:      livIds
  });
  if (!cmd) return;

  rememberSuggestions(cmd);
  loadServices(); // retire l'éventuelle option « inactif » ajoutée pour l'édition
  closeModal('m-edit-commande');
  toast('Course mise à jour ✓');
  refreshCurrentView();
}

// ── Changer statut ──
async function changerStatut(id, statut) {
  const { error } = await sb.from('commandes').update({ statut }).eq('id', id);
  if (error) { toast('Erreur : ' + error.message, 'error'); return; }
  toast(`Statut → ${STATUTS[statut]?.label || statut}`);
  refreshCurrentView();
}
function marquerLivre(id) { return changerStatut(id, 'livré'); }

// ── Supprimer ──
function confirmDelete() {
  closeModal('m-edit-commande');
  openModal('m-confirm-delete');
}

async function deleteCommande() {
  if (!currentEditId) return;
  const { error } = await sb.from('commandes').delete().eq('id', currentEditId);
  closeModal('m-confirm-delete');
  if (error) { toast('Erreur suppression : ' + error.message, 'error'); openModal('m-edit-commande'); return; }
  currentEditId = null;
  toast('Course supprimée');
  refreshCurrentView();
}
