# ADR-001 — Spike documental de pasarelas y frontera `PaymentGateway`

- **Estado:** PROPUESTO — NO DECIDIDO
- **Fecha:** 2026-07-28
- **Alcance:** Sprint 1
- **Proveedores investigados:** Mercado Pago Chile y Transbank/Webpay
- **Nivel de evidencia:** documentación oficial; sin cuentas, credenciales, sandbox ni dinero real

## Advertencia de evidencia

**Todos los comportamientos de proveedores descritos en este ADR son hipótesis no
verificadas.** Se leyeron fuentes oficiales, pero no se ejecutó onboarding, pago, webhook,
consulta, medio guardado, reembolso ni liquidación. No existe evidencia runtime y este ADR no
elige pasarela.

La documentación puede ser incompleta, cambiar por país o depender del contrato concreto del
comercio. Una capacidad deja de ser hipótesis sólo después de probarse con credenciales del
bar, observar la respuesta real y conservar evidencia.

## Contexto: dos flujos de plata separados

```text
Venta del bar (Modelo A)                  Suscripción SaaS de Tablio (Sprint 8)
Comensal → cuenta pasarela del bar        Bar → cuenta de Tablio
Tablio no recibe ni distribuye fondos     Flujo, credenciales y conciliación separados
```

Para ventas del bar quedan prohibidos `application_fee`, marketplace fee, split, retención,
custodia o distribución por Tablio. Una pasarela real debe operar con la identidad financiera
y la cuenta de abono de cada bar. El futuro cobro SaaS no implementará `PaymentGateway` ni
reutilizará credenciales de los bares: tendrá su propio puerto de billing.

## Resultado del spike

La única decisión propuesta en este ADR es conservar una frontera neutral, usar el adaptador
simulado para desarrollo/demos y **aplazar la selección de proveedor** hasta obtener evidencia
real. Documentalmente Mercado Pago parece acercarse más al onboarding por botón y a
conciliación API; Transbank parece requerir contratación y credenciales por comercio. Esa
comparación no es una recomendación final.

### Matriz de hipótesis documentales

| Criterio                   | Mercado Pago — hipótesis no verificada                                                                                                                                                                                       | Transbank/Webpay — hipótesis no verificada                                                                                                                                                                                       | Prueba real pendiente                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Onboarding del bar         | OAuth Authorization Code permitiría que el dueño autorice a una aplicación Tablio a operar en nombre de su cuenta. Tablio necesitaría una aplicación/desarrollador, `client_id`, redirect exacto y secreto sólo server-side. | No se encontró OAuth público. Las páginas oficiales indican contratación, firma, activación y entrega de código de comercio/API key; Oneclick se solicita por contacto.                                                          | Conectar dos comercios reales sin intervención manual de Tablio y comprobar revocación/renovación.            |
| Fondos al bar              | Las llamadas con el access token OAuth del vendedor operarían sobre su cuenta. Tablio debe omitir cualquier `application_fee`.                                                                                               | El código de comercio identifica la afiliación y la cuenta de abono del comercio. No se usará Webpay Mall para repartir fondos.                                                                                                  | Venta controlada y comprobación bancaria a nombre del mismo bar.                                              |
| Confirmación server-side   | Webhook con `x-signature`/`x-request-id`, validación HMAC con secreto y consulta posterior de Payment/Order por API.                                                                                                         | El navegador retorna `token_ws`; el backend ejecuta `commit` contra Webpay. `status` permite recuperar una transacción hasta siete días según el ejemplo oficial. No se encontró webhook independiente firmado para Webpay Plus. | Desconexión del navegador, callback repetido, confirmación tardía, duplicada y fuera de orden.                |
| Apple Pay web/PWA          | No se encontró una afirmación oficial específica para Checkout web en Chile.                                                                                                                                                 | Transbank documenta Apple Pay en su red, principalmente POS/contactless; la nota online encontrada habla de QR “Onepay y otras billeteras”, no confirma botón Apple Pay web/PWA.                                                 | Dispositivo Apple compatible, dominio verificado, PWA instalada/no instalada y tarjeta real admitida.         |
| Medio guardado             | Customer + Cards permitiría guardar/listar/eliminar tarjeta dentro de la cuenta del vendedor; el uso posterior vuelve a pedir CVV según la guía leída.                                                                       | Oneclick Mall inscribe y devuelve `tbkUser`, permite autorizar y eliminar la inscripción. La documentación usa comercio padre/hijo y contrato específico.                                                                        | A qué comercio queda ligado el token, baja efectiva y rechazo al intentar usarlo en otro bar.                 |
| Reembolso                  | Endpoint de refunds soportaría total sin `amount` y parcial con `amount`; creación exige idempotency key.                                                                                                                    | `refund` resuelve reversa o anulación según condiciones y devuelve `REVERSED` o `NULLIFIED`, saldo y monto anulado cuando aplica.                                                                                                | Total, parcial, repetición idempotente, mismo día y día posterior.                                            |
| Liquidación y conciliación | Account Money Report documenta API y campos de bruto, fee, neto, refund, chargeback, settlement date y referencias. Las cuentas de prueba generan reportes sin datos.                                                        | El Portal de Clientes documenta liquidación de abonos, cartola, exportación, comisión/IVA, saldos y documentos; no se encontró una API pública oficial para extraerlos automáticamente.                                          | Relacionar venta → fee → devolución/contracargo → abono bancario real por API, con paginación y correcciones. |
| Ambiente de prueba         | Existen cuentas de prueba, pero la propia documentación declara vacíos los reportes para esas cuentas.                                                                                                                       | Existen códigos/API key de integración y tarjetas de prueba. No se comprobó fidelidad de abonos, reversas ni Oneclick contratado.                                                                                                | Comparar respuestas y transiciones sandbox/producción.                                                        |
| Costos                     | No evaluados: dependen de contrato, país, medio y condiciones vigentes.                                                                                                                                                      | No evaluados: el sitio ofrece simulador y contratación, no una tarifa que este spike pueda validar para cada bar.                                                                                                                | Cotización contractual comparable, sin fee por transacción de Tablio.                                         |

