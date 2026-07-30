# Registro de cambios a decisiones congeladas

Las decisiones congeladas solo se cambian con evidencia fuerte y aprobación explícita. Las
decisiones técnicas normales viven en `docs/adr/`.

## Estado

No hay cambios aprobados a las decisiones congeladas. Existe una desviación de implementación
detectada y en corrección; la decisión original de ADR-000 se mantiene.

## 2026-07-29 — Desviación detectada de ADR-000

- **Decisión afectada:** stack de UI aprobado en ADR-000: Tailwind CSS, Radix Primitives y
  componentes propios basados en shadcn/ui.
- **Qué se encontró:** esos elementos nunca se instalaron. Las superficies visibles se
  construyeron con CSS manual y componentes separados, sin que la omisión se declarara en los
  summaries de los sprints que empezaron a usar la UI.
- **Causa:** faltó verificar, al cierre de cada sprint, que la decisión aprobada estuviera
  presente en la implementación real. La revisión se concentró en funcionamiento y pruebas de
  negocio.
- **Impacto:** la auditoría encontró 135 colores, 82 tamaños tipográficos y 412 declaraciones
  de espaciado fuera de escala, además de objetivos táctiles inconsistentes. Esto elevó la
  deuda visual y el riesgo de accesibilidad.
- **Acción aprobada:** implementar ahora la decisión original, empezando por tokens semánticos,
  shell común y el panel Dueño como piloto. No es una nueva dependencia ni un cambio de stack.
- **Prevención:** `AGENTS.md` exige desde ahora verificar cada ADR usado contra el código antes
  de cerrar el sprint y declarar cualquier implementación pendiente en el summary.
- **Aprobación:** fundador, 2026-07-29.

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
