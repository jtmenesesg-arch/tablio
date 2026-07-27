# Tablio — Backlog y decisiones posteriores al congelamiento

> Complemento de `TABLIO_PRODUCT_BUSINESS_BRIEF_v2.2_FROZEN.md`.
> **Nada de este documento modifica el brief congelado.** Son ideas, hipótesis y
> decisiones de diseño que se le pasan al CTO para que él decida cuáles suben a
> ADR o a Decision Record. Fecha: julio 2026.

---

## 1. Decisiones de producto a resolver (van al CTO)

### 1.1 Mesas unidas / grupos grandes
**Situación:** llegan 15 personas y juntan 3 mesas. Cada uno escanea el QR que tenga cerca.

**Qué NO se rompe:** la plata. Cada persona paga lo suyo sin importar qué QR escaneó.
No hay cuenta compartida que fusionar. Esto es prueba de que la decisión congelada
("la mesa es contexto físico/operativo, no cuenta financiera compartida") estuvo bien tomada.

**Qué sí se rompe:** la entrega (el garzón busca a alguien en una mesa larga) y la
visibilidad del dueño (ve 3 sesiones sueltas en vez de un grupo de 15).

**Solución propuesta:** acción **"Unir mesas"** en el panel del garzón/cajero.
Juntar mesas ya es un evento físico que alguien del local hace; ese es el momento natural
de tocar "unir Mesa 5+6+7". Es un toque sobre trabajo que ya ocurre, no trabajo nuevo.
Crea el concepto de **sesión de grupo** que agrupa sesiones de mesa.

**Descartado:** que el garzón lleve una tarjeta/QR a cada mesa. Es trabajo recurrente en
el peor momento, reintroduce al garzón en la toma de pedido y repite el error del doble QR.

**Clave de diseño:** si nadie une nada, **igual funciona**. Unir mesas mejora claridad,
no es requisito. Degrada bien.

**Detalle:** en grupos grandes, permitir que el alias sea el nombre real
("José · Pedido 042") en vez del alias generado, para facilitar la entrega.

**Nota comercial:** la mesa de 15 no es un caso borde — es el mejor ejemplo de venta.

---

### 1.2 Cobro del SaaS y morosidad
**Restricción de base (viene de Modelo A):** el bar recibe su plata directo; Tablio nunca
custodia fondos → **no se puede descontar el fee del flujo de transacciones**. Se cobra aparte.
(Un split automático en la pasarela probablemente convierte a Tablio en facilitador de pagos
y reabre el riesgo regulatorio que Modelo A evitó. Si se considera, va como Decision Record.)

**Cómo cobrar:**
- Setup **por adelantado**, siempre.
- Mensualidad con **cargo recurrente automático** (PAT/Oneclick de Transbank o suscripción
  de Mercado Pago) + factura. Evita la fricción del "te transfiero cuando me acuerde".
- La mayoría de los cobros fallidos son tarjetas vencidas o sin cupo, no falta de voluntad
  → reintentos automáticos + aviso previo recuperan la mayoría sin gestión manual.
- Considerar descuento por pago semestral/anual (menos cobranza, caja adelantada).

**Escalera de morosidad (regla crítica: NUNCA cortar en medio de un viernes):**
1. Aviso 3-5 días antes del cobro.
2. Reintentos automáticos con notificación.
3. Gracia de 7-10 días con avisos visibles en panel de admin y dueño.
4. **Degradación administrativa**: bloquear reportes, generar QRs nuevos, editar carta.
   Molesta al dueño pero **el bar sigue vendiendo**.
5. Suspensión del flujo de pedidos: solo al final, con aviso escrito previo y
   **agendada en horario muerto** (lunes mediodía, jamás viernes de noche).

**Regla no negociable:** el comensal nunca ve nada de esto. Ninguna pantalla puede decir
"este bar no pagó". Humillar al cliente frente a sus clientes es la peor jugada.

**Por qué importa:** Tablio está en la ruta de la plata. Cortarle a un bar un viernes 23:30
le quita ingresos, y una sola historia de "Tablio nos dejó botados" mata la reputación en
toda la comuna.

