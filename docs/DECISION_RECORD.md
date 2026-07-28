# Registro de cambios a decisiones congeladas

Las decisiones congeladas solo se cambian con evidencia fuerte y aprobación explícita. Las
decisiones técnicas normales viven en `docs/adr/`.

## Estado

No hay cambios aprobados a las decisiones congeladas.

## Plantilla

```text
Fecha:
Decisión afectada:
Evidencia nueva (spike / entrevista / dato):
Razón del cambio:
Impacto de negocio:
Impacto técnico:
Riesgos:
Aprobación:
```

## Qué pertenece aquí

- Cambiar prepago individual como producto principal.
- Cambiar el beachhead de bares de alto flujo.
- Hacer que Tablio reciba o distribuya fondos.
- Reemplazar PostgreSQL compartido + `tenant_id` + RLS.
- Introducir fee por transacción, `application_fee` o split de pagos.

Una propuesta sin aprobación se registra primero en `OPEN_ISSUES.md`; no modifica el producto.
