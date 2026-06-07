# BackendAPI MVP

Backend minimal pentru MVP-ul aplicatiei de simulare phishing.

## 1. Instalare dependinte

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

## 2. Rulare server

```bash
uvicorn main:app --reload --port 8000
```

La pornire, backend-ul initializeaza automat baza de date configurata prin `DATABASE_URL`.

Implicit (daca `DATABASE_URL` nu este setat), foloseste PostgreSQL local:

- user: `POSTGRES_USER` (implicit utilizatorul local)
- parola: `POSTGRES_PASSWORD` (implicit gol)
- host: `POSTGRES_HOST` (implicit `localhost`)
- port: `POSTGRES_PORT` (implicit `5432`)
- baza: `POSTGRES_DB` (implicit acelasi cu user-ul)

Exemplu PostgreSQL pentru mediu shared/prod:

```bash
export DATABASE_URL='postgresql+psycopg://app_user:app_pass@localhost:5432/cyber_training'
uvicorn main:app --host 0.0.0.0 --port 8000
```

Daca primesti erori cu user/baza inexistente, creeaza-le in Postgres sau seteaza explicit `POSTGRES_USER`/`POSTGRES_DB`.

Compatibilitate: URL-urile `postgres://` si `postgresql://` sunt normalizate automat la driver-ul `psycopg`.

Pentru SQLite (optional), seteaza explicit:

```bash
export DATABASE_URL='sqlite:///BackendAPI/training_data.db'
```

### Firebase Auth optional

Backend-ul accepta in continuare JWT-urile locale existente, dar poate valida si Firebase ID tokens.
Pentru Firebase, instaleaza dependintele din `requirements.txt`, apoi creeaza `BackendAPI/.env`
dupa modelul `BackendAPI/.env.example`. Backend-ul incarca automat acest fisier la pornire.

Configureaza una dintre variante:

```env
# Varianta recomandata local: fisier service account
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/firebase-service-account.json
FIREBASE_PROJECT_ID=your-firebase-project-id

# Alternativ: JSON intr-o variabila de mediu single-line
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Cand Firebase este configurat, clientul trimite:

```http
Authorization: Bearer <firebase_id_token>
```

FastAPI valideaza token-ul si creeaza/leaga automat utilizatorul local prin `firebase_uid`.

### Rulare pentru telefon fizic

Cand testezi din Expo Go pe telefon, backend-ul trebuie expus in retea locala:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

In frontend, creeaza fisierul `CyberSecurityApp/.env.local` cu URL-ul laptop-ului din aceeasi retea Wi-Fi:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.XX:8000
```

Inlocuieste `192.168.1.XX` cu IP-ul local real al laptop-ului.

## 2.1 Migrations (Alembic)

Schema DB este gestionata prin Alembic si se aplica automat la startup.
Pentru porniri cu `--lifespan off`, ruleaza explicit `alembic upgrade head` inainte de Uvicorn.

Comenzi utile:

```bash
alembic upgrade head
alembic downgrade -1
```

## 3. Endpoint-uri MVP

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /scenario/generate`
- `POST /scenario/evaluate`
- `GET /scenario/catalog`
- `GET /scenario/{scenario_id}`
- `POST /assistant/ask`
- `GET /learning/profile`
- `GET /session/{session_id}`
- `GET /session/{session_id}/events?limit=20&offset=0`
- `GET /session/{session_id}/trends?limit=30&offset=0`
- `GET /session/{session_id}/trends/aggregate?attack_type=phishing&since=<iso>&until=<iso>`

`POST /scenario/evaluate` este idempotent per `scenario_id`:
- retrimiterea aceleiasi optiuni intoarce rezultatul salvat cu `was_already_evaluated: true`
- retrimiterea unei alte optiuni intoarce `409 Conflict`
- scorul, progresul adaptiv si evenimentul sesiunii sunt aplicate o singura data

Toate endpoint-urile in afara de `GET /health`, `POST /auth/register` si `POST /auth/login`
necesita header:

```http
Authorization: Bearer <access_token>
```

## 4. Rulare teste backend

```bash
python3 -m unittest discover -s tests -p "test_*.py" -q
```

## 5. Security hardening (MVP)

- Rate limiting pentru endpoint-urile sensibile:
  - `POST /scenario/generate`: max. 30 cereri / 60 secunde / client
  - `POST /scenario/evaluate`: max. 60 cereri / 60 secunde / client
  - `POST /assistant/ask`: max. 60 cereri / 60 secunde / client
- Validare stricta pentru identificatori (`session_id`, `scenario_id`, `selected_option_id`) cu pattern controlat.
- Cand limita este depasita, API-ul raspunde cu `429 Too Many Requests` si header `Retry-After`.
