import React, { useState, useEffect } from 'react';
import { TrendingUp, CalendarDays } from 'lucide-react';
import { db } from '../lib/config';
import { fmtINR } from '../lib/pricing';
import styles from './MetalRatesCard.module.css';

// Label map — covers common metal_key formats; falls back to formatted key
const METAL_LABELS = {
  // gold
  'gold_24k': '24K Gold (Fine)',  'gold_999': '24K Gold (Fine)',
  'gold_22k': '22K Gold (916)',   'gold_916': '22K Gold (916)',
  'gold_20k': '20K Gold (833)',   'gold_833': '20K Gold (833)',
  'gold_18k': '18K Gold (750)',   'gold_750': '18K Gold (750)',
  'gold_14k': '14K Gold (585)',   'gold_585': '14K Gold (585)',
  'gold_10k': '10K Gold (417)',   'gold_417': '10K Gold (417)',
  'gold_9k':  '9K Gold (375)',    'gold_375': '9K Gold (375)',
  // white / rose gold
  'white_gold_18k': '18K White Gold', 'rose_gold_18k': '18K Rose Gold',
  // silver
  'silver_999': 'Silver Fine (999)', 'silver_fine': 'Silver Fine (999)',
  'silver_925': 'Silver Sterling (925)', 'silver_sterling': 'Silver Sterling (925)',
  'silver_800': 'Silver (800)',
  // platinum
  'platinum': 'Platinum', 'platinum_950': 'Platinum (950)',
};

function metalLabel(key) {
  if (!key) return key;
  const k = key.toLowerCase().replace(/[\s-]/g, '_');
  if (METAL_LABELS[k]) return METAL_LABELS[k];
  // Pattern fallback
  if (/gold.*24|24.*gold|gold.*999/.test(k)) return '24K Gold (Fine)';
  if (/gold.*22|22.*gold|gold.*916/.test(k)) return '22K Gold (916)';
  if (/gold.*18|18.*gold|gold.*750/.test(k)) return '18K Gold';
  if (/gold.*14|14.*gold|gold.*585/.test(k)) return '14K Gold';
  if (/silver.*999|fine.*silver/.test(k))    return 'Silver Fine (999)';
  if (/silver.*925|sterling/.test(k))        return 'Silver Sterling (925)';
  if (/silver/.test(k))                      return 'Silver';
  if (/plat/.test(k))                        return 'Platinum';
  // Nice-format raw key
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtRateDate(dateStr) {
  if (!dateStr) return '';
  // dateStr is a date string like "2026-05-28"
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function MetalRatesCard() {
  const [rates,   setRates]   = useState([]);
  const [rateDate, setRateDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      // Fetch the most recent date available
      const { data: dateRow, error: e1 } = await db
        .from('daily_metal_rates')
        .select('rate_date')
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (e1 || !dateRow) {
        setError(e1 ? 'Could not load rates' : null);
        setLoading(false);
        return;
      }

      // Fetch all metals for that date
      const { data, error: e2 } = await db
        .from('daily_metal_rates')
        .select('metal_key, rate_inr, source')
        .eq('rate_date', dateRow.rate_date)
        .order('metal_key');

      if (e2) { setError('Could not load rates'); }
      else    { setRates(data || []); setRateDate(dateRow.rate_date); }
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
          No rates available yet — rates are updated daily.
        </div>
      ) : (
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.rowHeader}`}>
            <span className={styles.cMetal}>Metal</span>
            <span className={styles.cRate}>Rate / gram</span>
            <span className={styles.cRate10}>Rate / 10g</span>
          </div>

          {rates.map(r => (
            <div key={r.metal_key} className={styles.row}>
              <span className={styles.cMetal}>{metalLabel(r.metal_key)}</span>
              <span className={styles.cRate}>
                {fmtINR(r.rate_inr)}
                <span className={styles.unit}>/g</span>
              </span>
              <span className={styles.cRate10}>
                {fmtINR(r.rate_inr * 10)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
