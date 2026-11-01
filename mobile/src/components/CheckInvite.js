import React from "react";
import { Text, View } from "react-native";
import { colors } from "../theme";
import Button from "./Button";
import Card from "./Card";
import PulseRings from "./PulseRings";
import { CrossIcon } from "./TabIcon";

/** The Checks tab's invitation: a pulsing mark plus a button per person you haven't checked with yet. */
export default function CheckInvite({ j, uploads, navigation }) {
  let title;
  let text;
  let actions;
  if (j.review) {
    title = `@${j.review.other} wants to check paths`;
    text = "Review it and agree, and the check runs straight away.";
    actions = [{ key: "r", title: "Review", go: () => navigation.navigate("ReviewCheck", { checkId: j.review.id }) }];
  } else if (uploads.length && j.fresh.length) {
    const who = j.fresh.slice(0, 3);
    title = "Run a check";
    text = `Did your paths ever cross? ${j.fresh.length === 1 ? `Ask @${who[0].other}` : "Pick someone"}; it runs once you both agree.`;
    actions = who.map((c) => ({ key: c.id, title: `Check with @${c.other}`, go: () => navigation.navigate("NewCheck", { connectionId: c.id, other: c.other }) }));
    if (j.fresh.length > 3) actions.push({ key: "more", title: "More people", ghost: true, go: () => navigation.navigate("People") });
  } else return null;

  return (
    <Card style={{ flexDirection: "row", gap: 14, alignItems: "flex-start", marginBottom: 10 }}>
      <View style={{ padding: 2 }}>
        <PulseRings size={52} color={colors.accent} ringWidth={2.5} active>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
            <CrossIcon color={colors.onAccent} />
          </View>
        </PulseRings>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>{text}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {actions.map((a) => (
            <Button key={a.key} title={a.title} variant={a.ghost ? "ghost" : "primary"} onPress={a.go} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }} />
          ))}
        </View>
      </View>
    </Card>
  );
}
