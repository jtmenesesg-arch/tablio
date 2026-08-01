# Asuntos abiertos

Aquí viven decisiones pendientes con impacto real. Una hipótesis no se presenta como hecho ni
se implementa antes de su momento.

## OI-001 — Pasarela primaria y Oneclick

- **Estado:** bloqueante antes del piloto; ADR-001 propuesto, no decidido.
- **Decidir antes de:** reemplazar el adaptador simulado por un proveedor real.
- **Opciones:** Webpay/Transbank y Mercado Pago; Fintoc puede evaluarse como medio adicional.
- **Evidencia actual:** sólo investigación documental, marcada íntegramente como hipótesis no
  verificada en `docs/adr/ADR-001-payment-gateway-spike.md`.
- **Bloqueante:** crear cuenta de desarrollador de Tablio en la pasarela elegida; es necesaria
  para probar y ofrecer el botón de conexión OAuth.
- **Bloqueante:** validar con credenciales reales onboarding OAuth, Apple Pay en PWA, medio
  guardado, reembolso real y datos de liquidación.
- **Evidencia requerida adicional:** confirmar que cada bar recibe directo sus fondos,
  firmas/callbacks, duplicados, eventos tardíos/fuera de orden, ambiente de prueba y
  conciliación hasta el abono.
- **Riesgo:** elegir por comisión o documentación sin ejecutar el flujo completo.
- **Riesgo de promesa de producto:** si ninguna pasarela entrega datos de liquidación por API,
  la promesa “el cierre explica cada peso” no se puede cumplir como está escrita en el brief.

## OI-002 — Proveedor DTE

- **Estado:** abierto; ADR-006 pendiente.
- **Decidir antes de:** primer pago real en producción.
- **Evidencia requerida:** certificación/autorización, API, idempotencia, notas de crédito,
  recuperación ante fallas, soporte y costo.
- **Riesgo:** doble documento o venta pagada sin respaldo tributario recuperable.

## OI-003 — Cortes de planes por tamaño

- **Estado:** hipótesis implementada; bloquea el pricing productivo, no la arquitectura.
- **Propuesta actual:** Inicial hasta 12 mesas, Flujo 13–30, Alto flujo 31–60 y Personalizado
  sobre 60. Las mesas mandan; zonas y estaciones sólo elevan un nivel cuando ambas exceden
  límites generosos.
- **Precios demo:** setup/mensualidad son hipótesis, no una oferta comercial validada.
- **Decidir antes de:** cobrar a un tenant real.
- **Evidencia requerida:** entrevistas/pilotos con bares de 10–25 mesas, disposición a pagar,
  costo de instalación/soporte y capacidad realmente usada.
- **Riesgo:** planes arbitrarios que castiguen al cliente correcto o no cubran costos.

## OI-004 — UX para conectar la pasarela del bar

- **Estado:** abierto; bloqueante antes del piloto.
- **Decidir antes de:** onboarding de producción.
- **Debe incluir:** conexión segura de credenciales, verificación de comercio/ambiente, venta de
  prueba, reversa/reembolso de prueba y comparación con liquidación.
- **Evidencia requerida:** spike con cada proveedor y observación de un usuario no técnico.
- **Riesgo:** enviar fondos al comercio equivocado o depender de soporte manual frágil.

## OI-005 — Conectividad con impresora térmica

- **Estado:** abierto; el puerto y spool quedaron implementados en Sprint 4, pero el transporte
  físico sigue sin decidir.
- **Decidir antes de:** comprar/recomendar hardware y diseñar onboarding de impresión.
- **Problema:** Vercel/Supabase viven en la nube, pero la impresora suele estar dentro de la red
  privada del bar. La nube no puede asumir que alcanza directamente su IP.

### Opciones

#### A. Agente local

Programa instalado en un computador, mini-PC o dispositivo del local. Consume un spool durable
y habla con impresoras USB/LAN.

- Ventajas: mayor compatibilidad, control de reintentos y posibilidad de varias impresoras.
- Costos/riesgos: instalación, actualizaciones, seguridad del dispositivo y soporte en terreno.

