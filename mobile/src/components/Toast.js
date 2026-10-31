import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const timeoutRef = useRef(null);

  const show = useCallback(
    (message, isError) => {
      setToast({ message, isError });
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
      }, isError ? 4500 : 2400);
    },
    [opacity]
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: insets.bottom + 90,
            opacity,
            backgroundColor: colors.toast,
            borderWidth: 1,
            borderColor: toast.isError ? colors.badBorder : colors.line,
            borderRadius: 12,
            padding: 13,
          }}
        >
          <Text style={{ color: toast.isError ? colors.badText : colors.text }}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
