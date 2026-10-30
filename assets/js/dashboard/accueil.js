// ══════════════════════════════════════
// DASHBOARD DATA
// ══════════════════════════════════════
let chartRev = null, chartDep = null;

async function renderDashboard() {
  const pickerEl = document.getElementById('dash-date-picker');
  const pickedStr = pickerEl?._flatpickr?.selectedDates?.[0];
  const today = pickedStr ? new Date(pickedStr) : new Date();
  const todayStr = today.toISOString().split('T')[0];
  const month = today.getMonth() + 1;
  const year  = today.getFullYear();
  // Afficher ou cacher le bouton reset
  const isToday = todayStr === new Date().toISOString().split('T')[0];
  const resetBtn = document.getElementById('dash-reset-btn');
  if (resetBtn) resetBtn.style.display = isToday ? 'none' : '';

  // ── KPIs ──
  // Courses aujourd'hui
  const { data: coursesDay } = await sb
    .from('commandes')
    .select('id, prix_total, statut')
    .eq('date_course', todayStr);

  const livrees  = (coursesDay || []).filter(c => c.statut === 'livré');
  const enCours  = (coursesDay || []).filter(c => c.statut === 'en_cours');
  const revDay   = livrees.reduce((s, c) => s + (c.prix_total || 0), 0);

  document.getElementById('kpi-courses-day').textContent = (coursesDay || []).length;
  document.getElementById('kpi-courses-sub').textContent =
    `${livrees.length} livrée(s) · ${enCours.length} en cours`;
  document.getElementById('kpi-rev-day').textContent = fmtFCFA(revDay);
  document.getElementById('kpi-rev-sub').textContent = 'Courses livrées uniquement';

  // Badge sidebar
  document.getElementById('badge-encours').textContent = enCours.length;

  // Dépenses du mois
  const { data: depMois } = await sb
    .from('depenses')
    .select('montant')
    .gte('date_depense', `${year}-${String(month).padStart(2,'0')}-01`);
  const totDep = (depMois || []).reduce((s, d) => s + (d.montant || 0), 0);
  document.getElementById('kpi-dep-month').textContent = fmtFCFA(totDep);
  document.getElementById('kpi-dep-sub').textContent = `${(depMois || []).length} dépense(s) enregistrée(s)`;

  // Revenus du mois
  const { data: revMois } = await sb
    .from('commandes')
    .select('prix_total')
    .eq('statut', 'livré')
    .gte('date_course', `${year}-${String(month).padStart(2,'0')}-01`);
  const totRev = (revMois || []).reduce((s, c) => s + (c.prix_total || 0), 0);

  // Solde reporté du mois précédent
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  let soldeReporte = 0;
  try {
    const { data: prevStats } = await sb
      .from('statistiques_mensuelles')
      .select('solde_reporte')
      .eq('mois', prevMonth)
      .eq('annee', prevYear)
      .maybeSingle();
    soldeReporte = prevStats?.solde_reporte || 0;
  } catch(_) { soldeReporte = 0; }

  const solde = totRev - totDep + soldeReporte;
  document.getElementById('kpi-solde').textContent = fmtFCFA(solde);
  const soldeEl = document.getElementById('kpi-solde-sub');
  soldeEl.textContent = solde >= 0 ? `Revenus ${fmtFCFA(totRev)} · Dépenses ${fmtFCFA(totDep)}` : 'Déficit ce mois';
  soldeEl.className = 'kpi-sub ' + (solde >= 0 ? 'pos' : 'neg');
  const reportEl = document.getElementById('kpi-report-sub');
  if (soldeReporte > 0) {
    reportEl.style.display = 'block';
    reportEl.textContent = `+ ${fmtFCFA(soldeReporte)} reporté de ${['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][prevMonth-1]}`;
  } else {
    reportEl.style.display = 'none';
  }

  // Mise à jour automatique des stats du mois pour préparer le report
  try {
    await sb.from('statistiques_mensuelles').upsert({
      mois: month, annee: year,
      revenu_total: totRev,
      depenses_total: totDep,
      solde_reporte: soldeReporte,
      benefice: totRev - totDep,
      recalcule_at: new Date().toISOString()
    }, { onConflict: 'mois,annee', ignoreDuplicates: false });
  } catch(_) { /* Colonne solde_reporte à ajouter via SQL si erreur */ }

// ── OBJECTIF MENSUEL ──
  const objectif = parametres.objectif_ca || 0;
  document.getElementById('target-ca').textContent = fmtFCFA(objectif);
  document.getElementById('target-real').textContent = fmtFCFA(totRev);
  const pct = objectif > 0 ? Math.min(100, Math.round(totRev / objectif * 100)) : 0;
  document.getElementById('target-fill').style.width = pct + '%';
  const reste = objectif - totRev;
  document.getElementById('target-note').textContent =
    objectif === 0
      ? `Définissez un objectif dans Paramètres`
      : pct >= 100
        ? `✅ Objectif atteint — excédent de ${fmtFCFA(totRev - objectif)}`
        : `${pct}% de l'objectif atteint — encore ${fmtFCFA(reste)} à couvrir`;

  // ── CHARGES FIXES LISTE ──
  const chargesEl = document.getElementById('charges-list');
  const { data: charges } = await sb.from('charges_fixes').select('*').eq('actif', true);
  if (charges?.length) {
    chargesEl.innerHTML = charges.map(c => `
      <div style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--r);padding:10px 14px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">${c.type_charge === 'fixe_directe' ? 'Charge fixe' : 'Provision'}</div>
        <div style="font-size:13px;font-weight:600;margin-top:2px">${c.poste}</div>
        <div style="font-family:var(--font-h);font-size:15px;font-weight:800;color:var(--blue);margin-top:4px">${fmtFCFA(c.montant_mensuel)}</div>
        ${c.notes ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;font-style:italic">${c.notes}</div>` : ''}
      </div>`).join('');
  }

  // ── COURSES RÉCENTES ──
  const { data: recentes } = await sb
    .from('commandes')
    .select('id, nom_client, prix_total, statut, date_course, service_id')
    .order('created_at', { ascending: false })
    .limit(5);

  const tbody = document.getElementById('recent-courses');
  if (!recentes?.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><i class="fa-solid fa-motorcycle"></i><p>Aucune course enregistrée</p></div></td></tr>`;
  } else {
    const svcMap = Object.fromEntries(services.map(s => [s.id, s.nom_service]));
    tbody.innerHTML = recentes.map(c => `
      <tr>
        <td>${c.nom_client || '<span class="td-muted">—</span>'}</td>
        <td class="td-muted">${svcMap[c.service_id] || '—'}</td>
        <td class="td-mono">${fmtFCFA(c.prix_total)}</td>
        <td><span class="badge badge-${c.statut}">${c.statut.replace('_', ' ')}</span></td>
      </tr>`).join('');
  }

  // ── LIVREURS PERFORMANCE ──
  const { data: cmdMois } = await sb
    .from('commandes')
    .select('id, prix_total, statut')
    .eq('statut', 'livré')
    .gte('date_course', `${year}-${String(month).padStart(2,'0')}-01`);

  const { data: cmdLivs } = await sb
    .from('commandes_livreurs')
    .select('commande_id, livreur_id');

  const livMap = {};
  (cmdLivs || []).forEach(cl => {
    const cmd = (cmdMois || []).find(c => c.id === cl.commande_id);
    if (cmd) {
      if (!livMap[cl.livreur_id]) livMap[cl.livreur_id] = { courses: 0, revenus: 0 };
      livMap[cl.livreur_id].courses++;
      livMap[cl.livreur_id].revenus += cmd.prix_total || 0;
    }
  });

const totalCourses = Object.values(livMap).reduce((s, l) => s + l.courses, 0);
  const livPerf = document.getElementById('livreurs-perf');
  if (!livreurs.length) {
    livPerf.innerHTML = '<div class="empty"><i class="fa-solid fa-user"></i><p>Aucun livreur</p></div>';
  } else {
    livPerf.innerHTML = livreurs.map(l => {
      const stats = livMap[l.id] || { courses: 0, revenus: 0 };
      const pct = totalCourses > 0 ? Math.round(stats.courses / totalCourses * 100) : 0;
      const initiales = l.nom.slice(0, 2).toUpperCase();
      return `<div class="livreur-row">
        <div class="livreur-avatar">${initiales}</div>
        <div class="livreur-info">
          <div class="livreur-name">${l.nom}</div>
          <div class="perf-bar" style="margin-top:5px">
            <div class="prog-wrap" style="height:4px">
              <div class="prog-fill" style="width:${pct}%"></div>
            </div>
            <span class="perf-pct">${pct}%</span>
          </div>
          <div class="livreur-meta">${stats.courses} course(s) · ${fmtFCFA(stats.revenus)}</div>
        </div>
        <div class="livreur-courses">${stats.courses}</div>
      </div>`;
    }).join('');
  }

  // ── GRAPHIQUES ──
  await buildChartRev(year, month);
  await buildChartDep(year, month);
}

