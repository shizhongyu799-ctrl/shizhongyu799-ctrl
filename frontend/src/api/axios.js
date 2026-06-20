import axiosBase from 'axios';
import { ElMessage } from 'element-plus';

const axios = axiosBase.create({
  baseURL: '/api',
  timeout: 30000
});

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('cm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.error || err.message || '请求失败';

    // 网络错误（后端未启动/无法连接）
    if (!err.response) {
      ElMessage.error('无法连接后端服务，请确保后端已启动（端口 3000）');
    } else if (status === 401) {
      if (location.hash !== '#/login') {
        localStorage.clear();
        ElMessage.error('登录已失效，请重新登录');
        location.hash = '#/login';
      }
    } else if (status === 403) {
      ElMessage.error('无权限访问该资源');
    } else if (status >= 500) {
      ElMessage.error('服务器错误：' + msg);
    } else {
      ElMessage.error(msg);
    }
    return Promise.reject(err);
  }
);

export default axios;
