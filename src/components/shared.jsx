import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useStore } from '../state/StoreContext';
import { fmt } from '../logic';

// ── Modal genérica ───────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, maxWidth = 480 }) {
  if (!open) return null;
  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth }}>
        <h3>{title}</h3>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ── Chart.js como hook ───────────────────────────────────────
export function useChart(configFactory, deps) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current.getContext('2d'), configFactory());
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return canvasRef;
}

// ── Form helpers ─────────────────────────────────────────────
export const Field = ({ label, children }) => (
  <div className="form-group"><label className="form-label">{label}</label>{children}</div>
);
export const Row = ({ children }) => <div className="form-row">{children}</div>;

// ── Layout: nav + topbar móvil + FAB ─────────────────────────
const NAV = [
  { section: 'Overview' },
  { id: 'dashboard', icon: '◈', label: 'Dashboard' },
  { id: 'movimientos', icon: '↕', label: 'Movimientos' },
  { section: 'Gestión' },
  { id: 'pendientes', icon: '⏱', label: 'Pendientes' },
  { id: 'presupuesto', icon: '◧', label: 'Presupuesto' },
  { section: 'Análisis' },
  { id: 'analisis', icon: '◉', label: 'Insights' },
  { id: 'cuentas', icon: '⬡', label: 'Cuentas' },
];

export function Layout({ view, setView, onAddTx, children }) {
  const { state, signOut, toast } = useStore();
  const [navOpen, setNavOpen] = useState(false);
  const totalBal = (state?.accounts || []).reduce((s, a) => s + a.balance, 0);
  const overdueCount = (state?.pending || []).filter(p => !p.paid && new Date(p.due) < new Date(new Date().toISOString().slice(0, 10))).length;

  const go = id => { setView(id); setNavOpen(false); };

  return (
    <>
      <div className="mobile-topbar">
        <button className="mt-hamb" onClick={() => setNavOpen(v => !v)} aria-label="Menú">☰</button>
        <span className="mt-logo">SCF · Finanzas</span>
        <div className="mt-actions">
          <button onClick={signOut} title="Cerrar sesión">⎋</button>
        </div>
      </div>
      <div className={'nav-overlay' + (navOpen ? ' open' : '')} onClick={() => setNavOpen(false)} />

      <nav className={navOpen ? 'open' : ''}>
        <div className="nav-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div className="nav-logo">SCF · Finanzas</div>
            <button onClick={signOut} title="Cerrar sesión"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text2)', fontFamily: 'inherit' }}>⎋</button>
          </div>
          <div className="nav-sub">Santiago Chavarro</div>
        </div>
        <div className="nav-items">
          {NAV.map((item, i) => item.section
            ? <div key={i} className="nav-section">{item.section}</div>
            : (
              <button key={item.id} className={'nav-item' + (view === item.id ? ' active' : '')} onClick={() => go(item.id)}>
                <span className="icon">{item.icon}</span> {item.label}
                {item.id === 'pendientes' && overdueCount > 0 &&
                  <span style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#000', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10 }}>{overdueCount}</span>}
              </button>
            ))}
        </div>
        <div className="nav-footer">
          <div className="nav-account">Saldo actual estimado</div>
          <div className="nav-balance">{fmt(totalBal)}</div>
        </div>
      </nav>

      <main>{children}</main>

      <button className="fab" onClick={onAddTx} aria-label="Agregar movimiento">+</button>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
