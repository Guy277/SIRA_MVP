from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base
import app.models  # Assure que tous les modèles SQLAlchemy sont chargés

# Création des tables dans la base de données
Base.metadata.create_all(bind=engine)

from app.routers import (
    auth_router,
    users_router,
    transport_router,
    fares_router,
    incidents_router,
    routing_router,
    voice_router,
)

app = FastAPI(
    title="SIRA Backend API",
    description="""
    ## 🚍 SIRA - Plateforme de Mobilité Intelligente à Abidjan
    
    API REST complète dédiée à l'intégration des transports formels (**SOTRA**) et informels (**Gbaka, Wôrô-wôrô**), avec :
    - 🔐 **Authentification OTP & JWT** (intégration Orange Côte d'Ivoire / Supabase)
    - 🗺️ **Moteur d'itinéraires multimodaux** & calcul de temps / coûts optimisés
    - 💰 **Tarification communautaire** avec score de confiance et validation croisée
    - ⚠️ **Signalements en temps réel** (bouchons, inondations, accidents) et alertes
    - 🎙️ **Assistant vocal & NLP** adapté au contexte ivoirien
    """,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route de santé
@app.get("/health", tags=["Système"], summary="Statut du serveur SIRA")
def health_check():
    return {
        "status": "OK",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": "active"
    }

# Inclusion des routeurs API v1
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(users_router, prefix=settings.API_V1_STR)
app.include_router(transport_router, prefix=settings.API_V1_STR)
app.include_router(fares_router, prefix=settings.API_V1_STR)
app.include_router(incidents_router, prefix=settings.API_V1_STR)
app.include_router(routing_router, prefix=settings.API_V1_STR)
app.include_router(voice_router, prefix=settings.API_V1_STR)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
