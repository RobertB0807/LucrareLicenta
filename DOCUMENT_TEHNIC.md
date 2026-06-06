# Document tehnic - CyberSecurity Training App

## 1. Scop si context
Aplicatia este un proiect de licenta: o aplicatie mobila pentru antrenarea utilizatorilor in recunoasterea atacurilor de social engineering (phishing, smishing, impersonation). Experienta este scenariu -> decizie -> feedback -> recomandare, cu progres masurat in timp.

## 2. Arhitectura de ansamblu
- Frontend: React Native + Expo Router (CyberSecurityApp/)
- Backend: FastAPI (BackendAPI/)
- Persistenta: SQLite implicit, PostgreSQL optional prin DATABASE_URL
- Cache local: AsyncStorage in aplicatie
- AI: raspunsuri rule-based (assistant_service.py), integrarea LLM este planificata

## 3. Fluxuri principale
1) Autentificare
- UI login/register -> /auth/login si /auth/register
- Token JWT salvat in AsyncStorage (auth-session-v1)
- /auth/me folosit la rehidratare

2) Simulare scenariu
- UI alege attack_type + difficulty
- /scenario/generate -> scenariu + session_id
- utilizator selecteaza raspuns -> /scenario/evaluate
- backend returneaza scor, explicatie, stats, recomandare

3) Feedback + recomandare
- UI afiseaza explicatie, red flags, scor, recomandare
- utilizator poate rula scenariul recomandat

4) Analytics
- UI cere /session/{id}, /events, /trends, /trends/aggregate
- grafice/summary pe baza datelor persistate

5) Learn / Assistant
- ecran lectii (Learn) + chat AI (Assistant)
- /assistant/ask pentru raspunsuri rule-based

## 4. Backend
### 4.1 Stack si configurare
- FastAPI + Uvicorn
- SQLAlchemy + Alembic
- PyJWT pentru JWT
- Scrypt (hashlib) pentru hash parole
- Config relevante:
  - DATABASE_URL (default SQLite local)
  - JWT_SECRET_KEY
  - JWT_EXPIRATION_HOURS

### 4.2 Endpoints
Publice:
- GET /health
- POST /auth/register
- POST /auth/login

Protejate (Bearer JWT):
- GET /auth/me
- POST /scenario/generate
- POST /scenario/evaluate
- GET /scenario/catalog
- POST /assistant/ask
- GET /learning/profile
- GET /session/{session_id}
- GET /session/{session_id}/events
- GET /session/{session_id}/trends
- GET /session/{session_id}/trends/aggregate

### 4.3 Middleware si securitate
- Rate limiter sliding-window:
  - /scenario/generate: 30 req / 60s / client
  - /scenario/evaluate: 60 req / 60s / client
  - /assistant/ask: 60 req / 60s / client
- Validare stricta pentru ID-uri (pattern controlat)
- Auth middleware pentru toate rutele protected
- Ownership: accesul la sesiuni/scenarii verificat per user

### 4.4 Module si logica
- main.py: defineste API, middleware, validari, rute
- training_service.py:
  - generare scenariu (library statica)
  - evaluare raspuns + scoring
  - recomandare urmator scenariu
  - learning profile + review queue
  - trenduri si agregari
- persistence_repository.py:
  - CRUD pentru sesiuni, attempts, events, users, learning profiles
  - query pentru trends, aggregates si events
- scenario_library.py:
  - biblioteca statica cu template-uri
  - validare ca exista minim 2 variante per combinatie
- assistant_service.py: raspunsuri rule-based cu quick tips
- auth_service.py: scrypt hash + JWT
- db.py: init engine + alembic upgrade la startup

### 4.5 Scoring si recomandari
- scor: +10 corect, -5 gresit cu optiuni riscante, 0 altfel
- streak corect/incorrect influenteaza dificultatea
- recomandare adaptiva bazata pe mastery si review queue

## 5. Model de date (SQLAlchemy)
Tabele principale:
- training_sessions: scoruri si stats per sesiune
- scenario_attempts: context scenariu + evaluare
- session_events: timeline pentru analytics
- users: conturi si status
- user_learning_profiles: mastery per attack_type + difficulty

## 6. Frontend
### 6.1 Navigatie
- app/_layout.tsx: AuthProvider + TrainingSessionProvider + Stack
- app/(tabs)/_layout.tsx: tab-uri vizibile
- app/(tabs)/index.tsx: auth gate
- app/chat/[scenarioId].tsx: simulare chat
- app/feedback/[scenarioId].tsx: feedback
- app/login.tsx + app/register.tsx

### 6.2 State management
- features/auth/auth-context.tsx: login/register/logout + persistence
- features/training/useTrainingSession.tsx: scenariu curent, stats, catalog, learning profile
- API client in features/training/api.ts si features/auth/auth-api.ts

### 6.3 Ecrane principale
- Dashboard: overview, recomandari, recapitulare, acces rapid
- Scenarios: catalog filtrabil + cautare
- Learn: lectii + Q&A cu assistant
- Assistant: chat AI + sugestii
- Analytics: statistici, badges, weak spots, trenduri
- Training (legacy): simulare clasica cu carduri

