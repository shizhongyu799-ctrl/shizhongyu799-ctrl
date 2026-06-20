<template>
  <el-card style="max-width: 600px">
    <div class="card-title" style="font-size: 16px; font-weight: bold; margin-bottom: 16px">个人信息</div>
    <el-descriptions :column="1" border>
      <el-descriptions-item label="账号">{{ auth.user?.username }}</el-descriptions-item>
      <el-descriptions-item label="姓名">{{ auth.user?.real_name }}</el-descriptions-item>
      <el-descriptions-item label="角色">{{ roleLabel }}</el-descriptions-item>
    </el-descriptions>

    <el-divider content-position="left">修改密码</el-divider>
    <el-form :model="form" label-width="100px" style="max-width: 420px">
      <el-form-item label="旧密码">
        <el-input v-model="form.oldPassword" type="password" show-password />
      </el-form-item>
      <el-form-item label="新密码">
        <el-input v-model="form.newPassword" type="password" show-password />
      </el-form-item>
      <el-form-item label="确认">
        <el-input v-model="form.confirmPassword" type="password" show-password />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="changePassword">修改密码</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '../store/auth';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const auth = useAuthStore();
const form = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });

const roleLabel = computed(() => {
  const map = { super_admin: '超级管理员', admin: '管理员', salesperson: '业务员' };
  return map[auth.user?.role] || auth.user?.role;
});

async function changePassword() {
  if (!form.value.oldPassword || !form.value.newPassword) {
    ElMessage.warning('请填写旧密码和新密码');
    return;
  }
  if (form.value.newPassword !== form.value.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }
  if (form.value.newPassword.length < 6) {
    ElMessage.warning('新密码至少 6 位');
    return;
  }
  try {
    await axios.post('/auth/change-password', {
      oldPassword: form.value.oldPassword,
      newPassword: form.value.newPassword
    });
    ElMessage.success('密码修改成功');
    form.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
  } catch {}
}
</script>
