// ═══════════════════════════════════════════════════════════════
// STORAGE · Supabase. Misma responsabilidad que el Storage de M1:
// cargar/persistir el STATE. La app trabaja con el shape original del
// tracker (txs con d/desc/amt); aquí se mapea hacia/desde Postgres.
// ═══════════════════════════════════════════════════════════════
import { supabase } from '../lib/supabase';

// ── Mappers fila ⇄ shape interno ─────────────────────────────
const txFromRow = r => ({
  id: r.id, d: r.date, desc: r.descripcion, amt: Number(r.amount),
  cat: r.category, acc: r.account, note: r.note || undefined,
  origCurrency: r.orig_currency || undefined,
  origAmt: r.orig_amount != null ? Number(r.orig_amount) : undefined,
  fxRate: r.fx_rate != null ? Number(r.fx_rate) : undefined,
  catSource: r.cat_source || undefined,
});
const txToRow = (t, uid) => ({
  id: t.id, user_id: uid, date: t.d, descripcion: t.desc, amount: Math.round(t.amt),
  category: t.cat ?? null, account: t.acc ?? null, note: t.note ?? null,
  orig_currency: t.origCurrency ?? null, orig_amount: t.origAmt ?? null,
  fx_rate: t.fxRate ?? null, cat_source: t.catSource ?? null,
});

const pendFromRow = r => ({
  id: r.id, name: r.name, amt: Number(r.amount), due: r.due_date,
  cat: r.category, icon: r.icon, recur: r.recur, paid: r.paid,
  provider_key: r.provider_key || undefined,
});
const pendToRow = (p, uid) => ({
  id: p.id, user_id: uid, name: p.name, amount: Math.round(p.amt), due_date: p.due,
  category: p.cat ?? null, icon: p.icon ?? null, recur: p.recur || 'none',
  paid: !!p.paid, provider_key: p.provider_key ?? null,
});

const debtFromRow = r => ({
  id: r.id, acreedor: r.acreedor, saldo: Number(r.saldo), saldo_inicial: Number(r.saldo_inicial),
  tasa_ea: Number(r.tasa_ea), cuota_min: Number(r.cuota_min), cuota_actual: Number(r.cuota_actual),
  orden_ataque: r.orden_ataque, tipo: r.tipo, metodo_pago: r.metodo_pago,
  cuenta_pago: r.cuenta_pago, fecha_corte: r.fecha_corte, cuota_redirected: r.cuota_redirected || false,
});
const debtToRow = (d, uid) => ({
  id: d.id, user_id: uid, acreedor: d.acreedor, saldo: Math.round(d.saldo),
  saldo_inicial: Math.round(d.saldo_inicial), tasa_ea: d.tasa_ea, cuota_min: Math.round(d.cuota_min),
  cuota_actual: Math.round(d.cuota_actual), orden_ataque: d.orden_ataque, tipo: d.tipo,
  metodo_pago: d.metodo_pago, cuenta_pago: d.cuenta_pago ?? null,
  fecha_corte: d.fecha_corte ?? null, cuota_redirected: !!d.cuota_redirected,
});

const goalFromRow = r => ({ id: r.id, tipo: r.tipo, meta: Number(r.meta), actual: Number(r.actual), label: r.label });
const accFromRow = r => ({ id: r.id, name: r.name, balance: Number(r.balance), color: r.color });
const dpFromRow = r => ({ id: r.id, debt_id: r.debt_id, fecha: r.fecha, monto: Number(r.monto) });

