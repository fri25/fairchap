-- ═══════════════════════════════════════════════════════
-- 1. ALIGNEMENT DU SCHÉMA
-- Colonnes utilisées par le front mais absentes du schéma v1,
-- contraintes corrigées, updated_at automatique.
-- Idempotent : peut être rejoué sur une base déjà modifiée.
-- ═══════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- Colonnes manquantes
-- ─────────────────────────────────────────
alter table public.parametres
  add column if not exists objectif_ca numeric(12,0) not null default 0;

alter table public.statistiques_mensuelles
  add column if not exists solde_reporte numeric(12,0) not null default 0;

alter table public.statistiques_mensuelles
  add column if not exists solde_cloture numeric(12,0)
    generated always as (solde_reporte + revenu_total - depenses_total) stored;

-- ─────────────────────────────────────────
-- Répartition spécifique d'un service : les 3 % ou aucun
-- L'ancienne contrainte laissait passer un seul % renseigné
-- (NULL + x = NULL, et un CHECK à NULL est considéré comme valide).
-- ─────────────────────────────────────────
alter table public.services drop constraint if exists check_pct_somme;
alter table public.services add constraint check_pct_somme check (
  num_nulls(pct_livreur, pct_carburant, pct_entreprise) = 3
  or (
    num_nulls(pct_livreur, pct_carburant, pct_entreprise) = 0
    and pct_livreur + pct_carburant + pct_entreprise = 100
  )
);

-- ─────────────────────────────────────────
-- Montant d'une course jamais négatif
-- ─────────────────────────────────────────
alter table public.commandes drop constraint if exists check_prix_positif;
alter table public.commandes add constraint check_prix_positif check (prix_total >= 0);

-- ─────────────────────────────────────────
-- updated_at maintenu par la base (et non plus par le front)
-- ─────────────────────────────────────────
create or replace function public.maj_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_commande_update on public.commandes;
create trigger before_commande_update
before update on public.commandes
for each row execute function public.maj_updated_at();
