# LucrareLicenta

## Run the full app

Install and start Docker Desktop, then run this command from the repository root:

```bash
chmod +x run-all.sh
./run-all.sh
```

This is the standard local launcher. It:

- creates `.env.production` with private local secrets on the first run
- starts PostgreSQL, Redis, database migrations, FastAPI, and Prometheus in Docker
- forwards the Firebase and Ollama settings from `BackendAPI/.env`
- opens the Expo web app
- stops the containers on `Ctrl+C` while preserving application data

Useful launch modes:

```bash
FRONTEND_MODE=start ./run-all.sh     # Expo interactive/QR mode
FRONTEND_MODE=ios ./run-all.sh       # iOS simulator
FRONTEND_MODE=android ./run-all.sh   # Android emulator
RUN_SMOKE_TEST=true ./run-all.sh     # verify the main API flow before Expo starts
```

Runtime status:

- app: `http://localhost:8081`
- API readiness: `http://localhost:8000/health/ready`
- API metrics: `http://localhost:8000/metrics`
- Prometheus: `http://localhost:9090`

## Firebase Auth mode

The app can run with the existing local JWT auth, or with Firebase Authentication.

For Firebase Auth:

1. Enable Email/Password in Firebase Console.
2. Copy `CyberSecurityApp/.env.example` to `CyberSecurityApp/.env.local` and set `EXPO_PUBLIC_FIREBASE_API_KEY`.
3. Copy `BackendAPI/.env.example` to `BackendAPI/.env` and set either `GOOGLE_APPLICATION_CREDENTIALS` + `FIREBASE_PROJECT_ID`, or `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Reinstall backend dependencies:

```bash
cd BackendAPI
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

When `EXPO_PUBLIC_FIREBASE_API_KEY` is present, the mobile app uses Firebase Auth and sends Firebase ID tokens to FastAPI.

## Production backend stack

The production stack includes FastAPI, PostgreSQL, Redis, a one-shot Alembic migration
job, optional Prometheus monitoring, structured JSON logs, and optional Sentry reporting.

```bash
cp .env.production.example .env.production
# configure secrets and allowed origins
./scripts/validate-production-stack.sh
```

Operational commands:

```bash
./scripts/backup-database.sh
ALLOW_DATABASE_RESTORE=true ./scripts/restore-database.sh /path/to/backup.dump
```

See `BackendAPI/README.md` for configuration, monitoring, and recovery details.
