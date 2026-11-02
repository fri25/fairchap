-- ═══════════════════════════════════════════════════════
-- 2. SÉCURITÉ : RÔLES ET ROW LEVEL SECURITY
-- Avant : toute personne connectée pouvait tout lire et tout
-- modifier (y compris les paramètres « admin »).
-- Après :
--   • lecture             → membre actif (ligne dans profils, actif = true)
--   • courses / dépenses  → membre actif
--   • paramètres, services, charges, livreurs, profils → admin
--   • répartition, historique, statistiques → écrits par la base uniquement
-- ═══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- Fonctions de rôle
-- SECURITY DEFINER : lisent profils sans repasser par son RLS
-- (sinon récursion infinie dans les politiques de profils).
-- ─────────────────────────────────────────
create or replace function public.est_actif()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profils p
    where p.id = auth.uid() and p.actif
  );
$$;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profils p
    where p.id = auth.uid() and p.actif and p.role = 'admin'
  );
$$;

-- ─────────────────────────────────────────
-- Profil créé automatiquement à chaque nouvel utilisateur
-- Le rôle est TOUJOURS 'operateur' : il ne doit jamais venir des
-- métadonnées, que l'utilisateur contrôle à l'inscription.
-- ─────────────────────────────────────────
create or replace function public.creer_profil_utilisateur()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profils (id, nom, prenom, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nom'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Utilisateur'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'prenom'), ''),
    'operateur'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.creer_profil_utilisateur();

-- Comptes existants sans profil : créés INACTIFS.
-- Avec l'ancien RLS ils avaient accès à tout ; un admin doit
-- désormais les activer explicitement (voir supabase/README.md).
insert into public.profils (id, nom, role, actif)
select
  u.id,
  coalesce(nullif(split_part(u.email, '@', 1), ''), 'Utilisateur'),
  'operateur',
  false
from auth.users u
where not exists (select 1 from public.profils p where p.id = u.id);

-- ─────────────────────────────────────────
-- Remise à zéro des politiques
-- Supprime TOUTES les politiques existantes sur ces tables, y compris
-- celles ajoutées à la main dans le dashboard Supabase.
-- ─────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profils', 'livreurs', 'services', 'parametres', 'commandes',
        'commandes_livreurs', 'repartition_financiere', 'depenses',
        'charges_fixes', 'statistiques_mensuelles', 'historique_parametres'
      ])
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ─────────────────────────────────────────
-- RLS activé + lecture pour les membres actifs
-- (select …) autour de la fonction : évaluée une fois par requête
-- et non une fois par ligne.
-- ─────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'profils', 'livreurs', 'services', 'parametres', 'commandes',
    'commandes_livreurs', 'repartition_financiere', 'depenses',
    'charges_fixes', 'statistiques_mensuelles', 'historique_parametres'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy lecture_membres on public.%I for select to authenticated
         using ((select public.est_actif()))', t);
  end loop;
end $$;

-- ─────────────────────────────────────────
-- Écriture opérationnelle : membres actifs
-- ─────────────────────────────────────────
create policy ecriture_membres on public.commandes
  for all to authenticated
  using ((select public.est_actif()))
  with check ((select public.est_actif()));

create policy ecriture_membres on public.commandes_livreurs
  for all to authenticated
  using ((select public.est_actif()))
  with check ((select public.est_actif()));

create policy ecriture_membres on public.depenses
  for all to authenticated
  using ((select public.est_actif()))
  with check ((select public.est_actif()));

-- ─────────────────────────────────────────
-- Écriture de configuration : admin uniquement
-- ─────────────────────────────────────────
create policy ecriture_admin on public.parametres
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

create policy ecriture_admin on public.services
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

create policy ecriture_admin on public.charges_fixes
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

create policy ecriture_admin on public.livreurs
  for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- Profils : création par trigger, suppression en cascade depuis auth.users.
-- Seul un admin peut modifier un profil (rôle, activation, nom).
create policy modification_admin on public.profils
  for update to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- repartition_financiere, historique_parametres, statistiques_mensuelles :
-- aucune politique d'écriture. Elles sont alimentées par des fonctions
-- SECURITY DEFINER (migration suivante).

-- ─────────────────────────────────────────
-- Droits d'exécution
-- Supabase accorde EXECUTE à anon sur les nouvelles fonctions : on retire.
-- ─────────────────────────────────────────
revoke execute on function public.est_actif()  from public, anon;
revoke execute on function public.est_admin()  from public, anon;
grant  execute on function public.est_actif()  to authenticated;
grant  execute on function public.est_admin()  to authenticated;

revoke execute on function public.creer_profil_utilisateur() from public, anon, authenticated;
