-- ====================================================================
-- SIRA - Base de Données Supabase & PostgreSQL (Mobilité Abidjan)
-- Plateforme Multimodale : SOTRA, Gbaka, Wôrô-wôrô
-- Projet Supabase : https://kmfukfzsdvkjskztrhzb.supabase.co
-- ====================================================================

-- 1. Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Table des Utilisateurs
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(30) UNIQUE NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(30) DEFAULT 'WORKER',
    preferred_language VARCHAR(10) DEFAULT 'fr',
    avatar_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table des Codes OTP (Orange CI / SMS)
CREATE TABLE IF NOT EXISTS public.otp_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(30) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table des Gares & Arrêts (Formels & Informels)
CREATE TABLE IF NOT EXISTS public.stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    commune VARCHAR(60) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
    is_informal BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Table des Lignes de Transport
CREATE TABLE IF NOT EXISTS public.lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(30),
    name VARCHAR(150) NOT NULL,
    type VARCHAR(30) NOT NULL,
    operator VARCHAR(100),
    is_informal BOOLEAN DEFAULT FALSE,
    color_code VARCHAR(20) DEFAULT '#FF8C00',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Table des Arrêts par Ligne (Séquence ordonnée)
CREATE TABLE IF NOT EXISTS public.line_stops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    line_id UUID NOT NULL REFERENCES public.lines(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    stop_order INT NOT NULL,
    distance_to_next_km DOUBLE PRECISION DEFAULT 0.0,
    estimated_time_to_next_min INT DEFAULT 5,
    CONSTRAINT unique_line_stop_order UNIQUE (line_id, stop_order)
);

-- 7. Table des Tarifs Communautaires
CREATE TABLE IF NOT EXISTS public.fares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    line_id UUID REFERENCES public.lines(id) ON DELETE SET NULL,
    origin_station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    destination_station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    amount DOUBLE PRECISION NOT NULL,
    is_community_validated BOOLEAN DEFAULT FALSE,
    confirmation_score INT DEFAULT 1,
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Table des Propositions / Corrections de Tarifs
CREATE TABLE IF NOT EXISTS public.fare_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fare_id UUID NOT NULL REFERENCES public.fares(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    proposed_amount DOUBLE PRECISION NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Table des Signalements d'Incidents en Direct
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(40) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
    commune VARCHAR(60),
    severity VARCHAR(20) DEFAULT 'MEDIUM',
    status VARCHAR(20) DEFAULT 'REPORTED',
    upvotes INT DEFAULT 1,
    downvotes INT DEFAULT 0,
    reported_by_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Table des Votes de Validation Croisée d'Incidents
CREATE TABLE IF NOT EXISTS public.incident_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    is_helpful INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_incident_user_vote UNIQUE (incident_id, user_id)
);

