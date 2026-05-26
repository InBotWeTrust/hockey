/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEGRAM_BOT_USERNAME: string;
  readonly VITE_VK_APP_ID: string;
  readonly VITE_DEV_ACCESS_CODE_LOGIN_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
