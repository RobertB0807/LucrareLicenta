# LucrareLicenta

## Run the full app

From repo root, start backend + mobile app together:

```bash
chmod +x run-all.sh
./run-all.sh
```

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
