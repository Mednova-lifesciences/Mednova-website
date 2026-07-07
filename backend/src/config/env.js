import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const {
  GOOGLE_SCRIPT_URL,
  RESEND_API_KEY,
  FROM_EMAIL,
  CONSULTATION_EMAIL,
  ANTHROPIC_API_KEY,
  FRONTEND_URL,
  API_BASE_URL,
  PORT
} = process.env;
