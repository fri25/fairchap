# Backend Supabase — FaiChap

`database/schema.sql` est le schéma **v1** (point de départ).
Les évolutions sont dans `en-attente/` (en attendant le `supabase db pull`, voir plus bas),
à appliquer **dans l'ordre** :

| Fichier | Contenu |
|---|---|
| `…130000_alignement_schema.sql` | colonnes `objectif_ca`, `solde_reporte`, `solde_cloture` ; contrainte des % de service corrigée ; prix ≥ 0 ; `updated_at` automatique |
| `…130100_securite_roles_rls.sql` | `est_actif()` / `est_admin()`, profil créé à l'inscription, RLS par rôle |
| `…130200_triggers_metier.sql` | répartition (SECURITY DEFINER, somme exacte, suppression si annulée), historique des %, `cree_par` forcé |
| `…130300_rpc.sql` | `creer_commande`, `modifier_commande`, `stats_periode`, `serie_periode`, `clients_stats` |
| `…20261031090000_acces_operateurs.sql` | cloisonnement : chaque opérateur ne voit que ses courses et dépenses ; `suggestions_saisie` (autocomplétion) |

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
2. *SQL Editor* → coller et exécuter chaque fichier de `en-attente/`, dans l'ordre des noms.
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

## Supabase CLI (`db pull`)

`supabase init` est déjà fait. Une fois connecté au **bon** compte (`npx supabase@2 login`) :

```bash
npx supabase@2 link --project-ref upbeyozsglyjryqpgray
npx supabase@2 db pull        # photo du schéma RÉEL → migrations/<date>_remote_schema.sql
```

Les fichiers de `en-attente/` seront ensuite renumérotés après ce point de départ, revérifiés
contre le schéma réel, puis déplacés dans `migrations/` pour être appliqués par `npx supabase@2 db push`.
