import { createContext, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export const ROLE_LABELS = { superadmin: 'Super admin', admin: 'Valuer · Reviewer', evaluator: 'Field evaluator' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const value = {
    user,
    loading,
    isSuperadmin: user?.role === 'superadmin',
    // reviewers (valuer admins and the superadmin) see every valuation and can approve / reject
    isReviewer: user?.role === 'admin' || user?.role === 'superadmin',
    login: async (email, password) => {
      const { token, user } = await api.login(email, password);
      tokenStore.set(token);
      setUser(user);
      return user;
    },
    register: (payload) => api.register(payload), // creates a pending account – no sign-in
    changePassword: async (current, next) => setUser((await api.changePassword(current, next)).user),
    logout: () => {
      tokenStore.clear();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