-- 11. Table des Historiques de Trajets
CREATE TABLE IF NOT EXISTS public.trip_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    origin_name VARCHAR(150) NOT NULL,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    destination_name VARCHAR(150) NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lng DOUBLE PRECISION NOT NULL,
    preferred_mode VARCHAR(30),
    estimated_fare DOUBLE PRECISION,
    duration_min INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- INDEX GÉOSPATIAUX & PERFORMANCES (POSTGIS)
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_stations_commune ON public.stations(commune);
CREATE INDEX IF NOT EXISTS idx_stations_geom ON public.stations USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_incidents_geom ON public.incidents USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_incidents_active ON public.incidents(expires_at, status);
CREATE INDEX IF NOT EXISTS idx_line_stops_lookup ON public.line_stops(line_id, station_id);
CREATE INDEX IF NOT EXISTS idx_fares_lookup ON public.fares(origin_station_id, destination_station_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) SUR SUPABASE
-- ====================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fare_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Lecture publique des gares" ON public.stations FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Lecture publique des lignes" ON public.lines FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Lecture publique des arrêts de lignes" ON public.line_stops FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Lecture publique des tarifs" ON public.fares FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Lecture publique des incidents actifs" ON public.incidents FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Création de signalements" ON public.incidents FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Vote sur les signalements" ON public.incident_votes FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Proposition de tarifs" ON public.fare_proposals FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ====================================================================
-- JEU DE DONNÉES D'ABIDJAN (SEED INITIAL)
-- ====================================================================
INSERT INTO public.stations (id, name, commune, latitude, longitude, is_informal, description) VALUES
('a0000001-0000-0000-0000-000000000001', 'Yopougon Siporex', 'Yopougon', 5.3401, -4.0812, true, 'Gare principale Gbaka Siporex'),
('a0000001-0000-0000-0000-000000000002', 'Yopougon Keneya', 'Yopougon', 5.3489, -4.0921, true, 'Arrêt carrefour Keneya'),
('a0000001-0000-0000-0000-000000000003', 'Yopougon Bel Air', 'Yopougon', 5.3312, -4.0723, true, 'Station Wôrô-wôrô intérieur'),
('a0000001-0000-0000-0000-000000000004', 'Adjamé Liberté', 'Adjamé', 5.3532, -4.0267, true, 'Gare centrale Gbaka Liberté'),
('a0000001-0000-0000-0000-000000000005', 'Adjamé Renault', 'Adjamé', 5.3589, -4.0315, false, 'Arrêt mixte SOTRA et Gbaka'),
('a0000001-0000-0000-0000-000000000006', 'Plateau Gare Sud', 'Plateau', 5.3235, -4.0195, false, 'Terminus central SOTRA Plateau'),
('a0000001-0000-0000-0000-000000000007', 'Cocody Saint-Jean', 'Cocody', 5.3551, -3.9934, true, 'Gare Wôrô-wôrô Cocody Saint-Jean'),
('a0000001-0000-0000-0000-000000000008', 'Cocody Riviera 2', 'Cocody', 5.3622, -3.9681, true, 'Arrêt Carrefour Riviera 2'),
('a0000001-0000-0000-0000-000000000009', 'Cocody Riviera Palmeraie', 'Cocody', 5.3789, -3.9421, true, 'Station Palmeraie Triangle'),
('a0000001-0000-0000-0000-000000000010', 'Abobo Gare', 'Abobo', 5.4167, -4.0167, true, 'Grande gare routière d''Abobo'),
('a0000001-0000-0000-0000-000000000011', 'Treichville Bassam', 'Treichville', 5.3021, -4.0089, true, 'Gare Wôrô-wôrô Sud Treichville'),
('a0000001-0000-0000-0000-000000000012', 'Koumassi Grand Carrefour', 'Koumassi', 5.2954, -3.9511, true, 'Carrefour majeur Koumassi'),
('a0000001-0000-0000-0000-000000000013', 'Bingerville Gare', 'Bingerville', 5.3558, -3.8951, true, 'Gare Gbaka Bingerville')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lines (id, code, name, type, operator, is_informal, color_code) VALUES
('b0000001-0000-0000-0000-000000000001', 'GBAKA-YOP-ADJ', 'Gbaka Yopougon Siporex - Adjamé Liberté (Autoroute)', 'GBAKA', 'Syndicat Transporteurs Yopougon', true, '#E65100'),
('b0000001-0000-0000-0000-000000000002', 'GBAKA-ADJ-ABO', 'Gbaka Adjamé Liberté - Abobo Gare (Voie Express)', 'GBAKA', 'Syndicat Abobo-Adjamé', true, '#D84315'),
('b0000001-0000-0000-0000-000000000003', 'WORO-COC-PALM', 'Wôrô-wôrô Saint-Jean - Riviera Palmeraie', 'WORO_WORO', 'Association Taxis Jaunes Cocody', true, '#FBC02D'),
('b0000001-0000-0000-0000-000000000004', '85', 'SOTRA Ligne 85 (Yopougon Siporex - Plateau Gare Sud)', 'BUS_SOTRA', 'SOTRA', false, '#1976D2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.line_stops (id, line_id, station_id, stop_order, distance_to_next_km, estimated_time_to_next_min) VALUES
('c0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 1, 3.5, 8),
('c0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 2, 2.1, 5),
('c0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000004', 3, 0.0, 0),
('c0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000007', 1, 2.5, 6),
('c0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000008', 2, 3.1, 7),
('c0000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000009', 3, 0.0, 0),
('c0000001-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 1, 6.2, 15),
('c0000001-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000006', 2, 0.0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fares (id, line_id, origin_station_id, destination_station_id, amount, is_community_validated, confirmation_score) VALUES
('d0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000004', 300.0, true, 45),
('d0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000010', 250.0, true, 30),
('d0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000009', 350.0, true, 22),
('d0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000006', 200.0, true, 160)
ON CONFLICT (id) DO NOTHING;
