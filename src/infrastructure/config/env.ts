export interface Env {
  DATABASE_URL: string;
  PUBLIC_BOT_TOKEN: string;
  ADMIN_BOT_TOKEN: string;
  PUBLIC_BOT_WEBHOOK_SECRET: string;
  ADMIN_BOT_WEBHOOK_SECRET: string;
  REQUIRED_CHANNEL_ID: string;
  ENVIRONMENT: string;
  R2_BUCKET_NAME?: string;
  R2_BUCKET?: R2Bucket;
}
