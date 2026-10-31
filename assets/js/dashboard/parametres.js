// ══════════════════════════════════════
// MODULE PARAMÈTRES (admin)
// Les écritures sont autorisées par le RLS pour les admins uniquement.
// ══════════════════════════════════════

async function initParamView() {
  document.getElementById('p-pct-l').value = parametres.pct_livreur;
  document.getElementById('p-pct-c').value = parametres.pct_carburant;
  document.getElementById('p-pct-e').value = parametres.pct_entreprise;
  document.getElementById('p-objectif-ca').value = parametres.objectif_ca || '';
  updatePctPreview();
  await Promise.all([refreshParamLivreurs(), refreshParamServices(), refreshEquipe().then(loadPctHistory)]);
}

function updatePctPreview() {
  const l = parseInt(document.getElementById('p-pct-l').value)||0;
  const c = parseInt(document.getElementById('p-pct-c').value)||0;
  const e = parseInt(document.getElementById('p-pct-e').value)||0;
  const total = l+c+e;
  document.getElementById('p-pct-l-val').textContent = l+'%';
  document.getElementById('p-pct-c-val').textContent = c+'%';
  document.getElementById('p-pct-e-val').textContent = e+'%';
  const totEl = document.getElementById('p-pct-total-val');
  totEl.textContent = total+'%';
  totEl.style.color = total===100 ? 'var(--success)' : 'var(--red)';
  const exL = Math.round(1000*l/100), exC = Math.round(1000*c/100);
  document.getElementById('ex-l').textContent = fmtFCFA(exL);
  document.getElementById('ex-c').textContent = fmtFCFA(exC);
  document.getElementById('ex-e').textContent = fmtFCFA(1000 - exL - exC);
  const btn = document.getElementById('p-save-pct');
  if (btn) { btn.disabled = total !== 100; btn.style.opacity = total===100?'1':'0.5'; }
}

async function savePourcentages() {
  const l = parseInt(document.getElementById('p-pct-l').value)||0;
  const c = parseInt(document.getElementById('p-pct-c').value)||0;
  const e = parseInt(document.getElementById('p-pct-e').value)||0;
  if (l+c+e !== 100) { toast('Le total doit être égal à 100%', 'error'); return; }
  const objectifCA = parseInt(document.getElementById('p-objectif-ca')?.value) || 0;

  // L'historique et updated_by sont gérés par un trigger en base
  const { data, error } = await sb.from('parametres')
    .update({ pct_livreur: l, pct_carburant: c, pct_entreprise: e, objectif_ca: objectifCA })
    .eq('id', 1).select().maybeSingle();

  if (error || !data) { toast('Erreur sauvegarde : ' + (error?.message || 'droits insuffisants'), 'error'); return; }
  parametres = data;
  toast('Paramètres mis à jour ✓ (les nouvelles courses utiliseront ces %)');
  await loadPctHistory();
}

let equipeMap = {}; // id profil → nom (auteurs de l'historique)

async function loadPctHistory() {
  const { data } = await sb.from('historique_parametres')
    .select('*').order('modifie_at',{ascending:false}).limit(10);
  const el = document.getElementById('p-pct-history');
  if (!el) return;
  if (!data?.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text3);font-style:italic">Aucune modification</div>`;
    return;
  }
  el.innerHTML = data.map(h => `
    <div class="hist-row" title="Valeurs en vigueur jusqu'à cette date">
      <div>
        <span class="hist-pct" style="color:var(--blue)">${esc(h.pct_livreur)}%</span><span class="hist-sep">/</span>
        <span class="hist-pct" style="color:#b38700">${esc(h.pct_carburant)}%</span><span class="hist-sep">/</span>
        <span class="hist-pct" style="color:var(--red)">${esc(h.pct_entreprise)}%</span>
      </div>
      <div class="hist-meta">jusqu'au ${new Date(h.modifie_at).toLocaleDateString('fr-FR')}${equipeMap[h.modifie_par] ? ' · ' + esc(equipeMap[h.modifie_par]) : ''}</div>
    </div>`).join('');
}

// Suppression impossible (élément déjà utilisé par des courses) → désactivation
async function deleteOrDeactivate(table, id, label) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (!error) { toast(`${label} supprimé`); return true; }
  if (error.code === '23503') {
    const { error: e2 } = await sb.from(table).update({ actif: false }).eq('id', id);
    if (e2) { toast('Erreur : ' + e2.message, 'error'); return false; }
    toast(`${label} utilisé par des courses existantes : désactivé (historique conservé)`);
    return true;
  }
  toast('Erreur : ' + error.message, 'error');
  return false;
}

