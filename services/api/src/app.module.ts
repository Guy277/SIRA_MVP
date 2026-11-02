import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { MobilityController } from "./mobility/mobility.controller";
import { MobilityService } from "./mobility/mobility.service";
import { ReportsController } from "./reports/reports.controller";
import { ReportsGateway } from "./reports/reports.gateway";
import { ReportsService, reportsFile } from "./reports/reports.service";
import { TransportRepository } from "./mobility/transport.repository";
import { CommunityController } from "./community/community.controller";
import { Travellers } from "./community/travellers";
import { VoiceController } from "./voice/voice.controller";

@Module({
  controllers: [HealthController, MobilityController, ReportsController, CommunityController, VoiceController],
  providers: [
    MobilityService, TransportRepository, ReportsGateway, Travellers,
    // Reports survive a restart (file from SIRA_REPORTS_FILE, see reports.service.ts).
    { provide: ReportsService, useFactory: () => new ReportsService(reportsFile()) },
  ],
})
export class AppModule {}
