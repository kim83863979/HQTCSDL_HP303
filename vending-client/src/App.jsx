import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, unwrap } from './api.js';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const moneyText = (value) => money.format(Number(value) || 0);
const idOf = (value) => value?.id || value?.machineId || value?.machine_id || value?.productId || value?.product_id;
const categoryIdOf = (product) => product?.category?.id || product?.categoryId || product?.category_id;
const productIdOf = (product) => product?.id || product?.productId || product?.product_id;
const productNameOf = (product) => product?.name || product?.productName || product?.product_name || 'Sản phẩm';
const normalizeStatus = (value) => String(value || '').toUpperCase();
const orderStatusOf = (order) => order?.orderStatus || order?.status || order?.order_status;
const paymentStatusOf = (payment) => payment?.paymentStatus || payment?.status || payment?.payment_status;

function categoryEmoji(name = '') {
  const value = name.toLowerCase();
  if (value.includes('juice') || value.includes('nước') || value.includes('drink')) return '🥤';
  if (value.includes('rau') || value.includes('vegetable')) return '🥬';
  if (value.includes('snack') || value.includes('hạt')) return '🥜';
  if (value.includes('fruit') || value.includes('trái') || value.includes('quả')) return '🍎';
  return '🍊';
}

function productArt(name = '', category = '') {
  const value = (name + ' ' + category).toLowerCase();
  if (value.includes('apple') || value.includes('táo')) return '🍎';
  if (value.includes('orange') || value.includes('cam')) return '🍊';
  if (value.includes('banana') || value.includes('chuối')) return '🍌';
  if (value.includes('juice') || value.includes('nước ép')) return '🧃';
  if (value.includes('laba') || value.includes('sấy')) return '🍌';
  if (value.includes('berry') || value.includes('dâu')) return '🍓';
  return categoryEmoji(category);
}

function productImage(name = '') {
  const value = name.toLowerCase();
  if (value.includes('apple') || value.includes('táo')) return '/products/apple.png';
  if (value.includes('banana') || value.includes('chuối')) return '/products/banana.png';
  if (value.includes('juice') || value.includes('nước ép')) return '/products/orange-juice.png';
  if (value.includes('orange') || value.includes('cam')) return '/products/orange.png';
  return '';
}

function orderStatusText(status) {
  const labels = {
    PENDING: 'Chờ thanh toán',
    PAID: 'Đã thanh toán',
    DISPENSING: 'Máy đang nhả hàng',
    COMPLETED: 'Đã nhận hàng',
    FAILED: 'Giao dịch cần xử lý',
    CANCELLED: 'Đơn đã hủy',
    REFUNDED: 'Đã hoàn tiền',
  };
  return labels[normalizeStatus(status)] || status || 'Đang cập nhật';
}

function paymentStatusText(status) {
  const labels = {
    PENDING: 'Đang chờ xác nhận',
    SUCCESS: 'Thanh toán thành công',
    FAILED: 'Thanh toán thất bại',
    REFUNDED: 'Đã hoàn tiền',
  };
  return labels[normalizeStatus(status)] || status || 'Chưa có giao dịch';
}

