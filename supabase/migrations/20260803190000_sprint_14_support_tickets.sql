-- Tarea 4 (Soporte): dominio nuevo desde cero, por decisión explícita del
-- fundador — no reutiliza `tickets`/`ticket_state_events` (esas son comandas
-- de cocina/barra del Sprint 2, un concepto de negocio completamente
-- distinto que sólo comparte el nombre en español). Este es "el dueño le
-- escribe a Tablio", no "la cocina prepara un pedido".
--
-- `author_type = 'platform'` existe desde ahora porque un hilo de soporte
-- sin la mitad "responde Tablio" no es un dominio completo — pero todavía no
-- hay identidad de staff de plataforma respondiendo desde la app (eso es
-- Superadmin, fuera de alcance de este incremento). Por ahora sólo
-- 'owner' escribe; 'platform' queda modelado y sin RPC/UI que lo produzca
-- todavía, para no bloquear el dominio completo en esa pieza faltante.

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  subject text not null check (btrim(subject) <> ''),
  category text not null check (category in ('billing', 'technical', 'other')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create index support_tickets_tenant_idx on public.support_tickets (tenant_id, created_at desc);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null,
  author_type text not null check (author_type in ('owner', 'platform')),
  author_user_id uuid references auth.users (id) on delete restrict,
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, ticket_id)
    references public.support_tickets (tenant_id, id) on delete restrict
);

create index support_ticket_messages_ticket_idx
  on public.support_ticket_messages (tenant_id, ticket_id, created_at);

create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function private.set_updated_at();

alter table public.support_tickets enable row level security;
alter table public.support_tickets force row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_messages force row level security;

create policy support_tickets_select
on public.support_tickets for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'support.read'))
);
create policy support_tickets_insert
on public.support_tickets for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'support.manage'))
  and created_by = auth.uid()
);
create policy support_tickets_update
on public.support_tickets for update to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'support.manage'))
)
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'support.manage'))
);

create policy support_ticket_messages_select
on public.support_ticket_messages for select to authenticated
using (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'support.read'))
);
create policy support_ticket_messages_insert
on public.support_ticket_messages for insert to authenticated
with check (
  tenant_id = (select private.current_tenant_id())
  and (select private.has_permission(tenant_id, 'support.manage'))
  and author_type = 'owner'
  and author_user_id = auth.uid()
);

insert into public.permissions (code, description)
values
  ('support.read', 'Leer tickets de soporte del tenant.'),
  ('support.manage', 'Crear tickets de soporte y responder en ellos.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_code, permission_code)
values
  ('owner', 'support.read'),
  ('owner', 'support.manage')
on conflict do nothing;

revoke all on table public.support_tickets from public, anon;
revoke all on table public.support_ticket_messages from public, anon;
grant select, insert, update on table public.support_tickets to authenticated;
grant select, insert on table public.support_ticket_messages to authenticated;
