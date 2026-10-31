// ══════════════════════════════════════
// STATE
// ══════════════════════════════════════
let currentUser = null;
let currentProfil = null;
let isAdmin = false;
let parametres = { pct_livreur: 40, pct_carburant: 20, pct_entreprise: 40, objectif_ca: 0 };
let S = { view: 'dashboard' }; // tracks current active view
let services = [];       // services actifs (formulaires)
let allServices = [];    // tous les services, y compris inactifs (noms)
let livreurs = [];       // livreurs actifs (formulaires)
let allLivreurs = [];    // tous les livreurs, y compris inactifs (noms, stats)
let livreursMap = {};    // id → nom affiché
let servicesMap = {};    // id → nom du service
let suggestions = { clients: [], lieux: [], zones: [] }; // autocomplétion
