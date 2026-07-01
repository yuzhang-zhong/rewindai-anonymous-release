FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV FLASK_DEBUG=false
ENV PORT=5001

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.production.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.production.txt

COPY . .

RUN mkdir -p /app/uploads /app/logs

EXPOSE 5001

CMD ["sh", "-c", "gunicorn -w ${WEB_CONCURRENCY:-2} -b 0.0.0.0:${PORT:-5001} --timeout ${GUNICORN_TIMEOUT:-180} wsgi:app"]
