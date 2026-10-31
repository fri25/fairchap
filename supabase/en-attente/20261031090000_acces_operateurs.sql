-- ═══════════════════════════════════════════════════════
-- 5. CLOISONNEMENT ADMIN / OPÉRATEUR
--   • admin      → toutes les données
--   • opérateur  → uniquement les courses et dépenses qu'il a créées
--                  (cree_par), et ce qui en découle (livreurs liés,
--                  répartition). Les RPC stats_periode, serie_periode
--                  et clients_stats étant SECURITY INVOKER, elles
--                  renvoient automatiquement ses seuls chiffres.
--   • données de pilotage (charges, statistiques, historique,
--     profils des autres) → admin uniquement
-- Les référentiels (livreurs, services, paramètres) restent lisibles
-- par tout membre actif : ils servent aux formulaires.
-- ═══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- Courses et dépenses : propriétaire ou admin
-- ─────────────────────────────────────────
drop policy if exists lecture_membres  on public.commandes;
drop policy if exists ecriture_membres on public.commandes;
drop policy if exists acces_commandes  on public.commandes;
create policy acces_commandes on public.commandes
  for all to authenticated
  using (
    (select public.est_admin())
    or (cree_par = (select auth.uid()) and (select public.est_actif()))
  )
  with check (
    (select public.est_admin())
    or (cree_par = (select auth.uid()) and (select public.est_actif()))
  );

drop policy if exists lecture_membres  on public.depenses;
drop policy if exists ecriture_membres on public.depenses;
drop policy if exists acces_depenses   on public.depenses;
create policy acces_depenses on public.depenses
  for all to authenticated
  using (
    (select public.est_admin())
    or (cree_par = (select auth.uid()) and (select public.est_actif()))
  )
  with check (
    (select public.est_admin())
    or (cree_par = (select auth.uid()) and (select public.est_actif()))
  );

-- ─────────────────────────────────────────
-- Tables liées à une course : visibles si la course l'est
-- (la sous-requête sur commandes passe elle-même par son RLS)
-- ─────────────────────────────────────────
drop policy if exists lecture_membres  on public.commandes_livreurs;
drop policy if exists ecriture_membres on public.commandes_livreurs;
drop policy if exists acces_commandes_livreurs on public.commandes_livreurs;
create policy acces_commandes_livreurs on public.commandes_livreurs
  for all to authenticated
  using      (exists (select 1 from public.commandes c where c.id = commande_id))
  with check (exists (select 1 from public.commandes c where c.id = commande_id));

drop policy if exists lecture_membres on public.repartition_financiere;
drop policy if exists lecture_repartition on public.repartition_financiere;
create policy lecture_repartition on public.repartition_financiere
  for select to authenticated
  using (exists (select 1 from public.commandes c where c.id = commande_id));

-- ─────────────────────────────────────────
-- Pilotage : admin uniquement
-- ─────────────────────────────────────────
drop policy if exists lecture_membres on public.charges_fixes;
drop policy if exists lecture_membres on public.statistiques_mensuelles;
drop policy if exists lecture_membres on public.historique_parametres;
drop policy if exists lecture_admin   on public.charges_fixes;
drop policy if exists lecture_admin   on public.statistiques_mensuelles;
drop policy if exists lecture_admin   on public.historique_parametres;

create policy lecture_admin on public.charges_fixes
  for select to authenticated using ((select public.est_admin()));
create policy lecture_admin on public.statistiques_mensuelles
  for select to authenticated using ((select public.est_admin()));
create policy lecture_admin on public.historique_parametres
  for select to authenticated using ((select public.est_admin()));

-- Profils : chacun voit le sien, l'admin voit toute l'équipe
drop policy if exists lecture_membres on public.profils;
drop policy if exists lecture_profils on public.profils;
create policy lecture_profils on public.profils
  for select to authenticated
  using (id = (select auth.uid()) or (select public.est_admin()));

-- ─────────────────────────────────────────
-- Suggestions de saisie (autocomplétion du formulaire de course)
-- SECURITY DEFINER : un opérateur doit retrouver un client déjà
-- servi par un collègue, sinon il recrée un doublon. Ne renvoie que
-- des noms, téléphones et lieux, jamais de montants. Réservé aux
-- membres actifs. Une seule valeur JSON → pas de limite de 1000 lignes.
-- ─────────────────────────────────────────
create or replace function public.suggestions_saisie()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_actif() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'clients', (
      select coalesce(jsonb_agg(jsonb_build_object('nom', x.nom, 'tel', x.tel, 'n', x.n)
                                order by x.n desc, x.nom), '[]'::jsonb)
      from (
        select
          (array_agg(c.nom_client order by c.date_course desc, c.created_at desc))[1] as nom,
          (array_agg(c.telephone_client order by c.date_course desc, c.created_at desc)
             filter (where c.telephone_client is not null))[1]                          as tel,
          count(*)                                                                    as n
        from public.commandes c
        where nullif(trim(c.nom_client), '') is not null
          and c.nom_client <> 'Client inconnu'
        group by lower(trim(coalesce(c.telephone_client, c.nom_client)))
      ) x
    ),
    'lieux', (
      select coalesce(jsonb_agg(jsonb_build_object('nom', l.nom, 'n', l.n)
                                order by l.n desc, l.nom), '[]'::jsonb)
      from (
        select (array_agg(a.nom))[1] as nom, count(*) as n
        from (
          select trim(adresse_depart)  as nom from public.commandes
          union all
          select trim(adresse_arrivee) as nom from public.commandes
        ) a
        where a.nom <> ''
        group by lower(a.nom)
      ) l
    ),
    'zones', (
      select coalesce(jsonb_agg(jsonb_build_object('nom', z.nom, 'n', z.n)
                                order by z.n desc, z.nom), '[]'::jsonb)
      from (
        select (array_agg(trim(c.zone)))[1] as nom, count(*) as n
        from public.commandes c
        where nullif(trim(c.zone), '') is not null
        group by lower(trim(c.zone))
      ) z
    )
  );
end;
$$;

revoke execute on function public.suggestions_saisie() from public, anon;
grant  execute on function public.suggestions_saisie() to authenticated;
