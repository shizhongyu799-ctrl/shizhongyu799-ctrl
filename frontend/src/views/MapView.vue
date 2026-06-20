<template>
  <div class="map-page">
    <!-- 顶部卡片：搜索 + 操作 + 图例 -->
    <div class="panel-card toolbar-card">
      <div class="toolbar-main">
        <div class="toolbar-group">
          <el-input
            v-model="searchKey"
            placeholder="搜索公司名 / 联系人 / 电话"
            clearable
            class="input-search"
            @input="onFilterChange"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>

          <el-select
            v-model="filterStatus"
            placeholder="客户状态"
            clearable
            class="select-mini"
            @change="onFilterChange"
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
            @change="onFilterChange"
          >
            <el-option label="正常" value="normal" />
            <el-option label="待跟进" value="warning" />
          </el-select>
        </div>

        <div class="toolbar-divider"></div>

        <div class="toolbar-group">
          <el-button
            @click="toggleDraw"
            :type="drawMode ? 'warning' : 'primary'"
            plain
          >
            <el-icon><Aim /></el-icon>
            {{ drawMode ? '取消画圈' : '地图画圈筛选' }}
          </el-button>

          <el-select
            v-if="drawMode"
            v-model="drawRadius"
            placeholder="半径"
            class="select-mini"
          >
            <el-option label="1公里" :value="1" />
            <el-option label="3公里" :value="3" />
            <el-option label="5公里" :value="5" />
            <el-option label="10公里" :value="10" />
          </el-select>

          <el-button @click="refreshMarkers" plain>
            <el-icon><Refresh /></el-icon>刷新
          </el-button>

          <el-button type="success" @click="locateMe" plain>
            <el-icon><Location /></el-icon>定位到我
          </el-button>

          <el-button type="primary" v-if="canEdit" @click="openNewCustomer">
            <el-icon><Plus /></el-icon>新增客户
          </el-button>
        </div>
      </div>

      <div class="toolbar-legend">
        <span class="legend-title">客户状态：</span>
        <span class="legend-item">
          <span class="dot dot-coop"></span>已合作
        </span>
        <span class="legend-item">
          <span class="dot dot-intent"></span>意向
        </span>
        <span class="legend-item">
          <span class="dot dot-lost"></span>流失
        </span>
        <span class="legend-item">
          <span class="dot dot-self"></span>我的位置
        </span>
      </div>

      <div v-if="filteredByArea.length > 0" class="toolbar-result">
        <el-icon style="color: #3b82f6"><InfoFilled /></el-icon>
        画圈筛选结果：共 <b>{{ filteredByArea.length }}</b> 位客户
        <span
          v-for="c in filteredByArea.slice(0, 6)"
          :key="c.id"
          class="result-tag"
        >{{ c.company_name }}</span>
      </div>
    </div>

    <!-- 地图卡片 -->
    <div class="panel-card map-card">
      <div ref="mapRef" class="map-container"></div>

      <transition name="fade">
        <div v-if="mapLoading" key="ol-loading" class="map-overlay overlay-loading">
          <el-icon class="spinner" :size="28"><Loading /></el-icon>
          <div>正在加载地图数据…</div>
        </div>
        <div v-else-if="amapFailed" key="ol-failed" class="map-overlay overlay-failed">
          <el-icon :size="32" style="color: #f59e0b"><Warning /></el-icon>
          <div class="overlay-title">高德地图加载失败</div>
          <div class="overlay-sub">请检查 Key 配置或网络连接，稍后可刷新重试</div>
        </div>
        <div v-else-if="markers.length === 0" key="ol-empty" class="map-overlay overlay-empty">
          <el-icon :size="32" style="color: #94a3b8"><Location /></el-icon>
          <div class="overlay-title">暂无客户数据</div>
          <div class="overlay-sub">请先在"客户管理"中添加客户</div>
        </div>
      </transition>

      <transition name="fade">
        <div
          v-if="!mapLoading && !amapFailed && markersWithoutCoords > 0"
          key="hint-missing"
          class="map-hint"
        >
          <el-icon style="color: #f59e0b"><Warning /></el-icon>
          <span><b>{{ markersWithoutCoords }}</b> 个客户缺少坐标，无法在地图显示</span>
        </div>
      </transition>

      <transition name="fade">
        <div
          v-if="selfLocated && !amapFailed && markers.length > 0"
          key="counter-nearby"
          class="map-counter"
        >
          <el-icon style="color: #2563eb"><Location /></el-icon>
          附近共 <b>{{ nearbyCount }}</b> 位客户
        </div>
      </transition>
    </div>

    <!-- 客户详情对话框 -->
    <el-dialog
      v-model="customerVisible"
      width="560px"
      :show-close="true"
      class="customer-dialog"
    >
      <template #header>
        <div class="dialog-header">
          <el-icon style="color: #3b82f6"><UserFilled /></el-icon>
          <span>{{ currentCustomer?.company_name }}</span>
        </div>
      </template>

      <div v-if="currentCustomer" class="customer-body">
        <div class="info-grid">
          <div class="info-cell">
            <div class="info-label">联系人</div>
            <div class="info-value">{{ currentCustomer.contact || '-' }}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">电话</div>
            <div class="info-value">{{ currentCustomer.phone || '-' }}</div>
          </div>
          <div class="info-cell info-cell-full">
            <div class="info-label">地址</div>
            <div class="info-value">{{ currentCustomer.address || '-' }}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">客户状态</div>
            <div>
              <el-tag
                :type="statusTagType(currentCustomer.status)"
                effect="light"
                round
              >{{ statusLabel(currentCustomer.status) }}</el-tag>
            </div>
          </div>
          <div class="info-cell">
            <div class="info-label">健康度</div>
            <div>
              <el-tag
                :type="currentCustomer.health_status === 'warning' ? 'warning' : 'success'"
                effect="light"
                round
              >{{ currentCustomer.health_status === 'warning' ? '待跟进' : '正常' }}</el-tag>
            </div>
          </div>
        </div>

        <div class="action-row">
          <el-button type="primary" @click="addVisit(currentCustomer.id)">
            <el-icon><Edit /></el-icon>新增拜访
          </el-button>
          <el-button v-if="canEdit" plain @click="editCustomer(currentCustomer.id)">
            <el-icon><Edit /></el-icon>编辑客户
          </el-button>
          <el-button
            v-if="canDelete"
            type="danger"
            plain
            @click="deleteCustomer(currentCustomer.id)"
          >
            <el-icon><Delete /></el-icon>删除
          </el-button>
        </div>

        <div class="visit-section">
          <div class="section-title">
            <el-icon style="color: #3b82f6"><Notebook /></el-icon>
            最近拜访记录
          </div>
          <div v-if="visitList.length === 0" class="empty-state">暂无拜访记录</div>
          <div v-for="v in visitList" :key="v.id" class="visit-item">
            <div class="visit-head">
              <el-tag size="small" effect="light" type="info">{{ v.visit_type === 'onsite' ? '上门' : '电话' }}</el-tag>
              <span class="visit-date">{{ String(v.visit_time).slice(0, 16) }}</span>
              <span class="visit-result">{{ visitResultLabel(v.result) }}</span>
            </div>
            <div class="visit-content">{{ v.content }}</div>
            <div v-if="v.next_follow_up" class="visit-next">
              <el-icon style="color: #f59e0b"><Clock /></el-icon>
              下次跟进：{{ v.next_follow_up }}
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <VisitDialog
      v-model="visitVisible"
      :customer-id="currentVisitCustomerId"
      :customer-name="currentCustomer?.company_name"
      @saved="onVisitSaved"
    />

    <CustomerForm
      v-model="addCustomerVisible"
      :editing-id="null"
      :initial-data="null"
      :show-coords="false"
      @saved="onNewCustomerSaved"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick, onBeforeUnmount, watch } from 'vue';
