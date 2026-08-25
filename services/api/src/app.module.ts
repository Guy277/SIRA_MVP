import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { MobilityController } from "./mobility/mobility.controller";
import { MobilityService } from "./mobility/mobility.service";
import { ReportsController } from "./reports/reports.controller";
import { ReportsGateway } from "./reports/reports.gateway";
import { ReportsService } from "./reports/reports.service";

@Module({
  controllers: [HealthController, MobilityController, ReportsController],
  providers: [MobilityService, ReportsGateway, ReportsService],
})
export class AppModule {}
