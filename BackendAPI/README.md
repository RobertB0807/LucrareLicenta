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

La pornire, backend-ul initializeaza automat o baza SQLite locala in:

- `BackendAPI/training_data.db`

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
- `POST /scenario/generate`
- `POST /scenario/evaluate`
- `GET /session/{session_id}`
- `GET /session/{session_id}/events?limit=20&offset=0`

## 4. Rulare teste backend

```bash
python -m unittest discover -s tests -p "test_*.py" -q
```
