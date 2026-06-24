import React, { useEffect, useState } from 'react';
import { useStore } from '../state/StoreContext';
import { Modal, Field, Row } from './shared';
import { CATS, fmtFull, today, uid } from '../logic';

// ── Movimiento (crear/editar) ────────────────────────────────
export function TxModal({ open, onClose, editing }) {
  const { state, saveTx } = useStore();
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open) return;
    setF(editing ? {
      d: editing.d, type: editing.amt < 0 ? 'deb' : 'cred', desc: editing.desc,
      amt: Math.abs(editing.origAmt ?? editing.amt), cat: editing.cat, acc: editing.acc || '', note: editing.note || '',
    } : { d: today(), type: 'deb', desc: '', amt: '', cat: CATS[0].name, acc: state.accounts[0]?.name || '', note: '' });
  }, [open, editing]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = () => {
    if (!f.desc?.trim() || !+f.amt) return alert('Completá descripción y monto');
    const amt = f.type === 'deb' ? -Math.abs(+f.amt) : Math.abs(+f.amt);
    const tx = { id: editing?.id || uid(), d: f.d, desc: f.desc.trim(), amt, cat: f.cat, acc: f.acc, note: f.note?.trim() || undefined };
    if (editing) tx.catSource = 'manual';
    saveTx(tx);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar movimiento' : 'Agregar movimiento'}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>{editing ? 'Guardar cambios' : 'Guardar'}</button>
      </>}>
      <Row>
        <Field label="Fecha"><input className="form-input" type="date" value={f.d || ''} onChange={e => set('d', e.target.value)} /></Field>
        <Field label="Tipo">
          <select className="form-input" value={f.type || 'deb'} onChange={e => set('type', e.target.value)}>
            <option value="deb">Gasto</option><option value="cred">Ingreso</option>
          </select>
        </Field>
      </Row>
      <Field label="Descripción"><input className="form-input" value={f.desc || ''} onChange={e => set('desc', e.target.value)} placeholder="Ej: Rappi, Uber, Spotify..." /></Field>
      <Field label="Monto (COP)"><input className="form-input" type="number" value={f.amt || ''} onChange={e => set('amt', e.target.value)} placeholder="0" /></Field>
      <Row>
        <Field label="Categoría">
          <select className="form-input" value={f.cat || ''} onChange={e => set('cat', e.target.value)}>
            {CATS.map(c => <option key={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Cuenta">
          <select className="form-input" value={f.acc || ''} onChange={e => set('acc', e.target.value)}>
            {state.accounts.map(a => <option key={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </Row>
      <Field label="Nota (opcional)"><input className="form-input" value={f.note || ''} onChange={e => set('note', e.target.value)} /></Field>
    </Modal>
  );
}

// ── Pendiente (crear/editar) ─────────────────────────────────
export function PendingModal({ open, onClose, editing }) {
  const { savePending } = useStore();
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open) return;
    const def = new Date(); def.setDate(def.getDate() + 30);
    setF(editing ? { ...editing } : { name: '', amt: '', due: def.toISOString().slice(0, 10), cat: 'Utilities', recur: 'monthly', icon: '' });
  }, [open, editing]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = () => {
    if (!f.name?.trim() || !+f.amt || !f.due) return alert('Completá todos los campos');
    savePending({ ...f, id: editing?.id || uid(), name: f.name.trim(), amt: +f.amt, icon: f.icon || '📋', paid: editing?.paid || false });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar pendiente' : 'Agregar pendiente'}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>{editing ? 'Guardar cambios' : 'Guardar'}</button>
      </>}>
      <Field label="Nombre"><input className="form-input" value={f.name || ''} onChange={e => set('name', e.target.value)} placeholder="Ej: Netflix, Arriendo..." /></Field>
      <Row>
        <Field label="Monto (COP)"><input className="form-input" type="number" value={f.amt || ''} onChange={e => set('amt', e.target.value)} /></Field>
        <Field label="Fecha vencimiento"><input className="form-input" type="date" value={f.due || ''} onChange={e => set('due', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Categoría">
          <select className="form-input" value={f.cat || ''} onChange={e => set('cat', e.target.value)}>
            {CATS.map(c => <option key={c.name}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Recurrencia">
          <select className="form-input" value={f.recur || 'none'} onChange={e => set('recur', e.target.value)}>
            <option value="none">Una vez</option><option value="monthly">Mensual</option>
            <option value="bimonthly">Bimestral</option><option value="yearly">Anual</option>
          </select>
        </Field>
      </Row>
      <Field label="Emoji / Ícono"><input className="form-input" value={f.icon || ''} onChange={e => set('icon', e.target.value)} placeholder="🏠" maxLength={2} /></Field>
    </Modal>
  );
}

// ── Registrar pago de deuda ──────────────────────────────────
export function DebtPayModal({ open, onClose, debtId }) {
  const { state, payDebt } = useStore();
  const [sel, setSel] = useState('');
  const [amt, setAmt] = useState('');
  const [fecha, setFecha] = useState(today());

  const activeDebts = state.debts.filter(d => d.saldo > 0).sort((a, b) => a.orden_ataque - b.orden_ataque);
  const debt = state.debts.find(d => d.id === sel);

  useEffect(() => {
    if (!open) return;
    const first = debtId || activeDebts[0]?.id || '';
    setSel(first); setFecha(today());
    const d = state.debts.find(x => x.id === first);
    if (d) setAmt(Math.min(d.cuota_actual, d.saldo));
  }, [open, debtId]);

  useEffect(() => {
    if (debt) setAmt(Math.min(debt.cuota_actual, debt.saldo));
  }, [sel]);

  const nuevo = debt ? Math.max(0, debt.saldo - (+amt || 0)) : 0;

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago de deuda" maxWidth={440}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => {
          if (!debt || !+amt) return alert('Monto inválido');
          payDebt(debt.id, +amt, fecha); onClose();
        }}>Registrar pago</button>
      </>}>
      <Field label="Deuda">
        <select className="form-input" value={sel} onChange={e => setSel(e.target.value)}>
          {activeDebts.map(d => <option key={d.id} value={d.id}>{d.acreedor} · saldo {fmtFull(d.saldo)}</option>)}
        </select>
      </Field>
      <Row>
        <Field label="Monto pagado"><input className="form-input" type="number" value={amt} onChange={e => setAmt(e.target.value)} /></Field>
        <Field label="Fecha"><input className="form-input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></Field>
      </Row>
      {debt && +amt > 0 && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 14px', fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
          Saldo: {fmtFull(debt.saldo)} → <span style={{ color: 'var(--accent)' }}>{fmtFull(nuevo)}</span>{nuevo === 0 ? ' · 🎉 ¡la cierras!' : ''}
        </div>
      )}
    </Modal>
  );
}

