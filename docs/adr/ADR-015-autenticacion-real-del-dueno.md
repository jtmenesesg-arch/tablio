# ADR-015 — Autenticación real del dueño (Supabase Auth)

- **Estado:** aceptado
- **Fecha:** 2026-08-03
- **Aprobación:** fundador

## Contexto

Todo el producto corría sin autenticación real: cada pantalla leía de *stores* en memoria
filtrados por una constante UUID fija que simulaba un único tenant global. Ni
`@supabase/supabase-js` ni `@supabase/ssr` estaban instalados, no existía `middleware.ts`
(hoy `proxy.ts`), y ninguna ruta de API leía un JWT ni una cookie de sesión real. El fundador
pidió 4 pantallas nuevas para el dueño (Equipo, Configuración, Soporte, Reportes) conectadas a
Supabase real — y decidió explícitamente construir autenticación real primero, como su propio
incremento, no algo que se resuelve dentro de esas 4 pantallas.

El esquema de la base de datos ya tenía un modelo de autenticación multi-tenant completo,
migrado desde `20260727223243_foundation_multi_tenant.sql` y endurecido en
`20260728035137_harden_auth_and_advisor_findings.sql`, con un recorrido real ya probado una vez
en Sprint 0 (`docs/DATA_MODEL.md:557-577`) y sus fixtures borrados. Nadie había construido la
capa de aplicación (Next.js) que lo usara.

## Decisión

1. **Email + password, no magic link ni OAuth.** `supabase/config.toml` tiene
   `enable_confirmations = false` y SMTP sin configurar — magic link y confirmación por correo no
   tienen cómo entregarse todavía. Email+password no depende de eso. Se revisa cuando exista un
   proveedor de correo configurado.
2. **Server Actions para el login, no un cliente puro en el browser.** `signInWithPassword` y
   `selectTenant` (`apps/web/app/login/actions.ts`) corren en el servidor y setean las cookies de
   sesión ahí mismo (`httpOnly`), en vez de dejar que `document.cookie` lo haga desde JS.
3. **`refreshSession()` es obligatorio después de `set_active_tenant`.**
   `public.custom_access_token_hook` sólo inyecta el claim `tenant_id` al emitir o refrescar un
   JWT — nunca al ejecutar la RPC. Sin este paso, el siguiente request queda sin el claim y todo
   falla cerrado en silencio (visto en vivo durante la verificación: ver
   `docs/evidence/SPRINT-14-AUTH-VERIFICATION.md`). El helper
   `activateTenantAndRedirect` en `actions.ts` encapsula ambos pasos juntos a propósito, para que
   nadie llame uno sin el otro.
4. **Nunca `service_role` en rutas de usuario.** Los clientes de
   `apps/web/lib/supabase/{client,server}.ts` y el helper
   `apps/web/lib/supabase/route-handler-client.ts` (para las futuras rutas de la Tarea 4) sólo
   usan la clave `anon`/publicable. La identidad viene siempre de las cookies del que hace la
   request; la autorización real vive en Postgres
   (`private.require_tenant_context()`/`has_permission()`), no se reimplementa en TypeScript.
5. **`/login` y `/dueno-real` quedan aislados de las 8 pantallas ya migradas por ahora.** Ninguna
   pantalla existente (`/dueno`, `/dueno/mesas`, `/caja`, `/kds`, `/garzon`, `/superadmin`,
   `/onboarding`, `/credito`) se tocó ni se enlaza a `/login`. `proxy.ts` excluye explícitamente
   todo `/api/*` existente de su matcher — es un no-op transparente para ellas. `/dueno-real` es
   una pantalla de prueba de humo, no el destino final; migrar `/dueno` de verdad a datos reales
   es una decisión aparte, todavía no tomada.
6. **La cuenta de prueba de este incremento se conserva como el primer tenant piloto real**
   (`Bar La Virgen`), a pedido explícito del fundador — a diferencia de Sprint 0, donde los
   fixtures se borraron al terminar. Contraseña temporal asignada; falta construir una pantalla
   de cambio de contraseña.

## Lo que se encontró y no se inventó

Al ejecutar el primer login real contra producción, `private.set_active_tenant(uuid)` no tenía
`EXECUTE` para `authenticated`, aunque el archivo de migración ya committeado lo especifica. Se
aplicó exactamente ese `GRANT` (no una decisión de diseño nueva) tras confirmar que era un caso
aislado, no un patrón — mismo tipo de divergencia producción-vs-repositorio que OI-027/OI-030.
Detalle en `docs/evidence/SPRINT-14-AUTH-VERIFICATION.md`.

## Fuera de alcance de esta decisión

- El login por PIN del garzón (`employee_sessions.auth_user_id` exige un `auth.uid()` previo,
  mecanismo de "sesión de dispositivo" sin decidir) — ligado a OI-029, aparte.
- Migrar las 8 pantallas ya construidas a datos reales — decisión futura, pantalla por pantalla.
- Las 4 pantallas de la Tarea 4 (Equipo, Configuración, Soporte, Reportes) — este ADR sólo cubre
  la autenticación que las hace posibles; se construyen en incrementos siguientes.
