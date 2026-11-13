import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, setCsrfToken, setSessionExpiredHandler, type AuthSession, type AuthUser } from "@/lib/api";
import { AuthContext } from "@/features/auth/auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const userRef = useRef<AuthUser | null>(null);
  const logoutInFlight = useRef(false);
  userRef.current = user;
  const apply = useCallback((session: AuthSession | null) => {
    userRef.current = session?.user ?? null;
    setUser(session?.user ?? null);
    setCsrfToken(session?.csrfToken ?? null);
  }, []);
  const refresh = useCallback(async () => {
    try {
      apply(await api.getSession());
      setSessionExpired(false);
      setLogoutError(null);
    } catch (error) {
      if ((error as { status?: number })?.status === 401 && userRef.current) {
        userRef.current = null;
        apply(null);
        setSessionExpired(true);
      }
    } finally {
      setLoading(false);
    }
  }, [apply]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (!userRef.current || logoutInFlight.current) return;
      userRef.current = null;
      setUser(null);
      setCsrfToken(null);
      setSessionExpired(true);
      setLogoutError(null);
    });
    return () => setSessionExpiredHandler(null);
  }, []);
  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.login(email, password);
      apply(session);
      setSessionExpired(false);
      setLogoutError(null);
      setLoading(false);
      return session.user;
    },
    [apply]
  );
  const logout = useCallback(async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLogoutPending(true);
    setLogoutError(null);
    try {
      await api.logout();
      apply(null);
    } catch {
      setLogoutError("Logout could not be confirmed. Your sign-in state is unchanged; please retry.");
    } finally {
      logoutInFlight.current = false;
      setLogoutPending(false);
    }
  }, [apply]);
  const value = useMemo(
    () => ({ user, loading, logoutPending, logoutError, sessionExpired, login, logout, refresh }),
    [user, loading, logoutPending, logoutError, sessionExpired, login, logout, refresh]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
