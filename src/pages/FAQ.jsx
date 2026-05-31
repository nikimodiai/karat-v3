import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Check, X, HelpCircle, ChevronDown, ChevronUp, Sparkles, Save } from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import styles from './FAQ.module.css';

export default function FAQ() {
  const { user, store } = useAuth();
  const { showToast } = useToast();
  const [faqs, setFaqs] = useState([]);
  // `draft` mode = the owner has no saved FAQs yet, so we show the global
  // sample_faqs catalogue as an editable draft they can tweak then save.
  const [isDraft, setIsDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ question: '', answer: '' });
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState({ question: '', answer: '' });
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  // owner_faqs.owner_id is a FK to auth.users(id) and RLS checks
  // owner_id = auth.uid(), so we must use the auth user id — which is
  // store.owner_id for staff sessions, or user.id for the owner directly.
  const ownerId = store?.owner_id || user?.id;

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
      // No saved FAQs yet → pull the shared sample catalogue and show it
      // as an editable draft. Nothing is persisted until the owner saves.
      const { data: samples } = await db
        .from('sample_faqs')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      setFaqs(
        (samples || []).map((s, i) => ({
          id: `draft-${s.id || i}`,   // local-only key, never sent to DB
          question: s.question,
          answer: s.answer,
          sort_order: i,
        }))
      );
      setIsDraft(true);
    } else {
      setFaqs(data);
      setIsDraft(false);
    }
    setLoading(false);
  }, [ownerId, showToast]);

  useEffect(() => { load(); }, [load]);

  // ── Draft mode: local mutations (not persisted until "Save all") ──
  const updateDraft = (id, patch) =>
    setFaqs(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

  const deleteDraft = (id) => {
    setFaqs(prev => prev.filter(f => f.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  // Persist the whole draft into owner_faqs in one shot
  const saveAllDrafts = async () => {
    if (faqs.length === 0) {
      showToast('Add at least one FAQ before saving', 'error');
      return;
    }
    setSavingAll(true);
    const rows = faqs.map((f, i) => ({
      owner_id: ownerId,
      question: f.question.trim(),
      answer: f.answer.trim(),
      sort_order: i,
    }));
    const { data, error } = await db
      .from('owner_faqs')
      .insert(rows)
      .select()
      .order('sort_order', { ascending: true });
    setSavingAll(false);
    if (error) { showToast(error.message || 'Save failed', 'error'); return; }
    setFaqs(data || []);
    setIsDraft(false);
    setEditingId(null);
    showToast('Your FAQs are now live for customers', 'success');
  };

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
    // In draft mode, edits stay local until the owner saves everything.
    if (isDraft) {
      updateDraft(id, { question: editForm.question.trim(), answer: editForm.answer.trim() });
      setEditingId(null);
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
    if (isDraft) { deleteDraft(id); return; }
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
    // In draft mode, append locally — persisted on "Save all".
    if (isDraft) {
      const draft = {
        id: `draft-new-${Date.now()}`,
        question: newForm.question.trim(),
        answer: newForm.answer.trim(),
        sort_order: faqs.length,
      };
      setFaqs(prev => [...prev, draft]);
      setNewForm({ question: '', answer: '' });
      setAddingNew(false);
      setExpandedId(draft.id);
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

        {/* Draft banner — shown until the owner saves the sample set */}
        {isDraft && faqs.length > 0 && (
          <div className={styles.draftBanner}>
            <div className={styles.draftBannerText}>
              <Sparkles size={15} color="#8B6914" />
              <span>
                These are <strong>sample FAQs</strong> to get you started. Tweak the
                wording to match your store, then save to make them live for customers.
              </span>
            </div>
            <button className={styles.btnGold} onClick={saveAllDrafts} disabled={savingAll}>
              {savingAll ? <div className="spinner spinner-sm" /> : <Save size={13} />}
              Save all to my FAQs
            </button>
          </div>
        )}

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
