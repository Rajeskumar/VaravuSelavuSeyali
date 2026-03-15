# TrackSpense Mobile App

The React Native (Expo) mobile application for TrackSpense, providing a native experience for expense tracking, receipt scanning, AI-powered analytics, and recurring expense management on both Android and iOS.

---

## Tech Stack

| Component | Technology | Version |
|:---|:---|:---|
| Language | TypeScript | ~5.9.2 |
| Framework | React Native | 0.81.5 |
| Platform | Expo SDK | ~54.0.0 |
| Navigation | React Navigation v6 | Stack + Bottom Tabs |
| HTTP Client | Axios | ≥1.6.8 |
| Secure Storage | expo-secure-store | ~15.0.8 |
| Camera/Gallery | expo-image-picker | ~17.0.10 |
| Charts | react-native-chart-kit | ≥6.12.0 |
| SVG | react-native-svg | 15.12.1 |
| Gradients | expo-linear-gradient | ~15.0.8 |
| State Management | React Context API | — |

---

## Quick Start

### Prerequisites
- Node.js 18+
- **Expo Go** app installed on your phone (for QR code scanning during dev)
- Backend service running (see `../varavu_selavu_app/README.md`)
- **Optional:** Android Studio (for emulator) or Xcode (for iOS simulator, Mac only)

### 1. Install Dependencies
```bash
cd varavu_selavu_mobile
npm install
```

### 2. Generate Assets
Required on first run to prevent missing icon/splash errors:
```bash
node generate_assets.js
```

### 3. Start the Backend
The backend must be running and accessible from the device/emulator:
```bash
# From repo root
make start-backend    # Starts on 0.0.0.0:8000
```

### 4. Run the App
```bash
# Expo dev server (scan QR with Expo Go)
npx expo start

# Android Emulator
npx expo run:android

# iOS Simulator (Mac only)
npx expo run:ios
```

### Makefile Shortcuts (from repo root)
```bash
make install-mobile          # Install deps
make start-mobile-android    # Run Android
make start-mobile-ios        # Run iOS
make generate-mobile-assets  # Generate icon/splash assets
```

---

## Project Structure

```
varavu_selavu_mobile/
├── App.tsx                             # Root: AuthProvider, Navigation, Drawer, RecurringPrompt
├── app.json                            # Expo configuration
├── package.json
├── tsconfig.json
├── index.js                            # Entry point (registers App component)
├── generate_assets.js                  # Generates placeholder icon/splash assets
├── android/                            # Native Android project (auto-generated)
├── ios/                                # Native iOS project (auto-generated)
├── assets/                             # Icons, splash screens, images
└── src/
    ├── theme.ts                        # Design tokens: colors, shadows, spacing
    │
    ├── api/                            # API client layer
    │   ├── apiconfig.ts               # Base URL (Cloud Run prod / local dev)
    │   ├── apiFetch.ts                # Axios wrapper: auth headers, token refresh, 401 logout
    │   ├── auth.ts                    # Login, register, logout
    │   ├── expenses.ts               # Expense CRUD + receipt parse + with_items
    │   ├── analysis.ts               # Analysis data + chat
    │   ├── recurring.ts              # Recurring templates, due, confirm, execute_now
    │   ├── chat.ts                   # AI chat API
    │   └── email.ts                  # Email (feature request, contact us)
    │
    ├── context/
    │   └── AuthContext.tsx            # Auth state management (SecureStore-backed)
    │
    ├── constants/
    │   └── categories.ts             # Shared category taxonomy (7 main, 44 subcategories)
    │
    ├── screens/                        # Full-screen page components
    │   ├── LoginScreen.tsx            # Email/password login
    │   ├── RegisterScreen.tsx         # User registration
    │   ├── HomeScreen.tsx             # Dashboard with summary cards
    │   ├── AddExpenseScreen.tsx       # Add expense form + receipt camera upload
    │   ├── ExpensesScreen.tsx         # Expense history list with edit/delete
    │   ├── AnalysisScreen.tsx         # Charts (donut + line) + statistics
    │   ├── AIAnalystScreen.tsx        # AI conversational chat interface
    │   ├── RecurringExpensesScreen.tsx # Manage recurring templates
    │   ├── AboutScreen.tsx            # About the app
    │   ├── FeatureRequestScreen.tsx   # Submit feature request form
    │   └── ContactUsScreen.tsx        # Contact us form
    │
    └── components/                     # Reusable UI components
        ├── Card.tsx                   # Card container with shadow
        ├── CustomButton.tsx           # Themed button with variants
        ├── CustomInput.tsx            # Themed text input with label
        ├── ScreenWrapper.tsx          # Screen container (safe area + padding)
        ├── CategoryDonutChart.tsx     # Category breakdown donut/pie chart
        ├── TrendLineChart.tsx         # Monthly spending trend line chart
        ├── RecurringPrompt.tsx        # Auto-prompt modal for due recurring expenses
        ├── SkeletonLoader.tsx         # Loading placeholder animations
        ├── TabIcon.tsx                # Bottom tab bar icon with label
        └── Toast.tsx                  # Toast notification system
```

---

## Features Implemented

### 🔐 Authentication
- Email/password login & registration
- JWT tokens stored in encrypted `SecureStore`
- Auto token restoration on app launch
- Automatic token refresh on 401 responses
- Force logout when refresh fails

### 💰 Expense Management
- Manual expense entry with category picker (main + subcategory)
- AI auto-categorization from description text
- Receipt scanning via camera (`expo-image-picker`) or gallery
- AI-powered OCR extracts merchant, date, totals, and line items
- Edit and delete expenses
- Paginated expense history (pull-to-refresh)

