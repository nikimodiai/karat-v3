import { useState, useCallback } from 'react';
import {
  FileText, Sparkles, User, Crown, ArrowRight,
  RefreshCw, Calendar, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react';
import { db, N8N_CONVERSATION_SUMMARY } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { isProTier, PLAN_LABELS, planKey } from '../lib/plans';
import styles from './ConversationSummary.module.css';

const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;

const QUICK_RANGES = [
  { label: '7 Days',  days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SummaryCard({ item, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.summaryCard}>
      <div className={styles.cardHeader} onClick={() => setExpanded(o => !o)}>
        <div className={styles.cardLeft}>
          <div className={styles.avatar}><User size={14} /></div>
          <div>
            <div className={styles.customerName}>{item.name || item.phone}</div>
            <div className={styles.customerMeta}>
              {item.phone}
              {item.msgCount > 0 && <> · <MessageSquare size={10} style={{ verticalAlign: 'middle', margin: '0 2px' }} />{item.msgCount} messages</>}
              {item.dateRange && <> · {item.dateRange}</>}
            </div>
          </div>
        </div>
        <div className={styles.cardRight}>
          <span className={styles.indexBadge}># {index + 1}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      <div className={`${styles.cardBody} ${expanded ? styles.cardBodyOpen : ''}`}>
        <div className={styles.summaryBox}>
          <div className={styles.summaryLabel}><Sparkles size={11} /> AI Summary</div>
          <p className={styles.summaryText}>{item.summary}</p>
        </div>
      </div>
    </div>
  );
}

function UpgradeWall({ planLabel }) {
  return (
    <div className={styles.upgradeWall}>
      <div className={styles.upgradeIcon}><Crown size={32} strokeWidth={1.2} /></div>
      <h3 className={styles.upgradeTitle}>Conversation Summaries</h3>
      <p className={styles.upgradeMsg}>
        Get AI-generated summaries of every customer's WhatsApp journey — what they browsed, asked, and loved.
        Available on <strong>Professional</strong> and <strong>Enterprise</strong> plans.
      </p>
      <p className={styles.upgradeCurrent}>You're currently on the <strong>{planLabel}</strong> plan.</p>
      <a
        href="mailto:support@nelishkaai.in?subject=SWARNIX Plan Upgrade — Conversation Summaries"
        className={styles.upgradeCta}
      >
        <Crown size={13} /> Upgrade to Professional <ArrowRight size={13} />
      </a>
    </div>
  );
}

export default function ConversationSummary() {
  const { user, store } = useAuth();
  const isPro = isProTier(store);
  const planLabel = PLAN_LABELS[planKey(store)] || 'Starter';

  const [days, setDays] = useState(DEFAULT_DAYS);
  const [customDays, setCustomDays] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [summaries, setSummaries] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatedAt, setGeneratedAt] = useState(null);

  const effectiveDays = useCustom
    ? Math.min(MAX_DAYS, Math.max(1, parseInt(customDays, 10) || DEFAULT_DAYS))
    : days;

  const handleGenerate = useCallback(async () => {
    if (!user?.id) return;
    setStatus('loading');
    setErrorMsg('');
    setSummaries([]);

    const since = new Date(Date.now() - effectiveDays * 86400000).toISOString();

    // Fetch all logs for this owner in the period
    const { data, error: fetchErr } = await db
      .from('whatsapp_logs')
      .select('wa_from, wa_name, customer_message, ai_reply, sender, feature, created_at')
      .eq('owner_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(2000);

    if (fetchErr || !data) {
      setStatus('error');
      setErrorMsg('Could not load conversations from database.');
      return;
    }

    if (data.length === 0) {
      setStatus('done');
      setSummaries([]);
      setGeneratedAt(new Date());
      return;
    }

    // Group by phone number
    const grouped = {};
    data.forEach(row => {
      const key = row.wa_from || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          phone: row.wa_from,
          name: row.wa_name || row.wa_from,
          messages: [],
          firstAt: row.created_at,
          lastAt: row.created_at,
        };
      }
      grouped[key].messages.push(row);
      if (row.created_at < grouped[key].firstAt) grouped[key].firstAt = row.created_at;
      if (row.created_at > grouped[key].lastAt)  grouped[key].lastAt  = row.created_at;
    });

    // Build payload for n8n — send conversation threads per customer
    const customers = Object.values(grouped).map(c => ({
      phone: c.phone,
      name: c.name,
      msgCount: c.messages.length,
      firstAt: c.firstAt,
      lastAt: c.lastAt,
      // Send full thread: customer messages + AI replies interleaved
      thread: c.messages.map(m => ({
        time: m.created_at,
        customer: m.customer_message || null,
        ai: m.ai_reply || null,
        feature: m.feature || null,
      })),
    }));

    try {
      const res = await fetch(N8N_CONVERSATION_SUMMARY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: user.id,
          store_name: store?.store_name || '',
          days: effectiveDays,
          since,
          customers,
        }),
      });

      if (!res.ok) {
        throw new Error(`n8n returned ${res.status}`);
      }

      const json = await res.json().catch(() => ({}));
      // n8n should return { summaries: [{ phone, name, summary }] }
      // or a flat array [{ phone, name, summary }]
      const raw = json.summaries || (Array.isArray(json) ? json : []);

      // Merge summary text back with our grouped data for display
      const result = Object.values(grouped).map(c => {
        const found = raw.find(r => r.phone === c.phone);
        return {
          phone: c.phone,
          name: c.name,
          msgCount: c.messages.length,
          dateRange: `${fmtDate(c.firstAt)} – ${fmtDate(c.lastAt)}`,
          summary: found?.summary || 'Summary could not be generated for this customer.',
        };
      }).sort((a, b) => b.msgCount - a.msgCount);

      setSummaries(result);
      setGeneratedAt(new Date());
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setErrorMsg('Could not reach the summary service. Please check the n8n webhook is active.');
    }
  }, [user?.id, store, effectiveDays]);

  if (!isPro) {
    return <UpgradeWall planLabel={planLabel} />;
  }

  const sinceDate = new Date(Date.now() - effectiveDays * 86400000);
  const sinceFmt = sinceDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <FileText size={16} strokeWidth={1.5} color="var(--gold-dk)" />
          <span className={styles.title}>Conversation Summaries</span>
          <span className={styles.badge}>AI</span>
        </div>
        <p className={styles.subtitle}>
          AI-generated summaries of each customer's WhatsApp journey — what they explored, asked, and loved.
        </p>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.rangeGroup}>
          <Calendar size={13} color="var(--ink-soft)" />
          <span className={styles.rangeLabel}>Time period:</span>
          <div className={styles.quickBtns}>
            {QUICK_RANGES.map(r => (
              <button
                key={r.days}
                className={`${styles.rangeBtn} ${!useCustom && days === r.days ? styles.rangeBtnActive : ''}`}
                onClick={() => { setDays(r.days); setUseCustom(false); }}
              >
                {r.label}
              </button>
            ))}
            <button
              className={`${styles.rangeBtn} ${useCustom ? styles.rangeBtnActive : ''}`}
              onClick={() => setUseCustom(true)}
            >
              Custom
            </button>
          </div>

          {useCustom && (
            <div className={styles.customInput}>
              <input
                type="number"
                min={1}
                max={MAX_DAYS}
                value={customDays}
                onChange={e => setCustomDays(e.target.value)}
                placeholder="Days"
                className={styles.daysInput}
              />
              <span className={styles.daysLabel}>days (max {MAX_DAYS})</span>
            </div>
          )}
        </div>

        <div className={styles.generateArea}>
          {status !== 'idle' && (
            <span className={styles.sinceNote}>
              Period: {sinceFmt} → today
            </span>
          )}
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={status === 'loading'}
          >
            {status === 'loading'
              ? <><RefreshCw size={13} className={styles.spin} /> Generating…</>
              : <><Sparkles size={13} /> Generate Summary</>}
          </button>
        </div>
      </div>

      {/* States */}
      {status === 'idle' && (
        <div className={styles.idleState}>
          <Sparkles size={28} strokeWidth={1} color="rgba(201,168,76,.4)" />
          <p>Select a time period and click <strong>Generate Summary</strong> to see AI insights for every customer.</p>
        </div>
      )}

      {status === 'loading' && (
        <div className={styles.loadingState}>
          <div className="spinner spinner-sm" />
          <span>Analysing {effectiveDays} days of conversations…</span>
        </div>
      )}

      {status === 'error' && (
        <div className={styles.errorState}>
          <p>{errorMsg}</p>
          <button className={styles.retryBtn} onClick={handleGenerate}>
            <RefreshCw size={11} /> Try Again
          </button>
        </div>
      )}

      {status === 'done' && summaries.length === 0 && (
        <div className={styles.emptyState}>
          <MessageSquare size={28} strokeWidth={1} color="rgba(11,24,41,.2)" />
          <p>No customer conversations found in the last {effectiveDays} days.</p>
        </div>
      )}

      {status === 'done' && summaries.length > 0 && (
        <>
          <div className={styles.resultMeta}>
            <strong>{summaries.length}</strong> customer{summaries.length !== 1 ? 's' : ''} summarised
            &nbsp;·&nbsp;
            Generated {generatedAt?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className={styles.summaryList}>
            {summaries.map((item, i) => (
              <SummaryCard key={item.phone} item={item} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
