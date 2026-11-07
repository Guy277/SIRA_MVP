# Copies de secours de l'API

`pharmacies-de-garde.json` : copie du tour de garde UNPPCI (format du dépôt
`zoumana84/pharmacie-de-garde-data`, champ `generatedAt` = date de la copie). L'API la lit seulement quand la
liste en ligne est injoignable ou ne couvre pas la semaine du jour. Elle couvre les semaines indiquées dans
`weeks` : la remplacer chaque mois par le nouveau fichier :

    curl -o services/api/secours/pharmacies-de-garde.json https://raw.githubusercontent.com/zoumana84/pharmacie-de-garde-data/main/garde.json