**Se vende:** decirle al dueño desde la primera reunión "nunca te cortamos en medio de una
noche" le quita el miedo de poner su caja en manos de un tercero nuevo.

**Pendiente:** condiciones de pago, gracia y suspensión deben quedar en el contrato de
servicio. Revisar con abogado antes del primer cliente.

---

### 1.3 Venta y reembolso de prueba en el onboarding (penny test)
**Qué comprueba la venta de prueba:**
- Que las credenciales funcionan **en producción** (sandbox no garantiza nada).
- Que el dinero cae en la cuenta de **ESE** bar → lo más crítico bajo Modelo A; verifica que
  no se está mandando plata de un tenant a la cuenta de otro.
- Que la confirmación server-side llega al backend con firma válida, monto y moneda correctos.
- Que la cadena completa corre: CheckoutQuote → pago → confirmación → pedido → KDS.

**Qué comprueba el reembolso de prueba:** que la ruta de reembolso funciona **antes** de
necesitarla. Descubrir un viernes lleno que no se puede reembolsar es el peor escenario.

**Dos caminos, probar ambos:**
- **Anulación/reversa el mismo día:** más limpia, normalmente sin comisión ni ruido contable.
- **Reembolso propiamente tal:** ensucia más, pero prueba la ruta real de reembolso.

**Trampas a resolver antes:**
- **Boleta:** si el DTE ya está conectado, la venta de prueba puede emitir boleta real y el
  reembolso requiere nota de crédito. Definir un modo de onboarding que no emita DTE, o
  manejar la anulación correctamente.
- **Comisión:** la pasarela puede no devolver su comisión en un reembolso (despreciable con
  montos mínimos, pero hay que saberlo).
- **Flag de transacción de prueba:** obligatorio, para que no contamine reportes del bar,
  GMV ni conciliación.

**Decisión fina:** reembolsar al tiro impide verificar el paso 6 (que el monto aparezca en la
liquidación real). Para el primer bar, esperar la liquidación al menos una vez.

**Destino:** es material del **spike de pasarelas**; sale como ADR de onboarding.

---

### 1.4 Importador de carta + onboarding ágil
**Por qué tiene prioridad distinta a las otras ideas:** no es una feature de cliente, es una
**palanca operativa**. El cuello de botella de crecimiento no es vender, es instalar
(2-4 locales/mes solo). Cada hora que se le quite al onboarding sube el techo mensual.

**Importar carta desde PDF / link / Drive / foto:**
- El texto (nombres, descripciones, precios, categorías) se extrae bien.
- **Nunca publicar sin revisión humana.** Un precio mal leído ($6.900 → $900) es plata perdida
  en producción. Flujo obligatorio: importar → pantalla de revisión y corrección → publicar.
  Esa pantalla de revisión es tan importante como el importador.
- **Las imágenes son el problema, no el texto:** fotos en PDF vienen en baja resolución y la
  mayoría de los bares chicos no tienen fotos. Salidas: Instagram del local, sesión rápida con
  celular durante la instalación, o lanzar sin fotos y agregarlas después.

**Repartir la carga del onboarding en tres:**
1. **Lo que hace el software solo:** importar carta, generar QRs, estructura de categorías por
   defecto, validación de datos.
2. **Lo que hace el cliente antes de que llegues** (portal de preparación con checklist y
   progreso): subir carta y fotos, indicar mesas y zonas, datos tributarios, conectar su cuenta
   de comercio con link guiado.
3. **Lo que solo puede hacer Tablio y NO conviene automatizar:** venta y reembolso de prueba
   (verificar que la plata llega a la cuenta correcta), capacitación del equipo, acompañar la
   primera noche.

**Advertencia:** el trabajo hands-on es parte del foso — es lo que separa a Tablio de la app de
menú QR gratis y justifica cobrar setup. Si se automatiza todo y encima se cobra instalación,
el dueño siente que paga por nada.

**Reencuadre del setup:** no se paga por cargar datos, se paga por **dejar el cobro funcionando
y acompañar la primera noche**.

**Impacto estimado:** onboarding de 1 día → un par de horas en el local. Techo mensual de
~3 locales → 6-8.

