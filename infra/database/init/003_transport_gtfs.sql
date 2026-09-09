CREATE TABLE IF NOT EXISTS transport_gtfs_agencies (
  source_id text PRIMARY KEY,
  name text NOT NULL,
  url text,
  timezone text,
  lang text,
  source_dataset text NOT NULL,
  data_status text NOT NULL CHECK (data_status IN ('historical', 'estimated', 'validated', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_gtfs_routes (
  source_id text PRIMARY KEY,
  agency_source_id text REFERENCES transport_gtfs_agencies(source_id),
  short_name text,
  long_name text,
  route_type integer,
  mode text NOT NULL,
  operator text,
  frequency_raw text,
  opening_hours text,
  exceptions text,
  color text,
  shape_source_id text,
  source_dataset text NOT NULL,
  historical_fare numeric(10,2),
  fare_status text NOT NULL CHECK (fare_status IN ('historical', 'estimated', 'validated', 'unknown')),
  data_status text NOT NULL CHECK (data_status IN ('historical', 'estimated', 'validated', 'unknown')),
  confidence double precision CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  geometry geometry(LineString, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transport_gtfs_routes_geometry_gix ON transport_gtfs_routes USING gist(geometry);
CREATE INDEX IF NOT EXISTS transport_gtfs_routes_geography_gix ON transport_gtfs_routes USING gist(CAST(geometry AS geography));
CREATE INDEX IF NOT EXISTS transport_gtfs_routes_agency_idx ON transport_gtfs_routes(agency_source_id);

CREATE TABLE IF NOT EXISTS transport_gtfs_stops (
  source_id text PRIMARY KEY,
  code text,
  name text NOT NULL,
  description text,
  location_type integer,
  parent_station text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  data_status text NOT NULL CHECK (data_status IN ('historical', 'estimated', 'validated', 'unknown')),
  source_dataset text NOT NULL,
  geometry geometry(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ST_SRID(geometry) = 4326)
);
CREATE INDEX IF NOT EXISTS transport_gtfs_stops_geometry_gix ON transport_gtfs_stops USING gist(geometry);
CREATE INDEX IF NOT EXISTS transport_gtfs_stops_geography_gix ON transport_gtfs_stops USING gist(CAST(geometry AS geography));

CREATE TABLE IF NOT EXISTS transport_gtfs_trips (
  source_id text PRIMARY KEY,
  route_source_id text NOT NULL REFERENCES transport_gtfs_routes(source_id),
  service_id text NOT NULL,
  headsign text,
  direction_id integer,
  shape_source_id text,
  data_status text NOT NULL CHECK (data_status IN ('historical', 'estimated', 'validated', 'unknown')),
  source_dataset text NOT NULL
);
CREATE INDEX IF NOT EXISTS transport_gtfs_trips_route_idx ON transport_gtfs_trips(route_source_id);

CREATE TABLE IF NOT EXISTS transport_gtfs_stop_times (
  trip_source_id text NOT NULL REFERENCES transport_gtfs_trips(source_id) ON DELETE CASCADE,
  stop_source_id text NOT NULL REFERENCES transport_gtfs_stops(source_id),
  arrival_time text,
  departure_time text,
  stop_sequence integer NOT NULL,
  timepoint integer,
  PRIMARY KEY (trip_source_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS transport_gtfs_stop_times_stop_idx ON transport_gtfs_stop_times(stop_source_id);

CREATE TABLE IF NOT EXISTS transport_gtfs_frequencies (
  trip_source_id text NOT NULL REFERENCES transport_gtfs_trips(source_id) ON DELETE CASCADE,
  start_time text NOT NULL,
  end_time text NOT NULL,
  headway_secs integer NOT NULL CHECK (headway_secs > 0),
  exact_times integer,
  PRIMARY KEY (trip_source_id, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS transport_gtfs_fares (
  route_source_id text PRIMARY KEY REFERENCES transport_gtfs_routes(source_id) ON DELETE CASCADE,
  amount numeric(10,2),
  currency text NOT NULL DEFAULT 'XOF',
  status text NOT NULL CHECK (status IN ('historical', 'estimated', 'validated', 'unknown')),
  raw_value text,
  source_dataset text NOT NULL
);

CREATE TABLE IF NOT EXISTS transport_gtfs_shapes (
  source_id text PRIMARY KEY,
  geometry geometry(LineString, 4326) NOT NULL,
  source_dataset text NOT NULL,
  data_status text NOT NULL CHECK (data_status IN ('historical', 'estimated', 'validated', 'unknown'))
);
CREATE INDEX IF NOT EXISTS transport_gtfs_shapes_geometry_gix ON transport_gtfs_shapes USING gist(geometry);
