# BrandCore - single image serving both the API and the built frontend.
#
# Debian-based (not alpine): sharp and Playwright's chromium both have far
# more reliable prebuilt binaries against glibc than musl, and Playwright's
# `--with-deps` flag only knows how to install its OS-level dependencies
# (fonts, X11 libs, etc.) on Debian/Ubuntu derivatives.
FROM node:20-bookworm

# System deps for the Python crawl agent (src/services/crawl_agent.py).
# Playwright's own OS-level deps (fonts, headless-rendering libs) are pulled
# in below by `playwright install --with-deps`, not listed manually here.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Node dependencies ---
# Installed before copying the rest of the source so this layer is cached
# across rebuilds that only touch application code.
COPY package.json package-lock.json ./
RUN npm ci

# --- Python dependencies (crawl agent) ---
# Lives at .venv/ relative to the app's cwd - src/services/dna.service.ts
# hardcodes this exact path (`.venv/bin/python`) to invoke the crawler.
COPY requirements.txt ./
RUN python3 -m venv .venv \
    && .venv/bin/pip install --no-cache-dir --upgrade pip \
    && .venv/bin/pip install --no-cache-dir -r requirements.txt \
    && .venv/bin/python -m playwright install --with-deps chromium

# --- Application source + build ---
COPY . .

# Google OAuth client ID has to be baked into the frontend bundle at build
# time (Vite substitutes VITE_* vars when it compiles, not at container
# startup) - .env itself is deliberately excluded from the build context
# (see .dockerignore) since it also holds real secrets, so this one public,
# non-secret value comes in via a build arg instead (see docker-compose.yml).
# Without it, the Google Sign-In button just doesn't render (no broken UI) -
# same fallback as running `vite build` locally with no .env at all.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# Builds the frontend (vite -> dist/client, served by app.ts in production -
# see the static-serving block added there). The backend is run directly via
# tsx (already a dependency, same as `npm run dev` uses locally) rather than
# a tsc build, since tsc's configured outDir/rootDir here compiles to
# dist/src/*.js, not the dist/server.js package.json's own (currently
# unused) start script expects - running the TS source directly sidesteps
# that mismatch entirely instead of also having to fix it.
RUN npm run build:client

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
