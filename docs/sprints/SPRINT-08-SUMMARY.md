# Sprint 8 — Onboarding, superadmin y cobro del SaaS

## Resultado

Tablio ya puede demostrar cómo un dueño deja un local listo: completa sus datos, dibuja zonas
y mesas, revisa una carta importada, configura tributación, conecta la cuenta simulada donde
recibirá sus ventas, invita personal, genera QRs de 4 dígitos, ejecuta venta/reembolso de
prueba, elige el cobro SaaS y habilita producción.

El progreso se guarda y se puede retomar. La revisión humana de cada precio es obligatoria:
ningún menú importado se publica automáticamente.

## Planes aprobados como hipótesis

- Inicial: hasta 12 mesas.
- Flujo: 13–30 mesas.
- Alto flujo: 31–60 mesas.
- Personalizado: más de 60.

Las mesas mandan. Zonas y estaciones tienen límites generosos y sólo elevan un nivel si ambas
se exceden claramente. Los precios demo siguen siendo hipótesis. Un cambio de tamaño se aplica
al ciclo siguiente, sin retroactividad y con auditoría.

## Separación del dinero

La cuenta que conecta el bar recibe directamente las ventas de sus comensales. Tablio no
custodia ni reparte ese dinero. El setup y la mensualidad usan el puerto separado
`SaasBillingProvider` y el adaptador simulado; ninguna pasarela real está integrada.

Un cobro fallido avisa y reintenta. Después existe gracia y luego restricción administrativa,
pero el bar sigue vendiendo. Una suspensión de pedidos requiere aviso y horario agendado. El
comensal nunca ve deuda: sólo un mensaje neutro si el canal no está disponible.

## Cómo verlo

```bash
cd /Users/jt/Documents/Codex/2026-07-27/podem/work/tablio
pnpm install
pnpm dev
```

Abrir:

- Onboarding: <http://localhost:3000/onboarding>.
- Superadmin: <http://localhost:3000/superadmin>.
- PWA: <http://localhost:3000/mesa/demo-mesa-8> · código `4826`.
- KDS: <http://localhost:3000/kds>.
- Garzón: <http://localhost:3000/garzon> · PIN `2468`.
- Caja: <http://localhost:3000/caja>.

En onboarding, elija importación de carta, revise todos los precios y termine la verificación.
En superadmin, abra Bar La Esquina, registre una impersonación con motivo y simule un cobro
fallido seguido de reintento.

## Evidencia ejecutada

- Vitest: **79/79**.
- Playwright: **26/26** recorridos completos.
- pgTAP Sprint 8 en Supabase: **51/51**.
- pgTAP de aislamiento multi-tenant: **19/19**.
- TypeScript, ESLint, Prettier y build Next.js de producción: verdes.
- Performance Advisors: sin claves foráneas sin índice ni hallazgos RLS accionables; sólo
  índices sin uso esperables antes de tráfico.
- Security Advisors: se eliminaron los grants anónimos accidentales. Permanecen seis avisos
  deliberados por RPCs `SECURITY DEFINER`: la disponibilidad neutra debe ser anónima y las
  operaciones autenticadas validan tenant/permiso o superadmin dentro de la función. Quedaron
  registradas en OI-019 para revisión antes de producción.
- Migraciones Sprint 8 `20260729163957`, `20260729164321`, `20260729164723`,
  `20260729165547` y `20260729165625`: aplicadas y alineadas con el historial remoto.

## Qué sigue abierto

El importador de PDF/imagen/link y las dos pasarelas son simulados. Antes del piloto hay que
validar comercialmente planes/precios, contratar el proveedor que cobra el SaaS, crear la
cuenta de desarrollador para conectar la pasarela del bar y probar OCR/extracción con cartas
reales. Ningún simulador mueve dinero ni demuestra capacidades productivas de proveedores.
