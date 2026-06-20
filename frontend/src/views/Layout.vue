<template>
  <el-container class="layout-root">
    <!-- 侧边栏 -->
    <el-aside class="layout-aside">
      <div class="brand">
        <div class="brand-icon">
          <el-icon><Location /></el-icon>
        </div>
        <div class="brand-text">
          <div class="brand-title">客户地图系统</div>
          <div class="brand-sub">Customer Map Platform</div>
        </div>
      </div>

      <el-menu
        :default-active="activeMenu"
        class="side-menu"
        router
      >
        <el-menu-item index="/map">
          <el-icon><Location /></el-icon>
          <span>客户地图</span>
        </el-menu-item>
        <el-menu-item index="/customers">
          <el-icon><UserFilled /></el-icon>
          <span>客户管理</span>
        </el-menu-item>
        <el-menu-item index="/visits">
          <el-icon><Notebook /></el-icon>
          <span>拜访记录</span>
        </el-menu-item>
        <el-menu-item index="/calendar">
          <el-icon><Calendar /></el-icon>
          <span>跟进日历</span>
        </el-menu-item>
        <el-menu-item v-if="canPool" index="/pool">
          <el-icon><Share /></el-icon>
          <span>客户公海池</span>
        </el-menu-item>
        <el-menu-item v-if="canDashboard" index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>绩效看板</span>
        </el-menu-item>
        <el-menu-item v-if="canImport" index="/import">
          <el-icon><UploadFilled /></el-icon>
          <span>批量导入</span>
        </el-menu-item>
        <el-menu-item v-if="canExport" index="/export">
          <el-icon><Download /></el-icon>
          <span>数据导出</span>
        </el-menu-item>
        <el-menu-item v-if="canUserManage" index="/users">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item v-if="canUserManage" index="/operation-logs">
          <el-icon><Document /></el-icon>
          <span>操作日志</span>
        </el-menu-item>
        <el-menu-item v-if="isSuperAdmin" index="/admin-permissions">
          <el-icon><Key /></el-icon>
          <span>管理员权限</span>
        </el-menu-item>
        <el-menu-item index="/profile">
          <el-icon><Setting /></el-icon>
          <span>个人中心</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="layout-main">
      <!-- 顶部导航 -->
      <el-header class="layout-header">
        <div class="header-left">
          <div class="page-title">{{ currentTitle }}</div>
          <div v-if="bannerItems.length > 0" class="page-banner">
            <el-icon style="color: #f59e0b"><Warning /></el-icon>
            <span>{{ bannerItems.length }} 位客户即将需要跟进</span>
            <el-tag
              v-for="(b, idx) in bannerItems.slice(0, 3)"
              :key="idx"
              size="small"
              effect="light"
              type="warning"
              class="banner-tag"
            >{{ b.company_name }}</el-tag>
          </div>
        </div>
        <div class="header-right">
          <el-dropdown trigger="click" @click.stop>
            <div class="notice-btn" :class="{ 'has-unread': unreadCount > 0 }">
              <el-icon><Bell /></el-icon>
              <el-badge v-if="unreadCount > 0" :value="unreadCount" class="notice-badge" />
            </div>
            <template #dropdown>
              <el-dropdown-menu class="notice-dropdown">
                <el-dropdown-item disabled class="notice-header">
                  <span>最新提醒</span>
                  <el-link type="primary" :underline="false" @click.stop="readAll">全部已读</el-link>
                </el-dropdown-item>
                <el-dropdown-item
                  v-for="r in reminderList.slice(0, 6)"
                  :key="r.id"
                  class="notice-item"
                >
                  <div class="notice-title" :style="{ fontWeight: r.is_read ? '400' : '600' }">{{ r.title }}</div>
                  <div class="notice-meta">{{ r.company_name || '' }} · {{ formatDate(r.trigger_date) }}</div>
                </el-dropdown-item>
                <el-dropdown-item v-if="reminderList.length === 0" disabled>
                  <span style="color: #94a3b8">暂无提醒</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <div class="user-block">
            <div class="user-avatar">{{ firstChar }}</div>
            <div class="user-info">
              <div class="user-name">{{ auth.user?.real_name }}</div>
              <div class="user-role">{{ roleLabel }}</div>
            </div>
            <el-button size="small" plain @click="logout" class="logout-btn">
              <el-icon><SwitchButton /></el-icon>退出
            </el-button>
          </div>
        </div>
      </el-header>

      <el-main class="layout-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import axios from '../api/axios';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const activeMenu = computed(() => route.path);
const currentTitle = computed(() => route.meta.title || '');
const reminderList = ref([]);
const unreadCount = ref(0);
const bannerItems = ref([]);

