// ══════════════════════════════════════
// MODULE STATISTIQUES
// ══════════════════════════════════════

let statPeriod = 'mois';
let chartStatSvc = null, chartStatDep = null, chartStatEvol = null;

function initStatSelectors() {
  const now = new Date();
  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const mSel = document.getElementById('stat-filter-mois');
  const aSel = document.getElementById('stat-filter-annee');
  if (!mSel||!aSel) return;
  mSel.innerHTML = MONTHS_FR.map((m,i) =>
    `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`
  ).join('');
  aSel.innerHTML = [2026,2027,2028,2029,2030].map(y =>
    `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`
  ).join('');
}

function toggleStatPeriod(p) {
  statPeriod = p;
  document.querySelectorAll('[data-stat-period]').forEach(b =>
    b.classList.toggle('active', b.dataset.statPeriod === p)
  );
  loadStats();
}

async function loadStats() {
  const mois  = parseInt(document.getElementById('stat-filter-mois')?.value || new Date().getMonth()+1);
  const annee = parseInt(document.getElementById('stat-filter-annee')?.value || new Date().getFullYear());
  let fromDate, toDate;
  if (statPeriod === 'mois') {
    const pad = String(mois).padStart(2,'0');
    const last = new Date(annee,mois,0).getDate();
    fromDate = `${annee}-${pad}-01`;
    toDate   = `${annee}-${pad}-${last}`;
  } else {
    fromDate = `${annee}-01-01`;
    toDate   = `${annee}-12-31`;
  }

  const [{ data: cmds }, { data: cmdsAll }, { data: deps }] = await Promise.all([
    sb.from('commandes').select('id,prix_total,statut,service_id,date_course,commandes_livreurs(livreur_id)').gte('date_course',fromDate).lte('date_course',toDate),
    sb.from('commandes').select('id,statut').gte('date_course',fromDate).lte('date_course',toDate),
    sb.from('depenses').select('*').gte('date_depense',fromDate).lte('date_depense',toDate)
  ]);

  const livrees = (cmds||[]).filter(c=>c.statut==='livré');
  const allC    = cmdsAll||[];
  const depenses = deps||[];
  const cmdIds  = livrees.map(c=>c.id);

  let repartitions = [];
  if (cmdIds.length) {
    const { data: reps } = await sb.from('repartition_financiere').select('*').in('commande_id',cmdIds);
    repartitions = reps||[];
  }

  const totRev   = livrees.reduce((s,c)=>s+c.prix_total,0);
  const totDep   = depenses.reduce((s,d)=>s+d.montant,0);
  const benefice = totRev-totDep;
  const totLiv   = repartitions.reduce((s,r)=>s+r.part_livreur,0);
 const tauxLiv  = allC.length ? Math.round(livrees.length/allC.length*100) : 0;

  // Solde reporté depuis le mois précédent
  const prevMois  = mois === 1 ? 12 : mois - 1;
  const prevAnnee = mois === 1 ? annee - 1 : annee;
  let soldeReporte = 0;
  try {
    const { data: prevStat } = await sb
      .from('statistiques_mensuelles')
      .select('solde_cloture')
      .eq('mois', prevMois)
      .eq('annee', prevAnnee)
      .maybeSingle();
    soldeReporte = prevStat?.solde_cloture || 0;
  } catch(_) { soldeReporte = 0; }

  // KPIs
  document.getElementById('stat-kpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-card-accent blue"></div>
      <div class="kpi-icon blue"><i class="fa-solid fa-motorcycle"></i></div>
      <div class="kpi-label">Courses livrées</div>
      <div class="kpi-value" style="color:var(--blue)">${livrees.length}</div>
      <div class="kpi-sub">Taux ${tauxLiv}% · ${allC.length} total</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-accent green"></div>
      <div class="kpi-icon green"><i class="fa-solid fa-money-bill-wave"></i></div>
      <div class="kpi-label">Chiffre d'affaires</div>
      <div class="kpi-value kv-green">${fmtFCFA(totRev)}</div>
      <div class="kpi-sub">Moy. ${livrees.length?fmtFCFA(Math.round(totRev/livrees.length)):'—'} / course</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-accent red"></div>
      <div class="kpi-icon red"><i class="fa-solid fa-arrow-down"></i></div>
      <div class="kpi-label">Total dépenses</div>
      <div class="kpi-value kv-red">${fmtFCFA(totDep)}</div>
      <div class="kpi-sub">${depenses.length} dépense(s)</div>
    </div>
    <div class="kpi-card ${benefice>=0?'k-green':'k-red'}">
      <div class="kpi-card-accent ${benefice>=0?'green':'red'}"></div>
      <div class="kpi-icon ${benefice>=0?'green':'red'}"><i class="fa-solid fa-scale-balanced"></i></div>
      <div class="kpi-label">Bénéfice net</div>
      <div class="kpi-value ${benefice>=0?'kv-green':'kv-red'}">${fmtFCFA(benefice)}</div>
      <div class="kpi-sub">${benefice>=0?'✅ Positif':'⚠️ Déficitaire'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-accent"></div>
      <div class="kpi-icon blue"><i class="fa-solid fa-user"></i></div>
      <div class="kpi-label">Part livreurs</div>
      <div class="kpi-value" style="color:var(--blue)">${fmtFCFA(totLiv)}</div>
      <div class="kpi-sub">${totRev?Math.round(totLiv/totRev*100):0}% du CA</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-accent blue"></div>
      <div class="kpi-icon blue"><i class="fa-solid fa-clock-rotate-left"></i></div>
      <div class="kpi-label">Solde reporté</div>
      <div class="kpi-value" style="color:var(--blue)">${fmtFCFA(soldeReporte)}</div>
      <div class="kpi-sub">Caisse début de période</div>
    </div>
    <div class="kpi-card ${(benefice + soldeReporte)>=0?'k-green':'k-red'}">
      <div class="kpi-card-accent ${(benefice + soldeReporte)>=0?'green':'red'}"></div>
      <div class="kpi-icon ${(benefice + soldeReporte)>=0?'green':'red'}"><i class="fa-solid fa-wallet"></i></div>
      <div class="kpi-label">Solde clôture</div>
      <div class="kpi-value ${(benefice + soldeReporte)>=0?'kv-green':'kv-red'}">${fmtFCFA(benefice + soldeReporte)}</div>
      <div class="kpi-sub">${(benefice + soldeReporte)>=0?'✅ Positif':'⚠️ Déficitaire'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card-accent ${totRev > 0 && (benefice/totRev*100) >= 20 ? 'green' : 'yellow'}"></div>
      <div class="kpi-icon ${totRev > 0 && (benefice/totRev*100) >= 20 ? 'green' : 'yellow'}"><i class="fa-solid fa-percent"></i></div>
      <div class="kpi-label">Marge nette</div>
      <div class="kpi-value" style="color:${totRev > 0 && (benefice/totRev*100) >= 20 ? 'var(--success)' : 'var(--yellow)'}">
        ${totRev > 0 ? Math.round(benefice / totRev * 100) : 0}%
      </div>
      <div class="kpi-sub">Bénéfice / Chiffre d'affaires</div>
    </div>`;

  // Graphique revenus par service
  const svcMap2 = {};
  livrees.forEach(c => { const n=servicesMap[c.service_id]||'Autre'; svcMap2[n]=(svcMap2[n]||0)+c.prix_total; });
  _buildStatPie('chart-stat-services', chartStatSvc, Object.keys(svcMap2), Object.values(svcMap2), c=>{ chartStatSvc=c; });

  // Graphique dépenses par catégorie
  const depMap = {};
  depenses.forEach(d => { const l=CAT_META[d.categorie]?.label||d.categorie; depMap[l]=(depMap[l]||0)+d.montant; });
  _buildStatPie('chart-stat-depenses', chartStatDep, Object.keys(depMap), Object.values(depMap), c=>{ chartStatDep=c; });

  // Évolution
  await _buildEvolChart(annee, mois);

  // Tables
  await _buildLivreursTable(livrees, repartitions, cmdIds);
  _buildServicesTable(livrees);
}

function _buildStatPie(id, existing, labels, vals, setter) {
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  if (existing) existing.destroy();
  if (!vals.length) {
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.fillStyle='#9898b8';ctx.font='12px Jost';ctx.textAlign='center';
    ctx.fillText('Aucune donnée',ctx.canvas.width/2,ctx.canvas.height/2);
    setter(null); return;
  }
  const pal=['#2121a3','#c3161c','#fec200','#0db87a','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#84cc16','#f97316','#ec4899'];
  setter(new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data:vals,backgroundColor:pal.slice(0,vals.length),borderWidth:0,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{
        legend:{position:'right',labels:{color:'#5a5a8a',font:{size:10,family:'Jost'},boxWidth:10,padding:7}},
        tooltip:{callbacks:{label:c=>`${c.label}: ${fmtFCFA(c.parsed)}`}}
      }}
  }));
}

async function _buildEvolChart(annee, mois) {
  const ctx = document.getElementById('chart-stat-evol')?.getContext('2d');
  if (!ctx) return;
  if (chartStatEvol) chartStatEvol.destroy();
  const labels=[], revs=[], deps=[], bens=[];

  if (statPeriod==='annee') {
    document.getElementById('stat-evol-title').textContent = `Évolution mensuelle ${annee}`;
    const SHORT=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    for (let m=1;m<=12;m++) {
      labels.push(SHORT[m-1]);
      const pad=String(m).padStart(2,'0');
      const last=new Date(annee,m,0).getDate();
      const [{data:mc},{data:md}] = await Promise.all([
        sb.from('commandes').select('prix_total').eq('statut','livré').gte('date_course',`${annee}-${pad}-01`).lte('date_course',`${annee}-${pad}-${last}`),
        sb.from('depenses').select('montant').gte('date_depense',`${annee}-${pad}-01`).lte('date_depense',`${annee}-${pad}-${last}`)
      ]);
      const r=(mc||[]).reduce((s,c)=>s+c.prix_total,0);
      const d=(md||[]).reduce((s,x)=>s+x.montant,0);
      revs.push(r);deps.push(d);bens.push(r-d);
    }
  } else {
    document.getElementById('stat-evol-title').textContent = 'Évolution 7 derniers jours';
    const ref = new Date(annee, mois-1, new Date().getDate());
    for (let i=6;i>=0;i--) {
      const d=new Date(ref);d.setDate(ref.getDate()-i);
      const ds=d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric'}));
      const [{data:mc},{data:md}] = await Promise.all([
        sb.from('commandes').select('prix_total').eq('statut','livré').eq('date_course',ds),
        sb.from('depenses').select('montant').eq('date_depense',ds)
      ]);
      const r=(mc||[]).reduce((s,c)=>s+c.prix_total,0);
      const dv=(md||[]).reduce((s,x)=>s+x.montant,0);
      revs.push(r);deps.push(dv);bens.push(r-dv);
    }
  }

  chartStatEvol = new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[
      {label:'Revenus',data:revs,borderColor:'#2121a3',backgroundColor:'rgba(33,33,163,0.07)',fill:true,tension:.4,pointRadius:4,pointBackgroundColor:'#2121a3'},
      {label:'Dépenses',data:deps,borderColor:'rgba(195,22,28,0.55)',fill:false,tension:.4,pointRadius:3,borderDash:[4,4]},
      {label:'Bénéfice',data:bens,borderColor:'#0db87a',fill:false,tension:.4,pointRadius:4,pointBackgroundColor:'#0db87a'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#5a5a8a',font:{size:11,family:'Jost'}}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtFCFA(c.parsed.y)}`}}},
      scales:{
        x:{ticks:{color:'#9898b8',font:{family:'Jost',size:11}},grid:{color:'rgba(33,33,163,0.05)'}},
        y:{ticks:{color:'#9898b8',font:{family:'Jost',size:10},callback:v=>v>=1000?Math.round(v/1000)+'K':v},grid:{color:'rgba(33,33,163,0.05)'}}
      }}
  });
}

