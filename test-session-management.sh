#!/bin/bash

# Session Management Manual Test Script
# This script demonstrates the new session management functionality

echo "=== Session Management Test ==="

BASE_URL="http://localhost:3006"

echo "1. Testing session creation..."
RESPONSE=$(curl -s -X POST "$BASE_URL/session/createSession" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test_user_123"}')

echo "Response: $RESPONSE"

# Extract sessionId from response (assuming JSON format)
SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
echo "Generated Session ID: $SESSION_ID"

echo -e "\n2. Testing session validation..."
curl -s -X POST "$BASE_URL/session/validateSession" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"test_user_123\", \"sessionId\": \"$SESSION_ID\"}"

echo -e "\n\n3. Testing invalid session ID..."
curl -s -X POST "$BASE_URL/session/validateSession" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test_user_123", "sessionId": "invalid-session!"}'

echo -e "\n\n4. Testing session cleanup..."
curl -s -X POST "$BASE_URL/session/cleanupSessions" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test_user_123", "maxAge": 1}'

echo -e "\n\n5. Testing session history (with date range)..."
curl -s -X POST "$BASE_URL/session/getAllSessions" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test_user_123", "startDate": "2024-01-01", "endDate": "2024-12-31"}'

echo -e "\n\n=== Session Management Test Complete ==="