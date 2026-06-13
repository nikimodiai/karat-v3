import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Shield, Eye, PenSquare, ShieldCheck, X, Check, RefreshCw, User } from 'lucide-react';
import { db } from '../lib/config';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import styles from './UserManagement.module.css';

const ROLES = [
  { value: 'admin',      label: 'Admin',      desc: 'Full access — add/edit/delete, manage users', icon: ShieldCheck, color: '#C9A84C' },
  { value: 'read_write', label: 'Read & Write', desc: 'Add and edit products, customers, etc.', icon: PenSquare,   color: '#2563eb' },
  { value: 'read_only',  label: 'Read Only',  desc: 'View everything but cannot make changes',  icon: Eye,         color: '#6b7280' },
];

function roleConfig(role) {
  return ROLES.find(r => r.value === role) || ROLES[2];
}

// ── Add / Edit modal ───────────────────────────────────────────────────────────
function UserModal({ existing, storeId, ownerId, onSave, onClose }) {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(existing?.full_name || '');
  const [username, setUsername] = useState(existing?.username || '');
  const [password, setPassword] = useState('');
  const [notes, setNotes]       = useState(existing?.notes || '');
  const [role, setRole]         = useState(existing?.role || 'read_write');
  const [saving, setSaving]     = useState(false);

  const isEdit = !!existing;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim()) return;
    if (!isEdit && !password) return;

    setSaving(true);
    try {
      if (isEdit) {
        // Build update payload — only hash password if provided
        const payload = {
          full_name: fullName.trim(),
          role,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString(),
        };

        if (password) {
          const { data: hash, error: hashErr } = await db.rpc('hash_password', { p_password: password });
          if (hashErr) throw hashErr;
          payload.password_hash = hash;
        }

        const { error } = await db.from('store_users').update(payload).eq('id', existing.id);
        if (error) throw error;
        showToast('User updated', '#15803d');
      } else {
        // Hash password via RPC (server-side bcrypt)
        const { data: hash, error: hashErr } = await db.rpc('hash_password', { p_password: password });
        if (hashErr) throw hashErr;

        const { error } = await db.from('store_users').insert({
          store_id: storeId,
          owner_id: ownerId,
          username: username.trim().toLowerCase(),
          password_hash: hash,
          full_name: fullName.trim(),
          role,
          notes: notes.trim() || null,
        });
        if (error) {
          if (error.code === '23505') throw new Error('Username already exists in this store');
          throw error;
        }
        showToast('User created', '#15803d');
      }
      onSave();
    } catch (err) {
      showToast(err.message || 'Failed to save user', '#C0392B');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{isEdit ? 'Edit User' : 'Add New User'}</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={18}/></button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <label className={styles.fieldLabel}>Full Name *</label>
          <input
            className={styles.fieldInput}
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="e.g. Ramesh Kumar"
            required
          />

          <label className={styles.fieldLabel}>Username * {isEdit && <span className={styles.fieldHint}>(cannot change)</span>}</label>
          <input
            className={styles.fieldInput}
            value={isEdit ? existing.username : username}
            onChange={e => setUsername(e.target.value)}
            placeholder="e.g. ramesh"
            disabled={isEdit}
            required={!isEdit}
            autoComplete="off"
          />

          <label className={styles.fieldLabel}>
            Password {isEdit ? <span className={styles.fieldHint}>(leave blank to keep current)</span> : '*'}
          </label>
          <input
            className={styles.fieldInput}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={isEdit ? 'Enter new password to change' : 'Min 6 characters'}
            required={!isEdit}
            minLength={6}
            autoComplete="new-password"
          />

          <label className={styles.fieldLabel}>Role *</label>
          <div className={styles.roleGrid}>
            {ROLES.map(r => {
              const Icon = r.icon;
              return (
                <button
                  key={r.value}
                  type="button"
                  className={`${styles.roleCard} ${role === r.value ? styles.roleCardActive : ''}`}
                  style={role === r.value ? { borderColor: r.color, background: `${r.color}15` } : {}}
                  onClick={() => setRole(r.value)}
                >
                  <Icon size={16} color={role === r.value ? r.color : 'inherit'} />
                  <span className={styles.roleLabel} style={role === r.value ? { color: r.color } : {}}>{r.label}</span>
                  <span className={styles.roleDesc}>{r.desc}</span>
                </button>
              );
            })}
          </div>

          <label className={styles.fieldLabel}>Notes <span className={styles.fieldHint}>(optional)</span></label>
          <input
            className={styles.fieldInput}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Manager at Bandra branch"
          />

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button
              type="submit"
              className={styles.btnSave}
              disabled={saving || !fullName.trim() || (!isEdit && (!username.trim() || !password))}
            >
              {saving ? <div className="spinner spinner-sm" style={{ borderTopColor: '#0B1829' }}/> : <Check size={15}/>}
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create User')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function UserManagement() {
  const { store, isOwner, userRole } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalUser, setModalUser] = useState(null);   // null | 'new' | existing row
  const [deleting, setDeleting]   = useState(null);

  const canManage = isOwner || userRole === 'admin';

  const loadUsers = useCallback(async () => {
    if (!store?.id) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from('store_users')
        .select('id, username, full_name, role, notes, is_active, last_login_at, created_at')
        .eq('store_id', store.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      showToast('Could not load users', '#C0392B');
    } finally {
      setLoading(false);
    }
  }, [store?.id]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const toggleActive = async (u) => {
    try {
      await db.from('store_users').update({ is_active: !u.is_active }).eq('id', u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
    } catch {
      showToast('Failed to update status', '#C0392B');
    }
  };

  const deleteUser = async (u) => {
    if (deleting) return;
    setDeleting(u.id);
    try {
      const { error } = await db.from('store_users').delete().eq('id', u.id);
      if (error) throw error;
      setUsers(prev => prev.filter(x => x.id !== u.id));
      showToast('User removed', '#15803d');
    } catch {
      showToast('Failed to delete user', '#C0392B');
    } finally {
      setDeleting(null);
    }
  };

  if (!canManage) {
    return (
      <div className={styles.restricted}>
        <Shield size={32} color="rgba(201,168,76,.4)"/>
        <p>Only the store owner or admin users can manage team members.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Team Members</h2>
          <p className={styles.subtitle}>Staff and relatives who can log in to Swarnix</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnRefresh} onClick={loadUsers} title="Refresh">
            <RefreshCw size={14}/>
          </button>
          <button className={styles.btnAdd} onClick={() => setModalUser('new')}>
            <Plus size={14}/> Add User
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.empty}><div className="spinner"/></div>
      ) : users.length === 0 ? (
        <div className={styles.empty}>
          <User size={36} color="rgba(201,168,76,.3)"/>
          <p>No team members yet. Add staff so they can log in and help manage the store.</p>
          <button className={styles.btnAdd} onClick={() => setModalUser('new')}><Plus size={14}/> Add First User</button>
        </div>
      ) : (
        <div className={styles.list}>
          {users.map(u => {
            const rc = roleConfig(u.role);
            const RIcon = rc.icon;
            return (
              <div key={u.id} className={`${styles.row} ${!u.is_active ? styles.rowInactive : ''}`}>
                <div className={styles.rowAvatar} style={{ background: `${rc.color}20`, color: rc.color }}>
                  {u.full_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className={styles.rowInfo}>
                  <span className={styles.rowName}>{u.full_name}</span>
                  <span className={styles.rowUsername}>@{u.username}</span>
                  {u.notes && <span className={styles.rowNotes}>{u.notes}</span>}
                </div>
                <div className={styles.rowRole}>
                  <span className={styles.rolePill} style={{ color: rc.color, background: `${rc.color}15`, borderColor: `${rc.color}30` }}>
                    <RIcon size={11}/> {rc.label}
                  </span>
                </div>
                <div className={styles.rowMeta}>
                  {u.last_login_at
                    ? <span className={styles.lastLogin}>Last login {new Date(u.last_login_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    : <span className={styles.lastLogin}>Never logged in</span>
                  }
                </div>
                <div className={styles.rowActions}>
                  <button
                    className={`${styles.actionBtn} ${u.is_active ? styles.actionBtnActive : styles.actionBtnMuted}`}
                    onClick={() => toggleActive(u)}
                    title={u.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {u.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button className={styles.iconBtn} onClick={() => setModalUser(u)} title="Edit">
                    <Edit2 size={14}/>
                  </button>
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    onClick={() => deleteUser(u)}
                    disabled={deleting === u.id}
                    title="Remove"
                  >
                    {deleting === u.id ? <div className="spinner spinner-sm"/> : <Trash2 size={14}/>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Role legend */}
      <div className={styles.legend}>
        <span className={styles.legendTitle}>Role Permissions</span>
        {ROLES.map(r => {
          const Icon = r.icon;
          return (
            <div key={r.value} className={styles.legendItem}>
              <Icon size={12} color={r.color}/>
              <strong style={{ color: r.color }}>{r.label}:</strong>
              <span>{r.desc}</span>
            </div>
          );
        })}
        <div className={styles.legendItem}>
          <Shield size={12} color="#C9A84C"/>
          <strong style={{ color: '#C9A84C' }}>Owner:</strong>
          <span>Full access + user management (Google login only)</span>
        </div>
      </div>

      {/* Modal */}
      {modalUser && (
        <UserModal
          existing={modalUser === 'new' ? null : modalUser}
          storeId={store.id}
          ownerId={store.owner_id}
          onSave={() => { setModalUser(null); loadUsers(); }}
          onClose={() => setModalUser(null)}
        />
      )}
    </div>
  );
}
