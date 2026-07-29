# Sprint 9 — Resumen para negocio

## Resultado

Tablio ahora soporta crédito de mesa sin convertirlo en el modo normal. Un dueño o cajero
autorizado puede abrir una excepción con motivo, límites y vencimiento. Todo lo que la mesa ya
pagó por QR sigue separado de lo que todavía debe:

> $32.000 pagados por app · $18.500 en crédito

Esa separación se ve igual en caja y en el panel del garzón. Los pedidos QR conservan la regla
de pago confirmado; sólo una cuenta de crédito habilitada y dentro de límites puede enviar un
pedido todavía no pagado a producción.

## Qué puede hacer el local

- Habilitar crédito conscientemente; un tenant nuevo parte con la opción apagada.
- Limitar la deuda por mesa y la suma de todas las mesas abiertas.
- Registrar quién abrió la excepción, cuándo, motivo y nombre opcional.
- Recibir pagos parciales digitales o presenciales sin duplicarlos.
- Imprimir comprobante mediante el spool durable.
- Pedir y validar un código vivo de un solo uso; una captura vieja no sirve.
- Cerrar una deuda incobrable con motivo, actor y evidencia en el cierre.

Cuando se alcanza un límite, lo ya aceptado se sigue preparando. No se permite otra ronda ni
otra mesa a crédito hasta cobrar parte del saldo.

## Panel del dueño

El nuevo panel evita una colección de gráficos sin explicación. Abre con un titular humano,
tres focos accionables y un único gráfico de ventas por hora. Debajo muestra productos,
ticket, rondas, propinas, medios, locales y excepciones.

La fuga de crédito aparece como costo acumulado del mes y tendencia frente al mes anterior.
Así el dueño puede decidir con evidencia si reduce límites o vuelve a prepago puro.

Un local recién instalado no recibe una pantalla vacía: ve ventas del día, productos y
excepciones disponibles, junto a una explicación de cuándo habrá historia suficiente para
comparar.

## Cómo verlo

```bash
cd /Users/jt/Documents/Codex/2026-07-27/podem/work/tablio
pnpm dev
```

Abrir:

- Crédito de mesa: `http://localhost:3000/credito`
- Caja: `http://localhost:3000/caja`
- Garzón: `http://localhost:3000/garzon` con PIN `2468`
- Panel del dueño: `http://localhost:3000/dueno`

Todas son pantallas demo: ejercitan la maquinaria completa sin pasarela, proveedor DTE ni
dinero real.

## Evidencia

- 51/51 controles pgTAP en el Supabase actual, con rollback; panel y cierre cuadran para el
  mismo intervalo.
- 94/94 pruebas unitarias.
- 30/30 recorridos de navegador en la regresión completa; 4/4 propios de Sprint 9.
- TypeScript, lint, formato y build de producción verdes.
- RLS habilitado y forzado; ausencia de tenant falla cerrado.
- El navegador no puede escribir directamente cuentas, ledger, fugas ni códigos.
- Security Advisors conserva sólo las seis advertencias históricas OI-019; Sprint 9 no agregó
  ninguna. Su explicación simple está en `OPEN_ISSUES.md`.

## Decisiones importantes

- ADR-008: crédito subordinado al prepago, 3 horas por defecto, límites de mesa/local, permisos
  y fuga auditable.
- El código verificable dura 60 segundos y se consume una sola vez.
- Las recomendaciones del dueño salen de reglas explícitas y cifras calculadas en servidor;
  no las inventa el frontend.
- El tratamiento tributario productivo de una venta a crédito sigue dentro de la validación
  pendiente con proveedor/asesor tributario de OI-002.
