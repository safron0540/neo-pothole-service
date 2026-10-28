import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusChip } from '../../components/StatusChip';
import { mockReports } from '../../mocks/reports';
import { colors, fontSize, radius } from '../../theme';
import { formatDate, formatTime } from '../../utils/date';

// TODO по ЧТЗ (REQ-ЯР-028): карта с местом, фото «после», причина отклонения, пометка об объединении.
export default function ReportDetailsScreen() {
  const { params } = useRoute<any>();
  const report = mockReports.find((r) => r.id === params?.id);

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Детали заявки" />
      {!report ? (
        <Text style={styles.empty}>Заявка не найдена</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Карточка заявки ID {report.id}</Text>
            <StatusChip status={report.status} />
          </View>
          <Text style={styles.sub}>Подано {formatDate(report.createdAt)} в {formatTime(report.createdAt)}</Text>

          <View style={styles.photo}><Ionicons name="image-outline" size={44} color={colors.primary} /></View>

          <Text style={styles.line}>Адрес дефекта: <Text style={styles.bold}>{report.address}</Text></Text>
          <Text style={styles.line}>Класс ямы: <Text style={styles.bold}>{report.defectClass}</Text></Text>

          <View style={styles.historyHead}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.historyTitle}>История статусов</Text>
          </View>
          {report.history.map((e) => (
            <View key={e.at + e.text} style={styles.event}>
              <View style={styles.eventDot} />
              <Text style={styles.eventText}>{formatTime(e.at)} — {e.text}</Text>
            </View>
          ))}

          <View style={styles.comment}>
            <Text style={styles.commentText}>{report.comment ?? 'Комментарий отсутствует.'}</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  content: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textMuted },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  sub: { fontSize: fontSize.xs + 1, color: colors.textMuted },
  photo: { height: 190, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  line: { fontSize: fontSize.sm, color: colors.textMuted },
  bold: { color: colors.text },
  historyHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  historyTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  event: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  eventText: { flex: 1, fontSize: fontSize.xs + 1, color: colors.textMuted },
  comment: { backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: 14, marginTop: 10 },
  commentText: { fontSize: fontSize.sm, color: colors.textMuted },
});
