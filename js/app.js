let currentCategory = "Все";
let currentSearch = "";
let currentSort = "default";
let authMode = "login";
let currentUser = null;
window.menuData = [];
window.currentUser = null;

function renderFilters() {
    const categories = ["Все", ...new Set((window.menuData || []).map(item => item.category).filter(Boolean))];
    const container = document.getElementById("filtersContainer");
    container.innerHTML = categories.map(category => `
        <button class="filter-btn ${category === currentCategory ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
    `).join("");
    container.querySelectorAll("[data-category]").forEach(button => {
        button.addEventListener("click", () => setCategory(button.dataset.category));
    });
}

function getVisibleMenu() {
    let items = (window.menuData || []).filter(item => currentCategory === "Все" || item.category === currentCategory);
    const query = currentSearch.trim().toLocaleLowerCase("ru");
    if (query) {
        items = items.filter(item =>
            String(item.title || "").toLocaleLowerCase("ru").includes(query) ||
            String(item.description || "").toLocaleLowerCase("ru").includes(query) ||
            String(item.category || "").toLocaleLowerCase("ru").includes(query)
        );
    }
    if (currentSort === "price-asc") items.sort((a, b) => Number(a.price) - Number(b.price));
    if (currentSort === "price-desc") items.sort((a, b) => Number(b.price) - Number(a.price));
    if (currentSort === "name") items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru"));
    return items;
}

function renderMenu() {
    const grid = document.getElementById("menuGrid");
    const items = getVisibleMenu();
    if (!items.length) {
        const diagnostics = window.menuLoadDiagnostics;
        if (diagnostics && diagnostics.documentsFound === 0) {
            grid.innerHTML = `<div class="empty-state"><span>🍽️</span><h3>Коллекция меню пуста для этого сайта</h3><p>Подключение к Firebase работает, но в проекте <strong>${escapeHtml(diagnostics.projectId)}</strong> в коллекции <strong>menu</strong> найдено 0 документов.</p><p>Проверьте, что документ <strong>menu / Dish1</strong> находится именно в этом проекте и в базе данных (default). Затем обновите страницу сочетанием Ctrl + F5.</p></div>`;
        } else if (diagnostics && diagnostics.documentsFound > 0) {
            grid.innerHTML = `<div class="empty-state"><span>⚠️</span><h3>Блюда найдены, но не прошли проверку</h3><p>Найдено документов: ${diagnostics.documentsFound}; доступных блюд: ${diagnostics.availableDishes}. Проверьте, что поле <strong>price</strong> — число (например 520), а <strong>isAvailable</strong> не равно false.</p></div>`;
        } else {
            grid.innerHTML = `<div class="empty-state"><span>🍽️</span><h3>Ничего не найдено</h3><p>Попробуйте изменить запрос или выбрать другую категорию.</p></div>`;
        }
        return;
    }
    grid.innerHTML = items.map(item => `
        <article class="card" data-aos="fade-up">
            <div class="card-image-wrap">
                <img src="${escapeHtml(item.imageUrl || "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80")}" alt="${escapeHtml(item.title)}" class="card-img" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80'">
                <span class="dish-category">${escapeHtml(item.category || "Домашняя кухня")}</span>
            </div>
            <div class="card-content">
                <div class="card-title-row"><h3 class="card-title">${escapeHtml(item.title || "Блюдо")}</h3><span class="card-price">${Number(item.price).toLocaleString("ru-RU")} ₽</span></div>
                <p class="card-desc">${escapeHtml(item.description || "Приготовлено с заботой и из свежих продуктов.")}</p>
                <button class="card-btn" type="button" data-add="${escapeHtml(item.id)}"><span>＋</span> В корзину</button>
            </div>
        </article>
    `).join("");
    grid.querySelectorAll("[data-add]").forEach(button => {
        button.addEventListener("click", () => addToCart(button.dataset.add));
    });
    if (typeof AOS !== "undefined") AOS.refresh();
}

function renderReviews(reviews) {
    const grid = document.getElementById("reviewsGrid");
    if (!reviews || reviews.length === 0) {
        grid.innerHTML = '<div class="empty-state"><span>💬</span><h3>Пока нет отзывов</h3><p>Станьте первым, кто поделится впечатлениями!</p></div>';
        return;
    }
    grid.innerHTML = reviews.map(review => {
        const rating = Math.max(1, Math.min(5, Math.trunc(Number(review.rating) || 5)));
        let date = "";
        try {
            const raw = review.createdAt?.toDate ? review.createdAt.toDate() : (review.createdAt ? new Date(review.createdAt) : null);
            if (raw && !Number.isNaN(raw.getTime())) date = raw.toLocaleDateString("ru-RU");
        } catch (_) {}
        return `<article class="review-card" data-aos="fade-up">
            <div class="review-stars" aria-label="Оценка ${rating} из 5">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</div>
            <p class="review-text">${escapeHtml(review.text || "")}</p>
            <div class="review-meta"><span class="review-author">${escapeHtml(review.name || "Гость")}</span><span class="review-date">${escapeHtml(date)}</span></div>
        </article>`;
    }).join("");
    if (typeof AOS !== "undefined") AOS.refresh();
}

