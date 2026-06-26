import React, { useState } from 'react';
import { useStore } from './state/StoreContext';
import { Layout } from './components/shared';
import { TxModal, PendingModal, DebtPayModal, DebtEditModal, PendingPayModal } from './components/modals';
import { ImportStatementModal } from './components/ImportStatementModal';
import { Login, ImportJson } from './onboarding';
import Dashboard from './views/Dashboard';
import PlanAccion from './views/PlanAccion';
import Movimientos from './views/Movimientos';
import Pendientes from './views/Pendientes';
import { Presupuesto, Insights, Cuentas } from './views/Otros';

export default function App() {
  const { session, state, loading } = useStore();
  const [view, setView] = useState('dashboard');
  const [skippedImport, setSkippedImport] = useState(false);

  // Modales
  const [txModal, setTxModal] = useState({ open: false, editing: null });
  const [pendModal, setPendModal] = useState({ open: false, editing: null });
  const [debtPay, setDebtPay] = useState({ open: false, debtId: null });
  const [debtEdit, setDebtEdit] = useState({ open: false, debtId: null });
  const [pendPay, setPendPay] = useState({ open: false, pending: null });
  const [importOpen, setImportOpen] = useState(false);

  // Abre la confirmación de pago para un pendiente (acepta id u objeto)
  const openPendPay = idOrObj => {
    const p = typeof idOrObj === 'string' ? state?.pending.find(x => x.id === idOrObj) : idOrObj;
    if (p) setPendPay({ open: true, pending: p });
  };

  if (session === undefined) return <Splash msg="Conectando..." />;
  if (session === null) return <Login />;
  if (loading || !state) return <Splash msg="Cargando tu data..." />;

  // Primera vez: sin data → ofrecer importador
  const isEmpty = state.txs.length === 0 && state.debts.length === 0 && !state._profileExists;
  if (isEmpty && !skippedImport) return <ImportJson onDone={() => setSkippedImport(true)} />;

  const views = {
    dashboard: <Dashboard
      openDebtPay={id => setDebtPay({ open: true, debtId: id })}
      openEditDebt={id => setDebtEdit({ open: true, debtId: id })}
      openAddDebt={() => setDebtEdit({ open: true, debtId: null })}
      openAddPending={() => setPendModal({ open: true, editing: null })}
      onPayPending={openPendPay}
      goToMovimientos={() => setView('movimientos')} />,
    plan: <PlanAccion
      openDebtPay={id => setDebtPay({ open: true, debtId: id })} />,
    movimientos: <Movimientos
      onEdit={t => setTxModal({ open: true, editing: t })}
      onAdd={() => setTxModal({ open: true, editing: null })}
      onImport={() => setImportOpen(true)} />,
    pendientes: <Pendientes
      onEdit={p => setPendModal({ open: true, editing: p })}
      onAdd={() => setPendModal({ open: true, editing: null })}
      onPayPending={openPendPay} />,
    presupuesto: <Presupuesto />,
    analisis: <Insights />,
    cuentas: <Cuentas />,
  };

  return (
    <Layout view={view} setView={setView} onAddTx={() => setTxModal({ open: true, editing: null })}>
      {views[view]}
      <TxModal open={txModal.open} editing={txModal.editing} onClose={() => setTxModal({ open: false, editing: null })} />
      <PendingModal open={pendModal.open} editing={pendModal.editing} onClose={() => setPendModal({ open: false, editing: null })} />
      <DebtPayModal open={debtPay.open} debtId={debtPay.debtId} onClose={() => setDebtPay({ open: false, debtId: null })} />
      <DebtEditModal open={debtEdit.open} debtId={debtEdit.debtId} onClose={() => setDebtEdit({ open: false, debtId: null })} />
      <PendingPayModal open={pendPay.open} pending={pendPay.pending} onClose={() => setPendPay({ open: false, pending: null })} />
      <ImportStatementModal open={importOpen} onClose={() => setImportOpen(false)} />
    </Layout>
  );
}

function Splash({ msg }) {
  return (
    <div className="login-wrap">
      <div style={{ color: 'var(--text2)', fontSize: 13 }}>{msg}</div>
    </div>
  );
}
