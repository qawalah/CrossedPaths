import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { Api, getToken, setToken as persistToken, setUnauthorizedHandler } from "./api";
import * as biometric from "./biometric";
import { googleIdToken } from "./google";

// With the fingerprint lock on, the app locks at start and after this long in the background.
const RELOCK_MS = 5 * 60 * 1000;

const AuthContext = createContext(null);

export function AuthProvider(props) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [cfg, setCfg] = useState({});
  const [locked, setLocked] = useState(false);
  const backgroundAt = useRef(null);

  const refreshConfig = useCallback(async () => {
    const c = await Api.config();
    setCfg(c || {});
    return c;
  }, []);

  const loadUser = useCallback(async () => {
    try {
      setUser(await Api.me());
    } catch (e) {
      if (e.status === 401) await persistToken(null);
      // Any other failure (server unreachable) keeps the token: the user is still
      // signed in, the app just can't reach the server right now.
      else setUser({ handle: "", offline: true });
    }
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
      // Locked: don't even ask the server who we are until the fingerprint check passes.
      if (t && (await biometric.isEnabled())) setLocked(true);
      else if (t) await loadUser();
      await cfgDone;
      setReady(true);
    })();
    return () => setUnauthorizedHandler(null);
  }, [refreshConfig, loadUser]);

  // Re-lock after a while in the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (s) => {
      if (s === "background") backgroundAt.current = Date.now();
      else if (s === "active" && backgroundAt.current) {
        const away = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (away >= RELOCK_MS && (await getToken()) && (await biometric.isEnabled())) setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  const unlockApp = useCallback(async () => {
    // No screen lock at all on the phone any more: there's nothing to check against, so drop
    // the lock rather than shut the user out.
    if (!(await biometric.isAvailable())) await biometric.setEnabled(false);
    else if (!(await biometric.unlock())) return false;
    setLocked(false);
    if (!user) await loadUser();
    return true;
  }, [user, loadUser]);

  // A sign-in answer: {token, user} signs in; {needs_signup, signup_token} needs a username first.
  const take = useCallback(async (r) => {
    if (r.token) {
      await persistToken(r.token);
      setUser(r.user);
      refreshConfig().catch(() => {});
      return { needsSignup: false };
    }
    return { needsSignup: true, signupToken: r.signup_token };
  }, [refreshConfig]);

  const loginWithPhone = useCallback(async (phone, code) => take(await Api.phoneVerify(phone, code)), [take]);

  // null when the user closed Google's account chooser.
  const loginWithGoogle = useCallback(async () => {
    const t = await googleIdToken(cfg.auth && cfg.auth.google_client_id);
    return t ? take(await Api.googleSignIn(t)) : null;
  }, [cfg, take]);

  const completeSignup = useCallback(async (signupToken, handle, displayName, invite) => {
    await take(await Api.authComplete(signupToken, handle, displayName, invite));
  }, [take]);

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
    setLocked(false);
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
    () => ({ user, setUser, ready, cfg, login, register, logout, refreshConfig, locked, unlockApp, loginWithPhone, loginWithGoogle, completeSignup }),
    [user, ready, cfg, login, register, logout, refreshConfig, locked, unlockApp, loginWithPhone, loginWithGoogle, completeSignup]
  );

  return React.createElement(AuthContext.Provider, { value }, props.children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
