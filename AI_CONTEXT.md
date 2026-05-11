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
- `main.py` for API routing only
- `training_service.py` for session orchestration, scoring, recommendation, and event timeline
- `db.py` for SQLite engine/session initialization
- `persistence_models.py` for SQLAlchemy ORM models
- `persistence_repository.py` for persistence read/write operations
- `scenario_library.py` for the scenario templates
- `scenario_models.py` for shared models/types
- Alembic migration setup (`alembic.ini`, `migrations/`, revision history in `migrations/versions/`)
- backend API tests in `tests/test_api_endpoints.py`

Backend features currently implemented:
- `GET /health`
- `GET /scenario/catalog`
- `POST /scenario/generate`
- `POST /scenario/evaluate`
- `POST /assistant/ask`
- `GET /session/{session_id}`
- `GET /session/{session_id}/events`
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
- SQLite persistence for sessions, attempts and events
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

Navigation updates:
- `app/(tabs)/_layout.tsx` now defines the new visible tabs and hides legacy routes (`index`, `training`, `explore`)
- `app/_layout.tsx` now includes stack routes for `chat/[scenarioId]` and `feedback/[scenarioId]`
- `app/(tabs)/index.tsx` now redirects to `/(tabs)/dashboard`

The existing `features/training/*` architecture is still present and reusable.

Current integration level:
- chat/feedback flow is now wired to real session continuity (`session_id` carried through routes)
- analytics now consumes persisted backend session snapshot + recent events when a session is active
- assistant and learn tabs now use real backend AI responses via `POST /assistant/ask`
- dashboard and scenarios now consume backend scenario catalog (`GET /scenario/catalog`)
- local continuity is enabled via AsyncStorage for training session state and assistant/learn conversations

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

## What the App Already Does
1. User selects attack type and difficulty.
2. App sends request to backend to generate a scenario.
3. User picks an answer.
4. Backend evaluates the answer.
5. App shows:
   - result
   - score delta
   - session stats
   - recent event history in analytics
   - adaptive recommendation
   - red flags
6. User can continue with current selection or recommended scenario.

## Important Design Decisions
- The scenario content is still rule-based for now, not LLM-generated.
- The app keeps a stable API contract so the frontend will not break when LLM generation is added later.
- The frontend is now organized feature-first for readability and future scalability.
- The UI theme is intentionally cyber-themed with dark console-like styling.

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
- `BackendAPI/tests/test_api_endpoints.py`

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
- `CyberSecurityApp/app/_layout.tsx`
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
Priority order:

### 1. Finish wiring remaining tabs to real backend/session state
Current gap:
- analytics + chat/feedback are now partially integrated with real session data
- `dashboard` and `scenarios` now use backend catalog, but still rely on simplified local derivations in parts of the UI
- the older training/session logic in `features/training/` is not yet the source of truth for all visible product routes

Next integration step:
- make scenario catalog/dashboard cards pull from real session + backend signals
- unify route-level state flow around shared `useTrainingSession` source of truth
- reduce remaining local constants/sample placeholders across tabs

### 2. Add persistence layer hardening
Status: implemented as MVP with SQLite + SQLAlchemy + repository + startup init.

Current approach:
- dual-write mode (existing in-memory flow + DB writes)
- existing `/scenario/generate` and `/scenario/evaluate` contracts preserved
- persisted reads available via `/session/{session_id}` and `/session/{session_id}/events`
- when a known `session_id` is reused after restart, in-memory state is restored from persisted snapshot before new updates
- Alembic migration tooling is now in place and wired in startup flow

Next persistence step:
- switch read path fully to DB after test coverage
- optionally remove in-memory state

### 3. Expand persistent frontend continuity (AsyncStorage)
Current baseline:
- training session state, assistant chat, and learn state are persisted/restored

Next step:
- persist in-progress chat scenario state (`/chat/[scenarioId]`) and feedback transition context
- add retention/cleanup policy for stored conversation history

### 4. Add more UI polish
Possible improvements:
- cyber background pattern / grid
- animated transitions for cards
- small icons per attack type
- richer scenario visuals
- better mobile spacing for smaller screens

### 5. Extract reusable hooks or subcomponents further
If needed:
- split `index.tsx` even more
- move the scenario body into a dedicated component
- move the stats section into a dashboard component

### 6. Extend analytics with persisted trends (next step after current integration)
Current baseline:
- current analytics now reads persisted snapshot + paginated events for active session

Next:
- progression over time (score/accuracy evolution)
- richer timeline queries (filters by attack type and date)
- charts based on stored attempts
- pagination/load-more behavior in UI for longer event history

### 7. Add LLM integration
When ready:
- use an LLM for generating scenario text
- validate the output shape strictly
- keep a rule-based fallback if AI output fails

### 8. Add tests
Recommended:
- backend endpoint integration tests are now in place for:
  - generate/evaluate flow
  - `/session/{session_id}`
  - `/session/{session_id}/events`
  - validation edge cases (invalid IDs)
  - rate limit enforcement
- next: backend tests for persistence repositories and timeline queries
- unit tests for session recommendation and score logic
- basic UI smoke tests if needed

## Current Code Style / Structure Rules
- Keep feature-specific code in `features/training/`
- Keep screen-level orchestration in `app/(tabs)/index.tsx`
- Keep shared types and config separate from UI
- Prefer small focused components over large screens
- Preserve the API contract between frontend and backend

## Run Instructions
### Backend
```bash
cd /Users/robertbalasoiu/Robert/Licenta2026/LucrareLicenta/BackendAPI
source .venv/bin/activate
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
- continue connecting remaining tab UX to backend data and shared session state
- extend AsyncStorage continuity to scenario chat/feedback flow
- switch read path fully to DB as source of truth
- extend analytics from persisted events/attempts
- then iterate on UI polish and LLM integration with fallback

Avoid large rewrites unless necessary.
Preserve the current modular structure and API contract.
