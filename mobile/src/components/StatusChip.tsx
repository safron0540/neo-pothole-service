import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, statusColors } from '../theme';
import type { ReportStatus } from '../types';

export function StatusChip({ status, wide }: { status: ReportStatus; wide?: boolean }) {
  return (
    <View style={[styles.chip, wide && styles.wide, { backgroundColor: statusColors[status] }]}>
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, alignItems: 'center' },
  wide: { minWidth: 88 },
  text: { color: colors.white, fontSize: fontSize.xs, fontWeight: '600' },
});
