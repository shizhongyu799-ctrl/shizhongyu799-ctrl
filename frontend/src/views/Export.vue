<template>
  <div>
    <el-card style="margin-bottom: 16px">
      <div class="card-title">生成月度数据 + 智能分析报告</div>
      <div style="margin-bottom: 12px; color: #606266">系统将同步生成 Excel 数据文件与智能分析报告（含客户状态分布、业务员绩效、拜访结果分布等），可直接下载。</div>
      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
        <el-date-picker v-model="monthPicker" type="month" placeholder="选择月份" />
        <el-select v-model="scopeType" placeholder="范围" style="width: 140px">
          <el-option label="全部客户" value="all" />
          <el-option label="指定业务员" value="salesperson" />
        </el-select>
        <el-select v-if="scopeType === 'salesperson'" v-model="scopeValue" placeholder="选择业务员" style="width: 180px">
          <el-option v-for="u in salespersons" :key="u.id" :label="u.real_name" :value="u.id" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="doExport">
          <el-icon><Download /></el-icon> 导出并生成报告
        </el-button>
        <el-button @click="loadReports">刷新报告列表</el-button>
      </div>
    </el-card>

    <el-card>
      <div class="card-title">历史报告（可重新下载）</div>
      <el-table :data="reports" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="month" label="月份" width="120" />
        <el-table-column prop="scope_type" label="范围" width="120" />
        <el-table-column prop="user_name" label="生成人" width="120" />
        <el-table-column prop="created_at" label="生成时间" width="180">
          <template #default="{ row }">{{ String(row.created_at).slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="download(row.id)">下载 Excel</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const monthPicker = ref(new Date());
const scopeType = ref('all');
const scopeValue = ref(null);
const loading = ref(false);
const reports = ref([]);
const salespersons = ref([]);

async function loadSalespersons() {
  try {
    const res = await axios.get('/auth/salespersons');
    salespersons.value = res.data.users || [];
  } catch {
    ElMessage.error('加载业务员列表失败');
  }
}

async function loadReports() {
  try {
    const res = await axios.get('/admin/reports');
    reports.value = res.data.reports || [];
  } catch {
    ElMessage.error('加载报告列表失败');
  }
}

async function doExport() {
  const d = monthPicker.value || new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  loading.value = true;
  try {
    const res = await axios.post('/admin/export', {
      year, month,
      scopeType: scopeType.value,
      scopeValue: scopeType.value === 'salesperson' ? scopeValue.value : null
    }, { responseType: 'blob' });
    const blobData = res.data;
    if (blobData && blobData.type && blobData.type.includes('application/json')) {
      const text = await blobData.text();
      const err = JSON.parse(text);
      ElMessage.error('导出失败：' + (err.error || '未知错误'));
      return;
    }
    const url = window.URL.createObjectURL(new Blob([blobData]));
    const link = document.createElement('a');
    link.href = url;
    const fileName = `report_${year}-${String(month).padStart(2, '0')}_${Date.now()}.xlsx`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    ElMessage.success('报告生成成功');
    loadReports();
  } catch {
    ElMessage.error('导出失败，请检查后端服务');
  } finally {
    loading.value = false;
  }
}

function download(id) {
  axios.get(`/admin/reports/${id}/download`, { responseType: 'blob' })
    .then((res) => {
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${id}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    })
    .catch(() => {
      ElMessage.error('下载失败');
    });
}

onMounted(() => {
  loadSalespersons();
  loadReports();
});
</script>
