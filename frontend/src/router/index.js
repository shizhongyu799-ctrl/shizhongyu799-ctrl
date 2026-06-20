import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { ElMessage } from 'element-plus';

const routes = [
  { path: '/login', component: () => import('../views/Login.vue') },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    children: [
      { path: '', redirect: '/map' },
      { path: 'map', component: () => import('../views/MapView.vue'), meta: { title: '客户地图' } },
      { path: 'customers', component: () => import('../views/CustomerList.vue'), meta: { title: '客户管理' } },
      { path: 'visits', component: () => import('../views/VisitList.vue'), meta: { title: '拜访记录' } },
      { path: 'calendar', component: () => import('../views/CalendarView.vue'), meta: { title: '跟进日历' } },
      { path: 'pool', component: () => import('../views/PoolView.vue'), meta: { title: '客户公海池' } },
      { path: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '绩效看板' } },
      { path: 'export', component: () => import('../views/Export.vue'), meta: { title: '数据导出' } },
      { path: 'import', component: () => import('../views/Import.vue'), meta: { title: '批量导入' } },
      { path: 'users', component: () => import('../views/UserList.vue'), meta: { title: '用户管理' } },
      { path: 'operation-logs', component: () => import('../views/OperationLogs.vue'), meta: { title: '操作日志' } },
      { path: 'admin-permissions', component: () => import('../views/AdminPermissions.vue'), meta: { title: '管理员权限配置' } },
      { path: 'profile', component: () => import('../views/Profile.vue'), meta: { title: '个人中心' } }
    ]
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// 路由权限映射
const routePermissions = {
  'pool': 'pool:manage',
  'dashboard': 'dashboard:view',
  'export': 'export:data',
  'import': 'import:excel',
  'users': 'user:manage',
  'admin-permissions': 'user:admin'
};

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.path !== '/login' && !auth.token) {
    return '/login';
  }
  if (to.path === '/login' && auth.token) {
    return '/';
  }
  // 权限检查
  const path = to.path.replace('/', '');
  const requiredPerm = routePermissions[path];
  if (requiredPerm && !auth.hasPermission(requiredPerm)) {
    ElMessage.error('无权访问该页面');
    return '/map';
  }
});

export default router;
