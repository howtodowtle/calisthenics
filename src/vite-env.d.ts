/// <reference types="vite/client" />

/** Build-time constants injected by `define` in vite.config.ts. */
declare const __COMMIT__: string // short GITHUB_SHA; '' outside CI builds
declare const __BUILT_AT__: string // build date, yyyy-mm-dd
