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
- `main.py` for API routing and session-aware orchestration
- `scenario_library.py` for the scenario templates
- `scenario_models.py` for shared models/types

Backend features currently implemented:
- `GET /health`
- `POST /scenario/generate`
- `POST /scenario/evaluate`
- scenario templates for all combinations of:
  - attack type: phishing, smishing, impersonation
  - difficulty: easy, medium, hard
- multiple templates per combination
- adaptive session scoring
- per-attack statistics
- recommendation logic for the next scenario

### Frontend status
Frontend lives in `CyberSecurityApp/`.

The main training feature is already modularized into:
- `app/(tabs)/index.tsx` for screen orchestration
- `app/(tabs)/analytics.tsx` for live training analytics
- `features/training/api.ts` for API calls
- `features/training/types.ts` for shared types
- `features/training/options.ts` for static config
- `features/training/useTrainingSession.ts` for the shared session provider and hook
- `features/training/components/` for UI components
- `features/training/ui-theme.ts` for feature-specific colors/helpers

UI components currently extracted:
- `TrainingHero`
- `ScenarioSetupCard`
- `FeedbackPanel`

The training feature now exposes a shared session context, so the Home and Analytics tabs read from the same live state.

## What the App Already Does
1. User selects attack type and difficulty.
2. App sends request to backend to generate a scenario.
3. User picks an answer.
4. Backend evaluates the answer.
5. App shows:
   - result
   - score delta
   - session stats
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
- `BackendAPI/scenario_library.py`
- `BackendAPI/scenario_models.py`

### Frontend
- `CyberSecurityApp/app/(tabs)/index.tsx`
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

### 1. Backend refactor into service layer
Current `main.py` still contains orchestration and adaptive logic.
Suggested next step:
- extract session/scoring/recommendation logic into a service module
- keep `main.py` only for route definitions

### 2. Add more UI polish
Possible improvements:
- cyber background pattern / grid
- animated transitions for cards
- small icons per attack type
- richer scenario visuals
- better mobile spacing for smaller screens

### 3. Extract reusable hooks or subcomponents further
If needed:
- split `index.tsx` even more
- move the scenario body into a dedicated component
- move the stats section into a dashboard component

### 4. Add persistence
Current session data is in memory only.
Next step:
- add SQLite or Postgres
- persist sessions, attempts, score, stats, and history

### 5. Add LLM integration
When ready:
- use an LLM for generating scenario text
- validate the output shape strictly
- keep a rule-based fallback if AI output fails

### 6. Extend analytics
The analytics tab is now implemented, but can still be expanded with:
- progression over time
- richer event history
- charts or trend visualizations
- session export / persistence

### 7. Add tests
Recommended:
- backend tests for generate/evaluate endpoints
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
- backend service layer extraction
- analytics enhancements and event history
- more cyber-themed UI polish
- persistence layer
- LLM integration with fallback

Avoid large rewrites unless necessary.
Preserve the current modular structure and API contract.