const isSuperAdmin = computed(() => auth.isSuperAdmin);
const canPool = computed(() => auth.hasPermission('pool:manage'));
const canDashboard = computed(() => auth.hasPermission('dashboard:view'));
const canImport = computed(() => auth.hasPermission('import:excel'));
const canExport = computed(() => auth.hasPermission('export:data'));
const canUserManage = computed(() => isSuperAdmin.value || auth.hasPermission('user:manage'));

const roleLabel = computed(() => auth.roleLabel);
const firstChar = computed(() => auth.user?.real_name?.[0] || 'U');

function formatDate(d) {
  if (!d) return '';
  return String(d).slice(0, 10);
}

async function loadReminders() {
  try {
    const res = await axios.get('/reminders/my?unread=false&limit=10');
    reminderList.value = res.data.reminders || [];
    unreadCount.value = res.data.unreadCount || 0;
  } catch {}
}

async function loadBanner() {
  try {
    const res = await axios.get('/reminders/banner');
    bannerItems.value = res.data.items || [];
  } catch {}
}

function readAll() {
  axios.post('/reminders/read-all').then(() => loadReminders());
}

function logout() {
  auth.logout();
  router.push('/login');
}

onMounted(() => {
  loadReminders();
  loadBanner();
});
</script>

<style>
/* ===== Layout 全局样式 ===== */
.layout-root {
  height: 100vh;
  background: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

/* 侧边栏 */
.layout-aside {
  width: 232px !important;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 2px 0 8px -2px rgba(0, 0, 0, 0.02);
}

.brand {
  padding: 20px 20px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #f1f5f9;
}

.brand-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 0 4px 12px -2px rgba(59, 130, 246, 0.35);
}

.brand-text { display: flex; flex-direction: column; line-height: 1.25; }

.brand-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.3px;
}

.brand-sub {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
  letter-spacing: 0.2px;
}

/* 菜单覆盖 Element Plus 默认样式 */
.side-menu {
  border-right: none !important;
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}

.side-menu .el-menu-item {
  height: 42px;
  line-height: 42px;
  border-radius: 8px;
  margin-bottom: 2px;
  font-size: 14px;
  color: #475569;
  font-weight: 500;
  padding: 0 14px !important;
}

.side-menu .el-menu-item .el-icon {
  color: #94a3b8;
  font-size: 16px;
  margin-right: 10px;
}

.side-menu .el-menu-item:hover {
  background: #f1f5f9;
  color: #1e40af;
}

.side-menu .el-menu-item:hover .el-icon { color: #3b82f6; }

.side-menu .el-menu-item.is-active {
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  color: #1d4ed8;
  font-weight: 600;
}

.side-menu .el-menu-item.is-active .el-icon { color: #2563eb; }

.side-menu .el-menu-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  background: #2563eb;
  border-radius: 0 2px 2px 0;
}

/* 主内容区 */
.layout-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部 Header */
.layout-header {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  height: 60px !important;
  padding: 0 24px !important;
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 3px -1px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
  flex: 1;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.page-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef3c7;
  color: #92400e;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}

.banner-tag {
  background: #fff !important;
  border-color: #fde68a !important;
  color: #92400e !important;
}

/* 右侧操作区 */
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.notice-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  color: #64748b;
  transition: all 0.15s ease;
}

.notice-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
}

.notice-badge { --el-badge-bg-color: #ef4444; }

.notice-dropdown { min-width: 320px; padding: 6px; }

.notice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px !important;
  font-weight: 600;
  color: #0f172a;
  font-size: 13px;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 4px;
}

.notice-item {
  padding: 10px 12px !important;
  border-radius: 6px;
  line-height: 1.35 !important;
}

.notice-item:hover { background: #f8fafc; }

.notice-title {
  font-size: 13px;
  color: #334155;
  margin-bottom: 4px;
  line-height: 1.4;
}

.notice-meta {
  font-size: 12px;
  color: #94a3b8;
}

/* 用户信息 */
.user-block {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 16px;
  border-left: 1px solid #e2e8f0;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.25);
}

.user-info { display: flex; flex-direction: column; line-height: 1.3; }

.user-name {
  font-size: 13.5px;
  font-weight: 600;
  color: #0f172a;
}

.user-role {
  font-size: 11.5px;
  color: #64748b;
  margin-top: 1px;
}

.logout-btn {
  border-color: #e2e8f0;
  color: #475569;
}

.logout-btn:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

/* 内容区 */
.layout-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px !important;
  background: #f1f5f9;
}

.layout-content::-webkit-scrollbar { width: 8px; }
.layout-content::-webkit-scrollbar-track { background: transparent; }
.layout-content::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.layout-content::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* 页面切换动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
