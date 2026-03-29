FROM node:20-slim

# Install FFmpeg and Piper TTS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Piper TTS
RUN wget -q https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz \
    && tar -xzf piper_linux_x86_64.tar.gz -C /opt/ \
    && rm piper_linux_x86_64.tar.gz \
    && ln -s /opt/piper/piper /usr/local/bin/piper

# Download Czech voice model (jirka medium)
RUN mkdir -p /opt/piper-voices \
    && wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx \
       -O /opt/piper-voices/cs_CZ-jirka-medium.onnx \
    && wget -q https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx.json \
       -O /opt/piper-voices/cs_CZ-jirka-medium.onnx.json

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

# Create tmp directory
RUN mkdir -p /app/tmp

ENV PORT=3000
ENV PIPER_PATH=/usr/local/bin/piper
ENV PIPER_MODEL=/opt/piper-voices/cs_CZ-jirka-medium.onnx
ENV TMP_DIR=/app/tmp

EXPOSE 3000

CMD ["node", "src/server/index.js"]
