# Bitácora de construcción

Registro simple de qué cambió, por qué y cómo se verificó.

## 2026-08-06 — Security y performance advisors sobre todo el tramo de OI-034

**Qué se hizo:** el fundador reconectó el MCP de Supabase con la cuenta correcta (confirmado con
`list_projects`) y se corrieron por primera vez los *security* y *performance advisors* sobre
los cinco incrementos del tramo (sesión, carrito, quote, pago, webhook) — hasta ahora sólo
verificados por revisión manual de grants, según quedó registrado en OI-031.

**Dos hallazgos reales, ninguno explotado, ambos corregidos:**

1. `create_merchant_account` era alcanzable por `anon` a nivel de permiso de base de datos —
   causa raíz: este proyecto otorga `EXECUTE` a `anon` automáticamente en toda función nueva del
   esquema `public` (regla de privilegios por defecto), y `revoke ... from public` no alcanza a
   revocar ese grant directo — hace falta `revoke ... from anon` explícito. Ya se había hecho
   bien en dos funciones hermanas del mismo tramo (`configure_payment_worker_schedule`,
   `owner_kds_tickets_minimal`); se me olvidó en ésta. No era explotable — la función exige
   `payments.manage` por dentro — pero no era mínimo privilegio. Corregido y reverificado: `anon`
   ahora recibe "permission denied" directo.
2. `private.payment_worker_runtime` (singleton) tenía tres FK sin índice cubriente — impacto
   real nulo, pero se agregaron por consistencia con su tabla hermana `tax_worker_runtime`
   (Sprint 7), que ya los tenía.

**Auditoría sistemática de permisos, no sólo el advisor:** se consultó `information_schema.
routine_privileges` para las ~30 funciones nuevas del tramo, verificando función por función qué
rol puede ejecutarla. Confirmado: toda función `private.*` es inalcanzable desde cualquier rol de
cliente (sólo se llama internamente), toda función `worker_*` es `service_role`-only, y toda
función `diner_*` pública es alcanzable por `anon` — intencional, es como el comensal (sin sesión
de Supabase Auth) llega a ellas. Único hallazgo: el de arriba, ya corregido.

**Lo demás — explicado en `docs/OPEN_ISSUES.md` (OI-031), no dejado como lista de códigos:** tres
tablas de identidad del comensal con RLS sin política (mismo patrón ya aceptado en OI-023,
Sprint 8), una función de disponibilidad intencionalmente pública, ocho funciones "ejecutables
por cualquier autenticado" que en realidad exigen permiso interno que el linter no puede ver, la
protección de contraseñas filtradas desactivada en Auth (config de proyecto, no de este tramo), y
171 índices "sin uso" que en realidad son los índices correctos de FK para tablas con apenas dos
días de tráfico real — no hay nada que borrar ahí.

**Verificación:** `pnpm typecheck`/`pnpm lint` limpios, 149/149 Vitest, 46/46 Playwright e2e (un
flake aislado de `credit-owner.spec.ts` en la corrida completa, confirmado no relacionado —
4/4 en verde al aislarlo).

**Docs actualizados:** este incremento; `docs/OPEN_ISSUES.md` (OI-031 cerrado, con la explicación
completa en español simple pedida por el fundador).

## 2026-08-05 — La espera de pago baja de hasta 60s a menos de 3s (sin tocar el webhook)

**Qué se hizo:** pedido del fundador tras el Incremento 5 — la latencia de hasta 60s del
proveedor simulado (limitada por el mínimo de `pg_cron`) "es un problema de demo, no de
arquitectura", pero arruina el momento al mostrarle el producto a un dueño de bar. Se agregó
`private.notify_payment_intent_created()`, un trigger `after insert on payment_intents` que
llama a `private.invoke_simulated_payment_provider()` — **la misma función que ya usaba el
cron, sin duplicar nada** — apenas se crea la intención de pago, en vez de esperar el próximo
tick del minuto. `net.http_post` es asíncrono (encola el request y sigue), así que
`diner_start_payment` sigue devolviendo "pending" de inmediato, exactamente igual que antes — el
comensal no nota ningún cambio en esa parte.

El cron de 1 minuto **no se quitó** — queda como red de respaldo real: si el trigger falla en
avisar (envuelto en `exception when others` para nunca romper la creación de la intención), el
barrido periódico igual reclama el intento pendiente hasta 60s después. Es el patrón "intento
inmediato + barrido de respaldo" que ya usan sistemas de colas reales, no un atajo.

**Nada cambió en el webhook ni en la verificación de firma** — la condición explícita del
fundador. `apps/web/app/api/payments/webhook/route.ts` es exactamente el mismo archivo que en el
Incremento 5; el Edge Function `simulated-payment-provider` es exactamente el mismo código. Sólo
cambió qué tan rápido algo lo invoca.

**Verificado contra la base real, tres formas:**

- RPC directo con medición de tiempo: `payment.start` → sondeo cada 500ms → confirmado en
  819ms y 1.047ms en dos corridas separadas (antes: hasta 60.000ms).
- Navegador real (Playwright), midiendo desde el clic en "Pagar" hasta que aparece "Tu pedido ya
  está en la barra": **2.839ms** — incluye el intervalo de sondeo de la propia PWA (2.5s), no
  sólo el tiempo del servidor.
- Suite completa como puerta de no-regresión: `pnpm typecheck`/`pnpm lint` limpios, 149/149
  Vitest, 46/46 Playwright e2e — el trigger nuevo no rompió nada del flujo existente.

**Docs actualizados:** este incremento; `DEMO_ACCESS.md` (tiempo de espera corregido).

## 2026-08-05 — OI-034 Incremento 5: pago confirmado server-side, de punta a punta

**Qué se hizo:** el incremento más sensible del tramo — cierra el ciclo completo: sesión →
carta → carrito → quote → **pago confirmado de verdad** → pedido real → comanda real. La regla
del fundador, aplicada sin atajos: la confirmación nunca se origina en el navegador, ni con
proveedor simulado — llega por el mismo camino que llegaría de un proveedor real (webhook al
servidor, firma verificada, dedup por `provider_event_id`).

- `private.diner_start_payment`/`public.diner_start_payment`: lo único que el navegador puede
  disparar. Crea la **intención** de pago (una referencia local, `create_payment_intent` de
  Sprint 2, sin tocar) — nunca la aprueba. Exactamente como una pasarela real: pedís un token de
  transacción de inmediato, la aprobación llega aparte.
- **`supabase/functions/simulated-payment-provider`** (Edge Function nueva): hace de "el
  proveedor" — nunca el navegador la invoca. La dispara `pg_cron` cada 1 minuto (mismo patrón que
  `tax-document-consumer` de Sprint 7), reclama intentos pendientes, decide el resultado (siempre
  "aprobado" en este incremento — rechazos quedan aparte, el código ya existe y está cubierto por
  pgTAP), firma el evento con HMAC-SHA256 y lo **POSTea por HTTP real** al webhook.
- **`apps/web/app/api/payments/webhook/route.ts`** (nueva, el receptor real): nunca la toca el
  comensal — la autentica la firma HMAC, no una sesión. Verifica la firma con ventana anti-replay
  de 300s, y sólo si es válida llama a `worker_confirm_provider_payment_event` (Sprint 2, ya
  probada por pgTAP, nunca antes conectada a ningún caller) con `service_role` — deliberado y
  permitido por `AGENTS.md` §4 ("service_role fuera de rutas de usuario"): ésta no es una ruta de
  usuario, es un receptor de webhook, exactamente como funcionaría con Transbank/Flow reales.
- Infraestructura que faltaba y se construyó porque el incremento no podía avanzar sin ella:
  `create_merchant_account` (nunca existió forma de conectar una pasarela a un tenant),
  `payment_worker_runtime` + `configure_payment_worker_schedule` (agenda del cron + tres secretos
  en Vault: uno para autenticar el cron, otro HMAC compartido con el webhook — desviación
  documentada del patrón de `tax_worker_runtime`: se dejó alcanzable por el dueño con el permiso
  `payments.manage`, no revocada hasta de `service_role`, porque hacía falta poder leer el
  secreto HMAC generado una sola vez para configurarlo también en Vercel).
- `/kds-real` (provisional a propósito, ver OI-038): demuestra que la comanda real llega a algún
  lado observable — no es la reconexión real del KDS.

**Un bug real encontrado verificando, no en revisión de código:** `public.worker_claim_pending_
payment_intents` es `security invoker` (necesario para que corra como `service_role`, el rol del
Edge Function) pero llama por dentro a `private.claim_pending_payment_intents` — y ese grant a
`service_role` se me olvidó. El worker fallaba en silencio con "permission denied" cada minuto
durante casi 8 minutos de pruebas reales hasta diagnosticarlo con una ayuda temporal que invocó
el worker manualmente y leyó la respuesta real de `pg_net` (`net._http_response`). Corregido con
un `grant` en una migración nueva — el mismo error de propagación de invoker de un nivel que ya
se había cometido antes esta sesión, esta vez en el sentido `service_role`, no `anon`.

**Segundo hallazgo menor:** `diner_payment_view` calculaba el número de pedido a mano
(`count(*)` sobre la sesión de mesa) sin saber que `orders.order_number` ya existe como
`identity` real por tenant desde Sprint 3. Corregido para leer la columna real, encontrado
comparando el resultado esperado contra el pedido real de prueba (`order_number: 42`).

**Verificación — de punta a punta, contra la base real y en navegador real, dos veces:**

1. **RPC directo:** carrito real → quote real → `payment.start` (status `pending` inmediato) →
   esperar el cron real (sin disparo manual) → confirmado en 20s la segunda corrida, orden y
   ticket reales con `station_name`, `item_names`, `order_number` correctos.
2. **Navegador real (Playwright), flujo completo:** entrar con QR real, agregar Heineken, ir a
   pagar, tocar "Preparar pago", ver el total congelado, tocar "Pagar", ver la pantalla
   "Estamos confirmando tu pago... el navegador no puede aprobar este pago" (texto que ya existía
   en el diseño, escrito anticipando exactamente esta arquitectura), y **60 segundos después,
   sin ninguna acción del usuario**, la pantalla cambia sola a "Pago confirmado — Tu pedido ya
   está en la barra — Pedido #44 — Barra: Cerveza Heineken 355cc — RECIBIDO".
3. **`/kds-real` en navegador real:** las tres comandas reales creadas durante las pruebas
   aparecen correctamente, con el banner "VISTA PROVISIONAL" visible.
4. Rechazo de firma inválida confirmado: un POST sin firma al webhook responde 401 sin tocar la
   base.

**Nota de honestidad explícita, pedida por el fundador:** el disparador del proveedor simulado es
`pg_cron` cada 1 minuto — la granularidad más fina disponible en este proyecto (sintaxis estándar
de 5 campos). La confirmación real puede tardar hasta ~60s, no es instantánea como en el store
demo (~650ms). Es una latencia real, verificada (20s y 40s en las dos corridas), no oculta — y no
es irrazonable: un proveedor real tampoco confirma siempre al instante. Cuando se conecte una
pasarela real, todo este worker deja de existir — el proveedor llama al webhook directo — y sólo
cambia el adaptador, nunca el receptor ni la verificación.

**Suite completa como puerta de no-regresión:** `pnpm typecheck` y `pnpm lint` limpios, 149/149
Vitest, 46/46 Playwright e2e.

**Docs actualizados:** este incremento; `docs/OPEN_ISSUES.md` (OI-034 actualizado — el lado del
comensal queda cerrado, el del staff sigue abierto; OI-038 nuevo, vista de KDS provisional);
`DEMO_ACCESS.md` (mismo incremento, según la regla de `AGENTS.md`).

## 2026-08-05 — OI-037: el carrito vuelve a 'open' cuando un quote expira

**Qué se hizo:** decisión explícita del fundador tras el hallazgo del Incremento 4 — un quote
vencido no debe dejar a un comensal sin poder pedir por el resto de su sesión de dispositivo. Se
corrigieron dos funciones de Sprint 2 (nunca antes ejercidas por un comensal real):

- `private.release_expired_quote_stock`: el barrido que libera stock de quotes vencidos ahora
  pone `carts.state = 'open'` en vez de `'expired'` (terminal). Los `cart_items` nunca se tocan,
  así que el pedido queda armado tal como estaba.
- `private.release_checkout`: tenía la misma rama a `'expired'` para `p_reason = 'quote_expired'`
  — confirmado por búsqueda exhaustiva que ningún llamador real pasa esa razón literal (es código
  muerto desde que se escribió). Simplificada a siempre `'open'`.
- `private.diner_cart_reopen_notice` (nueva): cuando el carrito reabierto tiene un quote vencido
  como su intento más reciente, arma el aviso "Se venció el tiempo para pagar. Tu pedido sigue
  acá, revísalo y vuelve a pagar." — comparando cada línea del carrito contra los valores
  congelados de ESE quote vencido (nunca otro) para nombrar exactamente qué producto se agotó o
  cambió de precio. `diner_bootstrap_payload` lo adjunta como `cartReopenedNotice`; la pantalla de
  carrito de la PWA lo muestra con el mismo estilo ya usado para otros avisos (`border-warning
  bg-warning-soft`, mismo patrón que `data.waiterPaymentRequest`).
- El quote vencido nunca se toca ni se reutiliza — sigue inmutable. El nuevo se crea recién
  cuando el comensal vuelve a pedirlo, con los precios/disponibilidad vigentes en ese momento.

**Cómo se verificó — con una expiración real de 300s, no simulada, contra la base real:**

- Carrito real con Corona ($3.200) + Agua Mineral ($2.000), quote creado ($6.188 total).
- Mientras se esperaba la expiración real: precio de Corona subido a $7.777 y Agua Mineral
  marcada agotada con la RPC real (`set_product_availability`).
- Tras los 300s reales y el barrido: el carrito volvió a `'open'` con ambas líneas intactas; el
  aviso nombró exactamente "Agua Mineral 500cc" (no disponible) y "Cerveza Corona 355cc" (cambio
  de precio); se pudo seguir agregando al carrito; un quote nuevo usó el precio vigente ($7.777),
  nunca el congelado; el quote viejo quedó exactamente igual (`total_clp` $6.188, `tip_clp` 0,
  `subtotal_clp` $5.200, `tax_clp` $988 — sin cambios, confirmando la inmutabilidad).

**Qué no se verificó esta vez:** el banner de aviso en el navegador real — se confirmó por tipo,
lint, y por reusar exactamente el mismo patrón visual ya probado en este archivo, pero no se
repitió la espera real de 5 minutos en Playwright (el dato que consume ya se probó exacto vía
RPC, y el costo de repetir la espera sólo para la capa visual no se justificaba).

**Suite completa como puerta de no-regresión:** `pnpm typecheck` y `pnpm lint` limpios, 149/149
Vitest, 46/46 Playwright e2e (incluido el test de OI-035, que esta vez pasó — sigue siendo
sensible a la fecha, no una garantía permanente).

**Docs actualizados:** este incremento; `docs/OPEN_ISSUES.md` (OI-037 cerrado); `DEMO_ACCESS.md`
(mismo incremento, según la regla de `AGENTS.md`).

## 2026-08-05 — OI-034 Incremento 4: CheckoutQuote real e inmutable

**Qué se hizo:** cuarto incremento del tramo, el corazón de la garantía financiera. A diferencia
de los tres anteriores, `private.create_checkout_quote` ya existía completa desde Sprint 2 —
congela precio/cantidad/impuesto/propina/total, reserva stock con locks fila por fila,
idempotencia real, TTL configurable, y los triggers `checkout_quotes_immutable`/
`checkout_quote_items_immutable` ya estaban vigentes. **No se tocó esa función.** Se agregó sólo
el wrapper que un comensal real puede invocar:

- `private.diner_create_checkout_quote`/`public.diner_create_checkout_quote`: resuelve el
  carrito del comensal desde su propia sesión ya validada (nunca recibe `cart_id` del cliente,
  igual razón que en el carrito — nadie puede nombrar el carrito de otro) y delega en
  `create_checkout_quote` sin modificarla. Sus rechazos esperados (carrito vacío/cerrado, ítem
  cruzado de venue, stock insuficiente) se capturan y devuelven como `{ok:false, code}`.
- `private.diner_quote_view`: sólo lee columnas ya congeladas de `checkout_quotes` — nunca vuelve
  a consultar `products`/`product_variants`, así que un cambio de precio posterior no puede
  filtrarse por diseño de la consulta, no sólo por el trigger de la tabla.
- `diner_bootstrap_payload` ahora adjunta el quote vigente del comensal (si tiene uno **activo**,
  no expirado) — mismo criterio que ya usaba el store demo (`status === "active"` o no se
  muestra), para que la pantalla nunca ofrezca pagar algo que ya no es válido.