// Chart revenus 7 jours
async function buildChartRev(year, month) {
  const today = new Date();
  const labels = [], vals = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
    const { data } = await sb.from('commandes').select('prix_total').eq('statut', 'livré').eq('date_course', ds);
    vals.push((data || []).reduce((s, c) => s + (c.prix_total || 0), 0));
  }
  const ctx = document.getElementById('chart-revenus').getContext('2d');
  if (chartRev) chartRev.destroy();
  chartRev = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenus (FCFA)',
        data: vals,
        backgroundColor: '#2121a3',
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtFCFA(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: '#9898b8', font: { family: 'Jost', size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#9898b8', font: { family: 'Jost', size: 10 }, callback: v => v >= 1000 ? Math.round(v/1000)+'K' : v }, grid: { color: 'rgba(33,33,163,0.06)' } }
      }
    }
  });
}

// Chart dépenses par catégorie
async function buildChartDep(year, month) {
  const { data } = await sb
    .from('depenses')
    .select('categorie, montant')
    .gte('date_depense', `${year}-${String(month).padStart(2,'0')}-01`);

  const map = {};
  (data || []).forEach(d => { map[d.categorie] = (map[d.categorie] || 0) + d.montant; });
  const labels = Object.keys(map).map(k => k.replace(/_/g, ' '));
  const vals   = Object.values(map);

  const ctx = document.getElementById('chart-depenses').getContext('2d');
  if (chartDep) chartDep.destroy();
  if (!vals.length) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#9898b8'; ctx.font = '13px Jost'; ctx.textAlign = 'center';
    ctx.fillText('Aucune dépense ce mois', ctx.canvas.width / 2, ctx.canvas.height / 2);
    return;
  }
  const pal = ['#2121a3','#c3161c','#fec200','#0db87a','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#f97316','#ec4899'];
  chartDep = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: pal.slice(0, vals.length), borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { color: '#5a5a8a', font: { size: 10, family: 'Jost' }, boxWidth: 10, padding: 8 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmtFCFA(c.parsed)}` } }
      }
    }
  });
}