import {
  Plus,
  Location,
  Search,
  Refresh,
  Aim,
  Warning,
  UserFilled,
  Edit,
  Delete,
  Notebook,
  Clock,
  InfoFilled,
  Loading
} from '@element-plus/icons-vue';
import axios from '../api/axios';
import { useAuthStore } from '../store/auth';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import VisitDialog from '../components/VisitDialog.vue';
import CustomerForm from '../components/CustomerForm.vue';
import { loadAmapScript } from '../config/amap';

const auth = useAuthStore();
const router = useRouter();

const mapRef = ref(null);
const mapInstance = ref(null);
const markerObjects = ref([]);
const circleInstance = ref(null);

const selfMarker = ref(null);
const locating = ref(false);
const selfLocated = ref(false);
const nearbyCount = ref(0);

const markers = ref([]);
const mapLoading = ref(false);
const amapFailed = ref(false);
const searchKey = ref('');
const filterStatus = ref('');
const filterHealth = ref('');
const drawMode = ref(false);
const drawRadius = ref(3);
const filteredByArea = ref([]);

const customerVisible = ref(false);
const currentCustomer = ref(null);
const visitList = ref([]);
const visitVisible = ref(false);
const currentVisitCustomerId = ref(null);

const addCustomerVisible = ref(false);

