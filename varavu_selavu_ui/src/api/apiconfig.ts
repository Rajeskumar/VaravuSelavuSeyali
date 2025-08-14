// src/api/apiconfig.ts

const isDev = process.env.NODE_ENV === 'development';
// In development, always default to local backend to avoid accidentally using prod.
// In production builds, rely on REACT_APP_API_BASE_URL provided at build time.
const API_BASE_URL = isDev
  ? (process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080')
  : (process.env.REACT_APP_API_BASE_URL || '');

export default API_BASE_URL;
