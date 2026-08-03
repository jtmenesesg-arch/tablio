# Accesos para demostrar Tablio

**Lee esto primero: hoy existen DOS cosas separadas, no una.** No están conectadas entre sí.

1. **El piloto real** (`Bar La Virgen`, en la base de datos real de Supabase) — el login
   funciona de verdad, pero el local está **vacío**: sin zonas, sin mesas, sin carta, sin
   personal. Sólo demuestra que el mecanismo de autenticación funciona.
2. **El demo simulado** (todas las pantallas ya migradas visualmente: Dueño, Mesas, Caja, KDS,
   Garzón, Superadmin, Onboarding, Crédito, PWA del comensal) — rico, completo, con datos de
   ejemplo, **sin login**, pero corriendo sobre *stores* en memoria, no sobre la base real ni
   sobre `Bar La Virgen`. Es lo que hay hoy para mostrar de punta a punta.

Ver el punto 2 y 3 de la respuesta del 2026-08-03 en `docs/BUILD_LOG.md` para el porqué de esta
separación — es exactamente lo que se está cerrando con la Tarea 4 en adelante.

## 1. Piloto real — login real, local vacío

| Qué | Valor |
| --- | --- |
| URL | `/login` |
| Correo | `jtmenesesg@gmail.com` |
| Contraseña | `So7nTcLhI8445RKq` (temporal — no hay pantalla para cambiarla todavía, OI-032) |
| Qué vas a ver | Redirige a `/dueno-real`: un panel mínimo de prueba (no es el panel de dueño real) que muestra `$0` en todo, porque `Bar La Virgen` no tiene ventas, mesas ni carta cargada |

No hay nada más que explorar aquí todavía — es la prueba de que el mecanismo funciona, no una
demo de producto.

## 2. Demo simulado — sin login, datos de ejemplo

Todas las URLs de abajo se acceden directo, sin credenciales (excepto donde se indica un PIN).

| Pantalla | URL | Acceso |
| --- | --- | --- |
| Panel del dueño | `/dueno` | Directo, sin login |
| Mesas del dueño | `/dueno/mesas` | Directo, sin login |
| Caja | `/caja` | Directo, sin login |
| KDS (cocina/barra) | `/kds` | Directo, sin login |
| Garzón | `/garzon` | PIN de ejemplo: **2468** (Camila) o **1357** (Diego), después elige zona (**Terraza** o **Barra**) |
| Superadmin | `/superadmin` | Directo, sin login |
| Onboarding | `/onboarding` | Directo, sin login |
| Crédito de mesa | `/credito` | Directo, sin login |
| PWA del comensal | `/mesa/demo-mesa-8` | Código de mesa: **4826** |

La página de inicio (`/`) tiene enlaces directos a todas estas.

## Qué falta para que ambas cosas sean una sola

Ese es exactamente el mapa de incrementos que sigue en `docs/BUILD_LOG.md` — conectar cada una
de estas pantallas del demo simulado a la base real, reemplazando sus *stores* en memoria, y
cargar `Bar La Virgen` con zonas/mesas/carta/personal reales para que el piloto real deje de
estar vacío.
