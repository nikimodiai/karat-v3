import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Users, BarChart2, User, LogOut, ChevronDown, Gem, Menu, X, Home } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import styles from './Topbar.module.css';

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',  icon: Home },
  { id: 'inventory',  label: 'Inventory',  icon: LayoutGrid },
  { id: 'customers',  label: 'Customers',  icon: Users },
  { id: 'analytics',  label: 'Analytics',  icon: BarChart2 },
  { id: 'profile',    label: 'My Profile', icon: User },
];

const PLAN_COLORS = {
  trial:        { bg: 'rgba(201,168,76,.12)', color: '#8B6914', label: 'Trial' },
  starter:      { bg: 'rgba(21,128,61,.1)',   color: '#15803d', label: 'Starter' },
  professional: { bg: 'rgba(23,48,90,.12)',   color: '#17305A', label: 'Pro' },
  enterprise:   { bg: 'rgba(139,69,20,.12)',  color: '#8B4514', label: 'Enterprise' },
};

export default function Topbar({ activeTab, onTabChange, productCount }) {
  const { user, store, logout } = useAuth();
  const [dropOpen, setDropOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropRef = useRef(null);

  const name = store?.owner_name || user?.user_metadata?.full_name || user?.email || 'Owner';
  const initial = name[0]?.toUpperCase() || '?';
  const planKey = (store?.plan_name || 'trial').toLowerCase();
  const planCfg = PLAN_COLORS[planKey] || PLAN_COLORS.trial;

  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <>
      <header className={styles.topbar}>
        {/* Brand */}
        <div className={styles.brand}>
          <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
            <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" fill="none" stroke="#C9A84C" strokeWidth="1.5"/>
            <polygon points="16,8 24,13 24,19 16,24 8,19 8,13" fill="none" stroke="rgba(201,168,76,0.35)" strokeWidth="1"/>
            <circle cx="16" cy="16" r="3.5" fill="#C9A84C"/>
          </svg>
          <span className={styles.brandName}>KARAT</span>
        </div>

        {/* Nav tabs – desktop */}
        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`${styles.navBtn} ${activeTab === id ? styles.navBtnActive : ''}`}
              onClick={() => onTabChange(id)}
            >
              <Icon size={14} strokeWidth={2} />
              <span>{label}</span>
              {id === 'inventory' && productCount > 0 && (
                <span className={styles.badge}>{productCount > 99 ? '99+' : productCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Right */}
        <div className={styles.right}>
          <div className={styles.planBadge} style={{ background: planCfg.bg, color: planCfg.color }}>
            <Gem size={10} fill={planCfg.color} color={planCfg.color} />
            <span>{planCfg.label}</span>
          </div>

          <div className={styles.pillWrap} ref={dropRef}>
            <button className={styles.pill} onClick={() => setDropOpen(p => !p)}>
              <div className={styles.avatar}>{initial}</div>
              <span className={styles.pillName}>{name.split(' ')[0]}</span>
              <ChevronDown size={12} strokeWidth={2} style={{ opacity: .55, transition: 'transform .2s', transform: dropOpen ? 'rotate(180deg)' : 'none' }} />
            </button>

            {dropOpen && (
              <div className={styles.dropdown}>
                <div className={styles.ddHeader}>
                  <div className={styles.ddAvatar}>{initial}</div>
                  <div>
                    <div className={styles.ddName}>{name}</div>
                    <div className={styles.ddEmail}>{user?.email || ''}</div>
                    <span className={styles.ddPlanBadge} style={{ background: planCfg.bg, color: planCfg.color }}>{planCfg.label} Plan</span>
                  </div>
                </div>
                <div className={styles.ddDivider} />
                <button className={styles.ddItem} onClick={() => { setDropOpen(false); onTabChange('profile'); }}>
                  <User size={14} /> My Profile & Plan
                </button>
                <div className={styles.ddDivider} />
                <button className={`${styles.ddItem} ${styles.ddItemDanger}`} onClick={logout}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button className={styles.mobileMenu} onClick={() => setMobileOpen(p => !p)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className={styles.mobileDrawer}>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`${styles.mobileNavItem} ${activeTab === id ? styles.mobileNavActive : ''}`}
              onClick={() => { onTabChange(id); setMobileOpen(false); }}
            >
              <Icon size={16} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
          <div className={styles.mobileDivider} />
          <button className={`${styles.mobileNavItem} ${styles.mobileNavDanger}`} onClick={logout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      )}
    </>
  );
}
