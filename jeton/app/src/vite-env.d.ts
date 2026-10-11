/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'real'
  readonly VITE_API_BASE?: string
  readonly VITE_NFC?: 'auto' | 'mock'
}
interface ImportMeta { readonly env: ImportMetaEnv }
