-- OI-037: limpieza de las ayudas TEMPORALES de verificación. Confirmado su
-- resultado contra la base real (ver docs/BUILD_LOG.md), se eliminan.
drop function if exists public.__oi037_set_quote_ttl(uuid, integer);
drop function if exists private.__oi037_set_quote_ttl(uuid, integer);

drop function if exists public.__oi037_set_product_price(uuid, uuid, bigint);
drop function if exists private.__oi037_set_product_price(uuid, uuid, bigint);
