// One CORS rule for the HTTP API (main.ts) and Socket.IO (reports.gateway.ts).
//
// - Origins listed in CORS_ORIGIN (comma separated) are always accepted.
// - In development (SIRA_ENV missing or "development"), the Expo web app opened
//   from a phone on the same Wi-Fi is accepted too: http(s)://<host>:8081 or :8082
//   when <host> is localhost, 127.x or a private IPv4 (10.x, 172.16-31.x, 192.168.x),
//   and the https://*.trycloudflare.com test tunnels (npm run dev:tunnel).
// - In production, only CORS_ORIGIN: an empty list refuses every browser origin.
// - Requests without an Origin header (Expo Go on a phone, curl, the voice
//   service) are not browser cross-origin requests: always accepted.

type Env = Record<string, string | undefined>;
export type OriginCallback = (error: Error | null, allow?: boolean) => void;

const DEV_APP_PORTS = new Set(["8081", "8082"]);

export const isDevelopment = (env: Env = process.env) => {
  const mode = env.SIRA_ENV?.trim().toLowerCase();
  return !mode || mode === "development";
};

export const listedOrigins = (env: Env = process.env) =>
  (env.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim().replace(/\/$/, "")).filter(Boolean);

const isPrivateHost = (host: string) =>
  host === "localhost"
  || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
  || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);

export function isAllowedOrigin(origin: string | undefined, env: Env = process.env): boolean {
  if (!origin) return true;
  if (listedOrigins(env).includes(origin.replace(/\/$/, ""))) return true;
  if (!isDevelopment(env)) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol === "https:" && url.hostname.endsWith(".trycloudflare.com")) return true;
  return (url.protocol === "http:" || url.protocol === "https:") && DEV_APP_PORTS.has(url.port) && isPrivateHost(url.hostname);
}

// For app.enableCors({ origin }) and @WebSocketGateway({ cors: { origin } }).
export const corsOrigin = (env: Env = process.env) =>
  (origin: string | undefined, callback: OriginCallback) => callback(null, isAllowedOrigin(origin, env));

// Said once at start-up, so a refused browser is not a mystery.
export function corsStartupNotice(env: Env = process.env): string | null {
  if (isDevelopment(env)) return null;
  return listedOrigins(env).length
    ? null
    : "[CORS] SIRA_ENV=production et CORS_ORIGIN vide : toutes les origines navigateur sont refusées. Renseigne CORS_ORIGIN (ex. https://app.sira.ci).";
}
