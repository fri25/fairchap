// ══════════════════════════════════════
// MODULE RAPPORT PDF (mensuel ou annuel)
// Chiffres issus de stats_periode / serie_periode : identiques à ceux
// de l'écran Statistiques.
// ══════════════════════════════════════
let rptType = 'mois';

let rptSelectorsReady = false;
function initRapportSelectors() {
  if (!rptSelectorsReady) {
    rptSelectorsReady = true;
    const mSel = document.getElementById('rpt-mois');
    const aSel = document.getElementById('rpt-annee');
    fillPeriodSelects(mSel, aSel);
    mSel.onchange = aSel.onchange = updateRapportPreview;
  }
  updateRapportPreview();
}

function toggleRptType(t) {
  rptType = t;
  document.querySelectorAll('[data-rpt-type]').forEach(b => b.classList.toggle('active', b.dataset.rptType === t));
  const mWrap = document.getElementById('rpt-mois')?.closest('.fc-select-wrap');
  if (mWrap) mWrap.hidden = t === 'annee';
  updateRapportPreview();
}

function rptPeriode() {
  const mois  = parseInt(document.getElementById('rpt-mois')?.value || new Date().getMonth()+1);
  const annee = parseInt(document.getElementById('rpt-annee')?.value || new Date().getFullYear());
  const range = rptType === 'mois' ? monthRange(annee, mois) : yearRange(annee);
  const libelle = rptType === 'mois' ? `${MONTHS_FR[mois - 1]} ${annee}` : `Année ${annee}`;
  return { mois, annee, ...range, libelle };
}

let rptPreviewId = 0;
async function updateRapportPreview() {
  const id = ++rptPreviewId;
  const p = rptPeriode();
  const s = await rpc('stats_periode', { p_from: p.from, p_to: p.to });
  if (id !== rptPreviewId || !s) return;
  const resultat = s.revenus - s.depenses;
  const tile = (label, value, color) => `
    <div class="rpt-tile"><div class="rpt-tile-l">${label}</div><div class="rpt-tile-v" style="color:${color}">${value}</div></div>`;

  document.getElementById('rpt-preview').innerHTML = `
    <div class="rpt-mini">
      <div class="rpt-mini-head">
        <div>
          <div class="rpt-mini-title">Rapport ${rptType === 'mois' ? 'mensuel' : 'annuel'}</div>
          <div class="rpt-mini-sub">${esc(p.libelle)} · FaiChap</div>
        </div>
        <span class="icon3d" style="--c:#ffffff33"><i class="fa-solid fa-file-pdf"></i></span>
      </div>
      <div class="rpt-mini-body">
        ${tile('Livraisons', s.courses_livrees, 'var(--blue)')}
        ${tile("Chiffre d'affaires", fmtFCFA(s.revenus), 'var(--success)')}
        ${tile('Dépenses', fmtFCFA(s.depenses), 'var(--red)')}
        ${tile('Résultat', fmtFCFA(resultat), resultat >= 0 ? 'var(--success)' : 'var(--red)')}
        ${tile('Solde reporté', fmtFCFA(s.solde_reporte), 'var(--text2)')}
        ${tile('Solde de clôture', fmtFCFA(s.solde_cloture), s.solde_cloture >= 0 ? 'var(--success)' : 'var(--red)')}
      </div>
    </div>
    <p style="font-size:11px;color:var(--text3);margin-top:10px;text-align:center">Cliquez sur « Générer » pour le PDF complet</p>`;
}

async function genererRapportPDF() {
  const p = rptPeriode();
  const incl = k => document.getElementById('rpt-s-' + k)?.checked;
  // Ouvrir la fenêtre tout de suite (sinon le navigateur la bloque après les appels réseau)
  const w = window.open('', '_blank');
  if (!w) { toast('Autorisez les fenêtres pop-up pour générer le rapport', 'error'); return; }
  w.document.write('<p style="font-family:sans-serif;padding:40px;color:#5a5a8a">Génération du rapport…</p>');
  toast('Génération du rapport en cours...');

  const needCmds = incl('commandes') || incl('observations');
  const [stats, serie, cmdsRes] = await Promise.all([
    rpc('stats_periode', { p_from: p.from, p_to: p.to }),
    rptType === 'annee' ? rpc('serie_periode', { p_from: p.from, p_to: p.to, p_pas: 'mois' }) : Promise.resolve([]),
    needCmds ? fetchAll(() => sb.from('commandes')
      .select('id, date_course, nom_client, adresse_depart, adresse_arrivee, service_id, prix_total, statut, observations')
      .gte('date_course', p.from).lte('date_course', p.to)
      .order('date_course').order('id')) : Promise.resolve({ data: [] })
  ]);
  if (!stats) { w.close(); return; }

  const html = buildRapportHTML({
    p, s: stats, serie: serie || [], cmds: cmdsRes.data || [],
    note: document.getElementById('rpt-note')?.value?.trim() || '',
    inclResume: incl('resume'), inclMensuel: rptType === 'annee', inclServices: incl('services'),
    inclDepenses: incl('depenses'), inclLivreurs: incl('livreurs'),
    inclCommandes: incl('commandes'), inclObs: incl('observations')
  });

  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 800);
  toast('Rapport ouvert — utilisez « Enregistrer en PDF » dans la boîte d\'impression ✓');
}

