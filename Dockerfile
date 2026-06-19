FROM python:3.11-slim

# Force rebuild marker — bump on every deploy to invalidate Docker layer cache
ENV REELE_V2_VERSION=2026-06-19-v4-engagement-overlay

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu \
    fonts-noto \
    fonts-noto-cjk \
    fonts-freefont-ttf \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g z-ai-web-dev-sdk

ENV NODE_PATH=/usr/lib/node_modules

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN if [ -f .z-ai-config ]; then cp .z-ai-config /etc/.z-ai-config && chmod 644 /etc/.z-ai-config; fi

RUN mkdir -p /tmp/reele_output /tmp/reele_cache/images /tmp/reele_cache/tts /tmp/reele_cache/music /tmp/reele_cache/logos /tmp/reele_uploads

ENV OUTPUT_DIR=/tmp/reele_output
ENV UPLOAD_DIR=/tmp/reele_uploads
ENV CACHE_DIR=/tmp/reele_cache
ENV PORT=7860

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/api/health')" || exit 1

CMD ["python", "app.py"]
