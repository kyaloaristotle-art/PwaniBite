# PwaniBite Backend

The active API is now Django REST Framework. The previous Express implementation remains in this folder as a reference, but `npm start` and `npm run dev` now launch Django.

## Prerequisites

- Python 3.12 or newer (the project has been prepared for Python 3.14).
- MySQL running locally with a user that can access the `pwani_bite` database.
- The existing tables from `database/schema.sql`.

## Configure the database

The API loads configuration from `backend/.env`. Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_PORT` to valid MySQL credentials. Do not commit this file.

### Reset the local MySQL root password

To choose a new local MySQL root password, run `reset-mysql-password.ps1` from an elevated PowerShell window. The script targets the `MySQL80` instance on port 3306, asks you to enter the password twice without displaying it, resets `root@localhost`, verifies the service, and writes the password into `backend/.env`. Choose 16–128 characters with uppercase and lowercase letters, a number, and one of these symbols: `!@$%^&*()_+=.,:-`. Quotes, backslashes, spaces, and `#` are not supported. The script does not print the password. Administrator rights are required because Windows must stop and restart the MySQL service.

```powershell
cd "C:\Users\Hp\OneDrive\Desktop\Aristotle\PwaniBite\backend"
Set-ExecutionPolicy -Scope Process Bypass -Force
.\reset-mysql-password.ps1
```

The repository-root `.gitignore` excludes root and backend `.env` files while allowing `.env.example` templates to be committed.

If a previous reset left the temporary server running, rerun this script from an elevated PowerShell window. It first uses the currently saved credential in `backend/.env` to recover the `MySQL80` service, then continues with the new password you entered.

If the database schema has not been created, install the retained Node dependencies and run the existing initializer from this directory:

```powershell
npm.cmd install
npm.cmd run init-db
```

The initializer uses the credentials in `backend/.env`. It creates the database and tables, inserts sample food, and creates the default admin (`admin@pwanibite.com`). The admin password is randomly generated during initialization and printed once in the console — save it, since it is never stored in plaintext.

## Install and start Django

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r django_api\requirements.txt
python django_api\manage.py runserver 127.0.0.1:8000
```

PowerShell may block activation scripts on some machines. In that case, either use `npm.cmd start` after installing the requirements, or run `python django_api\manage.py runserver 127.0.0.1:8000` without activating a virtual environment.

The site opens at `http://localhost:8000/`; API routes remain at `/api/...`. The Django models map to the existing MySQL tables and are intentionally unmanaged, so `manage.py migrate` is not the database setup step.

## API and authentication

The existing frontend API contract is retained for authentication, users, food, orders, payments, delivery, feedback, reports, and M-Pesa. Authentication uses bcrypt hashes and HS256 Bearer JWTs compatible with the previous API. Set a strong `JWT_SECRET` in `backend/.env`; set `DJANGO_DEBUG=false` and `DJANGO_ALLOWED_HOSTS` for deployment. Configure `SERVER_URL` as a publicly reachable HTTPS URL for M-Pesa callbacks.

See [the Django backend README](django_api/README.md) for configuration details. The old Express entry point and routes are retained as reference code and are no longer wired to the package scripts.
