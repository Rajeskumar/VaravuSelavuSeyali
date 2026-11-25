# Use official Node.js 18 image for build stage
FROM node:18 AS build

WORKDIR /app

# Copy only package files first for better cache
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy rest of the app (source, public, config, etc.)
COPY . ./

# Analytics is compiled by CRA; deployment runtime variables cannot enable it.
# IDs/hosts must also be approved in src/analytics/config.ts before any tag can load.
ARG REACT_APP_ANALYTICS_ENV=disabled
ARG REACT_APP_ANALYTICS_ENABLED=false
ARG REACT_APP_ANALYTICS_CONFIG_VERIFIED=false
ARG REACT_APP_GA4_MEASUREMENT_ID=
ENV REACT_APP_ANALYTICS_ENV=$REACT_APP_ANALYTICS_ENV \
    REACT_APP_ANALYTICS_ENABLED=$REACT_APP_ANALYTICS_ENABLED \
    REACT_APP_ANALYTICS_CONFIG_VERIFIED=$REACT_APP_ANALYTICS_CONFIG_VERIFIED \
    REACT_APP_GA4_MEASUREMENT_ID=$REACT_APP_GA4_MEASUREMENT_ID

# Build the React app with increased memory limit
RUN npm run build

# Use nginx to serve the build
FROM nginx:alpine AS production
ENV NODE_ENV=production
COPY --from=build /app/build /usr/share/nginx/html

# Use custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN sed -i 's/listen       80;/listen       8080;/' /etc/nginx/conf.d/default.conf || true

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
