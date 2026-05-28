import React, { useState, useEffect, useCallback } from 'react';
import { Pencil, Check, X as XIcon, Plus, TrendingUp, Clock } from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { fmtINR } from '../lib/pricing';
import styles from './MetalRatesCard.module.css';

const METAL_LABELS = {
  'gold_999':   '24K Gold (Fine)',
  'gold_916':   '22K Gold (Hallmark)',
  'gold_750':   '18K Gold',
  'gold_585':   '14K Gold',
  'gold_375':   '9K Gold',
  'silver_999': 'Silver Fine (999)',
  'silver_925': 'Silver Sterling (925)',
  'silver_800': 'Silver (800)',
  'platinum':   'Platinum',
};

const METAL_PURITY = {
  'gold_999':   0.999,
  'gold_916':   0.916,
  'gold_750':   0.750,
  'gold_585':   0.585,
  'gold_375':   0.375,
  'silver_999': 0.999,
  'silver_925': 0.925,
  'silver_800': 0.800,
  'platinum':   0.950,
};

function metalLabel(type) {
  return METAL_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtAge(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function MetalRatesCard() {
  const { user } = useAuth();
  const [rates,       setRates]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [editValue,   setEditValue]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);
  const [newMetal,    setNewMetal]    = useState('');
  const [newRate,     setNewRate]     = useState('');

  const fetchRates = useCallback(async () => {
    if (!user?.id) return;
    setError(null);
    const { data, error: err } = await db
      .from('metal_rates')
      .select('id, metal_type, purity_factor, rate_per_gram, rate_per_10g, fetched_at')
      .eq('store_id', user.id)
      .eq('is_current', true)
      .order('metal_type');
    if (err) { setError('Could not load rates'); }
    else     { setRates(data || []); }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  const startEdit = (rate) => {
    setEditingType(rate.metal_type);
    setEditValue(String(rate.rate_per_gram));
    setShowAdd(false);
  };

  const cancelEdit = () => { setEditingType(null); setEditValue(''); };

  const saveEdit = async (metalType) => {
    const val = parseFloat(editValue);
    if (!val || val <= 0) { alert('Please enter a valid rate'); return; }
    setSaving(true);
    // Deactivate old rate for this metal type
    const { error: e1 } = await db.from('metal_rates')
      .update({ is_current: false })
      .eq('store_id', user.id)
      .eq('metal_type', metalType)
      .eq('is_current', true);
    if (e1) { alert('Save failed: ' + e1.message); setSaving(false); return; }
    // Insert new current rate
    const { error: e2 } = await db.from('metal_rates').insert({
      store_id:      user.id,
      metal_type:    metalType,
      purity_factor: METAL_PURITY[metalType] || 1,
      rate_per_gram: val,
      rate_per_10g:  Math.round(val * 10),
      source:        'owner_app',
      is_current:    true,
      fetched_at:    new Date().toISOString(),
    });
    if (e2) { alert('Save failed: ' + e2.message); setSaving(false); return; }
    cancelEdit();
    setSaving(false);
    fetchRates();
  };

  const existingTypes = new Set(rates.map(r => r.metal_type));
  const addOptions    = Object.entries(METAL_LABELS).filter(([k]) => !existingTypes.has(k));

  const saveAdd = async () => {
    if (!newMetal) { alert('Select a metal type'); return; }
    const val = parseFloat(newRate);
    if (!val || val <= 0) { alert('Enter a valid rate'); return; }
    setSaving(true);
    await db.from('metal_rates')
      .update({ is_current: false })
      .eq('store_id', user.id)
      .eq('metal_type', newMetal)
      .eq('is_current', true);
    const { error: e } = await db.from('metal_rates').insert({
      store_id:      user.id,
      metal_type:    newMetal,
      purity_factor: METAL_PURITY[newMetal] || 1,
      rate_per_gram: val,
      rate_per_10g:  Math.round(val * 10),
      source:        'owner_app',
      is_current:    true,
      fetched_at:    new Date().toISOString(),
    });
    if (e) { alert('Save failed: ' + e.message); setSaving(false); return; }
    setShowAdd(false); setNewMetal(''); setNewRate('');
    setSaving(false);
    fetchRates();
  };

  const latestAt = rates.length
    ? rates.reduce((latest, r) => (r.fetched_at > latest ? r.fetched_at : latest), rates[0].fetched_at)
    : null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <TrendingUp size={15} color="#C9A84C" />
          <span className={styles.title}>Today's Metal Rates</span>
          {latestAt && (
            <span className={styles.lastUpdated}>
              <Clock size={11} /> updated {fmtAge(latestAt)}
            </span>
          )}
        </div>
        {!showAdd && (
          <button className={styles.addBtn} onClick={() => { setShowAdd(true); cancelEdit(); }}>
            <Plus size={13} /> Add Rate
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.stateRow}>
          <div className="spinner spinner-sm" /> Loading rates…
        </div>
      ) : error ? (
        <div className={styles.stateRow} style={{ color: 'var(--err)' }}>{error}</div>
      ) : rates.length === 0 && !showAdd ? (
        <div className={styles.emptyState}>
          No rates set yet — click <strong>+ Add Rate</strong> to enter today's gold or silver price.
        </div>
      ) : (
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.rowHeader}`}>
            <span className={styles.cMetal}>Metal</span>
            <span className={styles.cRate}>Rate / gram</span>
            <span className={styles.cRate10}>Rate / 10g</span>
            <span className={styles.cTime}>Updated</span>
            <span className={styles.cAct} />
          </div>

          {rates.map(r => (
            <div
              key={r.metal_type}
              className={`${styles.row} ${editingType === r.metal_type ? styles.rowEditing : ''}`}
            >
              <span className={styles.cMetal}>{metalLabel(r.metal_type)}</span>

              {editingType === r.metal_type ? (
                <>
                  <span className={styles.cRate}>
                    <span className={styles.sym}>₹</span>
                    <input
                      className={styles.editInput}
                      type="number" min="1" step="1"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  saveEdit(r.metal_type);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                    />
                    <span className={styles.unit}>/g</span>
                  </span>
                  <span className={styles.cRate10}>
                    {editValue && parseFloat(editValue) > 0 ? fmtINR(parseFloat(editValue) * 10) : '—'}
                  </span>
                  <span className={styles.cTime} />
                  <span className={styles.cAct}>
                    <button className={styles.iconBtn} onClick={() => saveEdit(r.metal_type)} disabled={saving} title="Save">
                      <Check size={14} color="#15803d" />
                    </button>
                    <button className={styles.iconBtn} onClick={cancelEdit} disabled={saving} title="Cancel">
                      <XIcon size={14} color="#be123c" />
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className={styles.cRate}>
                    {fmtINR(r.rate_per_gram)}<span className={styles.unit}>/g</span>
                  </span>
                  <span className={styles.cRate10}>{fmtINR(r.rate_per_10g ?? r.rate_per_gram * 10)}</span>
                  <span className={styles.cTime}>{fmtAge(r.fetched_at)}</span>
                  <span className={styles.cAct}>
                    <button className={styles.iconBtn} onClick={() => startEdit(r)} title="Edit rate">
                      <Pencil size={13} color="#8B6914" />
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}

          {/* Add new rate row */}
          {showAdd && (
            <div className={`${styles.row} ${styles.rowAdd}`}>
              <span className={styles.cMetal}>
                <select
                  className={styles.metalSel}
                  value={newMetal}
                  onChange={e => setNewMetal(e.target.value)}
                  autoFocus
                >
                  <option value="">Select metal…</option>
                  {addOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </span>
              <span className={styles.cRate}>
                <span className={styles.sym}>₹</span>
                <input
                  className={styles.editInput}
                  type="number" min="1" step="1"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  saveAdd();
                    if (e.key === 'Escape') { setShowAdd(false); setNewMetal(''); setNewRate(''); }
                  }}
                  placeholder="rate/gram"
                />
              </span>
              <span className={styles.cRate10}>
                {newRate && parseFloat(newRate) > 0 ? fmtINR(parseFloat(newRate) * 10) : '—'}
              </span>
              <span className={styles.cTime} />
              <span className={styles.cAct}>
                <button className={styles.iconBtn} onClick={saveAdd} disabled={saving || !newMetal} title="Save">
                  <Check size={14} color="#15803d" />
                </button>
                <button
                  className={styles.iconBtn}
                  onClick={() => { setShowAdd(false); setNewMetal(''); setNewRate(''); }}
                  disabled={saving}
                  title="Cancel"
                >
                  <XIcon size={14} color="#be123c" />
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
