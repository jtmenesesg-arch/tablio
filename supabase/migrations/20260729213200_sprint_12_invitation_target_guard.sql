create or replace function private.validate_invitation_quote_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invitation_target_table_session_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.table_sessions target
    where target.tenant_id = new.tenant_id
      and target.id = new.invitation_target_table_session_id
      and target.state = 'active'
      and (target.expires_at is null or target.expires_at > clock_timestamp())
  ) then
    raise exception 'the invitation destination table is not active'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger checkout_quote_items_validate_invitation_target
before insert on public.checkout_quote_items
for each row execute function private.validate_invitation_quote_target();
