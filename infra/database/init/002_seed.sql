INSERT INTO transport_operators (gtfs_agency_id, name, mode) VALUES
  ('SOTRA', 'SOTRA', 'sotra'),
  ('SIRA-GBAKA', 'Collectif Gbaka pilote', 'gbaka');

INSERT INTO stops (gtfs_stop_id, name, commune, location, is_official) VALUES
  ('STOP-COCODY-DANGA', 'Cocody Danga', 'Cocody', ST_GeogFromText('SRID=4326;POINT(-3.9951 5.3467)'), true),
  ('STOP-INDENIE', 'Carrefour Indénié', 'Adjamé', ST_GeogFromText('SRID=4326;POINT(-4.0110 5.3460)'), true),
  ('STOP-PLATEAU-NORD', 'Plateau Nord', 'Plateau', ST_GeogFromText('SRID=4326;POINT(-4.0180 5.3290)'), true),
  ('STOP-GARE-SUD', 'Plateau Gare Sud', 'Plateau', ST_GeogFromText('SRID=4326;POINT(-4.0201 5.3196)'), true),
  ('STOP-ADJAME', 'Gare d''Adjamé', 'Adjamé', ST_GeogFromText('SRID=4326;POINT(-4.0162 5.3534)'), false),
  ('STOP-RIVIERA2', 'Riviera 2', 'Cocody', ST_GeogFromText('SRID=4326;POINT(-3.9617 5.3597)'), false);

WITH op AS (SELECT id FROM transport_operators WHERE gtfs_agency_id = 'SOTRA')
INSERT INTO transport_routes (gtfs_route_id, operator_id, short_name, long_name, mode, color, base_fare, geometry)
SELECT 'SIRA-81', op.id, '81', 'Cocody Danga — Plateau Gare Sud', 'sotra', 'EC5B2A', 500,
  ST_GeogFromText('SRID=4326;LINESTRING(-3.9951 5.3467,-4.0110 5.3460,-4.0180 5.3290,-4.0201 5.3196)') FROM op;

INSERT INTO route_stops (route_id, stop_id, stop_sequence, average_travel_seconds)
SELECT r.id, s.id, data.seq, data.seconds
FROM transport_routes r
JOIN (VALUES ('STOP-COCODY-DANGA', 1, 0), ('STOP-INDENIE', 2, 480), ('STOP-PLATEAU-NORD', 3, 900), ('STOP-GARE-SUD', 4, 1200)) AS data(stop_id, seq, seconds) ON true
JOIN stops s ON s.gtfs_stop_id = data.stop_id
WHERE r.gtfs_route_id = 'SIRA-81';
