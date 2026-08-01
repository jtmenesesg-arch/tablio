-- The original Sprint 9 deployment compiled this function with PostgreSQL's
-- strict variable/column ambiguity rule. Recompile it with the explicit
-- PL/pgSQL policy versioned in the canonical migration.

do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef(
    'public.create_table_credit_order(uuid,uuid,text)'::regprocedure
  )
  into definition;

  if position('#variable_conflict use_variable' in definition) > 0 then
    return;
  end if;

  corrected := regexp_replace(
    definition,
    '(AS \\$function\\$[[:space:]]*)(declare)',
    E'\\1#variable_conflict use_variable\n\\2',
    'i'
  );

  if corrected = definition then
    raise exception 'create_table_credit_order definition was not recognized';
  end if;

  execute corrected;
end;
$migration$;
