const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const BASE = 64n;
const EMPLOYEE_API_PATH = "/api/employees";
const CHAR_REGEX = new RegExp('^[' + ALPHABET.replace(/[-_\\]/g,'\\$&') + ']+$');

function toBase64(n) {
  if (n === 0n) return ALPHABET[0];
  let chars = [];
  while (n > 0n) { chars.push(ALPHABET[Number(n % BASE)]); n /= BASE; }
  return chars.reverse().join('');
}
function fromBase64(s) {
  let n = 0n;
  for (const ch of s) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('非法字符: ' + ch);
    n = n * BASE + BigInt(idx);
  }
  return n;
}
function md2int(m, d) { return (m - 1) * 31 + (d - 1); }
function int2md(v) { return [Math.floor(v / 31) + 1, (v % 31) + 1]; }
function encode(ei, m, d) { return toBase64(BigInt(ei) * 372n + BigInt(md2int(m, d))); }
function decode(code) {
  const n = fromBase64(code);
  const ei = Number(n / 372n);
  const [m, d] = int2md(Number(n % 372n));
  return [ei, m, d];
}

let fileDefaultStore = { version: 1, employees: [] };
let employeeStore = { version: 1, employees: [] };
let selIdx = 0;
let manageActiveOnly = false;
let dataLoadError = false;

function normalizeStore(rawStore) {
  const employees = Array.isArray(rawStore && rawStore.employees) ? rawStore.employees : [];
  const normalized = employees
    .map((employee) => ({
      codeIndex: Number(employee.codeIndex),
      name: String(employee.name || "").trim(),
      active: employee.active !== false
    }))
    .filter((employee) => Number.isInteger(employee.codeIndex) && employee.codeIndex >= 0 && employee.name)
    .sort((a, b) => a.codeIndex - b.codeIndex);

  const used = new Set();
  normalized.forEach((employee, index) => {
    if (used.has(employee.codeIndex)) {
      employee.codeIndex = index === 0 ? 0 : Math.max(...normalized.slice(0, index).map((item) => item.codeIndex)) + 1;
    }
    used.add(employee.codeIndex);
  });

  return {
    version: Number(rawStore && rawStore.version) || 1,
    employees: normalized
  };
}

function cloneStore(store) {
  return {
    version: store.version,
    employees: store.employees.map((employee) => ({
      codeIndex: employee.codeIndex,
      name: employee.name,
      active: employee.active
    }))
  };
}

function loadStore() {
  return cloneStore(fileDefaultStore);
}

function getEmployees() {
  return [...employeeStore.employees].sort((a, b) => a.codeIndex - b.codeIndex);
}

function getActiveEmployees() {
  return getEmployees().filter((employee) => employee.active !== false);
}

function getEmployeeMap() {
  return new Map(getEmployees().map((employee) => [employee.codeIndex, employee]));
}

function getEmployeeByCodeIndex(codeIndex) {
  return getEmployeeMap().get(codeIndex) || null;
}

function getMaxCodeLength() {
  const employees = getEmployees();
  if (employees.length === 0) return 0;
  const lastEmployee = employees[employees.length - 1];
  return encode(lastEmployee.codeIndex, 12, 31).length;
}

function renderEmpTable(filter = '') {
  const activeEmployees = getActiveEmployees();
  const tbody = document.getElementById('empTable');
  const f = filter.toLowerCase();
  let html = '<table>';
  let count = 0;
  activeEmployees.forEach((employee) => {
    if (f && !employee.name.toLowerCase().includes(f)) return;
    count++;
    html += `<tr class="${employee.codeIndex === selIdx ? 'sel' : ''}" onclick="selectEmp(${employee.codeIndex})">
      <td>${String(employee.codeIndex + 1).padStart(2,'0')}</td><td>${employee.name}</td></tr>`;
  });
  html += '</table>';
  tbody.innerHTML = html;
  document.getElementById('empCount').textContent = `显示 ${count} / ${activeEmployees.length} 名启用人员`;
}

