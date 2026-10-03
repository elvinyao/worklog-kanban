# syntax=docker/dockerfile:1
# Build .agent/Dockerfile first with the same images.lock digests as the runner.
ARG DEV_IMAGE=worklog-kanban-ci-runtime
FROM ${DEV_IMAGE}
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY requirements/dev.txt requirements/runtime.txt ./requirements/
COPY tools/__init__.py tools/sync_deps.py ./tools/
RUN /usr/local/bin/python -m venv /opt/venv \
    && python -m tools.sync_deps \
    && npm exec -- playwright install chromium
# ci.Dockerfile.dockerignore is an allowlist. No checkout bind mount, local
# configuration, database, browser profile, or registry credential is needed.
COPY . .
CMD ["bash", ".agent/ci-checks.sh"]
