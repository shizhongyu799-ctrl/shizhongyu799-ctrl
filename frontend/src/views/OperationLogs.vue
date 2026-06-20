<template>
  <div>
    <el-card style="margin-bottom: 16px">
      <el-form :inline="true" :model="filters">
        <el-form-item label="操作类型">
          <el-select v-model="filters.action" clearable placeholder="全部" style="width: 150px">
            <el-option v-for="a in actionTypes" :key="a.key" :label="a.label" :value="a.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户">
          <el-input v-model="filters.keyword" placeholder="用户名/详情搜索" clearable style="width: 180px" />
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期"
            end-placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 240px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="load(1)">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="success" @click="exportLogs">导出日志</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="logs" v-loading="loading" stripe border>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" label="操作用户" width="120">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.username || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="actionLabel" label="操作类型" width="130">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" size="small">{{ row.actionLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="target_name" label="操作对象" min-width="180">
          <template #default="{ row }">
            <div>{{ row.target_name || '-' }}</div>
            <div v-if="row.target_type" style="font-size: 12px; color: #999;">类型: {{ row.target_type }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="操作详情" min-width="280">
          <template #default="{ row }">
            <span style="word-break: break-all;">{{ row.detail || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip_address" label="IP地址" width="130" />
        <el-table-column prop="created_at" label="操作时间" width="170">
          <template #default="{ row }">
            {{ row.created_at ? formatTime(row.created_at) : '-' }}
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; text-align: right;">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="load(1)"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const logs = ref([]);
const loading = ref(false);
const actionTypes = ref([]);

const filters = reactive({
  action: '',
  keyword: ''
});

const dateRange = ref([]);
const pagination = reactive({
  page: 1,
  pageSize: 50,
  total: 0
});

function actionTagType(action) {
  const map = {
    'login': 'success',
    'logout': 'info',
    'customer_create': 'primary',
    'customer_update': 'warning',
    'customer_delete': 'danger',
    'customer_export': 'success',
    'customer_assign': 'primary',
    'customer_pool_move': 'warning',
    'visit_create': 'primary',
    'report_export': 'success',
    'user_create': 'primary',
    'user_update': 'warning',
    'user_delete': 'danger',
    'user_reset_pwd': 'warning',
    'user_lock': 'danger',
    'user_unlock': 'success'
  };
  return map[action] || '';
}

function formatTime(time) {
  if (!time) return '-';
  const d = new Date(time);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function load(page = pagination.page) {
  loading.value = true;
  pagination.page = page;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize
    };
    if (filters.action) params.action = filters.action;
    if (filters.keyword) params.keyword = filters.keyword;
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }

    const res = await axios.get('/logs/logs', { params });
    logs.value = res.data.logs || [];
    pagination.total = res.data.total || 0;
  } catch (e) {
    ElMessage.error('加载日志失败');
  } finally {
    loading.value = false;
  }
}

async function loadActions() {
  try {
    const res = await axios.get('/logs/logs/actions');
    actionTypes.value = res.data.actions || [];
  } catch {}
}

function resetFilters() {
  filters.action = '';
  filters.keyword = '';
  dateRange.value = [];
  load(1);
}

async function exportLogs() {
  try {
    const params = {};
    if (filters.action) params.action = filters.action;
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }

    const res = await axios.get('/logs/logs/export', { params });
    const data = res.data.logs || [];

    // 生成CSV
    const headers = ['用户名', '操作类型', '操作对象', '详情', 'IP地址', '时间'];
    const rows = data.map(log => [
      log.username || '',
      log.actionLabel || '',
      log.target_name || '',
      (log.detail || '').replace(/"/g, '""'),
      log.ip_address || '',
      log.created_at
    ]);

    let csv = '\uFEFF'; // BOM for Excel
    csv += headers.join(',') + '\n';
    for (const row of rows) {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `操作日志_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    ElMessage.success(`已导出 ${data.length} 条日志`);
  } catch (e) {
    ElMessage.error('导出失败');
  }
}

onMounted(() => {
  load();
  loadActions();
});
</script>
