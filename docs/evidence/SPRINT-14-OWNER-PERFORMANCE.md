# Sprint 14 — Rendimiento del panel Dueño

Medición reproducible con Google Chrome, viewport 360 × 740, CPU 4×, red 4G lenta
(1,6 Mbps, 750 Kbps subida, 150 ms de latencia), caché desactivada y service worker bloqueado.
Cada estado se midió siete veces contra un build de producción local.

| Métrica                      | Antes     | Después   | Cambio |
| ---------------------------- | --------- | --------- | ------ |
| Utilizable p50               | 2.025 ms  | 2.105 ms  | +4,0%  |
| Utilizable p95               | 2.106 ms  | 2.162 ms  | +2,7%  |
| Utilizable p99               | 2.121 ms  | 2.180 ms  | +2,8%  |
| `load` p50                   | 1.453 ms  | 1.488 ms  | +2,4%  |
| `load` p95                   | 1.498 ms  | 1.519 ms  | +1,4%  |
| Primer contenido visible p50 | 744 ms    | 820 ms    | +10,2% |
| Primer contenido visible p95 | 776 ms    | 852 ms    | +9,8%  |
| Transferencia p50            | 200.871 B | 207.113 B | +3,1%  |
| Transferencia p95            | 202.637 B | 208.881 B | +3,1%  |

La puerta acordada observa p95 utilizable, `load` y transferencia: las tres variaciones quedan
por debajo del 5%. El primer contenido visible aumentó 76 ms y sigue bajo 0,9 s; se registra
sin ocultarlo, aunque no dispara rollback porque el panel completo se vuelve utilizable dentro
del presupuesto.

La primera implementación transfería unos 257 KB. Se corrigió antes de aceptar el resultado:
la familia estática se reemplazó por un único WOFF2 variable latino autohospedado y se retiró
del runtime una utilidad de combinación de clases que el piloto no necesitaba.

Datos completos:

- `SPRINT-14-OWNER-BASELINE.json`
- `SPRINT-14-OWNER-AFTER.json`
- `SPRINT-14-OWNER-A11Y.json`
