# Update the Python base image to the latest stable version
FROM --platform=linux/amd64 python:3.9-slim

# Set the working directory to /app
WORKDIR /app

# Copy the requirements file
COPY requirements.txt .

# Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Update the application code to reflect the correct file structure
COPY Home.py .
COPY pages/ ./pages/

# Expose the port
EXPOSE 8501

# Run the command to start the Streamlit app when the container launches
CMD ["streamlit", "run", "--server.address=0.0.0.0", "Home.py"]
