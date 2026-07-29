# Playbook del piloto

Este documento guía una instalación controlada. Mientras exista cualquier bloqueante de
`REAL_MONEY_BLOCKERS.md`, Tablio se usa en modo demo o en una simulación paralela y nunca como
único sistema para cobrar dinero real.

## Antes de ir al local

El dueño debe:

- nombrar un responsable de turno y un contacto de respaldo;
- entregar plano simple, mesas, zonas, estaciones, carta, alérgenos y horarios;
- decidir qué productos siguen stock, umbrales KDS y acciones del comensal;
- confirmar tablet KDS, soporte, energía permanente y ubicación visible a dos metros;
- disponer de WiFi estable y un hotspot/operador móvil alternativo;
- definir impresora y papel sólo después de cerrar OI-005;
- entregar datos tributarios y cuentas reales únicamente por el onboarding seguro cuando
  pasarela y DTE estén contratados, nunca por chat ni en el repositorio.

Tablio debe:

- crear tenant/local, verificar RLS, roles, estaciones, mesas y códigos de cuatro dígitos;
- cargar la carta y obtener aprobación humana de cada nombre, precio, estación y alérgeno;
- configurar KDS, garzones, caja, alertas, stock, propina y modo tributario;
- comprobar secretos en Vault/Vercel y que no existan credenciales en Git;
- registrar versión desplegada, contactos, ventana de piloto y criterio de rollback.

## Instalación en el local

1. Montar la tablet horizontal, con cargador fijo, brillo suficiente y sin suspensión.
2. Abrir KDS por estación; comprobar “En línea” y “Actualizado ahora”.
3. Iniciar turno de garzones, asignar zonas y verificar que una zona sin cobertura se marque.
4. Abrir caja y comprobar que no haya excepciones antiguas sin responsable.
5. Imprimir/instalar QR y código de presencia; escanear cada mesa y confirmar el nombre.
6. Hacer una venta demo con barra+cocina. Deben aparecer dos comandas independientes.
7. Cortar la red del KDS, crear otra venta demo, reconectar y comprobar recuperación.
8. Simular impresora sin papel; comprobar spool, reintento y reimpresión motivada.
9. Simular pasarela/DTE caídos; comprobar que pedido y alerta se comporten por separado.
10. Cerrar y reabrir procesos; comprobar que pedidos, tareas, spool y cierre sobrevivan.
11. Registrar hora, responsables, resultados y versión. Sólo el responsable autoriza iniciar.

## Durante el servicio

- No interpretar el retorno del navegador como pago.
- Vigilar conexión/última sincronización KDS, pendientes, atrasadas, DLQ y excepciones de caja.
- Resolver una aprobación tardía mientras el cliente aún está en mesa; después de 20 minutos
  sólo reembolsar o escalar.
- No borrar ni editar evidencia para “hacer cuadrar” un cierre.
- Toda reimpresión, reembolso, producción manual, cierre con pendientes o replay requiere
  motivo.

## Contingencias

### Falla el pago

1. Mirar estado server-side y excepción de caja.
2. Si está `pending`, no reintentar con otra clave ni producir.
3. Si está aprobado sin pedido, no producir automáticamente: decidir reembolso o producción
   manual dentro de la ventana.
4. Si el proveedor está caído, ofrecer “pagar con garzón”, dejando explícito que nada fue
   enviado a barra.

### Falla el KDS

1. Si no dice “En línea” o la última sincronización superó el umbral, tratarlo como caído.
2. Cambiar a red de respaldo y usar “Intentar ahora”.
3. Al volver, consultar PostgreSQL y comparar todas las comandas pagadas no completadas.
4. No recrear pedidos manualmente; usar número de pedido y comanda ya persistidos.

### Falla la impresora

1. El KDS manda; la falta de papel no cancela ni oculta el pedido.
2. Corregir papel/energía/red y dejar que el spool reintente.
3. Si se reimprime, usar la acción auditada con motivo. Nunca duplicar el pedido.
4. Escalar DLQ; conservar trabajo, ticket e idempotency key.

### Falla Internet del local

1. Comensales pueden usar red móvil; el equipo cambia KDS/caja al hotspot aprobado.
2. Si no hay acceso cloud, volver temporalmente a la operación manual del local.
3. Anotar hora, mesa, monto, medio, estado visible y responsable; no declarar pago digital sin
   confirmación del proveedor.
4. Al volver Internet, detener duplicación manual, recuperar PostgreSQL y conciliar cada nota
   con pedidos, eventos y excepciones.

## Volver a operación manual sin perder información

- Congelar nuevos QR, no cerrar ni borrar sesiones activas.
- Usar talonario/flujo legal del local con correlativo, mesa, hora, monto y responsable.
- Marcar claramente qué ventas ocurrieron fuera de Tablio; nunca inventar un `Order`.
- Mantener KDS/caja en sólo lectura cuando sea posible.
- Al recuperar, exportar estado, conciliar registros manuales y resolver excepciones una a
  una. No importar efectos comerciales sin una operación auditada e idempotente.

## Métricas antes y después

Medir al menos una semana base y cada servicio piloto:

- ticket promedio y rondas por mesa;
- tiempo escaneo→checkout, confirmación→KDS y READY→entrega;
- porcentaje de pagos `pending`, rechazados y abandonados;
- tiempo del garzón actuando como cajero;
- fuga de crédito, descuentos, reembolsos, chargebacks y diferencias de settlement;
- pedidos perdidos/duplicados, reimpresiones, DLQ, boletas pendientes y caídas;
- adopción QR por mesa y valoración cualitativa de equipo/clientes.

## Decidir ampliar, corregir o detener

**Ampliar** sólo después de dos servicios consecutivos con cero pedidos pagados perdidos, cero
efectos duplicados, cero cruces de tenant, p95 KDS conectado ≤2 s, 100% de diferencias
explicadas y aceptación operativa del equipo.

**Corregir sin ampliar** si el p95 supera 2 s, el escaneo p95 supera 5 s en hosting/red real,
fallan más de 1% de checkouts por Tablio, aparecen trabajos en DLQ, se acumulan alertas DTE o
el flujo manual resulta confuso.

**Detener de inmediato** ante pedido pagado perdido, producción/reembolso/DTE duplicado,
acceso cruzado entre tenants, monto confirmado incorrecto, imposibilidad de emitir respaldo
tributario, conciliación sin explicación o una falla de seguridad crítica.
