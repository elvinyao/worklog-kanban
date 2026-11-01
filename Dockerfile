# syntax=docker/dockerfile:1
# Production only. Debug tooling: .agent/Dockerfile. Fake: docker/legacy.Dockerfile.
ARG PYTHON_IMAGE=python@sha256:933b46a028fd786c9c3d426ebabc237e29a15912231ea8de576e95f0e4f41a4c
ARG NODE_IMAGE=node@sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413
FROM ${NODE_IMAGE} AS node
FROM ${PYTHON_IMAGE} AS runtime-base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/worklog
COPY requirements/runtime.txt /opt/requirements/runtime.txt
RUN --mount=type=cache,target=/root/.cache/pip python -m pip install --require-hashes -r /opt/requirements/runtime.txt

FROM runtime-base AS builder
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY app ./app
COPY src ./src
COPY scripts/build.mjs ./scripts/build.mjs
COPY tools/__init__.py tools/config.py tools/package.py ./tools/
COPY requirements/runtime.txt ./requirements/runtime.txt
ARG SITE_CONFIG_DIGEST
RUN --mount=type=secret,id=site_config,required=true \
    test -n "$SITE_CONFIG_DIGEST" && npm run build:production -- --config /run/secrets/site_config

# CI exports this artifact for users to install in Chrome/Edge.
FROM scratch AS extension
COPY --from=builder /opt/worklog/dist/production/extension /extension

FROM runtime-base AS production
COPY --from=builder /opt/worklog/dist/production ./release
COPY docker/__init__.py docker/healthcheck.py ./docker/
RUN useradd --uid 10001 --create-home worklog && mkdir /data && chown worklog:worklog /data
ENV WORKLOG_MODE=production WORKLOG_SITE_CONFIG=/opt/worklog/release/site-config.json PYTHONPATH=/opt/worklog
USER 10001:10001
EXPOSE 4173
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 CMD ["python", "-m", "docker.healthcheck", "board"]
CMD ["python", "/opt/worklog/release/run.py", "--config", "/opt/worklog/release/site-config.json", "--database", "/data/board.sqlite3"]
