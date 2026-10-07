import { readExpenseDraft } from '../utils/expenseDraft';
import { SESSION_ENDED_KEY } from '../api/request';
import { useEffect, useState, useRef } from 'react';

export function useSessionIdentity() {
  const [user, setUser] = useState(() => localStorage.getItem('vs_user'));
  const previous = useRef(user);
  useEffect(() => {
    const update = () => {
      const next = localStorage.getItem('vs_user');
      if (!next && previous.current && readExpenseDraft(previous.current)) {
        try { sessionStorage.setItem(SESSION_ENDED_KEY, '1'); } catch { /* storage blocked */ }
      }
      previous.current = next;
      setUser(next);
    };
    window.addEventListener('storage', update);
    window.addEventListener('vs_auth_changed', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('vs_auth_changed', update);
    };
  }, []);
  return user;
}
