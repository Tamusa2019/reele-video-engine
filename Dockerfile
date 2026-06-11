FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-noto \
    fonts-noto-cjk \
    fonts-freefont-ttf \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create output and cache directories
RUN mkdir -p /tmp/reele_output /tmp/reele_cache/images /tmp/reele_cache/tts /tmp/reele_cache/music

# Environment variables
ENV OUTPUT_DIR=/tmp/reele_output
ENV CACHE_DIR=/tmp/reele_cache
ENV PORT=7860

# Expose port
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:7860/api/health || exit 1

# Run the application
CMD ["python", "app.py"]
