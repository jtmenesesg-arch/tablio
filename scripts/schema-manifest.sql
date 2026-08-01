-- Manifiesto determinista del esquema Tablio.
-- Excluye objetos internos administrados por Supabase y secretos/datos de negocio.
-- Incluye todo lo que las migraciones de Tablio deben poder reproducir.

with schema_objects as (
  select
    'table'::text as object_type,
    format('%I.%I', ns.nspname, cls.relname) as object_name,
    jsonb_build_object(
      'rls', cls.relrowsecurity,
      'force_rls', cls.relforcerowsecurity,
      'acl', coalesce(cls.relacl::text, '')
    )::text as definition
  from pg_class cls
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname in ('public', 'private')
    and cls.relkind in ('r', 'p')

  union all

  select
    'column',
    format('%I.%I.%I', ns.nspname, cls.relname, attr.attname),
    jsonb_build_object(
      'position', attr.attnum,
      'type', pg_catalog.format_type(attr.atttypid, attr.atttypmod),
      'not_null', attr.attnotnull,
      'identity', attr.attidentity,
      'generated', attr.attgenerated,
      'default', pg_get_expr(def.adbin, def.adrelid)
    )::text
  from pg_attribute attr
  join pg_class cls on cls.oid = attr.attrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  left join pg_attrdef def
    on def.adrelid = attr.attrelid
   and def.adnum = attr.attnum
  where ns.nspname in ('public', 'private')
    and cls.relkind in ('r', 'p')
    and attr.attnum > 0
    and not attr.attisdropped

  union all

  select
    'constraint',
    format('%I.%I.%I', ns.nspname, cls.relname, con.conname),
    pg_get_constraintdef(con.oid, true)
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname in ('public', 'private')

  union all

  select
    'index',
    format('%I.%I', ns.nspname, idx.relname),
    pg_get_indexdef(idx.oid)
  from pg_class idx
  join pg_namespace ns on ns.oid = idx.relnamespace
  join pg_index ind on ind.indexrelid = idx.oid
  join pg_class tbl on tbl.oid = ind.indrelid
  where ns.nspname in ('public', 'private')
    and not exists (
      select 1
      from pg_constraint con
      where con.conindid = idx.oid
    )

  union all

  select
    case cls.relkind when 'm' then 'materialized_view' else 'view' end,
    format('%I.%I', ns.nspname, cls.relname),
    pg_get_viewdef(cls.oid, true)
  from pg_class cls
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname in ('public', 'private')
    and cls.relkind in ('v', 'm')

  union all

  select
    'function',
    format(
      '%I.%I(%s)',
      ns.nspname,
      proc.proname,
      pg_get_function_identity_arguments(proc.oid)
    ),
    pg_get_functiondef(proc.oid)
  from pg_proc proc
  join pg_namespace ns on ns.oid = proc.pronamespace
  where ns.nspname in ('public', 'private')

  union all

  select
    'trigger',
    format('%I.%I.%I', ns.nspname, cls.relname, trg.tgname),
    pg_get_triggerdef(trg.oid, true)
  from pg_trigger trg
  join pg_class cls on cls.oid = trg.tgrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname in ('public', 'private')
    and not trg.tgisinternal

  union all

  select
    'policy',
    format('%I.%I.%I', schemaname, tablename, policyname),
    jsonb_build_object(
      'permissive', permissive,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'check', with_check
    )::text
  from pg_policies
  where schemaname in ('public', 'private')

  union all

  select
    'enum',
    format('%I.%I.%s', ns.nspname, typ.typname, enum.enumsortorder),
    enum.enumlabel
  from pg_enum enum
  join pg_type typ on typ.oid = enum.enumtypid
  join pg_namespace ns on ns.oid = typ.typnamespace
  where ns.nspname in ('public', 'private')

  union all

  select
    'realtime_publication',
    format('%I.%I', schemaname, tablename),
    'supabase_realtime'
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname in ('public', 'private')
)
select object_type, object_name, definition
from schema_objects
order by object_type, object_name, definition;
