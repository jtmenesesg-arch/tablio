# Glosario

- **ADR:** documento que registra una decisión técnica, sus alternativas y consecuencias.
- **API:** puerta controlada por la que dos sistemas intercambian datos o acciones.
- **Alias de comensal:** nombre generado y legible, como “Zorro Azul”, que identifica una
  persona sin registro y evita palabras que suenan a productos de la carta.
- **Backoff:** espera que aumenta entre reintentos para no insistir de forma destructiva.
- **BFF:** backend adaptado a las necesidades de una interfaz concreta.
- **CheckoutQuote:** fotografía inmutable de todo lo que una persona va a pagar.
- **Chargeback:** desconocimiento o disputa que revierte un cargo después de la venta.
- **Cierre inmutable:** fotografía financiera del turno que no se edita después de ejecutada;
  hechos tardíos aparecen como ajustes nuevos y auditados.
- **CI:** verificación automática que corre en cada cambio antes de aceptarlo.
- **Comanda:** instrucción de producción enviada a una estación, como barra o cocina.
- **Constraint:** regla de PostgreSQL que impide guardar datos inválidos o duplicados.
- **Custom Access Token Hook:** función que agrega claims controlados al JWT antes de que
  Supabase Auth lo emita.
- **Dead-letter queue (DLQ):** cola separada para mensajes que no pudieron procesarse después de los reintentos.
- **Edge Function:** función server-side de Supabase usada para trabajo breve cerca de los datos.
- **Full jitter:** variación aleatoria del tiempo de backoff para evitar reintentos simultáneos.
- **Fail-closed:** si falta identidad o contexto válido, se niega acceso en vez de abrirlo por
  defecto.
- **Idempotencia:** propiedad que permite repetir un mensaje sin repetir su efecto comercial.
- **Inventory reservation:** unidades apartadas por un quote; en Tablio usa exactamente el
  mismo vencimiento del quote y sólo aplica a productos con seguimiento de stock.
- **Heartbeat:** señal periódica de vida de una pantalla; permite distinguir un KDS activo de
  uno aparentemente conectado pero congelado.
- **Inanición de tareas:** trabajo de menor prioridad que nunca sube porque llega trabajo
  prioritario sin pausa. Tablio la corta con un techo absoluto configurable.
- **KDS:** pantalla de producción que organiza comandas para barra o cocina.
- **Latencia KDS:** tiempo entre confirmación durable del pago y primera visibilidad de la
  comanda. Los percentiles sólo incluyen estaciones con algún KDS conectado al confirmar; las
  estaciones ausentes se cuentan aparte.
- **Monorepo:** un repositorio que contiene aplicaciones y paquetes relacionados.
- **Outbox transaccional:** tabla donde el evento se guarda en la misma transacción que el cambio de negocio.
- **ProcessedEvent:** registro de lease y finalización que impide a un consumidor ejecutar dos
  veces el mismo mensaje.
- **ProviderPaymentEvent:** evidencia inmutable recibida de una pasarela, válida o inválida.
- **ReconciliationException:** diferencia financiera idempotente que exige investigación o
  decisión operativa.
- **Settlement:** reporte de liquidación que compara venta bruta, reembolsos, contracargos,
  comisión del proveedor, neto y abono real.
- **Ajuste post-cierre de propina:** costo que asume el local cuando devuelve al cliente una
  propina que ya fue distribuida; no reduce retroactivamente lo recibido por el trabajador.
- **Atribución de turno:** vínculo entre un pago y el intervalo de caja que contiene la hora
  de aprobación del proveedor. Conserva también la hora de recepción para auditar desfases.
- **PaymentGateway:** puerto neutral por el que el núcleo financiero opera con la pasarela
  propia de cada bar, sin conocer SDKs ni formatos del proveedor.
- **p95:** valor bajo el cual queda el 95% de las mediciones observadas.
- **PWA:** sitio web con comportamiento similar a una app, sin exigir instalación.
- **Código de presencia:** número de 4 dígitos impreso/mostrado en la mesa que demuestra
  cercanía física antes de abrir una sesión de dispositivo.
- **Sesión de dispositivo:** identidad anónima y recuperable de un teléfono dentro de una
  sesión de mesa; tiene carrito, alias y vencimientos propios.
