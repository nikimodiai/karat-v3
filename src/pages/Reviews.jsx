import React, { useState, useEffect, useCallback } from 'react';
import {
  Star, CheckCircle2, XCircle, CheckCheck, X, Clock,
  MessageSquare, RefreshCw, ChevronDown, AlertTriangle,
} from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { usePermissions } from '../hooks/usePermissions';
import styles from './Reviews.module.css';

// ── Star rating renderer ─────────────────────────────────────
function StarRating({ rating }) {
  return (
    <span className={styles.stars}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={13}
          strokeWidth={1.5}
          className={s <= rating ? styles.starFilled : styles.starEmpty}
        />
      ))}
    </span>
  );
}

// ── Avatar initials ──────────────────────────────────────────
function Avatar({ name, avatarUrl }) {
  const initials = (name || 'C')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={styles.avatarImg} />;
  }
  return <div className={styles.avatarInitials}>{initials}</div>;
}

// ── Single review card ───────────────────────────────────────
function ReviewCard({ review, onApprove, onReject, processing }) {
  const date = new Date(review.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const time = new Date(review.created_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`${styles.card} ${processing === review.id ? styles.cardProcessing : ''}`}>
      {/* Card header */}
      <div className={styles.cardHeader}>
        <div className={styles.cardLeft}>
          <Avatar name={review.customer_name} avatarUrl={review.avatar_url} />
          <div>
            <div className={styles.custName}>{review.customer_name}</div>
            <div className={styles.meta}>
              <StarRating rating={review.rating} />
              <span className={styles.metaDot}>·</span>
              <span className={styles.metaDate}>{date}, {time}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className={styles.cardActions}>
          <button
            id={`reject-${review.id}`}
            className={styles.btnReject}
            onClick={() => onReject(review.id)}
            disabled={!!processing}
            title="Reject review"
          >
            <XCircle size={15} />
            <span>Reject</span>
          </button>
          <button
            id={`approve-${review.id}`}
            className={styles.btnApprove}
            onClick={() => onApprove(review.id)}
            disabled={!!processing}
            title="Approve review"
          >
            <CheckCircle2 size={15} />
            <span>Approve</span>
          </button>
        </div>
      </div>

      {/* Review body */}
      <p className={styles.body}>"{review.body}"</p>
    </div>
  );
}

