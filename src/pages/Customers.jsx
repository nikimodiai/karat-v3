import React, { useState, useEffect } from 'react';
import { Plus, Search, Users, Pencil, Trash2, X } from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useStoreData } from '../hooks/useStoreData';
import { usePermissions } from '../hooks/usePermissions';
import { planKey, PLAN_LABELS, hasFeature } from '../lib/plans';
import ConfirmDialog from '../components/ConfirmDialog';
import { LockedCard } from '../components/UpgradeNotice';
import styles from './Customers.module.css';

const COUNTRY_CODES = [
  { code: '+91', flag: '🇮🇳', label: 'India' },
  { code: '+1',  flag: '🇺🇸', label: 'USA' },
  { code: '+44', flag: '🇬🇧', label: 'UK' },
  { code: '+971',flag: '🇦🇪', label: 'UAE' },
  { code: '+65', flag: '🇸🇬', label: 'Singapore' },
  { code: '+60', flag: '🇲🇾', label: 'Malaysia' },
  { code: '+61', flag: '🇦🇺', label: 'Australia' },
  { code: '+49', flag: '🇩🇪', label: 'Germany' },
  { code: '+92', flag: '🇵🇰', label: 'Pakistan' },
];

const TIER_CONFIG = {
  VVIP:    { label: 'VVIP',    cls: 'tierVVIP' },
  VIP:     { label: 'VIP',     cls: 'tierVIP' },
  Regular: { label: 'Regular', cls: 'tierRegular' },
};

