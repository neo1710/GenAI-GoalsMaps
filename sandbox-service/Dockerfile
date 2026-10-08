FROM python:3.12-slim

# Install system utilities
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        bash \
        curl \
        nodejs \
        npm && \
    rm -rf /var/lib/apt/lists/*

# Create non-root sandbox user
RUN useradd -m -s /bin/bash sandbox

# Set working directory for sandbox execution
WORKDIR /workspace

# Create input and output data folders
RUN mkdir -p /workspace/input /workspace/output /app && \
    chown -R sandbox:sandbox /workspace /app

# Install Python dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy service code
COPY app /app/app

# Set environment
ENV PYTHONPATH=/app:/workspace
ENV SANDBOX_WORKSPACE_DIR=/workspace
ENV PORT=8001
ENV HOST=0.0.0.0

EXPOSE 8001

USER sandbox

# Start FastAPI server for backend agent integration
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]