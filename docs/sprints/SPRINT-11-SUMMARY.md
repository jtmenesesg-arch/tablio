# Sprint 11 — Identidad recurrente y fidelización

## Resultado para una persona no técnica

Tablio sigue permitiendo entrar, pedir y pagar sin registrarse. Después del primer pago, una
persona puede elegir guardar un sello para ese bar. Si cambia de teléfono, Safari borra datos
o usa incógnito, recupera sus sellos con teléfono o correo y un código; no necesita pedirle al
bar que arregle nada.

El teléfono no revela nombres completos cuando circula por la mesa. Sólo propone algo como
`Perfil •482` y pregunta si corresponde. Rechazarlo deja la sesión anónima.

Al completar sellos, el premio se agrega desde el servidor a precio `$0`, reserva stock,
aparece como `PREMIO` en cocina y queda explicado en conciliación. El dueño puede informar
costo por producto; si no lo hace, Tablio muestra sólo el precio de lista y no inventa margen.

## Cómo verlo

```bash
pnpm dev:e2e
```

1. Abrir `http://localhost:3100/mesa/demo-mesa-8`.
2. Entrar con código `4826`, pedir y pagar con el simulador.
3. En confirmación elegir **Quiero mis sellos**.
4. Usar correo o teléfono; en demo el código es `735204`.
5. Abrir **Sellos** para ver progreso/recuperación.
6. Abrir `http://localhost:3100/caja` → **Sellos** para la vía asistida.
7. Abrir `http://localhost:3100/dueno` para recurrencia, premios y pérdida de identidad.
8. Un premio canjeado aparece como `PREMIO · $0` en `http://localhost:3100/kds`.

## Reglas demostradas

- Sin consentimiento no se crea perfil y el pago funciona igual.
- Confirmación server-side, no retorno del navegador, genera la visita.
- Webhooks/pagos repetidos y múltiples compras diarias no inflan sellos.
- Identidad e historial nunca cruzan tenants.
- Perder el token no pierde el saldo.
- La asistencia de caja exige motivo y auditoría.
- Premio, quote, pedido, stock, KDS y ledger son idempotentes.
- Revocar elimina contacto/credenciales y conserva hechos financieros anónimos.

## Evidencia

- Migraciones aplicadas al proyecto Supabase conectado.
- pgTAP Sprint 11: 30/30.
- Vitest: 115/115.
- Playwright: 36/36 en la regresión completa; 3/3 específicos de Sprint 11.
- TypeScript, ESLint, formato y build de producción verdes.
- Advisors sin claves foráneas nuevas sin índice ni warnings de seguridad nuevos.
- Revisión visual realizada en PWA, caja y panel del dueño.

## Decisiones

- ADR-009: identidad por tenant, recuperación principal y consentimiento.
- ADR-010: premio `$0`, costo opcional y tributación pendiente.

## Lo que bloquea un piloto real

- Proveedor SMS/correo y validación de entrega/antiabuso.
- Revisión legal chilena de consentimiento, retención, acceso y supresión.
- Revisión tributaria y DTE de premios gratuitos.
- Proveedores de pago/DTE reales y demás bloqueantes anteriores.
