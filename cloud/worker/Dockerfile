# Образ воркера рендера Remotion для Hugging Face Jobs. Кладётся в приватный Space (SDK: Docker) `remotion-speed-worker`.
# Рядом с этим файлом перед сборкой должны лежать: render_chunk.py, app.py, package.json и package-lock.json
# (последние два — из папки remotion/ набора; их копирует cloud/worker/setup_hf.py, см. cloud/worker/README.md).
# Версии Remotion в образе и в проекте обязаны совпадать — поэтому зависимости ставятся из того же package.json.

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Системные библиотеки для headless Chromium, ffmpeg и python (воркер на python + huggingface_hub)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates tar python3 python3-pip ffmpeg \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
    libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*

# Те же системные шрифты, что у автора: запасные глифы (стрелки, символы, эмодзи) должны совпасть с локальным рендером
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig fonts-dejavu-core fonts-liberation fonts-freefont-ttf fonts-noto-color-emoji fonts-noto-mono \
    fonts-urw-base35 fonts-droid-fallback fonts-wqy-zenhei fonts-ipafont-gothic fonts-opensymbol fonts-unifont \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages huggingface_hub

# Remotion CLI из package.json проекта + прогрев Chromium на этапе сборки (в задаче браузер уже внутри образа)
WORKDIR /rt
COPY package.json package-lock.json* /rt/
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi \
    && npx remotion browser ensure \
    && test -x /rt/node_modules/.bin/remotion

ENV PATH="/rt/node_modules/.bin:${PATH}"
ENV NODE_PATH="/rt/node_modules"

WORKDIR /app
COPY render_chunk.py app.py /app/

EXPOSE 7860
CMD ["python3", "/app/app.py"]
