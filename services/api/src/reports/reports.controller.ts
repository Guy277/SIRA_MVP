import { Body, Controller, Get, Post } from "@nestjs/common";
import { ReportsGateway } from "./reports.gateway";
import { ReportsService, type TrafficReport } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly realtime: ReportsGateway) {}
  @Get() list() { return this.reports.list(); }
  @Post() create(@Body() payload: Omit<TrafficReport, "id" | "createdAt">) {
    const report = this.reports.add(payload); this.realtime.broadcast(report); return report;
  }
}
