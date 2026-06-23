import React, { useState, useRef, useEffect } from 'react';
import { Store, Phone, MapPin, Crown, ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import styles from './StoreSignup.module.css';

const PLANS = [
  { value: 'trial',        label: 'Trial',        note: 'Full Professional features to evaluate' },
  { value: 'starter',      label: 'Starter',      note: 'WhatsApp bot + inventory' },
  { value: 'professional', label: 'Professional', note: 'Voice/image search, CRM tiers, advanced AI' },
  { value: 'enterprise',   label: 'Enterprise',   note: 'Unlimited everything, fair-use' },
];

// Common countries for an Indian jewellery-store customer base; India first/default.
const COUNTRY_CODES = [
  { iso: 'IN', dial: '+91',  flag: '🇮🇳', name: 'India' },
  { iso: 'AE', dial: '+971', flag: '🇦🇪', name: 'UAE' },
  { iso: 'US', dial: '+1',   flag: '🇺🇸', name: 'United States' },
  { iso: 'GB', dial: '+44',  flag: '🇬🇧', name: 'United Kingdom' },
  { iso: 'CA', dial: '+1',   flag: '🇨🇦', name: 'Canada' },
  { iso: 'AU', dial: '+61',  flag: '🇦🇺', name: 'Australia' },
  { iso: 'SG', dial: '+65',  flag: '🇸🇬', name: 'Singapore' },
  { iso: 'SA', dial: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { iso: 'NP', dial: '+977', flag: '🇳🇵', name: 'Nepal' },
  { iso: 'BD', dial: '+880', flag: '🇧🇩', name: 'Bangladesh' },
];

function CountryCodeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = COUNTRY_CODES.find(c => c.dial === value) || COUNTRY_CODES[0];

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className={styles.ccWrap} ref={ref}>
      <button type="button" className={styles.ccButton} onClick={() => setOpen(o => !o)}>
        <span>{current.flag}</span>
        <span>{current.dial}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className={styles.ccMenu}>
          {COUNTRY_CODES.map(c => (
            <button
              type="button"
              key={c.iso}
              className={styles.ccOption}
              onClick={() => { onChange(c.dial); setOpen(false); }}
            >
              <span>{c.flag}</span>
              <span className={styles.ccOptionName}>{c.name}</span>
              <span className={styles.ccOptionDial}>{c.dial}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StoreSignup() {
  const { user, submitStoreSignup, logout } = useAuth();
  const { showToast } = useToast();
  const [storeName, setStoreName]   = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [address, setAddress]       = useState('');
  const [plan, setPlan]             = useState('');
  const [loading, setLoading]       = useState(false);

  const email = user?.email || '';
  const canSubmit = storeName.trim() && phoneLocal.trim() && plan && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!storeName.trim())   return showToast('Store name is required', '#C0392B');
    if (!phoneLocal.trim())  return showToast('Phone number is required', '#C0392B');
    if (!plan)               return showToast('Please select a plan', '#C0392B');

    setLoading(true);
    try {
      await submitStoreSignup({
        storeName: storeName.trim(),
        phone: countryCode + ' ' + phoneLocal.trim(),
        address: address.trim(),
        plan,
      });
    } catch (err) {
      showToast(err.message || 'Submission failed', '#C0392B');
      setLoading(false);
    }
  };

  return (
    <div className={styles.screen}>
      <form className={styles.box} onSubmit={handleSubmit}>
        <div className={styles.iconWrap}>
          <Store size={36} strokeWidth={1.5} color="#C9A84C" />
        </div>
        <h2 className={styles.title}>Set Up Your Store</h2>
        <p className={styles.sub}>
          Welcome{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}!
          Tell us a little about your store to request access.
        </p>

        <div className={styles.emailBadge}>{email}</div>

        {/* Store name */}
        <label className={styles.label}>
          Store Name <span className={styles.req}>*</span>
        </label>
        <div className={styles.inputWrap}>
          <Store size={16} className={styles.inputIcon} />
          <input
            className={styles.input}
            type="text"
            placeholder="e.g. Sharma Jewellers"
            value={storeName}
            onChange={e => setStoreName(e.target.value)}
            required
          />
        </div>

        {/* Phone */}
        <label className={styles.label}>
          Phone Number <span className={styles.req}>*</span>
        </label>
        <div className={styles.phoneRow}>
          <CountryCodeSelect value={countryCode} onChange={setCountryCode} />
          <div className={`${styles.inputWrap} ${styles.phoneInputWrap}`}>
            <Phone size={16} className={styles.inputIcon} />
            <input
              className={styles.input}
              type="tel"
              placeholder="98765 43210"
              value={phoneLocal}
              onChange={e => setPhoneLocal(e.target.value.replace(/[^\d\s]/g, ''))}
              required
            />
          </div>
        </div>

        {/* Address */}
        <label className={styles.label}>
          Store Address <span className={styles.optional}>(optional)</span>
        </label>
        <div className={styles.inputWrap}>
          <MapPin size={16} className={styles.inputIcon} />
          <input
            className={styles.input}
            type="text"
            placeholder="City, State"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </div>

        {/* Plan */}
        <label className={styles.label}>
          Plan <span className={styles.req}>*</span>
        </label>
        <div className={styles.plans}>
          {PLANS.map(p => (
            <button
              type="button"
              key={p.value}
              className={`${styles.planCard} ${plan === p.value ? styles.planActive : ''}`}
              onClick={() => setPlan(p.value)}
            >
              <div className={styles.planHead}>
                <Crown size={14} color={plan === p.value ? '#C9A84C' : 'rgba(13,27,42,.3)'} />
                <span className={styles.planName}>{p.label}</span>
              </div>
              <span className={styles.planNote}>{p.note}</span>
            </button>
          ))}
        </div>

        <button className={styles.btnPrimary} type="submit" disabled={!canSubmit}>
          {loading && <div className="spinner spinner-sm" style={{ borderTopColor: '#0B1829' }} />}
          <span>{loading ? 'Submitting…' : 'Request Access'}</span>
        </button>

        <p className={styles.legalNote}>
          By continuing, you agree to the{' '}
          <a href="https://nelishkaai.in/terms-of-service" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="https://nelishkaai.in/privacy-policy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>{' '}
          of Nelishka AI Solutions.
        </p>

        <button type="button" className={styles.btnLink} onClick={logout}>
          Sign out
        </button>
      </form>
    </div>
  );
}
