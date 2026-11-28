# PwaniBite Django API

This Django REST backend replaces the Express server while keeping the existing `/api/...` routes and MySQL table schema. The models are mapped to the existing tables, so no Django migration rewrites or renames customer data. Password hashes stay bcrypt-compatible with the previous Node API, and JWTs continue to use the existing `Bearer` header and user claims.

## Run locally on Windows

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r django_api\requirements.txt
python django_api\manage.py runserver 127.0.0.1:8000
```

If PowerShell blocks activation scripts, skip activation and use the environment's interpreter directly:

```powershell
cd backend
python -m pip install -r django_api\requirements.txt
python django_api\manage.py runserver 127.0.0.1:8000
```

The Django development server serves the frontend and API at `http://localhost:8000/`. The API client defaults to that address for local development. Set `window.PWANI_BITE_API_URL` before `api.js` loads if the API is hosted elsewhere.

## Database

The API reads `backend/.env`. Set a valid MySQL account and password there. It expects the existing `pwani_bite` tables from `backend/database/schema.sql`; if the schema has not been installed, follow the existing database initialization instructions in `backend/README.md` before starting the API. Django does not run schema migrations because these models intentionally map onto the existing tables.

`DB_ENGINE=sqlite` is available for isolated development, but the MySQL tables must still be created before the API endpoints can be used. SQLite is not an automatic import of the MySQL data.

## Contact messages table

The `POST /api/contact` endpoint (used by the contact page) stores submissions in a `contact_messages` table that is not part of the original schema. Create it once in MySQL:

```sql
CREATE TABLE IF NOT EXISTS contact_messages (
    contact_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Admins can list submissions with `GET /api/contact`.

## Authentication

- The web forms are available at `/login` and `/signup` (also `login.html` and `register.html`).
- `POST /api/auth/register` creates customer accounts.
- `POST /api/auth/login` verifies bcrypt passwords and issues a 7 day HS256 JWT.
- `GET /api/auth/google/config` returns the public Google Web client ID used by the sign-in buttons.
- `POST /api/auth/google` verifies Google's signed ID token, then creates or signs in the linked customer account.
- `GET /api/auth/me` checks the current bearer token.
- Admin and delivery permissions are enforced using the role stored in the database.

### Enable Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and configure Google Auth Platform branding and audience. The app only requests the standard `openid`, `email`, and `profile` identity claims. While the app is in testing mode, add your Google account under the Audience page's test users.
2. Under Google Auth Platform > Clients, create an OAuth client with application type **Web application**.
3. Add the exact site origin under **Authorized JavaScript origins**. For local development, add `http://localhost:8000` (and any other origin and port used to open the app). For a deployed site, add its HTTPS origin. This popup flow does not use an authorized redirect URI.
4. Copy the client ID ending in `.apps.googleusercontent.com` into `GOOGLE_OAUTH_CLIENT_ID` in `backend/.env`. Do not put a client secret in the frontend or this setting.
5. Apply `backend/database/migrations/2026-11-25-google-oauth.sql` once to the existing `pwani_bite` database. It makes phone/password optional for Google-only users and creates the provider-link table. For a new database, use the updated `backend/database/schema.sql` instead.
6. Install the backend dependencies and restart Django:

   ```powershell
   cd backend
   python -m pip install -r django_api\requirements.txt
   python django_api\manage.py runserver 127.0.0.1:8000
   ```

The login and registration pages render Google's official button once the API reports a client ID. Google ID tokens are verified on the server for signature, audience, expiry, issuer, and the page's one-time nonce. Google account IDs (`sub`) are stored in `user_oauth_accounts`; a verified Gmail or Workspace address can link to an existing account with the same email. Other existing email accounts must first sign in with their password. Google-only users enter their phone number in the order form when placing their first order.

Google documents the [Web client ID and origin setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [server-side ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

### Customer profiles

The signed-in customer profile is available at `/profile`. It reads the customer's order history from `GET /api/orders/my-orders`; profile details, avatar uploads, favorites, saved addresses, and password changes use authenticated `/api/auth/...` and `/api/profile/...` endpoints. Apply `backend/database/migrations/2026-11-26-profile-features.sql` after the Google OAuth migration to add avatar, favorites, and address storage to an existing database.

### Multi-canteen ordering

Comrades choose one of the campus canteens (Main, Savannah, Runda) before ordering; each food item belongs to a canteen and each order is fulfilled by a single canteen. Apply `backend/database/migrations/2026-11-27-canteens.sql` once to an existing database (new databases get it from `schema.sql`). Canteens are managed via `GET/POST /api/canteens` and `GET/PUT/DELETE /api/canteens/<id>` (writes require admin), `GET /api/food` accepts a `canteen_id` filter, and food create/update accepts `canteen_id`. Order creation rejects carts spanning multiple canteens.

### Canteen managers

An admin can assign a user the `canteen_manager` role and choose one canteen in the Admin dashboard's user list. Managers can manage only that canteen's menu and order statuses from the Canteen Management page. The API scopes those records to the assigned canteen; user administration, canteen setup, reports, delivery assignment, and global controls remain admin-only. Apply `backend/database/migrations/2026-11-28-canteen-managers.sql` once after the canteens migration to an existing database.

All existing food, order, payment, delivery, feedback, report, and M-Pesa paths are retained for the current frontend. Set `DJANGO_DEBUG=false`, a strong `DJANGO_SECRET_KEY`/`JWT_SECRET`, correct `DJANGO_ALLOWED_HOSTS`, and a reachable HTTPS `SERVER_URL` before deployment. The Django development server is for local use; use a production WSGI/ASGI server for deployment.
