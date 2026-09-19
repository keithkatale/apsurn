# Cloud Run image for apsurn with a headless browser for the scraping agent.
#
# Based on the official Playwright image, which ships Chromium + all system
# libraries the headless browser needs. Builds the Next.js standalone server.

# ---- deps ----
FROM mcr.microsoft.com/playwright:v1.56.0-jammy AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Install all deps (including dev) for the build. Playwright browsers are
# already present in this base image, so skip the postinstall download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci || npm install

# ---- build ----
FROM mcr.microsoft.com/playwright:v1.56.0-jammy AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NEXT_TELEMETRY_DISABLED=1
# Only set here — Vercel's own build must NOT get standalone output (see
# next.config.ts comment).
ENV NEXT_STANDALONE_BUILD=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----
FROM mcr.microsoft.com/playwright:v1.56.0-jammy AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Chromium from the base image (Playwright resolves it automatically).
ENV SCRAPER_ENABLE_RENDER=1
# Cloud Run provides PORT; Next standalone honors it.
ENV PORT=8080

# Next standalone output bundles a minimal server + node_modules.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 8080
CMD ["node", "server.js"]
