import React, { useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { StoreDataProvider, useStoreData } from './hooks/useStoreData';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Analytics from './pages/Analytics';
import Profile from './pages/Profile';
import TeamPage from './pages/TeamPage';
import FAQ from './pages/FAQ';
import Topbar from './components/Topbar';
import Footer from './components/Footer';
import VoiceStyleSection from './components/VoiceStyleSection';

function VoiceTab() {
  const { user, store, refreshStore } = useAuth();
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Teach AI Your Style</h1>
          <span style={{
            background: 'linear-gradient(135deg, #C9A84C, #e8b84b)',
            color: '#0B1829',
            fontSize: 10,
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 99,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
          }}>New</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: 0 }}>
          Upload voice samples so AI responds exactly the way you would — in your tone, your words, your style.
        </p>
      </div>
      <VoiceStyleSection store={store} user={user} onProfileUpdated={refreshStore} />
    </div>
  );
}

function AppShell() {
  const { authStatus } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (authStatus === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse 100% 70% at 50% 30%, #17305A 0%, #0B1829 45%, #060C14 100%)'
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <svg viewBox="0 0 60 60" fill="none" width="56" height="56" style={{ filter: 'drop-shadow(0 0 16px rgba(201,168,76,.4))' }}>
            <polygon points="30,4 56,20 56,40 30,56 4,40 4,20" fill="none" stroke="#C9A84C" strokeWidth="1.5"/>
            <polygon points="30,14 46,23 46,37 30,46 14,37 14,23" fill="none" stroke="rgba(201,168,76,0.35)" strokeWidth="1"/>
            <circle cx="30" cy="30" r="6" fill="#C9A84C"/>
          </svg>
          <div className="spinner" />
          <div style={{ fontSize: 12, color: 'rgba(201,168,76,.55)', letterSpacing: '.1em', fontFamily: 'DM Sans,sans-serif' }}>
            LOADING KARAT
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === 'login')   return <Login />;
  if (authStatus === 'pending') return <Pending />;

  return (
    <StoreDataProvider>
      <Shell activeTab={activeTab} setActiveTab={setActiveTab} />
    </StoreDataProvider>
  );
}

// Inner component so we can read product count from useStoreData
function Shell({ activeTab, setActiveTab }) {
  const { products } = useStoreData();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--cream)' }}>
      <Topbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        productCount={products.length}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {activeTab === 'dashboard'  && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === 'inventory'  && <Inventory />}
        {activeTab === 'customers'  && <Customers />}
        {activeTab === 'analytics'  && <Analytics />}
        {activeTab === 'team'       && <TeamPage />}
        {activeTab === 'voice'      && <VoiceTab />}
        {activeTab === 'faq'        && <FAQ />}
        {activeTab === 'profile'    && <Profile />}
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  );
}
