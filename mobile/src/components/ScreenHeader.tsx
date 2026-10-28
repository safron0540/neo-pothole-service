import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize } from '../theme';

// Шапка вторичных экранов: красная стрелка назад и заголовок по центру.
export function ScreenHeader({ title }: { title: string }) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityLabel="Назад" onPress={() => nav.goBack()} hitSlop={12} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center', justifyContent: 'center', paddingBottom: 12, backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  back: { position: 'absolute', left: 16, bottom: 12 },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
});
