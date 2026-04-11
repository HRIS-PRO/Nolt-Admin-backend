import axios from 'axios';

const urls = [
  'https://noltfinance.s3.us-east-1.amazonaws.com/logo+updated.png',
  'https://noltfinance.s3.us-east-1.amazonaws.com/logo.png',
  'https://noltfinance.s3.us-east-1.amazonaws.com/logo+dark.png',
  'https://noltfinance.s3.us-east-1.amazonaws.com/logo_updated.png',
  'https://noltfinance.s3.us-east-1.amazonaws.com/logo%20updated.png',
  'https://noltfinance.s3.us-east-1.amazonaws.com/logo%20updated%20black.png',
  'https://noltfinance.s3.us-east-1.amazonaws.com/logo+updated+white.png'
];

async function check() {
  for (const url of urls) {
    try {
      const res = await axios.head(url);
      console.log(`MATCH: ${url} - Status: ${res.status}`);
    } catch (e) {
      // console.log(`FAIL: ${url}`);
    }
  }
}

check();
