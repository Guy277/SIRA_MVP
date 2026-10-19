// Sliding-window counter kept in memory (one API process). Used where one caller
// could cost money or drown the others: SMS codes, community reports.
import { isPrivateHost } from "./cors";

const MAX_KEYS = 10_000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > MAX_KEYS) this.prune(now);
    return true;
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (now - times[times.length - 1] >= this.windowMs) this.hits.delete(key);
    }
    if (this.hits.size > MAX_KEYS) this.hits.clear();
  }
}

type RequestLike = { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } };

// The caller's address. X-Real-IP is only believed when the request comes from
// our own proxy (Nginx on the private network, infra/nginx/nginx.conf): sent by
// anyone else, it would let a caller pick a new address for every request.
export function clientIp(request: RequestLike): string {
  const peer = (request.socket?.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
  const forwarded = request.headers["x-real-ip"];
  const fromProxy = peer === "::1" || isPrivateHost(peer);
  return typeof forwarded === "string" && forwarded.trim() && fromProxy ? forwarded.trim() : peer;
}
