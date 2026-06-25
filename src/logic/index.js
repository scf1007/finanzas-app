// ═══════════════════════════════════════════════════════════════
// LOGIC · funciones puras portadas de M1 (sin DOM, sin storage)
// El STATE shape es el mismo del tracker HTML: txs con {d, desc, amt, cat,
// acc}, pending con {due, amt, recur}, etc. La capa storage mapea ese shape
// hacia/desde Postgres; esta capa no se entera.
// ═══════════════════════════════════════════════════════════════

export const fmt = n => {
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n).toLocaleString('es-CO');
};
export const fmtFull = n => '$' + Math.round(Math.abs(n)).toLocaleString('es-CO');
export const today = () => new Date().toISOString().slice(0, 10);
export const daysUntil = ds => Math.round((new Date(ds) - new Date(today())) / 86400000);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

export const expenses = list => list.filter(t => t.amt < 0 && !['Transferencias', 'Ingresos'].includes(t.cat));
export const expSum = list => expenses(list).reduce((s, t) => s + Math.abs(t.amt), 0);

export const CATS = [
  { name: 'Comida & Restaurantes', color: '#fb923c', icon: '🍔' },
  { name: 'Viajes', color: '#a78bfa', icon: '✈️' },
  { name: 'Tech & Suscripciones', color: '#4ade80', icon: '📱' },
  { name: 'Compras & Moda', color: '#facc15', icon: '🛍' },
  { name: 'Música & Entretenimiento', color: '#a8ff47', icon: '🎵' },
  { name: 'Transporte', color: '#38bdf8', icon: '🚌' },
  { name: 'Retiros', color: '#c084fc', icon: '🏧' },
  { name: 'Servicios', color: '#6b7280', icon: '⚙️' },
  { name: 'Ingresos', color: '#4ade80', icon: '💰' },
  { name: 'Transferencias', color: '#94a3b8', icon: '↔️' },
  { name: 'Utilities', color: '#fb7185', icon: '🏠' },
  { name: 'Salud', color: '#f472b6', icon: '❤️' },
  { name: 'Deudas', color: '#ff6b6b', icon: '🧾' },
  { name: 'Otros', color: '#3f3f46', icon: '•' },
];
export const CAT_MAP = Object.fromEntries(CATS.map(c => [c.name, c]));
export const catColor = n => CAT_MAP[n]?.color || '#555';
export const catIcon = n => CAT_MAP[n]?.icon || '•';

export const MONTHS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MONTHS_SHORT = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ── SISTEMA DE COLOR-ESTADO ──────────────────────────────────
// Escala de salud: 'lima' (saludable), 'ambar' (atención), 'rojo' (crítico),
// 'neutro' (sin estado). El color codifica urgencia, no categoría.
export const STATE_COLOR = {
  lima:   { color: 'var(--accent)', dim: 'var(--accent-dim)', tint: 'lime' },
  ambar:  { color: 'var(--yellow)', dim: 'var(--yellow-dim)', tint: 'yellow' },
  rojo:   { color: 'var(--red)',    dim: 'var(--red-dim)',    tint: 'red' },
  neutro: { color: 'var(--text2)',  dim: 'var(--surface2)',   tint: null },
};

// Pago próximo 30d: rojo si hay vencidos, ámbar si hay pagos en 7 días, lima si holgado.
export function statePagoProximo(pending) {
  const active = (pending || []).filter(p => !p.paid);
  const overdue = active.some(p => daysUntil(p.due) < 0);
  if (overdue) return 'rojo';
  const soon = active.some(p => { const d = daysUntil(p.due); return d >= 0 && d <= 7; });
  if (soon) return 'ambar';
  return active.length ? 'lima' : 'neutro';
}

