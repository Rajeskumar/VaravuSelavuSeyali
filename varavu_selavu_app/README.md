# Varavu Selavu Backend

This is the backend application for the Varavu Selavu project, built using FastAPI.

## Features
- **Health Check Endpoint**: `/health` to check the backend's health status.
- **Welcome Endpoint**: `/` to display a welcome message.

## Requirements
- Python 3.9+
- Poetry (for dependency management)

## Setup Instructions

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd varavu_selavu_app
   ```

2. **Install Dependencies**:
   ```bash
   poetry install
   ```

3. **Run the Application**:
   ```bash
   poetry run uvicorn main:app --reload
   ```

4. **Access the Application**:
   - Open your browser and navigate to `http://localhost:8000` for the API.
   - Visit `http://localhost:8000/docs` for the interactive API documentation.

## Docker Support

To run the backend using Docker:

1. **Build the Docker Image**:
   ```bash
   docker build -t varavu-selavu-backend .
   ```

2. **Run the Docker Container**:
   ```bash
   docker run -p 8000:8000 varavu-selavu-backend
   ```

## License
This project is licensed under the MIT License.

## Chat model configuration

The `/analysis/chat` endpoint selects which LLM to use based on
environment variables:

- Set `ENV` or `ENVIRONMENT` to `production` and supply an
  `OPENAI_API_KEY` to route requests to the OpenAI Chat Completions API.
- For any other environment the service will call a local Ollama
  instance at `http://localhost:11434` or the URL defined in
  `OLLAMA_BASE_URL`.

## Google Login (OAuth)

The backend verifies Google ID tokens and requires the OAuth Web Client ID:

- Set `GOOGLE_CLIENT_ID` in the backend environment to the OAuth 2.0 Web Client ID you created in Google Cloud Console.

Local example:

```bash
export GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
poetry run uvicorn varavu_selavu_service.main:app --reload
```

Notes:
- Ensure the frontend is also built/run with `REACT_APP_GOOGLE_CLIENT_ID` set (see UI README / env files).
- In Google Cloud Console, add your app origins (e.g., `http://localhost:3000`, your production domain) to Authorized JavaScript origins.
