# OI-019 explicado sin jerga

Supabase no encontró una fuga demostrada. Advierte que cinco funciones públicas ejecutan una
operación con permisos mayores que quien las llama. Una función aparece dos veces porque puede
llamarla tanto una persona anónima como una autenticada: por eso hay seis advertencias.

| Advertencia                            | Por qué existe                                                            | Riesgo real                                                                       | Cuándo corregir                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Disponibilidad de pedidos, anónimo     | Un QR sin cuenta pregunta sólo si puede pedir y recibe un mensaje neutro. | Bajo hoy; sería alto si mañana devolviera plan, deuda o datos internos.           | Antes de ampliar la respuesta o si deja de ser necesaria para QR anónimo.             |
| Disponibilidad de pedidos, autenticado | La misma pregunta funciona igual aunque exista sesión.                    | Igual al anterior; Supabase cuenta el segundo rol por separado.                   | Junto con la advertencia anónima.                                                     |
| Proponer cambio de plan                | El dueño recalcula y guarda una propuesta en una sola transacción.        | Medio: una validación futura defectuosa podría proponer un plan para otro tenant. | Si cambia permisos/cálculo, o mover implementación a `private` sin romper atomicidad. |
| Iniciar impersonación                  | Soporte entra temporalmente a un tenant con motivo y auditoría.           | Alto: una comprobación debilitada daría acceso privilegiado.                      | Revisión independiente obligatoria antes de producción real y ante cualquier cambio.  |
| Cambiar estado de suscripción          | Superadmin cambia estado e historial juntos.                              | Alto: podría restringir/suspender al local equivocado.                            | Antes de producción real o al cambiar estados/permisos.                               |
| Resumen multi-tenant                   | Superadmin necesita una vista que RLS normal bloquearía.                  | Alto por exposición: una columna nueva podría revelar datos innecesarios.         | Revisar cada campo nuevo y preferir wrapper mínimo `SECURITY INVOKER` si es viable.   |

Las protecciones actuales son `search_path` vacío, grants mínimos, comprobación interna de
tenant/superadmin, motivo y auditoría. No bastan para olvidarse del tema: una función
`SECURITY DEFINER` debe revisarse cada vez que cambia. El criterio final es una revisión de
seguridad antes de dinero real; si no puede demostrarse el permiso mínimo, la implementación
se mueve a `private` y se expone una fachada menos privilegiada.
