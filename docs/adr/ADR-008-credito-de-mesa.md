# ADR-008 — Crédito de mesa como excepción subordinada al prepago

- **Estado:** aceptado
- **Fecha:** 2026-07-29
- **Alcance:** autorización, límites, vencimiento, coexistencia con prepago y tratamiento de
  fugas

## Contexto

Tablio elimina el riesgo de cuenta abierta mediante prepago individual. Algunos locales
necesitan hacer una excepción deliberada para una mesa conocida o una situación operativa. Esa
excepción no puede convertirse silenciosamente en el modo normal ni hacer parecer pagado un
pedido que todavía es deuda del local.

## Decisión

El crédito de mesa queda desactivado por defecto. Dueño y caja pueden habilitarlo, abrirlo,
cobrarlo o cerrarlo sólo con permisos explícitos. Un garzón no recibe esos permisos por
defecto. Habilitar, abrir y cerrar con pérdida exigen motivo y escriben auditoría.

Cada cuenta congela al abrir:

- tenant, local, mesa y sesión activa;
- quién la abrió, cuándo, por qué y nombre opcional;
- límite por mesa;
- vencimiento, por defecto a las 3 horas y configurable entre 30 minutos y 12 horas.

El local tiene además un techo de exposición simultánea. La cuenta y la configuración del
local se bloquean durante la decisión para que dos pedidos concurrentes no atraviesen el
límite. Al alcanzarlo:

- los pedidos ya aceptados se honran;
- no entra otra ronda a crédito;
- tampoco se abre otra mesa a crédito;
- un pago parcial libera exposición y permite volver a evaluar.

Un pedido impago sólo puede producirse si referencia una cuenta de crédito viva y autorizada.
Pedido, ítems, comandas, consumo de reservas y outbox se crean atómicamente. El mismo quote no
puede saltarse esta autorización. Esto es una excepción explícita a la regla de prepago, no una
confirmación de pago.

## Coexistencia en una misma mesa

Prepago y crédito pueden coexistir. Cada pedido conserva `financial_mode`:

- `prepaid`: pertenece al comensal que lo pagó y requiere pago aprobado server-side;
- `table_credit`: aumenta únicamente el saldo de la cuenta abierta.

Una venta pagada por QR jamás reduce ni aumenta el crédito. Caja y garzón reciben un resumen
calculado en servidor que presenta ambas cifras por separado, por ejemplo:
`$32.000 pagados por app · $18.500 en crédito`.

Se descartó prohibir el QR durante un crédito abierto porque obligaría a toda la mesa a asumir
la deuda compartida y debilitaría el producto principal.

## Cobro, comprobación y fuga

Los pagos parciales se registran en un ledger append-only. El pago digital exige un
`Payment` aprobado por el camino server-side; el pago presencial es una acción distinta de
caja. Una clave de idempotencia evita aplicar dos veces la misma cobranza y cada pago encola un
comprobante en el spool persistente.

Cuando el saldo llega a cero, el servidor puede emitir un código aleatorio de seis dígitos por
60 segundos. Se guarda sólo su hash, se consume una vez y el garzón lo valida contra el
servidor. Un código inventado, vencido, usado o capturado en una imagen no acredita el pago.

Si el local cierra con saldo:

- exige permiso y motivo;
- agrega un `write_off` sin reescribir cargos ni pagos;
- registra la fuga con actor y hora;
- la materializa en el cierre del turno;
- la acumula por mes en el panel del dueño, separada de pedidos prepagados.

## Seguridad

Todas las tablas llevan `tenant_id`, RLS habilitado y forzado. El navegador sólo obtiene
lectura con policy; no puede insertar o editar ledger, pérdidas, cuentas ni verificaciones.
Las RPC públicas son fachadas `SECURITY INVOKER`. Sus implementaciones privilegiadas viven en
`private`, exigen claim de tenant y comprueban permisos dentro de la transacción.

## Alternativas descartadas

1. **Cuenta abierta como modo equivalente:** contradice el producto y oculta su riesgo.
2. **Desactivar el QR al abrir crédito:** impide que una persona siga usando prepago.
3. **Vencimiento sin alerta ni límite de local:** deja exposición invisible y potencialmente
   ilimitada.
4. **Cerrar borrando el saldo:** elimina evidencia e impide medir la fuga.

## Consecuencias

- El KDS puede recibir un pedido no pagado sólo con `financial_mode=table_credit` y una cuenta
  autorizada; visualmente debe conservar la condición de crédito.
- El panel del dueño puede demostrar el costo mensual y la tendencia de esta excepción.
- El tratamiento tributario real del momento de emisión en ventas a crédito sigue dentro de
  la matriz pendiente de OI-002; el simulador sólo prueba la orquestación durable.

## Evidencia

- `supabase/tests/database/009_table_credit_owner.test.sql`: 51 controles remotos verdes.
- `apps/web/lib/table-credit-demo-store.test.ts`: permisos, coexistencia, pagos, código y fuga.
- `tests/e2e/credit-owner.spec.ts`: caja/garzón, pago parcial, código vivo, fuga mensual y
  tenant nuevo.
