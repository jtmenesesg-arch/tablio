-- OI-034 Incremento 2, ajuste encontrado al diseñar la lectura de carta
-- real: un comensal que recarga la página sólo tiene la cookie de sesión y
-- el qr de la URL — no conoce el table_id interno para pasárselo a
-- require_diner_device_session (que hasta ahora lo exigía siempre). Se
-- vuelve opcional: si se pasa, se sigue exigiendo que coincida (igual que
-- antes, para las mutaciones de los incrementos 3-5, que sí conocen su
-- mesa); si no se pasa, sólo se valida la sesión y se devuelve el table_id
-- real para que el llamador lo use. Se aprovecha para devolver table_id
-- directo (antes había que resolverlo aparte con un join a table_sessions).

drop function if exists private.require_diner_device_session(text, uuid);

create or replace function private.require_diner_device_session(
  p_session_token text,
  p_table_id uuid default null
)
returns table(
  session_id uuid,
  tenant_id uuid,
  table_session_id uuid,
  table_id uuid,
  alias text,
  display_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  session_record public.diner_device_sessions%rowtype;
  live_table_id uuid;
begin
  if p_session_token is null or length(p_session_token) < 20 then
    raise exception 'invalid session' using errcode = '42501';
  end if;

  select device.* into session_record
  from public.diner_device_sessions device
  where device.token_hash = extensions.digest(p_session_token, 'sha256')
  for update;

  if session_record.id is null or session_record.state <> 'active' then
    raise exception 'invalid session' using errcode = '42501';
  end if;

  if session_record.idle_expires_at <= clock_timestamp()
     or session_record.absolute_expires_at <= clock_timestamp() then
    update public.diner_device_sessions
    set state = 'expired'
    where id = session_record.id;
    raise exception 'session expired' using errcode = '42501';
  end if;

  select ts.table_id into live_table_id
  from public.table_sessions ts
  where ts.tenant_id = session_record.tenant_id
    and ts.id = session_record.table_session_id
    and ts.state in ('active', 'paused');

  if live_table_id is null then
    update public.diner_device_sessions
    set state = 'revoked', revoked_at = clock_timestamp(),
        revoked_reason = 'table session closed'
    where id = session_record.id;
    raise exception 'table session is no longer open' using errcode = '42501';
  end if;

  if p_table_id is not null and live_table_id <> p_table_id then
    raise exception 'session does not belong to this table' using errcode = '42501';
  end if;

  update public.diner_device_sessions
  set last_seen_at = clock_timestamp()
  where id = session_record.id;

  return query select
    session_record.id, session_record.tenant_id, session_record.table_session_id,
    live_table_id, session_record.alias, session_record.display_name;
end;
$$;

revoke execute on function private.require_diner_device_session(text, uuid)
  from public, anon, authenticated;
