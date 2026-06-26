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
  const { state, savePending } = useStore();
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open) return;
    const def = new Date(); def.setDate(def.getDate() + 30);
    setF(editing ? { ...editing } : { name: '', amt: '', due: def.toISOString().slice(0, 10), cat: 'Utilities', recur: 'monthly', icon: '', debt_id: null });
  }, [open, editing]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = () => {
    if (!f.name?.trim() || !+f.amt || !f.due) return alert('Completá todos los campos');
    savePending({ ...f, id: editing?.id || uid(), name: f.name.trim(), amt: +f.amt, icon: f.icon || '📋', paid: editing?.paid || false, debt_id: f.debt_id || null });
    onClose();
  };

  const activeDebts = (state?.debts || []).filter(d => d.saldo > 0);

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
      {activeDebts.length > 0 && (
        <Field label="¿Este recibo incluye la cuota de una deuda? (opcional)">
          <select className="form-input" value={f.debt_id || ''} onChange={e => set('debt_id', e.target.value || null)}>
            <option value="">No, es un gasto normal</option>
            {activeDebts.map(d => <option key={d.id} value={d.id}>Sí, abona a: {d.acreedor}</option>)}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Para recibos dobles, como Codensa, que cobran servicios y la cuota de la tarjeta juntos. Al pagar, indicarás cuánto fue la cuota.
          </div>
        </Field>
      )}
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
  const isNew = open && !debt;
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open) return;
    if (debt) {
      setF({
        acreedor: debt.acreedor, saldo: debt.saldo, cuota: debt.cuota_actual,
        tasa: (debt.tasa_ea * 100).toFixed(2), corte: debt.fecha_corte ? +debt.fecha_corte.slice(8) : '',
      });
    } else {
      setF({ acreedor: '', saldo: '', cuota: '', tasa: '', corte: '' });
    }
  }, [open, debtId]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = () => {
    if (isNew) {
      if (!f.acreedor?.trim() || isNaN(+f.saldo) || +f.saldo < 0) return;
      const saldo = +f.saldo;
      const now = new Date();
      const maxOrden = Math.max(0, ...state.debts.map(d => d.orden_ataque || 0));
      const nd = {
        id: uid(),
        acreedor: f.acreedor.trim(),
        saldo, saldo_inicial: saldo,
        cuota_actual: +f.cuota > 0 ? +f.cuota : 0,
        tasa_ea: !isNaN(+f.tasa) && +f.tasa >= 0 ? +f.tasa / 100 : 0,
        orden_ataque: maxOrden + 1,
        metodo_pago: 'manual',
        fecha_corte: (+f.corte >= 1 && +f.corte <= 31)
          ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(+f.corte).padStart(2, '0')}`
          : null,
      };
      saveDebt(nd); onClose(); return;
    }
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
    <Modal open={open} onClose={onClose} title={isNew ? 'Nueva deuda' : 'Editar deuda'} maxWidth={460}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>{isNew ? 'Agregar deuda' : 'Guardar cambios'}</button>
      </>}>
      <Field label="Acreedor"><input className="form-input" value={f.acreedor || ''} onChange={e => set('acreedor', e.target.value)} placeholder={isNew ? 'Ej: Tarjeta CrediBanco' : ''} /></Field>
      <Row>
        <Field label="Saldo actual (COP)"><input className="form-input" type="number" value={f.saldo ?? ''} onChange={e => set('saldo', e.target.value)} /></Field>
        <Field label="Cuota mensual (COP)"><input className="form-input" type="number" value={f.cuota ?? ''} onChange={e => set('cuota', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Tasa EA (%)"><input className="form-input" type="number" step="0.01" value={f.tasa ?? ''} onChange={e => set('tasa', e.target.value)} /></Field>
        <Field label="Día de corte (1-31)"><input className="form-input" type="number" min={1} max={31} value={f.corte ?? ''} onChange={e => set('corte', e.target.value)} /></Field>
      </Row>
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
        {isNew
          ? 'La nueva deuda entra al final del orden de ataque; puedes reordenar después. La tasa EA define su urgencia (color).'
          : 'Útil cuando cambia la cuota (ej: subir el abono a tu abuela al liberar otra deuda) o para corregir el saldo tras un extracto.'}
      </div>
    </Modal>
  );
}

// ── Confirmar pago de un pendiente ───────────────────────────
// Ventana de confirmación de monto. Si el pendiente está vinculado a una deuda
// (recibo doble, ej. Codensa), permite indicar cuánto del total fue abono a la
// deuda; ese monto baja el saldo de la deuda y el resto queda como gasto.
export function PendingPayModal({ open, onClose, pending }) {
  const { state, payPending } = useStore();
  const [amt, setAmt] = useState('');
  const [abono, setAbono] = useState('');
  const [fecha, setFecha] = useState(today());

  const linkedDebt = pending?.debt_id ? state.debts.find(d => d.id === pending.debt_id) : null;

  useEffect(() => {
    if (!open || !pending) return;
    setAmt(pending.amt);
    setFecha(today());
    // Por defecto, sugerimos la cuota de la deuda si existe, acotada al saldo y al total
    if (linkedDebt) {
      const sugerido = Math.min(linkedDebt.cuota_actual || 0, linkedDebt.saldo, pending.amt);
      setAbono(sugerido > 0 ? sugerido : '');
    } else {
      setAbono('');
    }
  }, [open, pending]);

  if (!pending) return null;

  const total = +amt || 0;
  const abonoNum = linkedDebt ? Math.min(+abono || 0, linkedDebt.saldo) : 0;
  const gastoServicios = Math.max(0, total - abonoNum);
  const saldoNuevo = linkedDebt ? Math.max(0, linkedDebt.saldo - abonoNum) : 0;
  const abonoInvalido = linkedDebt && abonoNum > total;

  return (
    <Modal open={open} onClose={onClose} title="Confirmar pago" maxWidth={460}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => {
          if (!total) return alert('Monto inválido');
          if (abonoInvalido) return alert('El abono no puede superar el monto total');
          payPending(pending.id, { total, abono: abonoNum, fecha });
          onClose();
        }}>Confirmar pago</button>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 20 }}>{pending.icon || '📋'}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{pending.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{pending.cat}</div>
        </div>
      </div>

      <Row>
        <Field label="Monto total pagado"><input className="form-input" type="number" value={amt} onChange={e => setAmt(e.target.value)} /></Field>
        <Field label="Fecha"><input className="form-input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></Field>
      </Row>

      {linkedDebt && (
        <>
          <Field label={`¿Cuánto de este pago fue cuota de ${linkedDebt.acreedor}?`}>
            <input className="form-input" type="number" value={abono} onChange={e => setAbono(e.target.value)} placeholder="0" />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
              El resto se registra como gasto de servicios. La cuota varía cada mes; revisá tu recibo.
            </div>
          </Field>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '14px 16px', fontSize: 12, lineHeight: 1.9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)' }}>Abono a la deuda</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtFull(abonoNum)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)' }}>Gasto de servicios</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmtFull(gastoServicios)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, marginTop: 4, borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text3)' }}>Saldo {linkedDebt.acreedor}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{fmtFull(linkedDebt.saldo)} → <span style={{ color: 'var(--accent)' }}>{fmtFull(saldoNuevo)}</span>{saldoNuevo === 0 && abonoNum > 0 ? ' 🎉' : ''}</span>
            </div>
          </div>
          {abonoInvalido && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 8 }}>El abono no puede superar el monto total.</div>}
        </>
      )}
    </Modal>
  );
}
