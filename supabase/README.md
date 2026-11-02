# Backend Supabase — FaiChap

`database/schema.sql` est le schéma **v1** (point de départ).
`migrations/20261102010145_remote_schema.sql` est la photo du schéma réel de production
(`db pull` du 2 novembre 2026). Les évolutions suivent dans `migrations/`, à appliquer **dans l'ordre** :

| Fichier | Contenu |
|---|---|
| `…020000_alignement_schema.sql` | colonnes `objectif_ca`, `solde_reporte`, `solde_cloture` ; contrainte des % de service corrigée ; prix ≥ 0 ; `updated_at` automatique |
| `…020001_securite_roles_rls.sql` | `est_actif()` / `est_admin()`, profil créé à l'inscription, RLS par rôle |
| `…020002_triggers_metier.sql` | répartition (SECURITY DEFINER, somme exacte, suppression si annulée), historique des %, `cree_par` forcé |
| `…020003_rpc.sql` | `creer_commande`, `modifier_commande`, `stats_periode`, `serie_periode`, `clients_stats` |
| `…020004_acces_operateurs.sql` | cloisonnement : chaque opérateur ne voit que ses courses et dépenses ; `suggestions_saisie` (autocomplétion) |

Les migrations sont idempotentes : elles peuvent être rejouées sans erreur.

> ⚠️ **Ordre de déploiement** : le front actuel appelle ces fonctions (`creer_commande`,
> `stats_periode`, `suggestions_saisie`…). Appliquer **toutes les migrations avant** de mettre
> le nouveau front en ligne, sinon le dashboard affichera des erreurs serveur.

## Qui peut faire quoi

| | Admin | Opérateur actif | Compte inactif / sans profil | Non connecté |
|---|---|---|---|---|
| Courses, dépenses | toutes | **les siennes uniquement** (`cree_par`) | ✘ | ✘ |
| Livreurs, services, paramètres | lecture + écriture | lecture (formulaires) | ✘ | ✘ |
| Charges, statistiques, historique, équipe | ✔ | ✘ | ✘ | ✘ |
| Suggestions de saisie (noms, téléphones, lieux) | ✔ | ✔ (tous clients, sans montants) | ✘ | ✘ |
| Répartition, historique | calculés par la base uniquement | | | |

Les statistiques (`stats_periode`, `serie_periode`, `clients_stats`) s'exécutent avec les droits
de l'appelant : un opérateur n'obtient que les chiffres de ses propres courses.

**Solde** : `solde_cloture = solde_reporte + CA − dépenses` de la période ; le solde de clôture
d'un mois est le solde reporté du mois suivant (cumul depuis le début = caisse théorique).
Il est recalculé à chaque appel : aucune clôture à lancer, une correction passée se répercute partout.

## Appliquer en production

1. **Sauvegarder** : Dashboard Supabase → *Database → Backups*, ou un export SQL.
2. `npx supabase@2 db push --linked` (vérifier avant avec `--dry-run`).
3. Vérifier qu'au moins un admin existe et l'activer si besoin :
   ```sql
   update public.profils set role = 'admin', actif = true
   where id = (select id from auth.users where email = 'ton-email@exemple.com');
   ```
4. Les comptes **qui existaient sans profil** ont été créés **inactifs**. Les lister et activer les légitimes :
   ```sql
   select u.email, p.nom, p.role, p.actif
   from public.profils p join auth.users u on u.id = p.id
   order by p.actif, u.email;

   update public.profils set actif = true
   where id = (select id from auth.users where email = 'operateur@exemple.com');
   ```
5. *Authentication → Sign In / Providers* : **désactiver les inscriptions publiques** (accès sur invitation).
   Un nouvel utilisateur invité reçoit automatiquement un profil `operateur` actif.

6. Mettre en ligne le nouveau front (`dashboard.html`, `assets/`).

## Supabase CLI

`supabase init` et `link` sont faits (`--project-ref upbeyozsglyjryqpgray`).

```bash
npx supabase@2 migration list --linked     # état local / production
npx supabase@2 db push --linked --dry-run  # ce qui serait appliqué
npx supabase@2 db push --linked            # appliquer
```

Toute nouvelle évolution : `npx supabase@2 migration new <nom>`, jamais de modification directe
dans le SQL Editor (sinon refaire un `db pull`).
