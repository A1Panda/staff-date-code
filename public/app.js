// 不含易混淆字符: 0 O o 1 I l，不含特殊符号 _ -（共56个字符）
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const BASE = 56n;
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
// 第1位=人员，第2位=月，第3位=日，固定3位
function encode(ei, m, d) { return toBase64(BigInt(ei)) + toBase64(BigInt(m - 1)) + toBase64(BigInt(d - 1)); }
function decode(code) {
  const ei = Number(fromBase64(code[0]));
  const m = Number(fromBase64(code[1])) + 1;
  const d = Number(fromBase64(code[2])) + 1;
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
  return 3; // 固定3位：1位人员 + 2位日期
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
  var employees = getEmployees();
  var empMap = new Map();
  employees.forEach(function(e) { empMap.set(e.codeIndex, e); });

  var filter = document.getElementById('manageSearch').value.trim().toLowerCase();
  var slots = [];
  for (var i = 0; i < 56; i++) {
    var emp = empMap.get(i);
    if (emp) {
      if (manageActiveOnly && !emp.active) continue;
      if (filter && !emp.name.toLowerCase().includes(filter) && !String(i+1).includes(filter)) continue;
      slots.push({ codeIndex: i, name: emp.name, active: emp.active, firstChar: ALPHABET[i], empty: false });
    } else {
      if (manageActiveOnly) continue;
      if (filter && !String(i+1).includes(filter)) continue;
      slots.push({ codeIndex: i, name: '', active: true, firstChar: ALPHABET[i], empty: true });
    }
  }

  document.getElementById('manageFilterBtn').textContent = manageActiveOnly ? '显示全部' : '仅看启用';
  if (slots.length === 0) {
    document.getElementById('managerList').innerHTML = '<div class="manager-empty">没有匹配的槽位</div>';
    return;
  }

  document.getElementById('managerList').innerHTML = slots.map(function(s) {
    var rowClass = s.empty ? 'manager-row empty-slot' : ('manager-row ' + (s.active ? '' : 'inactive'));
    var badge = s.empty
      ? '<span class="badge off">空位</span>'
      : ('<span class="badge ' + (s.active ? 'ok' : 'off') + '">' + (s.active ? '启用' : '停用') + '</span>');
    var actionBtn = s.empty ? '' :
      '<button class="btn btn-ghost" type="button" onclick="toggleEmployeeActive(' + s.codeIndex + ')">' +
      (s.active ? '停用' : '启用') + '</button>';
    return '<div class="' + rowClass + '">' +
      '<div class="slot-char">' + s.firstChar + '</div>' +
      '<div>' + String(s.codeIndex + 1).padStart(2,'0') + '</div>' +
      '<div><input class="slot-name-input" type="text" value="' + s.name + '" data-slot="' + s.codeIndex + '" placeholder="输入姓名"></div>' +
      '<div>' + badge + '</div>' +
      '<div>' + actionBtn + '</div>' +
    '</div>';
  }).join('');

  // 绑定输入框失焦保存
  document.querySelectorAll('.slot-name-input').forEach(function(input) {
    input.addEventListener('blur', function() {
      var slotIdx = parseInt(this.dataset.slot, 10);
      var newName = this.value.trim();
      saveSlotEmployee(slotIdx, newName, this);
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { this.blur(); }
    });
  });
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
  if (code.length !== 3) { r.textContent = '编码固定为3位（第1位人员，后2位日期）'; r.className = 'decode-result err'; return; }
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

async function saveSlotEmployee(codeIndex, newName, inputEl) {
  var previousStore = cloneStore(employeeStore);
  var emp = getEmployeeByCodeIndex(codeIndex);

  if (!newName) {
    // 清空槽位 — 直接移除人员
    if (emp) {
      var idx = employeeStore.employees.findIndex(function(e) { return e.codeIndex === codeIndex; });
      if (idx !== -1) {
        employeeStore.employees.splice(idx, 1);
        await writeCurrentStoreToServer('已清除槽位 ' + ALPHABET[codeIndex] + '（原: ' + emp.name + '）');
      }
    }
    return;
  }

  if (emp) {
    // 更新姓名或重新启用
    if (emp.name === newName && emp.active) return; // 没变化
    emp.name = newName;
    emp.active = true;
    await writeCurrentStoreToServer('已更新槽位 ' + ALPHABET[codeIndex] + ' 为 ' + newName);
  } else {
    // 新槽位新增
    if (codeIndex > 55) {
      setManagerStatus('槽位序号不能超过 55。', 'err');
      employeeStore = previousStore;
      renderAll();
      return;
    }
    if (getEmployees().some(function(e) { return e.name === newName; })) {
      setManagerStatus('人员已存在：' + newName, 'err');
      employeeStore = previousStore;
      renderAll();
      return;
    }
    employeeStore.employees.push({ codeIndex: codeIndex, name: newName, active: true });
    await writeCurrentStoreToServer('已新增 ' + newName + '（首位: ' + ALPHABET[codeIndex] + '）');
  }

  if (inputEl) {
    // 刷新后保持焦点
    setTimeout(function() {
      renderManagerList();
      renderManagerSummary();
      updateRulesSummary();
      renderEncodeEmployeeOptions();
      renderEmpTable(document.getElementById('empSearch').value);
      ensureSelectedEmployee();
      doEncode();
    }, 100);
  }
}

async function toggleEmployeeActive(codeIndex) {
  var employee = employeeStore.employees.find(function(e) { return e.codeIndex === codeIndex; });
  if (!employee) return;
  var previous = cloneStore(employeeStore);
  employee.active = !employee.active;
  var label = employee.active ? '启用' : '停用';
  var success = await writeCurrentStoreToServer(employee.name + ' 已' + label);
  if (success) return;
  employeeStore = previous;
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
  setManagerStatus('已导出 JSON。');
}

function exportCodeMapping() {
  var employees = getEmployees();
  var empMap = new Map();
  employees.forEach(function(e) { empMap.set(e.codeIndex, e); });

  var rows = [['首位','序号','姓名','状态']];
  for (var i = 0; i < 56; i++) {
    var emp = empMap.get(i);
    rows.push([
      ALPHABET[i],
      String(i + 1),
      emp ? emp.name : '—',
      emp ? (emp.active ? '启用' : '停用') : '空位'
    ]);
  }

  var csv = '\uFEFF' + rows.map(function(r) { return r.join(','); }).join('\r\n');
  downloadTextFile('编码对照表.csv', csv);
  setManagerStatus('已导出编码对照表（56个槽位）。');
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
