import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { loadState, Storage, subscribeRealtime } from '../storage/supabaseStorage';
import { uid, today } from '../logic';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined=cargando, null=sin login
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const notify = useCallback(msg => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }, []);

  // ── Auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!session?.user) return;
    const s = await loadState(session.user.id);
    setState(s);
    return s;
  }, [session]);

  // ── Carga inicial + realtime ──
  useEffect(() => {
    if (!session?.user) { setState(null); return; }
    Storage.userId = session.user.id;
    setLoading(true);
    refresh().finally(() => setLoading(false));
    const unsub = subscribeRealtime(session.user.id, () => refresh());
    return unsub;
  }, [session, refresh]);

  // ── Acciones (mutación local optimista + escritura remota) ──
  const api = {
    session, state, loading, toast, notify, refresh,

    signIn: () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }),
    signOut: () => supabase.auth.signOut(),

    async saveTx(tx) {
      const isNew = !state.txs.some(t => t.id === tx.id);
      setState(s => ({ ...s, txs: isNew ? [tx, ...s.txs] : s.txs.map(t => t.id === tx.id ? tx : t) }));
      await Storage.upsertTx(tx); notify('💾 guardado');
    },
    async deleteTx(id) {
      setState(s => ({ ...s, txs: s.txs.filter(t => t.id !== id) }));
      await Storage.deleteTx(id); notify('🗑 eliminado');
    },

    async savePending(p) {
      const isNew = !state.pending.some(x => x.id === p.id);
      setState(s => ({ ...s, pending: isNew ? [...s.pending, p] : s.pending.map(x => x.id === p.id ? p : x) }));
      await Storage.upsertPending(p); notify('💾 guardado');
    },
    async deletePending(id) {
      setState(s => ({ ...s, pending: s.pending.filter(p => p.id !== id) }));
      await Storage.deletePending(id); notify('🗑 eliminado');
    },
    async markPaid(id) {
      const p = state.pending.find(x => x.id === id);
      if (!p) return;
      const paid = { ...p, paid: true };
      const tx = { id: uid(), d: today(), desc: 'Pago: ' + p.name, amt: -p.amt, cat: p.cat, acc: 'Nu', note: 'Pendiente pagado' };
      setState(s => ({ ...s, pending: s.pending.map(x => x.id === id ? paid : x), txs: [tx, ...s.txs] }));
      await Storage.upsertPending(paid); await Storage.upsertTx(tx);
      notify('✓ pagado');
    },
    async markUnpaid(id) {
      const p = state.pending.find(x => x.id === id);
      if (!p) return;
      const up = { ...p, paid: false };
      setState(s => ({ ...s, pending: s.pending.map(x => x.id === id ? up : x) }));
      await Storage.upsertPending(up);
    },

    async saveDebt(d) {
      setState(s => ({ ...s, debts: s.debts.map(x => x.id === d.id ? d : x) }));
      await Storage.upsertDebt(d); notify('💾 guardado');
    },
    async payDebt(debtId, monto, fecha) {
      const d = state.debts.find(x => x.id === debtId);
      if (!d || monto <= 0) return;
      const upd = { ...d, saldo: Math.max(0, d.saldo - monto) };
      const pago = { id: uid(), debt_id: d.id, fecha, monto };
      const tx = { id: uid(), d: fecha, desc: 'Pago deuda: ' + d.acreedor, amt: -monto, cat: 'Deudas', acc: 'Nu', note: 'Registrado desde Plan de acción' };
      setState(s => ({
        ...s,
        debts: s.debts.map(x => x.id === debtId ? upd : x),
        debt_payments: [...s.debt_payments, pago],
        txs: [tx, ...s.txs],
      }));
      await Storage.upsertDebt(upd); await Storage.insertDebtPayment(pago); await Storage.upsertTx(tx);
      notify(upd.saldo === 0 ? '🎉 ¡deuda cerrada!' : '💾 pago registrado');
    },
    async ackDebtClosed(debtId) {
      const d = state.debts.find(x => x.id === debtId);
      if (!d) return;
      const upd = { ...d, cuota_redirected: true };
      setState(s => ({ ...s, debts: s.debts.map(x => x.id === debtId ? upd : x) }));
      await Storage.upsertDebt(upd);
    },

    async saveAccount(a) {
      const isNew = !state.accounts.some(x => x.id === a.id);
      setState(s => ({ ...s, accounts: isNew ? [...s.accounts, a] : s.accounts.map(x => x.id === a.id ? a : x) }));
      await Storage.upsertAccount(a); notify('💾 guardado');
    },
    async deleteAccount(id) {
      setState(s => ({ ...s, accounts: s.accounts.filter(a => a.id !== id) }));
      await Storage.deleteAccount(id);
    },

    async saveBudget(budget) {
      setState(s => ({ ...s, budget }));
      await Storage.saveBudget(budget); notify('💾 guardado');
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
