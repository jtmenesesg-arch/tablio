-- Historical repair. Its policy is now declared directly in the canonical
-- Sprint 9 function so a clean installation compiles it correctly before this
-- migration is reached. Keep this version as an intentional no-op: production
-- already received the equivalent repair and must not be rewritten.
do $migration$
begin
  null;
end;
$migration$;
