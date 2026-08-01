# AGENTS.md — Reglas de operación para Codex en Tablio

> Este archivo vive en la raíz del repositorio. **Léelo completo al inicio de cada sesión.**
> Es la fuente de reglas del proyecto. Si algo de lo que vas a hacer contradice este archivo,
> detente y pregunta.

---

## 1. Qué es Tablio

Tablio convierte cada mesa de un bar en un punto de venta. Cada persona sentada escanea el QR
de su mesa, arma su propio pedido y **paga lo suyo** desde su celular. El bar solo produce
pedidos **ya pagados**.

**Unidad atómica del sistema:**

```
persona → carrito → CheckoutQuote inmutable → confirmación de pago server-side
        → pedido → comandas por estación
```

La mesa es un **contexto físico y operativo**, NO una cuenta financiera compartida.

Contexto de uso real: un bar lleno, viernes 23:30. Ruido, poca luz, apuro, gente esperando.

**Documentos de referencia obligatoria:**

- `/brief/TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN.md` — la constitución del producto.
- `/brief/TABLIO_BACKLOG_Y_DECISIONES_POST_FREEZE.md` — decisiones y backlog posteriores.

---

## 2. Decisiones CONGELADAS (no las cambias por tu cuenta)

1. **Prepago individual** es el producto principal. La cuenta abierta ("crédito de mesa") es
   una excepción permisada, nunca el modo por defecto.
2. **Beachhead: bares de alto flujo.** No optimices para restaurante de mantel.
3. **Modelo A:** cada bar es comercio directo ante la pasarela y recibe sus propios fondos.
   **Tablio NUNCA custodia, retiene ni distribuye dinero de las ventas.**
4. **Multi-tenant:** PostgreSQL (Supabase) + `tenant_id` obligatorio + **Row Level Security**.
5. **Nada se produce sin confirmación de pago server-side verificable**, salvo un pedido con
   crédito de mesa explícitamente habilitado, permisado, vigente y dentro de límites en la
   misma transacción. Esa excepción jamás se marca como pagada. El frontend JAMÁS es fuente
   de verdad de un pago.
6. **CheckoutQuote inmutable** antes de iniciar cualquier pago.
7. **Idempotencia:** cero efectos comerciales duplicados ante mensajes repetidos.
8. **Conciliación** hasta el abono real, como dominio central del sistema.
9. **Durabilidad:** colas durables y transactional outbox. **Nada crítico en memoria.**
10. **Producto completo, no MVP.** Se construye por criticidad, sin recortar el alcance final.
11. **Pricing por tamaño del local** (mesas/zonas/estaciones). **SIN fee por transacción**,
    sin `application_fee`, sin split de pagos.

**Si crees que una decisión congelada está equivocada:** NO la cambies. Escribe una propuesta
en `/docs/DECISION_RECORD.md` con evidencia e impacto, y **espera aprobación explícita**.

---

## 3. Stack

**Dado (no se discute):**

- **Supabase** — Postgres, Auth, Realtime, Storage. Usa el **MCP de Supabase** para
  migraciones, consultas, tipos y advisors de seguridad.
- **Vercel** — hosting y despliegue. Usa el **CLI de Vercel**.

**Lo que tú decides y justificas en un ADR:** framework, lenguaje, estructura del proyecto,
librería de UI, estrategia de testing, y **cómo implementas la cola durable + transactional
outbox sobre Supabase** (esta es la decisión técnica más delicada; documéntala bien).

---

## 4. Estándar innegociable en rutas de plata

Aplica a todo lo que toque pagos, pedidos, boletas, reembolsos o datos de tenant.

- **Confirmación server-side:** el estado `CONFIRMED` solo se establece tras verificación
  server-side con la pasarela (webhook firmado, API de confirmación o consulta de estado,
  según el proveedor). Nunca desde el cliente, nunca desde un retorno de navegador.
- **CheckoutQuote inmutable:** congela ítems, variantes, cantidades, precios, descuentos,
  impuestos, propina, total, tenant, mesa, persona y expiración. La conciliación compara
  contra **el snapshot que originó el pago**, jamás contra el menú actual.
- **Idempotencia real:** clave de idempotencia por intento + `provider_transaction_id` único
  - constraint único en base de datos + procesamiento transaccional + transactional outbox
  - consumidores idempotentes. Aunque la confirmación llegue 8 veces, se crea **un** pedido,
    **una** comanda, **una** boleta.
  ```sql
  UNIQUE (payment_provider, merchant_account_id, provider_transaction_id)
  ```
