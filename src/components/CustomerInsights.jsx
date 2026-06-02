import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, Sparkles, User, Clock, RefreshCw, Bot } from 'lucide-react';
import { db, N8N_BASE } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import styles from './CustomerInsights.module.css';

const PERIODS = [
  { label: '1 Hour',  value: '1h',  ms: 3600000 },
  { label: '1 Day',   value: '1d',  ms: 86400000 },
  { label: '7 Days',  value: '7d',  ms: 7 * 86400000 },
];

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function CustomerRow({ customer, onSummarise }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.customerCard}>
      <div className={styles.customerHeader} onClick={() => setOpen(o => !o)}>
        <div className={styles.customerLeft}>
          <div className={styles.avatar}><User size={14}/></div>
          <div>
            <div className={styles.customerName}>{customer.name || customer.phone}</div>
            <div className={styles.customerMeta}>
              {customer.msgCount} message{customer.msgCount !== 1 ? 's' : ''}
              {' · '}
              <Clock size={10} style={{ verticalAlign: 'middle', marginRight: 3 }}/>
              Last: {timeAgo(customer.lastAt)}
            </div>
          </div>
        </div>
        <div className={styles.customerRight}>
          {customer.features?.length > 0 && (
            <div className={styles.featureTags}>
              {[...new Set(customer.features)].slice(0, 3).map(f => (
                <span key={f} className={styles.featureTag}>{f}</span>
              ))}
            </div>
          )}
          {open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </div>
      </div>

      {open && (
        <div className={styles.customerBody}>
          {/* AI summary section */}
          <div className={styles.summarySection}>
            <div className={styles.summaryTitle}><Sparkles size={12}/> AI Summary</div>
            {customer.aiSummary ? (
              <div className={styles.summaryText}>{customer.aiSummary}</div>
            ) : (
              <div className={styles.summaryEmpty}>
                <button className={styles.summariseBtn} onClick={() => onSummarise(customer)} disabled={customer.summarising}>
                  {customer.summarising
                    ? <><RefreshCw size={11} className={styles.spin}/> Generating…</>
                    : <><Sparkles size={11}/> Generate AI Summary</>}
                </button>
                <span className={styles.summaryHint}>Analyses what the customer checked, liked, and asked about</span>
              </div>
            )}
          </div>

          {/* Conversation thread */}
          <div className={styles.msgList}>
            {customer.messages.map((m, i) => (
              <div key={i} className={styles.msgGroup}>
                <div className={styles.msgTime}>{fmtTime(m.created_at)}</div>
                {m.customer_message && (
                  <div className={styles.msgBubbleCustomer}>
                    <User size={10} style={{ flexShrink: 0 }}/>
                    <span>{m.customer_message}</span>
                  </div>
                )}
                {m.ai_reply && (
                  <div className={styles.msgBubbleAI}>
                    <Bot size={10} style={{ flexShrink: 0 }}/>
                    <span>{m.ai_reply}</span>
                  </div>
                )}
                {m.feature && <span className={styles.featureTag} style={{ marginLeft: 'auto', flexShrink: 0, alignSelf: 'flex-end' }}>{m.feature}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerInsights() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [period,    setPeriod]    = useState('7d');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);

    const periodMs = PERIODS.find(p => p.value === period)?.ms ?? 7 * 86400000;
    const since = new Date(Date.now() - periodMs).toISOString();

    const { data, error: err } = await db
      .from('whatsapp_logs')
      .select('wa_from, wa_name, customer_message, ai_reply, sender, feature, created_at')
      .eq('owner_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (err) { setError('Could not load interactions'); setLoading(false); return; }

    // Group by phone number
    const grouped = {};
    (data || []).forEach(row => {
      const key = row.wa_from || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          phone: row.wa_from,
          name: row.wa_name || row.wa_from,
          messages: [],
          features: [],
          lastAt: row.created_at,
          aiSummary: null,
          summarising: false,
        };
      }
      grouped[key].messages.push(row);
      if (row.feature) grouped[key].features.push(row.feature);
      if (row.created_at > grouped[key].lastAt) grouped[key].lastAt = row.created_at;
    });

    const list = Object.values(grouped)
      .map(c => ({ ...c, msgCount: c.messages.length }))
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

    setCustomers(list);
    setLoading(false);
  }, [user?.id, period]);

  useEffect(() => { load(); }, [load]);

  const handleSummarise = async (customer) => {
    setCustomers(prev => prev.map(c =>
      c.phone === customer.phone ? { ...c, summarising: true } : c
    ));

    try {
      const messages = customer.messages
        .map(m => m.customer_message)
        .filter(Boolean)
        .slice(0, 50)
        .join('\n');

      const res = await fetch(`${N8N_BASE}/customer-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customer.name,
          customer_phone: customer.phone,
          messages,
        }),
      });

      let summary = 'Summary unavailable — check n8n webhook is configured.';
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        summary = json.summary || json.text || summary;
      }

      setCustomers(prev => prev.map(c =>
        c.phone === customer.phone ? { ...c, summarising: false, aiSummary: summary } : c
      ));
    } catch {
      setCustomers(prev => prev.map(c =>
        c.phone === customer.phone ? { ...c, summarising: false, aiSummary: 'Could not generate summary — check network.' } : c
      ));
    }
  };

  const totalMsgs = customers.reduce((s, c) => s + c.msgCount, 0);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <MessageSquare size={16} strokeWidth={1.5} color="var(--gold-dk)"/>
          <span className={styles.title}>Customer Chats</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.periodRow}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                className={`${styles.periodBtn} ${period === p.value ? styles.periodBtnActive : ''}`}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={styles.stats}>
            <span><strong>{customers.length}</strong> customers</span>
            <span>·</span>
            <span><strong>{totalMsgs}</strong> messages</span>
            <button className={styles.refreshBtn} onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={12} className={loading ? styles.spin : ''}/>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.stateRow}><div className="spinner spinner-sm"/> Loading chats…</div>
      ) : error ? (
        <div className={styles.stateRow} style={{ color: 'var(--err)' }}>{error}</div>
      ) : customers.length === 0 ? (
        <div className={styles.stateRow}>No customer chats in the selected period.</div>
      ) : (
        <div className={styles.list}>
          {customers.map(c => (
            <CustomerRow key={c.phone} customer={c} onSummarise={handleSummarise}/>
          ))}
        </div>
      )}
    </div>
  );
}
