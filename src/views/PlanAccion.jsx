import React, { useMemo } from 'react';
import { useStore } from '../state/StoreContext';
import { computeNextActions, computePhase, PHASE_LABELS, PHASE_SUB, fmt } from '../logic';

const TONE = {
  critical: { border: 'rgba(255,107,107,0.35)', bg: 'var(--red-dim)' },
  warn: { border: 'rgba(255,206,92,0.3)', bg: 'var(--yellow-dim)' },
  info: { border: 'var(--border)', bg: 'var(--surface2)' },
  ok: { border: 'rgba(168,255,71,0.3)', bg: 'var(--accent-dim)' },
};

export default function PlanAccion({ openDebtPay }) {
  const { state, markPaid, ackDebtClosed } = useStore();
  const actions = useMemo(() => computeNextActions(state), [state]);
  const phase = computePhase(state);
  const urgent = actions.filter(a => a.tone === 'critical').length;

  const handleCta = cta => {
    if (cta.kind === 'markPaid') markPaid(cta.id);
    if (cta.kind === 'debtPay') openDebtPay(cta.id);
    if (cta.kind === 'ackClosed') ackDebtClosed(cta.id);
  };

  return (
    <div className="view active">
      <div className="view-title">Plan de acción</div>
      <div className="view-subtitle">Qué hacer ahora, en orden de prioridad · {PHASE_LABELS[phase]}</div>

      {/* Encabezado de fase */}
      <div className="card" style={{ marginBottom: 18, borderColor: 'rgba(168,255,71,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🎯</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{PHASE_LABELS[phase]}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>{PHASE_SUB[phase]}</div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
            {actions.length === 0 ? 'al día' : urgent > 0 ? `${urgent} urgente${urgent === 1 ? '' : 's'} · ${actions.length} total` : `${actions.length} paso${actions.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* Lista de acciones */}
      <div className="card">
        {actions.length === 0
          ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--text2)', fontSize: 13, justifyContent: 'center' }}><span style={{ fontSize: 18 }}>✅</span> Nada urgente. Tu siguiente movimiento es sostener el plan de fase.</div>
          : actions.map((a, i) => {
            const st = TONE[a.tone] || TONE.info;
            return (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', background: st.bg, border: `1px solid ${st.border}`, borderRadius: 'var(--r-sm)', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 3, minWidth: 16 }}>{i + 1}</span>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: -1 }}>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, lineHeight: 1.55 }}>{a.detail}</div>
                </div>
                {a.cta && <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => handleCta(a.cta)}>{a.cta.label}</button>}
              </div>
            );
          })}
      </div>
    </div>
  );
}