// ── Carga completa del estado ────────────────────────────────
export async function loadState(userId) {
  const [tx, pe, de, dp, go, ac, ar, pr] = await Promise.all([
    supabase.from('transactions').select('*').order('date', { ascending: false }),
    supabase.from('pending_items').select('*'),
    supabase.from('debts').select('*'),
    supabase.from('debt_payments').select('*'),
    supabase.from('goals').select('*'),
    supabase.from('accounts').select('*'),
    supabase.from('allocation_rules').select('*'),
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
  ]);
  const err = [tx, pe, de, dp, go, ac, ar, pr].find(r => r.error);
  if (err) throw err.error;

  const rules = {};
  (ar.data || []).forEach(r => { rules[r.phase] = { deuda: Number(r.deuda), colchon: Number(r.colchon), inversion: Number(r.inversion), libre: Number(r.libre) }; });

  return {
    schema_version: 2,
    meta: { app_milestone: 'FaseA' },
    txs: (tx.data || []).map(txFromRow),
    pending: (pe.data || []).map(pendFromRow),
    debts: (de.data || []).map(debtFromRow),
    debt_payments: (dp.data || []).map(dpFromRow),
    goals: (go.data || []).map(goalFromRow),
    accounts: (ac.data || []).map(accFromRow),
    budget: pr.data?.settings?.budget || {},
    phase: {
      current: pr.data?.phase_current ?? 0,
      since: pr.data?.phase_since ?? null,
      overrides: pr.data?.phase_override ?? null,
    },
    allocation_rules: Object.keys(rules).length ? rules : null,
    _profileExists: !!pr.data,
    _themePref: pr.data?.settings?.theme || null,
  };
}

// ── Mutaciones (escriben a Supabase; el caller actualiza el estado local) ──
export const Storage = {
  userId: null,

  async upsertTx(t) { const { error } = await supabase.from('transactions').upsert(txToRow(t, this.userId)); if (error) throw error; },
  async deleteTx(id) { const { error } = await supabase.from('transactions').delete().eq('id', id); if (error) throw error; },
  async upsertTxBatch(list) {
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await supabase.from('transactions').upsert(list.slice(i, i + 500).map(t => txToRow(t, this.userId)));
      if (error) throw error;
    }
  },

  async upsertPending(p) { const { error } = await supabase.from('pending_items').upsert(pendToRow(p, this.userId)); if (error) throw error; },
  async deletePending(id) { const { error } = await supabase.from('pending_items').delete().eq('id', id); if (error) throw error; },

  async upsertDebt(d) { const { error } = await supabase.from('debts').upsert(debtToRow(d, this.userId)); if (error) throw error; },
  async insertDebtPayment(p) {
    const { error } = await supabase.from('debt_payments').insert({ id: p.id, user_id: this.userId, debt_id: p.debt_id, fecha: p.fecha, monto: Math.round(p.monto) });
    if (error) throw error;
  },

  async upsertGoal(g) {
    const { error } = await supabase.from('goals').upsert({ id: g.id, user_id: this.userId, tipo: g.tipo, meta: Math.round(g.meta), actual: Math.round(g.actual), label: g.label });
    if (error) throw error;
  },

  async upsertAccount(a) {
    const { error } = await supabase.from('accounts').upsert({ id: a.id, user_id: this.userId, name: a.name, balance: Math.round(a.balance), color: a.color });
    if (error) throw error;
  },
  async deleteAccount(id) { const { error } = await supabase.from('accounts').delete().eq('id', id); if (error) throw error; },

  async saveProfile(patch) {
    const { error } = await supabase.from('profiles').upsert({ id: this.userId, ...patch });
    if (error) throw error;
  },
  async saveBudget(budget) {
    const { data } = await supabase.from('profiles').select('settings').eq('id', this.userId).maybeSingle();
    const settings = { ...(data?.settings || {}), budget };
    await this.saveProfile({ settings });
  },
  async saveThemePref(theme) {
    if (!this.userId) return;
    const { data } = await supabase.from('profiles').select('settings').eq('id', this.userId).maybeSingle();
    const settings = { ...(data?.settings || {}), theme };
    await this.saveProfile({ settings });
  },
  async upsertAllocationRules(rules) {
    const rows = Object.entries(rules).map(([phase, r]) => ({ user_id: this.userId, phase: Number(phase), ...r }));
    const { error } = await supabase.from('allocation_rules').upsert(rows);
    if (error) throw error;
  },
};

// ── Realtime: cambios de otros dispositivos refrescan el estado ─
export function subscribeRealtime(userId, onChange) {
  const channel = supabase
    .channel('state-sync')
    .on('postgres_changes', { event: '*', schema: 'public', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
