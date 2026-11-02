-- ═══════════════════════════════════════════════════════
-- 4. FONCTIONS RPC (appelées par le front via sb.rpc)
-- SECURITY INVOKER : elles s'exécutent avec les droits de
-- l'utilisateur, le RLS s'applique normalement.
-- ═══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- Créer une course + ses livreurs en UNE transaction
-- (avant : 2 requêtes, la 2e pouvait échouer en silence)
-- ─────────────────────────────────────────
create or replace function public.creer_commande(
  p_adresse_depart    text,
  p_adresse_arrivee   text,
  p_prix_total        numeric,
  p_livreur_ids       uuid[],
  p_date_course       date    default null,
  p_heure_debut       time    default null,
  p_service_id        uuid    default null,
  p_nom_client        text    default null,
  p_telephone_client  text    default null,
  p_zone              text    default null,
  p_observations      text    default null,
  p_statut            text    default 'en_cours'
)
returns public.commandes
language plpgsql security invoker set search_path = '' as $$
declare
  v_cmd public.commandes;
begin
  if coalesce(cardinality(p_livreur_ids), 0) = 0 then
    raise exception 'Au moins un livreur est requis' using errcode = '22023';
  end if;

  insert into public.commandes (
    adresse_depart, adresse_arrivee, prix_total, date_course, heure_debut,
    service_id, nom_client, telephone_client, zone, observations, statut
  ) values (
    p_adresse_depart, p_adresse_arrivee, p_prix_total,
    coalesce(p_date_course, current_date), p_heure_debut,
    p_service_id, p_nom_client, p_telephone_client, p_zone, p_observations,
    coalesce(p_statut, 'en_cours')
  )
  returning * into v_cmd;

  insert into public.commandes_livreurs (commande_id, livreur_id)
  select distinct v_cmd.id, l from unnest(p_livreur_ids) as l;

  return v_cmd;
end;
$$;

-- ─────────────────────────────────────────
-- Modifier une course + remplacer ses livreurs en UNE transaction
-- p_heure_debut NULL = heure inchangée (le formulaire d'édition
-- ne la propose pas).
-- ─────────────────────────────────────────
create or replace function public.modifier_commande(
  p_id                uuid,
  p_adresse_depart    text,
  p_adresse_arrivee   text,
  p_prix_total        numeric,
  p_livreur_ids       uuid[],
  p_statut            text,
  p_date_course       date    default null,
  p_heure_debut       time    default null,
  p_service_id        uuid    default null,
  p_nom_client        text    default null,
  p_telephone_client  text    default null,
  p_zone              text    default null,
  p_observations      text    default null
)
returns public.commandes
language plpgsql security invoker set search_path = '' as $$
declare
  v_cmd public.commandes;
begin
  if coalesce(cardinality(p_livreur_ids), 0) = 0 then
    raise exception 'Au moins un livreur est requis' using errcode = '22023';
  end if;

  update public.commandes set
    adresse_depart   = p_adresse_depart,
    adresse_arrivee  = p_adresse_arrivee,
    prix_total       = p_prix_total,
    statut           = p_statut,
    date_course      = coalesce(p_date_course, date_course),
    heure_debut      = coalesce(p_heure_debut, heure_debut),
    service_id       = p_service_id,
    nom_client       = p_nom_client,
    telephone_client = p_telephone_client,
    zone             = p_zone,
    observations     = p_observations
  where id = p_id
  returning * into v_cmd;

  if not found then
    raise exception 'Course introuvable' using errcode = 'P0002';
  end if;

  delete from public.commandes_livreurs where commande_id = p_id;
  insert into public.commandes_livreurs (commande_id, livreur_id)
  select distinct p_id, l from unnest(p_livreur_ids) as l;

  return v_cmd;
end;
$$;

