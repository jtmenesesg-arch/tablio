-- Sprint 14: tables own their QR and presence assets.
-- QR tokens and presence codes remain encrypted in Vault and are only revealed
-- through narrow, audited functions. Browser-facing code never uses service_role.

create table public.tenant_presence_settings (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  presence_required boolean not null default true,
  delivery_level text not null default 'printed_with_qr'
    check (delivery_level in ('printed_with_qr', 'separate', 'rotating')),
  rotation_period text not null default 'daily'
    check (rotation_period in ('daily', 'shift')),
  device_attempt_limit integer not null default 5
    check (device_attempt_limit between 3 and 20),
  table_attempt_limit integer not null default 25
    check (table_attempt_limit between 10 and 200),
  attempt_window_seconds integer not null default 300
    check (attempt_window_seconds between 60 and 3600),
  block_seconds integer not null default 900
    check (block_seconds between 60 and 86400),
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.zone_presence_overrides (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  zone_id uuid not null,
  presence_required boolean,
  delivery_level text
    check (delivery_level is null or delivery_level in ('printed_with_qr', 'separate', 'rotating')),
  rotation_period text
    check (rotation_period is null or rotation_period in ('daily', 'shift')),
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, zone_id),
  foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete cascade,
  check (
    presence_required is not null
    or delivery_level is not null
    or rotation_period is not null
  )
);

alter table public.tables
  add column presence_required boolean not null default true,
  add column presence_delivery_level text not null default 'printed_with_qr'
    check (presence_delivery_level in ('printed_with_qr', 'separate', 'rotating')),
  add column presence_rotation_period text not null default 'daily'
    check (presence_rotation_period in ('daily', 'shift')),
  add column presence_assets_managed boolean not null default false;

-- Existing rows keep their previous enforcement until their physical cards are
-- explicitly reprovisioned. New rows created by the RPC below are managed.
update public.tables
set presence_required = presence_mode = 'required',
    presence_delivery_level = 'printed_with_qr',
    presence_rotation_period = 'daily',
    presence_assets_managed = false;

create table public.presence_code_rotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  table_id uuid not null,
  code_hash bytea not null check (octet_length(code_hash) = 32),
  delivery_level text not null
    check (delivery_level in ('printed_with_qr', 'separate', 'rotating')),
  rotation_period text not null
    check (rotation_period in ('daily', 'shift')),
  state text not null default 'active'
    check (state in ('active', 'rotated', 'expired')),
  valid_from timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  rotated_at timestamptz,
  reason text not null check (btrim(reason) <> ''),
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  foreign key (tenant_id, table_id)
    references public.tables (tenant_id, id) on delete restrict,
  check (expires_at is null or expires_at > valid_from),
  check (
    (state = 'active' and rotated_at is null)
    or (state <> 'active' and rotated_at is not null)
  )
);

create unique index presence_code_one_active_per_table_idx
on public.presence_code_rotations (tenant_id, table_id)
where state = 'active';

create index presence_code_due_idx
on public.presence_code_rotations (expires_at)
where state = 'active' and expires_at is not null;

create table private.table_qr_vault_secrets (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  table_id uuid not null,
  qr_version integer not null check (qr_version > 0),
  vault_secret_id uuid not null references vault.secrets (id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key (tenant_id, table_id, qr_version),
  unique (vault_secret_id),
  foreign key (tenant_id, table_id)
    references public.tables (tenant_id, id) on delete restrict,
  check ((active and revoked_at is null) or (not active and revoked_at is not null))
);

create unique index table_qr_one_active_secret_idx
on private.table_qr_vault_secrets (tenant_id, table_id)
where active;

create table private.presence_code_vault_secrets (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  rotation_id uuid not null,
  vault_secret_id uuid not null references vault.secrets (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, rotation_id),
  unique (vault_secret_id),
  foreign key (tenant_id, rotation_id)
    references public.presence_code_rotations (tenant_id, id) on delete restrict
);

create table private.presence_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  table_id uuid not null,
  device_fingerprint_hash bytea not null
    check (octet_length(device_fingerprint_hash) = 32),
  succeeded boolean not null,
  outcome text not null
    check (outcome in ('verified', 'invalid_code', 'device_blocked', 'table_blocked')),
  blocked_until timestamptz,
  attempted_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, table_id)
    references public.tables (tenant_id, id) on delete restrict,
  check (
    (outcome in ('device_blocked', 'table_blocked') and blocked_until is not null)
    or (outcome not in ('device_blocked', 'table_blocked') and blocked_until is null)
  )
);

create index presence_attempt_device_window_idx
on private.presence_verification_attempts (
  tenant_id, table_id, device_fingerprint_hash, attempted_at desc
);

create index presence_attempt_table_window_idx
on private.presence_verification_attempts (tenant_id, table_id, attempted_at desc);

