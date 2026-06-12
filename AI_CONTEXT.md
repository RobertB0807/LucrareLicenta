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
- AI: Ollama-backed scenario generation with strict validation and rule-based fallback; assistant remains rule-based
- Auth: Firebase Authentication on the frontend, Firebase token verification on the backend, local user/profile mapping in PostgreSQL or SQLite

## Current State
The project is a functional production-v1 work in progress; MVP scope is no longer the target.

### Backend status
Backend lives in `BackendAPI/` and currently includes:
- `main.py` for API routing and auth middleware
- `auth_service.py` for password hashing + JWT token handling
- `firebase_auth_service.py` for Firebase Admin verification of ID tokens
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
- `GET /scenario/{scenario_id}`
- `POST /assistant/ask`
- `GET /learning/path`
- `POST /learning/path/lessons/{lesson_id}/complete`
- `GET /sessions`
- `GET /session/{session_id}`
- `GET /session/{session_id}/events`
- `GET /session/{session_id}/trends`
- `GET /session/{session_id}/trends/aggregate`
- protected API routes via Bearer JWT auth middleware (all routes except `health` + auth register/login)
- protected API routes now accept either local JWTs or Firebase ID tokens
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
- local Ollama scenario generation for adaptive/random flows (`qwen3:8b` by default)
- strict Pydantic validation for generated content, reserved `.invalid` domains, and fixed option IDs
- automatic rule-based fallback when Ollama is disabled, unavailable, times out, or returns invalid content
- deterministic catalog selections bypass the LLM when `template_id` is provided
- persisted generation metadata: content source, model, duration, and fallback reason
- adaptive session scoring
- per-attack statistics
- recommendation logic for the next scenario
- session event history (`recent_events`) with timestamp and tone metadata
- persistence for users, sessions, attempts and events via SQLAlchemy (PostgreSQL default via `DATABASE_URL` or `POSTGRES_*`; SQLite opt-in)
- startup DB bootstrap now applies Alembic migrations (`upgrade head`) when available, with a safe ORM `create_all` fallback if Alembic is missing
- scenario evaluation is restart-safe: when in-memory scenario context is missing, backend restores rule context from persisted `scenario_attempts` data
- authenticated users can list their persisted sessions with pagination, summary metrics, latest scenario metadata, and pending scenario recovery
- structured learning path with beginner/intermediate/advanced modules, lesson completion, scenario mastery requirements, XP, levels, streaks, goals, and badges
- learning-path scenario progress reuses the persisted adaptive profile; lesson/gamification state is stored in `user_learning_path_progress`
- scenario generation now persists the parent session before FK-dependent attempt/event records, keeping PostgreSQL writes valid
- Firebase-linked users are stored with `firebase_uid` so a Firebase account maps to one local user record
- `/auth/me` now returns explicit CORS-safe errors for missing/invalid tokens and backend mapping conflicts
- `BackendAPI/.env` is loaded automatically through `python-dotenv`

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
- `app/sessions.tsx` for backend-backed session history and recovery
- `app/learning-path.tsx` for structured modules, objectives, XP, streaks, and badges
- `app/login.tsx` for user authentication
- `app/register.tsx` for new account creation

Navigation updates:
- `app/(tabs)/_layout.tsx` now defines the new visible tabs and hides legacy routes (`index`, `training`, `explore`)
- `app/_layout.tsx` wraps everything with `AuthProvider` (outermost) → `TrainingSessionProvider`, and includes stack routes for `login`, `register`, `sessions`, `learning-path`, `chat/[scenarioId]`, and `feedback/[scenarioId]`
- `app/(tabs)/index.tsx` acts as an auth gate and redirects unauthenticated users to `/login`

The existing `features/training/*` architecture is still present and reusable.

Auth feature module (`features/auth/`):
- `auth-api.ts` — API client for auth endpoints and Firebase Auth REST flows; falls back to backend auth when Firebase is not configured
- `auth-context.tsx` — React context provider managing login/register/logout, optional remembered sessions, silent refresh, and automatic token accessor wiring
- `secure-auth-storage.ts` — Expo SecureStore persistence on native with AsyncStorage fallback on web and legacy migration support