- **Sesión de empleado:** turno autenticado ligado a `auth.uid()`, tenant, venue, vencimientos
  y zonas.
- **Grupo operativo de mesas:** unión visual de sesiones activas que no crea cuenta compartida
  ni modifica pagos, pedidos o comandas.
- **Tarea huérfana:** tarea de una zona sin ningún garzón activo; se muestra a todos y escala a
  administración.
- **Broadcast privado:** canal Realtime autorizado por topic. Sólo avisa que algo cambió; el
  cliente vuelve a consultar PostgreSQL.
- **Realtime:** canal de aviso inmediato; no reemplaza a PostgreSQL como fuente de verdad.
- **RLS:** políticas de PostgreSQL que deciden qué filas puede leer o modificar cada identidad.
- **RPC:** función de PostgreSQL invocada como una operación remota y transaccional.
- **`service_role`:** credencial privilegiada de Supabase que ignora RLS; solo puede vivir en
  infraestructura controlada y nunca en una ruta que sirve datos de usuario.
- **SLO:** objetivo medible de confiabilidad o velocidad que el sistema se compromete a vigilar.
- **Spool de impresión:** cola persistente de trabajos pendientes para una impresora.
- **Sondeo de respaldo:** consulta periódica y barata a PostgreSQL que repara avisos Realtime
  perdidos; no reemplaza el camino inmediato.
- **Tenant:** local o cliente cuyos datos deben quedar aislados de los demás.
- **Modo demo:** adaptador y pantalla que ejercitan el protocolo sin credenciales, tarjetas ni
  movimiento de dinero real; nunca es una configuración válida de producción.
- **Transactional outbox:** nombre en inglés de outbox transaccional.
- **Visibility timeout:** período durante el que un mensaje leído queda oculto a otros consumidores.
- **Webhook:** aviso server-side enviado por un proveedor a una URL controlada por Tablio.
- **Worker:** proceso que consume trabajo durable fuera del flujo inmediato del usuario.

## Términos de Sprint 8

- **Billing SaaS:** cobro de setup/mensualidad del bar a Tablio; está completamente separado
  de las ventas que el comensal paga al bar.
- **Dunning / gestión de morosidad:** secuencia configurable de aviso, reintentos, gracia,
  restricción administrativa y eventual suspensión agendada.
- **Restricción administrativa:** estado que bloquea cambios/reportes no operativos, pero
  mantiene pedidos, KDS, garzones y caja funcionando.
- **Suspensión programada:** corte futuro de pedidos nuevos, con aviso escrito y horario de
  bajo tráfico; nunca es la reacción inmediata a un cobro fallido.
- **`SaasBillingProvider`:** puerto neutral exclusivo para que Tablio cobre su setup y
  mensualidad; no usa la pasarela comercial del bar.
- **Revisión humana de carta:** confirmación obligatoria de nombres y precios extraídos antes
  de publicar. El sistema no confía automáticamente en OCR o documentos externos.
- **Impersonación:** acceso temporal de soporte a un tenant, permitido sólo a superadmin y con
  motivo, inicio, fin y acciones auditadas.
- **Límite generoso de layout:** cantidad de zonas/estaciones que no altera el plan por sí
  sola. Sólo exceder ambas dimensiones eleva un nivel sobre el determinado por mesas.

## Términos de Sprint 7

- **DTE:** Documento Tributario Electrónico emitido por un proveedor autorizado e informado
  al SII.
- **Boleta electrónica:** DTE que respalda una venta al consumidor final.
- **Nota de crédito:** documento que corrige o anula total/parcialmente un DTE anterior.
- **Voucher electrónico:** comprobante del pago electrónico que, bajo condiciones definidas
  por el SII, puede reemplazar la boleta.
- **Timbre/TED:** datos electrónicos que identifican y permiten verificar un DTE.
- **Proveedor DTE:** servicio externo que emite, consulta y representa documentos tributarios;
  Tablio sólo lo orquesta.
- **Obligación tributaria pendiente:** documento que aún debe emitirse aunque la venta o el
  reembolso monetario ya hayan ocurrido.
- **Salud del proveedor:** indicador funcionando/degradado/caído calculado desde fallos
  recientes, no una promesa contractual del proveedor.
- **Supabase Vault:** almacén cifrado donde se guardarán credenciales; las tablas de negocio
  conservan sólo la referencia al secreto.
