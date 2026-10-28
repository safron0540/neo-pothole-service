import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { errorMessage, listMyRequests } from '../../api';
import { StatusChip } from '../../components/StatusChip';
import type { Report } from '../../types';
import { colors, fontSize, radius } from '../../theme';
import { formatDate } from '../../utils/date';

export default function MyReportsScreen() {
  const nav = useNavigation<any>();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    listMyRequests(50, 0)
      .then((page) => {
        if (active) {
          setReports(page.items);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []));

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={reports}
      keyExtractor={(r) => String(r.id)}
      ListHeaderComponent={loading ? <ActivityIndicator color={colors.primary} /> : error ? <Text style={styles.error}>{error}</Text> : null}
      ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>Заявок пока нет. Нажмите «Новая заявка», чтобы сообщить о яме.</Text> : null}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => nav.navigate('ReportDetails', { id: item.id })}>
          <View>
            <Text style={styles.address}>{item.address ?? `Заявка №${item.id}`}</Text>
            {item.createdAt && <Text style={styles.date}>{formatDate(item.createdAt)}</Text>}
          </View>
          <StatusChip status={item.status} wide />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.white },
  content: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
  },
  address: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  date: { fontSize: fontSize.sm, color: colors.text, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 48, fontSize: fontSize.sm },
  error: { textAlign: 'center', color: colors.primary, fontSize: fontSize.sm },
});
