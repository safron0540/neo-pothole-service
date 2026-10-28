import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { errorMessage, listAllMyRequests } from '../../api';
import { TILE_URL } from '../../config';
import { colors, fontSize, statusColors } from '../../theme';
import type { Report } from '../../types';

// Карта: Leaflet.js + тайлы стенда внутри WebView (СВ-4, ЧТЗ табл. 2).
const CENTER = { lat: 56.4846, lng: 84.9476 }; // Томск

function buildHtml(reports: Report[]) {
  const data = reports
    .filter((r) => r.lat !== null && r.lng !== null)
    .map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, color: statusColors[r.status] }));
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
L.tileLayer(${JSON.stringify(TILE_URL)}, {
  maxZoom: 19, attribution: '&copy; OpenStreetMap'
}).addTo(map);
reports.forEach(function (r) {
  L.circleMarker([r.lat, r.lng], { radius: 11, color: '#fff', weight: 3, fillColor: r.color, fillOpacity: 1 })
    .addTo(map)
    .on('click', function () {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(String(r.id));
      } else if (window.parent) {
        window.parent.postMessage(String(r.id), '*');
      }
    });
});
</script></body></html>`;
}

export default function MapScreen() {
  const nav = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    listAllMyRequests()
      .then((items) => {
        if (active) {
          setReports(items);
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

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: MessageEvent) => {
      const id = Number(e.data);
      if (Number.isFinite(id) && id > 0) {
        nav.navigate('ReportDetails', { id });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [nav]);

  const html = useMemo(() => buildHtml(reports), [reports]);

  return (
    <View style={styles.flex}>
      {Platform.OS === 'web' ? (
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none' }}
          onLoad={() => setLoading(false)}
        />
      ) : (
        <WebView
          style={styles.flex}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://neo-service.local' }}
          javaScriptEnabled
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setFailed(true); }}
          onMessage={(e) => nav.navigate('ReportDetails', { id: Number(e.nativeEvent.data) })}
        />
      )}
      {loading && (
        <View style={styles.overlay}><ActivityIndicator color={colors.primary} /></View>
      )}
      {failed && (
        <View style={styles.overlay}>
          <Text style={styles.msg}>Карта недоступна. Проверьте интернет. Заявки можно открыть в разделе «Мои заявки».</Text>
        </View>
      )}
      {!loading && error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, padding: 24 },
  msg: { textAlign: 'center', fontSize: fontSize.sm, color: colors.text },
  errorBanner: { position: 'absolute', left: 12, right: 12, bottom: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 8 },
  errorText: { textAlign: 'center', fontSize: fontSize.xs + 1, color: colors.primary },
});