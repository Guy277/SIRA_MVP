# 🚍 SIRA Backend API (FastAPI) - Mobilité Intelligente à Abidjan

Backend complet pour le projet **SIRA**, la plateforme de mobilité urbaine centralisant les transports formels (**SOTRA**) et informels (**Gbaka**, **Wôrô-wôrô**) à Abidjan.

---

## 📋 Fonctionnalités Clés

- **Authentification Téléphone OTP / JWT** : Connexion par numéro de téléphone Orange CI / code unique.
- **Cartographie & Réseau de Transport** : Gares, arrêts et lignes formelles et informelles d'Abidjan (Yopougon, Adjamé, Cocody, Plateau, Abobo, Koumassi...).
- **Moteur d'Itinéraires Multimodaux** : Calcul d'itinéraires combinant marche, Gbaka, Wôrô-wôrô et Bus SOTRA avec estimation du temps et du coût en FCFA.
- **Tarification Communautaire** : Consultation, proposition et validation croisée des tarifs par les usagers.
- **Signalements en Temps Réel** : Embouteillages, inondations saisonnières, accidents, avec calcul d'itinéraires alternatifs et pénalités de trafic.
- **Assistant Vocal & NLP** : Compréhension du langage naturel pour les recherches d'itinéraires et tarifs en contexte ivoirien.

---

## 🚀 Démarrage Rapide

### 1. Installation des dépendances
```bash
pip install -r requirements.txt
```

### 2. Initialiser la base de données avec les données d'Abidjan
```bash
python app/seed.py
```

### 3. Lancer le serveur Backend FastAPI
```bash
uvicorn app.main:app --reload --port 8000
```

---

## 📖 Documentation Interactive Swagger & ReDoc

Une fois le serveur lancé :
- **Swagger UI** : [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc** : [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

## 🧪 Lancement des Tests Automatisés
```bash
pytest
```
