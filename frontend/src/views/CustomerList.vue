<template>
  <div class="customer-page">
    <!-- 顶部工具栏卡片 -->
    <div class="panel-card toolbar-card">
      <div class="toolbar-main">
        <div class="toolbar-group">
          <el-input
            v-model="searchKey"
            placeholder="搜索公司 / 联系人 / 电话"
            clearable
            class="input-search"
            @input="onSearchInput"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>

          <el-select
            v-model="filterStatus"
            placeholder="客户状态"
            clearable
            class="select-mini"
            @change="load"
          >
            <el-option label="意向客户" value="intent" />
            <el-option label="已合作客户" value="cooperated" />
            <el-option label="流失客户" value="lost" />
          </el-select>

          <el-select
            v-model="filterHealth"
            placeholder="健康度"
            clearable
            class="select-mini"
            @change="load"
          >
            <el-option label="正常" value="normal" />
            <el-option label="待跟进" value="warning" />
          </el-select>
        </div>

        <div class="toolbar-divider"></div>

        <div class="toolbar-group">
          <el-button type="primary" @click="customerVisible = true" v-if="canEdit">
            <el-icon><Plus /></el-icon>新增客户
          </el-button>

          <el-button
            type="warning"
            @click="moveSelectedToPool"
            v-if="canPool && selectedIds.length > 0"
          >
            <el-icon><Share /></el-icon>批量移至公海池 ({{ selectedIds.length }})
          </el-button>

          <el-button @click="load" plain>
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
      </div>
    </div>

    <!-- 统计条 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">总客户数</div>
        <div class="stat-value">{{ total }}</div>
      </div>
      <div class="stat-card stat-coop">
        <div class="stat-label">已合作</div>
        <div class="stat-value">{{ statusCounts.cooperated }}</div>
      </div>
      <div class="stat-card stat-intent">
        <div class="stat-label">意向客户</div>
        <div class="stat-value">{{ statusCounts.intent }}</div>
      </div>
      <div class="stat-card stat-warning">
        <div class="stat-label">待跟进</div>
        <div class="stat-value">{{ statusCounts.warning }}</div>
      </div>
    </div>

    <!-- 数据表格卡片 -->
    <div class="panel-card table-card">
      <el-table
        :data="customers"
        stripe
        style="width: 100%"
        class="customer-table"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="52" v-if="canPool" />
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column label="公司名称" min-width="180">
          <template #default="{ row }">
            <div class="cell-company">
              <div class="company-name">{{ row.company_name }}</div>
              <div class="company-contact" v-if="row.contact || row.phone">
                <el-icon style="font-size: 11px"><UserFilled /></el-icon>
                {{ row.contact || '-' }}
                <span v-if="row.phone" class="sep">·</span>
                {{ row.phone || '' }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="地址" min-width="240">
          <template #default="{ row }">
            <el-tooltip :content="row.address" placement="top" :disabled="!row.address">
              <span class="cell-address">{{ row.address || '-' }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="108" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light" round size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="健康度" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.health_status === 'warning' ? 'danger' : 'success'"
              effect="plain"
              round
              size="small"
            >
              {{ row.health_status === 'warning' ? '待跟进' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="归属" width="110" align="center" v-if="canPool">
          <template #default="{ row }">
            <el-tag :type="row.is_in_pool ? 'info' : 'success'" effect="plain" round size="small">
              {{ row.is_in_pool ? '公海池' : (row.salesperson_name || '私有') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="salesperson_name" label="业务员" width="110" align="center" v-if="!canPool" />
        <el-table-column label="操作" width="320" align="center" fixed="right">
          <template #default="{ row }">
            <div class="action-cell">
              <el-button size="small" plain @click="viewVisits(row)">
                <el-icon><Notebook /></el-icon>拜访
              </el-button>
              <el-button size="small" type="primary" plain v-if="canEdit" @click="edit(row)">
                <el-icon><Edit /></el-icon>编辑
              </el-button>
              <el-button
                size="small"
                type="warning"
                plain
                v-if="canPool && !row.is_in_pool"
                @click="moveToPool(row)"
              >
                <el-icon><Share /></el-icon>公海
              </el-button>
              <el-button size="small" type="danger" plain v-if="canDelete" @click="del(row)">
                <el-icon><Delete /></el-icon>删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <div class="pagination-hint">
          当前共 <b>{{ customers.length }}</b> 条 / 总计 <b>{{ total }}</b> 条
        </div>
        <el-pagination
          :total="total"
          :current-page="page"
          :page-size="pageSize"
          @current-change="onPageChange"
          @size-change="onSizeChange"
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[10, 20, 50, 100]"
          background
        />
      </div>
    </div>

    <!-- 编辑/新增客户对话框（内嵌 CustomerForm 自带） -->
    <CustomerForm
      v-model="customerVisible"
      :editing-id="editingId"
      :initial-data="editingData"
      :show-coords="!!editingId"
      @saved="onCustomerSaved"
    />

    <VisitDialog
      v-model="visitVisible"
      :customer-id="currentVisitCustomerId"
      :customer-name="currentVisitCustomerName"
      @saved="load"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import axios from '../api/axios';
import { useAuthStore } from '../store/auth';
import { ElMessage } from 'element-plus';
import {
  Search,
  Plus,
  Share,
  Refresh,
  UserFilled,
  Notebook,
  Edit,
  Delete
} from '@element-plus/icons-vue';
import VisitDialog from '../components/VisitDialog.vue';
import CustomerForm from '../components/CustomerForm.vue';

const auth = useAuthStore();

const customers = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const searchKey = ref('');
const filterStatus = ref('');
const filterHealth = ref('');
const selectedIds = ref([]);

const customerVisible = ref(false);
const editingId = ref(null);
const editingData = ref(null);

const visitVisible = ref(false);
const currentVisitCustomerId = ref(null);
const currentVisitCustomerName = ref('');

const canEdit = computed(() => auth.hasPermission('customer:edit'));
const canDelete = computed(() => auth.hasPermission('customer:delete'));
const canPool = computed(() => auth.isSuperAdmin || auth.hasPermission('pool:manage'));

// 状态分类计数（基于当前页数据的简单展示）
const statusCounts = computed(() => {
  const all = customers.value || [];
  return {
    cooperated: all.filter((c) => c.status === 'cooperated').length,
    intent: all.filter((c) => c.status === 'intent').length,
    warning: all.filter((c) => c.health_status === 'warning').length
  };
});

let searchTimer = null;
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 280);
}

function onPageChange(p) { page.value = p; load(); }
function onSizeChange(s) { pageSize.value = s; page.value = 1; load(); }
function onSelectionChange(rows) { selectedIds.value = rows.map((c) => c.id); }

function statusLabel(s) {
  return { intent: '意向客户', cooperated: '已合作', lost: '流失' }[s] || (s || '未知');
}
function statusTagType(s) {
  return { intent: 'warning', cooperated: 'success', lost: 'info' }[s] || '';
}

async function load() {
  const params = { page: page.value, pageSize: pageSize.value };
  if (searchKey.value) params.search = searchKey.value;
  if (filterStatus.value) params.status = filterStatus.value;
  if (filterHealth.value) params.healthStatus = filterHealth.value;
  try {
    const res = await axios.get('/customers', { params });
    customers.value = res.data.customers || [];
    total.value = res.data.total || 0;
  } catch (err) {
    console.warn(err);
  }
}

function edit(row) {
  editingId.value = row.id;
  editingData.value = row;
  customerVisible.value = true;
}

function del(row) {
  if (!confirm(`确定删除「${row.company_name}」？此操作不可撤销`)) return;
  axios.delete(`/customers/${row.id}`).then(() => {
    ElMessage.success('删除成功');
    load();
  }).catch((e) => {
    ElMessage.error(e?.response?.data?.error || '删除失败');
  });
}

function moveToPool(row) {
  if (!confirm(`确定将「${row.company_name}」移至公海池？`)) return;
  axios.post('/customers/pool/move', { customerIds: [row.id] }).then(() => {
    ElMessage.success('已移至公海池');
    load();
  }).catch((e) => {
    ElMessage.error(e?.response?.data?.error || '操作失败');
  });
}

function moveSelectedToPool() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先选择要移动的客户');
    return;
  }
  if (!confirm(`确定将选中的 ${selectedIds.value.length} 个客户移至公海池？`)) return;
  axios.post('/customers/pool/move', { customerIds: selectedIds.value }).then(() => {
    ElMessage.success('已批量移至公海池');
    selectedIds.value = [];
    load();
  }).catch((e) => {
    ElMessage.error(e?.response?.data?.error || '操作失败');
  });
}

function viewVisits(row) {
  currentVisitCustomerId.value = row.id;
  currentVisitCustomerName.value = row.company_name;
  visitVisible.value = true;
}

function onCustomerSaved() {
  editingId.value = null;
  editingData.value = null;
  customerVisible.value = false;
  load();
}

onMounted(() => { load(); });
</script>

<style>
/* ========== 客户页面全局样式 ========== */
.customer-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.04),
    0 1px 2px rgba(15, 23, 42, 0.03);
  border: 1px solid #e2e8f0;
  padding: 18px 20px;
}