async function _buildLivreursTable(livrees, repartitions, cmdIds) {
  let clData = [];
  if (cmdIds.length) {
    const {data} = await sb.from('commandes_livreurs').select('*').in('commande_id',cmdIds);
    clData = data||[];
  }
const tbody = document.getElementById('stat-livreurs-tbody');
  if (!livreurs.length) { tbody.innerHTML=`<tr><td colspan="5"><div class="empty"><i class="fa-solid fa-user"></i><p>Aucun livreur</p></div></td></tr>`; return; }
  const totalCoursesLivrees = livrees.length || 1;
  tbody.innerHTML = livreurs.map(l => {
    const myCmdIds = clData.filter(cl=>cl.livreur_id===l.id).map(cl=>cl.commande_id);
    const myLiv    = livrees.filter(c=>myCmdIds.includes(c.id));
    const totRev   = myLiv.reduce((s,c)=>s+c.prix_total,0);
    const partLiv  = repartitions.filter(r=>myCmdIds.includes(r.commande_id)).reduce((s,r)=>s+r.part_livreur,0);
    const pct      = Math.round(myLiv.length / totalCoursesLivrees * 100);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:9px">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--font-h);font-size:12px;font-weight:700;flex-shrink:0">${l.nom.slice(0,2).toUpperCase()}</div>
        <span style="font-weight:600">${l.nom}</span>
      </div></td>
      <td class="td-mono" style="color:var(--blue)">${myLiv.length}</td>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="prog-wrap" style="width:60px"><div class="prog-fill" style="width:${pct}%"></div></div>
        <span style="font-size:11px;color:var(--text3)">${pct}%</span>
      </div></td>
      <td class="td-mono" style="color:var(--success)">${fmtFCFA(totRev)}</td>
      <td class="td-mono" style="color:var(--blue)">${fmtFCFA(partLiv)}</td>
    </tr>`;
  }).join('');
}

function _buildServicesTable(livrees) {
  const tbody = document.getElementById('stat-services-tbody');
  const svcData = {};
  livrees.forEach(c => {
    const k = c.service_id||'__autres__';
    if (!svcData[k]) svcData[k]={count:0,total:0};
    svcData[k].count++;svcData[k].total+=c.prix_total;
  });
  const rows = Object.entries(svcData).sort((a,b)=>b[1].total-a[1].total);
  if (!rows.length) { tbody.innerHTML=`<tr><td colspan="4"><div class="empty"><i class="fa-solid fa-motorcycle"></i><p>Aucune donnée</p></div></td></tr>`; return; }
  const maxT = Math.max(...rows.map(r=>r[1].total));
  tbody.innerHTML = rows.map(([svcId,stats]) => {
    const nom = servicesMap[svcId]||'Autre';
    const pct = Math.round(stats.total/maxT*100);
    return `<tr>
      <td style="font-weight:500">${nom}</td>
      <td class="td-mono" style="color:var(--blue)">${stats.count}</td>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="prog-wrap" style="width:70px;height:5px"><div class="prog-fill" style="width:${pct}%"></div></div>
        <span class="td-mono" style="color:var(--success)">${fmtFCFA(stats.total)}</span>
      </div></td>
      <td class="td-muted">${fmtFCFA(Math.round(stats.total/stats.count))}</td>
    </tr>`;
  }).join('');
}
