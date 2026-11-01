import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useRef, useState } from "react";
import { Animated, FlatList, LayoutAnimation, Platform, Pressable, Text, UIManager, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import CrossingHero from "../components/CrossingHero";
import Icon from "../components/Icon";
import JourneyFlow from "../components/JourneyFlow";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import { journey } from "../journey";
import { EASE_OUT, reduceMotion } from "../motion";
import { colors, dateStr } from "../theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

/** What the big crossing invites you to do right now. */
function heroState(j, data, navigation) {
  const go = (name, params) => () => navigation.navigate(name, params);
  const inc = data.connections.find((c) => c.direction === "incoming" && c.status === "pending");
  if (j.review) {
    const review = go("ReviewCheck", { checkId: j.review.id });
    return { title: `@${j.review.other} wants to check paths`, text: "Agree, and the check runs straight away. They'll only see when and roughly where you crossed.", actions: [{ title: "Review", go: review }], tap: review };
  }
  if (j.has.upload && j.fresh.length) {
    const who = j.fresh.slice(0, 3);
    const ask = (c) => go("NewCheck", { connectionId: c.id, other: c.other });
    const actions = who.map((c) => ({ title: `Check with @${c.other}`, go: ask(c) }));
    if (j.fresh.length > 3) actions.push({ title: "More people", go: go("People"), ghost: true });
    return {
      title: "Did your paths ever cross?",
      text: j.fresh.length === 1 ? `Tap to ask @${who[0].other}. The check runs once you both agree.` : "Pick someone. The check runs once you both agree.",
      actions,
      tap: ask(who[0]),
    };
  }
  if (j.running) return { title: "Checking…", text: `Finding where your paths crossed with @${j.running.other}.`, actions: [] };
  if (!j.has.upload) {
    const imp = go("Build", { start: "files" });
    return { title: "Import your timeline first", text: "Then connect with someone and see if your paths ever crossed.", actions: [{ title: "Import", go: imp }], tap: imp };
  }
  if (!j.has.connect)
    return {
      title: inc ? `@${inc.other} wants to connect` : "Connect with someone",
      text: inc ? "Accept their request, then check where your paths crossed." : "Send a request by username or meet in person, then run a check together.",
      actions: [{ title: inc ? "See request" : "Find people", go: go("People") }],
      tap: go("People"),
    };
  if (j.waiting) return { title: `Waiting for @${j.waiting.other}`, text: "The check runs as soon as they agree.", actions: [] };
  return {
    title: "Did our paths ever cross?",
    text: "You've checked with everyone you're connected to. Connect with someone new to check again.",
    actions: [{ title: "Find people", go: go("People"), ghost: true }],
    tap: go("People"),
  };
}

export default function ChecksScreen({ navigation, data }) {
  const { checks, refresh } = data;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const j = journey(data);
  const hero = heroState(j, data, navigation);

  // Play the crossing each time the tab opens (not when the data refreshes in the background).
  const focused = useIsFocused();
  const [playKey, setPlayKey] = useState(0);
  const textIn = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!focused) return;
    setPlayKey((k) => k + 1);
    if (reduceMotion()) return textIn.setValue(1);
    textIn.setValue(0);
    Animated.timing(textIn, { toValue: 1, duration: 500, delay: 1350, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [focused]);

  const [open, setOpen] = useState(() => new Set());
  function toggle(id) {
    if (!reduceMotion()) LayoutAnimation.configureNext(LayoutAnimation.create(320, "easeInEaseOut", "opacity"));
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function remove(id) {
    if (!(await confirm("Delete this check?", "Its results are deleted for both of you."))) return;
    try {
      await Api.deleteCheck(id);
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 40 }}
      data={checks}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View>
          {/* the big crossing says what to do, so the strip shows the steps without its hint */}
          <JourneyFlow data={data} navigation={navigation} hideHint />
          <CrossingHero
            width={Math.min(300, width * 0.82)}
            playKey={playKey}
            invite={j.invite}
            onPress={hero.tap}
            accessibilityLabel={hero.title}
          />
          <Animated.View
            style={{
              alignItems: "center",
              marginTop: 4,
              opacity: textIn,
              transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            }}
          >
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800", textAlign: "center" }}>{hero.title}</Text>
            <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20, textAlign: "center", maxWidth: 300 }}>{hero.text}</Text>
            {hero.actions.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 }}>
                {hero.actions.map((a) => (
                  <Button key={a.title} title={a.title} variant={a.ghost ? "ghost" : "primary"} onPress={a.go} />
                ))}
              </View>
            ) : null}
          </Animated.View>
          {checks.length ? (
            <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700", marginTop: 28, marginBottom: 2, marginLeft: 4 }}>Previous checks</Text>
          ) : null}
        </View>
      }
      renderItem={({ item: c }) => (
        <CheckRow
          c={c}
          open={open.has(c.id)}
          onToggle={() => toggle(c.id)}
          onReview={() => navigation.navigate("ReviewCheck", { checkId: c.id })}
          onResults={() => navigation.navigate("Results", { checkId: c.id })}
          onDelete={() => remove(c.id)}
        />
      )}
    />
  );
}

/** One previous check: a short line, and the details and actions when tapped open. */
function CheckRow({ c, open, onToggle, onReview, onResults, onDelete }) {
  const spin = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(spin, { toValue: open ? 1 : 0, duration: reduceMotion() ? 0 : 320, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [open]);

  const mine = c.status === "awaiting_consent" && !c.my_consent;
  const n = c.events_count;
  const short =
    {
      awaiting_consent: mine ? "Waiting for you to agree" : "Waiting for them to agree",
      running: "Checking…",
      done: n ? `${n} crossing${n > 1 ? "s" : ""}` : "No crossings found",
      failed: "Didn't run",
      declined: "Declined",
    }[c.status] || "Expired";
  let more = null;
  if (c.status === "awaiting_consent")
    more = mine
      ? `@${c.other} wants to check paths with you.`
      : `Waiting for @${c.other} to agree. The request expires in ${Math.max(1, Math.round((c.expires_at * 1000 - Date.now()) / 86400000))} d.`;
  else if (c.status === "running") more = "Finding where your paths crossed…";
  else if (c.status === "failed") more = c.error || "Something went wrong. Import again and retry.";

  const small = { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 };
  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: open ? colors.accent : colors.line,
        borderRadius: 16,
        marginVertical: 5,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`@${c.other}, ${short}`}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: pressed ? colors.pressed : "transparent" })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.panel2,
            borderWidth: 1,
            borderColor: colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 15 }}>{c.other.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>@{c.other}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 1 }}>{short}</Text>
        </View>
        <Pill label={c.status.replace("_", " ")} level={c.status} />
        <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}>
          <Icon name="next" size={18} color={colors.muted} style={{ transform: [{ rotate: "90deg" }] }} />
        </Animated.View>
      </Pressable>
      {open ? (
        <View style={{ paddingLeft: 60, paddingRight: 14, paddingBottom: 14, gap: 3 }}>
          {more ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{more}</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            Within {c.radius_m} m and {c.window_min} min{c.created_at ? ` · started ${dateStr(c.created_at)}` : ""}
          </Text>
          {c.status === "done" && c.results_expire ? (
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>Results kept until {dateStr(c.results_expire)}</Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {c.status === "done" ? <Button title="View crossings" onPress={onResults} style={small} /> : null}
            {mine ? <Button title="Review" onPress={onReview} style={small} /> : null}
            <Button title="Delete" variant="ghost" onPress={onDelete} style={small} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
