import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../components/SiraApp.tsx", import.meta.url), "utf8");
const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../scripts/start-dev-stack.mjs", import.meta.url), "utf8");

test("le téléphone utilise le proxy API du serveur frontend", () => {
  assert.match(app, /NEXT_PUBLIC_API_URL \?\? "\/api\/v1"/);
  assert.doesNotMatch(app, /http:\/\/localhost:4000\/api\/v1/);
  assert.match(vite, /"\/api"/);
  assert.match(vite, /http:\/\/127\.0\.0\.1:4000/);
  assert.doesNotMatch(launcher, /NEXT_PUBLIC_API_URL/);
});

test("une erreur de calcul reste visible sur l'écran", () => {
  assert.match(app, /setSearchStatus\(message\)/);
  assert.match(app, /search-status/);
});
