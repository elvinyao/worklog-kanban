# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24.22.2-bookworm
ARG PYTHON_IMAGE=python:3.13.15-bookworm
FROM ${NODE_IMAGE} AS node
FROM ${PYTHON_IMAGE}

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN --mount=type=secret,id=host_ca,target=/run/host-ca.crt \
    if [ -f /run/host-ca.crt ]; then openssl x509 -in /run/host-ca.crt -noout && cp /run/host-ca.crt /usr/local/share/ca-certificates/worklog-host.crt && update-ca-certificates; fi \
    && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
       libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcups2 \
       libdbus-1-3 libdrm2 libgbm1 libnspr4 libnss3 libxcomposite1 \
       libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /usr/local/share/ca-certificates/worklog-host.crt \
    && update-ca-certificates --fresh

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /workspace
COPY entrypoint.sh /usr/local/bin/worklog-entrypoint
ENTRYPOINT ["bash", "/usr/local/bin/worklog-entrypoint"]