#### B. Servicio administrado de impresión

Proveedor cloud con agente/conector propio.

- Ventajas: integración inicial más rápida y soporte de hardware ya resuelto.
- Costos/riesgos: mensualidad, dependencia externa, privacidad, límites y disponibilidad.

#### C. Impresora con conectividad cloud

Hardware que recibe trabajos mediante API o servicio del fabricante.

- Ventajas: menos software local.
- Costos/riesgos: lock-in de hardware, costo inicial, compatibilidad limitada y dependencia de
  Internet/fabricante.

### Criterios de decisión

- Nunca imprimir un pedido sin confirmación server-side.
- Spool persistente, ACK, reintentos, deduplicación y reimpresión auditada.
- Recuperación tras caída de Internet, reinicio o impresora apagada.
- Compatibilidad USB/Ethernet/Wi-Fi y lenguaje ESC/POS usado por los pilotos.
- Instalación entendible, actualización segura y diagnóstico remoto.
- Costo total de hardware, servicio y soporte por local.

### Impacto que debe contemplarse desde ahora

El esquema aplicado contiene `print_jobs`, `printer_endpoints` y `print_attempts`; el worker
usa reintentos/DLQ y toda reimpresión exige motivo auditable. `PrinterPort` ya separa el spool
del transporte y el adaptador físico sigue como stub. No se escoge opción ni se compra
hardware hasta probarla con el piloto.

## OI-007 — Control negativo del test de aislamiento

- **Estado:** cerrado en Sprint 10.
- **Evidencia roja:** dentro de una única transacción en el proyecto Supabase actual se
  reemplazó temporalmente `zones_select_own_tenant` por una policy insegura `USING (true)`.
  La misma aserción que exige que tenant A vea exactamente una zona recibió dos y produjo
  `not ok 1`, `have: 2`, `want: 1`.
- **Restauración:** la transacción completa terminó en `ROLLBACK`; una consulta posterior
  confirmó la policy segura original.
- **Evidencia verde:** la suite completa `001_tenant_isolation.test.sql` pasó 19/19 y la nueva
  suite masiva Sprint 10 pasó 5/5 con 96 filas por tenant, incluyendo fail-closed sin claim.
- **Artefacto listo:** `supabase/tests/negative/tenant_isolation_broken.test.sql`.
- **Seguridad:** el cambio inseguro nunca se confirmó y no sobrevivió a la sesión de prueba.

## OI-008 — Índices sin uso observado

- **Estado:** abierto, informativo; no bloquea Sprint 4.
- **Hallazgo:** después de indexar también todas las claves foráneas hasta Sprint 6, los
  Performance Advisors sólo marcan `unused_index`. Sprint 9 agregó los once índices de claves
  foráneas que faltaban; el proyecto no tiene carga real y por eso varios índices nuevos
  todavía registran cero usos.
- **Acción:** conservarlos para evitar scans y bloqueos costosos en deletes/updates de tablas
  referenciadas. Revisar estadísticas con tráfico representativo antes de retirar alguno.
- **Evidencia requerida:** `pg_stat_user_indexes`, planes de consulta y carga de piloto.
- **Referencia:** <https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index>

## OI-009 — Resolución operativa de cobro aprobado tras expirar

- **Estado:** cerrado en Sprint 6 con el adaptador simulado.
- **Implementado:** no se crea pedido automáticamente; la excepción aparece crítica e
  inmediata. Reembolsar exige permiso, motivo e idempotencia. Producir manualmente revalida
  mesa y stock y crea pedido, comandas y outbox atómicamente.
- **Ventana:** 20 minutos configurables desde la aprobación server-side. Vencida la ventana,
  producir queda deshabilitado y sólo se permite reembolsar o escalar.
- **Pendiente externo:** validar reembolso real antes del piloto dentro de OI-001 y OI-013.

## OI-010 — Realtime privado y validación bajo carga

