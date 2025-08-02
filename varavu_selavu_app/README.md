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
