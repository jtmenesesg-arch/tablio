# ADR-006 — Orquestación de boleta electrónica

- **Estado:** Aceptado para simulación; proveedor y matriz tributaria pendientes
- **Fecha:** 2026-07-29
- **Alcance:** Sprint 7

## Contexto

Tablio debe respaldar tributariamente cada venta chilena, pero no será un motor tributario.
Un proveedor DTE autorizado emitirá boletas y notas de crédito. Todavía no existe contrato ni
credenciales reales, por lo que toda capacidad de proveedor descrita abajo es **hipótesis no
verificada**.

El SII indica oficialmente que el comprobante de pago electrónico puede tener validez como
boleta; una transferencia se trata como efectivo y requiere boleta electrónica. También
indica que duplicar voucher y boleta debe corregirse con nota de crédito, y que una boleta se
anula mediante nota de crédito. La aplicación concreta por medio de pago debe validarla un
asesor tributario antes del piloto.

## Decisión

La aplicación depende sólo del puerto `TaxDocumentProvider`. El proveedor recibe una clave de
idempotencia estable y puede emitir boleta, consultar estado/representación, emitir nota de
crédito y reintentar. El paquete `tax-simulated` implementa éxito, falla, demora, respuesta
repetida y nota de crédito.

La emisión sigue este camino:

```text
pedido confirmado + comandas + outbox (una transacción)
  → Supabase Queue
  → consumidor idempotente
  → TaxDocumentProvider
  → resultado/folio/URL o excepción visible en caja
```

Nunca bloquea la confirmación ni la aparición en KDS. La restricción única por venta,
reembolso y clave de idempotencia protege contra entregas repetidas. Las credenciales reales
vivirán cifradas en Supabase Vault; las tablas guardan sólo `vault_secret_id`. Sólo
`service_role` para jobs/consumidores accede a esa referencia. Ninguna ruta de usuario usa
`service_role`.

La implementación usa una cola PGMQ `tax_documents` y su DLQ dedicada. La Edge Function
`tax-document-consumer` está desplegada con JWT obligatorio. `pg_cron` la ejecuta cada minuto
por `pg_net`; además del JWT público exige un secreto aleatorio cifrado en Vault, validado por
un RPC que sólo puede usar `service_role`. Mensajes repetidos se reclaman mediante
`ProcessedEvent`.

## Matriz propuesta — hipótesis sin verificar

| Modo del tenant              | Tarjeta/wallet         | Efectivo/transferencia | Medio desconocido |
| ---------------------------- | ---------------------- | ---------------------- | ----------------- |
| `ELECTRONIC_PAYMENT_VOUCHER` | Voucher del adquirente | Boleta DTE             | Revisión manual   |
| `DTE_FOR_ALL_SALES`          | Boleta DTE             | Boleta DTE             | Boleta DTE        |
| `HYBRID_BY_PAYMENT_METHOD`   | Voucher del adquirente | Boleta DTE             | Revisión manual   |

El modo se congela por venta. Un medio desconocido falla cerrado hacia revisión: no emite a
ciegas y evita duplicar voucher más boleta.

## Reembolso y nota de crédito

La devolución del dinero y la obligación tributaria son caminos durables **separados**. Una
caída DTE no retiene dinero del cliente. Si la boleta original aún no existe, el reembolso
puede completarse y la nota de crédito queda `waiting_for_original`, vinculada y crítica en
caja. La secuencia tributaria debe revisarla un asesor: la tensión explícita es que tampoco es
aceptable postergar indefinidamente la devolución por indisponibilidad del proveedor DTE.

## Escalamiento operativo

Por defecto caja alerta si hay más de 10 documentos pendientes o alguno supera 15 minutos;
ambos valores son configurables por tenant. La salud usa los últimos 5 minutos y un mínimo de
3 intentos: menos de 20% de fallos funciona, desde 20% está degradado y desde 60% está caído.
Ventana, muestra y umbrales son configurables.

## Candidatos investigados

Todo lo siguiente sigue siendo hipótesis hasta contratar y probar:

- **LibreDTE:** documenta tipos 39/41 y nota de crédito 61, emisión en tres pasos,
  representación y API. Puede servir como base técnica, pero cobertura, soporte y operación
  productiva no están verificados.
- **Nubox:** publica portal de desarrolladores y emisión de boletas 39/41 para partners.
  Contrato, límites, idempotencia y notas de crédito no se probaron.
- **Bsale:** ofrece facturación electrónica e integración API. El alta, modelo multi-tenant,
  SLA y capacidades exactas no se probaron.
- **Facturación.cl:** publica integración por archivo/servicio web y referencias de notas.
  Autenticación, reintentos, conciliación y soporte no se probaron.

## Entrega digital

La PWA muestra “emitiendo” sin cuestionar el pago confirmado y luego permite abrir/descargar
la representación. El correo es opcional. La obligación de entrega virtual aplicable desde el
1 de marzo de 2026 se documenta a partir de la Resolución Exenta SII N.º 53 de 2025, pero el
flujo final debe validarse con proveedor y asesor.

## Evidencia consultada

- [SII: validez del voucher como boleta](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7860.htm)
- [SII: boleta electrónica y medios de pago](https://www.sii.cl/destacados/boletas_electronicas/index.html)
- [SII: corrección de duplicidad voucher/boleta](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7865.htm)
- [SII: anulación mediante nota de crédito](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_5352.htm)
- [SII: Resolución Exenta N.º 53 de 2025](https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso53.pdf)
- [LibreDTE: documentos soportados](https://core.libredte.cl/docs/lib/documentos-tributarios)
- [LibreDTE: emisión en tres pasos](https://www.libredte.cl/academy/integracion/emision-dte/emision-en-3-pasos)
- [Nubox Developers](https://developers.nubox.com/)
- [Bsale: facturación electrónica](https://www.bsale.cl/sheet/facturaelectronica)
- [Facturación.cl: integración web service](https://www.facturacion.cl/manualintegracion/integracionservicioweb.php)

## Consecuencias y límites

Cambiar de proveedor exige otro adaptador, no cambiar pagos, pedidos, caja ni conciliación.
El simulador verifica maquinaria e idempotencia, no cumplimiento tributario real. Antes del
piloto son bloqueantes contratar proveedor, probar credenciales/folio/representación/nota de
crédito y aprobar la matriz con asesor tributario chileno.
