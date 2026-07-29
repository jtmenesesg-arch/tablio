# ADR-005 — Reembolsos después de distribuir propinas

- **Estado:** Aceptado técnicamente; sujeto a revisión laboral antes del piloto
- **Fecha:** 2026-07-28
- **Decisión:** no descontar retroactivamente al trabajador una propina ya distribuida

## Contexto

Un reembolso total o parcial puede ocurrir mientras el turno sigue abierto o después de que
cerró y el local distribuyó las propinas. En Chile la propina pagada con tarjeta corresponde a
los trabajadores. Reabrir un cierre o descontarles después de entregar el dinero mezcla la
devolución comercial del bar con una remuneración ya distribuida.

## Decisión

El componente de propina de un reembolso parcial se calcula de forma acumulativa y
proporcional usando enteros CLP:

```text
propina acumulada a devolver =
  floor(propina original × monto acumulado reembolsado / total original)

propina de esta devolución =
  propina acumulada nueva − propina acumulada anterior
```

Esto evita perder o duplicar pesos cuando hay varios reembolsos parciales.

- **Turno de origen abierto:** ese componente reduce la propina distribuible del mismo turno.
- **Turno de origen cerrado:** no se reabre el snapshot y no se descuenta dinero al trabajador.
  Se crea un ajuste inmutable `local_absorbs_distributed_tip_refund`, a cargo del local, visible
  en el siguiente cierre con el pago, reembolso, turno original, monto, hora y explicación.

El reembolso conserva una clave de idempotencia. Un reintento devuelve el resultado existente
sin crear otro reembolso ni otro ajuste.

## Alternativas consideradas

- **Descontar al trabajador en el siguiente turno:** rechazada porque traslada una decisión
  comercial posterior a quien ya recibió la propina.
- **Reabrir y modificar el cierre anterior:** rechazada porque destruye evidencia contable.
- **No devolver nunca propina:** rechazada como regla rígida; la devolución al cliente depende
  del caso y del proveedor, pero su costo post-cierre queda explícitamente a cargo del local.

## Evidencia y alcance

La fórmula, idempotencia, separación abierto/cerrado, ajuste al local y cierre inmutable están
verificados con datos sintéticos en Vitest, Playwright y constraints/RPC de PostgreSQL.

No se ha ejecutado un reembolso con una pasarela real ni esta política constituye asesoría
laboral. Debe revisarla un asesor laboral chileno antes del piloto; el bloqueo vive en OI-012.

## Consecuencias

Los cierres permanecen reproducibles y el personal no recibe descuentos retroactivos
automáticos. El local asume y ve explícitamente el costo. Una recomendación laboral distinta
requiere actualizar este ADR, migrar sin reescribir cierres históricos y obtener aprobación.
