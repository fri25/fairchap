// ══════════════════════════════════════
// MODULE RAPPORT PDF
// ══════════════════════════════════════

function initRapportSelectors() {
  const now = new Date();
  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const mSel = document.getElementById('rpt-mois');
  const aSel = document.getElementById('rpt-annee');
  if (!mSel||!aSel) return;
  mSel.innerHTML = MONTHS_FR.map((m,i) =>
    `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`
  ).join('');
  aSel.innerHTML = [2026,2027,2028,2029,2030].map(y =>
    `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`
  ).join('');
  mSel.onchange = aSel.onchange = updateRapportPreview;
  updateRapportPreview();
}

async function updateRapportPreview() {
  const mois  = parseInt(document.getElementById('rpt-mois')?.value || new Date().getMonth()+1);
  const annee = parseInt(document.getElementById('rpt-annee')?.value || new Date().getFullYear());
  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const pad  = String(mois).padStart(2,'0');
  const last = new Date(annee,mois,0).getDate();
  const from = `${annee}-${pad}-01`;
  const to   = `${annee}-${pad}-${last}`;

  const [{ data: cmds }, { data: deps }] = await Promise.all([
    sb.from('commandes').select('id,prix_total,statut,service_id').gte('date_course',from).lte('date_course',to),
    sb.from('depenses').select('montant,categorie').gte('date_depense',from).lte('date_depense',to)
  ]);

  const livrees  = (cmds||[]).filter(c=>c.statut==='livré');
  const totRev   = livrees.reduce((s,c)=>s+c.prix_total,0);
  const totDep   = (deps||[]).reduce((s,d)=>s+d.montant,0);
  const benefice = totRev-totDep;

  document.getElementById('rpt-preview').innerHTML = `
    <!-- Mini aperçu rapport -->
    <div style="border:1px solid var(--border);border-radius:var(--r);overflow:hidden">
      <!-- Header -->
      <div style="background:var(--blue);padding:16px 18px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-family:var(--font-h);font-size:15px;font-weight:800;color:#fff">Rapport mensuel</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:2px">${MONTHS_FR[mois-1]} ${annee} · FaiChap</div>
        </div>
        <div style="width:32px;height:32px;background:rgba(255,255,255,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center">
          <i class="fa-solid fa-motorcycle" style="color:#fff;font-size:14px"></i>
        </div>
      </div>
      <!-- Body -->
      <div style="padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:var(--bg);border-radius:var(--r);padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.07em">Livraisons</div>
          <div style="font-family:var(--font-h);font-size:18px;font-weight:800;color:var(--blue);margin-top:3px">${livrees.length}</div>
        </div>
        <div style="background:var(--bg);border-radius:var(--r);padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.07em">Revenus</div>
          <div style="font-family:var(--font-h);font-size:15px;font-weight:800;color:var(--success);margin-top:3px">${fmtFCFA(totRev)}</div>
        </div>
        <div style="background:var(--bg);border-radius:var(--r);padding:10px 12px">
          <div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.07em">Dépenses</div>
          <div style="font-family:var(--font-h);font-size:15px;font-weight:800;color:var(--red);margin-top:3px">${fmtFCFA(totDep)}</div>
        </div>
        <div style="background:${benefice>=0?'rgba(13,184,122,0.08)':'rgba(195,22,28,0.08)'};border-radius:var(--r);padding:10px 12px;border:1px solid ${benefice>=0?'rgba(13,184,122,0.2)':'rgba(195,22,28,0.2)'}">
          <div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.07em">Bénéfice</div>
          <div style="font-family:var(--font-h);font-size:15px;font-weight:800;color:${benefice>=0?'var(--success)':'var(--red)'};margin-top:3px">${fmtFCFA(benefice)}</div>
        </div>
      </div>
    </div>
    <p style="font-size:11px;color:var(--text3);margin-top:10px;text-align:center">Cliquez sur "Générer" pour le PDF complet</p>`;
}

