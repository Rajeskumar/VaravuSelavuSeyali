# Varavu Selavu Seyali

This project provides a FastAPI backend and a React frontend to track and analyse personal expenses.

## Authentication

The service uses JWT based authentication with access and refresh tokens.

### Environment variables
- `JWT_SECRET` – secret used to sign tokens.
- `JWT_EXPIRE_MINUTES` – access token lifetime in minutes (default 30).

### Auth flow
1. **Register** – `POST /api/v1/auth/register` with `email` and `password`.
2. **Login** – `POST /api/v1/auth/login` using OAuth2 password form (`username` & `password`). Returns access and refresh tokens.
3. **Refresh** – `POST /api/v1/auth/refresh` with a refresh token to obtain new tokens.
4. **Logout** – `POST /api/v1/auth/logout` with a refresh token to invalidate it.
5. **Current user** – `GET /api/v1/auth/me` with the access token to get user info.

### Example using curl
```bash
# register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"secret"}'

# login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'username=user@example.com&password=secret'

# refresh
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"<token>"}'

# logout
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"<token>"}'
```

All expense and analysis routes now require a valid access token.
