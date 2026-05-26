# BackendAPI MVP

Backend minimal pentru MVP-ul aplicatiei de simulare phishing.

## 1. Instalare dependinte

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Rulare server

```bash
uvicorn main:app --reload --port 8000
```

La pornire, backend-ul initializeaza automat baza de date configurata prin `DATABASE_URL`.

Implicit (daca `DATABASE_URL` nu este setat), foloseste SQLite local:

- `BackendAPI/training_data.db`

Exemplu PostgreSQL pentru mediu shared/prod:

```bash
export DATABASE_URL='postgresql+psycopg://app_user:app_pass@localhost:5432/cyber_training'
uvicorn main:app --host 0.0.0.0 --port 8000
```

Compatibilitate: URL-urile `postgres://` si `postgresql://` sunt normalizate automat la driver-ul `psycopg`.

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
- `POST /assistant/ask`
- `GET /learning/profile`
- `GET /session/{session_id}`
- `GET /session/{session_id}/events?limit=20&offset=0`
- `GET /session/{session_id}/trends?limit=30&offset=0`
- `GET /session/{session_id}/trends/aggregate?attack_type=phishing&since=<iso>&until=<iso>`

Toate endpoint-urile in afara de `GET /health`, `POST /auth/register` si `POST /auth/login`
necesita header:

```http
Authorization: Bearer <access_token>
```

## 4. Rulare teste backend

```bash
python -m unittest discover -s tests -p "test_*.py" -q
```

## 5. Security hardening (MVP)

- Rate limiting pentru endpoint-urile sensibile:
  - `POST /scenario/generate`: max. 30 cereri / 60 secunde / client
  - `POST /scenario/evaluate`: max. 60 cereri / 60 secunde / client
  - `POST /assistant/ask`: max. 60 cereri / 60 secunde / client
- Validare stricta pentru identificatori (`session_id`, `scenario_id`, `selected_option_id`) cu pattern controlat.
- Cand limita este depasita, API-ul raspunde cu `429 Too Many Requests` si header `Retry-After`.
