import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Users, BarChart2, User, LogOut, ChevronDown, Gem, Menu, X, Home, Shield, UserCog, Sparkles, HelpCircle, Tag, MessageSquare, Megaphone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import styles from './Topbar.module.css';

const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', read_write: 'Read & Write', read_only: 'Read Only' };

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',         icon: Home },
  { id: 'inventory',  label: 'Inventory',          icon: LayoutGrid },
  { id: 'customers',  label: 'Customers',          icon: Users },
  { id: 'analytics',  label: 'Analytics',          icon: BarChart2 },
  { id: 'team',       label: 'Team',               icon: UserCog },
  { id: 'offers',     label: 'Offers',             icon: Tag },
  { id: 'marketing',  label: 'Marketing',          icon: Megaphone, isNew: true },
  { id: 'voice',      label: 'Teach AI Your Style', icon: Sparkles, isNew: true },
  { id: 'faq',        label: 'FAQ',                icon: HelpCircle },
];

const PLAN_COLORS = {
  trial:        { bg: 'rgba(201,168,76,.12)', color: '#8B6914', label: 'Trial' },
  starter:      { bg: 'rgba(21,128,61,.1)',   color: '#15803d', label: 'Starter' },
  professional: { bg: 'rgba(23,48,90,.12)',   color: '#17305A', label: 'Pro' },
  enterprise:   { bg: 'rgba(139,69,20,.12)',  color: '#8B4514', label: 'Enterprise' },
};

export default function Topbar({ activeTab, onTabChange, productCount }) {
  const { user, store, storeUser, logout, userRole } = useAuth();
  const [dropOpen, setDropOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropRef = useRef(null);

  // If logged in as staff, show their name; otherwise show owner name
  const name = storeUser
    ? storeUser.full_name
    : (store?.owner_name || user?.user_metadata?.full_name || user?.email || 'Owner');
  const displayEmail = storeUser ? `@${storeUser.username}` : (user?.email || '');
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
          <img src={store?.logo_url || '/swarnix-logo.png'} alt="" className={styles.brandLogo} />
          <img src={store?.name_style_url || '/swarnix-wordmark.png'} alt={store?.store_name || 'Swarnix'} className={styles.brandWordmark} />
        </div>

        {/* Nav tabs – desktop */}
        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ id, label, icon: Icon, isNew }) => (
            <button
              key={id}
              className={`${styles.navBtn} ${activeTab === id ? styles.navBtnActive : ''} ${isNew ? styles.navBtnNew : ''}`}
              onClick={() => onTabChange(id)}
            >
              <Icon size={14} strokeWidth={2} />
              <span>{label}</span>
              {id === 'inventory' && productCount > 0 && (
                <span className={styles.badge}>{productCount > 99 ? '99+' : productCount}</span>
              )}
              {isNew && <span className={styles.newPill}>New</span>}
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
                    <div className={styles.ddEmail}>{displayEmail}</div>
                    {storeUser ? (
                      <span className={styles.ddPlanBadge} style={{ background: 'rgba(37,99,235,.1)', color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Shield size={9}/> {ROLE_LABELS[storeUser.role] || storeUser.role}
                      </span>
                    ) : (
                      <span className={styles.ddPlanBadge} style={{ background: planCfg.bg, color: planCfg.color }}>{planCfg.label} Plan</span>
                    )}
                  </div>
                </div>
                <div className={styles.ddDivider} />
                <button className={styles.ddItem} onClick={() => { setDropOpen(false); onTabChange('profile'); }}>
                  <User size={14} /> My Profile & Plan
                </button>
                <button className={`${styles.ddItem} ${styles.ddItemReviews}`} onClick={() => { setDropOpen(false); onTabChange('reviews'); }}>
                  <MessageSquare size={14} /> Review Moderation
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
          {NAV_ITEMS.map(({ id, label, icon: Icon, isNew }) => (
            <button
              key={id}
              className={`${styles.mobileNavItem} ${activeTab === id ? styles.mobileNavActive : ''}`}
              onClick={() => { onTabChange(id); setMobileOpen(false); }}
            >
              <Icon size={16} strokeWidth={2} />
              <span>{label}</span>
              {isNew && <span className={styles.newPill}>New</span>}
            </button>
          ))}
          <div className={styles.mobileDivider} />
          <button
            className={`${styles.mobileNavItem} ${activeTab === 'profile' ? styles.mobileNavActive : ''}`}
            onClick={() => { onTabChange('profile'); setMobileOpen(false); }}
          >
            <User size={16} strokeWidth={2} /> My Profile
          </button>
          <button
            className={`${styles.mobileNavItem} ${activeTab === 'reviews' ? styles.mobileNavActive : ''}`}
            onClick={() => { onTabChange('reviews'); setMobileOpen(false); }}
          >
            <MessageSquare size={16} strokeWidth={2} /> Review Moderation
          </button>
          <div className={styles.mobileDivider} />
          <button className={`${styles.mobileNavItem} ${styles.mobileNavDanger}`} onClick={logout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      )}
    </>
  );
}
