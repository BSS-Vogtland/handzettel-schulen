begin;

-- ============================================================
-- Strukturierte technische Zusatzdaten für Anfrage-Ereignisse
-- ============================================================
--
-- Der Analyse-Service speichert bei analysis_done und
-- analysis_no_items unter anderem:
--
-- - verwendete Analyse-Version
-- - ausgewertete Dateien
-- - Anzahl erkannter Positionen je Datei
--
-- Die Spalte fehlte bisher in der produktiven Tabelle.
-- Dadurch konnte die Analyse fachlich erfolgreich sein,
-- während der zugehörige Ereigniseintrag stillschweigend
-- nicht gespeichert wurde.
-- ============================================================

alter table public.school_request_events
  add column if not exists metadata jsonb;

update public.school_request_events
set metadata = '{}'::jsonb
where metadata is null;

alter table public.school_request_events
  alter column metadata
  set default '{}'::jsonb;

alter table public.school_request_events
  alter column metadata
  set not null;

comment on column public.school_request_events.metadata is
  'Strukturierte technische Zusatzdaten zum Ereignis, zum Beispiel Analyse-Version, Dateiergebnisse, Zähler und interne Prozessinformationen.';

create index if not exists school_request_events_metadata_gin_idx
  on public.school_request_events
  using gin (metadata);

commit;