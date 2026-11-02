SET local check_function_bodies = off;

CREATE TABLE "public"."charges_fixes" (
  "id"              uuid          NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "poste"           text          NOT NULL,
  "type_charge"     text          NOT NULL,
  "montant_mensuel" numeric(10,0) NOT NULL,
  "notes"           text,
  "actif"           boolean       NOT NULL DEFAULT true,
  CONSTRAINT "charges_fixes_pkey" PRIMARY KEY (id),
  CONSTRAINT "charges_fixes_type_charge_check" CHECK ((type_charge = ANY (ARRAY['fixe_directe'::text, 'provision_strategique'::text])))
);

ALTER TABLE "public"."charges_fixes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."commandes_livreurs" (
  "commande_id" uuid NOT NULL,
  "livreur_id"  uuid NOT NULL,
  CONSTRAINT "commandes_livreurs_pkey" PRIMARY KEY (commande_id, livreur_id)
);

ALTER TABLE "public"."commandes_livreurs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."commandes" (
  "id"               uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "date_course"      date                     NOT NULL DEFAULT CURRENT_DATE,
  "heure_debut"      time without time zone,
  "heure_fin"        time without time zone,
  "service_id"       uuid,
  "nom_client"       text,
  "telephone_client" text,
  "adresse_depart"   text                     NOT NULL,
  "adresse_arrivee"  text                     NOT NULL,
  "zone"             text,
  "prix_total"       numeric(10,0)            NOT NULL DEFAULT 0,
  "cout_carburant"   numeric(10,0),
  "statut"           text                     NOT NULL DEFAULT 'en_cours'::text,
  "observations"     text,
  "cree_par"         uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commandes_pkey" PRIMARY KEY (id),
  CONSTRAINT "commandes_statut_check" CHECK ((statut = ANY (ARRAY['en_cours'::text, 'livré'::text, 'annulé'::text, 'en_attente'::text])))
);

