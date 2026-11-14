import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  authApi,
  clearSession,
  dashboardApi,
  exportCsv,
  formatDate,
  formatMoney,
  readSession,
  saveSession,
} from './api.js';

const NAV_ITEMS = [
  { id: 'overview', label: 'Tổng quan', icon: 'grid' },
  { id: 'machines', label: 'Máy bán hàng', icon: 'machine', group: 'VẬN HÀNH' },
  { id: 'inventory', label: 'Tồn kho', icon: 'box' },
  { id: 'catalog', label: 'Sản phẩm', icon: 'leaf', group: 'DANH MỤC' },
  { id: 'accounts', label: 'Tài khoản', icon: 'users', group: 'QUẢN TRỊ' },
  { id: 'alerts', label: 'Cảnh báo', icon: 'bell' },
  { id: 'reports', label: 'Báo cáo', icon: 'chart' },
  { id: 'settings', label: 'Cấu hình', icon: 'settings' },
];

const ICONS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  machine: <><rect x="5" y="2.5" width="14" height="19" rx="2.5" /><path d="M8 6h8v6H8zM8 16h.01M12 16h.01M16 16h.01M9 19h6" /></>,
  box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
  leaf: <><path d="M20.5 3.5c-8.2-.5-14.4 2.8-14.4 9.2a5.8 5.8 0 0 0 5.8 5.8c6.4 0 9.7-6.2 9.2-14.4-.1-.4-.2-.5-.6-.6Z" /><path d="M3 21c3-5.5 7-8.5 12-11" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></>,
  chart: <><path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4L7.1 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  down: <path d="m7 10 5 5 5-5" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3ZM19 14l1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z" /></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
};

function Icon({ name, size = 20, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name] || ICONS.info}</svg>;
}

function StatusBadge({ value }) {
  const normalized = String(value || 'UNKNOWN').toUpperCase();
  const tone = ['ONLINE', 'ACTIVE', 'IDLE', 'NORMAL', 'CLOSED'].includes(normalized)
    ? 'good'
    : ['OFFLINE', 'ERROR', 'FAULT', 'MAINTENANCE', 'OPEN', 'INACTIVE'].includes(normalized)
      ? 'bad'
      : ['BUSY', 'DISPENSING'].includes(normalized) ? 'warm' : 'neutral';
  const labels = {
    ONLINE: 'Trực tuyến', OFFLINE: 'Ngoại tuyến', ACTIVE: 'Đang hoạt động',
    INACTIVE: 'Ngừng hoạt động', IDLE: 'Sẵn sàng', BUSY: 'Đang bận',
    DISPENSING: 'Đang phân phối', ERROR: 'Lỗi', MAINTENANCE: 'Bảo trì',
    NORMAL: 'Bình thường', FAULT: 'Hỏng', OPEN: 'Đang mở', CLOSED: 'Đã đóng',
    UNKNOWN: 'Chưa có dữ liệu',
  };
  return <span className={`status-badge status-${tone}`}><i />{labels[normalized] || normalized}</span>;
}

function PageTitle({ eyebrow, title, description, actions }) {
  return <div className="page-title-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function EmptyState({ title, description }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="info" size={22} /></span><strong>{title}</strong><p>{description}</p></div>;
}

function LoadingState({ label = 'Đang tải dữ liệu...' }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>;
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await authApi.login(email.trim(), password);
      if (!['ADMIN', 'OPERATOR'].includes(result.user?.role)) {
        throw new Error('Tài khoản không có vai trò được hỗ trợ. Vui lòng liên hệ quản trị viên.');
      }
      onLogin({ token: result.token, user: result.user });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-art">
        <div className="login-art-top"><BrandMark /><span className="login-art-label">ADMIN &amp; OPERATOR</span></div>
        <div className="login-art-copy"><span className="welcome-pill"><span /> FRESHVEND OPERATIONS</span><h1>Vận hành tươi mới.<br /><em>Mỗi ngày.</em></h1><p>Một điểm đăng nhập chung. Không gian làm việc sẽ tự hiển thị theo vai trò của bạn.</p></div>
        <div className="login-illustration" aria-hidden="true"><div className="sun-orb" /><div className="plant plant-one"><i /><i /><i /><b /></div><div className="plant plant-two"><i /><i /><i /><b /></div><div className="machine-illustration"><div className="machine-top">FRESH<span>VEND</span></div><div className="machine-glass"><span className="fruit fruit-a" /><span className="fruit fruit-b" /><span className="fruit fruit-c" /><span className="fruit fruit-d" /><span className="fruit fruit-e" /><span className="fruit fruit-f" /></div><div className="machine-slot" /><div className="machine-base" /></div><div className="art-leaf leaf-a" /><div className="art-leaf leaf-b" /></div>
        <div className="login-art-footer"><span>FRESH FOOD · SMART TECHNOLOGY</span><span>© 2026 FreshVend</span></div>
      </section>
      <section className="login-panel"><div className="login-form-wrap"><div className="mobile-login-brand"><BrandMark /></div><div className="login-heading"><p className="eyebrow">CỔNG NHÂN VIÊN FRESHVEND</p><h2>Đăng nhập</h2><p>Dành cho tài khoản Admin và Operator. Hệ thống sẽ đưa bạn đến đúng giao diện theo vai trò.</p></div><form onSubmit={submit} className="login-form"><label>Email<div className="input-wrap"><Icon name="users" size={18} /><input type="email" autoComplete="username" placeholder="Nhập email tài khoản" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></label><label>Mật khẩu<div className="input-wrap"><Icon name="settings" size={18} /><input type="password" autoComplete="current-password" placeholder="Nhập mật khẩu" value={password} onChange={(event) => setPassword(event.target.value)} required /></div></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary login-submit" disabled={busy}>{busy ? <><span className="spinner spinner-light" /> Đang xác thực...</> : <>Đăng nhập <Icon name="arrow" size={17} /></>}</button></form><div className="login-security"><Icon name="check" size={17} /><span>Một màn hình đăng nhập · Phân quyền theo vai trò</span></div><p className="login-note">Admin và Operator dùng chung email/mật khẩu đã được cấp. Giao diện được chọn tự động sau khi đăng nhập.</p></div><div className="login-footer">FreshVend Staff Portal <span>·</span> Quản trị &amp; vận hành</div></section>
    </main>
  );
}

function BrandMark() {
  return <div className="brand-mark"><span className="brand-icon"><Icon name="leaf" size={21} /></span><span className="brand-name">fresh<span>vend</span></span></div>;
}

