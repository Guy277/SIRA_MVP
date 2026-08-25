import fs from 'node:fs';
import path from 'node:path';

const inputPath = path.resolve('data/raw/abidjantransport_lignes.geojson');
const outputPath = path.resolve('data/processed/transport-lines-normalized.geojson');

function normalizeFeature(feature) {
  const props = feature.properties ?? {};
  const mode = String(props.mode ?? 'UNKNOWN');
  const network = String(props.network ?? 'UNKNOWN');
  const operator = String(props.operator ?? 'UNKNOWN');
  const name = String(props.name ?? props.line_id ?? 'Ligne inconnue');
  const transportLabel = `${mode} ${network} ${operator} ${name}`;
  const normalizedMode = /(gbaka|woro[- ]?woro)/i.test(transportLabel)
    ? /(gbaka)/i.test(transportLabel)
      ? 'GBAKA'
      : 'WORO_WORO'
    : /(bateau|ferry|boat|monbato|aqualines|stl)/i.test(transportLabel)
      ? 'FERRY'
      : /(wibus)/i.test(transportLabel)
        ? 'WIBUS'
        : /(monbus|sotra|bus|autobus|express)/i.test(transportLabel)
    ? 'SOTRA_BUS'
        : /(taxi)/i.test(transportLabel)
          ? 'TAXI'
          : /(marche|walk)/i.test(transportLabel)
            ? 'WALK'
            : 'UNKNOWN';

  return {
    type: 'Feature',
    id: props.line_id ?? `${name}-${props.code ?? 'unknown'}`,
    geometry: feature.geometry,
    properties: {
      ...props,
      raw_mode: mode,
      raw_network: network,
      raw_operator: operator,
      sira_mode: normalizedMode,
      freshness_status: 'historical_open_data',
      validation_status: 'not_validated',
      confidence_score: normalizedMode === 'UNKNOWN' ? 0.2 : 0.67,
      normalized_name: name,
    },
  };
}

function runNormalization() {
  if (!fs.existsSync(inputPath)) {
    console.warn('Le fichier brut est absent. Ajoutez le GeoJSON dans data/raw/abidjantransport_lignes.geojson.');
    process.exitCode = 0;
    return;
  }

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const features = Array.isArray(input.features) ? input.features.map(normalizeFeature) : [];
  const output = {
    type: 'FeatureCollection',
    metadata: {
      source: 'data.gouv.ci / DigitalTransport4Africa',
      data_date: '2021-10-12',
      processed_at: new Date().toISOString(),
      is_historical: true,
      is_official_transport_data: false,
      normalization_version: 'phase1-v1',
      license: 'Licence Ouverte 2.0',
      note: 'The normalized form is derived from the original raw file and never modifies it directly.'
    },
    features,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Normalisation terminée : ${features.length} lignes exportées vers ${outputPath}`);
}

runNormalization();
