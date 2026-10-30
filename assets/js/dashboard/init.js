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
  await Promise.all([loadParametres(), loadServices(), loadLivreurs()]);
  initUI();
  renderDashboard();
}

async function loadProfil() {
  const { data } = await sb
    .from('profils')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (data) {
    currentProfil = data;
    const initiales = (data.nom || 'U').slice(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initiales;
    document.getElementById('user-name').textContent = (data.prenom ? data.prenom + ' ' : '') + data.nom;
    document.getElementById('user-role').textContent = data.role === 'admin' ? 'Administrateur' : 'Opérateur';
    if (data.role !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }
  }
}

async function loadParametres() {
  const { data } = await sb.from('parametres').select('*').eq('id', 1).single();
  if (data) parametres = data;
}

async function loadServices() {
  const { data } = await sb.from('services').select('*').eq('actif', true).order('nom_service');
  if (data) {
    services = data;
    const sel = document.getElementById('c-service');
    sel.innerHTML = '<option value="">Sélectionner...</option>' +
      data.map(s => `<option value="${s.id}" data-prix="${s.prix_base}">${s.nom_service}</option>`).join('');
    fcSync('c-service');
  }
}
// ── AUTOCOMPLETE CLIENT ──
let clientsCache = [];

async function loadClientsCache() {
  const { data } = await sb.from('commandes')
    .select('nom_client, telephone_client')
    .not('nom_client', 'is', null)
    .neq('nom_client', 'Client inconnu')
    .order('created_at', { ascending: false });

  const seen = {};
  (data || []).forEach(c => {
    const key = c.telephone_client || c.nom_client;
    if (!seen[key]) seen[key] = { nom: c.nom_client, tel: c.telephone_client };
  });
  clientsCache = Object.values(seen);
}

function attachClientAutocomplete(inputId, telId) {
  const input = document.getElementById(inputId);
  const telInput = document.getElementById(telId);
  if (!input) return;

  let box = document.createElement('div');
  box.className = 'client-suggest';
  box.style.display = 'none';
  input.parentNode.appendChild(box);

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.style.display = 'none'; return; }
    const matches = clientsCache.filter(c =>
      c.nom.toLowerCase().includes(q)
    ).slice(0, 6);
    if (!matches.length) { box.style.display = 'none'; return; }
    box.innerHTML = matches.map(c => `
      <div class="client-suggest-item" data-nom="${c.nom}" data-tel="${c.tel || ''}">
        <div>${c.nom}</div>
        ${c.tel ? `<div class="suggest-tel">${c.tel}</div>` : ''}
      </div>`).join('');
    box.style.display = 'block';
    box.querySelectorAll('.client-suggest-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = item.dataset.nom;
        if (telInput && item.dataset.tel) telInput.value = item.dataset.tel;
        box.style.display = 'none';
      });
    });
  });

  document.addEventListener('click', e => {
    if (!input.parentNode.contains(e.target)) box.style.display = 'none';
  });
}
async function loadLivreurs() {
  
  const { data } = await sb.from('livreurs').select('*').eq('actif', true).order('nom');
  if (data) {
    livreurs = data;
    const sel = document.getElementById('c-livreur');
    sel.innerHTML = '<option value="">Sélectionner...</option>' +
      data.map(l => `<option value="${l.id}">${l.nom}${l.prenom ? ' ' + l.prenom : ''}</option>`).join('');
    fcSync('c-livreur');
  }
}

// ══════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════
async function logout() {
  await sb.auth.signOut();
  window.location.href = './index.html';
}
