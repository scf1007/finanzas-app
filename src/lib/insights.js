// ═══════════════════════════════════════════════════════════════
// INSIGHTS IA · capa cliente
// Lee el caché de Supabase; si el hash de datos cambió (o se fuerza),
// llama a la Edge Function y guarda el resultado nuevo.
// ═══════════════════════════════════════════════════════════════
import { supabase } from './supabase';
import { buildAggregates, dataHash } from './aggregates';

export async function loadCachedInsights(userId) {
  const { data, error } = await supabase
    .from('insights_cache').select('*').eq('user_id', userId).maybeSingle();
  if (error) return null;
  return data; // { generated_at, data_hash, payload } | null
}

export async function generateInsights(state, userId, { force = false } = {}) {
  const aggregates = buildAggregates(state);
  const hash = dataHash(state.txs || []);

  // ¿Hay caché vigente?
  if (!force) {
    const cached = await loadCachedInsights(userId);
    if (cached && cached.data_hash === hash) {
      return { ...cached.payload, generated_at: cached.generated_at, cached: true };
    }
  }

  // Llamar a la Edge Function
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión no encontrada');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insights`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ aggregates }),
  });
  const result = await resp.json();
  if (!resp.ok) throw new Error(result.error || 'Error al generar insights');

  // Guardar en caché
  await supabase.from('insights_cache').upsert({
    user_id: userId,
    generated_at: result.generated_at || new Date().toISOString(),
    data_hash: hash,
    payload: { summary: result.summary, insights: result.insights },
  });

  return { ...result, cached: false };
}

// ¿El caché está vigente para los datos actuales? (para mostrar el estado en la UI)
export function isCacheFresh(cached, state) {
  if (!cached) return false;
  return cached.data_hash === dataHash(state.txs || []);
}
