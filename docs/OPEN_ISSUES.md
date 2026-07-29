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

- **Estado:** abierto; ADR-005 pendiente.
- **Decidir antes de:** primer pago real en producción.
- **Evidencia requerida:** certificación/autorización, API, idempotencia, notas de crédito,
  recuperación ante fallas, soporte y costo.
- **Riesgo:** doble documento o venta pagada sin respaldo tributario recuperable.

## OI-003 — Cortes de planes por tamaño

- **Estado:** abierto; no bloquea arquitectura.
- **Decidir antes de:** pricing comercial y onboarding cobrable.
- **Datos base:** número de mesas, zonas, estaciones, dispositivos, locales y nivel de soporte.
- **Evidencia requerida:** entrevistas/pilotos, costo de soporte y capacidad real usada.
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

- **Estado:** pendiente.
- **Compromiso:** Control negativo del test de aislamiento (rojo → verde). Requiere ambiente de
  staging aislado. Se ejecutará cuando exista staging, a más tardar antes del piloto.
- **Artefacto listo:** `supabase/tests/negative/tenant_isolation_broken.test.sql`.
- **Seguridad:** nunca se debilita una policy del proyecto actual para obtener esta evidencia.

## OI-008 — Índices sin uso observado

- **Estado:** abierto, informativo; no bloquea Sprint 4.
- **Hallazgo:** después de indexar también todas las claves foráneas del Sprint 5, los
  Performance Advisors sólo marcan `unused_index`. El proyecto no tiene carga real y por eso
  varios índices nuevos todavía registran cero usos.
- **Acción:** conservarlos para evitar scans y bloqueos costosos en deletes/updates de tablas
  referenciadas. Revisar estadísticas con tráfico representativo antes de retirar alguno.
- **Evidencia requerida:** `pg_stat_user_indexes`, planes de consulta y carga de piloto.
- **Referencia:** <https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index>

## OI-009 — Resolución operativa de cobro aprobado tras expirar

- **Estado:** abierto; la detección y alerta están implementadas, la acción de caja no.
- **Decidir antes de:** Sprint de panel de cajero y primer piloto.
- **Implementado:** no se crea pedido; la excepción aparece crítica e inmediata con opciones
  `refund` y `produce_manually`.
- **Pendiente:** permisos finales, UX, motivo obligatorio, confirmación, ejecución del
  reembolso o producción manual, ajuste de inventario y auditoría completa.
- **Riesgo:** resolver fuera de Tablio deja dinero, stock y pedido sin trazabilidad.

## OI-010 — Realtime privado y validación bajo carga

- **Estado:** arquitectura decidida en ADR-003; validación de producción pendiente.
- **Decidir antes de:** piloto con concurrencia real.
- **Implementado:** topics privados y autorización RLS en el esquema, recuperación por consulta
  en arranque/reconexión, reconciliación independiente cada 45 s, heartbeat por estación,
  indicador visible y alerta si la pantalla queda desactualizada.
- **Medido en laboratorio:** 12 confirmaciones con KDS conectado: p50 64 ms, p95 103 ms,
  p99 105 ms. Un caso sin KDS conectado se contó aparte. Objetivo p95 ≤ 2 s cumplido en este
  entorno.
- **Pendiente:** conectar el cliente Supabase autenticado de producción, probar Broadcast
  privado y pérdida de avisos bajo carga/redes representativas del piloto.
- **Criterio:** un aviso nunca contiene autoridad financiera; sólo invalida la lectura y
  PostgreSQL reconstruye el estado.
- **Riesgo:** declarar “en vivo” sin medir teléfonos/redes reales de un bar lleno.

## Pendientes acumulados

- La PWA y sus pruebas existen; CI y despliegue siguen pendientes.
- El control negativo rojo → verde queda diferido a staging aislado, a más tardar antes del
  piloto.
- El objetivo KDS p95 ≤ 2 s está medido y cumplido en laboratorio; falta revalidarlo bajo
  carga y redes reales antes del piloto (OI-010).
- El proyecto Vercel está vinculado, pero su configuración debe verificarse con
  `apps/web` como Root Directory antes del primer despliegue.
- Las decisiones manuales sobre aprobaciones tardías deben cerrarse en el panel del cajero
  antes del piloto (OI-009).
- El canal Broadcast privado y su prueba de carga deben cerrarse antes del piloto (OI-010).

## OI-011 — Consumidor visual de alertas huérfanas

- **Estado:** evento durable implementado; pantalla pendiente de Sprint 6.
- **Implementado:** sin cobertura, las tareas se muestran a todos. Tras 2 minutos por defecto,
  `waiter_admin_alerts` y el outbox `waiter.admin.orphan_task` escalan.
- **Pendiente:** mostrar, reconocer y resolver la alerta en caja/administración.
- **Riesgo:** los garzones quedan protegidos, pero falta la vista central del responsable.