// ── Editar deuda ─────────────────────────────────────────────
export function DebtEditModal({ open, onClose, debtId }) {
  const { state, saveDebt } = useStore();
  const debt = state.debts.find(d => d.id === debtId);
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open || !debt) return;
    setF({
      acreedor: debt.acreedor, saldo: debt.saldo, cuota: debt.cuota_actual,
      tasa: (debt.tasa_ea * 100).toFixed(2), corte: debt.fecha_corte ? +debt.fecha_corte.slice(8) : '',
    });
  }, [open, debtId]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = () => {
    if (!debt) return;
    const upd = { ...debt };
    if (f.acreedor?.trim()) upd.acreedor = f.acreedor.trim();
    if (!isNaN(+f.saldo) && +f.saldo >= 0) {
      upd.saldo = +f.saldo;
      if (+f.saldo > upd.saldo_inicial) upd.saldo_inicial = +f.saldo;
    }
    if (+f.cuota > 0) upd.cuota_actual = +f.cuota;
    if (!isNaN(+f.tasa) && +f.tasa >= 0) upd.tasa_ea = +f.tasa / 100;
    if (+f.corte >= 1 && +f.corte <= 31) {
      const now = new Date();
      upd.fecha_corte = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(+f.corte).padStart(2, '0')}`;
    }
    saveDebt(upd); onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Editar deuda" maxWidth={460}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>Guardar cambios</button>
      </>}>
      <Field label="Acreedor"><input className="form-input" value={f.acreedor || ''} onChange={e => set('acreedor', e.target.value)} /></Field>
      <Row>
        <Field label="Saldo actual (COP)"><input className="form-input" type="number" value={f.saldo ?? ''} onChange={e => set('saldo', e.target.value)} /></Field>
        <Field label="Cuota mensual (COP)"><input className="form-input" type="number" value={f.cuota ?? ''} onChange={e => set('cuota', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Tasa EA (%)"><input className="form-input" type="number" step="0.01" value={f.tasa ?? ''} onChange={e => set('tasa', e.target.value)} /></Field>
        <Field label="Día de corte (1-31)"><input className="form-input" type="number" min={1} max={31} value={f.corte ?? ''} onChange={e => set('corte', e.target.value)} /></Field>
      </Row>
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
        Útil cuando cambia la cuota (ej: subir el abono a tu abuela al liberar otra deuda) o para corregir el saldo tras un extracto.
      </div>
    </Modal>
  );
}
