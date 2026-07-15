ARG BUILD_NODE_IMAGE=node:22-bookworm
ARG RUNTIME_NODE_IMAGE=node:22-slim

# ============================================================
# Stage 1: Build everything (core server + UI assets)
# ============================================================
FROM ${BUILD_NODE_IMAGE} AS build
WORKDIR /app

# 代理 & npm 镜像（ZTE 内网）
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV NODEJS_ORG_MIRROR=https://registry.npmmirror.com/-/binary/node
RUN npm config set registry https://artsz.zte.com.cn/artifactory/api/npm/public-npm-virtual/ && \
    npm config set proxy ${HTTP_PROXY} && \
    npm config set https-proxy ${HTTPS_PROXY} && \
    npm config set noproxy ${NO_PROXY} && \
    echo "no_proxy=localhost,127.0.0.1,10.0.0.0/8,artsz.zte.com.cn" >> ~/.npmrc && \
    echo "unsafe-perm=true" >> ~/.npmrc

COPY package.json package-lock.json ./
COPY packages/cli/package.json packages/cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/electron/package.json packages/electron/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY . .
RUN npm run build:docker

FROM ${BUILD_NODE_IMAGE} AS production-deps
WORKDIR /app
ENV NODE_ENV=production

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV NODEJS_ORG_MIRROR=https://registry.npmmirror.com/-/binary/node
RUN npm config set registry https://artsz.zte.com.cn/artifactory/api/npm/public-npm-virtual/ && \
    npm config set proxy ${HTTP_PROXY} && \
    npm config set https-proxy ${HTTPS_PROXY} && \
    npm config set noproxy ${NO_PROXY} && \
    echo "no_proxy=localhost,127.0.0.1,10.0.0.0/8,artsz.zte.com.cn" >> ~/.npmrc && \
    echo "unsafe-perm=true" >> ~/.npmrc

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
RUN npm ci --omit=dev --workspace=@claude-code-router/core --include-workspace-root=false \
  && npm cache clean --force

# ============================================================
# Stage 2: Core server runtime (no nginx)
# ============================================================
FROM ${RUNTIME_NODE_IMAGE} AS core
WORKDIR /app

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}
ENV NODEJS_ORG_MIRROR=https://registry.npmmirror.com/-/binary/node
RUN npm config set registry https://artsz.zte.com.cn/artifactory/api/npm/public-npm-virtual/ && \
    npm config set proxy ${HTTP_PROXY} && \
    npm config set https-proxy ${HTTPS_PROXY} && \
    npm config set noproxy ${NO_PROXY} && \
    echo "no_proxy=localhost,127.0.0.1,10.0.0.0/8,artsz.zte.com.cn" >> ~/.npmrc && \
    echo "unsafe-perm=true" >> ~/.npmrc

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY --from=production-deps /app/node_modules node_modules

COPY --from=build /app/packages/core/dist packages/core/dist
COPY docker/pm2.config.cjs /app/docker/pm2.config.cjs
COPY docker/core-entrypoint.sh /usr/local/bin/ccr-core-entrypoint
RUN chmod +x /usr/local/bin/ccr-core-entrypoint

EXPOSE 3456 3457 3459

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.CCR_GATEWAY_PORT || '3456') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["ccr-core-entrypoint"]

# ============================================================
# Stage 3: Nginx sidecar with UI assets
# ============================================================
FROM nginx:1.31-alpine AS nginx
COPY --from=build /app/packages/ui/dist/renderer /usr/share/nginx/html
COPY docker/nginx.default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/health || exit 1
