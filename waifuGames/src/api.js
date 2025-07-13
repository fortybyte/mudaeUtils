import axios from 'axios';
import io from 'socket.io-client';

const API_BASE_URL = 'http://localhost:3001/api';
export const socket = io('http://localhost:3001');

export const api = {
  socket, // Export socket for use in other components
  getInstances: async () => {
    const response = await axios.get(`${API_BASE_URL}/instances`);
    return response.data;
  },

  createInstance: async (instanceData) => {
    const response = await axios.post(`${API_BASE_URL}/instances`, instanceData);
    return response.data;
  },

  pauseInstance: async (id) => {
    const response = await axios.post(`${API_BASE_URL}/instances/${id}/pause`);
    return response.data;
  },

  resumeInstance: async (id) => {
    const response = await axios.post(`${API_BASE_URL}/instances/${id}/resume`);
    return response.data;
  },

  terminateInstance: async (id) => {
    const response = await axios.post(`${API_BASE_URL}/instances/${id}/terminate`);
    return response.data;
  },

  deleteInstance: async (id) => {
    const response = await axios.delete(`${API_BASE_URL}/instances/${id}`);
    return response.data;
  },

  getInstanceLogs: async (id) => {
    const response = await axios.get(`${API_BASE_URL}/instances/${id}/logs`);
    return response.data;
  },

  clearInstanceLogs: async (id) => {
    const response = await axios.post(`${API_BASE_URL}/instances/${id}/logs/clear`);
    return response.data;
  },

  subscribeLogs: (instanceId, callback) => {
    socket.emit('subscribe-logs', instanceId);
    socket.on(`logs-${instanceId}`, callback);
  },

  unsubscribeLogs: (instanceId) => {
    socket.emit('unsubscribe-logs', instanceId);
    socket.off(`logs-${instanceId}`);
  },

  getInstanceStats: async (id) => {
    const response = await axios.get(`${API_BASE_URL}/instances/${id}/stats`);
    return response.data;
  },

  subscribeStats: (instanceId, callback) => {
    socket.emit('subscribe-stats', instanceId);
    socket.on(`stats-${instanceId}`, callback);
  },

  unsubscribeStats: (instanceId) => {
    socket.emit('unsubscribe-stats', instanceId);
    socket.off(`stats-${instanceId}`);
  },

  subscribeUserInfo: (instanceId, callback) => {
    socket.emit('subscribe-userInfo', instanceId);
    socket.on(`userInfo-${instanceId}`, callback);
  },

  unsubscribeUserInfo: (instanceId) => {
    socket.emit('unsubscribe-userInfo', instanceId);
    socket.off(`userInfo-${instanceId}`);
  },

  subscribeAvatarUrl: (instanceId, callback) => {
    socket.on(`avatarUrl-${instanceId}`, (url) => {
      callback(`http://localhost:3001${url}`);
    });
  },

  unsubscribeAvatarUrl: (instanceId) => {
    socket.off(`avatarUrl-${instanceId}`);
  },

  sendMessage: async (id, message) => {
    const response = await axios.post(`${API_BASE_URL}/instances/${id}/message`, { message });
    return response.data;
  },

  updateLogging: async (id, enabled) => {
    const response = await axios.post(`${API_BASE_URL}/instances/${id}/logging`, { enabled });
    return response.data;
  },

  updateRollsPerHour: async (id, rollsPerHour) => {
    const response = await axios.post(`${API_BASE_URL}/instances/${id}/rollsPerHour`, { rollsPerHour });
    return response.data;
  },

  createBackup: async () => {
    const response = await axios.get(`${API_BASE_URL}/backup`);
    return response.data;
  },

  restoreBackup: async (backupData) => {
    const response = await axios.post(`${API_BASE_URL}/restore`, backupData);
    return response.data;
  }
};