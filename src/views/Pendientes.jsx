import React, { useMemo, useState } from 'react';
import { useStore } from '../state/StoreContext';
import { fmt, fmtFull, daysUntil, catColor } from '../logic';
import { PendingCalendar } from '../components/PendingCalendar';

const RECUR_LABEL = { monthly: '↺ mensual', bimonthly: '↺ bimestral', yearly: '↺ anual' };

export default function Pendientes({ onEdit, onAdd }) {
  const { state, markPaid, markUnpaid, deletePending } = useStore();
  const [tab, setTab] = useState('all');
  const [vista, setVista] = useState('lista'); // 'lista' | 'calendario'

  const { ov, up, all, paid } = useMemo(() => ({
    ov: state.pending.filter(p => !p.paid && daysUntil(p.due) < 0),
    up: state.pending.filter(p => !p.paid && daysUntil(p.due) >= 0 && daysUntil(p.due) <= 30),
    all: state.pending.filter(p => !p.paid),
    paid: state.pending.filter(p => p.paid),
  }), [state.pending]);

  const list = tab === 'overdue' ? [...ov].sort((a, b) => new Date(a.due) - new Date(b.due))
    : tab === 'upcoming' ? [...up].sort((a, b) => new Date(a.due) - new Date(b.due))
      : tab === 'paid' ? paid
        : [...state.pending].sort((a, b) => a.paid - b.paid || new Date(a.due) - new Date(b.due));

  const kpis = [
    { label: 'Total pendiente', val: fmt(all.reduce((s, p) => s + p.amt, 0)), badge: 'badge-info', sub: `${all.length} items` },
    { label: 'Próximos 30 días', val: fmt(up.reduce((s, p) => s + p.amt, 0)), badge: 'badge-info', sub: `${up.length} items` },
    { label: 'Vencidos', val: String(ov.length), badge: ov.length ? 'badge-down' : 'badge-up', sub: ov.length ? 'Requieren atención' : 'Sin vencidos' },
    { label: 'Pagados', val: String(paid.length), badge: 'badge-up', sub: 'Este ciclo' },
  ];

  return (
    <div className="view active">
      <div className="view-title">Pendientes de pago</div>
      <div className="view-subtitle">Facturas, suscripciones y compromisos próximos</div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={onAdd}>+ Agregar pendiente</button>
        {vista === 'lista' && (
          <div className="tabs" style={{ border: 'none', margin: 0, flex: 1, alignItems: 'center' }}>
            {[['all', 'Todos'], ['overdue', 'Vencidos'], ['upcoming', 'Próximos 30 días'], ['paid', 'Pagados']].map(([id, label]) => (
              <button key={id} className={'tab' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        )}
        <div className="tabs" style={{ border: 'none', margin: 0, marginLeft: vista === 'lista' ? 0 : 'auto', alignItems: 'center' }}>
          <button className={'tab' + (vista === 'lista' ? ' active' : '')} onClick={() => setVista('lista')}>☰ Lista</button>
          <button className={'tab' + (vista === 'calendario' ? ' active' : '')} onClick={() => setVista('calendario')}>▦ Calendario</button>
        </div>
      </div>

      <div className="grid-4">
        {kpis.map(k => (
          <div key={k.label} className="card-sm">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>{k.val}</div>
            <span className={`kpi-badge ${k.badge}`}>{k.sub}</span>
          </div>
        ))}
      </div>

      {vista === 'calendario' ? (
        <div className="card">
          <PendingCalendar pending={state.pending} onPay={markPaid} onEdit={onEdit} />
        </div>
      ) : (
        <div className="card">
          {list.length === 0
            ? <div className="empty"><div className="empty-icon">✓</div><div className="empty-text">Nada aquí</div></div>
            : list.map(p => {
              const d = daysUntil(p.due);
              const over = !p.paid && d < 0;
              const dStr = p.paid ? 'Pagado' : over ? `Vencido hace ${Math.abs(d)}d` : d === 0 ? 'Vence hoy' : `En ${d} días`;
              return (
                <div key={p.id} className="pending-item" style={{ opacity: p.paid ? 0.5 : 1 }}>
                  <div className="pending-icon" style={{ background: catColor(p.cat) + '22' }}>{p.icon || '📋'}</div>
                  <div className="pending-info">
                    <div className="pending-name">{p.name}</div>
                    <div className={'pending-due' + (over ? ' overdue' : '')} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{dStr}</span>
                      <span style={{ color: 'var(--text3)' }}>·</span>
                      <span style={{ color: 'var(--text3)' }}>{p.cat}</span>
                      {p.recur !== 'none' && <span style={{ color: 'var(--purple)', fontSize: 10, fontWeight: 600 }}>{RECUR_LABEL[p.recur]}</span>}
                    </div>
                  </div>
                  <div className={'pending-amt' + (over ? ' amt-neg' : '')}>{fmtFull(p.amt)}</div>
                  <div className="pending-actions">
                    {!p.paid
                      ? <button className="btn btn-ghost btn-sm" onClick={() => markPaid(p.id)}>✓ Pagar</button>
                      : <button className="btn btn-ghost btn-sm" onClick={() => markUnpaid(p.id)}>↩</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(p)}>✎</button>
                    <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('¿Eliminar?')) deletePending(p.id); }}>✕</button>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
