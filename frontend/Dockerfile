# frontend-svelte/Dockerfile

# Stage 1: Build the Svelte application
FROM node:18-alpine AS build

WORKDIR /usr/src/app/frontend

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ARG VITE_REDDIT_CLIENT_ID
ENV VITE_REDDIT_CLIENT_ID=$VITE_REDDIT_CLIENT_ID
ARG VITE_URL_REDDIT_CALLBACK
ENV VITE_URL_REDDIT_CALLBACK=$VITE_URL_REDDIT_CALLBACK

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the Svelte app for production
RUN npm run build

# Stage 2: Serve the built application with nginx
FROM nginx:alpine

# Copy the build output to nginx html directory
COPY --from=build /usr/src/app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
