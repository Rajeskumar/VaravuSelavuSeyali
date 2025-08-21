# Varavu Selavu Seyali

This project provides a FastAPI backend and a React frontend to track and analyse personal expenses.

## Authentication

The service uses JWT based authentication with access and refresh tokens.

### Environment variables
- `JWT_SECRET` – secret used to sign tokens.
- `JWT_EXPIRE_MINUTES` – access token lifetime in minutes (default 30).
- `GOOGLE_SHEETS_SPREADSHEET_ID` – id of the Google Sheet used for storage.
- `OCR_ENGINE` – receipt parsing engine (default `openai`, or `ollama` for local models).
- `OPENAI_API_KEY` – API key when using the OpenAI engine.
- `OLLAMA_HOST` – base URL for a local Ollama instance (default `http://localhost:11434`).
- `OCR_MODEL` – model id for OpenAI/Ollama (default `gpt-4o-mini`).
- `MAX_UPLOAD_MB` – maximum receipt upload size in MB (default `12`).
- `ALLOWED_MIME` – comma separated list of allowed MIME types.

### Auth flow
1. **Register** – `POST /api/v1/auth/register` with `name`, `email`, `phone` and `password`.
2. **Login** – `POST /api/v1/auth/login` using OAuth2 password form (`username` & `password`). Returns access and refresh tokens.
3. **Refresh** – `POST /api/v1/auth/refresh` with a refresh token to obtain new tokens.
4. **Logout** – `POST /api/v1/auth/logout` with a refresh token to invalidate it.
5. **Current user** – `GET /api/v1/auth/me` with the access token to get user info.

### Example using curl
```bash
# register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"user@example.com","phone":"1234567890","password":"secret"}'

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

### Receipt ingestion

The `Add Expense` form now includes an optional **Upload Receipt** section with
both "Choose File" and "Take Photo" actions. Images from mobile cameras
(including HEIC) are converted to PNG in the browser so OpenAI can parse them.
Files are validated client-side and only images or PDFs are accepted. Uploaded
files remain in memory and are parsed by an AI model (OpenAI or a local Ollama
instance). Parsed header data populates the existing date, cost, description,
and category fields (main and subcategory), while line items appear in an
editable table where rows can be added or removed. After review, the expense
is also appended to the original sheet used for manual entries and stored in
the `expenses` tab with line items in `expense_items`, all scoped by
`user_email`. Any total mismatch shows the dollar difference so it can be
fixed before saving. On mobile, the **Take Photo** action opens the camera and
parses the captured image automatically. Tabs are created if missing.
