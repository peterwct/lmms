import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '../api/auth';
import type { User, AppModule, Permission, ReportKey } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, force?: boolean) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  canView: (module: AppModule) => boolean;
  canCreate: (module: AppModule) => boolean;
  canEdit: (module: AppModule) => boolean;
  canDelete: (module: AppModule) => boolean;
  hasReport: (key: ReportKey) => boolean;
  isIT: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getPerm(user: User | null, module: AppModule): Permission | undefined {
  return user?.department.permissions?.find((p) => p.module === module);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await authApi.me();
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (username: string, password: string, force?: boolean): Promise<User> => {
    const { data } = await authApi.login(username, password, force);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const isIT = user?.department.isLocked ?? false;

  const canView   = (m: AppModule) => isIT || (getPerm(user, m)?.canView   ?? false);
  const canCreate = (m: AppModule) => isIT || (getPerm(user, m)?.canCreate ?? false);
  const canEdit   = (m: AppModule) => isIT || (getPerm(user, m)?.canEdit   ?? false);
  const canDelete = (m: AppModule) => isIT || (getPerm(user, m)?.canDelete ?? false);
  const hasReport = (key: ReportKey) => isIT || (user?.reportAccess?.includes(key) ?? false);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, canView, canCreate, canEdit, canDelete, hasReport, isIT }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
