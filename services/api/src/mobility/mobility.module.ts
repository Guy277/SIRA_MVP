import { Module } from "@nestjs/common";
import { MobilityController } from "./mobility.controller";
import { MobilityService } from "./mobility.service";
import { TransportRepository } from "./transport.repository";

// Calcul des trajets (graphe de transport, SIRA-MORE). Exporté pour que les autres modules (lieux)
// utilisent la même instance : un seul graphe en mémoire, un seul worker.
@Module({
  controllers: [MobilityController],
  providers: [MobilityService, TransportRepository],
  exports: [MobilityService],
})
export class MobilityModule {}
