#!/bin/bash

# Elnazlawy Data Import Script
# Run on server to import CSV data

echo "🚀 Starting data import process..."

# Navigate to project directory
cd /root/elnazlawy-system || exit 1

# Pull latest changes
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies if needed
echo "📦 Installing dependencies..."
npm install

# Run import script
echo "📊 Running data import..."
DATABASE_URL="postgresql://elnazlawy:Elnazlawy2026!Secure@localhost:5432/elnazlawy_db" npm run db:import

echo "✅ Import completed!"