const canEdit = computed(() => auth.hasPermission('customer:edit'));
const canDelete = computed(() => auth.hasPermission('customer:delete'));

const markersWithoutCoords = ref(0);
function updateMarkersWithoutCoords() {
  const arr = markers.value || [];
  markersWithoutCoords.value = arr.filter((c) =>
    c.lat == null || c.lng == null || isNaN(Number(c.lat)) || isNaN(Number(c.lng))
  ).length;
}
watch(() => (markers.value || []).length, () => updateMarkersWithoutCoords(), { immediate: true });
watch(() => markers.value, () => updateMarkersWithoutCoords(), { deep: true });

function statusLabel(s) {
  return { intent: '意向客户', cooperated: '已合作', lost: '流失' }[s] || s || '未知';
}
function statusTagType(s) {
  return { intent: 'warning', cooperated: 'success', lost: 'info' }[s] || '';
}
function visitResultLabel(r) {
  return { deal: '成交', follow_up: '继续跟进', no_interest: '无意向' }[r] || r || '-';
}

async function loadMarkers() {
  mapLoading.value = true;
  try {
    const res = await axios.get('/customers/markers');
    markers.value = res.data.markers || [];
    updateMarkersWithoutCoords();
    if (!mapInstance.value) {
      await initMap();
    } else {
      renderMarkers();
    }
  } catch (e) {
    const msg = e?.response?.data?.error || e?.message || '加载客户数据失败';
    ElMessage.error(msg);
  } finally {
    mapLoading.value = false;
  }
}

function refreshMarkers() {
  filteredByArea.value = [];
  if (circleInstance.value) {
    try { circleInstance.value.setMap(null); } catch {}
    circleInstance.value = null;
  }
  if (mapInstance.value) mapInstance.value._fitViewDone = false;
  loadMarkers();
}

function openNewCustomer() { addCustomerVisible.value = true; }
function onNewCustomerSaved() { addCustomerVisible.value = false; refreshMarkers(); }
function onFilterChange() { renderMarkers(); }

async function initMap() {
  if (!mapRef.value) return;
  await nextTick();
  if (!mapRef.value) return;

  let AMap;
  try { AMap = await loadAmapScript(); }
  catch (err) {
    console.error('AMap 加载失败：', err);
    ElMessage.warning('高德地图加载失败，请检查 Key 配置');
    amapFailed.value = true;
    return;
  }
  if (!mapRef.value) return;

  try {
    mapInstance.value = new AMap.Map(mapRef.value, {
      zoom: 11,
      center: [116.397428, 39.90923]
    });
    mapInstance.value.on('error', () => {
      ElMessage.warning('高德地图瓦片加载异常');
      amapFailed.value = true;
    });
    mapInstance.value.on('zoomend', () => {
      if (markerObjects.value.length > 0) renderMarkers();
    });
    amapFailed.value = false;
    renderMarkers();
    setTimeout(() => locateMe(true), 500);
  } catch (err) {
    console.error('AMap 初始化异常：', err);
    amapFailed.value = true;
  }
}

