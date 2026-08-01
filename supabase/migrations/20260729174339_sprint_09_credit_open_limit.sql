-- Once the venue exposure ceiling is reached, opening another table credit is
-- forbidden even though a newly opened account would initially have zero debt.

do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef(
    'public.open_table_credit(uuid,uuid,uuid,text,text)'::regprocedure
  )
  into definition;

  corrected := replace(
    definition,
    E'  account_id uuid;\n',
    E'  account_id uuid;\n  venue_exposure bigint;\n'
  );
  corrected := replace(
    corrected,
    E'  if not found or not settings.enabled then\n'
      || E'    raise exception ''table credit is disabled'' using errcode = ''55000'';\n'
      || E'  end if;\n'
      || E'  if not exists (',
    E'  if not found or not settings.enabled then\n'
      || E'    raise exception ''table credit is disabled'' using errcode = ''55000'';\n'
      || E'  end if;\n'
      || E'  select coalesce(sum(account.outstanding_clp), 0)\n'
      || E'  into venue_exposure\n'
      || E'  from public.table_credit_accounts account\n'
      || E'  where account.tenant_id = tenant\n'
      || E'    and account.venue_id = p_venue_id\n'
      || E'    and account.status in (''open'', ''bill_requested'', ''expired'');\n'
      || E'  if venue_exposure >= settings.max_venue_exposure_clp then\n'
      || E'    raise exception ''venue credit exposure limit reached''\n'
      || E'      using errcode = ''23514'';\n'
      || E'  end if;\n'
      || E'  if not exists ('
  );

  if corrected = definition then
    raise exception 'open_table_credit definition was not recognized';
  end if;

  execute corrected;
end;
$migration$;