// ── Livreurs CRUD ──
async function refreshParamLivreurs() {
  await loadLivreurs();
  const el = document.getElementById('p-livreurs-list');
  if (!el) return;
  if (!allLivreurs.length) {
    el.innerHTML = `<div class="empty" style="padding:20px"><i class="fa-solid fa-user"></i><p>Aucun livreur</p></div>`;
    return;
  }
  el.innerHTML = allLivreurs.map((l, i) => `
    <li class="irow">
      <div class="iicon livreur-avatar av-${i % 4}">${esc(l.nom.slice(0,2).toUpperCase())}</div>
      <div class="iinfo">
        <div class="iname">${esc(livreurLabel(l))}</div>
        <div class="imeta">${esc(l.telephone || '—')}</div>
      </div>
      <span class="badge ${l.actif?'badge-livré':'badge-annulé'}">${l.actif?'Actif':'Inactif'}</span>
      <div class="iacts">
        <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openEditLivreur('${esc(l.id)}')" title="Modifier"><i class="fa-solid fa-pen"></i></button>
      </div>
    </li>`).join('');
}

function openEditLivreur(id) {
  const lv = allLivreurs.find(l=>l.id===id);
  if (!lv) return;
  document.getElementById('m-livreur-titre').textContent = 'Modifier le livreur';
  document.getElementById('lv-edit-id').value  = id;
  document.getElementById('lv-nom').value      = lv.nom||'';
  document.getElementById('lv-prenom').value   = lv.prenom||'';
  document.getElementById('lv-tel').value      = lv.telephone||'';
  fcSet('lv-actif', String(lv.actif));
  document.getElementById('lv-del-wrap').style.display = 'block';
  openModal('m-livreur');
}

function openNewLivreur() {
  document.getElementById('m-livreur-titre').textContent = 'Nouveau livreur';
  document.getElementById('lv-edit-id').value = '';
  ['lv-nom','lv-prenom','lv-tel'].forEach(id => document.getElementById(id).value='');
  fcSet('lv-actif', 'true');
  document.getElementById('lv-del-wrap').style.display = 'none';
  openModal('m-livreur');
  setTimeout(() => document.getElementById('lv-nom').focus(), 50);
}

async function saveLivreur() {
  const nom = document.getElementById('lv-nom').value.trim();
  if (!nom) { toast('Nom requis', 'error'); return; }
  const id = document.getElementById('lv-edit-id').value;
  const payload = {
    nom, prenom: document.getElementById('lv-prenom').value.trim()||null,
    telephone: document.getElementById('lv-tel').value.trim()||null,
    actif: document.getElementById('lv-actif').value === 'true'
  };
  const { error } = id
    ? await sb.from('livreurs').update(payload).eq('id',id)
    : await sb.from('livreurs').insert(payload);
  if (error) { toast('Erreur : '+error.message,'error'); return; }
  closeModal('m-livreur');
  toast(id?'Livreur mis à jour ✓':'Livreur ajouté ✓');
  await refreshParamLivreurs();
}

async function deleteLivreur() {
  const id = document.getElementById('lv-edit-id').value;
  if (!id || !confirm('Supprimer ce livreur ?\n\nS\'il a déjà des courses, il sera simplement désactivé pour conserver l\'historique.')) return;
  if (await deleteOrDeactivate('livreurs', id, 'Livreur')) {
    closeModal('m-livreur');
    await refreshParamLivreurs();
  }
}

// ── Services CRUD ──
async function refreshParamServices() {
  await loadServices();
  const el = document.getElementById('p-services-list');
  if (!el) return;
  if (!allServices.length) {
    el.innerHTML = `<div class="empty" style="padding:20px"><i class="fa-solid fa-list"></i><p>Aucun service</p></div>`;
    return;
  }
  el.innerHTML = allServices.map(s => `
    <li class="irow">
      <div class="iicon"><span class="icon3d sm" style="--c:#2121a3"><i class="fa-solid fa-box"></i></span></div>
      <div class="iinfo">
        <div class="iname">${esc(s.nom_service)}</div>
        <div class="imeta">${fmtFCFA(s.prix_base)} de base${s.pct_livreur != null ? ` · Répart. ${esc(s.pct_livreur)}/${esc(s.pct_carburant)}/${esc(s.pct_entreprise)}` : ''}</div>
      </div>
      <span class="badge ${s.actif?'badge-livré':'badge-annulé'}">${s.actif?'Actif':'Inactif'}</span>
      <div class="iacts">
        <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openEditService('${esc(s.id)}')" title="Modifier"><i class="fa-solid fa-pen"></i></button>
      </div>
    </li>`).join('');
}

function openNewService() {
  document.getElementById('m-service-titre').textContent = 'Nouveau service';
  document.getElementById('sv-edit-id').value = '';
  ['sv-nom','sv-desc','sv-prix','sv-pct-l','sv-pct-c','sv-pct-e'].forEach(id => document.getElementById(id).value = '');
  fcSet('sv-actif', 'true');
  document.getElementById('sv-del-wrap').style.display = 'none';
  openModal('m-service');
  setTimeout(() => document.getElementById('sv-nom').focus(), 50);
}

