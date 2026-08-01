# OI-027 — Diagnóstico y arreglo, 2026-08-01

## Respaldo previo (obligatorio, tomado antes de tocar nada)

`docs/evidence/OI-027-SCHEMA-MIGRATIONS-BACKUP-2026-08-01.json` contiene un `SELECT version,
name, statements, created_by, idempotency_key, rollback FROM
supabase_migrations.schema_migrations ORDER BY version` completo — las 58 filas que existían en
la tabla de control de la base real (`xmwewmukoxdeuilmkahr`) antes de cualquier cambio de este
diagnóstico, tomado por conexión directa de solo lectura (`SET default_transaction_read_only =
on`).

**Cómo volver exactamente al estado de hoy si algo sale mal:** el arreglo de metadatos (ver más
abajo) sólo actualiza la columna `version` de 26 filas (13 pasan de su timestamp viejo a
"reverted", 13 nuevas quedan "applied" con el timestamp que ya usa el repositorio). Para
revertir, se trunca `supabase_migrations.schema_migrations` y se reinserta cada fila de este
JSON tal cual — no hace falta tocar ninguna tabla de datos ni función, porque el arreglo de
metadatos nunca las toca.

## Diagnóstico

Comparación directa (conexión de solo lectura vía pooler, `SET default_transaction_read_only =
on`) entre el SQL realmente aplicado en la base (columna `statements` de
`supabase_migrations.schema_migrations`) y los archivos en `supabase/migrations/`:

### 1. Trece migraciones de Sprint 11-13 con timestamp distinto, mismo contenido

| Timestamp remoto | Timestamp local | Nombre |
| --- | --- | --- |
| 20260729192759 | 20260729190703 | sprint_11_diner_identity_loyalty |
| 20260729192927 | 20260729192854 | sprint_11_loyalty_fk_indexes |
| 20260729193027 | 20260729193007 | sprint_11_loyalty_program_fk_index |
| 20260729202316 | 20260729211500 | sprint_12_checkout_engagement |
| 20260729202449 | 20260729212500 | sprint_12_advisor_fixes |
| 20260729202509 | 20260729213000 | sprint_12_tip_fk_index |
| 20260729202654 | 20260729213200 | sprint_12_invitation_target_guard |
| 20260729203303 | 20260729213500 | sprint_12_same_table_invitations |
| 20260730020017 | 20260729214000 | sprint_12_tip_refund_policy |
| 20260730024146 | 20260729230000 | sprint_13_stored_value |
| 20260730024521 | 20260729231000 | sprint_13_advisor_fixes |
| 20260730024546 | 20260729231500 | sprint_13_topup_quote_fk_index |
| 20260730025519 | 20260729232000 | sprint_13_refunds_and_closure |

Verificado con `diff` byte a byte contra 4 de los 13 pares (`sprint_11_diner_identity_loyalty`,
`sprint_12_checkout_engagement`, `sprint_13_stored_value`, `sprint_13_refunds_and_closure`): tres
son idénticos. El cuarto (`sprint_12_checkout_engagement`) difiere en una sola restricción
`check` — la versión remota exige `payer_table_session_id <> destination_table_session_id`
(bloquea invitar a la propia mesa), la versión local exige `claimed_by_device_session_id is null
or claimed_by_device_session_id <> payer_device_session_id` (permite invitar a la propia mesa,
sólo exige que no te la reclames a ti mismo). Se confirmó que
`sprint_12_same_table_invitations` (45 minutos después en la secuencia remota) hace exactamente
`drop constraint` de la restricción vieja y agrega la nueva — y esa migración es idéntica en
ambos lados. El estado final de la base, tras las 13, es el mismo que describe el repositorio
hoy.

**Causa:** en algún momento los 13 archivos locales fueron renombrados a otros timestamps (para
prolijidad, antes de este sprint) sin correr `supabase migration repair`, así que la tabla de
control de la base real quedó con los timestamps viejos. Es un desajuste de metadatos, no una
divergencia de esquema.

### 2. `20260729174339_sprint_09_credit_open_limit.sql` — bug real en el archivo, sin impacto en producción

El archivo intenta parchar `public.open_table_credit(uuid,uuid,uuid,text,text)` vía
`pg_get_functiondef` + `replace()` de texto, buscando literales como `E'  account_id uuid;\n'`
para insertar el control de exposición del local.

