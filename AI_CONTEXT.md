# Project Context for AI Handoff

## Project Overview
This is a bachelor's thesis project: an AI-powered mobile application that trains users to recognize and respond to social engineering attacks.

The app simulates realistic attack scenarios such as:
- phishing
- smishing
- impersonation

The goal is educational: users interact with scenarios, choose a response, receive feedback, and improve over time.

## Current Tech Stack
- Frontend: React Native + Expo
- Backend: FastAPI (Python)
- AI: rule-based assistant endpoint implemented, LLM integration planned later

## Current State
The project is already functional as a vertical MVP slice.

### Backend status
Backend lives in `BackendAPI/` and currently includes:
- `main.py` for API routing and auth middleware
- `auth_service.py` for password hashing + JWT token handling
- `training_service.py` for session orchestration, scoring, recommendation, and event timeline
- `db.py` for environment-driven SQLAlchemy engine/session initialization
- `persistence_models.py` for SQLAlchemy ORM models
- `persistence_repository.py` for persistence read/write operations
- `scenario_library.py` for the scenario templates
- `scenario_models.py` for shared models/types
- Alembic migration setup (`alembic.ini`, `migrations/`, revision history in `migrations/versions/`)
- backend API tests in `tests/test_api_endpoints.py`

Backend features currently implemented:
- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`
- `GET /scenario/catalog`
- `POST /scenario/generate`
- `POST /scenario/evaluate`
- `POST /assistant/ask`
- `GET /session/{session_id}`
- `GET /session/{session_id}/events`
- `GET /session/{session_id}/trends`
- `GET /session/{session_id}/trends/aggregate`
- protected API routes via Bearer JWT auth middleware (all routes except `health` + auth register/login)
- per-user session ownership enforcement for scenario/session reads and writes
- endpoint-level sliding-window rate limiting:
  - `/scenario/generate`: 30 requests / 60 seconds / client
  - `/scenario/evaluate`: 60 requests / 60 seconds / client
  - `/assistant/ask`: 60 requests / 60 seconds / client
- strict identifier validation on API inputs (`session_id`, `scenario_id`, `selected_option_id`)
- scenario templates for all combinations of:
  - attack type: phishing, smishing, impersonation
  - difficulty: easy, medium, hard
- multiple templates per combination
- adaptive session scoring
- per-attack statistics
- recommendation logic for the next scenario
- session event history (`recent_events`) with timestamp and tone metadata
- persistence for users, sessions, attempts and events via SQLAlchemy (PostgreSQL default via `DATABASE_URL` or `POSTGRES_*`; SQLite opt-in)
- startup DB bootstrap now applies Alembic migrations (`upgrade head`) when available, with a safe ORM `create_all` fallback if Alembic is missing
- scenario evaluation is restart-safe: when in-memory scenario context is missing, backend restores rule context from persisted `scenario_attempts` data

### Frontend status
Frontend lives in `CyberSecurityApp/`.

The app now has a broader product-style tab shell and route flow:
- `app/(tabs)/dashboard.tsx` as the new home screen
- `app/(tabs)/scenarios.tsx` as the scenario catalog
- `app/(tabs)/learn.tsx` for lesson content
- `app/(tabs)/assistant.tsx` for the AI coach chat UI
- `app/(tabs)/analytics.tsx` for progress/stats UI
- `app/chat/[scenarioId].tsx` for chat-style scenario simulation
- `app/feedback/[scenarioId].tsx` for post-scenario debrief
- `app/login.tsx` for user authentication
- `app/register.tsx` for new account creation

Navigation updates:
- `app/(tabs)/_layout.tsx` now defines the new visible tabs and hides legacy routes (`index`, `training`, `explore`)
- `app/_layout.tsx` wraps everything with `AuthProvider` (outermost) → `TrainingSessionProvider`, and includes stack routes for `login`, `register`, `chat/[scenarioId]`, and `feedback/[scenarioId]`
- `app/(tabs)/index.tsx` now acts as an auth gate: redirects to `/login` when unauthenticated, shows a loading spinner during auth hydration, then redirects to `/(tabs)/dashboard`

The existing `features/training/*` architecture is still present and reusable.

Auth feature module (`features/auth/`):
- `auth-api.ts` — API client for auth endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/me`) with multi-candidate base URL fallback
- `auth-context.tsx` — React context provider managing login/register/logout, AsyncStorage persistence (`auth-session-v1` key), token validation on hydration via `GET /auth/me`, silent refresh scheduling via `/auth/refresh`, and automatic token accessor wiring for the training API client

Current integration level:
- frontend auth is fully wired: login/register screens, JWT token persistence, automatic token injection on all protected API calls
- chat/feedback flow is now wired to real session continuity (`session_id` carried through routes)
- analytics now consumes persisted backend session snapshot + recent events when a session is active
- assistant and learn tabs now use real backend AI responses via `POST /assistant/ask`
- dashboard and scenarios now consume backend scenario catalog (`GET /scenario/catalog`) through shared `useTrainingSession` state
- dashboard header shows personalized greeting ("Bună, {displayName}") and logout button
- local continuity is enabled via AsyncStorage for training session state, assistant/learn conversations, and in-progress chat/feedback continuity
- local continuity keys for training, assistant, learn, chat, and feedback are scoped per-user (storage key includes user ID) so each account has isolated training data
- silent auth refresh is scheduled before JWT expiry to reduce session drops
- protected API calls in `useTrainingSession` are gated on `isAuthenticated` — no backend calls are made before login

## Recent Progress (April-May 2026)
- Backend refactor completed: service layer extracted from `main.py` into `training_service.py`.
- Added session timeline events in backend for `scenario_generated` and `answer_evaluated`.
- Extended API contract with `session_stats.recent_events`.
- Frontend session provider maps backend events into the analytics activity feed.
- Analytics feed now displays event timestamps.
- Added SQLite persistence (dual-write): in-memory state + DB writes.
- Added persisted session snapshot and paginated events endpoints.
- Fixed session re-hydration from DB after restart/memory reset (existing score and attempts are no longer overwritten when continuing an old session).
- Validated re-hydration behavior with a restart simulation test.
- Added a new multi-tab UX shell (Home/Train/Learn/Assist/Stats) with cyber-themed styling.
- Added a chat-based scenario flow (`/chat/[scenarioId]`) and a dedicated feedback/debrief screen (`/feedback/[scenarioId]`).
- Reworked analytics into a richer dashboard-style presentation (charts, weak spots, badges), now partially backed by real persisted session data.
- Added session continuity across chat/feedback routes by forwarding and reusing `session_id`.
- Extended `useTrainingSession.startSimulation(...)` with optional `nextSessionId` to explicitly resume an existing session.
- Extended frontend API client with:
  - `getSessionSnapshot(sessionId)` → `GET /session/{session_id}`
  - `getSessionEvents(sessionId, {limit, offset})` → `GET /session/{session_id}/events`
- Added typed API contracts for persisted reads:
  - `SessionSnapshotApiResponse`
  - `SessionEventsApiResponse`
- Upgraded analytics screen to:
  - fetch persisted snapshot/events for active session
  - derive weak spots from real per-attack accuracy
  - compute badges from real session stats
  - show loading/error/empty states for persisted analytics
- Added Alembic migration tooling in backend (`alembic.ini`, `migrations/env.py`, template, and initial schema revision).
- Added initial migration revision for:
  - `training_sessions`
  - `scenario_attempts` (+ indexes)
  - `session_events` (+ indexes)
- Updated backend startup DB init to run migrations first, with fallback behavior for environments without Alembic installed.
- Added backend endpoint test suite (`tests/test_api_endpoints.py`) covering:
  - health endpoint
  - generate -> evaluate -> session snapshot/events flow
  - 404 behavior for unknown session/scenario
- Added backend security hardening:
  - sliding-window rate limiter middleware with `429` + `Retry-After`
  - strict identifier validation for session/scenario/option IDs
- Added endpoint tests for:
  - request validation failures (`422`) on invalid identifiers
  - rate limit behavior (`429`) after threshold is exceeded
- Updated backend dependencies to remediate a known vulnerability:
  - upgraded `fastapi` to `0.136.1`
  - pinned `starlette` to `0.49.1` (CVE fix line)
- Updated backend README with migration commands and backend test command.
- Added Alembic migration `20260511_0002` to persist scenario rule fields needed for restart-safe evaluation:
  - `correct_option_id`
  - `correct_explanation`
  - `incorrect_explanation`
- Extended generation/evaluation persistence flow so rule context is saved on generate and reused on evaluate after process restart.
- Added backend regression test validating evaluate flow after in-memory scenario cache reset.
- Added backend assistant service (`assistant_service.py`) and endpoint:
  - `POST /assistant/ask`
  - deterministic coaching response (`answer` + `quick_tips`)
  - optional context (`attack_type`, `difficulty`, `session_id`)
- Added endpoint tests for assistant ask success and validation failure (empty message).
- Added frontend API contract + client for assistant:
  - `AssistantAskApiResponse` type
  - `askAssistant(...)` in `features/training/api.ts`
- Replaced mocked `setTimeout` assistant replies in `app/(tabs)/assistant.tsx` with real backend calls, loading state, and error handling.
- Wired `app/(tabs)/learn.tsx` lesson modal composer to real backend assistant calls, including contextual `attack_type`/`difficulty`, message thread rendering, loading state, and errors.
- Added backend scenario catalog endpoint:
  - `GET /scenario/catalog`
  - backed by `SCENARIO_LIBRARY` templates in `training_service.py`
  - test coverage added in `tests/test_api_endpoints.py`
- Added frontend scenario catalog integration:
  - `getScenarioCatalog()` API client + typed contracts
  - `app/(tabs)/scenarios.tsx` now loads catalog from backend (with loading/error/empty states)
  - `app/(tabs)/dashboard.tsx` now uses catalog previews for scenario cards
- Added AsyncStorage-based continuity on frontend:
  - persisted/rehydrated training session state in `useTrainingSession.tsx`
  - persisted/rehydrated assistant chat history in `app/(tabs)/assistant.tsx`
  - persisted/rehydrated learn tab state (active category, open lesson, lesson messages) in `app/(tabs)/learn.tsx`
  - added dependency `@react-native-async-storage/async-storage`
- Unified `dashboard` and `scenarios` route-level data flow around `useTrainingSession`:
  - shared scenario catalog state moved into provider (`scenarioCatalog`, `isLoadingCatalog`, `catalogError`)
  - removed duplicate catalog-fetch logic from `dashboard.tsx` and `scenarios.tsx`
  - added provider-side session snapshot refresh from backend (`GET /session/{session_id}`) after hydration
- Extended frontend continuity for simulation flow:
  - `chat/[scenarioId]` now persists/restores in-progress chat state (`messages`, script completion) via AsyncStorage
  - chat -> feedback transition now persists a dedicated feedback context payload (scenario/session IDs, verdict, explanation, recommendation, red flags)
  - `feedback/[scenarioId]` now falls back to persisted context when in-memory evaluation/scenario state is unavailable
- Added retention and cleanup policy for frontend continuity storage:
  - chat progress keys use TTL (7 days) and max-entry cap to prevent unbounded growth
  - feedback context uses TTL validation and expired payload cleanup
- Extended frontend continuity hardening for assistant/learn tabs:
  - assistant history now uses TTL-based persisted state (7 days) with capped message retention
  - learn tab persisted state now uses TTL-based validation with capped lesson-thread retention
  - added explicit "Șterge cache" UX action in assistant and learn tabs to clear local training cache
- Backend session reads now use DB as source of truth for session progress:
  - removed in-memory `session_progress` cache dependency for reads
  - session state is restored from persisted snapshot on each access
  - added regression coverage to ensure mutated in-memory objects do not affect persisted session totals
- Added persisted analytics trends capability:
  - backend endpoint `GET /session/{session_id}/trends` (paginated)
  - trend points include running score/accuracy per evaluated attempt
  - frontend analytics now fetches and displays session evolution trend card
  - typed API contracts added for trends payloads
- Added backend trend aggregation endpoint for chart-friendly analytics:
  - `GET /session/{session_id}/trends/aggregate`
  - supports filters: `attack_type`, `since`, `until`
  - aggregation payload includes:
    - `by_day` (attempts, correct, accuracy, score delta, cumulative score)
    - `by_attack` (attempts, correct, accuracy, score totals, average score delta)
  - repository + endpoint tests added for aggregation behavior and unknown-session handling
- Updated frontend analytics to consume trend aggregates:
  - analytics chart now uses server-side `by_day` aggregates (daily evolution bars)
  - per-attack accuracy card now prefers `by_attack` aggregate values
  - trend filters continue to work with persisted server-side data
- Extended analytics queries with persisted filters:
  - backend `events` endpoint now supports `since`/`until`
  - backend `trends` endpoint now supports `attack_type` + `since`/`until`
  - frontend analytics now exposes attack-type and date-range filters
  - frontend activity feed now supports incremental load-more pagination
- Added dedicated repository test coverage (`tests/test_persistence_repository.py`) for:
  - trends/events pagination and ordering
  - `since`/`until` filter behavior
  - `attack_type` trend filtering
  - unknown-session and offset edge cases
- Added production-ready backend auth + ownership foundation:
  - new auth endpoints:
    - `POST /auth/register`
    - `POST /auth/login`
    - `GET /auth/me`
  - JWT bearer middleware now protects training/catalog/assistant/session endpoints
  - user accounts persisted in DB (`users` table)
  - training sessions now support per-user ownership (`owner_user_id`) with ownership checks on protected session/scenario paths
  - password hashing uses scrypt-based hashes in `auth_service.py`
- Added Alembic migration `20260513_0003`:
  - creates `users` table
  - adds `owner_user_id` column + index to `training_sessions`
- Added auth/security test coverage:
  - auth token roundtrip + password hash verification tests (`tests/test_auth_service.py`)
  - API tests for protected route behavior and cross-user session access blocking
  - repository tests for user creation and session ownership checks

- Added frontend auth integration:
  - new `features/auth/auth-api.ts` — API client for `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/me` with multi-candidate base URL fallback and Romanian error messages
  - new `features/auth/auth-context.tsx` — React context provider with login/register/logout actions, AsyncStorage persistence, token validation on hydration, silent refresh scheduling, and automatic `setAuthTokenAccessor()` wiring
  - new `app/login.tsx` — cyber-themed login screen with email/password fields, show/hide toggle, error banner, loading state
  - new `app/register.tsx` — cyber-themed register screen with display name, email, password + confirmation, client-side validation
  - modified `features/training/api.ts` — added `setAuthTokenAccessor()` + `getAuthHeaders()` so all `postJson`/`getJson` calls automatically inject `Authorization: Bearer <token>`
  - modified `app/_layout.tsx` — wrapped with `AuthProvider` (outermost), added `login` and `register` stack routes
  - modified `app/(tabs)/index.tsx` — now acts as auth gate: redirects to `/login` when unauthenticated, loading spinner during hydration
  - modified `app/(tabs)/dashboard.tsx` — personalized greeting ("Bună, {displayName}"), logout button replaces notification bell
  - modified `features/training/useTrainingSession.tsx` — all protected API calls gated on `isAuthenticated`, per-user storage key (includes user ID), state reset on user identity change
- Added auth refresh support:
  - backend `POST /auth/refresh` issues a new access token for authenticated users
  - frontend schedules silent refresh before JWT expiry and retries gracefully on transient failures
- Scoped assistant/learn/chat/feedback continuity keys per-user:
  - assistant, learn, chat progress, and feedback context storage keys now include user ID
  - cache clear actions now show a confirmation alert after reset

## What the App Already Does
1. User registers or logs in (JWT auth).
2. User selects attack type and difficulty.
3. App sends request to backend to generate a scenario.
4. User picks an answer.
5. Backend evaluates the answer.
6. App shows:
   - result
   - score delta
   - session stats
   - recent event history in analytics
   - adaptive recommendation
   - red flags
7. User can continue with current selection or recommended scenario.
8. User can log out (clears auth state, redirects to login).

## Important Design Decisions
- The scenario content is still rule-based for now, not LLM-generated.
- The app keeps a stable API contract so the frontend will not break when LLM generation is added later.
- The frontend is now organized feature-first for readability and future scalability.
- The UI theme is intentionally cyber-themed with dark console-like styling.
- Auth token is stored in AsyncStorage (acceptable for MVP; `expo-secure-store` recommended for production).
- Training session state is scoped per-user in AsyncStorage to prevent cross-account data leakage.

## Main Files to Know
### Backend
- `BackendAPI/main.py`
- `BackendAPI/assistant_service.py`
- `BackendAPI/training_service.py`
- `BackendAPI/db.py`
- `BackendAPI/persistence_models.py`
- `BackendAPI/persistence_repository.py`
- `BackendAPI/scenario_library.py`
- `BackendAPI/scenario_models.py`
- `BackendAPI/alembic.ini`
- `BackendAPI/migrations/env.py`
- `BackendAPI/migrations/versions/20260507_0001_initial_schema.py`
- `BackendAPI/migrations/versions/20260511_0002_persist_scenario_rule.py`
- `BackendAPI/migrations/versions/20260513_0003_add_users_and_session_ownership.py`
- `BackendAPI/auth_service.py`
- `BackendAPI/tests/test_api_endpoints.py`
- `BackendAPI/tests/test_persistence_repository.py`
- `BackendAPI/tests/test_auth_service.py`

### Frontend
- `CyberSecurityApp/app/(tabs)/_layout.tsx`
- `CyberSecurityApp/app/(tabs)/dashboard.tsx`
- `CyberSecurityApp/app/(tabs)/scenarios.tsx`
- `CyberSecurityApp/app/(tabs)/learn.tsx`
- `CyberSecurityApp/app/(tabs)/assistant.tsx`
- `CyberSecurityApp/app/(tabs)/analytics.tsx`
- `CyberSecurityApp/app/(tabs)/index.tsx`
- `CyberSecurityApp/app/chat/[scenarioId].tsx`
- `CyberSecurityApp/app/feedback/[scenarioId].tsx`
- `CyberSecurityApp/app/login.tsx`
- `CyberSecurityApp/app/register.tsx`
- `CyberSecurityApp/app/_layout.tsx`
- `CyberSecurityApp/features/auth/auth-api.ts`
- `CyberSecurityApp/features/auth/auth-context.tsx`
- `CyberSecurityApp/features/training/api.ts`
- `CyberSecurityApp/features/training/useTrainingSession.tsx`
- `CyberSecurityApp/features/training/types.ts`
- `CyberSecurityApp/features/training/options.ts`
- `CyberSecurityApp/features/training/ui-theme.ts`
- `CyberSecurityApp/features/training/components/TrainingHero.tsx`
- `CyberSecurityApp/features/training/components/ScenarioSetupCard.tsx`
- `CyberSecurityApp/features/training/components/FeedbackPanel.tsx`
- `CyberSecurityApp/package.json` (AsyncStorage dependency)

## Remaining Tasks / Suggested Roadmap
Priority order (next steps at top):

### 1. Add LLM integration
When ready:
- use an LLM for generating scenario text
- validate the output shape strictly (match `ScenarioTemplate` / `ScenarioRule`)
- keep a rule-based fallback if AI output fails
- expose provider/model via env (e.g., `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`)

### 2. Full responsive UI pass
Focus:
- define breakpoints + spacing/typography scale in theme
- convert fixed sizes to flex/percent and ensure text wraps
- adaptive grids for dashboard/scenario cards based on screen width
- SafeAreaView + KeyboardAvoidingView on auth/chat screens

### 3. Add more UI polish
Possible improvements:
- compact layout tuning now applied to dashboard/scenarios/analytics; continue with animations and background pattern
- cyber background pattern / grid
- animated transitions for cards
- small icons per attack type
- richer scenario visuals

### 4. Expand persistent frontend continuity (AsyncStorage)
Current baseline:
- training session state, assistant chat, and learn state are persisted/restored
- training session state is now scoped per-user (storage key includes user ID)
- in-progress chat scenario state (`/chat/[scenarioId]`) and feedback transition context are now persisted/restored
- retention policy is now applied across chat/feedback + assistant/learn continuity keys (TTL + capped entries)
- assistant and learn tabs now expose explicit local-cache reset actions
- assistant/learn/chat/feedback continuity keys are scoped per-user and cache clears show confirmation alerts

Next step:
- add selective clear controls (e.g., clear only assistant history vs full training cache)

### 5. Extend analytics with persisted trends and aggregate insights
Current baseline:
- analytics now reads persisted snapshot + paginated events + persisted trends for active session
- analytics supports persisted attack-type/date-range filters and load-more activity pagination
- analytics now consumes persisted trend aggregates (`/trends/aggregate`) for daily and per-attack chart data

Next:
- add moving-average overlays (7-point or 5-point) using existing trend points + aggregate daily series
- add dedicated per-attack trend lines over time (multiple lines, one per attack type)
- add optional compare mode between date ranges (last 7d vs previous 7d)

### 6. Add persistence layer hardening
Status: implemented with SQLAlchemy + Alembic + user/session ownership, PostgreSQL-first DB config.

Current approach:
- dual-write mode (existing in-memory flow + DB writes)
- existing `/scenario/generate` and `/scenario/evaluate` contracts preserved
- persisted reads available via `/session/{session_id}`, `/session/{session_id}/events`, and `/session/{session_id}/trends`
- when a known `session_id` is reused after restart, in-memory state is restored from persisted snapshot before new updates
- Alembic migration tooling is now in place and wired in startup flow
- PostgreSQL is now the default (via `POSTGRES_*` or `DATABASE_URL`); SQLite is opt-in only
- session progress reads now use persisted state as source of truth (no in-memory progress cache)

Next persistence step:
- reduce remaining transient in-memory dependencies (primarily scenario context lifecycle) where practical
- expand repository-level tests for trend/event query behavior and pagination edge cases

### 7. Extract reusable hooks or subcomponents further
If needed:
- split `index.tsx` even more
- move the scenario body into a dedicated component
- move the stats section into a dashboard component

### 8. Add tests
Recommended:
- backend endpoint integration tests are now in place for:
  - generate/evaluate flow
  - `/session/{session_id}`
  - `/session/{session_id}/events`
  - validation edge cases (invalid IDs)
  - rate limit enforcement
- backend repository tests now cover persistence timeline filters and pagination edge cases
- unit tests for session recommendation and score logic
- basic UI smoke tests if needed

### 9. ~~Integrate frontend authentication with backend-protected API~~
Status: **COMPLETE**.

Implemented:
- login/register screens with cyber-themed UI and Romanian labels
- `AuthProvider` context with JWT token persistence in AsyncStorage
- automatic token injection on all protected API calls via `setAuthTokenAccessor()`
- auth gate in `(tabs)/index.tsx` redirecting unauthenticated users to `/login`
- per-user training session storage (isolated by user ID)
- personalized dashboard greeting + logout button
- token validation on app startup via `GET /auth/me`
- silent refresh before JWT expiry via `POST /auth/refresh`

### Recent fixes (2026-05-29)
- Switched backend default DB config to PostgreSQL using `POSTGRES_*` (or `DATABASE_URL`), with SQLite available only when explicitly set.
- Alembic now falls back to `DATABASE_URL` when `alembic.ini` has an empty `sqlalchemy.url`, preventing migration failures.
- README updated with Postgres-first defaults and explicit SQLite opt-in instructions.

### Recent fixes (2026-05-26)
- Scoped assistant/learn/chat/feedback AsyncStorage keys per-user and added confirmation alerts on cache clears.
- Added `POST /auth/refresh` plus frontend silent refresh scheduling before JWT expiration.
- Improved responsiveness on smaller screens with compact spacing and typography tweaks in Dashboard/Scenarios/Analytics.

### Recent fixes (2026-05-14)
- Fixed a web crash and stuck-evaluating loop: the delayed feedback navigation in `app/chat/[scenarioId].tsx` could fire after a session reset or unmount and trigger React DOM errors (removeChild / maximum update depth). Introduced `feedbackNavigationTimeoutRef`, cancelation before scheduling, and cleanup on unmount to prevent the stale navigation from running.
- Prevented stuck evaluation spinner: `evaluateWithOptionId` now returns `Promise<boolean>` and evaluation flows clear the evaluating state on failure. `useTrainingSession` was updated so failed evaluations return false and the UI stops showing the spinner.
- Added auth-failure handling: `features/training/api.ts` now exposes `setAuthFailureHandler()` and invokes a handler on `401` responses; `AuthProvider` registers a handler that logs the user out on auth failures so the app recovers from expired/invalid tokens.
- Gate protected UI and backend calls: tab layout now waits for auth hydration and redirects unauthenticated users to `/login` (prevents protected API calls before auth ready). `useTrainingSession` now short-circuits `startSimulation` / `evaluate*` when `isAuthenticated` is false and surfaces a localized AUTH_REQUIRED error instead of sending unauthenticated requests.
- Fixed AuthProvider init ordering bug: registration of the auth-failure handler was moved so it executes after `logout` is defined to avoid a ReferenceError during mount.
- Hooked adaptive-profile refresh: `useTrainingSession` now fetches the learning profile (`getLearningProfile()`) on mount and after evaluations, exposing `adaptiveProfile` and related loading/error state through the provider.

## Current Code Style / Structure Rules
- Keep feature-specific code in `features/training/` and `features/auth/`
- Keep screen-level orchestration in `app/(tabs)/index.tsx`
- Keep shared types and config separate from UI
- Prefer small focused components over large screens
- Preserve the API contract between frontend and backend
- Auth state lives in `AuthProvider`; training state in `TrainingSessionProvider` (auth wraps training)

## Run Instructions
### Backend
```bash
cd /Users/robertbalasoiu/Robert/Licenta2026/LucrareLicenta/BackendAPI
source .venv/bin/activate
export DATABASE_URL='postgresql+psycopg://user:pass@localhost:5432/cyber_training'
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend tests:
```bash
cd /Users/robertbalasoiu/Robert/Licenta2026/LucrareLicenta/BackendAPI
source .venv/bin/activate
python -m unittest discover -s tests -p "test_*.py" -q
```

### Frontend
```bash
cd /Users/robertbalasoiu/Robert/Licenta2026/LucrareLicenta/CyberSecurityApp
npx expo start
```

## Notes for the Next AI Tool
Focus on incremental improvements only.

Good next tasks:
- add LLM integration with strict schema validation + fallback
- finish a full responsive UI pass across all screens
- add compare-mode analytics (last 7d vs previous 7d) and export/share
- add selective clear controls for cache (assistant-only / learn-only / full)
- consider migrating token storage from AsyncStorage to `expo-secure-store` for production

Avoid large rewrites unless necessary.
Preserve the current modular structure and API contract.
