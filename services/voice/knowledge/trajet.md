# Questions sur le trajet en cours

<!-- Réponses calculées (app/trip.py) à partir du trajet suivi, de SIRA-MORE et des signalements des voyageurs.
     Sans trajet en cours, SIRA le dit et propose d'en chercher un. -->

## trajet.resume
? Où en est mon trajet ?
? C'est quoi mon trajet ?
? Rappelle-moi mon trajet
? Résume mon trajet
? On passe par où ?
action: trip_summary

## trajet.arrivee
? J'arrive à quelle heure ?
? Il me reste combien de temps ?
? Ça prend combien de temps ?
? C'est encore loin ?
? C'est loin ?
? Je vais arriver quand ?
action: trip_eta

## trajet.prix
? Ça fait combien ?
? Mon trajet coûte combien ?
? Je vais payer combien ?
? Je dois prévoir combien ?
action: trip_price

## trajet.arrets
? Je descends où ?
? Je monte où ?
? Je prends mon transport où ?
? Après ici je fais quoi ?
? Je fais quoi maintenant ?
action: trip_stops

## trajet.correspondance
? Je change où ?
? Il y a un changement ?
? Je dois changer de transport ?
? Où est la correspondance ?
action: trip_transfer

## trajet.incidents
? Il y a un problème sur mon trajet ?
? Il y a un problème sur ma route ?
? Y a drap sur mon trajet ?
? Y a des bouchons sur mon trajet ?
? Ça bouche sur ma route ?
? Il y a des accidents sur mon chemin ?
? Mon trajet est bloqué ?
? Ça roule sur mon trajet ?
action: trip_incidents
