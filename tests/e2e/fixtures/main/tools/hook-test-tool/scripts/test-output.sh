#!/bin/bash
# Use unbuffered output to ensure stdout/stderr ordering is preserved
# Each line is flushed immediately after writing

echo "Starting initialization..."
sleep 0.05
echo "Warning: this is a test warning" >&2
sleep 0.05
echo "Loading configuration..."
sleep 0.05
echo "Error: simulated error message" >&2
sleep 0.05
echo "Processing data..."
sleep 0.05
echo "Another stderr line" >&2
sleep 0.05
echo "Initialization complete!"
