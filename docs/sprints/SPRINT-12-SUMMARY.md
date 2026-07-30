# Sprint 12 — Momento del pago

**Estado: CERRADO.**

## Para una persona no técnica

Tablio ahora puede ofrecer uno o dos productos adicionales sin entorpecer el pago, activar un
happy hour, permitir que alguien invite un producto y dirigir la propina a un garzón. Las
cuatro funciones son configurables y nacen apagadas para un local nuevo.

El precio se congela cuando el servidor crea el quote. Activar o terminar una promoción
después no cambia ni un peso. Nada se prepara por una invitación hasta que otro dispositivo de
la mesa correcta la reclama.

## Qué quedó construido

- Upsell determinista por producto, categoría, horario, margen conocido o lista manual.
- Bloque descartable, máximo dos sugerencias, nunca preseleccionadas y sin productos agotados.
- Métricas de exposición, aceptación e ingreso efectivamente pagado.
- Happy hour 2x1, porcentual o precio especial, versionado y auditable.
- Precio/descuento promocional copiado a quote, pedido, ítems, cierre y conciliación.
- Invitaciones entre mesas o entre dos dispositivos de una mesa.
- Vigencia configurable de 45–90 minutos, predeterminado 60, con aviso diez minutos antes.
- Límite antiabuso configurable aplicado en servidor y rechazo de mesas cerradas.
- Cancelación por el pagador y reembolso parcial inmediato mientras no exista reclamo.
- Comanda creada sólo al reclamar, con la mesa de entrega correcta y sello de pagado.
- Propina congelada para equipo o trabajador activo de la zona; cerrar su turno no la reasigna.
- Reportes por trabajador, turno y medio. Tablio informa, no distribuye dinero ni cobra fee.
- Reembolso de propina enlazado a ADR-005: abierto reduce al trabajador; cerrado lo absorbe el
  local.

## Cómo verlo

```bash
pnpm dev:e2e
```

1. Abre `http://localhost:3100/dueno` y activa “Happy hour”.
2. Abre `http://localhost:3100/mesa/demo-mesa-8`, usa `4826`, agrega una lager y entra al pago.
3. Acepta papas, elige Elena para la propina y observa el precio congelado.
4. Para invitar, elige “Mesa 9”, paga y abre otra sesión en
   `http://localhost:3100/mesa/demo-mesa-9` con código `9174`.
5. Antes de reclamar no existe comanda. Después aparece en `http://localhost:3100/kds` para
   Mesa 9.
6. Revisa métricas en `/dueno` y propinas en la vista Cierre de `/caja`.

## Evidencia ejecutada

- Vitest: 125/125.
- TypeScript, ESLint y build productivo: verdes.
- Playwright Sprint 12: 5/5 recorridos verdes, incluida invitación a otro dispositivo de la
  misma mesa y cancelación con devolución.
- pgTAP Sprint 12: 38/38 en el proyecto remoto, ejecutado con rollback.
- Aislamiento multi-tenant existente: 19/19.
- Advisors: ningún hallazgo nuevo de seguridad ni clave foránea sin índice atribuible a Sprint 12. Permanecen los avisos históricos OI-019/OI-023 y los índices sin uso observables sólo con
  tráfico real bajo OI-008.

## Estado de aplicación remota

Supabase recibió las seis migraciones de Sprint 12, incluida
`20260729214000_sprint_12_tip_refund_policy.sql`. El historial remoto registra
`sprint_12_tip_refund_policy`, pgTAP llegó a `ok 38` y los advisors fueron ejecutados después
de la aplicación. No quedan migraciones ni verificaciones remotas pendientes para este sprint.

## Decisiones y asuntos abiertos

- ADR-011: reglas deterministas y precio promocional inmutable.
- ADR-012: invitación no reclamada, plazo, aviso y reembolso.
- OI-012 sigue bloqueando revisión laboral de propinas reales.
- OI-024 bloquea validar con asesor/proveedor DTE la representación de promociones,
  invitaciones y sus notas de crédito.
