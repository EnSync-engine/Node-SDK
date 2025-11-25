#!/bin/bash

# Setup script for local development with EnSync packages
# Links all packages locally so they can be tested before publishing

set -e  # Exit on any error

echo "======================================"
echo "EnSync Local Development Setup"
echo "======================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_DIR=$(pwd)

echo "Installing dependencies for all packages..."
echo ""

# Install ensync-utils dependencies
echo "1. Installing ensync-utils dependencies..."
cd "$BASE_DIR/packages/ensync-utils"
npm install
echo -e "${GREEN}✓ ensync-utils dependencies installed${NC}"

# Link ensync-utils globally
echo "2. Linking ensync-utils globally..."
npm link
echo -e "${GREEN}✓ ensync-utils linked globally${NC}"

# Install and link ensync-client-sdk (gRPC)
echo ""
echo "3. Installing ensync-client-sdk dependencies..."
cd "$BASE_DIR/packages/ensync-client-sdk"
npm link ensync-utils
npm install --legacy-peer-deps
echo -e "${GREEN}✓ ensync-client-sdk dependencies installed and linked to ensync-utils${NC}"

# Install and link ensync-websocket-client
echo ""
echo "4. Installing ensync-websocket-client dependencies..."
cd "$BASE_DIR/packages/ensync-websocket-client"
npm link ensync-utils
npm install --legacy-peer-deps
echo -e "${GREEN}✓ ensync-websocket-client dependencies installed and linked to ensync-utils${NC}"

# Setup tests directory
echo ""
echo "5. Setting up tests directory..."
cd "$BASE_DIR/tests"
if [ ! -f "package.json" ]; then
    npm init -y
fi
npm install dotenv
echo -e "${GREEN}✓ Tests directory setup complete${NC}"

echo ""
echo "======================================"
echo -e "${GREEN}✓ Local development setup complete!${NC}"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Ensure your .env file in tests/ has the correct credentials"
echo "  2. Start your EnSync gRPC server"
echo "  3. Run tests from the tests directory:"
echo "     cd tests && node grpc-producer.js"
echo ""
echo "To publish packages to npm, run:"
echo "  ./deploy-all.sh"
echo ""
