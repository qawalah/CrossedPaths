import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Api, getToken, setToken as persistToken, setUnauthorizedHandler } from "./api";

const AuthContext = createContext(null);

export function AuthProvider(props) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [cfg, setCfg] = useState({});

  const refreshConfig = useCallback(async () => {
    const c = await Api.config();
    setCfg(c || {});
    return c;
  }, []);

  useEffect(() => {
    // Any request that comes back 401 (token expired after 14 days, server keys changed)
    // signs the user out, so they land on the sign-in screen instead of a broken app.
    setUnauthorizedHandler(() => {
      persistToken(null).catch(() => {});
      setUser(null);
    });
    (async () => {
      // Server address may not be set yet / server unreachable; config is retried after sign-in.
      const cfgDone = refreshConfig().catch(() => {});
      const t = await getToken();
      if (t) {
        try {
          setUser(await Api.me());
        } catch (e) {
          if (e.status === 401) await persistToken(null);
          // Any other failure (server unreachable) keeps the token: the user is still
          // signed in, the app just can't reach the server right now.
          else setUser({ handle: "", offline: true });
        }
      }
      await cfgDone;
      setReady(true);
    })();
    return () => setUnauthorizedHandler(null);
  }, [refreshConfig]);

  const login = useCallback(async (handle, password) => {
    const r = await Api.login(handle, password);
    await persistToken(r.token);
    setUser(r.user);
    refreshConfig().catch(() => {});
  }, [refreshConfig]);

  const register = useCallback(async (handle, password, invite) => {
    const r = await Api.register(handle, password, invite);
    await persistToken(r.token);
    setUser(r.user);
    refreshConfig().catch(() => {});
  }, [refreshConfig]);

  const logout = useCallback(async () => {
    await persistToken(null);
    setUser(null);
  }, []);

  // Fill in the real profile once the server is reachable again after an offline start.
  useEffect(() => {
    if (!user || !user.offline) return;
    const id = setInterval(async () => {
      try {
        const me = await Api.me();
        setUser(me);
        refreshConfig().catch(() => {});
      } catch (e) {
        /* still offline, or the 401 handler already signed us out */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [user, refreshConfig]);

  const value = useMemo(
    () => ({ user, setUser, ready, cfg, login, register, logout, refreshConfig }),
    [user, ready, cfg, login, register, logout, refreshConfig]
  );

  return React.createElement(AuthContext.Provider, { value }, props.children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
