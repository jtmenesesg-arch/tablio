-- Sprint 14 advisor follow-up: the integer FOR loop owns its iterator.
-- Do not declare a second variable with the same name.
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

revoke all on function
  private.create_tables_with_assets(uuid,uuid,integer,integer,text,integer)
from public, anon, authenticated;
grant execute on function
  private.create_tables_with_assets(uuid,uuid,integer,integer,text,integer)
to authenticated;
