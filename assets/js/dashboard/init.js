// ══════════════════════════════════════
// INIT — Auth guard
// ══════════════════════════════════════
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = './index.html';
    return;
  }
  currentUser = session.user;
  initFCSelects();
  initDatePickers();
  await loadProfil();
  if (!currentProfil?.actif) {
    showCompteInactif();
    return;
  }
  applyRoleUI();
  await Promise.all([loadParametres(), loadServices(), loadLivreurs(), loadSuggestions()]);
  initUI();
  initCommandeForms();
  renderDashboard();
}

async function loadProfil() {
  const { data } = await sb
    .from('profils')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();
  if (!data) return;
  currentProfil = data;
  isAdmin = data.role === 'admin' && data.actif;
  document.getElementById('user-avatar').textContent = (data.nom || 'U').slice(0, 2).toUpperCase();
  document.getElementById('user-name').textContent = (data.prenom ? data.prenom + ' ' : '') + data.nom;
  document.getElementById('user-role').textContent = isAdmin ? 'Administrateur' : 'Opérateur';
}

// Affiche/masque les blocs selon le rôle. L'interface n'est qu'un confort :
// la protection réelle est le RLS (un opérateur ne reçoit pas les données).
function applyRoleUI() {
  document.body.classList.toggle('role-admin', isAdmin);
  document.body.classList.toggle('role-operateur', !isAdmin);
  document.querySelectorAll('.admin-only').forEach(el => { el.hidden = !isAdmin; });
  document.querySelectorAll('.operator-only').forEach(el => { el.hidden = isAdmin; });
}

// Compte sans profil ou désactivé : le RLS ne lui renvoie rien, autant le dire
function showCompteInactif() {
  document.getElementById('user-name').textContent = currentUser.email || 'Compte';
  document.getElementById('user-role').textContent = 'Non activé';
  document.querySelectorAll('.sb-nav, #header-cta').forEach(el => { el.hidden = true; });
  document.getElementById('main').innerHTML = `
    <div class="empty" style="padding:80px 20px">
      <i class="fa-solid fa-user-lock"></i>
      <p style="font-size:15px;font-weight:600;color:var(--text)">Compte en attente d'activation</p>
      <p>Votre accès n'a pas encore été activé. Contactez l'administrateur FaiChap.</p>
      <div class="empty-action"><button class="header-btn btn-ghost" onclick="logout()"><i class="fa-solid fa-right-from-bracket"></i> Se déconnecter</button></div>
    </div>`;
}

async function loadParametres() {
  const { data } = await sb.from('parametres').select('*').eq('id', 1).maybeSingle();
  if (data) parametres = data;
}

async function loadServices() {
  const { data } = await sb.from('services').select('*').order('nom_service');
  if (!data) return;
  allServices = data;
  services = data.filter(s => s.actif);
  servicesMap = Object.fromEntries(data.map(s => [s.id, s.nom_service]));
  const opts = '<option value="">Sélectionner...</option>' +
    services.map(s => `<option value="${esc(s.id)}" data-prix="${esc(s.prix_base)}">${esc(s.nom_service)}</option>`).join('');
  ['c-service', 'edit-service'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) { sel.innerHTML = opts; fcSync(id); }
  });
}

async function loadLivreurs() {
  const { data } = await sb.from('livreurs').select('*').order('nom');
  if (!data) return;
  allLivreurs = data;
  livreurs = data.filter(l => l.actif);
  livreursMap = Object.fromEntries(data.map(l => [l.id, livreurLabel(l)]));
}

// Clients, lieux et zones déjà saisis (tous opérateurs confondus) pour l'autocomplétion
async function loadSuggestions() {
  const data = await rpc('suggestions_saisie');
  if (data) suggestions = data;
}

// Ajoute localement les valeurs d'une course qu'on vient d'enregistrer
function rememberSuggestions(c) {
  const bump = (list, nom, extra = {}) => {
    if (!nom) return;
    const it = list.find(x => norm(x.nom) === norm(nom));
    if (it) { it.n++; Object.assign(it, extra); } else list.push({ nom, n: 1, ...extra });
  };
  if (c.nom_client) {
    const it = suggestions.clients.find(x =>
      (c.telephone_client && x.tel === c.telephone_client) || norm(x.nom) === norm(c.nom_client));
    if (it) { it.n++; it.nom = c.nom_client; if (c.telephone_client) it.tel = c.telephone_client; }
    else suggestions.clients.push({ nom: c.nom_client, tel: c.telephone_client, n: 1 });
  }
  bump(suggestions.lieux, c.adresse_depart);
  bump(suggestions.lieux, c.adresse_arrivee);
  bump(suggestions.zones, c.zone);
}

// ══════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════
async function logout() {
  await sb.auth.signOut();
  window.location.href = './index.html';
}
