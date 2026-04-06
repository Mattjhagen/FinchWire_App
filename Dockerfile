# Stage 1: Build Frontend
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
# Copy package manifests and install dependencies
COPY frontend/package.json frontend/yarn.lock* frontend/package-lock.json* ./
RUN npm install

# Copy frontend source and build web distribution
COPY frontend/ ./
RUN npx expo export --platform web

# Stage 2: Backend
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (ffmpeg for yt-dlp, libjq for jq)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libjq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/
# Copy website static files
COPY website/ ./website/
# Create frontend/dist and copy built files from Stage 1
RUN mkdir -p frontend/dist
COPY --from=frontend-builder /app/frontend/dist/ ./frontend/dist/

# Set working directory to backend to run the server
WORKDIR /app/backend

# Default port for Render (can be overridden by Render's PORT env var)
ENV PORT=10000

# Start server using uvicorn
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