export default function Customers() {
  const { user, store } = useAuth();
  const { canWrite } = usePermissions();
  const { showToast } = useToast();
  const { customers, setCustomers, loading } = useStoreData();

  const plan      = planKey(store);
  const planLabel = PLAN_LABELS[plan] || 'Trial';
  const hasTiers  = hasFeature(store, 'customer_tiers');
  // CRM is available on Starter+ (per existing spec). Trial counts as Pro so it's open.
  const hasAccess = plan !== 'starter' ? true : true; // starter: customers without tiers
  // The original code blocked trial. But Trial = Pro per our plan map, so trial also gets access.
  // Effectively the only gate that matters is Starter (which has CRM but no tier badges).

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editCust, setEditCust]   = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const filtered = search
    ? customers.filter(c =>
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.whatsapp_number || '').includes(search)
      )
    : customers;

  if (!hasAccess) {
    return (
      <LockedCard
        icon={Users}
        title="Customer CRM"
        message="Customer management is available on Starter plan and above."
        currentPlan={planLabel}
      />
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Customers</h2>
          <p className={styles.sub}>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={styles.controls}>
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search name or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button className={styles.clearBtn} onClick={() => setSearch('')}><X size={12} /></button>}
          </div>
          {canWrite && (
            <button className="btn-gold" onClick={() => { setEditCust(null); setModalOpen(true); }}>
              <Plus size={15} /> Add Customer
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.center}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <Users size={44} strokeWidth={1} color="rgba(13,27,42,.2)" />
            <h3>{search ? 'No results' : 'No customers yet'}</h3>
            <p>{search ? `No match for "${search}"` : 'Add your first customer.'}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Customer</th>
                {hasTiers && <th>Tier</th>}
                <th>WhatsApp</th>
                <th>City</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className={styles.custName}>{c.name}</div>
                    {c.email && <div className={styles.custEmail}>{c.email}</div>}
                  </td>
                  {hasTiers && (
                    <td>
                      <span className={`${styles.tierBadge} ${styles[TIER_CONFIG[c.tier]?.cls || 'tierRegular']}`}>
                        {c.tier || 'Regular'}
                      </span>
                    </td>
                  )}
                  <td>
                    <div className={styles.phone}>{c.whatsapp_number || '—'}</div>
                  </td>
                  <td>{c.city || '—'}</td>
                  <td>
                    <div className={styles.notes}>{c.notes || '—'}</div>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {canWrite && (
                        <button className={styles.rowBtn} onClick={() => { setEditCust(c); setModalOpen(true); }} title="Edit">
                          <Pencil size={13} />
                        </button>
                      )}
                      {canWrite && (
                        <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => setConfirmId(c.id)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <CustomerModal
          customer={editCust}
          hasTiers={hasTiers}
          userId={user.id}
          onSave={async (payload) => {
            if (editCust) {
              const { error } = await db.from('customers').update(payload).eq('id', editCust.id);
              if (error) throw error;
              setCustomers(prev => prev.map(c => c.id === editCust.id ? { ...c, ...payload } : c));
              showToast('Customer updated!', '#166534');
            } else {
              const { data, error } = await db.from('customers').insert(payload).select().single();
              if (error) throw error;
              setCustomers(prev => [data, ...prev]);
              showToast('Customer added!', '#166534');
            }
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}

      {confirmId && (
        <ConfirmDialog
          message="Remove this customer? This cannot be undone."
          confirmLabel="Remove"
          onConfirm={async () => {
            const { error } = await db.from('customers').delete().eq('id', confirmId);
            if (error) {
              showToast('Delete failed: ' + error.message, '#C0392B');
            } else {
              setCustomers(prev => prev.filter(c => c.id !== confirmId));
              showToast('Customer removed.', '#C0392B');
            }
            setConfirmId(null);
          }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}

// ── CustomerModal ────────────────────────────────────────────
function CustomerModal({ customer, hasTiers, userId, onSave, onClose }) {
  const { showToast } = useToast();
  const isEdit = !!customer;
  const [name, setName] = useState(customer?.name || '');
  const [tier, setTier] = useState(customer?.tier || 'Regular');
  const [country, setCountry] = useState('+91');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(customer?.email || '');
  const [city, setCity] = useState(customer?.city || '');
  const [notes, setNotes] = useState(customer?.notes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      const wa = customer.whatsapp_number || '';
      const m = wa.match(/^(\+\d+)\s(.+)$/);
      if (m) { setCountry(m[1]); setPhone(m[2]); }
      else setPhone(wa);
    }
  }, [customer]);

  const handleSave = async () => {
    if (!name.trim()) { showToast('Name is required', '#C0392B'); return; }
    if (!phone.trim()) { showToast('WhatsApp number is required', '#C0392B'); return; }
    if (hasTiers && !tier) { showToast('Please select a tier', '#C0392B'); return; }
    setSaving(true);
    try {
      await onSave({
        owner_id: userId,
        name: name.trim(),
        tier: hasTiers ? tier : 'Regular',
        whatsapp_number: country + ' ' + phone.trim(),
        email: email.trim() || null,
        city: city.trim() || null,
        notes: notes.trim() || null,
      });
    } catch(err) {
      showToast('Error: ' + err.message, '#C0392B');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,.3)', animation: 'slideUp .2s ease', overflow: 'hidden' }}>
        <div style={{ padding: '22px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--navy)' }}>{isEdit ? 'Edit Customer' : 'Add Customer'}</h2>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', display: 'flex', padding: 4 }} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px 28px', overflow: 'auto', flex: 1 }}>
          <div className="sec-label">① Customer Details</div>
          <div className="fg fg2">
            <div className="fld">
              <label className="lbl">Full Name <span className="req">*</span></label>
              <input className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Mehta" />
            </div>
            {hasTiers ? (
              <div className="fld">
                <label className="lbl">Customer Tier <span className="req">*</span></label>
                <select className="inp" value={tier} onChange={e => setTier(e.target.value)}>
                  <option value="">Select tier…</option>
                  <option value="VVIP">VVIP</option>
                  <option value="VIP">VIP</option>
                  <option value="Regular">Regular</option>
                </select>
              </div>
            ) : (
              <div className="fld">
                <label className="lbl">Customer Tier</label>
                <input className="inp" value="Regular" readOnly style={{ background: 'var(--cream)', color: 'var(--ink-soft)' }} />
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>Tiers available on Professional & Enterprise plans.</div>
              </div>
            )}
          </div>

          <div className="fg" style={{ marginTop: 14 }}>
            <div className="fld">
              <label className="lbl">WhatsApp Number <span className="req">*</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
                <select className="inp" value={country} onChange={e => setCountry(e.target.value)}>
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>{c.flag} {c.code} {c.label}</option>
                  ))}
                </select>
                <input className="inp" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98765 43210" maxLength={15} />
              </div>
            </div>
          </div>

          <div className="fg fg2" style={{ marginTop: 14 }}>
            <div className="fld">
              <label className="lbl">Email (optional)</label>
              <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="priya@example.com" />
            </div>
            <div className="fld">
              <label className="lbl">City (optional)</label>
              <input className="inp" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Mumbai" />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="fld">
              <label className="lbl">Notes (optional)</label>
              <textarea className="inp" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Preferred designs, anniversaries, special preferences…" />
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={handleSave} disabled={saving}>
            {saving ? <><div className="spinner spinner-sm" /> Saving…</> : isEdit ? 'Update Customer' : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
