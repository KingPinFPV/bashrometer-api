# bashrometer-ui/Dockerfile
# -----------------------
# Build stage
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-slim
WORKDIR /app
# Copy built app from builder
COPY --from=builder /app ./
# Install only production dependencies
RUN npm ci --omit=dev

EXPOSE 3000
CMD ["npm", "run", "start"]