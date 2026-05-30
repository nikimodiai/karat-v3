import React, { useCallback, useRef, useState } from 'react';
import {
  X, Upload, FileSpreadsheet, Sparkles, ChevronRight,
  AlertTriangle, CheckCircle, Loader, RotateCcw, Package,
} from 'lucide-react';
import { N8N_IMPORT_ANALYZE, N8N_IMPORT_COMMIT } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import styles from './BulkImportModal.module.css';

// Human-readable labels for the target schema fields
const FIELD_LABELS = {
  sku:                 'SKU / HUID',
  name:                'Item Name',
  category:            'Category',
  sub_category:        'Sub-category',
  gold_carat:          'Gold Carat',
  gold_purity:         'Gold Purity',
  diamond_purity:      'Diamond Purity',
  silver_purity:       'Silver Purity',
  metal_type:          'Metal Type',
  color:               'Color',
  weight:              'Weight (g)',
  metal_weight_grams:  'Metal Weight (g)',
  gold_weight_grams:   'Gold Weight (g)',
  silver_weight_grams: 'Silver Weight (g)',
  wastage_percent:     'Wastage %',
  making_charge_type:  'Making Charge Type',
  making_charge_value: 'Making Charge Value',
  stone_value_inr:     'Stone Value (₹)',
  diamond_value_inr:   'Diamond Value (₹)',
  hallmark_charge:     'Hallmark Charge (₹)',
  price:               'Price (₹)',
  stock_qty:           'Stock Qty',
  material:            'Material / Stone',
  occasion:            'Occasion',
  description:         'Description',
};

const REQUIRED_FIELDS = ['sku'];