**Primer diagnóstico (descartado tras verificar mejor):** se pensó que el problema era apuntar
al procedimiento equivocado (`public.` en vez de `private.`, porque `open_table_credit` termina
en el esquema `private` después de `20260729174444_sprint_09_rpc_advisor_fix.sql`). Se descartó
al reconstruir la secuencia completa: en el momento en que esta migración corre, `open_table_credit`
todavía vive en `public` (el traslado a `private` es la migración siguiente) — `public.` sí era,
y sigue siendo, el objetivo correcto.

**Causa real, confirmada leyendo el SQL que de verdad se ejecutó:** la columna `statements` de
`supabase_migrations.schema_migrations` para esta versión (lo que realmente corrió en
producción) usa `E'  account_id uuid;\n'` — **una sola barra invertida**, que Postgres interpreta
como salto de línea real. El archivo local de hoy tiene `E'  account_id uuid;\\n'` — **doble
barra invertida**, que Postgres interpreta como los caracteres literales `\` y `n`, nunca como un
salto de línea. Confirmado además de forma empírica con una consulta de sólo lectura
(`select replace(pg_get_functiondef(...), E'...\\n', ...)`) que ese patrón de doble barra nunca
encuentra coincidencia contra ninguna definición real — por eso `corrected = definition` y la
migración levanta `'open_table_credit definition was not recognized'` en cualquier
reconstrucción limpia. Ese es exactamente el error que mostraba el CI.

Confirmado también que **`private.open_table_credit` (donde vive la lógica real hoy) YA
CONTIENE en producción** la variable `venue_exposure` y el control de tope de exposición del
local — la protección de negocio está activa. El archivo simplemente tiene una barra invertida de
más en varios literales, probablemente introducida al pasar el contenido por una capa extra de
escapado (por ejemplo, al reescribirlo desde una cadena JSON) en el mismo evento que reordenó los
archivos de Sprint 11-13.

**Arreglo aplicado:** se restauró el archivo al contenido exacto que quedó registrado como
aplicado con éxito en la base real (mismas barras simples, mismo objetivo `public.`) — no una
edición nueva, sino una reversión a lo que ya se sabe que funcionó. Verificado con `diff` que el
único cambio respecto al SQL histórico es la barra invertida doble→simple; el resto es
byte-idéntico. **No se ejecutó nada contra la base real para este paso** — sólo se reescribió el
archivo local; la función que ya corre en producción no se tocó.

**Causa raíz común a los dos hallazgos:** el archivo fue editado después de haber sido aplicado
exitosamente (en el mismo evento que renombró los archivos de Sprint 11-13), sin volver a
ejecutarse contra la base real — Supabase no reaplica una versión que ya figura en la tabla de
control, así que la edición nunca se detectó hasta esta reconstrucción manual del historial.

## Arreglo aplicado — paso 1: metadatos de la tabla de control

`supabase migration repair --status reverted <13 versiones remotas>` seguido de
`supabase migration repair --status applied <13 versiones locales>` (comandos read-only excepto
por escribir en `supabase_migrations.schema_migrations`, ver `--help`: "Repair the migration
history table").

**Confirmado que es solo metadatos, sin tocar tablas de datos ni funciones:**

- `supabase migration list` quedó con las 58 versiones locales y remotas coincidiendo
  exactamente, sin excepciones.
- Se releyó `private.open_table_credit` después del repair: sigue teniendo `venue_exposure` —
  ninguna función cambió.
- Se contaron las tablas en `public`+`private` antes y después: 168 en ambos casos.
- El `statements` guardado para las 13 filas nuevas es el mismo SQL, sólo que el CLI lo
  re-particiona en el arreglo `statements[]` de otra forma (sin los `;` y saltos de línea entre
  sentencias) al releer el archivo local — confirmado con `diff` que el contenido real, ignorando
  ese re-particionado, es idéntico. El único efecto secundario notado: la columna `created_by` de
  esas 13 filas quedó en `null` (antes tenía el email del autor original) — es metadato de
  auditoría del propio historial de migraciones, no afecta ninguna tabla de negocio.

## Arreglo aplicado — paso 2: archivo de migración

Ver sección 2 arriba ("Arreglo aplicado", dentro del diagnóstico) — se reescribió
`20260729174339_sprint_09_credit_open_limit.sql` con el contenido exacto ya verificado como
aplicado en producción. Cambio sólo en el archivo local; cero ejecuciones contra la base real.
