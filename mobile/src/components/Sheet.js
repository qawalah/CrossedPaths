import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";

/** A bottom sheet: dimmed backdrop (tap to close) + a scrollable panel. */
export default function Sheet({ visible, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} />
        <View
          style={{
            maxHeight: "88%",
            backgroundColor: colors.panel,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 1,
            borderColor: colors.line,
          }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: "center", marginTop: 10 }} />
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 22 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