**Validar en las llamadas:** cómo tienen la carta hoy ("un PDF que me hizo un amigo",
"solo un pizarrón"). Define cuánto sirve el importador antes de construirlo.

---

## 2. Backlog de features (NO son v1)

Filtro que las generó: *¿qué sabe Tablio que ningún otro sistema del bar sabe?*
Sabe **quién** es cada persona (por su medio de pago), **qué** pidió, **cuándo** y
**cuánto tarda en volver**. Todo lo bueno sale de ahí.

### Del dominio de identidad (fidelización)
- **"Tu de siempre":** al escanear aparece "¿Lo mismo de siempre? Schop Kross + papas".
  Un toque y pagó. Menos esfuerzo y más impacto: sube frecuencia y ticket sin regalar nada.
- **Sellos digitales:** a la 5ª visita, un schop (idea original del fundador). Ventaja sobre la
  tarjeta de papel: no se pierde ni se falsifica.
- **Recuperar al que se fue:** "No vienes hace un mes, tienes un trago esperándote".

### Del momento del pago (lo más rentable y casi gratis de construir)
- **Upsell en el checkout:** "¿Le sumas papas por $3.900?" justo antes de pagar. Es el instante
  de mayor conversión de la noche (la tarjeta ya está lista) y es margen puro.
  **Si hubiera que elegir una sola feature extra, es esta.**
- **Invitar un trago a otra mesa.**

### De la data en vivo
- **Happy hour dinámico:** el dueño ve el martes vacío a las 20:00 y activa 2x1 con un toque;
  aparece al instante en todas las cartas. Vender las horas malas es un dolor real.

### Del flujo de caja
- **Saldo prepagado / giftcard del bar:** "Carga $20.000 y te damos $23.000". Adelanto de caja
  puro y amarra al cliente.

### Para el equipo
- **Propina digital por garzón:** el cliente elige a quién va. Motiva al equipo y convierte al
  garzón en aliado de la adopción en vez de alguien que siente que el sistema lo reemplaza.

**Por qué la fidelización importa comercialmente:** cambia el pitch de *ahorro y control*
("menos fuga, menos fila") a *más ingresos* ("tus clientes vuelven más seguido"). Un dueño
compra ingresos con mucha menos resistencia. Podría ser el gancho de entrada y el anti-fraude
el argumento de cierre. **Validar cuál duele más en las llamadas.**

**Por qué encaja con Tablio y es difícil de copiar:** una tarjeta de papel no sabe quién eres;
un POS tampoco (sabe que la *mesa 8* consumió, no que *Camila* volvió por 5ª vez). Tablio sí,
porque cada persona paga con su propio medio. La identidad cae sola del flujo congelado, sin
pedirle registro a nadie.

**Lo que arrastra (por eso no es v1):** reglas de promo (productos aplicables, vencimiento, tope
por visita), costo del regalo en margen, tratamiento tributario del producto regalado, cómo entra
en la conciliación que promete "explicar cada peso", y consentimiento para asociar pagos a una
persona (toca el ADR abierto de Oneclick, porque los tokens son por comercio).

---

## 3. Verticales futuros

### 3.1 Cafeterías de especialidad independientes (no cadenas)
**Estado: expansión futura, NO cambio de ICP.** Se registra igual que "modo restaurante" y
"eventos" en el brief.

**Por qué es candidato natural:** la fidelización pesa más ahí que en bares — hábito casi diario,
ticket bajo, altísima frecuencia. **La tarjeta de sellos de cartón ya existe** en casi toda
cafetería independiente: el dueño ya está convencido del mecanismo y ya lo paga; no hay que
educar a nadie. "Tu de siempre" brilla más que en bar porque la gente pide lo mismo cada día.

**Por qué NO es el beachhead hoy:** el "cobra antes de servir" pierde fuerza (en café ya se paga
en el mostrador → el anti-fraude no es dolor); la fila es corta; el ticket bajo (~$5.000) hace
que la mensualidad pese proporcionalmente mucho más; el volumen no se acerca al de un bar lleno
un viernes; y el mercado de "lealtad para cafeterías" tiene varios jugadores.

