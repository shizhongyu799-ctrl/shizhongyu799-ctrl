<template>
  <div>
    <el-card style="margin-bottom: 16px">
      <div style="display: flex; gap: 12px; align-items: center">
        <el-button type="primary" @click="assignVisible = true" :disabled="selectedIds.length === 0">
          分配给业务员（已选 {{ selectedIds.length }}）
        </el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table :data="customers" border stripe @selection-change="(v) => selectedIds = v.map((c) => c.id)">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="company_name" label="公司名称" min-width="160" />
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="140" />
        <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="assignVisible" title="分配给业务员" width="420px">
      <el-form label-width="100px">
        <el-form-item label="业务员">
          <el-select v-model="assignTo" placeholder="请选择业务员" style="width: 100%">
            <el-option v-for="u in salespersons" :key="u.id" :label="u.real_name + ' (' + u.username + ')'" :value="u.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" @click="doAssign">确认分配</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const customers = ref([]);
const selectedIds = ref([]);
const assignVisible = ref(false);
const assignTo = ref(null);
const salespersons = ref([]);

function statusLabel(s) {
  return { intent: '意向客户', cooperated: '已合作', lost: '流失' }[s] || s;
}
function statusTagType(s) {
  return { intent: 'warning', cooperated: 'success', lost: 'info' }[s] || '';
}

async function load() {
  try {
    const res = await axios.get('/customers/pool/list');
    customers.value = res.data.customers || [];
  } catch {
    ElMessage.error('加载公海池失败');
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

async function doAssign() {
  if (!assignTo.value) {
    ElMessage.warning('请选择业务员');
    return;
  }
  try {
    await axios.post('/customers/pool/assign', {
      customerIds: selectedIds.value,
      salespersonId: assignTo.value
    });
    ElMessage.success('分配成功');
    assignVisible.value = false;
    selectedIds.value = [];
    load();
  } catch {}
}

onMounted(() => {
  load();
  loadSalespersons();
});
</script>
