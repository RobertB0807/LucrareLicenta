# CYBERSECURITY TRAINING APP

APLICAȚIE WEB ȘI MOBILĂ PENTRU ANTRENAMENT ÎMPOTRIVA ATACURILOR DE INGINERIE SOCIALĂ

Aplicație full-stack care generează scenarii interactive de phishing, smishing și impersonare, evaluează răspunsurile utilizatorului, urmărește progresul de învățare și oferă recomandări personalizate printr-un asistent AI opțional.

Repository public:

```
https://github.com/RobertB0807/LucrareLicenta
```


## Configurare

În rădăcina proiectului se creează fișierul `.env.production`:

```
POSTGRES_DB=cyber_training
POSTGRES_USER=cyber_training
POSTGRES_PASSWORD="parola_puternica"
JWT_SECRET_KEY="o_cheie_secreta_lunga_si_aleatoare"
APP_CORS_ORIGINS="http://localhost:8081,http://127.0.0.1:8081"
API_PORT=8000
API_WORKERS=1
```

În folderul `BackendAPI` se creează fișierul `.env`:

```
LLM_ENABLED=false
LLM_PROVIDER=ollama
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="qwen3:8b"
LLM_TIMEOUT_SECONDS=60
LIVE_DRILL_EMAIL_ENABLED=false
LIVE_DRILL_PUBLIC_BASE_URL="http://127.0.0.1:8000"
```


## Compilare

Backend:

```
cd BackendAPI
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
alembic upgrade head
```

Frontend:

```
cd CyberSecurityApp
npm install
npm run export:web
```

Docker:

```
docker compose --env-file .env.production -f docker-compose.production.yml build api migrate
```


## Lansare

Aplicația completă:

```
chmod +x run-all.sh
./run-all.sh
```

Backend (pornește pe portul 8000):

```
cd BackendAPI
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```
cd CyberSecurityApp
npm run web
```

AI local, opțional (altfel comută automat pe scenarii rule-based):

```
ollama pull qwen3:8b
ollama serve
```

Mobil, opțional:

```
FRONTEND_MODE=phone ./run-all.sh
FRONTEND_MODE=android ./run-all.sh
FRONTEND_MODE=ios ./run-all.sh
```

Adresa API-ului este `http://localhost:8000`, iar aplicația web rulează local la `http://localhost:8081`.