Current integration level:
- frontend auth is fully wired: login/register screens, Firebase Auth when configured, and automatic token injection on all protected API calls
- chat/feedback flow is now wired to real session continuity (`session_id` carried through routes)
- analytics now consumes persisted backend session snapshot + recent events when a session is active
- assistant and learn tabs now use real backend AI responses via `POST /assistant/ask`
- dashboard and scenarios now consume backend scenario catalog (`GET /scenario/catalog`) through shared `useTrainingSession` state
- dashboard header shows personalized greeting ("Bună, {displayName}") and logout button
- local continuity is enabled via AsyncStorage for training session state, assistant/learn conversations, and in-progress chat/feedback continuity
- login includes an enabled-by-default "Ține-mă minte" option; remembered sessions persist for a fixed maximum of 7 days, while unchecked sessions remain memory-only
- local continuity keys for training, assistant, learn, chat, and feedback are scoped per-user (storage key includes user ID) so each account has isolated training data
- silent auth refresh is scheduled before JWT expiry to reduce session drops
- protected API calls in `useTrainingSession` are gated on `isAuthenticated` — no backend calls are made before login
- the dashboard exposes session history; users can activate a previous session, open its analytics, or resume its latest pending scenario
- the dashboard includes a learning-path card showing current level, XP, overall progress, and next required activity

## Recent Progress (April-May 2026)
- Added a structured learning path:
  - three sequential modules: beginner, intermediate, and advanced
  - lesson steps plus attack/difficulty-specific scenario requirements
  - module unlocking based on completed requirements and persisted adaptive mastery scores
  - persistent XP, levels, current/longest streak, and completed lessons
  - daily activity and weekly scenario objectives
  - unlockable badges based on activity, accuracy, streaks, and module completion
  - dedicated `/learning-path` screen with direct lesson/scenario actions
  - migration `20260608_0007` adds `user_learning_path_progress`
  - scenario evaluation awards XP atomically with score/mastery updates
  - endpoint tests cover initial state, idempotent lesson completion, locked content, XP, and module unlocking
- Added backend-backed session history and recovery:
  - `GET /sessions` returns an ownership-scoped, paginated list ordered by latest update
  - summaries include score, accuracy, generated/evaluated counts, latest attack/difficulty, and pending scenario ID
  - `app/sessions.tsx` supports continuing a session, viewing its analytics, and resuming an unevaluated scenario
  - `useTrainingSession.activateSession(...)` restores server stats/events and makes a historical session active
  - backend tests cover pagination, ordering, ownership isolation, authentication, pending scenarios, and empty history
  - scenario persistence order was corrected so PostgreSQL parent rows exist before attempt/event FK writes
- Fixed stale feedback navigation across logout/account changes:
  - root stack now protects tabs, chat, feedback, and modal routes with `Stack.Protected`
  - logout explicitly replaces the active route with `/login`
  - delayed chat-to-feedback navigation is cancelled when auth/user/component state changes
  - feedback redirects to Home when neither current evaluation nor user-scoped persisted context exists
- Added deterministic scenario generation from catalog selections:
  - `POST /scenario/generate` accepts optional `template_id`
  - catalog template IDs resolve through the same shared helper used to build catalog responses
  - mismatched template/attack/difficulty requests return `422`
  - the frontend catalog passes the selected template ID through the chat route and training provider
  - dashboard and adaptive flows keep random template selection when no `template_id` is supplied
- Added full generated-scenario persistence and restoration:
  - Alembic revision `20260607_0006` stores `template_id`, channel, attacker message, options, and red flags
  - `GET /scenario/{scenario_id}` restores the exact generated payload with per-user ownership enforcement
  - chat recovery loads persisted generated scenarios before falling back to fresh generation
  - backend tests cover payload serialization, restart restoration, unknown scenarios, and cross-user access
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
- Added Firebase Auth migration:
  - frontend login/register use Firebase Auth REST when `EXPO_PUBLIC_FIREBASE_API_KEY` is set
  - backend verifies Firebase ID tokens with `firebase-admin`
  - backend creates/links local users via `firebase_uid`
  - register flow now returns to the login screen after account creation instead of staying signed in
  - backend `/auth/me` now surfaces validation conflicts with explicit `409` instead of masking them as generic auth errors
- Added Firebase / env / run-script support:
  - backend loads `BackendAPI/.env` via `python-dotenv`
