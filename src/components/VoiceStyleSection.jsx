import React, { useRef, useState } from 'react';
import {
  Mic, ChevronDown, ChevronUp, Smartphone, Apple,
  Upload, Loader, CheckCircle, XCircle, AlertTriangle, Lock, RefreshCw,
} from 'lucide-react';
import { N8N_VOICE_INGEST } from '../lib/config';
import styles from './VoiceStyleSection.module.css';

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Accordion step ──────────────────────────────────────────────────
function Step({ num, title, icon: Icon, open, onToggle, children }) {
  return (
    <div className={`${styles.step} ${open ? styles.stepOpen : ''}`}>
      <button type="button" className={styles.stepHead} onClick={onToggle}>
        <span className={styles.stepNum}>{num}</span>
        <span className={styles.stepTitle}>{title}</span>
        {open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
      </button>
      {open && <div className={styles.stepBody}>{children}</div>}
    </div>
  );
}

// ── OS tab (Android / iPhone) ───────────────────────────────────────
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

// ── Main export ─────────────────────────────────────────────────────
export default function VoiceStyleSection({ store, user, onProfileUpdated }) {
  const [openStep,  setOpenStep]  = useState(null);
  const [osTab,     setOsTab]     = useState('android');
  const [files,     setFiles]     = useState([]);
  const [dragOver,  setDragOver]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results,   setResults]   = useState([]); // one result per file
  // For "wrong author" error recovery
  const [authorChoices, setAuthorChoices] = useState(null); // { file, authors[] }
  const [chosenAuthor,  setChosenAuthor]  = useState('');
  const fileRef = useRef(null);

  const hasProfile = !!(store?.voice_profile || store?.voice_examples);

  const toggleStep = (n) => setOpenStep(s => s === n ? null : n);

  const handleFiles = (newFiles) => {
    const valid = Array.from(newFiles).filter(f => f.name.toLowerCase().endsWith('.zip'));
    const invalid = Array.from(newFiles).filter(f => !f.name.toLowerCase().endsWith('.zip'));
    setFiles(valid);
    if (invalid.length) {
      setResults([{
        status: 'bad_format',
        fileName: invalid.map(f => f.name).join(', '),
      }]);
    } else {
      setResults([]);
    }
    setAuthorChoices(null);
  };

  const uploadFiles = async (storeAuthorName = null) => {
    if (!files.length) return;
    setUploading(true);
    setResults([]);
    setAuthorChoices(null);

    const newResults = [];
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append('file',     file);
        fd.append('owner_id', user.id);
        // n8n field name is store_author_name
        if (storeAuthorName) fd.append('store_author_name', storeAuthorName);

        const res = await fetch(N8N_VOICE_INGEST, {
          method: 'POST', body: fd, credentials: 'omit', mode: 'cors',
        });
        const raw = await res.text();
        if (!raw?.trim()) {
          newResults.push({ status: 'error', fileName: file.name, message: 'No response from server.' });
          continue;
        }
        let data;
        try { data = JSON.parse(raw); }
        catch { newResults.push({ status: 'error', fileName: file.name, message: `Unexpected response: ${raw.slice(0, 200)}` }); continue; }

        const r = normaliseResult(file.name, data);
        // Show author picker immediately when multiple participants detected
        if (r.status === 'wrong_author' && r.authors.length > 0) {
          setAuthorChoices({ file, authors: r.authors });
        }
        newResults.push(r);
      } catch (e) {
        newResults.push({ status: 'error', fileName: file.name, message: e.message || 'Upload failed' });
      }
    }

    setResults(newResults);
    setUploading(false);

    if (newResults.some(r => r.status === 'success' || r.status === 'partial')) {
      onProfileUpdated?.();
    }
  };

  const retryWithAuthor = () => {
    if (!chosenAuthor || !authorChoices) return;
    uploadFiles(chosenAuthor);
  };

  return (
    <div className={styles.section}>
      {/* ── Section header ── */}
      <div className={styles.sectionHead}>
        <div className={styles.sectionIcon}><Mic size={18} color="#C9A84C"/></div>
        <div>
          <div className={styles.sectionTitle}>Teach the AI Your Style</div>
          <div className={styles.sectionSub}>
            Your AI assistant will start replying exactly the way you and your staff talk to customers.
          </div>
        </div>
      </div>

      {/* ── Benefit card ── */}
      <div className={styles.benefitCard}>
        <div className={styles.benefitTitle}>Why do this?</div>
        <p className={styles.benefitText}>
          Right now, your AI replies in a standard polished tone. Once you upload a few past customer
          chats, it will learn your style — your language, your warmth, your phrases, your emojis.
          Customers won't feel like they're talking to a bot. They'll feel like they're talking to you.
        </p>
      </div>

      {/* ── Current style widget ── */}
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
            <div className={styles.cpSnippet}>
              "{String(store.voice_profile).slice(0, 120)}…"
            </div>
          )}
          <div className={styles.cpHint}>
            <RefreshCw size={11}/> Upload more chats below to keep improving it.
          </div>
        </div>
      )}

      {/* ── Steps (accordion) ── */}
      <div className={styles.steps}>
        <Step num={1} title="Pick 5–10 good customer chats"
          open={openStep === 1} onToggle={() => toggleStep(1)}>
          <p>
            Choose chats where you or your staff had a proper back-and-forth with a customer —
            they asked about jewellery, you showed options, discussed price, suggested something.
            Avoid one-line chats or chats that are mostly images.
          </p>
          <div className={styles.tip}>
            💡 <strong>Tip:</strong> Chats about bangles, necklaces, wedding sets, or gift purchases
            work best. The more variety, the better the AI learns.
          </div>
        </Step>

        <Step num={2} title="Export the chat from WhatsApp"
          open={openStep === 2} onToggle={() => toggleStep(2)}>
          <OSTabs tab={osTab} setTab={setOsTab}>
            {osTab === 'android' && (
              <ol className={styles.instrList}>
                <li>Open <strong>WhatsApp</strong> on your phone.</li>
                <li>Open one of the customer chats you selected.</li>
                <li>Tap the <strong>⋮</strong> (three dots) at the top right corner.</li>
                <li>Tap <strong>More</strong>.</li>
                <li>Tap <strong>Export chat</strong>.</li>
                <li>Tap <strong>Without Media</strong> — this keeps the file small.</li>
                <li>WhatsApp creates a <code>.zip</code> file — save it or email it to yourself.</li>
                <li>Repeat for each chat you want to upload.</li>
              </ol>
            )}
            {osTab === 'ios' && (
              <ol className={styles.instrList}>
                <li>Open <strong>WhatsApp</strong> on your phone.</li>
                <li>Open one of the customer chats you selected.</li>
                <li>Tap the <strong>customer's name</strong> at the very top of the screen.</li>
                <li>Scroll down and tap <strong>Export Chat</strong>.</li>
                <li>Tap <strong>Without Media</strong>.</li>
                <li>Save using AirDrop, Files, or email it to yourself.</li>
                <li>Repeat for each chat you want to upload.</li>
              </ol>
            )}
          </OSTabs>
        </Step>

        <Step num={3} title="Upload the files here"
          open={openStep === 3} onToggle={() => toggleStep(3)}>
          <p>Upload one or more of those <code>.zip</code> files below.
            You can select multiple files at once.</p>
          <p className={styles.smallNote}>
            Only <code>.zip</code> files from WhatsApp "Export Chat" are accepted.
          </p>
        </Step>

        <Step num={4} title="That's it!"
          open={openStep === 4} onToggle={() => toggleStep(4)}>
          <p>
            Once uploaded, your AI assistant will study how you write and update its style
            automatically. This usually takes under a minute.
          </p>
          <p>You can upload more chats anytime to keep improving it.</p>
        </Step>
      </div>

      {/* ── Upload zone ── */}
      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropActive : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={22} strokeWidth={1.5} color="rgba(201,168,76,.5)"/>
        <span className={styles.dropLabel}>
          {files.length > 0
            ? `${files.length} file${files.length > 1 ? 's' : ''} selected — click to change`
            : <><span className={styles.browse}>📎 Choose WhatsApp Chat Files (.zip)</span></>
          }
        </span>
        {files.length > 0 && (
          <span className={styles.fileNames}>
            {files.map(f => f.name).join(', ')}
          </span>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".zip" multiple style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}/>

      <p className={styles.uploadHint}>
        You can upload multiple chats together. Each file will be processed separately.
      </p>

      <button
        className={styles.uploadBtn}
        onClick={() => uploadFiles()}
        disabled={!files.length || uploading}
      >
        {uploading
          ? <><Loader size={14} className={styles.spin}/> Reading your chats and learning your style…</>
          : <><Mic size={14}/> Upload &amp; Train AI</>
        }
      </button>

      {/* ── Status results ── */}
      {results.length > 0 && (
        <div className={styles.results}>
          {results.map((r, i) => <ResultCard key={i} result={r}
            authorChoices={authorChoices} chosenAuthor={chosenAuthor}
            setChosenAuthor={setChosenAuthor} onRetry={retryWithAuthor}/>)}
        </div>
      )}

      {/* ── Privacy note ── */}
      <div className={styles.privacy}>
        <Lock size={11}/> Your customers' privacy is protected.
        We extract only your writing style — customer names and phone numbers are
        removed before any processing. The raw chat file is never stored on our servers.
      </div>
    </div>
  );
}