- **Estado:** arquitectura decidida en ADR-003; validación de producción pendiente.
- **Decidir antes de:** piloto con concurrencia real.
- **Implementado:** topics privados y autorización RLS en el esquema, recuperación por consulta
  en arranque/reconexión, reconciliación independiente cada 45 s, heartbeat por estación,
  indicador visible y alerta si la pantalla queda desactualizada.
- **Medido en laboratorio:** 12 confirmaciones con KDS conectado: p50 64 ms, p95 103 ms,
  p99 105 ms. Un caso sin KDS conectado se contó aparte. Objetivo p95 ≤ 2 s cumplido en este
  entorno.
- **Medido en Sprint 10:** con KDS conectado, 240 pedidos bajo carga sostenida dieron p50
  33 ms, p95 70 ms y p99 88 ms; el pico “última ronda” de 96 pedidos en cinco minutos dio
  p50 26 ms, p95 55 ms y p99 70 ms. No hubo casos sin KDS conectado en esas dos corridas.
  El servidor estaba caliente, por lo que la mejora frente a 103 ms no se interpreta como una
  optimización; sí demuestra que el objetivo no se degradó en el laboratorio.
- **Pendiente:** conectar el cliente Supabase autenticado de producción, probar Broadcast
  privado y pérdida de avisos bajo carga/redes representativas del piloto.
- **Criterio:** un aviso nunca contiene autoridad financiera; sólo invalida la lectura y
  PostgreSQL reconstruye el estado.
- **Riesgo:** declarar “en vivo” sin medir teléfonos/redes reales de un bar lleno.

## Pendientes acumulados

- La PWA y sus pruebas existen; CI y despliegue siguen pendientes.
- El control negativo rojo → rollback → verde quedó cerrado con evidencia en Sprint 10
  (OI-007).
- El objetivo KDS p95 ≤ 2 s está medido y cumplido en reposo, carga sostenida y “última
  ronda”; falta revalidarlo sobre infraestructura y redes reales antes del piloto (OI-010).
- El proyecto Vercel está vinculado, pero su configuración debe verificarse con
  `apps/web` como Root Directory antes del primer despliegue.
- La operación de aprobaciones tardías está cerrada con el simulador; su reembolso real se
  valida con la pasarela antes del piloto (OI-001 y OI-013).
- El canal Broadcast privado y su prueba de carga deben cerrarse antes del piloto (OI-010).
- La política laboral de propinas post-cierre debe revisarse antes del piloto (OI-012).
- Planes/precios y proveedor de cobro SaaS deben validarse antes de cobrar (OI-003 y OI-017).
- La extracción real de cartas debe probarse con documentos de locales antes de ofrecerla
  como automatización productiva (OI-018).

## OI-011 — Consumidor visual de alertas huérfanas

- **Estado:** evento durable implementado; pantalla de administración operativa pendiente.
- **Implementado:** sin cobertura, las tareas se muestran a todos. Tras 2 minutos por defecto,
  `waiter_admin_alerts` y el outbox `waiter.admin.orphan_task` escalan.
- **Pendiente:** mostrar, reconocer y resolver la alerta en caja/administración.
- **Riesgo:** los garzones quedan protegidos, pero falta la vista central del responsable.

## OI-012 — Revisión laboral de propinas reembolsadas post-cierre

- **Estado:** bloqueante antes del piloto.
- **Decisión técnica actual:** ADR-005 impide descontar retroactivamente al trabajador una
  propina ya distribuida. El componente proporcional se registra como ajuste a cargo del
  local y aparece en el cierre siguiente.
- **Revisión requerida:** confirmar con asesor laboral chileno el tratamiento, lenguaje de
  reportes, respaldo y operación cuando la pasarela devuelve propina al cliente.
- **Riesgo:** tratar como simple corrección contable dinero que pertenece a trabajadores.
- **Límite:** ninguna recomendación futura puede reescribir cierres históricos.

## OI-013 — Conciliación real hasta el abono