/* ========= 定位逻辑 ========= */
async function locateMe(isAuto = false) {
  if (!mapInstance.value || amapFailed.value) {
    if (!isAuto) ElMessage.warning('地图尚未就绪');
    return;
  }
  const AMap = window.AMap;
  if (!AMap) return;
  if (!isAuto) ElMessage.info('正在获取当前位置…');
  locating.value = true;

  const tryGeolocation = () => new Promise((resolve) => {
    if (!AMap.plugin) { resolve(null); return; }
    AMap.plugin('AMap.Geolocation', () => {
      try {
        const geolocation = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 10000,
          buttonPosition: 'RB',
          showButton: false,
          zoomToAccuracy: true
        });
        geolocation.getCurrentPosition((status, result) => {
          if (status === 'complete' && result && result.position) {
            resolve({ lng: result.position.lng, lat: result.position.lat });
          } else {
            resolve(null);
          }
        });
      } catch (e) { resolve(null); }
    });
  });

  const tryBrowser = () => new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  const result = (await tryGeolocation()) || (await tryBrowser());
  locating.value = false;

  if (result) {
    if (selfMarker.value) {
      try { mapInstance.value.remove(selfMarker.value); } catch {}
      selfMarker.value = null;
    }
    const pulseIcon = `<div class="self-marker"><div class="self-marker-pulse"></div><div class="self-marker-ring"></div></div>`;
    selfMarker.value = new AMap.Marker({
      position: [result.lng, result.lat],
      content: pulseIcon,
      offset: new AMap.Pixel(-18, -18),
      title: '我的位置',
      zIndex: 999
    });
    mapInstance.value.add(selfMarker.value);

    const nearby = (markers.value || []).filter((c) => {
      if (!c.lng || !c.lat) return false;
      const dx = (Number(c.lng) - result.lng) * 111.32;
      const dy = (Number(c.lat) - result.lat) * 111.32;
      return Math.sqrt(dx * dx + dy * dy) < 30;
    });
    nearbyCount.value = nearby.length;
    selfLocated.value = true;

    if (nearby.length > 0) {
      const nearbyMarkers = nearby.map((c) => {
        const color = markerColor(c.status, c.health_status);
        const { pinH, pinW } = getMarkerContent(c, color);
        return new AMap.Marker({
          position: [Number(c.lng), Number(c.lat)],
          // 与 renderMarkers 相同的确定性偏移
          offset: new AMap.Pixel(-Math.round(pinW / 2), -Math.round(pinH)),
          visible: false
        });
      });
      const fitOverlays = [selfMarker.value, ...nearbyMarkers];
      try { mapInstance.value.setFitView(fitOverlays, false, [100, 100, 100, 100]); }
      catch (e) { try { mapInstance.value.setFitView(fitOverlays); } catch {} }
      nearbyMarkers.forEach((m) => { try { mapInstance.value.remove(m); } catch {} });

      let maxDistKm = 0;
      nearby.forEach((c) => {
        const dx = (Number(c.lng) - result.lng) * 111.32;
        const dy = (Number(c.lat) - result.lat) * 111.32;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxDistKm) maxDistKm = d;
      });
      const currentZoom = mapInstance.value.getZoom();
      if (maxDistKm < 1 && currentZoom < 14) mapInstance.value.setZoom(14);
      else if (maxDistKm < 3 && currentZoom < 13) mapInstance.value.setZoom(13);
      else if (maxDistKm < 10 && currentZoom < 11) mapInstance.value.setZoom(11);
      else if (currentZoom < 10) mapInstance.value.setZoom(10);

      if (currentZoom > 16) mapInstance.value.setZoom(16);
    } else {
      mapInstance.value.setZoomAndCenter(13, [result.lng, result.lat]);
    }

    if (!isAuto) ElMessage.success('已定位到当前位置');
  } else {
    if (!isAuto) ElMessage.warning('无法获取当前位置，请检查浏览器定位权限或网络');
  }
}

/* ========= 标记渲染 ========= */
function getMarkerSizeByZoom() {
  if (!mapInstance.value) return { pinH: 22, fontSize: 10 };
  const zoom = mapInstance.value.getZoom();
  const scale = Math.pow(1.22, zoom - 11);
  const pinH = Math.max(14, Math.min(60, 22 * scale));
  const fontSize = Math.max(8, Math.min(22, 10 * scale));
  return { pinH, fontSize, zoom };
}

