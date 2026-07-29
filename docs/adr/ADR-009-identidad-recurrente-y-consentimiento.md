# ADR-009 — Identidad recurrente por local y consentimiento recuperable

- **Estado:** aceptado e implementado con adaptadores simulados.
- **Fecha:** 2026-07-29.

## Contexto

El comensal debe poder pedir y pagar sin cuenta. La fidelización aparece sólo después del
primer pago confirmado y nunca puede convertirse en requisito para usar Tablio.

Un token persistente en una PWA no instalada se pierde: Safari puede limitar almacenamiento,
el usuario puede limpiar datos y el modo privado no conserva nada. Por eso el token mejora la
comodidad, pero no es la identidad ni la única llave de los sellos.

## Decisión

1. La identidad es seudónima y pertenece a un `tenant`; no existe perfil global entre bares.
2. Teléfono o correo verificado es el mecanismo principal de continuidad desde el opt-in.
   Perder el token sólo obliga a verificar de nuevo; no borra perfil, visitas ni sellos.
3. El token httpOnly propone un perfil, pero el dispositivo compartido muestra únicamente
   `Perfil •482`. El usuario debe confirmar o elegir “No soy yo” antes de vincular la mesa.
4. Existen consentimientos separados y revocables para recordar visitas/preferencias y para
   conservar el dato de recuperación. Aceptar recuperación no autoriza mensajes comerciales.
5. Revocar anonimiza contacto, credenciales y vínculo de dispositivo. Se conserva evidencia
   financiera sin identidad personal para conciliación y obligaciones legales.
6. Caja puede restituir sellos sólo a un perfil encontrado por dato enmascarado, con motivo,
   empleado, sesión, idempotencia y auditoría.
7. `token_missing_recovered_self` alimenta la tasa de pérdida de identidad:
   recuperaciones sin credencial / intentos reconocidos. El dueño la ve porque una tasa alta
   indica que el programa no entrega continuidad real.

## Seguridad y aislamiento

Contactos cifrados, hashes de búsqueda, credenciales y desafíos viven en `private`. Tienen RLS
forzado, cero políticas y cero grants a roles API: únicamente funciones internas con
`search_path` vacío acceden a ellos. Los perfiles, eventos y ledger tienen `tenant_id`, RLS
forzado y vistas `security_invoker`.

## Marco legal

La implementación minimiza datos y conserva consentimiento explícito, específico y revocable.
La matriz legal final es bloqueante antes del piloto. La Ley 21.719, publicada en 2024 y
vigente desde el 1 de diciembre de 2026, refuerza consentimiento, acceso y supresión:
[texto oficial BCN](https://www.bcn.cl/leychile/Navegar?idNorma=1209272&idParte=10527471&idVersion=2026-12-01).

## Consecuencias

- Un pago anónimo sigue funcionando exactamente igual.
- La continuidad no depende del navegador anterior ni de una acción del bar.
- Se necesita proveedor real de SMS/correo, protección antiabuso, entrega observada y revisión
  legal antes del piloto.
- Historial y recomendaciones jamás cruzan tenants.
