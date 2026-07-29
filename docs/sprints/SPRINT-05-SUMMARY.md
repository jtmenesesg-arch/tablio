# Sprint 5 — Panel del garzón, mesas y sesiones

## Resultado

Tablio ya completa el tramo desde una comanda READY o un llamado del teléfono hasta la acción
física del garzón. El panel móvil vive en `/garzon`, usa PIN y zonas, recupera PostgreSQL como
fuente de verdad, muestra conexión permanente y permite entregar, atender, agrupar,
traspasar, reportar incidencias y cerrar turno.

El modo demo usa PIN `2468` para Camila y `1357` para Diego. Los PIN sólo existen como hashes
en el estado persistente y la interfaz está marcada como demo.

## Tres protecciones operativas

1. Una tarea de 12 minutos sube por encima de cualquier prioridad normal y queda crítica.
2. Una zona sin garzón vuelve sus tareas visibles para todos inmediatamente. A los 2 minutos
   crea alerta durable y outbox para administración; la pantalla consumidora llega en Sprint 6.
3. Cerrar turno muestra el recuento por tipo, no bloquea y congela un snapshot auditado. Las
   tareas quedan sin asignar y visibles al equipo.

## Garantías

- El garzón nunca confirma pagos ni crea pedidos.
- “Pagar con el garzón” dice NO PAGADO, incluye el carrito y sólo se atiende o descarta con
  motivo; expira a los 30 minutos.
- Una entrega sólo completa una comanda todavía READY y con la versión esperada.
- Los grupos son visuales: no mezclan QR, carritos, pagos, pedidos ni comandas.
- Traspasar mesa o zona mueve pendientes y deja auditoría.
- Realtime avisa, la consulta reconstruye y un sondeo de 45 segundos cubre un canal silencioso.

## Evidencia ejecutada

- 46 tests Vitest verdes: reinicio, deduplicación, inanición, huérfanas, concurrencia, grupos,
  traspasos, cierre auditado y pago manual sin pedido.
- 15/15 tests Playwright verdes entre PWA, KDS y panel.
- En la corrida final KDS midió 12 muestras conectadas: p50 86 ms, p95 134 ms y p99 149 ms; un
  caso sin KDS quedó segmentado.
- TypeScript estricto, ESLint y build Next.js de producción verdes.
- pgTAP Sprint 5: 31/31 controles verdes en el Supabase remoto, incluidos privilegios, RLS,
  tenant cruzado, zona y fail-closed sin claims.

## Cómo probarlo

```bash
pnpm install
pnpm dev
```

- Comensal: `http://localhost:3000/mesa/demo-mesa-8`, código `4826`.
- KDS: `http://localhost:3000/kds`.
- Garzón: `http://localhost:3000/garzon`, PIN `2468`.

Paga en demo, avanza la comanda a READY y pulsa “Entregado”. Para un llamado usa “Ayuda” en la
PWA. Para pago manual agrega un producto y usa “Prefiero pagar con el garzón”; no aparecerá
ninguna comanda.

## Estado remoto

Las tres migraciones del Sprint 5 están aplicadas y el historial local/remoto coincide.
Security Advisors quedó en cero. Performance Advisors no reporta claves foráneas sin índice;
sólo conserva `unused_index` informativos hasta tener tráfico representativo (OI-008). El lint
de PostgreSQL no encontró errores de Sprint 5 y el sprint queda cerrado remotamente.
