# Use the official Python image as a base
FROM --platform=linux/amd64 python:3.9-slim

# Set the working directory to /app
WORKDIR /app

# Copy the requirements file
COPY requirements.txt .

# Install the dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY varavu_selavu_seyali.py .

# Expose the port
EXPOSE 8501

# Run the command to start the Streamlit app when the container launches
CMD ["streamlit", "run", "--server.address=0.0.0.0", "varavu_selavu_seyali.py"]
