// ══════════════════════════════════════
// MODULE CLIENTS (admin)
// Agrégation faite par la base (clients_stats) : toutes les courses
// sont prises en compte, sans limite de 1000 lignes.
// ══════════════════════════════════════
let allClients = [], filteredClients = [];
let cliSort = { key: 'courses', dir: -1 };

// Segment d'un client selon son ancienneté et sa fréquence
function clientSegment(c) {
  const jours = c.derniere ? Math.floor((Date.now() - parseDate(c.derniere)) / 86400000) : 9999;
  c.jours = jours;
  if (jours > 90)       return { key: 'inactif',  label: 'Inactif',    icon: 'fa-moon' };
  if (jours > 30)       return { key: 'relancer', label: 'À relancer', icon: 'fa-bell' };
  if (c.courses >= 5)   return { key: 'fidele',   label: 'Fidèle',     icon: 'fa-star' };
  if (c.courses === 1)  return { key: 'nouveau',  label: 'Nouveau',    icon: 'fa-seedling' };
  return { key: 'actif', label: 'Actif', icon: 'fa-check' };
}

async function loadClients() {
  const t0 = performance.now();
  const { data, error } = await fetchAll(() => sb.rpc('clients_stats')
    .order('nom', { nullsFirst: false }).order('telephone', { nullsFirst: false }));
  if (error) { toast('Erreur chargement clients : ' + error.message, 'error'); return; }
  console.info(`[clients] ${data.length} clients en ${Math.round(performance.now() - t0)} ms`);

  allClients = data.map(c => {
    const x = { ...c, courses: Number(c.courses), livrees: Number(c.livrees), ca: Number(c.ca) };
    x.segment = clientSegment(x);
    x.panier = x.livrees ? Math.round(x.ca / x.livrees) : 0;
    return x;
  });

  const totalCA = allClients.reduce((s, c) => s + c.ca, 0);
  const top = [...allClients].sort((a, b) => b.ca - a.ca)[0];
  const actifs = allClients.filter(c => c.jours <= 30).length;
  document.getElementById('cli-nb').textContent  = allClients.length;
  document.getElementById('cli-ca').textContent  = fmtFCFA(totalCA);
  document.getElementById('cli-top').textContent = top?.nom || '—';
  document.getElementById('cli-actifs').textContent = `${actifs} (${allClients.length ? Math.round(actifs / allClients.length * 100) : 0}%)`;

  filterClients();
}

function sortClients(key) {
  cliSort = { key, dir: cliSort.key === key ? -cliSort.dir : (key === 'nom' ? 1 : -1) };
  filterClients();
}

function filterClients() {
  const q    = norm(document.getElementById('cli-search')?.value);
  const qTel = (document.getElementById('cli-search')?.value || '').replace(/\D/g, '');
  const seg  = document.getElementById('cli-segment')?.value || '';
  const min  = parseInt(document.getElementById('cli-min')?.value || '0');

  const list = allClients.filter(c => {
    if (seg && c.segment.key !== seg) return false;
    if (min && c.courses < min) return false;
    if (q && !norm(c.nom).includes(q) && !(qTel && (c.telephone || '').replace(/\D/g, '').includes(qTel))) return false;
    return true;
  });

  const { key, dir } = cliSort;
  list.sort((a, b) => {
    const va = a[key], vb = b[key];
    if (typeof va === 'number' || typeof vb === 'number') return dir * ((va || 0) - (vb || 0));
    return dir * String(va || '').localeCompare(String(vb || ''), 'fr');
  });

  filteredClients = list;
  document.getElementById('cli-count').textContent =
    `${list.length} client${list.length > 1 ? 's' : ''}${list.length !== allClients.length ? ` sur ${allClients.length}` : ''}`;
  document.querySelectorAll('#cli-table th[data-sort]').forEach(th => {
    th.classList.toggle('sorted', th.dataset.sort === key);
    th.dataset.dir = th.dataset.sort === key ? (dir > 0 ? 'asc' : 'desc') : '';
  });

  const tbody = document.getElementById('cli-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><i class="fa-solid fa-users"></i><p>Aucun client trouvé</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.slice(0, 500).map((c, i) => {
    const tauxL = c.courses ? Math.round(c.livrees / c.courses * 100) : 0;
    return `<tr class="row-click" onclick="openClient(${i})">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="mini-avatar pale">${esc((c.nom || '?').slice(0,2).toUpperCase())}</div>
          <div>
            <div style="font-weight:600">${esc(c.nom || '—')}</div>
            <span class="seg seg-${c.segment.key}"><i class="fa-solid ${c.segment.icon}"></i> ${c.segment.label}</span>
          </div>
        </div>
      </td>
      <td class="td-muted">${esc(c.telephone || '—')}</td>
      <td class="td-mono" style="color:var(--blue)">${c.courses}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div class="prog-wrap" style="width:50px;height:4px"><div class="prog-fill" style="width:${tauxL}%"></div></div>
          <span style="font-size:11px;color:var(--text3)">${tauxL}%</span>
        </div>
      </td>
      <td class="td-mono" style="color:var(--success)">${fmtFCFA(c.ca)}</td>
      <td class="td-muted">${fmtFCFA(c.panier)}</td>
      <td class="td-muted">${fmtDate(c.derniere)}<div style="font-size:11px">${c.jours < 9999 ? `il y a ${c.jours} j` : ''}</div></td>
      <td style="font-size:12px;color:var(--text2)">${esc(servicesMap[c.service_favori] || '—')}</td>
    </tr>`;
  }).join('') + (list.length > 500
    ? `<tr><td colspan="8" class="td-muted" style="text-align:center;font-size:12px">500 premiers affichés — affinez la recherche ou exportez en CSV pour tout voir</td></tr>` : '');
}

