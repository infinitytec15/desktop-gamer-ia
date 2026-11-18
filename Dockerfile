FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/web/package.json apps/web/package.json
COPY services/api/package.json services/api/package.json
COPY packages/printing/package.json packages/printing/package.json
RUN npm ci --workspace @gameforge/web --workspace @gameforge/api --workspace @gameforge/printing --include-workspace-root=false
COPY packages/printing packages/printing
COPY apps/web apps/web
COPY services/api services/api
RUN npm run web:build && npm run api:build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/web/package.json apps/web/package.json
COPY services/api/package.json services/api/package.json
COPY packages/printing/package.json packages/printing/package.json
RUN npm ci --omit=dev --workspace @gameforge/api --include-workspace-root=false && npm cache clean --force
COPY --from=build --chown=node:node /app/packages/printing/dist packages/printing/dist
COPY --from=build --chown=node:node /app/services/api/dist services/api/dist
COPY --from=build --chown=node:node /app/services/api/migrations services/api/migrations
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/api/dist/server.js"]
