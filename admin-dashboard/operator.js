// Trang Operator gọi mountOperator sau khi đăng nhập chung.
// Hàm request dùng chung đính kèm JWT và báo lỗi HTTP qua error.status.
export function mountOperator(root, {
  session,
  api = {},
  onLoginRequired,
  onForbidden,
  onLogout
}) {
  const view = document.createElement('section');
  view.className = 'fv-operator';
  root.replaceChildren(view);

  const append = (parent, tag, value) => {
    const node = document.createElement(tag);
    if (value != null) node.textContent = value;
    parent.append(node);
    return node;
  };

  const header = append(view, 'header');
  header.className = 'fv-operator-header';
  append(header, 'h1', 'Tổng quan vận hành');
  const user = append(header, 'div');
  user.className = 'fv-operator-user';
  append(user, 'span', 'Không gian Operator');
  append(user, 'strong', session?.user?.fullname || session?.fullname || '');
  const logout = append(user, 'button', 'Đăng xuất');
  logout.type = 'button';
  logout.onclick = () => onLogout?.();

  const status = append(view, 'p');
  status.setAttribute('role', 'status');

  const reject = (code) => {
    status.textContent = code === 401
      ? 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.'
      : 'Bạn không có quyền truy cập.';

    view.querySelectorAll('button, select, input').forEach(node => {
      node.disabled = true;
    });

    if (code === 401) onLoginRequired?.();
    else onForbidden?.();
  };

  // expiresAt là trường tùy chọn, tính bằng mili giây theo thời gian Unix.
  if (!session || (session.expiresAt != null && Date.now() >= session.expiresAt)) {
    return reject(401);
  }

  if (String(session.role).toLowerCase() !== 'operator') {
    return reject(403);
  }

  append(view, 'style', `
    .fv-operator {
      font: 16px Inter, system-ui, sans-serif;
      color: #172c27;
      background: #f5f8f5;
      padding: clamp(1rem, 4vw, 3rem);
      border-radius: 16px;
    }

    .fv-operator h1 { margin: 0; font-size: 2rem; }
    .fv-operator h2 { font-size: 1.2rem; }

    .fv-operator-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }

    .fv-operator-user {
      display: flex;
      align-items: center;
      gap: .75rem;
      color: #53675e;
    }

    .fv-operator article {
      background: white;
      border: 1px solid #d5e2da;
      border-radius: 12px;
      padding: 1rem;
      margin-block: 1rem;
      overflow: auto;
    }

    .fv-operator table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    .fv-operator th,
    .fv-operator td {
      padding: .65rem;
      border-bottom: 1px solid #d5e2da;
    }

    .fv-operator form {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: .75rem;
    }

    .fv-operator label { display: grid; gap: .25rem; }

    .fv-operator button,
    .fv-operator input,
    .fv-operator select {
      font: inherit;
      padding: .55rem;
      border-radius: 6px;
      border: 1px solid #a7bdb1;
    }

    .fv-operator button {
      background: #175b43;
      color: white;
      cursor: pointer;
    }

    .fv-operator button:disabled {
      opacity: .5;
      cursor: default;
    }

    @media (max-width: 640px) {
      .fv-operator-header {
        align-items: flex-start;
        flex-direction: column;
      }

      .fv-operator-user {
        flex-wrap: wrap;
      }

      .fv-operator th,
      .fv-operator td {
        white-space: nowrap;
      }
    }
  `);

  const panel = (parent, title) => {
    const node = append(parent, 'article');
    append(node, 'h2', title);
    return node;
  };

  const machines = panel(view, 'Danh sách máy');
  const detail = append(view, 'div');

  let selected;
  let requestId = 0;
  let blocked = false;
  let saving = false;

  const fail = (error) => {
    if (error.status === 401 || error.status === 403) {
      blocked = true;
      reject(error.status);
    } else {
      status.textContent =
        'Thao tác chưa hoàn tất. Vui lòng kiểm tra kết nối và thử lại.';
    }
  };

  const table = (parent, headers, rows) => {
    if (!rows.length) {
      return append(parent, 'p', 'Chưa có dữ liệu.');
    }

    const grid = append(parent, 'table');
    const head = append(append(grid, 'thead'), 'tr');

    headers.forEach(label => {
      append(head, 'th', label).scope = 'col';
    });

    const body = append(grid, 'tbody');

    rows.forEach(values => {
      const row = append(body, 'tr');

      values.forEach(value => {
        const cell = append(row, 'td');

        if (value instanceof Node) cell.append(value);
        else cell.textContent = value ?? '—';
      });
    });
  };

  const action = (parent, title, method, fields, params) => {
    const box = panel(parent, title);

    if (!api[method]) {
      return append(box, 'p', 'Chờ API backend cho chức năng này.');
    }

    if (fields.some(([, , type, options]) => type === 'select' && !options.length)) {
      return append(box, 'p', 'Chưa có cột hàng hoặc sản phẩm để chọn.');
    }

    const form = append(box, 'form');

    for (const [name, label, type, options] of fields) {
      const wrapper = append(form, 'label', label);
      const input = append(wrapper, type === 'select' ? 'select' : 'input');

      input.name = name;
      input.required = name !== 'note';

      if (type === 'select') {
        for (const item of options) {
          append(input, 'option', item.label).value = item.id;
        }
      } else {
        input.type = type;

        if (type === 'number') {
          input.min = name === 'quantity' ? '1' : '0';
          input.step = name === 'price' ? '0.01' : '1';
        }
      }
    }

    const button = append(form, 'button', 'Lưu');

    form.onsubmit = async event => {
      event.preventDefault();

      if (blocked || saving || button.disabled || !form.reportValidity()) return;

      const payload = Object.fromEntries(new FormData(form));

      if ('quantity' in payload) payload.quantity = Number(payload.quantity);
      if ('price' in payload) payload.price = Number(payload.price);

      saving = true;
      button.disabled = true;

      try {
        await api[method]({ ...params, ...payload });
        status.textContent = 'Đã lưu.';
        form.reset();

        if (selected?.id === params.machineId) {
          await showMachine(selected);
        }
      } catch (error) {
        fail(error);
      } finally {
        saving = false;
        if (!blocked) button.disabled = false;
      }
    };
  };

  // Router dùng chung kiểm soát quyền vào trang Admin.
  // Backend kiểm tra token và quyền trên từng API.
  async function showMachine(machine) {
    selected = machine;
    const current = ++requestId;
    detail.replaceChildren();

    const slotsPanel = panel(detail, 'Chi tiết máy ' + (machine.code ?? machine.id));

    if (!api.getMachine) {
      return append(slotsPanel, 'p', 'Chờ API chi tiết máy và tồn kho.');
    }

    const loading = append(slotsPanel, 'p', 'Đang tải dữ liệu…');

    try {
      const { slots, products = [] } = await api.getMachine(machine.id);
      if (blocked || current !== requestId) return;

      loading.remove();

      const label = append(slotsPanel, 'label', 'Lọc theo khe');
      const filter = append(label, 'select');
      append(filter, 'option', 'Tất cả khe').value = '';

      const uniqueSlots = new Map(slots.map(slot => [slot.id, slot.code]));

      for (const [id, code] of uniqueSlots) {
        append(filter, 'option', code).value = id;
      }

      const inventory = append(slotsPanel, 'div');

      const renderInventory = () => {
        inventory.replaceChildren();

        const visible = slots.filter(slot =>
          !filter.value || String(slot.id) === filter.value
        );

        table(
          inventory,
          ['Cột hàng', 'Sản phẩm', 'Tồn kho', 'Tình trạng'],
          visible.map(slot => {
            let condition = '—';

            if (slot.lowStock === true) {
              condition = document.createElement('strong');
              condition.textContent = 'Tồn thấp';
              condition.style.color = '#a12d13';
            }

            return [slot.code, slot.product, slot.quantity, condition];
          })
        );
      };

      filter.onchange = renderInventory;
      renderInventory();

      const params = { machineId: machine.id };
      const slotOptions = [...uniqueSlots].map(([id, code]) => ({ id, label: code }));
      const restockSlotOptions = slotOptions.filter(option =>
        slots.some(slot => String(slot.id) === String(option.id) && slot.productId)
      );
      const unassignedSlotOptions = slotOptions.filter(option =>
        slots.some(slot => String(slot.id) === String(option.id) && !slot.productId)
      );
      const productField = ['productId', 'Sản phẩm', 'select', products];

      action(detail, 'Bổ sung hàng', 'restock', [
        ['slotId', 'Cột hàng', 'select', restockSlotOptions],
        ['quantity', 'Số lượng', 'number'],
        ['note', 'Ghi chú', 'text']
      ], params);

      action(detail, 'Phân bổ sản phẩm', 'assignProduct', [
        ['slotId', 'Cột hàng', 'select', unassignedSlotOptions],
        productField
      ], params);

      const alerts = panel(detail, 'Cảnh báo');

      if (typeof api.listAlerts === 'function') {
        const pending = append(alerts, 'p', 'Đang tải cảnh báo…');

        void Promise.resolve()
          .then(() => api.listAlerts(machine.id))
          .then(rows => {
            if (blocked || current !== requestId) return;

            table(
              alerts,
              ['Loại cảnh báo', 'Thời điểm', 'Nội dung'],
              rows.map(row => [row.type, row.createdAt, row.reason])
            );
          })
          .catch(error => {
            if (blocked) return;

            if ([401, 403].includes(error.status)) {
              fail(error);
            } else if (current === requestId) {
              append(alerts, 'p', 'Không tải được cảnh báo.');
            }
          })
          .finally(() => pending.remove());
      } else {
        append(alerts, 'p', 'Chờ API cảnh báo.');
      }

      const history = panel(detail, 'Lịch sử bổ sung');

      if (!api.listRestocks) {
        return append(history, 'p', 'Chờ API lịch sử bổ sung.');
      }

      const rows = await api.listRestocks(machine.id);

      if (!blocked && current === requestId) {
        table(
          history,
          ['Thời điểm', 'Số khe', 'Tổng số lượng', 'Ghi chú', 'Nhân viên'],
          rows.map(row => [
            row.restockDate,
            row.itemCount,
            row.totalAdded,
            row.notes,
            row.operatorName
          ])
        );
      }
    } catch (error) {
      loading.remove();

      if ([401, 403].includes(error.status) || current === requestId) {
        fail(error);
      }
    }
  }

  async function loadMachines() {
    if (!api.listMachines) {
      return append(machines, 'p', 'Chờ API danh sách máy.');
    }

    const loading = append(machines, 'p', 'Đang tải danh sách máy…');

    try {
      const rows = await api.listMachines();

      table(
        machines,
        ['Máy', 'Kết nối', 'Trạng thái', 'Nhiệt độ'],
        rows.map(machine => {
          const button = document.createElement('button');
          button.textContent = machine.code ?? machine.id;

          button.onclick = () => {
            if (!blocked) return showMachine(machine);
          };

          const connection = machine.online == null
            ? '—'
            : machine.online ? 'Online' : 'Offline';

          const temperature = machine.temperature == null
            ? null
            : machine.temperature + ' °C';

          return [button, connection, machine.status, temperature];
        })
      );
    } catch (error) {
      fail(error);
    } finally {
      loading.remove();
    }
  }

  return loadMachines();
}

