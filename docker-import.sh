#!/bin/bash

# Docker Import Script
# This script runs the CSV import inside the Docker container

echo "🔍 Finding elnazlawy Docker container..."
CONTAINER_ID=$(docker ps --filter "name=elnazlawy" --format "{{.ID}}" | head -n 1)

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ No elnazlawy container found!"
    docker ps
    exit 1
fi

echo "✅ Found container: $CONTAINER_ID"
echo ""

echo "🔍 Checking project path inside container..."
docker exec "$CONTAINER_ID" sh -lc "test -d /root/elnazlawy-system && echo /root/elnazlawy-system || echo NO_PROJECT"

if [ $? -ne 0 ]; then
    echo "❌ Project directory not found inside container"
    exit 1
fi

echo ""
echo "🗑️  Running import..."
docker exec "$CONTAINER_ID" sh -lc "cd /root/elnazlawy-system && DATABASE_URL='postgresql://elnazlawy:Elnazlawy2026!Secure@localhost:5432/elnazlawy_db' npx tsx prisma/import-csv-data.ts"

echo ""
echo "✅ Import completed!"
