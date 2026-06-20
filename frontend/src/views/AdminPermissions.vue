<template>
  <div>
    <el-card style="margin-bottom: 16px">
      <div class="card-title" style="font-size: 16px; font-weight: bold">管理员权限配置（仅超级管理员可见）</div>
      <div style="color: #606266; font-size: 13px">选择一名管理员，为其配置各模块权限和数据范围。</div>
    </el-card>

    <el-card>
      <el-select v-model="selectedAdmin" placeholder="选择管理员" style="width: 280px" @change="loadPermissions">
        <el-option v-for="u in admins" :key="u.id" :label="u.real_name + ' (' + u.username + ')'" :value="u.id" />
      </el-select>

      <div v-if="selectedAdmin" style="margin-top: 24px">
        <el-divider content-position="left">模块权限</el-divider>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px">
          <div v-for="(label, key) in moduleLabels" :key="key" style="padding: 10px; background: #fafafa; border: 1px solid #eee; border-radius: 6px">
            <el-checkbox v-model="permissions[key]" :label="true">{{ label }}</el-checkbox>
          </div>
        </div>

        <el-divider content-position="left">数据范围</el-divider>
        <el-radio-group v-model="dataScope.scope_type">
          <el-radio value="all">全部客户（可查看所有业务员的客户）</el-radio>
          <el-radio value="assigned">指定业务员的客户</el-radio>
          <el-radio value="self">仅自己（无下属客户）</el-radio>
        </el-radio-group>
        <div v-if="dataScope.scope_type === 'assigned'" style="margin-top: 12px">
          <el-select v-model="assignedIds" multiple placeholder="选择可查看的业务员" style="width: 100%">
            <el-option v-for="u in salespersons" :key="u.id" :label="u.real_name + ' (' + u.username + ')'" :value="u.id" />
          </el-select>
        </div>

        <div style="margin-top: 20px">
          <el-button type="primary" :loading="saving" @click="save">保存权限配置</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const admins = ref([]);
const salespersons = ref([]);
const selectedAdmin = ref(null);
const permissions = ref({});
const dataScope = ref({ scope_type: 'self', assigned_user_ids: [] });
const assignedIds = ref([]);
const saving = ref(false);

const moduleLabels = {
  'customer:view': '客户 - 查看',
  'customer:edit': '客户 - 编辑',
  'customer:delete': '客户 - 删除',
  'visit:view': '拜访 - 查看',
  'visit:edit': '拜访 - 编辑',
  'map:view': '地图 - 查看',
  'map:draw': '地图 - 画圈筛选',
  'calendar:view': '日历 - 查看',
  'import:excel': '批量导入 Excel',
  'export:data': '数据导出 + 分析报告',
  'dashboard:view': '绩效看板',
  'pool:manage': '客户公海池管理',
  'user:manage': '业务员用户管理',
  'health:auto': '客户健康度管理'
};

async function loadAdmins() {
  try {
    const res = await axios.get('/auth/users');
    admins.value = (res.data.users || []).filter((u) => u.role === 'admin');
  } catch {
    ElMessage.error('加载管理员列表失败');
  }
}

async function loadSalespersons() {
  try {
    const res = await axios.get('/auth/salespersons');
    salespersons.value = res.data.users || [];
  } catch {
    ElMessage.error('加载业务员列表失败');
  }
}

async function loadPermissions() {
  if (!selectedAdmin.value) return;
  try {
    const res = await axios.get(`/auth/admins/${selectedAdmin.value}/permissions`);
    permissions.value = res.data.permissions || {};
    dataScope.value = res.data.dataScope || { scope_type: 'self', assigned_user_ids: [] };
    assignedIds.value = dataScope.value.assigned_user_ids || [];
    Object.keys(moduleLabels).forEach((k) => {
      if (!(k in permissions.value)) permissions.value[k] = false;
    });
  } catch {
    ElMessage.error('加载权限配置失败');
  }
}

async function save() {
  saving.value = true;
  try {
    await axios.put(`/auth/admins/${selectedAdmin.value}/permissions`, {
      permissions: permissions.value,
      dataScope: {
        scope_type: dataScope.value.scope_type,
        assigned_user_ids: assignedIds.value
      }
    });
    ElMessage.success('权限配置已保存');
  } catch {} finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadAdmins();
  loadSalespersons();
});
</script>
