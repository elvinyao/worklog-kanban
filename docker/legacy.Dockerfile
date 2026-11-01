# Compatibility image for docker.sh managed deployments and the fake stack.
ARG PYTHON_IMAGE=python@sha256:933b46a028fd786c9c3d426ebabc237e29a15912231ea8de576e95f0e4f41a4c
ARG NODE_IMAGE=node@sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413
FROM ${NODE_IMAGE} AS node
FROM ${PYTHON_IMAGE} AS runtime-base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/worklog
COPY requirements/runtime.txt /opt/requirements/runtime.txt
RUN --mount=type=cache,target=/root/.cache/pip python -m pip install --require-hashes -r /opt/requirements/runtime.txt

FROM runtime-base AS frontend-build
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

FROM frontend-build AS production-builder
ARG SITE_CONFIG_DIGEST
RUN --mount=type=secret,id=site_config,required=true test -n "$SITE_CONFIG_DIGEST" && npm run build:production -- --config /run/secrets/site_config

FROM frontend-build AS builder
COPY config/dummy.json ./config/dummy.json
RUN npm run build

FROM ${PYTHON_IMAGE} AS source-tools
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY docker/update-source.sh /opt/update-source.sh
COPY docker/as_owner.py /opt/as_owner.py
WORKDIR /workspace
ENTRYPOINT ["python", "/opt/as_owner.py", "bash", "/opt/update-source.sh"]

FROM runtime-base AS operations
COPY app ./app
COPY docker ./docker
ENV PYTHONPATH=/opt/worklog

FROM runtime-base AS production
COPY --from=production-builder /opt/worklog/dist/production ./release
COPY docker ./docker
RUN useradd --uid 10001 --create-home worklog && mkdir /data && chown worklog:worklog /data
ENV WORKLOG_MODE=production WORKLOG_SITE_CONFIG=/opt/worklog/release/site-config.json PYTHONPATH=/opt/worklog
USER 10001:10001
EXPOSE 4173
CMD ["python", "/opt/worklog/release/run.py", "--config", "/opt/worklog/release/site-config.json", "--database", "/data/board.sqlite3"]

FROM runtime-base AS app
COPY app ./app
COPY dummy ./dummy
COPY tools/__init__.py tools/board.py tools/dev.py ./tools/
COPY config/dummy.json ./config/dummy.json
COPY docker ./docker
COPY --from=builder /opt/worklog/dist ./dist
RUN useradd --uid 10001 --create-home worklog && mkdir /data && chown worklog:worklog /data
ENV WORKLOG_DATABASE=/data/board.sqlite3 PYTHONPATH=/opt/worklog
USER 10001:10001
EXPOSE 4173 4180 4181
CMD ["python", "-m", "uvicorn", "tools.board:create_app", "--factory", "--host", "0.0.0.0", "--port", "4173", "--workers", "1", "--no-access-log", "--no-proxy-headers", "--log-level", "warning"]
