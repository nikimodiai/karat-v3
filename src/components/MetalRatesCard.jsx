import { useState, useEffect } from 'react';
import { TrendingUp, CalendarDays } from 'lucide-react';
import { db } from '../lib/config';
import styles from './MetalRatesCard.module.css';

function purityLabel(key) {
  const m = key.match(/(\d+)/);
  if (m) return `${m[1]} Purity`;
  if (/plat/i.test(key)) return 'Platinum';
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function metalType(key) {
  const k = key.toLowerCase();
  if (k.includes('silver')) return 'Silver';
  if (k.includes('plat'))   return 'Platinum';
  return 'Gold';
}

// Gold rate_inr is per 10g — show as-is with "10 Gm" label
// Silver rate_inr is per kg — show as-is with "1 Kg" label
function unitLabel(key) {
  return /silver/i.test(key) ? '1 Kg' : '10 Gm';
}

// Sort: gold first (purity desc), platinum, then silver (purity desc)
function sortRates(rows) {
  const TYPE_ORDER = { Gold: 0, Platinum: 1, Silver: 2 };
  return [...rows].sort((a, b) => {
    const tA = metalType(a.metal_key), tB = metalType(b.metal_key);
    if (TYPE_ORDER[tA] !== TYPE_ORDER[tB]) return TYPE_ORDER[tA] - TYPE_ORDER[tB];
    const pA = Number(a.metal_key.match(/(\d+)/)?.[1] || 0);
    const pB = Number(b.metal_key.match(/(\d+)/)?.[1] || 0);
    return pB - pA; // higher purity first
  });
}

function fmtRateDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const TYPE_COLOR = {
  Gold:     { bg: 'rgba(201,168,76,.12)', text: '#8B6914', unit: 'rgba(201,168,76,.25)' },
  Silver:   { bg: 'rgba(120,120,140,.1)', text: '#5a5a72', unit: 'rgba(120,120,140,.2)' },
  Platinum: { bg: 'rgba(80,100,140,.1)',  text: '#3a4f7a', unit: 'rgba(80,100,140,.2)'  },
};

export default function MetalRatesCard() {
  const [rates,    setRates]    = useState([]);
  const [rateDate, setRateDate] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: err } = await db
        .from('daily_metal_rates')
        .select('rate_date, metal_key, rate_inr')
        .order('rate_date', { ascending: false })
        .limit(50);
      if (err) {
        console.error('[MetalRatesCard] query error:', err);
        setError(`Could not load rates — ${err.message}`);
        setLoading(false);
        return;
      }
      if (!data?.length) {
        console.warn('[MetalRatesCard] daily_metal_rates returned no rows');
        setLoading(false);
        return;
      }
      const latestDate = data[0].rate_date;
      const sorted = sortRates(data.filter(r => r.rate_date === latestDate));
      console.log('[MetalRatesCard] loaded', sorted.length, 'rates for', latestDate);
      setRates(sorted);
      setRateDate(latestDate);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <TrendingUp size={14} color="#C9A84C" />
          <span className={styles.title}>Today's Metal Rates</span>
        </div>
        {rateDate && (
          <span className={styles.dateTag}>
            <CalendarDays size={11} />
            Updated on {fmtRateDate(rateDate)}
          </span>
        )}
      </div>

      {loading ? (
        <div className={styles.stateRow}>
          <div className="spinner spinner-sm" /> Loading rates…
        </div>
      ) : error ? (
        <div className={styles.stateRow} style={{ color: 'var(--err)' }}>{error}</div>
      ) : rates.length === 0 ? (
        <div className={styles.emptyState}>
          No rates in <code>daily_metal_rates</code> — check the table has rows and RLS allows authenticated reads.
        </div>
      ) : (
        <div className={styles.strip}>
          {rates.map((r, i) => {
            const type  = metalType(r.metal_key);
            const color = TYPE_COLOR[type] || TYPE_COLOR.Gold;
            const unit  = unitLabel(r.metal_key);
            return (
              <div
                key={r.metal_key}
                className={styles.chip}
                style={i < rates.length - 1 ? { borderRight: '1px solid var(--border)' } : {}}
              >
                <span className={styles.chipPurity}>{purityLabel(r.metal_key)}</span>
                <div className={styles.chipRate}>
                  <span className={styles.chipSym}>₹</span>
                  <span className={styles.chipNum}>
                    {Math.round(r.rate_inr).toLocaleString('en-IN')}
                  </span>
                </div>
                <span
                  className={styles.chipUnit}
                  style={{ background: color.unit, color: color.text }}
                >
                  {unit}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
