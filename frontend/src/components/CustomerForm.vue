<template>
  <el-dialog
    v-model="dialogVisible"
    :title="editingId ? '编辑客户' : '新增客户'"
    width="600px"
    @closed="onClosed"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="公司名称" required>
        <el-input v-model="form.companyName" />
      </el-form-item>
      <el-form-item label="联系人" required>
        <el-input v-model="form.contact" />
      </el-form-item>
      <el-form-item label="电话" required>
        <el-input v-model="form.phone" />
      </el-form-item>
      <el-form-item label="地址" required>
        <el-input v-model="form.address" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="form.status" style="width: 100%">
          <el-option label="意向客户" value="intent" />
          <el-option label="已合作客户" value="cooperated" />
          <el-option label="流失客户" value="lost" />
        </el-select>
      </el-form-item>
      <el-form-item label="销售体量">
        <el-input v-model="form.salesVolume" />
      </el-form-item>

      <!-- 经纬度：仅在编辑场景或显式要求时显示 -->
      <template v-if="showCoords">
        <el-form-item label="经纬度">
          <el-input v-model="form.lat" placeholder="纬度" style="width: 48%" />
          <span style="margin: 0 6px">/</span>
          <el-input v-model="form.lng" placeholder="经度" style="width: 48%" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="small" :loading="geocoding" @click="resolveAddress">
            🔍 根据地址自动解析经纬度
          </el-button>
          <span style="margin-left: 8px; font-size: 12px; color: #909399">
            （需先填写"地址"字段，点击后自动调用高德地图 API）
          </span>
        </el-form-item>
      </template>

      <el-form-item v-if="canAssign" label="归属业务员">
        <el-select v-model="form.salespersonId" placeholder="选择业务员（可留空）" clearable style="width: 100%">
          <el-option v-for="u in salespersons" :key="u.id" :label="u.real_name + ' (' + u.username + ')'" :value="u.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import axios from '../api/axios';
import { useAuthStore } from '../store/auth';
import { ElMessage } from 'element-plus';
import { loadAmapScript, AMAP_CONFIG } from '../config/amap';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  editingId: { type: Number, default: null },
  // 编辑时是否显示经纬度字段（地图页面新增不需要，列表页面编辑需要）
  showCoords: { type: Boolean, default: false },
  // 编辑时传入已有客户数据
  initialData: { type: Object, default: null }
});

const emit = defineEmits(['update:modelValue', 'saved']);

const auth = useAuthStore();
const dialogVisible = ref(false);
const saving = ref(false);
const geocoding = ref(false);
const salespersons = ref([]);

const form = ref({
  companyName: '', contact: '', phone: '', address: '',
  status: 'intent', salesVolume: '', lat: '', lng: '',
  salespersonId: null
});

// 同步 v-model
watch(() => props.modelValue, (val) => {
  dialogVisible.value = val;
  if (val) {
    if (props.editingId && props.initialData) {
      form.value = {
        companyName: props.initialData.company_name || '',
        contact: props.initialData.contact || '',
        phone: props.initialData.phone || '',
        address: props.initialData.address || '',
        status: props.initialData.status || 'intent',
        salesVolume: props.initialData.sales_volume || '',
        lat: props.initialData.lat != null ? String(props.initialData.lat) : '',
        lng: props.initialData.lng != null ? String(props.initialData.lng) : '',
        salespersonId: props.initialData.salesperson_id || null
      };
    } else {
      resetForm();
    }
    loadSalespersons();
  }
});

watch(dialogVisible, (val) => {
  emit('update:modelValue', val);
});

function onClosed() {
  resetForm();
}

function resetForm() {
  form.value = {
    companyName: '', contact: '', phone: '', address: '',
    status: 'intent', salesVolume: '', lat: '', lng: '',
    salespersonId: null
  };
}

async function loadSalespersons() {
  if (!auth.isSuperAdmin && !auth.hasPermission('pool:manage')) return;
  try {
    const res = await axios.get('/auth/salespersons');
    salespersons.value = res.data.users || [];
  } catch {}
}

// 地址解析（带 geocoding 状态）
function resolveAddressAsync() {
  return new Promise((resolve) => {
    if (!AMAP_CONFIG.key) {
      ElMessage.warning('尚未配置高德地图 Key，无法自动解析地址');
      resolve(null);
      return;
    }
    if (!form.value.address || !form.value.address.trim()) {
      resolve(null);
      return;
    }
    geocoding.value = true;
    loadAmapScript().then((AMap) => {
      const geocoder = new AMap.Geocoder({ city: '全国' });
      geocoder.getLocation(form.value.address.trim(), (status, result) => {
        geocoding.value = false;
        if (status === 'complete' && result.geocodes && result.geocodes.length > 0) {
          const loc = result.geocodes[0].location;
          resolve({
            lng: Number(loc.lng).toFixed(6),
            lat: Number(loc.lat).toFixed(6),
            formatted: result.geocodes[0].formattedAddress
          });
        } else {
          ElMessage.error('未找到该地址的坐标，请检查地址是否完整');
          resolve(null);
        }
      });
    }).catch(() => {
      geocoding.value = false;
      resolve(null);
    });
  });
}

function resolveAddress() {
  resolveAddressAsync().then((r) => {
    if (r) {
      form.value.lng = r.lng;
      form.value.lat = r.lat;
      ElMessage.success('解析成功：' + r.formatted);
    }
  });
}

// 保存
async function handleSave() {
  if (!form.value.companyName || !form.value.contact || !form.value.phone || !form.value.address) {
    ElMessage.warning('请填写必填项（公司名称/联系人/电话/地址）');
    return;
  }

  const payload = {
    ...form.value,
    companyName: String(form.value.companyName || '').trim(),
    contact: String(form.value.contact || '').trim(),
    phone: String(form.value.phone || '').trim(),
    address: String(form.value.address || '').trim(),
  };

  const latStr = (payload.lat == null || payload.lat === '') ? '' : String(payload.lat).trim();
  const lngStr = (payload.lng == null || payload.lng === '') ? '' : String(payload.lng).trim();
  const hasLatLng = latStr !== '' && lngStr !== '' && !isNaN(Number(latStr)) && !isNaN(Number(lngStr));

  // 如果没有坐标且有地址 → 自动解析
  if (!hasLatLng && AMAP_CONFIG.key && payload.address) {
    saving.value = true;
    try {
      const r = await resolveAddressAsync();
      if (r) {
        payload.lat = Number(r.lat);
        payload.lng = Number(r.lng);
        ElMessage.success('已自动根据地址解析坐标：' + r.formatted);
      } else {
        payload.lat = null;
        payload.lng = null;
        ElMessage.info('地址解析未成功，将以"暂无坐标"保存');
      }
    } catch {
      payload.lat = null;
      payload.lng = null;
    }
    saving.value = false;
  } else if (hasLatLng) {
    payload.lat = Number(latStr);
    payload.lng = Number(lngStr);
  } else {
    payload.lat = null;
    payload.lng = null;
  }

  if (payload.salespersonId === '' || payload.salespersonId === undefined) payload.salespersonId = null;

  saving.value = true;
  try {
    if (props.editingId) {
      await axios.put(`/customers/${props.editingId}`, payload);
      ElMessage.success('更新成功');
    } else {
      await axios.post('/customers', payload);
      ElMessage.success('新增成功');
    }
    dialogVisible.value = false;
    emit('saved');
  } catch {
    // axios 拦截器处理错误
  } finally {
    saving.value = false;
  }
}
</script>
