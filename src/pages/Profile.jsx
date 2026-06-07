import React, { useState } from 'react';
import {
  Lock, Check, X, Crown, Store, Phone, Mail, MapPin, Wifi, Diamond,
  ShoppingBag, Users, Cpu, Shirt, BarChart2, Camera, MessageSquare, HardDrive, Zap,
} from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useStoreData } from '../hooks/useStoreData';
import { usePermissions } from '../hooks/usePermissions';
import {
  planKey, PLAN_LABELS, hasFeature, effectiveLimit, fmtLimit, PLAN_LIMITS,
} from '../lib/plans';
import VoiceStyleSection from '../components/VoiceStyleSection';
import styles from './Profile.module.css';

function FeatureRow({ icon: Icon, label, active, note }) {
  return (
    <div className={`${styles.featureRow} ${!active ? styles.featureRowOff : ''}`}>
      <div className={styles.featureName}>
        <Icon size={14} strokeWidth={1.5} color={active ? '#C9A84C' : 'rgba(13,27,42,.3)'} />
        <span>{label}</span>
        {note && <span className={styles.featureNote}>({note})</span>}
      </div>
      {active
        ? <span className={styles.featureOn}><Check size={11} /> Active</span>
        : <a
            href="mailto:nikimodi81@gmail.com?subject=KARAT Plan Upgrade"
            className={styles.featureUpgrade}
          >
            <Crown size={10} /> Upgrade
          </a>
      }
    </div>
  );
}

