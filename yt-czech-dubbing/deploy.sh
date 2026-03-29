#!/bin/bash
# Deploy script for yt-czech-dubbing to Hetzner server
# Run this from your MacBook: bash deploy.sh

set -e

SERVER="root@46.225.31.161"
REMOTE_DIR="/opt/yt-czech-dubbing"
DEEPL_API_KEY="${1:-YOUR_DEEPL_API_KEY}"

echo "=== YouTube Czech Dubbing - Deploy to Hetzner ==="

if [ "$DEEPL_API_KEY" = "YOUR_DEEPL_API_KEY" ]; then
  echo "Usage: bash deploy.sh YOUR_DEEPL_API_KEY"
  echo "Get free key at: https://www.deepl.com/pro-api"
  exit 1
fi

echo "[1/5] Creating remote directory..."
ssh $SERVER "mkdir -p $REMOTE_DIR"

echo "[2/5] Copying files to server..."
scp -r \
  Dockerfile \
  docker-compose.yml \
  package.json \
  src/ \
  $SERVER:$REMOTE_DIR/

echo "[3/5] Creating .env on server..."
ssh $SERVER "cat > $REMOTE_DIR/.env << 'ENVEOF'
DEEPL_API_KEY=$DEEPL_API_KEY
PORT=3000
PIPER_PATH=/usr/local/bin/piper
PIPER_MODEL=/opt/piper-voices/cs_CZ-jirka-medium.onnx
TMP_DIR=/app/tmp
ENVEOF"

echo "[4/5] Building Docker image (this may take a few minutes)..."
ssh $SERVER "cd $REMOTE_DIR && docker compose down 2>/dev/null; docker compose up --build -d"

echo "[5/5] Checking status..."
sleep 5
ssh $SERVER "docker compose -f $REMOTE_DIR/docker-compose.yml ps"
ssh $SERVER "docker compose -f $REMOTE_DIR/docker-compose.yml logs --tail=20"

echo ""
echo "=== Deploy complete! ==="
echo "Open in browser: http://46.225.31.161:3000"
echo "Open on iPad: http://46.225.31.161:3000"