/* ---------- 顶部工具卡 ---------- */
.toolbar-card { display: flex; flex-direction: column; gap: 12px; padding: 16px 20px; }

.toolbar-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #e2e8f0;
  flex-shrink: 0;
}

.input-search { width: 280px; }

.select-mini { width: 130px; }

/* ---------- 统计卡 ---------- */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.stat-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.stat-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: #3b82f6;
}

.stat-coop::before { background: #10b981; }
.stat-intent::before { background: #f59e0b; }
.stat-warning::before { background: #ef4444; }

.stat-label {
  font-size: 12.5px;
  color: #64748b;
  font-weight: 500;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
}

/* ---------- 表格卡 ---------- */
.table-card { padding: 0; overflow: hidden; }

.customer-table {
  border-radius: 12px;
  font-size: 13.5px;
}

.customer-table .el-table__header {
  background: #f8fafc;
}

.customer-table .el-table__header th {
  color: #475569;
  font-weight: 600;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.customer-table .el-table__body tr {
  transition: background 0.15s ease;
}

.customer-table .el-table__body tr:hover > td {
  background: #f8fafc !important;
}

.customer-table .el-table td {
  color: #334155;
  border-bottom: 1px solid #f1f5f9;
}

.customer-table .el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell {
  background: #f8fafc;
}

.cell-company {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.company-name {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.3;
}

.company-contact {
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
}

.company-contact .sep {
  color: #cbd5e1;
  margin: 0 2px;
}

.cell-address {
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.action-cell .el-button {
  padding-left: 10px;
  padding-right: 10px;
}

/* ---------- 分页 ---------- */
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
}

.pagination-hint {
  font-size: 13px;
  color: #475569;
}

.pagination-hint b {
  color: #2563eb;
  font-weight: 600;
}

/* ---------- 统一按钮圆角 ---------- */
.customer-page .el-button {
  border-radius: 8px;
  font-weight: 500;
}

/* ---------- 响应式 ---------- */
@media (max-width: 900px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .input-search { width: 100%; min-width: 200px; flex: 1; }
}
</style>
