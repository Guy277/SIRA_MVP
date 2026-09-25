import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ReportsGateway } from "./reports.gateway";
import { ReportsService, type CreateReportInput } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly realtime: ReportsGateway) {}

  @Get() list() { return this.reports.list(); }

  @Post() create(@Body() payload: CreateReportInput) {
    const report = this.reports.add(payload ?? {}); this.realtime.broadcast("traffic.report.created", report); return report;
  }

  @Post("impact") impact(@Body() payload: { legs?: unknown }) {
    if (!Array.isArray(payload?.legs) || payload.legs.length > 50) throw new BadRequestException("Les étapes du trajet sont requises.");
    return this.reports.impact(payload.legs);
  }

  @Post(":id/confirm") confirm(@Param("id") id: string, @Body() payload: { clientId?: unknown }) {
    const report = this.reports.vote(id, payload?.clientId, "confirm"); this.realtime.broadcast("traffic.report.updated", report); return report;
  }

  @Post(":id/contest") contest(@Param("id") id: string, @Body() payload: { clientId?: unknown }) {
    const report = this.reports.vote(id, payload?.clientId, "contest"); this.realtime.broadcast("traffic.report.updated", report); return report;
  }
}
