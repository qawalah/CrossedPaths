# Multi-arch: builds natively on ARM64 and x86. DevStore CI also publishes it as
# ghcr.io/qawalah/crosspaths (passing VERSION from devstore.json).
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DATA_DIR=/data
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY crosspaths ./crosspaths
COPY server ./server
COPY wsgi.py .
COPY VERSION .
# DevStore passes the release version (devstore.json); a plain local build keeps VERSION.
ARG VERSION
RUN if [ -n "$VERSION" ]; then echo "$VERSION" > VERSION; fi
RUN mkdir -p /data
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/api/config', timeout=3)"]
# One worker + threads: SQLite is happiest that way and it keeps RAM low on a small (2 GB) host.
CMD ["gunicorn", "-w", "1", "--threads", "8", "-b", "0.0.0.0:8787", "--timeout", "180", "wsgi:app"]