// Saldo total vs obligaciones de los próximos 30 días.
export function stateSaldo(totalBal, pending) {
  const due30 = (pending || [])
    .filter(p => !p.paid && daysUntil(p.due) <= 30)
    .reduce((s, p) => s + p.amt, 0);
  if (due30 === 0) return 'neutro';
  if (totalBal < due30) return 'rojo';
  if (totalBal < due30 * 1.2) return 'ambar';   // cubre, pero con <20% de margen
  return 'lima';
}

// Gasto del período vs ingreso del período. Ingreso 0 → neutro (no penaliza).
export function stateGasto(periodExp, periodInc) {
  if (periodInc === 0) return 'neutro';
  const ratio = periodExp / periodInc;
  if (ratio > 1) return 'rojo';      // gastas más de lo que entra
  if (ratio >= 0.8) return 'ambar';  // queda poco margen
  return 'lima';                     // generas excedente
}

// Ingresos: lima si hay, neutro si cero.
export function stateIngreso(periodInc) {
  return periodInc > 0 ? 'lima' : 'neutro';
}

// Meta por progreso: <20% rojo, 20-80% ámbar, ≥80% lima.
export function stateMeta(actual, meta) {
  if (!meta || meta <= 0) return 'neutro';
  const pct = actual / meta;
  if (pct < 0.2) return 'rojo';
  if (pct < 0.8) return 'ambar';
  return 'lima';
}

// Deuda por tasa de interés (calor = costo). ≥25% rojo, ≥10% ámbar, <10%/0 lima.
export function stateDeuda(tasaEa) {
  if (tasaEa >= 0.25) return 'rojo';
  if (tasaEa >= 0.10) return 'ambar';
  return 'lima';
}

// ── Fases y reparto ──────────────────────────────────────────
export function computePhase(state) {
  const o = state?.phase?.overrides;
  if (o !== null && o !== undefined) return o;
  return state?.phase?.current ?? 0;
}

export function getAllocationFor(phase, state) {
  return state?.allocation_rules?.[phase] || { deuda: 0, colchon: 0, inversion: 0, libre: 1.0 };
}

export const PHASE_LABELS = { 0: 'Fase 0 · Supervivencia', 1: 'Fase 1 · Colchón', 2: 'Fase 2 · Ataque', 3: 'Fase 3 · Construcción' };
export const PHASE_SUB = {
  0: 'Solo mínimos. La capacidad va a sobrevivir el puente hasta el primer salario.',
  1: '70% al colchón · 20% deuda Nu · 10% libre.',
  2: '70% deuda · 20% colchón · 10% libre. Ataque a la deuda con interés.',
  3: '50% inversión · 30% metas · 20% libre. Liberado.',
};

