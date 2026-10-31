// ══════════════════════════════════════
// MODULE STATISTIQUES
// Avant : 24 à 30 requêtes enchaînées (une par jour ou par mois) +
// agrégations en JS → la lenteur venait des requêtes, pas de l'hébergement.
// Maintenant : 2 appels en parallèle, calculés par la base, mis en cache 1 min.
//
// Solde de clôture = solde reporté + CA − dépenses de la période.
// Il devient le solde reporté de la période suivante (cumul = caisse théorique).
// ══════════════════════════════════════

let statPeriod = 'mois';
let chartStatSvc = null, chartStatDep = null, chartStatEvol = null;
const statCache = new Map(); // clé période → { t, stats, serie }
const STAT_TTL = 60_000;

let statSelectorsReady = false;
function initStatSelectors() {
  if (statSelectorsReady) return;
  statSelectorsReady = true;
  fillPeriodSelects(document.getElementById('stat-filter-mois'), document.getElementById('stat-filter-annee'));
}

function toggleStatPeriod(p) {
  statPeriod = p;
  document.querySelectorAll('[data-stat-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.statPeriod === p));
  // Le mois n'a pas de sens en vue annuelle
  const mWrap = document.getElementById('stat-filter-mois')?.closest('.fc-select-wrap');
  if (mWrap) mWrap.hidden = p === 'annee';
  loadStats();
}

// Données d'une période, depuis le cache si récent
async function getPeriodData(period, annee, mois) {
  const { from, to } = period === 'mois' ? monthRange(annee, mois) : yearRange(annee);
  const key = `${period}|${from}`;
  const hit = statCache.get(key);
  if (hit && Date.now() - hit.t < STAT_TTL) return hit;

  const t0 = performance.now();
  const [stats, serie] = await Promise.all([
    rpc('stats_periode', { p_from: from, p_to: to }),
    rpc('serie_periode', { p_from: from, p_to: to, p_pas: period === 'mois' ? 'jour' : 'mois' })
  ]);
  if (!stats || !serie) return null;
  console.info(`[stats] ${key} calculé en ${Math.round(performance.now() - t0)} ms`);
  const entry = { t: Date.now(), stats, serie, from, to };
  statCache.set(key, entry);
  return entry;
}

let statLoadId = 0;
async function loadStats() {
  const loadId = ++statLoadId;
  const mois  = parseInt(document.getElementById('stat-filter-mois')?.value || new Date().getMonth()+1);
  const annee = parseInt(document.getElementById('stat-filter-annee')?.value || new Date().getFullYear());
  document.getElementById('view-statistiques').classList.add('is-loading');
  const d = await getPeriodData(statPeriod, annee, mois);
  if (loadId !== statLoadId) return; // une autre période a été demandée entre-temps
  document.getElementById('view-statistiques').classList.remove('is-loading');
  if (!d) return;

  const s = d.stats;
  const resultat = s.revenus - s.depenses;
  const marge    = s.revenus > 0 ? Math.round(resultat / s.revenus * 100) : 0;
  const tauxLiv  = s.courses_total ? Math.round(s.courses_livrees / s.courses_total * 100) : 0;
  const libPeriode = statPeriod === 'mois' ? `${MONTHS_FR[mois - 1]} ${annee}` : `Année ${annee}`;
  const kpi = (icon, color, label, value, sub, valueClass = '') => `
    <div class="kpi-card">
      <div class="kpi-card-accent ${color}"></div>
      <div class="kpi-icon ${color}"><i class="fa-solid ${icon}"></i></div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ${valueClass}">${value}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`;

  document.getElementById('stat-kpis').innerHTML = [
    kpi('fa-motorcycle', 'blue', 'Courses livrées', s.courses_livrees,
        `Taux ${tauxLiv}% · ${s.courses_total} au total · ${s.courses_annulees} annulée(s)`),
    kpi('fa-money-bill-wave', 'green', "Chiffre d'affaires", fmtFCFA(s.revenus),
        `Moy. ${s.courses_livrees ? fmtFCFA(Math.round(s.revenus / s.courses_livrees)) : '—'} / course`, 'kv-green'),
    kpi('fa-arrow-trend-down', 'red', 'Total dépenses', fmtFCFA(s.depenses), `${s.nb_depenses} dépense(s)`, 'kv-red'),
    kpi('fa-scale-balanced', resultat >= 0 ? 'green' : 'red', 'Résultat de la période', fmtFCFA(resultat),
        `CA − dépenses · marge ${marge}%`, resultat >= 0 ? 'kv-green' : 'kv-red'),
    kpi('fa-user', 'blue', 'Part livreurs', fmtFCFA(s.part_livreurs),
        `${s.revenus ? Math.round(s.part_livreurs / s.revenus * 100) : 0}% du CA`),
    kpi('fa-clock-rotate-left', 'yellow', 'Solde reporté', fmtFCFA(s.solde_reporte),
        `Caisse au début · ${statPeriod === 'mois' ? 'clôture du mois précédent' : `clôture ${annee - 1}`}`),
    kpi('fa-wallet', s.solde_cloture >= 0 ? 'green' : 'red', 'Solde de clôture', fmtFCFA(s.solde_cloture),
        `Reporté + résultat · ${libPeriode}`, s.solde_cloture >= 0 ? 'kv-green' : 'kv-red'),
    kpi('fa-gas-pump', 'yellow', 'Part carburant', fmtFCFA(s.part_carburant),
        `Entreprise : ${fmtFCFA(s.part_entreprise)}`),
  ].join('');

  // Camemberts
  _buildStatPie('chart-stat-services', chartStatSvc,
    s.par_service.map(x => servicesMap[x.service_id] || 'Autre'), s.par_service.map(x => Number(x.revenus)),
    null, c => { chartStatSvc = c; });
  _buildStatPie('chart-stat-depenses', chartStatDep,
    s.par_categorie.map(x => catMeta(x.categorie).label), s.par_categorie.map(x => Number(x.montant)),
    s.par_categorie.map(x => catMeta(x.categorie).color), c => { chartStatDep = c; });

  _buildEvolChart(d, annee, mois);
  _buildLivreursTable(s);
  _buildServicesTable(s);
}

const STAT_PAL = ['#2121a3','#c3161c','#fec200','#0db87a','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#84cc16','#f97316','#ec4899'];

function _buildStatPie(id, existing, labels, vals, colors, setter) {
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  if (existing) existing.destroy();
  if (!vals.length) {
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.fillStyle='#9898b8';ctx.font='12px Jost';ctx.textAlign='center';
    ctx.fillText('Aucune donnée',ctx.canvas.width/2,ctx.canvas.height/2);
    setter(null); return;
  }
  setter(new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data:vals,backgroundColor:colors || STAT_PAL.slice(0,vals.length),borderWidth:0,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{
        legend:{position:'right',labels:{color:'#5a5a8a',font:{size:10,family:'Jost'},boxWidth:10,padding:7}},
        tooltip:{callbacks:{label:c=>`${c.label}: ${fmtFCFA(c.parsed)}`}}
      }}
  }));
}