function getMarkerContent(c, color) {
  const { pinH, fontSize } = getMarkerSizeByZoom();
  const pinW = pinH * 0.75;
  const needWarning = c.health_status === 'warning';
  // 核心原理（几何完全确定，与 zoom 无关）：
  //   content 盒：width=pinW, height=pinH（显式）
  //   pin SVG: 流式放在 content 顶部，尖点正好在 (pinW/2, pinH)
  //   label: 绝对定位，不影响 content 盒尺寸
  //   AMap offset: (-pinW/2, -pinH) → content 左上角 = position + offset
  //   因此 pin 尖点 = position + offset + (pinW/2, pinH) = position ✓
  const pinSvg = `
    <svg width="${pinW}px" height="${pinH}px" viewBox="0 0 30 44" xmlns="http://www.w3.org/2000/svg" style="display:block">
      <defs>
        <linearGradient id="grad-${color.slice(1)}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.85" />
        </linearGradient>
        <filter id="shadow-${color.slice(1)}">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-opacity="0.4" />
        </filter>
      </defs>
      <path d="M15 1 C6 1 1 8.5 1 15 C1 24 15 44 15 44 C15 44 29 24 29 15 C29 8.5 24 1 15 1 Z"
            fill="url(#grad-${color.slice(1)})"
            stroke="${needWarning ? '#ef4444' : 'rgba(255,255,255,0.9)'}"
            stroke-width="${needWarning ? 2 : 1}"
            filter="url(#shadow-${color.slice(1)})" />
      <circle cx="15" cy="14" r="5" fill="white" opacity="0.95" />
    </svg>`;
  const maxChars = Math.floor(4 + fontSize / 3);
  const companyName = (c.company_name || '').slice(0, maxChars);
  const html = `
    <div style="position:relative; width:${pinW}px; height:${pinH}px;">
      ${pinSvg}
      <div style="position:absolute; left:50%; top:${pinH + 2}px; transform:translateX(-50%);
                  font-size:${fontSize}px; color:#0f172a; background:rgba(255,255,255,0.95);
                  padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1;
                  white-space:nowrap; font-weight:500; line-height:1.2; pointer-events:auto;
                  box-shadow:0 1px 2px rgba(15,23,42,0.08);">
        ${companyName}
      </div>
    </div>`;
  return { html, pinH, pinW };
}

function renderMarkers() {
  if (!mapInstance.value || amapFailed.value) return;
  try {
    markerObjects.value.forEach((m) => { try { mapInstance.value.remove(m); } catch {} });
    markerObjects.value = [];
    const list = getFilteredList();
    const newMarkers = [];
    list.forEach((c) => {
      if (c.lng == null || c.lat == null || isNaN(Number(c.lng)) || isNaN(Number(c.lat))) return;
      const color = markerColor(c.status, c.health_status);
      const { html, pinH, pinW } = getMarkerContent(c, color);
      const marker = new window.AMap.Marker({
        position: [Number(c.lng), Number(c.lat)],
        title: c.company_name,
        content: html,
        // 布局: content 宽 pinW, 高 pinH; pin 尖点在 content 底部中央 (pinW/2, pinH)
        // offset = (-pinW/2, -pinH): 使尖点精确 = position + offset + (pinW/2, pinH) = position
        offset: new window.AMap.Pixel(-Math.round(pinW / 2), -Math.round(pinH)),
        cursor: 'pointer'
      });
      marker.on('click', () => openCustomer(c));
      newMarkers.push(marker);
    });
    if (newMarkers.length > 0) {
      mapInstance.value.add(newMarkers);
      markerObjects.value = newMarkers;
      if (!mapInstance.value._fitViewDone && !selfLocated.value) {
        mapInstance.value.setFitView(newMarkers);
        mapInstance.value._fitViewDone = true;
      }
    }
  } catch (err) { console.error('渲染标记失败：', err); }
}

function getFilteredList() {
  let list = markers.value.slice();
  if (searchKey.value) {
    const k = searchKey.value.toLowerCase();
    list = list.filter((c) =>
      (c.company_name || '').toLowerCase().includes(k) ||
      (c.contact || '').toLowerCase().includes(k) ||
      (c.phone || '').includes(k)
    );
  }
  if (filterStatus.value) list = list.filter((c) => c.status === filterStatus.value);
  if (filterHealth.value) list = list.filter((c) => c.health_status === filterHealth.value);
  if (filteredByArea.value.length > 0) {
    const ids = new Set(filteredByArea.value.map((c) => c.id));
    list = list.filter((c) => ids.has(c.id));
  }
  return list;
}

