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

## Authentication

- `POST /api/auth/register` creates customer accounts.
- `POST /api/auth/login` verifies bcrypt passwords and issues a 7 day HS256 JWT.
- `GET /api/auth/me` checks the current bearer token.
- Admin and delivery permissions are enforced using the role stored in the database.

All existing food, order, payment, delivery, feedback, report, and M-Pesa paths are retained for the current frontend. Set `DJANGO_DEBUG=false`, a strong `DJANGO_SECRET_KEY`/`JWT_SECRET`, correct `DJANGO_ALLOWED_HOSTS`, and a reachable HTTPS `SERVER_URL` before deployment. The Django development server is for local use; use a production WSGI/ASGI server for deployment.
