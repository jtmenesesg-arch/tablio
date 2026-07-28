# Sprint 1 — Spike de pasarelas sin credenciales

- **Estado:** cerrado
- **Fecha de cierre:** 2026-07-28
- **ADR:** `docs/adr/ADR-001-payment-gateway-spike.md`
- **Estado del ADR:** PROPUESTO — NO DECIDIDO
- **Pasarela real elegida:** ninguna

## Resultado

Tablio puede desarrollar y demostrar el flujo técnico de pagos sin una cuenta de Mercado Pago
o Transbank, sin credenciales y sin mover plata. El núcleo conoce un puerto neutral
`PaymentGateway`; la implementación disponible es un adaptador simulado reemplazable.

La investigación de proveedores es exclusivamente documental. **Todo hallazgo sobre Mercado
Pago y Transbank permanece como hipótesis no verificada.**

## Frontera financiera confirmada

| Flujo                   | Receptor                   | Momento           | Puerto                            |
| ----------------------- | -------------------------- | ----------------- | --------------------------------- |
| Comensal paga una venta | Cuenta de pasarela del bar | Núcleo financiero | `PaymentGateway`                  |
| Bar paga la mensualidad | Cuenta de Tablio           | Sprint 8          | Futuro puerto de billing separado |

El contrato de ventas no ofrece fee de plataforma, split, custodia ni cuenta receptora de
Tablio. Cada operación exige `tenantId` y `merchantAccountId`.

## Investigación documental

`ADR-001` conserva enlaces a las fuentes oficiales y una matriz explícita de:

- onboarding/OAuth;
- fondos en el comercio;
- confirmación server-side;
- Apple Pay web/PWA;
- medio guardado;
- reembolsos;
- liquidación y conciliación;
- ambiente de prueba y costos.

La hipótesis documental más relevante es que Mercado Pago publica OAuth y un Account Money
Report por API, mientras Transbank publica contratación/código de comercio y reportes
descargables en Portal, sin una API pública de liquidación encontrada. No se usa esta
observación para decidir proveedor.

## Artefactos construidos

### Puerto neutral

`packages/application/src/payments/payment-gateway.ts` cubre conexión del comercio, intento,
firma, confirmación/consulta server-side, refund total/parcial, medio guardado y entradas de
liquidación.

`PaymentEventProcessor` no confía en el tipo de evento recibido para determinar el estado:
después de validar la firma consulta al adaptador server-side. El repositorio expone una
operación atómica para guardar evento aceptado y outbox.

### Adaptador simulado

`packages/payments-simulated` ofrece:

- webhook firmado con HMAC-SHA256, ventana de timestamp y comparación de tiempo constante;
- intentos y refunds idempotentes;
- pagos aprobados/rechazados;
- duplicados, tardíos y fuera de orden;
- reembolso total y parcial;
- medios guardados limitados al comercio;
- datos simulados de bruto, fee del proveedor, neto y referencia de abono;
- un repositorio en memoria para el laboratorio.

El repositorio en memoria no es durable ni apto para producción. En Sprint 2 se implementa el
repositorio PostgreSQL/outbox transaccional conservando el mismo puerto.

### Demo

La ruta `/demo/payments` muestra siete escenarios. Tanto la UI como la respuesta HTTP declaran
modo demo; no capturan tarjetas ni secretos. La pantalla explica que:

- la venta simulada pertenece al bar;
- Tablio no recibe fondos;
- la suscripción SaaS no participa en ese flujo.

## Cómo verlo

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Abrir `http://localhost:3000/demo/payments`.

## Evidencia automatizada

La suite incluye nueve casos:

1. idempotency key repetida devuelve el mismo intento;
2. webhook alterado falla la firma;
3. ocho entregas del mismo evento producen un evento y un outbox;
4. `pending` antiguo no degrada `confirmed`;
5. rechazo y evento tardío se resuelven server-side;
6. refund parcial, total y repetido;
7. medio guardado no cruza comercios;
8. conciliación expone bruto, fee, neto y referencia de abono.
9. dos refunds parciales distintos producen efectos outbox distintos.

Puerta ejecutada:

```text
pnpm format:check  → pasa
pnpm lint          → pasa
pnpm typecheck     → pasa
pnpm test          → 1 archivo, 9 tests, todos pasan
pnpm build         → pasa; /, /demo/payments y /api/demo/payments
pnpm audit --prod  → 0 vulnerabilidades conocidas
```

El audit inicial reportó `sharp` y `postcss` transitivos; el lockfile fija las versiones
corregidas y el build se volvió a ejecutar después del cambio.

No hubo cambios de esquema ni de Auth, por lo que no se ejecutaron migraciones ni Advisors
remotos en este sprint.

## Bloqueantes antes del piloto

Registrados en `OPEN_ISSUES.md`:

- crear cuenta de desarrollador de Tablio en la pasarela para el botón OAuth;
- validar con credenciales reales onboarding OAuth, Apple Pay PWA, medio guardado, reembolso y
  liquidación;
- demostrar que los fondos llegan al bar correcto;
- si ninguna pasarela ofrece liquidación por API, revisar la promesa “el cierre explica cada
  peso”.

## Decisión y siguiente incremento

ADR-001 queda PROPUESTO, NO DECIDIDO. Sprint 2 puede construir el núcleo financiero contra el
adaptador simulado. Elegir e integrar la pasarela real sigue bloqueado hasta la matriz de
evidencia real previa al piloto.
