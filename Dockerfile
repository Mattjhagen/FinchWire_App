# Stage 1: Build Frontend
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock* frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npx expo export --platform web

# Stage 2: Unified Backend
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
# ffmpeg for yt-dlp, libjq for jq
# nodejs for the downloader-v2
# gcc, g++, make, python3 for better-sqlite3 build
RUN apt-get update && apt-get install -y \
    ffmpeg \
    aria2 \
    libjq-dev \
    gcc \
    g++ \
    make \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install Downloader-v2 (Node.js) dependencies
COPY downloader-v2/package.json downloader-v2/package-lock.json* ./downloader-v2/
RUN cd downloader-v2 && npm install --production

# Copy all code
COPY backend/ ./backend/
COPY website/ ./website/
COPY downloader-v2/ ./downloader-v2/

# Create frontend/dist and copy built files
RUN mkdir -p frontend/dist
COPY --from=frontend-builder /app/frontend/dist/ ./frontend/dist/

RUN echo '#!/bin/sh\n\
# Start Node.js Downloader on internal port 3000\n\
cd /app/downloader-v2 && PORT=3000 node server.js &\n\
# Start FastAPI Backend on the public Render port\n\
cd /app/backend && uvicorn server:app --host 0.0.0.0 --port ${PORT:-10000}\n\
' > /app/start.sh && chmod +x /app/start.sh

# Default port for Render
ENV PORT=10000
# Tell FinchWire to use the local downloader by default
ENV YT_DOWNLOAD_URL=http://localhost:3000

CMD ["/app/start.sh"]
