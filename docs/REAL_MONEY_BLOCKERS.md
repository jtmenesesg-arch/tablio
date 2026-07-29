# Bloqueantes para operar con dinero real

El producto actual demuestra el flujo completo con simuladores. No debe cobrar ventas reales
ni presentarse como sistema tributario productivo hasta cerrar y evidenciar todos estos puntos.

1. **Pasarela del bar:** elegir proveedor, crear cuenta de desarrollador de Tablio y validar
   comercio directo por bar, OAuth/onboarding, firma, estado server-side, Apple Pay, medio
   guardado y reembolsos.
2. **Conciliación bancaria:** demostrar por API venta bruta, comisión, reembolso, neto y abono
   real con referencias estables. Sin esto no se puede prometer que el cierre explica cada peso.
3. **Proveedor DTE:** contratar uno autorizado, validar boleta, estado tardío, folio, TED,
   representación, correo, reintentos, idempotencia y nota de crédito.
4. **Revisión tributaria chilena:** aprobar matriz voucher/boleta según medio de pago, secuencia
   de reembolso/nota de crédito y entrega digital vigente.
5. **Revisión laboral chilena:** aprobar el tratamiento de propina devuelta después de cerrar
   y distribuir un turno.
6. **Impresión física:** decidir y probar agente local, servicio o impresora cloud; validar
   ESC/POS, corte de Internet, reinicio, papel, ACK, DLQ y soporte.
7. **Realtime de producción:** conectar cliente Supabase autenticado a topics privados y
   repetir carga/caos en hosting, redes y tablets del piloto.
8. **Alertas operativas:** terminar la vista de administración para tareas huérfanas y
   comprobar responsables/escalamiento durante un servicio.
9. **Seguridad:** revisión independiente de las seis funciones OI-019, secretos, permisos,
   logs, dependencias y configuración Vercel/Supabase. Cualquier cambio en sus respuestas o
   validaciones exige corregir antes.
10. **Despliegue y observabilidad:** verificar Root Directory `apps/web`, dominios/TLS,
    backups/restauración, alertas, retención, runbooks, responsables y rollback de versión.
11. **Cobro del SaaS:** antes de cobrar al bar, elegir proveedor separado, validar
    mensualidad/setup, impuestos, reintentos y conciliación. Nunca reutilizar la cuenta que
    recibe pagos de comensales.

Los planes/precios, OCR de carta e índices sin uso no impiden un piloto demo, pero requieren
validación antes de escalar o cobrar el SaaS.
