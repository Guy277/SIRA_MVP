import { All, Controller, Req, Res } from "@nestjs/common";

// Only the Express members used here (avoids a dependency on @types/express).
type Request = AsyncIterable<Uint8Array> & {
  originalUrl: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type Response = {
  status(code: number): Response;
  type(value: string): Response;
  send(body: string | Buffer): void;
  json(body: unknown): void;
};

// The voice assistant (Whisper, CamemBERT fr-CI, Piper) lives in its own FastAPI service;
// the app keeps a single base URL and this controller forwards /api/v1/voice/* to it.
// Audio uploads (multipart) are streamed as-is; JSON bodies are re-serialised.
const VOICE_URL = (process.env.VOICE_URL ?? "http://voice:8200").replace(/\/$/, "");
const FORWARDED_HEADERS = ["authorization", "content-type", "accept-language"];
const VOICE_TIMEOUT_MS = Number(process.env.VOICE_TIMEOUT_MS ?? 120_000);

@Controller()
export class VoiceController {
  @All(["voice", "voice/*path"])
  async forward(@Req() request: Request, @Res() response: Response) {
    const path = request.originalUrl.replace(/^\/api\/v1/, "");
    const headers: Record<string, string> = {};
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    const contentType = headers["content-type"] ?? "";
    const init: RequestInit & { duplex?: "half" } = { method: request.method, headers, signal: AbortSignal.timeout(VOICE_TIMEOUT_MS) };
    if (!["GET", "HEAD"].includes(request.method)) {
      if (contentType.startsWith("application/json")) {
        init.body = JSON.stringify(request.body ?? {});
      } else {
        // multipart/form-data (audio): body not parsed by Nest, forwarded as a stream
        init.body = request as unknown as BodyInit;
        init.duplex = "half";
      }
    }
    try {
      const upstream = await fetch(`${VOICE_URL}${path}`, init);
      const type = upstream.headers.get("content-type") ?? "application/json";
      const payload = type.startsWith("audio/") ? Buffer.from(await upstream.arrayBuffer()) : await upstream.text();
      response.status(upstream.status).type(type).send(payload);
    } catch {
      response.status(503).json({ statusCode: 503, message: "L'assistant vocal SIRA est indisponible." });
    }
  }
}
