import { createContext, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export const ROLE_LABELS = { superadmin: 'Super admin', admin: 'Valuer · Reviewer', evaluator: 'Field evaluator' };
// roles that can be given to a member (Valuer · Reviewer is no longer offered)
export const ASSIGNABLE_ROLES = [['evaluator', 'Field evaluator'], ['superadmin', 'Super admin']];

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
    // returns { user } when signed in, or { challenge } when an emailed code is needed first
    login: async (email, password) => {
      const res = await api.login(email, password);
      if (res.otpRequired) return { challenge: res };
      tokenStore.set(res.token);
      setUser(res.user);
      return { user: res.user };
    },
    verifyLogin: async (challengeId, code) => {
      const { token, user } = await api.loginVerify(challengeId, code);
      tokenStore.set(token);
      setUser(user);
      return user;
    },
    register: (payload) => api.register(payload), // emails a code: returns { challengeId, email, … }
    verifyRegistration: (challengeId, code) => api.registerVerify(challengeId, code), // creates a pending account
    changePassword: async (current, next) => setUser((await api.changePassword(current, next)).user),
    logout: () => {
      tokenStore.clear();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