function openEditService(id) {
  const sv = allServices.find(s=>s.id===id);
  if (!sv) return;
  document.getElementById('m-service-titre').textContent = 'Modifier le service';
  document.getElementById('sv-edit-id').value  = id;
  document.getElementById('sv-nom').value      = sv.nom_service||'';
  document.getElementById('sv-desc').value     = sv.description||'';
  document.getElementById('sv-prix').value     = sv.prix_base ?? 0;
  document.getElementById('sv-pct-l').value    = sv.pct_livreur ?? '';
  document.getElementById('sv-pct-c').value    = sv.pct_carburant ?? '';
  document.getElementById('sv-pct-e').value    = sv.pct_entreprise ?? '';
  fcSet('sv-actif', String(sv.actif));
  document.getElementById('sv-del-wrap').style.display = 'block';
  openModal('m-service');
}

async function saveService() {
  const nom = document.getElementById('sv-nom').value.trim();
  if (!nom) { toast('Nom requis','error'); return; }
  const id = document.getElementById('sv-edit-id').value;
  const pcts = ['sv-pct-l','sv-pct-c','sv-pct-e'].map(k => document.getElementById(k).value.trim());
  const remplis = pcts.filter(v => v !== '').length;
  // Répartition spécifique : les 3 % ou aucun (même règle que la base)
  if (remplis && (remplis < 3 || pcts.reduce((s, v) => s + Number(v), 0) !== 100)) {
    toast('Répartition spécifique : renseignez les 3 % (total 100%) ou laissez-les vides','error'); return;
  }
  const payload = {
    nom_service: nom,
    description: document.getElementById('sv-desc').value.trim()||null,
    prix_base: parseInt(document.getElementById('sv-prix').value)||0,
    pct_livreur:    remplis ? Number(pcts[0]) : null,
    pct_carburant:  remplis ? Number(pcts[1]) : null,
    pct_entreprise: remplis ? Number(pcts[2]) : null,
    actif: document.getElementById('sv-actif').value === 'true'
  };
  const { error } = id
    ? await sb.from('services').update(payload).eq('id',id)
    : await sb.from('services').insert(payload);
  if (error) {
    toast(error.code === '23505' ? 'Un service porte déjà ce nom' : 'Erreur : '+error.message,'error'); return;
  }
  closeModal('m-service');
  toast(id?'Service mis à jour ✓':'Service ajouté ✓');
  await refreshParamServices();
}

async function deleteService() {
  const id = document.getElementById('sv-edit-id').value;
  if (!id || !confirm('Supprimer ce service ?\n\nS\'il a déjà été utilisé, il sera simplement désactivé.')) return;
  if (await deleteOrDeactivate('services', id, 'Service')) {
    closeModal('m-service');
    await refreshParamServices();
  }
}

// ── Équipe : rôles et activation des comptes ──
// Les comptes se créent par invitation (Dashboard Supabase → Authentication →
// Invite user) ; un profil « opérateur actif » est alors créé automatiquement.
async function refreshEquipe() {
  const { data, error } = await sb.from('profils').select('*').order('actif', { ascending: false }).order('nom');
  const el = document.getElementById('p-equipe-list');
  if (!el) return;
  if (error) { el.innerHTML = `<div class="td-muted" style="padding:16px">${esc(error.message)}</div>`; return; }
  equipeMap = Object.fromEntries(data.map(p => [p.id, (p.prenom ? p.prenom + ' ' : '') + p.nom]));
  el.innerHTML = data.map(p => {
    const moi = p.id === currentUser.id;
    return `<li class="irow ${p.actif ? '' : 'is-off'}">
      <div class="iicon mini-avatar ${p.role === 'admin' ? '' : 'pale'}">${esc((p.nom || '?').slice(0,2).toUpperCase())}</div>
      <div class="iinfo">
        <div class="iname">${esc(equipeMap[p.id])}${moi ? ' <span class="td-muted">(vous)</span>' : ''}</div>
        <div class="imeta">Depuis le ${new Date(p.created_at).toLocaleDateString('fr-FR')}</div>
      </div>
      <select class="mini-select" onchange="updateProfil('${esc(p.id)}', { role: this.value })" ${moi ? 'disabled title="Vous ne pouvez pas changer votre propre rôle"' : ''}>
        <option value="operateur" ${p.role === 'operateur' ? 'selected' : ''}>Opérateur</option>
        <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
      <label class="switch" title="${p.actif ? 'Actif' : 'Inactif'}">
        <input type="checkbox" ${p.actif ? 'checked' : ''} ${moi ? 'disabled' : ''} onchange="updateProfil('${esc(p.id)}', { actif: this.checked })">
        <span></span>
      </label>
    </li>`;
  }).join('');
}

async function updateProfil(id, patch) {
  const { error } = await sb.from('profils').update(patch).eq('id', id);
  if (error) { toast('Erreur : ' + error.message, 'error'); }
  else toast('Accès mis à jour ✓');
  await refreshEquipe();
}