- **Bug de UI encontrado navegando el checkout real, no en revisión de código:** la sección de
  "Método de pago" de `diner-pwa.tsx` era incondicional — mostraba "DEMO · Tarjeta simulada · No
  se cobrará dinero real" también sobre un total real y congelado de Bar La Virgen. Corregido:
  ahora sólo se muestra para `data.demo === true`; una sesión real ve un mensaje honesto ("Pago
  todavía no disponible... muy pronto vas a poder pagar directo desde la mesa") en su lugar.

**Verificación — los cinco puntos exactos que pidió el fundador, contra la base real, con ayudas
temporales creadas y eliminadas en el mismo incremento (`__oi034_i4_*`, tres migraciones):**

1. **Inmutabilidad:** una función con privilegios de dueño intentó `update checkout_quotes set
   tip_clp = tip_clp + 1` sobre un quote real — el trigger lo rechazó (confirmado `true`/bloqueado,
   no sólo que RLS bloquea a `authenticated`, que ya se sabía).
2. **Congelamiento:** se creó un quote real (Corona x2 + propina $500 → subtotal $6.400, impuesto
   $1.216, total $8.116), se subió el precio de Corona a $9.999 con privilegios de dueño, se
   releyó el quote — exactamente igual. La carta sí mostró $9.999 (confirmando que el cambio
   ocurrió de verdad). Precio restaurado después.
3. **Producto agotado después del quote:** se marcó Corona agotada con la RPC real
   (`set_product_availability`) después de crear el quote — el quote siguió idéntico, sin
   romperse. Restaurado disponible después.
4. **Expiración real (no simulada):** se bajó el TTL de Bar La Virgen al mínimo permitido por el
   esquema (300s, el `check` no deja menos) con una ayuda temporal, se creó un quote real, se
   esperaron los 300s de verdad, y se confirmó que el bootstrap deja de traer `quote` una vez
   expirado. TTL restaurado a 600s después.
5. **Aislamiento entre comensales:** un segundo comensal con el carrito vacío en la misma mesa
   intentó cotizar — rechazado (`cart_empty`, nunca tocó el carrito ni el quote del primero,
   confirmado releyendo después que seguían intactos).

**Hallazgo real, no pedido pero encontrado al verificar el punto 4 — registrado en OPEN_ISSUES.md
como OI-037, no corregido unilateralmente:** el barrido real que libera el stock de un quote
vencido (`private.release_expired_quote_stock`, Sprint 2, sin tocar) deja el carrito en estado
`'expired'`, que es terminal — no en `'open'`, aunque el trigger de transición sí lo permitiría.
Como el carrito de un comensal está atado para siempre a su sesión de dispositivo, un comensal
cuyo quote expira **no puede volver a agregar nada a su carrito nunca más** en esa sesión
(confirmado: `diner_cart_add_item` responde `cart_not_open` después del barrido). Esto es
consecuencia de una decisión de Sprint 2 nunca antes ejercida por un comensal real — no es un bug
de este incremento, pero si nadie decide qué hacer antes del Incremento 5, un comensal lento para
pagar queda sin poder pedir en su mesa por el resto de la ventana de su sesión (hasta 12h).
Registrado para que el fundador decida, no resuelto por mi cuenta.

**Otro hallazgo, de tooling, ya venía anotado desde el Incremento 3:** el MCP de Supabase
conectado en este entorno sigue sin acceso al proyecto real — no se pudieron correr los
*security advisors* tampoco en este incremento. Reforzado en OPEN_ISSUES.md (bajo OI-031) como
bloqueante explícito antes de cerrar el tramo completo.

**Suite completa como puerta de no-regresión:** `pnpm typecheck` y `pnpm lint` limpios, 149/149
Vitest, 46/47 Playwright e2e (el único que no pasa sigue siendo OI-035, ajeno a este cambio).

**Docs actualizados:** este incremento; `docs/OPEN_ISSUES.md` (OI-037 nuevo, refuerzo de la nota
de OI-031); `DEMO_ACCESS.md` (mismo incremento, según la regla nueva de `AGENTS.md`).

## 2026-08-05 — OI-034 Incremento 3: carrito real del comensal

**Qué se hizo:** tercer incremento del tramo. `carts`/`cart_items` existían completas desde
Sprint 2 (estado, triggers de transición, FK a `diner_device_sessions` agregada en Sprint 3) pero
ninguna RPC las tocaba nunca — RLS deja a `authenticated` sólo `SELECT` y a `anon` nada. Se agregó:

- `private.diner_cart_add_item` / `diner_cart_update_item` / `diner_cart_remove_item` (+ wrappers
  públicos): mismo molde que Incrementos 1-2 — `require_diner_device_session` revalida la sesión
  en cada una (sin `p_table_id`, igual que `diner_bootstrap_menu`, porque el cliente nunca reclama
  una mesa distinta a la de su propia sesión). Rechazo de negocio esperado (agotado, sin stock,
  checkout ya empezado) vuelve como `{ok:false, code}`, nunca excepción — mismo patrón que
  `enter_table` para no repetir el bug del audit_log del Incremento 1.
- `private.diner_cart_view` + `private.diner_bootstrap_payload`: se refactorizó
  `diner_bootstrap_menu` para delegar en un helper común que ahora también arma el carrito real —
  así una recarga de página ya no muestra un carrito vacío si el comensal había agregado algo.
- Decisión de diseño: `carts.device_reference_hash` (mecanismo de Sprint 2, previo a
  `diner_device_sessions`) se sigue poblando, pero derivado con `sha256` del
  `diner_device_session_id` en vez de un fingerprint aparte — así el UNIQUE ya existente
  `(tenant_id, table_session_id, device_reference_hash)` sigue dando exactamente un carrito por
  sesión de comensal por mesa, sin migrar columnas ni relajar el constraint.
- **Fuera de alcance a propósito:** invitar a otra mesa, premio de fidelidad y upsell en el
  carrito. Existen columnas/RPCs parciales de sprints anteriores para algo de esto
  (`add_loyalty_reward_to_cart`, huérfana y revocada), pero apuntan a otro mecanismo y no se
  conectan aquí — el carrito real de este incremento es sólo producto + variante + cantidad +
  nota, lo mínimo para que exista un pedido real en el Incremento 4.

**Cómo se verificó — RPC directo y navegador real, con dos sesiones anónimas simultáneas:**

- Negroni (agotado): rechazado con `product_unavailable`, el carrito queda intacto.
- Agregar 2 Corona con nota, luego 1 más con la misma nota: se fusiona en una sola línea con
  cantidad 3 (no dos líneas duplicadas) — mismo comportamiento que ya tenía el store demo.
- Heineken (stock 4) pedido en cantidad 999: rechazado con `insufficient_stock`, sin tocar el
  carrito.
- Actualizar cantidad, recargar la página (`diner_bootstrap_menu`): el carrito persiste con la
  cantidad correcta y el subtotal correcto ($3.200 × 5 = $16.000).
- **Aislamiento entre comensales de la misma mesa, la garantía central de "cada persona paga lo
  suyo":** un segundo dispositivo real entrando a la misma mesa ve un carrito vacío, y al intentar
  actualizar la línea del primero recibe `line_not_found` (nunca la toca) — confirmado que la
  línea del primero sigue intacta después.
- Cantidad en 0 elimina la línea; eliminarla de nuevo es idempotente (no falla).
- **Navegador real (Playwright), no sólo RPC:** agregar Corona desde la carta real deja el badge
  del carrito en "1"; Negroni sigue sin botón de agregar.
- Suite completa como puerta de no-regresión: `pnpm typecheck` y `pnpm lint` limpios, 149/149
  Vitest, 46/47 Playwright e2e (el único que no pasa sigue siendo OI-035, ajeno a este cambio).

**Qué no se pudo correr esta vez:** los *security advisors* de Supabase — la cuenta del MCP
conectado en este entorno no tiene acceso al proyecto real de Tablio (lista otros proyectos, no
éste). Sustituido por una verificación manual: revisión de cada `grant`/`revoke` del archivo
contra el patrón ya establecido, y una prueba en vivo de que `private.diner_cart_view` y
`private.diner_bootstrap_payload` no son alcanzables por PostgREST bajo ningún nombre público.

**Docs actualizados:** este incremento.

## 2026-08-04 — DEMO_ACCESS.md al día + producción de Vercel sin Supabase configurado

**Qué se hizo:** al pedir el fundador que `DEMO_ACCESS.md` reflejara el Incremento 2 y agregara
la URL pública (`tabliocl.vercel.app`) para probar desde el celular sin levantar nada, verificar
esa URL antes de documentarla destapó dos problemas reales, no sólo desactualización del texto:

1. El último despliegue a producción tenía 6 días — nada de lo construido desde entonces (Tarea
   4, migración visual de la PWA, Incrementos 1 y 2 de OI-034) había llegado nunca ahí. Este
   proyecto despliega con `vercel deploy --prod` manual, no automático al hacer `git push`.
2. **Más grave:** `vercel env ls` no mostraba ninguna variable `NEXT_PUBLIC_SUPABASE_*` en
   Production. El proyecto de Vercel nunca tuvo Supabase configurado — `/login` y `/dueno-real`
   daban 500 ahí desde que se construyó la Tarea 4. Todo el lado real de la app estuvo
   inalcanzable en la URL pública durante todo ese tiempo; sólo se había verificado contra
   local. El demo simulado no depende de Supabase, así que nunca lo mostró.

**Corregido con confirmación explícita del fundador antes de cada paso** (desplegar a producción
y tocar variables de entorno de un proyecto compartido no son acciones que se toman sin avisar):
se agregaron `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (claves
públicas/anon, las mismas que ya usa el cliente del navegador — nunca `service_role`) a Vercel
Production, y se corrió un nuevo `vercel deploy --prod`.

**Cómo se verificó — contra la URL pública real, después del fix:**

- `/login` responde 200 (antes 500); `/dueno-real` redirige correctamente sin sesión (antes 500).
- La PWA con el QR/código real de Mesa 1 (documentado en `DEMO_ACCESS.md`) entra, muestra la
  carta real de Bar La Virgen, y una mutación más allá de `join` (ej. `cart.add`) responde 501
  "todavía no disponible" — mismo comportamiento que en local, nunca cae al demo.
- El demo simulado (`?qr=demo-mesa-8`) sigue respondiendo igual que antes del deploy.

**Docs actualizados:** `DEMO_ACCESS.md` reescrito para reflejar el estado real de hoy (qué se
puede probar y qué no, con URLs locales y públicas); `docs/OPEN_ISSUES.md` (nota cerrada en
OI-032); `AGENTS.md` — nueva regla explícita: `DEMO_ACCESS.md` se actualiza en el mismo
incremento en que cambia lo que es real, no al cierre del tramo (pedido directo del fundador,
motivado por este mismo hallazgo).

## 2026-08-04 — OI-034 Incremento 2: carta real de solo lectura en la PWA

**Qué se hizo:** segundo incremento del tramo. La PWA del comensal (`/mesa/[qr]`) ahora puede
mostrar la carta real de un tenant en vez de sólo la carta simulada en memoria. Se agregó:

- `private.diner_menu(p_tenant_id)`: consulta la carta real — disponibilidad calculada como
  `available_for_order AND (not track_stock OR on_hand - reserved > 0)`. Nunca otorgada
  directamente a `anon`; sólo la llama otra función `security definer`.
- `private.diner_bootstrap_menu`/`public.diner_bootstrap_menu`: valida la sesión con
  `require_diner_device_session` (del Incremento 1, ahora con `p_table_id` opcional para que una
  recarga de página sólo con el token de dispositivo también funcione) y devuelve carta + sesión +
  venue/mesa/moneda + sugerencias de propina en una sola ida y vuelta.
- `apps/web/lib/diner-real-store.ts` (nuevo): capa TypeScript que arma el `DinerBootstrap` real.
  Todo lo que todavía no tiene RPC real detrás (carrito, quote, pago, fidelidad, saldo, upsell)
  se devuelve vacío/deshabilitado explícito — nunca simulado, para que la pantalla no muestre
  datos falsos de un incremento que no existe todavía.
- `apps/web/app/api/diner/route.ts`: ahora distingue QR real vs. demo (`isRealQrToken`, sólo
  `demo-mesa-8`/`demo-mesa-9` siguen siendo demo) y rechaza explícitamente cualquier mutación que
  no sea `join` para una sesión real con 501 ("todavía no está disponible") — nunca cae en
  silencio al store en memoria.

**Dos bugs reales encontrados, uno en la base y uno en la UI:**

1. `require_diner_device_session` exigía `p_table_id` obligatorio, pero una recarga de página
   sólo tiene el token de dispositivo (cookie) y el `qrToken` de la URL, no el UUID interno de la
   mesa. Se hizo `p_table_id` opcional (`default null`, sólo valida el cruce si se entrega) y se
   agregó `table_id` a lo que la función devuelve.
2. **En la UI:** el banner "Modo demo · no mueve dinero real" y el hint "Para esta demo usa 4826"
   en `diner-pwa.tsx` eran incondicionales — se mostraban también en una sesión real de Bar La
   Virgen. Encontrado navegando la PWA real con Playwright, no en revisión de código. Corregido:
   ambos ahora sólo se muestran cuando `data.demo === true`.

**Cómo se verificó — RPC directo y navegador real, sin login, contra el proyecto real:**

- Entrada anónima real en Mesa 4/5 de Bar La Virgen vía `enter_table` → `diner_bootstrap_menu`:
  20 productos, 6 categorías, venue/mesa/propinas correctos.
- **Producto agotado y con stock limitado (pedido explícito del fundador):** Negroni
  (`available_for_order` pero sin stock) aparece con la etiqueta "Agotado", sin botón de agregar,
  la tarjeta atenuada, y el click no abre el detalle (`if (!product.available) return;` en el
  handler). Corona (stock 24) y Heineken (stock 4) aparecen normales, con botón de agregar
  habilitado y abren el detalle con "Agregar" — confirmado con Playwright contra el navegador
  real, no sólo a nivel de RPC.
- Recarga de página sin volver a pedir el código: funciona (usa sólo la cookie de dispositivo).
- QR token basura: rechazado limpiamente.
- Suite completa como puerta de no-regresión sobre el store demo: `pnpm typecheck` y `pnpm lint`
  limpios, 149/149 Vitest, 46/47 Playwright e2e (el único que no pasa es el ya registrado como
  OI-035, sensible a la fecha, confirmado no relacionado a este cambio). Un test de e2e
  (`sprint-10-hardening.spec.ts`, QR revocado/desconocido) sí regresionó primero: esperaba 404 y
  el camino real devolvía 400 para el mismo código `invalid` de `verify_table_presence`. Corregido
  mapeando ese código a 404 en `diner-real-store.ts`, mismo contrato que ya usaba
  `diner-demo-store.ts` — vuelto a correr la suite completa después, verde.

**Docs actualizados:** este incremento.

## 2026-08-04 — OI-034 Incremento 1: sesión real del comensal

**Qué se hizo:** primer incremento del tramo de toma de pedidos real. El esquema para esto ya
existía completo desde el Sprint 3 (`diner_device_sessions`, `tenant_diner_settings` con sus TTL
de 4h/12h ya definidos, el trigger que los aplica) — nunca se había cableado a ninguna RPC. Se
agregó, por decisión explícita del fundador de reusar `verify_table_presence` tal cual en vez de
inventar un token nuevo:

- `private.claim_live_table_session`: abre (o reutiliza) la sesión de mesa viva — es el primer
  INSERT que existe hacia `table_sessions` en todo el esquema; abrir una mesa nunca se había
  cableado tampoco. Alcance mínimo a propósito: sólo abre, no cierra (el ciclo de vida completo
  de cierre de mesa es otro incremento).
- `private.require_diner_device_session`: valida y refresca la prueba de sesión en cada llamada
  — la pieza que van a reusar los incrementos 3, 4 y 5. Rechaza sesión inexistente, vencida
  (idle 4h / absoluto 12h, según ya definía Sprint 3), de otra mesa, o cuya `table_session` ya no
  está abierta — y en ese último caso la marca `revoked` de inmediato, no sólo la rechaza esa vez.
- `public.enter_table`/`private.enter_table`: punto de entrada real. Delega la verificación a
  `verify_table_presence` (reusa su limitador de intentos por dispositivo/mesa tal cual), aplica
  el techo nuevo de sesiones activas por mesa (`tenant_diner_settings.max_active_sessions_per_table`,
  default 20), y crea la sesión.

**Tres bugs reales encontrados verificando contra la base real (no en revisión de código):**

1. El techo de candidatos de alias en la RPC (30) era menor que el tamaño real de la lista de
   palabras que ya usa el producto (84 combinaciones, `apps/web/lib/diner-alias.ts`) — ninguna
   llamada real podía completarse nunca.
2. `returns table(..., alias text, ...)` crea una variable PL/pgSQL implícita llamada `alias`
   que colisionaba con la columna `alias` en el `returning` del insert ("column reference alias
   is ambiguous").
3. El más importante: el registro en `audit_log` para "se alcanzó el tope de sesiones" iba
   seguido de un `raise exception` en la misma transacción — Postgres deshace toda la transacción
   cuando la excepción se propaga, así que el registro nunca quedaba escrito, a pesar de que el
   código "se veía bien". Se corrigió alineando `enter_table` al mismo patrón que ya usaba
   `verify_table_presence` para su propio caso de bloqueo: devuelve un resultado (`{ok, code}`)
   en vez de lanzar excepción para los rechazos esperados de negocio, reservando las excepciones
   de verdad para entradas inválidas. Verificado de nuevo después: el registro sí queda escrito.

**Cómo se verificó — contra el proyecto real, con navegador/cliente anónimo, sin login:**

- Entrada real y anónima en Mesa 1 de Bar La Virgen: crea una sesión real, alias "Zorro Azul",
  `idle_expires_at` exactamente 4h después de crearse, `absolute_expires_at` exactamente 12h
  después — coincide con los valores que ya definía Sprint 3.
- Código de presencia incorrecto: rechazado limpiamente (`invalid_code`), reusa el limitador
  existente, no crea ninguna sesión.
- Colisión de alias bajo carga real: dos dispositivos entrando a la misma mesa con la misma
  lista de candidatos — el segundo reintenta automáticamente y obtiene el siguiente alias libre.
- **Tope de sesiones por mesa, probado de verdad:** 20 sesiones reales creadas en una mesa real
  (Mesa 15), la intento 21 rechazado con el error esperado (`table_session_limit_reached`), y el
  registro en `audit_log` confirmado presente después del fix del bug 3.

**Qué NO se pudo verificar en este incremento — hueco de infraestructura, no de código:** el
camino de "la sesión no sobrevive al cierre de la mesa" en `require_diner_device_session` se
escribió como prueba pgTAP (`supabase/tests/database/012_diner_device_session.test.sql`, 5
aserciones) pero **no se pudo ejecutar** — nada en el esquema cierra una `table_session` todavía
(no hay forma de provocar el escenario contra la base real) y esta máquina no tiene Docker para
correr un stack local (mismo hueco ya documentado en OI-031). Queda verificado sólo por revisión
manual cuidadosa del SQL, no por ejecución. Registrado como continuación de OI-031, no como
asunto nuevo.

**Docs actualizados:** este incremento; `docs/OPEN_ISSUES.md` (nota en OI-031).

## 2026-08-04 — Cierre formal del Sprint 14: auditoría final y 28 bugs silenciosos más

**Qué se hizo:** al preparar `docs/sprints/SPRINT-14-SUMMARY.md`, el fundador pidió el conteo
final de colores/tamaños/radios/espaciados fuera de escala contra el inventario inicial. No se
encontró ningún registro de ese inventario en el repositorio (buscado en `docs/`,
`docs/evidence/` y todo el historial de commits de Sprint 14) — en vez de inventar la
comparación, se le preguntó al fundador cómo seguir; eligió una auditoría verificada contra el
código actual en vez de la comparación histórica.

Esa auditoría (grep sistemático de clases `bg-[#...]`/`text-[...]`/`rounded-[...]` y de la
escala de espaciado restringida del proyecto) encontró **28 usos más** del mismo bug de espaciado
silencioso ya cerrado en la PWA del comensal (clases como `p-5`/`pb-28`/`w-64` que no generan
ningún CSS en la escala de este proyecto, que sólo expone los pasos 4/8/12/16/24/32/48/64 px) —
repartidos en Equipo, Configuración, Soporte, Reportes (introducidos en este mismo sprint) y
Garzón, KDS, Onboarding y el componente compartido `Textarea` (pre-existentes, de antes de este
incremento). El más notable: `Textarea` (usado por Soporte y potencialmente cualquier pantalla
futura) tenía `min-h-24` sin efecto — el alto mínimo nunca se aplicaba. Todos corregidos al valor
de escala más cercano o a un valor entre corchetes cuando ninguno alcanzaba.

**Cómo se verificó:** auditoría de espaciado repetida tras corregir — 0 usos fuera de escala en
todo `apps/web/app` y `apps/web/components`. `pnpm typecheck`, `pnpm lint`, `pnpm test`
(149/149) en verde. Playwright completo: 45/46 (única falla, OI-035, no relacionada). Revisión
visual por captura de Onboarding (escritorio), KDS y Garzón (login) tras los cambios — sin
regresiones de layout.

## 2026-08-03 — Tarea 3: migración visual de la PWA del comensal

**Qué se hizo:** `apps/web/app/mesa/[qr]/diner-pwa.tsx` reescrito completo (~2000 líneas, 9
pantallas internas) al sistema de diseño — mismo alcance que las 8 migraciones anteriores: sólo
presentación, cero cambios de lógica de negocio, mismo estado y handlers. Detalle completo,
incluidos los tres bugs reales encontrados y corregidos antes de reportar (botón sin fondo
explícito casi invisible, botones deshabilitados ilegibles sobre tarjetas oscuras, y once clases
de espaciado que no generaban CSS por la escala restringida de este proyecto — una de ellas
tapaba el botón de pago detrás del menú inferior), en `docs/DESIGN_SYSTEM.md` (sección "PWA del
comensal").

**Prioridad de diseño explícita del fundador:** celular, una mano, bar oscuro y ruidoso, cliente
apurado — legibilidad sobre estética. Ninguna superficie usa `backdrop-filter` (la única que
existía en el diseño anterior, la barra superior, se quitó). Las superficies de dinero (total del
carrito, total del checkout, total a pagar, confirmación de pago) usan el mismo patrón ya
validado en Crédito: fondo opaco sin modificador de opacidad + color de texto explícito en cada
elemento, nunca heredado del contenedor.

**Cómo se verificó:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (149 tests) en verde. Las 18
pruebas E2E que ejercitan `/mesa/[qr]` (`diner-pwa.spec.ts`, `sprint-10-hardening.spec.ts`
—incluye el test dedicado a que las superficies de dinero sean sólidas—, `loyalty.spec.ts`,
`stored-value.spec.ts`, `checkout-engagement.spec.ts`) en verde antes y después de la migración.
Además, por instrucción explícita del fundador dado el antecedente de Crédito (código de
verificación invisible), revisión manual por captura de pantalla de las 9 pantallas internas
(entrada, carta, detalle de producto, carrito, checkout con propina, pago, estado en vivo, ayuda,
sellos/saldo guardado) buscando específicamente texto ilegible — encontró los tres bugs reales
listados arriba, todos corregidos y reverificados con nuevas capturas antes de reportar terminado.
La suite completa de Playwright (46 tests) corrida al final: 45 en verde, 1 falla pre-existente y
no relacionada (`credit-owner.spec.ts`, sensible a la fecha real del sistema, no toca nada de
esta pantalla — confirmado corriendo el mismo test contra el código sin estos cambios, con el
mismo resultado).

**Qué NO cambió:** la pantalla sigue sobre `diner-demo-store.ts`, no sobre la base real — ver
OI-033. Con esto, las 13 pantallas de producto planeadas (9 del sistema de diseño original + las
4 de la Tarea 4, que nacieron ya migradas) están completas visualmente.

## 2026-08-03 — Tarea 4: Reportes del dueño (última pantalla de la Tarea 4)

**Qué se hizo:** pantalla `/reportes`, sin migración nueva — se apoya enteramente en
`public.owner_dashboard_summary(p_venue_id, p_from, p_to)`, una RPC que ya existía desde el
Sprint 9 (`20260729172848_sprint_09_table_credit_owner.sql:1161`) y que `/dueno-real` ya usaba
como prueba de humo. Selector de rango (Hoy / últimos 7 días / últimos 30 días / fechas
personalizadas) y tarjetas: ventas totales, pedidos, ticket promedio, ventas prepago vs. crédito
de mesa, pérdida por crédito del mes, excepciones de conciliación sin resolver, y un gráfico de
barras de ventas por hora (mismo patrón visual que el gráfico de `/dueno`, adaptado a los campos
reales de la RPC en vez del *store* de demo). Se agregó "Reportes" al menú lateral del dueño
(ícono nuevo `ReportsIcon`).

**Honestidad de datos:** como ningún flujo de toma de pedidos escribe todavía en la base real
(OI-033), `history_starts_at` viene `null` y todos los números están en `$0`. La pantalla lo dice
explícitamente con una alerta, en vez de mostrar ceros sin explicación como si el reporte
estuviera roto.

**Cómo se verificó:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (149 tests) en verde.
Verificación real con navegador contra el proyecto real: login → `/reportes` → tarjetas muestran
los valores reales devueltos por la RPC (todos en $0, como se espera) → aviso de "sin pedidos
reales todavía" visible → cambiar el rango a "últimos 7 días" vuelve a llamar la RPC con el nuevo
rango sin errores. No se creó ningún dato de prueba esta vez — es una pantalla de sólo lectura,
no había nada que limpiar después.

**Fuente de datos de esta pantalla:**

| Pantalla tocada este incremento | Fuente | Nota |
| --- | --- | --- |
| `/reportes` | **Real** (Supabase, RPC `owner_dashboard_summary`) | Cuarta y última pantalla de la Tarea 4 sobre la base real. Cierra la Tarea 4. |

**Tarea 4 completa.** Las cuatro pantallas pedidas (Equipo, Configuración del local, Soporte,
Reportes) están construidas sobre Supabase real, verificadas con navegador contra el proyecto
real, no contra *stores* en memoria. Sigue la migración visual de la PWA del comensal (Tarea 3),
y después el trabajo de fondo de OI-033 (las 8 pantallas ya migradas visualmente que todavía
corren sobre *stores* en memoria).

## 2026-08-03 — Tarea 4: pantalla Soporte, dominio de tickets nuevo desde cero

**Qué se hizo:** dominio nuevo, no reutiliza nada existente — decisión explícita del fundador,
porque `tickets`/`ticket_state_events` del Sprint 2 son comandas de cocina/barra, un concepto de
negocio distinto que sólo comparte el nombre. Migración
`supabase/migrations/20260803190000_sprint_14_support_tickets.sql`: tablas
`support_tickets`/`support_ticket_messages`, RLS propia (permisos nuevos `support.read`/
`support.manage`, otorgados sólo a `owner` por ahora), sin RPC — igual que zonas/estaciones,
estas tablas no tienen la política restrictiva de `commercial_admin_*_gate`, así que el insert
directo autenticado funciona sin necesidad de una función `security definer`. El modelo ya
contempla `author_type = 'platform'` para cuando exista una identidad de soporte de Tablio que
responda desde Superadmin — no implementado todavía, fuera de alcance de este incremento.

Pantalla `/soporte`: lista de tickets propios, crear ticket nuevo (asunto + categoría + mensaje),
ver el hilo completo, responder, marcar resuelto/cerrado, reabrir. Se agregó "Soporte" al menú
lateral del dueño (antes sólo tenía 5 ítems, ahora 6) con un ícono nuevo (`SupportIcon`,
`apps/web/components/ui/icons.tsx`).

**Cómo se verificó:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (149 tests) en verde. Verificación
real con navegador contra el proyecto real: login → crear ticket → verlo en la lista → abrir el
detalle → responder → marcar resuelto → confirmar que el estado se refleja en la lista. Al
intentar borrar ese ticket de prueba después de verificar (mismo criterio que con la zona de
prueba de Configuración), la base lo rechazó silenciosamente — no hay política RLS de `delete`
en `support_tickets`, a propósito, mismo criterio que en Equipo (el dominio no borra, cambia de
estado). No tenía a mano una credencial con privilegios para forzar el borrado fuera de RLS, así
que **el ticket de prueba "No puedo revelar el QR de una mesa" quedó real y resuelto en la base**
— documentado en `DEMO_ACCESS.md` para que no sea una sorpresa, igual que se hizo con la
empleada Camila Torres en el incremento de Equipo.

**Fuente de datos de esta pantalla:**

| Pantalla tocada este incremento | Fuente | Nota |
| --- | --- | --- |
| `/soporte` | **Real** (Supabase, RLS) | Dominio nuevo desde cero, tercera pantalla de producto sobre la base real |

**Qué NO se hizo (fuera de alcance):** ninguna identidad de "Soporte Tablio" que responda desde
el otro lado — hoy sólo el dueño escribe y se responde a sí mismo o cierra su propio ticket; no
hay notificación por correo de tickets nuevos; no hay adjuntar archivos.

## 2026-08-03 — Tarea 4: pantalla Configuración del local, sobre datos reales

**Qué se hizo:** pantalla nueva en `/configuracion` (Zonas, Estaciones, Mesas, Carta), construida
directamente sobre Supabase real, sobre el tenant piloto ya poblado. Reutiliza el mismo mecanismo
de autenticación/autorización de Equipo (`requireAuthenticatedTenantClient`), sin RPC nuevas más
allá de las dos agregadas en el incremento anterior (`create_menu_category`, `create_product`) y
las ya existentes (`create_tables_with_assets`, `reveal_table_qr_token`,
`reveal_table_presence_code`, `set_product_availability`). Rutas nuevas bajo
`apps/web/app/api/configuracion/**` (zonas, estaciones, mesas, mesas/[id]/qr, categorias,
productos, productos/[id]/disponibilidad). Se corrigió también el enlace "Configurar" del menú
lateral del dueño, que hasta ahora apuntaba a `/onboarding` (demo) — ahora apunta a `/configuracion`
(real); ver la nota nueva en OI-032 sobre por qué los otros enlaces del menú siguen sin corregir.

**Cómo se verificó:** `pnpm typecheck`, `pnpm lint` y `pnpm test` (149 tests) en verde. Además,
verificación real con navegador (Playwright, script ad-hoc, no parte de la suite) contra el
servidor de desarrollo apuntando al proyecto real: login real → `/configuracion` → las 3 zonas,
2 estaciones y 18 mesas reales se ven correctamente → "Ver QR y código" en Mesa 1 reveló
exactamente el código de presencia y token QR ya documentados en `DEMO_ACCESS.md` (8447 /
`e6Q9x3aD...`) → la carta muestra las 6 categorías y 20 productos, incluido el badge "Agotado" en
Negroni → creación de una zona nueva de principio a fin contra la base real (después borrada, era
sólo para la verificación). `pnpm test` corrido después de la limpieza para confirmar que no
quedó nada roto.

**Fuente de datos de esta pantalla:**

| Pantalla tocada este incremento | Fuente | Nota |
| --- | --- | --- |
| `/configuracion` | **Real** (Supabase, RLS) | Segunda pantalla de producto sobre la base real, junto a Equipo |

**Qué NO se hizo (fuera de alcance de este incremento):** editar/eliminar zonas, estaciones o
categorías ya creadas; editar precios de productos existentes; segunda zona/venue por tenant
(fuera del alcance congelado de un venue por tenant). Se agregará si se necesita, no antes.

## 2026-08-03 — Carga del tenant piloto "Bar La Virgen" con datos reales

**Qué se hizo:** por instrucción explícita del fundador, antes de seguir con Configuración del
local/Soporte/Reportes se cargó el tenant piloto real con datos completos, usando los flujos
reales de la aplicación siempre que existían:

- 3 zonas (Terraza, Salón, Barra) — insert directo, RLS gated por `configuration.manage`, sin RPC
  dedicada porque no la necesita (mismo patrón ya verificado para Tarea 4).
- 2 estaciones (Barra, Cocina) — igual que zonas.
- 18 mesas (8 Terraza, 6 Salón, 4 Barra) vía `create_tables_with_assets`, la RPC real que genera
  QR (Vault) y código de presencia atómicamente, exactamente el mismo mecanismo que usará
  Configuración del local cuando exista.
- Carta: 6 categorías y 20 productos (cervezas, cócteles, vinos, para picar, sándwiches, sin
  alcohol) con precios reales de mercado chileno, descripciones y alérgenos; 2 productos con
  stock limitado vía `inventory_levels` y 1 marcado agotado vía la RPC real
  `set_product_availability`.
- Personal: 3 garzones activos (Camila Torres, Matías Rojas, Fernanda Soto) + 1 cajero (Valentina
  Reyes), vía la RPC real `create_employee` (la misma que ya usa la pantalla Equipo). Se creó una
  cuarta persona (Ignacio Muñoz) por error de conteo — Camila ya existía de la verificación
  anterior de Equipo y se contó dos veces — y se corrigió suspendiéndola con el flujo real de
  "Suspender" en vez de borrarla (no existe un delete real, es una decisión de diseño del
  dominio: el personal no se borra, se suspende).

**Hallazgo real en el camino — RPCs de carta que no existían:** insertar directo en
`menu_categories`/`products` como `authenticated` falla con "permission denied for function
tenant_admin_writes_allowed". Investigando: esas 4 tablas (`products`, `product_variants`,
`menu_categories`, `tables`) tienen una política RLS restrictiva
(`commercial_admin_*_gate`, `20260729163957_sprint_08_onboarding_billing_superadmin.sql:1057-1078`)
que exige `private.tenant_admin_writes_allowed(tenant_id)` — y esa función tiene un
`revoke execute ... from public, anon, authenticated` explícito e intencional en la misma
migración (línea ~1154). No es un bug de grant faltante como el de `set_active_tenant` (OI-030):
es una decisión de diseño — esas 4 tablas sólo se pueden escribir a través de una función
`security definer` (que corre con los privilegios de su dueño, no del rol `authenticated`),
nunca con un insert directo desde la app. `tables` ya tenía esa función
(`create_table_with_assets`); `products`/`menu_categories` no tenían ninguna todavía porque
Configuración del local nunca se construyó. Se agregaron `create_menu_category`/`create_product`
en `supabase/migrations/20260803174500_sprint_14_catalog_management.sql`, mismo patrón que
`create_employee` (valida `catalog.manage`, security definer, wrapper público security invoker,
audit_log). Aplicado vía `supabase db push`, verificado con `supabase migration list` (local y
remoto sincronizados). Esto no fue una corrección de un bug en producción — fue construir, por
primera vez, la capacidad que Configuración del local necesitará de todos modos.

**Cómo se verificó:** todo el script (`load-pilot.js`, documentado y repetible, guardado en el
scratchpad de esta sesión) corre autenticado como el dueño real (login → `set_active_tenant` →
`refreshSession`), exactamente como lo haría la app — no se usó `service_role` ni SQL directo
contra las tablas de negocio. Se confirmó el estado final leyendo la base con el mismo cliente
autenticado: 3 zonas, 2 estaciones, 18 mesas, 6 categorías, 20 productos, 4 personas activas (3
garzones + 1 cajero) + el dueño.

**Qué NO cambió:** `/dueno`, `/dueno/mesas`, `/caja`, `/kds`, `/garzon`, `/superadmin`,
`/onboarding`, `/credito` y la PWA del comensal siguen sobre *stores* en memoria (OI-033) — el
dato real que se acaba de cargar todavía no tiene pantalla que lo muestre, salvo `/equipo`. La
mesa de muestra documentada en `DEMO_ACCESS.md` tiene un código de presencia y un QR reales, pero
la PWA del comensal no los puede leer todavía porque sigue en el demo simulado.

**Docs actualizados:** `DEMO_ACCESS.md` reescrito completo; `docs/OPEN_ISSUES.md` (OI-032, nueva
nota sobre el menú lateral del dueño mal enlazado, encontrada al navegar entre `/dueno-real` y
`/equipo`).

## 2026-08-03 — Tarea 4: pantalla Equipo, primera pantalla de producto sobre datos reales

### Qué cambió

- Nueva migración `20260803161135_sprint_14_employee_management.sql`: dos RPC
  (`create_employee`, `set_employee_pin`) que hashean el PIN en Postgres con
  `extensions.crypt(..., extensions.gen_salt('bf'))` — el mismo esquema que ya usaba la
  verificación de PIN de Sprint 5 — y auditan la acción en `audit_log`. Listar/activar/suspender
  no necesitó RPC nueva: las políticas RLS de `staff.read`/`staff.manage` ya existían y alcanzan.
  Aplicada al proyecto real con `supabase db push` (no con una ejecución SQL suelta, para no
  repetir el problema de historial de OI-027).
- `apps/web/app/equipo/`: pantalla real (lista, crear persona con PIN y roles, suspender/
  reactivar, restablecer PIN), sobre `apps/web/lib/supabase/route-handler-client.ts` del
  incremento de autenticación.
- `apps/web/components/operational/owner-navigation.ts`: el ítem "Equipo" apuntaba a `/garzon`
  (el panel operativo del garzón, no gestión de personal) — bug heredado de un sprint anterior.
  Corregido para apuntar a `/equipo` y participar del estado activo de la navegación.
- `apps/web/lib/ui-statuses.ts`: `employeeStatusDictionary`, `roleCodeLabels`.

### Verificación

- Migración aplicada y confirmada en `supabase migration list` (local y remoto coinciden).
- Función probada en vivo contra producción, autenticado como el dueño real: creó un empleado de
  prueba, confirmado en `select * from employees`, luego borrado (no era para quedarse — la
  pantalla real es la que agrega personal de verdad).
- Flujo completo por navegador (Playwright + Chrome, sesión real): estado vacío → crear "Camila
  Torres" con rol Garzón → aparece en la lista → suspender → reactivar → restablecer PIN. Cada
  paso confirmado contra la base real, incluida la fila nueva en `audit_log`
  (`staff.created`, `staff.pin_reset`).
- Sin sesión, `/equipo` redirige a `/login` — confirmado.
- `typecheck`/`lint`/`build` verdes. Vitest 149/149. Playwright 44/46 (mismo patrón preexistente
  de siempre, OI-028, sin regresiones — incluida la navegación compartida por las 8 pantallas ya
  migradas, que usa el mismo archivo `owner-navigation.ts` que se tocó).

### Fuente de datos por pantalla (regla nueva de `AGENTS.md` §5.6, primera vez que se aplica)

| Pantalla tocada este incremento | Fuente | Nota |
| --- | --- | --- |
| `/equipo` | **Real** (Supabase, RLS) | Primera pantalla de producto (no de prueba) sobre la base real |
| `/dueno`, `/dueno/mesas`, `/caja`, `/kds`, `/garzon`, `/superadmin`, `/onboarding`, `/credito` | Simulada (`*-demo-store.ts`) | Sin cambios — comparten `owner-navigation.ts`, que sí se tocó, pero ninguna migró de fuente de datos en este incremento. Ver OI-033. |

### Límite deliberado

Sólo Equipo. Configuración, Soporte y Reportes (resto de la Tarea 4) siguen pendientes, cada uno
con su propio incremento.

## 2026-08-03 — Respuesta al fundador: estado del piloto, mapa de alcance, y OI-033

Tres preguntas del fundador tras cerrar la autenticación real. Registrado acá porque es
información de estado del proyecto, no un incremento de código.

### 1. Estado real de "Bar La Virgen"

Verificado contra la base real (no supuesto): sólo existen el tenant, el venue y la membresía
del dueño. **Cero** zonas, mesas, estaciones, productos o empleados — confirmado con conteos
directos por tabla. `DEMO_ACCESS.md` (nuevo, en la raíz del repo) documenta los accesos reales
tal como están hoy: el piloto real (login funcional, local vacío) y, por separado, el demo
simulado de siempre (todas las pantallas, sin login, con datos de ejemplo) — son dos cosas
distintas, no conectadas.

### 2. Mapa de alcance — de "una pantalla real" a "todo el producto real"

Estimación aproximada por pantalla, no un compromiso de calendario. Un incremento ≈ lo mismo que
un "Incremento" de esta sesión (una pieza verificable de punta a punta antes de seguir):

| Pantalla | Incrementos aprox. | Por qué |
| --- | ---: | --- |
| Dueño (real, no la prueba de humo) | 2-3 | La RPC (`owner_dashboard_summary`) ya está probada; falta la pantalla de producto completa |
| Mesas | 3-4 | Zonas/mesas/QR con Vault ya existen a nivel de esquema (ADR-014); falta la capa de API+UI |
| KDS | 3-4 | Necesita Realtime tenant-aware además de lectura/escritura de comandas |
| Crédito de mesa | 2-3 | La mayoría de las RPC ya existen y se inspeccionaron en este mismo incremento |
| Caja | 5-7 | 6 pestañas: turnos, excepciones, conciliación, sellos, saldo, cierre — la más grande de las 8 |
| Garzón | 5-7 | **Bloqueado primero por un diseño sin decidir**: el login por PIN asume un `auth.uid()` previo (sesión de dispositivo/venue) que nadie definió — ligado a OI-029 |
| Superadmin | 3-5 | Necesita una identidad de plataforma separada de `tenant_memberships` (rol `superadmin`, scope `platform`) — mecanismo de login propio, sin decidir |
| Onboarding | 4-6 | Tiene que escribir tenant/zonas/mesas/carta reales de verdad — es como se crearán los próximos tenants piloto, no un formulario cualquiera |
| PWA del comensal | 9-14 | La pieza más grande: ni siquiera tiene su migración visual hecha todavía, y es la ruta de pago real (CheckoutQuote, idempotencia) — el corazón del producto |
| Tarea 4 · Equipo | 2-3 | Esquema ya existe (`employees`, `roles`); falta API de gestión |
| Tarea 4 · Configuración | 2-3 | Esquema ya existe (`tenant_*_settings`); falta API de lectura/escritura |
| Tarea 4 · Soporte | 3-5 | **Dominio nuevo de cero** — no existe ni una tabla; necesita su propio mini-ADR antes de migrar nada |
| Tarea 4 · Reportes | 3-5 | Necesita vistas/RPC de desglose (por producto/hora/trabajador) que hoy no existen, más allá del resumen narrativo |

**Total aproximado: entre 45 y 70 incrementos.** El grueso está en tres lugares: la PWA (dinero
real), y las dos piezas de autenticación sin decidir (Garzón por PIN, Superadmin de plataforma).
Superadmin, al ser una herramienta interna del propio equipo de Tablio y no algo que ve un
cliente, puede razonablemente quedar para después del piloto sin bloquearlo — vale la pena
decidir explícitamente el orden real cuando se planifique esto en serio, no asumir que las 13
filas de la tabla se hacen en el orden en que están escritas.

Registrado como bloqueante explícito y aparte en `docs/OPEN_ISSUES.md` → **OI-033**.

### 3. Cómo pasó desapercibido — y qué cambiar

Catorce sprints cerraron en verde porque **la puerta de verificación de `AGENTS.md` §5.2 nunca
preguntó contra qué corría la verificación** — sólo si el código compilaba, los tests pasaban y
los advisors de Supabase estaban limpios. Eso se cumplió con honestidad cada vez: los tests
SÍ pasaban, pero contra un *store* en memoria o (para SQL) un stack local efímero, nunca contra
el proyecto real. "Terminado" y "verificado" eran ciertos dentro de un alcance que nadie declaraba
en voz alta.

El patrón tiene un origen legítimo que se generalizó en silencio: `DOMAIN_MAP.md` documenta desde
Sprint 10 que el producto usa "proveedores simulados" — pero esa frase nació para tres
integraciones externas y de verdad difíciles de probar en desarrollo (pasarela de pago, DTE,
cobro SaaS), listadas una por una en `docs/REAL_MONEY_BLOCKERS.md`. En algún punto ese mismo
patrón se extendió a los datos propios del tenant (mesas, pedidos, personal — todo lo que hoy
vive en `apps/web/lib/*-demo-store.ts`) sin que nadie tomara esa decisión explícitamente ni la
escribiera en ningún lado. Cada pantalla nueva copió el patrón de la anterior porque parecía
consistente y funcionaba — y cada demo, mirada sola, se ve completa y convincente. La brecha sólo
se hace visible si alguien pregunta específicamente "¿esto toca Supabase?", pregunta que nadie
hizo hasta que la Tarea 4 obligó a plantearla.

**Propuesta de cambio a `AGENTS.md` (pendiente de tu aprobación, no aplicada todavía):**

1. Extender la Puerta de verificación (§5.2) para exigir declarar explícitamente contra qué corrió
   cada verificación — base real, stack local, o *store* en memoria — en vez de dejarlo implícito.
2. Exigir, en cada `SPRINT-XX-SUMMARY.md`, una tabla explícita de "fuente de datos" por pantalla
   tocada ese sprint (real / simulada, y por qué si es simulada) — para que la brecha sea visible
   por construcción, no algo que hay que ir a buscar.
3. Tratar "esta pantalla va a correr sobre datos simulados" como una decisión que se registra la
   primera vez que se toma (en `OPEN_ISSUES.md` o `DECISION_RECORD.md`), igual que un cambio a una
   decisión congelada — no un default silencioso.

## 2026-08-03 — Autenticación real del dueño (Supabase Auth), antes de la Tarea 4

Plan `elegant-wobbling-phoenix`, ejecutado en 8 incrementos verificados uno a uno. Contexto y
decisiones completas en `docs/adr/ADR-015-autenticacion-real-del-dueno.md`; evidencia técnica
detallada en `docs/evidence/SPRINT-14-AUTH-VERIFICATION.md`.

### Qué cambió

- `@supabase/ssr` + `@supabase/supabase-js` instalados (Incremento 1).
- `apps/web/lib/supabase/{client,server}.ts`: clientes de Supabase para Client/Server
  Components, siempre con la clave pública, nunca `service_role` (Incremento 2).
- `apps/web/proxy.ts` (antes `middleware.ts` — renombrado por la convención nueva de Next.js
  16.2.12): refresca la sesión en cada request de página, excluido explícitamente de todo
  `/api/*` existente (Incremento 3).
- Tenant piloto real creado: **Bar La Virgen**, con su dueño (`jtmenesesg@gmail.com`) — a pedido
  del fundador, se conserva en vez de borrarse (Incremento 4).
- `apps/web/app/login/`: página de login real (email+password, único método viable sin SMTP
  configurado), selección de tenant cuando hay más de una membresía activa
  (Incremento 5).
- `apps/web/lib/supabase/route-handler-client.ts`: helper para las rutas de API que construirá la
  Tarea 4, con test unitario (Incremento 6).
- `apps/web/app/dueno-real/`: pantalla mínima de prueba (no producto final) que confirma el
  pipeline completo funcionando con datos reales (Incremento 7).
- `docs/DATA_MODEL.md`, `docs/adr/ADR-015-*.md`: documentación de cierre (Incremento 8).

### Bug real encontrado y corregido (con aprobación previa)

`private.set_active_tenant(uuid)` no tenía `EXECUTE` para `authenticated` en producción, aunque
`20260728035137_harden_auth_and_advisor_findings.sql:55` ya lo especifica — bloqueaba el 100% de
los logins reales porque nadie había ejercitado este camino desde que se borraron los fixtures de
Sprint 0. Se comparó contra los otros 5 `grant ... to authenticated` similares del esquema; sólo
éste faltaba, caso aislado. Se aplicó exactamente el `GRANT` que el archivo ya committeado
especifica, con aprobación explícita antes de tocar producción.

### Verificación

- Cada incremento: `typecheck`/`lint`/`build` verdes antes de seguir al siguiente.
- Incremento 3 (el de mayor riesgo de romper algo existente): las 8 pantallas ya migradas
  cargadas manualmente, más Vitest y Playwright completos, confirmando cero regresiones antes de
  seguir.
- Incremento 4: login real por script (Node + `@supabase/supabase-js`) contra producción —
  JWT sin `tenant_id` antes de elegir tenant, con el claim correcto después de
  `refreshSession()`, `owner_dashboard_summary` respondiendo datos reales con RLS aplicado, y un
  control negativo con un segundo usuario sin membresía (rechazado en ambos pasos, luego
  borrado).
- Incrementos 5-7: el mismo recorrido, esta vez por un navegador real (Playwright + Chrome) a
  través de la página `/login` de verdad, no por script — confirma que la UI, no sólo el
  mecanismo, funciona de punta a punta.
- Regresión final completa: `pnpm typecheck`, `pnpm lint`, `pnpm build`, Vitest 149/149 (144
  previos + 5 nuevos), Playwright 44/46 — mismo patrón preexistente de siempre (OI-028), sin
  regresiones nuevas.

### Límite deliberado

Este incremento sólo construye la autenticación. Ninguna de las 8 pantallas ya migradas se tocó.
`/dueno-real` es una prueba de humo, no reemplaza `/dueno`. Las 4 pantallas de la Tarea 4
(Equipo, Configuración, Soporte, Reportes) se construyen en incrementos siguientes, ahora que
tienen una base de autenticación real sobre la cual apoyarse.

## 2026-08-01 — OI-030 corregido y cerrado; OI-031 registrado; verificación programada agregada

### Diagnóstico primero (sin arreglar), como pidió el fundador

Investigando a fondo las 3 sospechas de OI-030 (con acceso de solo lectura a producción), 2
resultaron ser falsas alarmas por comparar contra el contenido *original* de una migración vieja
en vez del estado *actual* de producción:

- El timestamp "cuándo se recibió un pago": el parámetro que cambiaba de valor
  (`p_received_at`/`clock_timestamp()`) no se usa en ningún lugar de la función que lo recibe
  (`advance_payment_intent`) — verificado leyendo su cuerpo completo. Cero efecto.
- El backoff de reintentos del outbox: producción ya tiene, en vivo, exactamente la misma
  fórmula de "jitter completo" que describe el repositorio — una migración posterior
  (`sprint_02_retry_policy_alignment.sql`) ya la había alineado. La comparación original miraba
  una versión intermedia superada.
- `#variable_conflict use_variable`: esta sí era real, pero al revés de lo reportado — producción
  lo tiene correctamente en `create_table_credit_order` (arreglo histórico real y necesario, esa
  función usa `order_id` como variable y como columna real en varias tablas) y correctamente NO
  lo tiene en `configure_table_credit` (sin colisión de nombres ahí). El archivo local tenía el
  pragma en la función equivocada.

### Arreglo aplicado (aprobado explícitamente antes de tocar nada)

Se movió `#variable_conflict use_variable` de `configure_table_credit` a
`create_table_credit_order` en `20260729172848_sprint_09_table_credit_owner.sql`, verificado
byte a byte contra las definiciones reales en producción. Cero cambios contra producción — sólo
el archivo local. CI de reproducibilidad verde después del arreglo:
`https://github.com/jtmenesesg-arch/tablio/actions/runs/30709380710`.

### OI-031: el hueco estructural detrás de todo esto

El mismo diagnóstico confirmó algo más importante que los bugs puntuales: **ninguna suite de
pruebas del repositorio valida jamás el comportamiento real de este proyecto Supabase.** Vitest
prueba TypeScript puro sin base de datos; pgTAP corre, según el propio ADR-000, "sobre Supabase
local"; Playwright levanta un servidor que usa *stores* en memoria, no Supabase. Es exactamente
la razón por la que OI-027 y OI-030 pudieron divergir de producción durante días sin que nada lo
detectara. Registrado como **OI-031**, bloqueante antes del piloto, con dos opciones de cierre
evaluadas (proyecto de staging con pgTAP real vs. verificación periódica de esquema) — detalle
completo, pros/contras y costo en `docs/OPEN_ISSUES.md`.

### Mínimo inmediato agregado

Nuevo workflow `.github/workflows/schema-drift-check.yml`: reconstruye el esquema desde cero
(mismo patrón que `schema-reproducibility.yml`) y lo compara, objeto por objeto, contra
producción real vía conexión de sólo lectura. Corre diario (`schedule`) y bajo demanda
(`workflow_dispatch`); **falla el job si algo diverge**, en vez de esperar a que alguien lo note
por casualidad. Pendiente: agregar el secreto `SCHEMA_DRIFT_PROD_DB_URL` al repositorio — el
workflow falla explícitamente con un mensaje claro si no está configurado, no falla en silencio.
El CI de reproducibilidad de esquema (`schema-reproducibility.yml`) ya corría en cada push que
toca `supabase/migrations/**` desde que se creó; no necesitó cambios.

### Verificación

- Estilos computados en vivo (conexión de solo lectura) confirmando que `configure_table_credit`
  y `create_table_credit_order` ahora coinciden exactamente con producción.
- CI `schema-reproducibility` en verde tras el arreglo.
- Confirmado leyendo código (no asumido): `playwright.config.ts` (`webServer.command: "pnpm
  dev:e2e"`), `vitest.config.ts` (sólo incluye `*.test.ts`) y
  `packages/application/src/financial/financial-core.test.ts` (sin conexión a BD) para las
  afirmaciones de OI-031.
- Confirmado que las tablas de negocio reales (`orders`, `payment_intent_events`,
  `table_credit_accounts`, etc.) tienen cero filas — ningún dato existente pudo verse afectado
  por ninguna de las divergencias encontradas en OI-027/OI-030.

## 2026-08-01 — OI-027 cerrado: reconciliación del historial de migraciones + OI-030 nuevo

### Qué cambió

- Con acceso directo de solo lectura a la base real (pooler de Postgres, no el MCP — quedó mal
  configurado toda la sesión), se diagnosticó OI-027 comparando el SQL realmente aplicado
  (`supabase_migrations.schema_migrations.statements`) contra los archivos de
  `supabase/migrations/`. Detalle completo, con los comandos exactos usados, en
  `docs/evidence/OI-027-DIAGNOSIS-AND-FIX-2026-08-01.md`.
- Aplicado `supabase migration repair` para 13 versiones de Sprint 11-13 (solo metadatos,
  verificado que no toca tablas ni funciones) y revertido
  `supabase/migrations/20260729174339_sprint_09_credit_open_limit.sql` al contenido exacto que ya
  corría en producción (una barra invertida de más rompía el patrón de reemplazo).
- Respaldo completo de la tabla de control, tomado antes de tocar nada, en
  `docs/evidence/OI-027-SCHEMA-MIGRATIONS-BACKUP-2026-08-01.json`.
- Nueva regla en `AGENTS.md` §5.2 y entrada en `docs/DECISION_RECORD.md`: ninguna migración ya
  aplicada a un ambiente real se renombra/reordena/edita sin sincronizar
  `supabase migration repair` en el mismo momento.

### Verificación

- `supabase migration list`: local y remoto coinciden en las 58 versiones, sin excepciones.
- CI `schema-reproducibility` en verde por primera vez:
  `https://github.com/jtmenesesg-arch/tablio/actions/runs/30694845820`.
- Verificación adicional (no sólo CI verde): se corrió el mismo script de manifiesto de esquema
  del CI (`scripts/schema-manifest.sql`) contra producción y se comparó fila por fila contra el
  artefacto del CI. Encontró 3 diferencias de contenido real no relacionadas con este arreglo —
  registradas aparte como **OI-030** (núcleo financiero de Sprint 2 y dos funciones de crédito de
  mesa con lógica distinta entre repositorio y producción). No se tocaron; quedan para diagnóstico
  y decisión del fundador antes de cualquier piloto con pagos reales.

### Límite deliberado

Este incremento sólo cerró OI-027. OI-030 es nuevo, más serio (toca confirmación de pagos y
reintentos del outbox) y explícitamente no se intentó resolver en la misma sesión.

## 2026-08-01 — Sprint 14 · causa raíz: `cn()` fusiona clases + auditoría detecta texto invisible

Pedido explícito del fundador tras el incremento anterior: van tres bugs del mismo origen
(Button, Card/Crédito, KDS), los tres invisibles para los tests, los tres encontrados sólo
mirando capturas. "Esta clase de bug no puede seguir apareciendo pantalla por pantalla." Dos
cambios de fondo, no más parches puntuales.

### 1. `cn()` ahora fusiona clases en conflicto (`tailwind-merge`)

- Se reescribió `apps/web/lib/cn.ts`: `cn()` pasaba antes por `clsx` solo (concatenaba, nunca
  resolvía). Ahora hace `twMerge(clsx(inputs))`. Dato curioso al revisar: `tailwind-merge`
  (v3.6.0) ya estaba en `apps/web/package.json` desde el primer commit del sistema de diseño —
  nunca se usó, `lib/cn.ts` se escribió con `clsx` solo desde el principio. No hubo que agregar
  una dependencia nueva, sólo conectar la que ya estaba.
- Como los tokens semánticos de Tablio no son la paleta por defecto de Tailwind (viven en
  `--color-*`/`--text-*`/`--radius-*`/`--spacing-*` dentro de `@theme inline` en `globals.css`),
  `tailwind-merge` no puede inferirlos solo. `lib/cn.ts` los registra explícitamente vía
  `extendTailwindMerge({ extend: { theme: { color, text, radius, spacing } } })`, calcada de esas
  mismas variables — **si se agrega o renombra un token en `globals.css` hay que reflejarlo
  aquí**, o vuelve el comportamiento silencioso de antes para ese token.
- Verificado con casos aislados (no sólo confiando en la suite) que las tres composiciones que ya
  habían fallado ahora se resuelven solas: `border border-transparent` + `border-border` →
  `border-border` gana; `text-card-foreground` + `text-background` → `text-background` gana;
  `text-h2` + `text-background` coexisten sin falso conflicto (tamaño vs color son grupos
  distintos); `text-h1` + `lg:text-h1-lg` (patrón responsive usado en casi todos los headers) no
  se pisan entre sí porque tienen breakpoints distintos.
- Detalle completo y ejemplos en `docs/DESIGN_SYSTEM.md` → "`cn()` fusiona clases en conflicto —
  causa raíz cerrada".

### 2. La auditoría ahora rompe el build ante texto prácticamente invisible

- `tests/visual/sprint-14-owner-a11y.ts`: antes sólo existía una lista `textFailures` con el
  incumplimiento de AA (ratio bajo el mínimo 3:1/4.5:1 según tamaño). Un texto negro sobre negro
  (ratio 1) SÍ caía en esa lista, pero mezclado con cualquier incumplimiento menor de AA — nada
  lo marcaba como lo que realmente era: invisible, no "un poco bajo de contraste".
- Se agregó una categoría separada, `invisibleTextFailures`, con un umbral propio y mucho más
  estricto (ratio < 1.5, casi el mismo color) que ya no depende del tamaño de fuente ni de si el
  texto es "grande". Si aparece algo ahí, el script imprime una advertencia explícita por stderr
  además de romper `passed`/el exit code.
- De paso se separó `unparseableTextColors`: un color que el script no supo interpretar (formato
  CSS que `parseRgb` no cubre) ya no cuenta silenciosamente como 0 fallos — aparece marcado aparte
  para que alguien lo revise, en vez de esconderse como un pase falso.
- Verificado con una página mínima aislada (no la app real) que un texto negro sobre fondo negro
  cae en `invisibleTextFailures` con exit code 1 y el warning correcto, y que un texto blanco
  sobre negro en la misma página no dispara nada.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Playwright completo: 44 pasan, 1 falla en el patrón preexistente ya documentado (OI-028), 1 se
  salta en cascada — mismo patrón de siempre, sin regresiones. Este cambio toca `cn()`, que usa
  cada componente del sistema, así que era el que más riesgo de regresión tenía de todo el
  sprint.
- Auditoría de contraste/táctil/foco/gradientes/desborde + el nuevo chequeo de texto invisible,
  re-corrida en las 8 pantallas migradas (Dueño, Mesas, Caja, KDS, Garzón, Superadmin, Onboarding,
  Crédito): las 8 en cero fallos, incluidas las tres ubicaciones que ya habían fallado antes
  (verificado además visualmente con estilos computados: bordes en Mesas, texto de la tarjeta
  oscura en Crédito — sin cambios respecto a como se veían ya corregidas).

## 2026-08-01 — Sprint 14 · migración visual de Crédito + dos bugs reales encontrados al revisar

### Qué cambió

- `/credito` (`apps/web/app/credito/credit-demo.tsx`) se reescribió completo sobre el sistema de
  diseño claro estándar, con `AppShell` (`ownerNavigation("cashier")`, comparte sección con
  Caja). Estructura: insignia de riesgo, 3 `MetricCard` de exposición, tarjeta de cuenta con
  saldo, grilla de 3 columnas (Operación de caja / Pantalla del cliente / Validación del garzón)
  e historial. `.creditLiveCode`/`.creditError` pasaron a `data-testid`.
- Se corrigió un error de lint por comillas rectas sin escapar (`&ldquo;`/`&rdquo;`).

### Dos bugs reales encontrados al revisar las capturas (no cosméticos, no de esta pantalla sola)

Al mirar las capturas de "Pantalla del cliente" (la tarjeta oscura que ve el comensal) para
verificar visualmente, aparecieron dos bugs de contraste invisible — el mismo patrón de raíz que
ya afectó a KDS y Garzón esta semana (`cn()` es `clsx` puro, sin `tailwind-merge`: cuando un
componente base declara un color y el que lo usa intenta pisarlo con otra clase de color, no hay
fusión — gana el orden en que Tailwind generó el CSS, no el orden en el JSX), pero esta vez en
componentes compartidos usados por TODAS las pantallas ya migradas, no en una pantalla aislada:

1. **Botón `variant="outline"` sin borde visible en todo el sistema.** `components/ui/button.tsx`
   declaraba `border border-transparent` en la base de `cva` y el variant `outline` intentaba
   pisarlo con `border-border`; el transparente ganaba siempre. Se confirmó que esto ya estaba
   presente en Mesas ("Crear varias") desde el primer incremento del sprint — no es nuevo de
   Crédito, solo se hizo evidente ahí porque hay tres botones outline seguidos. **Corregido en la
   raíz**: se sacó `border-transparent` de la base y cada variant (`primary`, `secondary`,
   `outline`, `ghost`, `destructive`) ahora declara su propio color de borde sin conflicto.
   Verificado con estilos computados antes/después en Crédito y en Mesas; visualmente sin cambio
   para los variants sólidos (su borde ahora coincide exactamente con su propio fondo, que es como
   se veían antes) y con borde gris correcto en `outline`.
2. **Texto invisible en la tarjeta oscura de Crédito — bug real, no cosmético.** `Card` declara
   `text-card-foreground` (casi negro) en su base; `credit-demo.tsx` le pasaba `text-background`
   (casi blanco) a la `Card` para invertir el tema, pero por el mismo motivo del punto anterior no
   ganaba. Efecto medido con estilos computados: el estado "PAGADO/NO PAGADO", el monto en pesos
   y — el más serio — **los 6 dígitos del código de verificación que el cliente lee en voz alta al
   garzón** se renderizaban en `rgb(17,17,16)` sobre un fondo `rgb(17,17,16)`: negro sobre negro,
   ilegible. **Corregido** agregando `text-background` explícito en esos tres elementos
   directamente (no en el contenedor), siguiendo la misma lección ya documentada: nunca confiar en
   pisar el color de un ancestro/base, darle su propio valor explícito al elemento que lo necesita.
   Es el único lugar del código que usa este patrón de tarjeta invertida, así que el arreglo queda
   acotado a Crédito.

Ninguno de los dos bugs lo detectó la auditoría automática de contraste sin ayuda: el bug del
borde no toca contraste de texto (no lo audita); el bug de la tarjeta sí lo hizo aparecer como
falla real (`ratio: 1`) en el primer corrido del script sobre `/credito`, y esa falla fue la pista
que llevó a investigar y encontrarlo — confirma que la revisión visual manual sigue siendo
necesaria además del script.

### Tercer hallazgo: falso positivo en el propio script de auditoría

Con el bug de la tarjeta ya corregido, quedaban dos fallas de contraste (`ratio: 0`) en textos con
opacidad (`text-background/70`). Investigado con estilos computados: Chromium reporta el color de
estos textos como `oklab(...)`, no `rgb(...)`, porque el `color-mix()` detrás del modificador
`/70` de Tailwind no siempre puede volver a sRGB sin pérdida — y el regex de `parseRgb()` en
`tests/visual/sprint-14-owner-a11y.ts` sólo entendía `rgb()`/`rgba()`. Confirmado visualmente que
el texto se ve bien (gris claro legible sobre fondo oscuro); era un defecto del script, no de la
pantalla. **Corregido en el script**: `parseRgb()` ahora también convierte `oklab()` a sRGB con
las matrices estándar de Ottosson, así que futuras pantallas con modificadores de opacidad no van
a generar esta misma falsa alarma.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes (corridos otra vez después del fix de
  `button.tsx`, no solo antes).
- `pnpm test` (Vitest): 144/144.
- Playwright completo: 44 pasan, 1 falla en el patrón preexistente ya documentado (esta corrida
  tocó OI-028, la cifra de fuga mensual; en otras corridas de la sesión tocó OI-029 en su lugar —
  ambos ya registrados, ninguno nuevo), 1 se salta en cascada de `credit-owner.spec.ts` — sin
  regresiones.
- Auditoría de contraste/táctil/foco/gradientes/desborde en `/credito`, escritorio y móvil, con
  crédito abierto y con código de verificación generado: **0 fallos** después de los dos arreglos
  (`docs/evidence/SPRINT-14-CREDIT-A11Y.json`).
- Regresión dirigida del fix de `button.tsx` (afecta a todas las pantallas migradas que usan
  `variant="outline"`): auditoría re-corrida en `/dueno`, `/caja`, `/superadmin`, `/onboarding` —
  las cuatro en 0 fallos, sin cambios respecto a lo ya reportado. KDS y Garzón no usan el
  componente `Button` compartido (tienen sus propias clases oscuras), así que el fix no los toca;
  no se re-auditaron por esa razón, no por omisión.

### Límite deliberado

Con esto quedan migradas Caja, KDS, Garzón, Superadmin, Onboarding y Crédito. Sólo falta la PWA
del comensal, que se deja para el final con revisión aparte (decisión del fundador).

## 2026-08-01 — Sprint 14 · migración visual de Onboarding

### Qué cambió

- `/onboarding` (`apps/web/app/onboarding/owner-onboarding.tsx`) se reescribió completo sobre el
  sistema de diseño. A diferencia de Superadmin, sí usa `AppShell`: es la preparación de ESTE
  local y ya estaba enlazada desde la navegación compartida como "Configurar". Se agregó la
  clave `"configure"` a `OwnerNavigationKey`.
- El asistente de 9 pasos pasó de una clase CSS (`.stepNav`) a una fila de botones con scroll
  horizontal propio, `data-testid="onboarding-step-nav"` para que el test la siga encontrando.
- Todos los campos de los 9 pasos (local, tamaño, carta, tributación, pasarela, personal, QRs,
  prueba, producción) se restilaron con `Input`/`Select`/`Textarea`/`Button`/`Card`/`Alert`
  compartidos, asociando cada etiqueta a su campo con `htmlFor`/`id`. Ninguna mutación, ninguna
  validación ni el orden de los pasos cambió.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Playwright `tests/e2e/platform.spec.ts`: 5/5 — recorre el asistente completo de punta a punta
  (los 9 pasos, incluida la publicación de carta con revisión humana obligatoria) más los tests
  de Superadmin que comparten archivo.
- Auditoría de contraste/táctil/foco/gradientes/desborde: verde en el paso 1 (Local) y en el
  paso 3 con carta importada, botón "Publicar" deshabilitado incluido, escritorio y móvil — **0
  fallos** (`docs/evidence/SPRINT-14-ONBOARDING-A11Y.json`,
  `docs/evidence/SPRINT-14-ONBOARDING-menu-A11Y.json`).
- Suite completa de Playwright corrida después del incremento.

### Límite deliberado

Sólo se migraron Caja, KDS, Garzón, Superadmin y Onboarding hasta ahora. Crédito sigue en la
cola; la PWA del comensal queda para el final y con revisión aparte.

## 2026-08-01 — Sprint 14 · migración visual de Superadmin

### Qué cambió

- `/superadmin` (`apps/web/app/superadmin/superadmin-dashboard.tsx`) se reescribió completo
  sobre el sistema de diseño claro estándar (no el patrón oscuro de KDS/Garzón: es la oficina de
  soporte de Tablio, no el mostrador de un bar). Sin `AppShell`, porque su navegación no es la de
  un tenant. Patrón maestro-detalle: lista de locales a la izquierda, detalle a la derecha.
- Se agregó `subscriptionStatusDictionary` a `lib/ui-statuses.ts` con las mismas ocho etiquetas
  que ya existían, ahora con tono semántico (`Badge`) en vez de una clase CSS por estado.
- Se promovió el `ReasonDialog` que nació en Garzón a `components/ui/reason-dialog.tsx`
  (segunda pantalla que lo necesita: motivo de baja de un tenant), ahora sobre el `Button`
  compartido.
- Alta de tenant y umbral de alerta pasaron de `window.prompt()` a diálogos propios con `Input`.
  **"Entrar como soporte" se dejó intacto en `window.prompt()`** a propósito: el test de
  impersonación escucha el diálogo nativo del navegador, igual que dos flujos de Caja.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Playwright `tests/e2e/platform.spec.ts`: 5/5 (incluye onboarding y superadmin, comparten
  archivo; la parte de onboarding no se tocó en este incremento y sigue verde).
- Auditoría de contraste/táctil/foco/gradientes/desborde en escritorio y móvil: lista sin
  selección y con un tenant seleccionado (feature flags, cobranza, exposición de saldo) — **0
  fallos** en las 4 combinaciones (`docs/evidence/SPRINT-14-SUPERADMIN-A11Y.json`,
  `docs/evidence/SPRINT-14-SUPERADMIN-detail-A11Y.json`).
- Suite completa de Playwright corrida después del incremento.

### Límite deliberado

Sólo se migraron Caja, KDS, Garzón y Superadmin hasta ahora. Onboarding y Crédito siguen en la
cola; la PWA del comensal queda para el final y con revisión aparte.

## 2026-08-01 — Sprint 14 · migración visual de Garzón

### Qué cambió

- `/garzon` (`apps/web/app/garzon/waiter-panel.tsx`) se reescribió completo sobre el sistema de
  diseño, siguiendo el mismo patrón acotado que KDS (sin `AppShell`, fondo sólido oscuro, tokens
  de acento compartidos — ver `DESIGN_SYSTEM.md` y OI-026): es una PWA de un solo propósito para
  el teléfono del garzón en un bar oscuro y ruidoso, no un panel de escritorio.
- Prioridad visual explícita a las entregas listas: borde izquierdo de color por urgencia real
  (crítica/atrasada siguen ganando) y una insignia verde "✓ ENTREGA LISTA" para una entrega sin
  atraso, además de las banderas ya existentes (crítica, atrasada, sin asignar, pagado).
- Indicador de conexión permanente igual que KDS: insignia + "Actualizado hace…" en la barra
  superior, más una franja roja de ancho completo si la última sincronización se atrasa.
- Los cinco flujos que pedían motivo por `window.prompt()` (descartar solicitud, traspasar zona,
  incidencia, separar mesas, transferir mesa) pasaron a un diálogo propio con `Textarea`. Ninguno
  estaba enganchado a una prueba que escuchara el diálogo nativo del navegador (a diferencia de
  Caja, donde sí y por eso ahí se dejaron intactos).
- Se centralizó `formatRelativeTime`/`formatClp` de `lib/format.ts` en vez de los helpers locales
  duplicados.

### Dos bugs reales encontrados y corregidos antes de reportar

1. **Tarjeta de mesa ilegible (texto blanco sobre fondo blanco).** Un `<button>` interno no tenía
   `bg-*` explícito. Este proyecto no carga el preflight de Tailwind
   (`globals.css` sólo importa `tailwindcss/utilities.css`), así que un botón nativo sin fondo
   declarado muestra el gris por defecto del navegador en vez de heredar transparencia — nunca
   antes había pasado porque todos los botones anteriores (Caja, KDS, el propio `Button`
   compartido) siempre declaran su fondo. Regla nueva documentada: todo `<button>` de este
   código necesita `bg-*` explícito, aunque sea `bg-transparent`.
2. **Casillas "agrupar" de 13×13 px.** Usaban `size-5`; `spacing-5` no existe en la escala
   aprobada (`4, 8, 12, 16, 24, 32, 48, 64`), así que la clase no generaba nada y el navegador
   conservaba el tamaño nativo del checkbox. Se cambió a `size-touch` (56 px) — además de
   corregir la auditoría, es lo correcto para "una mano, en movimiento".

Ambos se encontraron en captura de pantalla antes de reportar, no en producción ni por un
usuario.

### El script de auditoría necesitó dos mejoras propias

- Ganó `TABLIO_A11Y_STORAGE_STATE` para auditar pantallas con sesión iniciada (Garzón requiere
  login por PIN; el script no tenía forma de reutilizar una sesión).
- Ganó una espera de 250 ms tras el clic de cambio de pestaña: sin ella, el chequeo de contraste
  a veces medía el color de un botón a mitad de su transición CSS de 120 ms
  (`duration-[var(--motion-feedback)]`) y reportaba un fallo de contraste falso e intermitente en
  el tab recién activado o en "Tareas". Se confirmó reproduciendo 3 veces sin la espera (siempre
  fallaba igual) y 3 veces con la espera (siempre pasaba) antes de aceptar la causa.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Playwright `tests/e2e/waiter.spec.ts`: 4/4.
- Auditoría de contraste/táctil/foco/gradientes/desborde en escritorio y móvil: login, selección
  de zona, tareas (vacío y con una entrega lista + un llamado), mesas (con crédito) y turno — **0
  fallos** en las 10 combinaciones (`docs/evidence/SPRINT-14-WAITER-*-A11Y.json`).
- Suite completa de Playwright (todas las pantallas) corrida después del incremento.
- `tests/e2e/credit-owner.spec.ts › caja y garzón separan...` volvió a fallar de forma
  intermitente al correr junto a otras suites (mismo patrón que OI-029) y pasó limpio en
  aislamiento repetido; no es una regresión de este incremento.

### Límite deliberado

Sólo se migraron Caja, KDS y Garzón hasta ahora. Superadmin, Onboarding y Crédito siguen en la
cola; la PWA del comensal queda para el final y con revisión aparte.

## 2026-08-01 — Sprint 14 · migración visual de KDS

### Qué cambió

- `/kds` (`apps/web/app/kds/kds-screen.tsx`) se reescribió sobre tokens del sistema de diseño,
  pero **no** usa `AppShell`: es la excepción documentada en `DESIGN_SYSTEM.md` — pantalla
  completa sin sidebar, fondo sólido oscuro, cero superficies traslúcidas, tipografía grande y
  botones de 64–72 px para manos ocupadas o mojadas.
- Los colores de acento (naranja, verde, ámbar, rojo) pasaron a los tokens de marca compartidos
  (`bg-brand`, `bg-success`, `bg-warning`, `bg-destructive`); las superficies oscuras
  estructurales quedan con valores Tailwind arbitrarios porque OI-026 todavía no aprueba una
  matriz semántica oscura completa.
- La comanda (`TicketCard`) reusa `bg-background`/`text-foreground`/`Badge`, igual que el resto
  del producto: es un "papel" claro sobre el mostrador oscuro.
- El indicador de conexión y "Actualizado hace…" quedan siempre visibles en la barra superior; la
  alerta de pantalla desactualizada y la de Realtime desconectado (con recuperación por consulta)
  se mantuvieron con su lógica original, sólo restilizadas.
- Se centralizó `Actualizado {…}` con `formatRelativeTime` de `lib/format.ts` en vez del helper
  `agoLabel` duplicado.

### Bug encontrado durante la migración (no en producción, en el propio incremento)

Al restilizar el tab de estación activa, el texto quedó invisible: la clase base `kdsButton`
fijaba `text-[#fefefe]` y la variante activa agregaba `text-[#111110]` **sin reemplazarla**. Como
`cn()` en este proyecto es sólo `clsx` (sin `tailwind-merge`), ambas clases de texto coexistieron
y el orden de generación de Tailwind — no el orden del JSX — decidió cuál ganaba, dejando texto
blanco sobre fondo blanco. Se corrigió separando el color de texto de la base y usando un
ternario que reemplaza la cadena completa, como ya hacen los componentes compartidos con `cva`.
Encontrado en captura de pantalla antes de reportar, no por un usuario. Se documentó como
lección en `DESIGN_SYSTEM.md` para no repetirlo en Garzón/Superadmin/Onboarding/Crédito/PWA.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- Playwright `tests/e2e/kds.spec.ts`: 5/5, incluida la medición de latencia
  (`KDS_LATENCY {"connectedSampleCount":12,"noKdsConnectedCount":1,"p50Ms":80,"p95Ms":133,"p99Ms":151}`,
  dentro del objetivo p95 ≤ 2 s). Se actualizó el selector `.kdsTicket` → `getByTestId("kds-ticket")`
  en el test, porque apuntaba a una clase CSS que dejó de existir.
- Auditoría de contraste/táctil/foco/gradientes/desborde en escritorio y móvil, vacío y con
  comandas activas de ambas estaciones: **0 fallos** en las 4 combinaciones
  (`docs/evidence/SPRINT-14-KDS-A11Y.json`, `docs/evidence/SPRINT-14-KDS-tickets-A11Y.json`). El
  cálculo de contraste funciona igual sobre fondo oscuro.
- Suite completa de Playwright (todas las pantallas) corrida después del incremento para
  descartar regresiones cruzadas.

### Límite deliberado

Sólo se migraron Caja y KDS hasta ahora. Garzón, Superadmin, Onboarding, Crédito y la PWA del
comensal siguen con sus estilos anteriores; continúan en ese orden.

## 2026-08-01 — Sprint 14 · migración visual de Caja

### Qué cambió

- `/caja` (`apps/web/app/caja/cashier-dashboard.tsx`) se reescribió completo sobre el sistema de
  diseño: `AppShell` compartido con Dueño/Mesas, tokens semánticos, componentes `Card`/`Badge`/
  `Alert`/`Button`/`Dialog` en vez del CSS manual anterior (`cashierShell`, `cashierTableCard`,
  etc., que quedan sin uso en `globals.css` hasta la limpieza final del sprint).
- Se agregaron los diccionarios de estado que faltaban en `lib/ui-statuses.ts` (mesa en vivo de
  caja, prioridad/estado de excepción, conciliación, documento tributario, salud del proveedor
  DTE, cuenta de crédito, cuenta de saldo prepagado) para que ningún estado crudo tipo
  `frozen_for_recovery` llegue a pantalla.
- `lib/format.ts` ganó `formatTime`. Los montos, duraciones y horas de Caja usan las utilidades
  centralizadas en vez de `Intl.NumberFormat`/`toLocaleString` repetidos en el componente.
- La navegación compartida (`components/operational/owner-navigation.ts`) ahora acepta `"cashier"`
  como sección activa.
- Se corrigió un error de ortografía heredado: el plural de "excepción" se armaba como
  "excepciónes" (mantenía la tilde). Ahora dice "excepciones".
- Se preservaron **sin cambios** todas las interacciones que ya usaban `window.prompt()`
  (reembolso, escalar excepción, reintentar boleta, cerrar turno, ajustar saldo, restituir
  sello): las pruebas E2E de Caja escuchan el diálogo nativo del navegador, así que cambiarlas a
  un `Dialog` propio habría sido un cambio de interacción disfrazado de reestilo.

### Auditoría de accesibilidad ampliada

`/dueno` y `/dueno/mesas` no tienen pestañas, así que la auditoría existente
(`tests/visual/sprint-14-owner-a11y.ts`) sólo auditaba la carga inicial. Caja sí tiene seis vistas
por pestaña, así que el script ganó `TABLIO_A11Y_CLICK_ROLE_NAME` para hacer clic antes de auditar.
Un primer intento reportó ~15-23 fallos de foco por pestaña que resultaron ser un falso positivo
del propio script: el clic previo cambia la modalidad de foco del navegador a "mouse" y
`element.focus()` programático deja de calzar con `:focus-visible`. Se corrigió agregando
`Tab`/`Shift+Tab` después del clic, antes de auditar. Con esa corrección, el único hallazgo real
fue un enlace "Ver documento" suelto (`<a>` con solo `underline`) que no llegaba a 56 px de alto
ni al contraste AA; se resolvió envolviéndolo en `Button asChild size="small" variant="ghost"`.

### Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: verdes.
- `pnpm test` (Vitest): 144/144.
- Auditoría de contraste/táctil/foco/gradientes/desborde en las 6 pestañas × 2 viewports
  (escritorio 1440×900, móvil 390×844): **0 fallos** en las 12 combinaciones.
  `docs/evidence/SPRINT-14-CASHIER-A11Y.json` (vista Mesas) y
  `docs/evidence/SPRINT-14-CASHIER-{exceptions,reconciliation,loyalty,stored_value,close}-A11Y.json`.
- Capturas de pantalla en `docs/evidence/sprint-14/after-cashier-{desktop,mobile}[-viewport].png`.
- Playwright: `tests/e2e/cashier.spec.ts` (6/6), `tests/e2e/checkout-engagement.spec.ts` (5/5),
  y `tests/e2e/table-management.spec.ts`/`owner-dashboard.spec.ts` (sin regresión, confirman que
  extender `owner-navigation.ts` no rompió las pantallas ya migradas). De
  `tests/e2e/credit-owner.spec.ts` se actualizó un selector (`.cashierCloseWarning` →
  `getByTestId("cashier-shift-credit-loss")`) porque apuntaba a una clase CSS que dejó de existir.
- **Dos fallos preexistentes encontrados en `tests/e2e/credit-owner.spec.ts`, no causados por este
  incremento** — se reprodujeron de forma idéntica contra el código sin tocar (`git stash`) antes
  de tocar nada:
  1. `caja y garzón separan prepago y crédito en la misma mesa`: el login del garzón
     (`/garzon`, botón "Empezar turno") queda deshabilitado y el test expira. Es intermitente:
     falló al correr junto a otras suites y pasó al correrlo solo, en ambas versiones del código.
     Registrado como OI-029.
  2. `una fuga alimenta el costo mensual y su tendencia para el dueño`: espera `$54.500` en
     `owner-leakage` y encuentra `$18.500`. Falla de forma determinística y aislada, también en
     ambas versiones del código. No es cosmético: es un cálculo de plata mal hecho en el panel
     del dueño. Registrado como OI-028, bloqueante antes del piloto.
  Ninguno de los dos toca código de Caja; ambos quedan fuera del alcance de este incremento por
  la regla de las dos vueltas de `AGENTS.md` §5.3. No se investigaron más a fondo porque no son
  parte de la migración visual encargada; quedan para revisión aparte.

### Límite deliberado

Sólo se migró Caja. KDS, Garzón, Superadmin, Onboarding, Crédito y la PWA del comensal siguen con
sus estilos anteriores; continúan en ese orden en los siguientes incrementos del sprint.

## 2026-07-31 — Reproducibilidad de esquema y saneo previo a OI-027

### Qué cambió

Se encontraron cuatro commits ya escritos en el repositorio local (2026-07-31, 23:08–23:23) que
nunca se documentaron en esta bitácora ni se subieron a `origin/main`. Corresponden a trabajo
preparatorio para cerrar OI-027 (el historial de migraciones remoto no coincide exactamente con
los archivos locales de Sprints 11–13):

- `ci(database): verify schema rebuilds from zero` agrega
  `.github/workflows/schema-reproducibility.yml` y `scripts/schema-manifest.sql`. La acción de
  CI levanta un stack Supabase aislado en el runner, aplica exclusivamente las migraciones del
  repositorio con `supabase db reset`, y exporta un manifiesto determinista (tablas, columnas,
  constraints, índices, vistas y funciones de los esquemas `public`/`private`) con su hash
  SHA-256 como evidencia descargable. Se dispara ante cualquier cambio a migraciones o al propio
  workflow.
- `fix(database): make clean rebuild tolerate platform helper` corrige
  `20260728035137_harden_auth_and_advisor_findings.sql`: revocar permisos de
  `public.rls_auto_enable()` fallaba en un stack limpio porque esa función sólo existe en
  proyectos ya hospedados por Supabase, no en una base nueva. Ahora la revocación se ejecuta
  sólo si la función existe.
- `fix(database): make credit migration rebuildable` mueve la corrección de ambigüedad de
  variable de `create_table_credit_order` (`#variable_conflict use_variable`) directamente a la
  migración canónica de Sprint 9
  (`20260729172848_sprint_09_table_credit_owner.sql`), en vez de dejar que dependiera de un
  parche posterior. También endureció ese parche histórico
  (`20260729173752_sprint_09_credit_order_variable_fix.sql`) para que detecte si el arreglo ya
  está presente antes de reintentarlo.
- `fix(database): make historical credit repair idempotent` convierte ese mismo parche histórico
  en un no-op explícito: como la corrección ya vive en la migración canónica, el parche ya no
  necesita tocar la función en tiempo de despliegue. El comentario deja constancia de que
  producción ya recibió el arreglo equivalente por otra vía y que ese archivo no debe reescribir
  producción de nuevo.

### Por qué

Estos cuatro cambios sólo tocan **archivos de migración en el repositorio**, nunca la base de
datos remota. El objetivo es que si alguien aplica las migraciones del repositorio desde cero
(un ambiente nuevo, un runner de CI, un fork), el resultado compile sin error y termine en el
mismo esquema que ya existe en producción — sin necesidad de tocar el proyecto Supabase actual.

### Verificación

- Revisión manual de las cuatro diffs, confirmando que ninguna ejecuta una migración nueva
  contra el proyecto remoto; sólo reescriben el contenido de migraciones que, o bien no se han
  aplicado nunca fuera de este repositorio (el workflow de CI), o cuyo efecto equivalente ya
  está presente en producción por la vía histórica descrita en el propio commit.
- `supabase migration list --linked` contra el proyecto `tablio` (`xmwewmukoxdeuilmkahr`)
  muestra el historial local y remoto sincronizado para las migraciones existentes hasta este
  punto.
- **No se pudo ejecutar `supabase db reset` en este equipo** porque no hay Docker instalado ni
  corriendo; por lo tanto, la promesa central de estos commits (que el esquema se reconstruye
  desde cero sin errores) no se verificó localmente antes de este incremento.
- No se ha cerrado OI-027 con este trabajo: sólo cubre que los archivos locales reconstruyen un
  esquema equivalente desde cero. La reconciliación del historial de migraciones ya aplicado en
  el proyecto remoto (`supabase_migrations.schema_migrations`) sigue pendiente y se aborda por
  separado.

### Corrección — el workflow de CI ya se había ejecutado y falló 4/4 veces

Al revisar el historial de Actions con `gh run list` se descubrió que estos cuatro commits **ya
habían sido subidos y probados individualmente antes de esta sesión** (`gh api
repos/.../events` muestra los cuatro `PushEvent` a `refs/heads/main` entre 2026-07-31 23:11 y
23:23, cada uno seguido de una corrida del workflow "Schema reproducibility"). Las cuatro
corridas terminaron en `failure`, incluida la del último commit
(`fix(database): make historical credit repair idempotent`). En algún momento posterior
`origin/main` fue retrocedido para quitar esos commits, sin dejar registro — así fue como esta
sesión los encontró de nuevo como "4 commits locales sin subir".

Esto corrige la afirmación anterior: **la reconstrucción desde cero seguía fallando** cuando se
escribió este párrafo por primera vez; no estaba pendiente de una primera verificación, sino que
ya tenía evidencia roja no leída. El log de la corrida más reciente
(`https://github.com/jtmenesesg-arch/tablio/actions/runs/30681883530`) muestra el error real:

```
ERROR: open_table_credit definition was not recognized (SQLSTATE P0001)
```

en la migración `20260729174339_sprint_09_credit_open_limit.sql`, que parchea el cuerpo de
`open_table_credit` buscando un fragmento de texto literal dentro de la salida de
`pg_get_functiondef()`. **Hipótesis de causa, sin verificar todavía contra producción:** el texto
buscado usa `E'...\\n'` (barra invertida escapada seguida de "n"), que en sintaxis de cadena de
escape de PostgreSQL representa los dos caracteres literales `\` y `n` — **no** un salto de
línea real. `pg_get_functiondef()` devuelve saltos de línea reales, así que ese patrón no
debería poder calzar nunca, en ningún entorno. Si esa lectura es correcta, esta migración nunca
ejecutó su reemplazo tal como está escrita hoy en el repositorio, y lo que corre en producción
llegó a su forma actual por otra vía (coherente con el diagnóstico general de OI-027: hotfixes
aplicados directo contra el proyecto remoto que no quedaron reflejados fielmente en los archivos
locales). Se encontraron sólo otros dos usos de `pg_get_functiondef` en el repositorio
(`20260729024401_sprint_05_runtime_fixes.sql`, que sí pasa la reconstrucción desde cero, y
`20260729230000_sprint_13_stored_value.sql`, todavía no alcanzada por el rebuild porque éste se
detiene en el primer error). No se tocó ninguna de las tres porque diagnosticar y corregir el
historial de migraciones es exactamente el alcance de OI-027, que se aborda por separado con
acceso de solo lectura al proyecto remoto para no reconciliar a ciegas.

## 2026-07-30 — Sprint 14 · sistema visual y panel Dueño piloto

### Qué cambió

- Se detectó y registró la desviación de ADR-000: Tailwind, Radix y componentes propios
  basados en shadcn/ui estaban aprobados, pero nunca se instalaron.
- Se agregó al cierre de sprint la verificación obligatoria de cada ADR usado contra la
  implementación real.
- Se incorporaron Tailwind 4, Radix Slot y la base mínima de componentes internos.
- El brand book oficial quedó versionado en `/brand`; la aplicación de referencia quedó en
  `/reference` y su `.env` está excluido.
- Se creó el sistema HSL semántico, escala de tipografía/espaciado, objetivos táctiles de
  56 px y Plus Jakarta Sans variable autohospedada.
- Se construyó el shell reutilizable de 224 px con navegación móvil y se migró únicamente
  `/dueno`, como pantalla de validación.
- Se documentó la matriz oscura como decisión pendiente; no se inventaron tokens.

### Verificación

- Panel Dueño: 9/9 E2E relevantes verdes, incluyendo tenant nuevo, fuga mensual y métricas del
  checkout.
- Accesibilidad calculada en escritorio y móvil: cero fallos de contraste WCAG AA, tacto,
  foco, gradientes o desborde horizontal.
- Rendimiento CPU 4× + 4G lenta: utilizable p95 2.162 s frente a 2.106 s (+2,7%);
  transferencia p50 207 KB frente a 201 KB (+3,1%). La puerta del 5% se cumple.
- TypeScript, ESLint y build Next.js verdes.

### Límite deliberado

No se migró ninguna otra pantalla. Caja, garzón, onboarding, superadmin, crédito, PWA y KDS
esperan validación del fundador sobre este piloto antes de cambiar.

## 2026-07-30 — Demo pública en Vercel

### Qué cambió

- Se corrigió el proyecto Vercel `tablio`: framework Next.js, Root Directory `apps/web`,
  paquetes compartidos incluidos y Node.js 24.
- Se publicó la demo en `https://tabliocl.vercel.app` sin protección SSO para que abra desde
  cualquier celular.
- Se configuró `TABLIO_PAYMENT_GATEWAY=simulated` y rutas temporales escribibles para los
  snapshots demo de KDS, garzón y caja. No se subieron llaves de Supabase ni credenciales
  financieras.
- La PWA, KDS, garzón, caja y dueño muestran modo demo. Una guarda server-side impide iniciar
  esta aplicación con una pasarela distinta del adaptador simulado.
- Se retiró la integración Git antigua de otro repositorio `tablio`. Vercel no autorizó
  conectar `jtmenesesg-arch/tablio`; por ahora la publicación se hace explícitamente por CLI.

### Verificación

- Build local y build remoto Vercel verdes con Next.js 16.2.12.
- TypeScript, ESLint, Prettier y 141/141 tests Vitest verdes.
- Las cinco rutas públicas respondieron HTTP 200 sin login Vercel.
- Se recorrió por Internet código de mesa `4826` → carrito → quote `$4.500` → pago simulado
  → confirmación server-side → un pedido → una comanda recuperada por KDS.
- El laboratorio remoto devolvió `x-tablio-demo-mode: true`,
  `MODO DEMO — NO MUEVE DINERO REAL`, un evento de proveedor simulado y un outbox.

### Límite conocido

Los snapshots de interfaz usan `/tmp` y pueden reiniciarse cuando Vercel recicla una instancia
o al desplegar. Es aceptable para esta demostración sin dinero; no reemplaza PostgreSQL ni la
durabilidad exigida para un piloto.

## 2026-07-27 — Conexiones de infraestructura

### Qué cambió

- Se clonó el repositorio `jtmenesesg-arch/tablio` y se verificó `main`.
- Se configuró el MCP de Supabase para el proyecto `xmwewmukoxdeuilmkahr`.
- Vercel CLI quedó autenticado y el repositorio local se vinculó con
  `felipe's projects/tablio`.
- Vercel creó credenciales locales OIDC en `.env.local`.

### Por qué

Supabase y Vercel son decisiones congeladas del stack. Era necesario comprobar acceso antes de
iniciar Sprint 0.

### Verificación

- Git quedó sincronizado con `origin/main`.
- El MCP de Supabase quedó habilitado.
- Vercel reconoció el proyecto `prj_dwxiSJ1moNfAhEP7d2hbqJLHash0`.
- `.env.local` y `.vercel/` están ignorados por Git; no se guardaron secretos.

## 2026-07-27 — ADR-000 aprobado

### Qué cambió

Se escribió y aprobó `docs/adr/ADR-000-stack.md`. La decisión define:

- Next.js + TypeScript estricto;
- monorepo modular con una aplicación Vercel;
- Supabase/PostgreSQL como fuente de verdad;
- RLS por tenant;
- pruebas con Vitest, pgTAP y Playwright;
- tres caminos para KDS: Realtime rápido, procesamiento durable y recuperación por consulta;
- pedido y comandas creados atómicamente antes del aviso al KDS;
- outbox, Supabase Queues, reintentos, DLQ y consumidores idempotentes;
- un adaptador abstracto de pasarela antes de elegir proveedor.

### Por qué

Los siguientes sprints necesitan una base verificable que no pierda pedidos ni mezcle datos de
locales distintos.

### Verificación

Se comprobó que el ADR contiene framework, estructura, UI, testing, tenant, PWA, Realtime,
durabilidad, SLO p95, reintentos, DLQ, idempotencia y alternativas consideradas.

## 2026-07-27 — Estructura documental

### Qué cambió

- Los briefs se ubicaron en `/brief/`.
- Se crearon README, mapa de dominios, modelo de datos, glosario, backlog, asuntos abiertos,
  Decision Record y carpetas de revisión/sprints.
- Se registró la conectividad de impresora térmica como decisión pendiente de Sprint 4.

### Por qué

La documentación viva es parte de la definición de terminado y evita que decisiones críticas
aparezcan tarde o se cambien en silencio.

### Verificación

Se revisaron enlaces internos, archivos obligatorios y correspondencia con los documentos
congelados. No se creó aplicación, migración ni pantalla en este incremento.

## 2026-07-27 — Fundación multi-tenant aplicada

### Qué cambió

- Se agregó a `AGENTS.md` la regla aprobada: Realtime avisa, PostgreSQL manda y la cola
  garantiza efectos; el KDS no espera el polling de la cola.
- El SLO KDS p95 ≤ 2 s quedó declarado como objetivo no verificado hasta tener instrumentación
  end-to-end.
- Se documentaron el uso restringido de `service_role`, la propagación del tenant por JWT,
  el comportamiento fail-closed y el protocolo rojo/restauración/verde.
- Se inicializó Supabase CLI y se vinculó el proyecto `xmwewmukoxdeuilmkahr`.
- Se aplicó `20260727223243_foundation_multi_tenant.sql` con tenants, venues, zonas, puntos de
  servicio, estaciones, personal, membresías, RBAC, auditoría, contexto privado, funciones,
  RLS forzado, Storage privado y métricas de tamaño.
- Se aplicó `20260727224600_verify_tenant_isolation.sql`, una verificación remota que crea dos
  tenants temporales, comprueba aislamiento y elimina los datos de prueba.
- Se versionaron la suite pgTAP normal y el control negativo transaccional.

### Por qué

La aplicación no puede avanzar sobre un aislamiento decorativo. La base debe hacer cumplir
tenant, permisos y referencias cruzadas incluso si una ruta de aplicación contiene un error.
Zonas, mesas/puntos y estaciones son datos configurables porque alimentarán onboarding y
pricing por tamaño.

### Verificación

- Las migraciones aparecen en el historial remoto.
- El control verde remoto comprobó lectura aislada, bloqueo de update/insert cruzado,
  fail-closed sin claim y foreign key compuesta.
- El lint remoto de `public` y `private` terminó sin errores.
- El control rojo no se ejecutó en el proyecto actual: queda programado para staging aislado a
  más tardar antes del piloto.

## 2026-07-28 — Auth real, hardening y cierre de Sprint 0

### Qué cambió

- Se activó exclusivamente el Custom Access Token Hook remoto
  `public.custom_access_token_hook`.
- Se aplicó `20260728035137_harden_auth_and_advisor_findings.sql`: se cerraron grants amplios
  sobre funciones privilegiadas, se movió la operación interna de selección de tenant a
  `private`, se dejó una RPC pública `SECURITY INVOKER` y se agregaron índices de claves
  foráneas.
- Se aplicó `20260728035253_explicit_private_context_deny_policy.sql`: el contexto privado
  quedó con RLS forzado y denegación explícita para `anon` y `authenticated`.
- Se corrigieron dos defectos del test pgTAP: el fixture de mesa de tenant B ahora incluye
  `zone_id`, y las aserciones DML usan CTEs válidos con `results_eq`.
- Se canceló el ambiente Docker/local. No se creó un segundo proyecto Supabase remoto.

### Por qué

El aislamiento no estaba verificado punta a punta mientras el claim solo se simulaba en SQL.
La emisión real de Auth debía demostrar que el hook añade el tenant correcto y que su ausencia
falla cerrada. Los Advisors también revelaron funciones privilegiadas con permisos demasiado
amplios y claves foráneas sin índices de soporte.

### Verificación ejecutada

- Login real sin contexto: JWT sin `tenant_id`, lectura `200` con 0 filas.
- RPC `set_active_tenant`: `204` después de validar membresía.
- Nuevo login: JWT con el tenant esperado; lectura `200` y una sola zona propia.
- Usuario real sin tenant: JWT sin claim, lectura `200` con 0 filas e insert rechazado `403`.
- Logs Auth: `Hook ran successfully` y token `200` en las tres emisiones.
- Cleanup: 0 usuarios, 0 tenants y 0 zonas temporales restantes.
- Security Advisors finales: 0 hallazgos.
- Performance Advisors: cinco avisos informativos `unused_index`, registrados como OI-008.
- El objetivo KDS p95 ≤ 2 s sigue declarado como no verificado hasta instrumentarlo.

## 2026-07-28 — Sprint 1, spike documental y pasarela simulada

### Qué cambió

- Se documentaron Mercado Pago y Transbank sólo desde fuentes oficiales en
  `ADR-001-payment-gateway-spike.md`; todas las capacidades quedaron rotuladas como hipótesis
  no verificadas y el ADR quedó PROPUESTO, NO DECIDIDO.
- Se separaron explícitamente venta del bar y suscripción SaaS de Tablio.
- Se creó el puerto neutral `PaymentGateway` con conexión por comercio, intento, firma,
  confirmación/consulta server-side, reembolso, medio guardado y liquidación.
- Se implementó un adaptador simulado con HMAC, aislamiento por comercio, idempotencia,
  duplicados, rechazos, eventos tardíos/fuera de orden, reembolsos y datos de conciliación.
- Se creó `/demo/payments`, una pantalla visible como modo demo que no recibe ni mueve plata.
- Se inicializó el workspace pnpm y la aplicación Next.js sin implementar checkout real.

### Por qué

No existen cuentas ni credenciales y el proveedor real se integrará al final. El núcleo debe
poder avanzar y demostrarse sin convertir hipótesis documentales en decisiones ni acoplar la
lógica de negocio a una pasarela.

### Verificación

- Suite Vitest: ocho entregas idénticas producen un evento y un outbox; firma alterada o
  expirada falla; evento antiguo no degrada estado; se prueban rechazo, tardanza, refunds
  múltiples, comercio de medios guardados y campos de conciliación.
- TypeScript estricto, lint, formato y build de producción se ejecutan como puerta del
  incremento.
- `pnpm audit --prod` detectó versiones transitivas vulnerables de `sharp` y `postcss`; se
  fijaron `sharp@0.35.3` y `postcss@8.5.23`, se repitió el build y el audit terminó con cero
  vulnerabilidades conocidas.
- No se crearon cuentas, credenciales, cobros, clientes ni cambios remotos en Supabase.

## 2026-07-28 — Sprint 2, núcleo financiero

### Qué cambió

- Se aplicó el esquema financiero con quotes inmutables, evidencia append-only, estados
  separados, pedidos, comandas, stock selectivo, reembolsos, conciliación y auditoría.
- ADR-002 aprobó reserva al crear quote sólo para productos con `track_stock`, un único reloj
  de 10 minutos y liberación inmediata en rechazo/cancelación/abandono.
- La confirmación server-side crea pedido, ítems, una comanda por estación, consumo de reserva
  y cuatro mensajes de outbox en una sola transacción.
- Una aprobación posterior al vencimiento no produce y crea una excepción crítica inmediata
  para el cajero: “requiere decisión: reembolsar o producir manualmente”.
- Se instalaron colas PGMQ `financial_effects` y `financial_effects_dlq`; los reintentos usan
  backoff exponencial con jitter, máximo configurable, DLQ y replay auditado.
- `ProcessedEvent` y el consumidor TypeScript entregan idempotencia; cada adaptador externo
  recibe además la clave durable para cubrir un crash entre efecto y ACK.
- Se agregaron RPCs de worker ejecutables sólo por `service_role`. No existe acceso desde
  `anon` o `authenticated`.

### Por qué

Ésta es la cadena que impide cobrar sin producir, producir sin cobrar o duplicar un efecto:
persona → carrito → quote inmutable → aprobación verificable → pedido → comandas.

### Verificación

- pgTAP remoto: `1..33`, 33 controles en verde con comentario de riesgo en español.
- Duplicado entregado diez veces: un evento, un pedido, dos comandas y cuatro outbox.
- Prueba de persistencia en transacciones independientes: después de cerrar la conexión de
  confirmación seguían presentes 1 pedido, 2 comandas, 4 outbox y 1 evidencia del proveedor.
- Los datos sintéticos se eliminaron al terminar (`synthetic_tenants_remaining = 0`).
- Security Advisors finales: cero hallazgos.
- Performance Advisors: cero claves foráneas sin índice; sólo `unused_index` informativos
  esperables antes de tener tráfico, registrados en OI-008.
- Quality gate: 18 Vitest verdes, TypeScript estricto, ESLint, Prettier y build Next.js
  exitosos; `pnpm audit --prod` terminó sin vulnerabilidades conocidas.
- Las migraciones remotas son `sprint_02_financial_core`, `sprint_02_worker_rpcs`,
  `sprint_02_database_recorded_clock`, `sprint_02_advisor_fixes` y
  `sprint_02_retry_policy_alignment`.

## 2026-07-28 — Sprint 3, PWA del comensal

### Qué cambió

- Se construyó `/mesa/demo-mesa-8`: código de presencia, carta, detalle, variantes, notas,
  alérgenos, carrito por dispositivo, nombre opcional, propina, quote, pago simulado,
  confirmación, comandas independientes, otra ronda y acciones de mesa.
- La interfaz usa la marca aprobada, Plus Jakarta Sans local, fondos sólidos sin gradientes y
  limita glass a navegación/modal. Totales, botón de pago y resultados financieros siempre
  son opacos.
- El diccionario de alias usa animales u objetos no bebibles más colores. Una prueba compara
  todas sus palabras contra vocabulario típico de productos/categorías de bar.
- La sesión demo usa cookie `HttpOnly`, 4 horas de inactividad y 12 horas absolutas.
- `payment.start` llama el adaptador simulado en servidor. El webhook HMAC se verifica y la
  consulta server-side termina el pago; una acción inventada `payment.confirm` devuelve 400.
- “Pagar con el garzón” muestra que sigue impago y no crea pedido ni comandas.
- Se aplicaron las migraciones remotas `sprint_03_diner_pwa` y
  `sprint_03_advisor_fixes`: catálogo, sesiones, identidad congelada, acciones, solicitudes,
  RLS, índices y publicaciones Realtime.
- ADR-003 fijó recuperación desde servidor y Broadcast privado para producción.
- Las cuatro fotos demo de Unsplash y Plus Jakarta Sans se sirven localmente; sus créditos
  están en `docs/ASSET_SOURCES.md`.

### Por qué

La experiencia debe sobrevivir una noche de bar real sin confiar en el navegador para precios,
pagos o identidad de entrega. El alias por sí solo no basta en una mesa grande, pero pedir una
cuenta sería fricción innecesaria. Realtime acelera; la consulta recupera.

### Verificación

- Playwright en Pixel 5: 6 de 6 recorridos verdes, incluyendo dos contextos de navegador
  independientes, recarga, agotado, falsificación financiera y pago con garzón.
- Vitest: 27 controles verdes, incluidos diccionario de alias y ratios de contraste.
- pgTAP Sprint 3: 17 controles versionados; la ejecución remota comprobó el último control
  `ok 17` y no dejó fixtures por usar transacción con rollback.
- TypeScript estricto, ESLint, Prettier y build Next.js exitosos.
- `pnpm audit --prod`: cero vulnerabilidades conocidas.
- Security Advisors: 0 hallazgos.
- Performance Advisors: se corrigió la FK de categoría sin índice y las policies SELECT
  solapadas. Permanecen sólo índices sin uso, esperables sin tráfico y registrados en OI-008.

## 2026-07-28 — Sprint 4, KDS, comandas y durabilidad

### Qué cambió

- Se construyó `/kds` como pantalla horizontal, opaca y de alto contraste, con estaciones
  configurables, temporizadores, sello Pagado, botones grandes y estados independientes.
- El camino inmediato invalida por estación y vuelve a consultar la fuente durable. Al abrir o
  reconectar se recuperan todas las comandas no terminales y cada 45 segundos corre una
  reconciliación de respaldo aunque el canal parezca sano.
- La pantalla muestra permanentemente conexión y “actualizado hace X”; después de 75 segundos
  sin sincronizar aparece una advertencia roja grande que impide confundir una caída con una
  barra tranquila.
- Cada KDS mantiene heartbeat. La confirmación congela si había pantalla viva y la métrica
  excluye de percentiles el tiempo sin observador, presentándolo en un contador separado.
- Las transiciones usan estado y versión esperados. Dos pantallas no pueden sobrescribirse:
  una gana y la otra debe recargar.
- READY escribe avisos durables para garzón y comensal. Agotado/repuesto actualiza la carta de
  inmediato y deja auditoría.
- Se aplicaron tablas RLS para configuración, presencia, métricas, endpoints, spool e intentos
  de impresión. `PrinterPort` y el worker dejan el transporte físico como adaptador stub.
- Se corrigió la documentación del código de presencia a 4 dígitos.

### Por qué

Realtime debe acelerar sin transformarse en fuente de verdad. La consulta periódica cubre un
websocket medio muerto; el heartbeat permite medir el sistema y no cuánto tiempo estuvo
apagada una tablet. El spool debe sobrevivir aunque todavía no se haya elegido cómo alcanzar
la impresora del local.

### Verificación

- Playwright completo: 11/11 recorridos verdes, incluidos pago real del adaptador simulado a
  Barra/Cocina, reconexión, agotado inmediato, indicador y métrica segmentada.
- Medición de laboratorio con KDS conectado: 12 muestras, p50 64 ms, p95 103 ms, p99 105 ms.
  Hubo 1 confirmación sin KDS conectado y quedó fuera de los percentiles.
- Vitest: 37 controles verdes, incluidos reinicio, duplicado, concurrencia, spool y reimpresión.
- La migración remota `verify_sprint_04_kds` comprobó tablas, RPCs, privilegios mínimos, seis
  tablas con RLS forzado y policies privadas de Realtime, sin crear datos.
- La suite pgTAP de 26 controles quedó versionada. La CLI de Supabase intenta iniciar Docker
  incluso con `--linked`; como Docker fue cancelado, la verificación remota ejecutable se hizo
  mediante la migración anterior.
- TypeScript estricto, ESLint, Prettier y build de producción verdes.
- Security Advisors finales: cero hallazgos. Performance Advisors: sólo `unused_index`
  informativos esperables antes de tráfico, cubiertos por OI-008.

## 2026-07-28 — Sprint 5, panel del garzón

### Qué cambió

- Se construyó `/garzon`: PIN, zonas, cola, mesas, grupos, traspaso de mesa/zona, incidencias y
  cierre de turno.
- SSE avisa, la consulta recupera y cada 45 segundos reconcilia. Conexión y última
  sincronización son permanentes; 75 segundos sin éxito muestran alerta opaca.
- READY crea una entrega pagada; completar exige estado y versión vigentes. Llamados y pagos
  con garzón se materializan idempotentemente.
- Pago con garzón es NO PAGADO, no crea Order/Ticket y expira a 30 minutos.
- La cola tiene techo crítico a 12 minutos. Zonas huérfanas son visibles para todos y escalan
  a administración a 2 minutos.
- Cerrar muestra desglose, conserva snapshot, libera cobertura y no borra tareas.
- ADR-004 congeló el grupo de mesas estrictamente operativo.

### Verificación

- Vitest: 46 controles verdes.
- Playwright: 15/15 recorridos verdes entre PWA, KDS y garzón.
- KDS en la corrida final: p50 86 ms, p95 134 ms, p99 149 ms, 1 caso sin pantalla.
- TypeScript, ESLint y build Next.js verdes.
- Se aplicaron remotamente `sprint_05_waiter_operations`, `sprint_05_runtime_fixes` y
  `sprint_05_advisor_fixes`; el historial local y remoto quedó alineado.
- pgTAP Sprint 5: 31/31 controles verdes en el proyecto remoto, dentro de una transacción con
  rollback. Incluye tenant cruzado y fail-closed sin `tenant_id` ni sesión de empleado.
- El lint remoto terminó sin errores de Sprint 5. Sólo informa tres `warning extra` heredados
  de funciones del Sprint 2.
- Security Advisors: cero hallazgos. Se agregó una policy explícita de denegación a
  `employee_pin_attempts`.
- Performance Advisors: cero claves foráneas sin índice; sólo `unused_index` informativos sin
  tráfico real, cubiertos por OI-008.

## 2026-07-28 — Sprint 6, caja, cierre y conciliación

### Qué cambió

- Se construyó `/caja` con sesiones de mesa, grupos, métricas de turno, conexión permanente,
  excepciones financieras, reembolsos, conciliación sintética, cierre y CSV.
- Se materializaron turnos de caja, atribución por hora del proveedor, snapshots inmutables,
  desgloses por medio/garzón, historial de excepciones y settlements por pago.
- Una confirmación conserva siempre aprobación y recepción. Si su hora no cae en ningún turno,
  queda sin turno en una bandeja crítica; si pertenece a uno cerrado, se liga al original para
  revisión post-cierre.
- La producción manual por aprobación tardía dura 20 minutos configurables. Dentro de la
  ventana revalida mesa y stock y crea pedido/comandas/outbox atómicamente; fuera se
  deshabilita.
- ADR-005 separó la propina devuelta con turno abierto de la ya distribuida. La primera reduce
  el turno; la segunda crea un ajuste a cargo del local en el siguiente cierre.
- El cierre exige justificación si quedan excepciones y congela todos los totales calculados
  en PostgreSQL. Triggers impiden editar o eliminar su evidencia.

### Por qué

La promesa “el cierre explica cada peso” necesita rastrear dinero y decisiones sin tratar una
mesa prepaga como deuda, sin esconder cobros tardíos y sin reescribir una fotografía financiera
después de distribuir propinas.

### Verificación

- Vitest: 60/60 controles verdes, 14 específicos del dominio de caja.
- Playwright de caja: 4/4 recorridos; 19 recorridos completos al sumar PWA, KDS y garzón.
- pgTAP remoto: 40/40 en verde dentro de una transacción con rollback, incluidos RLS, permisos
  y fail-closed.
- Se aplicaron `sprint_06_cashier_closure_reconciliation`, `sprint_06_advisor_fixes`,
  `sprint_06_runtime_fix` y `sprint_06_permission_fix` al proyecto Supabase enlazado. El fix
  final exige `cashier.close` en las RPC públicas de apertura y cierre.
- Security Advisors: cero hallazgos. Performance Advisors: cero claves foráneas de Sprint 6
  sin índice; permanecen sólo índices sin uso informativos por falta de carga real.
- El lint remoto quedó sin hallazgos de Sprint 6 y conserva tres `warning extra` heredados de
  Sprint 2.

## 2026-07-29 — Sprint 7 · Boleta electrónica

- Se definió `TaxDocumentProvider` y un adaptador DTE simulado con éxito, falla, demora,
  duplicados, consulta, representación, nota de crédito y reintento.
- Se aplicaron ocho migraciones al Supabase actual: configuración/emisor por tenant,
  referencias a Vault, venta/documento/intentos, RLS, outbox de reembolso, RPC de reintento,
  índices, corrección de la carrera entre reembolso y boleta original, cola DTE/DLQ dedicada
  y ejecución automática con `pg_cron` + `pg_net`.
- Se desplegó `tax-document-consumer` en Supabase Edge Functions. El cron usa un JWT válido
  más un secreto aleatorio cifrado en Vault; la función usa `service_role` sólo internamente,
  reclama mensajes idempotentes y aplica ACK, backoff o DLQ. Dos llamadas reales consecutivas
  —una automática— respondieron HTTP 200.
- La devolución de dinero quedó desacoplada del documento tributario: una nota pendiente crea
  una alerta sin retener la plata del cliente.
- Caja alerta sobre más de 10 pendientes o 15 minutos de antigüedad y muestra salud
  funcionando/degradado/caído desde la tasa de fallos reciente.
- La PWA muestra “emitiendo” después del pago y luego permite ver/descargar la representación
  demo; correo opcional queda registrado por el simulador.
- Verificación: 67 Vitest, TypeScript, lint y build verdes; 43/43 pgTAP de Sprint 7 y 19/19
  del aislamiento multi-tenant remotos; los 21 E2E verdes. La suite de garzón requirió una
  repetición aislada tras un botón transitoriamente deshabilitado y pasó 4/4. Security
  Advisors sin hallazgos. Los Advisors de rendimiento quedaron sólo con `unused_index`,
  esperable sin tráfico real.

## 2026-07-29 — Sprint 8 · Onboarding, superadmin y cobro SaaS

### Qué cambió

- Se construyó `/onboarding` con nueve pasos retomables: local, tamaño, carta con revisión
  humana, tributación, conexión simulada de la cuenta del bar, personal, QRs/códigos de
  presencia, venta/reembolso de prueba y habilitación.
- Se creó el puerto `SaasBillingProvider` y un adaptador simulado separado de
  `PaymentGateway`; cubre conexión, setup, mensualidad, idempotencia, fallo y reintento.
- ADR-007 fijó las mesas como dimensión principal: Inicial ≤12, Flujo 13–30, Alto flujo
  31–60 y Personalizado >60. Zonas/estaciones sólo elevan un nivel si ambas superan límites
  generosos. Precios y cortes siguen siendo hipótesis comerciales.
- Se construyó `/superadmin` con métricas, tenants, plan/estado/proveedores, feature flags,
  cobros y soporte con impersonación obligatoriamente motivada.
- Se separó estado comercial de acceso operativo. Morosidad y restricción administrativa
  mantienen ventas; la suspensión sólo bloquea pedidos nuevos después de aviso/agendamiento.
  La PWA recibe exclusivamente disponibilidad y mensaje neutro.
- Se aplicaron cinco migraciones: progreso, importación, conexiones/secretos Vault, planes,
  suscripciones, facturas, intentos, avisos, cron horario, auditoría, feature flags,
  superadmin, índices y hardening RLS/grants.

### Por qué

Tablio necesitaba poder instalar y administrar un local sin mezclar el dinero del bar con la
mensualidad del SaaS. La escala de planes debe discriminar dentro del beachhead real y una
falla de cobro no puede interrumpir un viernes por la noche ni revelar deuda al comensal.

### Verificación

- 79/79 Vitest; 26/26 Playwright; TypeScript, ESLint, Prettier y build verdes.
- pgTAP Sprint 8: 51/51; aislamiento multi-tenant: 19/19, ambos en el proyecto remoto con
  rollback.
- Performance Advisors: se agregaron los 14 índices de claves foráneas faltantes y se corrigió
  el `auth.uid()` por fila; quedan sólo `unused_index` sin tráfico real.
- Security Advisors: se revocaron grants anónimos accidentales. Se registraron en OI-019 seis
  warnings intencionales de RPCs `SECURITY DEFINER`, con acceso mínimo y validación interna.
- Migraciones locales alineadas con el historial remoto: `20260729163957`,
  `20260729164321`, `20260729164723`, `20260729165547` y `20260729165625`.

## 2026-07-29 — Sprint 9 · Crédito de mesa y panel del dueño

### Qué cambió

- Se modeló crédito de mesa desactivado por defecto, con permisos, motivo, límites por mesa y
  local, vencimiento, ledger append-only, pagos parciales, fuga y código vivo de un uso.
- `orders.financial_mode` preserva el prepago y permite producir sin pago sólo contra una
  cuenta de crédito viva. Pedido, comandas, reservas y outbox se crean atómicamente.
- Caja y garzón presentan prepago y deuda por separado: una venta QR no altera el saldo del
  crédito de la misma mesa.
- El spool recibe comprobantes de cada pago parcial. La fuga entra al cierre del turno y al
  costo mensual acumulado del panel del dueño.
- `/dueno` cuenta una historia con titular, tres focos, un gráfico horario, productos,
  operación, locales, excepciones y fuga. Un tenant nuevo conserva datos actuales y explica
  cuándo aparecerá la primera comparación.
- ADR-008 congeló el crédito como excepción subordinada al prepago.

### Correcciones encontradas durante la prueba real

- La creación de una comanda reveló un bloque ajeno dentro del trigger KDS de Sprint 4, que
  referenciaba variables inexistentes. Se reemplazó el trigger y se verificó nuevamente tanto
  el flujo prepago como el crédito.
- Se explicitó la resolución de una variable PL/pgSQL ambigua en la creación del pedido.
- Se revocaron privilegios de escritura que Supabase concede por defecto a roles API.
- Las implementaciones privilegiadas de ocho RPC de crédito se movieron a `private`, dejando
  fachadas públicas `SECURITY INVOKER`.
- Performance Advisors detectó once claves foráneas Sprint 9 sin índice; todas recibieron
  índice de cobertura.

### Verificación

- Vitest: 94/94; incluye reglas de crédito, relato y aislamiento del store demo.
- pgTAP remoto: 51/51 dentro de una transacción con rollback; las ventas del dueño cuadran con
  el snapshot operacional del cierre para el mismo intervalo.
- Playwright: 30/30 en la regresión completa; 4/4 específicos para coexistencia, pago/código,
  fuga mensual y tenant nuevo.
- TypeScript, ESLint, Prettier y build Next.js verdes.
- Security Advisors: Sprint 9 no agregó warnings; permanecen exactamente los seis OI-019,
  explicados en lenguaje simple.
- Performance Advisors: cero claves foráneas Sprint 9 sin índice; los `unused_index` siguen
  bajo OI-008 hasta disponer de tráfico representativo.

## 2026-07-29 — Sprint 10 · Endurecimiento y preparación del piloto

### Qué cambió

- Se agregó un harness reproducible de carga que recorre rutas HTTP reales: entrada PWA,
  dispositivo, carrito, quote, pago simulado, confirmación server-side, pedido, comanda,
  visibilidad KDS, fanout a KDS/garzones, reconexión y spool.
- Se modelaron dos perfiles: capacidad sostenida de 2.880 pedidos/h y “última ronda”, con
  96 de 240 personas comprando dentro de cinco minutos.
- Se agregó una suite de caos para KDS caído, reinicio, proveedor lento y eventos fuera de
  orden, impresora caída, DTE caído, reembolso parcial y cierre concurrente.
- Se agregó una suite E2E de red offline/online, QR inválido y opacidad de superficies
  financieras, además de una medición móvil en build productivo.
- Se cerró el control negativo multi-tenant: policy deliberadamente insegura, test rojo,
  rollback, policy restaurada y suites verdes.
- Se escribieron el playbook de piloto, reporte de carga/caos, explicación simple de OI-019,
  lista de bloqueantes reales y resumen final.

### Resultados medidos

- Carga sostenida: 240/240 flujos sin error; confirmación → KDS p50 33 ms, p95 70 ms,
  p99 88 ms. Se crearon exactamente 240 comandas y 240 trabajos de impresión.
- Última ronda: 96/96 flujos sin error; confirmación → KDS p50 26 ms, p95 55 ms,
  p99 70 ms. Se crearon exactamente 96 comandas y 96 trabajos de impresión.
- Pico de entrada: 240 escaneos simultáneos p50 2.383 s, p95 4.318 s, p99 4.322 s; queda
  bajo OI-020 para repetir en hosting y dispositivos reales.
- PWA productiva con CPU 4× y red 1,6 Mbps/150 ms: utilizable p50 2.008 s, p95 2.055 s,
  p99 2.059 s; 241 KB transferidos.
- Caos: 5/5 escenarios verdes. E2E de hardening: 3/3 verdes.
- pgTAP remoto: 316/316 entre las suites 001–010. Security Advisors: exactamente los seis
  warnings intencionales OI-019; no aparecieron warnings nuevos.

### Decisión de salida

El producto queda apto para demo y candidato a piloto controlado después de cerrar los
bloqueantes marcados. No queda autorizado para operar dinero real: pasarela, DTE, asesorías,
impresión física, despliegue/observabilidad y validaciones de infraestructura siguen abiertos.

## 2026-07-29 — Sprint 11 · Identidad recurrente y fidelización

### Qué cambió

- Se agregó identidad seudónima por tenant sin modificar el pedido anónimo. El opt-in aparece
  después del primer pago y exige consentimientos separados para identificación y recuperación.
- Teléfono/correo verificado es la continuidad principal. Un token perdido se reemplaza sin
  perder sellos; el dispositivo compartido sólo muestra `Perfil •NNN`.
- Caja puede restituir sellos con motivo obligatorio y actor auditado. El dueño ve la tasa de
  recuperaciones por credencial perdida.
- Programa, visitas, ledger, canjes, reembolsos y segmento dormido son configurables por tenant,
  idempotentes, con RLS forzado y evidencia append-only.
- “Tu de siempre” usa historial real y disponibilidad. El premio es un ítem server-side a `$0`,
  conserva stock y aparece marcado en PWA/KDS.
- Se agregó costo de producto opcional. Sin costo, conciliación informa sólo valor de lista y
  jamás inventa margen.

### Correcciones encontradas al probar

- La segunda ronda todavía recibía en el bootstrap el quote ya pagado de la ronda anterior.
  Se dejó de publicar quotes/pagos terminales; un nuevo carrito siempre crea un quote nuevo.
- Advisors detectó 17 claves foráneas nuevas sin índice; se agregaron índices de cobertura.
- Los tres avisos `RLS enabled no policy` de tablas privadas se conservaron deliberadamente:
  cero policies/grants impide acceso API y está explicado en OI-023.

### Verificación

- Vitest: 115/115.
- Playwright: 36/36 en la regresión completa; 3/3 específicos incluyen pérdida total de
  cookies y canje/KDS.
- pgTAP Sprint 11: 30/30 en el proyecto remoto con rollback.
- TypeScript, ESLint y revisión visual de PWA, caja y dueño verdes.
- Security Advisors: ningún warning nuevo; tres `INFO` intencionales de tablas `private`.
- Performance Advisors: cero claves foráneas Sprint 11 sin índice.

## 2026-07-29 — Sprint 12 · Momento del pago

### Qué cambió

- Upsell determinista, máximo dos sugerencias, descartable y sin productos agotados.
- Happy hour versionado; el quote congela precio y descuento aunque cambie la promoción.
- Invitaciones pagadas esperan reclamo hasta 60 minutos por defecto, avisan antes de vencer y
  pueden cancelarse con reembolso mientras no exista producción.
- Otra persona de la misma mesa puede reclamar; el dispositivo pagador no puede auto-reclamar.
- Propina congela trabajador y turno. Caja/dueño informan por medio de pago sin mover dinero.
- ADR-011 y ADR-012 fijan reglas, concurrencia y trazabilidad.

### Verificación

- Vitest 125/125, TypeScript, ESLint y build verdes.
- Playwright Sprint 12: 5/5, incluido el reclamo desde otro dispositivo de la misma mesa.
- pgTAP Sprint 12: 38/38 remoto; aislamiento existente: 19/19.
- Las seis migraciones quedaron aplicadas en Supabase, incluida la política final de
  reembolsos de propina, límite antiabuso y vencimiento durable de invitaciones.
- Advisors ejecutados después de migrar: ningún hallazgo nuevo de seguridad ni clave foránea
  sin índice atribuible a Sprint 12. Se mantienen OI-008, OI-019 y OI-023.

## 2026-07-29 — Sprint 13 · Saldo prepagado

### Qué cambió

- Se agregó saldo por perfil y tenant con ledger append-only y lotes separados de dinero/bono.
- La recarga usa quote, pago simulado y confirmación server-side idempotente; nunca crea pedido.
- El quote congela asignaciones y política. El intento externo cobra sólo la diferencia.
- Se eligió bono primero + FEFO y se agregaron vigencias/avisos separados.
- El tope individual es $40.000 por defecto; el local puede fijar un tope total.
- Caja consulta, ajusta con motivo y devuelve recargas intactas. Dueño y cierre separan entrada
  por recarga, ingreso por consumo y pasivo acumulado.
- Superadmin ve el pasivo por tenant, configura alerta y no puede cerrar un tenant con saldo.
- Revocar identidad congela la cuenta con referencia de recuperación.

### Seguridad y verificación

- Diez tablas nuevas tienen RLS habilitado y forzado; el test principal prueba que el saldo de
  Tenant A no existe para Tenant B y que falta de claim falla cerrado.
- El RPC multi-tenant de superadmin valida membresía de plataforma y no depende de
  `service_role` en una ruta de usuario.
- Vitest 140/140 cubre confirmación, duplicados, tope, pago mixto, devolución y borrado de
  identidad. Playwright 42/42 recorrió la regresión completa más recarga, alerta, mezcla y
  límite.
- pgTAP remoto: 48/48 Sprint 13 y 21/21 aislamiento/fail-closed. TypeScript, ESLint y build
  verdes.
- Security Advisors no agregó hallazgos. Performance Advisors confirmó cero claves foráneas
  Sprint 13 sin índice; `unused_index` sigue bajo OI-008 hasta tener tráfico representativo.

## 2026-07-31 — Sprint 14 · Reconciliación de mesas, QR y presencia

### Migración segura

- Se separó `presence_required` de `presence_delivery_level`, con política por tenant y
  excepción opcional por zona.
- Mesas nuevas nacen con código obligatorio y `PRINTED_WITH_QR`. El QR, su hash, el código,
  la rotación y la auditoría se crean en una sola transacción; la creación masiva también es
  atómica.
- QR y código recuperables viven cifrados en Vault. No se guarda SVG, PNG ni PDF; `qrcode`
  renderiza el SVG en servidor cuando una persona autorizada ve o imprime la tarjeta.
- La fachada de creación no devuelve secretos. Revelar exige permiso, motivo y auditoría.
  Las fachadas públicas usan `SECURITY INVOKER`; el trabajo privilegiado vive en `private`.
- La verificación registra fallos, serializa intentos por mesa y aplica límites por dispositivo
  y por mesa antes de devolver una respuesta genérica.

### Checkpoint visual aprobado para revisión

- El shell compartido mantiene sidebar de 224 px en escritorio y navegación inferior en móvil.
- El panel Dueño conserva la pantalla piloto y comparte navegación, formatos y estados con la
  nueva pantalla de Mesas.
- Mesas incluye resumen útil, tarjetas, alta individual, alta masiva, ver/regenerar/revocar QR
  con advertencias y tarjeta imprimible bajo demanda. Nunca muestra tokens ni UUID internos.
- Sólo se migraron Dueño y Mesas. El resto de las pantallas permanece intacto hasta recibir la
  validación visual solicitada.

### Verificación local

- Vitest específico: 3/3; Playwright Mesas: 4/4.
- TypeScript y ESLint: verdes.
- Auditoría propia en Dueño y Mesas, escritorio y móvil: cero fallos de contraste AA, objetivos
  táctiles de 56 px, foco visible, gradientes o desborde horizontal.
- Suite completa: 144/144 Vitest, 4/4 Playwright Mesas, TypeScript, ESLint, Prettier y build
  Next.js verdes.

### Verificación remota — 1 de agosto de 2026

- Se aplicaron al proyecto `xmwewmukoxdeuilmkahr` las migraciones `20260731213000`,
  `20260731213200` y `20260731213300`.
- pgTAP ejecutó 32/32 pruebas dentro de una migración temporal que terminó deliberadamente en
  error después de `finish()`: el sentinel `TABLIO_PGTAP_OK_32` confirmó el verde y obligó el
  rollback completo de fixtures y del propio artefacto de verificación.
- Security Advisor quedó con los nueve hallazgos históricos: seis `WARN` de OI-019 y tres
  `INFO` de OI-023. Ninguno pertenece a las tablas o RPCs de Sprint 14.
- Performance Advisor detectó inicialmente tres claves foráneas de auditoría sin índice. La
  migración `20260731213300` agregó la cobertura y la segunda ejecución confirmó cero
  `unindexed_foreign_keys`.
- Los índices recién creados aparecen como `unused_index`, informativo y esperado sin tráfico;
  se conservan porque cubren claves foráneas y su evaluación con carga real sigue OI-008.
- Se detectó divergencia histórica de timestamps y hotfixes entre migraciones locales y
  remotas de Sprints 11–13. La aplicación segura usó una copia temporal del historial remoto y
  el trabajo de reconciliación quedó registrado en OI-027.
