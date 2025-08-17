// src/api/api.ts
import API_BASE_URL from './apiconfig';

export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('vs_token');

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    (headers as any)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('vs_token');
    localStorage.removeItem('vs_refresh');
    localStorage.removeItem('vs_user');
    window.location.href = '/login';
    // You might want to throw an error here or handle it in a way that stops further execution
    throw new Error('Session expired');
  }

  return response;
};
