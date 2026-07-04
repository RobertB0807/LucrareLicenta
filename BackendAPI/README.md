# CyberSecurity Training API

Backend FastAPI pentru aplicatia de antrenament impotriva atacurilor de inginerie sociala.

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

### Medii si validare de productie

Backend-ul foloseste `APP_ENV=development|test|production`.

In `production`, pornirea este oprita daca:

- `JWT_SECRET_KEY` lipseste, este valoarea implicita sau are mai putin de 32 de caractere
- `DATABASE_URL` foloseste SQLite in loc de PostgreSQL
- `APP_CORS_ORIGINS` nu contine cel putin o origine exacta
- `APP_CORS_ORIGINS` contine wildcard-ul `*`
- `REDIS_URL` nu este configurat
- `RATE_LIMIT_FAIL_OPEN` sau `AUTO_MIGRATE` sunt active

Exemplu:

```env
APP_ENV=production
DATABASE_URL=postgresql+psycopg://app_user:strong-password@db:5432/cyber_training
JWT_SECRET_KEY=replace-with-a-unique-random-secret-of-at-least-32-characters
APP_CORS_ORIGINS=https://app.example.com,https://admin.example.com
TRUST_PROXY_HEADERS=true
API_DOCS_ENABLED=false
AUTO_MIGRATE=false
REDIS_URL=redis://redis:6379/0
RATE_LIMIT_FAIL_OPEN=false
LOG_JSON=true
METRICS_ENABLED=true
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1
```

`TRUST_PROXY_HEADERS` trebuie activat doar cand API-ul ruleaza exclusiv in spatele unui
reverse proxy controlat; stack-ul Docker il lasa dezactivat deoarece expune direct portul
API. Documentatia OpenAPI este dezactivata implicit in productie.
Productia ruleaza migrarile printr-un job separat inainte de pornirea API-ului.

### Logging, metrics si error tracking

- fiecare request primeste sau propaga `X-Request-ID`
- productia emite log-uri JSON cu metoda, ruta normalizata, status, durata, IP si user ID
- `GET /metrics` expune metrici Prometheus cand `METRICS_ENABLED=true`
- `SENTRY_DSN` activeaza raportarea exceptiilor si performance tracing
- `SENTRY_TRACES_SAMPLE_RATE` controleaza rata de sampling intre `0.0` si `1.0`

Rate limiting-ul foloseste Redis cand `REDIS_URL` este setat. In development/test poate
reveni la memoria procesului daca `RATE_LIMIT_FAIL_OPEN=true`; productia refuza request-uri
cu `503` daca Redis nu este disponibil.

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

### Generare locala cu Ollama

Scenariile adaptive, generate fara `template_id`, pot folosi un model Ollama local.
Instaleaza si porneste Ollama, apoi descarca modelul:

```bash
ollama pull qwen3:8b
```

Configureaza `BackendAPI/.env`:

```env
LLM_ENABLED=true
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
LLM_TIMEOUT_SECONDS=60
```

Output-ul modelului este validat prin schema Pydantic inainte de utilizare. Daca Ollama
nu este disponibil, raspunsul este invalid sau depaseste timeout-ul, backend-ul foloseste
automat biblioteca rule-based. Selectiile explicite din catalog, care trimit `template_id`,
raman deterministe si nu apeleaza modelul.

Raspunsul de generare si persistenta includ `content_source`, `llm_model`,
`generation_ms` si `fallback_reason` pentru observabilitate si evaluarea lucrarii.

Același provider este folosit de `POST /assistant/ask`. Asistentul:

- validează răspunsul structurat (`answer`, `quick_tips`, `safety_status`) cu Pydantic
- acceptă maximum 8 mesaje de istoric, limitate la 600 de caractere fiecare
- primește context server-side din profilul adaptiv al utilizatorului
- poate folosi context de lecție și contextul unui scenariu deținut de utilizator
- izolează conversația și contextul ca date neîncrezătoare pentru rezistență la prompt injection
- refuză cererile explicit abuzive înainte de apelarea modelului
- revine la răspunsul determinist dacă modelul este dezactivat, indisponibil sau invalid

Răspunsul asistentului include `content_source`, `llm_model`, `generation_ms`,
`fallback_reason` și `safety_status`.

### Exerciții live prin email

`POST /live-drills` generează un scenariu și îl pregătește pentru livrare în inbox-ul real
al utilizatorului. Dacă SMTP nu este configurat, endpoint-ul returnează `delivery_status=dry_run`
și include `tracking_url`, util pentru demo local. Link-ul public `GET /live-drills/track/{token}`
marchează exercițiul ca deschis.

Pentru demo-uri, teste smoke sau validări unde nu trebuie trimis email real, trimite
`"dry_run": true` în payload-ul `POST /live-drills`. În acest mod SMTP este ignorat chiar
dacă este configurat, iar exercițiul rămâne raportabil și urmărit în aplicație.

Configurație SMTP opțională:

```env
LIVE_DRILL_PUBLIC_BASE_URL=http://192.168.1.XX:8000
LIVE_DRILL_EMAIL_ENABLED=true
LIVE_DRILL_SMTP_HOST=smtp.example.com
LIVE_DRILL_SMTP_PORT=587
LIVE_DRILL_SMTP_USERNAME=training@example.com
LIVE_DRILL_SMTP_PASSWORD=replace-with-smtp-app-password
LIVE_DRILL_SMTP_TLS=true
LIVE_DRILL_EMAIL_FROM=training@example.com
```

Pentru telefon fizic sau email real, `LIVE_DRILL_PUBLIC_BASE_URL` trebuie să fie o adresă
accesibilă din afara procesului backend, de exemplu IP-ul laptopului în aceeași rețea Wi-Fi
sau un URL public de tunel.

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

