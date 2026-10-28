import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}

export function Button({ title, onPress, disabled, variant = 'primary' }: Props) {
  const outline = variant === 'outline';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        outline ? styles.outline : { backgroundColor: disabled ? colors.disabled : colors.primary },
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Text style={[styles.text, outline && { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48, minWidth: 180, borderRadius: radius.md, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 24, alignSelf: 'center',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  outline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary, elevation: 0, shadowOpacity: 0 },
  text: { color: colors.white, fontSize: fontSize.md, fontWeight: '600' },
});
