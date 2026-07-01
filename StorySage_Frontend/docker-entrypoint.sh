#!/bin/sh

# Replace the placeholder with the actual API URL
sed -i "s|BACKEND_URL|${VITE_API_BASE_URL}|g" /etc/nginx/conf.d/default.conf

# Start nginx
exec "$@" 