### Sesiuni locale

Pentru autentificarea locala, backend-ul emite doua token-uri distincte:

- access token cu durata implicita de 60 minute, folosit in header-ul `Authorization`
- refresh token cu durata implicita de 7 zile, folosit exclusiv la `POST /auth/refresh`

Duratele se configureaza prin `JWT_ACCESS_EXPIRATION_MINUTES` si
`JWT_REFRESH_EXPIRATION_DAYS`. Endpoint-ul de refresh primeste:

```json
{"refresh_token": "<refresh_token>"}
```

Access token-urile si refresh token-urile au tipuri JWT diferite si nu sunt interschimbabile.

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

## 2.2 Stack de productie cu Docker

Din radacina repository-ului:

```bash
cp .env.production.example .env.production
# completeaza parolele, JWT_SECRET_KEY si APP_CORS_ORIGINS
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

Serviciile sunt PostgreSQL, Redis, job-ul Alembic `migrate`, API-ul FastAPI si,
optional, Prometheus prin profilul `monitoring`.

Pastreaza `API_WORKERS=1` pentru metrici Prometheus corecte per container si scaleaza
orizontal prin mai multe containere API in orchestrator.

```bash
docker compose --profile monitoring --env-file .env.production \
  -f docker-compose.production.yml up -d --build
```

Validarea completa construieste stack-ul si ruleaza un flux real de autentificare si training:

```bash
./scripts/validate-production-stack.sh
```

Pentru a lasa containerele pornite: `KEEP_STACK=true ./scripts/validate-production-stack.sh`.
Pentru o validare complet izolata care sterge volumele de test la final, seteaza
`REMOVE_VOLUMES=true`.

## 2.3 Backup si restore

```bash
./scripts/backup-database.sh
ALLOW_DATABASE_RESTORE=true ./scripts/restore-database.sh backups/cyber_training-YYYYMMDDTHHMMSSZ.dump
```

Restore-ul este distructiv si opreste temporar API-ul. Ruleaza backup zilnic, pastreaza
copii criptate in storage extern si testeaza lunar restore-ul intr-un mediu izolat.

## 3. Endpoint-uri

- `GET /health`
- `GET /health/ready`
- `GET /metrics`
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
- `GET /learning/lessons`
- `GET /learning/lessons/{lesson_id}`
- `POST /learning/lessons/{lesson_id}/quiz/submit`
- `GET /learning/attempts?lesson_id=<optional>&limit=20&offset=0`
- `GET /learning/path`
- `POST /learning/path/lessons/{lesson_id}/complete`
- `GET /sessions?limit=20&offset=0`
- `GET /session/{session_id}`
- `GET /session/{session_id}/events?limit=20&offset=0`
- `GET /session/{session_id}/trends?limit=30&offset=0`
- `GET /session/{session_id}/trends/aggregate?attack_type=phishing&since=<iso>&until=<iso>`

`POST /scenario/evaluate` este idempotent per `scenario_id`:
- retrimiterea aceleiasi optiuni intoarce rezultatul salvat cu `was_already_evaluated: true`
- retrimiterea unei alte optiuni intoarce `409 Conflict`
- scorul, progresul adaptiv si evenimentul sesiunii sunt aplicate o singura data

`GET /sessions` returneaza doar sesiunile utilizatorului autentificat, ordonate dupa
ultima actualizare. Fiecare element include sumarul de scor, numarul de scenarii,
ultimul tip de atac si optional ultimul scenariu neevaluat care poate fi reluat.

Traseul de invatare combina lectii si cerinte de scenarii in trei module de dificultate.
Progresul lectiilor, XP-ul si seriile zilnice sunt persistate per utilizator, iar progresul
scenariilor este calculat din profilul adaptiv existent.

Conținutul lecțiilor și testele sunt stocate în tabele normalizate create de migrarea
`20260612_0009`. Catalogul include șapte lecții inițiale, fiecare cu secțiuni și două
întrebări. Clientul nu primește răspunsurile corecte înainte de submit.

`POST /learning/lessons/{lesson_id}/quiz/submit`:

- cere răspuns pentru fiecare întrebare și verifică apartenența opțiunii la întrebare
- salvează fiecare încercare și fiecare răspuns într-o singură tranzacție
- returnează scorul, explicațiile și răspunsurile corecte după evaluare
- acordă XP o singură dată, la prima promovare
- marchează lecția finalizată și actualizează traseul de învățare

Endpoint-ul de compatibilitate `POST /learning/path/lessons/{lesson_id}/complete` nu mai
permite finalizarea manuală; necesită o încercare de quiz promovată.

Toate endpoint-urile in afara de `GET /health`, `GET /health/ready`, `GET /metrics`,
`POST /auth/register`, `POST /auth/login` si `POST /auth/refresh` necesita header:

```http
Authorization: Bearer <access_token>
```

## 4. Rulare teste backend

```bash
python3 -m unittest discover -s tests -p "test_*.py" -q
```

## 5. Security si operare

- Rate limiting pentru endpoint-urile sensibile:
  - `POST /scenario/generate`: max. 30 cereri / 60 secunde / client
  - `POST /scenario/evaluate`: max. 60 cereri / 60 secunde / client
  - `POST /assistant/ask`: max. 60 cereri / 60 secunde / client
- Validare stricta pentru identificatori (`session_id`, `scenario_id`, `selected_option_id`) cu pattern controlat.
- Cand limita este depasita, API-ul raspunde cu `429 Too Many Requests` si header `Retry-After`.
- Productia foloseste Redis pentru limite comune intre procese si instante.
- Configuratia de productie invalida opreste pornirea aplicatiei.
- CI ruleaza teste SQLite, integrare PostgreSQL + Redis, lint, TypeScript si export web.