### 6.4 Cache local (AsyncStorage)
- auth-session-v1
- training-session-state-v1 (+ per user)
- assistant-messages-v1
- learn-screen-state-v1
- training-feedback-context-v1
- training-chat-progress-v1:* (TTL + cap)

### 6.5 UI theme
- TrainingColors in features/training/ui-theme.ts
- Fonts si Colors generale in constants/theme.ts

## 7. Structura proiect (inventar complet)
```
.
├── AI_CONTEXT.md
├── DOCUMENT_TEHNIC.md
├── README.md
├── run-all.sh
├── .expo/
│   ├── README.md
│   └── settings.json
├── BackendAPI/
│   ├── .gitignore
│   ├── README.md
│   ├── alembic.ini
│   ├── assistant_service.py
│   ├── auth_service.py
│   ├── db.py
│   ├── main.py
│   ├── persistence_models.py
│   ├── persistence_repository.py
│   ├── requirements.txt
│   ├── scenario_library.py
│   ├── scenario_models.py
│   ├── training_service.py
│   ├── migrations/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   │       ├── 20260507_0001_initial_schema.py
│   │       ├── 20260511_0002_persist_scenario_rule.py
│   │       ├── 20260513_0003_add_users_and_session_ownership.py
│   │       └── 20260514_0004_add_user_learning_profiles.py
│   └── tests/
│       ├── test_api_endpoints.py
│       ├── test_auth_service.py
│       ├── test_db_config.py
│       └── test_persistence_repository.py
└── CyberSecurityApp/
    ├── .gitignore
    ├── .vscode/
    │   ├── extensions.json
    │   └── settings.json
    ├── README.md
    ├── app.json
    ├── eslint.config.js
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── assets/
    │   └── images/
    │       ├── android-icon-background.png
    │       ├── android-icon-foreground.png
    │       ├── android-icon-monochrome.png
    │       ├── favicon.png
    │       ├── icon.png
    │       ├── partial-react-logo.png
    │       ├── react-logo.png
    │       ├── react-logo@2x.png
    │       ├── react-logo@3x.png
    │       └── splash-icon.png
    ├── app/
    │   ├── _layout.tsx
    │   ├── login.tsx
    │   ├── modal.tsx
    │   ├── register.tsx
    │   ├── (tabs)/
    │   │   ├── _layout.tsx
    │   │   ├── analytics.tsx
    │   │   ├── assistant.tsx
    │   │   ├── dashboard.tsx
    │   │   ├── explore.tsx
    │   │   ├── index.tsx
    │   │   ├── learn.tsx
    │   │   ├── scenarios.tsx
    │   │   └── training.tsx
    │   ├── chat/
    │   │   └── [scenarioId].tsx
    │   └── feedback/
    │       └── [scenarioId].tsx
    ├── components/
    │   ├── external-link.tsx
    │   ├── haptic-tab.tsx
    │   ├── hello-wave.tsx
    │   ├── parallax-scroll-view.tsx
    │   ├── themed-text.tsx
    │   ├── themed-view.tsx
    │   └── ui/
    │       ├── collapsible.tsx
    │       ├── icon-symbol.ios.tsx
    │       └── icon-symbol.tsx
    ├── constants/
    │   └── theme.ts
    ├── features/
    │   ├── auth/
    │   │   ├── auth-api.ts
    │   │   └── auth-context.tsx
    │   └── training/
    │       ├── api.ts
    │       ├── local-cache.ts
    │       ├── options.ts
    │       ├── types.ts
    │       ├── ui-theme.ts
    │       ├── useTrainingSession.tsx
    │       └── components/
    │           ├── FeedbackPanel.tsx
    │           ├── ScenarioSetupCard.tsx
    │           └── TrainingHero.tsx
    ├── hooks/
    │   ├── use-color-scheme.ts
    │   ├── use-color-scheme.web.ts
    │   └── use-theme-color.ts
    └── scripts/
        └── reset-project.js
```

## 8. Dependinte cheie
Backend (requirements.txt): fastapi, uvicorn, SQLAlchemy, alembic, psycopg, PyJWT
Frontend (package.json): expo, expo-router, react-native, AsyncStorage, react-navigation, reanimated, etc.

## 9. Rulare si testare
- Backend: uvicorn main:app --reload --port 8000
- Frontend: npm install && npx expo start
- Script full: ./run-all.sh
- Teste backend: python -m unittest discover -s tests -p "test_*.py" -q

## 10. Ce urmeaza implementat (roadmap)
1) Integrare LLM (generator scenarii + assistant) cu validare stricta a outputului si fallback rule-based.
2) Reducerea dependentei de cache in-memory (scenario_contexts) prin persistenta completa.
3) Extindere analytics: moving averages, comparatii intre perioade, grafice multi-attack.
4) Cache local per-user pentru assistant/learn/chat/feedback (acum doar training state e per-user).
5) UX polish: animatii, iconografie, layout pentru ecrane mici.
6) Teste suplimentare: frontend, flows end-to-end, negative cases.
7) Hardening productie: SecureStore pentru token, CORS strict, management secrets, rate limits configurabile.

Nota: Nu exista TODO/FIXME explicite in codul proiectului; roadmap-ul de mai sus reflecta intentiile documentate in AI_CONTEXT.md si oportunitatile evidente din arhitectura curenta.
