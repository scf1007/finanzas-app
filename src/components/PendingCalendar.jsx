import React, { useState, useMemo } from 'react';
import { fmt, fmtFull, daysUntil, catColor, MONTHS } from '../logic';

// Calendario mensual de pendientes. Reutilizable: dashboard y vista Pendientes.
// - Punto de color por día con vencimiento (rojo vencido, amarillo próximo, lima ok, tenue pagado)
// - Navegable mes a mes
// - Al tocar un día con vencimientos, muestra el detalle con montos
export function PendingCalendar({ pending, onPay, onEdit, compact = false }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const [selDay, setSelDay] = useState(null);

  // Agrupa pendientes por fecha (YYYY-MM-DD) dentro del mes visible
  const byDate = useMemo(() => {
    const map = {};
    (pending || []).forEach(p => {
      const d = p.due; // YYYY-MM-DD
      if (!d) return;
      (map[d] = map[d] || []).push(p);
    });
    return map;
  }, [pending]);

  const monthPrefix = `${cursor.y}-${String(cursor.m).padStart(2, '0')}`;
  const firstDow = (new Date(cursor.y, cursor.m - 1, 1).getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(cursor.y, cursor.m, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);

  // Estado de un día: severidad dominante de sus pendientes no pagados
  const dayState = dayStr => {
    const items = byDate[dayStr] || [];
    if (!items.length) return null;
    const unpaid = items.filter(p => !p.paid);
    if (!unpaid.length) return { kind: 'paid', items };
    const anyOverdue = unpaid.some(p => daysUntil(p.due) < 0);
    const anySoon = unpaid.some(p => { const d = daysUntil(p.due); return d >= 0 && d <= 7; });
    return { kind: anyOverdue ? 'overdue' : anySoon ? 'soon' : 'ok', items };
  };

  const DOT = {
    overdue: 'var(--red)',
    soon: 'var(--yellow)',
    ok: 'var(--accent)',
    paid: 'var(--text3)',
  };

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const goMonth = delta => {
    setSelDay(null);
    let m = cursor.m + delta, y = cursor.y;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    setCursor({ y, m });
  };

  const selItems = selDay ? (byDate[selDay] || []) : [];
  const monthTotal = useMemo(() => {
    let t = 0;
    Object.entries(byDate).forEach(([d, items]) => {
      if (d.startsWith(monthPrefix)) items.filter(p => !p.paid).forEach(p => { t += p.amt; });
    });
    return t;
  }, [byDate, monthPrefix]);

  return (
    <div>
      {/* Header navegable */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => goMonth(-1)} aria-label="Mes anterior">‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{MONTHS[cursor.m]} {cursor.y}</div>
          {monthTotal > 0 && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmt(monthTotal)} por pagar</div>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => goMonth(1)} aria-label="Mes siguiente">›</button>
      </div>

      {/* Días de la semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
        ))}
      </div>

      {/* Grilla de días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dayStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
          const st = dayState(dayStr);
          const isToday = dayStr === todayStr;
          const isSel = dayStr === selDay;
          return (
            <button key={i}
              onClick={() => st && setSelDay(isSel ? null : dayStr)}
              disabled={!st}
              style={{
                aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 3, border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
                borderRadius: 8, cursor: st ? 'pointer' : 'default',
                background: isSel ? 'var(--accent-dim)' : isToday ? 'rgba(168,255,71,0.06)' : 'transparent',
                color: isToday ? 'var(--accent)' : 'var(--text2)', fontSize: 11, fontFamily: 'inherit',
                transition: 'background .15s',
                boxShadow: st?.kind === 'overdue' ? '0 0 10px rgba(255,107,71,0.25)' : 'none',
              }}>
              <span style={{ fontWeight: isToday ? 700 : 400 }}>{d}</span>
              {st && <span style={{ width: 5, height: 5, borderRadius: '50%', background: DOT[st.kind], flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>

      {/* Detalle del día seleccionado */}
      {selDay && selItems.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            {new Date(selDay).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {selItems.map(p => {
            const over = !p.paid && daysUntil(p.due) < 0;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 26, height: 26, borderRadius: 7, background: catColor(p.cat) + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{p.icon || '📋'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: p.paid ? 0.5 : 1, textDecoration: p.paid ? 'line-through' : 'none' }}>{p.name}</div>
                  {over && <div style={{ fontSize: 10, color: 'var(--red)' }}>Vencido</div>}
                  {p.paid && <div style={{ fontSize: 10, color: 'var(--text3)' }}>Pagado</div>}
                </div>
                <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: over ? 'var(--red)' : 'var(--text)', flexShrink: 0 }}>{fmtFull(p.amt)}</span>
                {!p.paid && onPay && <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => onPay(p.id)}>✓</button>}
                {onEdit && <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => onEdit(p)}>✎</button>}
              </div>
            );
          })}
        </div>
      )}

      {/* Leyenda */}
      {!compact && (
        <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap', fontSize: 10, color: 'var(--text3)' }}>
          {[['overdue', 'Vencido'], ['soon', 'Próximo'], ['ok', 'Programado'], ['paid', 'Pagado']].map(([k, label]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT[k] }} />{label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
