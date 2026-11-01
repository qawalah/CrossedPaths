import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, Text, TextInput, Vibration, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import UploadPicker from "../components/UploadPicker";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { colors } from "../theme";
import Icon from "../components/Icon";

const MODES = [
  ["show", "Show my code"],
  ["scan", "Scan"],
  ["shake", "Shake"],
];

/** Pull the code out of whatever was scanned or typed: an invite URL (…/pair/CODE),
 * a crosspaths://pair/CODE link, or the bare code. */
export function codeFrom(text) {
  const s = String(text || "").trim();
  const m = s.match(/pair\/([A-Za-z0-9]{6,16})/);
  if (m) return m[1].toUpperCase();
  const bare = s.replace(/[\s-]/g, "");
  return /^[A-Za-z0-9]{6,16}$/.test(bare) ? bare.toUpperCase() : null;
}

// Meet someone in person: one shows a code (or shares a link), the other scans it - or both
// shake their phones together. Either way you're connected immediately and, if you both have a
// timeline uploaded, the check runs straight away: doing this together IS both of you agreeing.
export default function AddNearbyScreen({ route, navigation, uploads, loaded, onDone }) {
  const insets = useSafeAreaInsets();
  const linkCode = route.params && route.params.code ? codeFrom(route.params.code) : null;
  const [mode, setMode] = useState(linkCode ? "scan" : "show");
  const [uploadId, setUploadId] = useState(uploads[0] && uploads[0].id);
  const [result, setResult] = useState(null); // pairing result from the server

  useEffect(() => {
    if (!uploadId && uploads[0]) setUploadId(uploads[0].id);
  }, [uploads]);

  const finish = useCallback(
    (r) => {
      setResult(r);
      Vibration.vibrate(60);
      onDone && onDone();
    },
    [onDone]
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.panel }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Meet in person</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={{ color: colors.muted, fontSize: 15 }}>Close</Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        Connect with someone next to you and check right away whether your paths have crossed before. Doing this
        together counts as both of you agreeing to the check - they'll only see when and roughly where you crossed, never
        your route.
      </Text>

      {result ? (
        <PairResult result={result} navigation={navigation} onAgain={() => setResult(null)} />
      ) : !loaded ? (
        // Opened straight from an invite link: wait for your uploads, so "Connect & check"
        // knows which timeline to use instead of connecting with none.
        <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
      ) : (
        <>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 6 }}>Your timeline for the check</Text>
          {uploads.length ? (
            <UploadPicker uploads={uploads} value={uploadId} onChange={setUploadId} />
          ) : (
            <Text style={{ color: colors.warn, fontSize: 13, lineHeight: 18 }}>
              You haven't uploaded a timeline, so you'll be connected but no check will run. Upload one on the Timeline tab first
              to check straight away.
            </Text>
          )}

          <View style={{ flexDirection: "row", backgroundColor: colors.panel2, borderRadius: 12, padding: 3, marginTop: 18 }}>
            {MODES.map(([m, label]) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: mode === m ? colors.panel : "transparent" }}
              >
                <Text style={{ color: mode === m ? colors.text : colors.muted, fontWeight: "700", fontSize: 14 }}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {mode === "show" ? <ShowCode uploadId={uploadId} onPaired={finish} /> : null}
          {mode === "scan" ? <ScanCode uploadId={uploadId} initialCode={linkCode} onPaired={finish} /> : null}
          {mode === "shake" ? <ShakeToPair uploadId={uploadId} onPaired={finish} /> : null}
        </>
      )}
    </ScrollView>
  );
}

