import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppHeader } from '../components/AppHeader';
import { TabBar } from '../components/TabBar';
import { useAuth } from '../store/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import MapScreen from '../screens/map/MapScreen';
import MyReportsScreen from '../screens/my-reports/MyReportsScreen';
import NewReportScreen from '../screens/create-report/NewReportScreen';
import ReportDetailsScreen from '../screens/report-details/ReportDetailsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  return (
    <Tab.Navigator
      initialRouteName="Map"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ header: () => <AppHeader /> }}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="MyReports" component={MyReportsScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { isAuthed } = useAuth();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthed ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="NewReport" component={NewReportScreen} />
            <Stack.Screen name="ReportDetails" component={ReportDetailsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
