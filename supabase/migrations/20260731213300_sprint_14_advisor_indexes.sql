-- Sprint 14: índices de cobertura solicitados por Performance Advisor.
-- Son claves de auditoría poco consultadas hoy, pero deben permitir borrados y joins
-- sobre auth.users sin escanear las tablas completas cuando exista tráfico real.

create index if not exists tenant_presence_settings_updated_by_user_idx
  on public.tenant_presence_settings (updated_by_user_id)
  where updated_by_user_id is not null;

create index if not exists zone_presence_overrides_updated_by_user_idx
  on public.zone_presence_overrides (updated_by_user_id)
  where updated_by_user_id is not null;

create index if not exists presence_code_rotations_created_by_user_idx
  on public.presence_code_rotations (created_by_user_id)
  where created_by_user_id is not null;
