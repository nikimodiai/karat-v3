import React, { useState, useRef, useCallback } from 'react';
import {
  Mic, ChevronDown, ChevronUp, Smartphone, Apple,
  Upload, Loader, CheckCircle, XCircle, AlertTriangle, Lock, RefreshCw,
} from 'lucide-react';
import { N8N_VOICE_INGEST } from '../lib/config';
import styles from './VoiceStyleSection.module.css';

// ── Phases: idle | uploading | select_author | processing | done | error ──────

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── OS tab (Android / iPhone) ─────────────────────────────────────────────────
function OSTabs({ tab, setTab, children }) {
  return (
    <div className={styles.osTabs}>
      <div className={styles.osTabBar}>
        <button type="button"
          className={`${styles.osTab} ${tab === 'android' ? styles.osTabActive : ''}`}
          onClick={() => setTab('android')}>
          <Smartphone size={13}/> Android
        </button>
        <button type="button"
          className={`${styles.osTab} ${tab === 'ios' ? styles.osTabActive : ''}`}
          onClick={() => setTab('ios')}>
          <Apple size={13}/> iPhone
        </button>
      </div>
      {children}
    </div>
  );
}

// ── Collapsible how-to accordion ──────────────────────────────────────────────
function HowToExport() {
  const [open, setOpen] = useState(false);
  const [osTab, setOsTab] = useState('android');
  return (
    <div className={styles.step} style={{ marginTop: 12 }}>
      <button type="button" className={styles.stepHead} onClick={() => setOpen(v => !v)}>
        <span className={styles.stepNum}>?</span>
        <span className={styles.stepTitle}>How to export a chat from WhatsApp</span>
        {open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
      </button>
      {open && (
        <div className={styles.stepBody}>
          <OSTabs tab={osTab} setTab={setOsTab}>
            {osTab === 'android' && (
              <ol className={styles.instrList}>
                <li>Open <strong>WhatsApp</strong> and go to the customer chat.</li>
                <li>Tap the <strong>⋮</strong> (three dots) at the top right.</li>
                <li>Tap <strong>More → Export chat</strong>.</li>
                <li>Tap <strong>Without Media</strong>.</li>
                <li>Save or share the <strong>.zip file</strong> to your phone/email.</li>
                <li>Upload that .zip file above.</li>
              </ol>
            )}
            {osTab === 'ios' && (
              <ol className={styles.instrList}>
                <li>Open <strong>WhatsApp</strong> and go to the customer chat.</li>
                <li>Tap the <strong>contact name</strong> at the top.</li>
                <li>Scroll down and tap <strong>Export Chat</strong>.</li>
                <li>Tap <strong>Without Media</strong>.</li>
                <li>Save the <strong>.zip file</strong> using Files or email.</li>
                <li>Upload that .zip file above.</li>
              </ol>
            )}
          </OSTabs>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function VoiceStyleSection({ store, user, onProfileUpdated }) {
  const [zipFile,          setZipFile]          = useState(null);
  const [dragOver,         setDragOver]          = useState(false);
  const [detectedAuthors,  setDetectedAuthors]   = useState([]);
  const [selectedAuthor,   setSelectedAuthor]    = useState('');
  const [chatFileName,     setChatFileName]      = useState('');
  const [phase,            setPhase]             = useState('idle');
  // idle | uploading | select_author | processing | done | error
  const [errorMsg,         setErrorMsg]          = useState('');
  const [exchangesLearned, setExchangesLearned]  = useState(null);

  const fileInputRef = useRef(null);
  const hasProfile = !!(store?.voice_profile || store?.voice_examples);

  // ── shared webhook call ───────────────────────────────────────────────────
  const callWebhook = useCallback(async (file, authorName = '') => {
    const fd = new FormData();
    fd.append('owner_id',   user.id);
    fd.append('store_name', store?.store_name || '');
    fd.append('file',       file, file.name);
    if (authorName) fd.append('store_author_name', authorName);

    const res  = await fetch(N8N_VOICE_INGEST, { method: 'POST', body: fd, credentials: 'omit', mode: 'cors' });
    const raw  = await res.text();
    if (!raw?.trim()) throw new Error('No response from server.');
    const parsed = JSON.parse(raw);
    // n8n wraps in an array
    return Array.isArray(parsed) ? parsed[0] : parsed;
  }, [user, store]);

  // ── CALL 1: upload ZIP without author name ────────────────────────────────
  const handleUpload = useCallback(async (file) => {
    if (!file) return;
    setZipFile(file);
    setPhase('uploading');
    setErrorMsg('');
    setDetectedAuthors([]);
    setSelectedAuthor('');
    setExchangesLearned(null);

    try {
      const data = await callWebhook(file);

      if (data.needsAuthorSelection || data.status === 'select_author') {
        setDetectedAuthors(data.detectedAuthors || data.detected_authors || []);
        setChatFileName(data.chatFileName || file.name);
        setSelectedAuthor((data.detectedAuthors || data.detected_authors || [])[0] || '');
        setPhase('select_author');
        return;
      }

      if (data.success) {
        setExchangesLearned(data.exchanges_learned ?? data.totalExchanges ?? null);
        setPhase('done');
        onProfileUpdated?.();
      } else {
        setErrorMsg(data.error || data.message || 'Something went wrong. Please try again.');
        setPhase('error');
      }
    } catch (e) {
      setErrorMsg(e.message || 'Could not reach the server. Check your connection and try again.');
      setPhase('error');
    }
  }, [callWebhook, onProfileUpdated]);

  // ── CALL 2: re-POST same ZIP with chosen author ───────────────────────────
  const handleAuthorConfirm = useCallback(async () => {
    if (!zipFile || !selectedAuthor) return;
    setPhase('processing');
    setErrorMsg('');

    try {
      const data = await callWebhook(zipFile, selectedAuthor);

      if (data.success) {
        setExchangesLearned(data.exchanges_learned ?? data.totalExchanges ?? null);
        setPhase('done');
        onProfileUpdated?.();
      } else if (data.needsAuthorSelection || data.status === 'select_author') {
        setDetectedAuthors(data.detectedAuthors || data.detected_authors || detectedAuthors);
        setErrorMsg(data.message || 'Please select the correct name.');
        setPhase('select_author');
      } else {
        setErrorMsg(data.error || data.message || 'Something went wrong. Please try again.');
        setPhase('error');
      }
    } catch (e) {
      setErrorMsg(e.message || 'Could not reach the server.');
      setPhase('error');
    }
  }, [zipFile, selectedAuthor, callWebhook, onProfileUpdated, detectedAuthors]);

  // ── file input handlers ───────────────────────────────────────────────────
  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.zip')) handleUpload(file);
    else { setErrorMsg('Please drop a .zip file exported from WhatsApp.'); setPhase('error'); }
  }, [handleUpload]);

  const reset = () => {
    setPhase('idle'); setZipFile(null); setErrorMsg('');
    setDetectedAuthors([]); setSelectedAuthor(''); setExchangesLearned(null);
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.section}>
      {/* Section header */}
      <div className={styles.sectionHead}>
        <div className={styles.sectionIcon}><Mic size={18} color="#C9A84C"/></div>
        <div>
          <div className={styles.sectionTitle}>Teach the AI Your Style</div>
          <div className={styles.sectionSub}>
            Upload a customer chat and the AI will learn to reply in your language, your tone, your style.
          </div>
        </div>
      </div>

      {/* Benefit card */}
      <div className={styles.benefitCard}>
        <div className={styles.benefitTitle}>Why do this?</div>
        <p className={styles.benefitText}>
          Right now your AI replies in a standard polished tone. Once you upload a few past customer
          chats, it will learn your style — your language, your warmth, your phrases, your emojis.
          Customers won't feel like they're talking to a bot. They'll feel like they're talking to you.
        </p>
      </div>

      {/* Current profile widget */}
      {hasProfile && (
        <div className={styles.currentProfile}>
          <div className={styles.cpHeader}>
            <CheckCircle size={14} color="#16a34a"/>
            <span className={styles.cpTitle}>Your current style profile</span>
          </div>
          <div className={styles.cpMeta}>
            Last updated: <strong>{fmtDate(store.voice_updated_at)}</strong>
          </div>
          {store.voice_profile && (
            <div className={styles.cpSnippet}>{String(store.voice_profile)}</div>
          )}
          <div className={styles.cpHint}>
            <RefreshCw size={11}/> Upload more chats below to keep improving it.
          </div>
        </div>
      )}

      {/* ── PHASE: idle / done / error — show upload zone ── */}
      {(phase === 'idle' || phase === 'done' || phase === 'error') && (
        <>
          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropActive : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={22} strokeWidth={1.5} color="rgba(201,168,76,.5)"/>
            <span className={styles.dropLabel}>
              <span className={styles.browse}>📎 Drop your WhatsApp chat ZIP here</span>
            </span>
            <span className={styles.fileNames}>or click to browse · only .zip files from Export Chat</span>
          </div>
          <input ref={fileInputRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={onFileChange}/>

          <HowToExport />

          {phase === 'done' && (
            <div className={`${styles.resultCard} ${styles.resultSuccess}`} style={{ marginTop: 14 }}>
              <div className={styles.resultHead}>
                <CheckCircle size={16} color="#16a34a"/>
                <strong>Style updated successfully!</strong>
              </div>
              {exchangesLearned != null && (
                <p>Your AI learned from <strong>{exchangesLearned}</strong> conversation{exchangesLearned !== 1 ? 's' : ''} in this chat.</p>
              )}
              <p>It will now reply in your language, your tone, and your style.</p>
              <button onClick={reset} style={{ background: 'none', border: 'none', color: '#15803d', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0, textAlign: 'left' }}>
                Upload another chat
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div className={`${styles.resultCard} ${styles.resultError}`} style={{ marginTop: 14 }}>
              <div className={styles.resultHead}>
                <XCircle size={16} color="#dc2626"/>
                <strong>Upload failed</strong>
              </div>
              <p>{errorMsg}</p>
              <button onClick={reset} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0, textAlign: 'left' }}>
                Try again
              </button>
            </div>
          )}
        </>
      )}

      {/* ── PHASE: uploading ── */}
      {phase === 'uploading' && (
        <div className={`${styles.resultCard} ${styles.resultWarn}`} style={{ marginTop: 14 }}>
          <div className={styles.resultHead}>
            <Loader size={15} className={styles.spin} color="#d97706"/>
            <strong>Reading your chat file…</strong>
          </div>
          <p>This usually takes a few seconds.</p>
        </div>
      )}

      {/* ── PHASE: select_author — radio list ── */}
      {phase === 'select_author' && (
        <div className={`${styles.resultCard} ${styles.resultWarn}`} style={{ marginTop: 14 }}>
          <div className={styles.resultHead}>
            <AlertTriangle size={16} color="#d97706"/>
            <strong>Who is your shop in this chat?</strong>
          </div>
          <p>
            We found <strong>{detectedAuthors.length} participants</strong> in <em>{chatFileName}</em>.
            Select your shop's name so the AI learns the right voice.
          </p>

          <div className={styles.authorPicker}>
            {detectedAuthors.map(name => (
              <label key={name} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '10px 14px', borderRadius: 8,
                border: `1.5px solid ${selectedAuthor === name ? '#C9A84C' : 'rgba(13,27,42,.15)'}`,
                background: selectedAuthor === name ? 'rgba(201,168,76,.1)' : '#fff',
                fontSize: 13, fontWeight: selectedAuthor === name ? 600 : 400,
                color: selectedAuthor === name ? '#8B6914' : 'var(--navy)',
                transition: 'all .15s',
              }}>
                <input
                  type="radio"
                  name="author"
                  value={name}
                  checked={selectedAuthor === name}
                  onChange={() => setSelectedAuthor(name)}
                  style={{ accentColor: '#C9A84C' }}
                />
                {name}
              </label>
            ))}
          </div>

          {errorMsg && (
            <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0' }}>⚠ {errorMsg}</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              className={styles.uploadBtn}
              style={{ flex: 1 }}
              onClick={handleAuthorConfirm}
              disabled={!selectedAuthor}
            >
              <CheckCircle size={14}/> This is my shop — continue
            </button>
            <button
              onClick={reset}
              style={{
                border: '1px solid rgba(13,27,42,.18)', borderRadius: 8,
                background: 'none', color: 'rgba(13,27,42,.5)',
                fontSize: 13, padding: '0 16px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── PHASE: processing (second call in flight) ── */}
      {phase === 'processing' && (
        <div className={`${styles.resultCard} ${styles.resultWarn}`} style={{ marginTop: 14 }}>
          <div className={styles.resultHead}>
            <Loader size={15} className={styles.spin} color="#d97706"/>
            <strong>Building your voice profile…</strong>
          </div>
          <p>This usually takes 20–40 seconds. Please don't close this page.</p>
        </div>
      )}

      {/* Privacy note */}
      <div className={styles.privacy}>
        <Lock size={11}/>
        Your customers' privacy is protected. Customer names and numbers are removed before
        any processing. The raw chat file is never stored on our servers.
      </div>
    </div>
  );
}
