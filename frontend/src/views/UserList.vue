<template>
  <div>
    <el-card style="margin-bottom: 16px">
      <div style="display: flex; gap: 12px">
        <el-button type="primary" @click="openNew('salesperson')" v-if="canManage">
          <el-icon><Plus /></el-icon> 新增业务员
        </el-button>
        <el-button type="success" @click="openNew('admin')" v-if="isSuperAdmin">
          <el-icon><UserFilled /></el-icon> 新增管理员
        </el-button>
        <el-button @click="load">刷新</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table :data="users" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" label="账号" width="140" />
        <el-table-column prop="real_name" label="姓名" width="120" />
        <el-table-column label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)">{{ roleLabel(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="电话" width="140" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.is_locked ? 'danger' : 'success'" size="small">
              {{ row.is_locked ? '锁定' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建者ID" width="100" />
        <el-table-column label="最后登录" width="170">
          <template #default="{ row }">{{ row.last_login_at ? String(row.last_login_at).slice(0, 16) : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="340">
          <template #default="{ row }">
            <el-button size="small" @click="editUser(row)">编辑</el-button>
            <el-button size="small" type="info" @click="resetPwd(row)" v-if="row.role !== 'super_admin'">重置密码</el-button>
            <el-button size="small" :type="row.is_locked ? 'success' : 'warning'" @click="toggleLock(row)" v-if="row.role !== 'super_admin' || isSuperAdmin">
              {{ row.is_locked ? '解锁' : '锁定' }}
            </el-button>
            <el-button size="small" type="danger" @click="delUser(row)" v-if="isSuperAdmin && row.role !== 'super_admin'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="userVisible" :title="editingId ? '编辑用户' : '新增用户'" width="460px">
      <el-form :model="form" label-width="100px">
        <el-form-item v-if="!editingId" label="账号" required>
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item v-if="!editingId" label="初始密码" required>
          <el-input v-model="form.password" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item v-if="!editingId" label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option label="业务员" value="salesperson" />
            <el-option label="管理员" value="admin" v-if="isSuperAdmin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userVisible = false">取消</el-button>
        <el-button type="primary" @click="saveUser">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '../store/auth';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const auth = useAuthStore();

const users = ref([]);
const userVisible = ref(false);
const editingId = ref(null);
const form = ref({ username: '', password: '', realName: '', phone: '', role: 'salesperson' });

const isSuperAdmin = computed(() => auth.isSuperAdmin);
const canManage = computed(() => isSuperAdmin.value || auth.hasPermission('user:manage'));

function roleLabel(r) {
  return { super_admin: '超级管理员', admin: '管理员', salesperson: '业务员' }[r] || r;
}
function roleTagType(r) {
  return { super_admin: 'danger', admin: 'warning', salesperson: 'success' }[r] || '';
}

async function load() {
  try {
    const res = await axios.get('/auth/users');
    users.value = res.data.users || [];
  } catch {
    ElMessage.error('加载用户列表失败');
  }
}

function openNew(role) {
  editingId.value = null;
  form.value = { username: '', password: '', realName: '', phone: '', role };
  userVisible.value = true;
}

function editUser(row) {
  editingId.value = row.id;
  form.value = {
    username: row.username, password: '',
    realName: row.real_name || '', phone: row.phone || '',
    role: row.role
  };
  userVisible.value = true;
}

async function saveUser() {
  if (!editingId.value && (!form.value.username || !form.value.password)) {
    ElMessage.warning('请填写账号和密码');
    return;
  }
  try {
    if (editingId.value) {
      await axios.put(`/auth/users/${editingId.value}`, form.value);
      ElMessage.success('更新成功');
    } else {
      await axios.post('/auth/users', form.value);
      ElMessage.success('创建成功');
    }
    userVisible.value = false;
    load();
  } catch {}
}

async function toggleLock(row) {
  const action = row.is_locked ? '解锁' : '锁定';
  if (!confirm(`确定${action}该用户？`)) return;
  try {
    await axios.put(`/auth/users/${row.id}`, { isLocked: !row.is_locked });
    ElMessage.success(action + '成功');
    load();
  } catch {}
}

async function delUser(row) {
  if (!confirm('确定删除该用户？其名下客户将被移入公海池')) return;
  try {
    await axios.delete(`/auth/users/${row.id}`);
    ElMessage.success('删除成功');
    load();
  } catch {}
}

async function resetPwd(row) {
  const newPwd = prompt(`请输入新密码（重置用户 ${row.username} 的密码）：`);
  if (!newPwd || newPwd.length < 6) {
    if (newPwd !== null) ElMessage.warning('密码长度至少6位');
    return;
  }
  try {
    await axios.put(`/auth/users/${row.id}`, { password: newPwd });
    ElMessage.success(`已将 ${row.username} 的密码重置为新密码`);
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '重置失败');
  }
}

onMounted(() => load());
</script>
