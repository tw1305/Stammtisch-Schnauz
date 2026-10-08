-- Feuer (drei Asse) pro Runde erfassen.
-- Im Supabase SQL-Editor ausführen. Rein additiv: bestehende Daten bleiben unverändert.
-- Der App-Code liest die Tabelle defensiv – ohne Migration funktioniert alles außer dem Feuer-Tracking.

CREATE TABLE IF NOT EXISTS round_fires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS round_fires_round_idx ON round_fires(round_id);
CREATE INDEX IF NOT EXISTS round_fires_session_idx ON round_fires(session_id);

ALTER TABLE round_fires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "round_fires open access" ON round_fires;
CREATE POLICY "round_fires open access" ON round_fires
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Live-Sync zwischen Geräten
ALTER PUBLICATION supabase_realtime ADD TABLE round_fires;
