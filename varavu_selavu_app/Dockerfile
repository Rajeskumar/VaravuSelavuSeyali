# Use the official Python image with a slim variant
FROM python:3.12-slim

# Set the working directory
WORKDIR /app

# Copy the Poetry files
COPY pyproject.toml poetry.lock /app/

# Install Poetry. `--only main` keeps the test/dev toolchain (pytest, testing-postgresql)
# out of the runtime image: it is not needed to serve traffic and only widens the image's
# dependency surface. `--no-root` because package-mode is off -- the app is copied in below,
# not pip-installed.
RUN pip install poetry && poetry config virtualenvs.create false \
    && poetry install --only main --no-root

# Copy the application code
COPY . /app

# Expose the port FastAPI will run on
EXPOSE 8080

# Command to run the application
CMD uvicorn varavu_selavu_service.main:app --host 0.0.0.0 --port ${PORT:-8080}