// ── Step indicators ────────────────────────────────────────────────
function Steps({ current }) {
  const steps = ['Upload', 'Map Columns', 'Preview & Import'];
  return (
    <div className={styles.steps}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className={`${styles.step} ${i + 1 === current ? styles.stepActive : ''} ${i + 1 < current ? styles.stepDone : ''}`}>
            <span className={styles.stepNum}>
              {i + 1 < current ? <CheckCircle size={13}/> : i + 1}
            </span>
            <span className={styles.stepLabel}>{s}</span>
          </div>
          {i < steps.length - 1 && <div className={`${styles.stepLine} ${i + 1 < current ? styles.stepLineDone : ''}`}/>}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────
export default function BulkImportModal({ onClose, onImportDone }) {
  const { user } = useAuth();
  const [step,        setStep]        = useState(1);
  const [file,        setFile]        = useState(null);
  const [dragOver,    setDragOver]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  // Step 2 state
  const [analyzeData, setAnalyzeData] = useState(null); // response from /analyze
  const [mapping,     setMapping]     = useState({});    // { targetField: sourceColumn }

  // Step 3 state
  const [dryResult,   setDryResult]   = useState(null);
  const [importing,   setImporting]   = useState(false);
  const [importDone,  setImportDone]  = useState(null);

  const fileRef = useRef(null);

  // ── Step 1: upload + analyze ─────────────────────────────────────
  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv','xls','xlsx','ods'].includes(ext)) {
      setError('Please upload a CSV, XLS, XLSX, or ODS file.');
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const runAnalyze = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file',     file);
      fd.append('owner_id', user.id);

      let res;
      try {
        res = await fetch(N8N_IMPORT_ANALYZE, {
          method: 'POST',
          body: fd,
          credentials: 'omit',
          mode: 'cors',
        });
      } catch (networkErr) {
        throw new Error(
          'Could not reach the import service. ' +
          'Make sure the n8n workflow is active and the webhook URL is correct. ' +
          '(Network error: ' + networkErr.message + ')'
        );
      }

      const raw = await res.text();
      if (!res.ok) {
        throw new Error(`Import service returned ${res.status}: ${raw.slice(0, 300) || '(empty body)'}`);
      }
      if (!raw || !raw.trim()) {
        throw new Error('Import service returned an empty response. Check that the n8n workflow is fully connected and the "Respond to Webhook" node fires at the end.');
      }
      let data;
      try { data = JSON.parse(raw); }
      catch (e) {
        throw new Error(`Import service response is not valid JSON. Raw response: ${raw.slice(0, 300)}`);
      }
      if (!data.import_id) throw new Error('Invalid response from import service.');
      setAnalyzeData(data);
      // Pre-fill mapping from LLM suggestion
      setMapping(
        Object.fromEntries(
          Object.entries(data.suggested_mapping || {}).filter(([,v]) => v)
        )
      );
      setStep(2);
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: dry run ──────────────────────────────────────────────
  const runDryRun = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(N8N_IMPORT_COMMIT, {
        method:      'POST',
        credentials: 'omit',
        mode:        'cors',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          import_id: analyzeData.import_id,
          owner_id:  user.id,
          mapping,
          defaults:  {},
          dry_run:   true,
          variant_mode: false,
        }),
      });
      const rawDry = await res.text();
      if (!res.ok) throw new Error(`Dry run failed (${res.status}): ${rawDry.slice(0, 300) || '(empty)'}`);
      if (!rawDry?.trim()) throw new Error('Dry run returned empty response from n8n.');
      let data;
      try { data = JSON.parse(rawDry); } catch { throw new Error(`Dry run non-JSON response: ${rawDry.slice(0, 300)}`); }
      setDryResult(data);
      setStep(3);
    } catch (e) {
      setError(e.message || 'Dry run failed');
    } finally {
      setLoading(false);
    }
  };

  const runCommit = async () => {
    setImporting(true); setError(null);
    try {
      const res = await fetch(N8N_IMPORT_COMMIT, {
        method:      'POST',
        credentials: 'omit',
        mode:        'cors',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({
          import_id: analyzeData.import_id,
          owner_id:  user.id,
          mapping,
          defaults:  {},
          dry_run:   false,
          variant_mode: false,
        }),
      });
      const rawCommit = await res.text();
      if (!res.ok) throw new Error(`Import failed (${res.status}): ${rawCommit.slice(0, 300) || '(empty)'}`);
      if (!rawCommit?.trim()) throw new Error('Import returned empty response from n8n.');
      let data;
      try { data = JSON.parse(rawCommit); } catch { throw new Error(`Import non-JSON response: ${rawCommit.slice(0, 300)}`); }
      setImportDone(data);
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(1); setFile(null); setAnalyzeData(null);
    setMapping({}); setDryResult(null); setImportDone(null); setError(null);
  };

  return (
    <div className="overlay-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Sparkles size={16} color="#C9A84C"/>
            <h2 className={styles.title}>AI Bulk Import</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={18}/></button>
        </div>

        <Steps current={importDone ? 4 : step}/>

        <div className={styles.body}>
          {error && (
            <div className={styles.errorBanner}>
              <AlertTriangle size={14}/> {error}
            </div>
          )}

          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div className={styles.uploadSection}>
              <p className={styles.hint}>
                Upload your jewellery inventory as a <strong>CSV or Excel</strong> file.
                The AI will automatically detect your column names and map them — no template needed.
              </p>
              <div
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''} ${file ? styles.dropZoneHasFile : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !file && fileRef.current?.click()}
              >
                {file ? (
                  <div className={styles.fileInfo}>
                    <FileSpreadsheet size={28} color="#C9A84C"/>
                    <div>
                      <div className={styles.fileName}>{file.name}</div>
                      <div className={styles.fileMeta}>
                        {(file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button type="button" className={styles.removeFile}
                      onClick={e => { e.stopPropagation(); setFile(null); }}>
                      <X size={14}/>
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload size={32} strokeWidth={1.5} color="rgba(201,168,76,.5)"/>
                    <p className={styles.dropText}>
                      Drop your file here, or <span className={styles.browse}>browse</span>
                    </p>
                    <p className={styles.dropSub}>CSV, XLS, XLSX, ODS · Any column names</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx,.ods" style={{ display:'none' }}
                onChange={e => handleFile(e.target.files?.[0])}/>

              <div className={styles.footer}>
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn-gold" onClick={runAnalyze} disabled={!file || loading}>
                  {loading
                    ? <><Loader size={14} className={styles.spin}/> Analysing…</>
                    : <><Sparkles size={14}/> Analyse with AI</>
                  }
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Mapping review ── */}
          {step === 2 && analyzeData && (
            <div className={styles.mappingSection}>
              <div className={styles.mappingMeta}>
                <span><strong>{analyzeData.row_count}</strong> rows detected</span>
                {analyzeData.notes && <span className={styles.mappingNotes}>{analyzeData.notes}</span>}
              </div>

              <p className={styles.hint}>
                The AI mapped your columns to the inventory fields below.
                Review each assignment and fix any that look wrong before importing.
              </p>

              <div className={styles.mappingTable}>
                <div className={styles.mappingTableHead}>
                  <span>Inventory field</span>
                  <span>Your column</span>
                  <span>Sample value</span>
                </div>
                {Object.entries(FIELD_LABELS).map(([target, label]) => {
                  const srcCol   = mapping[target] || '';
                  const sample   = srcCol && analyzeData.preview?.[0]?.[target] != null
                    ? String(analyzeData.preview[0][target]).slice(0, 40)
                    : '';
                  const required = REQUIRED_FIELDS.includes(target);
                  return (
                    <div key={target}
                      className={`${styles.mappingRow} ${required && !srcCol ? styles.mappingRowError : ''}`}>
                      <span className={styles.targetLabel}>
                        {label}{required && <span className={styles.req}> *</span>}
                      </span>
                      <select
                        value={srcCol}
                        onChange={e => setMapping(m => ({ ...m, [target]: e.target.value || undefined }))}
                        className={styles.colSelect}
                      >
                        <option value="">— skip —</option>
                        {(analyzeData.columns || []).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <span className={styles.sampleValue}>{sample || <em>—</em>}</span>
                    </div>
                  );
                })}
              </div>

              {/* 5-row preview */}
              {analyzeData.preview?.length > 0 && (
                <details className={styles.previewDetails}>
                  <summary>Show raw data preview ({analyzeData.preview.length} rows)</summary>
                  <div className={styles.previewScroll}>
                    <table className={styles.previewTable}>
                      <thead>
                        <tr>
                          {(analyzeData.columns || []).map(c => <th key={c}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {(analyzeData.preview || []).slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {(analyzeData.columns || []).map(c => (
                              <td key={c}>{row[c] ?? ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              <div className={styles.footer}>
                <button className="btn-ghost" onClick={reset}>
                  <RotateCcw size={13}/> Start over
                </button>
                <button className="btn-gold" onClick={runDryRun}
                  disabled={!mapping.sku || loading}>
                  {loading
                    ? <><Loader size={14} className={styles.spin}/> Running preview…</>
                    : <>Preview import <ChevronRight size={14}/></>
                  }
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Dry-run result + final commit ── */}
          {step === 3 && !importDone && (
            <DryRunStep
              dryResult={dryResult}
              rowCount={analyzeData?.row_count}
              importing={importing}
              error={error}
              onBack={() => setStep(2)}
              onCommit={runCommit}
            />
          )}

          {/* ── Done ── */}
          {importDone && (
            <div className={styles.doneSection}>
              <CheckCircle size={48} color="#16a34a" strokeWidth={1.5}/>
              <h3 className={styles.doneTitle}>Import complete!</h3>
              <ImportResultSummary result={importDone.result}/>
              <div className={styles.footer} style={{ justifyContent: 'center' }}>
                <button className="btn-gold" onClick={() => { onImportDone?.(); onClose(); }}>
                  <Package size={14}/> View Inventory
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dry-run result view ────────────────────────────────────────────
function DryRunStep({ dryResult, rowCount, importing, error, onBack, onCommit }) {
  const result = dryResult?.result || {};
  const inserted = result.inserted ?? result.products_inserted ?? null;
  const updated  = result.updated  ?? result.products_updated  ?? null;
  const skipped  = result.skipped  ?? result.products_skipped  ?? null;
  const errors   = result.errors   ?? result.validation_errors ?? null;

  return (
    <div className={styles.drySection}>
      <p className={styles.hint}>
        This is a <strong>preview</strong> — nothing has been saved yet.
        Review the numbers below and click <strong>Confirm Import</strong> to proceed.
      </p>

      <div className={styles.summaryCards}>
        <SummaryCard label="To be created" value={inserted} color="#16a34a"/>
        <SummaryCard label="To be updated" value={updated}  color="#2563eb"/>
        <SummaryCard label="Skipped"       value={skipped}  color="#d97706"/>
      </div>

      {errors != null && errors > 0 && (
        <div className={styles.warnBanner}>
          <AlertTriangle size={14}/> {errors} row{errors !== 1 ? 's' : ''} have validation issues and will be skipped.
        </div>
      )}

      {result.messages?.length > 0 && (
        <details className={styles.previewDetails} style={{ marginTop: 12 }}>
          <summary>Details ({result.messages.length} messages)</summary>
          <ul className={styles.msgList}>
            {result.messages.slice(0, 20).map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </details>
      )}

      {error && (
        <div className={styles.errorBanner} style={{ marginTop: 10 }}>
          <AlertTriangle size={14}/> {error}
        </div>
      )}

      <div className={styles.footer}>
        <button className="btn-ghost" onClick={onBack}>← Edit mapping</button>
        <button className="btn-gold" onClick={onCommit} disabled={importing}>
          {importing
            ? <><Loader size={14} className={styles.spin}/> Importing…</>
            : <><CheckCircle size={14}/> Confirm Import</>
          }
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className={styles.summaryCard}>
      <span className={styles.summaryNum} style={{ color }}>
        {value ?? '—'}
      </span>
      <span className={styles.summaryLabel}>{label}</span>
    </div>
  );
}

function ImportResultSummary({ result }) {
  if (!result) return null;
  const inserted = result.inserted ?? result.products_inserted ?? null;
  const updated  = result.updated  ?? result.products_updated  ?? null;
  return (
    <div className={styles.summaryCards} style={{ marginTop: 20 }}>
      <SummaryCard label="Products created" value={inserted} color="#16a34a"/>
      <SummaryCard label="Products updated" value={updated}  color="#2563eb"/>
    </div>
  );
}
