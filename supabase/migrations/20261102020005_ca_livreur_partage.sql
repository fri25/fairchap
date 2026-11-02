-- ═══════════════════════════════════════════════════════
-- 6. CA PAR LIVREUR PARTAGÉ
-- Une course à plusieurs livreurs comptait son CA entier pour
-- chacun : la somme des CA livreurs dépassait le CA réel.
-- Le CA est désormais divisé entre les livreurs de la course,
-- comme la part livreur (somme des CA livreurs = CA livré).
-- ═══════════════════════════════════════════════════════

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
          round(sum(liv.prix_total / nb.n))                 as revenus,
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

revoke execute on function public.stats_periode(date, date) from public, anon;
grant  execute on function public.stats_periode(date, date) to authenticated;
