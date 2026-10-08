# syntax=docker/dockerfile:1.7
#
# The Chipzen starter's IP-protected image, with the build context widened to
# the repo root so the bot can bundle lib/poker. Only the compiled binary ships.
#
# From bots/chipzen: npm run image && npm run tarball

FROM oven/bun:1-debian AS builder
WORKDIR /build

COPY bots/chipzen/package.json bots/chipzen/
RUN cd bots/chipzen && bun install --production

COPY lib/poker lib/poker
COPY bots/chipzen bots/chipzen
RUN cd bots/chipzen \
    && bun build --compile --minify --sourcemap=none --target=bun-linux-x64 \
        bot.ts --outfile=/build/bot

FROM debian:12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Owner and mode are set on the COPY: a chmod or chown afterwards would store
# the 80 MB binary a second time in its own layer.
RUN groupadd --system --gid 10001 bot \
    && useradd --system --uid 10001 --gid bot --home-dir /bot --shell /usr/sbin/nologin bot
WORKDIR /bot
COPY --from=builder --chown=10001:10001 --chmod=755 /build/bot /bot/bot
USER 10001

ENTRYPOINT ["dumb-init", "/bot/bot"]
