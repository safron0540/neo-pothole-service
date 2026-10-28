import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, fontSize, radius } from '../theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error ? { borderColor: colors.primary } : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: fontSize.xs + 1, color: colors.textMuted, marginBottom: 4 },
  input: {
    height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, fontSize: fontSize.sm, color: colors.text, backgroundColor: colors.white,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 2 },
  },
  error: { color: colors.primary, fontSize: fontSize.xs + 1, marginTop: 4 },
});
