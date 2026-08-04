-- OI-034 Incremento 1: private.require_diner_device_session().
--
-- No pudo ejercitarse contra la base real (nada en el esquema cierra una
-- table_session todavía, y esta máquina no tiene Docker para correr un
-- stack local — mismo hueco que ya documenta OI-031). Este archivo cubre
-- por pgTAP las cuatro ramas críticas, para cuando exista dónde correrlo.
-- Los fixtures insertan directo en table_sessions/diner_device_sessions
-- (no pasan por enter_table) porque lo que se prueba es la validación, no
-- la creación — eso ya se verificó en vivo contra el proyecto real.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email)
values ('50000000-0000-4000-8000-000000000001', 'diner-session-owner@test.local');

insert into public.tenants (id, legal_name, display_name, slug, status)
values (
  '10000000-0000-4000-8000-0000000000d1',
  'Diner Session SpA', 'Diner Session Test', 'diner-session-test', 'active'
);

insert into public.venues (id, tenant_id, code, name)
values (
  '30000000-0000-4000-8000-0000000000d1',
  '10000000-0000-4000-8000-0000000000d1',
  'venue-diner-session', 'Venue Diner Session'
);

insert into public.zones (id, tenant_id, venue_id, code, name)
values (
  '40000000-0000-4000-8000-0000000000d1',
  '10000000-0000-4000-8000-0000000000d1',
  '30000000-0000-4000-8000-0000000000d1',
  'zone-diner-session', 'Zone Diner Session'
);

insert into public.tables (
  id, tenant_id, venue_id, zone_id, table_number, display_name, capacity,
  qr_token_hash, qr_version, qr_active
)
values (
  '60000000-0000-4000-8000-0000000000d1',
  '10000000-0000-4000-8000-0000000000d1',
  '30000000-0000-4000-8000-0000000000d1',
  '40000000-0000-4000-8000-0000000000d1',
  '1', 'Mesa de prueba', 4,
  extensions.digest('irrelevant-for-this-test', 'sha256'), 1, true
);

-- Mesa A: table_session activa. Mesa B: table_session ya cerrada.
insert into public.table_sessions (id, tenant_id, table_id, state)
values
  ('70000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1',
   '60000000-0000-4000-8000-0000000000d1', 'active'),
  ('70000000-0000-4000-8000-0000000000d2', '10000000-0000-4000-8000-0000000000d1',
   '60000000-0000-4000-8000-0000000000d1', 'closed');

-- Sesión válida, sobre la mesa activa.
insert into public.diner_device_sessions (
  id, tenant_id, table_session_id, token_hash, alias
)
values (
  '80000000-0000-4000-8000-0000000000d1',
  '10000000-0000-4000-8000-0000000000d1',
  '70000000-0000-4000-8000-0000000000d1',
  extensions.digest('valid-session-token', 'sha256'),
  'Zorro Azul'
);

-- Sesión que "sobrevivió" a una mesa ya cerrada (simula el caso que la
-- validación debe cazar, ya que nada cierra table_sessions todavía y por
-- lo tanto nada la revoca automáticamente al cerrarse).
insert into public.diner_device_sessions (
  id, tenant_id, table_session_id, token_hash, alias
)
values (
  '80000000-0000-4000-8000-0000000000d2',
  '10000000-0000-4000-8000-0000000000d1',
  '70000000-0000-4000-8000-0000000000d2',
  extensions.digest('closed-table-session-token', 'sha256'),
  'Puma Verde'
);

-- Sesión ya vencida por tiempo (idle_expires_at en el pasado).
insert into public.diner_device_sessions (
  id, tenant_id, table_session_id, token_hash, alias,
  created_at, last_seen_at, idle_expires_at, absolute_expires_at
)
values (
  '80000000-0000-4000-8000-0000000000d3',
  '10000000-0000-4000-8000-0000000000d1',
  '70000000-0000-4000-8000-0000000000d1',
  extensions.digest('expired-session-token', 'sha256'),
  'Búho Violeta',
  now() - interval '13 hours',
  now() - interval '13 hours',
  now() - interval '9 hours',
  now() - interval '1 hour'
);

-- 1) Sesión válida, mesa correcta: pasa y devuelve el alias esperado.
select is(
  (select alias from private.require_diner_device_session(
    'valid-session-token', '60000000-0000-4000-8000-0000000000d1'
  )),
  'Zorro Azul',
  'sesión válida sobre su propia mesa: aceptada'
);

-- 2) Mismo token, pero pidiendo una mesa distinta a la que pertenece: debe
--    rechazar (evita que una prueba de sesión se reuse contra otra mesa).
select throws_ok(
  $$select * from private.require_diner_device_session(
    'valid-session-token', '00000000-0000-4000-8000-000000000000'
  )$$,
  '42501',
  'session does not belong to this table',
  'token válido pero mesa equivocada: rechazado'
);

-- 3) Sesión cuya table_session ya está 'closed': debe rechazar, aunque sus
--    propios timestamps de idle/absoluto todavía no hayan vencido — no debe
--    sobrevivir al cierre de la mesa.
select throws_ok(
  $$select * from private.require_diner_device_session(
    'closed-table-session-token', '60000000-0000-4000-8000-0000000000d1'
  )$$,
  '42501',
  'table session is no longer open',
  'mesa cerrada: la sesión del comensal deja de ser válida'
);

-- 4) La sesión anterior debe quedar marcada 'revoked' tras el rechazo (no
--    sólo rechazada esta vez: inhabilitada para cualquier intento futuro).
select is(
  (select state from public.diner_device_sessions
   where id = '80000000-0000-4000-8000-0000000000d2'),
  'revoked',
  'mesa cerrada: la sesión queda revocada, no sólo rechazada una vez'
);

-- 5) Sesión vencida por tiempo: debe rechazar aunque su mesa siga activa.
select throws_ok(
  $$select * from private.require_diner_device_session(
    'expired-session-token', '60000000-0000-4000-8000-0000000000d1'
  )$$,
  '42501',
  'session expired',
  'sesión vencida por inactividad: rechazada aunque la mesa siga activa'
);

select * from finish();
rollback;
