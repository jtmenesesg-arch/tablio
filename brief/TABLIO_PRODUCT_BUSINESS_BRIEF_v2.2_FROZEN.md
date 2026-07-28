# Tablio — Brief de Producto y Negocio

**`TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN`** · Estado: **🔒 CONGELADO** · Rol: constitución del producto.

> Este documento es la fuente de verdad estratégica. **No se edita en silencio.** Toda decisión congelada solo se reabre con evidencia fuerte de un spike técnico o una entrevista, y queda registrada en el **Decision Record** (sección 22). Las decisiones técnicas viven en **ADRs** independientes (sección 23). Desde aquí: menos brief, más evidencia técnica, modelos, contratos y código.

> Producto completo para bares, nivel producción. **Congelado:** tesis, ICP, modo principal (prepago individual), canal independiente y Modelo A. Lo demás es diseño técnico. **[ABIERTO]** = pendiente. La arquitectura se diseña para el producto final; el *orden* de construcción sigue la criticidad (pago → checkout → KDS → conciliación primero).

---

## 1. Resumen ejecutivo

**Qué es:** Tablio convierte cada mesa de un bar en un punto de venta. Cada persona escanea el QR de su mesa, arma su propio pedido y **paga lo suyo** desde el celular. El bar recibe **únicamente pedidos confirmados y pagados, listos para producir**.

**Unidad atómica:** *persona → carrito → confirmación financiera → pedido → comandas por estación.* Sin cuenta común que dividir, sin fila de caja, sin fuga.

**Tesis:** *"Cada pedido pagado antes de producirse."*

**Sistema:** canal/sistema operativo independiente activable por zona; dueño de pedido → pago → cocina → boleta → conciliación; se cuadra al cierre.

**Beachhead:** bares, cervecerías, pubs, terrazas, food halls de alto flujo (mesa sentada).

---

## 2. El problema

Viernes 23:30, bar lleno: fila para pedir y pagar, garzón de cajero, fuga de mesas, dolor de dividir la cuenta, errores de comanda, cero data hasta el cierre. Dolor **validado**; el riesgo es diferenciación y ejecución bajo presión.

**Por qué ahora:** Apple Pay está disponible en Chile y permite autenticación rápida desde dispositivos compatibles. Su disponibilidad y UX exacta dentro del checkout web/PWA de Tablio **se validará con la pasarela primaria** (hipótesis técnica hasta el spike).

---

## 3. Posicionamiento

**ES:** punto de venta autoservicio por persona para bares de alto flujo, con cada pedido pagado antes de producirse.
**NO ES:** carta digital, menú QR, ni chatbot.

**Mensaje al dueño:**
> "Cada persona pide y paga lo suyo desde la mesa. Tu barra recibe solo pedidos pagados, se acaban las peleas por la cuenta, ninguna mesa se levanta debiendo, y el cierre te explica cada peso."

---

## 4. Mercado y competencia

Incumbentes: **Toteat** (Chile; POS + QR + KDS + boleta SII), **Fudo** (autoatención QR), **OlaClick** (menú QR gratis), **Commande** (llamados/pre-orden). Referentes: **Kicket** (AR, SO integral nightlife) y **Goomer** (BR, dueño de la transacción).

**Foso de Tablio:** especialización total en alto flujo, confiabilidad bajo saturación, UX de pedir/pagar por persona, instalación rápida, **conciliación que explica cada peso**, y datos de mejora demostrables. Pregunta a responder con pilotos: *¿por qué un bar que ya paga Toteat/Fudo se cambia o suma Tablio?* → respuesta cuantificable.

---

## 5. Cliente objetivo (ICP)

Bares, cervecerías, pubs, terrazas, food halls de alto flujo de fin de semana. **NO todavía:** restaurante de mantel, fast food chico. **Expansión futura:** modo restaurante, eventos.

---

## 6. Cómo funciona

### Modo principal — Prepago individual (EL producto)
QR asignado a la mesa. Cada persona escanea, arma **su** carrito y **paga lo suyo** (invitar = meterlo en su carrito). El pedido cae a barra/cocina **solo tras confirmación de pago**. Elimina split, fuga y disputa de cuenta.

### Modo excepción — Crédito de mesa (cuenta abierta, permisado)
Tab autorizado solo para mesas/clientes/eventos habilitados por el local, con permisos y reglas explícitas. Introduce riesgo → **no es co-igual**, es excepción operativa con verificación (panel en vivo + comprobante impreso + código escaneable).

