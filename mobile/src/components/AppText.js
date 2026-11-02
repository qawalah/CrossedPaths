// Every piece of text in the app is set in IBM Plex Sans Arabic (SIL OFL 1.1), which covers Arabic and Latin.
// Android picks a bundled font by file name and ignores fontWeight for it, so the weight chooses the file
// (assets/fonts/IBMPlexSansArabic-*.ttf). Use these in place of react-native's Text and TextInput.
import React, { createContext, forwardRef, useContext } from "react";
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from "react-native";

const FACES = {
  400: "IBMPlexSansArabic-Regular",
  500: "IBMPlexSansArabic-Medium",
  600: "IBMPlexSansArabic-SemiBold",
  700: "IBMPlexSansArabic-Bold",
};

/** The bundled face for a fontWeight ("bold", "800", 600…); the family has 400–700, heavier maps to Bold. */
export function fontFor(weight) {
  const w = weight === "bold" ? 700 : parseInt(weight, 10) || 400;
  return w >= 700 ? FACES[700] : w >= 600 ? FACES[600] : w >= 500 ? FACES[500] : FACES[400];
}

// Text nested in Text inherits its parent's face unless it sets its own weight.
const Nested = createContext(false);

function faced(style, nested) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily || (nested && flat.fontWeight == null)) return style;
  return [style, { fontFamily: fontFor(flat.fontWeight), fontWeight: "normal" }];
}

export const Text = forwardRef(function Text(props, ref) {
  const nested = useContext(Nested);
  const el = <RNText ref={ref} {...props} style={faced(props.style, nested)} />;
  return nested ? el : <Nested.Provider value>{el}</Nested.Provider>;
});

export const TextInput = forwardRef(function TextInput(props, ref) {
  return <RNTextInput ref={ref} {...props} style={faced(props.style, false)} />;
});