async function genererRapportPDF() {
  const mois  = parseInt(document.getElementById('rpt-mois')?.value || new Date().getMonth()+1);
  const annee = parseInt(document.getElementById('rpt-annee')?.value || new Date().getFullYear());
  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const pad  = String(mois).padStart(2,'0');
  const last = new Date(annee,mois,0).getDate();
  const from = `${annee}-${pad}-01`;
  const to   = `${annee}-${pad}-${last}`;

  toast('Génération du rapport en cours...');

  // Charger toutes les données
  const [{ data: cmds }, { data: deps }, { data: reps }] = await Promise.all([
    sb.from('commandes').select('*,commandes_livreurs(livreur_id)').gte('date_course',from).lte('date_course',to).order('date_course'),
    sb.from('depenses').select('*').gte('date_depense',from).lte('date_depense',to).order('date_depense'),
    sb.from('repartition_financiere').select('*')
  ]);

  const livrees  = (cmds||[]).filter(c=>c.statut==='livré');
  const totRev   = livrees.reduce((s,c)=>s+c.prix_total,0);
  const totDep   = (deps||[]).reduce((s,d)=>s+d.montant,0);
  const benefice = totRev-totDep;
  const totLiv   = (reps||[]).filter(r=>livrees.map(c=>c.id).includes(r.commande_id)).reduce((s,r)=>s+r.part_livreur,0);
  const note     = document.getElementById('rpt-note')?.value?.trim() || '';

  // Sections activées
  const inclResume    = document.getElementById('rpt-s-resume')?.checked;
  const inclServices  = document.getElementById('rpt-s-services')?.checked;
  const inclDepenses  = document.getElementById('rpt-s-depenses')?.checked;
  const inclLivreurs  = document.getElementById('rpt-s-livreurs')?.checked;
  const inclCommandes = document.getElementById('rpt-s-commandes')?.checked;
  const inclObs       = document.getElementById('rpt-s-observations')?.checked;

  // Construire le HTML du rapport
  const html = buildRapportHTML({
    mois, annee, MONTHS_FR, cmds: cmds||[], livrees, deps: deps||[], reps: reps||[],
    totRev, totDep, benefice, totLiv, note,
    inclResume, inclServices, inclDepenses, inclLivreurs, inclCommandes, inclObs
  });

  // Ouvrir dans un nouvel onglet pour impression/PDF
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 800);
  toast('Rapport ouvert — utilisez "Imprimer en PDF" du navigateur ✓', 'success');
}

