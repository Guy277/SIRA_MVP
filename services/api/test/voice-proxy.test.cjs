const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const { VoiceController } = require("../dist/voice/voice.controller.js");

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

const withFetch = async (fake, run) => {
  const originalFetch = global.fetch;
  global.fetch = fake;
  try { await run(); } finally { global.fetch = originalFetch; }
};

test("le proxy transmet une question texte (JSON) au service vocal", async () => {
  let call;
  await withFetch(async (url, init) => {
    call = { url, init };
    return { status: 200, headers: { get: () => "application/json" }, text: async () => '{"reply_text":"ok"}' };
  }, async () => {
    const { res, sent } = response();
    const request = Object.assign(Readable.from([]), {
      originalUrl: "/api/v1/voice/ask", method: "POST",
      headers: { "content-type": "application/json", cookie: "ne-pas-transmettre" },
      body: { text: "je vais au plateau" },
    });
    await new VoiceController().forward(request, res);
    assert.match(call.url, /\/voice\/ask$/);
    assert.deepEqual(JSON.parse(call.init.body), { text: "je vais au plateau" });
    assert.equal(call.init.headers.cookie, undefined);
    assert.equal(sent.status, 200);
    assert.equal(sent.body, '{"reply_text":"ok"}');
  });
});

test("le proxy relaie l'audio (multipart) sans le relire", async () => {
  let call;
  await withFetch(async (url, init) => {
    const chunks = [];
    for await (const chunk of init.body) chunks.push(Buffer.from(chunk));
    call = { url, init, body: Buffer.concat(chunks).toString() };
    return { status: 200, headers: { get: () => "application/json" }, text: async () => "{}" };
  }, async () => {
    const { res } = response();
    const request = Object.assign(Readable.from([Buffer.from("--b\r\naudio\r\n--b--")]), {
      originalUrl: "/api/v1/voice/query", method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=b" },
    });
    await new VoiceController().forward(request, res);
    assert.equal(call.init.duplex, "half");
    assert.equal(call.init.headers["content-type"], "multipart/form-data; boundary=b");
    assert.equal(call.body, "--b\r\naudio\r\n--b--");
  });
});

test("le proxy renvoie l'audio de synthèse en binaire", async () => {
  await withFetch(async () => ({
    status: 200, headers: { get: () => "audio/wav" }, arrayBuffer: async () => new Uint8Array([82, 73, 70, 70]).buffer,
  }), async () => {
    const { res, sent } = response();
    const request = Object.assign(Readable.from([]), { originalUrl: "/api/v1/voice/tts", method: "POST", headers: { "content-type": "application/json" }, body: { text: "Bonjour" } });
    await new VoiceController().forward(request, res);
    assert.equal(sent.type, "audio/wav");
    assert.ok(Buffer.isBuffer(sent.body));
    assert.equal(sent.body.toString(), "RIFF");
  });
});

test("le proxy répond 503 quand le service vocal est arrêté", async () => {
  await withFetch(async () => { throw new Error("ECONNREFUSED"); }, async () => {
    const { res, sent } = response();
    await new VoiceController().forward(Object.assign(Readable.from([]), { originalUrl: "/api/v1/voice/health", method: "GET", headers: {} }), res);
    assert.equal(sent.status, 503);
    assert.match(sent.json.message, /assistant vocal/);
  });
});
