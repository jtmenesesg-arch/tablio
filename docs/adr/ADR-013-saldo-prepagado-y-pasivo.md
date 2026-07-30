# ADR-013 — Saldo prepagado y pasivo del bar

- **Estado:** Aceptado para simulador; bloqueado para producción
- **Fecha:** 2026-07-29

## Decisión

El saldo existe por `diner_profile_id + tenant_id` y se calcula sumando un ledger
append-only. Nunca existe una columna “balance” que se sobrescriba. Cada movimiento conserva
tipo, monto CLP entero, lote, componente, idempotencia, quote/pedido/pago y, cuando corresponde,
actor y motivo.

Se mantienen dos componentes que nunca se confunden:

- `loaded_money`: dinero pagado por el cliente; crea un pasivo del bar.
- `bonus`: valor regalado por el bar; puede tener vigencia y tratamiento distinto.

La recarga es un `CheckoutQuote` inmutable con un subtipo de recarga. Sólo un evento aprobado,
firmado y confirmado server-side acredita sus lotes. La misma confirmación repetida devuelve
el comprobante original. Una recarga nunca crea `Order` ni comandas.

## Topes de exposición

- Máximo por comensal: configurable, **$40.000 CLP por defecto**, incluyendo dinero y bono.
- Máximo total del local: opcional. Si se alcanza, se detienen nuevas recargas.
- Superadmin: ve el pasivo de cada tenant y recibe una alerta desde un umbral configurable
  (demo: $30.000 para hacerlo visible; configuración productiva: $500.000 por defecto).

Los topes se verifican tanto al iniciar como al confirmar la recarga. Así, dos confirmaciones
concurrentes no pueden saltarse el límite. Si el proveedor ya cobró y el límite impide
acreditar, se crea una excepción crítica para reembolso o investigación; el dinero nunca se
ignora.

## Consumo y pago mixto

Se consume **bono primero y FEFO dentro de cada componente**; después, dinero cargado también
por FEFO. El bono suele vencer antes y usarlo primero reduce expiraciones sorpresivas sin
convertirlo en dinero reembolsable.

Al crear el quote, PostgreSQL bloquea la cuenta, elige lotes y guarda asignaciones inmutables
con la versión de política. El quote muestra:

```text
total comercial = saldo congelado + pago externo
```

El intento de pasarela cobra sólo el pago externo. El pedido copia la mezcla y el trigger
consume los mismos lotes en la transacción del `Order`. Rechazo, cancelación, abandono o
expiración liberan la reserva.

## Contabilidad y conciliación

Una recarga **no es ingreso**: es efectivo recibido y una obligación creada. El ingreso se
reconoce cuando el saldo se consume. Cierre, caja y dueño muestran tres bloques opacos:

1. recargas del período: entrada de dinero / obligación nueva;
2. saldo consumido: ingreso reconocido sin entrada de efectivo ese día;
3. pasivo pendiente: obligación acumulada, nunca “caja disponible”.

Esta presentación y el tratamiento tributario son hipótesis bloqueantes hasta revisión de un
asesor tributario chileno y del proveedor DTE.

## Reembolsos, privacidad y cierre del bar

- Pedido mixto: la devolución revierte la mezcla real del quote. La parte externa vuelve por
  la pasarela; la parte de saldo vuelve a los mismos componentes/lotes. Un bono nunca se
  convierte silenciosamente en dinero.
- Recarga intacta: caja puede devolver el dinero cargado por la pasarela y debitar dinero más
  bono del ledger. Si parte fue consumida, exige una resolución financiera explícita.
- Revocación de identidad: el perfil se anonimiza, la cuenta se congela y se entrega una
  referencia de recuperación. El saldo no se borra.
- Tenant suspendido: no acepta recargas; permite consumir y devolver saldos durante el
  wind-down.
- Tenant que cierra: detiene recargas y consumo nuevo, mantiene devoluciones. La eliminación
  física está bloqueada mientras el pasivo sea mayor que cero.

## Caducidad

Dinero y bono tienen vigencias separadas, ambas configurables, y aviso previo durable. Su
expiración agrega un débito al ledger; nunca borra el lote. La posibilidad y forma de caducar
dinero pagado es una **hipótesis legal**, no una afirmación de Tablio.

## Seguridad

Todas las tablas tienen `tenant_id`, claves compuestas, RLS habilitado y forzado. Las rutas de
usuario propagan el claim y usan permisos tenant-scoped. La vista multi-tenant de superadmin
es un RPC `SECURITY DEFINER` con `search_path` vacío que exige una membresía real de plataforma;
no usa `service_role` para servir datos.

## Consecuencias

El modelo explica cada peso y admite cambiar la política sin reescribir historia. A cambio,
recargas, devoluciones, expiración, DTE y normativa de consumo deben validarse antes de
habilitar producción. Por eso la función nace apagada y `production_validated = false`.