- **Aislamiento multi-tenant probado:** RLS activo, contexto de tenant por request, claves
  únicas compuestas con `tenant_id`, y un **test automático que falle si un tenant puede leer
  o alterar datos de otro**.
  ```sql
  UNIQUE (tenant_id, table_number)
  UNIQUE (tenant_id, product_sku)
  UNIQUE (tenant_id, employee_pin_hash)
  ```
- **Durabilidad:** colas durables, outbox, reintentos con backoff, dead-letter queue, spool de
  impresión persistente. **Jamás existe un modo offline que produzca un pedido cuyo pago no se
  pudo verificar.**
- **Entrega al KDS:** Realtime avisa, PostgreSQL manda y la cola garantiza efectos. El KDS
  nunca depende del polling de la cola para mostrar pedidos confirmados.
- **`service_role` no protege datos:** ignora RLS. Ninguna ruta que responda datos de un
  usuario puede usarla. Las requests de usuario propagan su JWT y un tenant activo validado;
  si falta contexto de tenant, la operación falla cerrada.
- **Auditoría obligatoria** (quién, cuándo, por qué) en: reembolso, anulación, cambio de precio,
  cierre manual, reapertura, impersonación.
- **Tests** de todas las rutas críticas, con explicación en lenguaje simple de qué prueban.
- **Control negativo de RLS:** el test de aislamiento debe demostrarse en rojo quitando
  deliberadamente una política en una base efímera, restaurarla y volver a pasar en verde.

---

## 5. Loop de ingeniería (protocolo obligatorio)

### 5.1 El ciclo

Cada tarea se ejecuta en incrementos. **Un incremento a la vez.** Para cada uno:

1. **Cargar contexto.** Al inicio de cada sesión relee `AGENTS.md`. Antes de tocar un área,
   relee los docs vivos de esa área (`DATA_MODEL.md`, `DOMAIN_MAP.md`, ADRs relevantes).
   Nunca edites algo cuyo estado actual no acabas de verificar.
2. **Declarar el plan.** Antes de escribir código, di en 2-3 líneas qué vas a hacer y cómo
   sabrás que funcionó. Si el plan cambia a mitad de camino, dilo.
3. **Construir** en pasos que dejen el proyecto siempre ejecutable.
4. **Verificar tú mismo** (ver 5.2). No es opcional.
5. **Documentar** en los docs vivos y ADRs.
6. **Reportar** en el formato de la sección 7.
7. **Esperar feedback.** No encadenes incrementos sin revisión.

### 5.2 Puerta de verificación (antes de decir "listo")

Está **prohibido reportar algo como terminado sin haberlo ejecutado.** Antes de reportar:

- Corre el código. No asumas que compila: compílalo. No asumas que la migración aplica:
  aplícala.
- Corre los tests. Si tocaste rutas de plata o multi-tenant, corre además el test de
  aislamiento entre tenants.
- Si tocaste base de datos, corre los **advisors de seguridad de Supabase**.
- Verifica el resultado real contra lo que declaraste en el paso 2.
- Si algo falla, **arréglalo antes de reportar**. Si no puedes, repórtalo como fallo, no
  como éxito parcial.

Nunca escribas "debería funcionar". O lo verificaste, o no está listo.

**Ningún trabajo se considera terminado si su verificación automática está fallando.** Si un CI
falla, se reporta explícitamente como fallo, nunca se omite ni se revierte el push sin dejar
registro. Retroceder `origin/main` requiere quedar documentado en `BUILD_LOG.md` con la razón.

### 5.3 Regla de las dos vueltas

Si un mismo error persiste después de **dos intentos de arreglo**, detente. No sigas
probando variaciones a ciegas.

En su lugar, reporta: qué intentaste, qué error exacto aparece, cuál es tu hipótesis del
problema, y qué opciones ves. El fundador decide. Dar vueltas sin avanzar quema tiempo y
ensucia el repo.

### 5.4 Cuándo DEBES detenerte y preguntar

Detente y pide decisión —no improvises— cuando:

- Una decisión congelada te bloquea o parece equivocada.
- Hay que elegir entre dos caminos con consecuencias distintas de costo, dependencia,
  riesgo o experiencia de usuario.
- La tarea es ambigua o el brief no cubre el caso.
- Vas a introducir una dependencia externa nueva.
- Vas a cambiar algo que afecta plata, datos de tenant o permisos.
- Descubres que algo del brief no es implementable como está escrito.

