import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

// Временный логотип. Заменить на SVG из Figma.
export function Logo({ size = 'small' }: { size?: 'small' | 'large' }) {
  const big = size === 'large';
  return (
    <View style={styles.row}>
      <View style={[styles.mark, big && styles.markBig]} />
      <View>
        <Text style={[styles.title, big && styles.titleBig]}>NEO-СЕРВИС:</Text>
        <Text style={[styles.title, big && styles.titleBig]}>ЯМОЧНЫЙ РЕМОНТ</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 26, height: 30, backgroundColor: colors.primary, borderRadius: 4 },
  markBig: { width: 52, height: 60, borderRadius: 8 },
  title: { fontSize: 11, fontWeight: '800', color: colors.text, lineHeight: 13 },
  titleBig: { fontSize: 20, lineHeight: 24 },
});
