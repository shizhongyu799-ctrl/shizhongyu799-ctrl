<template>
  <div>
    <el-card shadow="never">
      <el-table :data="visits" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="客户" min-width="180">
          <template #default="{ row }">{{ row.company_name }}</template>
        </el-table-column>
        <el-table-column label="方式" width="90">
          <template #default="{ row }">
            <el-tag :type="row.visit_type === 'onsite' ? 'primary' : 'success'" size="small">
              {{ row.visit_type === 'onsite' ? '上门' : '电话' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="resultTagType(row.result)" size="small">
              {{ resultLabel(row.result) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
        <el-table-column label="下次跟进" width="120">
          <template #default="{ row }">{{ row.next_follow_up || '-' }}</template>
        </el-table-column>
        <el-table-column label="GPS" width="200" v-if="!isSalesperson">
          <template #default="{ row }">
            <span v-if="row.gps_lat && row.gps_lng">{{ formatCoord(row.gps_lat) }}, {{ formatCoord(row.gps_lng) }}</span>
            <span v-else style="color: #909399">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="salesperson_name" label="业务员" width="100" />
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ String(row.visit_time).slice(0, 16) }}</template>
        </el-table-column>
      </el-table>
      <div style="margin-top: 12px; text-align: right">
        <el-pagination
          :total="total"
          :current-page="page"
          :page-size="pageSize"
          @current-change="(p) => { page = p; load() }"
          layout="total, prev, pager, next, jumper"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from '../api/axios';
import { useAuthStore } from '../store/auth';
import { ElMessage } from 'element-plus';

const auth = useAuthStore();

const visits = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);

const isSalesperson = computed(() => auth.isSalesperson);

function resultLabel(r) {
  return { deal: '成交', follow_up: '继续跟进', no_interest: '无意向' }[r] || r;
}
function resultTagType(r) {
  return { deal: 'success', follow_up: 'warning', no_interest: 'info' }[r] || '';
}

function formatCoord(v) {
  const n = parseFloat(v);
  return isNaN(n) ? String(v).slice(0, 7) : n.toFixed(4);
}

async function load() {
  try {
    const res = await axios.get('/visits/my', { params: { page: page.value, pageSize: pageSize.value } });
    visits.value = res.data.visits || [];
    total.value = res.data.total || 0;
  } catch {
    ElMessage.error('加载拜访记录失败');
  }
}

onMounted(() => load());
</script>