-- ─────────────────────────────────────────
-- Statistiques d'une période [p_from, p_to] (bornes incluses)
-- Remplace les dizaines de requêtes + agrégations JS du front,
-- et la limite de 1000 lignes ne s'applique plus.
--
-- solde_reporte = revenus livrés − dépenses AVANT p_from, calculé
-- à la volée : toujours juste, rien à « clôturer » ni à stocker.
--
-- par_livreur.part : si plusieurs livreurs sur une course, la part
-- livreur est divisée entre eux (la somme reste = part_livreurs).
-- par_livreur.revenus : le CA de la course est attribué à chacun.
-- ─────────────────────────────────────────
create or replace function public.stats_periode(p_from date, p_to date)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with
  cmd as (
    select c.id, c.statut, c.prix_total, c.service_id
    from public.commandes c
    where c.date_course between p_from and p_to
  ),
  liv as (
    select * from cmd where statut = 'livré'
  ),
  dep as (
    select d.categorie, d.montant
    from public.depenses d
    where d.date_depense between p_from and p_to
  ),
  rep as (
    select r.*
    from public.repartition_financiere r
    join liv on liv.id = r.commande_id
  ),
  nb_liv as (
    select cl.commande_id, count(*) as n
    from public.commandes_livreurs cl
    join liv on liv.id = cl.commande_id
    group by cl.commande_id
  ),
  tot as (
    select
      (select count(*) from cmd)                                   as courses_total,
      (select count(*) from liv)                                   as courses_livrees,
      (select count(*) from cmd where statut = 'en_cours')         as courses_en_cours,
      (select count(*) from cmd where statut = 'en_attente')       as courses_en_attente,
      (select count(*) from cmd where statut = 'annulé')           as courses_annulees,
      (select coalesce(sum(prix_total), 0) from liv)               as revenus,
      (select count(*) from dep)                                   as nb_depenses,
      (select coalesce(sum(montant), 0) from dep)                  as depenses,
      (select coalesce(sum(part_livreur), 0)    from rep)          as part_livreurs,
      (select coalesce(sum(part_carburant), 0)  from rep)          as part_carburant,
      (select coalesce(sum(part_entreprise), 0) from rep)          as part_entreprise,
      coalesce((select sum(c.prix_total) from public.commandes c
                where c.statut = 'livré' and c.date_course < p_from), 0)
      - coalesce((select sum(d.montant) from public.depenses d
                  where d.date_depense < p_from), 0)               as solde_reporte
  )
  select jsonb_build_object(
    'courses_total',      tot.courses_total,
    'courses_livrees',    tot.courses_livrees,
    'courses_en_cours',   tot.courses_en_cours,
    'courses_en_attente', tot.courses_en_attente,
    'courses_annulees',   tot.courses_annulees,
    'revenus',            tot.revenus,
    'nb_depenses',        tot.nb_depenses,
    'depenses',           tot.depenses,
    'benefice',           tot.revenus - tot.depenses,
    'part_livreurs',      tot.part_livreurs,
    'part_carburant',     tot.part_carburant,
    'part_entreprise',    tot.part_entreprise,
    'solde_reporte',      tot.solde_reporte,
    'solde_cloture',      tot.solde_reporte + tot.revenus - tot.depenses,

    'par_service', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'service_id', s.service_id, 'courses', s.n, 'revenus', s.total)
             order by s.total desc), '[]'::jsonb)
      from (select service_id, count(*) as n, sum(prix_total) as total
            from liv group by service_id) s
    ),

    'par_categorie', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'categorie', x.categorie, 'nb', x.n, 'montant', x.total)
             order by x.total desc), '[]'::jsonb)
      from (select categorie, count(*) as n, sum(montant) as total
            from dep group by categorie) x
    ),

    'par_livreur', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'livreur_id', l.livreur_id, 'courses', l.courses,
               'revenus', l.revenus, 'part', l.part)
             order by l.courses desc), '[]'::jsonb)
      from (
        select
          cl.livreur_id,
          count(*)                                          as courses,
          sum(liv.prix_total)                               as revenus,
          round(sum(coalesce(rep.part_livreur, 0) / nb.n))  as part
        from public.commandes_livreurs cl
        join liv           on liv.id = cl.commande_id
        join nb_liv nb     on nb.commande_id = cl.commande_id
        left join rep      on rep.commande_id = cl.commande_id
        group by cl.livreur_id
      ) l
    )
  )
  from tot;
$$;

-- ─────────────────────────────────────────
-- Série revenus / dépenses par jour ou par mois (graphiques)
-- Remplace les boucles de 7 à 24 requêtes du front.
-- p_pas : 'jour' (défaut) ou 'mois'
-- ─────────────────────────────────────────
create or replace function public.serie_periode(
  p_from date,
  p_to   date,
  p_pas  text default 'jour'
)
returns table (periode date, revenus numeric, depenses numeric)
language sql stable security invoker set search_path = '' as $$
  with
  pas as (
    select
      case when p_pas = 'mois' then date_trunc('month', p_from)::date else p_from end as debut,
      case when p_pas = 'mois' then interval '1 month' else interval '1 day' end      as duree
  ),
  periodes as (
    select g::date as debut, (g + pas.duree)::date as fin
    from pas, generate_series(pas.debut::timestamp, p_to::timestamp, pas.duree) as g
  )
  select
    p.debut,
    coalesce((select sum(c.prix_total) from public.commandes c
              where c.statut = 'livré'
                and c.date_course >= p.debut and c.date_course < p.fin), 0),
    coalesce((select sum(d.montant) from public.depenses d
              where d.date_depense >= p.debut and d.date_depense < p.fin), 0)
  from periodes p
  order by p.debut;
$$;

-- ─────────────────────────────────────────
-- Clients agrégés depuis les courses
-- Clé client = téléphone, sinon nom (insensible à la casse/espaces),
-- comme dans le front actuel. Nom/téléphone affichés = les plus récents.
-- ─────────────────────────────────────────
create or replace function public.clients_stats()
returns table (
  nom             text,
  telephone       text,
  courses         bigint,
  livrees         bigint,
  ca              numeric,
  derniere        date,
  service_favori  uuid
)
language sql stable security invoker set search_path = '' as $$
  with
  base as (
    select
      lower(trim(coalesce(c.telephone_client, c.nom_client, '__inconnu__'))) as cle,
      c.nom_client, c.telephone_client, c.statut, c.prix_total,
      c.date_course, c.service_id
    from public.commandes c
  ),
  fav as (
    select distinct on (b.cle) b.cle, b.service_id
    from base b
    where b.service_id is not null
    group by b.cle, b.service_id
    order by b.cle, count(*) desc
  )
  select
    (array_agg(b.nom_client       order by b.date_course desc)
       filter (where b.nom_client is not null))[1],
    (array_agg(b.telephone_client order by b.date_course desc)
       filter (where b.telephone_client is not null))[1],
    count(*),
    count(*) filter (where b.statut = 'livré'),
    coalesce(sum(b.prix_total) filter (where b.statut = 'livré'), 0),
    max(b.date_course),
    (select f.service_id from fav f where f.cle = b.cle)
  from base b
  group by b.cle;
$$;

-- ─────────────────────────────────────────
-- Droits : utilisateurs connectés uniquement (le RLS fait le reste)
-- ─────────────────────────────────────────
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'creer_commande', 'modifier_commande',
        'stats_periode', 'serie_periode', 'clients_stats'
      ])
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
