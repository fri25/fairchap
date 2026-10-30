// ══════════════════════════════════════
// MODULE PARAMÈTRES
// ══════════════════════════════════════

async function initParamView() {
  // Vérifier rôle admin
  const isAdmin = currentProfil?.role === 'admin';
  const note = document.getElementById('param-admin-note');
  if (!isAdmin && note) note.style.display = 'block';

  // Sliders pourcentages
  document.getElementById('p-pct-l').value = parametres.pct_livreur;
  document.getElementById('p-pct-c').value = parametres.pct_carburant;
document.getElementById('p-pct-e').value = parametres.pct_entreprise;
  if (parametres.objectif_ca) {
    document.getElementById('p-objectif-ca').value = parametres.objectif_ca;
  }
  updatePctPreview();
  // Livreurs
  await refreshParamLivreurs();
  // Services
  await refreshParamServices();
  // Historique
  await loadPctHistory();
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
  // Exemple 1000 FCFA
  document.getElementById('ex-l').textContent = fmtFCFA(Math.round(1000*l/100));
  document.getElementById('ex-c').textContent = fmtFCFA(Math.round(1000*c/100));
  document.getElementById('ex-e').textContent = fmtFCFA(Math.round(1000*e/100));
  // Activer/désactiver bouton save
  const btn = document.getElementById('p-save-pct');
  if (btn) { btn.disabled = total !== 100; btn.style.opacity = total===100?'1':'0.5'; }
}

async function savePourcentages() {
  const l = parseInt(document.getElementById('p-pct-l').value)||0;
  const c = parseInt(document.getElementById('p-pct-c').value)||0;
  const e = parseInt(document.getElementById('p-pct-e').value)||0;
  if (l+c+e !== 100) { toast('Le total doit être égal à 100%', 'error'); return; }

  const objectifCA = parseInt(document.getElementById('p-objectif-ca')?.value) || 0;

  // Enregistrer historique
  await sb.from('historique_parametres').insert({
    pct_livreur: parametres.pct_livreur,
    pct_carburant: parametres.pct_carburant,
    pct_entreprise: parametres.pct_entreprise,
    modifie_par: currentUser?.id
  });

  const { error } = await sb.from('parametres').update({
    pct_livreur: l, pct_carburant: c, pct_entreprise: e,
    objectif_ca: objectifCA,
    updated_at: new Date().toISOString(), updated_by: currentUser?.id
  }).eq('id',1);

  if (error) { toast('Erreur sauvegarde : ' + error.message, 'error'); return; }
  parametres.pct_livreur = l; parametres.pct_carburant = c; parametres.pct_entreprise = e;
  parametres.objectif_ca = objectifCA;
  toast('Paramètres mis à jour ✓');
  await loadPctHistory();
  renderDashboard();
}

async function loadPctHistory() {
  const { data } = await sb.from('historique_parametres')
    .select('*').order('modifie_at',{ascending:false}).limit(5);
  const el = document.getElementById('p-pct-history');
  if (!el) return;
  if (!data?.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text3);font-style:italic">Aucune modification</div>`;
    return;
  }
  el.innerHTML = data.map(h => `
    <div style="background:var(--bg);border-radius:var(--r);padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <span style="font-family:var(--font-h);font-size:12px;font-weight:700;color:var(--blue)">${h.pct_livreur}%</span>
        <span style="font-size:11px;color:var(--text3);margin:0 4px">/</span>
        <span style="font-family:var(--font-h);font-size:12px;font-weight:700;color:#b38700">${h.pct_carburant}%</span>
        <span style="font-size:11px;color:var(--text3);margin:0 4px">/</span>
        <span style="font-family:var(--font-h);font-size:12px;font-weight:700;color:var(--red)">${h.pct_entreprise}%</span>
      </div>
      <div style="font-size:10px;color:var(--text3)">${new Date(h.modifie_at).toLocaleDateString('fr-FR')}</div>
    </div>`).join('');
}

// ── Livreurs CRUD ──
async function refreshParamLivreurs() {
  const { data } = await sb.from('livreurs').select('*').order('nom');
  livreurs = data||[];
  const el = document.getElementById('p-livreurs-list');
  if (!el) return;
  if (!livreurs.length) {
    el.innerHTML = `<div class="empty" style="padding:20px"><i class="fa-solid fa-user"></i><p>Aucun livreur</p></div>`;
    return;
  }
  el.innerHTML = livreurs.map(l => `
    <li class="irow">
      <div class="iicon" style="background:var(--blue);color:#fff;font-family:var(--font-h);font-weight:700">${l.nom.slice(0,2).toUpperCase()}</div>
      <div class="iinfo">
        <div class="iname">${l.nom}${l.prenom?' '+l.prenom:''}</div>
        <div class="imeta">${l.telephone||'—'}</div>
      </div>
      <span class="badge ${l.actif?'badge-livré':'badge-annulé'}">${l.actif?'Actif':'Inactif'}</span>
      <div class="iacts">
        <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openEditLivreur('${l.id}')">
          <i class="fa-solid fa-pen"></i>
        </button>
      </div>
    </li>`).join('');
}

function openEditLivreur(id) {
  const lv = livreurs.find(l=>l.id===id);
  if (!lv) return;
  document.getElementById('m-livreur-titre').textContent = 'Modifier le livreur';
  document.getElementById('lv-edit-id').value  = id;
  document.getElementById('lv-nom').value      = lv.nom||'';
  document.getElementById('lv-prenom').value   = lv.prenom||'';
  document.getElementById('lv-tel').value      = lv.telephone||'';
  document.getElementById('lv-actif').value    = String(lv.actif);
  document.getElementById('lv-del-wrap').style.display = 'block';
  openModal('m-livreur');
}

