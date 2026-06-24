import React, { useState, useMemo } from 'react';
import { useStore } from '../state/StoreContext';
import { Modal } from './shared';
import { CATS, fmtFull, catColor } from '../logic';
import {
  extractPdfText, pdfNeedsPassword, parseStatementText, markDuplicates, toTx, fingerprint,
} from '../lib/importStatement';
import { Storage } from '../storage/supabaseStorage';

// Flujo (Camino B): PICK -> PROCESSING -> REVIEW (uno por uno) -> DONE
const STEP = { PICK: 'pick', PROCESSING: 'processing', REVIEW: 'review', SAVING: 'saving', DONE: 'done' };

export function ImportStatementModal({ open, onClose }) {
  const { state, notify, refresh } = useStore();
  const [step, setStep] = useState(STEP.PICK);
  const [files, setFiles] = useState([]);
  const [defaultPwd, setDefaultPwd] = useState('');
  const [error, setError] = useState('');

  const [processed, setProcessed] = useState([]);
  const [queue, setQueue] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [rows, setRows] = useState([]);
  const [editId, setEditId] = useState(null);
  const [confirmedPrints, setConfirmedPrints] = useState(new Set());
  const [savedTotal, setSavedTotal] = useState(0);

  const reset = () => {
    setStep(STEP.PICK); setFiles([]); setDefaultPwd(''); setError('');
    setProcessed([]); setQueue([]); setCursor(0); setRows([]); setEditId(null);
    setConfirmedPrints(new Set()); setSavedTotal(0);
  };
  const close = () => { reset(); onClose(); };

  const onPick = e => { setFiles(Array.from(e.target.files || [])); setError(''); };

  const runProcess = async () => {
    if (!files.length) return;
    setStep(STEP.PROCESSING);
    setError('');
    const out = [];
    for (const file of files) {
      const entry = { name: file.name, ok: false };
      try {
        const locked = await pdfNeedsPassword(file);
        let text;
        try {
          text = await extractPdfText(file, locked ? defaultPwd : undefined);
        } catch (e) {
          if (e?.name === 'PasswordException' || /password/i.test(String(e?.message))) {
            entry.error = 'La clave no funciono para este extracto';
            entry.needsOwnPwd = true;
            out.push(entry);
            continue;
          }
          throw e;
        }
        if (!text || text.trim().length < 50) {
          entry.error = 'Sin texto extraible (escaneado?)';
          out.push(entry); continue;
        }
        const res = await parseStatementText(text);
        if (!res.movements?.length) {
          entry.error = 'No se detectaron movimientos';
          out.push(entry); continue;
        }
        entry.ok = true; entry.bank = res.bank; entry.period = res.period; entry.movements = res.movements;
      } catch (e) {
        entry.error = e.message || String(e);
      }
      out.push(entry);
    }
    setProcessed(out);

    const okIdx = out.map((e, i) => e.ok ? i : -1).filter(i => i >= 0);
    if (!okIdx.length) {
      setError('Ningun extracto pudo procesarse. Revisa las claves o si son PDFs con texto.');
      setStep(STEP.PICK);
      return;
    }
    setQueue(okIdx);
    setCursor(0);
    loadReview(out[okIdx[0]], new Set());
    setStep(STEP.REVIEW);
  };

  const retryWithPwd = async (idx, pwd) => {
    const file = files.find(f => f.name === processed[idx].name);
    if (!file) return;
    try {
      const text = await extractPdfText(file, pwd);
      const res = await parseStatementText(text);
      if (!res.movements?.length) throw new Error('No se detectaron movimientos');
      setProcessed(p => p.map((e, i) => i === idx
        ? { ...e, ok: true, bank: res.bank, period: res.period, movements: res.movements, error: undefined, needsOwnPwd: false }
        : e));
      setQueue(q => q.includes(idx) ? q : [...q, idx].sort((a, b) => a - b));
      notify('Extracto desbloqueado');
    } catch (e) {
      setError(`${processed[idx].name}: ${e.message || e}`);
    }
  };

  const loadReview = (entry, prints) => {
    setRows(markDuplicates(entry.movements, state.txs, prints));
    setEditId(null);
  };

  const toggle = id => setRows(rs => rs.map(r => r._id === id ? { ...r, _include: !r._include } : r));
  const editRow = (id, patch) => setRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  const toggleAll = on => setRows(rs => rs.map(r => ({ ...r, _include: on })));

  const stats = useMemo(() => {
    const inc = rows.filter(r => r._include);
    return {
      total: rows.length, included: inc.length,
      dups: rows.filter(r => r._dup).length,
      gastos: inc.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0),
      ingresos: inc.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0),
    };
  }, [rows]);

  const currentEntry = queue.length ? processed[queue[cursor]] : null;

  const confirmCurrent = async () => {
    const chosen = rows.filter(r => r._include);
    setStep(STEP.SAVING);
    try {
      if (chosen.length) await Storage.upsertTxBatch(chosen.map(toTx));
      const newPrints = new Set(confirmedPrints);
      chosen.forEach(r => newPrints.add(r._fp));
      setConfirmedPrints(newPrints);
      const total = savedTotal + chosen.length;
      setSavedTotal(total);
      const next = cursor + 1;
      if (next < queue.length) {
        setCursor(next);
        loadReview(processed[queue[next]], newPrints);
        setStep(STEP.REVIEW);
      } else {
        await refresh();
        notify(`${total} movimientos importados`);
        setStep(STEP.DONE);
      }
    } catch (e) {
      setError('Error al guardar: ' + (e.message || e));
      setStep(STEP.REVIEW);
    }
  };

  const skipCurrent = () => {
    const next = cursor + 1;
    if (next < queue.length) {
      setCursor(next);
      loadReview(processed[queue[next]], confirmedPrints);
    } else {
      refresh().then(() => { notify(`${savedTotal} movimientos importados`); setStep(STEP.DONE); });
    }
  };

  let body, footer, title = 'Importar extractos';

  if (step === STEP.PICK) {
    body = (
      <>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16 }}>
          Sube uno o varios extractos en PDF. Se procesan en fila y los revisas uno por uno antes de guardar. Tu clave nunca se guarda.
        </div>
        <input type="file" accept="application/pdf" multiple onChange={onPick}
          style={{ width: '100%', marginBottom: 14, color: 'var(--text2)', fontSize: 12 }} />
        {files.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
              {files.length} archivo{files.length === 1 ? '' : 's'} seleccionado{files.length === 1 ? '' : 's'}:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text3)' }}>
                {files.map(f => <li key={f.name} style={{ fontSize: 11 }}>{f.name}</li>)}
              </ul>
            </div>
            <div className="form-group">
              <label className="form-label">Clave de los PDFs protegidos (tu cedula). Se aplica a todos; si alguno usa otra, te lo marco luego.</label>
              <input className="form-input" type="password" value={defaultPwd} onChange={e => setDefaultPwd(e.target.value)}
                placeholder="Tu cedula" autoComplete="off" />
            </div>
          </>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>{error}</div>}
      </>
    );
    footer = (
      <>
        <button className="btn btn-ghost" onClick={close}>Cancelar</button>
        <button className="btn btn-primary" onClick={runProcess} disabled={!files.length}>
          Procesar {files.length || ''} extracto{files.length === 1 ? '' : 's'}
        </button>
      </>
    );
  }

  if (step === STEP.PROCESSING) {
    body = (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text2)' }}>
        <div style={{ fontSize: 26, marginBottom: 14 }}>...</div>
        <div style={{ fontSize: 14, marginBottom: 6 }}>Procesando {files.length} extracto{files.length === 1 ? '' : 's'}...</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Extrayendo texto y normalizando movimientos.</div>
      </div>
    );
    footer = null;
  }

  if (step === STEP.SAVING) {
    body = (
      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text2)' }}>
        <div style={{ fontSize: 26, marginBottom: 14 }}>Guardando...</div>
      </div>
    );
    footer = null;
  }

  if (step === STEP.REVIEW && currentEntry) {
    title = `Revisar ${cursor + 1}/${queue.length} - ${currentEntry.bank}${currentEntry.period ? ' - ' + currentEntry.period : ''}`;
    const failed = processed.filter(e => !e.ok);
    body = (
      <>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {queue.map((qi, i) => (
            <div key={qi} style={{ flex: 1, height: 3, borderRadius: 2, background: i < cursor ? 'var(--accent)' : i === cursor ? 'var(--text2)' : 'var(--surface3)' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text2)' }}><b style={{ color: 'var(--text)' }}>{stats.included}</b> de {stats.total} seleccionados</span>
          {stats.dups > 0 && <span style={{ color: 'var(--yellow)' }}>{stats.dups} posibles duplicados</span>}
          <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)' }}>-{fmtFull(stats.gastos)}</span>
          <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>+{fmtFull(stats.ingresos)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(true)}>Marcar todos</button>
          <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(false)}>Desmarcar todos</button>
        </div>
        <div style={{ maxHeight: '42vh', overflowY: 'auto', margin: '0 -4px' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <tr style={{ textAlign: 'left', color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase' }}>
                <th style={{ padding: '6px 4px', width: 28 }}></th>
                <th style={{ padding: '6px 4px' }}>Fecha</th>
                <th style={{ padding: '6px 4px' }}>Descripcion</th>
                <th style={{ padding: '6px 4px' }}>Categoria</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Monto</th>
                <th style={{ padding: '6px 4px', width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const editing = editId === r._id;
                return (
                  <tr key={r._id} style={{ borderBottom: '1px solid var(--border)', opacity: r._include ? 1 : 0.4, background: r._dup ? 'rgba(255,206,92,0.05)' : 'transparent' }}>
                    <td style={{ padding: '6px 4px' }}>
                      <input type="checkbox" checked={r._include} onChange={() => toggle(r._id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '6px 4px', fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {editing
                        ? <input className="form-input" type="date" value={r.date} onChange={e => editRow(r._id, { date: e.target.value })} style={{ padding: '2px 4px', fontSize: 11 }} />
                        : r.date.slice(5)}
                    </td>
                    <td style={{ padding: '6px 4px', maxWidth: 220 }}>
                      {editing
                        ? <input className="form-input" value={r.desc} onChange={e => editRow(r._id, { desc: e.target.value })} style={{ padding: '2px 6px', fontSize: 12 }} />
                        : <span>{r.desc} {r._dup && <span title="Posible duplicado" style={{ color: 'var(--yellow)' }}>!</span>}</span>}
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      {editing
                        ? <select className="form-input" value={r.category} onChange={e => editRow(r._id, { category: e.target.value })} style={{ padding: '2px 4px', fontSize: 11 }}>
                          {CATS.map(c => <option key={c.name}>{c.name}</option>)}
                        </select>
                        : <span className="cat-badge" style={{ background: catColor(r.category) + '18', color: catColor(r.category), fontSize: 10 }}>{r.category}</span>}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontFamily: 'var(--mono)', color: r.amount < 0 ? 'var(--red)' : 'var(--green)', whiteSpace: 'nowrap' }}>
                      {editing
                        ? <input className="form-input" type="number" value={r.amount} onChange={e => editRow(r._id, { amount: +e.target.value })} style={{ padding: '2px 4px', fontSize: 11, width: 90, textAlign: 'right' }} />
                        : `${r.amount < 0 ? '-' : '+'}${fmtFull(r.amount)}`}
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => setEditId(editing ? null : r._id)}>{editing ? 'ok' : 'edit'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {failed.length > 0 && cursor === 0 && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text3)' }}>
            {failed.length} extracto{failed.length === 1 ? '' : 's'} no se pudo procesar: {failed.map(f => f.name).join(', ')}. Puedes reintentarlos al terminar.
          </div>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{error}</div>}
      </>
    );
    footer = (
      <>
        <button className="btn btn-ghost" onClick={skipCurrent}>Saltar este</button>
        <button className="btn btn-primary" onClick={confirmCurrent}>
          {cursor + 1 < queue.length ? `Importar y seguir (${stats.included})` : `Importar ${stats.included} y terminar`}
        </button>
      </>
    );
  }

  if (step === STEP.DONE) {
    const failed = processed.filter(e => !e.ok);
    body = (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 30, marginBottom: 12 }}>OK</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{savedTotal} movimientos importados</div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>De {queue.length} extracto{queue.length === 1 ? '' : 's'} revisado{queue.length === 1 ? '' : 's'}.</div>
        {failed.length > 0 && (
          <div style={{ marginTop: 16, textAlign: 'left' }}>
            {failed.map((f, i) => <FailedRetry key={i} entry={f} onRetry={pwd => retryWithPwd(processed.indexOf(f), pwd)} />)}
          </div>
        )}
      </div>
    );
    footer = <button className="btn btn-primary" onClick={close} style={{ marginLeft: 'auto' }}>Listo</button>;
  }

  return (
    <Modal open={open} onClose={close} title={title} maxWidth={step === STEP.REVIEW ? 740 : 480} footer={footer}>
      {body}
    </Modal>
  );
}

function FailedRetry({ entry, onRetry }) {
  const [pwd, setPwd] = useState('');
  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', marginBottom: 8 }}>
      <div style={{ fontSize: 12, marginBottom: 6 }}>{entry.name}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>{entry.error}</div>
      {entry.needsOwnPwd && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" type="password" value={pwd} onChange={e => setPwd(e.target.value)}
            placeholder="Clave de este extracto" style={{ flex: 1, fontSize: 12 }} autoComplete="off" />
          <button className="btn btn-ghost btn-sm" onClick={() => onRetry(pwd)} disabled={!pwd}>Reintentar</button>
        </div>
      )}
    </div>
  );
}
