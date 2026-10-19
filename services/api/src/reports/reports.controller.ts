import { BadRequestException, Body, Controller, Get, Headers, HttpException, Param, Post } from "@nestjs/common";
import { Travellers } from "../community/travellers";
import { RateLimiter } from "../rate-limit";
import { ReportsGateway } from "./reports.gateway";
import { ReportsService, type CreateReportInput } from "./reports.service";

// Reading is open to everyone. Reporting and voting need an account (one Orange number each):
// a report changes other travellers' journeys once confirmed, so one person must count once.
const reportsPerTraveller = new RateLimiter(Number(process.env.SIRA_REPORTS_PER_HOUR ?? 10), 60 * 60_000);

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly realtime: ReportsGateway, private readonly travellers: Travellers) {}

  @Get() list() { return this.reports.list(); }

  @Post() async create(@Headers("authorization") authorization: string | undefined, @Body() payload: CreateReportInput) {
    const travellerId = await this.travellers.idFrom(authorization);
    if (!reportsPerTraveller.allow(travellerId)) throw new HttpException("Tu as déjà envoyé beaucoup de signalements. Réessaie plus tard.", 429);
    const report = this.reports.add(payload ?? {}, travellerId); this.realtime.broadcast("traffic.report.created", report); return report;
  }

  @Post("impact") impact(@Body() payload: { legs?: unknown }) {
    if (!Array.isArray(payload?.legs) || payload.legs.length > 50) throw new BadRequestException("Les étapes du trajet sont requises.");
    return this.reports.impact(payload.legs);
  }

  @Post(":id/confirm") confirm(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    return this.vote(authorization, id, "confirm");
  }

  @Post(":id/contest") contest(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    return this.vote(authorization, id, "contest");
  }

  private async vote(authorization: string | undefined, id: string, kind: "confirm" | "contest") {
    const report = this.reports.vote(id, await this.travellers.idFrom(authorization), kind);
    this.realtime.broadcast("traffic.report.updated", report); return report;
  }
}
