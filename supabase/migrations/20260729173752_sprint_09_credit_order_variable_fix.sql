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

  corrected := replace(
    definition,
    E'AS $function$\\ndeclare',
    E'AS $function$\\n#variable_conflict use_variable\\ndeclare'
  );

  if corrected = definition then
    raise exception 'create_table_credit_order definition was not recognized';
  end if;

  execute corrected;
end;
$migration$;
