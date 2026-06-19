import React, { useState, useRef, useEffect } from 'react';
import { MessageCircleQuestion, X, Send, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { N8N_SOP_CHAT } from '../lib/config';
import styles from './AskSwarnix.module.css';

const GREETING = "Hi! I'm here to help with how Swarnix works — ask me anything about adding products, customers, your team, offers, or any other screen in the app.";

export default function AskSwarnix() {
  const { store, storeUser, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'bot', text: GREETING }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const askedBy = storeUser ? storeUser.username : 'owner';
  const ownerId = store?.owner_id || (storeUser ? storeUser.owner_id : user?.id) || '';

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const res = await fetch(N8N_SOP_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: ownerId, asked_by: askedBy, question }),
      });
      if (!res.ok) throw new Error('Request failed with status ' + res.status);
      const data = await res.json();
      const answer = (data && data.answer) ? String(data.answer).trim() : '';
      setMessages(prev => [
        ...prev,
        { role: 'bot', text: answer || "I couldn't find an answer for that — please try rephrasing, or check with your Swarnix support contact." },
      ]);
    } catch (e) {
      setError("Couldn't reach the help assistant. Check your internet connection and try again.");
      setMessages(prev => [...prev, { role: 'bot', text: "Sorry, I couldn't get an answer right now. Please try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.headerIcon}><Sparkles size={14} /></div>
              <div>
                <div className={styles.headerTitle}>Ask Swarnix</div>
              </div>
            </div>
            <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className={styles.messages} ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? styles.msgUser : styles.msgBot}>
                {m.text}
              </div>
            ))}
            {loading && (
              <div className={styles.msgBot}>
                <span className={styles.typingDots}><span /><span /><span /></span>
              </div>
            )}
          </div>

          {error && <div className={styles.errorRow}>{error}</div>}

          <div className={styles.inputRow}>
            <textarea
              ref={inputRef}
              className={styles.input}
              placeholder="Type your question…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <button
        className={styles.fab}
        onClick={() => setOpen(p => !p)}
        aria-label="Ask Swarnix for help"
      >
        {open ? <X size={22} /> : <MessageCircleQuestion size={22} />}
      </button>
    </>
  );
}
