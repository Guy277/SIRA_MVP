import { Module } from "@nestjs/common";
import { Travellers } from "../community/travellers";
import { MobilityModule } from "../mobility/mobility.module";
import { MobilityService } from "../mobility/mobility.service";
import { ClassementService, lireMoments } from "./classement.service";
import { TrajetsLieux } from "./trajets-lieux";
import { PharmaciesDeGardeService, sourcePharmaciesDeGarde } from "./garde/pharmacies-de-garde.service";
import { SOURCE_PHARMACIES_DE_GARDE } from "./garde/source";
import { confirmationsFile, LieuxConfirmations } from "./lieux-confirmations";
import { LieuxController } from "./lieux.controller";
import { FichierLieuxRepository, LieuxRepository, lieuxFile } from "./lieux.repository";
import { LieuxService } from "./lieux.service";

// Lieux du quotidien (catégories de la carte) et pharmacies de garde. Les lieux viennent de
// data/lieux/lieux.json (npm run data:lieux) ; la source de garde de PHARMACIE_GARDE_SOURCE.
@Module({
  imports: [MobilityModule],
  controllers: [LieuxController],
  providers: [
    { provide: LieuxRepository, useFactory: () => new FichierLieuxRepository(lieuxFile()) },
    { provide: SOURCE_PHARMACIES_DE_GARDE, useFactory: () => sourcePharmaciesDeGarde() },
    // Réponses « Encore là ? » gardées dans services/api/runtime/ (SIRA_LIEUX_CONFIRMATIONS_FILE).
    { provide: LieuxConfirmations, useFactory: () => new LieuxConfirmations(confirmationsFile()) },
    PharmaciesDeGardeService,
    LieuxService,
    Travellers,
    // Trajets vers les lieux de la liste : même moteur que les itinéraires (MobilityModule).
    { provide: TrajetsLieux, useFactory: (mobility: MobilityService) => new TrajetsLieux(mobility), inject: [MobilityService] },
    { provide: "MOMENTS_SAVEURS", useFactory: () => lireMoments() },
    ClassementService,
  ],
  exports: [LieuxRepository, LieuxService, PharmaciesDeGardeService],
})
export class LieuxModule {}
