# ADR-014 — QR reimprimible y presencia configurable

- **Estado:** aceptado
- **Fecha:** 2026-07-31
- **Aprobación:** fundador

## Contexto

Cada mesa necesita un QR no predecible y un código de cuatro dígitos. El modelo inicial sólo
guardaba el hash del token QR: era excelente ante una filtración de base de datos, pero hacía
imposible volver a mostrar o imprimir la misma tarjeta. También mezclaba en `presence_mode`
dos decisiones distintas: exigir un código y decidir cómo entregarlo.

Imprimir QR y código juntos reduce fricción, pero no demuestra presencia física fuerte: una
foto captura ambos. Algunos bares preferirán entregar el código separado o rotarlo.

## Decisión

1. `presence_required` queda separado de `presence_delivery_level`.
2. Los niveles son `PRINTED_WITH_QR`, `SEPARATE` y `ROTATING`. Mesas nuevas usan por defecto
   código obligatorio + `PRINTED_WITH_QR`.
3. El tenant define la política y una zona puede sobreescribirla. La mesa materializa el valor
   efectivo para que validar sea simple y determinista.
4. `presence_code_rotations` conserva historial. Niveles 1 y 2 duran hasta rotación explícita;
   nivel 3 rota cada día o al abrir turno.
5. Crear una mesa genera, en una sola transacción server-side, la mesa, hash QR, token QR en
   Vault, código, rotación, referencia Vault y auditoría. La creación masiva es atómica.
6. El token QR recuperable se guarda cifrado en Supabase Vault. El SVG se genera bajo demanda
   con `qrcode`; no se almacena SVG, PNG ni PDF.
7. Crear una mesa devuelve sólo identidad y política, nunca el token ni el código. Ver un QR o
   código exige permiso, motivo y auditoría. El servidor usa el secreto para renderizar SVG y
   no lo devuelve a la interfaz. Las rutas de usuario no usan `service_role`.
8. Regenerar incrementa `qr_version`, invalida el token anterior y advierte que la tarjeta
   física debe reemplazarse. Cambiar la política de presencia nunca modifica el hash ni la
   versión del QR.
9. Los intentos fallidos se limitan por dispositivo y por mesa dentro de una ventana. El
   bloqueo es temporal, durable y auditable; el error no revela información útil para adivinar.

## Intercambio consciente: hash versus token recuperable

Se abandona deliberadamente la propiedad “una copia completa de la base no revela QR
funcionales”. A cambio, una tarjeta dañada se puede reimprimir sin invalidar la mesa ni obligar
al bar a reemplazar todas sus copias.

La mitigación es:

- Vault cifra el token en disco y mantiene la llave fuera de la base de datos;
- las tablas de referencia viven en `private`, con RLS forzado y sin grants de usuario;
- sólo funciones estrechas con `search_path` vacío pueden descifrar;
- permiso de administración, motivo y `AuditLog` son obligatorios en cada revelado;
- no existe artefacto renderizado que pueda quedar desincronizado;
- regenerar deja el secreto anterior no activo y el hash público sólo acepta la versión nueva.
- las fachadas RPC públicas son `SECURITY INVOKER`; las operaciones privilegiadas están en
  `private`, fuera de la API expuesta, y repiten tenant y permiso antes de tocar Vault.

## Alternativas consideradas

### Mantener sólo el hash y regenerar al reimprimir

Conserva la mejor propiedad ante filtraciones. Se rechazó porque “Ver QR” dejaría de existir y
cada reemplazo de cartón invalidaría de inmediato la tarjeta todavía instalada. Sigue siendo
la opción más segura si el piloto demuestra que reimprimir el mismo QR no aporta valor.

### Guardar SVG/PDF en Storage

Se rechazó. El artefacto es directamente utilizable y crea dos fuentes de verdad. Un fallo al
revocar o borrar podría dejar material válido huérfano.

### Derivar todos los tokens desde un secreto maestro

Reduce filas en Vault, pero aumenta el radio de impacto de una sola llave y complica rotación,
portabilidad e historial por versión. Se prefirió un secreto independiente por versión de QR.

## Consecuencias

- Vault pasa a ser dependencia operativa también para reimpresión, no sólo credenciales DTE.
- Restaurar o migrar a otro proyecto debe conservar la llave raíz de Vault.
- El Nivel 1 debe describirse honestamente: prueba conocimiento de la tarjeta y frena links
  reenviados; no protege contra fotos.
- Mesas anteriores a esta migración conservan su comportamiento. Se reprovisionan de forma
  explícita para no invalidar material físico existente durante el despliegue.
- La biblioteca `qrcode` queda limitada al servidor y produce SVG bajo demanda.

## Referencias de implementación

- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [`qrcode` 1.5.4](https://www.npmjs.com/package/qrcode?activeTab=readme)
