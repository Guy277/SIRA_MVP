require("reflect-metadata");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Controller, Get, Module } = require("@nestjs/common");
const { NestFactory } = require("@nestjs/core");

const { corsOrigin, corsStartupNotice, isAllowedOrigin } = require("../dist/cors.js");
const { ReportsGateway } = require("../dist/reports/reports.gateway.js");

const DEV = { CORS_ORIGIN: "http://localhost:8081,http://localhost:8080" };
const PROD = { SIRA_ENV: "production", CORS_ORIGIN: "https://app.sira.ci" };

test("CORS : l'appli sur le PC (localhost) est acceptée", () => {
  assert.equal(isAllowedOrigin("http://localhost:8081", DEV), true);
  assert.equal(isAllowedOrigin("http://localhost:8080", DEV), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:8081", {}), true);
});

test("CORS : en développement, le téléphone sur le même Wi-Fi est accepté (IP privée, port Expo)", () => {
  for (const origin of ["http://192.168.1.50:8081", "http://192.168.252.134:8081", "http://10.0.0.7:8082", "http://172.20.10.2:8081", "https://192.168.1.50:8081"]) {
    assert.equal(isAllowedOrigin(origin, DEV), true, origin);
  }
  // Another port than the Expo app, or a public address: refused.
  assert.equal(isAllowedOrigin("http://192.168.1.50:3000", DEV), false);
  assert.equal(isAllowedOrigin("http://8.8.8.8:8081", DEV), false);
  assert.equal(isAllowedOrigin("http://172.32.0.1:8081", DEV), false);
  assert.equal(isAllowedOrigin("http://sira.example.com:8081", DEV), false);
  assert.equal(isAllowedOrigin("null", DEV), false);
});

test("CORS : en développement, les tunnels de test trycloudflare (HTTPS) sont acceptés", () => {
  assert.equal(isAllowedOrigin("https://blue-sky-1234.trycloudflare.com", DEV), true);
  assert.equal(isAllowedOrigin("http://blue-sky-1234.trycloudflare.com", DEV), false);
  assert.equal(isAllowedOrigin("https://trycloudflare.com.evil.example", DEV), false);
});

test("CORS : en production, seule la liste CORS_ORIGIN passe ; liste vide = tout refusé", () => {
  assert.equal(isAllowedOrigin("https://app.sira.ci", PROD), true);
  assert.equal(isAllowedOrigin("http://192.168.1.50:8081", PROD), false);
  assert.equal(isAllowedOrigin("https://blue-sky-1234.trycloudflare.com", PROD), false);
  assert.equal(isAllowedOrigin("http://localhost:8081", { SIRA_ENV: "production" }), false);
  assert.match(corsStartupNotice({ SIRA_ENV: "production" }), /toutes les origines navigateur sont refusées/);
  assert.equal(corsStartupNotice(PROD), null);
  assert.equal(corsStartupNotice(DEV), null);
});

test("CORS : sans en-tête Origin (Expo Go natif, curl, service vocal), la requête passe", () => {
  assert.equal(isAllowedOrigin(undefined, DEV), true);
  assert.equal(isAllowedOrigin(undefined, { SIRA_ENV: "production" }), true);
});

// A real Nest app: the HTTP API and Socket.IO answer with the same rule.
// (decorators applied by hand: plain Node has no decorator syntax)
class HealthController {
  health() { return { status: "ok" }; }
}
Get()(HealthController.prototype, "health", Object.getOwnPropertyDescriptor(HealthController.prototype, "health"));
Controller("health")(HealthController);

const startApp = async () => {
  class TestModule {}
  Module({ controllers: [HealthController], providers: [ReportsGateway] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.enableCors({ origin: corsOrigin(), credentials: true });
  await app.listen(0, "127.0.0.1");
  return { app, base: await app.getUrl() };
};

const allowOrigin = async (url, origin) => (await fetch(url, { headers: { origin } })).headers.get("access-control-allow-origin");

test("CORS : l'API HTTP et Socket.IO suivent la même règle (développement puis production)", async () => {
  const saved = { SIRA_ENV: process.env.SIRA_ENV, CORS_ORIGIN: process.env.CORS_ORIGIN };
  const { app, base } = await startApp();
  const socket = `${base}/socket.io/?EIO=4&transport=polling`;
  try {
    Object.assign(process.env, { SIRA_ENV: "development", CORS_ORIGIN: "http://localhost:8081" });
    for (const url of [`${base}/health`, socket]) {
      assert.equal(await allowOrigin(url, "http://192.168.1.50:8081"), "http://192.168.1.50:8081", url);
      assert.equal(await allowOrigin(url, "http://8.8.8.8:8081"), null, url);
    }
    process.env.SIRA_ENV = "production";
    process.env.CORS_ORIGIN = "";
    for (const url of [`${base}/health`, socket]) {
      assert.equal(await allowOrigin(url, "http://192.168.1.50:8081"), null, url);
      assert.equal(await allowOrigin(url, "http://localhost:8081"), null, url);
    }
  } finally {
    await app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
