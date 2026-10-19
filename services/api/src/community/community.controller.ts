import { All, Controller, Req, Res } from "@nestjs/common";
import { RateLimiter, clientIp } from "../rate-limit";

// Only the Express members used here (avoids a dependency on @types/express).
type Request = { originalUrl: string; method: string; headers: Record<string, string | string[] | undefined>; body?: unknown; socket?: { remoteAddress?: string } };
type Response = { status(code: number): Response; type(value: string): Response; send(body: string): void; json(body: unknown): void };

// Accounts and community fares live in the community service (FastAPI);
// the app keeps a single base URL and this controller forwards to it.
export const COMMUNITY_URL = (process.env.COMMUNITY_URL ?? "http://community:8100").replace(/\/$/, "");
const FORWARDED_HEADERS = ["authorization", "content-type", "accept-language"];
// Each code is a paid SMS. The community service limits codes per number; this limits them per
// connection, so one caller cannot have SMS sent to thousands of numbers. Kept generous because
// mobile operators put many travellers behind one address.
const OTP_WINDOW_MS = 10 * 60_000;
const otpRequests = new RateLimiter(Number(process.env.SIRA_OTP_REQUESTS_PER_IP ?? 20), OTP_WINDOW_MS);

@Controller()
export class CommunityController {
  @All(["auth/*path", "users/*path", "fares", "fares/*path"])
  async forward(@Req() request: Request, @Res() response: Response) {
    const path = request.originalUrl.replace(/^\/api\/v1/, "");
    if (request.method === "POST" && path.startsWith("/auth/request-otp") && !otpRequests.allow(clientIp(request))) {
      response.status(429).json({ statusCode: 429, message: "Trop de demandes de code depuis cette connexion. Réessaie dans quelques minutes." });
      return;
    }
    const headers: Record<string, string> = {};
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const hasBody = !["GET", "HEAD"].includes(request.method);
    try {
      const upstream = await fetch(`${COMMUNITY_URL}${path}`, {
        method: request.method,
        headers,
        body: hasBody ? JSON.stringify(request.body ?? {}) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await upstream.text();
      response.status(upstream.status).type(upstream.headers.get("content-type") ?? "application/json").send(payload);
    } catch {
      response.status(503).json({ statusCode: 503, message: "Le service des comptes SIRA est indisponible." });
    }
  }
}
