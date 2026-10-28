import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { Logo } from '../../components/Logo';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../store/AuthContext';
import { colors, fontSize } from '../../theme';
import { isEmail, isPasswordValid, passwordChecks } from '../../utils/validators';

export default function RegisterScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consentPd, setConsentPd] = useState(false);
  const [consentGeo, setConsentGeo] = useState(false);

  // БЗ-4: два отдельных согласия; UC-01 А3: без них кнопка недоступна.
  const canSubmit =
    name.trim().length > 0 && phone.trim().length > 0 && isEmail(email) &&
    isPasswordValid(password) && consentPd && consentGeo;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Logo size="large" /></View>
        <TextField label="ФИО" placeholder="Иванов Иван Иванович" value={name} onChangeText={setName} />
        <TextField label="Телефон" placeholder="+7 (___) ___-__-__" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label="Электронная почта" placeholder="ivanov@mail.ru" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Пароль" placeholder="Введите пароль" value={password} onChangeText={setPassword} secureTextEntry />
        {password.length > 0 && (
          <View style={styles.rules}>
            {passwordChecks(password).map((c) => (
              <View key={c.label} style={styles.rule}>
                <Ionicons name={c.ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={c.ok ? '#2E9E4F' : colors.textMuted} />
                <Text style={[styles.ruleText, c.ok && { color: '#2E9E4F' }]}>{c.label}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.consents}>
          <Checkbox checked={consentPd} onChange={setConsentPd} label="Согласен на обработку персональных данных" />
          <Checkbox checked={consentGeo} onChange={setConsentGeo} label="Согласен на обработку геоданных" />
        </View>
        {/* TODO: заменить на вызов API регистрации (передать версии документов согласий). */}
        <Button title="Зарегистрироваться" onPress={signIn} disabled={!canSubmit} />
        <Text style={styles.footer}>
          Уже есть аккаунт?{' '}
          <Text style={styles.link} onPress={() => nav.navigate('Login')}>Войти</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  logo: { marginBottom: 28 },
  rules: { marginTop: -6, marginBottom: 10, gap: 3 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontSize: fontSize.xs + 1, color: colors.textMuted },
  consents: { marginTop: 12, marginBottom: 20 },
  footer: { textAlign: 'center', marginTop: 24, fontSize: fontSize.sm, color: colors.text },
  link: { color: colors.primary, fontWeight: '600' },
});