create or replace function private.presence_next_daily_expiry(
  p_timezone text,
  p_now timestamptz default clock_timestamp()
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (
    date_trunc('day', p_now at time zone p_timezone) + interval '1 day'
  ) at time zone p_timezone;
$$;

create or replace function private.generate_url_safe_token(p_bytes integer default 32)
returns text
language sql
volatile
set search_path = ''
as $$
  select rtrim(
    translate(encode(extensions.gen_random_bytes(p_bytes), 'base64'), '+/', '-_'),
    '='
  );
$$;

create or replace function private.generate_presence_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  random_bytes bytea;
  random_value integer;
begin
  loop
    random_bytes := extensions.gen_random_bytes(2);
    random_value := get_byte(random_bytes, 0) * 256 + get_byte(random_bytes, 1);
    exit when random_value < 60000;
  end loop;
  return lpad((random_value % 10000)::text, 4, '0');
end;
$$;

create or replace function private.create_presence_rotation(
  p_tenant_id uuid,
  p_table_id uuid,
  p_delivery_level text,
  p_rotation_period text,
  p_reason text,
  p_created_by_user_id uuid default auth.uid()
)
returns table(rotation_id uuid, presence_code text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  generated_code text;
  created_rotation_id uuid;
  created_secret_id uuid;
  venue_timezone text;
  code_expiry timestamptz;
begin
  if p_delivery_level not in ('printed_with_qr', 'separate', 'rotating') then
    raise exception 'invalid presence delivery level';
  end if;
  if p_rotation_period not in ('daily', 'shift') then
    raise exception 'invalid presence rotation period';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'presence rotation reason is required';
  end if;

  select venue.timezone
  into venue_timezone
  from public.tables table_record
  join public.venues venue
    on venue.tenant_id = table_record.tenant_id
   and venue.id = table_record.venue_id
  where table_record.tenant_id = p_tenant_id
    and table_record.id = p_table_id;

  if venue_timezone is null then
    raise exception 'table not found';
  end if;

  generated_code := private.generate_presence_code();
  if p_delivery_level = 'rotating' and p_rotation_period = 'daily' then
    code_expiry := private.presence_next_daily_expiry(venue_timezone);
  else
    code_expiry := null;
  end if;

  update public.presence_code_rotations
  set state = case
        when expires_at is not null and expires_at <= clock_timestamp() then 'expired'
        else 'rotated'
      end,
      rotated_at = clock_timestamp()
  where tenant_id = p_tenant_id
    and table_id = p_table_id
    and state = 'active';

  insert into public.presence_code_rotations (
    tenant_id, table_id, code_hash, delivery_level, rotation_period,
    valid_from, expires_at, reason, created_by_user_id
  ) values (
    p_tenant_id, p_table_id,
    extensions.digest(generated_code, 'sha256'),
    p_delivery_level, p_rotation_period,
    clock_timestamp(), code_expiry, btrim(p_reason), p_created_by_user_id
  )
  returning id into created_rotation_id;

  select vault.create_secret(
    generated_code,
    'tablio.presence.' || created_rotation_id::text,
    'Código de presencia cifrado; sólo se revela mediante una función auditada.'
  ) into created_secret_id;

  insert into private.presence_code_vault_secrets (
    tenant_id, rotation_id, vault_secret_id
  ) values (p_tenant_id, created_rotation_id, created_secret_id);

  update public.tables
  set presence_code_hash = extensions.digest(generated_code, 'sha256'),
      presence_code_expires_at = code_expiry,
      updated_at = clock_timestamp()
  where tenant_id = p_tenant_id and id = p_table_id;

  return query select created_rotation_id, generated_code;
end;
$$;

create or replace function private.assert_presence_management_permission(
  p_tenant_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_tenant_id is null
     or p_tenant_id <> private.require_tenant_context()
     or not private.has_permission(p_tenant_id, 'configuration.manage') then
    raise exception 'configuration management permission is required'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.protect_table_presence_assets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'table QR and presence assets must use audited functions'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tables_protect_presence_assets_insert
before insert on public.tables
for each row execute function private.protect_table_presence_assets();

create trigger tables_protect_presence_assets_update
before update of
  qr_token_hash, qr_version, qr_active,
  presence_mode, presence_code_hash, presence_code_expires_at,
  presence_required, presence_delivery_level, presence_rotation_period,
  presence_assets_managed
on public.tables
for each row execute function private.protect_table_presence_assets();

create or replace function private.create_table_with_assets(
  p_venue_id uuid,
  p_zone_id uuid,
  p_table_number text,
  p_display_name text,
  p_capacity integer
)
returns table(
  table_id uuid,
  qr_token text,
  presence_code text,
  presence_required boolean,
  presence_delivery_level text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  created_table_id uuid := gen_random_uuid();
  generated_qr_token text := private.generate_url_safe_token(32);
  qr_secret_id uuid;
  effective_required boolean;
  effective_level text;
  effective_period text;
  generated_presence_code text;
begin
  selected_tenant_id := private.require_tenant_context();
  perform private.assert_presence_management_permission(selected_tenant_id);

  if p_table_number is null or btrim(p_table_number) = ''
     or p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'table number and name are required';
  end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 100 then
    raise exception 'table capacity must be between 1 and 100';
  end if;
  if not exists (
    select 1
    from public.zones zone
    where zone.tenant_id = selected_tenant_id
      and zone.id = p_zone_id
      and zone.venue_id = p_venue_id
      and zone.active
  ) then
    raise exception 'active zone does not belong to the selected venue';
  end if;

  select
    coalesce(zone_override.presence_required, tenant_setting.presence_required),
    coalesce(zone_override.delivery_level, tenant_setting.delivery_level),
    coalesce(zone_override.rotation_period, tenant_setting.rotation_period)
  into effective_required, effective_level, effective_period
  from public.tenant_presence_settings tenant_setting
  left join public.zone_presence_overrides zone_override
    on zone_override.tenant_id = tenant_setting.tenant_id
   and zone_override.zone_id = p_zone_id
  where tenant_setting.tenant_id = selected_tenant_id;

  if effective_required is null or effective_level is null or effective_period is null then
    raise exception 'tenant presence settings are missing';
  end if;

  insert into public.tables (
    id, tenant_id, venue_id, zone_id, table_number, display_name, capacity,
    qr_token_hash, qr_version, qr_active,
    presence_mode, presence_required, presence_delivery_level,
    presence_rotation_period, presence_assets_managed
  ) values (
    created_table_id, selected_tenant_id, p_venue_id, p_zone_id,
    btrim(p_table_number), btrim(p_display_name), p_capacity,
    extensions.digest(generated_qr_token, 'sha256'), 1, true,
    case when effective_required then 'required' else 'disabled' end,
    effective_required, effective_level, effective_period, true
  );

  select vault.create_secret(
    generated_qr_token,
    'tablio.table_qr.' || created_table_id::text || '.1',
    'Token QR recuperable para reimpresión; acceso restringido y auditado.'
  ) into qr_secret_id;

  insert into private.table_qr_vault_secrets (
    tenant_id, table_id, qr_version, vault_secret_id
  ) values (selected_tenant_id, created_table_id, 1, qr_secret_id);

  select rotation.presence_code
  into generated_presence_code
  from private.create_presence_rotation(
    selected_tenant_id, created_table_id, effective_level, effective_period,
    'Código inicial creado junto con la mesa', auth.uid()
  ) rotation;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id,
    reason, after_data
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'table.created_with_assets',
    'table', created_table_id, 'Creación de mesa',
    jsonb_build_object(
      'table_number', btrim(p_table_number),
      'zone_id', p_zone_id,
      'qr_version', 1,
      'presence_required', effective_required,
      'presence_delivery_level', effective_level
    )
  );

  return query select
    created_table_id, generated_qr_token, generated_presence_code,
    effective_required, effective_level;
end;
$$;

create or replace function private.create_tables_with_assets(
  p_venue_id uuid,
  p_zone_id uuid,
  p_start_number integer,
  p_count integer,
  p_name_prefix text default 'Mesa',
  p_capacity integer default 4
)
returns table(
  table_id uuid,
  table_number text,
  display_name text,
  qr_token text,
  presence_code text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  item_number integer;
  created record;
  normalized_prefix text;
begin
  if p_start_number < 1 or p_count < 1 or p_count > 60 then
    raise exception 'bulk table creation accepts between 1 and 60 tables';
  end if;
  normalized_prefix := coalesce(nullif(btrim(p_name_prefix), ''), 'Mesa');

  for item_number in p_start_number..(p_start_number + p_count - 1) loop
    select * into created
    from private.create_table_with_assets(
      p_venue_id,
      p_zone_id,
      item_number::text,
      normalized_prefix || ' ' || item_number::text,
      p_capacity
    );
    return query select
      created.table_id,
      item_number::text,
      normalized_prefix || ' ' || item_number::text,
      created.qr_token,
      created.presence_code;
  end loop;
end;
$$;

create or replace function private.reveal_table_qr_token(
  p_table_id uuid,
  p_reason text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  revealed_token text;
begin
  selected_tenant_id := private.require_tenant_context();
  perform private.assert_presence_management_permission(selected_tenant_id);
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'a concrete reveal reason is required';
  end if;

  select secret.decrypted_secret
  into revealed_token
  from private.table_qr_vault_secrets reference
  join vault.decrypted_secrets secret on secret.id = reference.vault_secret_id
  join public.tables table_record
    on table_record.tenant_id = reference.tenant_id
   and table_record.id = reference.table_id
   and table_record.qr_version = reference.qr_version
  where reference.tenant_id = selected_tenant_id
    and reference.table_id = p_table_id
    and reference.active
    and table_record.qr_active;

  if revealed_token is null then
    raise exception 'active QR is not available';
  end if;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id, reason
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'table.qr_revealed',
    'table', p_table_id, btrim(p_reason)
  );
  return revealed_token;
end;
$$;

create or replace function private.reveal_table_presence_code(
  p_table_id uuid,
  p_reason text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  revealed_code text;
begin
  selected_tenant_id := private.require_tenant_context();
  if not (
    private.has_permission(selected_tenant_id, 'presence.code.reveal')
    or private.has_permission(selected_tenant_id, 'configuration.manage')
  ) then
    raise exception 'presence code reveal permission is required'
      using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'a concrete reveal reason is required';
  end if;

  select secret.decrypted_secret
  into revealed_code
  from public.presence_code_rotations rotation
  join private.presence_code_vault_secrets reference
    on reference.tenant_id = rotation.tenant_id
   and reference.rotation_id = rotation.id
  join vault.decrypted_secrets secret on secret.id = reference.vault_secret_id
  where rotation.tenant_id = selected_tenant_id
    and rotation.table_id = p_table_id
    and rotation.state = 'active'
    and (rotation.expires_at is null or rotation.expires_at > clock_timestamp());

  if revealed_code is null then
    raise exception 'active presence code is not available';
  end if;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id, reason
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'table.presence_code_revealed',
    'table', p_table_id, btrim(p_reason)
  );
  return revealed_code;
end;
$$;

create or replace function private.rotate_table_qr(
  p_table_id uuid,
  p_reason text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  previous_version integer;
  next_version integer;
  generated_token text;
  created_secret_id uuid;
begin
  selected_tenant_id := private.require_tenant_context();
  perform private.assert_presence_management_permission(selected_tenant_id);
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'a concrete QR rotation reason is required';
  end if;

  select qr_version into previous_version
  from public.tables
  where tenant_id = selected_tenant_id and id = p_table_id
  for update;
  if previous_version is null then raise exception 'table not found'; end if;

  next_version := previous_version + 1;
  generated_token := private.generate_url_safe_token(32);
  select vault.create_secret(
    generated_token,
    'tablio.table_qr.' || p_table_id::text || '.' || next_version::text,
    'Token QR recuperable para reimpresión; acceso restringido y auditado.'
  ) into created_secret_id;

  update private.table_qr_vault_secrets
  set active = false, revoked_at = clock_timestamp()
  where tenant_id = selected_tenant_id and table_id = p_table_id and active;

  insert into private.table_qr_vault_secrets (
    tenant_id, table_id, qr_version, vault_secret_id
  ) values (selected_tenant_id, p_table_id, next_version, created_secret_id);

  update public.tables
  set qr_token_hash = extensions.digest(generated_token, 'sha256'),
      qr_version = next_version,
      qr_active = true,
      presence_assets_managed = true,
      updated_at = clock_timestamp()
  where tenant_id = selected_tenant_id and id = p_table_id;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id,
    reason, before_data, after_data
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'table.qr_rotated',
    'table', p_table_id, btrim(p_reason),
    jsonb_build_object('qr_version', previous_version),
    jsonb_build_object('qr_version', next_version)
  );
  return generated_token;
end;
$$;

create or replace function private.revoke_table_qr(
  p_table_id uuid,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
begin
  selected_tenant_id := private.require_tenant_context();
  perform private.assert_presence_management_permission(selected_tenant_id);
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'a concrete QR revocation reason is required';
  end if;
  update public.tables
  set qr_active = false, updated_at = clock_timestamp()
  where tenant_id = selected_tenant_id and id = p_table_id and qr_active;
  if not found then raise exception 'active QR not found'; end if;
  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id, reason
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'table.qr_revoked',
    'table', p_table_id, btrim(p_reason)
  );
end;
$$;

create or replace function private.rotate_table_presence_code(
  p_table_id uuid,
  p_reason text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  table_record public.tables%rowtype;
  generated_code text;
begin
  selected_tenant_id := private.require_tenant_context();
  if not (
    private.has_permission(selected_tenant_id, 'presence.code.rotate')
    or private.has_permission(selected_tenant_id, 'configuration.manage')
  ) then
    raise exception 'presence code rotation permission is required'
      using errcode = '42501';
  end if;
  select * into table_record
  from public.tables
  where tenant_id = selected_tenant_id and id = p_table_id
  for update;
  if table_record.id is null then raise exception 'table not found'; end if;

  select rotation.presence_code into generated_code
  from private.create_presence_rotation(
    selected_tenant_id, p_table_id,
    table_record.presence_delivery_level,
    table_record.presence_rotation_period,
    p_reason, auth.uid()
  ) rotation;

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id, reason
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'table.presence_code_rotated',
    'table', p_table_id, btrim(p_reason)
  );
  return generated_code;
end;
$$;

create or replace function private.apply_presence_policy_to_managed_tables(
  p_tenant_id uuid,
  p_zone_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.tables table_record
  set presence_required = policy.presence_required,
      presence_delivery_level = policy.delivery_level,
      presence_rotation_period = policy.rotation_period,
      presence_mode = case
        when policy.presence_required then 'required'
        else 'disabled'
      end,
      updated_at = clock_timestamp()
  from (
    select
      candidate.id as table_id,
      coalesce(zone_override.presence_required, tenant_setting.presence_required)
        as presence_required,
      coalesce(zone_override.delivery_level, tenant_setting.delivery_level)
        as delivery_level,
      coalesce(zone_override.rotation_period, tenant_setting.rotation_period)
        as rotation_period
    from public.tables candidate
    join public.tenant_presence_settings tenant_setting
      on tenant_setting.tenant_id = candidate.tenant_id
    left join public.zone_presence_overrides zone_override
      on zone_override.tenant_id = candidate.tenant_id
     and zone_override.zone_id = candidate.zone_id
    where candidate.tenant_id = p_tenant_id
      and candidate.presence_assets_managed
      and (p_zone_id is null or candidate.zone_id = p_zone_id)
  ) policy
  where table_record.tenant_id = p_tenant_id
    and table_record.id = policy.table_id;
end;
$$;

create or replace function private.reconcile_managed_presence_codes(
  p_tenant_id uuid,
  p_zone_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate record;
begin
  for candidate in
    select
      table_record.id,
      table_record.presence_delivery_level,
      table_record.presence_rotation_period
    from public.tables table_record
    left join public.presence_code_rotations rotation
      on rotation.tenant_id = table_record.tenant_id
     and rotation.table_id = table_record.id
     and rotation.state = 'active'
    where table_record.tenant_id = p_tenant_id
      and table_record.presence_assets_managed
      and (p_zone_id is null or table_record.zone_id = p_zone_id)
      and (
        rotation.id is null
        or rotation.delivery_level <> table_record.presence_delivery_level
        or rotation.rotation_period <> table_record.presence_rotation_period
        or (rotation.expires_at is not null and rotation.expires_at <= clock_timestamp())
      )
    for update of table_record
  loop
    perform private.create_presence_rotation(
      p_tenant_id, candidate.id, candidate.presence_delivery_level,
      candidate.presence_rotation_period, 'Política de presencia actualizada', auth.uid()
    );
  end loop;
end;
$$;

create or replace function private.configure_tenant_presence(
  p_presence_required boolean,
  p_delivery_level text,
  p_rotation_period text,
  p_device_attempt_limit integer default 5,
  p_table_attempt_limit integer default 25,
  p_attempt_window_seconds integer default 300,
  p_block_seconds integer default 900
)
returns public.tenant_presence_settings
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  before_setting jsonb;
  result public.tenant_presence_settings%rowtype;
begin
  selected_tenant_id := private.require_tenant_context();
  perform private.assert_presence_management_permission(selected_tenant_id);
  select to_jsonb(setting) into before_setting
  from public.tenant_presence_settings setting
  where tenant_id = selected_tenant_id;

  update public.tenant_presence_settings
  set presence_required = p_presence_required,
      delivery_level = p_delivery_level,
      rotation_period = p_rotation_period,
      device_attempt_limit = p_device_attempt_limit,
      table_attempt_limit = p_table_attempt_limit,
      attempt_window_seconds = p_attempt_window_seconds,
      block_seconds = p_block_seconds,
      updated_by_user_id = auth.uid(),
      updated_at = clock_timestamp()
  where tenant_id = selected_tenant_id
  returning * into result;
  perform private.apply_presence_policy_to_managed_tables(selected_tenant_id);
  perform private.reconcile_managed_presence_codes(selected_tenant_id);

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id,
    reason, before_data, after_data
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'presence.tenant_policy_changed',
    'tenant', selected_tenant_id, 'Configuración de presencia actualizada',
    before_setting, to_jsonb(result)
  );
  return result;
end;
$$;

create or replace function private.configure_zone_presence(
  p_zone_id uuid,
  p_presence_required boolean default null,
  p_delivery_level text default null,
  p_rotation_period text default null
)
returns public.zone_presence_overrides
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
  result public.zone_presence_overrides%rowtype;
begin
  selected_tenant_id := private.require_tenant_context();
  perform private.assert_presence_management_permission(selected_tenant_id);
  if not exists (
    select 1 from public.zones
    where tenant_id = selected_tenant_id and id = p_zone_id
  ) then raise exception 'zone not found'; end if;
  if p_presence_required is null and p_delivery_level is null and p_rotation_period is null then
    raise exception 'at least one zone override is required';
  end if;

  insert into public.zone_presence_overrides (
    tenant_id, zone_id, presence_required, delivery_level, rotation_period,
    updated_by_user_id
  ) values (
    selected_tenant_id, p_zone_id, p_presence_required, p_delivery_level,
    p_rotation_period, auth.uid()
  )
  on conflict (tenant_id, zone_id) do update
  set presence_required = excluded.presence_required,
      delivery_level = excluded.delivery_level,
      rotation_period = excluded.rotation_period,
      updated_by_user_id = auth.uid(),
      updated_at = clock_timestamp()
  returning * into result;
  perform private.apply_presence_policy_to_managed_tables(selected_tenant_id, p_zone_id);
  perform private.reconcile_managed_presence_codes(selected_tenant_id, p_zone_id);

  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id,
    reason, after_data
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'presence.zone_policy_changed',
    'zone', p_zone_id, 'Override de presencia actualizado', to_jsonb(result)
  );
  return result;
end;
$$;

create or replace function private.clear_zone_presence_override(p_zone_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_tenant_id uuid;
begin
  selected_tenant_id := private.require_tenant_context();
  perform private.assert_presence_management_permission(selected_tenant_id);
  delete from public.zone_presence_overrides
  where tenant_id = selected_tenant_id and zone_id = p_zone_id;
  perform private.apply_presence_policy_to_managed_tables(selected_tenant_id, p_zone_id);
  perform private.reconcile_managed_presence_codes(selected_tenant_id, p_zone_id);
  insert into public.audit_log (
    tenant_id, actor_type, actor_user_id, action, target_type, target_id, reason
  ) values (
    selected_tenant_id, 'user', auth.uid(), 'presence.zone_override_cleared',
    'zone', p_zone_id, 'La zona vuelve a usar la configuración del bar'
  );
end;
$$;

create or replace function private.verify_table_presence(
  p_qr_token text,
  p_presence_code text,
  p_device_fingerprint text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  table_record public.tables%rowtype;
  setting public.tenant_presence_settings%rowtype;
  device_hash bytea;
  window_start timestamptz;
  active_block timestamptz;
  device_failures integer;
  table_failures integer;
  result_outcome text;
  new_block_until timestamptz;
begin
  if p_qr_token is null or length(p_qr_token) < 20
     or p_device_fingerprint is null or length(p_device_fingerprint) < 16 then
    return jsonb_build_object('verified', false, 'code', 'invalid');
  end if;
  select * into table_record
  from public.tables
  where qr_token_hash = extensions.digest(p_qr_token, 'sha256')
    and qr_active and active
  for update;
  if table_record.id is null then
    return jsonb_build_object('verified', false, 'code', 'invalid');
  end if;
  if not table_record.presence_required then
    return jsonb_build_object(
      'verified', true, 'table_id', table_record.id,
      'tenant_id', table_record.tenant_id
    );
  end if;

  select * into setting
  from public.tenant_presence_settings
  where tenant_id = table_record.tenant_id;
  device_hash := extensions.digest(p_device_fingerprint, 'sha256');
  window_start := clock_timestamp() - make_interval(secs => setting.attempt_window_seconds);

  select max(blocked_until) into active_block
  from private.presence_verification_attempts
  where tenant_id = table_record.tenant_id
    and table_id = table_record.id
    and attempted_at >= window_start
    and blocked_until > clock_timestamp()
    and (
      outcome = 'table_blocked'
      or (outcome = 'device_blocked' and device_fingerprint_hash = device_hash)
    );
  if active_block is not null then
    return jsonb_build_object(
      'verified', false, 'code', 'temporarily_blocked',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from active_block - clock_timestamp())))::integer
    );
  end if;

  if p_presence_code is not null
     and extensions.digest(p_presence_code, 'sha256') = table_record.presence_code_hash
     and (
       table_record.presence_code_expires_at is null
       or table_record.presence_code_expires_at > clock_timestamp()
     ) then
    insert into private.presence_verification_attempts (
      tenant_id, table_id, device_fingerprint_hash, succeeded, outcome
    ) values (
      table_record.tenant_id, table_record.id, device_hash, true, 'verified'
    );
    return jsonb_build_object(
      'verified', true, 'table_id', table_record.id,
      'tenant_id', table_record.tenant_id
    );
  end if;

  select count(*)::integer into device_failures
  from private.presence_verification_attempts
  where tenant_id = table_record.tenant_id
    and table_id = table_record.id
    and device_fingerprint_hash = device_hash
    and not succeeded
    and attempted_at >= window_start;
  select count(*)::integer into table_failures
  from private.presence_verification_attempts
  where tenant_id = table_record.tenant_id
    and table_id = table_record.id
    and not succeeded
    and attempted_at >= window_start;

  if table_failures + 1 >= setting.table_attempt_limit then
    result_outcome := 'table_blocked';
    new_block_until := clock_timestamp() + make_interval(secs => setting.block_seconds);
  elsif device_failures + 1 >= setting.device_attempt_limit then
    result_outcome := 'device_blocked';
    new_block_until := clock_timestamp() + make_interval(secs => setting.block_seconds);
  else
    result_outcome := 'invalid_code';
    new_block_until := null;
  end if;

  insert into private.presence_verification_attempts (
    tenant_id, table_id, device_fingerprint_hash, succeeded, outcome, blocked_until
  ) values (
    table_record.tenant_id, table_record.id, device_hash, false,
    result_outcome, new_block_until
  );
  if new_block_until is not null then
    insert into public.audit_log (
      tenant_id, actor_type, action, target_type, target_id, reason, after_data
    ) values (
      table_record.tenant_id, 'platform', 'presence.attempts_blocked',
      'table', table_record.id, 'Demasiados códigos incorrectos',
      jsonb_build_object('scope', result_outcome, 'blocked_until', new_block_until)
    );
  end if;
  return jsonb_build_object(
    'verified', false,
    'code', case when new_block_until is null then 'invalid_code' else 'temporarily_blocked' end,
    'retry_after_seconds', case when new_block_until is null then null else setting.block_seconds end
  );
end;
$$;

create or replace function private.rotate_due_daily_presence_codes(
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate record;
  rotated_count integer := 0;
begin
  for candidate in
    select table_record.tenant_id, table_record.id
    from public.tables table_record
    where table_record.active
      and table_record.presence_assets_managed
      and table_record.presence_required
      and table_record.presence_delivery_level = 'rotating'
      and table_record.presence_rotation_period = 'daily'
      and (
        table_record.presence_code_expires_at is null
        or table_record.presence_code_expires_at <= p_now
      )
    for update skip locked
  loop
    perform private.create_presence_rotation(
      candidate.tenant_id, candidate.id, 'rotating', 'daily',
      'Rotación diaria automática', null
    );
    rotated_count := rotated_count + 1;
  end loop;
  return rotated_count;
end;
$$;

create or replace function private.rotate_shift_presence_codes()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate record;
begin
  if new.status <> 'open' then return new; end if;
  for candidate in
    select id
    from public.tables
    where tenant_id = new.tenant_id
      and venue_id = new.venue_id
      and active
      and presence_assets_managed
      and presence_required
      and presence_delivery_level = 'rotating'
      and presence_rotation_period = 'shift'
    for update
  loop
    perform private.create_presence_rotation(
      new.tenant_id, candidate.id, 'rotating', 'shift',
      'Rotación automática al abrir turno', null
    );
  end loop;
  return new;
end;
$$;

create trigger cashier_shift_rotate_presence_codes
after insert on public.cashier_shifts
for each row execute function private.rotate_shift_presence_codes();

insert into public.tenant_presence_settings (tenant_id)
select tenant.id from public.tenants tenant
on conflict (tenant_id) do nothing;

create or replace function private.seed_tenant_presence_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_presence_settings (tenant_id) values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

create trigger tenant_seed_presence_settings
after insert on public.tenants
for each row execute function private.seed_tenant_presence_settings();

insert into public.permissions (code, description)
values
  ('presence.code.reveal', 'Revelar el código vigente de una mesa con motivo auditado.'),
  ('presence.code.rotate', 'Rotar el código de presencia de una mesa.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('waiter', 'presence.code.reveal'),
  ('cashier_admin', 'presence.code.reveal'),
  ('cashier_admin', 'presence.code.rotate'),
  ('owner', 'presence.code.reveal'),
  ('owner', 'presence.code.rotate')
on conflict do nothing;

alter table public.tenant_presence_settings enable row level security;
alter table public.tenant_presence_settings force row level security;
alter table public.zone_presence_overrides enable row level security;
alter table public.zone_presence_overrides force row level security;
alter table public.presence_code_rotations enable row level security;
alter table public.presence_code_rotations force row level security;
alter table private.table_qr_vault_secrets enable row level security;
alter table private.table_qr_vault_secrets force row level security;
alter table private.presence_code_vault_secrets enable row level security;
alter table private.presence_code_vault_secrets force row level security;
alter table private.presence_verification_attempts enable row level security;
alter table private.presence_verification_attempts force row level security;

create policy tenant_presence_settings_select
on public.tenant_presence_settings for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.read'))
);
create policy zone_presence_overrides_select
on public.zone_presence_overrides for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'configuration.read'))
);
create policy presence_code_rotations_select
on public.presence_code_rotations for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (
    (select private.has_permission(tenant_id, 'configuration.read'))
    or (select private.has_permission(tenant_id, 'presence.code.reveal'))
  )
);

