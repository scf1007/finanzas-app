// ═══════════════════════════════════════════════════════════════
// IMPORT EXTRACTOS · capa cliente
// 1. Extrae texto del PDF en el navegador (PDF.js). La cédula nunca se
//    sube como archivo; solo el texto va a la Edge Function, que tampoco
//    lo almacena.
// 2. Llama a la función parse-statement (Claude parsea con las 3 reglas).
// 3. Marca duplicados contra los movimientos que ya existen.
// ═══════════════════════════════════════════════════════════════
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from './supabase';
import { uid } from '../logic';

// Configura el worker de PDF.js de forma robusta entre versiones:
// se resuelve como URL relativa al paquete instalado, sin depender de
// que el módulo del worker tenga un export 'default'.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ── 1 · Extracción de texto en el navegador ──────────────────
export async function extractPdfText(file, password = undefined) {
  const buf = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: buf, password });
  const pdf = await task.promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruir líneas respetando saltos verticales
    let lastY = null;
    let line = '';
    for (const item of content.items) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        out += line.trimEnd() + '\n';
        line = '';
      }
      line += item.str + ' ';
      lastY = y;
    }
    out += line.trimEnd() + '\n';
    out += '\n'; // separador de página
  }
  return out;
}

// Detecta si el PDF necesita contraseña (Nu, extractos bancarios)
export async function pdfNeedsPassword(file) {
  const buf = await file.arrayBuffer();
  try {
    await pdfjsLib.getDocument({ data: buf }).promise;
    return false;
  } catch (e) {
    if (e?.name === 'PasswordException') return true;
    return false;
  }
}

// ── 2 · Llamada a la Edge Function ───────────────────────────
export async function parseStatementText(text) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión no encontrada');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-statement`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ text }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || 'Error al parsear el extracto');
  return json; // { bank, period, count, movements }
}

// ── 3 · Detección de duplicados ──────────────────────────────
// Huella: fecha + monto redondeado + primeras palabras de la descripción.
export function fingerprint(date, amount, desc) {
  const d = String(date).slice(0, 10);
  const a = Math.round(Math.abs(amount));
  const key = String(desc || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '').split(/\s+/).slice(0, 3).join('');
  return `${d}|${a}|${key}`;
}

// existingTxs: lo que ya está guardado en la app.
// priorPrints: Set de huellas ya confirmadas en extractos anteriores de ESTA tanda.
export function markDuplicates(movements, existingTxs, priorPrints = new Set()) {
  const seen = new Set(existingTxs.map(t => fingerprint(t.d, t.amt, t.desc)));
  // dentro de la misma tanda: detectar también repetidos dentro del mismo extracto
  const withinBatch = new Set();
  return movements.map(m => {
    const fp = fingerprint(m.date, m.amount, m.desc);
    const isDup = seen.has(fp) || priorPrints.has(fp) || withinBatch.has(fp);
    withinBatch.add(fp);
    return {
      ...m,
      _id: uid(),
      _fp: fp,
      _dup: isDup,
      _include: !isDup, // duplicados arrancan desmarcados
    };
  });
}

// Convierte una fila revisada al shape de transacción de la app
export function toTx(row) {
  return {
    id: uid(),
    d: row.date,
    desc: row.desc,
    amt: row.amount,
    cat: row.category,
    acc: row.account,
    note: 'Importado de extracto',
    catSource: 'import',
  };
}