// ── Motor de acciones (M1.5) ─────────────────────────────────
// En React las CTAs son descriptores {kind, id}, no strings de onclick.
export function computeNextActions(state) {
  const actions = [];
  const todayStr = today();
  const thisMonth = todayStr.slice(0, 7);
  const dU = ds => Math.round((new Date(ds) - new Date(todayStr)) / 86400000);
  const phase = computePhase(state);
  const fA = n => '$' + Math.round(Math.abs(n)).toLocaleString('es-CO');

  const overdue = (state.pending || []).filter(p => !p.paid && dU(p.due) < 0)
    .sort((a, b) => dU(a.due) - dU(b.due));
  overdue.forEach(p => {
    const days = Math.abs(dU(p.due));
    actions.push({
      priority: 1, tone: 'critical', icon: '🔴',
      title: `Paga ya: ${p.name} · ${fA(p.amt)}`,
      detail: `Vencido hace ${days} día${days === 1 ? '' : 's'}. Cada día en mora puede costar intereses o reconexión.`,
      cta: { kind: 'markPaid', id: p.id, label: 'Marcar pagado' },
    });
  });

  const recentIncome = (state.txs || [])
    .filter(t => t.cat === 'Ingresos' && t.amt > 0)
    .filter(t => { const d = dU(t.d); return d <= 0 && d >= -7; })
    .reduce((s, t) => s + t.amt, 0);
  if (recentIncome >= 300000) {
    const guide = {
      0: 'Fase 0 (supervivencia): primero vencidos, luego arriendo y mínimos de deuda. Nada extra.',
      1: 'Fase 1: tras cubrir lo urgente, el 70% de lo libre va al colchón.',
      2: 'Fase 2: tras cubrir lo urgente, el 70% de lo libre ataca la deuda en orden (#1 primero).',
      3: 'Fase 3: 50% inversión · 30% metas · 20% libre.',
    };
    actions.push({
      priority: 2, tone: 'info', icon: '💰',
      title: `Te entraron ${fA(recentIncome)} esta semana`,
      detail: `${guide[phase]} Los pasos de abajo están en el orden correcto de ejecución.`,
      cta: null,
    });
  }

  const upcoming = (state.pending || []).filter(p => !p.paid && dU(p.due) >= 0 && dU(p.due) <= 7)
    .sort((a, b) => dU(a.due) - dU(b.due));
  upcoming.forEach(p => {
    const days = dU(p.due);
    actions.push({
      priority: 3, tone: 'warn', icon: '🟡',
      title: `Próximo: ${p.name} · ${fA(p.amt)}`,
      detail: days === 0 ? 'Vence hoy.' : `Vence en ${days} día${days === 1 ? '' : 's'}.`,
      cta: { kind: 'markPaid', id: p.id, label: 'Marcar pagado' },
    });
  });

  (state.debts || []).filter(d => d.saldo > 0).forEach(d => {
    const paidThisMonth = (state.debt_payments || [])
      .some(pm => pm.debt_id === d.id && (pm.fecha || '').startsWith(thisMonth));
    if (paidThisMonth) return;
    const inPending = (state.pending || []).some(p => !p.paid &&
      p.name.toLowerCase().includes('enel') && d.id === 'codensa');
    if (inPending) return;
    actions.push({
      priority: 4, tone: 'info', icon: '🧾',
      title: `Cuota de ${d.acreedor} · ${fA(d.cuota_actual)}`,
      detail: d.fecha_corte
        ? `Sin registrar este mes. ${d.metodo_pago === 'manual' ? 'Pago manual desde ' + (d.cuenta_pago === 'nu-ahorros' ? 'Nu' : 'tu cuenta') + '.' : ''}`
        : 'Sin registrar este mes (abono pactado).',
      cta: { kind: 'debtPay', id: d.id, label: 'Registrar pago' },
    });
  });

  if (phase >= 1) {
    const colchon = (state.goals || []).find(g => g.tipo === 'colchon');
    if (colchon && colchon.actual < colchon.meta) {
      const falta = colchon.meta - colchon.actual;
      actions.push({
        priority: 5, tone: 'info', icon: '🛡',
        title: `Colchón: faltan ${fA(falta)}`,
        detail: `Llevas ${fA(colchon.actual)} de ${fA(colchon.meta)}. Es tu prioridad de Fase ${phase === 1 ? '1' : 'actual'}.`,
        cta: null,
      });
    }
  }

  (state.debts || []).filter(d => d.saldo === 0 && d.tasa_ea > 0 && !d.cuota_redirected).forEach(d => {
    actions.push({
      priority: 6, tone: 'ok', icon: '🎉',
      title: `¡Cerraste ${d.acreedor}!`,
      detail: `Su cuota de ${fA(d.cuota_min)} queda libre. Sugerencia: súmala al abono de tu abuela o al colchón.`,
      cta: { kind: 'ackClosed', id: d.id, label: 'Entendido' },
    });
  });

  return actions.sort((a, b) => a.priority - b.priority);
}

// ── Stubs M2-M4 (mismas firmas que en M1) ────────────────────
export function projectDebtPayoff() { return { months: null, byDebt: [], implemented: false }; }
export function evaluateInsights() { return []; }
export function detectGoteo() { return { active: false, byCategory: {} }; }