create policy table_qr_vault_secrets_deny
on private.table_qr_vault_secrets as restrictive for all to public
using (false) with check (false);
create policy presence_code_vault_secrets_deny
on private.presence_code_vault_secrets as restrictive for all to public
using (false) with check (false);
create policy presence_verification_attempts_deny
on private.presence_verification_attempts as restrictive for all to public
using (false) with check (false);

revoke all on table
  public.tenant_presence_settings,
  public.zone_presence_overrides,
  public.presence_code_rotations
from public, anon;
grant select on table
  public.tenant_presence_settings,
  public.zone_presence_overrides,
  public.presence_code_rotations
to authenticated;
revoke all on table
  private.table_qr_vault_secrets,
  private.presence_code_vault_secrets,
  private.presence_verification_attempts
from public, anon, authenticated;
grant select, insert, update, delete on table
  private.table_qr_vault_secrets,
  private.presence_code_vault_secrets,
  private.presence_verification_attempts
to service_role;

-- Public RPCs are invoker-only facades. Their privileged implementations live
-- in the non-exposed private schema and repeat tenant and permission checks.
create function public.create_table_with_assets(
  p_venue_id uuid,
  p_zone_id uuid,
  p_table_number text,
  p_display_name text,
  p_capacity integer
)
returns table(
  table_id uuid,
  presence_required boolean,
  presence_delivery_level text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select
    created.table_id,
    created.presence_required,
    created.presence_delivery_level
  from private.create_table_with_assets(
    p_venue_id, p_zone_id, p_table_number, p_display_name, p_capacity
  ) created;
$$;

create function public.create_tables_with_assets(
  p_venue_id uuid,
  p_zone_id uuid,
  p_start_number integer,
  p_count integer,
  p_name_prefix text default 'Mesa',
  p_capacity integer default 4
)
returns table(
  table_id uuid,
  table_number text,
  display_name text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select created.table_id, created.table_number, created.display_name
  from private.create_tables_with_assets(
    p_venue_id, p_zone_id, p_start_number, p_count, p_name_prefix, p_capacity
  ) created;
$$;

create function public.reveal_table_qr_token(p_table_id uuid, p_reason text)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$ select private.reveal_table_qr_token(p_table_id, p_reason); $$;

create function public.reveal_table_presence_code(p_table_id uuid, p_reason text)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$ select private.reveal_table_presence_code(p_table_id, p_reason); $$;

create function public.rotate_table_qr(p_table_id uuid, p_reason text)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$ select private.rotate_table_qr(p_table_id, p_reason); $$;

create function public.revoke_table_qr(p_table_id uuid, p_reason text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$ select private.revoke_table_qr(p_table_id, p_reason); $$;

create function public.rotate_table_presence_code(p_table_id uuid, p_reason text)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$ select private.rotate_table_presence_code(p_table_id, p_reason); $$;

create function public.configure_tenant_presence(
  p_presence_required boolean,
  p_delivery_level text,
  p_rotation_period text,
  p_device_attempt_limit integer default 5,
  p_table_attempt_limit integer default 25,
  p_attempt_window_seconds integer default 300,
  p_block_seconds integer default 900
)
returns public.tenant_presence_settings
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.configure_tenant_presence(
    p_presence_required, p_delivery_level, p_rotation_period,
    p_device_attempt_limit, p_table_attempt_limit,
    p_attempt_window_seconds, p_block_seconds
  );
$$;

create function public.configure_zone_presence(
  p_zone_id uuid,
  p_presence_required boolean default null,
  p_delivery_level text default null,
  p_rotation_period text default null
)
returns public.zone_presence_overrides
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.configure_zone_presence(
    p_zone_id, p_presence_required, p_delivery_level, p_rotation_period
  );
$$;

create function public.clear_zone_presence_override(p_zone_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$ select private.clear_zone_presence_override(p_zone_id); $$;

create function public.verify_table_presence(
  p_qr_token text,
  p_presence_code text,
  p_device_fingerprint text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.verify_table_presence(
    p_qr_token, p_presence_code, p_device_fingerprint
  );
$$;

revoke all on function
  private.create_table_with_assets(uuid,uuid,text,text,integer),
  private.create_tables_with_assets(uuid,uuid,integer,integer,text,integer),
  private.reveal_table_qr_token(uuid,text),
  private.reveal_table_presence_code(uuid,text),
  private.rotate_table_qr(uuid,text),
  private.revoke_table_qr(uuid,text),
  private.rotate_table_presence_code(uuid,text),
  private.configure_tenant_presence(boolean,text,text,integer,integer,integer,integer),
  private.configure_zone_presence(uuid,boolean,text,text),
  private.clear_zone_presence_override(uuid),
  private.verify_table_presence(text,text,text)
from public, anon, authenticated;
grant execute on function
  private.create_table_with_assets(uuid,uuid,text,text,integer),
  private.create_tables_with_assets(uuid,uuid,integer,integer,text,integer),
  private.reveal_table_qr_token(uuid,text),
  private.reveal_table_presence_code(uuid,text),
  private.rotate_table_qr(uuid,text),
  private.revoke_table_qr(uuid,text),
  private.rotate_table_presence_code(uuid,text),
  private.configure_tenant_presence(boolean,text,text,integer,integer,integer,integer),
  private.configure_zone_presence(uuid,boolean,text,text),
  private.clear_zone_presence_override(uuid)
to authenticated;
-- `anon` needs namespace usage only so the public invoker facade can reach the
-- one explicitly granted verifier. No table or other private-function grant is added.
grant usage on schema private to anon;
grant execute on function private.verify_table_presence(text,text,text)
to anon, authenticated;

revoke all on function
  public.create_table_with_assets(uuid,uuid,text,text,integer),
  public.create_tables_with_assets(uuid,uuid,integer,integer,text,integer),
  public.reveal_table_qr_token(uuid,text),
  public.reveal_table_presence_code(uuid,text),
  public.rotate_table_qr(uuid,text),
  public.revoke_table_qr(uuid,text),
  public.rotate_table_presence_code(uuid,text),
  public.configure_tenant_presence(boolean,text,text,integer,integer,integer,integer),
  public.configure_zone_presence(uuid,boolean,text,text),
  public.clear_zone_presence_override(uuid)
from public, anon;
grant execute on function
  public.create_table_with_assets(uuid,uuid,text,text,integer),
  public.create_tables_with_assets(uuid,uuid,integer,integer,text,integer),
  public.reveal_table_qr_token(uuid,text),
  public.reveal_table_presence_code(uuid,text),
  public.rotate_table_qr(uuid,text),
  public.revoke_table_qr(uuid,text),
  public.rotate_table_presence_code(uuid,text),
  public.configure_tenant_presence(boolean,text,text,integer,integer,integer,integer),
  public.configure_zone_presence(uuid,boolean,text,text),
  public.clear_zone_presence_override(uuid)
to authenticated;
revoke all on function public.verify_table_presence(text,text,text) from public;
grant execute on function public.verify_table_presence(text,text,text) to anon, authenticated;

revoke all on function
  private.create_presence_rotation(uuid,uuid,text,text,text,uuid),
  private.assert_presence_management_permission(uuid),
  private.apply_presence_policy_to_managed_tables(uuid,uuid),
  private.reconcile_managed_presence_codes(uuid,uuid),
  private.rotate_due_daily_presence_codes(timestamptz)
from public, anon, authenticated;
grant execute on function private.rotate_due_daily_presence_codes(timestamptz) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tablio-presence-daily-rotation') then
    perform cron.unschedule('tablio-presence-daily-rotation');
  end if;
  perform cron.schedule(
    'tablio-presence-daily-rotation',
    '5 * * * *',
    'select private.rotate_due_daily_presence_codes(clock_timestamp());'
  );
end;
$$;

comment on table private.table_qr_vault_secrets is
'Maps each QR version to an encrypted Vault secret. Moving from hash-only to a recoverable token is deliberate: it enables reprinting without invalidation, at the cost of making authorised decryption security-critical.';
comment on function public.reveal_table_qr_token(uuid,text) is
'Returns an active QR token only to a tenant manager and always writes an audit record. Intended for server-side SVG rendering; never return the plaintext token to the browser.';
comment on table public.presence_code_rotations is
'Level 1 proves knowledge of the printed card, not strong physical presence. Level 2 separates the code; level 3 rotates daily or at shift opening.';