Formato para pedir decisión:

```
DECISIÓN NECESARIA: <título>
Contexto (simple):
Opción A — <qué implica · costo/riesgo>
Opción B — <qué implica · costo/riesgo>
Mi recomendación: <cuál y por qué>
Qué pasa si no decidimos ahora:
```

### 5.5 Loop de corrección

Cuando el fundador te corrija:

1. Confirma qué entendiste que hay que cambiar, en una línea.
2. Si la corrección revela que una regla faltaba o estaba ambigua, **propón agregarla a
   `AGENTS.md`** para que el error no se repita.
3. Aplica el cambio y vuelve a pasar por la puerta de verificación (5.2).

El repositorio y este archivo deben ir mejorando con cada corrección. Un mismo error no
debería ocurrir dos veces.

### 5.6 Cierre de sprint

Un sprint no se cierra sin:

- Todos los criterios de aceptación verificados **ejecutándolos**, uno por uno.
- Toda decisión aprobada en un ADR que el sprint use debe verificarse contra la implementación
  real antes del cierre. Si falta o quedó parcial, se declara explícitamente en el summary; nunca
  se deja la desviación en silencio.
- Docs vivos actualizados.
- ADRs escritos.
- Tests pasando en CI.
- `SPRINT-XX-SUMMARY.md` escrito para un no-desarrollador, incluyendo **qué quedó abierto**
  y qué riesgos conoces.

Nunca dejes una ruta de pago o de datos a medias o sin test.

---

## 6. Documentos vivos que mantienes

Actualizarlos es parte de la **definición de terminado**, no un extra.

```
/docs/BUILD_LOG.md      ← bitácora: fecha, qué cambió, por qué (lenguaje simple)
/docs/GLOSSARY.md       ← cada término técnico en una línea, en español
/docs/DOMAIN_MAP.md     ← dominios y relaciones
/docs/DATA_MODEL.md     ← tablas, relaciones, claves, RLS, explicado
/docs/DECISION_RECORD.md← cambios a decisiones congeladas (solo con aprobación)
/docs/BACKLOG.md        ← ideas parqueadas; NO desvían el sprint actual
/docs/OPEN_ISSUES.md    ← asuntos abiertos: qué falta, qué evidencia, qué bloquea
/docs/adr/ADR-XXX-*.md  ← una decisión técnica por archivo
/docs/sprints/SPRINT-XX-SUMMARY.md
/README.md              ← cómo levantar y correr el proyecto, escrito para un no-dev
```

**Formato de ADR:** contexto · decisión · alternativas consideradas · consecuencias · estado · fecha.

---

## 7. Cómo reportas (el fundador NO es desarrollador)

Cada entrega termina con:

- **Qué construí** — en negocio y en técnico, en español simple.
- **Cómo verlo funcionar** — pasos y comandos exactos, copiables. Nunca "depúralo tú".
- **Qué probé** y qué resultado dio.
- **Qué decidí** (ADR nuevo si aplica) y **qué queda abierto**.

Prohibida la jerga sin explicar: si un término técnico es inevitable, defínelo en una línea
y agrégalo a `GLOSSARY.md`. Si algo puede afectar plata o datos, **adviértelo antes**.

---

## 8. Higiene del repositorio

- Estructura ordenada y consistente desde el día 1. (El fundador viene de un repo desordenado;
  no lo repitas.)
- Commits con mensajes claros. Sin lógica duplicada. Sin archivos sueltos.
- Secretos en variables de entorno, **nunca** en el repo.
- Explica los pasos de git en simple cuando corresponda.

---

## 9. Qué NO hacer

- No cambiar decisiones congeladas en silencio.
- No custodiar, retener ni dispersar fondos de las ventas.
- No implementar fee por transacción, `application_fee` ni split de pagos.
- No dejar rutas de plata sin idempotencia, sin confirmación server-side o sin test. La única
  excepción es crédito de mesa autorizado según ADR-008, que conserva deuda explícita y
  auditoría en vez de fingir un pago.
- No usar colas en memoria para nada crítico.
- No avanzar varios incrementos sin feedback.
- No entregar código sin el reporte de la sección 7.
- No inflar el alcance del sprint. Lo que sobre va a `BACKLOG.md`.
- No inventar: si algo depende de probar una pasarela real, márcalo como **hipótesis** hasta
  validarlo con evidencia.
