# Multi-arch: builds natively on ARM64 and x86.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DATA_DIR=/data
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY crosspaths ./crosspaths
COPY server ./server
COPY wsgi.py .
COPY VERSION .
RUN mkdir -p /data
VOLUME /data
EXPOSE 8787
# One worker + threads: SQLite is happiest that way and it keeps RAM low on a small (2 GB) host.
CMD ["gunicorn", "-w", "1", "--threads", "8", "-b", "0.0.0.0:8787", "--timeout", "180", "wsgi:app"]
