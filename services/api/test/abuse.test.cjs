const test = require("node:test");
const assert = require("node:assert/strict");

const { RateLimiter, clientIp } = require("../dist/rate-limit.js");
const { Travellers } = require("../dist/community/travellers.js");
const { CommunityController } = require("../dist/community/community.controller.js");
const { ReportsController } = require("../dist/reports/reports.controller.js");
const { ReportsService } = require("../dist/reports/reports.service.js");

const withFetch = async (fake, run) => {
  const original = global.fetch;
  global.fetch = fake;
  try { return await run(); } finally { global.fetch = original; }
};

test("le limiteur laisse passer le quota puis refuse, et rouvre après la fenêtre", () => {
  const limiter = new RateLimiter(2, 1000);
  assert.deepEqual([limiter.allow("a", 0), limiter.allow("a", 10), limiter.allow("a", 20)], [true, true, false]);
  assert.equal(limiter.allow("b", 20), true);
  assert.equal(limiter.allow("a", 1005), true);
});

test("X-Real-IP n'est cru que venant du proxy interne", () => {
  assert.equal(clientIp({ headers: { "x-real-ip": "41.66.1.2" }, socket: { remoteAddress: "::ffff:10.89.0.4" } }), "41.66.1.2");
  assert.equal(clientIp({ headers: { "x-real-ip": "1.2.3.4" }, socket: { remoteAddress: "41.66.1.2" } }), "41.66.1.2");
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: "::ffff:192.168.1.20" } }), "192.168.1.20");
});

test("les demandes de code SMS sont limitées par connexion, pas les autres routes", async () => {
  let forwarded = 0;
  await withFetch(async () => { forwarded += 1; return { status: 200, headers: { get: () => "application/json" }, text: async () => "{}" }; }, async () => {
    const call = async (originalUrl, method = "POST") => {
      const sent = {};
      const res = { status(code) { sent.status = code; return res; }, type() { return res; }, send() {}, json(body) { sent.json = body; } };
      await new CommunityController().forward({ originalUrl, method, headers: {}, body: {}, socket: { remoteAddress: "41.66.9.9" } }, res);
      return sent;
    };
    const statuses = [];
    for (let index = 0; index < 21; index += 1) statuses.push((await call("/api/v1/auth/request-otp")).status);
    assert.deepEqual(statuses.slice(0, 20), Array(20).fill(200));
    assert.equal(statuses[20], 429);
    assert.equal(forwarded, 20);
    assert.equal((await call("/api/v1/auth/verify-otp")).status, 200);
  });
});

test("le compte derrière un jeton vient du service des comptes", async () => {
  const travellers = new Travellers();
  await assert.rejects(travellers.idFrom(undefined), /Connecte-toi/);
  await withFetch(async (url, init) => {
    assert.match(String(url), /\/auth\/me$/);
    return init.headers.authorization === "Bearer bon"
      ? { status: 200, ok: true, json: async () => ({ id: "compte-1" }) }
      : { status: 401, ok: false, json: async () => ({}) };
  }, async () => {
    assert.equal(await travellers.idFrom("Bearer bon"), "compte-1");
    await assert.rejects(travellers.idFrom("Bearer faux"), /Session expirée/);
  });
  await withFetch(async () => { throw new Error("ECONNREFUSED"); }, () => assert.rejects(travellers.idFrom("Bearer bon"), /indisponible/));
});

test("signaler et voter demandent un compte ; un identifiant choisi par l'appelant ne compte plus", async () => {
  const events = [];
  const travellers = { idFrom: async (authorization) => { if (!authorization) throw new Error("Connecte-toi"); return authorization.replace("Bearer ", ""); } };
  const controller = new ReportsController(new ReportsService(), { broadcast: (event) => events.push(event) }, travellers);
  const body = { type: "blocked", lat: 5.3196, lon: -4.0201, location: "Plateau", clientId: "faux-client-01" };
  await assert.rejects(controller.create(undefined, body), /Connecte-toi/);
  const report = await controller.create("Bearer awa", body);
  await assert.rejects(controller.confirm(undefined, report.id), /Connecte-toi/);
  // The author cannot confirm their own report, whatever clientId they send.
  await assert.rejects(controller.confirm("Bearer awa", report.id), /déjà donné ton avis/);
  assert.equal((await controller.confirm("Bearer koffi", report.id)).status, "confirmed");
  await assert.rejects(controller.confirm("Bearer koffi", report.id), /déjà donné ton avis/);
  assert.deepEqual(events, ["traffic.report.created", "traffic.report.updated"]);
});

test("un compte ne peut pas inonder la carte de signalements", async () => {
  const controller = new ReportsController(new ReportsService(), { broadcast() {} }, { idFrom: async () => "compte-bavard" });
  const body = { type: "traffic", lat: 5.3196, lon: -4.0201 };
  for (let index = 0; index < 10; index += 1) await controller.create("Bearer x", body);
  await assert.rejects(controller.create("Bearer x", body), /beaucoup de signalements/);
});
