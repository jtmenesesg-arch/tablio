# Sprint 3 — PWA del comensal

## En simple

Tablio ya tiene su primera experiencia completa para una persona sentada en una mesa. Entra
con el código impreso, ve la carta, arma su carrito propio, deja o rechaza propina, puede
escribir su nombre, paga en modo demo y sigue Barra y Cocina por separado.

Ninguna pantalla mueve dinero real. La confirmación la produce el servidor mediante el
adaptador simulado firmado; el teléfono no posee un botón ni una operación capaz de aprobar un
pago.

## Cómo verla

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Abrir <http://localhost:3000/mesa/demo-mesa-8> e ingresar el código **4826**.

La franja superior siempre debe decir “MODO DEMO · NO MUEVE DINERO REAL”.

## Qué se construyó

- Entrada QR + código de presencia, sin registro.
- Alias `animal/objeto no bebible + color`, sin vocabulario típico de carta.
- Sesión por dispositivo: 4 horas de inactividad, 12 horas máximas y recuperación por cookie
  opaca.
- Carta configurable por datos, fotos, variantes, notas, alérgenos y agotado visible.
- Carrito independiente por dispositivo.
- Nombre/apodo opcional visible antes del primer pago: “para que el garzón te encuentre”.
- Propina sugerida, modificable, personalizada o rechazada, siempre separada.
- CheckoutQuote inmutable y pago simulado server-side.
- Confirmación con pedido, alias/nombre, monto y comandas independientes por estación.
- Estado Pagado → Preparando → Listo y “Pedir otra ronda”.
- Acciones configurables con cooldown y deduplicación.
- “Pagar con el garzón” claramente no pagado: no crea `Order` ni comandas.
- PWA rápida con Plus Jakarta Sans local, superficies sólidas para dinero y glass sólo en
  navegación/modal.

## Base de datos aplicada

Se aplicaron al proyecto Supabase actual:

- `20260728212726_sprint_03_diner_pwa.sql`
- `20260728212851_sprint_03_advisor_fixes.sql`

Agregan configuración por tenant, categorías, alérgenos/fotos, sesiones de dispositivo,
identidad congelada en quote/pedido, número humano de pedido, acciones, solicitudes y la
notificación separada de pago con garzón. Todas las tablas nuevas tienen `tenant_id`, RLS
habilitado y forzado. `anon` no puede leer hashes de sesión ni crear pedidos.

## Evidencia

- **Playwright:** 6 recorridos verdes en Pixel 5:
  1. entrar → pedir → pagar → ver Barra/Cocina → repetir ronda;
  2. falsificación de confirmación desde frontend rechazada;
  3. dos dispositivos mantienen carritos separados;
  4. recarga recupera sesión y carrito;
  5. producto agotado no se agrega ni paga;
  6. pagar con garzón no crea pedido ni comanda.
- **Vitest:** 27 controles verdes, incluido vocabulario de alias sin colisión con productos
  típicos de bar y contraste AA de textos críticos.
- **pgTAP Sprint 3:** `1..17` versionado; TTL por defecto verificado en 4 h/12 h.
- TypeScript estricto, ESLint, Prettier y build de producción verdes.
- Auditoría de dependencias de producción: cero vulnerabilidades conocidas.
- Security Advisors de Supabase: **0 hallazgos**.
- Performance Advisors: la FK nueva quedó indexada y se eliminaron policies solapadas; los
  avisos restantes son índices sin uso esperables en un proyecto sin tráfico.

## Decisión técnica

ADR-003 fija cookie opaca, recuperación desde servidor, shell sin datos financieros offline y
Broadcast privado como canal de producción. El aviso sólo provoca una nueva consulta:
PostgreSQL sigue siendo la fuente de verdad.

## Pendiente antes del piloto

- Conectar el canal Broadcast privado real y medir su latencia/carga; la demo usa recuperación
  periódica porque no tiene credenciales ni usuarios reales.
- Validar pasarela real, Apple Pay, medio guardado, reembolsos y liquidaciones según OI-001.
- Ejecutar el control negativo RLS rojo → verde en staging aislado.
- Verificar contraste con auditoría automatizada adicional y teléfonos físicos de gama baja
  en un bar con poca luz.
