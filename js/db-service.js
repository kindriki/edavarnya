const DBService = {
    defaultSettings: {
        minOrderAmount: 500,
        freeDeliveryThreshold: 1500,
        deliveryCost: 199
    },

    async getSettings() {
        try {
            const snap = await db.collection("settings").doc("app_config").get();
            return snap.exists ? { ...this.defaultSettings, ...snap.data() } : { ...this.defaultSettings };
        } catch (error) {
            console.warn("Настройки недоступны, используются значения по умолчанию:", error);
            return { ...this.defaultSettings };
        }
    },

    async getMenu() {
        // Возвращаем метаданные загрузки, чтобы отличать пустую коллекцию
        // от документов, которые были отфильтрованы из-за некорректных полей.
        const snap = await db.collection("menu").get();
        const allItems = snap.docs.map(doc => {
            const data = doc.data() || {};
            const rawPrice = data.price;
            const price = typeof rawPrice === "number" ? rawPrice : Number(String(rawPrice ?? "").replace(",", "."));
            return {
                ...data,
                id: doc.id,
                title: String(data.title || data.name || data.dishName || "Блюдо без названия"),
                imageUrl: String(data.imageUrl || data.imageURL || data.image || ""),
                category: String(data.category || data.categoryName || "Без категории"),
                price,
                // Для старых документов отсутствие isAvailable не должно скрывать блюдо.
                isAvailable: data.isAvailable !== false
            };
        });
        const availableItems = allItems.filter(item => item.isAvailable && Number.isFinite(item.price) && item.price >= 0);
        console.info(`[Едоварня] Firebase project: ${firebase.app().options.projectId}; menu docs: ${snap.size}; valid available dishes: ${availableItems.length}`);
        if (snap.size > 0 && availableItems.length === 0) {
            console.warn("Документы menu найдены, но все отфильтрованы. Проверьте поля price и isAvailable:", allItems);
        }
        window.menuLoadDiagnostics = {
            projectId: firebase.app().options.projectId,
            collection: "menu",
            documentsFound: snap.size,
            availableDishes: availableItems.length
        };
        return availableItems;
    },

    async getLatestAddress(userId) {
        if (!userId) return null;
        try {
            // Не используем orderBy, чтобы не требовать составной индекс.
            const snap = await db.collection("addresses").where("userId", "==", userId).get();
            const addresses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const millis = value => value?.toDate ? value.toDate().getTime() : (value ? new Date(value).getTime() : 0);
            addresses.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
            return addresses[0] || null;
        } catch (error) {
            console.warn("Не удалось загрузить сохранённый адрес:", error);
            return null;
        }
    },

    async getReviews() {
        try {
            // Не используем составной запрос where + orderBy: он требует отдельного индекса.
            // Правило Firestore всё равно разрешает читать только опубликованные отзывы.
            const snap = await db.collection("reviews").where("isPublished", "==", true).get();
            return snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => {
                    const dateValue = value => {
                        if (value?.toDate) return value.toDate().getTime();
                        const parsed = value ? new Date(value).getTime() : 0;
                        return Number.isFinite(parsed) ? parsed : 0;
                    };
                    return dateValue(b.createdAt) - dateValue(a.createdAt);
                });
        } catch (error) {
            // Коллекция отзывов необязательна для запуска сайта.
            console.info("Отзывы пока не загружены:", error.message);
            return [];
        }
    },

    async createReview({ uid, name, rating, text }) {
        if (!uid) throw new Error("Войдите в аккаунт, чтобы оставить отзыв.");
        const cleanText = String(text || "").trim();
        const score = Number(rating);
        if (cleanText.length < 5 || cleanText.length > 1000) {
            throw new Error("Отзыв должен содержать от 5 до 1000 символов.");
        }
        if (!Number.isInteger(score) || score < 1 || score > 5) {
            throw new Error("Оценка должна быть от 1 до 5.");
        }
        const ref = db.collection("reviews").doc();
        await ref.set({
            userId: uid,
            name: String(name || "Пользователь").trim().slice(0, 80),
            rating: score,
            text: cleanText,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isPublished: true
        });
        return ref.id;
    },

    async checkPromocode(code) {
        const normalized = String(code || "").trim().toUpperCase();
        if (!normalized) return null;
        try {
            const snap = await db.collection("promocodes").doc(normalized).get();
            if (!snap.exists) return null;
            const promo = snap.data();
            const discount = Number(promo.discountPercent);
            if (promo.isActive !== true || !Number.isFinite(discount) || discount <= 0 || discount > 100) return null;
            return { ...promo, discountPercent: discount, code: normalized };
        } catch (error) {
            console.warn("Не удалось проверить промокод:", error);
            return null;
        }
    },

    // Заказ и его позиции создаются одной транзакцией.
    // Цены перечитываются из menu, поэтому цена из браузерной корзины не считается доверенной.
    async createOrder({ customer, address, paymentMethod, items, promoCode, userId = null }) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("Корзина пуста.");
        }
        if (!customer?.firstName?.trim() || !customer?.phone?.trim()) {
            throw new Error("Укажите имя и телефон.");
        }
        if (!address?.city?.trim() || !address?.street?.trim() || !address?.building?.trim()) {
            throw new Error("Укажите город, улицу и дом.");
        }
        if (!["cash", "card_on_delivery"].includes(paymentMethod)) {
            throw new Error("Выберите допустимый способ оплаты.");
        }

        const orderRef = db.collection("orders").doc();
        const addressRef = db.collection("addresses").doc();
        const itemRefs = items.map(() => db.collection("order_items").doc());
        const menuRefs = items.map(item => db.collection("menu").doc(String(item.id)));
        const settingsRef = db.collection("settings").doc("app_config");
        const promoRef = promoCode
            ? db.collection("promocodes").doc(String(promoCode).trim().toUpperCase())
            : null;

        const orderId = await db.runTransaction(async transaction => {
            // Все чтения выполняются до записей.
            const menuSnaps = [];
            for (const ref of menuRefs) menuSnaps.push(await transaction.get(ref));
            const settingsSnap = await transaction.get(settingsRef);
            const promoSnap = promoRef ? await transaction.get(promoRef) : null;

            const settings = {
                ...this.defaultSettings,
                ...(settingsSnap.exists ? settingsSnap.data() : {})
            };

            const cleanItems = menuSnaps.map((snap, index) => {
                const requested = items[index];
                const quantity = Number(requested.quantity);
                if (!snap.exists) throw new Error("Одно из блюд больше недоступно. Обновите страницу.");
                const dish = snap.data();
                if (dish.isAvailable === false) throw new Error(`Блюдо «${dish.title || "Без названия"}» больше недоступно.`);
                if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
                    throw new Error("Количество блюда должно быть от 1 до 99.");
                }
                const price = Number(dish.price);
                if (!Number.isFinite(price) || price < 0) throw new Error("У блюда указана некорректная цена.");
                return {
                    dishId: snap.id,
                    dishTitle: String(dish.title || "Блюдо"),
                    priceAtOrder: price,
                    quantity,
                    total: Math.round(price * quantity * 100) / 100
                };
            });

            const subtotal = Math.round(cleanItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
            let discountPercent = 0;
            let normalizedPromoCode = null;

            if (promoRef) {
                if (!promoSnap || !promoSnap.exists) throw new Error("Промокод больше не действует.");
                const promo = promoSnap.data();
                const candidate = Number(promo.discountPercent);
                if (promo.isActive !== true || !Number.isFinite(candidate) || candidate <= 0 || candidate > 100) {
                    throw new Error("Промокод больше не действует.");
                }
                discountPercent = candidate;
                normalizedPromoCode = String(promoCode).trim().toUpperCase();
            }

            const discountAmount = Math.round(subtotal * discountPercent) / 100;
            const afterDiscount = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
            const freeThreshold = Number(settings.freeDeliveryThreshold ?? 1500);
            const deliveryPrice = Number(settings.deliveryCost ?? 199);
            const minOrderAmount = Number(settings.minOrderAmount ?? 500);
            const deliveryFee = afterDiscount >= freeThreshold ? 0 : deliveryPrice;
            const total = Math.round((afterDiscount + deliveryFee) * 100) / 100;

            if (afterDiscount < minOrderAmount) {
                throw new Error(`Минимальная сумма товаров после скидки — ${minOrderAmount} ₽.`);
            }

            const cleanAddress = {
                userId: userId || null,
                city: address.city.trim(),
                street: address.street.trim(),
                building: address.building.trim(),
                apartment: String(address.apartment || "").trim(),
                entrance: String(address.entrance || "").trim(),
                floor: String(address.floor || "").trim(),
                comment: String(address.comment || "").trim(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Адрес сохраняется отдельно и связывается с заказом через addressId.
            transaction.set(addressRef, cleanAddress);
            transaction.set(orderRef, {
                userId: userId || null,
                addressId: addressRef.id,
                customer: {
                    firstName: customer.firstName.trim(),
                    phone: customer.phone.trim()
                },
                // Снимок адреса оставляем в заказе, чтобы история не менялась,
                // если пользователь позже изменит сохранённый адрес.
                deliveryAddress: {
                    city: cleanAddress.city,
                    street: cleanAddress.street,
                    building: cleanAddress.building,
                    apartment: cleanAddress.apartment,
                    entrance: cleanAddress.entrance,
                    floor: cleanAddress.floor,
                    comment: cleanAddress.comment
                },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: "Обрабатывается",
                isPaid: false,
                paymentMethod,
                subtotal,
                discountAmount,
                promoCode: normalizedPromoCode,
                deliveryFee,
                total,
                currency: "RUB"
            });

            cleanItems.forEach((item, index) => {
                transaction.set(itemRefs[index], {
                    orderId: orderRef.id,
                    dishId: item.dishId,
                    dishTitle: item.dishTitle,
                    priceAtOrder: item.priceAtOrder,
                    quantity: item.quantity,
                    total: item.total
                });
            });

            return orderRef.id;
        });

        return orderId;
    }
};