---

## 7. Diferenciadores

1. Pago por persona = anti-fraude estructural + cero pelea por la cuenta.
2. Confiabilidad bajo saturación (no pierde pedidos ni plata).
3. Conciliación exacta hasta el abono ("explicamos cada peso").
4. Pago rápido (Apple Pay; siguientes rondas en segundos con medio guardado).

---

## 8. Roles (todos operativos en v1; orden de construcción por criticidad)

**Identidad de pedido por persona (transversal):** una mesa puede tener 15 pedidos simultáneos, así que cada pedido lleva identificador visible sin registro: alias ("Vaso Azul"), nombre opcional, N° ("Pedido 042"), asiento. KDS/garzón ven `Mesa 8 · José · Pedido 042`; el cliente ve "Tu pedido 042 está listo".

- **8.1 Comensal:** sin app. Ve "Bar X · Mesa 8" antes de pagar. Carta (fotos, alérgenos, stock en vivo) → carrito con notas → paga lo suyo → estado en vivo → acciones → repetir ronda.
- **8.2 Garzón:** PIN, elige zona, cola de tareas (llamados, entregas), traspaso de mesa. Solo lectura de plata.
- **8.3 KDS:** recibe **solo pedidos pagados**, por mesa/persona/estación, con temporizador. Control de 86. Reimpresión auditada.
- **8.4 Cajero/Admin:** panel de mesas por **estado de sesión** (ver sección 8.7), ventas del turno, cierre + arqueo + **conciliación**, gestión de carta/mesas/QRs/personal, reembolsos/anulaciones con trazabilidad.
- **8.5 Dueño/Multi-local:** dashboard consolidado, comparativas, exportables, propinas por trabajador/turno.
- **8.6 Superadmin (Tablio):** tenants, billing, config de pasarela/comisiones por tenant, feature flags, métricas globales, soporte con impersonación auditada.

### 8.7 Estado de la mesa en prepago (no "pagado/debiendo")
En prepago individual la mesa no está globalmente "pagada" ni "abierta". El panel muestra estado de **sesión**:
```
Mesa 8 · Sesión activa · 5 personas
4 pedidos · $48.600 procesados · 1 preparando · 1 listo
Última actividad: hace 2 min · Garzón: Camila
```
Estados: libre, activa, pedidos nuevos, preparando, requiere entrega, requiere atención, inactiva, cerrada.
**Solo en crédito de mesa** aparece: saldo pendiente, exposición financiera, cuenta solicitada, pago parcial, vencida/cierre manual.

---

## 9. Dominios y máquinas de estado (separadas)

**Sesión de mesa:** `ACTIVE → PAUSED → CLOSED → EXPIRED` (contiene pedidos de muchos dispositivos).
**Carrito:** `OPEN → CHECKOUT_STARTED → EXPIRED → CONVERTED_TO_ORDER`.
**Pedido:** `AWAITING_PAYMENT → CONFIRMED → ACCEPTED → IN_PREPARATION → READY → DELIVERED → CANCELLED`.
**Comanda por estación:** `QUEUED → ACKNOWLEDGED → IN_PREPARATION → READY → COMPLETED` (cerveza y comida = dos comandas independientes).

### 9.1 CheckoutQuote (snapshot inmutable) — clave
Antes de iniciar el pago se congela una **fotografía inmutable** de lo que la persona paga: productos, variantes, cantidades, precios, descuentos, impuestos, **propina**, total, tenant, mesa, persona/dispositivo, disponibilidad y expiración.
```
Cart → CheckoutQuote → PaymentIntent → confirmación server-side → Order CONFIRMED → comandas
```
Un cambio de precio en el admin no afecta un checkout en curso; la conciliación compara la transacción contra **el snapshot que originó el pago**, no contra el menú actual.

### 9.2 Dominio de pago (event-sourced, no máquina lineal)
Entidades separadas: `Payment`, `PaymentAttempt`, `ProviderPaymentEvent` (**inmutable**), `Refund`, `Chargeback`, `Settlement`, `ProviderFee`, `ReconciliationException`. El estado actual del pago se **deriva del historial** de eventos. Soporta múltiples reembolsos parciales, contracargo tras reembolso, y la diferencia entre autorización/venta/abono/liquidación.

