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
- AI: planned LLM integration later

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

Backend features currently implemented:
- `GET /health`
- `POST /scenario/generate`
- `POST /scenario/evaluate`
- `GET /session/{session_id}`
- `GET /session/{session_id}/events`
- scenario templates for all combinations of:
  - attack type: phishing, smishing, impersonation
  - difficulty: easy, medium, hard
- multiple templates per combination
- adaptive session scoring
- per-attack statistics
- recommendation logic for the next scenario
- session event history (`recent_events`) with timestamp and tone metadata
- SQLite persistence for sessions, attempts and events

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

The existing `features/training/*` architecture is still present and reusable, but many of the new screens currently use mocked/static data for UI prototyping.

## Recent Progress (April 2026)
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
- Reworked analytics into a richer dashboard-style presentation (charts, weak spots, badges) currently driven by local sample data.

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
- `BackendAPI/training_service.py`
- `BackendAPI/db.py`
- `BackendAPI/persistence_models.py`
- `BackendAPI/persistence_repository.py`
- `BackendAPI/scenario_library.py`
- `BackendAPI/scenario_models.py`

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
- `CyberSecurityApp/features/training/useTrainingSession.ts`
- `CyberSecurityApp/features/training/types.ts`
- `CyberSecurityApp/features/training/options.ts`
- `CyberSecurityApp/features/training/ui-theme.ts`
- `CyberSecurityApp/features/training/components/TrainingHero.tsx`
- `CyberSecurityApp/features/training/components/ScenarioSetupCard.tsx`
- `CyberSecurityApp/features/training/components/FeedbackPanel.tsx`

## Remaining Tasks / Suggested Roadmap
Priority order:

### 1. Connect new UX flows to real backend/session state
Current gap:
- new tab screens, chat simulation, and feedback are mostly mock-data driven
- the older training/session logic in `features/training/` is not yet the source of truth for all new routes

Next integration step:
- wire scenario list/generation/evaluation to backend endpoints
- pass real `session_id`, scenario payload, and evaluation outputs through the chat + feedback route flow
- make analytics consume persisted session/event data instead of local constants

### 2. Add persistence layer hardening
Status: implemented as MVP with SQLite + SQLAlchemy + repository + startup init.

Current approach:
- dual-write mode (existing in-memory flow + DB writes)
- existing `/scenario/generate` and `/scenario/evaluate` contracts preserved
- persisted reads available via `/session/{session_id}` and `/session/{session_id}/events`
- when a known `session_id` is reused after restart, in-memory state is restored from persisted snapshot before new updates

Next persistence step:
- add migration tooling (Alembic)
- switch read path fully to DB after test coverage
- optionally remove in-memory state

### 3. Add more UI polish
Possible improvements:
- cyber background pattern / grid
- animated transitions for cards
- small icons per attack type
- richer scenario visuals
- better mobile spacing for smaller screens

### 4. Extract reusable hooks or subcomponents further
If needed:
- split `index.tsx` even more
- move the scenario body into a dedicated component
- move the stats section into a dashboard component

### 5. Extend analytics with persisted trends
Once persistence is available:
- progression over time (score/accuracy evolution)
- richer timeline queries (filters by attack type and date)
- charts based on stored attempts

### 6. Add LLM integration
When ready:
- use an LLM for generating scenario text
- validate the output shape strictly
- keep a rule-based fallback if AI output fails

### 7. Add tests
Recommended:
- backend tests for generate/evaluate endpoints
- backend tests for persistence repositories and timeline queries
- integration tests for `/session/{session_id}` and `/session/{session_id}/events`
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

### Frontend
```bash
cd /Users/robertbalasoiu/Robert/Licenta2026/LucrareLicenta/CyberSecurityApp
npx expo start
```

## Notes for the Next AI Tool
Focus on incremental improvements only.

Good next tasks:
- connect new tab/chat/feedback UX to backend data and shared session state
- add migration tooling + DB-focused tests
- switch read path fully to DB
- extend analytics from persisted events/attempts
- then iterate on UI polish and LLM integration with fallback

Avoid large rewrites unless necessary.
Preserve the current modular structure and API contract.