function setCategory(category) {
    currentCategory = category;
    renderFilters();
    renderMenu();
}

function toggleModal(id, open) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.toggle("open", open);
    modal.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("modal-open", Boolean(document.querySelector(".modal-overlay.open")));
}

function setCheckoutError(message) {
    const node = document.getElementById("checkoutError");
    node.textContent = message || "";
    node.hidden = !message;
}

function setFormMessage(id, message) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
}

function friendlyAuthError(error) {
    const codes = {
        "auth/email-already-in-use": "Этот email уже зарегистрирован. Попробуйте войти.",
        "auth/invalid-email": "Проверьте правильность email.",
        "auth/weak-password": "Пароль должен содержать не менее 6 символов.",
        "auth/user-not-found": "Пользователь с таким email не найден.",
        "auth/wrong-password": "Неверный email или пароль.",
        "auth/invalid-credential": "Неверный email или пароль.",
        "auth/too-many-requests": "Слишком много попыток. Попробуйте позже.",
        "auth/network-request-failed": "Нет соединения с Firebase. Проверьте интернет.",
        "auth/operation-not-allowed": "В Firebase Console включите способ входа Email/Password."
    };
    return codes[error?.code] || error?.message || "Не удалось выполнить действие. Попробуйте ещё раз.";
}

function updateAuthUI() {
    const openButton = document.getElementById("openAuthBtn");
    const greeting = document.getElementById("userGreeting");
    const reviewNote = document.getElementById("reviewAuthNote");
    const reviewButton = document.getElementById("submitReviewBtn");
    const accountActions = document.getElementById("accountActions");
    const authForm = document.getElementById("authForm");
    if (currentUser) {
        const displayName = currentUser.profile?.firstName || currentUser.displayName || currentUser.email?.split("@")[0] || "Пользователь";
        openButton.textContent = "Мой аккаунт";
        greeting.textContent = `Привет, ${displayName}`;
        greeting.hidden = false;
        reviewNote.textContent = "Отзыв будет опубликован от имени вашего аккаунта.";
        reviewButton.disabled = false;
        accountActions.hidden = false;
        document.getElementById("authTabs").hidden = true;
        authForm.hidden = true;
        document.getElementById("authTitle").textContent = "Ваш аккаунт";
        document.getElementById("accountEmail").textContent = currentUser.email || "";
    } else {
        openButton.textContent = "Войти / Регистрация";
        greeting.hidden = true;
        reviewNote.textContent = "Войдите или зарегистрируйтесь, чтобы оставить отзыв.";
        reviewButton.disabled = true;
        accountActions.hidden = true;
        document.getElementById("authTabs").hidden = false;
        authForm.hidden = false;
        document.getElementById("authTitle").textContent = "Личный кабинет";
    }
}

function setAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll("[data-auth-mode]").forEach(button => button.classList.toggle("active", button.dataset.authMode === mode));
    document.getElementById("authNameWrap").hidden = mode !== "register";
    document.getElementById("authPhoneWrap").hidden = mode !== "register";
    document.getElementById("authSubmitBtn").textContent = mode === "register" ? "Создать аккаунт" : "Войти";
    document.getElementById("forgotPasswordBtn").hidden = mode !== "login";
    document.getElementById("authForm").reset();
    setFormMessage("authError", "");
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const submit = document.getElementById("authSubmitBtn");
    submit.disabled = true;
    submit.textContent = authMode === "register" ? "Создаём аккаунт…" : "Входим…";
    setFormMessage("authError", "");
    try {
        if (authMode === "register") {
            const firstName = String(values.firstName || "").trim();
            if (!firstName) throw new Error("Введите имя.");
            const credential = await firebase.auth().createUserWithEmailAndPassword(String(values.email).trim(), values.password);
            await credential.user.updateProfile({ displayName: firstName });
            const profile = {
                uid: credential.user.uid,
                email: credential.user.email,
                firstName,
                lastName: "",
                phone: String(values.phone || "").trim(),
                role: "customer",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection("users").doc(credential.user.uid).set(profile, { merge: true });
            currentUser = {
                uid: credential.user.uid,
                email: credential.user.email,
                displayName: firstName,
                profile
            };
            window.currentUser = currentUser;
            showToast("Аккаунт создан!");
            toggleModal("authModal", false);
        } else {
            await firebase.auth().signInWithEmailAndPassword(String(values.email).trim(), values.password);
            showToast("Вы вошли в аккаунт");
            toggleModal("authModal", false);
        }
        updateAuthUI();
    } catch (error) {
        console.error("Ошибка авторизации:", error);
        setFormMessage("authError", friendlyAuthError(error));
    } finally {
        submit.disabled = false;
        submit.textContent = authMode === "register" ? "Создать аккаунт" : "Войти";
    }
}