### 📊 Analytics & Charts
- Category breakdown donut chart (`CategoryDonutChart`)
- Monthly spending trend line chart (`TrendLineChart`)
- Year/month filter controls
- Skeleton loading states

### 🤖 AI Financial Analyst
- Full conversational chat interface
- Natural language queries about spending habits
- Model selection from available LLMs
- Context-aware (injects expense analysis data)

### 🔄 Recurring Expenses
- Create, edit, and delete recurring templates
- Auto-prompt on app launch when recurring expenses are due
- Confirm or skip each due occurrence with editable cost
- Execute immediately for current month
- Active/Paused status management

### 📱 Navigation & UX
- **Bottom Tab Bar:** Home, History, Add (centered), Stats, AI Chat
- **Custom Drawer:** Slide-in from left with animated transitions
- Drawer items: Home, Recurring Expenses, About, Feature Request, Contact Us, Logout
- Toast notification system for success/error feedback

### ✉️ Contact & Feedback
- Submit Feature Request form (sent via backend SMTP)
- Contact Us form

---

## Navigation Architecture

```
App Root
├── Not Authenticated → Auth Stack
│   ├── Login Screen
│   └── Register Screen
│
└── Authenticated → App Shell
    ├── Bottom Tab Navigator (Main Tabs)
    │   ├── 🏠 Home (Dashboard)
    │   ├── 📋 History (Expenses)
    │   ├── ＋ Add Expense (centered button)
    │   ├── 📊 Stats (Analysis)
    │   └── 🤖 AI Chat (AI Analyst)
    │
    ├── Stack Screens (from Drawer)
    │   ├── 🔁 Recurring Expenses
    │   ├── ℹ️ About
    │   ├── 💡 Feature Request
    │   └── ✉️ Contact Us
    │
    ├── Custom Drawer (animated slide-in, 78% width)
    │   └── Logout at footer
    │
    └── Recurring Prompt (auto-popup on login)
```

---

## Auth Flow

1. **App Launch** → `AuthContext` reads `access_token` + `user_email` from `SecureStore`
2. **Token Found** → Show main app (`AppShell`)
3. **No Token** → Show auth screens (`AuthStack`)
4. **Login Success** → API returns `access_token` + `refresh_token` → stored in `SecureStore`
5. **API Request** → `apiFetch` attaches `Authorization: Bearer` header
6. **401 Response** → `apiFetch` auto-attempts token refresh → if fails, forces logout
7. **Logout** → Calls logout API → deletes all `SecureStore` keys → resets state

### SecureStore Keys
| Key | Value |
|:---|:---|
| `access_token` | JWT access token |
| `refresh_token` | JWT refresh token |
| `user_email` | Current user email |

---

## API Configuration

The API base URL is configured in `src/api/apiconfig.ts`:

| Environment | URL | Notes |
|:---|:---|:---|
| **Production** | `https://varavu-selavu-backend-952416556244.us-central1.run.app` | Hardcoded |
| **Development** | `EXPO_PUBLIC_API_URL` env var or production URL | Override for local |
| **Android Emulator** | `http://10.0.2.2:8000` | Maps to host `localhost` |
| **iOS Simulator** | `http://localhost:8000` | Direct localhost access |
| **Physical Device** | `http://192.168.x.x:8000` | Use your computer's LAN IP |

> **Important:** The backend must be started with `--host 0.0.0.0` to accept connections from emulators and devices.

---

## Expense Categories

The category taxonomy matches the web app and backend. Defined in `src/constants/categories.ts`:

| Main Category | Subcategories |
|:---|:---|
| **Home** | Rent, Electronics, Furniture, Household supplies, Maintenance, Mortgage, Pets, Services, Other |
| **Transportation** | Gas/fuel, Car, Parking, Plane, Bicycle, Bus/Train, Taxi, Hotel, Other |
| **Food & Drink** | Groceries, Dining out, Liquor, Other |
| **Entertainment** | Movies, Games, Music, Sports, Other |
| **Life** | Medical expenses, Insurance, Taxes, Education, Childcare, Clothing, Gifts, Other |
| **Other** | Services, General, Electronics |
| **Utilities** | Heat/gas, Electricity, Water, Cleaning, Trash, TV/Phone/Internet, Other |

---

## Custom Drawer Details

- **Width:** 78% of screen width
- **Animation:** `Animated.timing` slide-in, 260ms duration
- **Implementation:** Pure JS — no native drawer library (uses `Modal` + `Animated.View`)
- **Header:** App logo, name, current user email
- **Footer:** Red-themed logout button
- **Close:** Close button (✕) or tap backdrop

---

## Build & Distribution

### Development
```bash
npx expo start           # Start dev server, scan QR with Expo Go
```

### Native Builds
```bash
npx expo run:android     # Build & run on Android emulator/device
npx expo run:ios         # Build & run on iOS simulator (Mac + Xcode required)
```

### Production Builds (via EAS)
```bash
npm install -g eas-cli
eas build --profile production --platform all
```

### Store Submission
- **Google Play:** Requires Google Play Console ($25 one-time)
- **Apple App Store:** Requires Apple Developer Program ($99/year)
- EAS generates `.apk`/`.aab` (Android) and `.ipa` (iOS) build artifacts

---

## Troubleshooting

| Issue | Solution |
|:---|:---|
| Missing icon/splash errors | Run `node generate_assets.js` |
| Cannot connect to backend (Android emulator) | Use `http://10.0.2.2:8000` in `apiconfig.ts` |
| Cannot connect to backend (physical device) | Use your computer's LAN IP; ensure same WiFi network |
| Backend connection refused | Start backend with `--host 0.0.0.0` |
| `@babel/runtime` version mismatch | The `overrides` field in `package.json` pins it to `7.20.0` |

---

## License

This project is licensed under the MIT License.
