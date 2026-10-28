import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Item({ label, icon, active, onPress }: { label: string; icon: IconName; active?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.item}>
      <View style={[styles.iconBox, active && styles.iconBoxOn]}>
        <Ionicons name={icon} size={24} color={active ? colors.white : colors.text} />
      </View>
      <Text style={[styles.label, active && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

// «Новая заявка» — кнопка в меню, открывает экран камеры (REQ-ЯР-025, УД-1).
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index].name;
  const bottomPadding = Platform.OS === 'web' ? Math.max(insets.bottom, 22) + 6 : insets.bottom + 6;
  return (
    <View style={[styles.bar, { paddingBottom: bottomPadding }]}>
      <Item label="Карта" icon="location-outline" active={current === 'Map'} onPress={() => navigation.navigate('Map')} />
      <Item label="Новая заявка" icon="add" onPress={() => (navigation as any).navigate('NewReport')} />
      <Item label="Мои заявки" icon="home-outline" active={current === 'MyReports'} onPress={() => navigation.navigate('MyReports')} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  item: { alignItems: 'center', minWidth: 90 },
  iconBox: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  iconBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: fontSize.xs, color: colors.text, marginTop: 4 },
});
