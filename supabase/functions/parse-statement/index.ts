// ═══════════════════════════════════════════════════════════════
// EDGE FUNCTION · parse-statement
// Recibe el TEXTO de un extracto (extraído en el navegador con PDF.js),
// lo manda a Claude con instrucciones precisas, y devuelve movimientos
// estructurados. La cédula viaja en el texto pero NO se almacena: la
// función es stateless, no escribe a disco ni a la base.
//
// Deploy:
//   supabase functions deploy parse-statement
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const CATEGORIES = [
  'Comida & Restaurantes', 'Viajes', 'Tech & Suscripciones', 'Compras & Moda',
  'Música & Entretenimiento', 'Transporte', 'Retiros', 'Servicios', 'Ingresos',
  'Transferencias', 'Utilities', 'Salud', 'Deudas', 'Otros',
];

const SYSTEM_PROMPT = `Eres un parser experto de extractos bancarios colombianos. Recibes el texto plano de un extracto (cualquier banco) y devuelves los movimientos normalizados como JSON.

REGLAS DE NORMALIZACIÓN (obligatorias):

1. IMPUESTOS Y COMISIONES SE FUSIONAN AL MOVIMIENTO QUE LOS ORIGINA.
   El 4x1000 (GMF), el IVA de retiros, y las comisiones por retiro NO son movimientos separados. Súmalos al monto del movimiento que los causó, en la misma fila.
   Ejemplo Global66: un retiro de $40.000 + IVA $405,84 + Comisión $2.136 → UN solo movimiento de -$42.541,84 descrito como "Retiro en cajero".
   Ejemplo: una compra de $25.600 con su "Impuesto del 4x1000" de $102,40 → UN movimiento de -$25.702,40.
   Nunca emitas filas cuya descripción sea solo "GMF", "IVA", "Impuesto del 4x1000" o "Comisión por Retiro".

2. PARES QUE SE ANULAN NO ENTRAN (ninguno de los dos).
   Si una compra/cargo tiene un reembolso/reverso del MISMO monto cerca (mismo día o día siguiente, mismo valor), omite AMBAS filas: no fue gasto real.
   Esto incluye: "Reembolso realizado" en Nu, y los pares de "Otro Movimiento" en Global66 que devuelven un hold (un cargo seguido de un abono idéntico, típico de Uber). Detéctalos por monto idéntico y descripción relacionada, y descártalos.

3. TRANSFERENCIAS ENTRE CUENTAS PROPIAS → categoría "Transferencias".
   Envíos a otros bancos del propio titular (Davivienda, Avvillas, Nequi, Scotiabank a nombre de Santiago Chavarro), Transfiya a sí mismo, transferencias con llave/QR a "SANTIAGO CHAVARRO". Marca category="Transferencias". Pagos PSE a entidades financieras (Nu Compañía de Financiamiento) también son "Transferencias" (son pagos de deuda/movimiento de dinero propio, no consumo).

NORMALIZACIÓN DE MONTOS:
- Devuelve "amount" como número entero o decimal en pesos colombianos, NEGATIVO para cargos/gastos/salidas, POSITIVO para abonos/ingresos/entradas.
- El texto puede venir en formato US (1,234.56 = mil doscientos) o colombiano (1.234,56 = mil doscientos). Detecta cuál usa el banco y convierte correctamente a número. Banco de Bogotá usa formato US. Nu usa formato colombiano. Global66 usa formato US.

NORMALIZACIÓN DE FECHAS:
- Devuelve "date" en formato ISO YYYY-MM-DD.
- Si la fila no trae año (Banco de Bogotá usa DD/MM), infiérelo del período del extracto que aparece en el encabezado.
- Si la fila trae hora, ignórala; solo la fecha.

CATEGORIZACIÓN:
Asigna "category" exactamente uno de: ${CATEGORIES.join(', ')}.
Guía: Rappi/restaurantes/comida→"Comida & Restaurantes"; Uber/transporte público/Transmilenio→"Transporte"; Apple/SoundCloud/Splice/Patreon/suscripciones digitales→"Tech & Suscripciones" salvo música (Spotify/SoundCloud→"Música & Entretenimiento"); Vanti/Acueducto/Enel/Movistar/luz/agua/gas→"Utilities"; salarios/Electronic Arts/depósitos de nómina→"Ingresos"; cajero/efectivo→"Retiros"; ropa/H&M/tiendas→"Compras & Moda"; droguerías/salud→"Salud". Si dudas, usa "Otros".

CUENTA:
Incluye "account" con el nombre del banco detectado: "Banco de Bogotá", "Nu", o "Global66".

SALIDA:
Devuelve ÚNICAMENTE un objeto JSON válido, sin texto antes ni después, sin backticks. Forma:
{"bank":"<nombre>","period":"<YYYY-MM>","movements":[{"date":"YYYY-MM-DD","desc":"<descripción legible y limpia>","amount":<número con signo>,"category":"<categoría>","account":"<banco>"}]}

La descripción debe ser legible: limpia los códigos de tarjeta, "efectuada el...", números de documento. "Compra VIRTUAL en establecimiento RAPPI*RAPPI COLOMBI efectuada el..." → "Rappi". "Compra Uber Rides" → "Uber". Mantén nombres de comercio reconocibles.`;

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
    // Autenticación: exige un usuario logueado de Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Sesión inválida' }, 401);

    const { text } = await req.json();
    if (!text || typeof text !== 'string' || text.length < 50) {
      return json({ error: 'Texto del extracto vacío o muy corto' }, 400);
    }
    // Límite de seguridad: textos enormes se truncan (un extracto cabe de sobra)
    const clipped = text.slice(0, 180000);

    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Extracto a procesar:\n\n${clipped}` }],
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      return json({ error: 'Error del modelo', detail: errTxt.slice(0, 500) }, 502);
    }

    const data = await resp.json();
    const raw = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

    // Extraer el JSON aunque venga con ruido alrededor
    let parsed;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return json({ error: 'El modelo no devolvió JSON válido', raw: raw.slice(0, 800) }, 502);
    }

    const movements = Array.isArray(parsed.movements) ? parsed.movements : [];
    // Saneo final del lado servidor
    const clean = movements
      .filter((m: any) => m && m.date && typeof m.amount === 'number' && m.amount !== 0)
      .map((m: any) => ({
        date: String(m.date).slice(0, 10),
        desc: String(m.desc || '').slice(0, 200),
        amount: Math.round(m.amount * 100) / 100,
        category: CATEGORIES.includes(m.category) ? m.category : 'Otros',
        account: String(m.account || parsed.bank || '').slice(0, 60),
      }));

    return json({
      bank: parsed.bank || 'Desconocido',
      period: parsed.period || null,
      count: clean.length,
      movements: clean,
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
