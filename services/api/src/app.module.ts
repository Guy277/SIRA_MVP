import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { MobilityModule } from "./mobility/mobility.module";
import { ReportsController } from "./reports/reports.controller";
import { ReportsGateway } from "./reports/reports.gateway";
import { ReportsService, reportsFile } from "./reports/reports.service";
import { CommunityController } from "./community/community.controller";
import { Travellers } from "./community/travellers";
import { VoiceController } from "./voice/voice.controller";
import { LieuxModule } from "./lieux/lieux.module";

@Module({
  imports: [MobilityModule, LieuxModule],
  controllers: [HealthController, ReportsController, CommunityController, VoiceController],
  providers: [
    ReportsGateway, Travellers,
    // Reports survive a restart (file from SIRA_REPORTS_FILE, see reports.service.ts).
    { provide: ReportsService, useFactory: () => new ReportsService(reportsFile()) },
  ],
})
export class AppModule {}
