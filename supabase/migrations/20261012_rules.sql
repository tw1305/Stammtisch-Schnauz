-- Regelwerk (Reiter "Regeln").
-- Im Supabase SQL-Editor ausführen. Rein additiv; kann gefahrlos mehrfach ausgeführt werden.
-- Die Anfangsregeln legt die App beim ersten Öffnen des Reiters selbst an.

CREATE TABLE IF NOT EXISTS public.rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,                     -- Abschnitt / Thema, z. B. "Austeilen und Geber"
  title TEXT NOT NULL DEFAULT '',            -- Überschrift des Paragraphen
  body TEXT NOT NULL,                        -- Regeltext
  sort_order INTEGER NOT NULL DEFAULT 0,     -- Reihenfolge (Abschnitte folgen ihrer ersten Regel)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- treibt das "Stand"-Datum
  deleted_at TIMESTAMPTZ                     -- weich gelöscht (wiederherstellbar)
);

ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rules open access" ON public.rules;
CREATE POLICY "rules open access" ON public.rules
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules TO anon, authenticated;

-- API-Schema-Cache sofort neu laden, damit die App die Tabelle direkt findet
NOTIFY pgrst, 'reload schema';
