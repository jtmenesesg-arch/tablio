-- Fix encontrado al verificar el incremento anterior contra la base real:
-- private.enter_table() rechazaba cualquier llamada real porque el límite
-- de candidatos de alias (30) era menor que el tamaño real de la lista de
-- palabras ya usada por el producto (14 sujetos × 6 colores = 84
-- combinaciones, apps/web/lib/diner-alias.ts). Ninguna llamada real podía
-- pasar nunca. Se sube el techo a 100 — sigue acotado (no es "sin límite"),
-- con margen sobre el tamaño real de la lista.

create or replace function private.enter_table(
  p_qr_token text,
  p_presence_code text,
  p_device_fingerprint text,
  p_alias_candidates text[]
)
returns table(
  session_token text,
  session_id uuid,
  alias text,
  idle_expires_at timestamptz,
  absolute_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  verification jsonb;
  selected_tenant_id uuid;
  selected_table_id uuid;
  live_table_session_id uuid;
  active_count integer;
  max_sessions integer;
  raw_token text;
  candidate text;
  created_id uuid;
  chosen_alias text;
  idle_out timestamptz;
  absolute_out timestamptz;
begin
  if p_alias_candidates is null
     or array_length(p_alias_candidates, 1) is null
     or array_length(p_alias_candidates, 1) > 100 then
    raise exception 'invalid alias candidates' using errcode = '22023';
  end if;

  verification := private.verify_table_presence(p_qr_token, p_presence_code, p_device_fingerprint);
  if not coalesce((verification ->> 'verified')::boolean, false) then
    raise exception '%', coalesce(verification ->> 'code', 'invalid')
      using errcode = '42501', detail = verification::text;
  end if;

  selected_tenant_id := (verification ->> 'tenant_id')::uuid;
  selected_table_id := (verification ->> 'table_id')::uuid;

  live_table_session_id := private.claim_live_table_session(selected_tenant_id, selected_table_id);

  select count(*) into active_count
  from public.diner_device_sessions
  where tenant_id = selected_tenant_id
    and table_session_id = live_table_session_id
    and state = 'active';

  select settings.max_active_sessions_per_table into max_sessions
  from public.tenant_diner_settings settings
  where settings.tenant_id = selected_tenant_id;
  max_sessions := coalesce(max_sessions, 20);

  if active_count >= max_sessions then
    insert into public.audit_log (
      tenant_id, actor_type, action, target_type, target_id, reason, after_data
    ) values (
      selected_tenant_id, 'platform', 'diner_session.table_limit_reached',
      'table', selected_table_id,
      'Se alcanzó el máximo de sesiones activas simultáneas para esta mesa',
      jsonb_build_object('active_count', active_count, 'max_sessions', max_sessions)
    );
    raise exception 'table has reached its active session limit' using errcode = '42501';
  end if;

  raw_token := private.generate_url_safe_token(32);

  foreach candidate in array p_alias_candidates loop
    if candidate is null or btrim(candidate) = '' or length(candidate) > 40 then
      continue;
    end if;
    begin
      insert into public.diner_device_sessions (
        tenant_id, table_session_id, token_hash, alias
      ) values (
        selected_tenant_id, live_table_session_id,
        extensions.digest(raw_token, 'sha256'), candidate
      )
      returning id, alias, idle_expires_at, absolute_expires_at
      into created_id, chosen_alias, idle_out, absolute_out;
      exit;
    exception when unique_violation then
      continue;
    end;
  end loop;

  if chosen_alias is null then
    raise exception 'no available alias for this table right now' using errcode = '40001';
  end if;

  return query select raw_token, created_id, chosen_alias, idle_out, absolute_out;
end;
$$;

revoke execute on function private.enter_table(text, text, text, text[])
  from public, anon, authenticated;
grant execute on function private.enter_table(text, text, text, text[])
  to anon, authenticated;