function buildRapportHTML(d) {
  const { mois, annee, MONTHS_FR, cmds, livrees, deps, reps,
          totRev, totDep, benefice, totLiv, note,
          inclResume, inclServices, inclDepenses, inclLivreurs, inclCommandes, inclObs } = d;

  // Services breakdown
  const svcMap = {};
  livrees.forEach(c => {
    const n = servicesMap[c.service_id]||'Autre';
    if (!svcMap[n]) svcMap[n]={count:0,total:0};
    svcMap[n].count++;svcMap[n].total+=c.prix_total;
  });

  // Dépenses breakdown
  const depMap = {};
  deps.forEach(dep => {
    const l = CAT_META[dep.categorie]?.label||dep.categorie;
    depMap[l]=(depMap[l]||0)+dep.montant;
  });

  // Livreurs perf
  const livPerf = {};
  livreurs.forEach(l => { livPerf[l.id]={nom:l.nom,courses:0,ca:0,part:0}; });
  livrees.forEach(c => {
    (c.commandes_livreurs||[]).forEach(cl => {
      if (livPerf[cl.livreur_id]) {
        livPerf[cl.livreur_id].courses++;
        livPerf[cl.livreur_id].ca+=c.prix_total;
      }
    });
  });
  reps.forEach(r => {
    const cmd = livrees.find(c=>c.id===r.commande_id);
    if (cmd) {
      (cmd.commandes_livreurs||[]).forEach(cl => {
        if (livPerf[cl.livreur_id]) livPerf[cl.livreur_id].part+=r.part_livreur;
      });
    }
  });

  // Observations
  const observations = inclObs
    ? cmds.filter(c=>c.observations).map(c=>`<li><strong>${c.nom_client||'Client'}</strong> (${c.date_course?new Date(c.date_course).toLocaleDateString('fr-FR'):'—'}) : ${c.observations}</li>`).join('')
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport FaiChap — ${MONTHS_FR[mois-1]} ${annee}</title>
<link href="https://fonts.googleapis.com/css2?family=Epilogue:wght@400;600;700;800&family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  #stat-kpis .kpi-card:nth-child(5) { grid-column: 1; }
#stat-kpis .kpi-card:nth-child(6) { grid-column: 2; }
#stat-kpis .kpi-card:nth-child(7) { grid-column: 3 / span 2; }

@media (max-width: 900px) {
  #stat-kpis { grid-template-columns: repeat(2, 1fr) !important; }
  #stat-kpis .kpi-card:nth-child(5),
  #stat-kpis .kpi-card:nth-child(6),
  #stat-kpis .kpi-card:nth-child(7) { grid-column: auto; }
}
  .client-suggest {
  position: absolute; z-index: 999; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--r);
  box-shadow: 0 4px 16px rgba(0,0,0,.1); max-height: 200px;
  overflow-y: auto; width: 100%;
}
.client-suggest-item {
  padding: 9px 14px; cursor: pointer; font-size: 13px;
  border-bottom: 1px solid var(--border2);
}
.client-suggest-item:hover { background: var(--blue-pale); }
.client-suggest-item .suggest-tel { font-size: 11px; color: var(--text3); margin-top: 2px; }
.fg { position: relative; }
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Jost',sans-serif;font-size:13px;color:#1a1a3e;background:#fff;padding:32px;}
h1,h2,h3{font-family:'Epilogue',sans-serif;}
.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #2121a3;margin-bottom:24px;}
.logo-area{display:flex;align-items:center;gap:14px;}
.logo-box{width:44px;height:44px;background:#2121a3;border-radius:10px;display:flex;align-items:center;justify-content:center;}
.logo-name{font-family:'Epilogue',sans-serif;font-size:22px;font-weight:800;color:#2121a3;}
.logo-name span{color:#c3161c;}
.report-meta{text-align:right;}
.report-title{font-size:18px;font-weight:800;color:#2121a3;}
.report-sub{font-size:12px;color:#9898b8;margin-top:3px;}
.section{margin-bottom:24px;}
.section-title{font-family:'Epilogue',sans-serif;font-size:14px;font-weight:700;color:#2121a3;border-bottom:1px solid #e8eaff;padding-bottom:7px;margin-bottom:12px;display:flex;align-items:center;gap:8px;}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;}
.kpi{background:#f4f5fb;border-radius:8px;padding:12px 14px;}
.kpi-l{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#9898b8;margin-bottom:4px;}
.kpi-v{font-family:'Epilogue',sans-serif;font-size:18px;font-weight:800;}
table{width:100%;border-collapse:collapse;font-size:12px;}
th{background:#f4f5fb;padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9898b8;border-bottom:1px solid #e8eaff;}
td{padding:9px 12px;border-bottom:1px solid #f0f1f9;color:#1a1a3e;}
tr:last-child td{border-bottom:none;}
.pos{color:#0db87a;font-weight:700;}
.neg{color:#c3161c;font-weight:700;}
.note-box{background:#f4f5fb;border-left:3px solid #2121a3;padding:12px 16px;border-radius:0 8px 8px 0;font-size:12px;color:#5a5a8a;line-height:1.6;}
.footer{margin-top:28px;padding-top:14px;border-top:1px solid #e8eaff;display:flex;justify-content:space-between;font-size:11px;color:#9898b8;}
@media print{body{padding:16px;}@page{margin:1cm;}}
</style>
</head>
<body>
<div class="header">
  <div class="logo-area">
    <img src="${new URL('assets/img/logo-blue.svg', location.href).href}" alt="FaiChap" style="height:44px;width:auto;object-fit:contain"
      onerror="this.style.display='none';document.getElementById('logo-fb-rpt').style.display='flex'">
    <div id="logo-fb-rpt" style="display:none;align-items:center;gap:10px">
      <div class="logo-box">
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none"><path d="M10 38L24 10L38 38" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="24" cy="32" r="4" fill="#fec200"/></svg>
      </div>
      <div class="logo-name">Fai<span>Chap</span></div>
    </div>
  </div>
  <div class="report-meta">
    <div class="report-title">Rapport mensuel</div>
    <div class="report-sub">${MONTHS_FR[mois-1]} ${annee} · Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>
</div>

${inclResume ? `
<div class="section">
  <div class="section-title">📊 Résumé financier</div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-l">Livraisons</div><div class="kpi-v" style="color:#2121a3">${livrees.length}</div></div>
    <div class="kpi"><div class="kpi-l">Revenus</div><div class="kpi-v pos">${fmtFCFA(totRev)}</div></div>
    <div class="kpi"><div class="kpi-l">Dépenses</div><div class="kpi-v neg">${fmtFCFA(totDep)}</div></div>
    <div class="kpi"><div class="kpi-l">Bénéfice</div><div class="kpi-v ${benefice>=0?'pos':'neg'}">${fmtFCFA(benefice)}</div></div>
  </div>
</div>` : ''}

${inclServices && Object.keys(svcMap).length ? `
<div class="section">
  <div class="section-title">🏍️ Analyse des services</div>
  <table>
    <thead><tr><th>Service</th><th>Courses</th><th>Revenus</th><th>Moy/course</th></tr></thead>
    <tbody>
      ${Object.entries(svcMap).sort((a,b)=>b[1].total-a[1].total).map(([nom,s])=>`
        <tr><td style="font-weight:600">${nom}</td><td>${s.count}</td><td class="pos">${fmtFCFA(s.total)}</td><td>${fmtFCFA(Math.round(s.total/s.count))}</td></tr>
      `).join('')}
    </tbody>
  </table>
</div>` : ''}

${inclDepenses && Object.keys(depMap).length ? `
<div class="section">
  <div class="section-title">💸 Analyse des dépenses</div>
  <table>
    <thead><tr><th>Catégorie</th><th>Montant</th><th>% du total</th></tr></thead>
    <tbody>
      ${Object.entries(depMap).sort((a,b)=>b[1]-a[1]).map(([cat,mt])=>`
        <tr><td>${cat}</td><td class="neg">${fmtFCFA(mt)}</td><td>${totDep?Math.round(mt/totDep*100):0}%</td></tr>
      `).join('')}
    </tbody>
  </table>
</div>` : ''}

${inclLivreurs ? `
<div class="section">
  <div class="section-title">👤 Performance des livreurs</div>
  <table>
    <thead><tr><th>Livreur</th><th>Courses</th><th>CA généré</th><th>Part livreur</th></tr></thead>
    <tbody>
      ${Object.values(livPerf).map(l=>`
        <tr><td style="font-weight:600">${l.nom}</td><td>${l.courses}</td><td class="pos">${fmtFCFA(l.ca)}</td><td style="color:#2121a3;font-weight:700">${fmtFCFA(l.part)}</td></tr>
      `).join('')}
    </tbody>
  </table>
</div>` : ''}

${inclCommandes && livrees.length ? `
<div class="section">
  <div class="section-title">📋 Détail des courses livrées</div>
  <table>
    <thead><tr><th>Date</th><th>Client</th><th>Trajet</th><th>Service</th><th>Montant</th></tr></thead>
    <tbody>
      ${livrees.map(c=>`
        <tr>
          <td>${c.date_course?new Date(c.date_course).toLocaleDateString('fr-FR'):'—'}</td>
          <td>${c.nom_client||'—'}</td>
          <td style="font-size:11px">${(c.adresse_depart||'').slice(0,20)}… → ${(c.adresse_arrivee||'').slice(0,20)}</td>
          <td style="font-size:11px">${servicesMap[c.service_id]||'—'}</td>
          <td class="pos">${fmtFCFA(c.prix_total)}</td>
        </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

${inclObs && observations ? `
<div class="section">
  <div class="section-title">💬 Observations</div>
  <ul style="padding-left:16px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:#5a5a8a;line-height:1.6">
    ${observations}
  </ul>
</div>` : ''}

${note ? `
<div class="section">
  <div class="section-title">📝 Note de conclusion</div>
  <div class="note-box">${note}</div>
</div>` : ''}

<div class="footer">
  <span>FaiChap · Rapport ${MONTHS_FR[mois-1]} ${annee}</span>
  <span>Document confidentiel — Usage interne</span>
</div>
</body></html>`;
}