## Fuentes oficiales consultadas

### Mercado Pago Chile

- [OAuth Authorization Code](https://www.mercadopago.cl/developers/es/docs/security/oauth/creation)
  y [referencia OAuth](https://www.mercadopago.cl/developers/es/reference/authentication/oauth/overview).
- [Integración de cuentas de vendedores](https://www.mercadopago.cl/developers/es/docs/checkout-pro/how-tos/integrate-marketplace).
  Se toma sólo el patrón de autorización por vendedor; Tablio no adopta fees ni split.
- [Webhooks y validación de firma](https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks).
- [Refunds de Checkout Pro](https://www.mercadopago.cl/developers/es/reference/online-payments/checkout-pro/overview)
  y [creación idempotente](https://www.mercadopago.cl/developers/es/reference/online-payments/checkout-pro/create-refund/post).
- [Tarjetas guardadas](https://www.mercadopago.cl/developers/es/docs/checkout-api-orders/saved-cards)
  y [API de Cards](https://www.mercadopago.cl/developers/es/reference/online-payments/checkout-api/cards/save-card/post).
- [Account Money Report](https://www.mercadopago.cl/developers/es/docs/reports/account-money/introduction),
  [campos](https://www.mercadopago.cl/developers/en/docs/reports/account-money/report-fields)
  y [generación/descarga por API](https://www.mercadopago.cl/developers/es/docs/reports/account-money/api).
- [Cuentas de prueba](https://www.mercadopago.cl/developers/es/docs/checkout-pro/test-accounts).

### Transbank

- [Contratación y productos Webpay](https://ayuda.transbank.cl/que-es-webpay) y
  [activación de Webpay Plus](https://ayuda.transbank.cl/es/activar-webpay-plus).
- [Producto Webpay Plus](https://publico.transbank.cl/es/productos-y-servicios/soluciones-para-ventas-internet/webpay-plus)
  y [producto Oneclick](https://publico.transbank.cl/productos-y-servicios/soluciones-para-ventas-internet/webpay-oneclick-).
- [Ejemplo oficial Node de create/retorno Webpay Plus](https://proyecto-ejemplo-node.transbankdevelopers.cl/webpay-plus)
  y [status/refund](https://proyecto-ejemplo-node.transbankdevelopers.cl/api-reference/webpay-plus).
- [Documentación oficial en GitHub para Webpay y Oneclick](https://github.com/TransbankDevelopers/transbank-developers-docs/blob/master/documentacion/webpay/README.md).
- [Liquidación de abonos y transacciones en Portal](https://publico.transbank.cl/portal-de-clientes/modulos-y-reportes/transacciones),
  [cartola](https://publico.transbank.cl/portal-de-clientes/modulos-y-reportes/cartola-de-movimientos)
  y [documentos electrónicos](https://publico.transbank.cl/portal-de-clientes/modulos-y-reportes/documentos-electronicos).
- [Apple Pay en la red Transbank](https://ayuda.transbank.cl/ventas-con-billetera-apple-pay)
  y [canal online descrito por Transbank](https://publico.transbank.cl/w/transbank-consolida-su-liderazgo-con-la-aceptaci%C3%B3n-de-13-billeteras-digitales-en-su-red).

“No se encontró” significa sólo que esta investigación no localizó una fuente oficial pública;
no demuestra que la capacidad no exista bajo contrato o en una API privada.

## Puerto abstracto `PaymentGateway`

El contrato vive en
`packages/application/src/payments/payment-gateway.ts`. Cubre:

- iniciar y completar conexión del comercio;
- crear un intento con `CheckoutQuote`, monto, comercio e idempotency key;
- verificar un webhook/callback y normalizar el evento;
- confirmar y consultar estado server-side;
- reembolso total o parcial e idempotente;
- inscripción y baja de medio guardado;
- consulta paginable de entradas de liquidación: bruto, fee de proveedor, neto,
  refund/chargeback, fecha de disponibilidad y referencia de abono;
- declaración explícita de capacidades del adaptador.

### Invariantes de la frontera

1. Toda operación lleva `tenantId` y `merchantAccountId`; nunca se infiere un comercio global.
2. No existe campo para fee, split o cuenta receptora de Tablio.
3. CLP usa enteros, nunca punto flotante.
4. El resultado del navegador no confirma el pago: lo hace `confirmServerSide`.
5. El medio guardado pertenece al par tenant/comercio y no cruza bares.
6. Eventos del proveedor se deduplican por `eventId`; efectos se deduplican por identidad del
   recurso: pago para confirmación/rechazo y refund para cada devolución.
7. Evento aceptado y outbox se escriben mediante una operación atómica del repositorio.
8. Tipos y códigos propios del proveedor terminan en el adaptador.
9. Billing SaaS queda fuera de esta interfaz.

## Adaptador simulado

`packages/payments-simulated` implementa el mismo puerto y soporta:

- intentos e idempotency keys;
- HMAC-SHA256, timestamp con ventana de cinco minutos y comparación constante para webhooks;
- confirmación mediante consulta server-side;
- aprobado, rechazado, duplicado, tardío y fuera de orden;
- reembolso total/parcial e idempotente;
- medio guardado acotado al comercio;
- entradas simuladas de bruto, fee del proveedor, neto, reembolso y abono;
- evento + outbox atómico en el repositorio del laboratorio.

El laboratorio usa memoria y **no es persistencia durable**. Sirve para probar el protocolo y
mostrar una demo; no puede operar producción. Sprint 2 implementará repositorios PostgreSQL y
outbox dentro de una única transacción sin cambiar los casos de uso ni el puerto.

La pantalla `/demo/payments` y la API `/api/demo/payments` llevan avisos visibles y header
`x-tablio-demo-mode: true`. No reciben credenciales, datos de tarjeta ni secretos reales.

## Pruebas automatizadas

La suite contractual verifica:

- mismo idempotency key → mismo intento;
- cuerpo alterado → firma rechazada;
- ocho entregas del mismo webhook → un evento y un outbox;
- `pending` antiguo después de `confirmed` → no hay degradación;
- rechazo y evento tardío;
- reembolso parcial, total e idempotente;
- dos reembolsos parciales distintos producen dos efectos durables distintos;
- medio guardado rechazado fuera de su comercio;
- bruto, fee, neto y referencia de abono disponibles para conciliación.

## Riesgos y decisiones pendientes

- OAuth Mercado Pago puede no entregar exactamente el alcance/país/flujo que requiere Modelo A.
- Transbank puede ofrecer onboarding o liquidación API sólo bajo acuerdo no público.
- Un token guardado puede quedar atado a una afiliación que impida reutilización entre bares.
- Apple Pay visible en POS no implica Apple Pay en checkout PWA.
- Sandboxes pueden ocultar liquidaciones, tiempos de abono y reversas contables.
- Si ninguna pasarela entrega liquidación por API, el cierre automático no puede explicar cada
  peso como promete el brief.

## Decisión

**PROPUESTA, NO APROBADA:** desarrollar Sprint 2 contra `PaymentGateway` y el adaptador
simulado. No elegir Mercado Pago ni Transbank todavía. Antes del piloto se crean las cuentas
autorizadas, se ejecuta la matriz real y se reemplaza el simulador escribiendo un adaptador,
sin cambiar el núcleo financiero.
