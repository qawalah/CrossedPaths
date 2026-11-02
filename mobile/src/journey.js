// The path through the app: add a timeline → connect → run a check → see the crossings.
// Shared by the tab bar's "a check is ready" pulse and the Checks page.
export const FLOW = [
  ["upload", "Import", "Timeline"],
  ["connect", "Connect", "People"],
  ["check", "Check", "Checks"],
  ["results", "Crossings", "Checks"],
];

export function journey({ uploads = [], connections = [], checks = [] }) {
  const ok = connections.filter((c) => c.status === "accepted");
  const active = (c) => c.status === "awaiting_consent" || c.status === "running" || c.status === "done";
  const done = checks.find((c) => c.status === "done");
  const running = checks.find((c) => c.status === "running");
  const review = checks.find((c) => c.status === "awaiting_consent" && !c.my_consent);
  const waiting = checks.find((c) => c.status === "awaiting_consent" && c.my_consent);
  // connections with no check yet (or only declined / expired / failed ones): a check waiting to happen
  const fresh = ok.filter((c) => !checks.some((k) => k.other === c.other && active(k)));
  const has = { upload: uploads.length > 0, connect: ok.length > 0, check: !!(running || done), results: !!done };
  const current = FLOW.findIndex(([k]) => !has[k]);
  return { ok, fresh, review, waiting, running, done, has, current, invite: !!review || (has.upload && fresh.length > 0) };
}

