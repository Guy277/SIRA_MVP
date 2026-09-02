const valhallaUrl = (process.env.VALHALLA_URL ?? "http://localhost:8002").replace(/\/$/, "");
const clientId = process.env.SIRA_ROUTING_CLIENT_ID ?? "github.com/Guy277/SIRA_MVP";
const publicDemo = valhallaUrl.includes("openstreetmap.de");

const cases = [
  {
    name: "Accès Marcory",
    origin: { lon: -3.9907, lat: 5.2979 },
    destination: { lon: -3.9899232, lat: 5.2975836 },
    maxDistanceM: 500,
    expected: "accepted",
  },
  {
    name: "Accès hors seuil",
    origin: { lon: -3.9263, lat: 5.2614 },
    destination: { lon: -3.9322433, lat: 5.2581706 },
    maxDistanceM: 200,
    expected: "rejected",
  },
  {
    name: "Correspondance Port-Bouët",
    origin: { lon: -3.9437766, lat: 5.2476366 },
    destination: { lon: -3.9438047, lat: 5.2468815 },
    maxDistanceM: 800,
    expected: "accepted",
  },
];

const route = async (testCase) => {
  const response = await fetch(`${valhallaUrl}/route`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Client-Id": clientId },
    body: JSON.stringify({
      locations: [testCase.origin, testCase.destination],
      costing: "pedestrian",
      costing_options: { pedestrian: { walking_speed: 4.5 } },
      units: "kilometers",
      language: "fr-FR",
      directions_options: { units: "kilometers" },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${testCase.name}: Valhalla HTTP ${response.status}`);
  const data = await response.json();
  const distanceM = Math.round((data.trip?.summary?.length ?? 0) * 1000);
  const durationMinutes = Math.max(1, Math.round((data.trip?.summary?.time ?? 0) / 60));
  const shape = data.trip?.legs?.[0]?.shape;
  const hasGeometry = typeof shape === "string" ? shape.length > 0 : Array.isArray(shape?.coordinates) && shape.coordinates.length > 1;
  const status = hasGeometry && distanceM <= testCase.maxDistanceM ? "accepted" : "rejected";
  return { Cas: testCase.name, "Distance OSM": `${distanceM} m`, Durée: `${durationMinutes} min`, Limite: `${testCase.maxDistanceM} m`, Résultat: status, Attendu: testCase.expected };
};

const results = [];
for (let index = 0; index < cases.length; index += 1) {
  results.push(await route(cases[index]));
  if (publicDemo && index < cases.length - 1) await new Promise((resolve) => setTimeout(resolve, 1200));
}

console.table(results);
const failures = results.filter((result) => result.Résultat !== result.Attendu);
if (failures.length) {
  console.error(`${failures.length} contrôle(s) Valhalla ne correspondent pas au résultat attendu.`);
  process.exitCode = 1;
} else {
  console.log(`Validation Valhalla réussie sur ${valhallaUrl}.`);
}