function resetClientFilters() {
  document.getElementById('cli-search').value = '';
  fcSet('cli-segment', '');
  fcSet('cli-min', '0');
  filterClients();
}

// ── Export CSV (liste filtrée, séparateur « ; » pour Excel FR) ──
function exportClientsCSV() {
  const cols = [['Client', c => c.nom], ['Téléphone', c => c.telephone], ['Segment', c => c.segment.label],
    ['Courses', c => c.courses], ['Livrées', c => c.livrees], ['CA (FCFA)', c => c.ca],
    ['Panier moyen', c => c.panier], ['Dernière course', c => c.derniere], ['Service favori', c => servicesMap[c.service_favori]]];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(c => cell(c[0])).join(';'),
    ...filteredClients.map(c => cols.map(([, f]) => cell(f(c))).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `clients-faichap-${isoDate()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Fiche client : historique de ses courses ──
let currentClient = null;
async function openClient(i) {
  const c = filteredClients[i];
  if (!c) return;
  currentClient = c;
  document.getElementById('mc-nom').textContent = c.nom || 'Client';
  document.getElementById('mc-sub').innerHTML =
    `<span class="seg seg-${c.segment.key}"><i class="fa-solid ${c.segment.icon}"></i> ${c.segment.label}</span>` +
    (c.telephone ? ` <a class="mc-tel" href="tel:${esc(c.telephone.replace(/\s/g, ''))}"><i class="fa-solid fa-phone"></i> ${esc(c.telephone)}</a>` : '');
  document.getElementById('mc-kpis').innerHTML = [
    ['Courses', c.courses], ['Livrées', c.livrees], ['CA total', fmtFCFA(c.ca)], ['Panier moyen', fmtFCFA(c.panier)]
  ].map(([l, v]) => `<div class="mc-kpi"><div class="mc-kpi-l">${l}</div><div class="mc-kpi-v">${v}</div></div>`).join('');
  const tbody = document.getElementById('mc-tbody');
  tbody.innerHTML = `<tr><td colspan="4" class="td-muted">Chargement…</td></tr>`;
  openModal('m-client');

  const query = () => {
    const q = sb.from('commandes').select('id, date_course, adresse_depart, adresse_arrivee, prix_total, statut');
    return (c.telephone ? q.eq('telephone_client', c.telephone)
                        : q.ilike('nom_client', (c.nom || '').replace(/[\\%_]/g, m => '\\' + m)))
      .order('date_course', { ascending: false }).order('id');
  };
  const { data, error } = await fetchAll(query);
  if (currentClient !== c) return;
  if (error) { tbody.innerHTML = `<tr><td colspan="4" class="td-muted">Erreur : ${esc(error.message)}</td></tr>`; return; }
  tbody.innerHTML = data.map(x => `
    <tr>
      <td>${fmtDate(x.date_course)}</td>
      <td style="font-size:12px">${esc(truncate(x.adresse_depart, 22))} → ${esc(truncate(x.adresse_arrivee, 22))}</td>
      <td class="td-mono">${fmtFCFA(x.prix_total)}</td>
      <td>${statutBadge(x.statut)}</td>
    </tr>`).join('') || `<tr><td colspan="4" class="td-muted">Aucune course</td></tr>`;
}

function newCommandeForClient() {
  if (!currentClient) return;
  closeModal('m-client');
  openNewCommande({ nom: currentClient.nom, tel: currentClient.telephone });
}
