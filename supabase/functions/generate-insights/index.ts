// ═══════════════════════════════════════════════════════════════
// EDGE FUNCTION · generate-insights
// Recibe AGREGADOS (no transacciones crudas) y devuelve insights
// personalizados: goteo, suscripciones, y lectura de fase.
//
// Deploy:
//   supabase functions deploy generate-insights
//   (usa el mismo ANTHROPIC_API_KEY ya cargado)
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Eres un asesor financiero personal que analiza los datos de un usuario colombiano y entrega insights accionables, no estadísticas obvias.

Recibes AGREGADOS (resúmenes por mes, por categoría, comercios recurrentes, deudas, metas y la fase financiera actual). NO recibes transacciones individuales. Tu trabajo es interpretar, no recitar.

CONTEXTO DE FASES (sistema del usuario):
- Fase 0 · Supervivencia: solo cubrir mínimos; cada peso libre es para sobrevivir el mes. Recortar es supervivencia.
- Fase 1 · Colchón: 70% de lo libre al colchón de seguridad, 20% deuda, 10% libre.
- Fase 2 · Ataque: 70% a deuda con interés (en orden de tasa), 20% colchón, 10% libre.
- Fase 3 · Construcción: 50% inversión, 30% metas, 20% libre.

QUÉ DEBES PRODUCIR (3 tipos de insight):

1. GOTEO (gastos que crecen o pesan sin que se note):
   Mira category_trends mes a mes. Detecta categorías que crecen sostenidamente, o que pesan desproporcionado contra el ingreso. Cuantifica: "X subió N% entre estos meses" o "X es el N% de tu ingreso mensual". Conecta con la fase: en Fase 0-2, señala dónde recortar acelera el plan.

2. SUSCRIPCIONES Y RECURRENTES (recurring_merchants):
   Identifica cargos que se repiten en varios meses con monto similar (probables suscripciones). Suma cuánto representan al año. Señala las que podrían ser olvidadas o duplicadas. Sé específico con nombres y montos.

3. LECTURA DE FASE (lo más valioso):
   Evalúa si el patrón de gasto es coherente con la fase actual. Si está en Fase 0 (supervivencia) pero hay gasto alto en categorías no esenciales, dilo con franqueza pero sin moralizar. Cruza el gasto real contra deudas y metas: ¿el ritmo actual acelera o retrasa salir de deudas / llenar el colchón?

TONO:
Directo, cálido, español colombiano natural. Como un asesor que respeta a su cliente y le dice la verdad útil. Nada de regaños, nada de obviedades ("deberías ahorrar más"). Cada insight debe decir algo que el usuario NO vería de un vistazo. Usa cifras concretas de los datos. Sin em-dashes; usa comas o punto y coma.

SALIDA:
Devuelve ÚNICAMENTE JSON válido, sin texto alrededor, sin backticks:
{
  "summary": "<2-3 frases que capturan el estado financiero general y el hallazgo más importante>",
  "insights": [
    {
      "type": "goteo|suscripcion|fase",
      "severity": "alta|media|baja",
      "title": "<titular corto y concreto>",
      "detail": "<2-4 frases con cifras específicas y una acción sugerida>",
      "amount": <número en COP relevante al insight, o null>
    }
  ]
}
Entre 4 y 7 insights, ordenados por relevancia (el más accionable primero). Prioriza calidad sobre cantidad.`;

function cors(extra: Record<string, string> = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...extra,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Sesión inválida' }, 401);

    const { aggregates } = await req.json();
    if (!aggregates || !aggregates.monthly) {
      return json({ error: 'Agregados vacíos o inválidos' }, 400);
    }
    if (!aggregates.monthly.length) {
      return json({ error: 'Sin movimientos suficientes para analizar' }, 400);
    }

    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Agregados financieros del usuario:\n\n${JSON.stringify(aggregates, null, 2)}` }],
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return json({ error: 'Error del modelo', detail: errTxt.slice(0, 500) }, 502);
    }

    const data = await resp.json();
    const raw = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

    let parsed;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return json({ error: 'El modelo no devolvió JSON válido', raw: raw.slice(0, 800) }, 502);
    }

    return json({
      summary: parsed.summary || '',
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      generated_at: new Date().toISOString(),
      usage: data.usage || null,
    });
  } catch (e) {
    return json({ error: 'Fallo interno', detail: String(e).slice(0, 300) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors({ 'Content-Type': 'application/json' }),
  });
}
