# Leads Tool Backend API

Standalone Node.js + Express backend for the Leads Tool CRM. This service handles secure custom team-member account creation and session management while the existing React frontend continues to use Firebase Authentication for the Super Admin.

## Purpose

- Protect admin endpoints with Firebase ID token verification
- Create custom team members in Firestore with bcrypt-hashed passwords
- Authenticate custom team members through HttpOnly JWT session cookies
- Keep Firebase Admin credentials and password hashing strictly on the server

The React frontend has **not** been connected to these endpoints yet. The current Firebase Super Admin login flow remains unchanged.

## Local setup

### 1. Open the backend folder

```bash
cd backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Confirm that `.env` exists

A local `backend/.env` file should already be present. If it is missing, copy the example file:

```bash
cp .env.example .env
```

Then generate a secure local `JWT_SECRET` and replace the placeholder value manually.

### 4. Add Firebase Admin credentials manually

Paste these three values from:

**Firebase Console → Project settings → Service accounts → Firebase Admin SDK → Generate new private key**

Map the downloaded JSON fields into `backend/.env`:

| JSON field | `.env` variable |
| --- | --- |
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

### 5. Private key formatting

- Keep `FIREBASE_PRIVATE_KEY` wrapped in double quotes.
- Preserve escaped `\n` line breaks inside the quoted value.
- Do not place the downloaded service-account JSON file inside the repository.

### 6. Validate environment configuration

After replacing the Firebase placeholders, run:

```bash
npm run check:env
```

Expected output:

```text
Backend environment configuration is valid.
```

This command validates required variables only. It does not print secret values and does not access Firestore.

### 7. Start the backend

After validation succeeds:

```bash
npm run dev
```

### 8. Health check

Open:

```text
http://localhost:5000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "Leads Tool API is running"
}
```

## Environment variables

Required variables:

| Variable | Description |
| --- | --- |
| `PORT` | API port, e.g. `5000` |
| `NODE_ENV` | `development` or `production` |
| `FRONTEND_URL` | React app origin, e.g. `http://localhost:5173` |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account client email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `JWT_SECRET` | Long random secret for custom team-member sessions |
| `JWT_EXPIRES_IN` | JWT lifetime, e.g. `8h` |
| `COOKIE_NAME` | HttpOnly session cookie name |

### Security warnings

- Never commit `backend/.env`
- Never place the downloaded service-account JSON inside the repository
- Never expose the private key or JWT secret in screenshots, chat messages, logs, or frontend code

## Local development

```bash
npm run dev
```

Production start:

```bash
npm start
```

## Health check

```bash
GET http://localhost:5000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "Leads Tool API is running"
}
```

## Prepared API endpoints

### Health

- `GET /api/health`

### Admin (Firebase Super Admin only)

- `POST /api/admin/team-members`
  - Header: `Authorization: Bearer <firebase-id-token>`
  - Body:
    ```json
    {
      "name": "Sara Khan",
      "email": "sara@example.com",
      "phone": "+92 300 1234567",
      "password": "temporary-password",
      "role": "member",
      "status": "active"
    }
    ```

### Custom team-member auth

- `POST /api/auth/team-members/login`
- `GET /api/auth/team-members/me`
- `POST /api/auth/team-members/logout`

## Firestore data separation

Public team-member profiles and private login credentials are stored in separate collections.

### `users/{teamMemberId}` — public profile (safe for frontend reads)

```json
{
  "name": "Sara Khan",
  "email": "sara@example.com",
  "phone": "+92 300 1234567",
  "role": "member",
  "status": "active",
  "assignedLeadsCount": 0,
  "lastLoginAt": null,
  "createdAt": "Firestore Timestamp",
  "updatedAt": "Firestore Timestamp",
  "createdBy": "superAdminUid",
  "authType": "custom"
}
```

Never store in `users`:

- `password`
- `passwordHash`
- `encryptedPassword`
- JWT values
- private credential metadata

### `teamMemberCredentials/{teamMemberId}` — private credentials (backend only)

```json
{
  "userId": "teamMemberId",
  "emailLower": "sara@example.com",
  "passwordHash": "bcrypt-hash",
  "createdAt": "Firestore Timestamp",
  "updatedAt": "Firestore Timestamp"
}
```

Rules:

- The same generated document ID is used for both collections.
- `emailLower` and `passwordHash` exist only in `teamMemberCredentials`.
- The React frontend must never read `teamMemberCredentials`.
- Only the Firebase Admin SDK backend accesses the credentials collection.
- Passwords are hashed with `bcryptjs` (cost factor 12) and never stored in plain text.

Firebase Super Admin accounts continue to use Firebase Authentication and store only their public profile in `users/{firebaseAuthUid}` without a credentials document.

## Security notes

- Passwords are hashed with `bcryptjs` (cost factor 12) on the backend only
- API responses never include `password`, `passwordHash`, credential documents, or JWT tokens
- Firebase Admin credentials stay in `backend/.env` only
- The frontend Add Member button has not been wired up yet by design

## Current frontend status

- Firebase Super Admin login remains the existing React + Firebase Auth flow
- Protected routes, logout, role guard, and User Management read-only page are unchanged
- Backend integration will be added in a later phase
