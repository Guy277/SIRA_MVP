import { All, Controller, Req, Res } from "@nestjs/common";

// Only the Express members used here (avoids a dependency on @types/express).
type Request = { originalUrl: string; method: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type Response = { status(code: number): Response; type(value: string): Response; send(body: string): void; json(body: unknown): void };

// Accounts and community fares live in the community service (FastAPI);
// the app keeps a single base URL and this controller forwards to it.
const COMMUNITY_URL = (process.env.COMMUNITY_URL ?? "http://community:8100").replace(/\/$/, "");
const FORWARDED_HEADERS = ["authorization", "content-type", "accept-language"];

@Controller()
export class CommunityController {
  @All(["auth/*path", "users/*path", "fares", "fares/*path"])
  async forward(@Req() request: Request, @Res() response: Response) {
    const path = request.originalUrl.replace(/^\/api\/v1/, "");
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
