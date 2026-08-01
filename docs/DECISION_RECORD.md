# Registro de cambios a decisiones congeladas

Las decisiones congeladas solo se cambian con evidencia fuerte y aprobación explícita. Las
decisiones técnicas normales viven en `docs/adr/`.

## Estado

No hay cambios aprobados a las decisiones congeladas. Existe una desviación de implementación
detectada y en corrección; la decisión original de ADR-000 se mantiene.

## 2026-08-01 — OI-027: historial de migraciones editado después de aplicado

- **Decisión afectada:** ninguna decisión congelada cambió de fondo — esto es un incidente de
  proceso, no una propuesta de cambio de stack ni de arquitectura. Se registra aquí porque el
  fundador pidió dejar constancia de la causa y de la práctica que lo evita, con el mismo nivel
  de visibilidad que una desviación de ADR.
- **Qué se encontró:** 13 archivos de migración de Sprints 11-13 fueron renombrados a otros
  timestamps en el repositorio local sin correr `supabase migration repair`, así que la tabla de
  control de la base real (`supabase_migrations.schema_migrations`) quedó con los timestamps
  viejos — mismo contenido, distinta etiqueta. Por separado, el archivo
  `20260729174339_sprint_09_credit_open_limit.sql` fue editado después de haber sido aplicado
  con éxito: sus literales `E'...\n'` (barra invertida simple, salto de línea real) quedaron como
  `E'...\\n'` (barra invertida doble, texto literal) — probablemente al pasar el contenido por
  una capa extra de escapado. Ninguna de las dos ediciones se volvió a aplicar contra la base
  real, porque Supabase no reaplica una versión que ya figura en la tabla de control.
- **Causa:** no existía una regla explícita contra editar o renombrar un archivo de migración
  después de que ya corrió contra un ambiente real. Sin esa regla, una edición "de prolijidad"
  (reordenar timestamps, corregir formato) puede divergir en silencio de lo que la base
  efectivamente tiene, y nada lo detecta hasta que algo como el CI de reproducibilidad de
  esquema falla.
- **Impacto:** el CI de reproducibilidad de esquema (`schema-reproducibility.yml`) falló 4 veces
  seguidas. Verificado con acceso de solo lectura a la base real que **no hubo impacto
  funcional**: el contenido efectivamente aplicado en producción era correcto en ambos casos
  (mismas migraciones de Sprint 11-13 con otro nombre; el control de tope de exposición de
  crédito de `sprint_09_credit_open_limit` sí está activo en `private.open_table_credit`). El
  daño fue enteramente a la capacidad de reconstruir el esquema desde cero, no al esquema en sí.
- **Acción aprobada:** reconciliar la tabla de control con `supabase migration repair`
  (metadatos únicamente, verificado que no toca tablas ni funciones) y restaurar
  `sprint_09_credit_open_limit.sql` al contenido exacto que ya corrió con éxito en producción
  (verificado byte a byte contra el SQL guardado en la propia tabla de control). Evidencia
  completa, incluida la comparación de esquemas, en
  `docs/evidence/OI-027-DIAGNOSIS-AND-FIX-2026-08-01.md`.
- **Prevención:** `AGENTS.md` incorpora desde ahora la regla de no renombrar, reordenar ni editar
  el contenido de una migración que ya fue aplicada a un ambiente real, sin antes sincronizar la
  tabla de control con `supabase migration repair` — y de verificar esa sincronización con
  `supabase migration list` antes de dar por cerrado cualquier trabajo sobre `supabase/migrations/`.
- **Aprobación:** fundador, 2026-08-01.

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
