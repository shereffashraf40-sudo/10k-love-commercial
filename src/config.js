import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT || '3000', 10),
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  adminPassword: required('ADMIN_PASSWORD'),
  trustProxy: process.env.TRUST_PROXY === '1'
};
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT is invalid');
if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
if (config.adminPassword.length < 16) throw new Error('ADMIN_PASSWORD must be at least 16 characters');
