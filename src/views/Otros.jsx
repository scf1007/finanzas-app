import React, { useMemo, useState } from 'react';
import { useStore } from '../state/StoreContext';
import { Modal, Field, useChart } from '../components/shared';
import { fmt, fmtFull, expSum, expenses, catColor, catIcon, MONTHS, uid } from '../logic';

// ═══════════════ PRESUPUESTO ═══════════════
export function Presupuesto() {
  const { state, saveBudget } = useStore();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({});

  const year = '2026';
  const monthTxs = useMemo(() =>
    state.txs.filter(t => t.d.startsWith(`${year}-${String(month).padStart(2, '0')}`)), [state.txs, month]);

  const catSpend = {};
  expenses(monthTxs).forEach(t => { catSpend[t.cat] = (catSpend[t.cat] || 0) + Math.abs(t.amt); });
  const budget = state.budget || {};
  const rows = Object.entries(budget).map(([cat, limit]) => ({ cat, limit, spent: catSpend[cat] || 0 }));
  const totLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totSpent = rows.reduce((s, r) => s + r.spent, 0);

  const chartRef = useChart(() => ({
    type: 'doughnut',
    data: {
      labels: ['Gastado', 'Disponible'],
      datasets: [{ data: [totSpent, Math.max(0, totLimit - totSpent)], backgroundColor: ['#a8ff47', 'rgba(255,255,255,0.08)'], borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } },
  }), [totSpent, totLimit]);

  return (
    <div className="view active">
      <div className="view-title">Presupuesto</div>
      <div className="view-subtitle">Límites mensuales por categoría</div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <select className="filter-select" value={month} onChange={e => setMonth(+e.target.value)}>
          {MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={() => { setDraft({ ...budget }); setEditOpen(true); }}>Editar límites</button>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><span className="card-title">Gasto vs Presupuesto</span></div>
          {rows.map(r => {
            const pct = r.limit > 0 ? (r.spent / r.limit) * 100 : 0;
            return (
              <div key={r.cat} className="budget-row">
                <div className="budget-head">
                  <div className="budget-cat"><span className="cat-dot" style={{ background: catColor(r.cat) }} />{r.cat}</div>
                  <div className="budget-amounts">{fmtFull(r.spent)} / {fmtFull(r.limit)} <span className="budget-pct" style={{ color: pct > 100 ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)' }}>{pct.toFixed(0)}%</span></div>
                </div>
                <div className="prog-wrap"><div className="prog-bar" style={{ width: Math.min(100, pct) + '%', background: pct > 100 ? 'var(--red)' : catColor(r.cat) }} /></div>
              </div>
            );
          })}
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">Resumen del mes</span></div>
          <div className="chart-wrap-sm"><canvas ref={chartRef} /></div>
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text2)' }}>
            {fmtFull(totSpent)} gastados de {fmtFull(totLimit)} presupuestados · {totLimit > 0 ? ((totSpent / totLimit) * 100).toFixed(0) : 0}%
          </div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar presupuesto mensual"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { saveBudget(draft); setEditOpen(false); }}>Guardar</button>
        </>}>
        {Object.entries(draft).map(([cat, limit]) => (
          <Field key={cat} label={cat}>
            <input className="form-input" type="number" value={limit}
              onChange={e => setDraft(d => ({ ...d, [cat]: +e.target.value || 0 }))} />
          </Field>
        ))}
      </Modal>
    </div>
  );
}

// ═══════════════ INSIGHTS ═══════════════
export function Insights() {
  const { state, session } = useStore();
  const [year, setYear] = useState('all');

  // Años disponibles en los datos
  const years = useMemo(() => {
    const ys = [...new Set(state.txs.map(t => t.d.slice(0, 4)))].sort().reverse();
    return ys;
  }, [state.txs]);

  const scopeTxs = useMemo(() =>
    year === 'all' ? state.txs : state.txs.filter(t => t.d.startsWith(year)),
    [state.txs, year]);

  const catTotals = {};
  expenses(scopeTxs).forEach(t => { catTotals[t.cat] = (catTotals[t.cat] || 0) + Math.abs(t.amt); });
  const top = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const allExp = expSum(scopeTxs) || 1;
  const monthsWithData = new Set(scopeTxs.map(t => t.d.slice(0, 7))).size || 1;

  const trendRef = useChart(() => {
    // Serie por mes (YYYY-MM) sobre todo el scope, no solo 12 meses de un año
    const byMonth = {};
    expenses(scopeTxs).forEach(t => {
      const m = t.d.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + Math.abs(t.amt);
    });
    const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
    const labels = sorted.map(([m]) => {
      const [y, mm] = m.split('-');
      return MONTHS[+mm].slice(0, 3) + (year === 'all' ? ` ${y.slice(2)}` : '');
    });
    const data = sorted.map(([, v]) => Math.round(v));
    return {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: '#a8ff47', backgroundColor: 'rgba(168,255,71,0.08)', fill: true, tension: 0.35, pointRadius: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmtFull(c.raw) } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 10 } }, border: { display: false } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#52525b', font: { size: 10 }, callback: v => fmt(v) }, border: { display: false } },
        },
      },
    };
  }, [scopeTxs, year]);

  return (
    <div className="view active">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="view-title">Insights</div>
          <div className="view-subtitle">Patrones, tendencias y análisis personalizado</div>
        </div>
        <select className="filter-select" value={year} onChange={e => setYear(e.target.value)}>
          <option value="all">Todo el histórico</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Análisis con IA */}
      <AIInsights state={state} userId={session?.user?.id} />

      <div className="grid-4">
        {[
          { label: year === 'all' ? 'Gasto total' : 'Gasto ' + year, val: fmt(allExp) },
          { label: 'Promedio mensual', val: fmt(allExp / monthsWithData) },
          { label: 'Categoría top', val: top[0]?.[0]?.split(' & ')[0] || '—' },
          { label: 'Movimientos', val: String(scopeTxs.length) },
        ].map(k => (
          <div key={k.label} className="card-sm">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><span className="card-title">Tendencia de gasto</span></div>
          <div className="chart-wrap">
            {monthsWithData > 0 && scopeTxs.length
              ? <canvas ref={trendRef} />
              : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 12 }}>Sin datos en este período</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">Top categorías</span></div>
          {top.slice(0, 8).map(([cat, total]) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 18 }}>{catIcon(cat)}</span>
              <span style={{ flex: 1, fontSize: 12 }}>{cat}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmt(total)}</span>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', width: 38, textAlign: 'right' }}>{(total / allExp * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SEV = {
  alta: { color: 'var(--red)', bg: 'var(--red-dim)', label: 'Alta' },
  media: { color: 'var(--yellow)', bg: 'var(--yellow-dim)', label: 'Media' },
  baja: { color: 'var(--text3)', bg: 'var(--surface2)', label: 'Baja' },
};
const TYPE_ICON = { goteo: '📈', suscripcion: '🔄', fase: '🎯' };

