-- Lieux du quotidien (catégories de la carte : saveurs, pharmacies, Points Orange, marchés, écoles, lieux de culte, santé).
-- Rempli à partir de data/lieux/lieux.json, produit par scripts/import-lieux.mjs (fusion OSM, Overture, CSV de l'équipe).
-- En local, l'API lit directement ce fichier ; cette table sert au serveur (PostGIS), avec les mêmes champs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE lieu_categorie AS ENUM ('saveurs', 'pharmacie', 'point_orange', 'marche', 'ecole', 'mosquee', 'eglise', 'sante');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE lieu_statut AS ENUM ('valide', 'en_attente', 'retire');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS lieux (
  id text PRIMARY KEY,                         -- identifiant stable de l'import (l_ + empreinte de l'identifiant externe)
  nom text NOT NULL,
  nom_normalise text NOT NULL,                 -- minuscules, sans accents ni ponctuation
  categorie lieu_categorie NOT NULL,
  specialite text,                             -- sous-filtre de « Saveurs du coin » (garba, alloco…), d'après le nom
  geom geography(Point, 4326),                 -- nul pour un lieu sans coordonnées (en attente, jamais sur la carte)
  commune text,
  repere text,                                 -- carrefour, rond-point, bâtiment connu, adresse
  telephones text[] NOT NULL DEFAULT '{}',
  horaires jsonb,                              -- { "osm": "Mo-Sa 08:00-20:00" } tel que donné par la source
  prix_indicatif integer CHECK (prix_indicatif >= 0),  -- FCFA
  prix_maj_le date,
  photo_url text,                              -- seulement avec consentement_photo
  sources text[] NOT NULL,                     -- osm, hotosm, overture, foursquare, uvci, presse, equipe, utilisateur
  nb_sources integer NOT NULL CHECK (nb_sources >= 1),
  ids_externes jsonb NOT NULL DEFAULT '{}'::jsonb,
  confiance double precision CHECK (confiance >= 0 AND confiance <= 1),
  statut lieu_statut NOT NULL DEFAULT 'valide',
  consentement_vendeur boolean NOT NULL DEFAULT false,
  consentement_photo boolean NOT NULL DEFAULT false,
  sponsorise boolean NOT NULL DEFAULT false,   -- prévu pour plus tard : jamais utilisé pour classer, affiché à part
  derniere_confirmation timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (statut <> 'valide' OR geom IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lieux_geom_gix ON lieux USING gist (geom);
CREATE INDEX IF NOT EXISTS lieux_categorie_idx ON lieux (categorie, statut);
CREATE INDEX IF NOT EXISTS lieux_nom_trgm_idx ON lieux USING gin (nom_normalise gin_trgm_ops);

-- Réponses « Encore là ? » des voyageurs (un voyageur compte une fois par lieu et par jour, voir l'API).
CREATE TABLE IF NOT EXISTS lieux_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lieu_id text NOT NULL REFERENCES lieux(id) ON DELETE CASCADE,
  voyageur_id text NOT NULL,
  encore_la boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lieux_confirmations_lieu_idx ON lieux_confirmations (lieu_id, created_at DESC);
