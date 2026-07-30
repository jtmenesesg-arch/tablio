# Sprint 13 — Saldo prepagado / giftcard del bar

## Resultado

Tablio ya puede demostrar saldo de un bar sin mover dinero real. Un cliente recurrente acepta
el programa, carga en modo demo, recibe dinero y bono separados, paga todo o parte de un pedido
y ve su historia. La diferencia se paga con el adaptador simulado y el pedido sólo se confirma
desde el servidor.

## Protecciones importantes

- Saldo exclusivo de cada bar y calculado desde un libro que no se puede reescribir.
- Tope por persona de $40.000 por defecto y tope total opcional del local.
- Bono primero y FEFO; la regla exacta queda congelada en el quote.
- Confirmaciones duplicadas acreditan una sola vez.
- Caja ajusta sólo con motivo y puede devolver una recarga todavía intacta.
- Borrar la identidad congela el saldo con referencia; nunca hace desaparecer dinero.
- Un local suspendido no recibe nuevas recargas y no puede eliminarse con pasivo.
- Dueño y superadmin ven el pasivo como obligación, no como caja disponible.

## Cómo probar la demo

1. Abrir `/mesa/demo-mesa-8`, ingresar el código `4826` y completar un primer pedido.
2. Después del pago, abrir **Mis sellos**, activar/recuperar el perfil y aceptar “Saldo de este
   local”.
3. Cargar $10.000 o $20.000 en modo demo. La pantalla muestra el comprobante y el bono.
4. Pedir otra ronda, abrir **Mi pedido** y elegir cuánto saldo usar.
5. Crear el quote: el total, saldo congelado y diferencia externa quedan separados.
6. Abrir `/caja` → **Saldo** para consultar, ajustar con motivo o devolver una recarga intacta.
7. Abrir `/dueno` para ver los tres bloques contables.
8. Abrir `/superadmin`, seleccionar “Bar La Esquina” y revisar pasivo, alerta y umbral.

## Estado legal y productivo

La experiencia está operativa con simulador, pero **no está autorizada para dinero real**.
Caducidad, comprobante/DTE, reconocimiento de ingreso, devolución, protección al consumidor y
wind-down requieren asesoría chilena. La función nace apagada en todo tenant y sólo puede
habilitar producción después de esa validación.

## Evidencia

- Migración principal y dos correcciones de Advisors aplicadas al proyecto Supabase.
- pgTAP Sprint 13: 48/48; aislamiento tenant y fail-closed: 21/21.
- Vitest: 140/140; Playwright: 42/42; TypeScript, ESLint y build verdes.
- El núcleo remoto usa la diferencia externa, deriva la recarga al ledger y libera reservas.
- Security Advisors no agregó hallazgos de Sprint 13. Performance Advisors no dejó claves
  foráneas nuevas sin índice; `unused_index` continúa bajo OI-008 hasta tener tráfico real.
