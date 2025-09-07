# Use the official Python image with a slim variant
FROM python:3.12-slim

# Set the working directory
WORKDIR /app

# Copy the Poetry files
COPY pyproject.toml poetry.lock /app/

# Install Poetry
RUN pip install poetry && poetry config virtualenvs.create false && poetry install

# Copy the application code
COPY . /app

# Expose the port FastAPI will run on
EXPOSE 8080

# Command to run the application
CMD ["poetry", "run", "uvicorn", "varavu_selavu_service.main:app", "--host", "0.0.0.0", "--port", "8080"]
