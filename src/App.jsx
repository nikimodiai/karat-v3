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
import OffersSection from './components/OffersSection';

function OffersTab() {
  const { user, store } = useAuth();
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px, 4vw, 32px) clamp(16px, 4vw, 24px)', maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', margin: '0 0 6px' }}>Offers</h1>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: 0 }}>
          Post seasonal deals and promotions — upload an image or video, add details, and set a validity date.
        </p>
      </div>
      <OffersSection store={store} user={user} />
    </div>
  );
}

function VoiceTab() {
  const { user, store, refreshStore } = useAuth();
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px, 4vw, 32px) clamp(16px, 4vw, 24px)', maxWidth: 760, margin: '0 auto', width: '100%' }}>
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
        background: '#0A0A0A'
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <img src="/swarnix-logo.png" alt="Swarnix" style={{ width: 90, height: 90, objectFit: 'contain', filter: 'drop-shadow(0 0 20px rgba(200,149,108,.5))' }} />
          <div className="spinner" />
          <div style={{ fontSize: 12, color: 'rgba(200,149,108,.65)', letterSpacing: '.12em', fontFamily: 'DM Sans,sans-serif' }}>
            LOADING SWARNIX
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
        {activeTab === 'offers'     && <OffersTab />}
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
