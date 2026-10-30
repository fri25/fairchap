// ══════════════════════════════════════
// MODULE CLIENTS
// ══════════════════════════════════════
let allClients = [], filteredClients = [];

async function loadClients() {
  const { data: cmds } = await sb
    .from('commandes')
    .select('nom_client, telephone_client, prix_total, statut, service_id, date_course')
    .order('date_course', { ascending: false });

  // Agréger par client
  const cliMap = {};
  (cmds||[]).forEach(c => {
    const key = (c.telephone_client || c.nom_client || '__inconnu__').trim().toLowerCase();
    if (!cliMap[key]) {
      cliMap[key] = {
        nom: c.nom_client || '—',
        tel: c.telephone_client || '—',
        courses: 0, livrees: 0, ca: 0,
        services: {}, derniere: c.date_course
      };
    }
    const cl = cliMap[key];
    cl.courses++;
    if (c.statut === 'livré') { cl.livrees++; cl.ca += c.prix_total||0; }
    if (c.service_id) cl.services[c.service_id] = (cl.services[c.service_id]||0)+1;
    if (c.date_course > cl.derniere) cl.derniere = c.date_course;
    // Keep best nom/tel
    if (c.nom_client && cl.nom === '—') cl.nom = c.nom_client;
    if (c.telephone_client && cl.tel === '—') cl.tel = c.telephone_client;
  });

  allClients = Object.values(cliMap);

  // Summary
  const totalCA = allClients.reduce((s,c)=>s+c.ca,0);
  const topCli  = allClients.sort((a,b)=>b.ca-a.ca)[0];
  const moyC    = allClients.length ? (allClients.reduce((s,c)=>s+c.courses,0)/allClients.length).toFixed(1) : '0';
  document.getElementById('cli-nb').textContent  = allClients.length;
  document.getElementById('cli-ca').textContent  = fmtFCFA(totalCA);
  document.getElementById('cli-top').textContent = topCli?.nom || '—';
  document.getElementById('cli-moy').textContent = moyC;

  filterClients();
}

function filterClients() {
  const q    = (document.getElementById('cli-search')?.value||'').toLowerCase();
  const sort = document.getElementById('cli-sort')?.value || 'courses';

  let list = q
    ? allClients.filter(c =>
        (c.nom||'').toLowerCase().includes(q) ||
        (c.tel||'').includes(q))
    : [...allClients];

  list.sort((a,b) => {
    if (sort==='courses') return b.courses-a.courses;
    if (sort==='ca')      return b.ca-a.ca;
    if (sort==='recent')  return (b.derniere||'').localeCompare(a.derniere||'');
    if (sort==='nom')     return (a.nom||'').localeCompare(b.nom||'');
    return 0;
  });

  filteredClients = list;
  document.getElementById('cli-count').textContent = `${list.length} client${list.length>1?'s':''}`;

  const tbody = document.getElementById('cli-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><i class="fa-solid fa-users"></i><p>Aucun client trouvé</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => {
    const svcFav = Object.entries(c.services).sort((a,b)=>b[1]-a[1])[0];
    const svcNom = svcFav ? (servicesMap[svcFav[0]]||'—') : '—';
    const tauxL  = c.courses ? Math.round(c.livrees/c.courses*100) : 0;
    const dt     = c.derniere ? new Date(c.derniere).toLocaleDateString('fr-FR') : '—';
    const init   = (c.nom||'?').slice(0,2).toUpperCase();
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--blue-pale);border:1px solid var(--border);color:var(--blue);display:flex;align-items:center;justify-content:center;font-family:var(--font-h);font-size:12px;font-weight:700;flex-shrink:0">${init}</div>
          <span style="font-weight:600">${c.nom}</span>
        </div>
      </td>
      <td class="td-muted">${c.tel}</td>
      <td class="td-mono" style="color:var(--blue)">${c.courses}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div class="prog-wrap" style="width:50px;height:4px">
            <div class="prog-fill" style="width:${tauxL}%"></div>
          </div>
          <span style="font-size:11px;color:var(--text3)">${tauxL}%</span>
        </div>
      </td>
      <td class="td-mono" style="color:var(--success)">${fmtFCFA(c.ca)}</td>
      <td class="td-muted">${dt}</td>
      <td style="font-size:12px;color:var(--text2)">${svcNom}</td>
    </tr>`;
  }).join('');
}
