#!/bin/bash

# Production Startup Script for QC App

cd "$(dirname "$0")"

echo "Building frontend for production..."
npm run build

echo "Starting production server..."
cd server
node server.js

