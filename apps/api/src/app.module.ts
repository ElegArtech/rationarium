import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module.js";
import { CommunModule } from "./commun/commun.module.js";
import { GardePermission } from "./commun/permissions.garde.js";
import { FiltreErreurs } from "./commun/http.js";
import { OrganisationModule } from "./organisation/organisation.module.js";
import { UtilisateursModule } from "./utilisateurs/utilisateurs.module.js";
import { AdministrationModule } from "./administration/administration.module.js";
import { ParametrageModule } from "./parametrage/parametrage.module.js";
import { ProjetsModule } from "./projets/projets.module.js";
import { TachesModule } from "./taches/taches.module.js";
import { CongesModule } from "./conges/conges.module.js";
import { TeletravailModule } from "./teletravail/teletravail.module.js";
import { EvenementsModule } from "./evenements/evenements.module.js";
import { ActiviteModule } from "./activite/activite.module.js";
import { PlanningModule } from "./planning/planning.module.js";
import { TableauModule } from "./tableau/tableau.module.js";
import { RapportsModule } from "./rapports/rapports.module.js";
import { TempsModule } from "./temps/temps.module.js";
import { DocumentsModule } from "./documents/documents.module.js";
import { CompetencesModule } from "./competences/competences.module.js";
import { TiersModule } from "./tiers/tiers.module.js";

/**
 * L'assemblage du serveur.
 *
 * **La garde de permission est globale, pas locale.** C'est le point de ce
 * fichier : une garde posée contrôleur par contrôleur laisse le prochain
 * contrôleur écrit sans elle — et un point d'entrée sans garde est ouvert à
 * tous, en silence. Globale, l'oubli devient impossible ; l'exception est
 * marquée `@Public()`, donc visible en relecture (`RG-DROITS-03`).
 *
 * Le filtre d'erreurs suit la même logique : traduire les échecs métier au
 * niveau global évite qu'une règle parfaitement implémentée remonte en 500
 * parce qu'un `try/catch` manque.
 */
@Module({
  imports: [
    CommunModule,
    AuthModule,
    OrganisationModule,
    UtilisateursModule,
    AdministrationModule,
    ParametrageModule,
    ProjetsModule,
    TachesModule,
    CongesModule,
    TeletravailModule,
    EvenementsModule,
    ActiviteModule,
    PlanningModule,
    TableauModule,
    RapportsModule,
    TempsModule,
    DocumentsModule,
    CompetencesModule,
    TiersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: GardePermission },
    { provide: APP_FILTER, useClass: FiltreErreurs },
  ],
})
export class AppModule {}
