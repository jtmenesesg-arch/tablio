# Sprint 4 — KDS, comandas y durabilidad

## En simple

Tablio ya cierra la cadena principal: una persona paga en modo demo, el servidor verifica el
pago y la comanda aparece sola en la pantalla correcta. Barra y Cocina pueden trabajar a
ritmos distintos sin pisarse.

La pantalla nunca usa un aviso como verdad. El aviso sólo dice “consulta de nuevo”;
PostgreSQL conserva pedidos, comandas y estados. Si el KDS se apaga, al volver recupera todo
lo pagado que siga pendiente.

## Cómo verlo

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Abrir lado a lado:

1. <http://localhost:3000/kds> y elegir Barra, Cocina o Todas.
2. <http://localhost:3000/mesa/demo-mesa-8>, ingresar **4826**, agregar productos y pagar en
   modo demo.

El KDS debe mostrar “En línea”, “Actualizado ahora” y el sello “Pagado”. Una compra con cerveza
y comida crea dos comandas independientes.

## Qué se construyó

- KDS horizontal, sólido, de alto contraste y legible a distancia.
- Estaciones configurables; no hay lista rígida en el esquema.
- Temporizadores verde/ámbar/rojo con umbrales por tenant.
- Estados `QUEUED → ACKNOWLEDGED → IN_PREPARATION → READY → COMPLETED`.
- Control de versión: dos tablets no pueden sobrescribir la misma comanda.
- Aviso inmediato y recuperación por consulta al iniciar/reconectar.
- Reconciliación de respaldo cada 45 segundos aunque Realtime parezca conectado.
- Indicador permanente de conexión y última sincronización; alerta grande después de 75
  segundos sin respuesta.
- Heartbeat por estación y métricas que separan “sistema lento” de “no había tablet”.
- Agotar/reponer productos con actualización inmediata de la carta y auditoría.
- READY deja eventos para comensal y futuro panel del garzón.
- Spool persistente, intentos, DLQ, reimpresión auditada y puerto abstracto de impresora.
- Stub de impresora: no finge que la nube alcanza hardware que aún no fue elegido.

## Base de datos aplicada

- `20260728215457_sprint_04_kds_durability.sql`
- `20260728221735_sprint_04_advisor_fixes.sql`
- `20260728223000_verify_sprint_04_kds.sql`

Las seis tablas públicas nuevas tienen `tenant_id`, RLS habilitado y forzado. Las rutas de
usuario no pueden usar el worker de impresión ni actualizar comandas saltándose la transición
versionada. Los avisos Realtime de producción usan topics privados por tenant/estación.

## Medición de latencia

La prueba abrió un KDS de Barra, confirmó 12 comandas y midió desde confirmación server-side
hasta primera visibilidad:

| Segmento                         | Resultado |
| -------------------------------- | --------- |
| Muestras con KDS conectado       | 12        |
| p50                              | 64 ms     |
| p95                              | 103 ms    |
| p99                              | 105 ms    |
| Confirmaciones sin KDS conectado | 1         |

El caso sin pantalla se contó aparte y no entró a los percentiles. El objetivo p95 ≤ 2 s está
**medido y cumplido en laboratorio**. No se presenta como prueba de carga ni como evidencia de
una red real de bar; eso permanece antes del piloto.

## Evidencia

- Playwright: **11/11** recorridos completos verdes.
- Vitest: **37/37** controles verdes.
- TypeScript, lint, formato y build de producción: verdes.
- Security Advisors de Supabase: **0 hallazgos**.
- Performance Advisors: sólo índices sin uso, esperables sin tráfico.
- Verificación remota: esquema durable, RPCs, privilegios mínimos, RLS forzado y policy
  Realtime privada pasaron y quedaron en el historial de migraciones.
- pgTAP: suite de 26 controles versionada. `supabase test db --linked` requiere Docker en la
  CLI actual; como Docker fue descartado, la verificación remota se ejecutó como migración que
  falla y revierte si una aserción no se cumple.

## Lo que sigue abierto

- Elegir cómo la nube alcanza la impresora física: agente local, servicio administrado o
  impresora cloud.
- Probar Broadcast privado con cliente autenticado, carga y redes representativas del piloto.
- Integrar una pasarela real sólo al final del proyecto, según ADR-001.