// ---------------- show a QR + share the invite link ----------------
function ShowCode({ uploadId, onPaired }) {
  const toast = useToast();
  const [code, setCode] = useState(null);
  const [err, setErr] = useState(null);
  const [now, setNow] = useState(Date.now());

  const make = useCallback(async () => {
    setErr(null);
    setCode(null);
    try {
      setCode(await Api.pairCode(uploadId));
    } catch (e) {
      setErr(e.message);
    }
  }, [uploadId]);

  useEffect(() => {
    make();
  }, [make]);

  // Watch for the other person scanning it.
  useEffect(() => {
    if (!code) return;
    const id = setInterval(async () => {
      setNow(Date.now());
      if (Date.now() / 1000 > code.expires_at) return clearInterval(id);
      try {
        const st = await Api.pairPreview(code.code);
        if (st.used && st.other) {
          clearInterval(id);
          onPaired(st);
        }
      } catch (e) {
        /* transient; keep polling */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [code, onPaired]);

  if (err) {
    return (
      <Card style={{ marginTop: 16 }}>
        <Text style={{ color: colors.bad }}>{err}</Text>
        <Button title="Try again" variant="ghost" onPress={make} style={{ marginTop: 10 }} />
      </Card>
    );
  }
  if (!code) return <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />;

  const left = Math.max(0, Math.round(code.expires_at - now / 1000));
  const expired = left <= 0;
  const pretty = code.code.replace(/(.{5})(.{5})/, "$1 $2");
  return (
    <View style={{ alignItems: "center", marginTop: 18 }}>
      <View style={{ padding: 14, backgroundColor: "#fff", borderRadius: 16, opacity: expired ? 0.25 : 1 }}>
        <QRCode value={code.url} size={220} backgroundColor="#ffffff" color="#0b1220" />
      </View>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: 2, marginTop: 14 }} selectable>
        {pretty}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }}>
        {expired ? "This code expired." : `Ask them to scan it in CrossPaths · valid ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
      </Text>
      {expired ? (
        <Button title="New code" onPress={make} style={{ marginTop: 14, alignSelf: "stretch" }} />
      ) : (
        <Button
          title="Share invite link"
          variant="ghost"
          style={{ marginTop: 14, alignSelf: "stretch" }}
          onPress={async () => {
            try {
              // The share sheet includes AirDrop on iPhone and Quick Share / Nearby Share on Android.
              await Share.share({ message: `Connect with me on CrossPaths and check if our paths crossed: ${code.url}` });
            } catch (e) {
              toast("Couldn't open the share sheet", true);
            }
          }}
        />
      )}
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10, textAlign: "center", lineHeight: 17 }}>
        Single use. The link works for someone on the same CrossPaths server as you.
      </Text>
    </View>
  );
}

// ---------------- scan a QR (or type the code) ----------------
function ScanCode({ uploadId, initialCode, onPaired }) {
  const toast = useToast();
  const [perm, requestPerm] = useCameraPermissions();
  const [typed, setTyped] = useState("");
  const [preview, setPreview] = useState(null); // { code, from, they_have_timeline, ... }
  const [busy, setBusy] = useState(false);
  const scanning = useRef(true);
  const rejected = useRef({ data: null, at: 0 }); // last code we refused, so a QR left in view doesn't loop

  const look = useCallback(
    async (raw, fromCamera) => {
      if (fromCamera && rejected.current.data === raw && Date.now() - rejected.current.at < 4000) return;
      const reject = () => {
        rejected.current = { data: raw, at: Date.now() };
      };
      const code = codeFrom(raw);
      if (!code) {
        reject();
        toast("That isn't a CrossPaths code", true);
        return;
      }
      scanning.current = false;
      setBusy(true);
      try {
        const p = await Api.pairPreview(code);
        if (p.mine) throw new Error("That's your own code. The other person needs to scan it.");
        setPreview({ ...p, code });
      } catch (e) {
        reject();
        toast(e.message, true);
        scanning.current = true;
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (initialCode) look(initialCode);
  }, [initialCode]);

  async function connect() {
    setBusy(true);
    try {
      onPaired(await Api.pairRedeem(preview.code, uploadId));
    } catch (e) {
      toast(e.message, true);
      setBusy(false);
    }
  }

  if (preview) {
    return (
      <Card style={{ marginTop: 16 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>Connect with @{preview.from}?</Text>
        <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
          {preview.they_have_timeline
            ? uploadId
              ? `You'll be connected and your paths checked right away (within ${preview.radius_m} m and ${preview.window_min} min). They'll only see when and roughly where you crossed.`
              : "You'll be connected. No check will run until you upload a timeline."
            : `You'll be connected. @${preview.from} hasn't uploaded a timeline, so no check will run yet.`}
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <Button title="Cancel" variant="ghost" onPress={() => { setPreview(null); scanning.current = true; }} disabled={busy} />
          <Button title={preview.they_have_timeline && uploadId ? "Connect & check" : "Connect"} onPress={connect} loading={busy} style={{ flex: 1 }} />
        </View>
      </Card>
    );
  }

  return (
    <View style={{ marginTop: 16 }}>
      {!perm ? (
        <ActivityIndicator color={colors.accent} />
      ) : !perm.granted ? (
        <Card>
          <Text style={{ color: colors.text }}>CrossPaths needs the camera to scan the other person's code.</Text>
          <Button title="Allow camera" onPress={requestPerm} style={{ marginTop: 10 }} />
        </Card>
      ) : (
        <View style={{ height: 300, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              if (scanning.current && !busy) look(data, true);
            }}
          />
          {busy ? (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#0008" }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}
        </View>
      )}
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 16, marginBottom: 6 }}>Or type their code</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="ABCDE 12345"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={() => look(typed)}
          style={{ flex: 1, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 11, color: colors.text, letterSpacing: 1.5 }}
        />
        <Button title="Go" onPress={() => look(typed)} disabled={!typed.trim() || busy} />
      </View>
    </View>
  );
}

// ---------------- shake phones together ----------------
const SHAKE_G = 1.9; // acceleration (in g; resting = 1) that counts as a jolt...
const SETTLE_G = 1.3; // ...the reading must drop back below this between jolts...
const SHAKE_PEAKS = 2; // ...and this many separate jolts...
const SHAKE_WITHIN_MS = 1000; // ...within this long make a shake (one knock isn't)

function ShakeToPair({ uploadId, onPaired }) {
  const [perm, setPerm] = useState(null); // null | granted | denied
  const [fix, setFix] = useState(null); // latest location
  const [state, setState] = useState("ready"); // ready | sending | waiting | ambiguous | timeout | error
  const [msg, setMsg] = useState("");
  const peaks = useRef([]);
  const armed = useRef(true); // false until the reading settles after a jolt
  const busy = useRef(false);
  const fixRef = useRef(null);

  // Location first: shakes are matched by time AND place, and a GPS fix can take a few seconds,
  // so start getting one as soon as this tab opens rather than at the moment of the shake.
  useEffect(() => {
    let sub = null;
    let cancelled = false;
    (async () => {
      const p = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (p.status !== "granted") return setPerm("denied");
      setPerm("granted");
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (cancelled) return;
      if (last) {
        fixRef.current = last;
        setFix(last);
      }
      const s = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 }, (loc) => {
        fixRef.current = loc;
        setFix(loc);
      });
      if (cancelled) s.remove(); // the tab closed while we were starting: stop GPS right away
      else sub = s;
    })();
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, []);

  const send = useCallback(async () => {
    const loc = fixRef.current;
    if (!loc || busy.current) return;
    busy.current = true;
    setState("sending");
    Vibration.vibrate(40);
    try {
      let r = await Api.shake(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy || 50, uploadId);
      const started = Date.now();
      setState("waiting");
      while (r.status === "waiting" && Date.now() - started < 12000) {
        await new Promise((res) => setTimeout(res, 700));
        r = await Api.shakeStatus(r.id);
      }
      if (r.status === "paired") return onPaired(r);
      setState(r.status === "ambiguous" ? "ambiguous" : "timeout");
    } catch (e) {
      setState("error");
      setMsg(e.message);
    } finally {
      busy.current = false;
    }
  }, [uploadId, onPaired]);

  useEffect(() => {
    if (perm !== "granted") return;
    Accelerometer.setUpdateInterval(60);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      if (busy.current) return;
      const g = Math.sqrt(x * x + y * y + z * z);
      if (g < SETTLE_G) armed.current = true;
      if (g < SHAKE_G || !armed.current) return;
      armed.current = false;
      const now = Date.now();
      peaks.current = [...peaks.current.filter((t) => now - t < SHAKE_WITHIN_MS), now];
      if (peaks.current.length >= SHAKE_PEAKS) {
        peaks.current = [];
        send();
      }
    });
    return () => sub.remove();
  }, [perm, send]);

  if (perm === "denied") {
    return (
      <Card style={{ marginTop: 16 }}>
        <Text style={{ color: colors.text, lineHeight: 20 }}>
          Shaking needs your location, so the server can tell your two phones were together. Allow location for CrossPaths in
          your phone's settings, or use the QR code instead.
        </Text>
      </Card>
    );
  }

  const status = {
    ready: fix ? "Hold your phones side by side and shake them together." : "Finding your location…",
    sending: "Shaken! Looking for the other phone…",
    waiting: "Looking for the other phone… keep this screen open.",
    ambiguous: "Several people shook at the same moment nearby. Use the QR code instead, so you connect with the right person.",
    timeout: "Didn't find the other phone. Shake again at the same moment - or use the QR code.",
    error: msg,
  }[state];

  return (
    <View style={{ alignItems: "center", marginTop: 24 }}>
      <Icon name={state === "waiting" || state === "sending" ? "nearby" : "people"} size={64} color={colors.accent} strokeWidth={1.5} />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center", marginTop: 12, lineHeight: 22 }}>{status}</Text>
      {state === "waiting" || state === "sending" ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
      {fix ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>Location ready (±{Math.round(fix.coords.accuracy || 0)} m)</Text>
      ) : null}
      {(state === "timeout" || state === "ambiguous" || state === "error") && fix ? (
        <Button title="I shook - try again" variant="ghost" onPress={() => { setState("ready"); send(); }} style={{ marginTop: 14, alignSelf: "stretch" }} />
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 16, textAlign: "center", lineHeight: 17 }}>
        Both of you need this screen open and an internet connection to your CrossPaths server. Your location is used only to
        match the two shakes and is deleted within minutes.
      </Text>
    </View>
  );
}

// ---------------- what happened ----------------
function PairResult({ result, navigation, onAgain }) {
  const [check, setCheck] = useState(result.check);

  useEffect(() => {
    if (!check || check.status !== "running") return;
    const id = setInterval(async () => {
      try {
        const c = await Api.getCheck(check.id);
        setCheck(c);
        if (c.status !== "running") clearInterval(id);
      } catch (e) {
        /* keep trying */
      }
    }, 1500);
    return () => clearInterval(id);
  }, [check && check.id, check && check.status]);

  return (
    <Card style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="ok" size={22} color={colors.good} />
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", flexShrink: 1 }}>Connected with @{result.other}</Text>
      </View>
      {result.note ? <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>{result.note}</Text> : null}
      {check ? (
        check.status === "running" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted }}>Checking where your paths crossed…</Text>
          </View>
        ) : check.status === "done" ? (
          <>
            <Text style={{ color: colors.text, marginTop: 12, fontSize: 15 }}>
              {check.events_count ? `${check.events_count} crossing${check.events_count === 1 ? "" : "s"} found` : "Your paths never crossed"}
            </Text>
            {check.events_count ? (
              <Button
                title="View crossings"
                onPress={() => {
                  navigation.goBack();
                  navigation.navigate("Results", { checkId: check.id });
                }}
                style={{ marginTop: 12 }}
              />
            ) : null}
          </>
        ) : (
          <Text style={{ color: colors.bad, marginTop: 12 }}>{check.error || "The check couldn't run."}</Text>
        )
      ) : null}
      <Button title="Meet someone else" variant="ghost" onPress={onAgain} style={{ marginTop: 12 }} />
    </Card>
  );
}
