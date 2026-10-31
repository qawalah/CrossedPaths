import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { Text, View } from "react-native";
import AccountScreen from "../screens/AccountScreen";
import ChecksScreen from "../screens/ChecksScreen";
import PeopleScreen from "../screens/PeopleScreen";
import TimelineScreen from "../screens/TimelineScreen";
import { colors } from "../theme";

const Tab = createBottomTabNavigator();

const ICONS = { Timeline: "🗺️", People: "👥", Checks: "✅", Account: "⚙️" };

export default function MainTabs({ data }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.line },
        tabBarIcon: () => <Text style={{ fontSize: 18 }}>{ICONS[route.name]}</Text>,
        tabBarBadge: route.name === "Checks" && data.pendingForMe ? data.pendingForMe : undefined,
      })}
    >
      <Tab.Screen name="Timeline">{(props) => <TimelineScreen {...props} data={data} />}</Tab.Screen>
      <Tab.Screen name="People">
        {(props) => <PeopleScreen {...props} data={data} uploads={data.uploads} />}
      </Tab.Screen>
      <Tab.Screen name="Checks">{(props) => <ChecksScreen {...props} data={data} />}</Tab.Screen>
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}
