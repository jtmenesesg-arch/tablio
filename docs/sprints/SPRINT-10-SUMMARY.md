# Sprint 10 — Endurecimiento y preparación del piloto

## En simple

Tablio no agregó funciones. Se intentó romper lo ya construido con volumen, desconexiones,
reinicios, duplicados, proveedores caídos, impresora sin papel y acceso cruzado. En el
laboratorio no se perdió ningún pedido pagado ni se duplicó ningún efecto comercial.

El núcleo soportó 240 pedidos sostenidos y una última ronda de 96 personas en cuatro oleadas.
El p95 confirmación→KDS fue 70 ms y 55 ms respectivamente, contra 103 ms en reposo y un
objetivo de 2.000 ms.

## Evidencia principal

- Control negativo RLS: policy insegura dentro de una transacción → `not ok 1`, vio 2 filas
  cuando esperaba 1 → `ROLLBACK` → policy segura presente → suite `ok 19`.
- pgTAP remoto: 316/316 entre aislamiento, finanzas, PWA, KDS, garzón, caja, DTE, SaaS,
  crédito y volumen Sprint 10.
- Carga: 240/240 sostenidos y 96/96 última ronda; tickets y spool exactos, cero errores.
- Caos dedicado: 5/5; cubre 96 reinicios KDS, 96 duplicados, 96 impresiones, 24 DTE y cierre.
- E2E Sprint 10: red offline/online, QR inválido y superficies críticas opacas.
- PWA producción en 4G lenta/CPU 4×: p50 2.008 ms, p95 2.055 ms, p99 2.059 ms.
- Security Advisors: exactamente las seis advertencias OI-019 ya conocidas; ninguna nueva.
- Build de producción completado.

## Qué reveló

- El camino pago→KDS tiene amplio margen en este equipo.
- Abrir 240 páginas exactamente al mismo tiempo dio p95 4,318 s. Debe repetirse en Vercel,
  Supabase y red del local antes de ampliar el piloto.
- `next dev` no sirve para medir carga inicial: dio p95 5,694 s; el build de producción bajó
  a 2,055 s y 241 KB bajo el mismo perfil.
- pgTAP financiero tenía un texto esperado antiguo. El constraint sí rechazaba correctamente;
  se alineó el mensaje “pedido prepago” y quedó 33/33.

## Estado final

El software está listo para un piloto controlado sin dinero real. No está listo para cobrar:
faltan pasarela, settlement real, proveedor DTE, validaciones tributaria/laboral, impresión
física, Realtime hospedado, alertas administrativas, revisión de seguridad y observabilidad.

Pasos operativos: `docs/PILOT_PLAYBOOK.md`. Números: `docs/LOAD_AND_CHAOS_REPORT.md`.
Bloqueantes: `docs/REAL_MONEY_BLOCKERS.md`.

## Cómo repetir

```bash
pnpm dev:e2e
pnpm load:sprint10
pnpm test:chaos
pnpm e2e
pnpm build
# con el build corriendo en :3100
pnpm perf:sprint10
```

Los pgTAP se ejecutan contra el proyecto Supabase enlazado y siempre terminan en rollback. El
control negativo también debe correr en una única transacción y nunca dejar una policy
debilitada.
