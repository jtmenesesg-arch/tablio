-- OI-034 Incremento 1: sesión real del comensal.
--
-- El esquema para esto ya existía completo desde el Sprint 3
-- (`diner_device_sessions`, `tenant_diner_settings` con sus TTL de 4h/12h,
-- el trigger `enforce_diner_device_session_lifetime` que los aplica) —
-- nunca se cableó a ninguna RPC. Este incremento no inventa un mecanismo de
-- sesión nuevo: reusa `private.verify_table_presence` tal cual (con su
-- limitador de intentos por dispositivo/mesa ya construido en
-- `presence_verification_attempts`), por decisión explícita del fundador de
-- preferir lo probado sobre lo elegante en la ruta de la plata.
--
-- Es también el primer INSERT que existe hacia `table_sessions` en todo el
-- esquema — abrir una mesa nunca se había cableado tampoco. Se resuelve acá
-- de la forma mínima (se abre sola con el primer comensal verificado); el
-- ciclo de vida completo de cierre de mesa queda fuera de este incremento.

-- Límite nuevo: sesiones activas simultáneas por mesa. tenant_diner_settings
-- ya modela límites de sesión por tenant; se le agrega este.
alter table public.tenant_diner_settings
  add column max_active_sessions_per_table integer not null default 20
    check (max_active_sessions_per_table between 1 and 100);

comment on column public.tenant_diner_settings.max_active_sessions_per_table is
  'Techo de sesiones activas simultáneas por mesa. 20 por defecto: generoso para una mesa grande con celulares repetidos, pero acota el daño de una creación masiva sin login.';

-- El esquema original nunca puso un límite de longitud al alias (a
-- diferencia de display_name, que sí lo tiene). Se cierra ese hueco acá,
-- antes de exponer la primera RPC que lo escribe desde fuera.
alter table public.diner_device_sessions
  add constraint diner_device_sessions_alias_length check (length(alias) <= 40);

create or replace function private.claim_live_table_session(
  p_tenant_id uuid,
  p_table_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  live_id uuid;
begin
  select id into live_id
  from public.table_sessions
  where tenant_id = p_tenant_id
    and table_id = p_table_id
    and state in ('active', 'paused')
  limit 1;

  if live_id is not null then
    return live_id;
  end if;

  begin
    insert into public.table_sessions (tenant_id, table_id, state)
    values (p_tenant_id, p_table_id, 'active')
    returning id into live_id;
    return live_id;
  exception when unique_violation then
    select id into live_id
    from public.table_sessions
    where tenant_id = p_tenant_id
      and table_id = p_table_id
      and state in ('active', 'paused')
    limit 1;
    return live_id;
  end;
end;
$$;

-- Valida (y refresca) una prueba de sesión de comensal. Se llama en CADA
-- RPC de mutación futura de este tramo (carrito, quote, pago) — nunca se
-- cachea ni se confía en una verificación anterior. Corta el acceso si:
-- el token no existe, la sesión no está 'active', venció (idle o
-- absoluto), la mesa a la que se le exige pertenecer no coincide, o la
-- table_session a la que pertenece ya no está abierta (por eso la sesión
-- de comensal nunca sobrevive al cierre de la mesa, aunque el cierre de
-- mesa en sí sea un incremento aparte que todavía no existe).
create or replace function private.require_diner_device_session(
  p_session_token text,
  p_table_id uuid
)
returns table(
  session_id uuid,
  tenant_id uuid,
  table_session_id uuid,
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
  if p_session_token is null or length(p_session_token) < 20 or p_table_id is null then
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

  if live_table_id <> p_table_id then
    raise exception 'session does not belong to this table' using errcode = '42501';
  end if;

  update public.diner_device_sessions
  set last_seen_at = clock_timestamp()
  where id = session_record.id;

  return query select
    session_record.id, session_record.tenant_id, session_record.table_session_id,
    session_record.alias, session_record.display_name;
end;
$$;

-- Punto de entrada real del comensal: verifica QR + código de presencia
-- (delegado íntegro a verify_table_presence), abre o reutiliza la mesa,
-- aplica el techo de sesiones activas, y crea la sesión real.
--
-- Qué pasa si alguien intenta crear sesiones en masa: cada intento sigue
-- pagando el costo de verify_table_presence (una fila en
-- presence_verification_attempts); una vez que las sesiones activas de esa
-- mesa llegan a max_active_sessions_per_table, todo intento adicional
-- devuelve 42501 explícito y queda una fila en audit_log
-- ('diner_session.table_limit_reached') con el conteo, para que sea
-- visible sin tener que reconstruirlo de los logs. Lo que este incremento
-- NO cubre es limitar la tasa de llamadas por IP/red — eso es una
-- responsabilidad de borde (Vercel/Cloudflare), no de esta función.
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
     or array_length(p_alias_candidates, 1) > 30 then
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

create or replace function public.enter_table(
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
language sql
security invoker
set search_path = ''
as $$
  select * from private.enter_table(
    p_qr_token, p_presence_code, p_device_fingerprint, p_alias_candidates
  );
$$;

revoke execute on function public.enter_table(text, text, text, text[]) from public;
grant execute on function public.enter_table(text, text, text, text[]) to anon, authenticated;

-- public.enter_table es security invoker: la llamada a private.enter_table
-- todavía corre como el rol original (anon), así que ese nivel necesita el
-- grant explícito, igual que create_employee. Todo lo que private.enter_table
-- llama DESDE ADENTRO (claim_live_table_session, verify_table_presence)
-- corre como el dueño de la función (security definer), no como anon, así
-- que esos dos no lo necesitan — quedan revocados, sólo alcanzables desde
-- dentro de otra función security definer.
revoke execute on function private.enter_table(text, text, text, text[])
  from public, anon, authenticated;
grant execute on function private.enter_table(text, text, text, text[])
  to anon, authenticated;

revoke execute on function private.claim_live_table_session(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.require_diner_device_session(text, uuid)
  from public, anon, authenticated;
