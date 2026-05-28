import { useState, useEffect } from 'react';
import { TrendingUp, CalendarDays } from 'lucide-react';
import { db } from '../lib/config';
import styles from './MetalRatesCard.module.css';

// Extract purity number from metal_key, e.g. "gold_916" → "916"
function purityLabel(key) {
  const m = key.match(/(\d+)/);
  if (m) return `${m[1]} Purity`;
  if (/plat/i.test(key)) return 'Platinum';
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// "gold" / "silver" / "platinum"
function metalType(key) {
  const k = key.toLowerCase();
  if (k.includes('silver'))   return 'Silver';
  if (k.includes('plat'))     return 'Platinum';
  return 'Gold';
}

// Convert raw rate_inr to ₹ per gram:
//   Gold   → rate_inr is per 10g   → ÷ 10
//   Silver → rate_inr is per 1 kg  → ÷ 1000
//   Others → assume per 10g
function ratePerGram(key, rate_inr) {
  if (/silver/i.test(key)) return rate_inr / 1000;
  return rate_inr / 10;
}

function fmtRateDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const TYPE_COLOR = {
  Gold:     { bg: 'rgba(201,168,76,.1)',  text: '#8B6914' },
  Silver:   { bg: 'rgba(120,120,140,.1)', text: '#5a5a72' },
  Platinum: { bg: 'rgba(80,100,140,.1)',  text: '#3a4f7a' },
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
        .order('metal_key',  { ascending: true })
        .limit(50);

      if (err) {
        console.error('[MetalRatesCard] query error:', err);
        setError(`Could not load rates — ${err.message}`);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        console.warn('[MetalRatesCard] daily_metal_rates returned no rows');
        setLoading(false);
        return;
      }

      const latestDate = data[0].rate_date;
      const latestRows = data.filter(r => r.rate_date === latestDate);
      console.log('[MetalRatesCard] loaded', latestRows.length, 'rates for', latestDate);
      setRates(latestRows);
      setRateDate(latestDate);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <TrendingUp size={15} color="#C9A84C" />
          <span className={styles.title}>Today's Metal Rates</span>
        </div>
        {rateDate && (
          <span className={styles.dateTag}>
            <CalendarDays size={12} />
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
          No rates found in <code>daily_metal_rates</code> — check the table has rows and
          that RLS allows authenticated reads.
        </div>
      ) : (
        <div className={styles.strip}>
          {rates.map((r, i) => {
            const type  = metalType(r.metal_key);
            const rpg   = ratePerGram(r.metal_key, r.rate_inr);
            const color = TYPE_COLOR[type] || TYPE_COLOR.Gold;
            return (
              <div key={r.metal_key} className={styles.chip} style={i < rates.length - 1 ? { borderRight: '1px solid var(--border)' } : {}}>
                <span className={styles.chipType} style={{ background: color.bg, color: color.text }}>
                  {type}
                </span>
                <span className={styles.chipPurity}>{purityLabel(r.metal_key)}</span>
                <div className={styles.chipRate}>
                  <span className={styles.chipSym}>₹</span>
                  <span className={styles.chipNum}>
                    {Math.round(rpg).toLocaleString('en-IN')}
                  </span>
                </div>
                <span className={styles.chipUnit}>1 Gram</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
