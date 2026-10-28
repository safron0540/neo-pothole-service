// БЗ-3: не менее 8 символов, буквы разных регистров и цифры.
export function passwordChecks(password: string) {
  return [
    { ok: password.length >= 8, label: 'Не менее 8 символов' },
    { ok: /[a-zа-яё]/.test(password) && /[A-ZА-ЯЁ]/.test(password), label: 'Буквы разных регистров' },
    { ok: /\d/.test(password), label: 'Хотя бы одна цифра' },
  ];
}

export const isPasswordValid = (p: string) => passwordChecks(p).every((c) => c.ok);
export const isEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