### 9.3 Regla de oro (agnóstica de pasarela)
> `CONFIRMED` solo se establece tras una **confirmación server-side verificable** de la pasarela — recibida por webhook firmado, API de confirmación/commit o consulta de estado según el proveedor. **El frontend nunca es fuente de verdad.**

---

## 10. Arquitectura técnica

### 10.1 Stack
PWA del cliente (sin instalar, branding definido). Paneles en tiempo real (websockets **tenant-aware**). Backend: API + BD + capa de confirmación de pago + realtime. Impresora térmica con spool durable.

### 10.2 Multi-tenant — **PostgreSQL compartido + `tenant_id` + Row Level Security**
Contexto tenant por request; RLS en tablas sensibles; claves únicas compuestas con `tenant_id`; storage segmentado; canales realtime, jobs y colas tenant-aware; pruebas automáticas de aislamiento; auditoría de acceso del superadmin.
```
UNIQUE (tenant_id, table_number)
UNIQUE (tenant_id, product_sku)
UNIQUE (tenant_id, employee_pin_hash)
```
Se deja una capa que permita migrar tenants grandes a infraestructura dedicada a futuro (evitando el costo de BD/esquema por tenant hoy: migraciones, conexiones, reporting global, rollout).

### 10.3 RBAC + acciones sensibles
Acciones con permiso + auditoría obligatoria (quién/cuándo/por qué): reembolso, anulación, cambio de precio, cierre manual, reapertura, impersonación.

### 10.4 Seguridad del QR + presencia física
QR con id **no predecible**, firmado/verificable, versionado, activable/revocable, regenerable ante robo, con "Bar X · Mesa 8" visible. Un QR firmado **no prueba presencia** (se puede fotografiar y compartir), así que controles **configurables por local**: activación de sesión por el garzón, **código de 4 dígitos visible en la mesa** ("ingresa 4826"), renovación diaria, límites de frecuencia, detección de anomalías, e **invalidar sesión sin reimprimir el QR**. Flujo normal: QR permanente abre la mesa + código de sesión corto demuestra presencia (opcional según riesgo).

---

## 11. Pagos

### 11.1 Modelo A — **CONFIRMADO**
**Cada bar es comercio directo y recibe sus propios fondos. Tablio no custodia ni distribuye dinero; es el orquestador tecnológico** (conecta credenciales, crea transacciones, procesa confirmaciones, concilia, cobra su SaaS aparte). Onboarding por local:
1. El bar crea/conecta su cuenta de comercio.
2. Entrega credenciales de integración de forma segura.
3. Tablio verifica ambiente y código de comercio.
4. Venta controlada de prueba.
5. Reembolso de prueba.
6. Comparación contra reporte/liquidación.
7. Habilitación de producción.

### 11.2 Confirmación server-side (no acoplar a un mecanismo)
Verificación por webhook firmado, API de confirmación o consulta de estado según proveedor. Con **idempotencia**: clave por intento, `provider_transaction_id` único, constraint único en BD, procesamiento transaccional, transactional outbox, consumidores idempotentes.
```
UNIQUE (payment_provider, merchant_account_id, provider_transaction_id)
```

### 11.3 Medios
Apple Pay + tarjeta + Redcompra débito + wallets. Candidatos: **Webpay/Transbank** y/o **Mercado Pago**; **Fintoc** transferencia. **[ABIERTO]** primaria (definir en spike).
**Oneclick (medio guardado):** requiere **inscripción explícita** del tarjetahabiente en el comercio (modalidad Mall). La relación token ↔ tenant ↔ código de comercio se valida en **prototipo real** antes de diseñar experiencia entre locales. Promesa: "siguientes rondas en segundos", no "un toque garantizado".

---

## 12. Conciliación (dominio central, hasta el abono)

Tres comparaciones: **Pedidos Tablio ↔ Transacciones pasarela ↔ Documentos tributarios.**
Excepciones: pago aprobado sin pedido; pedido confirmado dos veces; boleta fallida tras pago; reembolso no reflejado en pasarela; monto que no calza; confirmación tardía tras el cierre.
La conciliación llega hasta la **liquidación**, no se queda en "aprobado":
```
Venta bruta − reembolsos − contracargos − comisión del proveedor = abono esperado
```
Ventaja comercial: *"el cierre de Tablio explica cada peso procesado."*

