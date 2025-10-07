# EnSync K6 Load Testing

This document describes how to use K6 to perform load testing on the EnSync SDK to measure connection capacity and event publishing performance.

## Prerequisites

1. Install K6:
   - macOS: `brew install k6`
   - Linux: Follow instructions at [https://k6.io/docs/getting-started/installation/](https://k6.io/docs/getting-started/installation/)
   - Windows: Follow instructions at [https://k6.io/docs/getting-started/installation/](https://k6.io/docs/getting-started/installation/)

2. Optional: Install k6-reporter for HTML reports:
   ```
   npm install -g k6-reporter
   ```

## Configuration

The tests use environment variables for configuration. These are loaded from:

1. Your existing `.env` file (for ENSYNC_ACCESS_KEY, RECEIVER_IDENTIFICATION_NUMBER, EVENT_TO_PUBLISH)
2. The `.env.k6` file for K6-specific settings

The default `.env.k6` configuration is:

```
# EnSync K6 Test Configuration
BASE_URL=ws://localhost:8082
ACCESS_KEY=${ENSYNC_ACCESS_KEY}
RECIPIENT_ID=${RECEIVER_IDENTIFICATION_NUMBER}
EVENT_NAME=${EVENT_TO_PUBLISH}

# Connection Test Settings
RAMP_USERS=50
STEADY_USERS=200
RAMP_DURATION=30s
STEADY_DURATION=1m
PING_INTERVAL=15000

# Publish Test Settings
VUS=10
DURATION=1m
PUBLISH_PER_VU=50
PAYLOAD_SIZE=1024
USE_HYBRID=true
TIMEOUT=30000
RECIPIENTS_COUNT=3
```

## Running Tests

### Using the Run Script

The `run-k6-tests.sh` script provides an easy way to run the tests:

```bash
# Make the script executable
chmod +x run-k6-tests.sh

# Run all tests with default settings
./run-k6-tests.sh

# Run only connection test
./run-k6-tests.sh -t connection

# Run only publish test
./run-k6-tests.sh -t publish

# Test with standard encryption (not hybrid)
./run-k6-tests.sh -s

# Test with 5 recipients
./run-k6-tests.sh -r 5

# Output results in JSON format
./run-k6-tests.sh -o json

# Output results in HTML format (requires k6-reporter)
./run-k6-tests.sh -o html

# Show help
./run-k6-tests.sh --help
```

### Running Tests Manually

You can also run the tests directly using the K6 command:

```bash
# Connection test
k6 run -e BASE_URL=ws://localhost:8082 -e ACCESS_KEY=your-key k6-connection-test.js

# Publish test
k6 run -e BASE_URL=ws://localhost:8082 -e ACCESS_KEY=your-key -e RECIPIENT_ID=recipient-id -e EVENT_NAME=test-event k6-publish-test.js
```

## Test Descriptions

### Connection Capacity Test (`k6-connection-test.js`)

This test measures how many concurrent WebSocket connections the EnSync server can handle. It uses a ramping VUs (Virtual Users) pattern:

1. Starts with 0 connections
2. Ramps up to `RAMP_USERS` connections over `RAMP_DURATION`
3. Holds steady at `STEADY_USERS` connections for `STEADY_DURATION`
4. Ramps down to 0 connections over 30 seconds

Each connection:
- Establishes a WebSocket connection to the EnSync server
- Authenticates using the provided access key
- Maintains the connection for a short period
- Properly handles ping/pong messages for keepalive

Metrics collected:
- `connection_failures`: Count of failed connection attempts
- `connection_successes`: Count of successful connections
- `connection_time`: Time taken to establish a connection
- `authentication_time`: Time taken to authenticate after connection
- `connection_rate`: Success rate of connections

### Publish Performance Test (`k6-publish-test.js`)

This test measures how many events can be published concurrently and the performance of the publish operation. It uses a constant VUs pattern:

1. Maintains `VUS` concurrent users for `DURATION`
2. Each user publishes `PUBLISH_PER_VU` events
3. Each event has a payload of approximately `PAYLOAD_SIZE` bytes
4. Events are published to `RECIPIENTS_COUNT` recipients

The test can use either standard or hybrid encryption based on the `USE_HYBRID` setting.

Metrics collected:
- `publish_successes`: Count of successful publishes
- `publish_failures`: Count of failed publishes
- `publish_time`: Time taken to complete a publish operation
- `publish_rate`: Success rate of publish operations
- `message_size`: Size of the published messages in bytes
- `hybrid_encryption_time`: Time taken for hybrid encryption (when enabled)
- `standard_encryption_time`: Time taken for standard encryption (when enabled)

## Interpreting Results

### Connection Test Results

- **Maximum Connection Capacity**: The highest number of concurrent connections achieved before errors start occurring
- **Connection Time (p95)**: 95th percentile of connection establishment time
- **Authentication Time (p95)**: 95th percentile of authentication time
- **Connection Success Rate**: Percentage of successful connections

A healthy system should maintain a high connection success rate (>95%) even as the number of connections increases. If the success rate drops significantly, you've likely reached the system's connection capacity.

### Publish Test Results

- **Events Per Second**: Number of events successfully published per second
- **Publish Time (p95)**: 95th percentile of publish operation time
- **Publish Success Rate**: Percentage of successful publishes
- **Hybrid vs Standard Encryption**: Compare performance with `USE_HYBRID=true` vs `USE_HYBRID=false`

For multi-recipient scenarios, hybrid encryption should show significantly better performance than standard encryption, especially as the number of recipients increases.

## Performance Optimization Notes

Based on previous performance testing:

1. **Encryption Performance**: Encryption takes 2-5x longer than publishing, especially with Ed25519 encryption per recipient.

2. **Hybrid Encryption**: Using hybrid encryption (AES for payload, Ed25519 for key distribution) significantly improves multi-recipient message performance.

3. **Scaling Recommendations**:
   - For high throughput scenarios, increase the number of EnSync server instances
   - For multi-recipient scenarios, always use hybrid encryption
   - Monitor CPU usage during tests to identify bottlenecks

## Troubleshooting

1. **Connection Errors**: If you see many connection failures, check:
   - EnSync server is running and accessible
   - WebSocket endpoint is correct
   - Server has sufficient resources

2. **Authentication Failures**: Check:
   - ACCESS_KEY is valid
   - EnSync server authentication service is working

3. **Publish Failures**: Check:
   - RECIPIENT_ID is valid
   - Payload size is reasonable
   - Server has sufficient resources

4. **K6 Errors**: If K6 itself has issues:
   - Check K6 version (`k6 version`)
   - Update K6 to the latest version
   - Check system resources (memory, file descriptors)

## Comparing with Existing Load Test

The existing `ensync-load-test.js` uses Node.js worker threads to test EnSync performance. The K6 tests provide several advantages:

1. More detailed metrics and reporting
2. Better scalability for high-load testing
3. More consistent load generation
4. Built-in support for different load patterns (ramping, constant, etc.)
5. Specialized for performance testing with minimal overhead

For quick tests, the existing Node.js test is sufficient, but for comprehensive performance analysis, the K6 tests provide more detailed insights.
