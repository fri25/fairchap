// ══════════════════════════════════════
// DASHBOARD DATA
// Tous les chiffres viennent de stats_periode / serie_periode :
// calculés par la base, sans limite de lignes, et limités par le RLS
// aux données de l'utilisateur quand c'est un opérateur.
// ══════════════════════════════════════
let chartRev = null, chartDep = null;
let dashRenderId = 0; // ignore les réponses d'un rendu précédent (changement de date rapide)

async function renderDashboard() {
  const renderId = ++dashRenderId;
  const picked = document.getElementById('dash-date-picker')?._flatpickr?.selectedDates?.[0];
  const day    = picked || new Date();
  const dayStr = isoDate(day);
  const month  = day.getMonth() + 1;
  const year   = day.getFullYear();
  const { from: mFrom, to: mTo } = monthRange(year, month);
  const resetBtn = document.getElementById('dash-reset-btn');
  if (resetBtn) resetBtn.style.display = dayStr === isoDate() ? 'none' : '';

  const [jour, mois, serie, recentesRes, chargesRes] = await Promise.all([
    rpc('stats_periode', { p_from: dayStr, p_to: dayStr }),
    rpc('stats_periode', { p_from: mFrom,  p_to: mTo }),
    rpc('serie_periode', { p_from: isoDate(addDays(day, -6)), p_to: dayStr }),
    sb.from('commandes')
      .select('id, nom_client, prix_total, statut, date_course, service_id')
      .order('created_at', { ascending: false })
      .limit(6),
    isAdmin ? sb.from('charges_fixes').select('*').eq('actif', true).order('montant_mensuel', { ascending: false })
            : Promise.resolve({ data: [] })
  ]);
  if (renderId !== dashRenderId || !jour || !mois) return;

  const nomMois = MONTHS_FR[month - 1].toLowerCase();

  // ── KPIs du jour ──
  document.getElementById('kpi-courses-day').textContent = jour.courses_total;
  document.getElementById('kpi-courses-sub').textContent =
    `${jour.courses_livrees} livrée(s) · ${jour.courses_en_cours + jour.courses_en_attente} en cours`;
  document.getElementById('kpi-rev-day').textContent = fmtFCFA(jour.revenus);
  document.getElementById('kpi-rev-sub').textContent = 'Courses livrées uniquement';
  document.getElementById('badge-encours').textContent = jour.courses_en_cours + jour.courses_en_attente;

  // ── Dépenses du mois ──
  document.getElementById('kpi-dep-month').textContent = fmtFCFA(mois.depenses);
  document.getElementById('kpi-dep-sub').textContent = `${mois.nb_depenses} dépense(s) en ${nomMois}`;

  // ── Admin : caisse (solde cumulé) — Opérateur : ses courses du mois ──
  if (isAdmin) {
    const resultat = mois.revenus - mois.depenses;
    document.getElementById('kpi-solde').textContent = fmtFCFA(mois.solde_cloture);
    const soldeEl = document.getElementById('kpi-solde-sub');
    soldeEl.textContent = `Résultat de ${nomMois} : ${resultat >= 0 ? '+' : ''}${fmtFCFA(resultat)}`;
    soldeEl.className = 'kpi-sub ' + (resultat >= 0 ? 'pos' : 'neg');
    const reportEl = document.getElementById('kpi-report-sub');
    reportEl.style.display = 'block';
    reportEl.textContent = `Reporté du mois précédent : ${fmtFCFA(mois.solde_reporte)}`;
  } else {
    document.getElementById('kpi-mes-courses').textContent = mois.courses_total;
    document.getElementById('kpi-mes-courses-sub').textContent =
      `${mois.courses_livrees} livrée(s) · ${fmtFCFA(mois.revenus)} en ${nomMois}`;
  }

  // ── Objectif mensuel (admin) ──
  if (isAdmin) {
    const objectif = Number(parametres.objectif_ca || 0);
    document.getElementById('target-ca').textContent = fmtFCFA(objectif);
    document.getElementById('target-real').textContent = fmtFCFA(mois.revenus);
    const pct = objectif > 0 ? Math.min(100, Math.round(mois.revenus / objectif * 100)) : 0;
    document.getElementById('target-fill').style.width = pct + '%';
    document.getElementById('target-note').textContent =
      objectif === 0
        ? 'Définissez un objectif dans Paramètres'
        : pct >= 100
          ? `✅ Objectif atteint — excédent de ${fmtFCFA(mois.revenus - objectif)}`
          : `${pct}% de l'objectif atteint — encore ${fmtFCFA(objectif - mois.revenus)} à couvrir`;

    const charges = chargesRes.data || [];
    document.getElementById('charges-list').innerHTML = charges.length ? charges.map(c => `
      <div class="charge-item">
        <div class="charge-type">${c.type_charge === 'fixe_directe' ? 'Charge fixe' : 'Provision'}</div>
        <div class="charge-poste">${esc(c.poste)}</div>
        <div class="charge-montant">${fmtFCFA(c.montant_mensuel)}</div>
        ${c.notes ? `<div class="charge-notes">${esc(c.notes)}</div>` : ''}
      </div>`).join('')
      : '<div class="td-muted" style="font-size:12px">Aucune charge budgétée</div>';
  }

  // ── Courses récentes ──
  const recentes = recentesRes.data || [];
  const tbody = document.getElementById('recent-courses');
  tbody.innerHTML = recentes.length ? recentes.map(c => `
      <tr>
        <td>${c.nom_client ? esc(c.nom_client) : '<span class="td-muted">—</span>'}</td>
        <td class="td-muted">${esc(servicesMap[c.service_id] || '—')}</td>
        <td class="td-mono">${fmtFCFA(c.prix_total)}</td>
        <td>${statutBadge(c.statut)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4"><div class="empty"><i class="fa-solid fa-motorcycle"></i><p>Aucune course enregistrée</p></div></td></tr>`;

  renderLivreursPerf(mois);
  buildChartRev(serie || []);
  buildChartDep(mois.par_categorie);
}

// ── Performance livreurs du mois ──
// Tous les livreurs actifs apparaissent (même à 0 course), ainsi que les
// inactifs qui ont roulé ce mois-ci. Un livreur ajouté s'affiche aussitôt.
function renderLivreursPerf(mois) {
  const stats = Object.fromEntries((mois.par_livreur || []).map(l => [l.livreur_id, l]));
  const list = allLivreurs
    .filter(l => l.actif || stats[l.id])
    .map(l => ({ l, s: stats[l.id] || { courses: 0, revenus: 0, part: 0 } }))
    .sort((a, b) => b.s.courses - a.s.courses || a.l.nom.localeCompare(b.l.nom));
  const max = Math.max(1, ...list.map(x => x.s.courses));

  const el = document.getElementById('livreurs-perf');
  if (!list.length) {
    el.innerHTML = '<div class="empty"><i class="fa-solid fa-user"></i><p>Aucun livreur</p></div>';
    return;
  }
  el.innerHTML = list.map(({ l, s }, i) => `
    <div class="livreur-row">
      <div class="livreur-avatar av-${i % 4}">${esc(l.nom.slice(0, 2).toUpperCase())}</div>
      <div class="livreur-info">
        <div class="livreur-name">${esc(livreurLabel(l))}${l.actif ? '' : ' <span class="td-muted">(inactif)</span>'}</div>
        <div class="perf-bar" style="margin-top:5px">
          <div class="prog-wrap" style="height:5px"><div class="prog-fill" style="width:${Math.round(s.courses / max * 100)}%"></div></div>
        </div>
        <div class="livreur-meta">${fmtFCFA(s.revenus)} de CA · part ${fmtFCFA(s.part)}</div>
      </div>
      <div class="livreur-courses" title="Courses livrées ce mois">${s.courses}</div>
    </div>`).join('');
}

// Chart revenus 7 jours (jusqu'au jour affiché)
function buildChartRev(serie) {
  const ctx = document.getElementById('chart-revenus').getContext('2d');
  if (chartRev) chartRev.destroy();
  chartRev = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: serie.map(p => parseDate(p.periode).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Revenus (FCFA)',
        data: serie.map(p => Number(p.revenus)),
        backgroundColor: '#2121a3',
        hoverBackgroundColor: '#3535c4',
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtFCFA(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: '#9898b8', font: { family: 'Jost', size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#9898b8', font: { family: 'Jost', size: 10 }, callback: fmtK }, grid: { color: 'rgba(33,33,163,0.06)' } }
      }
    }
  });
}

// Chart dépenses par catégorie (couleurs fixes par catégorie, cf. CAT_META)
function buildChartDep(parCategorie) {
  const ctx = document.getElementById('chart-depenses').getContext('2d');
  if (chartDep) { chartDep.destroy(); chartDep = null; }
  if (!parCategorie?.length) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#9898b8'; ctx.font = '13px Jost'; ctx.textAlign = 'center';
    ctx.fillText('Aucune dépense ce mois', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }
  chartDep = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: parCategorie.map(x => catMeta(x.categorie).label),
      datasets: [{ data: parCategorie.map(x => Number(x.montant)), backgroundColor: parCategorie.map(x => catMeta(x.categorie).color), borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { color: '#5a5a8a', font: { size: 10, family: 'Jost' }, boxWidth: 10, padding: 8 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmtFCFA(c.parsed)}` } }
      }
    }
  });
}