function selectEmp(i) {
  selIdx = i;
  document.getElementById('encEmp').value = i;
  renderEmpTable(document.getElementById('empSearch').value);
  doEncode();
}

function ensureSelectedEmployee() {
  const activeEmployees = getActiveEmployees();
  if (activeEmployees.length === 0) {
    selIdx = 0;
    return;
  }
  if (!activeEmployees.some((employee) => employee.codeIndex === selIdx)) {
    selIdx = activeEmployees[0].codeIndex;
  }
}

let autoSetMonth = null;
let autoSetDay = null;
let serverDate = { month: new Date().getMonth() + 1, day: new Date().getDate() };

async function fetchServerDate() {
  const response = await fetch('/api/date', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

async function refreshServerDate() {
  try {
    const { month, day } = await fetchServerDate();
    serverDate = { month, day };
  } catch (_) {
    const now = new Date();
    serverDate = { month: now.getMonth() + 1, day: now.getDate() };
  }
}

function isDateAutoSet() {
  const curMonth = parseInt(document.getElementById('encMonth').value, 10);
  const curDay = parseInt(document.getElementById('encDay').value, 10);
  return autoSetMonth !== null && curMonth === autoSetMonth && curDay === autoSetDay;
}

function setDateToToday(triggerEncode = true) {
  autoSetMonth = serverDate.month;
  autoSetDay = serverDate.day;
  document.getElementById('encMonth').value = autoSetMonth;
  document.getElementById('encDay').value = autoSetDay;
  if (triggerEncode) doEncode();
}

function populateDateSelectors() {
  const encEmp = document.getElementById('encEmp');
  const m = document.getElementById('encMonth');
  m.innerHTML = Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  m.onchange = doEncode;

  const d = document.getElementById('encDay');
  d.innerHTML = Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
  d.onchange = doEncode;
  encEmp.onchange = function() { selIdx = parseInt(this.value, 10); renderEmpTable(); doEncode(); };
}

function renderEncodeEmployeeOptions() {
  const activeEmployees = getActiveEmployees();
  const encEmp = document.getElementById('encEmp');
  encEmp.innerHTML = activeEmployees.map((employee) =>
    `<option value="${employee.codeIndex}">${employee.name}</option>`
  ).join('');
  encEmp.value = String(selIdx);
}

function updateRulesSummary() {
  const activeEmployees = getActiveEmployees();
  const employees = getEmployees();
  document.getElementById('activeCount').textContent = activeEmployees.length;
  document.getElementById('totalCount').textContent = employees.length;
  document.getElementById('codeLength').textContent = getMaxCodeLength();
  if (employees.length > 0) {
    document.getElementById('eg1').textContent = encode(employees[0].codeIndex, 1, 1);
    document.getElementById('eg2').textContent = encode(employees[employees.length - 1].codeIndex, 12, 31);
  } else {
    document.getElementById('eg1').textContent = '—';
    document.getElementById('eg2').textContent = '—';
  }
}

function renderManagerSummary() {
  const employees = getEmployees();
  const activeEmployees = getActiveEmployees();
  document.getElementById('managerSummary').textContent =
    `当前共 ${employees.length} 人，其中启用 ${activeEmployees.length} 人。` +
    ' 修改会直接写回服务器上的 employees.json。';
}

function updateFileConnectionNote() {
  const note = document.getElementById('fileConnectionNote');
  if (!note) return;
  note.textContent = '页面会通过服务端接口直接读写服务器上的 `employees.json`。';
}

function renderManagerList() {
  const employees = getEmployees();
  const filter = document.getElementById('manageSearch').value.trim().toLowerCase();
  const list = manageActiveOnly ? employees.filter((employee) => employee.active) : employees;
  const filtered = list.filter((employee) => {
    const indexText = String(employee.codeIndex + 1);
    return !filter || employee.name.toLowerCase().includes(filter) || indexText.includes(filter);
  });

  document.getElementById('manageFilterBtn').textContent = manageActiveOnly ? '显示全部' : '仅看启用';
  if (filtered.length === 0) {
    document.getElementById('managerList').innerHTML = '<div class="manager-empty">没有匹配的人员</div>';
    return;
  }

  document.getElementById('managerList').innerHTML = filtered.map((employee) => `
    <div class="manager-row ${employee.active ? '' : 'inactive'}">
      <div>${String(employee.codeIndex + 1).padStart(2,'0')}</div>
      <div class="manager-row-name">${employee.name}</div>
      <div><span class="badge ${employee.active ? 'ok' : 'off'}">${employee.active ? '启用' : '停用'}</span></div>
      <div>
        <button class="btn btn-ghost" type="button" onclick="toggleEmployeeActive(${employee.codeIndex})">
          ${employee.active ? '停用' : '启用'}
        </button>
      </div>
    </div>
  `).join('');
}

function renderUI() {
  ensureSelectedEmployee();
  renderEncodeEmployeeOptions();
  renderEmpTable(document.getElementById('empSearch').value);
  updateRulesSummary();
  renderManagerSummary();
  updateFileConnectionNote();
  renderManagerList();
}

function renderAll() {
  renderUI();
  doEncode();
}

async function populateUI() {
  populateDateSelectors();
  await refreshServerDate();   // 先拿服务端时间
  setDateToToday(false);       // 只设下拉框，不编码
  renderUI();                  // 渲染页面
  doEncode();                  // 一次编码，不带冗余副作用
}

async function resetDate() {
  await refreshServerDate();
  setDateToToday();
}

let lastCode = '';

function showCopyFeedback(message, isError = false) {
  const fb = document.getElementById('copyFeedback');
  fb.textContent = message;
  fb.style.display = 'inline';
  fb.style.color = isError ? '#b71c1c' : 'var(--text-muted)';
  clearTimeout(showCopyFeedback.timerId);
  showCopyFeedback.timerId = setTimeout(() => {
    fb.style.display = 'none';
    fb.style.color = 'var(--text-muted)';
  }, isError ? 2400 : 1800);
}

function flashCopiedTarget(element) {
  const originalOpacity = element.style.opacity;
  const originalTransition = element.style.transition;
  element.style.transition = 'opacity 0.18s ease';
  element.style.opacity = '0.6';
  setTimeout(() => {
    element.style.opacity = originalOpacity || '1';
    element.style.transition = originalTransition || '';
  }, 180);
}

async function copyText(text) {
  const value = String(text || '').trim();
  if (!value) {
    throw new Error('没有可复制的内容');
  }

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (_) {
      // Fall back to the legacy copy path below.
    }
  }

  const helper = document.createElement('textarea');
  helper.value = value;
  helper.setAttribute('readonly', 'readonly');
  helper.style.position = 'fixed';
  helper.style.top = '-9999px';
  helper.style.left = '-9999px';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  helper.setSelectionRange(0, helper.value.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    helper.remove();
  }

  if (!copied) {
    throw new Error('浏览器阻止了复制');
  }
}

function doEncode() {
  const activeEmployees = getActiveEmployees();
  if (activeEmployees.length === 0) {
    document.getElementById('codeDisplay').textContent = '—';
    document.getElementById('codeMeta').textContent = '暂无启用人员';
    document.getElementById('copyBtn').style.visibility = 'hidden';
    lastCode = '';
    return;
  }
  const ei = parseInt(document.getElementById('encEmp').value, 10);
  const m = parseInt(document.getElementById('encMonth').value, 10);
  const d = parseInt(document.getElementById('encDay').value, 10);
  const code = encode(ei, m, d);
  const employee = getEmployeeByCodeIndex(ei);
  const name = employee ? employee.name : '未知人员';

  lastCode = code;
  document.getElementById('codeDisplay').textContent = code;
  document.getElementById('codeMeta').textContent = name + '  ·  ' + m + '月' + d + '日';
  document.getElementById('copyBtn').style.visibility = 'visible';
  document.getElementById('encodeResultPanel').classList.remove('empty');
  document.getElementById('copyFeedback').style.display = 'none';
}

async function copyCode() {
  try {
    await copyText(lastCode);
    showCopyFeedback('已复制');
    flashCopiedTarget(document.getElementById('codeDisplay'));
  } catch (error) {
    showCopyFeedback(error.message || '复制失败', true);
  }
}

function clearDecode() {
  document.getElementById('decodeInput').value = '';
  const r = document.getElementById('decodeResult');
  r.textContent = '输入编码后自动解码';
  r.className = 'decode-result wait';
}

function handleDecodeInput() {
  const code = this.value.trim();
  const r = document.getElementById('decodeResult');
  if (!code) { r.textContent = '输入编码后自动解码'; r.className = 'decode-result wait'; return; }
  if (!CHAR_REGEX.test(code)) {
    r.textContent = '包含非法字符'; r.className = 'decode-result err'; return;
  }
  try {
    const [ei, m, d] = decode(code);
    const employee = getEmployeeByCodeIndex(ei);
    if (employee) {
      r.textContent = employee.name + (employee.active ? '' : '（已停用）') + '  |  ' + m + '月' + d + '日';
      r.className = 'decode-result ok';
    } else {
      r.textContent = '序号 ' + (ei+1) + ' 超出名单范围(' + getEmployees().length + '人)';
      r.className = 'decode-result err';
    }
  } catch(e) {
    r.textContent = '解码失败: ' + e.message;
    r.className = 'decode-result err';
  }
}

function setManagerStatus(message, type = 'ok') {
  const status = document.getElementById('managerStatus');
  status.textContent = message;
  status.className = `manager-status ${type}`;
}

function openManager() {
  document.body.classList.add('modal-open');
  document.getElementById('managerBackdrop').classList.add('open');
  renderManagerSummary();
  renderManagerList();
}

function closeManager(event) {
  if (event && event.target && event.target !== document.getElementById('managerBackdrop')) return;
  document.body.classList.remove('modal-open');
  document.getElementById('managerBackdrop').classList.remove('open');
}

function triggerImport() {
  document.getElementById('importFileInput').click();
}

async function writeCurrentStoreToServer(successMessage) {
  try {
    const response = await fetch(EMPLOYEE_API_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: toEmployeesJsonText()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const savedStore = normalizeStore(await response.json());
    employeeStore = cloneStore(savedStore);
    fileDefaultStore = cloneStore(employeeStore);
    setManagerStatus(successMessage || '已保存到服务器。');
    renderAll();
    return true;
  } catch (error) {
    setManagerStatus(`保存到服务器失败：${error.message || '未知错误'}`, 'err');
    return false;
  }
}

async function addEmployeeFromUI() {
  const input = document.getElementById('manageNameInput');
  const name = input.value.trim();
  if (!name) {
    setManagerStatus('请输入要新增的姓名。', 'err');
    return;
  }
  if (getEmployees().some((employee) => employee.name === name)) {
    setManagerStatus(`人员已存在：${name}`, 'err');
    return;
  }
  const employees = getEmployees();
  const nextCodeIndex = employees.length === 0 ? 0 : employees[employees.length - 1].codeIndex + 1;
  const previousStore = cloneStore(employeeStore);
  employeeStore.employees.push({ codeIndex: nextCodeIndex, name, active: true });
  const success = await writeCurrentStoreToServer(`已新增 ${name}，并写入服务器。`);
  if (success) {
    input.value = '';
    return;
  }
  employeeStore = previousStore;
  renderAll();
}

async function toggleEmployeeActive(codeIndex) {
  const employee = employeeStore.employees.find((item) => item.codeIndex === codeIndex);
  if (!employee) return;
  const previousStore = cloneStore(employeeStore);
  employee.active = !employee.active;
  const actionLabel = employee.active ? '启用' : '停用';
  const success = await writeCurrentStoreToServer(`${employee.name} 已${actionLabel}，并写入服务器。`);
  if (success) return;
  employeeStore = previousStore;
  renderAll();
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toEmployeesJsonText() {
  return JSON.stringify({
    version: employeeStore.version,
    employees: getEmployees()
  }, null, 2) + '\n';
}

function exportEmployeesJson() {
  downloadTextFile('employees.json', toEmployeesJsonText());
  setManagerStatus('已导出 employees.json。');
}

function applyImportedStore(rawStore) {
  const normalized = normalizeStore(rawStore);
  const previousStore = cloneStore(employeeStore);
  employeeStore = normalized;
  writeCurrentStoreToServer('已导入人员数据，并写入服务器。').then((success) => {
    if (success) return;
    employeeStore = previousStore;
    renderAll();
  });
}

function resetManagerData() {
  reloadEmployeesFromServer();
}

async function reloadEmployeesFromServer() {
  const previousStore = cloneStore(employeeStore);
  try {
    const reloadedStore = await fetchDefaultStore();
    fileDefaultStore = cloneStore(reloadedStore);
    employeeStore = cloneStore(reloadedStore);
    setManagerStatus('已重新读取服务器当前内容。');
    renderAll();
  } catch (error) {
    employeeStore = previousStore;
    setManagerStatus(`重新读取失败：${error.message || '未知错误'}`, 'err');
    renderAll();
  }
}

function toggleManageActiveOnly() {
  manageActiveOnly = !manageActiveOnly;
  renderManagerList();
}

// ============ 事件绑定 ============

function bindEvents() {
  document.getElementById('codeDisplay').addEventListener('click', function() {
    if (lastCode) copyCode();
  });

  document.getElementById('decodeResult').addEventListener('click', function() {
    if (this.classList.contains('ok')) {
      const text = this.textContent.trim();
      copyText(text).then(function() {
        showCopyFeedback('已复制解码结果');
        flashCopiedTarget(this);
      }.bind(this)).catch(function(error) {
        showCopyFeedback(error.message || '复制失败', true);
      });
    }
  });

  document.getElementById('decodeInput').addEventListener('input', handleDecodeInput);

  document.getElementById('importFileInput').addEventListener('change', function() {
    const file = this.files && this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function() {
      try {
        applyImportedStore(JSON.parse(String(reader.result || '{}')));
      } catch (error) {
        setManagerStatus('导入失败：JSON 格式不正确。', 'err');
      }
    };
    reader.readAsText(file, 'utf-8');
    this.value = '';
  });

  document.getElementById('manageSearch').addEventListener('input', function() {
    renderManagerList();
  });

  document.getElementById('manageNameInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') addEmployeeFromUI();
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeManager();
  });

  document.getElementById('empSearch').addEventListener('input', function() {
    renderEmpTable(this.value);
  });
}

async function fetchDefaultStore() {
  const response = await fetch(EMPLOYEE_API_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return normalizeStore(await response.json());
}

async function initApp() {
  try {
    fileDefaultStore = await fetchDefaultStore();
  } catch (_) {
    fileDefaultStore = { version: 1, employees: [] };
    dataLoadError = true;
  }

  employeeStore = loadStore();
  const initialEmployees = getEmployees();
  if (initialEmployees.length > 0) {
    selIdx = getActiveEmployees().length > 0 ? getActiveEmployees()[0].codeIndex : initialEmployees[0].codeIndex;
  }
  await populateUI();
  if (dataLoadError && initialEmployees.length === 0) {
    document.getElementById('empCount').textContent = '未能读取服务器上的 employees.json';
    document.getElementById('codeMeta').textContent = '请检查服务端 API 是否已启动';
  }

  setInterval(async function() {
    if (!isDateAutoSet()) return;           // 用户手动改过日期，不覆盖
    await refreshServerDate();
    if (autoSetMonth !== serverDate.month || autoSetDay !== serverDate.day) {
      setDateToToday();
    }
  }, 30000);
}

bindEvents();
initApp();
