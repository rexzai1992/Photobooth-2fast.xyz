/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_PUBLIC_URL?: string;
  readonly VITE_R2_PUBLIC_URL?: string;
  readonly VITE_VIDEO_ENCODER_MODE?: string;
  readonly VITE_VIDEO_ENCODER_URL?: string;
  readonly VITE_VIDEO_ENCODER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare const __BUILD_ID__: string;
