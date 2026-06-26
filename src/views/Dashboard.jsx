import React, { useMemo, useState } from 'react';
import { useStore } from '../state/StoreContext';
import { useChart, cssVar } from '../components/shared';
import { PendingCalendar } from '../components/PendingCalendar';
import {
  fmt, fmtFull, daysUntil, expSum, expenses, catColor, catIcon,
  computePhase, PHASE_LABELS, PHASE_SUB, MONTHS, MONTHS_SHORT,
  STATE_COLOR, statePagoProximo, stateSaldo, stateGasto, stateIngreso, stateMeta, stateDeuda,
} from '../logic';

export default function Dashboard({ openDebtPay, openEditDebt, openAddDebt, openAddPending, onPayPending, goToMovimientos }) {
  const { state, theme } = useStore();
  const [mode, setMode] = useState('year');
  const [year, setYear] = useState('2026');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [chartMode, setChartMode] = useState('exp');

  const periodTxs = useMemo(() => {
    if (mode === 'year') return state.txs.filter(t => t.d.startsWith(year));
    return state.txs.filter(t => t.d.startsWith(`${year}-${String(month).padStart(2, '0')}`));
  }, [state.txs, mode, year, month]);

  const periodLabel = mode === 'year' ? `Año ${year}` : `${MONTHS[month]} ${year}`;
  const phase = computePhase(state);

  const periodExp = expSum(periodTxs);
  const periodInc = periodTxs.filter(t => t.cat === 'Ingresos' && t.amt > 0).reduce((s, t) => s + t.amt, 0);
  const totalBal = state.accounts.reduce((s, a) => s + a.balance, 0);
  const pendUpcoming = state.pending.filter(p => !p.paid && daysUntil(p.due) >= 0 && daysUntil(p.due) <= 30);
  const pendOverdue = state.pending.filter(p => !p.paid && daysUntil(p.due) < 0).length;

  const debts = [...state.debts].sort((a, b) => a.orden_ataque - b.orden_ataque);
  const totalSaldo = debts.reduce((s, d) => s + d.saldo, 0);
  const interesOnly = debts.filter(d => d.tasa_ea > 0).reduce((s, d) => s + d.saldo, 0);
  const colchon = state.goals.find(g => g.tipo === 'colchon');
  const fondo = state.goals.find(g => g.tipo === 'fondo_emergencia');

  // ── Gráfica mensual ──
  const monthlyRef = useChart(() => {
    let labels, expData, incData;
    if (mode === 'year') {
      labels = MONTHS_SHORT.slice(1);
      expData = Array.from({ length: 12 }, (_, i) =>
        expSum(periodTxs.filter(t => t.d.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`))));
      incData = Array.from({ length: 12 }, (_, i) =>
        periodTxs.filter(t => t.d.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`) && t.cat === 'Ingresos').reduce((s, t) => s + t.amt, 0));
    } else {
      const dim = new Date(+year, month, 0).getDate();
      labels = ['S1', 'S2', 'S3', 'S4', 'S5'].slice(0, Math.ceil(dim / 7));
      const bucket = (fil) => labels.map((_, wi) => {
        const a = wi * 7 + 1, b = Math.min((wi + 1) * 7, dim);
        return periodTxs.filter(t => { const d = +t.d.slice(8); return d >= a && d <= b && fil(t); })
          .reduce((s, t) => s + Math.abs(t.amt), 0);
      });
      expData = bucket(t => t.amt < 0 && !['Transferencias', 'Ingresos'].includes(t.cat));
      incData = bucket(t => t.cat === 'Ingresos' && t.amt > 0);
    }
    const datasets = chartMode === 'exp'
      ? [{ label: 'Gastos', data: expData, backgroundColor: expData.map(v => v === Math.max(...expData) ? 'rgba(168,255,71,0.85)' : 'rgba(167,139,250,0.55)'), borderRadius: 4, borderSkipped: false }]
      : [
        { label: 'Gastos', data: expData, backgroundColor: 'rgba(248,113,113,0.6)', borderRadius: 4, borderSkipped: false },
        { label: 'Ingresos', data: incData, backgroundColor: 'rgba(74,222,128,0.45)', borderRadius: 4, borderSkipped: false },
      ];
    return {
      type: 'bar', data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: chartMode === 'both', labels: { color: cssVar('--chart-tick', '#71717a'), font: { size: 11 }, boxWidth: 10 } }, tooltip: { callbacks: { label: c => ' ' + fmtFull(c.raw) } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: cssVar('--chart-tick', '#52525b'), font: { size: 11 } }, border: { display: false } },
          y: { grid: { color: cssVar('--chart-grid', 'rgba(255,255,255,0.04)') }, ticks: { color: cssVar('--chart-tick', '#52525b'), font: { size: 10 }, callback: v => fmt(v) }, border: { display: false } },
        },
      },
    };
  }, [periodTxs, mode, chartMode, year, month, theme]);

  // ── Dona ──
  const catTotals = {};
  expenses(periodTxs).forEach(t => { catTotals[t.cat] = (catTotals[t.cat] || 0) + Math.abs(t.amt); });
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const donutTotal = sorted.reduce((s, e) => s + e[1], 0);
  const donutRef = useChart(() => ({
    type: 'doughnut',
    data: { labels: sorted.map(e => e[0]), datasets: [{ data: sorted.map(e => e[1]), backgroundColor: sorted.map(e => catColor(e[0])), borderWidth: 0, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) + ' · ' + (c.raw / donutTotal * 100).toFixed(1) + '%' } } } },
  }), [periodTxs, theme]);

  const recent = periodTxs.filter(t => t.amt < 0 && !['Transferencias', 'Ingresos'].includes(t.cat)).slice(0, 8);

  return (
    <div className="view active">
      <div className="dash-header">
        <div className="dash-header-text">
          <div className="view-title">Inicio</div>
          <div className="view-subtitle" style={{ margin: 0 }}>Resumen financiero · {periodLabel}</div>
        </div>
        <div className="dash-header-controls">
          <div className="toggle-row" style={{ gap: 4 }}>
            <button className={'toggle-btn' + (mode === 'year' ? ' active' : '')} onClick={() => setMode('year')}>Año</button>
            <button className={'toggle-btn' + (mode === 'month' ? ' active' : '')} onClick={() => setMode('month')}>Mes</button>
          </div>
          <select className="filter-select" value={year} onChange={e => setYear(e.target.value)} style={{ padding: '5px 8px' }}>
            <option>2025</option><option>2026</option>
          </select>
          {mode === 'month' &&
            <select className="filter-select" value={month} onChange={e => setMonth(+e.target.value)} style={{ padding: '5px 8px' }}>
              {MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>}
        </div>
      </div>

      {/* NIVEL 1 · KPIs con color-estado */}
      <div className="grid-4">
        {[
          { label: `Gasto · ${periodLabel}`, val: fmt(periodExp), st: stateGasto(periodExp, periodInc) },
          { label: 'Ingresos período', val: fmt(periodInc), st: stateIngreso(periodInc) },
          { label: 'Saldo total', val: fmt(totalBal), st: stateSaldo(totalBal, state.pending) },
          { label: 'Pago próximo 30d', val: fmt(pendUpcoming.reduce((s, p) => s + p.amt, 0)), st: statePagoProximo(state.pending), note: pendOverdue ? `${pendOverdue} vencidos` : 'Al día' },
        ].map(k => {
          const sc = STATE_COLOR[k.st] || STATE_COLOR.neutro;
          return (
            <div key={k.label} className="card-sm" data-accent={sc.tint || undefined}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color: k.st === 'rojo' ? 'var(--red)' : undefined }}>{k.val}</div>
              <span className="kpi-badge" style={{ background: sc.dim, color: sc.color, borderColor: 'transparent' }}>
                {k.note || (k.st === 'lima' ? 'Saludable' : k.st === 'ambar' ? 'Atención' : k.st === 'rojo' ? 'Crítico' : 'COP')}
              </span>
            </div>
          );
        })}
      </div>

      {/* NIVEL 2 · Calendario de pagos + Deudas */}
      <div className="grid-2" style={{ marginTop: 0 }}>
        <div className="card">
          <div className="card-head">
            <span className="card-title">Calendario de pagos</span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: 11 }} onClick={openAddPending}>＋ pendiente</button>
          </div>
          <PendingCalendar pending={state.pending} onPay={onPayPending} compact />
        </div>

        <div className="card" data-tone="red">
          <div className="card-head">
            <span className="card-title">Deudas</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Total {fmt(totalSaldo)} · con interés {fmt(interesOnly)}</span>
              <button className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: 11 }} onClick={openAddDebt}>＋ deuda</button>
            </div>
          </div>
          {debts.map(d => {
            const pct = d.saldo_inicial > 0 ? Math.min(100, ((d.saldo_inicial - d.saldo) / d.saldo_inicial) * 100) : 0;
            const closed = d.saldo === 0;
            const dSt = STATE_COLOR[stateDeuda(d.tasa_ea)];
            const barColor = closed ? 'var(--text3)' : dSt.color;
            return (
              <div key={d.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: closed ? 0.55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: closed ? 'var(--text3)' : dSt.color, width: 18 }}>{closed ? '✓' : '#' + d.orden_ataque}</span>
                  <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: closed ? 'line-through' : 'none' }}>{d.acreedor}</span>
                  <span style={{ fontSize: 10, color: d.tasa_ea > 0 ? dSt.color : 'var(--text3)', fontFamily: 'var(--mono)' }}>{d.tasa_ea > 0 ? (d.tasa_ea * 100).toFixed(1) + '% EA' : 'sin interés'}</span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', minWidth: 64, textAlign: 'right' }}>{closed ? '$0' : fmt(d.saldo)}</span>
                  {!closed && <button className="btn btn-ghost btn-sm" style={{ padding: '3px 10px', fontSize: 10 }} onClick={() => openDebtPay(d.id)}>＋ pago</button>}
                  <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 10 }} onClick={() => openEditDebt(d.id)}>✎</button>
                </div>
                <div style={{ height: 3, background: 'var(--surface3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: pct + '%', background: barColor, transition: 'width .4s' }} />
                </div>
                <div className="debt-meta-secondary" style={{ marginTop: 3, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>cuota {fmt(d.cuota_actual)}/mes · {d.metodo_pago === 'manual' ? 'pago manual' : 'auto'}</span>
                  <span>{pct.toFixed(0)}% pagado</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* NIVEL 3 · Plan & Fase + Últimos movimientos */}
      <div className="grid-2">
        <div className="card" data-tone="lime">
          <div className="card-head">
            <span className="card-title">Plan &amp; Fase</span>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{PHASE_LABELS[phase]}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 14 }}>{PHASE_SUB[phase]}</div>
          {[colchon, fondo].map(g => g && (
            <div key={g.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                <span>{g.label}</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmt(g.actual)} / {fmt(g.meta)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: Math.min(100, g.actual / g.meta * 100) + '%', background: STATE_COLOR[stateMeta(g.actual, g.meta)].color, transition: 'width .4s' }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text3)', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {phase === 0 ? 'Próximo hito: primer salario completo · ~25 jun 2026'
              : phase === 1 ? `Próximo hito: colchón completo (${fmt(colchon?.meta || 0)}) → entra Fase 2`
                : phase === 2 ? 'Próximo hito: liquidar deuda con interés → entra Fase 3'
                  : 'Próximo hito: fondo de emergencia completo'}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Últimos movimientos</span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: 11 }} onClick={goToMovimientos}>Ver todos →</button>
          </div>
          {recent.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14, width: 18, flexShrink: 0 }}>{catIcon(t.cat)}</span>
              <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.desc}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{t.d.slice(5).replace('-', '/')}</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--red)', flexShrink: 0 }}>{fmtFull(t.amt)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* NIVEL 4 · Gasto mensual + Categorías */}
      <div className="grid-2">
        <div className="card" data-tone="blue">
          <div className="card-head">
            <span className="card-title">Gasto mensual</span>
            <div className="toggle-row">
              <button className={'toggle-btn' + (chartMode === 'exp' ? ' active' : '')} onClick={() => setChartMode('exp')}>Gastos</button>
              <button className={'toggle-btn' + (chartMode === 'both' ? ' active' : '')} onClick={() => setChartMode('both')}>vs Ingresos</button>
            </div>
          </div>
          <div className="chart-wrap">
            {expSum(periodTxs) === 0 && periodInc === 0
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 12 }}>Sin movimientos en este período</div>
              : <canvas ref={monthlyRef} />}
          </div>
        </div>
        <div className="card" data-tone="purple">
          <div className="card-head"><span className="card-title">Categorías</span></div>
          <div style={{ position: 'relative', height: 160 }}>
            {donutTotal === 0
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 12 }}>Sin gastos</div>
              : <>
                <canvas ref={donutRef} />
                <div className="donut-center">
                  <div className="donut-center-val">{fmt(donutTotal)}</div>
                  <div className="donut-center-label">total gastos</div>
                </div>
              </>}
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: 10, color: 'var(--text2)' }}>
            {sorted.slice(0, 6).map(([cat]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: catColor(cat), flexShrink: 0 }} />{cat.split(' & ')[0]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