function markerColor(status, health) {
  return { intent: '#f59e0b', cooperated: '#10b981', lost: '#6b7280' }[status] || '#3b82f6';
}

/* ========= 画圈筛选 ========= */
function toggleDraw() {
  if (!mapInstance.value || amapFailed.value) {
    ElMessage.warning('地图尚未就绪，无法使用画圈筛选');
    return;
  }
  drawMode.value = !drawMode.value;
  if (drawMode.value) {
    ElMessage.info('请在地图上点击一点作为圆心');
    mapInstance.value.once('click', (e) => {
      const lnglat = e.lnglat;
      const center = [lnglat.getLng(), lnglat.getLat()];
      if (circleInstance.value) {
        try { circleInstance.value.setMap(null); } catch {}
        circleInstance.value = null;
      }
      circleInstance.value = new window.AMap.Circle({
        center,
        radius: drawRadius.value * 1000,
        strokeColor: '#3b82f6',
        strokeWeight: 2,
        strokeOpacity: 0.9,
        fillColor: '#3b82f6',
        fillOpacity: 0.12
      });
      mapInstance.value.add(circleInstance.value);
      axios.post('/customers/area-filter', {
        lat: center[1],
        lng: center[0],
        radiusKm: drawRadius.value
      }).then((res) => {
        filteredByArea.value = res.data.customers || [];
        renderMarkers();
      }).catch((err) => {
        ElMessage.error('画圈筛选失败：' + (err?.response?.data?.error || err.message));
      }).finally(() => { drawMode.value = false; });
    });
  } else {
    if (circleInstance.value) {
      try { circleInstance.value.setMap(null); } catch {}
      circleInstance.value = null;
    }
    filteredByArea.value = [];
    renderMarkers();
  }
}

/* ========= 客户详情 ========= */
async function openCustomer(c) {
  currentCustomer.value = c;
  visitList.value = [];
  customerVisible.value = true;
  try {
    const res = await axios.get(`/visits/customer/${c.id}`);
    visitList.value = res.data.visits || [];
  } catch {}
}
function addVisit(id) {
  currentVisitCustomerId.value = id;
  visitVisible.value = true;
}
function editCustomer(id) {
  customerVisible.value = false;
  router.push({ path: '/customers', query: { editId: id } });
}
function deleteCustomer(id) {
  if (!confirm('确定删除该客户？所有拜访记录将一并删除')) return;
  axios.delete(`/customers/${id}`).then(() => {
    customerVisible.value = false;
    loadMarkers();
  }).catch((err) => ElMessage.error('删除失败：' + (err?.response?.data?.error || err.message)));
}
function onVisitSaved() {
  loadMarkers();
  if (currentCustomer.value) openCustomer(currentCustomer.value);
}

onBeforeUnmount(() => {
  if (mapInstance.value) {
    try { mapInstance.value.destroy && mapInstance.value.destroy(); } catch {}
    mapInstance.value = null;
  }
});

onMounted(() => { nextTick(() => loadMarkers()); });
</script>

<style>
/* ========= 地图页面全局样式 ========= */
.map-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04),
              0 1px 2px rgba(15, 23, 42, 0.03);
  border: 1px solid #e2e8f0;
  padding: 18px 20px;
}

/* ---------- 顶部工具卡 ---------- */
.toolbar-card { display: flex; flex-direction: column; gap: 14px; }

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

.input-search { width: 260px; }

.select-mini { width: 130px; }

/* ---------- 图例 ---------- */
.toolbar-legend {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 12.5px;
  color: #475569;
}

.legend-title { color: #64748b; font-weight: 500; }

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 0 2px #ffffff, 0 1px 2px rgba(15, 23, 42, 0.15);
}

