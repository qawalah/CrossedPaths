// The path through the app: add a timeline → connect → run a check → see the crossings.
// Shared by the progress strip, the tab bar's "a check is ready" pulse and the Checks invitation.
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

/** What to say under the strip for the current step, and the button that does it. */
export function flowHint(j, connections = []) {
  const k = j.current >= 0 ? FLOW[j.current][0] : null;
  const inc = connections.find((c) => c.direction === "incoming" && c.status === "pending");
  const out = connections.find((c) => c.direction === "outgoing" && c.status === "pending");
  if (k === "upload") return ["Start by adding your location history. It stays private.", "Add timeline"];
  if (k === "connect")
    return inc
      ? [`@${inc.other} wants to connect with you.`, "See request"]
      : out
      ? [`Waiting for @${out.other} to accept. You can connect with others too.`, "People"]
      : ["Connect with someone you might have crossed paths with.", "Find people"];
  if (k === "check")
    return j.review
      ? [`@${j.review.other} asked to check paths. Nothing runs until you agree.`, "Review"]
      : j.waiting && !j.fresh.length
      ? [`Waiting for @${j.waiting.other} to agree to the check.`, null]
      : ["You're ready. Run a check; it starts once you both agree.", "Run a check"];
  if (k === "results") return ["Finding where your paths crossed…", null];
  return [null, null];
}

/** Where the hint's button (or a tapped step) goes. */
export function flowGo(navigation, j, k, uploads = []) {
  if (k === "upload") return navigation.navigate("Build", { start: "files" });
  if (k === "check" || k === "results") {
    if (j.review) return navigation.navigate("ReviewCheck", { checkId: j.review.id });
    if (k === "results" && j.done) return navigation.navigate("Results", { checkId: j.done.id });
    if (j.fresh.length === 1 && uploads.length)
      return navigation.navigate("NewCheck", { connectionId: j.fresh[0].id, other: j.fresh[0].other });
  }
  const step = FLOW.find(([x]) => x === k) || FLOW[0];
  navigation.navigate(step[2]);
}
