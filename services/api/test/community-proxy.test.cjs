const test = require("node:test");
const assert = require("node:assert/strict");

const { CommunityController } = require("../dist/community/community.controller.js");

const response = () => {
  const sent = {};
  const res = {
    status(code) { sent.status = code; return res; },
    type(value) { sent.type = value; return res; },
    send(body) { sent.body = body; },
    json(body) { sent.json = body; },
  };
  return { res, sent };
};

test("le proxy transmet chemin, méthode, jeton et corps au service communautaire", async () => {
  const originalFetch = global.fetch;
  let call;
  global.fetch = async (url, init) => {
    call = { url, init };
    return { status: 201, headers: { get: () => "application/json" }, text: async () => '{"ok":true}' };
  };
  try {
    const { res, sent } = response();
    await new CommunityController().forward({
      originalUrl: "/api/v1/fares/reports", method: "POST",
      headers: { authorization: "Bearer abc", "content-type": "application/json", cookie: "ne-pas-transmettre" },
      body: { line_id: "l1", mode: "sotra", amount: 200 },
    }, res);
    assert.match(call.url, /\/fares\/reports$/);
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.authorization, "Bearer abc");
    assert.equal(call.init.headers.cookie, undefined);
    assert.deepEqual(JSON.parse(call.init.body), { line_id: "l1", mode: "sotra", amount: 200 });
    assert.equal(sent.status, 201);
    assert.equal(sent.body, '{"ok":true}');
  } finally {
    global.fetch = originalFetch;
  }
});

test("le proxy répond 503 quand le service communautaire est arrêté", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("ECONNREFUSED"); };
  try {
    const { res, sent } = response();
    await new CommunityController().forward({ originalUrl: "/api/v1/auth/me", method: "GET", headers: {} }, res);
    assert.equal(sent.status, 503);
    assert.match(sent.json.message, /comptes SIRA/);
  } finally {
    global.fetch = originalFetch;
  }
});