function Sidebar({ active, setActive, user, onLogout, open, onClose }) {
  return <>
    {open && <button className="mobile-scrim" aria-label="Đóng menu" onClick={onClose} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><BrandMark /><button className="icon-button mobile-close" aria-label="Đóng menu" onClick={onClose}><Icon name="close" /></button></div>
      <div className="workspace-switch"><span className="workspace-avatar"><Icon name="leaf" size={18} /></span><span className="workspace-text"><strong>FreshVend</strong><small>Workspace chính</small></span><Icon name="down" size={15} /></div>
      <nav className="nav-list" aria-label="Điều hướng chính">
        {NAV_ITEMS.map((item, index) => <div key={item.id}>{item.group && <p className={`nav-group ${index ? 'nav-group-spaced' : ''}`}>{item.group}</p>}<button className={`nav-item ${active === item.id ? 'nav-item-active' : ''}`} onClick={() => { setActive(item.id); onClose(); }}><Icon name={item.icon} size={19} /><span>{item.label}</span>{item.id === 'alerts' && <span className="nav-mini-dot" />}</button></div>)}
      </nav>
      <div className="sidebar-bottom"><div className="support-card"><div className="support-icon"><Icon name="spark" size={17} /></div><strong>FreshVend Admin</strong><p>Trung tâm quản lý vận hành của bạn.</p><span>Phiên bản 1.0.0</span></div><div className="sidebar-user"><span className="user-avatar">{initials(user.fullname)}</span><span className="user-details"><strong>{user.fullname}</strong><small>Quản trị viên</small></span><button className="icon-button logout-button" aria-label="Đăng xuất" title="Đăng xuất" onClick={onLogout}><Icon name="logout" size={18} /></button></div></div>
    </aside>
  </>;
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(-2).map((part) => part[0] || '').join('').toUpperCase() || 'FV';
}

function App() {
  const [session, setSession] = useState(() => readSession());
  const [checkingSession, setCheckingSession] = useState(Boolean(readSession()));
  const [active, setActive] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState({ machines: [], products: [], categories: [], users: [], alerts: [] });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [machineDetail, setMachineDetail] = useState(null);
  const [roleEdit, setRoleEdit] = useState(null);
  const [roleBusy, setRoleBusy] = useState(false);

  const logout = useCallback((message = '') => {
    clearSession();
    setSession(null);
    setData({ machines: [], products: [], categories: [], users: [], alerts: [] });
    setErrors({});
    setMachineDetail(null);
    if (message) setNotice(message);
  }, []);
  const handleSessionExpired = useCallback(
    () => logout('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'),
    [logout],
  );

  useEffect(() => {
    let activeEffect = true;
    async function verify() {
      const saved = readSession();
      if (!saved?.token) {
        setCheckingSession(false);
        return;
      }
      try {
        const result = await authApi.profile(saved.token);
        if (!activeEffect) return;
        if (!['ADMIN', 'OPERATOR'].includes(result.user?.role)) {
          logout('Tài khoản không còn vai trò được hỗ trợ. Vui lòng đăng nhập lại.');
          return;
        }
        const verified = { ...saved, user: result.user };
        saveSession(verified);
        setSession(verified);
      } catch {
        if (activeEffect) logout('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      } finally {
        if (activeEffect) setCheckingSession(false);
      }
    }
    verify();
    return () => { activeEffect = false; };
  }, [logout]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let cancelled = false;
    setLoading(true);
    const token = session.token;
    const requests = [
      ['machines', () => dashboardApi.machines(token)],
      ...(session.user.role === 'ADMIN' ? [
        ['products', () => dashboardApi.products(token)],
        ['categories', () => dashboardApi.categories(token)],
        ['users', () => dashboardApi.users(token)],
        ['alerts', () => dashboardApi.activeAlerts(token)],
      ] : []),
    ];
    Promise.all(requests.map(async ([key, request]) => {
      try {
        const response = await request();
        return [key, response, null];
      } catch (error) {
        return [key, null, error];
      }
    })).then((results) => {
      if (cancelled) return;
      const nextData = { machines: [], products: [], categories: [], users: [], alerts: [] };
      const nextErrors = {};
      for (const [key, response, error] of results) {
        if (error) {
          nextErrors[key] = error.message;
          if (error.status === 401) {
            logout('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            return;
          }
          continue;
        }
        if (key === 'machines') nextData.machines = response?.data || [];
        if (key === 'products') nextData.products = Array.isArray(response) ? response : response?.data || [];
        if (key === 'categories') nextData.categories = Array.isArray(response) ? response : response?.data || [];
        if (key === 'users') nextData.users = response?.users || [];
        if (key === 'alerts') nextData.alerts = response?.data || [];
      }
      setData(nextData);
      setErrors(nextErrors);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [session?.token, refreshKey, logout]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const alerts = useMemo(() => {
    return data.alerts
      .filter((alert) => alert.status !== 'RESOLVED')
      .map((alert) => ({
        ...alert,
        id: alert.alertId,
        severity: alert.severity.toLowerCase(),
        title: alert.alertType.replaceAll('_', ' '),
        detail: alert.message,
        machine: data.machines.find((machine) => machine.id === alert.machineId) || {
          id: alert.machineId,
          name: alert.machineName,
          machineCode: alert.machineCode,
        },
      }));
  }, [data.alerts, data.machines]);

  async function openMachine(machine) {
    setMachineDetail({ machine, loading: true, error: '' });
    try {
      const [machineResponse, slotsResponse] = await Promise.all([
        dashboardApi.machine(machine.id, session.token),
        dashboardApi.slots(machine.id, session.token),
      ]);
      const details = machineResponse.data || machineResponse;
      setMachineDetail({
        machine: { ...details, slots: slotsResponse.data || [] },
        loading: false,
        error: '',
      });
    } catch (error) {
      if (error.status === 401) {
        logout('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      setMachineDetail({ machine, loading: false, error: error.message });
    }
  }

  async function confirmRoleChange() {
    if (!roleEdit || !session) return;
    setRoleBusy(true);
    try {
      await dashboardApi.changeRole(roleEdit.user.user_id || roleEdit.user.id, roleEdit.role, session.token);
      setNotice(`Đã cập nhật vai trò cho ${roleEdit.user.fullname}.`);
      setRoleEdit(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      if (error.status === 401) {
        logout('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      setNotice(error.message);
    } finally {
      setRoleBusy(false);
    }
  }

  if (checkingSession) return <div className="full-loading"><span className="spinner" /> Đang xác thực phiên đăng nhập...</div>;
  if (!session) return <LoginScreen onLogin={(nextSession) => { saveSession(nextSession); setSession(nextSession); setNotice('Đăng nhập thành công. Xin chào!'); }} />;
  if (session.user.role === 'OPERATOR') {
    return <OperatorWorkspace
      user={session.user}
      token={session.token}
      machines={data.machines}
      loading={loading}
      error={errors.machines}
      onLogout={() => logout()}
      onSessionExpired={handleSessionExpired}
    />;
  }

  return <div className="app-shell">
    <Sidebar active={active} setActive={setActive} user={session.user} onLogout={() => logout()} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    <main className="main-area">
      <header className="topbar"><button className="icon-button menu-button" aria-label="Mở menu" onClick={() => setMobileNavOpen(true)}><Icon name="grid" /></button><div className="breadcrumb"><span>FreshVend</span><Icon name="chevron" size={14} /><strong>{NAV_ITEMS.find((item) => item.id === active)?.label}</strong></div><div className="topbar-right"><span className="system-status"><i /> Hệ thống hoạt động</span><span className="topbar-divider" /><span className="topbar-date">{new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date())}</span><button className="topbar-avatar" title={session.user.fullname}>{initials(session.user.fullname)}</button></div></header>
      <div className="content-area">
        {active === 'overview' && <Overview data={data} errors={errors} loading={loading} alerts={alerts} onOpenMachine={openMachine} onNavigate={setActive} onRefresh={() => setRefreshKey((value) => value + 1)} />}
        {active === 'machines' && <MachinesPage machines={data.machines} error={errors.machines} loading={loading} onOpenMachine={openMachine} onRefresh={() => setRefreshKey((value) => value + 1)} />}
        {active === 'inventory' && <InventoryPage machines={data.machines} error={errors.machines} token={session.token} onSessionExpired={handleSessionExpired} onNotice={setNotice} />}
        {active === 'catalog' && <CatalogPage products={data.products} categories={data.categories} error={errors.products || errors.categories} loading={loading} token={session.token} onRefresh={() => setRefreshKey((value) => value + 1)} onSessionExpired={handleSessionExpired} onNotice={setNotice} />}
        {active === 'accounts' && <AccountsPage users={data.users} error={errors.users} loading={loading} currentUser={session.user} onEditRole={(user, role) => setRoleEdit({ user, role })} />}
        {active === 'alerts' && <AlertsPage alerts={data.alerts} error={errors.alerts} loading={loading} machines={data.machines} token={session.token} onRefresh={() => setRefreshKey((value) => value + 1)} onSessionExpired={handleSessionExpired} onNotice={setNotice} onOpenMachine={openMachine} />}
        {active === 'reports' && <ReportsPage token={session.token} machines={data.machines} onSessionExpired={handleSessionExpired} onNotice={setNotice} />}
        {active === 'settings' && <UnavailablePage kind="settings" />}
      </div>
      <footer className="app-footer"><span>© 2026 FreshVend · Bảng điều khiển quản trị</span><span><i /> Dữ liệu cập nhật từ API</span></footer>
    </main>
    {notice && <div className="toast" role="status"><span className="toast-icon"><Icon name="check" size={17} /></span>{notice}<button className="icon-button" aria-label="Đóng thông báo" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
    {machineDetail && <MachineModal detail={machineDetail} onClose={() => setMachineDetail(null)} />}
    {roleEdit && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRoleEdit(null); }}><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="role-title"><button className="modal-close icon-button" aria-label="Đóng" onClick={() => setRoleEdit(null)}><Icon name="close" /></button><div className="modal-icon"><Icon name="users" size={22} /></div><p className="eyebrow">QUẢN LÝ TRUY CẬP</p><h2 id="role-title">Xác nhận thay đổi vai trò</h2><p>Bạn sắp đổi vai trò của <strong>{roleEdit.user.fullname}</strong> thành <strong>{roleEdit.role}</strong>. Quyền truy cập API sẽ thay đổi ngay sau khi lưu.</p><div className="modal-actions"><button className="button button-quiet" onClick={() => setRoleEdit(null)}>Hủy</button><button className="button button-primary" disabled={roleBusy} onClick={confirmRoleChange}>{roleBusy ? 'Đang cập nhật...' : 'Xác nhận thay đổi'}</button></div></div></div>}
  </div>;
}

function OperatorWorkspace({ user, token, machines, loading, error, onLogout, onSessionExpired }) {
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');

  useEffect(() => {
    if (!selectedMachineId && machines.length) {
      setSelectedMachineId(machines[0].id);
    }
  }, [machines, selectedMachineId]);

  useEffect(() => {
    if (!selectedMachineId) return undefined;
    let cancelled = false;
    setInventoryLoading(true);
    setInventoryError('');
    dashboardApi.inventory(selectedMachineId, token)
      .then((response) => {
        if (!cancelled) setInventory(response?.data || []);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setInventory([]);
        if (requestError.status === 401) onSessionExpired();
        else setInventoryError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setInventoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedMachineId, token, onSessionExpired]);

  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId);
  const onlineCount = machines.filter((machine) => machine.connectionStatus === 'ONLINE').length;
  const lowStockCount = inventory.filter((row) => Number(row.available_quantity ?? row.quantity) <= 3).length;

  return <main className="operator-shell">
    <header className="operator-topbar">
      <BrandMark />
      <div className="operator-topbar-right">
        <span className="operator-role"><i /> Không gian Operator</span>
        <span className="user-avatar">{initials(user.fullname)}</span>
        <span className="operator-user-name">{user.fullname}</span>
        <button className="button button-quiet" onClick={onLogout}><Icon name="logout" size={16} /> Đăng xuất</button>
      </div>
    </header>
    <section className="operator-content">
      <PageTitle eyebrow="KHU VỰC VẬN HÀNH" title="Khu vực vận hành" description={`Xin chào ${user.fullname}. Theo dõi trạng thái máy bán hàng và lượng hàng hiện có.`} />
      {error && <div className="inline-alert"><Icon name="info" size={18} />Không thể tải trạng thái máy: {error}</div>}
      <div className="operator-stat-grid">
        <div className="operator-stat"><span className="stat-icon stat-green"><Icon name="machine" size={19} /></span><span><small>Tổng số máy</small><strong>{loading && !machines.length ? '—' : machines.length}</strong></span></div>
        <div className="operator-stat"><span className="stat-icon stat-blue"><Icon name="spark" size={19} /></span><span><small>Máy trực tuyến</small><strong>{loading && !machines.length ? '—' : onlineCount}</strong></span></div>
        <div className="operator-stat"><span className={`stat-icon ${lowStockCount ? 'stat-orange' : 'stat-green'}`}><Icon name="box" size={19} /></span><span><small>Khe tồn thấp (≤ 3)</small><strong>{inventoryLoading ? '—' : lowStockCount}</strong></span></div>
      </div>
      <section className="operator-panel">
        <div className="operator-panel-heading">
          <div><h2>Trạng thái máy</h2><p>Chọn máy để xem tình trạng và tồn kho mới nhất.</p></div>
          <label className="operator-machine-select"><span>Máy</span><select className="select-control" aria-label="Chọn máy vận hành" value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)}><option value="">Chọn máy...</option>{machines.map((machine) => <option value={machine.id} key={machine.id}>{machine.machineCode} · {machine.name}</option>)}</select></label>
        </div>
        {loading && !machines.length ? <LoadingState label="Đang tải máy..." /> : !machines.length ? <EmptyState title="Chưa có máy trong hệ thống" description="Khi máy được đăng ký, trạng thái sẽ xuất hiện tại đây." /> : selectedMachine && <>
          <div className="operator-machine-summary">
            <span className="machine-card-art"><Icon name="machine" size={23} /></span>
            <span className="operator-machine-name"><small>{selectedMachine.machineCode}</small><strong>{selectedMachine.name}</strong><span>{selectedMachine.location || selectedMachine.address || 'Chưa có địa điểm'}</span></span>
            <StatusBadge value={selectedMachine.connectionStatus} />
            <div className="operator-reading"><small>Nhiệt độ</small><strong>{selectedMachine.temperature ?? '—'}{selectedMachine.temperature !== null && selectedMachine.temperature !== undefined ? '°C' : ''}</strong></div>
            <div className="operator-reading"><small>Cửa máy</small><StatusBadge value={selectedMachine.doorStatus} /></div>
          </div>
          {inventoryError && <div className="inline-alert"><Icon name="info" size={18} />Không thể tải tồn kho: {inventoryError}</div>}
          <div className="operator-inventory-heading"><div><h3>Tồn kho theo khe</h3><p>{inventory.length} khe · cập nhật từ hệ thống</p></div></div>
          {inventoryLoading ? <LoadingState label="Đang tải tồn kho..." /> : inventory.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Khe</th><th>Sản phẩm</th><th>Số lượng</th><th>Đang giữ</th><th>Có thể bán</th><th>Sức chứa</th><th>Trạng thái</th></tr></thead><tbody>{inventory.map((row) => <tr key={row.slot_id}><td><span className="slot-code">{row.slot_code}</span></td><td><strong>{row.product_name || 'Chưa phân bổ'}</strong></td><td><strong>{row.quantity ?? 0}</strong></td><td>{row.reserved_quantity ?? 0}</td><td>{row.available_quantity ?? row.quantity ?? 0}</td><td>{row.capacity}</td><td><StatusBadge value={row.slot_status} /></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có dữ liệu tồn kho" description="Máy này chưa có khe hoặc tồn kho chưa được khởi tạo." />}
        </>}
      </section>
      <div className="operator-scope-note"><Icon name="info" size={17} /><span>Đăng nhập chung đã xác định bạn là <strong>OPERATOR</strong>, vì vậy chỉ hiển thị khu vực vận hành. API hiện hỗ trợ xem máy và tồn kho; cập nhật giá, bổ sung hàng, điều chỉnh phân bổ và xác nhận lỗi chưa có endpoint tương ứng.</span></div>
    </section>
    <footer className="operator-footer">© 2026 FreshVend · Không gian vận hành</footer>
  </main>;
}

function Overview({ data, errors, loading, alerts, onOpenMachine, onNavigate, onRefresh }) {
  const onlineCount = data.machines.filter((machine) => machine.connectionStatus === 'ONLINE').length;
  const activeCount = data.machines.filter((machine) => machine.lifecycleStatus === 'ACTIVE').length;
  return <>
    <PageTitle eyebrow="TỔNG QUAN HỆ THỐNG" title="Chào buổi sáng 👋" description="Đây là những gì đang diễn ra trên hệ thống FreshVend của bạn." actions={<><button className="button button-quiet" onClick={onRefresh}><Icon name="refresh" size={17} /> Làm mới</button><button className="button button-dark" onClick={() => onNavigate('machines')}>Xem hệ thống <Icon name="arrow" size={16} /></button></>} />
    {Object.values(errors).length > 0 && <div className="inline-alert"><Icon name="info" size={18} /><span>Một số dữ liệu chưa tải được: {Object.entries(errors).map(([key, message]) => `${resourceLabel(key)} — ${message}`).join(' · ')}</span></div>}
    <section className="welcome-banner"><div className="welcome-banner-content"><span className="banner-kicker"><Icon name="spark" size={15} /> FRESHVEND NETWORK</span><h2>Vận hành tốt bắt đầu từ<br /><span>một cái nhìn toàn cảnh.</span></h2><p>Theo dõi sức khỏe máy, trạng thái chuỗi lạnh và tồn kho trên cùng một bảng điều khiển.</p><button className="banner-link" onClick={() => onNavigate('machines')}>Khám phá máy bán hàng <Icon name="arrow" size={16} /></button></div><div className="banner-art" aria-hidden="true"><div className="banner-ring ring-one" /><div className="banner-ring ring-two" /><div className="banner-fruit fruit-orange" /><div className="banner-fruit fruit-lime" /><div className="banner-fruit fruit-berry" /><div className="banner-leaf leaf-one" /><div className="banner-leaf leaf-two" /><span className="banner-sparkle sparkle-one">✳</span><span className="banner-sparkle sparkle-two">✳</span></div></section>
    <div className="section-heading"><div><h2>Trạng thái hôm nay</h2><p>Các chỉ số chính của hệ thống đang kết nối</p></div><span className="live-label"><i /> LIVE STATUS</span></div>
    <div className="stats-grid">
      <StatCard label="Tổng số máy" value={loading && !data.machines.length ? '—' : data.machines.length} foot={`${activeCount} máy đang hoạt động`} icon="machine" tone="green" onClick={() => onNavigate('machines')} />
      <StatCard label="Máy trực tuyến" value={loading && !data.machines.length ? '—' : onlineCount} foot={data.machines.length ? `${Math.round((onlineCount / data.machines.length) * 100)}% tổng số máy` : 'Chưa có dữ liệu'} icon="spark" tone="blue" onClick={() => onNavigate('machines')} />
      <StatCard label="Cần chú ý" value={loading && !data.machines.length ? '—' : alerts.length} foot={alerts.length ? 'Có trạng thái cần kiểm tra' : 'Không có cảnh báo hiện tại'} icon="bell" tone={alerts.length ? 'orange' : 'green'} onClick={() => onNavigate('alerts')} />
      <StatCard label="Sản phẩm đang bán" value={loading && !data.products.length ? '—' : data.products.filter((product) => product.status === 'ACTIVE').length} foot={`${data.categories.length} danh mục`} icon="leaf" tone="purple" onClick={() => onNavigate('catalog')} />
    </div>
    <div className="overview-grid">
      <section className="panel machine-panel"><div className="panel-heading"><div><h2>Máy bán hàng</h2><p>Tình trạng kết nối mới nhất</p></div><button className="text-button" onClick={() => onNavigate('machines')}>Tất cả máy <Icon name="chevron" size={15} /></button></div>{errors.machines ? <EmptyState title="Không tải được danh sách máy" description={errors.machines} /> : loading && !data.machines.length ? <LoadingState /> : data.machines.length ? <div className="machine-list">{data.machines.slice(0, 4).map((machine) => <button className="machine-row" key={machine.id} onClick={() => onOpenMachine(machine)}><span className={`machine-thumb ${machine.connectionStatus === 'ONLINE' ? '' : 'machine-thumb-muted'}`}><Icon name="machine" size={20} /></span><span className="machine-row-main"><strong>{machine.name || machine.machineCode}</strong><small>{machine.location || machine.address || machine.machineCode}</small></span><span className="machine-temp">{machine.temperature ?? '—'}<small>°C</small></span><StatusBadge value={machine.connectionStatus} /><Icon name="chevron" size={17} className="row-chevron" /></button>)}</div> : <EmptyState title="Chưa có máy nào" description="Danh sách máy sẽ hiển thị sau khi backend có dữ liệu." />}</section>
      <section className="panel alert-panel"><div className="panel-heading"><div><h2>Cảnh báo hệ thống</h2><p>Cảnh báo đang mở hoặc đã được xác nhận từ telemetry</p></div><button className="alert-count" onClick={() => onNavigate('alerts')}>{alerts.length} <Icon name="chevron" size={14} /></button></div>{errors.alerts ? <EmptyState title="Chưa thể tải cảnh báo" description={errors.alerts} /> : alerts.length ? <div className="alert-list">{alerts.slice(0, 4).map((alert) => <button key={alert.id} className="alert-row" onClick={() => onOpenMachine(alert.machine)}><span className={`alert-symbol ${alert.severity}`}><Icon name={alert.severity === 'critical' ? 'bell' : 'info'} size={17} /></span><span><strong>{alert.title}</strong><small>{alert.machine.machineCode} · {alert.detail}</small></span><Icon name="chevron" size={16} className="row-chevron" /></button>)}</div> : <div className="all-clear"><span><Icon name="check" size={21} /></span><strong>Mọi thứ đang ổn</strong><p>Hiện không có cảnh báo đang mở hoặc chờ xử lý.</p></div>}</section>
    </div>
    <section className="panel overview-bottom"><div className="panel-heading"><div><h2>Tóm tắt vận hành</h2><p>Dữ liệu được tải trực tiếp từ backend</p></div><button className="text-button" onClick={() => onNavigate('accounts')}>Quản lý tài khoản <Icon name="chevron" size={15} /></button></div><div className="summary-strip"><SummaryItem icon="box" label="Sản phẩm hoạt động" value={`${data.products.filter((product) => product.status === 'ACTIVE').length} sản phẩm`} tone="green" /><SummaryItem icon="users" label="Tài khoản nhân viên" value={errors.users ? 'Không tải được' : `${data.users.length} tài khoản`} tone="blue" /><SummaryItem icon="machine" label="Máy cần xử lý" value={`${alerts.length} cảnh báo`} tone={alerts.length ? 'orange' : 'green'} /></div><p className="data-note"><Icon name="info" size={15} /> Báo cáo doanh thu, đơn hàng và thanh toán đã được tích hợp trong mục “Báo cáo”.</p></section>
  </>;
}

function StatCard({ label, value, foot, icon, tone, onClick }) {
  return <button className="stat-card" onClick={onClick}><div className={`stat-icon stat-${tone}`}><Icon name={icon} size={19} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-foot">{foot}</span><span className="stat-arrow"><Icon name="arrow" size={15} /></span></button>;
}

function SummaryItem({ icon, label, value, tone }) {
  return <div className="summary-item"><span className={`summary-icon summary-${tone}`}><Icon name={icon} size={18} /></span><span><small>{label}</small><strong>{value}</strong></span></div>;
}

function MachinesPage({ machines, error, loading, onOpenMachine, onRefresh }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const filtered = machines.filter((machine) => {
    const matchesText = `${machine.machineCode} ${machine.name} ${machine.location} ${machine.address}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (filter === 'ALL' || machine.connectionStatus === filter);
  });
  return <>
    <PageTitle eyebrow="VẬN HÀNH" title="Máy bán hàng" description="Giám sát kết nối, nhiệt độ và tình trạng vận hành của thiết bị." actions={<button className="button button-quiet" onClick={onRefresh}><Icon name="refresh" size={17} /> Làm mới</button>} />
    <div className="toolbar"><div className="search-field"><Icon name="search" size={18} /><input aria-label="Tìm máy" placeholder="Tìm theo mã, tên hoặc địa điểm..." value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="select-control" aria-label="Lọc trạng thái kết nối" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Tất cả trạng thái</option><option value="ONLINE">Trực tuyến</option><option value="OFFLINE">Ngoại tuyến</option></select><span className="result-count">{filtered.length} máy</span></div>
    {error ? <div className="panel"><EmptyState title="Không thể tải máy" description={error} /></div> : loading && !machines.length ? <div className="panel"><LoadingState /></div> : filtered.length ? <div className="machine-cards">{filtered.map((machine) => <MachineCard key={machine.id} machine={machine} onClick={() => onOpenMachine(machine)} />)}</div> : <div className="panel"><EmptyState title="Không tìm thấy máy" description={search ? 'Thử từ khóa hoặc bộ lọc khác.' : 'Chưa có máy nào trong hệ thống.'} /></div>}
    <DataScopeNote>Trang này sử dụng danh sách, chi tiết và khe máy từ API hiện có. Backend chưa cung cấp nhật ký nhiệt độ lịch sử hoặc luồng WebSocket.</DataScopeNote>
  </>;
}

function MachineCard({ machine, onClick }) {
  const temp = machine.temperature;
  const hasTemp = temp !== null && temp !== undefined;
  const outOfRange = hasTemp && (Number(temp) < Number(machine.minTemperature) || Number(temp) > Number(machine.maxTemperature));
  return <button className="machine-card" onClick={onClick}><div className="machine-card-top"><span className={`machine-card-art ${machine.connectionStatus === 'ONLINE' ? '' : 'machine-thumb-muted'}`}><Icon name="machine" size={24} /></span><StatusBadge value={machine.connectionStatus} /></div><div className="machine-card-title"><span>{machine.machineCode}</span><strong>{machine.name || 'Máy FreshVend'}</strong><small>{machine.location || machine.address || 'Chưa có địa điểm'}</small></div><div className="machine-card-divider" /><div className="machine-metrics"><span><small>Nhiệt độ</small><strong className={outOfRange ? 'text-danger' : ''}>{hasTemp ? `${temp}°C` : '—'}</strong></span><span><small>Ngưỡng cài đặt</small><strong>{machine.minTemperature ?? '—'}–{machine.maxTemperature ?? '—'}°C</strong></span><span><small>Cửa máy</small><StatusBadge value={machine.doorStatus} /></span></div><div className="machine-card-bottom"><span>Cập nhật {formatDate(machine.statusUpdatedAt)}</span><Icon name="arrow" size={16} /></div></button>;
}

function MachineModal({ detail, onClose }) {
  const machine = detail.machine || {};
  const slots = machine.slots || [];
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="machine-modal" role="dialog" aria-modal="true" aria-labelledby="machine-modal-title"><div className="machine-modal-head"><span className="machine-card-art"><Icon name="machine" size={24} /></span><div><p className="eyebrow">{machine.machineCode || 'CHI TIẾT THIẾT BỊ'}</p><h2 id="machine-modal-title">{machine.name || machine.machineCode}</h2><span className="modal-location">{machine.location || machine.address}</span></div><button className="icon-button modal-close" aria-label="Đóng" onClick={onClose}><Icon name="close" /></button></div>{detail.loading ? <LoadingState label="Đang tải chi tiết máy..." /> : detail.error ? <div className="inline-alert"><Icon name="info" size={18} />{detail.error}</div> : <><div className="detail-stat-grid"><div><small>Kết nối</small><StatusBadge value={machine.connectionStatus} /></div><div><small>Vận hành</small><StatusBadge value={machine.operationStatus} /></div><div><small>Sức khỏe</small><StatusBadge value={machine.healthStatus} /></div><div><small>Cửa máy</small><StatusBadge value={machine.doorStatus} /></div><div><small>Nhiệt độ</small><strong>{machine.temperature ?? '—'}{machine.temperature !== null && machine.temperature !== undefined ? '°C' : ''}</strong></div><div><small>Độ ẩm</small><strong>{machine.humidity ?? '—'}{machine.humidity !== null && machine.humidity !== undefined ? '%' : ''}</strong></div></div><div className="machine-modal-section"><div className="panel-heading"><div><h3>Khe hàng</h3><p>{slots.length} khe · trạng thái hiện tại</p></div></div>{slots.length ? <div className="slot-table-wrap"><table className="data-table compact-table"><thead><tr><th>Khe</th><th>Sản phẩm</th><th>Tồn / sức chứa</th><th>Trạng thái</th></tr></thead><tbody>{slots.map((slot) => <tr key={slot.slotId}><td><strong>{slot.slotCode}</strong></td><td>{slot.productName || 'Chưa phân bổ'}</td><td>{slot.quantity ?? '—'} / {slot.capacity}</td><td><StatusBadge value={slot.slotStatus} /></td></tr>)}</tbody></table></div> : <EmptyState title="Không có thông tin khe hàng" description="Backend chưa trả về danh sách khe cho thiết bị này." />}</div><div className="machine-detail-foot"><span>Trạng thái lần cuối: {formatDate(machine.statusUpdatedAt || machine.lastSeenAt)}</span><span>Ngưỡng nhiệt độ {machine.minTemperature ?? '—'}–{machine.maxTemperature ?? '—'}°C</span></div></>}</div></div>;
}

function InventoryPage({ machines, error, token, onSessionExpired, onNotice }) {
  const [selectedMachine, setSelectedMachine] = useState('');
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [restockPagination, setRestockPagination] = useState({ total: 0, totalPages: 1 });
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [assignSlot, setAssignSlot] = useState('');
  const [assignProduct, setAssignProduct] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [restockSlot, setRestockSlot] = useState('');
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockDetail, setRestockDetail] = useState(null);
  useEffect(() => {
    if (!selectedMachine && machines.length) setSelectedMachine(machines[0].id);
  }, [machines, selectedMachine]);
  useEffect(() => {
    let cancelled = false;
    dashboardApi.activeProducts().then((response) => {
      if (!cancelled) setProducts(response);
    }).catch((loadError) => {
      if (!cancelled) setRequestError(loadError.message);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!selectedMachine) return undefined;
    let cancelled = false;
    setLoading(true);
    setRequestError('');
    Promise.all([
      dashboardApi.inventory(selectedMachine, token),
      dashboardApi.restocks({ page: historyPage, limit: 10, machineId: selectedMachine }, token),
    ]).then(([inventoryResponse, restockResponse]) => {
      if (cancelled) return;
      setInventory(inventoryResponse?.data || []);
      setRestocks(restockResponse?.data || []);
      setRestockPagination(restockResponse?.pagination || { total: 0, totalPages: 1 });
      setAssignSlot('');
      setRestockSlot('');
    }).catch((loadError) => {
      if (cancelled) return;
      setInventory([]);
      setRestocks([]);
      if (loadError.status === 401) onSessionExpired();
      else setRequestError(loadError.message);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedMachine, token, refreshKey, historyPage, onSessionExpired]);

  const filtered = inventory.filter((row) => `${row.slot_code} ${row.product_name || ''} ${row.machine_code}`.toLowerCase().includes(search.toLowerCase()));
  const assignedSlots = inventory.filter((row) => row.inventory_id && row.product_id && row.slot_status === 'ACTIVE' && row.product_status === 'ACTIVE');
  const emptySlots = inventory.filter((row) => !row.inventory_id && row.slot_status === 'ACTIVE');
  const totalQuantity = inventory.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const lowStock = assignedSlots.filter((row) => Number(row.available_quantity ?? row.quantity) <= 3).length;
  const currentMachine = machines.find((machine) => machine.id === selectedMachine);
  const download = () => exportCsv('freshvend-ton-kho.csv', [['Mã máy', 'Khe', 'Sản phẩm', 'Số lượng', 'Đang giữ', 'Khả dụng', 'Sức chứa', 'Trạng thái'], ...filtered.map((row) => [row.machine_code, row.slot_code, row.product_name, row.quantity, row.reserved_quantity, row.available_quantity, row.capacity, row.slot_status])]);

  async function submitAssignment(event) {
    event.preventDefault();
    setBusy(true);
    setRequestError('');
    try {
      await dashboardApi.assignProduct(assignSlot, {
        productId: assignProduct,
        quantity: Number(initialQuantity),
      }, token);
      onNotice('Đã gán sản phẩm vào khe hàng.');
      setAssignSlot('');
      setAssignProduct('');
      setInitialQuantity('0');
      setHistoryPage(1);
      setRefreshKey((value) => value + 1);
    } catch (submitError) {
      if (submitError.status === 401) onSessionExpired();
      else setRequestError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRestock(event) {
    event.preventDefault();
    setBusy(true);
    setRequestError('');
    try {
      await dashboardApi.restock({
        machineId: selectedMachine,
        items: [{ slotId: restockSlot, quantity: Number(restockQuantity) }],
      }, token);
      onNotice('Đã ghi nhận nhập hàng và cập nhật tồn kho.');
      setRestockQuantity('');
      setHistoryPage(1);
      setRefreshKey((value) => value + 1);
    } catch (submitError) {
      if (submitError.status === 401) onSessionExpired();
      else setRequestError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function showRestockDetail(id) {
    try {
      const response = await dashboardApi.restockDetail(id, token);
      setRestockDetail(response.data);
    } catch (detailError) {
      if (detailError.status === 401) onSessionExpired();
      else setRequestError(detailError.message);
    }
  }

  return <>
    <PageTitle eyebrow="VẬN HÀNH" title="Tồn kho & nhập hàng" description="Theo dõi số lượng, gán sản phẩm vào khe và ghi nhận các lần bổ sung hàng." actions={<button className="button button-quiet" disabled={!inventory.length} onClick={() => { try { download(); } catch (exportError) { setRequestError(exportError.message); } }}><Icon name="download" size={17} /> Xuất CSV</button>} />
    <div className="inventory-summary"><div className="inventory-selector"><label htmlFor="inventory-machine">Chọn máy</label><select id="inventory-machine" className="select-control" value={selectedMachine} onChange={(event) => { setSelectedMachine(event.target.value); setHistoryPage(1); }}><option value="">Chọn máy...</option>{machines.map((machine) => <option value={machine.id} key={machine.id}>{machine.machineCode} · {machine.name}</option>)}</select></div><SummaryItem icon="box" label="Tổng số lượng" value={`${totalQuantity} sản phẩm`} tone="green" /><SummaryItem icon="bell" label="Khe tồn thấp (≤ 3)" value={`${lowStock} khe`} tone={lowStock ? 'orange' : 'green'} /></div>
    {requestError && <div className="inline-alert" role="alert"><Icon name="info" size={18} /><span>{requestError}</span></div>}
    <div className="inventory-actions">
      <form className="panel operation-form" onSubmit={submitRestock}>
        <div className="panel-heading"><div><h2>Bổ sung hàng</h2><p>Chỉ có thể nhập vào khe đang hoạt động và chưa vượt sức chứa.</p></div></div>
        <label>Khe hàng<select className="select-control" required value={restockSlot} onChange={(event) => setRestockSlot(event.target.value)}><option value="">Chọn khe có sản phẩm...</option>{assignedSlots.map((row) => <option key={row.slot_id} value={row.slot_id}>{row.slot_code} · {row.product_name} ({row.quantity}/{row.capacity})</option>)}</select></label>
        <label>Số lượng nhập<input className="admin-input" type="number" min="1" step="1" required value={restockQuantity} onChange={(event) => setRestockQuantity(event.target.value)} /></label>
        <button className="button button-primary" disabled={busy || !selectedMachine || !restockSlot}><Icon name="plus" size={16} /> Ghi nhận nhập hàng</button>
      </form>
      <form className="panel operation-form" onSubmit={submitAssignment}>
        <div className="panel-heading"><div><h2>Gán sản phẩm vào khe trống</h2><p>Số lượng ban đầu sẽ được ghi vào lịch sử nhập kho.</p></div></div>
        <label>Khe hàng<select className="select-control" required value={assignSlot} onChange={(event) => setAssignSlot(event.target.value)}><option value="">Chọn khe trống...</option>{emptySlots.map((row) => <option key={row.slot_id} value={row.slot_id}>{row.slot_code} · sức chứa {row.capacity}</option>)}</select></label>
        <label>Sản phẩm<select className="select-control" required value={assignProduct} onChange={(event) => setAssignProduct(event.target.value)}><option value="">Chọn sản phẩm...</option>{products.filter((product) => product.status === 'ACTIVE').map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Tồn ban đầu<input className="admin-input" type="number" min="0" step="1" required value={initialQuantity} onChange={(event) => setInitialQuantity(event.target.value)} /></label>
        <button className="button button-primary" disabled={busy || !assignSlot || !assignProduct}><Icon name="plus" size={16} /> Gán sản phẩm</button>
      </form>
    </div>
    <section className="panel table-panel"><div className="panel-heading table-panel-heading"><div><h2>{currentMachine?.name || 'Chi tiết tồn kho'}</h2><p>{currentMachine?.machineCode || 'Chọn máy để xem tồn kho'}</p></div><div className="search-field compact-search"><Icon name="search" size={17} /><input placeholder="Tìm khe hoặc sản phẩm..." aria-label="Tìm khe hoặc sản phẩm" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>{error ? <EmptyState title="Không tải được danh sách máy" description={error} /> : loading ? <LoadingState label="Đang tải tồn kho..." /> : filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Khe hàng</th><th>Sản phẩm</th><th>Số lượng</th><th>Đang giữ</th><th>Có thể bán</th><th>Sức chứa</th><th>Trạng thái</th><th>Cập nhật</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.slot_id}><td><span className="slot-code">{row.slot_code}</span></td><td><strong>{row.product_name || 'Chưa phân bổ'}</strong><small>{row.machine_code}</small></td><td><strong>{row.quantity ?? 0}</strong></td><td>{row.reserved_quantity ?? 0}</td><td><strong>{row.available_quantity ?? row.quantity ?? 0}</strong></td><td>{row.capacity}</td><td><StatusBadge value={row.slot_status} /></td><td>{formatDate(row.updated_at)}</td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có dữ liệu tồn kho" description="Máy chưa có khe hoặc không có dữ liệu phù hợp với tìm kiếm." />}</section>
    <section className="panel table-panel history-panel"><div className="panel-heading table-panel-heading"><div><h2>Lịch sử nhập hàng</h2><p>{restockPagination.total} lần nhập kho của máy</p></div></div>{loading ? <LoadingState /> : restocks.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Số khe</th><th>Tổng nhập</th><th>Ghi chú</th><th></th></tr></thead><tbody>{restocks.map((event) => <tr key={event.restockEventId}><td>{formatDate(event.restockDate)}</td><td>{event.operatorName}</td><td>{event.itemCount}</td><td>{event.totalAdded}</td><td>{event.notes || '—'}</td><td><button className="text-button" onClick={() => showRestockDetail(event.restockEventId)}>Chi tiết</button></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có lịch sử nhập hàng" description="Các lần bổ sung hàng sẽ xuất hiện tại đây." />}{restockPagination.totalPages > 1 && <div className="pagination"><span>Trang {historyPage} / {restockPagination.totalPages}</span><div><button className="button button-quiet" disabled={historyPage <= 1 || loading} onClick={() => setHistoryPage((value) => value - 1)}>Trước</button><button className="button button-quiet" disabled={historyPage >= restockPagination.totalPages || loading} onClick={() => setHistoryPage((value) => value + 1)}>Tiếp</button></div></div>}</section>
    {restockDetail && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRestockDetail(null); }}><div className="machine-modal" role="dialog" aria-modal="true" aria-labelledby="restock-detail-title"><button className="icon-button modal-close" aria-label="Đóng" onClick={() => setRestockDetail(null)}><Icon name="close" /></button><p className="eyebrow">LỊCH SỬ NHẬP HÀNG</p><h2 id="restock-detail-title">{restockDetail.machineCode} · {formatDate(restockDetail.restockDate)}</h2><p>{restockDetail.operatorName} · {restockDetail.notes || 'Không có ghi chú'}</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Khe</th><th>Sản phẩm</th><th>Trước nhập</th><th>Đã nhập</th><th>Sau nhập</th></tr></thead><tbody>{restockDetail.items.map((item) => <tr key={item.restockEventItemId}><td>{item.slotCode}</td><td>{item.productName}</td><td>{item.previousQuantity}</td><td>{item.addedQuantity}</td><td>{item.newQuantity}</td></tr>)}</tbody></table></div></div></div>}
  </>;
}

function CatalogPage({ products, categories, error, loading, token, onRefresh, onSessionExpired, onNotice }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(0);
  const [productDialog, setProductDialog] = useState(null);
  const [categoryDialog, setCategoryDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const pageSize = 10;
  const filtered = products.filter((product) => (category === 'ALL' || product.category?.id === category)
    && (status === 'ALL' || product.status === status)
    && `${product.name} ${product.description || ''} ${product.category?.name || ''}`.toLowerCase().includes(search.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => setPage(0), [search, category, status]);
  const download = () => exportCsv('freshvend-san-pham.csv', [['Sản phẩm', 'Danh mục', 'Giá', 'Trạng thái', 'Mô tả'], ...filtered.map((product) => [product.name, product.category?.name, product.unitPrice, product.status, product.description])]);

  async function saveProduct(event) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      productName: String(form.get('productName')).trim(),
      categoryId: form.get('categoryId'),
      unitPrice: Number(form.get('unitPrice')),
      description: String(form.get('description')).trim() || null,
      status: form.get('status'),
    };
    try {
      if (productDialog.productId) {
        await dashboardApi.updateProduct(productDialog.productId, payload, token);
      } else {
        await dashboardApi.createProduct(payload, token);
      }
      setProductDialog(null);
      onNotice(productDialog.productId ? 'Đã cập nhật sản phẩm.' : 'Đã tạo sản phẩm.');
      onRefresh();
    } catch (saveError) {
      if (saveError.status === 401) onSessionExpired();
      else setFormError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      categoryName: String(form.get('categoryName')).trim(),
      description: String(form.get('description')).trim() || null,
    };
    try {
      if (categoryDialog.categoryId) {
        await dashboardApi.updateCategory(categoryDialog.categoryId, payload, token);
      } else {
        await dashboardApi.createCategory(payload, token);
      }
      setCategoryDialog(null);
      onNotice(categoryDialog.categoryId ? 'Đã cập nhật danh mục.' : 'Đã tạo danh mục.');
      onRefresh();
    } catch (saveError) {
      if (saveError.status === 401) onSessionExpired();
      else setFormError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(item) {
    if (!window.confirm(`Xóa danh mục "${item.name}"?`)) return;
    try {
      await dashboardApi.deleteCategory(item.id, token);
      onNotice('Đã xóa danh mục.');
      onRefresh();
    } catch (deleteError) {
      if (deleteError.status === 401) onSessionExpired();
      else onNotice(deleteError.message);
    }
  }

  async function toggleProductStatus(product) {
    const nextStatus = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await dashboardApi.updateProduct(product.id, { status: nextStatus }, token);
      onNotice(nextStatus === 'ACTIVE' ? 'Đã kích hoạt sản phẩm.' : 'Đã ngừng bán sản phẩm.');
      onRefresh();
    } catch (updateError) {
      if (updateError.status === 401) onSessionExpired();
      else onNotice(updateError.message);
    }
  }

  return <>
    <PageTitle eyebrow="DANH MỤC" title="Sản phẩm & danh mục" description="Quản lý nội dung catalog, giá bán và trạng thái kinh doanh." actions={<><button className="button button-quiet" onClick={() => { try { download(); } catch (exportError) { onNotice(exportError.message); } }}><Icon name="download" size={17} /> Xuất CSV</button><button className="button button-quiet" onClick={() => { setFormError(''); setCategoryDialog({ categoryName: '', description: '' }); }}><Icon name="plus" size={16} /> Danh mục</button><button className="button button-primary" onClick={() => { setFormError(''); setProductDialog({ productName: '', categoryId: categories[0]?.id || '', unitPrice: '', description: '', status: 'ACTIVE' }); }}><Icon name="plus" size={16} /> Sản phẩm</button></>} />
    <div className="catalog-metrics"><SummaryItem icon="leaf" label="Sản phẩm đang bán" value={`${products.filter((product) => product.status === 'ACTIVE').length} sản phẩm`} tone="green" /><SummaryItem icon="box" label="Danh mục" value={`${categories.length} danh mục`} tone="purple" /><span className="read-only-label"><Icon name="info" size={15} /> Thay đổi được lưu trực tiếp</span></div>
    <section className="panel category-management"><div className="panel-heading"><div><h2>Danh mục</h2><p>Chỉ có thể xóa danh mục chưa được sản phẩm tham chiếu.</p></div></div><div className="category-list">{categories.map((item) => <div className="category-management-item" key={item.id}><span><strong>{item.name}</strong><small>{item.activeProductCount} đang bán · {item.productCount} sản phẩm</small></span><div><button className="text-button" onClick={() => { setFormError(''); setCategoryDialog({ categoryId: item.id, categoryName: item.name, description: item.description || '' }); }}>Sửa</button><button className="text-button text-danger" onClick={() => deleteCategory(item)}>Xóa</button></div></div>)}</div></section>
    <section className="panel table-panel"><div className="panel-heading table-panel-heading"><div><h2>Sản phẩm</h2><p>{filtered.length} kết quả</p></div><div className="table-filters"><div className="search-field compact-search"><Icon name="search" size={17} /><input placeholder="Tìm sản phẩm..." aria-label="Tìm sản phẩm" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className="select-control" aria-label="Lọc danh mục" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Tất cả danh mục</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="select-control" aria-label="Lọc trạng thái sản phẩm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Mọi trạng thái</option><option value="ACTIVE">Đang bán</option><option value="INACTIVE">Ngừng bán</option></select></div></div>{error ? <EmptyState title="Không tải được danh mục sản phẩm" description={error} /> : loading && !products.length ? <LoadingState /> : visible.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th></tr></thead><tbody>{visible.map((product) => <tr key={product.id}><td><span className="product-cell"><span className="product-thumb"><Icon name="leaf" size={18} /></span><span><strong>{product.name}</strong><small>{product.description || 'Chưa có mô tả'}</small></span></span></td><td><span className="category-chip">{product.category?.name || 'Chưa phân loại'}</span></td><td><strong>{formatMoney(product.unitPrice)}</strong></td><td><StatusBadge value={product.status} /></td><td>{formatDate(product.updatedAt)}</td><td><div className="row-actions"><button className="text-button" onClick={() => { setFormError(''); setProductDialog({ ...product, productId: product.id, productName: product.name, categoryId: product.category?.id }); }}>Sửa</button><button className="text-button" onClick={() => toggleProductStatus(product)}>{product.status === 'ACTIVE' ? 'Ngừng bán' : 'Kích hoạt'}</button></div></td></tr>)}</tbody></table></div> : <EmptyState title="Không có sản phẩm phù hợp" description="Thử từ khóa hoặc bộ lọc khác." />}{filtered.length > pageSize && <div className="pagination"><span>Trang {page + 1} / {pageCount}</span><div><button className="button button-quiet" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button><button className="button button-quiet" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Tiếp</button></div></div>}</section>
    {productDialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setProductDialog(null); }}><form className="admin-modal" onSubmit={saveProduct} aria-labelledby="product-dialog-title"><button type="button" className="icon-button modal-close" aria-label="Đóng" onClick={() => setProductDialog(null)}><Icon name="close" /></button><p className="eyebrow">CATALOG</p><h2 id="product-dialog-title">{productDialog.productId ? 'Cập nhật sản phẩm' : 'Tạo sản phẩm'}</h2><label>Tên sản phẩm<input className="admin-input" name="productName" defaultValue={productDialog.productName} maxLength="150" required /></label><label>Danh mục<select className="select-control" name="categoryId" defaultValue={productDialog.categoryId} required><option value="" disabled>Chọn danh mục</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Giá bán (VND)<input className="admin-input" name="unitPrice" type="number" min="0.01" max="99999999.99" step="0.01" defaultValue={productDialog.unitPrice} required /></label><label>Mô tả<textarea className="admin-input admin-textarea" name="description" maxLength="2000" defaultValue={productDialog.description || ''} /></label>{productDialog.productId && <label>Trạng thái<select className="select-control" name="status" defaultValue={productDialog.status}><option value="ACTIVE">Đang bán</option><option value="INACTIVE">Ngừng bán</option></select></label>}{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={() => setProductDialog(null)}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu sản phẩm'}</button></div></form></div>}
    {categoryDialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCategoryDialog(null); }}><form className="admin-modal" onSubmit={saveCategory} aria-labelledby="category-dialog-title"><button type="button" className="icon-button modal-close" aria-label="Đóng" onClick={() => setCategoryDialog(null)}><Icon name="close" /></button><p className="eyebrow">CATALOG</p><h2 id="category-dialog-title">{categoryDialog.categoryId ? 'Cập nhật danh mục' : 'Tạo danh mục'}</h2><label>Tên danh mục<input className="admin-input" name="categoryName" defaultValue={categoryDialog.categoryName} maxLength="100" required /></label><label>Mô tả<textarea className="admin-input admin-textarea" name="description" maxLength="2000" defaultValue={categoryDialog.description} /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={() => setCategoryDialog(null)}>Hủy</button><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu danh mục'}</button></div></form></div>}
  </>;
}

function AccountsPage({ users, error, loading, currentUser, onEditRole }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter((user) => `${user.fullname} ${user.email} ${user.role}`.toLowerCase().includes(search.toLowerCase()));
  const download = () => exportCsv('freshvend-tai-khoan.csv', [['Họ tên', 'Email', 'Vai trò'], ...filtered.map((user) => [user.fullname, user.email, user.role])]);
  return <>
    <PageTitle eyebrow="QUẢN TRỊ HỆ THỐNG" title="Tài khoản & phân quyền" description="Kiểm soát quyền truy cập của quản trị viên và nhân viên vận hành." actions={<button className="button button-quiet" disabled={!users.length} onClick={() => { try { download(); } catch (exportError) { window.alert(exportError.message); } }}><Icon name="download" size={17} /> Xuất CSV</button>} />
    <div className="account-notice"><span><Icon name="info" size={19} /></span><div><strong>Tạo tài khoản mới</strong><p>Đăng ký hiện tạo tài khoản Operator theo mặc định. Để thêm nhân viên, hãy dùng luồng đăng ký hiện có; sau đó phân quyền tại đây.</p></div></div>
    <section className="panel table-panel"><div className="panel-heading table-panel-heading"><div><h2>Người dùng hệ thống</h2><p>{filtered.length} tài khoản · {users.filter((user) => user.role === 'ADMIN').length} Admin · {users.filter((user) => user.role === 'OPERATOR').length} Operator</p></div><div className="search-field compact-search"><Icon name="search" size={17} /><input placeholder="Tìm tên hoặc email..." aria-label="Tìm tài khoản" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>{error ? <EmptyState title="Không thể tải tài khoản" description={error} /> : loading && !users.length ? <LoadingState /> : filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Nhân viên</th><th>Vai trò hiện tại</th><th>Quyền truy cập</th><th>Thao tác</th></tr></thead><tbody>{filtered.map((user) => { const userId = user.user_id || user.id; const isCurrent = userId === currentUser.id; return <tr key={userId}><td><span className="account-person"><span className={`user-avatar ${user.role === 'ADMIN' ? 'avatar-admin' : ''}`}>{initials(user.fullname)}</span><span><strong>{user.fullname}{isCurrent && <em className="you-tag">Bạn</em>}</strong><small>{user.email}</small></span></span></td><td><span className={`role-chip ${user.role === 'ADMIN' ? 'role-admin' : 'role-operator'}`}><i />{user.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên vận hành'}</span></td><td><span className="permission-text">{user.role === 'ADMIN' ? 'Toàn quyền quản trị' : 'Vận hành máy & tồn kho'}</span></td><td><select className="role-select" value={user.role} disabled={isCurrent} aria-label={`Vai trò của ${user.fullname}`} onChange={(event) => onEditRole(user, event.target.value)}><option value="ADMIN">ADMIN</option><option value="OPERATOR">OPERATOR</option></select></td></tr>; })}</tbody></table></div> : <EmptyState title="Không tìm thấy tài khoản" description="Thử từ khóa tìm kiếm khác." />}</section>
    <DataScopeNote>API hỗ trợ xem người dùng và đổi vai trò ADMIN/OPERATOR. Không thể tự đổi vai trò của chính mình; tạo tài khoản mới chưa có giao diện/API quản trị riêng.</DataScopeNote>
  </>;
}

function AlertsPage({ alerts, error, loading: parentLoading, machines, token, onRefresh, onSessionExpired, onNotice, onOpenMachine }) {
  const [items, setItems] = useState(alerts);
  const [status, setStatus] = useState('ALL');
  const [severity, setSeverity] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: alerts.length });
  const [requestError, setRequestError] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setRequestLoading(true);
    setRequestError('');
    const query = { page, limit: 20 };
    if (status !== 'ALL') query.status = status;
    if (severity !== 'ALL') query.severity = severity;
    if (from) query.from = new Date(`${from}T00:00:00`).toISOString();
    if (to) {
      const exclusive = new Date(`${to}T00:00:00`);
      exclusive.setDate(exclusive.getDate() + 1);
      query.to = exclusive.toISOString();
    }
    dashboardApi.alerts(query, token).then((response) => {
      if (!cancelled) {
        setItems(response.data || []);
        setPagination(response.pagination || { page: 1, totalPages: 1, total: 0 });
      }
    }).catch((loadError) => {
      if (cancelled) return;
      if (loadError.status === 401) onSessionExpired();
      else setRequestError(loadError.message);
    }).finally(() => { if (!cancelled) setRequestLoading(false); });
    return () => { cancelled = true; };
  }, [status, severity, from, to, page, token, refreshKey, onSessionExpired]);

  async function changeStatus(alert, nextStatus) {
    setBusyId(alert.alertId);
    try {
      await dashboardApi.updateAlertStatus(alert.alertId, nextStatus, token);
      onNotice(nextStatus === 'ACKNOWLEDGED' ? 'Đã xác nhận cảnh báo.' : 'Đã giải quyết cảnh báo.');
      setRefreshKey((value) => value + 1);
      onRefresh();
    } catch (actionError) {
      if (actionError.status === 401) onSessionExpired();
      else onNotice(actionError.message);
    } finally {
      setBusyId('');
    }
  }

  async function createAlert(event) {
    event.preventDefault();
    setCreateError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      machineId: form.get('machineId'),
      alertType: String(form.get('alertType')).trim().toUpperCase().replaceAll(/\s+/g, '_'),
      severity: form.get('severity'),
      message: String(form.get('message')).trim(),
    };
    try {
      await dashboardApi.createAlert(payload, token);
      setCreateOpen(false);
      onNotice('Đã tạo cảnh báo.');
      setRefreshKey((value) => value + 1);
      onRefresh();
    } catch (createRequestError) {
      if (createRequestError.status === 401) onSessionExpired();
      else setCreateError(createRequestError.message);
    }
  }

  const showAlerts = items;
  return <>
    <PageTitle eyebrow="GIÁM SÁT" title="Cảnh báo hệ thống" description="Theo dõi lịch sử và xử lý cảnh báo được ghi nhận từ telemetry hoặc nhân viên." actions={<button className="button button-primary" onClick={() => { setCreateError(''); setCreateOpen(true); }}><Icon name="plus" size={16} /> Tạo cảnh báo</button>} />
    <div className="alert-summary-cards"><SummaryItem icon="bell" label="Tổng cảnh báo" value={`${pagination.total ?? alerts.length} cảnh báo`} tone={showAlerts.length ? 'orange' : 'green'} /><SummaryItem icon="machine" label="Đang mở / xác nhận" value={`${alerts.filter((alert) => alert.status !== 'RESOLVED').length} cảnh báo`} tone="blue" /><SummaryItem icon="info" label="Đồng bộ" value={parentLoading || requestLoading ? 'Đang tải' : 'Đã kết nối API'} tone="green" /></div>
    <section className="panel table-panel"><div className="panel-heading table-panel-heading"><div><h2>Lịch sử cảnh báo</h2><p>Lọc theo trạng thái, mức độ và thời gian.</p></div><div className="table-filters"><select className="select-control" aria-label="Lọc trạng thái cảnh báo" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="ALL">Mọi trạng thái</option><option value="OPEN">Mới</option><option value="ACKNOWLEDGED">Đã xác nhận</option><option value="RESOLVED">Đã giải quyết</option></select><select className="select-control" aria-label="Lọc mức độ cảnh báo" value={severity} onChange={(event) => { setPage(1); setSeverity(event.target.value); }}><option value="ALL">Mọi mức độ</option><option value="CRITICAL">Nghiêm trọng</option><option value="WARNING">Cảnh báo</option><option value="INFO">Thông tin</option></select><label className="date-filter">Từ<input className="admin-input" type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} /></label><label className="date-filter">Đến<input className="admin-input" type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} /></label></div></div>{error ? <EmptyState title="Không thể tải cảnh báo" description={error} /> : requestError ? <EmptyState title="Không thể tải cảnh báo" description={requestError} /> : requestLoading && !showAlerts.length ? <LoadingState /> : showAlerts.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Máy</th><th>Cảnh báo</th><th>Mức độ</th><th>Trạng thái</th><th>Thời gian</th><th>Người xử lý</th><th>Thao tác</th></tr></thead><tbody>{showAlerts.map((alert) => { const machine = machines.find((item) => item.id === alert.machineId) || { id: alert.machineId, name: alert.machineName, machineCode: alert.machineCode }; return <tr key={alert.alertId}><td><button className="text-button" onClick={() => onOpenMachine(machine)}>{alert.machineCode}</button><small>{alert.machineName}</small></td><td><strong>{alert.alertType.replaceAll('_', ' ')}</strong><small>{alert.message}</small></td><td><span className={`severity-chip ${alert.severity.toLowerCase()}`}>{alert.severity}</span></td><td><StatusBadge value={alert.status} /></td><td>{formatDate(alert.createdAt)}</td><td>{alert.resolvedByName || alert.acknowledgedByName || '—'}</td><td><div className="row-actions">{alert.status === 'OPEN' && <button className="text-button" disabled={busyId === alert.alertId} onClick={() => changeStatus(alert, 'ACKNOWLEDGED')}>Xác nhận</button>}{alert.status !== 'RESOLVED' && <button className="text-button" disabled={busyId === alert.alertId} onClick={() => changeStatus(alert, 'RESOLVED')}>Giải quyết</button>}</div></td></tr>; })}</tbody></table></div> : <EmptyState title="Không có cảnh báo phù hợp" description="Thay đổi bộ lọc hoặc tạo một cảnh báo mới." />}{pagination.totalPages > 1 && <div className="pagination"><span>Trang {page} / {pagination.totalPages} · {pagination.total} cảnh báo</span><div><button className="button button-quiet" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</button><button className="button button-quiet" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Tiếp</button></div></div>}</section>
    {createOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><form className="admin-modal" onSubmit={createAlert} aria-labelledby="create-alert-title"><button type="button" className="icon-button modal-close" aria-label="Đóng" onClick={() => setCreateOpen(false)}><Icon name="close" /></button><p className="eyebrow">GIÁM SÁT</p><h2 id="create-alert-title">Tạo cảnh báo</h2><label>Máy<select className="select-control" name="machineId" required defaultValue=""><option value="" disabled>Chọn máy</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machineCode} · {machine.name}</option>)}</select></label><label>Loại cảnh báo<input className="admin-input" name="alertType" placeholder="Ví dụ: STOCK_CHECK" maxLength="50" required /></label><label>Mức độ<select className="select-control" name="severity" defaultValue="WARNING"><option value="INFO">Thông tin</option><option value="WARNING">Cảnh báo</option><option value="CRITICAL">Nghiêm trọng</option></select></label><label>Nội dung<textarea className="admin-input admin-textarea" name="message" maxLength="2000" required /></label>{createError && <p className="form-error" role="alert">{createError}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setCreateOpen(false)}>Hủy</button><button className="button button-primary">Tạo cảnh báo</button></div></form></div>}
  </>;
}

function ReportsPage({ token, machines, onSessionExpired, onNotice }) {
  const today = new Date();
  const toInput = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const fromDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  const fromInput = `${fromDay.getFullYear()}-${String(fromDay.getMonth() + 1).padStart(2, '0')}-${String(fromDay.getDate()).padStart(2, '0')}`;
  const [from, setFrom] = useState(fromInput);
  const [to, setTo] = useState(toInput);
  const [machineId, setMachineId] = useState('');
  const [groupBy, setGroupBy] = useState('day');
  const [summary, setSummary] = useState(null);
  const [sales, setSales] = useState([]);
  const [section, setSection] = useState('sales');
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [orderStatus, setOrderStatus] = useState('ALL');
  const [paymentStatus, setPaymentStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderDetail, setOrderDetail] = useState(null);
  const range = useMemo(() => {
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T00:00:00`);
    toDate.setDate(toDate.getDate() + 1);
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    setError('');
    const query = { ...range };
    if (machineId) query.machineId = machineId;
    Promise.all([
      dashboardApi.reportSummary(query, token),
      dashboardApi.salesReport({ ...query, groupBy, limit: 100 }, token),
    ]).then(([summaryResponse, salesResponse]) => {
      if (cancelled) return;
      setSummary(summaryResponse.data);
      setSales(salesResponse.data || []);
    }).catch((loadError) => {
      if (cancelled) return;
      if (loadError.status === 401) onSessionExpired();
      else setError(loadError.message);
    }).finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [range, machineId, groupBy, token, onSessionExpired]);

  useEffect(() => {
    if (section === 'sales') return undefined;
    let cancelled = false;
    setListLoading(true);
    setError('');
    const query = { ...range, page, limit: 20 };
    if (machineId) query.machineId = machineId;
    const load = section === 'orders'
      ? dashboardApi.orders({ ...query, ...(orderStatus !== 'ALL' ? { status: orderStatus } : {}) }, token)
      : dashboardApi.payments({ ...query, ...(paymentStatus !== 'ALL' ? { status: paymentStatus } : {}) }, token);
    load.then((response) => {
      if (cancelled) return;
      if (section === 'orders') setOrders(response.data || []);
      else setPayments(response.data || []);
      setPagination(response.pagination || { total: 0, totalPages: 1 });
    }).catch((loadError) => {
      if (cancelled) return;
      if (loadError.status === 401) onSessionExpired();
      else setError(loadError.message);
    }).finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [section, range, machineId, orderStatus, paymentStatus, page, token, onSessionExpired]);

  async function showOrder(orderId) {
    try {
      const response = await dashboardApi.order(orderId, token);
      setOrderDetail(response.data);
    } catch (detailError) {
      if (detailError.status === 401) onSessionExpired();
      else onNotice(detailError.message);
    }
  }

  const exportSales = () => exportCsv('freshvend-bao-cao-doanh-thu.csv', [
    ['Nhóm', 'Đơn hàng', 'Doanh thu', 'Số lượng', 'Doanh số sản phẩm'],
    ...sales.map((row) => [row.label, row.orderCount, row.revenue, row.quantity, row.itemSales]),
  ]);
  const exportOrders = () => exportCsv('freshvend-don-hang.csv', [
    ['Mã đơn', 'Máy', 'Trạng thái', 'Tổng tiền', 'Số mặt hàng', 'Thanh toán gần nhất', 'Thời gian'],
    ...orders.map((order) => [order.orderId, order.machineCode, order.status, order.totalAmount, order.itemCount, order.latestPaymentStatus, order.createdAt]),
  ]);
  const exportPayments = () => exportCsv('freshvend-thanh-toan.csv', [
    ['Mã thanh toán', 'Mã đơn', 'Máy', 'Phương thức', 'Trạng thái', 'Số tiền', 'Thời gian thanh toán'],
    ...payments.map((payment) => [payment.paymentId, payment.orderId, payment.machineCode, payment.paymentMethod, payment.status, payment.amount, payment.paidAt]),
  ]);

  return <>
    <PageTitle eyebrow="PHÂN TÍCH" title="Báo cáo & đơn hàng" description="Tổng hợp doanh thu, mặt hàng bán ra, đơn hàng và giao dịch theo khoảng thời gian." actions={<button className="button button-quiet" onClick={() => { try { if (section === 'sales') exportSales(); else if (section === 'orders') exportOrders(); else exportPayments(); } catch (exportError) { onNotice(exportError.message); } }}><Icon name="download" size={17} /> Xuất CSV</button>} />
    <div className="report-filters"><label>Từ ngày<input className="admin-input" type="date" required value={from} max={to} onChange={(event) => { if (event.target.value) setFrom(event.target.value); setPage(1); }} /></label><label>Đến ngày<input className="admin-input" type="date" required value={to} min={from} onChange={(event) => { if (event.target.value) setTo(event.target.value); setPage(1); }} /></label><label>Máy<select className="select-control" value={machineId} onChange={(event) => { setMachineId(event.target.value); setPage(1); }}><option value="">Tất cả máy</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machineCode}</option>)}</select></label><span className="report-range-note">Ngày kết thúc được tính trọn vẹn.</span></div>
    {error && <div className="inline-alert" role="alert"><Icon name="info" size={18} /><span>{error}</span></div>}
    {summary && <div className="report-summary-grid"><SummaryItem icon="chart" label="Doanh thu thuần" value={formatMoney(summary.netRevenue)} tone="green" /><SummaryItem icon="box" label="Tổng đơn hàng" value={summary.totalOrders} tone="blue" /><SummaryItem icon="check" label="Đơn hoàn tất" value={summary.completedOrders} tone="purple" /><SummaryItem icon="info" label="Đã hoàn tiền" value={formatMoney(summary.refundedAmount)} tone="orange" /></div>}
    <section className="panel table-panel report-panel"><div className="panel-heading table-panel-heading"><div><h2>{section === 'sales' ? 'Doanh số' : section === 'orders' ? 'Đơn hàng' : 'Thanh toán'}</h2><p>{section === 'sales' ? `Doanh thu gộp ${formatMoney(summary?.grossRevenue)} · ${summary?.successfulPayments ?? 0} thanh toán thành công` : `${pagination.total} kết quả trong khoảng thời gian đã chọn`}</p></div><div className="report-tabs"><button className={section === 'sales' ? 'report-tab active' : 'report-tab'} onClick={() => { setSection('sales'); setPage(1); }}>Doanh số</button><button className={section === 'orders' ? 'report-tab active' : 'report-tab'} onClick={() => { setSection('orders'); setPage(1); }}>Đơn hàng</button><button className={section === 'payments' ? 'report-tab active' : 'report-tab'} onClick={() => { setSection('payments'); setPage(1); }}>Thanh toán</button></div></div>
      {section === 'sales' && <div className="report-group-control"><label>Nhóm theo<select className="select-control" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}><option value="day">Ngày</option><option value="product">Sản phẩm</option><option value="machine">Máy</option></select></label></div>}
      {section === 'orders' && <div className="report-group-control"><label>Trạng thái<select className="select-control" value={orderStatus} onChange={(event) => { setOrderStatus(event.target.value); setPage(1); }}><option value="ALL">Tất cả trạng thái</option>{['PENDING', 'PAID', 'DISPENSING', 'COMPLETED', 'FAILED', 'CANCELLED'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>}
      {section === 'payments' && <div className="report-group-control"><label>Trạng thái<select className="select-control" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1); }}><option value="ALL">Tất cả trạng thái</option>{['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>}
      {(section === 'sales' ? summaryLoading : listLoading) && !(section === 'sales' ? sales.length : section === 'orders' ? orders.length : payments.length) ? <LoadingState /> : section === 'sales' ? sales.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{groupBy === 'day' ? 'Ngày' : groupBy === 'product' ? 'Sản phẩm' : 'Máy'}</th><th>Số đơn</th><th>Doanh thu</th>{groupBy === 'product' && <><th>Số lượng bán</th><th>Doanh số mặt hàng</th></>}</tr></thead><tbody>{sales.map((row) => <tr key={row.bucket}><td><strong>{row.label}</strong></td><td>{row.orderCount}</td><td>{formatMoney(row.revenue)}</td>{groupBy === 'product' && <><td>{row.quantity}</td><td>{formatMoney(row.itemSales)}</td></>}</tr>)}</tbody></table></div> : <EmptyState title="Chưa có dữ liệu doanh số" description="Không có thanh toán thành công trong khoảng thời gian này." /> : section === 'orders' ? orders.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Mã đơn</th><th>Máy</th><th>Trạng thái</th><th>Tổng tiền</th><th>Số mặt hàng</th><th>Thanh toán</th><th>Ngày tạo</th><th></th></tr></thead><tbody>{orders.map((order) => <tr key={order.orderId}><td><strong>{order.orderId.slice(0, 8)}</strong></td><td>{order.machineCode}</td><td><StatusBadge value={order.status} /></td><td>{formatMoney(order.totalAmount)}</td><td>{order.itemCount}</td><td>{order.latestPaymentStatus || '—'}</td><td>{formatDate(order.createdAt)}</td><td><button className="text-button" onClick={() => showOrder(order.orderId)}>Chi tiết</button></td></tr>)}</tbody></table></div> : <EmptyState title="Không có đơn hàng" description="Thử thay đổi khoảng thời gian hoặc bộ lọc." /> : payments.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Mã thanh toán</th><th>Mã đơn</th><th>Máy</th><th>Phương thức</th><th>Trạng thái</th><th>Số tiền</th><th>Ngày thanh toán</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.paymentId}><td><strong>{payment.paymentId.slice(0, 8)}</strong></td><td>{payment.orderId.slice(0, 8)}</td><td>{payment.machineCode}</td><td>{payment.paymentMethod}</td><td><StatusBadge value={payment.status} /></td><td>{formatMoney(payment.amount)}</td><td>{formatDate(payment.paidAt || payment.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="Không có giao dịch" description="Thử thay đổi khoảng thời gian hoặc bộ lọc." />}
      {section !== 'sales' && pagination.totalPages > 1 && <div className="pagination"><span>Trang {page} / {pagination.totalPages} · {pagination.total} kết quả</span><div><button className="button button-quiet" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Trước</button><button className="button button-quiet" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Tiếp</button></div></div>}
    </section>
    {orderDetail && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOrderDetail(null); }}><div className="machine-modal" role="dialog" aria-modal="true" aria-labelledby="order-detail-title"><button className="icon-button modal-close" aria-label="Đóng" onClick={() => setOrderDetail(null)}><Icon name="close" /></button><p className="eyebrow">CHI TIẾT ĐƠN HÀNG</p><h2 id="order-detail-title">{orderDetail.orderId}</h2><p>{orderDetail.machineCode} · {formatDate(orderDetail.createdAt)} · {orderDetail.status}</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Sản phẩm</th><th>Khe</th><th>Số lượng</th><th>Đơn giá</th><th>Tạm tính</th></tr></thead><tbody>{orderDetail.items.map((item) => <tr key={item.orderItemId}><td>{item.productName}</td><td>{item.slotCode}</td><td>{item.quantity}</td><td>{formatMoney(item.unitPrice)}</td><td>{formatMoney(item.subtotal)}</td></tr>)}</tbody></table></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Thanh toán</th><th>Phương thức</th><th>Trạng thái</th><th>Số tiền</th><th>Thời gian</th></tr></thead><tbody>{orderDetail.payments.map((payment) => <tr key={payment.paymentId}><td>{payment.paymentId.slice(0, 8)}</td><td>{payment.paymentMethod}</td><td>{payment.status}</td><td>{formatMoney(payment.amount)}</td><td>{formatDate(payment.paidAt || payment.createdAt)}</td></tr>)}</tbody></table></div></div></div>}
  </>;
}

function UnavailablePage({ kind }) {
  const reports = kind === 'reports';
  return <>
    <PageTitle eyebrow={reports ? 'PHÂN TÍCH' : 'QUẢN TRỊ HỆ THỐNG'} title={reports ? 'Báo cáo & phân tích' : 'Cấu hình hệ thống'} description={reports ? 'Tổng hợp hoạt động kinh doanh và xuất báo cáo vận hành.' : 'Thiết lập các ngưỡng cảnh báo và tùy chọn vận hành.'} />
    <section className="unavailable-panel"><div className="unavailable-art"><span className="unavailable-art-circle"><Icon name={reports ? 'chart' : 'settings'} size={30} /></span><span className="unavailable-orbit orbit-a" /><span className="unavailable-orbit orbit-b" /></div><span className="coming-chip">CHƯA CÓ API</span><h2>{reports ? 'Dữ liệu báo cáo chưa sẵn sàng' : 'Cấu hình chưa được tích hợp'}</h2><p>{reports ? 'Backend hiện chưa có API danh sách đơn hàng, giao dịch hoặc tổng hợp doanh thu theo sản phẩm, địa điểm và thời gian. Dashboard không hiển thị số liệu mẫu để tránh gây nhầm lẫn.' : 'Backend chưa có API lưu cấu hình ngưỡng nhiệt độ hay thông báo suy giảm hoạt động. Mục này sẽ hoạt động khi có endpoint cấu hình tương ứng.'}</p><div className="unavailable-features">{(reports ? ['Doanh thu & giao dịch', 'Báo cáo CSV / PDF', 'Phân tích theo sản phẩm và địa điểm'] : ['Ngưỡng nhiệt độ', 'Thông báo suy giảm hoạt động', 'Lưu cấu hình theo máy']).map((feature) => <span key={feature}><Icon name="info" size={16} />{feature}</span>)}</div><span className="unavailable-foot">Các mục này sẽ được mở khi backend hỗ trợ API tương ứng.</span></section>
  </>;
}

function DataScopeNote({ children }) {
  return <div className="data-scope-note"><Icon name="info" size={16} /><span>{children}</span></div>;
}

function resourceLabel(key) {
  return { machines: 'Máy', products: 'Sản phẩm', categories: 'Danh mục', users: 'Tài khoản' }[key] || key;
}

export default App;
