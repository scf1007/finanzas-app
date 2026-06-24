// ═══════════════════════════════════════════════════════════════
// AGREGADOS PARA INSIGHTS
// El navegador calcula resúmenes; la IA interpreta resúmenes, NO
// transacciones crudas. Más barato, más rápido, y no expone cada compra.
// ═══════════════════════════════════════════════════════════════
import { expenses, computePhase, PHASE_LABELS } from '../logic';

const EXCLUDE = ['Transferencias', 'Ingresos'];

// Hash simple y estable del set de movimientos: si cambia, regeneramos.
export function dataHash(txs) {
  let h = 0;
  const str = txs.map(t => `${t.id}:${t.amt}`).join('|');
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return `${txs.length}_${h}`;
}

// Construye el paquete de agregados que se manda a la Edge Function.
export function buildAggregates(state) {
  const txs = state.txs || [];
  const phase = computePhase(state);

  // ── Por mes (YYYY-MM): gasto, ingreso, neto ──
  const byMonth = {};
  txs.forEach(t => {
    const m = t.d.slice(0, 7);
    byMonth[m] = byMonth[m] || { month: m, gasto: 0, ingreso: 0 };
    if (t.amt > 0 && t.cat === 'Ingresos') byMonth[m].ingreso += t.amt;
    else if (t.amt < 0 && !EXCLUDE.includes(t.cat)) byMonth[m].gasto += Math.abs(t.amt);
  });
  const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({ ...m, gasto: Math.round(m.gasto), ingreso: Math.round(m.ingreso) }));

  // ── Por categoría por mes: detecta tendencias y goteo ──
  const catByMonth = {};
  expenses(txs).forEach(t => {
    const m = t.d.slice(0, 7);
    catByMonth[t.cat] = catByMonth[t.cat] || {};
    catByMonth[t.cat][m] = (catByMonth[t.cat][m] || 0) + Math.abs(t.amt);
  });
  const categoryTrends = Object.entries(catByMonth).map(([cat, byM]) => {
    const series = Object.entries(byM).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, total]) => ({ month, total: Math.round(total) }));
    const total = series.reduce((s, x) => s + x.total, 0);
    return { category: cat, total, monthly: series };
  }).sort((a, b) => b.total - a.total);

  // ── Comercios recurrentes: detecta suscripciones ──
  // Agrupa por descripción normalizada; cuenta apariciones y meses distintos.
  const merchants = {};
  expenses(txs).forEach(t => {
    const key = String(t.desc || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '').split(/\s+/).slice(0, 2).join(' ').trim();
    if (!key) return;
    merchants[key] = merchants[key] || { name: t.desc, count: 0, total: 0, months: new Set(), amounts: [] };
    merchants[key].count++;
    merchants[key].total += Math.abs(t.amt);
    merchants[key].months.add(t.d.slice(0, 7));
    merchants[key].amounts.push(Math.round(Math.abs(t.amt)));
  });
  // Candidatos a suscripción: aparecen en ≥2 meses distintos con monto similar
  const recurring = Object.values(merchants)
    .filter(m => m.months.size >= 2)
    .map(m => ({
      name: m.name,
      appearances: m.count,
      distinct_months: m.months.size,
      total: Math.round(m.total),
      avg: Math.round(m.total / m.count),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 25);

  // ── Contexto financiero (del PRD) ──
  const debts = (state.debts || []).map(d => ({
    acreedor: d.acreedor, saldo: d.saldo, tasa_ea: d.tasa_ea,
    cuota: d.cuota_actual, orden: d.orden_ataque,
  }));
  const goals = (state.goals || []).map(g => ({ tipo: g.tipo, meta: g.meta, actual: g.actual }));
  const ingresoMensualProm = months.length
    ? Math.round(months.reduce((s, m) => s + m.ingreso, 0) / months.filter(m => m.ingreso > 0).length || 0)
    : 0;

  return {
    phase,
    phase_label: PHASE_LABELS[phase],
    period_covered: months.length ? `${months[0].month} a ${months[months.length - 1].month}` : 'sin datos',
    months_count: months.length,
    monthly: months,
    category_trends: categoryTrends,
    recurring_merchants: recurring,
    income_monthly_avg: ingresoMensualProm,
    debts,
    goals,
  };
}
