import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { mockReports } from '../../mocks/reports';
import { colors, fontSize, statusColors } from '../../theme';

// Карта: Leaflet.js + тайлы OpenStreetMap внутри WebView (СВ-4, ЧТЗ табл. 2).
const CENTER = { lat: 56.4846, lng: 84.9476 }; // Томск

function buildHtml() {
  const data = mockReports.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, color: statusColors[r.status] }));
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;background:#eee}</style></head>
<body><div id="map"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script>
var reports = ${JSON.stringify(data)};
var map = L.map('map').setView([${CENTER.lat}, ${CENTER.lng}], 13);
map.attributionControl.setPrefix(false);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);
reports.forEach(function (r) {
  L.circleMarker([r.lat, r.lng], { radius: 11, color: '#fff', weight: 3, fillColor: r.color, fillOpacity: 1 })
    .addTo(map)
    .on('click', function () { window.ReactNativeWebView.postMessage(String(r.id)); });
});
</script></body></html>`;
}

export default function MapScreen() {
  const nav = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const html = useMemo(buildHtml, []);

  return (
    <View style={styles.flex}>
      <WebView
        style={styles.flex}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://neo-service.local' }}
        javaScriptEnabled
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onMessage={(e) => nav.navigate('ReportDetails', { id: Number(e.nativeEvent.data) })}
      />
      {loading && (
        <View style={styles.overlay}><ActivityIndicator color={colors.primary} /></View>
      )}
      {failed && (
        <View style={styles.overlay}>
          <Text style={styles.msg}>Карта недоступна. Проверьте интернет. Заявки можно открыть в разделе «Мои заявки».</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, padding: 24 },
  msg: { textAlign: 'center', fontSize: fontSize.sm, color: colors.text },
});