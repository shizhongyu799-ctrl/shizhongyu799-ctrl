<template>
  <el-dialog v-model="visible" title="新增拜访记录" width="500px" @update:modelValue="(v) => emit('update:modelValue', v)">
    <el-form :model="form" label-width="90px">
      <el-form-item label="客户">
        <span>{{ customerName || '客户 #' + customerId }}</span>
      </el-form-item>
      <el-form-item label="拜访方式">
        <el-radio-group v-model="form.visitType">
          <el-radio value="onsite">上门拜访</el-radio>
          <el-radio value="phone">电话拜访</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="拜访内容">
        <el-input v-model="form.content" type="textarea" :rows="4" placeholder="请记录本次拜访详情" />
      </el-form-item>
      <el-form-item label="拜访结果">
        <el-radio-group v-model="form.result">
          <el-radio value="deal">成交</el-radio>
          <el-radio value="follow_up">继续跟进</el-radio>
          <el-radio value="no_interest">无意向</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="下次跟进">
        <el-date-picker v-model="form.nextFollowUp" type="date" placeholder="选择日期" style="width: 100%" />
      </el-form-item>
      <el-form-item v-if="form.visitType === 'onsite'" label="GPS打卡">
        <el-button size="small" @click="getGPS" :disabled="gpsLoading">
          <el-icon><LocationFilled /></el-icon>
          获取当前位置
        </el-button>
        <span v-if="form.gpsLat && form.gpsLng" style="margin-left: 10px; color: #10b981">
          已获取：{{ form.gpsLat.toFixed(4) }}, {{ form.gpsLng.toFixed(4) }}
        </span>
        <span v-else style="margin-left: 10px; color: #909399; font-size: 12px">
          （需 HTTPS 环境）
        </span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const props = defineProps({
  modelValue: Boolean,
  customerId: [String, Number],
  customerName: String
});
const emit = defineEmits(['update:modelValue', 'saved']);

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
});

const form = ref({
  visitType: 'onsite',
  content: '',
  result: 'follow_up',
  nextFollowUp: null,
  gpsLat: null,
  gpsLng: null
});

const saving = ref(false);
const gpsLoading = ref(false);

watch(() => props.modelValue, (v) => {
  if (v) {
    form.value = {
      visitType: 'onsite',
      content: '',
      result: 'follow_up',
      nextFollowUp: null,
      gpsLat: null,
      gpsLng: null
    };
  }
});

function getGPS() {
  if (!navigator.geolocation) {
    ElMessage.warning('浏览器不支持定位，请使用 HTTPS 环境');
    return;
  }
  gpsLoading.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      form.value.gpsLat = pos.coords.latitude;
      form.value.gpsLng = pos.coords.longitude;
      gpsLoading.value = false;
      ElMessage.success('GPS 定位成功');
    },
    (err) => {
      gpsLoading.value = false;
      ElMessage.error('定位失败：' + err.message + '（请使用 HTTPS 访问）');
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

async function submit() {
  if (!form.value.content) {
    ElMessage.warning('请填写拜访内容');
    return;
  }
  saving.value = true;
  try {
    await axios.post('/visits', {
      customerId: props.customerId,
      visitType: form.value.visitType,
      content: form.value.content,
      result: form.value.result,
      nextFollowUp: form.value.nextFollowUp ? form.value.nextFollowUp.toISOString().slice(0, 10) : null,
      gpsLat: form.value.gpsLat,
      gpsLng: form.value.gpsLng,
      companyName: props.customerName
    });
    ElMessage.success('拜访记录已保存');
    visible.value = false;
    emit('saved');
  } catch {} finally {
    saving.value = false;
  }
}
</script>
