import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { colors, UI_LOCALE } from "../theme";

function fmt(d) {
  return d ? d.toLocaleDateString(UI_LOCALE, { day: "numeric", month: "short", year: "numeric" }) : "Any";
}

// The picker returns the chosen day at the current clock time; a range means whole days.
function wholeDay(date, field) {
  const d = new Date(date);
  if (field === "from") d.setHours(0, 0, 0, 0);
  else d.setHours(23, 59, 59, 999);
  return d;
}

// Two "From" / "To" fields; tapping opens the platform's native date picker.
// Android: opened imperatively, so the app's background refresh (which re-renders this
// screen every few seconds) can't reset the open dialog back to today.
// iOS: an inline calendar whose starting value is frozen when it opens, for the same reason.
export default function DateRangePicker({ from, to, onChangeFrom, onChangeTo }) {
  const [iosField, setIosField] = useState(null); // "from" | "to" | null
  const [iosValue, setIosValue] = useState(new Date());

  function commit(field, date) {
    (field === "from" ? onChangeFrom : onChangeTo)(wholeDay(date, field));
  }

  function open(field) {
    const current = (field === "from" ? from : to) || new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "set" && date) commit(field, date);
        },
      });
    } else {
      setIosValue(current);
      setIosField(field);
    }
  }

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="From" value={fmt(from)} onPress={() => open("from")} onClear={from ? () => onChangeFrom(null) : null} />
        <Field label="To" value={fmt(to)} onPress={() => open("to")} onClear={to ? () => onChangeTo(null) : null} />
      </View>
      {Platform.OS === "ios" && iosField ? (
        <View>
          <DateTimePicker
            value={iosValue}
            mode="date"
            display="inline"
            themeVariant="dark"
            onChange={(event, date) => {
              if (!date) return;
              setIosValue(date);
              commit(iosField, date);
            }}
          />
          <Pressable onPress={() => setIosField(null)} style={{ alignSelf: "flex-end", padding: 8 }}>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Field({ label, value, onPress, onClear }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: colors.panel2,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        padding: 11,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 11.5 }}>{label}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.text, marginTop: 2 }}>{value}</Text>
        {onClear ? (
          <Text onPress={onClear} style={{ color: colors.accent2, fontSize: 12 }}>
            clear
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
