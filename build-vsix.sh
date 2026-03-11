#!/bin/bash

# Script to build the VSIX package for the VS Code extension
# This script executes: npm install, npm run compile, npx vsce package

echo "Starting build of the VS Code extension..."

# Verify if we are in the correct directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Are you in the correct directory?"
    exit 1
fi

# Step 1: npm install
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Error during dependency installation"
    exit 1
fi

# Step 2: npm run compile
echo "Compiling the project..."
npm run compile
if [ $? -ne 0 ]; then
    echo "Error during compilation"
    exit 1
fi

# Step 3: npx vsce package
echo "Creating the VSIX package..." 
npx vsce package
if [ $? -ne 0 ]; then
    echo "Error during creation of the VSIX package"
    exit 1
fi

echo "Build completed successfully!"
echo "📍 The VSIX file has been created in the current directory"
ls -la *.vsix 2>/dev/null || echo "No VSIX file found"
