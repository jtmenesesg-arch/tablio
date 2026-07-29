# ADR-004 — Grupos operativos de sesiones de mesa

- **Estado:** Aceptado
- **Fecha:** 2026-07-28
- **Decisión:** unir mesas sólo para visibilidad operativa

## Contexto

Un bar puede juntar Mesas 5, 6 y 7 para un grupo grande. Sus QR ya están impresos y cada
teléfono conserva carrito, quote y pago individual. Modelar la unión como una cuenta compartida
rompería el principio persona → carrito → quote → pago → pedido y haría riesgoso separarlas.

## Decisión

`table_session_groups` identifica el grupo y `table_session_group_members` enlaza sesiones
activas. El grupo muestra etiqueta, personas y tareas agregadas; dentro se prefiere nombre real
y luego alias. Si nadie agrupa, el flujo existente no cambia.

El grupo no tiene claves a carrito, quote, PaymentIntent, Payment, Order ni Ticket. Unir o
separar sólo inserta o cierra membresías operativas y deja auditoría. Los QR, pagos, pedidos,
comandas y montos siguen perteneciendo a su sesión original.

## Concurrencia y permisos

El grupo usa `state_version`: dos separaciones simultáneas no pueden ganar. Sólo una sesión de
empleado activa del tenant y venue puede operar sobre mesas de su cobertura. RLS sigue
evaluando cada fila original; el grupo no crea otra frontera de seguridad.

## Alternativas descartadas

- Sesión de mesa “padre”: obligaría a migrar identidad y objetos financieros.
- Cuenta compartida: contradice el pago individual congelado.
- Estado sólo en el cliente: se perdería al reconectar o reiniciar.

## Consecuencias

La visualización puede agrupar sin tocar el ledger. Separar no recalcula dinero. Cualquier
cuenta compartida o crédito de mesa exige otro ADR y pertenece al Sprint 9.
