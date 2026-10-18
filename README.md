<div align="center">

# NEO-СЕРВИС: Ямочный ремонт

**Клиентская веб-платформа мониторинга, диспетчеризации и контроля устранения дефектов дорожного покрытия**

[![React](https://img.shields.io/badge/React-19.2-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?style=flat-square&logo=leaflet&logoColor=white)](https://leafletjs.com/)

</div>

---

> [!NOTE]
> Логика обработки заявок, категоризация дорог и контрольные сроки устранения дефектов реализованы.

---

## Архитектура функциональных модулей

| Модуль | Описание функционала | Реализация |
| :--- | :--- | :--- |
| **Диспетчеризация** | Прием первичных заявок, валидация фото, классификация дефектов («Большая» / «Маленькая»), назначение подрядчиков и смена статусов. | `DispatcherPage.tsx` |
| **Геоаналитика (ГИС)** | Интерактивная карта на базе OpenStreetMap, тепловая карта плотности дефектов, полигональные зоны подрядчиков, фильтрация по районам. | `MapPage.tsx`, `leaflet.heat` |
| **Плановый ремонт** | Автоматическое выявление участков дорог с превышением порога ям на 100 м, отрисовка отрезков полилиниями, выбор типа ремонта. | `PlannedRepairPage.tsx` |
| **Кабинет подрядчика** | Реестр выданных нарядов с сортировкой по дедлайну, геопривязка, фотофиксация результата и подтверждение закрытия заявки. | `ContractorPage.tsx` |
| **Аналитика и отчеты** | Сводные ведомости по округам, расчет SLA (процент в срок, среднее время устранения), клиентский экспорт в `.xlsx`. | `ReportsPage.tsx`, `SheetJS` |
| **Администрирование** | Справочник лимитов времени по ГОСТ, классификатор улиц и районов, управление учетными записями и правами доступа. | `AdminPage.tsx`, `UsersPage.tsx` |

---

## Ролевая модель доступа

| Роль | Доступный функционал |
| :--- | :--- |
| **Диспетчер** | Полный доступ: очередь заявок, ГИС-карта, планирование сплошного ремонта, отчеты, управление справочниками и пользователями. |
| **Подрядчик** | Ограниченный доступ: просмотр назначенных нарядов, фиксация выполнения, загрузка подтверждающих фотоматериалов. |

---

## Стек технологий

| Категория | Технологии |
| :--- | :--- |
| **Базовый стек** | React 19, TypeScript, Vite 8 |
| **Стилизация** | Tailwind CSS 3, PostCSS, Autoprefixer |
| **Картография** | Leaflet 1.9, React-Leaflet 5, Leaflet.heat |
| **Экспорт данных** | SheetJS (xlsx) |
| **Иконки** | Lucide React |


---

## Структура проекта

<details>

frontend/
├── public/                     # Статические файлы
├── src/
│   ├── assets/                 # Векторные ассеты и логотипы
│   ├── components/             # Переиспользуемые UI-компоненты
│   │   ├── Header.tsx          # Верхняя панель (поиск, статусное время)
│   │   ├── Pagination.tsx      # Постраничная навигация
│   │   └── Sidebar.tsx         # Навигационное меню диспетчера
│   ├── pages/
│   │   ├── admin/              # Администрирование, подрядчики, пользователи
│   │   │   ├── AdminPage.tsx
│   │   │   ├── App.tsx         # Корневой переключатель модулей и ролей
│   │   │   ├── ContractorsPage.tsx
│   │   │   └── UsersPage.tsx
│   │   ├── contractor/         # Модуль подрядной организации
│   │   │   └── ContractorPage.tsx
│   │   ├── dispatcher/         # Диспетчерский центр
│   │   │   ├── DispatcherPage.tsx
│   │   │   ├── MapPage.tsx
│   │   │   └── PlannedRepairPage.tsx
│   │   ├── login/              # Страница авторизации
│   │   │   └── LoginPage.tsx
│   │   └── reports/            # Аналитика и генерация XLSX
│   │       └── ReportsPage.tsx
│   ├── index.css               # Стили, токены палитры и переопределения Leaflet
│   └── main.tsx                # Инициализация приложения
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
## Установка и запуск

### Требования
* Node.js >= 20.19.0
* npm >= 9.x

Установка зависимостей:
code
Bash
npm install
Запуск сервера разработки:
code
Bash
npm run dev
