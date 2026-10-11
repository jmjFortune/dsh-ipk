ARG BASE_IMAGE=node:24-alpine3.22@sha256:191c9f0080fcbbc6547a85dc0ff7988072214a355aabdc1d2ec55a7dae5eea8a
FROM ${BASE_IMAGE}
RUN apk add --no-cache python3 make g++ bash git ca-certificates patchelf binutils
WORKDIR /work