// Évolution : par jour (mois) ou par mois (année), avec la caisse cumulée
function _buildEvolChart(d, annee, mois) {
  const ctx = document.getElementById('chart-stat-evol')?.getContext('2d');
  if (!ctx) return;
  if (chartStatEvol) chartStatEvol.destroy();

  const parMois = statPeriod === 'annee';
  document.getElementById('stat-evol-title').textContent = parMois
    ? `Évolution mensuelle ${annee}` : `Évolution journalière — ${MONTHS_FR[mois - 1]} ${annee}`;

  let caisse = Number(d.stats.solde_reporte);
  const labels = [], revs = [], deps = [], caisses = [];
  d.serie.forEach(p => {
    const dt = parseDate(p.periode);
    labels.push(parMois ? MONTHS_SHORT[dt.getMonth()] : dt.getDate());
    revs.push(Number(p.revenus));
    deps.push(Number(p.depenses));
    caisse += Number(p.revenus) - Number(p.depenses);
    caisses.push(caisse);
  });

  chartStatEvol = new Chart(ctx,{
    data:{labels,datasets:[
      {type:'bar',label:'Revenus',data:revs,backgroundColor:'rgba(33,33,163,0.85)',borderRadius:5,order:2},
      {type:'bar',label:'Dépenses',data:deps,backgroundColor:'rgba(195,22,28,0.55)',borderRadius:5,order:3},
      {type:'line',label:'Caisse (solde cumulé)',data:caisses,borderColor:'#0db87a',backgroundColor:'rgba(13,184,122,0.08)',fill:true,tension:.35,pointRadius:parMois?4:2,pointBackgroundColor:'#0db87a',order:1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:'#5a5a8a',font:{size:11,family:'Jost'}}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtFCFA(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#9898b8',font:{family:'Jost',size:11}},grid:{display:false}},
        y:{ticks:{color:'#9898b8',font:{family:'Jost',size:10},callback:fmtK},grid:{color:'rgba(33,33,163,0.05)'}}
      }}
  });
}

function _buildLivreursTable(s) {
  const tbody = document.getElementById('stat-livreurs-tbody');
  const stats = Object.fromEntries(s.par_livreur.map(l => [l.livreur_id, l]));
  const list = allLivreurs
    .filter(l => l.actif || stats[l.id])
    .map(l => ({ l, x: stats[l.id] || { courses: 0, revenus: 0, part: 0 } }))
    .sort((a, b) => b.x.courses - a.x.courses);
  if (!list.length) { tbody.innerHTML=`<tr><td colspan="5"><div class="empty"><i class="fa-solid fa-user"></i><p>Aucun livreur</p></div></td></tr>`; return; }
  const totalCourses = Math.max(1, s.courses_livrees);
  tbody.innerHTML = list.map(({ l, x }) => {
    const pct = Math.round(x.courses / totalCourses * 100);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px">
        <div class="mini-avatar">${esc(l.nom.slice(0,2).toUpperCase())}</div>
        <span style="font-weight:600">${esc(livreurLabel(l))}</span>${l.actif ? '' : ' <span class="td-muted">(inactif)</span>'}
      </div></td>
      <td class="td-mono" style="color:var(--blue)">${x.courses}</td>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="prog-wrap" style="width:60px"><div class="prog-fill" style="width:${Math.min(100, pct)}%"></div></div>
        <span style="font-size:11px;color:var(--text3)">${pct}%</span>
      </div></td>
      <td class="td-mono" style="color:var(--success)">${fmtFCFA(x.revenus)}</td>
      <td class="td-mono" style="color:var(--blue)">${fmtFCFA(x.part)}</td>
    </tr>`;
  }).join('');
}

function _buildServicesTable(s) {
  const tbody = document.getElementById('stat-services-tbody');
  const rows = s.par_service;
  if (!rows.length) { tbody.innerHTML=`<tr><td colspan="4"><div class="empty"><i class="fa-solid fa-motorcycle"></i><p>Aucune donnée</p></div></td></tr>`; return; }
  const maxT = Math.max(...rows.map(r => Number(r.revenus)));
  tbody.innerHTML = rows.map(r => {
    const pct = maxT ? Math.round(r.revenus / maxT * 100) : 0;
    return `<tr>
      <td style="font-weight:500">${esc(servicesMap[r.service_id] || 'Autre')}</td>
      <td class="td-mono" style="color:var(--blue)">${r.courses}</td>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="prog-wrap" style="width:70px;height:5px"><div class="prog-fill" style="width:${pct}%"></div></div>
        <span class="td-mono" style="color:var(--success)">${fmtFCFA(r.revenus)}</span>
      </div></td>
      <td class="td-muted">${fmtFCFA(Math.round(r.revenus / r.courses))}</td>
    </tr>`;
  }).join('');
}
