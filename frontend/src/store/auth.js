import { defineStore } from 'pinia';
import axios from '../api/axios';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('cm_token') || '',
    user: JSON.parse(localStorage.getItem('cm_user') || 'null'),
    permissions: JSON.parse(localStorage.getItem('cm_permissions') || 'null'),
    dataScope: JSON.parse(localStorage.getItem('cm_dataScope') || 'null')
  }),
  getters: {
    isSuperAdmin: (state) => state.user?.role === 'super_admin',
    isAdmin: (state) => state.user?.role === 'admin',
    isSalesperson: (state) => state.user?.role === 'salesperson',
    roleLabel: (state) => {
      const map = { super_admin: '超级管理员', admin: '管理员', salesperson: '业务员' };
      return map[state.user?.role] || state.user?.role;
    }
  },
  actions: {
    async login(username, password) {
      const res = await axios.post('/auth/login', { username, password });
      this.token = res.data.token;
      this.user = res.data.user;
      this.permissions = res.data.permissions;
      this.dataScope = res.data.dataScope;
      localStorage.setItem('cm_token', this.token);
      localStorage.setItem('cm_user', JSON.stringify(this.user));
      if (res.data.permissions) localStorage.setItem('cm_permissions', JSON.stringify(res.data.permissions));
      if (res.data.dataScope) localStorage.setItem('cm_dataScope', JSON.stringify(res.data.dataScope));
      return res.data;
    },
    logout() {
      this.token = '';
      this.user = null;
      this.permissions = null;
      this.dataScope = null;
      localStorage.clear();
    },
    hasPermission(moduleKey) {
      if (this.isSuperAdmin) return true;
      if (this.isSalesperson) {
        const basic = ['customer:view', 'customer:edit', 'visit:view', 'visit:edit', 'map:view', 'map:draw', 'calendar:view'];
        return basic.includes(moduleKey);
      }
      if (this.isAdmin && this.permissions) {
        return !!this.permissions[moduleKey];
      }
      return false;
    }
  }
});
