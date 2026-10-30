# The base image of both stages. The tag moves with the Node 24 line and Debian's security fixes (rebuild with --pull to get them);
# NODE_IMAGE can name another tag (or a digest, to pin it) without touching this file.
ARG NODE_IMAGE=node:24-bookworm-slim

# Build stage: minified, content-hashed assets (dist/). Nothing from it but the output reaches the final image.
FROM ${NODE_IMAGE} AS assets
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src/client ./src/client
COPY src/shared ./src/shared
COPY src/public ./src/public
COPY scripts/build/build.mjs ./scripts/build/build.mjs
# build.mjs plans the first-paint CSS of each view with the same module the server uses
COPY src/server/platform/http/first-paint.js ./src/server/platform/http/first-paint.js
RUN node scripts/build/build.mjs

FROM ${NODE_IMAGE}

LABEL org.opencontainers.image.title="HOK Global Scrim Lab"
LABEL org.opencontainers.image.description="Honor of Kings Global draft, scrim and tier-list workspace"

ENV NODE_ENV=production
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
# The container is the sandbox for headless Chromium (roster sync).
ENV CHROMIUM_NO_SANDBOX=true

WORKDIR /app

# The Debian security fixes published since the base image was built (perl and the libraries Chromium needs among them).
RUN apt-get update \
    && apt-get -y --no-install-recommends upgrade \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# Every launch of the server is headless, so only the headless shell of Chromium is installed; the X server (xvfb) that
# Playwright adds for headed runs is removed again: it is most of the system packages that scanners flag.
RUN mkdir -p /home/node/.cache/ms-playwright \
    && node node_modules/playwright/cli.js install --with-deps --only-shell chromium \
    && apt-get -y purge --auto-remove xvfb \
    && chown -R node:node /home/node/.cache/ms-playwright \
    && rm -rf /var/lib/apt/lists/*

# The server only needs node. The package managers of the base image go: they carry their own copies of dozens of packages
# (the ones vulnerability scanners keep flagging) and a way to install more code into a running container.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    /root/.npm /home/node/.npm

COPY src ./src
COPY --from=assets /build/dist ./dist
COPY scripts/accounts ./scripts/accounts

RUN chown -R node:node /app

# The heap of the server stays small (a few tens of MB in use): a ceiling that keeps a leak from eating the machine.
ENV NODE_OPTIONS=--max-old-space-size=384

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "src/server/server.js"]
