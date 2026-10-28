import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { TextField } from '../../components/TextField';
import { errorMessage } from '../../api';
import { useAuth } from '../../store/AuthContext';
import { colors, fontSize } from '../../theme';

export default function LoginScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (error) {
      Alert.alert('Не удалось войти', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Logo size="large" /></View>
        <TextField label="Электронная почта" placeholder="ivanov@mail.ru" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Пароль" placeholder="Введите пароль" value={password} onChangeText={setPassword} secureTextEntry />
        <View style={styles.spacer} />
        <Button title={busy ? 'Вход…' : 'Войти'} onPress={submit} disabled={!canSubmit || busy} />
        <Text style={styles.footer}>
          Нет аккаунта?{' '}
          <Text style={styles.link} onPress={() => nav.navigate('Register')}>Создать</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  logo: { marginBottom: 56 },
  spacer: { flex: 1, minHeight: 80 },
  footer: { textAlign: 'center', marginTop: 24, fontSize: fontSize.sm, color: colors.text },
  link: { color: colors.primary, fontWeight: '600' },
});