function openNewLivreur() {
  document.getElementById('m-livreur-titre').textContent = 'Nouveau livreur';
  document.getElementById('lv-edit-id').value = '';
  ['lv-nom','lv-prenom','lv-tel'].forEach(id => document.getElementById(id).value='');
  document.getElementById('lv-actif').value = 'true';
  document.getElementById('lv-del-wrap').style.display = 'none';
  openModal('m-livreur');
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
  let error;
  if (id) { ({error}=await sb.from('livreurs').update(payload).eq('id',id)); }
  else    { ({error}=await sb.from('livreurs').insert(payload)); }
  if (error) { toast('Erreur : '+error.message,'error'); return; }
  closeModal('m-livreur');
  toast(id?'Livreur mis à jour ✓':'Livreur ajouté ✓');
  await refreshParamLivreurs();
  await loadLivreurs(); // Rafraîchir globalement
  await loadClientsCache();
attachClientAutocomplete('c-client', 'c-tel');
attachClientAutocomplete('edit-client', 'edit-tel');
}

async function deleteLivreur() {
  const id = document.getElementById('lv-edit-id').value;
  if (!id||!confirm('Supprimer ce livreur ? Les courses associées seront conservées.')) return;
  const {error} = await sb.from('livreurs').delete().eq('id',id);
  if (error) { toast('Erreur','error'); return; }
  closeModal('m-livreur');
  toast('Livreur supprimé');
  await refreshParamLivreurs();
  await loadLivreurs();
}

// ── Services CRUD ──
async function refreshParamServices() {
  const { data } = await sb.from('services').select('*').order('nom_service');
  services = data||[];
  servicesMap = Object.fromEntries(services.map(s=>[s.id,s.nom_service]));
  const el = document.getElementById('p-services-list');
  if (!el) return;
  if (!services.length) {
    el.innerHTML = `<div class="empty" style="padding:20px"><i class="fa-solid fa-list"></i><p>Aucun service</p></div>`;
    return;
  }
  el.innerHTML = services.map(s => `
    <li class="irow">
      <div class="iicon"><i class="fa-solid fa-motorcycle"></i></div>
      <div class="iinfo">
        <div class="iname">${s.nom_service}</div>
        <div class="imeta">${fmtFCFA(s.prix_base)} de base${s.pct_livreur?` · Répart. spécifique`:''}</div>
      </div>
      <span class="badge ${s.actif?'badge-livré':'badge-annulé'}">${s.actif?'Actif':'Inactif'}</span>
      <div class="iacts">
        <button class="header-btn btn-ghost btn-icon btn-sm" onclick="openEditService('${s.id}')">
          <i class="fa-solid fa-pen"></i>
        </button>
      </div>
    </li>`).join('');
}

function openEditService(id) {
  const sv = services.find(s=>s.id===id);
  if (!sv) return;
  document.getElementById('m-service-titre').textContent = 'Modifier le service';
  document.getElementById('sv-edit-id').value  = id;
  document.getElementById('sv-nom').value      = sv.nom_service||'';
  document.getElementById('sv-desc').value     = sv.description||'';
  document.getElementById('sv-prix').value     = sv.prix_base||0;
  document.getElementById('sv-pct-l').value    = sv.pct_livreur||'';
  document.getElementById('sv-pct-c').value    = sv.pct_carburant||'';
  document.getElementById('sv-pct-e').value    = sv.pct_entreprise||'';
  document.getElementById('sv-actif').value    = String(sv.actif);
  document.getElementById('sv-del-wrap').style.display = 'block';
  openModal('m-service');
}

async function saveService() {
  const nom = document.getElementById('sv-nom').value.trim();
  if (!nom) { toast('Nom requis','error'); return; }
  const id = document.getElementById('sv-edit-id').value;
  const pL = document.getElementById('sv-pct-l').value;
  const pC = document.getElementById('sv-pct-c').value;
  const pE = document.getElementById('sv-pct-e').value;
  if ((pL||pC||pE) && (parseInt(pL||0)+parseInt(pC||0)+parseInt(pE||0))!==100) {
    toast('Les % spécifiques doivent totaliser 100%','error'); return;
  }
  const payload = {
    nom_service: nom,
    description: document.getElementById('sv-desc').value.trim()||null,
    prix_base: parseInt(document.getElementById('sv-prix').value)||0,
    pct_livreur:    pL ? parseInt(pL) : null,
    pct_carburant:  pC ? parseInt(pC) : null,
    pct_entreprise: pE ? parseInt(pE) : null,
    actif: document.getElementById('sv-actif').value === 'true'
  };
  let error;
  if (id) { ({error}=await sb.from('services').update(payload).eq('id',id)); }
  else    { ({error}=await sb.from('services').insert(payload)); }
  if (error) { toast('Erreur : '+error.message,'error'); return; }
  closeModal('m-service');
  toast(id?'Service mis à jour ✓':'Service ajouté ✓');
  await refreshParamServices();
  await loadServices();
}

async function deleteService() {
  const id = document.getElementById('sv-edit-id').value;
  if (!id||!confirm('Supprimer ce service ?')) return;
  const {error} = await sb.from('services').delete().eq('id',id);
  if (error) { toast('Erreur','error'); return; }
  closeModal('m-service');
  toast('Service supprimé');
  await refreshParamServices();
  await loadServices();
}