function isTerminal(status) {
  return ['COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(normalizeStatus(status));
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState('');
  const [inventory, setInventory] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({});
  const [slotSelection, setSlotSelection] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('QR');
  const [cartOpen, setCartOpen] = useState(false);
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const loadCatalog = useCallback(async () => {
    const [productResult, categoryResult, machineResult] = await Promise.all([
      api.get('/api/products?page=1&limit=100'),
      api.get('/api/categories'),
      api.get('/api/machines'),
    ]);
    const productPayload = unwrap(productResult);
    const categoryPayload = unwrap(categoryResult);
    const machinePayload = unwrap(machineResult);
    const productList = Array.isArray(productPayload) ? productPayload : productPayload?.items || [];
    const machineList = Array.isArray(machinePayload) ? machinePayload : machinePayload?.items || [];
    const activeMachines = machineList.filter((machine) =>
      !machine.lifecycleStatus || normalizeStatus(machine.lifecycleStatus) === 'ACTIVE'
    );
    setProducts(productList);
    setCategories(Array.isArray(categoryPayload) ? categoryPayload : categoryPayload?.items || []);
    setMachines(activeMachines);
    setMachineId((current) => current && activeMachines.some((machine) => idOf(machine) === current)
      ? current
      : idOf(activeMachines[0]) || '');
  }, []);

  const loadInventory = useCallback(async (id, quiet = false) => {
    if (!id) {
      setInventory([]);
      return;
    }
    if (!quiet) setInventoryLoading(true);
    try {
      const payload = unwrap(await api.get('/api/inventory/machines/' + encodeURIComponent(id)));
      setInventory(Array.isArray(payload) ? payload : payload?.items || []);
      setError('');
    } catch (requestError) {
      setInventory([]);
      setError(requestError.message);
    } finally {
      if (!quiet) setInventoryLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      await loadCatalog();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadCatalog]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const timer = window.setInterval(() => refreshAll(true), 15000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  useEffect(() => {
    if (machineId) loadInventory(machineId);
  }, [machineId, loadInventory]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (machineId) loadInventory(machineId, true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [machineId, loadInventory]);

  const stockForProduct = useCallback((productId) => {
    return inventory
      .filter((row) =>
        (row.product_id || row.productId) === productId &&
        normalizeStatus(row.slot_status || row.slotStatus || 'ACTIVE') === 'ACTIVE' &&
        normalizeStatus(row.product_status || row.productStatus || 'ACTIVE') === 'ACTIVE'
      )
      .map((row) => ({
        slotId: row.slot_id || row.slotId,
        slotCode: row.slot_code || row.slotCode || 'Khe',
        available: Number(row.available_quantity ?? row.availableQuantity ??
          (Number(row.quantity || 0) - Number(row.reserved_quantity || row.reservedQuantity || 0))),
      }))
      .filter((row) => row.slotId);
  }, [inventory]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    return products.filter((product) => {
      const categoryId = categoryIdOf(product);
      const categoryName = product.category?.name || product.categoryName || product.category_name || '';
      const matchesCategory = selectedCategory === 'all' ||
        categoryId === selectedCategory ||
        categoryName === selectedCategory;
      const matchesSearch = !query ||
        productNameOf(product).toLocaleLowerCase('vi').includes(query) ||
        String(product.description || '').toLocaleLowerCase('vi').includes(query) ||
        categoryName.toLocaleLowerCase('vi').includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);

  const cartItems = useMemo(() => Object.values(cart).map((item) => {
    const product = products.find((candidate) => productIdOf(candidate) === item.productId);
    const slot = stockForProduct(item.productId).find((candidate) => candidate.slotId === item.slotId);
    return { ...item, product, slot };
  }).filter((item) => item.product), [cart, products, stockForProduct]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + (Number(item.product.unitPrice || item.product.unit_price) * item.quantity), 0);
  const activeMachine = machines.find((machine) => idOf(machine) === machineId);
  const machineOnline = activeMachine
    ? (typeof activeMachine.isOnline === 'boolean'
      ? activeMachine.isOnline
      : ['ONLINE', 'CONNECTED'].includes(normalizeStatus(activeMachine.connectionStatus || activeMachine.connection_status)))
    : false;
  const machineName = activeMachine?.name || activeMachine?.machineName || activeMachine?.machine_code || activeMachine?.machineCode || 'Máy bán hàng';

  const setProductSlot = (productId, nextSlotId) => {
    setSlotSelection((current) => ({ ...current, [productId]: nextSlotId }));
    setCart((current) => {
      const item = current[productId];
      if (!item) return current;
      const nextSlot = stockForProduct(productId).find((slot) => slot.slotId === nextSlotId);
      if (!nextSlot || nextSlot.available < 1) {
        const copy = { ...current };
        delete copy[productId];
        return copy;
      }
      return {
        ...current,
        [productId]: { ...item, slotId: nextSlotId, quantity: Math.min(item.quantity, nextSlot.available) },
      };
    });
  };

  const addToCart = (product) => {
    if (!machineOnline) return;
    const productId = productIdOf(product);
    const slots = stockForProduct(productId);
    const chosenSlotId = slotSelection[productId] || slots[0]?.slotId;
    const chosenSlot = slots.find((slot) => slot.slotId === chosenSlotId);
    if (!chosenSlot || chosenSlot.available < 1) return;
    setCart((current) => {
      const previous = current[productId];
      if (previous?.slotId === chosenSlotId) {
        if (previous.quantity >= chosenSlot.available) return current;
        return { ...current, [productId]: { ...previous, quantity: previous.quantity + 1 } };
      }
      return { ...current, [productId]: { productId, slotId: chosenSlotId, quantity: 1 } };
    });
    setCheckoutError('');
  };

  const changeQuantity = (productId, change) => {
    setCart((current) => {
      const item = current[productId];
      if (!item) return current;
      const capacity = stockForProduct(productId).find((slot) => slot.slotId === item.slotId)?.available || 0;
      const nextQuantity = item.quantity + change;
      if (nextQuantity < 1) {
        const copy = { ...current };
        delete copy[productId];
        return copy;
      }
      return { ...current, [productId]: { ...item, quantity: Math.min(nextQuantity, capacity) } };
    });
  };

  const checkout = async () => {
    if (!machineOnline) {
      setCheckoutError('Máy đang ngoại tuyến, hiện chưa thể nhận đơn. Vui lòng thử lại sau.');
      return;
    }
    if (!machineId || !cartItems.length || checkoutBusy) return;
    const invalidItem = cartItems.find((item) => !item.slot || item.quantity > item.slot.available);
    if (invalidItem) {
      setCheckoutError('Tồn kho vừa thay đổi. Hãy làm mới số lượng rồi thử lại.');
      await loadInventory(machineId);
      return;
    }
    setCheckoutBusy(true);
    setCheckoutError('');
    try {
      const orderPayload = unwrap(await api.post('/api/orders', {
        machineId,
        items: cartItems.map((item) => ({
          productId: item.productId,
          slotId: item.slotId,
          quantity: item.quantity,
        })),
      }));
      const createdOrder = orderPayload?.order || orderPayload;
      const orderId = createdOrder?.orderId || createdOrder?.id || createdOrder?.order_id;
      if (!orderId) throw new Error('Backend chưa trả mã đơn hàng để tiếp tục thanh toán.');

      setCart({});
      setCartOpen(false);
      setFlow({ order: createdOrder, payment: null, paymentError: '' });

      try {
        const paymentPayload = unwrap(await api.post('/api/payments', { orderId, paymentMethod }));
        const payment = paymentPayload?.payment || paymentPayload;
        setFlow((current) => current ? { ...current, order: createdOrder, payment } : current);
      } catch (paymentError) {
        setFlow((current) => current ? { ...current, paymentError: paymentError.message } : current);
      }
      await loadInventory(machineId, true);
    } catch (requestError) {
      setCheckoutError(requestError.message);
    } finally {
      setCheckoutBusy(false);
    }
  };

  const simulatePaymentResult = async (paymentStatus) => {
    const paymentId = flow?.payment?.paymentId || flow?.payment?.payment_id;
    if (!paymentId || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError('');
    try {
      await api.post('/api/payments/' + encodeURIComponent(paymentId) + '/result', {
        paymentStatus,
        transactionReference: 'DEMO-' + Date.now(),
      });
      const orderId = flow.order?.orderId || flow.order?.id || flow.order?.order_id;
      const [orderResult, paymentResult] = await Promise.all([
        api.get('/api/orders/' + encodeURIComponent(orderId)),
        api.get('/api/payments/' + encodeURIComponent(paymentId)),
      ]);
      setFlow((current) => current ? {
        ...current,
        order: unwrap(orderResult)?.order || unwrap(orderResult),
        payment: unwrap(paymentResult)?.payment || unwrap(paymentResult),
      } : current);
    } catch (requestError) {
      setCheckoutError(requestError.message);
    } finally {
      setCheckoutBusy(false);
    }
  };

  const retryPayment = async () => {
    const orderId = flow?.order?.orderId || flow?.order?.id || flow?.order?.order_id;
    if (!orderId || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError('');
    try {
      const result = unwrap(await api.post('/api/orders/' + encodeURIComponent(orderId) + '/payments', { paymentMethod }));
      const nextPayment = result?.payment || result;
      setFlow((current) => current ? {
        ...current,
        payment: {
          ...nextPayment,
          paymentId: nextPayment?.paymentId || nextPayment?.id || nextPayment?.payment_id,
          paymentStatus: nextPayment?.paymentStatus || nextPayment?.status || nextPayment?.payment_status,
          paymentMethod: nextPayment?.paymentMethod || nextPayment?.method || nextPayment?.payment_method,
        },
        paymentError: '',
      } : current);
    } catch (requestError) {
      setCheckoutError(requestError.message);
    } finally {
      setCheckoutBusy(false);
    }
  };

  useEffect(() => {
    if (!flow) return undefined;
    const orderId = flow.order?.orderId || flow.order?.id || flow.order?.order_id;
    const paymentId = flow.payment?.paymentId || flow.payment?.payment_id;
    if (!orderId || !paymentId || isTerminal(orderStatusOf(flow.order))) return undefined;

    let active = true;
    const poll = async () => {
      try {
        const [orderResult, paymentResult] = await Promise.all([
          api.get('/api/orders/' + encodeURIComponent(orderId)),
          api.get('/api/payments/' + encodeURIComponent(paymentId)),
        ]);
        if (!active) return;
        const nextOrder = unwrap(orderResult)?.order || unwrap(orderResult);
        const nextPayment = unwrap(paymentResult)?.payment || unwrap(paymentResult);
        setFlow((current) => current ? { ...current, order: nextOrder, payment: nextPayment } : current);
      } catch {
        // Keep the latest server-confirmed status; the next poll can recover.
      }
    };
    const timer = window.setInterval(poll, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [flow?.order?.orderId, flow?.order?.id, flow?.order?.orderStatus, flow?.order?.status, flow?.payment?.paymentId]);

  const categoryOptions = [{ id: 'all', name: 'Tất cả', emoji: '✦' }, ...categories.map((category) => ({
    id: category.id || category.categoryId || category.category_id,
    name: category.name || category.categoryName || category.category_name,
    emoji: categoryEmoji(category.name || category.categoryName || category.category_name),
  }))];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="FreshVend trang chủ">
          <span className="brand-mark">fv</span>
          <span className="brand-word">fresh<span>vend</span></span>
        </a>
        <div className="topbar-center"><span className={'live-dot ' + (machineOnline ? '' : 'offline-dot')} /><span>{machineOnline ? 'Máy đang kết nối' : 'Máy ngoại tuyến'}</span></div>
        <div className="topbar-actions">
          <button className="icon-button refresh-button" onClick={() => refreshAll(true)} disabled={refreshing} aria-label="Làm mới dữ liệu">
            <span className={refreshing ? 'spin' : ''}>↻</span>
          </button>
          <button className="cart-button" onClick={() => setCartOpen(true)}>
            <span className="cart-symbol">▱</span><span>Giỏ hàng</span><span className="cart-count">{cartCount}</span>
          </button>
        </div>
      </header>

      <main className="page-wrap">
        <section className="welcome-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> TƯƠI NGON MỖI NGÀY</div>
            <h1>Món ngon tươi mát,<br /><em>chọn là có ngay.</em></h1>
            <p className="welcome-copy">Chọn món yêu thích và để FreshVend chuẩn bị cho bạn.</p>
          </div>
          <div className="machine-picker">
            <span className="machine-icon">⌖</span>
            <label htmlFor="machine-select">
              <span>ĐANG MUA TẠI</span>
              <select id="machine-select" value={machineId} onChange={(event) => setMachineId(event.target.value)} disabled={!machines.length || loading}>
                {machines.length ? machines.map((machine) => (
                  <option key={idOf(machine)} value={idOf(machine)}>
                    {machine.name || machine.machineName || machine.machine_code || machine.machineCode || 'Máy FreshVend'}{machine.location ? ' · ' + machine.location : ''}
                  </option>
                )) : <option value="">Chưa có máy khả dụng</option>}
              </select>
            </label>
            <span className="picker-chevron">⌄</span>
          </div>
        </section>

        {!machineOnline && !loading && (
          <div className="notice machine-offline-notice" role="status">
            <span>!</span><div><strong>Máy đang ngoại tuyến</strong><p>Bạn vẫn có thể xem sản phẩm, nhưng tạm thời chưa thể thêm hàng hoặc đặt đơn.</p></div>
            <button onClick={() => refreshAll(true)} className="notice-action" disabled={refreshing}>Kiểm tra lại</button>
          </div>
        )}

        <section className="shop-toolbar">
          <div className="section-title"><h2>Chọn món hôm nay</h2><span className="product-total">{products.length} sản phẩm</span></div>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm trái cây, nước ép..." aria-label="Tìm sản phẩm" />
            {search && <button onClick={() => setSearch('')} aria-label="Xóa nội dung tìm kiếm">×</button>}
          </label>
        </section>

        <nav className="category-row" aria-label="Danh mục sản phẩm">
          {categoryOptions.map((category) => (
            <button key={category.id} className={'category-chip ' + (selectedCategory === category.id ? 'selected' : '')} onClick={() => setSelectedCategory(category.id)}>
              <span>{category.emoji}</span>{category.name}
            </button>
          ))}
        </nav>

        {error && (
          <div className="notice error-notice" role="alert">
            <span>!</span><div><strong>Chưa tải được dữ liệu</strong><p>{error}</p></div>
            <button onClick={() => refreshAll()} className="notice-action">Thử lại</button>
          </div>
        )}
        {!error && inventoryLoading && !inventory.length && <div className="notice loading-notice"><span className="loader" /> Đang lấy tình trạng hàng trong máy…</div>}

        <section className="product-grid" aria-live="polite">
          {loading && Array.from({ length: 6 }).map((_, index) => <div className="product-skeleton" key={index} />)}
          {!loading && !error && filteredProducts.map((product, index) => {
            const productId = productIdOf(product);
            const categoryName = product.category?.name || product.categoryName || product.category_name || '';
            const slots = stockForProduct(productId);
            const available = slots.reduce((sum, slot) => sum + Math.max(0, slot.available), 0);
            const selectedSlot = slotSelection[productId] || slots[0]?.slotId || '';
            const selectedSlotData = slots.find((slot) => slot.slotId === selectedSlot);
            const inCart = cart[productId]?.quantity || 0;
            const canAdd = Boolean(machineOnline && selectedSlotData && selectedSlotData.available > inCart);
            const productName = productNameOf(product);
            const image = productImage(productName);
            return (
              <article className="product-card" key={productId} style={{ '--card-delay': (index % 8) * 45 + 'ms' }}>
                <div className={'product-art art-' + (index % 5)}>
                  <span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" />
                  {image
                    ? <img className={'product-photo' + (image.includes('juice') ? ' juice-photo' : '')} src={image} alt={productName} loading="lazy" />
                    : <span className="fruit-emoji">{productArt(productName, categoryName)}</span>}
                  <span className="art-category">{categoryName || 'TƯƠI MÁT'}</span><span className="art-number">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <div className="product-info">
                  <div className="product-title-row">
                    <div><p className="product-category">{categoryName || 'FreshVend tuyển chọn'}</p><h3>{productNameOf(product)}</h3></div>
                    <span className="fresh-badge"><i /> Tươi</span>
                  </div>
                  <p className="product-description">{product.description || 'Tươi ngon, được chọn lọc mỗi ngày.'}</p>
                  <div className="product-bottom">
                    <div>
                      <strong className="product-price">{moneyText(product.unitPrice ?? product.unit_price)}</strong>
                      <span className={'stock-label ' + (available > 0 ? 'in-stock' : 'out-stock')}>{available > 0 ? 'Còn ' + available + ' phần' : 'Tạm hết hàng'}</span>
                    </div>
                    <button className="add-button" onClick={() => addToCart(product)} disabled={!canAdd} aria-label={'Thêm ' + productNameOf(product) + ' vào giỏ'}>
                      {inCart ? <><span>✓</span> {inCart}</> : <span>＋</span>}
                    </button>
                  </div>
                  {slots.length > 1 && (
                    <label className="slot-select"><span>Vị trí trong máy</span>
                      <select value={selectedSlot} onChange={(event) => setProductSlot(productId, event.target.value)}>
                        {slots.map((slot) => <option key={slot.slotId} value={slot.slotId} disabled={slot.available < 1}>{slot.slotCode} · còn {slot.available}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        {!loading && !error && filteredProducts.length === 0 && (
          <div className="empty-state"><span>🍃</span><h3>Chưa tìm thấy món phù hợp</h3><p>Thử chọn danh mục khác hoặc đổi từ khóa nhé.</p><button onClick={() => { setSearch(''); setSelectedCategory('all'); }}>Xem tất cả sản phẩm</button></div>
        )}

        <footer className="page-footer"><span className="brand-mark small">fv</span><span>FreshVend · Tươi ngon trong tầm tay</span><span className="footer-location">⌖ {activeMachine?.location || machineName}</span></footer>
      </main>

      <button className={'floating-cart ' + (cartCount ? 'has-items' : '')} onClick={() => setCartOpen(true)}>
        <span>Giỏ hàng</span><span>{cartCount}</span><b>{moneyText(cartTotal)}</b>
      </button>

      {cartOpen && (
        <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <aside className="cart-drawer" aria-label="Giỏ hàng">
            <div className="drawer-head"><div><p className="eyebrow">FRESHVEND</p><h2>Giỏ hàng <span>({cartCount})</span></h2></div><button className="close-button" onClick={() => setCartOpen(false)} aria-label="Đóng">×</button></div>
            <div className="drawer-machine"><span>⌖</span><div><small>Đơn hàng tại</small><strong>{machineName}</strong></div></div>
            {!cartItems.length ? (
              <div className="cart-empty"><span>🛍️</span><h3>Giỏ hàng đang trống</h3><p>Chọn vài món tươi ngon để bắt đầu nhé.</p><button onClick={() => setCartOpen(false)}>Tiếp tục chọn món</button></div>
            ) : (
              <>
                <div className="cart-list">
                  {cartItems.map((item) => (
                    <div className="cart-item" key={item.productId}>
                      <div className="cart-thumb">
                        {productImage(productNameOf(item.product))
                          ? <img src={productImage(productNameOf(item.product))} alt={productNameOf(item.product)} />
                          : productArt(productNameOf(item.product), item.product.category?.name)}
                      </div>
                      <div className="cart-item-main">
                        <div className="cart-item-top"><div><strong>{productNameOf(item.product)}</strong><small>{item.slot?.slotCode || 'Máy bán hàng'}</small></div><button className="remove-item" onClick={() => changeQuantity(item.productId, -item.quantity)} aria-label="Xóa sản phẩm">×</button></div>
                        <div className="cart-item-bottom"><strong>{moneyText(Number(item.product.unitPrice || item.product.unit_price) * item.quantity)}</strong>
                          <div className="quantity-control"><button onClick={() => changeQuantity(item.productId, -1)} aria-label="Giảm số lượng">−</button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.productId, 1)} disabled={!item.slot || item.quantity >= item.slot.available} aria-label="Tăng số lượng">＋</button></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="checkout-area">
                  <label className="payment-choice"><span>Phương thức thanh toán</span>
                    <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                      <option value="QR">Quét mã QR</option><option value="CARD">Thẻ ngân hàng</option><option value="CASH">Tiền mặt</option>
                    </select>
                  </label>
                  <div className="total-line"><span>Tạm tính</span><strong>{moneyText(cartTotal)}</strong></div>
                  <div className="total-line subdued"><span>Phí dịch vụ</span><span>Miễn phí</span></div>
                  <div className="total-line final-total"><span>Tổng cộng</span><strong>{moneyText(cartTotal)}</strong></div>
                  {checkoutError && <p className="inline-error" role="alert">{checkoutError}</p>}
                  {!machineOnline && <p className="inline-error" role="status">Máy đang ngoại tuyến; chưa thể tiếp tục thanh toán.</p>}
                  <button className="checkout-button" disabled={checkoutBusy || !machineId || !machineOnline} onClick={checkout}>
                    {checkoutBusy ? <><span className="loader light" /> Đang tạo đơn…</> : <>Tiếp tục thanh toán <span>→</span></>}
                  </button>
                  <p className="secure-note"><span>◇</span> Giá và tồn kho được xác nhận bởi hệ thống</p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {flow && (
        <div className="scrim tracker-scrim">
          <section className="order-dialog" role="dialog" aria-modal="true" aria-labelledby="order-title">
            <button className="close-button tracker-close" onClick={() => setFlow(null)} aria-label="Đóng">×</button>
            <div className="tracker-art">{normalizeStatus(orderStatusOf(flow.order)) === 'COMPLETED' ? '🎉' : '🧾'}</div>
            <p className="eyebrow">ĐƠN HÀNG FRESHVEND</p>
            <h2 id="order-title">{normalizeStatus(orderStatusOf(flow.order)) === 'COMPLETED' ? 'Đơn hàng hoàn tất!' : 'Đơn hàng của bạn'}</h2>
            <p className="order-code">Mã đơn: <strong>{flow.order?.orderId || flow.order?.id || flow.order?.order_id}</strong></p>
            <div className="status-card">
              <div className="status-row"><span>Trạng thái đơn</span><strong className={'status-pill ' + normalizeStatus(orderStatusOf(flow.order)).toLowerCase()}>{orderStatusText(orderStatusOf(flow.order))}</strong></div>
              <div className="status-row"><span>Thanh toán</span><strong className={'status-pill ' + normalizeStatus(paymentStatusOf(flow.payment)).toLowerCase()}>{paymentStatusText(paymentStatusOf(flow.payment))}</strong></div>
              {flow.order?.totalAmount && <div className="status-row"><span>Tổng tiền</span><strong>{moneyText(flow.order.totalAmount)}</strong></div>}
            </div>
            <div className="timeline">
              <div className="timeline-step done"><span>✓</span><div><strong>Đã tạo đơn</strong><small>Backend đã ghi nhận yêu cầu mua hàng</small></div></div>
              <div className={'timeline-step ' + (normalizeStatus(paymentStatusOf(flow.payment)) === 'SUCCESS' ? 'done' : 'current')}><span>{normalizeStatus(paymentStatusOf(flow.payment)) === 'SUCCESS' ? '✓' : '2'}</span><div><strong>Thanh toán</strong><small>{paymentStatusText(paymentStatusOf(flow.payment))}</small></div></div>
              <div className={'timeline-step ' + (normalizeStatus(orderStatusOf(flow.order)) === 'COMPLETED' ? 'done' : ['PAID', 'DISPENSING'].includes(normalizeStatus(orderStatusOf(flow.order))) ? 'current' : '')}><span>{normalizeStatus(orderStatusOf(flow.order)) === 'COMPLETED' ? '✓' : '3'}</span><div><strong>Máy nhả hàng</strong><small>{normalizeStatus(orderStatusOf(flow.order)) === 'COMPLETED' ? 'Bạn có thể nhận hàng' : normalizeStatus(orderStatusOf(flow.order)) === 'FAILED' ? 'Backend ghi nhận nhả hàng thất bại' : 'Đang chờ Backend cập nhật kết quả'}</small></div></div>
            </div>
            {flow.paymentError && <div className="inline-error">{flow.paymentError}</div>}
            {checkoutError && <div className="inline-error" role="alert">{checkoutError}</div>}
            {normalizeStatus(paymentStatusOf(flow.payment)) === 'PENDING' && (
              <>
                <div className="payment-wait-note">Thanh toán mô phỏng cho bài demo. Chọn kết quả để Backend cập nhật đơn hàng.</div>
                <div className="payment-demo-actions">
                  <button disabled={checkoutBusy} onClick={() => simulatePaymentResult('SUCCESS')}>{checkoutBusy ? 'Đang xử lý…' : 'Mô phỏng thanh toán thành công'}</button>
                  <button disabled={checkoutBusy} onClick={() => simulatePaymentResult('FAILED')}>Mô phỏng thanh toán thất bại</button>
                </div>
              </>
            )}
            {normalizeStatus(paymentStatusOf(flow.payment)) === 'FAILED' && normalizeStatus(orderStatusOf(flow.order)) === 'PENDING' && (
              <button className="retry-payment-button" disabled={checkoutBusy} onClick={retryPayment}>
                {checkoutBusy ? 'Đang tạo lần thanh toán…' : 'Thử thanh toán lại'}
              </button>
            )}
            {normalizeStatus(orderStatusOf(flow.order)) === 'PAID' && <div className="payment-wait-note">Đã thanh toán. Đang chờ máy gửi kết quả nhả hàng.</div>}
            <button className="dialog-done" onClick={() => setFlow(null)}>Đóng theo dõi đơn</button>
            <p className="auto-refresh-note"><span className="live-dot" /> Trạng thái được đồng bộ tự động</p>
          </section>
        </div>
      )}
    </div>
  );
}
