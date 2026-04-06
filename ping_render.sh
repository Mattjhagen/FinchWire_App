#!/bin/bash
# FinchWire Render Keep-Alive Script

# Replace with your actual Render URL
URL="https://finchwire-app.onrender.com/api/health"

echo "Starting Render keep-alive pinger for $URL"
echo "Pinging every 5 minutes. Press Ctrl+C to stop (if running in foreground)."

while true; do
  TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  
  if [ "$RESPONSE" == "200" ]; then
    echo "[$TIMESTAMP] Ping Success (200 OK)"
  else
    echo "[$TIMESTAMP] Ping failed or app is waking up (Status: $RESPONSE)"
  fi
  
  sleep 300
done