---

## 13. Boleta electrónica SII

Vía **proveedor DTE autorizado** (Tablio orquesta, no construye motor tributario). Config tributaria explícita por tenant:
```
tax_document_mode: ELECTRONIC_PAYMENT_VOUCHER | DTE_FOR_ALL_SALES | HYBRID_BY_PAYMENT_METHOD
```
Registrar por venta: documento esperado, documento emitido, folio, monto, estado, representación/URL, error de emisión, reintentos, relación con reembolso/anulación.
**Regla central:** una venta genera **exactamente** el respaldo tributario que corresponda, **nunca dos documentos** por el mismo hecho. Considerar la entrega digital obligatoria vigente desde el 1 de marzo de 2026 para comercios sin impresión.
**Validar con proveedor DTE y asesor tributario antes del piloto** (no es consejo tributario definitivo).

---

## 14. Propinas (dominio propio)

Para bares en Chile no es secundario: afecta checkout, monto de transacción, conciliación, cierre, remuneraciones y reportes.
- Sugerencia configurable conforme a la normativa aplicable (aceptar / modificar / rechazar de forma clara).
- Monto **separado** del subtotal e impuestos.
- Distribución fuera del control de Tablio o según reglas informadas por el local.
- Conciliación independiente; devoluciones proporcionales configurables.
- Reporte de propinas por trabajador, turno y medio.
- **Tablio no descuenta su fee sobre la propina.**
- Varía con autoservicio puro vs. atención de garzón → configurable por modelo de atención. Validar con asesor.

---

## 15. Robustez: el "viernes 23:30" (durable, no en memoria)

Nada de colas en memoria. Pedido confirmado → **cola durable + transactional outbox + registro permanente de eventos + reintentos con backoff + dead-letter queue**. Impresión con **spool persistente** y reimpresión auditada. **No existe modo offline que produzca un pedido cuyo pago no se pudo verificar.**

| Falla | Comportamiento |
|---|---|
| Cliente sin internet | No completa checkout; no se crea pedido pagado |
| Pasarela caída | Pago pendiente/falla; nada se produce |
| Internet del local caído | Clientes pagan con su red móvil; órdenes esperan entrega durable al KDS |
| KDS desconectado | Orden confirmada, pendiente de consumo; se entrega al reconectar |
| Impresora caída | KDS continúa; impresión pendiente en spool |
| Confirmación tardía | Se procesa o va a revisión según vigencia y cierre |

---

## 16. Pricing (propuesta, [ABIERTO])

- **Piloto:** setup reducido/bonificado + precio fijo, a cambio de métricas y feedback.
- **Plan inicial:** ~CLP 79.000–129.000/local (estaciones/dispositivos definidos, soporte estándar, conciliación).
- **Plan alto flujo:** ~CLP 149.000–249.000 (multi-zona, soporte prioritario, reportes avanzados, SLA).
- **Setup:** CLP 150.000–300.000, variable por productos/fotos/mesas/impresoras/capacitación/config tributaria.
- **Fee por transacción:** no el día 1; activar al demostrar valor. Comisión de pasarela (~1,5–3%) es del comercio, con transparencia. **Sin fee sobre propinas.**

---

## 17. Alcance v1 (completo; orden por criticidad)

**Dentro de v1:** prepago individual + crédito de mesa; 6 roles operativos; multi-tenant (PG + RLS) con acciones sensibles auditadas y billing; CheckoutQuote + dominio de pago event-sourced; confirmación server-side (Modelo A, idempotencia, conciliación hasta abono); propinas; boleta SII vía DTE; KDS, caja por estado de sesión, verificación, identidad de pedido por persona, seguridad de QR + presencia, robustez durable.

**Orden:** (1) prepago individual completo, robusto y conciliable; (2) caja/conciliación y KDS endurecidos; (3) crédito de mesa y verificación; (4) dueño multi-local, billing self-service, superadmin elaborado.

**Expansiones futuras:** eventos; integraciones con POS de terceros; modo restaurante; CRM/fidelización.

---

## 18. Criterios de lanzamiento (cuantificables)

**Integridad financiera:** 100% de pagos aprobados asociados a un `CheckoutQuote`; **cero efectos comerciales duplicados** (pedidos, comandas, boletas, reembolsos) ante mensajes repetidos; 100% de las diferencias detectadas como excepción de conciliación; ningún pedido producido sin confirmación server-side; cada reembolso vinculado a una transacción y acción auditada.

