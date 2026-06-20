<template>
  <div class="calendar-page">
    <el-card class="calendar-toolbar">
      <div class="toolbar-inner">
        <el-button round @click="changeMonth(-1)">&lt; 上一月</el-button>
        <span class="current-month">{{ year }} 年 {{ month }} 月</span>
        <el-button round @click="changeMonth(1)">下一月 &gt;</el-button>
        <el-button round plain @click="goToday">今天</el-button>
        <span class="count-label">共 {{ totalCount }} 条待跟进</span>
      </div>
    </el-card>

    <el-card shadow="never" class="calendar-card">
      <el-calendar v-model="currentDate" ref="calendarRef">
        <template #date-cell="{ data }">
          <div class="date-cell">
            <div class="date-cell__head">
              <span
                class="date-cell__num"
                :class="{
                  'is-current-month': data.type === 'current-month',
                  'is-today': isToday(data.day)
                }"
              >{{ data.day.split('-').slice(2).join('') }}</span>
              <span v-if="countByDay(data.day) > 0" class="date-cell__badge">{{ countByDay(data.day) }}</span>
            </div>

            <div class="date-cell__items">
              <div
                v-for="(item, idx) in visibleItems(data.day)"
                :key="item.visit_id || idx"
                class="date-cell__item"
                :title="item.company_name"
              >
                <span class="dot"></span>
                <span class="item-name">{{ item.company_name }}</span>
              </div>

              <div
                v-if="countByDay(data.day) > MAX_VISIBLE"
                class="date-cell__more"
                @click="openDay(data.day)"
              >
                +{{ countByDay(data.day) - MAX_VISIBLE }} 更多
              </div>
            </div>
          </div>
        </template>
      </el-calendar>
    </el-card>

    <!-- 当日详情弹窗 -->
    <el-dialog
      v-model="dayDialog.visible"
      :title="dayDialog.title"
      width="560px"
      :close-on-click-modal="true"
      destroy-on-close
    >
      <div v-if="dayDialog.items.length === 0" class="empty-day">
        <el-empty description="该日暂无待跟进客户" :image-size="100" />
      </div>
      <div v-else class="day-detail">
        <div
          v-for="item in dayDialog.items"
          :key="item.visit_id"
          class="day-detail__item"
        >
          <div class="day-detail__main">
            <div class="day-detail__company">{{ item.company_name }}</div>
            <div class="day-detail__meta">
              <span v-if="item.contact">联系人：{{ item.contact }}</span>
              <span v-if="item.phone">电话：{{ item.phone }}</span>
            </div>
          </div>
          <div v-if="item.salesperson_name" class="day-detail__sales">
            {{ item.salesperson_name }}
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const MAX_VISIBLE = 2;

const currentDate = ref(new Date());
const items = ref([]);

const year = computed(() => currentDate.value.getFullYear());
const month = computed(() => currentDate.value.getMonth() + 1);
const totalCount = computed(() => items.value.length);

// 按日期分组缓存，避免同一天多次 filter
const dayCache = ref({});
const dayCacheKey = computed(() =>
  `${year.value}-${month.value}-${items.value.length}`
);

function itemsByDate(dayStr) {
  if (dayCache.value.__key !== dayCacheKey.value) {
    dayCache.value = { __key: dayCacheKey.value };
  }
  if (!(dayStr in dayCache.value)) {
    dayCache.value[dayStr] = items.value.filter(
      (i) => String(i.date).slice(0, 10) === dayStr
    );
  }
  return dayCache.value[dayStr];
}

function countByDay(dayStr) {
  return itemsByDate(dayStr).length;
}

function visibleItems(dayStr) {
  return itemsByDate(dayStr).slice(0, MAX_VISIBLE);
}

function isToday(dayStr) {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return dayStr === today;
}

const dayDialog = ref({
  visible: false,
  title: '',
  items: []
});

function openDay(dayStr) {
  const list = itemsByDate(dayStr);
  dayDialog.value = {
    visible: true,
    title: `${dayStr} 待跟进客户（共 ${list.length} 条）`,
    items: list
  };
}

async function load() {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth() + 1;
  try {
    const res = await axios.get('/visits/calendar', { params: { year: y, month: m } });
    items.value = res.data.items || [];
    dayCache.value = {};
  } catch {
    ElMessage.error('加载日历数据失败');
  }
}

function changeMonth(delta) {
  const d = new Date(currentDate.value);
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  currentDate.value = d;
  load();
}

function goToday() {
  currentDate.value = new Date();
  load();
}

onMounted(() => load());
</script>

<style scoped>
.calendar-page {
  padding: 4px;
}

.calendar-toolbar {
  margin-bottom: 16px;
  border-radius: 8px;
}

.toolbar-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.current-month {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.count-label {
  margin-left: auto;
  font-size: 13px;
  color: #6b7280;
}

.calendar-card {
  border-radius: 8px;
}

/* 覆盖 Element Plus 日历单元格默认样式 */
:deep(.el-calendar__body) {
  padding: 8px;
}

:deep(.el-calendar-table thead th) {
  padding: 6px 0;
  color: #6b7280;
  font-weight: 500;
  font-size: 13px;
  background: #f9fafb;
}

:deep(.el-calendar__cell) {
  padding: 0;
}

:deep(.el-calendar-table .el-calendar-day) {
  height: 110px;
  padding: 0;
  border: 1px solid #f0f2f5;
  transition: background 0.15s ease;
}

:deep(.el-calendar-table .el-calendar-day:hover) {
  background: #f5f9ff;
}

:deep(.el-calendar-table.is-selected > td > .el-calendar-day) {
  background: transparent;
}

/* 单元格内部结构 */
.date-cell {
  width: 100%;
  height: 100%;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.date-cell__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.date-cell__num {
  font-size: 13px;
  font-weight: 600;
  color: #c0c4cc;
}

.date-cell__num.is-current-month {
  color: #1f2937;
}

.date-cell__num.is-today {
  background: #409eff;
  color: #fff;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.date-cell__badge {
  background: #ecf5ff;
  color: #409eff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.date-cell__items {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
  flex: 1;
}

.date-cell__item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  background: linear-gradient(90deg, #ecf5ff 0%, #f5faff 100%);
  border-radius: 4px;
  font-size: 12px;
  color: #409eff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background 0.15s ease;
}

.date-cell__item:hover {
  background: #d9ecff;
}

.date-cell__item .dot {
  width: 4px;
  height: 4px;
  background: #409eff;
  border-radius: 50%;
  flex-shrink: 0;
}

.date-cell__item .item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date-cell__more {
  padding: 3px 6px;
  font-size: 11px;
  color: #909399;
  background: #f4f6f9;
  border-radius: 4px;
  cursor: pointer;
  text-align: center;
  font-weight: 500;
  transition: all 0.15s ease;
}

.date-cell__more:hover {
  background: #e4e7ed;
  color: #409eff;
}

/* 当日详情弹窗 */
.empty-day {
  padding: 20px 0;
}

.day-detail {
  max-height: 500px;
  overflow-y: auto;
}

.day-detail__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 8px;
  border-left: 3px solid #409eff;
}

.day-detail__item:last-child {
  margin-bottom: 0;
}

.day-detail__company {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.day-detail__meta {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #6b7280;
}

.day-detail__sales {
  flex-shrink: 0;
  font-size: 12px;
  color: #909399;
  background: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}
</style>
