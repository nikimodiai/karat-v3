import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Package, MessageSquare, Users, BarChart2, Eye, EyeOff } from 'lucide-react';
import styles from './Login.module.css';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const FEATURES = [
  { icon: Package,       label: 'Smart Inventory' },
  { icon: MessageSquare, label: 'WhatsApp AI Bot' },
  { icon: Users,         label: 'Customer CRM'   },
  { icon: BarChart2,     label: 'Analytics'       },
];

export default function Login() {
  const { loginWithGoogle, loginWithCredentials } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab]         = useState('owner');   // 'owner' | 'staff'
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      showToast('Login failed: ' + (err.message || 'Unknown error'), '#C0392B');
      setLoading(false);
    }
  };

  const handleCredentials = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      await loginWithCredentials(username, password);
    } catch (err) {
      showToast(err.message || 'Invalid credentials', '#C0392B');
      setLoading(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.particles} aria-hidden />
      <div className={styles.sweep} aria-hidden />

      <div className={styles.box}>
        {/* Logo */}
        <div className={styles.logoWrap}>
          <div className={styles.logoMark}>
            <svg viewBox="0 0 60 60" fill="none" width="52" height="52">
              <polygon points="30,4 56,20 56,40 30,56 4,40 4,20" fill="none" stroke="#C9A84C" strokeWidth="1.5"/>
              <polygon points="30,14 46,23 46,37 30,46 14,37 14,23" fill="none" stroke="rgba(201,168,76,0.38)" strokeWidth="1"/>
              <circle cx="30" cy="30" r="6" fill="#C9A84C"/>
              <line x1="30" y1="4" x2="30" y2="14" stroke="#C9A84C" strokeWidth="1.2"/>
              <line x1="56" y1="20" x2="46" y2="23" stroke="#C9A84C" strokeWidth="1.2"/>
              <line x1="56" y1="40" x2="46" y2="37" stroke="#C9A84C" strokeWidth="1.2"/>
              <line x1="30" y1="56" x2="30" y2="46" stroke="#C9A84C" strokeWidth="1.2"/>
              <line x1="4" y1="40" x2="14" y2="37" stroke="#C9A84C" strokeWidth="1.2"/>
              <line x1="4" y1="20" x2="14" y2="23" stroke="#C9A84C" strokeWidth="1.2"/>
            </svg>
          </div>
          <div className={styles.brandName}>SWARNIX</div>
          <div className={styles.brandTagline}>Jewellery Inventory Intelligence</div>
        </div>

        {/* Hero */}
        <div className={styles.heroSection}>
          <h1 className={styles.heroTitle}>Your Jewellery Store,<br/><em>Beautifully Organised</em></h1>
        </div>

        {/* Feature icons */}
        <div className={styles.features}>
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className={styles.featureItem}>
              <div className={styles.featureIcon}><Icon size={16} strokeWidth={1.5}/></div>
              <div className={styles.featureLabel}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tab toggle */}
        <div className={styles.loginTabs}>
          <button
            className={`${styles.loginTab} ${tab === 'owner' ? styles.loginTabActive : ''}`}
            onClick={() => { setTab('owner'); setLoading(false); }}
          >
            Owner Login
          </button>
          <button
            className={`${styles.loginTab} ${tab === 'staff' ? styles.loginTabActive : ''}`}
            onClick={() => { setTab('staff'); setLoading(false); }}
          >
            Staff Login
          </button>
        </div>

        {tab === 'owner' ? (
          <>
            <button className={styles.btnGoogle} onClick={handleGoogle} disabled={loading}>
              {loading
                ? <div className="spinner spinner-sm" style={{ borderTopColor: '#333' }}/>
                : <GoogleIcon/>
              }
              <span>{loading ? 'Signing in…' : 'Continue with Google'}</span>
            </button>
            <p className={styles.footer}>Owner access · Google authentication</p>
          </>
        ) : (
          <form onSubmit={handleCredentials} className={styles.credForm}>
            <input
              className={styles.credInput}
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            <div className={styles.inputWrap}>
              <input
                className={`${styles.credInput} ${styles.credInputPwd}`}
                type={showPwd ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button type="button" className={styles.eyeBtn} onClick={() => setShowPwd(p => !p)} tabIndex={-1}>
                {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            <button className={styles.btnPrimary} type="submit" disabled={loading || !username.trim() || !password}>
              {loading
                ? <div className="spinner spinner-sm" style={{ borderTopColor: '#0B1829' }}/>
                : null
              }
              <span>{loading ? 'Signing in…' : 'Sign In'}</span>
            </button>
            <p className={styles.footer}>Staff access · Credentials provided by store owner</p>
          </form>
        )}
      </div>
    </div>
  );
}
