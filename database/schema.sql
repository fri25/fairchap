-- ═══════════════════════════════════════════════════════
-- FAICHAP — SCHÉMA SUPABASE COMPLET
-- Version 1.0 — Mars 2026
-- ═══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- 1. PROFILS UTILISATEURS
-- Complète auth.users de Supabase
-- Rôles : admin | operateur
-- ─────────────────────────────────────────
create table public.profils (
  id          uuid primary key references auth.users(id) on delete cascade,
  nom         text not null,
  prenom      text,
  role        text not null default 'operateur'
                check (role in ('admin', 'operateur')),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.profils is
  'Profils des opérateurs et admins. Lié à auth.users.';

-- ─────────────────────────────────────────
-- 2. LIVREURS
-- ─────────────────────────────────────────
create table public.livreurs (
  id          uuid primary key default uuid_generate_v4(),
  nom         text not null,
  prenom      text,
  telephone   text,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.livreurs is
  'Liste des livreurs. Moïse et Dimitri en v1.';

-- Données initiales
insert into public.livreurs (nom, prenom, actif) values
  ('Moïse',   null, true),
  ('Dimitri', null, true);

-- ─────────────────────────────────────────
-- 3. SERVICES
-- Types de livraison avec prix de base
-- et règles de répartition optionnelles
-- ─────────────────────────────────────────
create table public.services (
  id                   uuid primary key default uuid_generate_v4(),
  nom_service          text not null unique,
  description          text,
  prix_base            numeric(10,0) not null default 0,
  -- Répartition spécifique au service (null = utiliser les paramètres globaux)
  pct_livreur          numeric(5,2),
  pct_carburant        numeric(5,2),
  pct_entreprise       numeric(5,2),
  actif                boolean not null default true,
  created_at           timestamptz not null default now(),
  -- Vérification : si un % est défini, les 3 doivent l'être et sommer à 100
  constraint check_pct_somme check (
    (pct_livreur is null and pct_carburant is null and pct_entreprise is null)
    or
    (pct_livreur + pct_carburant + pct_entreprise = 100)
  )
);

comment on table public.services is
  'Types de service. Peut avoir une répartition spécifique ou hériter des paramètres globaux.';

-- Données initiales — services réels FaiChap
insert into public.services (nom_service, description, prix_base) values
  ('Livraison de repas',           'Livraison de plats préparés depuis restaurants ou particuliers', 500),
  ('Livraison de colis',           'Transport de colis et paquets',                                  500),
  ('Livraison de courses',         'Courses alimentaires ou diverses',                               500),
  ('Livraison de documents',       'Documents administratifs, courriers officiels',                   300),
  ('Livraison express',            'Livraison urgente à tarif majoré',                               800),
  ('Collecte & livraison',         'Collecte d''un bien puis livraison',                             500),
  ('Livraison multi-destinations', 'Plusieurs points de livraison sur une course',                   800),
  ('Livraison sur mesure',         'Tarif et conditions à définir selon la demande',                 500);

-- ─────────────────────────────────────────
-- 4. PARAMÈTRES GLOBAUX
-- Pourcentages de répartition par défaut
-- et autres configurations
-- ─────────────────────────────────────────
create table public.parametres (
  id               integer primary key default 1,  -- Ligne unique
  pct_livreur      numeric(5,2) not null default 40.00,
  pct_carburant    numeric(5,2) not null default 20.00,
  pct_entreprise   numeric(5,2) not null default 40.00,
  devise           text not null default 'FCFA',
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profils(id),
  constraint check_pct_total check (pct_livreur + pct_carburant + pct_entreprise = 100),
  constraint single_row check (id = 1)
);

comment on table public.parametres is
  'Paramètres globaux de l''application. Une seule ligne possible (id=1).';

-- Valeurs par défaut
insert into public.parametres (pct_livreur, pct_carburant, pct_entreprise)
values (40.00, 20.00, 40.00);

-- ─────────────────────────────────────────
-- 5. COMMANDES (Journal des livraisons)
-- Table centrale de l'application
-- ─────────────────────────────────────────
create table public.commandes (
  id               uuid primary key default uuid_generate_v4(),
  date_course      date not null default current_date,
  heure_debut      time,
  heure_fin        time,             -- Pour calcul durée — ajout recommandé audit
  service_id       uuid references public.services(id),
  nom_client       text,
  telephone_client text,
  adresse_depart   text not null,
  adresse_arrivee  text not null,
  zone             text,             -- Quartier/zone — présent dans données réelles Excel
  prix_total       numeric(10,0) not null default 0,
  cout_carburant   numeric(10,0),    -- Coût carburant réel saisi par l'opérateur
  statut           text not null default 'en_cours'
                     check (statut in ('en_cours', 'livré', 'annulé', 'en_attente')),
  observations     text,
  cree_par         uuid references public.profils(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.commandes is
  'Chaque ligne = une course. Zone = quartier de livraison. Livreurs dans commandes_livreurs.';

-- Index sur les champs fréquemment filtrés
create index idx_commandes_date    on public.commandes(date_course);
create index idx_commandes_statut  on public.commandes(statut);
create index idx_commandes_service on public.commandes(service_id);

-- ─────────────────────────────────────────
-- 6. COMMANDES ↔ LIVREURS (relation N:N)
-- Permet d'assigner plusieurs livreurs
-- à une même course (cas "Dimitri, Moïse")
-- ─────────────────────────────────────────
create table public.commandes_livreurs (
  commande_id  uuid not null references public.commandes(id) on delete cascade,
  livreur_id   uuid not null references public.livreurs(id),
  primary key (commande_id, livreur_id)
);

comment on table public.commandes_livreurs is
  'Relation plusieurs-à-plusieurs. Une course peut avoir plusieurs livreurs.';

create index idx_commandes_livreurs_livreur on public.commandes_livreurs(livreur_id);

-- ─────────────────────────────────────────
-- 7. RÉPARTITION FINANCIÈRE
-- Calculée automatiquement à la création
-- ou modification d'une commande
-- ─────────────────────────────────────────
create table public.repartition_financiere (
  id                 uuid primary key default uuid_generate_v4(),
  commande_id        uuid not null unique references public.commandes(id) on delete cascade,
  -- Pourcentages appliqués (snapshot au moment du calcul)
  pct_livreur        numeric(5,2) not null,
  pct_carburant      numeric(5,2) not null,
  pct_entreprise     numeric(5,2) not null,
  -- Montants calculés en FCFA
  part_livreur       numeric(10,0) not null,
  part_carburant     numeric(10,0) not null,
  part_entreprise    numeric(10,0) not null,
  calculated_at      timestamptz not null default now()
);

comment on table public.repartition_financiere is
  'Snapshot de la répartition financière par commande. Recalculable si les paramètres changent.';

create index idx_repartition_commande on public.repartition_financiere(commande_id);

-- ─────────────────────────────────────────
-- 8. DÉPENSES
-- Fusion "Suivi de Caisse" + "Suivi de la Flotte"
-- ─────────────────────────────────────────
create table public.depenses (
  id            uuid primary key default uuid_generate_v4(),
  date_depense  date not null default current_date,
  categorie     text not null check (categorie in (
                  'carburant',
                  'entretien_moto',
                  'reparation',
                  'credit_communication',
                  'loyer',
                  'internet',
                  'electricite',
                  'achat_materiel',
                  'salaires',
                  'assurance',
                  'marketing',
                  'autres'
                )),
  montant       numeric(10,0) not null check (montant > 0),
  description   text,
  responsable   text,             -- Nom libre (mécanicien, dépôt ambulant...)
  prestataire   text,             -- Fournisseur/prestataire
  -- Lien optionnel à une commande (ex: carburant pour une course précise)
  commande_id   uuid references public.commandes(id) on delete set null,
  cree_par      uuid references public.profils(id),
  created_at    timestamptz not null default now()
);

comment on table public.depenses is
  'Toutes les dépenses : flotte, communication, loyer, etc. Peut être liée à une commande.';

create index idx_depenses_date      on public.depenses(date_depense);
create index idx_depenses_categorie on public.depenses(categorie);

-- ─────────────────────────────────────────
-- 9. CHARGES FIXES
-- Tableau de bord financier (objectifs mensuels)
-- ─────────────────────────────────────────
create table public.charges_fixes (
  id              uuid primary key default uuid_generate_v4(),
  poste           text not null,
  type_charge     text not null check (type_charge in ('fixe_directe', 'provision_strategique')),
  montant_mensuel numeric(10,0) not null,
  notes           text,
  actif           boolean not null default true
);

comment on table public.charges_fixes is
  'Objectifs de charges fixes mensuelles. Sert au tableau de bord financier.';

-- Données initiales issues du fichier Excel
insert into public.charges_fixes (poste, type_charge, montant_mensuel, notes, actif) values
  ('Salaires',                 'fixe_directe',        120000, 'Objectif non encore activé — désactiver tant que non décaissé',        false),
  ('Loyer',                    'fixe_directe',          4000, null,                                                                    true),
  ('Forfait Internet',         'fixe_directe',          5000, null,                                                                    true),
  ('Forfait Appels',           'fixe_directe',          3000, null,                                                                    true),
  ('Électricité',              'fixe_directe',           500, null,                                                                    true),
  ('Assurance Moto',           'fixe_directe',          7500, 'Non négociable',                                                        true),
  ('Amortissement Moto',       'provision_strategique', 11750, 'Base 282k sur 24 mois',                                               true),
  ('Provision Entretien Moto', 'provision_strategique', 15000, 'Pour lisser les coûts',                                               true),
  ('Marge de Sécurité',        'provision_strategique', 16625, '10% des autres charges',                                              true);

-- ─────────────────────────────────────────
-- 10. STATISTIQUES MENSUELLES
-- Pré-calculées pour accélérer les rapports
-- ─────────────────────────────────────────
create table public.statistiques_mensuelles (
  id                 uuid primary key default uuid_generate_v4(),
  mois               integer not null check (mois between 1 and 12),
  annee              integer not null check (annee >= 2026),
  total_courses      integer not null default 0,
  courses_livrees    integer not null default 0,
  courses_annulees   integer not null default 0,
  revenu_total       numeric(12,0) not null default 0,
  depenses_total     numeric(12,0) not null default 0,
  part_livreurs      numeric(12,0) not null default 0,
  part_carburant     numeric(12,0) not null default 0,
  part_entreprise    numeric(12,0) not null default 0,
  benefice           numeric(12,0) generated always as (revenu_total - depenses_total) stored,
  recalcule_at       timestamptz not null default now(),
  unique (mois, annee)
);

comment on table public.statistiques_mensuelles is
  'Agrégats pré-calculés par mois. Recalculer via fonction après toute modification.';

-- ─────────────────────────────────────────
-- 11. HISTORIQUE PARAMÈTRES
-- Traçabilité des changements de pourcentages
-- ─────────────────────────────────────────
create table public.historique_parametres (
  id               uuid primary key default uuid_generate_v4(),
  pct_livreur      numeric(5,2) not null,
  pct_carburant    numeric(5,2) not null,
  pct_entreprise   numeric(5,2) not null,
  modifie_par      uuid references public.profils(id),
  modifie_at       timestamptz not null default now()
);

comment on table public.historique_parametres is
  'Audit trail de tous les changements de pourcentages de répartition.';

-- ─────────────────────────────────────────
-- FONCTIONS UTILITAIRES
-- ─────────────────────────────────────────

-- Fonction : calculer et insérer/mettre à jour la répartition d'une commande
create or replace function public.calculer_repartition(p_commande_id uuid)
returns void language plpgsql as $$
declare
  v_cmd     record;
  v_svc     record;
  v_prm     record;
  v_pct_l   numeric;
  v_pct_c   numeric;
  v_pct_e   numeric;
begin
  -- Récupérer la commande
  select * into v_cmd from public.commandes where id = p_commande_id;
  -- Récupérer le service (pour répartition spécifique éventuelle)
  select * into v_svc from public.services where id = v_cmd.service_id;
  -- Récupérer les paramètres globaux
  select * into v_prm from public.parametres where id = 1;

  -- Priorité : % du service > % globaux
  v_pct_l := coalesce(v_svc.pct_livreur,    v_prm.pct_livreur);
  v_pct_c := coalesce(v_svc.pct_carburant,  v_prm.pct_carburant);
  v_pct_e := coalesce(v_svc.pct_entreprise, v_prm.pct_entreprise);

  -- Insérer ou mettre à jour
  insert into public.repartition_financiere
    (commande_id, pct_livreur, pct_carburant, pct_entreprise,
     part_livreur, part_carburant, part_entreprise)
  values (
    p_commande_id,
    v_pct_l, v_pct_c, v_pct_e,
    round(v_cmd.prix_total * v_pct_l / 100),
    round(v_cmd.prix_total * v_pct_c / 100),
    round(v_cmd.prix_total * v_pct_e / 100)
  )
  on conflict (commande_id) do update set
    pct_livreur      = excluded.pct_livreur,
    pct_carburant    = excluded.pct_carburant,
    pct_entreprise   = excluded.pct_entreprise,
    part_livreur     = excluded.part_livreur,
    part_carburant   = excluded.part_carburant,
    part_entreprise  = excluded.part_entreprise,
    calculated_at    = now();
end;
$$;

-- Trigger : déclencher le calcul automatiquement après insert ou update d'une commande
create or replace function public.trigger_calculer_repartition()
returns trigger language plpgsql as $$
begin
  if new.statut != 'annulé' then
    perform public.calculer_repartition(new.id);
  end if;
  return new;
end;
$$;

create trigger after_commande_upsert
after insert or update of prix_total, service_id, statut
on public.commandes
for each row execute function public.trigger_calculer_repartition();

-- Fonction : recalculer les statistiques d'un mois donné
create or replace function public.recalculer_stats(p_mois integer, p_annee integer)
returns void language plpgsql as $$
declare
  v_total_courses    integer;
  v_livrees          integer;
  v_annulees         integer;
  v_revenu           numeric;
  v_depenses         numeric;
  v_part_livreurs    numeric;
  v_part_carburant   numeric;
  v_part_entreprise  numeric;
begin
  -- Compter les courses du mois
  select
    count(*),
    count(*) filter (where statut = 'livré'),
    count(*) filter (where statut = 'annulé')
  into v_total_courses, v_livrees, v_annulees
  from public.commandes
  where extract(month from date_course) = p_mois
    and extract(year  from date_course) = p_annee;

  -- Revenus (courses livrées uniquement)
  select coalesce(sum(prix_total), 0)
  into v_revenu
  from public.commandes
  where statut = 'livré'
    and extract(month from date_course) = p_mois
    and extract(year  from date_course) = p_annee;

  -- Répartitions
  select
    coalesce(sum(r.part_livreur),    0),
    coalesce(sum(r.part_carburant),  0),
    coalesce(sum(r.part_entreprise), 0)
  into v_part_livreurs, v_part_carburant, v_part_entreprise
  from public.repartition_financiere r
  join public.commandes c on c.id = r.commande_id
  where c.statut = 'livré'
    and extract(month from c.date_course) = p_mois
    and extract(year  from c.date_course) = p_annee;

  -- Dépenses du mois
  select coalesce(sum(montant), 0)
  into v_depenses
  from public.depenses
  where extract(month from date_depense) = p_mois
    and extract(year  from date_depense) = p_annee;

  -- Upsert statistiques
  insert into public.statistiques_mensuelles
    (mois, annee, total_courses, courses_livrees, courses_annulees,
     revenu_total, depenses_total, part_livreurs, part_carburant, part_entreprise, recalcule_at)
  values
    (p_mois, p_annee, v_total_courses, v_livrees, v_annulees,
     v_revenu, v_depenses, v_part_livreurs, v_part_carburant, v_part_entreprise, now())
  on conflict (mois, annee) do update set
    total_courses    = excluded.total_courses,
    courses_livrees  = excluded.courses_livrees,
    courses_annulees = excluded.courses_annulees,
    revenu_total     = excluded.revenu_total,
    depenses_total   = excluded.depenses_total,
    part_livreurs    = excluded.part_livreurs,
    part_carburant   = excluded.part_carburant,
    part_entreprise  = excluded.part_entreprise,
    recalcule_at     = now();
end;
$$;

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- Seuls les utilisateurs authentifiés
-- peuvent lire/écrire
-- ─────────────────────────────────────────

alter table public.profils                  enable row level security;
alter table public.livreurs                 enable row level security;
alter table public.services                 enable row level security;
alter table public.parametres               enable row level security;
alter table public.commandes                enable row level security;
alter table public.commandes_livreurs       enable row level security;
alter table public.repartition_financiere   enable row level security;
alter table public.depenses                 enable row level security;
alter table public.charges_fixes            enable row level security;
alter table public.statistiques_mensuelles  enable row level security;
alter table public.historique_parametres    enable row level security;

-- Politique : utilisateur authentifié peut tout lire
create policy "auth_read_all" on public.profils
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.livreurs
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.services
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.parametres
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.commandes
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.commandes_livreurs
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.repartition_financiere
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.depenses
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.charges_fixes
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.statistiques_mensuelles
  for select using (auth.role() = 'authenticated');
create policy "auth_read_all" on public.historique_parametres
  for select using (auth.role() = 'authenticated');

-- Politique : operateur et admin peuvent écrire les commandes et dépenses
create policy "auth_write_commandes" on public.commandes
  for all using (auth.role() = 'authenticated');
create policy "auth_write_depenses" on public.depenses
  for all using (auth.role() = 'authenticated');
create policy "auth_write_commandes_livreurs" on public.commandes_livreurs
  for all using (auth.role() = 'authenticated');

-- Politique : seul l'admin peut modifier les paramètres
-- (à affiner côté application en vérifiant le rôle dans public.profils)
create policy "admin_write_parametres" on public.parametres
  for all using (auth.role() = 'authenticated');
create policy "admin_write_services" on public.services
  for all using (auth.role() = 'authenticated');
create policy "admin_write_charges" on public.charges_fixes
  for all using (auth.role() = 'authenticated');
