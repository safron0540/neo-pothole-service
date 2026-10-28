import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyzePhoto, createRequest, errorMessage } from '../../api';
import type { CreateRequestBody } from '../../api/types';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors, fontSize, radius } from '../../theme';

interface Photo { uri: string; width: number; height: number }

// ФТ-2: не ниже 1280×720 (учитываем любую ориентацию снимка).
const isBigEnough = (p: Photo) => Math.max(p.width, p.height) >= 1280 && Math.min(p.width, p.height) >= 720;
const MAX_UPLOAD_DIMENSION = 1920;
const JPEG_QUALITY = 0.75;

function createRequestId() {
  let seed = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = (seed + Math.random() * 16) % 16 | 0;
    seed = Math.floor(seed / 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export default function NewReportScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const clientRequestId = useRef(createRequestId());
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [manualClass, setManualClass] = useState<'big' | 'small'>('big');
  const [detectedClass, setDetectedClass] = useState<string | null>(null);
  const [analyzedPhotoId, setAnalyzedPhotoId] = useState<string | null>(null);
  const [modelUnavailable, setModelUnavailable] = useState(false);

  // БЗ-4: разрешения запрашиваются при первом использовании — то есть здесь, а не при запуске.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return setGeoError(true);
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      } catch {
        setGeoError(true); // UC-03 А1
      }
    })();
  }, []);

  async function takePhoto() {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const p = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!isBigEnough(p)) {
        Alert.alert('Фото слишком маленькое', 'Нужно фото не меньше 1280×720. Сделайте снимок ещё раз.');
        return;
      }
      const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(p.width, p.height));
      const image = ImageManipulator.ImageManipulator.manipulate(p.uri);
      if (Math.min(p.width * scale, p.height * scale) >= 720) {
        image.resize({
          width: Math.round(p.width * scale),
          height: Math.round(p.height * scale),
        });
      }
      const rendered = await image.renderAsync();
      const result = await rendered.saveAsync({
        format: ImageManipulator.SaveFormat.JPEG,
        compress: JPEG_QUALITY,
      });
      if (!isBigEnough(result)) {
        throw new Error('Сжатое фото не соответствует минимальному разрешению 1280×720.');
      }
      setPhoto({ uri: result.uri, width: result.width, height: result.height });
    } catch (error) {
      Alert.alert(
        'Не удалось подготовить фото',
        error instanceof Error ? error.message : 'Попробуйте сделать снимок ещё раз.',
      );
    } finally {
      setBusy(false);
    }
  }

  function retakePhoto() {
    setPhoto(null);
    setAnalyzedPhotoId(null);
    setDetectedClass(null);
    setModelUnavailable(false);
    clientRequestId.current = createRequestId();
  }

  async function submit() {
    if (!photo || !coords || busy) return;
    setBusy(true);
    try {
      let photoId = analyzedPhotoId;
      let needsManualClass = modelUnavailable;
      if (!photoId) {
        const analysis = await analyzePhoto(photo.uri);
        photoId = analysis.photo_id;
        needsManualClass = analysis.model_unavailable;
        setAnalyzedPhotoId(photoId);
        setDetectedClass(analysis.defect_class);
        setModelUnavailable(analysis.model_unavailable);
      }
      const body: CreateRequestBody = {
        client_request_id: clientRequestId.current,
        photo_id: photoId,
        location: { lat: coords.lat, lon: coords.lng },
        accuracy_m: coords.accuracy,
        citizen_comment: comment.trim() || undefined,
        manual_class: needsManualClass ? manualClass : undefined,
      };
      const request = await createRequest(body);
      Alert.alert('Заявка отправлена', `Номер заявки: ${request.id}`);
      nav.navigate('Tabs', { screen: 'MyReports' });
    } catch (error) {
      Alert.alert('Не удалось отправить заявку', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // --- Нет доступа к камере -------------------------------------------------
  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.flexWhite}>
        <ScreenHeader title="Новая заявка" />
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={48} color={colors.primary} />
          <Text style={styles.msg}>Для заявки нужно сфотографировать яму. Разрешите доступ к камере.</Text>
          <Button title="Разрешить камеру" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  // --- Съёмка ---------------------------------------------------------------
  if (!photo) {
    return (
      <View style={styles.black}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <Pressable accessibilityLabel="Назад" onPress={() => nav.goBack()} style={[styles.close, { top: insets.top + 12 }]}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <View style={[styles.hint, { top: insets.top + 12 }]}>
          <Text style={styles.hintText}>Снимайте днём, яму целиком, без воды и снега</Text>
        </View>
        <View style={[styles.shutterWrap, { bottom: insets.bottom + 28 }]}>
          <Pressable accessibilityLabel="Сделать фото" onPress={takePhoto} disabled={busy} style={styles.shutterOuter}>
            <View style={styles.shutterInner}>{busy ? <ActivityIndicator color={colors.primary} /> : null}</View>
          </Pressable>
        </View>
      </View>
    );
  }

  // --- Форма заявки ---------------------------------------------------------
  const addressText = coords
    ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
    : geoError ? 'Не удалось определить местоположение' : 'Определяем место…';

  return (
    <KeyboardAvoidingView style={styles.flexWhite} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Новая заявка" />
      <ScrollView contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
        <Pressable onPress={retakePhoto} style={styles.retake}>
          <Ionicons name="camera-reverse-outline" size={18} color={colors.primary} />
          <Text style={styles.retakeText}>Переснять</Text>
        </Pressable>

        <View style={styles.row}>
          <Text style={styles.rowText}>Адрес: {addressText}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowText}>
            Категория ямы: {detectedClass ?? (manualClass === 'big' ? 'Большая' : 'Маленькая')}
          </Text>
        </View>
        <View style={styles.classChoices}>
          <Button title="Большая" variant={manualClass === 'big' ? 'primary' : 'outline'} onPress={() => setManualClass('big')} />
          <Button title="Маленькая" variant={manualClass === 'small' ? 'primary' : 'outline'} onPress={() => setManualClass('small')} />
        </View>
        {geoError && (
          <Text style={styles.geoErr}>Включите геолокацию в настройках телефона: без координат заявку не отправить.</Text>
        )}

        <Text style={styles.commentLabel}>Комментарий:</Text>
        <TextInput
          style={styles.commentInput}
          multiline
          value={comment}
          onChangeText={setComment}
          textAlignVertical="top"
        />
        <View style={{ height: 24 }} />
        {busy && <ActivityIndicator color={colors.primary} />}
        <Button title={busy ? 'Отправка…' : 'Создать заявку'} onPress={submit} disabled={!coords || busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flexWhite: { flex: 1, backgroundColor: colors.white },
  black: { flex: 1, backgroundColor: colors.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  msg: { textAlign: 'center', fontSize: fontSize.sm, color: colors.text },
  close: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 68, right: 16, minHeight: 40, borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 12 },
  hintText: { color: colors.white, fontSize: fontSize.xs + 1 },
  shutterWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  form: { padding: 16, gap: 10 },
  classChoices: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  preview: { height: 220, borderRadius: radius.md, backgroundColor: colors.surface },
  retake: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  retakeText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  row: { backgroundColor: colors.surfaceSoft, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12 },
  rowText: { fontSize: fontSize.sm, color: colors.text },
  geoErr: { color: colors.primary, fontSize: fontSize.xs + 1 },
  commentLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginTop: 6 },
  commentInput: { height: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 10, fontSize: fontSize.sm, color: colors.text },
});