- `run-all.sh` is the standard full-app launcher:
  - generates a private `.env.production` with strong local secrets on first run
  - starts PostgreSQL, Redis, Alembic migrations, FastAPI, and Prometheus through Docker Compose
  - forwards Firebase and Ollama settings from `BackendAPI/.env` into the API container
  - waits for `/health/ready`, optionally runs the production smoke test, and starts Expo
  - stops containers on `Ctrl+C` while preserving Docker data volumes
  - Expo package versions were aligned to the installed SDK
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
  - local backend auth uses separate typed JWTs: 60-minute access tokens and 7-day refresh tokens
  - backend `POST /auth/refresh` validates a refresh token supplied in the request body and rotates both tokens
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
- Adaptive/random scenario content uses local Ollama when enabled, with validated rule-based fallback.
- The app keeps a stable API contract so the frontend will not break when LLM generation is added later.
- The frontend is now organized feature-first for readability and future scalability.
- The UI theme is intentionally cyber-themed with dark console-like styling.
- Remembered auth sessions are stored in Expo SecureStore on native; web uses the AsyncStorage fallback and should move to secure HTTP-only cookies for a production web deployment.
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
- `BackendAPI/migrations/versions/20260607_0006_persist_generated_scenario_payload.py`
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

## Production V1 Implementation Order
The target is now a complete production-ready v1, not an MVP. Implement in this order:

### Phase 1. Production and security foundation
- introduce explicit `development`, `test`, and `production` runtime environments
- validate production secrets, database configuration, CORS origins, and proxy trust at startup
- add liveness/readiness checks, security headers, request correlation, and structured logging
- move rate limiting and transient shared state to Redis for multi-instance deployments
- define PostgreSQL deployment, migrations, backups, restore procedures, monitoring, and error tracking
- add CI checks for backend tests, frontend lint/type-check, migrations, and production builds

### Phase 2. Real AI assistant
- upgrade `/assistant/ask` to use Ollama with strict Pydantic structured-output validation
- retain the deterministic coaching fallback for disabled, invalid, unavailable, or timed-out AI responses
- send bounded conversation, lesson, scenario, and user-weakness context
- expose content source, model, generation latency, and fallback reason
- add assistant safety tests, prompt-injection resistance, context limits, and failure observability

### Phase 3. Backend-driven learning and assessment system
- move lesson content out of frontend screens into persisted backend models and APIs
- add lesson quizzes, module exams, scoring, attempts, prerequisites, and mastery rules
- persist lesson/exam history and issue completion summaries or certificates
- connect recommendations to learning-path gaps and adaptive scenario performance

### Phase 4. Complete training modes and scenario coverage
- add spear phishing, vishing, QR phishing, business impersonation, and social-media scams
- add campaign mode, daily challenges, timed exercises, random/adaptive training, retry, review, and bookmarks
- support richer channel-specific simulations while preserving safe fictitious content
- expand scenario validation, diversity controls, scoring tests, and recommendation tests

### Phase 5. Global analytics and reporting
- aggregate progress across all user sessions instead of requiring one active session
- add per-attack/per-difficulty trends, moving averages, range comparison, consistency, and learning-time metrics
- generate weakness insights and recommended next actions
- add CSV/PDF export and shareable progress reports

### Phase 6. Complete account and privacy management
- add email verification, forgot/reset password, password change, and profile editing
- add active-device/session management and remote logout
- add personal-data export, account deletion, retention rules, and consent/privacy screens
- harden deep links, stale-session cleanup, and Firebase/local-auth parity

### Phase 7. Engagement and notifications
- add configurable reminders, daily/weekly challenges, streak warnings, and achievement notifications
- add an in-app notification center and notification preference controls
- implement push notification registration and backend scheduling

### Phase 8. Administration
- build a protected web admin interface
- manage scenarios, lessons, quizzes, badges, challenges, and users
- expose anonymized product/training analytics
- expose AI generation health, latency, validation failures, and fallback rates

### Phase 9. Release-quality client experience
- finish responsive layouts for phones, tablets, and web
- apply safe-area and keyboard handling to every full-screen flow and composer
- add accessibility labels, screen-reader behavior, dynamic-text support, and touch-target validation
- add offline/slow-network states, selective cache controls, animations, final assets, and remove legacy routes
- configure Android/iOS identifiers, EAS profiles, signed builds, and store metadata

### Phase 10. Full verification and release
- add frontend unit/component tests and end-to-end user-flow tests
- run PostgreSQL integration and migration tests
- test Firebase and local auth, Ollama fallback, restart recovery, expired tokens, and degraded networks
- validate on physical Android/iOS devices and supported web sizes
- complete deployment, backup/restore drill, monitoring alerts, security review, and release checklist