- **Estado:** bloqueante antes del piloto.
- **Verificado:** el simulador produce venta bruta, comisión, neto, abono y diferencias; la
  maquinaria detecta diferencias, crea excepciones idempotentes y exporta el cierre.
- **No verificado:** que la pasarela elegida exponga por API todos esos campos con referencias
  estables y oportunidad suficiente para conciliar cada pago hasta el depósito bancario.
- **Evidencia requerida:** credenciales reales, pago, reembolso total/parcial, settlement,
  comisión y abono observado en una cuenta de comercio de prueba.
- **Riesgo:** sin esos datos la promesa “el cierre explica cada peso” no se puede cumplir como
  está escrita.

## OI-014 — Proveedor DTE real y matriz tributaria

- **Estado:** bloqueante antes del piloto.
- **Implementado:** puerto neutral, simulador, configuración por tenant, Vault, idempotencia,
  boleta/nota de crédito, reintentos, conciliación y alertas operativas.
- **Pendiente:** contratar un proveedor DTE real y validar con credenciales: emisión,
  idempotencia, consulta tardía, folio, timbre, representación, correo, nota de crédito,
  reintentos, límites, SLA y recuperación tras timeout.
- **Asesoría requerida:** un asesor tributario chileno debe aprobar la matriz para
  efectivo/transferencia versus medios electrónicos y los tres modos de configuración.
- **Riesgo:** emitir voucher y boleta por el mismo hecho, o no emitir el respaldo correcto.
- **Hipótesis:** LibreDTE, Nubox, Bsale y Facturación.cl son candidatos documentales; ninguno
  fue probado ni recomendado todavía.

## OI-015 — Reembolso monetario versus nota de crédito pendiente

- **Estado:** bloqueante para revisión tributaria antes del piloto.
- **Decisión operativa implementada:** una caída DTE no retiene el reembolso del cliente. La
  devolución procede por la pasarela; la nota de crédito queda como obligación vinculada,
  crítica y reintentable en caja.
- **Tensión a resolver:** no es aceptable que el cliente espere indefinidamente su dinero,
  pero la secuencia y plazo legal de la nota de crédito deben confirmarse con asesor y
  proveedor DTE.
- **Evidencia pendiente:** ejecutar un reembolso real mientras el proveedor DTE está caído,
  recuperar la boleta original y emitir exactamente una nota de crédito después.

## OI-016 — Entrega digital de boleta desde marzo de 2026

- **Estado:** bloqueante antes del piloto.
- **Implementado con simulador:** estado “emitiendo”, URL descargable y correo opcional.
- **Pendiente:** validar con asesor y proveedor la representación aceptada, conservación,
  disponibilidad, correo y operación aplicable a la Resolución Exenta SII N.º 53 de 2025
  desde el 1 de marzo de 2026.

## OI-017 — Proveedor real para cobrar el SaaS

- **Estado:** bloqueante antes del primer cobro real.
- **Implementado:** puerto `SaasBillingProvider`, adaptador simulado, setup, mensualidad,
  facturas, avisos previos, idempotencia, reintentos, gracia y suspensión programada.
- **Pendiente:** elegir/contratar proveedor para que los bares paguen a Tablio, crear la cuenta
  de Tablio, probar alta de medio, cobro recurrente, reintento, cancelación, conciliación,
  impuestos, seguridad y recuperación después de timeout.
- **Regla:** esta cuenta pertenece a Tablio y nunca se reutiliza para ventas de comensales ni
  para conectar la cuenta comercial del bar.
- **Riesgo:** confundir ambos flujos, duplicar mensualidades o suspender por un estado ambiguo.

## OI-018 — Extracción productiva de cartas

- **Estado:** abierto; el flujo y la revisión humana están implementados, la extracción es
  simulada.
- **Pendiente:** evaluar OCR/parser para PDF, imagen y link con cartas reales chilenas,
  incluyendo miles, símbolos `$`, variantes, precios por tamaño, categorías y fotos.
- **Criterio:** jamás publicar sin confirmación humana individual de nombre y precio, aunque
  la extracción anuncie alta confianza.
