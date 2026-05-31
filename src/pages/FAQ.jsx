import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Check, X, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import styles from './FAQ.module.css';

const DEFAULT_FAQS = [
  {
    question: 'What is your return policy?',
    answer: 'We accept returns within 7 days of delivery for unused, undamaged items in original packaging. Custom or engraved jewellery cannot be returned. Please contact us with your order details to initiate a return.',
  },
  {
    question: 'How long does delivery take?',
    answer: 'Standard delivery takes 5–7 business days. Express delivery (2–3 business days) is available at an additional charge. Custom and made-to-order pieces may take 10–15 business days.',
  },
  {
    question: 'Do you offer free shipping?',
    answer: 'Yes, we offer free shipping on all orders above ₹5,000. Orders below this amount have a flat shipping charge of ₹150.',
  },
  {
    question: 'Is the jewellery BIS hallmarked?',
    answer: 'Yes, all our gold jewellery is BIS hallmarked as per Government of India regulations. Each piece comes with a hallmark certificate ensuring purity.',
  },
  {
    question: 'Can I get jewellery customised or made to order?',
    answer: 'Absolutely! We specialise in custom jewellery. Share your design, reference photo, or idea with us on WhatsApp and we will provide a quote and timeline.',
  },
  {
    question: 'Do you provide a certificate of authenticity for diamonds?',
    answer: 'Yes, diamonds above 0.30 ct come with a GIA or IGI certification. Smaller stones are certified in-house. Certificate details are shared at the time of purchase.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept UPI, net banking, credit/debit cards, and cash on delivery (COD) for orders up to ₹10,000. EMI options are available on select items.',
  },
  {
    question: 'Can I exchange old gold for new jewellery?',
    answer: 'Yes, we offer gold exchange at current market rates. Bring your old gold jewellery to our store and our team will evaluate it and apply the value towards your new purchase.',
  },
  {
    question: 'How do I care for and clean my jewellery?',
    answer: 'Store jewellery in separate soft pouches to avoid scratches. Clean gold jewellery with mild soap and warm water using a soft brush. Avoid exposing jewellery to chemicals, perfume, or chlorine water.',
  },
  {
    question: 'Do you offer repair and resizing services?',
    answer: 'Yes, we offer ring resizing, chain repair, prong retipping, rhodium plating, and general servicing. Bring your piece to the store or courier it to us. Most repairs are completed within 3–5 business days.',
  },
];