### Current Production V1 Progress (2026-06-10)
Phase 1 is complete. Implemented:
- centralized backend runtime configuration in `BackendAPI/app_config.py`
- explicit `APP_ENV` support for development, test, and production
- fail-fast production validation for JWT secret strength, PostgreSQL, and exact CORS origins
- wildcard CORS rejection and local-development origin defaults
- trusted proxy headers are disabled unless `TRUST_PROXY_HEADERS=true`
- API documentation defaults to disabled in production
- security headers and request correlation IDs on API responses
- public database readiness endpoint at `GET /health/ready`
- sanitized `.env.example` values with no machine-specific Firebase credential path
- backend configuration/readiness/security regression tests
- GitHub Actions CI for backend tests, frontend lint/type-check, and production web export
- structured JSON request/error logging with request IDs, latency, status, client, and user context
- optional Sentry error/performance tracking through environment configuration
- Prometheus request/rate-limit metrics at `GET /metrics`
- Redis-backed distributed rate limiting with fail-closed production behavior
- Docker production stack for FastAPI, PostgreSQL, Redis, one-shot Alembic migrations, and optional Prometheus
- PostgreSQL + Redis integration flow in GitHub Actions
- automated PostgreSQL backup and guarded restore scripts
- production stack smoke test covering auth, catalog, generation, evaluation, readiness, and metrics
- Prometheus alert rules for API downtime, elevated 5xx rate, and Redis limiter errors
- local validation completed successfully against the real Docker stack
- backup/restore recovery tested successfully, followed by a passing post-restore smoke test

Next implementation phase: Phase 2, the real AI assistant.

## Previous MVP Roadmap
The items below remain useful implementation detail, but the production phases above define priority.

### 1. Extend LLM integration to the assistant
Scenario generation status: implemented with local Ollama (`qwen3:8b`), strict Pydantic
structured-output validation, deterministic catalog bypass, and rule-based fallback.

Next:
- upgrade `/assistant/ask` to use the same Ollama provider
- validate assistant output and retain the existing deterministic coaching fallback
- add conversation context limits and response latency metadata

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
- generated scenarios are persisted with their complete render payload and restored via `/scenario/{scenario_id}`
- when a known `session_id` is reused after restart, in-memory state is restored from persisted snapshot before new updates
- Alembic migration tooling is now in place and wired in startup flow
- PostgreSQL is now the default (via `POSTGRES_*` or `DATABASE_URL`); SQLite is opt-in only
- session progress reads now use persisted state as source of truth (no in-memory progress cache)
- scenario evaluation is idempotent: score, mastery, and timeline events commit atomically once per `scenario_id`
- same-option retries return the stored result; retries with a different option return `409 Conflict`

Next persistence step:
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
- `AuthProvider` with optional "Ține-mă minte" persistence, enabled by default and capped at 7 days
- automatic token injection on all protected API calls via `setAuthTokenAccessor()`
- auth gate in `(tabs)/index.tsx` redirecting unauthenticated users to `/login`
- per-user training session storage (isolated by user ID)
- personalized dashboard greeting + logout button
- unchecked sessions stay in memory and require login after a cold start
- remembered sessions use SecureStore on native and are rehydrated through `/auth/me` or `/auth/refresh`
- silent refresh before access-token expiry via a separate refresh token

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
- Auth state now prefers Firebase-backed sessions when Firebase is configured; otherwise the backend JWT flow remains available as a fallback path

## Run Instructions
### Standard full app
```bash
cd /Users/robertbalasoiu/Robert/Licenta2026/LucrareLicenta
./run-all.sh
```

The default opens Expo web. Alternative modes:

```bash
FRONTEND_MODE=start ./run-all.sh
FRONTEND_MODE=ios ./run-all.sh
FRONTEND_MODE=android ./run-all.sh
RUN_SMOKE_TEST=true ./run-all.sh
```

Stop with `Ctrl+C`; PostgreSQL, Redis, and Prometheus data volumes are preserved.

### Backend tests
```bash
cd /Users/robertbalasoiu/Robert/Licenta2026/LucrareLicenta/BackendAPI
source .venv/bin/activate
./.venv/bin/python -m unittest discover -s tests -p "test_*.py" -q
```

## Notes for the Next AI Tool
Focus on incremental improvements only.

Good next tasks:
- harden auth/session handling further, especially deep links and stale-session cleanup
- add LLM integration with strict schema validation + fallback once the deterministic scenario flow is stable
- finish a full responsive UI pass across all screens
- add compare-mode analytics, export/share, and richer trend visualizations
- add selective clear controls for cache if the current broad reset becomes too blunt

Avoid large rewrites unless necessary.
Preserve the current modular structure and API contract.
