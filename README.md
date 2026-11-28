# PwaniBite

PwaniBite is a campus food ordering website for Pwani University. The frontend is plain HTML, CSS, and JavaScript. The active backend is Django REST Framework with JWT authentication and the existing MySQL database.

## Main features

- Customer registration and sign-in, menu browsing, cart and checkout
- Order history, cancellation, and delivery status
- Admin tools for food, orders, users, deliveries, payments, feedback, and reports
- Delivery portal for assigned orders
- M-Pesa STK Push integration
- Responsive pages for mobile and desktop

## Technology

- Frontend: HTML, CSS, JavaScript
- Backend: Django 6.0 and Django REST Framework
- Authentication: bcrypt passwords and HS256 Bearer JWTs
- Database: MySQL

The Django API retains the `/api/...` routes used by the frontend and maps to the existing MySQL tables. The old Express source remains in `backend/server.js` and `backend/routes/` as a legacy reference; new development should use `backend/django_api/`.

## Start locally on Windows

1. Make sure MySQL is running and set the database username and password in `backend/.env`.
2. If the `pwani_bite` schema does not exist, initialize it as described in [backend setup](backend/README.md).
3. Install and start Django:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r django_api\requirements.txt
python django_api\manage.py runserver 127.0.0.1:8000
```

PowerShell may block virtual environment activation. You can skip activation and run the final command with the same Python interpreter used to install the requirements. If using npm scripts, call `npm.cmd start` to avoid PowerShell's blocked `npm.ps1` wrapper.

Open `http://localhost:8000/` for the site. The API is at `http://localhost:8000/api/`. Django serves the static pages during local development. For another API host, set `window.PWANI_BITE_API_URL` before `api.js` loads.

The API reads `backend/.env`. Keep its secrets private. Before deployment, configure a strong `JWT_SECRET`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_DEBUG=false`, and a publicly reachable HTTPS `SERVER_URL` for M-Pesa callbacks. Use a production WSGI/ASGI server instead of `runserver` in deployment.

## Default local admin

If you initialize a fresh database with `npm run init-db`, it creates the admin account `admin@pwanibite.com` with a **randomly generated password printed once** in the console. Save it when you see it — it is not stored anywhere in plaintext. Change the password before exposing the application beyond local development.

More setup details are in [backend/README.md](backend/README.md) and [backend/django_api/README.md](backend/django_api/README.md).