async function refreshCurrentProfile(user) {
    if (!user) {
        currentUser = null;
        window.currentUser = null;
        updateAuthUI();
        return;
    }
    let profile = {};
    try {
        const snap = await db.collection("users").doc(user.uid).get();
        if (snap.exists) profile = snap.data();
        else {
            profile = {
                uid: user.uid, email: user.email || "", firstName: user.displayName || "",
                lastName: "", phone: "", role: "customer",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection("users").doc(user.uid).set(profile, { merge: true });
        }
    } catch (error) {
        console.warn("Профиль пользователя не удалось загрузить:", error);
    }
    currentUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        profile
    };
    window.currentUser = currentUser;
    updateAuthUI();
    const firstName = profile.firstName || user.displayName || "";
    const nameInput = document.querySelector('#checkoutForm [name="firstName"]');
    const phoneInput = document.querySelector('#checkoutForm [name="phone"]');
    if (nameInput && firstName) nameInput.value = firstName;
    if (phoneInput && profile.phone) phoneInput.value = profile.phone;
}

async function loadReviews() {
    try {
        renderReviews(await DBService.getReviews());
    } catch (error) {
        console.warn("Отзывы недоступны", error);
        renderReviews([]);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof AOS !== "undefined") AOS.init({ duration: 700, easing: "ease-out-cubic", once: true, offset: 70 });

    // Авторизация сохраняется между перезагрузками через Firebase Auth.
    firebase.auth().onAuthStateChanged(user => refreshCurrentProfile(user));

    try {
        // Грузим меню отдельно: если оно не прочиталось, отзывы и остальной сайт
        // всё равно остаются рабочими, а ошибка видна в консоли.
        const settingsPromise = DBService.getSettings();
        const reviewsPromise = DBService.getReviews();
        appSettings = await settingsPromise;
        try {
            window.menuData = await DBService.getMenu();
        } catch (menuError) {
            console.error("[Едоварня] Не удалось прочитать коллекцию menu:", menuError);
            window.menuLoadDiagnostics = { projectId: firebase.app().options.projectId, documentsFound: -1, availableDishes: 0 };
            document.getElementById("menuGrid").innerHTML = `<div class="empty-state"><span>⚠️</span><h3>Не удалось загрузить меню</h3><p>${escapeHtml(menuError.message || "Ошибка Firestore")}</p><p>Откройте F12 → Console. Обычно причина — правила Firestore, неверный проект или подключение к другой базе.</p></div>`;
        }
        const reviews = await reviewsPromise;
        renderFilters();
        renderMenu();
        renderReviews(reviews);
        updateCartUI();
    } catch (error) {
        console.error("Ошибка загрузки Firebase:", error);
        document.getElementById("menuGrid").innerHTML = '<div class="empty-state"><h3>Не удалось загрузить меню</h3><p>Проверьте настройки Firebase и правила Firestore.</p></div>';
        document.getElementById("reviewsGrid").innerHTML = '<div class="empty-state"><h3>Отзывы временно недоступны</h3></div>';
    }

    document.getElementById("menuSearch").addEventListener("input", event => {
        currentSearch = event.target.value;
        renderMenu();
    });
    document.getElementById("clearSearchBtn").addEventListener("click", () => {
        document.getElementById("menuSearch").value = "";
        currentSearch = "";
        renderMenu();
        document.getElementById("menuSearch").focus();
    });
    document.getElementById("sortMenu").addEventListener("change", event => {
        currentSort = event.target.value;
        renderMenu();
    });

    document.getElementById("openAuthBtn").addEventListener("click", () => {
        setFormMessage("authError", "");
        if (currentUser) {
            document.getElementById("authForm").hidden = true;
            document.getElementById("accountActions").hidden = false;
        } else {
            setAuthMode("login");
        }
        toggleModal("authModal", true);
    });
    document.getElementById("closeAuthBtn").addEventListener("click", () => toggleModal("authModal", false));
    document.getElementById("authModal").addEventListener("click", event => {
        if (event.target.id === "authModal") toggleModal("authModal", false);
    });
    document.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
    document.getElementById("authForm").addEventListener("submit", handleAuthSubmit);
    document.getElementById("signOutBtn").addEventListener("click", async () => {
        await firebase.auth().signOut();
        toggleModal("authModal", false);
        showToast("Вы вышли из аккаунта");
    });
    document.getElementById("forgotPasswordBtn").addEventListener("click", async () => {
        const email = document.querySelector('#authForm [name="email"]').value.trim();
        if (!email) return setFormMessage("authError", "Сначала введите email.");
        try {
            await firebase.auth().sendPasswordResetEmail(email);
            setFormMessage("authError", "Письмо для сброса пароля отправлено на email.");
        } catch (error) {
            setFormMessage("authError", friendlyAuthError(error));
        }
    });

    document.getElementById("openCartBtn").addEventListener("click", () => toggleModal("cartModal", true));
    document.getElementById("closeCartBtn").addEventListener("click", () => toggleModal("cartModal", false));
    document.getElementById("cartModal").addEventListener("click", event => {
        if (event.target.id === "cartModal") toggleModal("cartModal", false);
    });
    document.getElementById("scrollToMenuBtn").addEventListener("click", () => document.getElementById("menu").scrollIntoView({ behavior: "smooth" }));

    document.getElementById("checkoutBtn").addEventListener("click", async () => {
        if (!cart.length) return;
        if (!currentUser) {
            toggleModal("cartModal", false);
            setAuthMode("login");
            setFormMessage("authError", "Войдите или зарегистрируйтесь, чтобы оформить заказ.");
            toggleModal("authModal", true);
            return;
        }
        setCheckoutError("");
        toggleModal("cartModal", false);
        // Подставляем последний адрес клиента, если он уже оформлял заказ.
        const savedAddress = await DBService.getLatestAddress(currentUser.uid);
        if (savedAddress) {
            const form = document.getElementById("checkoutForm");
            for (const field of ["city", "street", "building", "apartment", "entrance", "floor", "comment"]) {
                if (form.elements[field] && savedAddress[field] != null) form.elements[field].value = savedAddress[field];
            }
        }
        toggleModal("checkoutModal", true);
    });
    const closeCheckout = () => { toggleModal("checkoutModal", false); setCheckoutError(""); };
    document.getElementById("closeCheckoutBtn").addEventListener("click", closeCheckout);
    document.getElementById("cancelCheckoutBtn").addEventListener("click", closeCheckout);
    document.getElementById("checkoutModal").addEventListener("click", event => {
        if (event.target.id === "checkoutModal") closeCheckout();
    });

    document.getElementById("checkoutForm").addEventListener("submit", async event => {
        event.preventDefault();
        if (!cart.length) return setCheckoutError("Корзина пуста.");
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form).entries());
        const submitBtn = document.getElementById("submitOrderBtn");
        const customer = { firstName: values.firstName, phone: values.phone };
        const address = {
            city: values.city, street: values.street, building: values.building,
            apartment: values.apartment, entrance: values.entrance, floor: values.floor, comment: values.comment
        };
        const items = cart.map(item => ({ id: item.id, quantity: item.quantity }));
        submitBtn.disabled = true;
        submitBtn.textContent = "Сохраняем заказ…";
        setCheckoutError("");
        try {
            const orderId = await DBService.createOrder({
                customer, address, paymentMethod: values.paymentMethod, items,
                promoCode: appliedPromo ? appliedPromo.code : null,
                userId: currentUser?.uid || null
            });
            showToast(`Заказ №${orderId.slice(0, 8)} сохранён`);
            alert(`Заказ успешно создан!\nНомер заказа: ${orderId}`);
            form.reset();
            clearCart();
            closeCheckout();
        } catch (error) {
            console.error("Не удалось создать заказ:", error);
            setCheckoutError(error.message || "Не удалось оформить заказ. Попробуйте ещё раз.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Подтвердить заказ";
        }
    });

    document.getElementById("reviewForm").addEventListener("submit", async event => {
        event.preventDefault();
        if (!currentUser) {
            toggleModal("authModal", true);
            setAuthMode("login");
            return setFormMessage("reviewError", "Сначала войдите в аккаунт.");
        }
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form).entries());
        const submit = document.getElementById("submitReviewBtn");
        submit.disabled = true;
        submit.textContent = "Публикуем…";
        setFormMessage("reviewError", "");
        try {
            await DBService.createReview({
                uid: currentUser.uid,
                name: currentUser.profile?.firstName || currentUser.displayName || currentUser.email?.split("@")[0] || "Пользователь",
                rating: Number(values.rating),
                text: String(values.text || "").trim()
            });
            form.reset();
            showToast("Спасибо за ваш отзыв!");
            await loadReviews();
        } catch (error) {
            console.error("Не удалось сохранить отзыв:", error);
            setFormMessage("reviewError", error.message || "Не удалось сохранить отзыв. Проверьте правила Firestore.");
        } finally {
            submit.disabled = false;
            submit.textContent = "Опубликовать отзыв";
        }
    });
});
