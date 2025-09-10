#!/usr/bin/env node

/**
 * Test script for Magic Auth SMS/WhatsApp functionality
 *
 * Usage:
 * node test-magic-auth.js sms +1234567890
 * node test-magic-auth.js whatsapp +1234567890
 * node test-magic-auth.js email test@example.com
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:1337';
const STORE_ID = process.env.STORE_ID || 1;

async function testMagicAuth(channel, contact) {
  try {
    console.log(`🧪 Testing ${channel.toUpperCase()} magic auth for: ${contact}`);

    // Prepare request data
    const requestData = {
      store: STORE_ID,
      channel: channel
    };

    // Add appropriate contact field
    if (channel === 'email') {
      requestData.email = contact;
    } else {
      requestData.phone = contact;
    }

    // Send magic auth request
    const response = await axios.post(`${BASE_URL}/api/auth-magic/request`, requestData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ Magic auth request sent successfully:');
    console.log('📄 Response:', response.data);

    if (response.data.ok) {
      console.log(`\n🔗 Check your ${channel} for the magic link!`);

      if (channel !== 'email') {
        console.log('\n📱 To test verification, use:');
        console.log(`curl -X POST ${BASE_URL}/api/auth-magic/verify -H "Content-Type: application/json" -d '{"code": "YOUR_6_DIGIT_CODE"}'`);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Parse command line arguments
const [,, channel, contact] = process.argv;

if (!channel || !contact) {
  console.log(`
🧪 Magic Auth Test Script

Usage:
  node test-magic-auth.js <channel> <contact>

Examples:
  node test-magic-auth.js sms +1234567890
  node test-magic-auth.js whatsapp +1234567890
  node test-magic-auth.js email test@example.com

Environment Variables:
  API_URL=${BASE_URL} (default: http://localhost:1337)
  STORE_ID=${STORE_ID} (default: 1)
`);
  process.exit(1);
}

if (!['sms', 'whatsapp', 'email'].includes(channel)) {
  console.error('❌ Invalid channel. Use: sms, whatsapp, or email');
  process.exit(1);
}

// Run the test
testMagicAuth(channel, contact);