ALTER TABLE "public"."commandes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."depenses" (
  "id"              uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "date_depense"    date                     NOT NULL DEFAULT CURRENT_DATE,
  "categorie"       text                     NOT NULL,
  "montant"         numeric(10,0)            NOT NULL,
  "description"     text,
  "responsable"     text,
  "prestataire"     text,
  "commande_id"     uuid,
  "cree_par"        uuid,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "mois_imputation" date,
  CONSTRAINT "depenses_categorie_check"
    CHECK
    ((categorie = ANY (ARRAY['carburant'::text, 'entretien_moto'::text, 'reparation'::text, 'credit_communication'::text, 'loyer'::text, 'internet'::text, 'electricite'::text,
    'achat_materiel'::text, 'salaires'::text, 'assurance'::text, 'marketing'::text, 'autres'::text]))),
  CONSTRAINT "depenses_montant_check" CHECK ((montant > (0)::numeric)),
  CONSTRAINT "depenses_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."depenses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."historique_parametres" (
  "id"             uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "pct_livreur"    numeric(5,2)             NOT NULL,
  "pct_carburant"  numeric(5,2)             NOT NULL,
  "pct_entreprise" numeric(5,2)             NOT NULL,
  "modifie_par"    uuid,
  "modifie_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "historique_parametres_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."historique_parametres"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."livreurs" (
  "id"         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "nom"        text                     NOT NULL,
  "prenom"     text,
  "telephone"  text,
  "actif"      boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "livreurs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."livreurs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."parametres" (
  "id"             integer                  NOT NULL DEFAULT 1,
  "pct_livreur"    numeric(5,2)             NOT NULL DEFAULT 40.00,
  "pct_carburant"  numeric(5,2)             NOT NULL DEFAULT 20.00,
  "pct_entreprise" numeric(5,2)             NOT NULL DEFAULT 40.00,
  "devise"         text                     NOT NULL DEFAULT 'FCFA'::text,
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by"     uuid,
  "objectif_ca"    numeric(12,0)            NOT NULL DEFAULT 0,
  CONSTRAINT "check_pct_total" CHECK ((((pct_livreur + pct_carburant) + pct_entreprise) = (100)::numeric)),
  CONSTRAINT "parametres_pkey" PRIMARY KEY (id),
  CONSTRAINT "single_row" CHECK ((id = 1))
);

ALTER TABLE "public"."parametres"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profils" (
  "id"         uuid                     NOT NULL,
  "nom"        text                     NOT NULL,
  "prenom"     text,
  "role"       text                     NOT NULL DEFAULT 'operateur'::text,
  "actif"      boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profils_pkey" PRIMARY KEY (id),
  CONSTRAINT "profils_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'operateur'::text])))
);

ALTER TABLE "public"."profils"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."repartition_financiere" (
  "id"              uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "commande_id"     uuid                     NOT NULL,
  "pct_livreur"     numeric(5,2)             NOT NULL,
  "pct_carburant"   numeric(5,2)             NOT NULL,
  "pct_entreprise"  numeric(5,2)             NOT NULL,
  "part_livreur"    numeric(10,0)            NOT NULL,
  "part_carburant"  numeric(10,0)            NOT NULL,
  "part_entreprise" numeric(10,0)            NOT NULL,
  "calculated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "repartition_financiere_commande_id_key" UNIQUE (commande_id),
  CONSTRAINT "repartition_financiere_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."repartition_financiere"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."services" (
  "id"             uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "nom_service"    text                     NOT NULL,
  "description"    text,
  "prix_base"      numeric(10,0)            NOT NULL DEFAULT 0,
  "pct_livreur"    numeric(5,2),
  "pct_carburant"  numeric(5,2),
  "pct_entreprise" numeric(5,2),
  "actif"          boolean                  NOT NULL DEFAULT true,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "check_pct_somme"
    CHECK ((((pct_livreur IS NULL) AND (pct_carburant IS NULL) AND (pct_entreprise IS NULL)) OR (((pct_livreur + pct_carburant) + pct_entreprise) = (100)::numeric))),
  CONSTRAINT "services_nom_service_key" UNIQUE (nom_service),
  CONSTRAINT "services_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."services"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."statistiques_mensuelles" (
  "id"               uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "mois"             integer                  NOT NULL,
  "annee"            integer                  NOT NULL,
  "total_courses"    integer                  NOT NULL DEFAULT 0,
  "courses_livrees"  integer                  NOT NULL DEFAULT 0,
  "courses_annulees" integer                  NOT NULL DEFAULT 0,
  "revenu_total"     numeric(12,0)            NOT NULL DEFAULT 0,
  "depenses_total"   numeric(12,0)            NOT NULL DEFAULT 0,
  "part_livreurs"    numeric(12,0)            NOT NULL DEFAULT 0,
  "part_carburant"   numeric(12,0)            NOT NULL DEFAULT 0,
  "part_entreprise"  numeric(12,0)            NOT NULL DEFAULT 0,
  "benefice"         numeric(12,0)            GENERATED ALWAYS AS ((revenu_total - depenses_total)) STORED,
  "recalcule_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "solde_reporte"    numeric(12,0)            NOT NULL DEFAULT 0,
  "solde_cloture"    numeric(12,0)            GENERATED ALWAYS AS (((solde_reporte + revenu_total) - depenses_total)) STORED,
  CONSTRAINT "statistiques_mensuelles_annee_check" CHECK ((annee >= 2026)),
  CONSTRAINT "statistiques_mensuelles_mois_annee_key" UNIQUE (mois, annee),
  CONSTRAINT "statistiques_mensuelles_mois_check" CHECK (((mois >= 1) AND (mois <= 12))),
  CONSTRAINT "statistiques_mensuelles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."statistiques_mensuelles"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.calculer_repartition (
  p_commande_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.recalculer_stats (
  p_mois  integer,
  p_annee integer
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_total_courses    integer;
  v_livrees          integer;
  v_annulees         integer;
  v_revenu           numeric;
  v_depenses         numeric;
  v_part_livreurs    numeric;
  v_part_carburant   numeric;
  v_part_entreprise  numeric;
  v_solde_reporte    numeric;
  v_mois_precedent   integer;
  v_annee_precedente integer;
BEGIN
  -- Déterminer le mois précédent
  IF p_mois = 1 THEN
    v_mois_precedent   := 12;
    v_annee_precedente := p_annee - 1;
  ELSE
    v_mois_precedent   := p_mois - 1;
    v_annee_precedente := p_annee;
  END IF;

  -- Récupérer le solde de clôture du mois précédent
  SELECT coalesce(solde_cloture, 0)
  INTO v_solde_reporte
  FROM public.statistiques_mensuelles
  WHERE mois = v_mois_precedent AND annee = v_annee_precedente;

  IF v_solde_reporte IS NULL THEN v_solde_reporte := 0; END IF;

  -- Courses du mois
  SELECT
    count(*),
    count(*) filter (WHERE statut = 'livré'),
    count(*) filter (WHERE statut = 'annulé')
  INTO v_total_courses, v_livrees, v_annulees
  FROM public.commandes
  WHERE extract(month FROM date_course) = p_mois
    AND extract(year  FROM date_course) = p_annee;

  -- Revenus (courses livrées)
  SELECT coalesce(sum(prix_total), 0)
  INTO v_revenu
  FROM public.commandes
  WHERE statut = 'livré'
    AND extract(month FROM date_course) = p_mois
    AND extract(year  FROM date_course) = p_annee;

  -- Répartitions financières
  SELECT
    coalesce(sum(r.part_livreur),    0),
    coalesce(sum(r.part_carburant),  0),
    coalesce(sum(r.part_entreprise), 0)
  INTO v_part_livreurs, v_part_carburant, v_part_entreprise
  FROM public.repartition_financiere r
  JOIN public.commandes c ON c.id = r.commande_id
  WHERE c.statut = 'livré'
    AND extract(month FROM c.date_course) = p_mois
    AND extract(year  FROM c.date_course) = p_annee;

  -- Dépenses du mois — utilise mois_imputation si renseigné, sinon date_depense
  SELECT coalesce(sum(montant), 0)
  INTO v_depenses
  FROM public.depenses
  WHERE extract(month FROM coalesce(mois_imputation, date_depense)) = p_mois
    AND extract(year  FROM coalesce(mois_imputation, date_depense)) = p_annee;

  -- Upsert statistiques
  INSERT INTO public.statistiques_mensuelles
    (mois, annee, total_courses, courses_livrees, courses_annulees,
     revenu_total, depenses_total, part_livreurs, part_carburant,
     part_entreprise, solde_reporte, recalcule_at)
  VALUES
    (p_mois, p_annee, v_total_courses, v_livrees, v_annulees,
     v_revenu, v_depenses, v_part_livreurs, v_part_carburant,
     v_part_entreprise, v_solde_reporte, now())
  ON CONFLICT (mois, annee) DO UPDATE SET
    total_courses    = excluded.total_courses,
    courses_livrees  = excluded.courses_livrees,
    courses_annulees = excluded.courses_annulees,
    revenu_total     = excluded.revenu_total,
    depenses_total   = excluded.depenses_total,
    part_livreurs    = excluded.part_livreurs,
    part_carburant   = excluded.part_carburant,
    part_entreprise  = excluded.part_entreprise,
    solde_reporte    = excluded.solde_reporte,
    recalcule_at     = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_calculer_repartition()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  if new.statut != 'annulé' then
    perform public.calculer_repartition(new.id);
  end if;
  return new;
end;
$function$;

ALTER TABLE "public"."commandes_livreurs"
  ADD CONSTRAINT "commandes_livreurs_commande_id_fkey" FOREIGN KEY (commande_id) REFERENCES public.commandes(id) ON DELETE CASCADE;

ALTER TABLE "public"."depenses"
  ADD CONSTRAINT "depenses_commande_id_fkey" FOREIGN KEY (commande_id) REFERENCES public.commandes(id) ON DELETE SET NULL;

ALTER TABLE "public"."commandes_livreurs"
  ADD CONSTRAINT "commandes_livreurs_livreur_id_fkey" FOREIGN KEY (livreur_id) REFERENCES public.livreurs(id);

ALTER TABLE "public"."profils"
  ADD CONSTRAINT "profils_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."commandes"
  ADD CONSTRAINT "commandes_cree_par_fkey" FOREIGN KEY (cree_par) REFERENCES public.profils(id);

ALTER TABLE "public"."depenses"
  ADD CONSTRAINT "depenses_cree_par_fkey" FOREIGN KEY (cree_par) REFERENCES public.profils(id);

ALTER TABLE "public"."historique_parametres"
  ADD CONSTRAINT "historique_parametres_modifie_par_fkey" FOREIGN KEY (modifie_par) REFERENCES public.profils(id);

ALTER TABLE "public"."parametres"
  ADD CONSTRAINT "parametres_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profils(id);

ALTER TABLE "public"."repartition_financiere"
  ADD CONSTRAINT "repartition_financiere_commande_id_fkey" FOREIGN KEY (commande_id) REFERENCES public.commandes(id) ON DELETE CASCADE;

ALTER TABLE "public"."commandes"
  ADD CONSTRAINT "commandes_service_id_fkey" FOREIGN KEY (service_id) REFERENCES public.services(id);

CREATE INDEX idx_commandes_date ON public.commandes USING btree (date_course);

CREATE INDEX idx_commandes_livreurs_livreur ON public.commandes_livreurs USING btree (livreur_id);

CREATE INDEX idx_commandes_service ON public.commandes USING btree (service_id);

CREATE INDEX idx_commandes_statut ON public.commandes USING btree (statut);

CREATE INDEX idx_depenses_categorie ON public.depenses USING btree (categorie);

CREATE INDEX idx_depenses_date ON public.depenses USING btree (date_depense);

CREATE INDEX idx_repartition_commande ON public.repartition_financiere USING btree (commande_id);

CREATE TRIGGER after_commande_upsert
  AFTER INSERT OR UPDATE OF prix_total, service_id, statut ON public.commandes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_calculer_repartition();

CREATE POLICY "admin_write_charges" ON "public"."charges_fixes"
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."charges_fixes"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."commandes"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_write_commandes" ON "public"."commandes"
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."commandes_livreurs"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_write_commandes_livreurs" ON "public"."commandes_livreurs"
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."depenses"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_write_depenses" ON "public"."depenses"
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."historique_parametres"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."livreurs"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "admin_write_parametres" ON "public"."parametres"
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."parametres"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."profils"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."repartition_financiere"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "write_repartition" ON "public"."repartition_financiere"
  FOR ALL
  TO PUBLIC
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_write_services" ON "public"."services"
  FOR ALL
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."services"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "auth_read_all" ON "public"."statistiques_mensuelles"
  FOR SELECT
  TO PUBLIC
  USING ((auth.role() = 'authenticated'::text));

COMMENT ON COLUMN "public"."depenses"."mois_imputation" IS 'Mois comptable d''imputation (si différent de date_depense). 
   Format : premier jour du mois, ex: 2026-02-01.
   NULL = on utilise date_depense pour déterminer le mois.';

COMMENT ON TABLE "public"."charges_fixes" IS 'Objectifs de charges fixes mensuelles. Sert au tableau de bord financier.';

COMMENT ON TABLE "public"."commandes" IS 'Chaque ligne = une course. Zone = quartier de livraison. Livreurs dans commandes_livreurs.';

COMMENT ON TABLE "public"."commandes_livreurs" IS 'Relation plusieurs-à-plusieurs. Une course peut avoir plusieurs livreurs.';

COMMENT ON TABLE "public"."depenses" IS 'Toutes les dépenses : flotte, communication, loyer, etc. Peut être liée à une commande.';

COMMENT ON TABLE "public"."historique_parametres" IS 'Audit trail de tous les changements de pourcentages de répartition.';

COMMENT ON TABLE "public"."livreurs" IS 'Liste des livreurs. Moïse et Dimitri en v1.';

COMMENT ON TABLE "public"."parametres" IS 'Paramètres globaux de l''application. Une seule ligne possible (id=1).';

COMMENT ON TABLE "public"."profils" IS 'Profils des opérateurs et admins. Lié à auth.users.';

COMMENT ON TABLE "public"."repartition_financiere" IS 'Snapshot de la répartition financière par commande. Recalculable si les paramètres changent.';

COMMENT ON TABLE "public"."services" IS 'Types de service. Peut avoir une répartition spécifique ou hériter des paramètres globaux.';

COMMENT ON TABLE "public"."statistiques_mensuelles" IS 'Agrégats pré-calculés par mois. Recalculer via fonction après toute modification.';

GRANT EXECUTE ON FUNCTION "public"."calculer_repartition"(uuid) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."calculer_repartition"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."calculer_repartition"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."calculer_repartition"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."recalculer_stats"(integer, integer) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."recalculer_stats"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."recalculer_stats"(integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."recalculer_stats"(integer, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."trigger_calculer_repartition"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."trigger_calculer_repartition"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trigger_calculer_repartition"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."trigger_calculer_repartition"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."charges_fixes" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."charges_fixes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."charges_fixes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."charges_fixes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commandes" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."commandes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commandes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commandes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commandes_livreurs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."commandes_livreurs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commandes_livreurs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."commandes_livreurs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."depenses" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."depenses" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."depenses" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."depenses" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."historique_parametres" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."historique_parametres" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."historique_parametres" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."historique_parametres" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."livreurs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."livreurs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."livreurs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."livreurs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."parametres" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."parametres" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."parametres" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."parametres" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profils" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profils" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profils" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profils" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."repartition_financiere" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."repartition_financiere" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."repartition_financiere" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."repartition_financiere" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."services" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."services" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."services" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."services" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."statistiques_mensuelles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."statistiques_mensuelles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."statistiques_mensuelles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."statistiques_mensuelles" TO "service_role";

