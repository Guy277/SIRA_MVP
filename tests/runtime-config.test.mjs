import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../components/SiraApp.tsx", import.meta.url), "utf8");
const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../scripts/start-dev-stack.mjs", import.meta.url), "utf8");

test("les frontends locaux accèdent à l'API et Docker utilise le proxy", () => {
  assert.match(app, /const localFrontend = \["3000", "3001", "5173"\]\.includes\(window\.location\.port\)/);
  assert.match(app, /const localApiUrl = `\$\{window\.location\.protocol\}\/\/\$\{window\.location\.hostname\}:4000\/api\/v1`/);
  assert.match(app, /NEXT_PUBLIC_API_URL \?\? \(localFrontend \? localApiUrl : "\/api\/v1"\)/);
  assert.match(vite, /"\/api"/);
  assert.match(vite, /http:\/\/127\.0\.0\.1:4000/);
  assert.doesNotMatch(launcher, /NEXT_PUBLIC_API_URL/);
});

test("une erreur de calcul reste visible sur l'écran", () => {
  assert.match(app, /setSearchStatus\(message\)/);
  assert.match(app, /search-status/);
});
