# Sprint 6 — Caja, cierre y conciliación

## Resultado

Tablio ya tiene una caja de escritorio en `/caja`. Muestra cada mesa como sesión —personas,
pedidos, monto procesado, producción y atención—, presenta las diferencias financieras antes
del cierre y congela un resumen que explica venta bruta menos reembolsos, contracargos y
comisión hasta el abono esperado.

La pantalla es opaca, de alto contraste y está marcada como demo. Ningún dato sintético mueve
dinero.

## Protecciones más importantes

1. Una aprobación posterior al vencimiento aparece crítica de inmediato. Caja ve la hora del
   proveedor, la recepción y el tiempo transcurrido.
2. Producir manualmente sólo está disponible durante 20 minutos configurables. Revalida mesa y
   stock; después sólo permite reembolsar o escalar.
3. Si ninguna ventana de turno contiene la aprobación, no se inventa una atribución: queda sin
   turno, visible y accionable, con ambas horas.
4. Un reembolso parcial prorratea propina en CLP enteros. Si el turno ya cerró, el trabajador
   conserva lo distribuido y el local recibe un ajuste explícito en el siguiente cierre.
5. El cierre y sus desgloses son inmutables. Eventos posteriores agregan evidencia; no cambian
   la fotografía histórica.

## Qué puede hacer caja

- Ver mesas, grupos, actividad y métricas calculadas en servidor.
- Tomar, resolver o escalar excepciones con control de versión.
- Pedir reembolsos totales/parciales con permiso, motivo e idempotencia.
- Comparar pedido, pago y settlement sintético; la columna DTE declara “Sprint 7”.
- Cerrar aun con excepciones sólo tras justificarlo; la decisión queda auditada.
- Descargar CSV del cierre y de las excepciones.

## Evidencia ejecutada

- Vitest: 60/60 controles verdes en el repositorio completo; 14 son específicos de caja.
- Playwright de caja: 4/4 recorridos verdes (19 totales al sumar sprints previos).
- pgTAP remoto: 40/40 controles verdes dentro de una transacción con rollback. Incluye RLS
  cruzado, fail-closed sin `tenant_id`, permisos de reembolso e inmutabilidad.
- Security Advisors: cero hallazgos.
- Performance Advisors: cero hallazgos accionables de Sprint 6 después de indexar todas sus
  claves foráneas; los `unused_index` informativos permanecen bajo OI-008.
- Lint remoto: sin advertencias de Sprint 6. Conserva tres `warning extra` heredados de Sprint
  2 por parámetros/variables sin uso.
- TypeScript estricto, ESLint, Prettier, build de producción y audit de dependencias forman la
  puerta final.

## Cómo verlo

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abre `http://localhost:3000/caja`. “Excepciones” contiene una aprobación tardía y una
diferencia de abono. “Conciliación” compara dos settlements sintéticos. “Cierre” pide efectivo
y, si hay alertas abiertas, una justificación antes de congelar y exportar.

## Decisión y límites

ADR-005 documenta el reembolso de propina tras su distribución. Requiere revisión con asesor
laboral chileno antes del piloto (OI-012).

La maquinaria de conciliación está probada sólo con el adaptador simulado. La pasarela real
debe demostrar que entrega comisión, reembolsos y abono por API; es bloqueante OI-013. Boleta
electrónica llega en Sprint 7 y permanece explícitamente pendiente.
