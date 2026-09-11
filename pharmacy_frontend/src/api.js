import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const managerId = localStorage.getItem('manager_id');
  if (managerId) {
    config.headers['X-Manager-Id'] = managerId;
  }
  return config;
});

export default api;