// request nhận đường dẫn tương đối với API base URL và tự đính kèm JWT.
export function createOperatorApi(request) {
  async function getActiveProducts() {
    const rows = [];
    let page = 1;
    let totalPages = 1;

    do {
      const params = new URLSearchParams({ page: String(page), limit: '100' });
      const response = await request(`/products?${params}`);
      rows.push(...(response.data || []));
      totalPages = response.pagination?.totalPages || 1;
      page += 1;
    } while (page <= totalPages);

    return rows.map(product => ({
      id: product.productId,
      label: product.productName
    }));
  }

  return {
    async listMachines() {
      const { data } = await request('/machines');

      return data.map(machine => ({
        id: machine.id,
        code: machine.machineCode,
        online: machine.isOnline,
        status: machine.operationStatus,
        temperature: machine.temperature
      }));
    },

    async listAlerts(machineId) {
      const params = new URLSearchParams({
        machineId,
        page: '1',
        limit: '20',
        status: 'OPEN'
      });
      const { data } = await request(`/admin/alerts?${params}`);

      return data.map(alert => ({
        type: alert.alertType,
        createdAt: alert.createdAt,
        reason: alert.message
      }));
    },

    async getMachine(id) {
      const path = `/inventory/machines/${encodeURIComponent(id)}`;
      const { data } = await request(path);
      const rows = data.filter(row => row.slot_id != null);

      return {
        slots: rows.map(row => ({
          id: row.slot_id,
          code: row.slot_code,
          productId: row.product_id,
          product: row.product_name || 'Chưa phân bổ',
          quantity: row.quantity ?? 0,
          lowStock: row.product_id != null
            && Number(row.available_quantity ?? row.quantity) <= 3
        })),
        products: await getActiveProducts()
      };
    },

    async restock({ machineId, slotId, quantity, note }) {
      const body = {
        machineId,
        items: [{ slotId, quantity }]
      };
      if (note?.trim()) body.notes = note.trim();

      return request('/inventory/restocks', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },

    async assignProduct({ slotId, productId }) {
      return request(`/inventory/slots/${encodeURIComponent(slotId)}/product`, {
        method: 'PUT',
        body: JSON.stringify({ productId, quantity: 0 })
      });
    },

    async listRestocks(machineId) {
      const params = new URLSearchParams({
        machineId,
        page: '1',
        limit: '20'
      });
      const { data } = await request(`/inventory/restocks?${params}`);
      return data;
    }
  };
}