// ── Confirm bulk dialog ──────────────────────────────────────
function BulkConfirmBanner({ count, action, onConfirm, onCancel, loading }) {
  return (
    <div className={styles.bulkConfirm}>
      <AlertTriangle size={16} className={styles.bulkIcon} />
      <span>
        {action === 'approve'
          ? `Approve all ${count} pending reviews?`
          : `Reject all ${count} pending reviews?`}
      </span>
      <div className={styles.bulkBtns}>
        <button className={styles.bulkCancel} onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button
          className={action === 'approve' ? styles.bulkApproveBtn : styles.bulkRejectBtn}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading
            ? <><div className="spinner spinner-sm" /> Processing…</>
            : `Yes, ${action === 'approve' ? 'Approve' : 'Reject'} all`}
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function Reviews() {
  const { store } = useAuth();
  const { isOwner, canAdmin } = usePermissions();
  const { showToast } = useToast();

  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [processing, setProcessing] = useState(null); // id of row being processed
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(null); // 'approve' | 'reject' | null
  const [refreshKey, setRefreshKey] = useState(0);

  const canModerate = isOwner || canAdmin;

  // ── Fetch pending reviews ────────────────────────────────
  const fetchReviews = useCallback(async () => {
    if (!store?.owner_id) return;
    setLoading(true);
    try {
      // The owner authenticates via Supabase Auth (service-role or authenticated),
      // but RLS public_read_approved_reviews only exposes approved rows to anon.
      // The owner sees ALL rows via authenticated session — we filter to pending here.
      const { data, error } = await db
        .from('reviews')
        .select('id, customer_name, rating, body, avatar_url, created_at, status')
        .eq('owner_id', store.owner_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (err) {
      showToast('Failed to load reviews: ' + err.message, '#C0392B');
    } finally {
      setLoading(false);
    }
  }, [store?.owner_id, showToast]);

  useEffect(() => { fetchReviews(); }, [fetchReviews, refreshKey]);

  // ── Update status helper ─────────────────────────────────
  const updateStatus = async (id, status) => {
    const { error } = await db
      .from('reviews')
      .update({ status })
      .eq('id', id)
      .eq('owner_id', store.owner_id); // safety: always scope to owner
    if (error) throw error;
  };

  // ── Single approve/reject ────────────────────────────────
  const handleApprove = async (id) => {
    setProcessing(id);
    try {
      await updateStatus(id, 'approved');
      setReviews((prev) => prev.filter((r) => r.id !== id));
      showToast('Review approved — it will now appear on your storefront.', '#15803d');
    } catch (err) {
      showToast('Error: ' + err.message, '#C0392B');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id) => {
    setProcessing(id);
    try {
      await updateStatus(id, 'rejected');
      setReviews((prev) => prev.filter((r) => r.id !== id));
      showToast('Review rejected.', '#7c3aed');
    } catch (err) {
      showToast('Error: ' + err.message, '#C0392B');
    } finally {
      setProcessing(null);
    }
  };

  // ── Bulk actions ─────────────────────────────────────────
  const handleBulkConfirm = async () => {
    if (!bulkConfirm || reviews.length === 0) return;
    setBulkLoading(true);
    const status = bulkConfirm; // 'approved' | 'rejected'
    const ids = reviews.map((r) => r.id);
    try {
      const { error } = await db
        .from('reviews')
        .update({ status })
        .in('id', ids)
        .eq('owner_id', store.owner_id);
      if (error) throw error;
      setReviews([]);
      showToast(
        status === 'approved'
          ? `All ${ids.length} reviews approved!`
          : `All ${ids.length} reviews rejected.`,
        status === 'approved' ? '#15803d' : '#7c3aed',
      );
    } catch (err) {
      showToast('Bulk action failed: ' + err.message, '#C0392B');
    } finally {
      setBulkLoading(false);
      setBulkConfirm(null);
    }
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <MessageSquare size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className={styles.title}>Review Moderation</h1>
            <p className={styles.sub}>
              {loading
                ? 'Loading…'
                : reviews.length === 0
                ? 'No pending reviews — you\'re all caught up!'
                : `${reviews.length} pending review${reviews.length !== 1 ? 's' : ''} awaiting your decision`}
            </p>
          </div>
        </div>

        <div className={styles.headerRight}>
          <button
            id="reviews-refresh-btn"
            className={styles.refreshBtn}
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? styles.spinning : ''} />
          </button>

          {canModerate && reviews.length > 0 && !bulkConfirm && (
            <div className={styles.bulkWrap}>
              <button
                id="bulk-approve-btn"
                className={styles.btnBulkApprove}
                onClick={() => setBulkConfirm('approved')}
                disabled={bulkLoading}
              >
                <CheckCheck size={15} />
                Approve All
              </button>
              <button
                id="bulk-reject-btn"
                className={styles.btnBulkReject}
                onClick={() => setBulkConfirm('rejected')}
                disabled={bulkLoading}
              >
                <X size={15} />
                Reject All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk confirm banner */}
      {bulkConfirm && (
        <BulkConfirmBanner
          count={reviews.length}
          action={bulkConfirm}
          loading={bulkLoading}
          onConfirm={handleBulkConfirm}
          onCancel={() => setBulkConfirm(null)}
        />
      )}

      {/* Content */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.center}>
            <div className="spinner" />
            <p className={styles.loadingText}>Loading pending reviews…</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <CheckCircle2 size={48} strokeWidth={1} />
            </div>
            <h2 className={styles.emptyTitle}>All caught up!</h2>
            <p className={styles.emptyText}>
              There are no pending reviews right now. When customers submit
              reviews from your storefront, they'll appear here for your approval.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {/* Info pill */}
            <div className={styles.infoPill}>
              <Clock size={12} />
              Reviews below are pending — approve to show them on your storefront,
              or reject to discard.
            </div>

            {reviews.map((review) => (
              canModerate ? (
                <ReviewCard
                  key={review.id}
                  review={review}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  processing={processing}
                />
              ) : (
                /* Read-only view for non-moderators */
                <div key={review.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardLeft}>
                      <Avatar name={review.customer_name} avatarUrl={review.avatar_url} />
                      <div>
                        <div className={styles.custName}>{review.customer_name}</div>
                        <div className={styles.meta}>
                          <StarRating rating={review.rating} />
                        </div>
                      </div>
                    </div>
                    <span className={styles.pendingBadge}>
                      <Clock size={11} /> Pending
                    </span>
                  </div>
                  <p className={styles.body}>"{review.body}"</p>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