**Entrega operacional:** tiempo `confirmación → KDS` medido en p50/p95/p99; recuperación automática de todas las órdenes tras desconexión; ninguna pérdida tras reinicio de servidor/KDS/agente de impresión; reproducción completa del historial de una orden.

**Carga (calculada, no arbitraria):**
```
Capacidad objetivo = asientos máx × pedidos máx por persona/hora × factor ráfaga × margen
```
Simular escaneos, checkouts, confirmaciones, comandas, updates websocket, KDS reconectando, impresiones.

**Operación:** agotamiento concurrente resuelto; reembolso parcial probado; boleta fallida recuperable; QR revocado deja de aceptar sesiones; acciones del comensal deduplicadas; cierre de turno con pagos tardíos probado.

---

## 19. Validación en paralelo

Hablar con **8–10 dueños de bares**: qué usan hoy; si fila/fuga/falta de garzón está en su top-3; si pagarían setup + mensualidad. En pilotos, medir antes/después (ticket, rondas, espera).

---

## 20. Estado de decisiones

**Congeladas:** tesis · ICP · modo principal (prepago individual) · canal independiente · **Modelo A** · multi-tenant (PG + `tenant_id` + RLS).

**[ABIERTO] — no todas bloquean lo mismo:**
1. **Pasarela primaria** (Webpay vs. Mercado Pago) — **bloquea el diseño real del pago; se resuelve primero, vía spike.**
2. **Oneclick** (medio guardado) — se investiga dentro del spike; **no debe bloquear el checkout inicial con tarjeta.**
3. **Proveedor DTE** — cerrar **antes del primer pago real en producción**, no antes de modelar el núcleo.
4. **Pricing** — validación **comercial**; no bloquea arquitectura.
5. **Primer piloto** — bloquea la **validación**, no el mapa de dominios.

---

## 21. Próximos pasos (en este orden)

1. **Spike técnico comparativo Webpay vs Mercado Pago** — probar el flujo real, no solo comisiones: onboarding por bar, confirmación server-side, Apple Pay en web/PWA, Oneclick y pertenencia del token, reembolsos, mecanismo de notificación, reportes de conciliación, liquidaciones, ambientes de prueba, comportamiento ante demoras.
2. **Mapa de dominios + modelo de datos** (multi-tenant, CheckoutQuote, dominio de pago, comandas).
3. **Adaptadores de pasarela + contratos de eventos.**
4. **Máquinas de estado ejecutables.**
5. **Plan de implementación por criticidad.**

---

## 22. Control de cambios — Decision Record

Cualquier cambio a una decisión congelada se registra aquí. No se edita la tesis en silencio.

```
Decision Record
- Fecha:
- Decisión afectada:
- Evidencia nueva (spike / entrevista / dato):
- Razón del cambio:
- Impacto técnico:
- Aprobación:
```

*(Sin entradas al momento del congelamiento.)*

---

## 23. ADRs (Architecture Decision Records)

Las decisiones técnicas viven en ADRs independientes, no en el cuerpo del brief.

| ADR | Decisión | Estado |
|---|---|---|
| **ADR-001** | Pasarela primaria (Webpay vs. Mercado Pago) | ⏳ **Pendiente** — output del spike |
| **ADR-002** | Modelo de confirmación de pagos (server-side verificable, agnóstico de mecanismo) | ✅ **Decidido** |
| **ADR-003** | Estrategia de idempotencia (clave por intento + `provider_transaction_id` único + outbox + consumidores idempotentes) | ✅ **Decidido** |
| **ADR-004** | Modelo multi-tenant y RLS (PostgreSQL compartido + `tenant_id` + Row Level Security) | ✅ **Decidido** |
| **ADR-005** | Proveedor DTE | ⏳ **Pendiente** — antes del primer pago en producción |
| **ADR-006** | Cola durable y transactional outbox (sin memoria) | ✅ **Decidido** |

Formato de cada ADR: contexto · decisión · alternativas consideradas · consecuencias · estado · fecha.

---

*Fin del brief v2.2 — CONGELADO. Documento maestro y constitución del producto. Lo pendiente es spike + diseño técnico + código, no más revisión del brief.*
