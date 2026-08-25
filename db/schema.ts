export type TransportMode =
  | "WALK"
  | "SOTRA_BUS"
  | "EXPRESS_BUS"
  | "WIBUS"
  | "GBAKA"
  | "WORO_WORO"
  | "TAXI"
  | "FERRY"
  | "UNKNOWN";

export type DataFreshness = "historical_open_data" | "synthetic" | "validated" | "flagged";

export type DataSourceRow = {
  id: string;
  name: string;
  source_url: string | null;
  provider: string | null;
  license: string | null;
  data_date: string | null;
  downloaded_at: string | null;
  checksum: string | null;
  metadata: Record<string, unknown>;
};

export type TransportLineRow = {
  id: string;
  external_id: string | null;
  name: string;
  code: string | null;
  operator: string | null;
  network: string | null;
  raw_mode: string | null;
  sira_mode: TransportMode;
  colour: string | null;
  geometry: unknown;
  frequency_raw: string | null;
  frequency_seconds: number | null;
  opening_hours_raw: string | null;
  source_id: string | null;
  freshness_status: DataFreshness;
  validation_status: "pending" | "validated" | "flagged";
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
};

export type TransportObservationRow = {
  id: string;
  transport_line_id: string | null;
  observation_type: string;
  observed_geometry: unknown;
  fare_amount: number | null;
  currency: string | null;
  frequency_minutes: number | null;
  opening_time: string | null;
  closing_time: string | null;
  comment: string | null;
  collector_session_id: string | null;
  observed_at: string | null;
  validation_status: "pending" | "validated" | "flagged";
  confidence_score: number | null;
  created_at: string;
};

export {};
