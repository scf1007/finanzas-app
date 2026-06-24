import React, { useState } from 'react';
import { useStore } from '../state/StoreContext';
import { Storage } from '../storage/supabaseStorage';

// ── Login ────────────────────────────────────────────────────
export function Login() {
  const { signIn } = useStore();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">SCF · Finanzas</div>
        <div className="login-sub">Tu sistema financiero personal.<br />Fases, deudas, plan de acción.</div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px 18px' }} onClick={signIn}>
          Entrar con Google
        </button>
      </div>
    </div>
  );
}

// ── Importador del JSON local (idempotente: upserts) ─────────
// Lee el finanzas-santiago.json del tracker HTML y puebla las tablas.
export function ImportJson({ onDone }) {
  const { session, refresh, notify } = useStore();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const addLog = m => setLog(l => [...l, m]);

  const handleFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setLog([]);
    try {
      const data = JSON.parse(await file.text());
      addLog(`📄 ${file.name} leído · esquema v${data.schema_version || '?'}`);

      // 1. Perfil + fase + budget
      await Storage.saveProfile({
        display_name: 'Santiago Chavarro',
        phase_current: data.phase?.current ?? 0,
        phase_since: data.phase?.since ?? new Date().toISOString().slice(0, 10),
        phase_override: data.phase?.overrides ?? null,
        settings: { budget: data.budget || {} },
      });
      addLog('✓ perfil y fase');

      // 2. Reglas de reparto
      if (data.allocation_rules) {
        await Storage.upsertAllocationRules(data.allocation_rules);
        addLog('✓ reglas de reparto');
      }

      // 3. Cuentas
      for (const a of data.accounts || []) await Storage.upsertAccount(a);
      addLog(`✓ ${(data.accounts || []).length} cuentas`);

      // 4. Deudas y pagos
      for (const d of data.debts || []) await Storage.upsertDebt(d);
      addLog(`✓ ${(data.debts || []).length} deudas`);
      for (const p of data.debt_payments || []) {
        try { await Storage.insertDebtPayment(p); } catch { /* duplicado: ok */ }
      }

      // 5. Metas
      for (const g of data.goals || []) await Storage.upsertGoal(g);
      addLog(`✓ ${(data.goals || []).length} metas`);

      // 6. Pendientes
      for (const p of data.pending || []) await Storage.upsertPending(p);
      addLog(`✓ ${(data.pending || []).length} pendientes`);

      // 7. Transacciones (batch; ids del JSON se conservan → idempotente)
      const txs = (data.txs || []).map(t => ({ ...t, id: t.id || `imp-${t.d}-${t.amt}-${(t.desc || '').slice(0, 12).replace(/\W/g, '')}` }));
      await Storage.upsertTxBatch(txs);
      addLog(`✓ ${txs.length} movimientos`);

      addLog('🎉 Importación completa');
      notify('🎉 data importada');
      await refresh();
      setTimeout(onDone, 900);
    } catch (err) {
      console.error(err);
      addLog('❌ Error: ' + (err.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 460, textAlign: 'left' }}>
        <div className="login-logo" style={{ textAlign: 'center' }}>Importar tu data</div>
        <div className="login-sub" style={{ textAlign: 'center' }}>
          Subí tu <code style={{ background: 'var(--surface3)', padding: '1px 6px', borderRadius: 4 }}>finanzas-santiago.json</code> del tracker local.
          Es idempotente: podés re-correrlo sin duplicar.
        </div>
        <input type="file" accept=".json" onChange={handleFile} disabled={busy}
          style={{ width: '100%', marginBottom: 16, color: 'var(--text2)', fontSize: 12 }} />
        {log.length > 0 && (
          <div style={{ background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, maxHeight: 220, overflowY: 'auto', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)', lineHeight: 1.8, marginBottom: 14 }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={onDone} disabled={busy}>
          {busy ? 'Importando...' : 'Saltar (empezar de cero)'}
        </button>
      </div>
    </div>
  );
}
