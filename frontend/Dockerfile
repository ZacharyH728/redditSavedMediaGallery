# frontend/Dockerfile

# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /usr/src/app/frontend


ARG API_URL
ENV REACT_APP_API_URL=$API_URL
ARG REDDIT_CLIENT_ID
ENV REACT_APP_REDDIT_CLIENT_ID=$REDDIT_CLIENT_ID
ARG REDDIT_CLIENT_SECRET
ENV REACT_APP_REDDIT_CLIENT_SECRET=$REDDIT_CLIENT_SECRET
ARG REACT_APP_URL_REDDIT_CALLBACK
ENV REACT_APP_URL_REDDIT_CALLBACK=$REDDIT_CALLBACK_URL


# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the React app for production
RUN npm run build

# Stage 2: Serve the built application
FROM node:18-alpine

WORKDIR /usr/src/app/frontend

# Install serve to act as the static file server
RUN npm install -g serve

# Copy the build output from the build stage
COPY --from=build /usr/src/app/frontend/build ./build

# Expose port 3000
EXPOSE 3000

# Start the server
CMD ["serve", "-s", "build", "-l", "3000"]
