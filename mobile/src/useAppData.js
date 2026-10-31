import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Api } from "./api";

/** Shared polling store for uploads / connections / checks, since the API has no WebSocket yet. */
export function useAppData(enabled) {
  const [uploads, setUploads] = useState([]);
  const [connections, setConnections] = useState([]);
  const [checks, setChecks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const [u, c, k] = await Promise.all([Api.uploads(), Api.connections(), Api.checks()]);
      setUploads(u);
      setConnections(c);
      setChecks(k);
      setLoaded(true);
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh().catch(() => {});
    const id = setInterval(() => {
      if (AppState.currentState === "active") refresh().catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  const pendingForMe = checks.filter((c) => c.status === "awaiting_consent" && !c.my_consent).length +
    connections.filter((c) => c.direction === "incoming" && c.status === "pending").length;

  return { uploads, connections, checks, loaded, refresh, pendingForMe };
}
