# Sprint 2 — Resumen para no desarrolladores

## Resultado

El núcleo que decide cuándo existe una venta quedó implementado y aplicado al proyecto
Supabase actual. Tablio no acepta como pago ni el “volví del checkout” del navegador ni un
estado pendiente: sólo una confirmación firmada y verificada de servidor puede crear el
pedido.

Cuando esa confirmación es válida, la base guarda en un único paso indivisible:

1. el pago confirmado;
2. un solo pedido;
3. sus ítems;
4. una comanda distinta para cada estación;
5. el consumo del stock reservado;
6. cuatro trabajos durables: respaldo KDS, impresión, boleta placeholder y conciliación.

Si cualquiera de esos pasos falla, no queda media venta.

## Política de stock aprobada

- Sólo se reservan productos configurados con seguimiento de stock.
- El quote y su reserva comparten un único reloj.
- Duración inicial: 10 minutos, configurable por local entre 5 y 20.
- Rechazo, cancelación o abandono libera al instante.
- Si el dinero se aprueba después de vencer, no se produce. El cajero ve de inmediato una
  alerta crítica: **“requiere decisión: reembolsar o producir manualmente”**.

La justificación y alternativas están en `docs/adr/ADR-002-selective-stock-reservation.md`.

## Qué protege ahora la base

- Un quote y los eventos de proveedor no se pueden editar ni borrar.
- Un pedido confirmado sin quote o sin pago aprobado es rechazado por PostgreSQL.
- Diez entregas del mismo evento producen un solo efecto comercial.
- Un aviso pendiente antiguo no hace retroceder un pago aprobado.
- Monto, moneda, comercio o tenant incorrectos no producen y abren una excepción.
- Los reembolsos parciales y repetidos son idempotentes.
- Una diferencia de liquidación crea una única excepción.
- La última unidad sólo puede quedar reservada por una persona.
- Todo tiene `tenant_id`, RLS habilitado y comportamiento fail-closed.

## Durabilidad

Realtime avisa al KDS sin esperar la cola. PostgreSQL sigue siendo la verdad. El outbox y
Supabase Queues conservan impresión, boleta y conciliación aunque un worker caiga.

Los consumidores tienen lease, `ProcessedEvent`, clave idempotente para el adaptador externo,
ocho intentos por defecto, backoff exponencial con jitter, DLQ y replay con motivo auditado.

## Evidencia ejecutada

- Suite pgTAP remota: **33 de 33 controles en verde** (`1..33`).
- Flujo feliz: 1 pago → 1 pedido → 2 comandas → 4 outbox.
- Duplicado ×10: sigue existiendo 1 evento y 1 pedido.
- Persistencia: en una transacción nueva seguían presentes 1 pedido, 2 comandas, 4 outbox y
  1 evidencia del proveedor.
- Cleanup: no quedó ningún tenant sintético.
- Security Advisors: **0 hallazgos**.
- Performance Advisors: sin claves foráneas sin índice; sólo avisos `unused_index` esperables
  antes de tener tráfico.
- Quality gate de TypeScript, lint, tests, formato y build: registrado en BUILD_LOG al cierre.

## Migraciones aplicadas

- `20260728064954_sprint_02_financial_core.sql`
- `20260728065005_sprint_02_worker_rpcs.sql`
- `20260728065130_sprint_02_database_recorded_clock.sql`
- `20260728065508_sprint_02_advisor_fixes.sql`
- `20260728070001_sprint_02_retry_policy_alignment.sql`

## Qué no se construyó

- No hay checkout/PWA ni KDS visual.
- No se integró una pasarela real.
- No se agregó fee por transacción ni split de pagos.
- Boleta e impresión son efectos durables placeholder para sus sprints.
- La acción final del cajero ante una aprobación tardía queda registrada como OI-009.
