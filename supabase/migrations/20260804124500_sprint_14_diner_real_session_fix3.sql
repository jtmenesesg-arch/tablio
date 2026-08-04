-- Tercer fix encontrado al verificar el incremento contra la base real: se
-- confirmó (creando 21 sesiones reales en una mesa) que el rechazo por tope
-- funciona, pero el `insert into audit_log` que debía dejar constancia NUNCA
-- queda escrito — porque va seguido de `raise exception` en la MISMA
-- transacción, y Postgres deshace toda la transacción cuando una excepción
-- se propaga hasta el llamador, incluido el insert que ya se había hecho.
--
-- private.verify_table_presence ya resolvía esto correctamente para su
-- propio caso de bloqueo: no lanza excepción, DEVUELVE un resultado con
-- `verified: false` — por eso su propio insert en auditoría si sobrevive.
-- Se alinea enter_table al mismo patrón: devuelve un jsonb con `ok`/`code`
-- en vez de lanzar excepción para los rechazos esperados (código
-- incorrecto, bloqueo temporal, tope de mesa alcanzado), reservando las
-- excepciones de verdad para entradas inválidas del programador, no para
-- rechazos de negocio normales.

drop function if exists public.enter_table(text, text, text, text[]);
drop function if exists private.enter_table(text, text, text, text[]);

create function private.enter_table(
  p_qr_token text,
  p_presence_code text,
  p_device_fingerprint text,
  p_alias_candidates text[]
)
returns jsonb
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
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  verification := private.verify_table_presence(p_qr_token, p_presence_code, p_device_fingerprint);
  if not coalesce((verification ->> 'verified')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(verification ->> 'code', 'invalid'),
      'retry_after_seconds', nullif(verification ->> 'retry_after_seconds', '')::integer
    );
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
    return jsonb_build_object('ok', false, 'code', 'table_session_limit_reached');
  end if;

  raw_token := private.generate_url_safe_token(32);

  foreach candidate in array p_alias_candidates loop
    if candidate is null or btrim(candidate) = '' or length(candidate) > 40 then
      continue;
    end if;
    begin
      insert into public.diner_device_sessions as dds (
        tenant_id, table_session_id, token_hash, alias
      ) values (
        selected_tenant_id, live_table_session_id,
        extensions.digest(raw_token, 'sha256'), candidate
      )
      returning dds.id, dds.alias, dds.idle_expires_at, dds.absolute_expires_at
      into created_id, chosen_alias, idle_out, absolute_out;
      exit;
    exception when unique_violation then
      continue;
    end;
  end loop;

  if chosen_alias is null then
    return jsonb_build_object('ok', false, 'code', 'no_alias_available');
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_token', raw_token,
    'session_id', created_id,
    'alias', chosen_alias,
    'idle_expires_at', idle_out,
    'absolute_expires_at', absolute_out
  );
end;
$$;

create function public.enter_table(
  p_qr_token text,
  p_presence_code text,
  p_device_fingerprint text,
  p_alias_candidates text[]
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.enter_table(
    p_qr_token, p_presence_code, p_device_fingerprint, p_alias_candidates
  );
$$;

revoke execute on function public.enter_table(text, text, text, text[]) from public;
grant execute on function public.enter_table(text, text, text, text[]) to anon, authenticated;

revoke execute on function private.enter_table(text, text, text, text[])
  from public, anon, authenticated;
grant execute on function private.enter_table(text, text, text, text[])
  to anon, authenticated;
