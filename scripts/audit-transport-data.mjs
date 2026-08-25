import fs from 'node:fs';
import path from 'node:path';

const rawPath = path.resolve('data/raw/abidjantransport_lignes.geojson');
const processedPath = path.resolve('data/processed/transport-lines-normalized.geojson');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runAudit() {
  const rawExists = fs.existsSync(rawPath);
  if (!rawExists) {
    console.warn('Aucune donnée brute détectée dans data/raw. Ajoutez le fichier abidjantransport_lignes.geojson pour lancer l\'audit.');
    console.warn('Script de secours: node scripts/download-transport-data.mjs');
    process.exitCode = 0;
    return;
  }

  const geojson = readJson(rawPath);
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const operators = new Map();
  const networks = new Map();
  const modes = new Map();
  let invalidGeometries = 0;
  let emptyLines = 0;
  let missingIds = 0;

  for (const feature of features) {
    const props = feature.properties ?? {};
    const operator = String(props.operator ?? 'UNKNOWN');
    const network = String(props.network ?? 'UNKNOWN');
    const mode = String(props.mode ?? 'UNKNOWN');
    const id = String(props.line_id ?? props.code ?? props.name ?? '');

    operators.set(operator, (operators.get(operator) ?? 0) + 1);
    networks.set(network, (networks.get(network) ?? 0) + 1);
    modes.set(mode, (modes.get(mode) ?? 0) + 1);

    if (!feature.geometry || feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') invalidGeometries += 1;
    if (!id || id === 'undefined') missingIds += 1;
    if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.coordinates.length === 0) emptyLines += 1;
  }

  const report = {
    total_records: features.length,
    valid_records: features.length - invalidGeometries,
    invalid_geometries: invalidGeometries,
    empty_lines: emptyLines,
    missing_identifiers: missingIds,
    operators: Object.fromEntries([...operators.entries()].sort((a, b) => b[1] - a[1])),
    networks: Object.fromEntries([...networks.entries()].sort((a, b) => b[1] - a[1])),
    modes: Object.fromEntries([...modes.entries()].sort((a, b) => b[1] - a[1])),
    processed_path: processedPath,
    raw_path: rawPath,
    warnings: [
      'Cette donnée est historique et date de 2021-10-12.',
      'Elle ne doit pas être présentée comme une donnée officielle actuelle.',
      'L’import PostGIS doit conserver la source originale non modifiée.'
    ]
  };

  fs.mkdirSync(path.dirname(processedPath), { recursive: true });
  fs.writeFileSync(path.resolve('data/metadata/transport-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

runAudit();
