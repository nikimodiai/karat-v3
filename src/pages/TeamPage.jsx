import React from 'react';
import UserManagement from '../components/UserManagement';
import styles from './TeamPage.module.css';

export default function TeamPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Team Members</h2>
        <p className={styles.sub}>Manage staff and relatives who can log in to Swarnix</p>
      </div>
      <div className={styles.wrap}>
        <UserManagement />
      </div>
    </div>
  );
}
