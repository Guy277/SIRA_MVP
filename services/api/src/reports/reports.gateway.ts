import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "socket.io";
import { corsOrigin } from "../cors";

// Same CORS rule as the HTTP API (src/cors.ts).
@WebSocketGateway({ namespace: "/traffic", cors: { origin: corsOrigin(), credentials: true } })
export class ReportsGateway {
  @WebSocketServer() server!: Server;
  broadcast(event: "traffic.report.created" | "traffic.report.updated", report: unknown) { this.server.emit(event, report); }
}
