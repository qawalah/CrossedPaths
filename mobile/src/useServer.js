import { useEffect, useState } from "react";
import { getServerState, onServerChange } from "./api";

/** The server addresses and which one is in use; re-renders when the app switches. */
export function useServerState() {
  const [s, setS] = useState(getServerState);
  useEffect(() => onServerChange(setS), []);
  return s;
}
