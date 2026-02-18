
import { zeptoService } from './services/zeptoService.js';
import dotenv from 'dotenv';

dotenv.config();

const TEST_EMAIL = 'divineobinali9@gmail.com';

async function testZepto() {
    console.log(`Sending test email to ${TEST_EMAIL}...`);
    try {
        const result = await zeptoService.sendEmailToken(TEST_EMAIL, '123456');
        console.log('Email sent successfully:', result);
    } catch (error) {
        console.error('Failed to send email:', error);
    }
}

testZepto();
