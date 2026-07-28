# Mapa de dominios

- **Estado:** vivo, núcleo financiero y PWA del comensal de Sprint 3 implementados
- **Fuente:** brief v2.2 congelado y decisiones post-freeze

## Regla central

La unidad atómica es:

```text
persona → carrito → CheckoutQuote inmutable → confirmación server-side
        → pedido confirmado → comandas por estación
```

La mesa entrega contexto físico y operativo. No es una cuenta financiera compartida.

## Vista general

```mermaid
flowchart LR
  tenant["Tenant / local"] --> venue["Venue"]
  venue --> zone["Zona"]
  zone --> table["Mesa y QR"]
  venue --> station["Estación"]

  tenant --> access["Identidad, roles y permisos"]
  table --> session["Sesión de mesa"]
  session --> device["Sesión de dispositivo"]
  device --> cart["Carrito por persona"]
  cart --> quote["CheckoutQuote inmutable"]
  quote --> payment["Pago y eventos del proveedor"]
  payment --> order["Pedido confirmado"]
  order --> ticket["Comanda por estación"]
  station --> ticket
  device --> action["Acciones y avisos"]

  payment --> tip["Propina"]
  payment --> tax["Documento tributario"]
  payment --> settlement["Liquidación y conciliación"]

  order --> outbox["Outbox y colas durables"]
  outbox --> kds["KDS / impresión / efectos"]
  order -. "aviso rápido" .-> kds
  kds -. "recuperación" .-> order

  access --> audit["Auditoría"]
  payment --> audit
  order --> audit
```

## Dominios y responsabilidades

### 1. Tenant y configuración

Representa al comercio cliente. Define identidad, estado, plan, locales, modos de atención,
configuración tributaria, estaciones y capacidades. No hardcodea supuestos exclusivos de bar.

### 2. Espacio físico

Modela locales, zonas, mesas, QRs, códigos de presencia y estaciones. Alimenta operación,
onboarding y futura clasificación de planes por tamaño.

### 3. Identidad, acceso y auditoría

Gestiona comensal, garzón, KDS, cajero/admin, dueño y superadmin. Combina autenticación, roles,
permisos, pertenencia a tenant e historial obligatorio de acciones sensibles.

### 4. Catálogo y disponibilidad

Contiene categorías, productos, variantes, modificadores, precios, impuestos, alérgenos, stock
y asignación a estaciones. Todo es configurable por tenant. El seguimiento unitario es
optativo por producto: sólo los productos con `track_stock` reservan disponibilidad.

### 5. Sesión de mesa y presencia

Abre el contexto físico en el que interactúan varias personas. Valida QR no predecible, código
corto y reglas configurables de presencia. Una sesión contiene dispositivos con token opaco,
alias y carrito independientes. La sesión de dispositivo vence tras 4 horas de inactividad,
12 horas absolutas o antes si la mesa se cierra.

### 6. Carrito y CheckoutQuote

Cada persona tiene su carrito. Antes de pagar se crea un snapshot inmutable con cantidades,
precios, descuentos, impuestos, propina, tenant, mesa, identidad visible y expiración. El quote
vive 10 minutos por defecto y es el único reloj de cualquier reserva asociada.

### 7. Pagos

Normaliza intentos, eventos del proveedor, confirmación verificable, reembolsos y contracargos.
El estado se deriva de eventos inmutables. Cada operación se ejecuta en el comercio directo
del bar; Tablio nunca custodia fondos, cobra una comisión de plataforma ni distribuye ventas.
El proveedor entra mediante `PaymentGateway`.

### 8. Pedidos

Convierte un pago confirmado en un pedido exactamente una vez. Mantiene identidad visible por
persona y una máquina de estados distinta de la sesión, el pago y las comandas. El pedido y sus
comandas iniciales se crean atómicamente antes de avisar al KDS.

### 9. Producción y entrega

Divide un pedido en comandas por estación dentro de la transacción de confirmación. KDS recibe
avisos rápidos, reconstruye su estado desde PostgreSQL y nunca espera a la cola para mostrar
trabajo ya confirmado.

### 9.1 Acciones de mesa

Las acciones son datos configurables por tenant/venue y aplican cooldown más clave de
deduplicación. “Pagar con el garzón” es sólo una solicitud visible: no crea pedido, comanda ni
estado que parezca pagado.

### 10. Durabilidad y efectos

Outbox, Supabase Queues, consumidores, reintentos, DLQ, spool de impresión y replay auditado.
Realtime acelera la pantalla, pero no es la cola ni la fuente de verdad.

### 11. Propinas

Separa propina de subtotal e impuestos, conserva su regla de distribución y permite
conciliación/reembolso configurables. Tablio no cobra fee sobre propinas.

### 12. Tributación

Orquesta emisión vía proveedor DTE. Garantiza que una venta no genere dos respaldos tributarios
por el mismo hecho y relaciona notas de crédito con reembolsos/anulaciones.

### 13. Conciliación

Compara CheckoutQuote/pedido, transacción de pasarela, documento tributario y liquidación real.
Toda diferencia queda como excepción accionable. Una aprobación posterior al vencimiento no
produce: abre una alerta crítica visible al cajero para reembolsar o producir manualmente.

### 14. Billing de Tablio

Cobra setup y suscripción SaaS por separado del dinero del bar. La morosidad nunca corta una
noche de alto flujo sin aviso y horario controlado. Este dominio tendrá credenciales, puerto,
ledger y conciliación propios en Sprint 8; no reutiliza `PaymentGateway` ni la cuenta de
pasarela de un bar.

## Límites importantes

- Pago, pedido y comanda tienen máquinas de estado separadas.
- Realtime puede perder avisos; PostgreSQL no puede perder el estado confirmado.
- Cada efecto asíncrono acepta mensajes repetidos.
- Todo acceso de negocio se limita por tenant.
- Pasarela, proveedor DTE e impresora se conectan mediante adaptadores reemplazables.
- Pago del comensal al bar y suscripción del bar a Tablio son flujos financieros distintos.
- El orden de ingestión usa el reloj de PostgreSQL; `occurred_at` del proveedor se conserva
  como evidencia, pero no puede hacer retroceder una máquina de estados.
- El alias y nombre opcional se congelan en quote/pedido para que la entrega siga siendo
  inequívoca aunque el dispositivo cambie después.

## Transacción de confirmación implementada

```text
evento → persistir evidencia inmutable/deduplicar
       → consultar verdad server-side antes de entrar
       → bloquear intento + quote + reservas
       → validar firma, tenant, comercio, monto, moneda y expiración
       → crear pedido + ítems + comandas + consumir reservas + outbox
       → COMMIT
       → Realtime avisa al KDS; PGMQ garantiza los efectos
```

Un resultado `PENDING` o un retorno del navegador sólo agrega evidencia. Si una validación
comercial falla se crea una excepción idempotente; nunca se crea parcialmente un pedido.

## Decisiones abiertas relacionadas

Ver [`OPEN_ISSUES.md`](OPEN_ISSUES.md): pasarela primaria, DTE, planes, UX de conexión de
pasarela e impresión térmica.
