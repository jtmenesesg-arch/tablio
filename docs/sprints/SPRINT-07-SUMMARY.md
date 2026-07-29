# Sprint 7 — Boleta electrónica

## Resultado

Tablio ya puede demostrar el recorrido completo de una boleta sin contratar todavía un
proveedor real. Después de que el servidor confirma el pago, el pedido aparece en barra sin
esperar tributación. En paralelo, una cola durable pide la boleta. El comensal ve “emitiendo”
y luego puede abrir/descargar la representación demo.

Caja ya compara tres columnas: venta Tablio, movimiento/liquidación de la pasarela y respaldo
tributario. Una boleta fallida no borra el pago ni el pedido; aparece como excepción y permite
reintento auditado.

## Los dos ajustes críticos

1. **La devolución no espera al DTE.** Si el cliente debe recibir dinero, el reembolso sigue
   su propio camino. Una nota de crédito que no pudo salir queda pendiente, visible y ligada
   al reembolso.
2. **La caída se ve mientras ocurre.** Caja alerta si hay más de 10 pendientes o si alguno
   supera 15 minutos. También muestra proveedor funcionando, degradado o caído a partir de la
   tasa de fallos reciente. Todo es configurable por local.

## Qué se construyó

- Puerto `TaxDocumentProvider`, independiente del proveedor.
- Adaptador simulado: éxito, falla, demora, respuesta duplicada, nota de crédito y reintento.
- Configuración tributaria y emisor por tenant.
- Referencias seguras a credenciales mediante Supabase Vault.
- Venta, boleta, nota de crédito e intentos persistentes con RLS.
- Idempotencia: una boleta por venta y una nota por reembolso.
- Outbox/cola separados de la confirmación del pedido.
- Cola `tax_documents`, DLQ y consumidor Edge desplegado, con `ProcessedEvent`, backoff y ACK.
- PWA con correo opcional, estado y representación descargable demo.
- Caja con salud DTE, acumulación, antigüedad, reintento y tercera columna de conciliación.
- ADR-006 con LibreDTE, Nubox, Bsale y Facturación.cl como hipótesis no verificadas.

## Cómo verlo

```bash
cd /Users/jt/Documents/Codex/2026-07-27/podem/work/tablio
pnpm install
pnpm dev
```

Abrir:

- PWA: <http://localhost:3000/mesa/demo-mesa-8> · código `4826`.
- Caja: <http://localhost:3000/caja>.
- KDS: <http://localhost:3000/kds>.

En la PWA, paga con la tarjeta demo: la boleta aparece primero pendiente y luego emitida. En
caja, la demo parte con 11 documentos pendientes y proveedor caído; en Conciliación se puede
reintentar la boleta fallida del pedido #1042.

## Evidencia ejecutada

- Vitest: **67/67** verde.
- pgTAP remoto de Sprint 7: **43/43** verde con rollback.
- pgTAP remoto de aislamiento entre tenants: **19/19** verde con rollback.
- E2E: **21/21** recorridos verdes. La suite de garzón tuvo una espera transitoria en la
  corrida conjunta y pasó **4/4** al repetirla de forma aislada.
- TypeScript: verde.
- ESLint: verde.
- Build Next.js de producción: verde.
- Security Advisors de Supabase: **0 hallazgos**.
- Performance Advisors: se corrigieron cuatro claves foráneas sin índice; quedan sólo
  `unused_index`, informativo mientras no hay tráfico real.
- Migraciones `20260729041026`, `20260729042449`, `20260729043100`, `20260729043804`,
  `20260729044446`, `20260729044806`, `20260729044925` y `20260729045057`: aplicadas al
  proyecto Supabase actual.
- Edge Function `tax-document-consumer`: desplegada, activa y con JWT obligatorio. `pg_cron`
  la ejecuta cada minuto con un segundo factor cifrado en Vault; dos invocaciones reales
  consecutivas —incluida una automática— respondieron HTTP 200. Una llamada sin JWT fue
  rechazada con HTTP 401.

## Qué sigue abierto

El sprint verifica maquinaria, no cumplimiento tributario productivo. Antes del piloto se
debe contratar y probar un proveedor DTE real, aprobar la matriz por medio de pago con un
asesor tributario chileno, revisar la secuencia reembolso/nota de crédito y validar la entrega
digital aplicable desde marzo de 2026. Está registrado en OI-014, OI-015 y OI-016.