// ── Normalise n8n response → internal result shape ─────────────────
function normaliseResult(fileName, data) {
  const status = data.status || data.result;

  if (status === 'success' || data.voice_profile) {
    return {
      status: 'success',
      fileName,
      convoCount:      data.conversation_count || data.convo_count || null,
      detectedAuthor:  data.detected_author    || data.shop_name   || null,
      authorConfirmed: data.author_confirmed   ?? true,
    };
  }
  if (status === 'partial' || data.warning) {
    return { status: 'partial', fileName, message: data.warning || data.message };
  }
  // Catch "multiple participants" — n8n returns detectedAuthors in the body
  const authors = data.detected_authors || data.detectedAuthors || data.authors || [];
  if (
    status === 'wrong_author' ||
    data.error === 'no_shop_messages' ||
    (authors.length > 0 && data.success === false)
  ) {
    return { status: 'wrong_author', fileName, authors };
  }
  if (data.error === 'not_zip' || status === 'bad_format') {
    return { status: 'bad_format', fileName };
  }
  if (data.error === 'no_txt') {
    return { status: 'no_txt', fileName };
  }
  if (data.error === 'group_chat') {
    return { status: 'group_chat', fileName };
  }
  return { status: 'error', fileName, message: data.error || data.message || 'Unknown error' };
}

