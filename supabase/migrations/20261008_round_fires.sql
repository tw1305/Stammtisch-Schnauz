-- Feuer (drei Asse) pro Runde erfassen.
-- Im Supabase SQL-Editor ausführen. Rein additiv: bestehende Daten bleiben unverändert.
-- Kann gefahrlos mehrfach ausgeführt werden.

CREATE TABLE IF NOT EXISTS public.round_fires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS round_fires_round_idx ON public.round_fires(round_id);
CREATE INDEX IF NOT EXISTS round_fires_session_idx ON public.round_fires(session_id);

ALTER TABLE public.round_fires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "round_fires open access" ON public.round_fires;
CREATE POLICY "round_fires open access" ON public.round_fires
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_fires TO anon, authenticated;

-- Live-Sync zwischen Geräten (nur hinzufügen, falls noch nicht drin)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'round_fires'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.round_fires;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime für round_fires nicht aktiviert: %', SQLERRM;
END $$;

-- API-Schema-Cache sofort neu laden, damit die App die Tabelle direkt findet
NOTIFY pgrst, 'reload schema';
