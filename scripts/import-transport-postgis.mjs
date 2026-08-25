import fs from 'node:fs';
import path from 'node:path';

const rawPath = path.resolve('data/raw/abidjantransport_lignes.geojson');

if (!fs.existsSync(rawPath)) {
  console.warn('Aucun GeoJSON n\'a été trouvé dans data/raw. Le dépôt local reste en mode démarrage sans donnée réelle.');
  process.exit(0);
}

const geojson = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const features = Array.isArray(geojson.features) ? geojson.features : [];

console.log('Mode import PostGIS préparé.');
console.log(`Nombre de lignes détectées : ${features.length}`);
console.log('À l\'étape de production, ceci doit être converti vers des INSERT SQL avec SRID 4326 et les tables transport_lines / data_sources.');