// ── Individual result card ──────────────────────────────────────────
function ResultCard({ result: r, authorChoices, chosenAuthor, setChosenAuthor, onRetry }) {
  if (r.status === 'success') {
    return (
      <div className={`${styles.resultCard} ${styles.resultSuccess}`}>
        <div className={styles.resultHead}>
          <CheckCircle size={16} color="#16a34a"/>
          <strong>Style updated successfully!</strong>
        </div>
        {r.convoCount != null && (
          <p>Your AI learned from <strong>{r.convoCount}</strong> customer conversation{r.convoCount !== 1 ? 's' : ''} in this chat.</p>
        )}
        <p>It will now reply in your language, your tone, and your style.</p>
        {r.detectedAuthor && !r.authorConfirmed && (
          <p className={styles.resultNote}>
            We detected that "<strong>{r.detectedAuthor}</strong>" is your shop's name in this chat.
            If this is wrong, re-upload and specify the correct name below.
          </p>
        )}
        <p className={styles.resultNote}>Want to improve it further? Upload more chats anytime.</p>
      </div>
    );
  }

  if (r.status === 'partial') {
    return (
      <div className={`${styles.resultCard} ${styles.resultWarn}`}>
        <div className={styles.resultHead}>
          <CheckCircle size={16} color="#d97706"/>
          <strong>Style saved (with a small note)</strong>
        </div>
        <p>We saved your style profile, though the AI had some difficulty reading this chat's
          format. Uploading a few more chats will give it more to learn from.</p>
        {r.message && <p className={styles.resultNote}>{r.message}</p>}
      </div>
    );
  }

  if (r.status === 'wrong_author') {
    const authors = r.authors || authorChoices?.authors || [];
    return (
      <div className={`${styles.resultCard} ${styles.resultWarn}`}>
        <div className={styles.resultHead}>
          <AlertTriangle size={16} color="#d97706"/>
          <strong>Who is your shop in this chat?</strong>
        </div>
        <p>We found <strong>{authors.length}</strong> participants in this chat. Select which name is your shop so the AI can learn from your replies.</p>
        {authors.length > 0 && (
          <div className={styles.authorPicker}>
            <div className={styles.authorRow}>
              {authors.map(a => (
                <button
                  key={a}
                  type="button"
                  className={`${styles.authorChip} ${chosenAuthor === a ? styles.authorChipActive : ''}`}
                  onClick={() => setChosenAuthor(a)}
                >
                  {a}
                </button>
              ))}
            </div>
            <button type="button" className={styles.retryBtn}
              disabled={!chosenAuthor} onClick={onRetry}>
              Train AI with selected name
            </button>
          </div>
        )}
      </div>
    );
  }

  if (r.status === 'bad_format') {
    return (
      <div className={`${styles.resultCard} ${styles.resultError}`}>
        <div className={styles.resultHead}><XCircle size={16} color="#dc2626"/><strong>Wrong file format</strong></div>
        <p>Please upload the <code>.zip</code> file created by WhatsApp's "Export Chat" feature —
          not a screenshot, PDF, or other file.</p>
      </div>
    );
  }

  if (r.status === 'no_txt') {
    return (
      <div className={`${styles.resultCard} ${styles.resultError}`}>
        <div className={styles.resultHead}><XCircle size={16} color="#dc2626"/><strong>No chat text found in this file</strong></div>
        <p>The zip file doesn't contain a chat text file. Make sure you chose
          <strong> Without Media</strong> when exporting from WhatsApp.</p>
      </div>
    );
  }

  if (r.status === 'group_chat') {
    return (
      <div className={`${styles.resultCard} ${styles.resultError}`}>
        <div className={styles.resultHead}><XCircle size={16} color="#dc2626"/><strong>This looks like a group chat</strong></div>
        <p>The AI learns best from one-on-one customer conversations, not group chats.
          Please export individual customer chats instead.</p>
      </div>
    );
  }

  // Generic error
  return (
    <div className={`${styles.resultCard} ${styles.resultError}`}>
      <div className={styles.resultHead}><AlertTriangle size={16} color="#dc2626"/><strong>Upload failed</strong></div>
      {r.message && <p>{r.message}</p>}
    </div>
  );
}