function AIInsights({ state, userId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState(true);

  React.useEffect(() => {
    if (!userId) return;
    let alive = true;
    import('../lib/insights').then(async ({ loadCachedInsights, isCacheFresh }) => {
      const cached = await loadCachedInsights(userId);
      if (!alive) return;
      if (cached) {
        setData({ ...cached.payload, generated_at: cached.generated_at });
        setFresh(isCacheFresh(cached, state));
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const run = async (force) => {
    setLoading(true); setError('');
    try {
      const { generateInsights } = await import('../lib/insights');
      const res = await generateInsights(state, userId, { force });
      setData(res); setFresh(true);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 18, borderColor: 'rgba(168,255,71,0.2)' }}>
      <div className="card-head">
        <span className="card-title">✨ Análisis personalizado</span>
        {data && !loading && (
          <button className="btn btn-ghost btn-sm" onClick={() => run(true)}>Regenerar</button>
        )}
      </div>

      {loading && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text2)' }}>
          <div style={{ fontSize: 22, marginBottom: 10 }}>◍</div>
          <div style={{ fontSize: 13 }}>Analizando tus finanzas…</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Unos segundos.</div>
        </div>
      )}

      {!loading && !data && !error && (
        <div style={{ padding: '20px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
            Un asesor con IA mira tus movimientos y te dice qué patrones hay, qué suscripciones pesan, y si tu gasto va acorde a tu fase.
          </div>
          <button className="btn btn-primary" onClick={() => run(false)} disabled={!userId}>Analizar mis finanzas</button>
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 12, padding: '10px 0' }}>{error}</div>}

      {!loading && data && (
        <>
          {!fresh && (
            <div style={{ fontSize: 11, color: 'var(--yellow)', marginBottom: 12, padding: '6px 10px', background: 'var(--yellow-dim)', borderRadius: 'var(--r-sm)' }}>
              Tienes movimientos nuevos desde este análisis. Toca "Regenerar" para actualizarlo.
            </div>
          )}
          {data.summary && (
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              {data.summary}
            </div>
          )}
          {(data.insights || []).map((ins, i) => {
            const sev = SEV[ins.severity] || SEV.baja;
            return (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: i < data.insights.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_ICON[ins.type] || '•'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{ins.title}</span>
                    <span style={{ fontSize: 9, color: sev.color, background: sev.bg, padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase', fontWeight: 700 }}>{sev.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>{ins.detail}</div>
                  {ins.amount != null && ins.amount > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', marginTop: 4 }}>{fmtFull(ins.amount)}</div>
                  )}
                </div>
              </div>
            );
          })}
          {data.generated_at && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 12, textAlign: 'right' }}>
              Generado {new Date(data.generated_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Cuentas() {
  const { state, saveAccount, deleteAccount } = useStore();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [bal, setBal] = useState('');
  const [color, setColor] = useState('#a78bfa');
  const totalBal = state.accounts.reduce((s, a) => s + a.balance, 0) || 1;

  const chartRef = useChart(() => ({
    type: 'doughnut',
    data: { labels: state.accounts.map(a => a.name), datasets: [{ data: state.accounts.map(a => a.balance), backgroundColor: state.accounts.map(a => a.color), borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { labels: { color: '#71717a', font: { size: 12 }, boxWidth: 10 } }, tooltip: { callbacks: { label: c => ' ' + fmtFull(c.raw) } } } },
  }), [state.accounts]);

  return (
    <div className="view active">
      <div className="view-title">Cuentas</div>
      <div className="view-subtitle">Saldos y distribución</div>

      <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setAddOpen(true)}>+ Agregar cuenta</button>

      <div className="grid-2">
        <div>
          {state.accounts.map(a => (
            <div key={a.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.color }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 10 }}
                    onClick={() => { const n = prompt('Nuevo nombre:', a.name); if (n?.trim()) saveAccount({ ...a, name: n.trim() }); }}>✎</button>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('¿Eliminar cuenta?')) deleteAccount(a.id); }}>✕</button>
              </div>
              <div className="kpi-value" style={{ fontSize: 22 }}>{fmtFull(a.balance)}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{(a.balance / totalBal * 100).toFixed(1)}% del total</div>
              <div className="prog-wrap" style={{ marginTop: 10 }}><div className="prog-bar" style={{ width: (a.balance / totalBal * 100) + '%', background: a.color }} /></div>
              <AccountBalanceEditor account={a} onSave={saveAccount} />
            </div>
          ))}
        </div>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head"><span className="card-title">Distribución</span></div>
          <div style={{ height: 240 }}><canvas ref={chartRef} /></div>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Agregar cuenta"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            if (!name.trim()) return alert('Ingresá un nombre');
            saveAccount({ id: uid(), name: name.trim(), balance: +bal || 0, color });
            setAddOpen(false); setName(''); setBal('');
          }}>Guardar</button>
        </>}>
        <Field label="Nombre"><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Nu, Bancolombia..." /></Field>
        <Field label="Saldo inicial"><input className="form-input" type="number" value={bal} onChange={e => setBal(e.target.value)} placeholder="0" /></Field>
        <Field label="Color"><input className="form-input" type="color" value={color} onChange={e => setColor(e.target.value)} style={{ height: 40, padding: 4 }} /></Field>
      </Modal>
    </div>
  );
}

function AccountBalanceEditor({ account, onSave }) {
  const [val, setVal] = useState(account.balance);
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <input type="number" className="form-input" value={val} onChange={e => setVal(e.target.value)} style={{ flex: 1 }} />
      <button className="btn btn-ghost btn-sm" onClick={() => onSave({ ...account, balance: +val || 0 })}>Actualizar</button>
    </div>
  );
}
