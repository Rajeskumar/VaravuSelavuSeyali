# Use official Node.js 18 image for build stage
FROM node:18 AS build

WORKDIR /app

# Copy only package files first for better cache
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy rest of the app (source, public, config, etc.)
COPY . ./

# Build the React app with increased memory limit
RUN npm run build

# Use nginx to serve the build
FROM nginx:alpine AS production
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
