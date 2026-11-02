// Phone number -> code sent by WhatsApp -> onVerified(phone, code).
// Used to sign in / sign up (AuthScreen) and to add a number to an account (AccountScreen).
import React, { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import Button from "./Button";
import { useToast } from "./Toast";
import { Api } from "../api";
import { colors } from "../theme";

const RESEND_S = 60;

export default function PhoneCodeForm({ onVerified, submitTitle = "Continue" }) {
  const toast = useToast();
  const [phone, setPhone] = useState("+");
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    setBusy(true);
    try {
      await Api.phoneStart(phone, "en");
      setSentTo(phone);
      setCode("");
      setWait(RESEND_S);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      await onVerified(sentTo, code);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <View>
        <Label>Phone number, with country code</Label>
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="+966 55 123 4567" onSubmitEditing={send} />
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>We'll send a sign-in code to this number on WhatsApp.</Text>
        <Button title="Send code" onPress={send} loading={busy} style={{ marginTop: 14 }} />
      </View>
    );
  }
  return (
    <View>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Enter the 6-digit code we sent on WhatsApp to <Text style={{ color: colors.text, fontWeight: "700" }}>{sentTo}</Text>.
      </Text>
      <Input value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} placeholder="123456" onSubmitEditing={verify} autoFocus />
      <Button title={submitTitle} onPress={verify} loading={busy} disabled={code.length < 6} style={{ marginTop: 14 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
        <Text onPress={() => setSentTo(null)} style={{ color: colors.accent2 }}>Change number</Text>
        <Text onPress={wait || busy ? undefined : send} style={{ color: wait ? colors.muted : colors.accent2 }}>
          {wait ? `Resend in ${wait}s` : "Resend code"}
        </Text>
      </View>
    </View>
  );
}

function Label({ children }) {
  return <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 5, marginTop: 12 }}>{children}</Text>;
}

function Input(props) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.muted}
      style={{ backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, color: colors.text, marginTop: 6 }}
    />
  );
}
