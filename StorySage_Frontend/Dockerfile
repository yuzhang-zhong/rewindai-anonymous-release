# Build stage
FROM node:18-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Build with environment-specific variables
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Build for production by default
RUN npm run build
# Add debug ls to see if files are built
RUN ls -la dist/

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html
# Add debug ls to verify files are copied
RUN ls -la /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add script to handle nginx startup
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create SSL directory
RUN mkdir -p /etc/letsencrypt

EXPOSE 80 443

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"] 