**Lo único que hay que hacer HOY (barato ahora, caro después):** decirle al CTO que **no
hardcodee supuestos de bar** en el modelo — no asumir que siempre hay mesa con QR, que siempre
hay dos estaciones (barra/cocina), ni que el flujo es nocturno. Si catálogo, estaciones y modos
son configurables por tenant (que ya es la idea del multi-tenant congelado), entrar a cafeterías
es configuración, no reescritura.

**Orden natural:** bares → dominio de fidelización → cafeterías. La fidelización es el puente:
al construirla para bares ya se tiene el ~80% de lo que un café necesita.

**Si se quisiera mover antes:** toca una decisión congelada (el ICP), así que requiere
**Decision Record con evidencia**, no solo entusiasmo.

---

## 4. Expectativa de tiempo a 50 clientes (estimación, no promesa)

- **Construir el producto:** 3-6 meses (pagos, conciliación, multi-tenant, boleta SII; un bug
  cuesta plata real, no se puede apurar).
- **Primeros 3 pilotos:** 1-3 meses. Los más lentos: sin casos, sin testimonios, sin track record.
- **De 3 a 50:** aquí está el nudo, **y no es la venta, es la instalación.**

**El freno real:** cada cliente pide cargar carta, fotos, QRs, conectar cuenta de comercio, venta
de prueba, reembolso de prueba, capacitación y acompañar las primeras noches. Solo → **2-4 locales
al mes máximo**. 50 ÷ 3 = **~17 meses de pura instalación**. Y hay que vender ~60 para *tener* 50
activos (churn).

**Rango total con buena ejecución: 18-30 meses.** Si todo sale muy bien (producto pega, boca a
boca, contratar a alguien para instalar): 12-15. Si el dolor no está donde creemos: puede no
pasar con este producto.

**Contexto:** 50 locales × ~$100k/mes ≈ $5M/mes. Es un negocio real, pero es el piso desde donde
se construye, no riqueza.

**Qué acorta los plazos, en orden de impacto:**
1. **Los primeros 3 casos con números medidos** ("subieron ticket 18%, sacaron un garzón el
   viernes, cero fugas en 2 meses"). La venta deja de ser fe y pasa a ser aritmética.
2. **Densidad geográfica:** una comuna. Los dueños se conocen y se copian; 3 en Ñuñoa y el 4º
   llama solo. Además ahorra traslados en instalaciones.
3. **Simplificar la instalación** (ver 1.4). La palanca menos glamorosa y la más determinante.

**Clave:** el reloj no corre desde hoy. Corre desde la primera conversación con un dueño.

---

## 5. LO PENDIENTE MÁS IMPORTANTE

**No se ha hablado con ningún dueño de bar.** Existe la lista de 50 contactos
(`Bares_Santiago_50.csv`) y aún no hay una sola conversación.

Todo el producto asume que "fila, fuga y falta de garzón" está en el top-3 de dolores de un
dueño de bar chileno. **Eso no está confirmado.**

**Preguntas para las llamadas:**
1. ¿Qué usan hoy? (Toteat/Fudo → hay que ganarle a un módulo que ya pagan. Nada/papel →
   se vende digitalización.)
2. ¿"Fila / fuga / falta de garzón" está en su top-3 de dolores, o pesa más otra cosa
   (comisiones de delivery, merma, no-shows)?
3. ¿Pagarían setup + mensualidad por prepago sin fuga?
4. **¿Qué duele más: que la gente se vaya sin pagar y la fila del finde, o que sus clientes
   vuelvan más seguido?** (define si el wedge de venta es anti-fraude o fidelización)
5. ¿Cómo manejan hoy los grupos grandes / juntar mesas?
6. ¿Cómo tienen la carta hoy? (define cuánto sirve el importador)
7. Si se meten 5 cafeterías: ¿tienes tarjeta de sellos? ¿te sirve? ¿pagarías por una digital
   que te diga quién vuelve y quién dejó de venir?

---

*Fin. Este documento alimenta al CTO y al BACKLOG.md del repo. No modifica el brief congelado.*
