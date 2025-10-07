#!/bin/bash
set -e

# Load environment variables from .env file first
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "Loaded environment variables from .env"
fi

# Then load K6-specific environment variables
if [ -f .env.k6 ]; then
  # Replace variables in .env.k6 with actual values from environment
  envsubst < .env.k6 > .env.k6.tmp
  export $(grep -v '^#' .env.k6.tmp | xargs)
  rm .env.k6.tmp
  echo "Loaded environment variables from .env.k6"
else
  echo "Error: .env.k6 file not found"
  exit 1
fi

# Check if K6 is installed
if ! command -v k6 &> /dev/null; then
  echo "Error: k6 is not installed. Please install it first:"
  echo "  - macOS: brew install k6"
  echo "  - Linux: follow instructions at https://k6.io/docs/getting-started/installation/"
  exit 1
fi

# Check required environment variables
if [ -z "$ACCESS_KEY" ]; then
  echo "Error: ACCESS_KEY is not set. Make sure ENSYNC_ACCESS_KEY is set in your .env file."
  exit 1
fi

if [ -z "$RECIPIENT_ID" ]; then
  echo "Error: RECIPIENT_ID is not set. Make sure RECEIVER_IDENTIFICATION_NUMBER is set in your .env file."
  exit 1
fi

if [ -z "$EVENT_NAME" ]; then
  echo "Error: EVENT_NAME is not set. Make sure EVENT_TO_PUBLISH is set in your .env file."
  exit 1
fi

# Parse command line arguments
TEST_TYPE="all"
OUTPUT_FORMAT="text"
HYBRID_MODE="true"

print_usage() {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -t, --test TYPE    Test type: 'connection', 'publish', or 'all' (default: all)"
  echo "  -o, --output TYPE  Output format: 'text', 'json', or 'html' (default: text)"
  echo "  -h, --hybrid       Use hybrid encryption (default: true)"
  echo "  -s, --standard     Use standard encryption (overrides hybrid)"
  echo "  -r, --recipients N Number of recipients (default: from .env.k6)"
  echo "  --help             Show this help message"
}

while [[ "$#" -gt 0 ]]; do
  case $1 in
    -t|--test) TEST_TYPE="$2"; shift ;;
    -o|--output) OUTPUT_FORMAT="$2"; shift ;;
    -h|--hybrid) HYBRID_MODE="true" ;;
    -s|--standard) HYBRID_MODE="false" ;;
    -r|--recipients) RECIPIENTS_COUNT="$2"; shift ;;
    --help) print_usage; exit 0 ;;
    *) echo "Unknown parameter: $1"; print_usage; exit 1 ;;
  esac
  shift
done

# Create output directory
OUTPUT_DIR="k6-results"
mkdir -p "$OUTPUT_DIR"

# Set output options based on format
OUTPUT_OPTS=""
case "$OUTPUT_FORMAT" in
  json)
    OUTPUT_OPTS="--out json=$OUTPUT_DIR/result.json"
    ;;
  html)
    OUTPUT_OPTS="--out json=$OUTPUT_DIR/result.json"
    echo "HTML report will be generated after the test"
    ;;
  text|*)
    OUTPUT_OPTS=""
    ;;
esac

# Run connection test
run_connection_test() {
  echo "Running EnSync connection capacity test..."
  
  # Pass environment variables to K6
  k6 run $OUTPUT_OPTS \
    -e BASE_URL="$BASE_URL" \
    -e ACCESS_KEY="$ACCESS_KEY" \
    -e RAMP_USERS="$RAMP_USERS" \
    -e STEADY_USERS="$STEADY_USERS" \
    -e RAMP_DURATION="$RAMP_DURATION" \
    -e STEADY_DURATION="$STEADY_DURATION" \
    -e PING_INTERVAL="$PING_INTERVAL" \
    -e TIMEOUT="$TIMEOUT" \
    k6-connection-test.js
    
  echo "Connection test completed"
}

# Run publish test
run_publish_test() {
  echo "Running EnSync publish performance test..."
  echo "Using ${HYBRID_MODE} hybrid encryption with ${RECIPIENTS_COUNT} recipients"
  
  # Pass environment variables to K6
  k6 run $OUTPUT_OPTS \
    -e BASE_URL="$BASE_URL" \
    -e ACCESS_KEY="$ACCESS_KEY" \
    -e RECIPIENT_ID="$RECIPIENT_ID" \
    -e EVENT_NAME="$EVENT_NAME" \
    -e VUS="$VUS" \
    -e DURATION="$DURATION" \
    -e PUBLISH_PER_VU="$PUBLISH_PER_VU" \
    -e PAYLOAD_SIZE="$PAYLOAD_SIZE" \
    -e USE_HYBRID="$HYBRID_MODE" \
    -e RECIPIENTS_COUNT="$RECIPIENTS_COUNT" \
    -e PING_INTERVAL="$PING_INTERVAL" \
    -e TIMEOUT="$TIMEOUT" \
    k6-publish-test.js
    
  echo "Publish test completed"
}

# Generate HTML report if requested
generate_html_report() {
  if [ "$OUTPUT_FORMAT" = "html" ]; then
    echo "Generating HTML report..."
    # This assumes you have a tool to convert JSON to HTML
    # You might need to install it or use another approach
    if command -v k6-reporter &> /dev/null; then
      k6-reporter "$OUTPUT_DIR/result.json" > "$OUTPUT_DIR/report.html"
      echo "HTML report generated at $OUTPUT_DIR/report.html"
    else
      echo "Warning: k6-reporter not found. Install it with: npm install -g k6-reporter"
      echo "JSON results are available at $OUTPUT_DIR/result.json"
    fi
  fi
}

# Run tests based on type
case "$TEST_TYPE" in
  connection)
    run_connection_test
    ;;
  publish)
    run_publish_test
    ;;
  all|*)
    run_connection_test
    echo ""
    run_publish_test
    ;;
esac

generate_html_report

echo ""
echo "All tests completed!"