function LimitRow({ icon: Icon, label, used, limit }) {
  const isUnlim = limit === Infinity || limit === 'unlimited' || limit == null;
  const pct = isUnlim ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const fill = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#15803d';
  return (
    <div className={styles.limitRow}>
      <div className={styles.limitHead}>
        <span className={styles.limitLabel}>
          <Icon size={13} color="#8B6914" strokeWidth={1.5}/> {label}
        </span>
        <span className={styles.limitVals}>
          <strong>{Number(used || 0).toLocaleString('en-IN')}</strong>
          {!isUnlim && <> / {fmtLimit(limit)}</>}
          {isUnlim && <> · unlimited</>}
        </span>
      </div>
      {!isUnlim && (
        <div className={styles.limitTrack}>
          <div className={styles.limitFill} style={{width:`${pct}%`,background:fill}}/>
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { user, store, storeUser, updateStore, refreshStore } = useAuth();
  const { canAdmin, isOwner } = usePermissions();
  const { showToast } = useToast();
  const { products } = useStoreData();

  const [storeName, setStoreName]           = useState(store?.store_name || '');
  const [phone, setPhone]                   = useState(store?.phone || '');
  const [address, setAddress]               = useState(store?.address || '');
  const [selfieTryonTier, setSelfieTryonTier] = useState(store?.selfie_tryon_tier || 'vvip');
  const [saving, setSaving]                 = useState(false);

  const ownerName    = store?.owner_name || user?.user_metadata?.full_name || user?.email || 'Owner';
  const planName     = planKey(store);
  const planLabel    = PLAN_LABELS[planName] || 'Trial';
  const planSpec     = PLAN_LIMITS[planName] || PLAN_LIMITS.trial;
  const expiry       = store?.plan_expires_at
    ? new Date(store.plan_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  // Effective limits & usage
  const convUsed          = store?._conv_used || 0;
  const aiUsed            = store?._ai_used   || 0;
  const vtUsed            = store?._vt_used   || 0;
  const convLimit         = effectiveLimit(store, 'conversations');
  const prodLimit         = effectiveLimit(store, 'products');
  const aiLimit           = effectiveLimit(store, 'ai_models');
  const selfieTryonLimit  = effectiveLimit(store, 'selfie_tryon');
  const storageLimit      = effectiveLimit(store, 'image_storage');

  const productCount = products.length;

  const features = [
    { icon: Wifi,        label: 'WhatsApp AI Chatbot',       active: hasFeature(store, 'whatsapp') },
    { icon: ShoppingBag, label: 'Inventory Management',      active: hasFeature(store, 'inventory') },
    { icon: Camera,      label: 'Voice Search',              active: hasFeature(store, 'voice_search') },
    { icon: Camera,      label: 'Image Search',              active: hasFeature(store, 'image_search') },
    { icon: Users,       label: 'Customer Tiers (VVIP/VIP)', active: hasFeature(store, 'customer_tiers') },
    { icon: Cpu,         label: 'Teach AI Your Style',       active: hasFeature(store, 'teach_ai_style') },
    { icon: Cpu,         label: 'AI Models Try-On',          active: hasFeature(store, 'ai_models') },
    { icon: Shirt,       label: 'Selfie Try-On',             active: hasFeature(store, 'virtual_tryon') },
    { icon: BarChart2,   label: 'Analytics',                 active: !!planSpec.features.analytics, note: planSpec.features.analytics },
  ];

  const handleSave = async () => {
    if (!canAdmin) return;
    setSaving(true);
    try {
      // Owner: RLS matches owner_id = auth.uid(). Staff admin: filter by store.id (anon key + staff RLS policy).
      const updates = { store_name: storeName, phone, address, selfie_tryon_tier: selfieTryonTier };
      const query = isOwner
        ? db.from('stores').update(updates).eq('owner_id', user.id)
        : db.from('stores').update(updates).eq('id', store.id);
      const { error } = await query;
      if (error) throw error;
      updateStore(updates);
      showToast('Profile saved!', '#166534');
    } catch(err) {
      showToast('Error: ' + err.message, '#C0392B');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>My Profile & Plan</h2>
          <p className={styles.sub}>Manage your store details and view your plan features</p>
        </div>
      </div>

      <div className={styles.wrap}>
        {/* Plan hero */}
        <div className={styles.planHero}>
          <div>
            <div className={styles.planHeroLabel}>Current Plan</div>
            <div className={styles.planHeroName}>{planLabel}</div>
            <div className={styles.planHeroSub}>
              Valid until: {expiry} · Status: {store?.subscription_status || 'active'}
              {planSpec.monthly_inr > 0 && <> · ₹{planSpec.monthly_inr.toLocaleString('en-IN')}/mo</>}
            </div>
          </div>
          <div className={styles.planHeroBadge}>
            <Crown size={20} color="#C9A84C" />
            <span>{planLabel}</span>
          </div>
        </div>

        <div className={styles.grid}>
          {/* Left: Editable + Credit Guide */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className={styles.card}>
              <div className={styles.cardTitle}><Store size={16} color="#C9A84C" /> Store Details</div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>Owner Name</div>
                <input className="inp" value={ownerName} readOnly />
                <div className={styles.lockedNote}><Lock size={10} /> Set by admin on account approval</div>
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  Store Name {canAdmin && <span className={styles.editable}>✎ editable</span>}
                </div>
                <input
                  className="inp"
                  value={storeName}
                  onChange={e => canAdmin && setStoreName(e.target.value)}
                  readOnly={!canAdmin}
                  placeholder="Your jewellery store name"
                />
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  Phone Number {canAdmin && <span className={styles.editable}>✎ editable</span>}
                </div>
                <input
                  className="inp"
                  type="tel"
                  value={phone}
                  onChange={e => canAdmin && setPhone(e.target.value)}
                  readOnly={!canAdmin}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  Store Address {canAdmin && <span className={styles.editable}>✎ editable</span>}
                </div>
                <input
                  className="inp"
                  value={address}
                  onChange={e => canAdmin && setAddress(e.target.value)}
                  readOnly={!canAdmin}
                  placeholder="Shop address"
                />
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>
                  Selfie Try-On available to {canAdmin && <span className={styles.editable}>✎ editable</span>}
                </div>
                <select
                  className="inp"
                  value={selfieTryonTier}
                  onChange={e => canAdmin && setSelfieTryonTier(e.target.value)}
                  disabled={!canAdmin}
                >
                  <option value="vvip">VVIP customers only</option>
                  <option value="vip_and_vvip">VIP &amp; VVIP customers</option>
                  <option value="all">All customers</option>
                </select>
              </div>

              {canAdmin && (
                <button className="btn-gold" style={{ marginTop: 20, width: '100%', justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
                  {saving ? <><div className="spinner spinner-sm" /> Saving…</> : <><Check size={14} /> Save Changes</>}
                </button>
              )}
            </div>

            {/* Credit usage guide — left column */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><Zap size={14} color="#C9A84C" /> Credit Usage Guide</div>
              <div className={styles.creditGuide}>
                <div className={styles.creditItem}>
                  <div className={styles.creditFeature}><MessageSquare size={12} color="#8B6914"/> WhatsApp text reply</div>
                  <div className={styles.creditCost}><strong>1</strong> credit</div>
                </div>
                <div className={styles.creditItem}>
                  <div className={styles.creditFeature}><Camera size={12} color="#8B6914"/> Voice search query</div>
                  <div className={styles.creditCost}><strong>2</strong> credits</div>
                </div>
                <div className={styles.creditItem}>
                  <div className={styles.creditFeature}><Camera size={12} color="#8B6914"/> Image search query</div>
                  <div className={styles.creditCost}><strong>3</strong> credits</div>
                </div>
                <div className={styles.creditItem}>
                  <div className={styles.creditFeature}><Cpu size={12} color="#8B6914"/> AI model try-on</div>
                  <div className={styles.creditCost}><strong>1</strong> AI credit <span className={styles.creditNote}>(separate pool)</span></div>
                </div>
                <div className={styles.creditItem}>
                  <div className={styles.creditFeature}><Shirt size={12} color="#8B6914"/> Selfie try-on</div>
                  <div className={styles.creditCost}><strong>1</strong> AI credit <span className={styles.creditNote}>(separate pool)</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Read-only contact + Plan limits + Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>
                <Lock size={14} color="#C9A84C" /> Account & Contact
                <span style={{ fontSize: 11, color: 'rgba(201,168,76,.5)', fontFamily: 'DM Sans', fontWeight: 400, marginLeft: 8 }}>(managed by admin)</span>
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>Email ID</div>
                <input className="inp" value={store?.email || user?.email || '—'} readOnly />
                <div className={styles.lockedNote}><Lock size={10} /> Contact admin to change</div>
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>WhatsApp Business Number</div>
                <input className="inp" value={store?.whatsapp_phone || '—'} readOnly />
                <div className={styles.lockedNote}><Lock size={10} /> Contact admin to change</div>
              </div>

              <div className={styles.field}>
                <div className={styles.fieldLabel}>Owner WhatsApp (for alerts)</div>
                <input className="inp" value={store?.owner_whatsapp || '—'} readOnly />
                <div className={styles.lockedNote}><Lock size={10} /> Contact admin to change</div>
              </div>
            </div>

            {/* Plan limits & usage */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><Crown size={14} color="#C9A84C" /> Plan Limits & Usage</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
                <LimitRow icon={MessageSquare} label="Credits / month"    used={convUsed}     limit={convLimit}/>
                <LimitRow icon={ShoppingBag}   label="Products"           used={productCount} limit={prodLimit}/>
                <LimitRow icon={Cpu}           label="AI Models Try-On"   used={aiUsed}       limit={aiLimit}/>
                <LimitRow icon={Shirt}         label="Selfie Try-On"      used={vtUsed}       limit={selfieTryonLimit}/>
              </div>
            </div>

            {/* Features included */}
            <div className={styles.card}>
              <div className={styles.cardTitle}><Diamond size={14} color="#C9A84C" /> Features Included</div>
              <div className={styles.featureList}>
                {features.map((f, i) => <FeatureRow key={i} {...f} />)}
              </div>
              {isOwner && (planName === 'trial' || planName === 'starter') && (
                <a
                  href="mailto:nikimodi81@gmail.com?subject=KARAT Plan Upgrade"
                  className="btn-gold"
                  style={{ marginTop: 16, width: '100%', justifyContent: 'center', fontSize: 12, textDecoration: 'none' }}
                >
                  <Crown size={13} /> Upgrade Plan
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── AI Style Training (Professional+ only) ── */}
        {isOwner && hasFeature(store, 'teach_ai_style') && (
          <VoiceStyleSection
            store={store}
            user={user}
            onProfileUpdated={refreshStore}
          />
        )}
        {isOwner && !hasFeature(store, 'teach_ai_style') && (
          <div className={styles.card} style={{ marginTop: 24 }}>
            <div className={styles.cardTitle}><Lock size={14} color="rgba(13,27,42,.3)" /> Teach AI Your Style</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
                Train the AI to match your store's WhatsApp tone and reply style. Available on the Professional plan and above.
              </p>
              <a
                href="mailto:nikimodi81@gmail.com?subject=KARAT Plan Upgrade"
                className="btn-gold"
                style={{ textDecoration: 'none', fontSize: 12 }}
              >
                <Crown size={12} /> Upgrade to Professional
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
