# Fase B · Importar extractos con IA

Sube un PDF de extracto (Nu, Banco de Bogotá, Global66, u otro banco), y la app lo lee, normaliza los movimientos con las tres reglas que definimos, y te los muestra para revisar antes de guardar.

## Cómo funciona (privacidad)

1. El PDF se abre **en tu navegador**; PDF.js extrae el texto ahí mismo.
2. Solo el **texto** se manda a tu Edge Function en Supabase. El archivo PDF nunca se sube; tu clave del PDF nunca se guarda.
3. La Edge Function le pasa el texto a Claude (con tu API key protegida en el servidor), recibe los movimientos estructurados, y te los devuelve.
4. Revisas en pantalla, editas lo que quieras, descartas duplicados, y confirmas. Solo entonces se guardan.

## Las tres reglas aplicadas

1. **Impuestos y comisiones se fusionan** al movimiento que los originó. Un retiro de Global66 de $40.000 + IVA + comisión entra como un solo movimiento por el total. Nada de filas sueltas de "4x1000" o "IVA".
2. **Pares que se anulan se descartan** (ambos). Compra + reembolso del mismo monto en Nu, o los holds de Uber en Global66, no entran.
3. **Transferencias entre tus cuentas** (Nu→Davivienda, Bogotá→Avvillas, Transfiya a ti mismo, pagos PSE a entidades financieras) se marcan como categoría "Transferencias" y se excluyen del gasto.

---

## Configuración (una sola vez, ~10 min)

Necesitas la **Supabase CLI** para desplegar la Edge Function.

### Paso 1 · Instala la CLI de Supabase

En Mac (con Homebrew):
```bash
brew install supabase/tap/supabase
```
Sin Homebrew, o en otro sistema: https://supabase.com/docs/guides/cli

Verifica: `supabase --version`

### Paso 2 · Conecta la CLI a tu proyecto

```bash
cd finanzas-app
supabase login          # abre el navegador para autorizar
supabase link --project-ref TU_PROJECT_REF
```

> Tu `PROJECT_REF` está en la URL de tu proyecto Supabase: `https://supabase.com/dashboard/project/XXXXXXXX` → ese `XXXXXXXX` es el ref. También aparece en Project Settings → General.

### Paso 3 · Carga tu API key de Anthropic como secreto

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-tu-key-aqui
```

> Esto guarda la key en el servidor de Supabase, cifrada. Nunca queda en el código ni en el navegador. La key es la de console.anthropic.com (la de API/desarrollador), no tu suscripción de chat.

### Paso 4 · Despliega la función

```bash
supabase functions deploy parse-statement
```

Debe terminar con "Deployed Function parse-statement". Listo.

### Paso 5 · Redeploy de la app en Vercel

La app ya trae el botón "⬆ Importar extracto" en la vista Movimientos. Solo necesitas que Vercel tome el código nuevo:

```bash
git add -A
git commit -m "Fase B: importar extractos"
git push
```

Vercel redespliega solo al detectar el push.

---

## Usarlo

1. En la app → **Movimientos** → **⬆ Importar extracto**.
2. Sube el PDF. Si está protegido (Nu lo está), te pide la clave (tu cédula); no se guarda.
3. Espera unos segundos mientras lo procesa.
4. Revisa la tabla: cada fila tiene checkbox (incluir/excluir), y el botón ✎ para editar fecha, descripción, categoría o monto. Los posibles duplicados vienen marcados en amarillo y **desmarcados** por defecto.
5. **Importar N movimientos**. Entran a tu tracker como transacciones normales.

## Costos

Cada extracto procesado es una llamada a la API de Claude. Para extractos personales, una fracción de centavo cada uno. Con USD $5 de saldo en tu cuenta de Anthropic procesas extractos por meses.

## Límite conocido

Por ahora solo PDFs **con texto seleccionable** (los tres que probaste lo son). Si subes un extracto escaneado (una imagen), la app te avisa que no pudo extraer texto. El soporte de escaneados (visión) queda para una fase futura, como acordamos.

## Si algo falla

- **"No se pudo extraer texto"**: el PDF es una imagen escaneada, o la clave es incorrecta.
- **"Error del modelo"**: revisa que la API key esté bien cargada (`supabase secrets list` debe mostrar `ANTHROPIC_API_KEY`) y que tengas saldo en console.anthropic.com.
- **El parsing se ve raro en algún banco**: la pantalla de revisión existe justo para eso; corrige las filas a mano antes de confirmar, y cuéntame qué banco y qué columna falló para afinar el prompt.

---

# Insights con IA (añadido)

La vista **Insights** ahora tiene dos partes: estadísticas (gasto, tendencia, top categorías) con selector de año, y un **análisis personalizado con IA** que detecta goteo, suscripciones, y evalúa si tu gasto va acorde a tu fase.

## Qué hace distinto

- La IA recibe **agregados** (resúmenes por mes y categoría, comercios recurrentes, tus deudas y metas), nunca tus transacciones individuales. Más barato, más rápido, y no expone cada compra.
- El resultado se **cachea** en Supabase. No se regenera al abrir la pestaña; solo cuando hay movimientos nuevos (la app te avisa "tienes movimientos nuevos, regenera") o cuando tocas "Regenerar".

## Configuración adicional (una sola vez)

Ya tienes la API key cargada de la Fase B. Solo falta crear la tabla de caché y desplegar la segunda función.

**1. Crea la tabla de caché.** En Supabase → SQL Editor, pega y corre el bloque nuevo que está al final de `supabase/schema.sql` (la tabla `insights_cache` con su RLS). Si prefieres, corre todo el `schema.sql` de nuevo; usa `create table if not exists`, así que no rompe lo existente.

**2. Despliega la función de insights:**
```bash
npx supabase functions deploy generate-insights
```

**3. Sube el código y deja que Vercel lo tome:**
```bash
git add -A
git commit -m "Insights con IA + fix selector de año"
git push
```

## Costo

Cada análisis es una llamada a Claude, fracción de centavo. Gracias al caché, no pagas por abrir la pestaña; solo cuando regeneras con datos nuevos. Para uso personal, despreciable.

## El fix del año

La vista antes filtraba por 2026 quemado en el código, por eso se veía vacía si tenías datos de 2025. Ahora tiene selector "Todo el histórico / 2025 / 2026" y la tendencia se grafica sobre todos los meses con datos, no sobre un año fijo.
