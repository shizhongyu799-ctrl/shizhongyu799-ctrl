<template>
  <div>
    <el-card style="margin-bottom: 16px">
      <div style="display: flex; align-items: center; gap: 12px">
        <el-date-picker
          v-model="monthPicker"
          type="month"
          placeholder="选择月份"
          @change="load"
        />
        <el-button @click="load">刷新</el-button>
      </div>
    </el-card>

    <el-row :gutter="16" style="margin-bottom: 16px">
      <el-col :span="6">
        <el-card shadow="hover">
          <div style="text-align: center">
            <div style="font-size: 13px; color: #909399">客户总数</div>
            <div style="font-size: 28px; font-weight: bold; margin: 8px 0">{{ global?.total_customers || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div style="text-align: center">
            <div style="font-size: 13px; color: #f59e0b">意向客户</div>
            <div style="font-size: 28px; font-weight: bold; margin: 8px 0">{{ global?.intent_count || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div style="text-align: center">
            <div style="font-size: 13px; color: #10b981">已合作客户</div>
            <div style="font-size: 28px; font-weight: bold; margin: 8px 0">{{ global?.cooperated_count || 0 }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div style="text-align: center">
            <div style="font-size: 13px; color: #ef4444">需跟进客户</div>
            <div style="font-size: 28px; font-weight: bold; margin: 8px 0">{{ global?.health_warning_count || 0 }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card style="margin-bottom: 16px">
      <div class="card-title">各业务员月度绩效</div>
      <el-table :data="salespersonStats" border stripe>
        <el-table-column prop="real_name" label="业务员" width="120" />
        <el-table-column prop="total_visits" label="总拜访" width="100" sortable />
        <el-table-column prop="onsite_visits" label="上门拜访" width="100" />
        <el-table-column prop="phone_visits" label="电话拜访" width="100" />
        <el-table-column prop="new_customers" label="新增客户" width="100" sortable />
        <el-table-column prop="deal_count" label="成交数" width="100" sortable />
        <el-table-column label="健康度异常" width="110">
          <template #default="{ row }">
            <el-tag :type="row.warning_count > 0 ? 'danger' : 'success'" size="small">
              {{ row.warning_count || 0 }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card>
      <div class="card-title">拜访结果分布</div>
      <el-table :data="resultDistribution" border stripe style="max-width: 500px">
        <el-table-column prop="result" label="结果" width="120">
          <template #default="{ row }">{{ resultLabel(row.result) }}</template>
        </el-table-column>
        <el-table-column prop="count" label="数量" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const monthPicker = ref(new Date());
const salespersonStats = ref([]);
const global = ref({});
const resultDistribution = ref([]);

function resultLabel(r) {
  return { deal: '成交', follow_up: '继续跟进', no_interest: '无意向' }[r] || r;
}

async function load() {
  const d = monthPicker.value || new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  try {
    const res = await axios.get('/admin/dashboard', { params: { year, month } });
    salespersonStats.value = res.data.salespersonStats || [];
    global.value = res.data.global || {};
    resultDistribution.value = res.data.resultDistribution || [];
  } catch {
    ElMessage.error('加载绩效数据失败');
  }
}

onMounted(() => load());
</script>
