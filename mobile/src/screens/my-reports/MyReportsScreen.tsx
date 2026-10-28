import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StatusChip } from '../../components/StatusChip';
import { mockReports } from '../../mocks/reports';
import { colors, fontSize, radius } from '../../theme';
import { formatDate } from '../../utils/date';

export default function MyReportsScreen() {
  const nav = useNavigation<any>();
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={mockReports}
      keyExtractor={(r) => String(r.id)}
      ListEmptyComponent={<Text style={styles.empty}>Заявок пока нет. Нажмите «Новая заявка», чтобы сообщить о яме.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => nav.navigate('ReportDetails', { id: item.id })}>
          <View>
            <Text style={styles.address}>{item.address}</Text>
            <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
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
});
