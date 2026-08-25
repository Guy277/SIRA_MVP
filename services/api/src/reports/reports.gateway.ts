import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "socket.io";

@WebSocketGateway({ namespace: "/traffic", cors: { origin: "*" } })
export class ReportsGateway {
  @WebSocketServer() server!: Server;
  broadcast(report: unknown) { this.server.emit("traffic.report.created", report); }
}
