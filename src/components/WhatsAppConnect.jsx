import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, CheckCircle, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { db, FB_APP_ID } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import styles from './WhatsAppConnect.module.css';

// Facebook Graph API version pinned — bump when Meta deprecates this version.
const FB_API_VERSION = 'v21.0';

// Loads the Facebook JS SDK once. Calling it multiple times is safe.
function loadFBSdk() {
  if (window.FB) return Promise.resolve();
  return new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB.init({
        appId: FB_APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: FB_API_VERSION,
      });
      resolve();
    };
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  });
}

// Exchange a short-lived code for an access token via Graph API.
// We call this client-side with the app secret — only safe because this is a
// client-side app where the app secret is NOT embedded (it's a server-side
// exchange that should ideally happen in n8n/backend). For now we call the
// token endpoint with client_id + client_secret from env, but we expose only
// the code-exchange result and store only the token. Owners should later rotate
// to a System User token generated server-side.
async function exchangeCodeForToken(code, redirectUri) {
  // The token exchange must be done server-to-server to keep app_secret safe.
  // We route it through a lightweight n8n webhook that holds the secret.
  // Endpoint: POST /whatsapp-token-exchange with { code, redirect_uri }
  // Returns: { access_token, token_type }
  const N8N_BASE = import.meta.env.VITE_N8N_BASE || 'https://n8n.srv1639765.hstgr.cloud/webhook';
  const res = await fetch(`${N8N_BASE}/whatsapp-token-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error('Token exchange failed — check n8n webhook');
  return res.json(); // { access_token }
}

// After getting access_token, fetch the WABA and phone number details.
async function fetchWabaDetails(accessToken) {
  // Step 1: get the connected WhatsApp Business Accounts
  const wabaRes = await fetch(
    `https://graph.facebook.com/${FB_API_VERSION}/me/businesses?fields=whatsapp_business_accounts{id,name,phone_numbers{display_phone_number,id}}&access_token=${accessToken}`
  );
  const wabaData = await wabaRes.json();
  if (wabaData.error) throw new Error(wabaData.error.message);

  // Navigate the nested response: me → businesses → whatsapp_business_accounts
  const businesses = wabaData.data || [];
  for (const biz of businesses) {
    const wabas = biz.whatsapp_business_accounts?.data || [];
    for (const waba of wabas) {
      const phones = waba.phone_numbers?.data || [];
      if (phones.length > 0) {
        return {
          waba_id: waba.id,
          whatsapp_phone: phones[0].display_phone_number,
          whatsapp_phone_number_id: phones[0].id,
        };
      }
    }
  }

  // Fallback: try the shared_waba_details endpoint (for BSP/tech-provider flows)
  const sharedRes = await fetch(
    `https://graph.facebook.com/${FB_API_VERSION}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
  );
  const sharedData = await sharedRes.json();
  if (sharedData.error) throw new Error('Could not retrieve WABA details. ' + sharedData.error.message);

  throw new Error('No WhatsApp Business Account found on this Facebook account. Please make sure you have a WABA set up.');
}

export default function WhatsAppConnect({ store, onConnected }) {
  const { user, updateStore } = useAuth();
  const { showToast } = useToast();
  const [phase, setPhase] = useState('idle'); // idle | sdk_loading | connecting | exchanging | saving | done | error
  const [errorMsg, setErrorMsg] = useState('');

  const isConnected = !!(store?.whatsapp_phone_number_id && store?.waba_id);

  const handleMessage = useCallback(async (event) => {
    // Facebook sends the auth code via postMessage from the popup
    if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;

    let data;
    try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }

    // Embedded Signup sends { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { code } }
    if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;

    if (data.event === 'CANCEL') {
      setPhase('idle');
      return;
    }

    if (data.event === 'ERROR') {
      setPhase('error');
      setErrorMsg(data.data?.error_message || 'Facebook signup error');
      return;
    }

    if (data.event === 'FINISH') {
      const code = data.data?.code;
      if (!code) { setPhase('error'); setErrorMsg('No code received from Facebook'); return; }

      setPhase('exchanging');
      try {
        const redirectUri = window.location.origin + '/whatsapp-oauth-callback';
        const { access_token } = await exchangeCodeForToken(code, redirectUri);
        setPhase('connecting');

        const details = await fetchWabaDetails(access_token);

        setPhase('saving');
        const updates = {
          wa_access_token: access_token,
          waba_id: details.waba_id,
          whatsapp_phone: details.whatsapp_phone,
          whatsapp_phone_number_id: details.whatsapp_phone_number_id,
        };

        const { error } = await db
          .from('stores')
          .update(updates)
          .eq('owner_id', user.id);

        if (error) throw error;

        updateStore(updates);
        setPhase('done');
        showToast('WhatsApp Business connected!', '#166534');
        if (onConnected) onConnected(updates);
      } catch (err) {
        setPhase('error');
        setErrorMsg(err.message);
      }
    }
  }, [user, updateStore, showToast, onConnected]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const handleConnect = async () => {
    if (!FB_APP_ID) {
      setPhase('error');
      setErrorMsg('VITE_FB_APP_ID is not configured. Add it to your .env.local file.');
      return;
    }

    setPhase('sdk_loading');
    setErrorMsg('');
    try {
      await loadFBSdk();
      setPhase('connecting');

      // Launch Facebook Embedded Signup dialog
      window.FB.login(
        (response) => {
          if (response.status !== 'connected') {
            setPhase('idle');
          }
          // Actual token/code arrives via postMessage (handleMessage above)
        },
        {
          config_id: '', // Leave blank — FB uses the app's Embedded Signup config
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: '',
            sessionInfoVersion: '2',
          },
        }
      );
    } catch (err) {
      setPhase('error');
      setErrorMsg(err.message);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp Business? Your chatbot will stop working until you reconnect.')) return;
    try {
      const updates = { wa_access_token: null, waba_id: null, whatsapp_phone: null, whatsapp_phone_number_id: null };
      const { error } = await db.from('stores').update(updates).eq('owner_id', user.id);
      if (error) throw error;
      updateStore(updates);
      setPhase('idle');
      showToast('WhatsApp disconnected', '#8B6914');
    } catch (err) {
      showToast('Error: ' + err.message, '#C0392B');
    }
  };

  const busy = ['sdk_loading', 'connecting', 'exchanging', 'saving'].includes(phase);

  const phaseLabel = {
    sdk_loading: 'Loading Facebook SDK…',
    connecting:  'Opening Facebook login…',
    exchanging:  'Exchanging auth code…',
    saving:      'Saving credentials…',
  }[phase];

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.iconWrap}>
          <MessageSquare size={18} color="#25D366" strokeWidth={2} />
        </div>
        <div>
          <div className={styles.title}>WhatsApp Business</div>
          <div className={styles.sub}>Connect your store's official WhatsApp number to enable the AI chatbot</div>
        </div>
        {isConnected && (
          <span className={styles.connectedBadge}>
            <CheckCircle size={12} /> Connected
          </span>
        )}
      </div>

      {isConnected && (
        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Phone Number</span>
            <span className={styles.detailVal}>{store.whatsapp_phone || '—'}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Phone Number ID</span>
            <span className={`${styles.detailVal} ${styles.mono}`}>{store.whatsapp_phone_number_id}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>WABA ID</span>
            <span className={`${styles.detailVal} ${styles.mono}`}>{store.waba_id}</span>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className={styles.errorBox}>
          <AlertCircle size={14} />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className={styles.actions}>
        {!isConnected ? (
          <>
            <button className={styles.connectBtn} disabled>
              <ExternalLink size={14} /> Connect Business WhatsApp
            </button>
            <span className={styles.disabledNote}>Contact admin to set up WhatsApp Business</span>
          </>
        ) : (
          <button className={styles.reconnectBtn} onClick={handleConnect} disabled={busy}>
            {busy ? (
              <><div className="spinner spinner-sm" /> {phaseLabel}</>
            ) : (
              <><RefreshCw size={13} /> Reconnect / Change Number</>
            )}
          </button>
        )}
        {isConnected && (
          <button className={styles.disconnectBtn} onClick={handleDisconnect} disabled={busy}>
            Disconnect
          </button>
        )}
      </div>

      <p className={styles.footnote}>
        Clicking "Connect" opens a secure Facebook login window. You'll authorise Swarnix to send messages on behalf of your WhatsApp Business Account. No passwords are stored — only your WABA access token.
      </p>
    </div>
  );
}
