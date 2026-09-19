ARG NODE_IMAGE=node:24.21.0-bookworm
ARG PYTHON_IMAGE=python:3.13.15-bookworm
FROM ${NODE_IMAGE} AS node
FROM ${PYTHON_IMAGE}

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /workspace
COPY entrypoint.sh /usr/local/bin/worklog-entrypoint
ENTRYPOINT ["bash", "/usr/local/bin/worklog-entrypoint"]
