import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './pages/admin/App.tsx'

// Диагностика шрифта (только при разработке): пишет в консоль, загрузился ли Circe
if (import.meta.env.DEV && 'fonts' in document) {
  Promise.all([
    document.fonts.load('300 12px Circe'),
    document.fonts.load('400 14px Circe'),
    document.fonts.load('700 14px Circe'),
  ])
    .then((faces) => {
      if (faces.every((f) => f.length > 0)) console.info('[Circe] шрифт загружен ✔')
      else console.warn('[Circe] файлы шрифта не найдены: проверьте frontend/public/fonts/Circe-*.woff2')
    })
    .catch(() =>
      console.warn('[Circe] шрифт не загрузился (ошибка сети или 404): откройте /fonts/Circe-Regular.woff2 в браузере')
    )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
