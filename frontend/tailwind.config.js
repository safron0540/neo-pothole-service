// Дизайн-токены по макету: палитра (основные, серая шкала, статусные цвета) и шрифт Circe.
// Существующие классы (bg-red-700, text-neutral-500, bg-emerald-600 …) теперь дают цвета макета.

const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) =>
  '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();

// Шкала 50–900 вокруг базового цвета макета (базовый цвет — 500 и 600)
function scale(base) {
  const b = toRgb(base);
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  return {
    50: mix(b, white, 0.92),
    100: mix(b, white, 0.84),
    200: mix(b, white, 0.68),
    300: mix(b, white, 0.5),
    400: mix(b, white, 0.25),
    500: base,
    600: base,
    700: mix(b, black, 0.14),
    800: mix(b, black, 0.32),
    900: mix(b, black, 0.5),
  };
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Основные цвета: #C42915 (кнопки, акценты), #D66B49 (второй акцент), #FFFFFF
        red: {
          ...scale('#C42915'),
          700: '#C42915',
          800: '#A82211', // hover
          900: '#901C0D', // active
        },
        orange: scale('#D66B49'),

        // Серая шкала: #212121, #616161, #9E9E9E, #E0E0E0, #F5F5F5
        neutral: {
          50: '#F5F5F5',
          100: '#F5F5F5',
          200: '#E0E0E0',
          300: '#E0E0E0',
          400: '#9E9E9E',
          500: '#616161',
          600: '#616161',
          700: '#212121',
          800: '#212121',
          900: '#212121',
        },

        // Статусные цвета: принято #2D6CDF, в работе #F2B705, выполнено #2E9E4F
        blue: scale('#2D6CDF'),
        amber: scale('#F2B705'),
        yellow: scale('#F2B705'),
        emerald: scale('#2E9E4F'),
      },
      fontFamily: {
        sans: ['Circe', 'sans-serif'],
      },
      // Одна шкала кеглей на весь веб (Circe мельче обычных шрифтов, поэтому шаг крупнее):
      // xs — подписи и мелкие кнопки, sm — обычный текст и поля, base — крупный текст,
      // lg / xl / 2xl — заголовки блоков, карточек и страниц
      fontSize: {
        xs: ['13px', '18px'],
        sm: ['14px', '20px'],
        base: ['16px', '24px'],
        lg: ['18px', '26px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '38px'],
      },
      // У Circe нет начертаний 500 и 600: medium → Regular, semibold → Bold
      fontWeight: {
        medium: '400',
        semibold: '700',
      },
    },
  },
  plugins: [],
};
