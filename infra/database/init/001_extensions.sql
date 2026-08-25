CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE transport_mode AS ENUM ('walk', 'sotra', 'gbaka', 'woro_woro', 'taxi', 'boat_bus');
CREATE TYPE report_status AS ENUM ('pending', 'verified', 'expired', 'rejected');
CREATE TYPE report_severity AS ENUM ('low', 'medium', 'high');

CREATE TABLE transport_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gtfs_agency_id text UNIQUE,
  name text NOT NULL,
  mode transport_mode NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gtfs_stop_id text UNIQUE,
  name text NOT NULL,
  commune text,
  location geography(Point, 4326) NOT NULL,
  is_official boolean NOT NULL DEFAULT false,
  accessibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stops_location_gix ON stops USING gist(location);

CREATE TABLE transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gtfs_route_id text UNIQUE,
  operator_id uuid REFERENCES transport_operators(id),
  short_name text NOT NULL,
  long_name text NOT NULL,
  mode transport_mode NOT NULL,
  color char(6),
  base_fare integer NOT NULL CHECK (base_fare >= 0),
  geometry geography(LineString, 4326),
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX transport_routes_geometry_gix ON transport_routes USING gist(geometry);

CREATE TABLE route_stops (
  route_id uuid NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  stop_sequence integer NOT NULL,
  average_travel_seconds integer,
  PRIMARY KEY (route_id, stop_sequence),
  UNIQUE (route_id, stop_id, stop_sequence)
);

CREATE TABLE traffic_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  type text NOT NULL,
  title text NOT NULL,
  description text,
  severity report_severity NOT NULL DEFAULT 'medium',
  status report_status NOT NULL DEFAULT 'pending',
  location geography(Point, 4326) NOT NULL,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmations integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX traffic_reports_location_gix ON traffic_reports USING gist(location);
CREATE INDEX traffic_reports_active_idx ON traffic_reports(status, expires_at);

CREATE TABLE journey_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  origin geography(Point, 4326) NOT NULL,
  destination geography(Point, 4326) NOT NULL,
  selected_option jsonb NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