export default function FAQ() {
  const { user, store } = useAuth();
  const { showToast } = useToast();
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ question: '', answer: '' });
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ question: '', answer: '' });
  const [saving, setSaving] = useState(false);

  const ownerId = store?.id || user?.id;

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data, error } = await db
      .from('owner_faqs')
      .select('*')
      .eq('owner_id', ownerId)
      .order('sort_order', { ascending: true });

    if (error) {
      showToast('Failed to load FAQs', 'error');
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      // Seed default FAQs for this owner
      const rows = DEFAULT_FAQS.map((f, i) => ({
        owner_id: ownerId,
        question: f.question,
        answer: f.answer,
        sort_order: i,
      }));
      const { data: inserted, error: insErr } = await db
        .from('owner_faqs')
        .insert(rows)
        .select();
      if (!insErr && inserted) {
        setFaqs(inserted);
      }
    } else {
      setFaqs(data);
    }
    setLoading(false);
  }, [ownerId, showToast]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (faq) => {
    setEditingId(faq.id);
    setEditForm({ question: faq.question, answer: faq.answer });
    setExpandedId(faq.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ question: '', answer: '' });
  };

  const saveEdit = async (id) => {
    if (!editForm.question.trim() || !editForm.answer.trim()) {
      showToast('Question and answer are required', 'error');
      return;
    }
    setSaving(true);
    const { error } = await db
      .from('owner_faqs')
      .update({ question: editForm.question.trim(), answer: editForm.answer.trim() })
      .eq('id', id);
    setSaving(false);
    if (error) { showToast('Save failed', 'error'); return; }
    setFaqs(prev => prev.map(f => f.id === id ? { ...f, question: editForm.question.trim(), answer: editForm.answer.trim() } : f));
    setEditingId(null);
    showToast('FAQ updated', 'success');
  };

  const deleteFaq = async (id) => {
    if (!window.confirm('Delete this FAQ?')) return;
    const { error } = await db.from('owner_faqs').delete().eq('id', id);
    if (error) { showToast('Delete failed', 'error'); return; }
    setFaqs(prev => prev.filter(f => f.id !== id));
    if (expandedId === id) setExpandedId(null);
    showToast('FAQ deleted', 'success');
  };

  const saveNew = async () => {
    if (!newForm.question.trim() || !newForm.answer.trim()) {
      showToast('Question and answer are required', 'error');
      return;
    }
    setSaving(true);
    const { data, error } = await db
      .from('owner_faqs')
      .insert({
        owner_id: ownerId,
        question: newForm.question.trim(),
        answer: newForm.answer.trim(),
        sort_order: faqs.length,
      })
      .select()
      .single();
    setSaving(false);
    if (error) { showToast('Save failed', 'error'); return; }
    setFaqs(prev => [...prev, data]);
    setNewForm({ question: '', answer: '' });
    setAddingNew(false);
    setExpandedId(data.id);
    showToast('FAQ added', 'success');
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <HelpCircle size={20} color="#C9A84C" strokeWidth={1.5} />
            <div>
              <h1 className={styles.title}>Frequently Asked Questions</h1>
              <p className={styles.subtitle}>
                These FAQs are shown to your customers. Edit, add, or remove any question.
              </p>
            </div>
          </div>
          <button
            className={styles.addBtn}
            onClick={() => { setAddingNew(true); setEditingId(null); }}
            disabled={addingNew}
          >
            <Plus size={14} /> Add FAQ
          </button>
        </div>

        {/* New FAQ form */}
        {addingNew && (
          <div className={styles.newCard}>
            <div className={styles.cardLabel}>New FAQ</div>
            <div className={styles.fld}>
              <label className={styles.lbl}>Question</label>
              <input
                className={styles.inp}
                value={newForm.question}
                onChange={e => setNewForm(f => ({ ...f, question: e.target.value }))}
                placeholder="e.g. What is your return policy?"
                autoFocus
              />
            </div>
            <div className={styles.fld} style={{ marginTop: 10 }}>
              <label className={styles.lbl}>Answer</label>
              <textarea
                className={styles.inp}
                rows={4}
                value={newForm.answer}
                onChange={e => setNewForm(f => ({ ...f, answer: e.target.value }))}
                placeholder="Provide a clear, helpful answer…"
              />
            </div>
            <div className={styles.cardActions}>
              <button className={styles.btnGhost} onClick={() => { setAddingNew(false); setNewForm({ question: '', answer: '' }); }}>
                <X size={13} /> Cancel
              </button>
              <button className={styles.btnGold} onClick={saveNew} disabled={saving}>
                {saving ? <div className="spinner spinner-sm" /> : <Check size={13} />} Save FAQ
              </button>
            </div>
          </div>
        )}

        {/* FAQ list */}
        <div className={styles.list}>
          {faqs.map((faq, idx) => {
            const isExpanded = expandedId === faq.id;
            const isEditing = editingId === faq.id;
            return (
              <div key={faq.id} className={`${styles.card} ${isExpanded ? styles.cardExpanded : ''}`}>
                {/* Header row */}
                <div
                  className={styles.cardHeader}
                  onClick={() => !isEditing && setExpandedId(isExpanded ? null : faq.id)}
                >
                  <span className={styles.qNum}>Q{idx + 1}</span>
                  <span className={styles.qText}>
                    {isEditing ? editForm.question || 'Editing…' : faq.question}
                  </span>
                  <div className={styles.cardActionsInline} onClick={e => e.stopPropagation()}>
                    {!isEditing && (
                      <>
                        <button className={styles.iconBtn} title="Edit" onClick={() => startEdit(faq)}>
                          <Pencil size={13} />
                        </button>
                        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete" onClick={() => deleteFaq(faq.id)}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <span className={styles.chevron}>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  )}
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div className={styles.cardBody}>
                    {isEditing ? (
                      <>
                        <div className={styles.fld}>
                          <label className={styles.lbl}>Question</label>
                          <input
                            className={styles.inp}
                            value={editForm.question}
                            onChange={e => setEditForm(f => ({ ...f, question: e.target.value }))}
                            autoFocus
                          />
                        </div>
                        <div className={styles.fld} style={{ marginTop: 10 }}>
                          <label className={styles.lbl}>Answer</label>
                          <textarea
                            className={styles.inp}
                            rows={4}
                            value={editForm.answer}
                            onChange={e => setEditForm(f => ({ ...f, answer: e.target.value }))}
                          />
                        </div>
                        <div className={styles.cardActions}>
                          <button className={styles.btnGhost} onClick={cancelEdit}>
                            <X size={13} /> Cancel
                          </button>
                          <button className={styles.btnGold} onClick={() => saveEdit(faq.id)} disabled={saving}>
                            {saving ? <div className="spinner spinner-sm" /> : <Check size={13} />} Save
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.answerText}>{faq.answer}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {faqs.length === 0 && !addingNew && (
          <div className={styles.empty}>
            <HelpCircle size={32} color="rgba(13,27,42,.15)" strokeWidth={1} />
            <p>No FAQs yet. Click <strong>Add FAQ</strong> to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
