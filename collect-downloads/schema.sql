-- SQL schema for persisting app store install metrics
CREATE TABLE IF NOT EXISTS app_store_installs (
  id serial PRIMARY KEY,
  store varchar NOT NULL, -- 'google' | 'apple'
  report_date date NOT NULL,
  country varchar,
  installs integer,
  raw jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)
);
CREATE INDEX IF NOT EXISTS idx_app_store_installs_store_date ON app_store_installs (store, report_date);
