import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { View } from "react-native";
import TabBar from "../components/TabBar";
import TabScene from "../components/TabScene";
import ThemeToggle from "../components/ThemeToggle";
import { journey } from "../journey";
import AccountScreen from "../screens/AccountScreen";
import ChecksScreen from "../screens/ChecksScreen";
import MyMapScreen from "../screens/MyMapScreen";
import PeopleScreen from "../screens/PeopleScreen";
import TimelineScreen from "../screens/TimelineScreen";

const Tab = createBottomTabNavigator();

export default function MainTabs({ data }) {
  const jr = journey(data);
  const invite = jr.invite; // pulse only for someone newly added you've never checked with (requests get the badge)
  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} invite={invite} badges={{ Checks: data.pendingForMe || undefined }} />}
    >
      <Tab.Screen name="Timeline">
        {(props) => (
          <TabScene index={0}>
            <TimelineScreen {...props} data={data} />
          </TabScene>
        )}
      </Tab.Screen>
      {/* five tabs: Import · My Map · Checks (raised, in the middle) · People · Account */}
      <Tab.Screen name="MyMap">
        {(props) => (
          <TabScene index={1}>
            <MyMapScreen {...props} data={data} />
          </TabScene>
        )}
      </Tab.Screen>
      <Tab.Screen name="Checks">
        {(props) => (
          <TabScene index={2}>
            <ChecksScreen {...props} data={data} />
          </TabScene>
        )}
      </Tab.Screen>
      <Tab.Screen name="People">
        {(props) => (
          <TabScene index={3}>
            <PeopleScreen {...props} data={data} uploads={data.uploads} />
          </TabScene>
        )}
      </Tab.Screen>
      <Tab.Screen name="Account">
        {(props) => (
          <TabScene index={4}>
            <AccountScreen {...props} />
          </TabScene>
        )}
      </Tab.Screen>
    </Tab.Navigator>
    {/* light/dark switch, at the top of every tab */}
    <ThemeToggle />
    </View>
  );
}
