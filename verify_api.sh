#!/bin/bash

# Configuration
API_URL="http://localhost:5000"
EMAIL="test_investor@example.com"
PASSWORD="password123"
FULL_NAME="Test Investor"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "----------------------------------------------------------------"
echo "Starting Investment API Verification"
echo "----------------------------------------------------------------"

# 1. Register User (Ignore error if exists)
echo -e "\n1. Registering User..."
curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"full_name\": \"$FULL_NAME\"}" > /dev/null

# 2. Login to get Session Cookie
echo -e "\n2. Logging in..."
# We need to handle the OTP flow or just use a direct login if available for testing.
# The current auth flow requires OTP.
# For this automated test, I'll try to use the login endpoint and see if I can bypass or if I need to sim OTP.
# Wait! existing /auth/login sends OTP. /auth/verify-email-otp logs in.
# I need to get the OTP from the DB to verify.

# Trigger OTP
curl -s -c cookies.txt -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}" > /dev/null

# Get OTP from DB using helper script
OTP=$(node --import tsx get_otp.js "$EMAIL")

echo "Got OTP: $OTP"

# Verify OTP and Get Session
curl -s -c cookies.txt -X POST "$API_URL/auth/verify-email-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"otp\": \"$OTP\"}" > login_response.json

cat login_response.json

# 3. Create Investment (Corporate)
echo -e "\n\n3. Creating Corporate Investment..."
curl -s -b cookies.txt -X POST "$API_URL/api/investments" \
  -H "Content-Type: application/json" \
  -d '{
    "investment_type": "NOLT_RISE",
    "company_name": "Test Corp Ltd",
    "company_address": "123 Corp Way",
    "date_of_incorporation": "2020-01-01",
    "directors_are_pep": false,
    "rep_full_name": "John Doe",
    "rep_phone_number": "08012345678",
    "rep_bvn": "12345678901",
    "rep_nin": "12345678901",
    "rep_state_of_origin": "Lagos",
    "rep_state_of_residence": "Abuja",
    "rep_house_number": "10",
    "rep_street_address": "Main Street",
    "investment_amount": 100000,
    "tenure_days": 90,
    "currency": "NGN",
    "cac_url": "http://example.com/cac.pdf",
    "rep_selfie_url": "http://example.com/selfie.jpg",
    "rep_id_url": "http://example.com/id.jpg"
  }' > investment_response.json

cat investment_response.json

# Check Success
if grep -q "customer_id" investment_response.json; then
  echo -e "\n${GREEN}Investment Creation Successful!${NC}"
else
  echo -e "\n${RED}Investment Creation Failed!${NC}"
  cat investment_response.json
  exit 1
fi

# 4. Get User Investments
echo -e "\n\n4. Fetching User Investments..."
curl -s -b cookies.txt "$API_URL/api/investments" > list_response.json
cat list_response.json

echo -e "\n\n${GREEN}Verification Completed.${NC}"
