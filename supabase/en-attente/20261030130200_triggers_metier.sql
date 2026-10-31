-- ═══════════════════════════════════════════════════════
-- 3. TRIGGERS MÉTIER
-- Les tables calculées (répartition, historique) n'ont pas de
-- politique d'écriture : seules ces fonctions SECURITY DEFINER
-- peuvent les alimenter.
-- ═══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- Répartition financière d'une course
-- • % du service s'il en a, sinon % globaux
-- • la part entreprise prend le reste : la somme des 3 parts
--   est toujours exactement égale au prix (pas d'écart d'arrondi)
-- ─────────────────────────────────────────
create or replace function public.calculer_repartition(p_commande_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cmd     public.commandes%rowtype;
  v_pct_l   numeric;
  v_pct_c   numeric;
  v_pct_e   numeric;
  v_part_l  numeric;
  v_part_c  numeric;
begin
  select * into v_cmd from public.commandes where id = p_commande_id;
  if not found then
    return;
  end if;

  select
    coalesce(s.pct_livreur,    p.pct_livreur),
    coalesce(s.pct_carburant,  p.pct_carburant),
    coalesce(s.pct_entreprise, p.pct_entreprise)
  into v_pct_l, v_pct_c, v_pct_e
  from public.parametres p
  left join public.services s on s.id = v_cmd.service_id
  where p.id = 1;

  v_part_l := round(v_cmd.prix_total * v_pct_l / 100);
  v_part_c := round(v_cmd.prix_total * v_pct_c / 100);

  insert into public.repartition_financiere
    (commande_id, pct_livreur, pct_carburant, pct_entreprise,
     part_livreur, part_carburant, part_entreprise)
  values (
    p_commande_id,
    v_pct_l, v_pct_c, v_pct_e,
    v_part_l, v_part_c, v_cmd.prix_total - v_part_l - v_part_c
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

-- Course annulée → sa répartition est supprimée (avant : elle restait).
create or replace function public.trigger_calculer_repartition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.statut = 'annulé' then
    delete from public.repartition_financiere where commande_id = new.id;
  else
    perform public.calculer_repartition(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists after_commande_upsert on public.commandes;
create trigger after_commande_upsert
after insert or update of prix_total, service_id, statut
on public.commandes
for each row execute function public.trigger_calculer_repartition();

-- ─────────────────────────────────────────
-- Historique des pourcentages
-- Remplace l'insert fait par le front. N'enregistre que si les %
-- changent réellement (modifier seulement l'objectif CA ne crée
-- plus d'entrée). Conserve la sémantique actuelle : on archive
-- les ANCIENNES valeurs.
-- ─────────────────────────────────────────
create or replace function public.historiser_parametres()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);

  if (new.pct_livreur, new.pct_carburant, new.pct_entreprise)
     is distinct from (old.pct_livreur, old.pct_carburant, old.pct_entreprise) then
    insert into public.historique_parametres
      (pct_livreur, pct_carburant, pct_entreprise, modifie_par)
    values
      (old.pct_livreur, old.pct_carburant, old.pct_entreprise, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists before_parametres_update on public.parametres;
create trigger before_parametres_update
before update on public.parametres
for each row execute function public.historiser_parametres();

-- ─────────────────────────────────────────
-- cree_par = l'utilisateur connecté, quoi que le client envoie
-- (hors SQL Editor / service_role, où auth.uid() est NULL).
-- ─────────────────────────────────────────
create or replace function public.definir_cree_par()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.cree_par := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists before_commande_insert on public.commandes;
create trigger before_commande_insert
before insert on public.commandes
for each row execute function public.definir_cree_par();

drop trigger if exists before_depense_insert on public.depenses;
create trigger before_depense_insert
before insert on public.depenses
for each row execute function public.definir_cree_par();

-- ─────────────────────────────────────────
-- Fonctions internes : non appelables depuis l'API
-- ─────────────────────────────────────────
revoke execute on function public.calculer_repartition(uuid)      from public, anon, authenticated;
revoke execute on function public.trigger_calculer_repartition()  from public, anon, authenticated;
revoke execute on function public.historiser_parametres()         from public, anon, authenticated;
revoke execute on function public.definir_cree_par()              from public, anon, authenticated;
revoke execute on function public.maj_updated_at()                from public, anon, authenticated;

-- recalculer_stats (schéma v1) peut ne pas exister sur la base réelle.
-- Obsolète : stats_periode() calcule les mêmes chiffres à la volée.
do $$
begin
  if to_regprocedure('public.recalculer_stats(integer, integer)') is not null then
    revoke execute on function public.recalculer_stats(integer, integer) from public, anon, authenticated;
  end if;
end $$;
