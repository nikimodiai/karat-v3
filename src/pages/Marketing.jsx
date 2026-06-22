import React, { useState, useEffect, useMemo } from 'react';
import { Megaphone, RefreshCw, Send, Users, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { db, N8N_MARKETING_SEND } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useStoreData } from '../hooks/useStoreData';
import { usePermissions } from '../hooks/usePermissions';
import { planKey, PLAN_LABELS, hasFeature } from '../lib/plans';
import { LockedCard } from '../components/UpgradeNotice';
import ConfirmDialog from '../components/ConfirmDialog';
import styles from './Marketing.module.css';

const FB_API_VERSION = 'v21.0';

const TIER_OPTIONS = [
  { value: 'vvip',      label: 'VVIP only' },
  { value: 'vvip_vip',  label: 'VVIP & VIP' },
  { value: 'all',       label: 'All customers' },
];

function matchesTier(customer, tierFilter) {
  const tier = customer.tier || 'Regular';
  if (tierFilter === 'all') return true;
  if (tierFilter === 'vvip') return tier === 'VVIP';
  if (tierFilter === 'vvip_vip') return tier === 'VVIP' || tier === 'VIP';
  return false;
}

// Pull the {{1}}, {{2}}... placeholder count out of a template's BODY component.
function bodyPlaceholderCount(template) {
  const body = (template.components || []).find(c => c.type === 'BODY');
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

export default function Marketing() {
  const { store } = useAuth();
  const { canWrite } = usePermissions();
  const { showToast } = useToast();
  const { customers } = useStoreData();

  const plan = planKey(store);
  const planLabel = PLAN_LABELS[plan] || 'Trial';
  const hasAccess = hasFeature(store, 'marketing_messages');
  const isWaConnected = !!(store?.wa_access_token && store?.whatsapp_phone_number_id && store?.waba_id);

  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState('');

  const [campaignName, setCampaignName] = useState('');
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [variables, setVariables] = useState([]); // array of strings for {{1}}, {{2}}...
  const [tierFilter, setTierFilter] = useState('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find(t => t.name === selectedTemplateName) || null,
    [templates, selectedTemplateName]
  );

  const placeholderCount = selectedTemplate ? bodyPlaceholderCount(selectedTemplate) : 0;

  const audience = useMemo(
    () => customers.filter(c => c.whatsapp_number && matchesTier(c, tierFilter)),
    [customers, tierFilter]
  );

  useEffect(() => {
    setVariables(Array(placeholderCount).fill(''));
  }, [selectedTemplateName, placeholderCount]);

  const loadTemplates = async () => {
    if (!isWaConnected) return;
    setLoadingTemplates(true);
    setTemplateError('');
    try {
      const res = await fetch(
        `https://graph.facebook.com/${FB_API_VERSION}/${store.waba_id}/message_templates?fields=name,status,category,language,components&limit=100&access_token=${store.wa_access_token}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      console.log('Meta templates raw response:', data.data);
      const approved = (data.data || []).filter(t => ['APPROVED', 'ACTIVE'].includes(t.status));
      setTemplates(approved);
      if (approved.length === 0) {
        setTemplateError('No approved templates found. Create a Marketing template in Meta Business Manager → WhatsApp Manager first.');
      }
    } catch (err) {
      setTemplateError('Could not load templates: ' + err.message);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadLogs = async () => {
    if (!store?.owner_id) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await db
        .from('marketing_message_logs')
        .select('*')
        .eq('owner_id', store.owner_id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      // Non-fatal — history is a nice-to-have.
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (hasAccess && isWaConnected) loadTemplates();
    if (hasAccess) loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, isWaConnected, store?.waba_id]);

  if (!hasAccess) {
    return (
      <LockedCard
        icon={Megaphone}
        title="Marketing Messages"
        message="Send WhatsApp campaigns for Diwali, wedding season and more — targeted by customer tier. Available on Professional plan and above."
        currentPlan={planLabel}
      />
    );
  }

  if (!isWaConnected) {
    return (
      <LockedCard
        icon={Megaphone}
        title="Connect WhatsApp Business First"
        message="Marketing campaigns send via your store's WhatsApp Business number. Connect it from My Profile & Plan before sending campaigns."
        currentPlan={planLabel}
        ctaLabel="Go to Profile"
      />
    );
  }

  const canSend = canWrite && campaignName.trim() && selectedTemplateName && audience.length > 0
    && variables.every(v => v.trim().length > 0);

  const handleSend = async () => {
    setSending(true);
    try {
      const body = (selectedTemplate.components || []).find(c => c.type === 'BODY');
      const components = placeholderCount > 0
        ? [{
            type: 'body',
            parameters: variables.map(v => ({ type: 'text', text: v })),
          }]
        : [];

      const res = await fetch(N8N_MARKETING_SEND, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: store.owner_id,
          wa_access_token: store.wa_access_token,
          whatsapp_phone_number_id: store.whatsapp_phone_number_id,
          campaign_name: campaignName.trim(),
          template_name: selectedTemplate.name,
          template_language: selectedTemplate.language,
          tier_filter: tierFilter,
          components,
          customers: audience.map(c => ({ id: c.id, name: c.name, whatsapp_number: c.whatsapp_number })),
        }),
      });
      if (!res.ok) throw new Error(`Send failed (${res.status})`);
      showToast(`Campaign queued for ${audience.length} customer${audience.length !== 1 ? 's' : ''}!`, '#166534');
      setConfirmOpen(false);
      setCampaignName('');
      setSelectedTemplateName('');
      setTimeout(loadLogs, 3000);
    } catch (err) {
      showToast('Error: ' + err.message, '#C0392B');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Marketing Messages</h2>
          <p className={styles.sub}>Send WhatsApp campaigns for Diwali, wedding season &amp; more — by customer tier</p>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.card}>
          <div className="sec-label">① Campaign</div>
          <div className="fld">
            <label className="lbl">Campaign Name <span className="req">*</span></label>
            <input
              className="inp"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. Diwali Dhanteras 2026"
              disabled={!canWrite}
            />
          </div>

          <div className="sec-label" style={{ marginTop: 18 }}>② WhatsApp Template</div>
          {templateError && (
            <div className={styles.errorBox}>
              <AlertCircle size={14} />
              <span style={{ flex: 1 }}>{templateError}</span>
              <button
                type="button"
                className={styles.refreshIconBtn}
                onClick={loadTemplates}
                disabled={loadingTemplates}
                title="Refresh templates"
                aria-label="Refresh templates"
              >
                <RefreshCw size={13} className={loadingTemplates ? styles.spin : ''} />
              </button>
            </div>
          )}
          {!templateError && templates.length > 0 && (
            <div className="fld">
              <div className={styles.labelRow}>
                <label className="lbl">Approved Template <span className="req">*</span></label>
                <button
                  type="button"
                  className={styles.refreshIconBtn}
                  onClick={loadTemplates}
                  disabled={loadingTemplates}
                  title="Refresh templates"
                  aria-label="Refresh templates"
                >
                  <RefreshCw size={13} className={loadingTemplates ? styles.spin : ''} />
                </button>
              </div>
              <select
                className="inp"
                value={selectedTemplateName}
                onChange={e => setSelectedTemplateName(e.target.value)}
                disabled={!canWrite}
              >
                <option value="">Select template…</option>
                {templates.map(t => (
                  <option key={t.name + t.language} value={t.name}>
                    {t.name} ({t.language}) — {t.category}
                  </option>
                ))}
              </select>
              <div className={styles.hint}>
                Only Meta-approved templates appear here. Create new ones in Meta Business Manager → WhatsApp Manager → Message Templates.
              </div>
            </div>
          )}

          {selectedTemplate && (
            <div className={styles.preview}>
              <div className={styles.previewLabel}>Preview</div>
              <div className={styles.previewBody}>
                {(selectedTemplate.components || []).find(c => c.type === 'BODY')?.text || '—'}
              </div>
            </div>
          )}

          {selectedTemplate && placeholderCount > 0 && (
            <div className={styles.varGrid}>
              {variables.map((v, i) => (
                <div className="fld" key={i}>
                  <label className="lbl">Variable {`{{${i + 1}}}`} <span className="req">*</span></label>
                  <input
                    className="inp"
                    value={v}
                    onChange={e => setVariables(prev => prev.map((p, idx) => idx === i ? e.target.value : p))}
                    placeholder={i === 0 ? 'e.g. customer name' : `Value for {{${i + 1}}}`}
                    disabled={!canWrite}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="sec-label" style={{ marginTop: 18 }}>③ Audience</div>
          <div className="fld">
            <label className="lbl">Send To <span className="req">*</span></label>
            <select className="inp" value={tierFilter} onChange={e => setTierFilter(e.target.value)} disabled={!canWrite}>
              {TIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className={styles.audienceBox}>
            <Users size={16} />
            <span>
              <strong>{audience.length}</strong> customer{audience.length !== 1 ? 's' : ''} with a WhatsApp number will receive this message.
            </span>
          </div>

          <p className={styles.hint}>
            WhatsApp marketing messages are chargeable by Meta per conversation.{' '}
            <a
              href="https://whatsappbusiness.com/products/platform-pricing/?country=India&currency=Indian%20Rupee%20(INR)&category=Authentication#rates"
              target="_blank"
              rel="noopener noreferrer"
            >
              View India pricing on Meta's site →
            </a>
          </p>

          {canWrite && (
            <button
              className="btn-gold"
              style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
              onClick={() => setConfirmOpen(true)}
              disabled={!canSend}
            >
              <Send size={14} /> Review &amp; Send Campaign
            </button>
          )}
        </div>

        <div className={styles.card}>
          <div className="sec-label">Send History</div>
          {loadingLogs ? (
            <div className={styles.center}><div className="spinner" /></div>
          ) : logs.length === 0 ? (
            <p className={styles.hint}>No campaigns sent yet.</p>
          ) : (
            <div className={styles.logList}>
              {logs.map(l => (
                <div className={styles.logRow} key={l.id}>
                  {l.status === 'sent' ? (
                    <CheckCircle2 size={14} color="#166534" />
                  ) : l.status === 'failed' ? (
                    <XCircle size={14} color="#C0392B" />
                  ) : (
                    <Clock size={14} color="#8B6914" />
                  )}
                  <div className={styles.logBody}>
                    <div className={styles.logTitle}>{l.campaign_name}</div>
                    <div className={styles.logMeta}>
                      {l.template_name} · {l.tier_filter} · {new Date(l.created_at).toLocaleString('en-IN')}
                    </div>
                    {l.status === 'failed' && l.error_message && (
                      <div className={styles.logError}>{l.error_message}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          message={`Send "${campaignName.trim()}" to ${audience.length} customer${audience.length !== 1 ? 's' : ''} (${TIER_OPTIONS.find(o => o.value === tierFilter)?.label})? WhatsApp marketing messages are chargeable by Meta per their Business API pricing.`}
          confirmLabel={sending ? 'Sending…' : 'Send Campaign'}
          confirmColor="#166534"
          onConfirm={handleSend}
          onCancel={() => !sending && setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
