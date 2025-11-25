#!/bin/bash

# Deploy all EnSync packages to npm
# This script publishes packages in the correct order (utils first, then clients)

set -e  # Exit on any error

echo "======================================"
echo "EnSync Package Deployment Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if user is logged in to npm
check_npm_login() {
    if ! npm whoami &> /dev/null; then
        echo -e "${RED}Error: You are not logged in to npm${NC}"
        echo "Please run: npm login"
        exit 1
    fi
    echo -e "${GREEN}✓ Logged in to npm as: $(npm whoami)${NC}"
}

# Function to publish a package
publish_package() {
    local package_dir=$1
    local package_name=$2
    
    echo ""
    echo "======================================"
    echo "Publishing: $package_name"
    echo "======================================"
    
    cd "$package_dir"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        echo -e "${RED}Error: package.json not found in $package_dir${NC}"
        exit 1
    fi
    
    # Get current version
    local version=$(node -p "require('./package.json').version")
    echo "Current version: $version"
    
    # Run format check
    echo "Running format check..."
    if npm run format:check 2>/dev/null; then
        echo -e "${GREEN}✓ Format check passed${NC}"
    else
        echo -e "${YELLOW}⚠ Format check not available or failed${NC}"
    fi
    
    # Publish to npm
    echo "Publishing to npm..."
    if npm publish --access public; then
        echo -e "${GREEN}✓ Successfully published $package_name@$version${NC}"
    else
        echo -e "${RED}✗ Failed to publish $package_name${NC}"
        exit 1
    fi
    
    cd - > /dev/null
}

# Function to ask user if they want to publish a package
ask_to_publish() {
    local package_name=$1
    echo ""
    read -p "Do you want to publish $package_name? (yes/no/skip): " response
    case "$response" in
        yes|y|Y)
            return 0
            ;;
        skip|s|S)
            echo -e "${YELLOW}⊘ Skipping $package_name${NC}"
            return 1
            ;;
        *)
            echo -e "${YELLOW}⊘ Skipping $package_name${NC}"
            return 1
            ;;
    esac
}

# Main deployment process
main() {
    echo "Starting deployment process..."
    echo ""
    
    # Check npm login
    check_npm_login
    
    # Store the base directory
    BASE_DIR=$(pwd)
    
    # Track published packages
    declare -a published_packages=()
    
    echo ""
    echo -e "${YELLOW}Select which packages to publish:${NC}"
    echo ""
    
    # Step 1: Ask about ensync-utils (must be first as others depend on it)
    if ask_to_publish "ensync-utils"; then
        publish_package "$BASE_DIR/packages/ensync-utils" "ensync-utils"
        published_packages+=("ensync-utils@$(cd packages/ensync-utils && node -p "require('./package.json').version")")
        
        # Wait a bit for npm registry to update if publishing dependent packages
        echo ""
        echo "Waiting 10 seconds for npm registry to update..."
        sleep 10
    fi
    
    # Step 2: Ask about ensync-client-sdk (gRPC)
    if ask_to_publish "ensync-client-sdk (gRPC)"; then
        publish_package "$BASE_DIR/packages/ensync-client-sdk" "ensync-client-sdk"
        published_packages+=("ensync-client-sdk@$(cd packages/ensync-client-sdk && node -p "require('./package.json').version")")
    fi
    
    # Step 3: Ask about ensync-websocket-client
    if ask_to_publish "ensync-websocket-client"; then
        publish_package "$BASE_DIR/packages/ensync-websocket-client" "ensync-websocket-client"
        published_packages+=("ensync-websocket-client@$(cd packages/ensync-websocket-client && node -p "require('./package.json').version")")
    fi
    
    # Success message
    echo ""
    echo "======================================"
    if [ ${#published_packages[@]} -eq 0 ]; then
        echo -e "${YELLOW}No packages were published${NC}"
    else
        echo -e "${GREEN}✓ Deployment complete!${NC}"
        echo "======================================"
        echo ""
        echo "Published packages:"
        for pkg in "${published_packages[@]}"; do
            echo "  • $pkg"
        done
        echo ""
        echo "View on npm:"
        for pkg in "${published_packages[@]}"; do
            pkg_name=$(echo "$pkg" | cut -d'@' -f1)
            echo "  • https://www.npmjs.com/package/$pkg_name"
        done
    fi
    echo "======================================"
    echo ""
}

# Run main function
main
