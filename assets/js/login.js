// ── Rediriger si déjà connecté ──
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) window.location.href = './dashboard.html';
}
checkSession();

// ── Toggle mot de passe ──
function togglePassword() {
  const pw = document.getElementById('password');
  const open = document.getElementById('eye-open');
  const close = document.getElementById('eye-close');
  if (pw.type === 'password') {
    pw.type = 'text';
    open.style.display = 'none';
    close.style.display = 'block';
  } else {
    pw.type = 'password';
    open.style.display = 'block';
    close.style.display = 'none';
  }
}

// ── Connexion ──
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const btn = document.getElementById('btn-login');
  const alert = document.getElementById('alert-error');

  // Reset erreurs
  alert.classList.remove('show');
  document.getElementById('email').classList.remove('error');

  // Loading state
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      // Afficher erreur
      alert.classList.add('show');
      document.getElementById('email').classList.add('error');
      document.getElementById('password').classList.add('error');
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }

    // Connexion réussie → redirection
    window.location.href = './dashboard.html';

  } catch (err) {
    console.error(err);
    alert.textContent = 'Erreur de connexion. Vérifiez votre connexion internet.';
    alert.classList.add('show');
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ── Charger stats publiques (facultatif) ──
// Peut être désactivé si les données sont privées
async function loadPublicStats() {
  try {
    const now = new Date();
    const { data } = await sb
      .from('statistiques_mensuelles')
      .select('total_courses, revenu_total')
      .eq('mois', now.getMonth() + 1)
      .eq('annee', now.getFullYear())
      .single();

    if (data) {
      document.getElementById('stat-courses').textContent = data.total_courses;
      const rev = data.revenu_total;
      document.getElementById('stat-revenus').textContent =
        rev >= 1000 ? Math.round(rev / 1000) + 'K' : rev;
    }
  } catch (_) {
    // Silencieux si pas de données
  }
}
// Commenté par défaut — à activer si politique RLS publique configurée
// loadPublicStats();
