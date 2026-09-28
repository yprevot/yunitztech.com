FROM node:24.21.0-alpine AS manifests
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
FROM manifests AS dependencies
RUN npm ci
FROM dependencies AS build
COPY apps apps
COPY scripts/trace-web.mjs scripts/trace-web.mjs
RUN npm run build && node scripts/trace-web.mjs
FROM manifests AS api-dependencies
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root=false
FROM node:24.21.0-alpine AS api
ENV NODE_ENV=production UPLOAD_DIR=/app/uploads
WORKDIR /app
COPY --from=api-dependencies /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/src/schema.sql ./apps/api/src/schema.sql
COPY --from=build /app/apps/api/src/seed.json ./apps/api/src/seed.json
RUN mkdir /app/uploads && chown node:node /app/uploads
USER node
CMD ["node","apps/api/dist/main.js"]
FROM node:24.21.0-alpine AS web
ARG RELEASE_SHA=local
ENV RELEASE_SHA=$RELEASE_SHA
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
WORKDIR /app
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/web/package.json ./apps/web/package.json
USER node
CMD ["node","apps/web/dist/server/entry.mjs"]
FROM nginxinc/nginx-unprivileged:1.28-alpine AS gateway
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp/nginx
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY infra/nginx/default.conf /etc/nginx/templates/default.conf.template

COPY --chmod=755 infra/nginx/05-runtime-dirs.sh /docker-entrypoint.d/05-runtime-dirs.sh
