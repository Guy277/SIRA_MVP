// npm run lieux:prechauffer [-- --api=http://localhost:4000/api/v1] [-- --lat=5.4410 --lng=-4.0090] :
// calcule à l'avance les trajets de la liste « Autour de moi », « Saveurs du coin » et « Pharmacies de garde »
// depuis la position de démo, pour que la liste s'affiche tout de suite pendant la présentation.
// À lancer juste avant la démo : l'API garde ces trajets SIRA_LIEUX_CACHE_TRAJETS_MIN minutes (10 par défaut).
const arg = (nom, defaut) => process.argv.find((a) => a.startsWith(`--${nom}=`))?.split("=")[1] ?? defaut;
const api = arg("api", "http://localhost:4000/api/v1");
const position = `lat=${arg("lat", "5.4410")}&lng=${arg("lng", "-4.0090")}`;
const recherches = ["categorie=autour", "categorie=saveurs", "categorie=pharmacie&garde=true", "categorie=pharmacie"];

for (const recherche of recherches) {
  for (let essai = 1; essai <= 5; essai += 1) {
    const debut = Date.now();
    const response = await fetch(`${api}/lieux/classement?${position}&${recherche}`);
    if (!response.ok) throw new Error(`${recherche} : HTTP ${response.status} ${await response.text()}`);
    const reponse = await response.json();
    const prets = reponse.lieux.filter((lieu) => lieu.etat !== "en_cours").length;
    console.log(`[prechauffer] ${recherche} : ${prets}/${reponse.lieux.length} trajets prêts (${((Date.now() - debut) / 1000).toFixed(1)} s)`);
    if (reponse.complet) break;
  }
}
