-- Ajuste menor: diner_bootstrap_menu devolvía carta + identidad de sesión,
-- pero el bootstrap que necesita la PWA también exige venue/mesa/moneda y
-- las sugerencias de propina (tenant_diner_settings.tip_suggestions) para
-- pintar el encabezado. Se agrega en la misma respuesta — sigue siendo una
-- sola ida y vuelta.

create or replace function private.diner_bootstrap_menu(p_session_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_row record;
  menu jsonb;
  venue_row record;
  tip_suggestions integer[];
begin
  select * into session_row
  from private.require_diner_device_session(p_session_token, null);

  menu := private.diner_menu(session_row.tenant_id);

  select t.id as table_id, t.display_name as table_name, t.capacity,
         v.id as venue_id, v.name as venue_name
  into venue_row
  from public.tables t
  join public.venues v on v.tenant_id = t.tenant_id and v.id = t.venue_id
  where t.tenant_id = session_row.tenant_id and t.id = session_row.table_id;

  select settings.tip_suggestions into tip_suggestions
  from public.tenant_diner_settings settings
  where settings.tenant_id = session_row.tenant_id;

  return menu || jsonb_build_object(
    'sessionId', session_row.session_id,
    'alias', session_row.alias,
    'displayName', session_row.display_name,
    'venueId', venue_row.venue_id,
    'venueName', venue_row.venue_name,
    'tableId', venue_row.table_id,
    'tableName', venue_row.table_name,
    'tipSuggestions', coalesce(to_jsonb(tip_suggestions), to_jsonb(array[0, 10, 12]))
  );
end;
$$;
