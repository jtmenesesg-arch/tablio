# Sprint 0 — Fundación

- **Estado:** cerrado
- **Fecha de cierre:** 2026-07-28
- **Proyecto Supabase:** `xmwewmukoxdeuilmkahr`
- **ADR aprobado:** `docs/adr/ADR-000-stack.md`

## Qué quedó construido

Tablio tiene una base técnica y documental para crecer sin mezclar datos entre locales:

- arquitectura aprobada para web, KDS, trabajo durable, recuperación e integraciones;
- esquema configurable por tenant para locales, zonas, mesas/puntos, estaciones, personal,
  roles, permisos y auditoría;
- RLS forzado y fail-closed en los datos de negocio;
- contexto de tenant seleccionado mediante una RPC validada y emitido en el JWT por un Custom
  Access Token Hook;
- restricciones compuestas que impiden enlazar datos de tenants distintos;
- política explícita para que `service_role` no aparezca en rutas de usuario;
- migraciones, suite pgTAP, control negativo preparado y documentación viva.

No se creó una segunda instancia remota de Supabase. Se canceló el ambiente Docker/local y el
trabajo se realizó directamente sobre el proyecto actual.

## Criterios ejecutados

### 1. Custom Access Token Hook y claim real

Se activó exclusivamente `public.custom_access_token_hook` en Supabase Auth.

La prueba utilizó cuentas y datos temporales y autenticó por el endpoint real
`/auth/v1/token`:

| Caso | Resultado |
|---|---|
| Usuario con membresía, antes de seleccionar tenant | JWT sin `tenant_id`; 0 filas visibles |
| `set_active_tenant` con membresía activa | HTTP `204` |
| Nuevo token después de seleccionar tenant | JWT con el `tenant_id` esperado |
| Lectura con ese JWT | Sólo 1 zona propia; ninguna del otro tenant |
| Usuario sin tenant | JWT sin `tenant_id`; 0 filas visibles |
| Escritura sin tenant | Rechazada con HTTP `403` |

Los logs de Auth registraron `Hook ran successfully` en las tres emisiones. Después de la
prueba se eliminaron las dos cuentas, contraseñas, contextos y datos temporales; la consulta de
limpieza confirmó 0 usuarios, 0 tenants y 0 zonas restantes.

### 2. Security Advisors

La primera revisión detectó funciones `SECURITY DEFINER` con grants demasiado amplios y claves
foráneas sin índices de soporte. Se corrigieron mediante:

- lógica privilegiada en esquema `private`;
- validación explícita de `auth.uid()` y membresía activa;
- wrapper público `SECURITY INVOKER`;
- grants mínimos;
- RLS forzado y policy de denegación en `private.user_tenant_context`;
- índices para las claves foráneas reportadas.

Resultado final de Security Advisors: **0 hallazgos**.

Performance Advisors conserva cinco avisos informativos `unused_index`. Los índices son nuevos
y todavía no existe carga representativa; se monitorean en OI-008 antes de considerar
eliminarlos.

### 3. Aislamiento y fail-closed

La verificación remota verde confirmó:

- tenant A sólo ve sus filas;
- no puede actualizar ni insertar datos del tenant B;
- una request sin claim no lee datos y una operación estricta falla;
- las claves foráneas compuestas rechazan referencias cruzadas;
- el recorrido real Auth → JWT → RLS produce el mismo aislamiento.

El control negativo rojo → verde queda pendiente con este compromiso aprobado:

> Control negativo del test de aislamiento (rojo → verde). Requiere ambiente de staging
> aislado. Se ejecutará cuando exista staging, a más tardar antes del piloto.

Nunca se debilitará una policy del proyecto actual para producir esa evidencia.

## Migraciones aplicadas

1. `20260727223243_foundation_multi_tenant.sql`
2. `20260727224600_verify_tenant_isolation.sql`
3. `20260728035137_harden_auth_and_advisor_findings.sql`
4. `20260728035253_explicit_private_context_deny_policy.sql`

## Decisiones vigentes

- Realtime avisa al KDS; PostgreSQL es la fuente de verdad; Queues asegura efectos durables.
- El KDS no espera el intervalo de drenado de la cola para mostrar un pedido.
- Al reconectar, KDS recupera el estado consultando PostgreSQL bajo RLS.
- El objetivo de latencia KDS p95 ≤ 2 s es una hipótesis **no verificada** hasta contar con
  instrumentación end-to-end.
- Los consumidores serán idempotentes, con reintentos, backoff y dead-letter queue.
- `PaymentGateway` será un adaptador abstracto; la pasarela concreta se decide con ADR-001.
- Edge Functions/Deno se limita a consumidores del plano Supabase; el dominio TypeScript queda
  neutral al runtime para contener el costo del segundo runtime.

## Qué queda abierto

- Control negativo RLS en staging antes del piloto (OI-007).
- Monitoreo de índices sin uso con carga representativa (OI-008).
- Pasarela principal, proveedor DTE, pricing, UX de conexión de comercio e impresión térmica
  permanecen como decisiones planificadas en `docs/OPEN_ISSUES.md`.
- La aplicación Next.js, CI y el primer despliegue funcional pertenecen a Sprint 1.

## Resultado

Sprint 0 queda cerrado. El siguiente incremento puede iniciar Sprint 1 sobre un esquema remoto
con tenant claim real, aislamiento fail-closed verificado y Security Advisors limpios.
