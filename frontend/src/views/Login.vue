<template>
  <div class="login-page">
    <div class="login-bg-grid"></div>
    <div class="login-bg-circle circle-1"></div>
    <div class="login-bg-circle circle-2"></div>

    <div class="login-card-wrap">
      <div class="login-brand">
        <div class="brand-logo">
          <el-icon :size="36"><Location /></el-icon>
        </div>
        <div class="brand-title">销售客户地图管理系统</div>
        <div class="brand-subtitle">
          基于地理分布的客户关系与拜访管理平台
        </div>
        <div class="brand-features">
          <div class="feature-item">
            <el-icon><Location /></el-icon>
            <span>地图化客户分布一目了然</span>
          </div>
          <div class="feature-item">
            <el-icon><Edit /></el-icon>
            <span>销售拜访记录与跟进提醒</span>
          </div>
          <div class="feature-item">
            <el-icon><UserFilled /></el-icon>
            <span>多角色权限管理体系</span>
          </div>
        </div>
      </div>

      <div class="login-form-card">
        <div class="form-header">
          <div class="form-title">欢迎回来</div>
          <div class="form-subtitle">请输入您的账号与密码继续</div>
        </div>

        <el-form :model="form" @submit.prevent="submit" class="form-body">
          <el-form-item>
            <div class="input-label">账号</div>
            <el-input
              v-model="form.username"
              placeholder="请输入账号"
              autocomplete="username"
              size="large"
              class="input-field"
            >
              <template #prefix>
                <el-icon style="color: #64748b"><UserFilled /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item>
            <div class="input-label">密码</div>
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              show-password
              autocomplete="current-password"
              size="large"
              class="input-field"
              @keyup.enter="submit"
            >
              <template #prefix>
                <el-icon style="color: #64748b"><Lock /></el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item style="margin-bottom: 8px">
            <el-button
              type="primary"
              size="large"
              class="submit-btn"
              :loading="loading"
              @click="submit"
            >
              <span v-if="!loading">登 录</span>
              <span v-else>登录中…</span>
            </el-button>
          </el-form-item>
        </el-form>

        <div class="form-footer">
          <div class="hint-row">
            <el-icon :size="13" style="color: #64748b"><InfoFilled /></el-icon>
            <span>默认超级管理员账号：admin / admin123456</span>
          </div>
        </div>
      </div>
    </div>

    <div class="login-copyright">
      © 2024 销售客户地图管理系统 · 基于 Vue 3 + Element Plus 构建
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  Location,
  Edit,
  UserFilled,
  Lock,
  InfoFilled
} from '@element-plus/icons-vue';
import { useAuthStore } from '../store/auth';

const form = ref({ username: 'admin', password: '' });
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function submit() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    await auth.login(form.value.username, form.value.password);
    ElMessage.success('登录成功');
    router.push('/');
  } catch (err) {
    const msg = err?.response?.data?.error || err?.message || '登录失败，请重试';
    ElMessage.error(msg);
  } finally {
    loading.value = false;
  }
}
</script>

<style>
/* ========== 全局布局 ========== */
.login-page {
  position: relative;
  min-height: 100vh;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    linear-gradient(135deg, #eff6ff 0%, #dbeafe 45%, #e0e7ff 100%);
}

.login-bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(59, 130, 246, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  pointer-events: none;
}

.login-bg-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.35;
  pointer-events: none;
}

.circle-1 {
  width: 420px;
  height: 420px;
  background: #3b82f6;
  top: -120px;
  left: -120px;
}

.circle-2 {
  width: 520px;
  height: 520px;
  background: #6366f1;
  bottom: -180px;
  right: -180px;
}

/* ========== 主卡片容器 ========== */
.login-card-wrap {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  width: 100%;
  max-width: 920px;
  background: #ffffff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow:
    0 20px 50px -20px rgba(30, 64, 175, 0.25),
    0 10px 30px -15px rgba(30, 64, 175, 0.15),
    0 0 0 1px rgba(59, 130, 246, 0.08);
}

/* ========== 左侧品牌区 ========== */
.login-brand {
  position: relative;
  padding: 48px 44px;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.login-brand::before {
  content: '';
  position: absolute;
  right: -100px;
  bottom: -100px;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}

.brand-logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin-bottom: 28px;
}

.brand-logo .el-icon {
  color: #ffffff;
}

.brand-title {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.brand-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
  margin-bottom: 36px;
}

.brand-features {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 500;
}

.feature-item .el-icon {
  font-size: 16px;
  padding: 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.15);
}

/* ========== 右侧表单区 ========== */
.login-form-card {
  padding: 52px 48px 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.form-header {
  margin-bottom: 32px;
  text-align: left;
}

.form-title {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 8px;
}

.form-subtitle {
  font-size: 14px;
  color: #64748b;
}

.form-body {
  margin-bottom: 20px;
}

.input-label {
  font-size: 13px;
  color: #334155;
  font-weight: 500;
  margin-bottom: 8px;
  margin-left: 2px;
}

.input-field .el-input__wrapper {
  padding: 12px 14px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px #e2e8f0;
  transition: all 0.2s ease;
  background: #f8fafc;
}

.input-field .el-input__wrapper:hover {
  box-shadow: 0 0 0 1px #cbd5e1;
  background: #ffffff;
}

.input-field .el-input__wrapper.is-focus {
  box-shadow: 0 0 0 2px #3b82f6 !important;
  background: #ffffff;
}

.input-field .el-input__inner {
  font-size: 14.5px;
}

.submit-btn {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 4px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  box-shadow: 0 6px 16px -4px rgba(37, 99, 235, 0.45);
  border: none;
  margin-top: 8px;
}

.submit-btn:hover {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  transform: translateY(-1px);
  box-shadow: 0 10px 20px -6px rgba(37, 99, 235, 0.55);
}

.submit-btn:active {
  transform: translateY(0);
}

.form-footer {
  margin-top: 4px;
}

.hint-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px dashed #e2e8f0;
  font-size: 12.5px;
  color: #475569;
}

/* ========== 页脚 ========== */
.login-copyright {
  position: relative;
  z-index: 2;
  margin-top: 24px;
  font-size: 12.5px;
  color: #64748b;
}

/* ========== 响应式 ========== */
@media (max-width: 780px) {
  .login-card-wrap {
    grid-template-columns: 1fr;
    max-width: 460px;
  }
  .login-brand {
    padding: 36px 32px 32px;
    text-align: center;
  }
  .login-brand::before { display: none; }
  .brand-logo { margin: 0 auto 20px; }
  .login-form-card {
    padding: 36px 32px;
  }
  .form-header { text-align: center; }
}
</style>
