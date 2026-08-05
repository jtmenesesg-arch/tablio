-- OI-034 Incremento 4: limpieza de las ayudas TEMPORALES de verificación
-- (inmutabilidad, cambio de precio, TTL) creadas en las tres migraciones
-- anteriores. Confirmado su resultado contra la base real (ver
-- docs/BUILD_LOG.md), se eliminan — no quedan en el esquema permanente.
drop function if exists public.__oi034_i4_verify_quote_immutable(uuid, uuid);
drop function if exists private.__oi034_i4_verify_quote_immutable(uuid, uuid);

drop function if exists public.__oi034_i4_set_product_price(uuid, uuid, bigint);
drop function if exists private.__oi034_i4_set_product_price(uuid, uuid, bigint);

drop function if exists public.__oi034_i4_set_quote_ttl(uuid, integer);
drop function if exists private.__oi034_i4_set_quote_ttl(uuid, integer);
