import { useAuth } from './useAuth';

// Role hierarchy: owner > admin > read_write > read_only
const ROLE_LEVEL = { owner: 4, admin: 3, read_write: 2, read_only: 1 };

function level(role) {
  return ROLE_LEVEL[role] || 0;
}

export function usePermissions() {
  const { userRole } = useAuth();

  // Can the current user perform write operations (add, edit, delete)?
  const canWrite = level(userRole) >= level('read_write');

  // Can the current user access admin-only features (manage users, store settings)?
  const canAdmin = level(userRole) >= level('admin');

  // Is this the store owner (Google login)?
  const isOwner = userRole === 'owner';

  return { userRole, canWrite, canAdmin, isOwner };
}