- **Riesgo:** precio mal leído, categorías mezcladas o contenido remoto cambiante.

## OI-019 — RPCs `SECURITY DEFINER` expuestas de forma intencional

- **Estado:** revisado nuevamente en Sprint 10; revisión final antes de producción con dinero
  real.
- **Advisor:** Supabase conserva seis warnings
  [`0028`](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  y
  [`0029`](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- **Qué significa el warning:** estas funciones ejecutan una operación con privilegios del
  dueño de la función, no con todos los privilegios del usuario que la llama. Eso permite una
  transacción controlada, pero obliga a validar identidad y permisos dentro de cada función.
- **Qué se corrigió en Sprint 9:** las ocho operaciones privilegiadas nuevas de crédito se
  movieron a `private` detrás de fachadas `SECURITY INVOKER`. No agregaron advertencias.

### Las seis advertencias, en lenguaje simple

1. **`diner_ordering_availability` para anónimos:** el comensal sin cuenta necesita preguntar
   si la mesa puede recibir pedidos. Se dejó porque devuelve sólo sí/no y un texto neutro, sin
   deuda, plan ni datos internos. Riesgo: una modificación futura podría agregar información
   sensible a una ruta pública.
2. **La misma función para usuarios autenticados:** Supabase cuenta otro warning porque un
   usuario con sesión también puede llamarla. Se conserva para que el comportamiento no cambie
   según la presencia de sesión. El riesgo de ampliar su respuesta es el mismo.
3. **`propose_tenant_plan_change`:** un dueño necesita recalcular su plan a partir del tamaño
   real y guardar la propuesta atómicamente. La función exige tenant y permiso de dueño.
   Riesgo: un error futuro en esa comprobación podría permitir proponer un cambio ajeno.
4. **`start_tenant_impersonation`:** soporte necesita abrir una sesión temporal y auditada
   dentro del tenant elegido. Comprueba membresía superadmin y motivo. Riesgo: es la operación
   más sensible; una validación debilitada permitiría acceso de soporte no autorizado.
5. **`superadmin_set_subscription_status`:** plataforma debe cambiar estado y escribir su
   historial en una sola transacción. Exige superadmin y motivo. Riesgo: un fallo podría
   restringir o suspender al tenant equivocado.
6. **`superadmin_tenant_overview`:** el superadmin necesita una vista multi-tenant que RLS
   normal impediría construir. Sólo devuelve el resumen de plataforma tras validar membresía.
   Riesgo: una columna nueva podría exponer más información de la necesaria.

- **Protecciones comunes:** `search_path` vacío, grants mínimos, validación interna, motivos y
  auditoría en acciones sensibles. Los grants accidentales a `public/anon` están revocados.
- **Evidencia Sprint 10:** Security Advisors volvió a reportar exactamente estas seis
  advertencias y ninguna nueva. La explicación completa para una persona no técnica está en
  `docs/OI-019-SECURITY-EXPLAINED.md`.
- **Pendiente:** revisión de seguridad para decidir si las implementaciones se mueven a
  `private` detrás de wrappers `SECURITY INVOKER` sin romper el acceso neutro ni la atomicidad.
- **Riesgo:** una futura modificación podría ampliar el resultado o debilitar una validación
  interna sin que el grant cambie.

## OI-020 — Pico de escaneos y validación en hosting

- **Estado:** bloqueante de validación antes del piloto, no de la demo.
- **Evidencia Sprint 10:** 240 aperturas simultáneas de la entrada PWA en el servidor local
  dieron p50 2.383 s, p95 4.318 s y p99 4.322 s. La navegación móvil productiva, con CPU 4×
  más lenta y red limitada a 1,6 Mbps/150 ms, dio p95 2.055 s en tres cargas frías.
- **Pendiente:** repetir en el despliegue candidato, desde teléfonos y redes del local, con
  caché fría y QR reales. El umbral inicial de aceptación es p95 ≤ 5 s para quedar utilizable.
- **Riesgo:** el flujo financiero soporta la ráfaga, pero una apertura masiva puede sentirse
  lenta o sobrecargar una instancia fría antes de que el usuario llegue a la carta.

## OI-021 — Premio gratuito en boleta, impuestos y conciliación

- **Estado:** bloqueante legal antes del piloto.
- **Implementado:** premio server-side como ítem inmutable a `$0`, referencia y costo opcional
  separados, stock, KDS, ledger, reembolso y cierre.
- **Pendiente:** asesor tributario chileno y proveedor DTE deben confirmar representación,
  base imponible, descuento/bonificación, nota de crédito y tratamiento según medio de pago.
- **Riesgo:** que la línea técnicamente trazable no sea la representación tributaria correcta.
- **Regla:** sin costo informado sólo se muestra precio de lista; nunca se inventa margen.

## OI-022 — Recuperación real, privacidad y entrega de códigos

- **Estado:** bloqueante antes del piloto.
- **Implementado con simulador:** consentimiento separado, contacto privado, código de un uso,
  recuperación autónoma, rechazo de perfil compartido, anonimización, asistencia auditada y
  métrica de pérdida de identidad.
- **Pendiente:** proveedor SMS/correo real, límites por IP/contacto/dispositivo, reputación,
  observabilidad de entrega, recuperación tras timeout y revisión legal chilena de textos,
  retención, acceso, supresión e inicio de vigencia de la Ley 21.719.
- **Riesgo:** códigos no entregados o abusables convierten la continuidad en una promesa falsa.

## OI-023 — Tablas privadas sin políticas RLS por diseño

- **Estado:** aceptado; revisar antes de producción con dinero real.
- **Advisor:** tres avisos informativos `0008` para contactos, credenciales y desafíos.
- **Motivo:** están en `private`, tienen RLS forzado, cero grants API y deliberadamente cero
  policies. Sólo funciones internas con `SECURITY DEFINER`, `search_path` vacío y entradas
  acotadas pueden operar. Agregar una policy a `authenticated` ampliaría la superficie.
- **Condición de cambio:** si alguna tabla se expone por API o una ruta necesita acceso
  directo, se debe rediseñar; no se agrega una policy permisiva como atajo.
- **Referencia:** [advisor RLS sin policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## OI-024 — Tratamiento tributario de promociones e invitaciones

- **Estado:** bloqueante tributario antes del piloto con dinero real.
- **Implementado con simulador:** precio y descuento congelados, líneas DTE identificables,
  invitación pagada sin producción previa, reembolso parcial y obligación de nota de crédito.
- **Pendiente:** asesor tributario chileno y proveedor DTE deben validar 2x1, descuento
  porcentual, precio especial, producto invitado, vencimiento/cancelación y representación de
  la nota de crédito.
- **Riesgo:** que la conciliación sea correcta pero el documento use una representación fiscal
  no aceptada.

## OI-025 — Saldo prepagado: tributación, consumo y protección al cliente

- **Estado:** bloqueante antes de habilitar saldo con dinero real.
- **Implementado con simulador:** ledger append-only, dinero/bono separados, tope individual
  de $40.000 por defecto, tope total opcional, FEFO, pago mixto, comprobante, devoluciones,
  expiración auditada, wind-down y pasivo visible para dueño/superadmin.
- **Pendiente tributario:** confirmar cuándo se emite DTE en recarga y consumo, cuándo se
  reconoce ingreso, cómo se representa el bono y cómo se concilian devolución/nota de crédito.
- **Pendiente legal/consumo:** confirmar si el dinero cargado puede caducar, plazo y forma del
  aviso, derecho a devolución, textos de consentimiento, tratamiento del saldo al anonimizar,
  y obligaciones si el bar cierra o se suspende.
- **Pendiente operativo:** pasarela real para recargas, comunicación real de vencimientos y
  protocolo contractual/financiero de wind-down del comercio.
- **Riesgo:** el comercio custodia fondos de clientes. Aunque Tablio no los reciba, un cierre
  con pasivo perjudica al cliente y reputacionalmente también a Tablio.
- **Regla hasta cerrar:** función apagada por defecto y `production_validated = false`.

## OI-026 — Matriz semántica para modo oscuro

- **Estado:** no bloquea el panel Dueño; requiere decisión antes de migrar KDS o garzón.
- **Evidencia:** el brand book permite fondos claros o negro puro, pero no define valores
  oscuros para `card`, `muted`, `accent`, bordes, estados ni superficies elevadas.
- **Pendiente:** aprobar una matriz semántica oscura derivada de la misma paleta, con contraste
  medido y sin introducir grises o naranjas nuevos.
- **Riesgo:** resolver cada pantalla por separado recrearía la deriva de colores que este
  incremento corrige.
- **Regla hasta cerrar:** no inventar un tema global. KDS conserva su tratamiento actual y
  queda fuera del shell hasta su migración aprobada.

## OI-027 — Historial local y remoto de migraciones no coincide

- **Estado:** bloqueante técnico antes de la próxima migración de esquema; no bloquea este
  checkpoint visual ni cambia el esquema efectivo aplicado.
- **Evidencia:** al preparar Sprint 14, `supabase db push` desde el repositorio canónico quiso
  volver a aplicar migraciones de Sprints 11–13. La base sí las contiene, pero fueron
  publicadas con timestamps distintos y algunos hotfixes remotos no son idénticos a los
  archivos locales.
- **Mitigación usada:** se descargó el historial remoto a un directorio temporal, se comparó y
  se aplicaron exclusivamente `20260731213000`, `20260731213200` y `20260731213300`. No se usó
  `migration repair` a ciegas ni se alteró la historia remota.
- **Pendiente:** reconciliar archivo por archivo Sprints 11–13, conservar el estado efectivo y
  recién entonces alinear el historial canónico con una reparación revisada.
- **Riesgo:** ignorarlo podría duplicar DDL, fallar un despliegue o registrar como aplicada una
  migración cuyo contenido no corresponde.

## Clasificación final de asuntos

| Asunto | Clasificación actual                                                 |
| ------ | -------------------------------------------------------------------- |
| OI-001 | Bloqueante para piloto con pagos y para producción con dinero real   |
| OI-002 | Bloqueante para producción con dinero real                           |
| OI-003 | No bloqueante técnico; bloquea pricing comercial real                |
| OI-004 | Bloqueante para piloto con pagos y para producción                   |
| OI-005 | Bloqueante operativo para piloto que exija impresión física          |
| OI-007 | Cerrado                                                              |
| OI-008 | No bloqueante; observar con tráfico representativo                   |
| OI-009 | Cerrado con simulador; validación externa cubierta por OI-001/OI-013 |
| OI-010 | Bloqueante de validación de infraestructura antes del piloto         |
| OI-011 | Bloqueante operativo antes de un piloto desatendido                  |
| OI-012 | Bloqueante legal antes del piloto                                    |
| OI-013 | Bloqueante para piloto con pagos y producción real                   |
| OI-014 | Bloqueante para producción con dinero real                           |
| OI-015 | Bloqueante legal antes de producción con dinero real                 |
| OI-016 | Bloqueante legal antes de producción con dinero real                 |
| OI-017 | Bloqueante sólo antes de cobrar el SaaS                              |
| OI-018 | No bloqueante; la revisión humana mantiene seguro el onboarding      |
| OI-019 | Bloqueante de revisión de seguridad antes de producción              |
| OI-020 | Bloqueante de validación de rendimiento antes del piloto             |
| OI-021 | Bloqueante tributario antes del piloto                               |
| OI-022 | Bloqueante de identidad real y privacidad antes del piloto           |
| OI-023 | No bloqueante hoy; revisión de seguridad antes de producción         |
| OI-024 | Bloqueante tributario antes del piloto                               |
| OI-025 | Bloqueante legal y tributario antes de usar saldo con dinero real    |
| OI-026 | No bloquea negocio; bloquea migración visual de superficies oscuras  |
| OI-027 | Bloquea la próxima migración de esquema; no este checkpoint visual   |
