import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Attach the bearer token issued at login (see sessions#create). This token
// is an opaque, server-generated secret - unlike the old X-Manager-Id
// header, it can't be guessed or set to someone else's value to impersonate
// them, because the backend only trusts it after matching it against a
// stored digest.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

export default api;