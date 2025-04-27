# Update the Python base image to the latest stable version
FROM --platform=linux/amd64 python:3.9-slim

# Set the working directory to /app
WORKDIR /app

# Copy the entire project directory into the Docker image
COPY . /app

RUN pip install --no-cache-dir -r requirements.txt
# Use a .dockerignore file to exclude unnecessary files and directories

# Expose the port
EXPOSE 8501

# Run the command to start the Streamlit app when the container launches
CMD ["streamlit", "run", "--server.address=0.0.0.0", "Home.py"]
