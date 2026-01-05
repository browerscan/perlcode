FROM oven/bun:1.2.0 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source
COPY src ./src

# Build
RUN bun build src/index.ts --outdir dist --target bun

FROM oven/bun:1.2.0 AS production

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s CMD curl -f http://localhost:3000/api/health || exit 1

# Run the app
CMD ["bun", "run", "dist/index.js"]
