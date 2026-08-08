/**
 * `services/api`'s CORS default (`server.ts`) matches Vite's own default
 * dev port (5173) in the other direction — the two defaults are meant to
 * work together out of the box for local dev. A real deployment sets
 * `VITE_API_BASE_URL` instead of relying on either default.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
