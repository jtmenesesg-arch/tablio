# Sprint 14 — Evidencia Supabase

- **Proyecto:** `xmwewmukoxdeuilmkahr`
- **Fecha:** 1 de agosto de 2026
- **Migraciones remotas confirmadas:** `20260731213000`, `20260731213200`,
  `20260731213300`

## pgTAP

La suite `014_tables_qr_presence.test.sql` terminó sus 32 aserciones. Para ejecutarla sin
persistir fixtures ni una migración exclusiva de pruebas, se envolvió en una transacción y,
después de validar `extensions.finish()`, se levantó deliberadamente
`TABLIO_PGTAP_OK_32`. PostgreSQL revirtió toda la transacción. El sentinel es la evidencia de
éxito; cualquier aserción roja habría levantado el detalle pgTAP en su lugar.

La suite cubre, entre otros puntos:

- RLS entre tenants y fail-closed sin claim;
- creación unitaria y masiva;
- secretos recuperables sólo desde Vault;
- bloqueo temporal y auditoría de intentos;
- rotación/regeneración/revocación;
- cambiar el nivel de presencia sin invalidar el QR existente.

## Advisors antes y después

| Advisor | Antes del hardening | Después |
| --- | ---: | ---: |
| Security atribuible a Sprint 14 | 0 | 0 |
| Claves foráneas sin índice atribuibles a Sprint 14 | 3 | 0 |
| Security histórico | 6 WARN + 3 INFO | 6 WARN + 3 INFO |

Los tres índices agregados cubren `updated_by_user_id` en configuración por tenant y zona, y
`created_by_user_id` en rotaciones. El Advisor informa que todavía no fueron usados porque se
crearon en una base sin tráfico de esta función; eso no es un defecto de seguridad ni de
integridad.

## Historial de migraciones

El comando directo desde el repositorio reveló timestamps distintos para migraciones remotas
de Sprints 11–13. Para no reescribir historia ni ejecutar DDL repetido, se descargó el historial
remoto en un directorio temporal y se confirmó en seco que únicamente se aplicarían las tres
migraciones de Sprint 14. OI-027 conserva el trabajo pendiente de reconciliación canónica.
