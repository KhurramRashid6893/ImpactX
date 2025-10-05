# Use a lightweight Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy dependencies
COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

# Copy all source code
COPY . .

# Use gunicorn as production WSGI server
CMD ["gunicorn", "-b", ":8080", "app:app"]
