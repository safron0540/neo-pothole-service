import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from './Logo';
import { useAuth } from '../store/AuthContext';
import { colors } from '../theme';
import { errorMessage } from '../api';

// Шапка главных экранов. Иконка профиля пока выходит из аккаунта (поведение уточнить).
export function AppHeader() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Не удалось завершить сеанс на сервере', errorMessage(error));
    }
  }
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Logo />
      <Pressable accessibilityLabel="Профиль" onPress={handleSignOut} hitSlop={10}>
        <Ionicons name="person-circle-outline" size={32} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8, backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
});
