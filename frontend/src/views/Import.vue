<template>
  <div>
    <el-card style="margin-bottom: 16px">
      <div class="card-title">批量导入客户（仅管理员可用）</div>
      <div style="margin-bottom: 16px; color: #606266">
        1. 先下载标准 Excel 模板；2. 填写客户信息后保存为 Excel 文件；3. 在这里上传并导入。
      </div>
      <el-button @click="downloadTemplate" :loading="downloading">
        <el-icon><Download /></el-icon> 下载 Excel 模板
      </el-button>
    </el-card>

    <el-card>
      <div class="card-title">上传 Excel 文件 / 预览并确认</div>
      <el-upload
        :auto-upload="false"
        :on-change="handleFile"
        :show-file-list="false"
        accept=".xlsx,.xls"
      >
        <el-button type="primary">
          <el-icon><UploadFilled /></el-icon> 选择 Excel 文件
        </el-button>
      </el-upload>

      <div v-if="previewRows.length > 0" style="margin-top: 16px">
        <div style="margin-bottom: 10px">文件预览：共 {{ previewRows.length }} 条记录</div>
        <el-table :data="previewRows.slice(0, 50)" border stripe size="small">
          <el-table-column prop="companyName" label="公司名称" min-width="140" />
          <el-table-column prop="contact" label="联系人" width="90" />
          <el-table-column prop="phone" label="电话" width="120" />
          <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column prop="salesVolume" label="销售体量" width="100" />
        </el-table>
        <div style="margin-top: 16px">
          <el-button type="success" :loading="importing" @click="doImport">确认导入</el-button>
          <el-button @click="previewRows = []; importResult = null">清空</el-button>
        </div>
      </div>

      <el-alert
        v-if="importResult"
        :title="'导入完成：成功 ' + importResult.success + ' 条，失败 ' + importResult.failed + ' 条。' + (importResult.errors?.length ? '错误详情：' + importResult.errors.join('；') : '')"
        :type="importResult.failed > 0 ? 'warning' : 'success'"
        :closable="false"
        style="margin-top: 16px"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import ExcelJS from 'exceljs';
import axios from '../api/axios';
import { ElMessage } from 'element-plus';

const previewRows = ref([]);
const importing = ref(false);
const downloading = ref(false);
const importResult = ref(null);

async function downloadTemplate() {
  downloading.value = true;
  try {
    const res = await axios.get('/admin/excel/template', { responseType: 'blob' });
    const blobData = res.data;
    if (blobData && blobData.type && blobData.type.includes('application/json')) {
      const text = await blobData.text();
      const err = JSON.parse(text);
      ElMessage.error('模板下载失败：' + (err.error || '未知错误'));
      return;
    }
    const url = window.URL.createObjectURL(new Blob([blobData]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '客户导入模板.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch {
    ElMessage.error('模板下载失败，请检查后端服务');
  } finally {
    downloading.value = false;
  }
}

async function handleFile(file) {
  if (!file) return;
  const arrayBuffer = await file.raw.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values;
    const rowObj = {
      companyName: values[1] || '',
      contact: values[2] || '',
      phone: String(values[3] || ''),
      address: values[4] || '',
      status: values[5] || 'intent',
      salesVolume: values[6] || '',
      salespersonId: values[7] || null,
      lat: values[8] ? parseFloat(values[8]) : null,
      lng: values[9] ? parseFloat(values[9]) : null
    };
    if (rowObj.companyName) rows.push(rowObj);
  });
  previewRows.value = rows;
  importResult.value = null;
}

async function doImport() {
  if (previewRows.value.length === 0) {
    ElMessage.warning('请先选择 Excel 文件');
    return;
  }
  importing.value = true;
  try {
    const res = await axios.post('/admin/excel/import', { rows: previewRows.value });
    importResult.value = res.data.results || { success: 0, failed: 0, errors: [] };
    if (importResult.value.failed === 0) {
      ElMessage.success('导入完成');
      previewRows.value = [];
    } else {
      ElMessage.warning('导入完成，其中 ' + importResult.value.failed + ' 条失败');
    }
  } catch {
    ElMessage.error('导入失败，请检查后端服务');
  } finally {
    importing.value = false;
  }
}
</script>
