import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "socket.io";

@WebSocketGateway({ namespace: "/traffic", cors: { origin: process.env.CORS_ORIGIN?.split(",") ?? true } })
export class ReportsGateway {
  @WebSocketServer() server!: Server;
  broadcast(event: "traffic.report.created" | "traffic.report.updated", report: unknown) { this.server.emit(event, report); }
}