.dot-coop { background: #10b981; }
.dot-intent { background: #f59e0b; }
.dot-lost { background: #6b7280; }
.dot-self { background: #3b82f6; box-shadow: 0 0 0 2px #ffffff, 0 0 0 5px rgba(59, 130, 246, 0.15); }

/* ---------- 筛选结果 ---------- */
.toolbar-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #eff6ff, #dbeafe);
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  font-size: 13px;
  color: #1e40af;
}

.toolbar-result b { color: #1d4ed8; font-weight: 600; }

.result-tag {
  background: #ffffff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

/* ---------- 地图卡 ---------- */
.map-card {
  padding: 0;
  overflow: hidden;
  position: relative;
  height: calc(100vh - 280px);
  min-height: 520px;
}

.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

/* 遮罩层（加载/失败/空态） */
.map-overlay {
  position: absolute;
  inset: 0;
  background: rgba(248, 250, 252, 0.92);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #475569;
  font-size: 14px;
  z-index: 5;
}

.overlay-title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  margin-top: 4px;
}

.overlay-sub { font-size: 12.5px; color: #64748b; }

.spinner { animation: spin 1s linear infinite; color: #3b82f6; }

@keyframes spin { to { transform: rotate(360deg); } }

/* 右上角提示卡 */
.map-hint {
  position: absolute;
  top: 14px;
  right: 14px;
  background: #ffffff;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12.5px;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px -4px rgba(15, 23, 42, 0.1);
  z-index: 6;
}

.map-hint b { color: #b45309; font-weight: 600; }

/* 客户计数卡 */
.map-counter {
  position: absolute;
  bottom: 18px;
  left: 18px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #dbeafe;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  color: #1e40af;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px -4px rgba(37, 99, 235, 0.25);
  z-index: 6;
}

.map-counter b { color: #1d4ed8; font-weight: 700; }

/* 标记覆盖样式 */
.marker-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  filter: drop-shadow(0 2px 4px rgba(15, 23, 42, 0.15));
}

.marker-pin { line-height: 0; }

.marker-label {
  margin-top: 2px;
  font-size: var(--fs, 10px);
  color: #0f172a;
  background: rgba(255, 255, 255, 0.95);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  white-space: nowrap;
  font-weight: 500;
  line-height: 1.2;
  pointer-events: auto;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

/* "我的位置"标记 */
.self-marker {
  width: 36px;
  height: 36px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.self-marker-pulse {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #3b82f6;
  border: 3px solid #ffffff;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
  z-index: 2;
}

.self-marker-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.25);
  animation: ring-pulse 2s ease-out infinite;
  z-index: 1;
}

@keyframes ring-pulse {
  0% { transform: scale(0.6); opacity: 0.8; }
  100% { transform: scale(1.8); opacity: 0; }
}

/* fade 动画复用 */
.fade-enter-active,
.fade-leave-active { transition: opacity 0.25s ease; }

.fade-enter-from,
.fade-leave-to { opacity: 0; }

/* ---------- 客户详情弹窗 ---------- */
.customer-dialog .el-dialog {
  border-radius: 14px;
  overflow: hidden;
  padding: 0;
}

.customer-dialog .el-dialog__header {
  padding: 18px 24px;
  margin-right: 0;
  border-bottom: 1px solid #f1f5f9;
}

.customer-dialog .el-dialog__body { padding: 0 24px 24px; }

.dialog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.customer-body { display: flex; flex-direction: column; gap: 20px; }

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 20px;
  margin-top: 4px;
}

.info-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
}

.info-cell-full { grid-column: 1 / -1; }

.info-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.info-value {
  font-size: 14px;
  color: #0f172a;
  font-weight: 500;
  line-height: 1.5;
}

.action-row {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.visit-section { display: flex; flex-direction: column; gap: 10px; }

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

.empty-state {
  padding: 28px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  background: #f8fafc;
  border-radius: 8px;
}

.visit-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 3px solid #3b82f6;
}

.visit-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: #475569;
}

.visit-date { color: #64748b; }

.visit-result {
  margin-left: auto;
  color: #1e40af;
  font-weight: 600;
  font-size: 12.5px;
}

.visit-content {
  font-size: 13px;
  color: #334155;
  line-height: 1.6;
}

.visit-next {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: #b45309;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
}

/* 统一 ElButton 圆角 */
.map-page .el-button { border-radius: 8px; font-weight: 500; }
</style>
