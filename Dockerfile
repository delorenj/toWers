FROM node:22-slim AS builder

WORKDIR /build
COPY ./frontend .
COPY ./VERSION .
RUN npm install
RUN REACT_APP_VERSION=$(cat VERSION) npm run build

FROM --platform=$BUILDPLATFORM golang AS builder2

ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

RUN apt-get update && apt-get install -y \
  gcc-aarch64-linux-gnu \
  gcc-x86-64-linux-gnu \
  && rm -rf /var/lib/apt/lists/*

ENV GO111MODULE=on \
  CGO_ENABLED=1 \
  GOOS=$TARGETOS \
  GOARCH=$TARGETARCH

RUN if [ "$TARGETARCH" = "arm64" ]; then \
  echo "Setting up for ARM64 cross-compilation"; \
  export CC=aarch64-linux-gnu-gcc; \
  elif [ "$TARGETARCH" = "amd64" ]; then \
  echo "Setting up for AMD64 cross-compilation"; \
  export CC=x86_64-linux-gnu-gcc; \
  fi

WORKDIR /build

COPY go.mod go.sum ./
RUN if [ "$TARGETARCH" = "arm64" ]; then \
  CC=aarch64-linux-gnu-gcc go mod download; \
  elif [ "$TARGETARCH" = "amd64" ]; then \
  CC=x86_64-linux-gnu-gcc go mod download; \
  else \
  go mod download; \
  fi

COPY . .
COPY --from=builder /build/dist ./frontend/dist

RUN if [ "$TARGETARCH" = "arm64" ]; then \
  CC=aarch64-linux-gnu-gcc go build -ldflags "-s -w -X 'toWers/common.Version=$(cat VERSION)' -extldflags '-static'" -o toWers; \
  elif [ "$TARGETARCH" = "amd64" ]; then \
  CC=x86_64-linux-gnu-gcc go build -ldflags "-s -w -X 'toWers/common.Version=$(cat VERSION)' -extldflags '-static'" -o toWers; \
  else \
  go build -ldflags "-s -w -X 'toWers/common.Version=$(cat VERSION)' -extldflags '-static'" -o toWers; \
  fi

FROM ghcr.io/astral-sh/uv:alpine

RUN apk update \
  && apk upgrade \
  && apk add --no-cache ca-certificates tzdata nodejs npm python3 git \
  && update-ca-certificates 2>/dev/null || true

RUN mkdir -p /data

# Default configuration - can be overridden at runtime
ENV PORT=3000
ENV SQLITE_PATH=/data/toWers.db

COPY --from=builder2 /build/toWers /
COPY --from=builder2 /build/backend/locales /backend/locales
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/toWers"]
