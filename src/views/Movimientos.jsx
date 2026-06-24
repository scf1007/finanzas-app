import React, { useMemo, useState } from 'react';
import { useStore } from '../state/StoreContext';
import { fmtFull, catColor, catIcon, MONTHS } from '../logic';

const PER_PAGE = 30;

export default function Movimientos({ onEdit, onAdd, onImport }) {
  const { state, deleteTx } = useStore();
  const [search, setSearch] = useState('');
  const [monthF, setMonthF] = useState('');
  const [catF, setCatF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [page, setPage] = useState(0);

  const cats = useMemo(() => [...new Set(state.txs.map(t => t.cat))].sort(), [state.txs]);

  const filtered = useMemo(() => {
    let list = [...state.txs].sort((a, b) => b.d.localeCompare(a.d));
    if (search) { const q = search.toLowerCase(); list = list.filter(t => t.desc.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q)); }
    if (monthF) { const mi = MONTHS.indexOf(monthF); list = list.filter(t => +t.d.slice(5, 7) === mi); }
    if (catF) list = list.filter(t => t.cat === catF);
    if (typeF === 'deb') list = list.filter(t => t.amt < 0);
    if (typeF === 'cred') list = list.filter(t => t.amt > 0);
    return list;
  }, [state.txs, search, monthF, catF, typeF]);

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const pageList = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totExp = filtered.filter(t => t.amt < 0).reduce((s, t) => s + Math.abs(t.amt), 0);
  const totInc = filtered.filter(t => t.amt > 0).reduce((s, t) => s + t.amt, 0);

  return (
    <div className="view active" id="view-movimientos">
      <div className="view-title">Movimientos</div>
      <div className="view-subtitle">Historial de transacciones · Nu + Banco de Bogotá</div>

      <div className="filter-row">
        <input className="filter-input" placeholder="🔍  Buscar..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select className="filter-select" value={monthF} onChange={e => { setMonthF(e.target.value); setPage(0); }}>
          <option value="">Todos los meses</option>
          {MONTHS.slice(1).map(m => <option key={m}>{m}</option>)}
        </select>
        <select className="filter-select" value={catF} onChange={e => { setCatF(e.target.value); setPage(0); }}>
          <option value="">Todas las categorías</option>
          {cats.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={typeF} onChange={e => { setTypeF(e.target.value); setPage(0); }}>
          <option value="">Débito + Crédito</option>
          <option value="deb">Solo gastos</option>
          <option value="cred">Solo ingresos</option>
        </select>
        <button className="btn btn-ghost" onClick={onImport}>⬆ Importar extracto</button>
        <button className="btn btn-primary" onClick={onAdd}>+ Agregar</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 24, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span style={{ color: 'var(--text3)' }}>{filtered.length} movimientos</span>
          <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)' }}>−{fmtFull(totExp)}</span>
          <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>+{fmtFull(totInc)}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Cuenta</th><th style={{ textAlign: 'right' }}>Monto (COP)</th><th></th><th></th></tr>
            </thead>
            <tbody>
              {pageList.map(t => (
                <tr key={t.id}>
                  <td className="td-mono td-dim" style={{ whiteSpace: 'nowrap' }}>{t.d.slice(5).replace('-', '/')}</td>
                  <td>
                    <div style={{ fontSize: 13 }}>{t.desc}</div>
                    {t.note && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.note}</div>}
                  </td>
                  <td><span className="cat-badge" style={{ background: catColor(t.cat) + '18', color: catColor(t.cat) }}><span style={{ fontSize: 11 }}>{catIcon(t.cat)}</span> {t.cat}</span></td>
                  <td className="td-muted">{t.acc || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="td-mono" style={{ color: t.amt < 0 ? 'var(--red)' : 'var(--green)' }}>{t.amt < 0 ? '−' : '+'}{fmtFull(t.amt)}</div>
                    {t.origCurrency && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t.origCurrency} {(t.origAmt || 0).toLocaleString('es-CO')}</div>}
                  </td>
                  <td style={{ textAlign: 'center' }}>{t.catSource === 'db' && <span title="Categorizado automáticamente">⚡</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(t)}>✎</button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('¿Eliminar?')) deleteTx(t.id); }}>✕</button>
                  </td>
                </tr>
              ))}
              {pageList.length === 0 && <tr><td colSpan={7} className="empty"><div className="empty-icon">◎</div><div className="empty-text">Sin resultados</div></td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anterior</button>
            <span>Página {page + 1} de {pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
          </div>
        )}
      </div>
    </div>
  );
}
