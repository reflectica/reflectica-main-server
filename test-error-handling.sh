#!/bin/bash

# Manual Error Handling Tests
# This script simulates error scenarios to test the implemented error handling

echo "=== Manual Error Handling Tests ==="
echo ""

# Test 1: Missing required fields
echo "Test 1: Testing missing required fields..."
curl -X POST http://localhost:3006/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello","userId":"test"}' \
  2>/dev/null | jq .

echo ""

# Test 2: Empty prompt validation
echo "Test 2: Testing empty prompt validation..."
curl -X POST http://localhost:3006/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"","userId":"test","sessionId":"test","therapyMode":"CBT","sessionType":"individual"}' \
  2>/dev/null | jq .

echo ""

# Test 3: Session routes validation
echo "Test 3: Testing session routes validation..."
curl -X POST http://localhost:3006/session/getAllSessions \
  -H "Content-Type: application/json" \
  -d '{}' \
  2>/dev/null | jq .

echo ""

# Test 4: User routes validation
echo "Test 4: Testing user routes validation..."
curl -X POST http://localhost:3006/user/updateUserField \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","value":"test"}' \
  2>/dev/null | jq .

echo ""

# Test 5: Audio routes validation
echo "Test 5: Testing audio routes validation..."
curl -X POST http://localhost:3006/audio/transcript \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","sessionId":"test","role":"invalid"}' \
  2>/dev/null | jq .

echo ""
echo "=== Manual tests completed ==="