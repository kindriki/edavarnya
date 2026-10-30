let cart = [];
let appliedPromo = null;
let appSettings = {};

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

function addToCart(id) {
    const product = (window.menuData || []).find(item => item.id === id);
    if (!product || product.isAvailable === false) return;

    const existing = cart.find(item => item.id === id);
    if (existing) {
        if (existing.quantity >= 99) return showToast("Максимум 99 штук одного блюда.");
        existing.quantity += 1;
    } else {
        cart.push({ id: product.id, quantity: 1, title: product.title, price: Number(product.price) });
    }
    updateCartUI();
    showToast("Товар добавлен в корзину");
}

function updateQuantity(id, change) {
    const item = cart.find(entry => entry.id === id);
    if (!item) return;
    item.quantity += change;
    if (item.quantity <= 0) cart = cart.filter(entry => entry.id !== id);
    if (item.quantity > 99) item.quantity = 99;
    updateCartUI();
}

async function applyPromoCode() {
    const input = document.getElementById("promoInput");
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code) {
        appliedPromo = null;
        updateCartUI();
        return;
    }

    const promoData = await DBService.checkPromocode(code);
    if (promoData) {
        appliedPromo = { code, percent: promoData.discountPercent };
        showToast(`Промокод ${code} применён`);
    } else {
        appliedPromo = null;
        showToast("Промокод неверный или неактивный");
    }
    updateCartUI();
}

function clearCart() {
    cart = [];
    appliedPromo = null;
    updateCartUI();
}

function getCartTotals() {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountAmount = appliedPromo ? Math.round(subtotal * appliedPromo.percent) / 100 : 0;
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const threshold = Number(appSettings.freeDeliveryThreshold ?? 1500);
    const deliveryPrice = Number(appSettings.deliveryCost ?? 199);
    const deliveryFee = afterDiscount >= threshold ? 0 : (afterDiscount > 0 ? deliveryPrice : 0);
    return {
        subtotal: Math.round(subtotal * 100) / 100,
        discountAmount: Math.round(discountAmount * 100) / 100,
        deliveryFee,
        total: Math.round((afterDiscount + deliveryFee) * 100) / 100,
        afterDiscount
    };
}

function updateCartUI() {
    const container = document.getElementById("cartItemsContainer");
    const footer = document.getElementById("cartFooter");
    const countNode = document.getElementById("headerCartCount");
    if (!container || !footer || !countNode) return;

    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-cart">Ваша корзина пуста 😔</div>';
        footer.style.display = "none";
        countNode.textContent = "0";
        return;
    }

    footer.style.display = "block";
    let totalItems = 0;
    container.innerHTML = cart.map(item => {
        totalItems += item.quantity;
        const itemTotal = item.price * item.quantity;
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-title">${escapeHtml(item.title)}</div>
                    <div class="cart-item-price">${itemTotal.toLocaleString("ru-RU")} ₽</div>
                </div>
                <div class="cart-controls">
                    <button class="qty-btn" type="button" aria-label="Уменьшить количество" onclick="updateQuantity('${escapeHtml(item.id)}', -1)">−</button>
                    <span class="qty-val">${item.quantity}</span>
                    <button class="qty-btn" type="button" aria-label="Увеличить количество" onclick="updateQuantity('${escapeHtml(item.id)}', 1)">+</button>
                </div>
            </div>`;
    }).join("");

    const totals = getCartTotals();
    let summary = `<div class="summary-row"><span>Товары (${totalItems}):</span><span>${totals.subtotal.toLocaleString("ru-RU")} ₽</span></div>`;
    if (totals.discountAmount > 0) {
        summary += `<div class="summary-row discount"><span>Скидка (${escapeHtml(appliedPromo.code)}):</span><span>−${totals.discountAmount.toLocaleString("ru-RU")} ₽</span></div>`;
    }
    summary += `<div class="summary-row"><span>Доставка:</span><span>${totals.deliveryFee === 0 ? "Бесплатно" : `${totals.deliveryFee.toLocaleString("ru-RU")} ₽`}</span></div>`;
    summary += `<div class="total-row"><span>Итого:</span><span>${totals.total.toLocaleString("ru-RU")} ₽</span></div>`;
    summary += `<div class="promo-block"><input type="text" id="promoInput" placeholder="Промокод" aria-label="Промокод" value="${appliedPromo ? escapeHtml(appliedPromo.code) : ""}"><button type="button" id="applyPromoBtn">Применить</button></div>`;
    document.getElementById("cartSummary").innerHTML = summary;
    document.getElementById("applyPromoBtn").addEventListener("click", applyPromoCode);

    const minOrder = Number(appSettings.minOrderAmount ?? 500);
    const checkoutBtn = document.getElementById("checkoutBtn");
    const canCheckout = totals.afterDiscount >= minOrder;
    checkoutBtn.disabled = !canCheckout;
    checkoutBtn.textContent = canCheckout ? "Оформить заказ" : `Минимум ${minOrder.toLocaleString("ru-RU")} ₽ за товары`;
    countNode.textContent = String(totalItems);
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2500);
}
