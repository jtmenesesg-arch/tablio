# Autenticación real del dueño — Incremento 4, evidencia

Plan: `elegant-wobbling-phoenix` (autenticación real antes de la Tarea 4). Fecha: 2026-08-03.
Proyecto real: `xmwewmukoxdeuilmkahr`.

## Tenant piloto real creado

A pedido explícito del fundador, este tenant se conserva (no se borra al terminar, a diferencia
del fixture de Sprint 0 documentado en `docs/DATA_MODEL.md:557-577`):

- **Tenant:** `Bar La Virgen` (`slug: bar-la-virgen`, `status: onboarding`,
  `id: a63b2f89-1bd5-450e-a7b2-38ff73260b43`).
- **Venue:** `Bar La Virgen` (`code: principal`, `id: 7e669cdb-e29d-40da-8290-9d538a94b1be`).
- **Usuario dueño:** `jtmenesesg@gmail.com` (`auth.users.id: 0dba6f13-bf1e-437c-a44b-cd5eedd5bb55`),
  creado vía `auth.admin.createUser` con `email_confirm: true` (no hay SMTP configurado, así que
  la confirmación por correo no es una opción todavía). Contraseña temporal asignada — el dueño
  debe cambiarla en cuanto exista una pantalla de cambio de contraseña (no construida en este
  incremento).
- **Membresía:** `tenant_memberships` con `role_code: owner`, `status: active`, vinculando ese
  usuario a ese tenant.

`status: onboarding` es deliberado — el tenant existe para probar el pipeline de autenticación,
no se marcó `active` artificialmente; eso debe pasar cuando el dueño complete el onboarding real.

## Bug real encontrado: falta un `GRANT` en producción

Al intentar el primer login real de punta a punta, `set_active_tenant` falló con
`permission denied for function set_active_tenant` para el rol `authenticated`.

Verificado que el archivo de migración committeado
(`supabase/migrations/20260728035137_harden_auth_and_advisor_findings.sql:55`) ya dice:
```sql
grant execute on function private.set_active_tenant(uuid) to authenticated;
```

Pero en producción, `private.set_active_tenant(uuid)` sólo tenía ACL
`{postgres=X/postgres,service_role=X/postgres}` — sin `authenticated`. Se comparó contra los
otros 5 `grant ... to authenticated` sobre funciones `private.*` que existen en las migraciones
(`current_tenant_id`, `has_active_membership`, `has_permission`, `require_tenant_context`,
`retry_tax_document`) — los 5 sí tienen el grant correctamente aplicado en producción. Es un caso
aislado, no un patrón sistemático — pero bloqueaba el 100% de los logins reales, porque nadie
había ejecutado este camino contra producción desde que se borraron los fixtures de Sprint 0.

**Arreglo aplicado (aprobado explícitamente antes de tocar producción):**
```sql
grant execute on function private.set_active_tenant(uuid) to authenticated;
```
Exactamente el `GRANT` que el archivo ya committeado especifica — no es una decisión de diseño
nueva, es restaurar lo que ya estaba documentado como intención. Verificado con
`select proacl from pg_proc ...` que el rol `authenticated` aparece ahora en el ACL.

## Verificación de punta a punta (rojo → verde), con el usuario real

Usando `@supabase/supabase-js` con la clave pública (nunca `service_role` para el login en sí),
simulando exactamente lo que hará la página `/login` del Incremento 5:

1. **Login con `jtmenesesg@gmail.com`** → éxito. JWT decodificado: **sin** claim `tenant_id`
   (correcto, antes de elegir tenant).
2. **`set_active_tenant('a63b2f89-...')`** → `ok` (tras el arreglo del grant).
3. **`refreshSession()`** → nuevo JWT decodificado: **con** claim
   `tenant_id: a63b2f89-1bd5-450e-a7b2-38ff73260b43`. Confirma que el Custom Access Token Hook
   sigue activo y funcionando en el proyecto alojado real — reverificado con un login real, no
   asumido desde `config.toml` ni desde la evidencia vieja de Sprint 0.
4. **`owner_dashboard_summary()`** autenticado → responde sin error, con `tenant_id` correcto y
   cifras en cero (tenant real pero sin ventas todavía): `sales_clp: 0`, `order_count: 0`,
   `monthly_credit_loss_clp: 0`, etc.

## Control negativo (segundo usuario, sin membresía)

Usuario descartable `control-negativo-tablio@example.com` (creado y **borrado** al terminar la
prueba — nunca fue parte de los datos reales):

1. Login → éxito, JWT **sin** `tenant_id` (correcto, sin membresía activa).
2. Intento de activar el tenant de `Bar La Virgen` → rechazado:
   `"active tenant membership is required"`.
3. Intento de leer `owner_dashboard_summary` sin tenant activo → rechazado:
   `"active tenant context is required"`.

Aislamiento entre tenants confirmado contra la base real, no sólo contra pgTAP local.

## Qué falta para el resto del plan

- Incremento 5: página `/login` real usando este mismo mecanismo (ya probado por script, falta la
  UI).
- El dueño de `Bar La Virgen` debe cambiar su contraseña temporal apenas exista esa opción.
- Este hallazgo (`GRANT` faltante) es exactamente el mismo patrón de OI-027/OI-030: producción
  divergiendo de lo que el archivo de migración ya dice. No se abrió un nuevo asunto en
  `OPEN_ISSUES.md` porque se encontró y cerró en el mismo incremento, con evidencia — pero vale la
  pena tenerlo presente como una instancia más del mismo problema de fondo (OI-031).
