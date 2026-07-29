# ADR-007 — Planes y morosidad del SaaS

- **Estado:** Aceptado técnicamente; precios y cortes como hipótesis comercial
- **Fecha:** 2026-07-29
- **Alcance:** Sprint 8

## Contexto

Tablio tiene dos flujos de dinero independientes:

1. el comensal paga al bar en la cuenta de pasarela del bar;
2. el bar paga setup y mensualidad a Tablio en la cuenta de cobro de Tablio.

El segundo flujo no usa `PaymentGateway`, no agrega fee a las ventas y no permite que Tablio
custodie fondos del local. Necesita su propio puerto `SaasBillingProvider`, sus propias
credenciales, facturas, intentos y estados.

El beachhead son bares chilenos de barrio. La mayoría tiene entre 10 y 25 mesas; una escala
pensada para cadenas dejaría casi todo ese mercado dentro de un único plan.

## Decisión de planes

Las **mesas activas y contables** son la dimensión principal:

| Plan          | Mesas | Límite generoso de zonas | Límite generoso de estaciones |   Setup* | Mensualidad* |
| ------------- | ----: | -----------------------: | ----------------------------: | -------: | -----------: |
| Inicial       |  0–12 |                        4 |                             4 | $199.000 |      $99.000 |
| Flujo         | 13–30 |                        8 |                             6 | $249.000 |     $169.000 |
| Alto flujo    | 31–60 |                       12 |                            10 | $299.000 |     $239.000 |
| Personalizado |   >60 |                        — |                             — |        — |            — |

\*Todos los precios son hipótesis comerciales sin validación y están expresados en CLP.

Zonas y estaciones describen layout, no tamaño económico. No hacen saltar un plan por sí
solas. Sólo se propone un nivel superior cuando **ambas** exceden claramente los límites
generosos del plan determinado por mesas. El salto máximo por layout es un nivel.

El onboarding muestra la propuesta y su explicación. Si cambia el tamaño, el nuevo plan entra
en vigor al siguiente ciclo. Nunca hay cobro retroactivo ni cambio en medio del período, y
toda propuesta conserva motivo, métricas y auditoría.

## Estado comercial separado del operativo

La suscripción usa:

```text
TRIALING → ACTIVE → PAST_DUE → GRACE → ADMIN_RESTRICTED
         → SUSPENSION_SCHEDULED → SUSPENDED | CANCELLED
```

- `PAST_DUE` y `GRACE`: avisos y reintentos; la operación sigue completa.
- `ADMIN_RESTRICTED`: bloquea reportes, edición de carta y QRs nuevos; pedidos, KDS y entrega
  siguen funcionando.
- `SUSPENSION_SCHEDULED`: exige aviso escrito y fecha futura de bajo tráfico.
- `SUSPENDED`/`CANCELLED`: bloquean sólo pedidos nuevos. Los pedidos ya confirmados siguen
  visibles y operables.

Valores por defecto configurables: aviso 5 días antes, 10 días de gracia, reintentos a 24,
72 y 120 horas, aviso de suspensión con 48 horas y ejecución los lunes a las 12:00 de
`America/Santiago`. Un fallo aislado jamás suspende.

El contrato público del comensal sólo devuelve `orderingAvailable` y, cuando corresponde, el
mensaje neutro “Este local no está recibiendo pedidos por aquí en este momento”. No expone
deuda, plan, factura ni estado de suscripción.

## Seguridad y soporte

- El dueño ve sólo su tenant mediante JWT + RLS.
- Superadmin usa membresía de plataforma separada.
- Toda impersonación exige motivo y escribe `impersonation_sessions` más `audit_log` del
  tenant.
- Las credenciales del cobro SaaS y de la pasarela del bar tienen referencias Vault distintas.
- El plan no habilita lectura cruzada: los feature flags son por tenant y no relajan RLS.

## Consecuencias

La escala discrimina dentro del ICP sin castigar un local chico por tener terraza o patio.
Cambiar precios/cortes no altera pedidos ni el puerto de cobro. Antes de cobrar en producción
deben validarse disposición a pagar, costo de soporte, impuestos del SaaS y un proveedor real.