function buildRapportHTML(d) {
  const { p, s, serie, cmds, note } = d;
  const resultat = s.revenus - s.depenses;
  const cls = v => v >= 0 ? 'pos' : 'neg';
  const livrees = cmds.filter(c => c.statut === 'livré');
  const typeLib = rptType === 'mois' ? 'mensuel' : 'annuel';

  // Tableau mois par mois (annuel) avec caisse cumulée
  let caisse = Number(s.solde_reporte);
  const lignesMois = serie.map(m => {
    const r = Number(m.revenus), dp = Number(m.depenses);
    caisse += r - dp;
    return `<tr><td>${MONTHS_FR[parseDate(m.periode).getMonth()]}</td><td class="pos">${fmtFCFA(r)}</td>
      <td class="neg">${fmtFCFA(dp)}</td><td class="${cls(r - dp)}">${fmtFCFA(r - dp)}</td><td class="${cls(caisse)}">${fmtFCFA(caisse)}</td></tr>`;
  }).join('');

  // Livreurs : actifs + ceux qui ont roulé sur la période
  const livStats = Object.fromEntries(s.par_livreur.map(l => [l.livreur_id, l]));
  const livRows = allLivreurs.filter(l => l.actif || livStats[l.id])
    .map(l => ({ nom: livreurLabel(l), x: livStats[l.id] || { courses: 0, revenus: 0, part: 0 } }))
    .sort((a, b) => b.x.courses - a.x.courses);

  const observations = d.inclObs
    ? cmds.filter(c => c.observations).map(c =>
        `<li><strong>${esc(c.nom_client || 'Client')}</strong> (${fmtDate(c.date_course)}) : ${esc(c.observations)}</li>`).join('')
    : '';
  const logoUrl = new URL('assets/img/logo-blue.svg', location.href).href;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport FaiChap — ${esc(p.libelle)}</title>
<link href="https://fonts.googleapis.com/css2?family=Epilogue:wght@400;600;700;800&family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Jost',sans-serif;font-size:13px;color:#1a1a3e;background:#fff;padding:32px;}
h1,h2,h3{font-family:'Epilogue',sans-serif;}
.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #2121a3;margin-bottom:24px;}
.report-meta{text-align:right;}
.report-title{font-family:'Epilogue',sans-serif;font-size:18px;font-weight:800;color:#2121a3;}
.report-sub{font-size:12px;color:#9898b8;margin-top:3px;}
.section{margin-bottom:24px;page-break-inside:avoid;}
.section-title{font-family:'Epilogue',sans-serif;font-size:14px;font-weight:700;color:#2121a3;border-bottom:1px solid #e8eaff;padding-bottom:7px;margin-bottom:12px;}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px;}
.kpi{background:#f4f5fb;border-radius:8px;padding:12px 14px;}
.kpi-l{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#9898b8;margin-bottom:4px;}
.kpi-v{font-family:'Epilogue',sans-serif;font-size:17px;font-weight:800;}
table{width:100%;border-collapse:collapse;font-size:12px;}
th{background:#f4f5fb;padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9898b8;border-bottom:1px solid #e8eaff;}
td{padding:8px 12px;border-bottom:1px solid #f0f1f9;color:#1a1a3e;}
tfoot td{font-weight:700;border-top:2px solid #e8eaff;}
.pos{color:#0db87a;font-weight:700;}
.neg{color:#c3161c;font-weight:700;}
.note-box{background:#f4f5fb;border-left:3px solid #2121a3;padding:12px 16px;border-radius:0 8px 8px 0;font-size:12px;color:#5a5a8a;line-height:1.6;white-space:pre-wrap;}
.footer{margin-top:28px;padding-top:14px;border-top:1px solid #e8eaff;display:flex;justify-content:space-between;font-size:11px;color:#9898b8;}
@media print{body{padding:16px;}@page{margin:1cm;}}
</style>
</head>
<body>
<div class="header">
  <img src="${logoUrl}" alt="FaiChap" style="height:44px;width:auto;object-fit:contain">
  <div class="report-meta">
    <div class="report-title">Rapport ${typeLib}</div>
    <div class="report-sub">${esc(p.libelle)} · Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>
</div>

${d.inclResume ? `
<div class="section">
  <div class="section-title">Résumé financier</div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-l">Livraisons</div><div class="kpi-v" style="color:#2121a3">${s.courses_livrees}</div></div>
    <div class="kpi"><div class="kpi-l">Chiffre d'affaires</div><div class="kpi-v pos">${fmtFCFA(s.revenus)}</div></div>
    <div class="kpi"><div class="kpi-l">Dépenses</div><div class="kpi-v neg">${fmtFCFA(s.depenses)}</div></div>
    <div class="kpi"><div class="kpi-l">Résultat</div><div class="kpi-v ${cls(resultat)}">${fmtFCFA(resultat)}</div></div>
  </div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-l">Solde reporté</div><div class="kpi-v">${fmtFCFA(s.solde_reporte)}</div></div>
    <div class="kpi"><div class="kpi-l">Solde de clôture</div><div class="kpi-v ${cls(s.solde_cloture)}">${fmtFCFA(s.solde_cloture)}</div></div>
    <div class="kpi"><div class="kpi-l">Part livreurs</div><div class="kpi-v" style="color:#2121a3">${fmtFCFA(s.part_livreurs)}</div></div>
    <div class="kpi"><div class="kpi-l">Courses annulées</div><div class="kpi-v">${s.courses_annulees}</div></div>
  </div>
</div>` : ''}

${d.inclMensuel && serie.length ? `
<div class="section">
  <div class="section-title">Évolution mois par mois</div>
  <table>
    <thead><tr><th>Mois</th><th>CA</th><th>Dépenses</th><th>Résultat</th><th>Caisse fin de mois</th></tr></thead>
    <tbody>${lignesMois}</tbody>
    <tfoot><tr><td>Total ${p.annee}</td><td class="pos">${fmtFCFA(s.revenus)}</td><td class="neg">${fmtFCFA(s.depenses)}</td><td class="${cls(resultat)}">${fmtFCFA(resultat)}</td><td class="${cls(s.solde_cloture)}">${fmtFCFA(s.solde_cloture)}</td></tr></tfoot>
  </table>
</div>` : ''}

${d.inclServices && s.par_service.length ? `
<div class="section">
  <div class="section-title">Analyse des services</div>
  <table>
    <thead><tr><th>Service</th><th>Courses</th><th>Revenus</th><th>Moy/course</th></tr></thead>
    <tbody>${s.par_service.map(x => `
      <tr><td style="font-weight:600">${esc(servicesMap[x.service_id] || 'Autre')}</td><td>${x.courses}</td><td class="pos">${fmtFCFA(x.revenus)}</td><td>${fmtFCFA(Math.round(x.revenus / x.courses))}</td></tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

${d.inclDepenses && s.par_categorie.length ? `
<div class="section">
  <div class="section-title">Analyse des dépenses</div>
  <table>
    <thead><tr><th>Catégorie</th><th>Nombre</th><th>Montant</th><th>% du total</th></tr></thead>
    <tbody>${s.par_categorie.map(x => `
      <tr><td>${esc(catMeta(x.categorie).label)}</td><td>${x.nb}</td><td class="neg">${fmtFCFA(x.montant)}</td><td>${s.depenses ? Math.round(x.montant / s.depenses * 100) : 0}%</td></tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

${d.inclLivreurs && livRows.length ? `
<div class="section">
  <div class="section-title">Performance des livreurs</div>
  <table>
    <thead><tr><th>Livreur</th><th>Courses livrées</th><th>CA généré</th><th>Part livreur</th></tr></thead>
    <tbody>${livRows.map(l => `
      <tr><td style="font-weight:600">${esc(l.nom)}</td><td>${l.x.courses}</td><td class="pos">${fmtFCFA(l.x.revenus)}</td><td style="color:#2121a3;font-weight:700">${fmtFCFA(l.x.part)}</td></tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

${d.inclCommandes && livrees.length ? `
<div class="section">
  <div class="section-title">Détail des courses livrées (${livrees.length})</div>
  <table>
    <thead><tr><th>Date</th><th>Client</th><th>Trajet</th><th>Service</th><th>Montant</th></tr></thead>
    <tbody>${livrees.map(c => `
      <tr>
        <td>${fmtDate(c.date_course)}</td>
        <td>${esc(c.nom_client || '—')}</td>
        <td style="font-size:11px">${esc(truncate(c.adresse_depart, 22))} → ${esc(truncate(c.adresse_arrivee, 22))}</td>
        <td style="font-size:11px">${esc(servicesMap[c.service_id] || '—')}</td>
        <td class="pos">${fmtFCFA(c.prix_total)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

${d.inclObs && observations ? `
<div class="section">
  <div class="section-title">Observations</div>
  <ul style="padding-left:16px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:#5a5a8a;line-height:1.6">${observations}</ul>
</div>` : ''}

${note ? `
<div class="section">
  <div class="section-title">Note de conclusion</div>
  <div class="note-box">${esc(note)}</div>
</div>` : ''}

<div class="footer">
  <span>FaiChap · Rapport ${typeLib} ${esc(p.libelle)}</span>
  <span>Document confidentiel — Usage interne</span>
</div>
</body></html>`;
}
