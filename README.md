# Едоварня — сайт доставки русской кухни

Статический сайт HTML/CSS/JavaScript с Firebase Authentication и Cloud Firestore.

## Что реализовано
- Меню из Firestore `menu`, категории, поиск по названию/описанию/категории и сортировка.
- Корзина, проверка доступности блюд, расчёт скидки/доставки/минимальной суммы.
- Оформление заказа: документ в `orders`, позиции в `order_items`, цена перепроверяется в транзакции из `menu`.
- Регистрация/вход по email и паролю через Firebase Authentication.
- Профиль пользователя сохраняется в `users/{uid}`.
- Отзывы авторизованных пользователей сохраняются в `reviews` и выводятся на странице.
- Адаптивный интерфейс, обновлённая цветовая тема и анимации.
- Сброс пароля через email.

## Запуск
1. Распакуйте ZIP и откройте папку `edavarnya_project` в VS Code.
2. Запустите `index.html` через расширение **Live Server** (не открывайте `file://` напрямую).
3. В `js/firebase-config.js` уже находится конфигурация Firebase-проекта `edavarnya-app`.
4. В Firebase Console проверьте включение Authentication и правила Firestore (см. ниже).

## Обязательно включить Firebase Authentication
1. Откройте Firebase Console → проект `edavarnya-app`.
2. Authentication → Get started → Sign-in method.
3. Включите **Email/Password** и сохраните.
4. Authentication → Settings → Authorized domains: добавьте домен, с которого запускаете сайт. `localhost` обычно уже разрешён; для опубликованного сайта добавьте его домен.
5. Для восстановления пароля укажите подходящий шаблон письма в Authentication → Templates.

## Структура Firestore
- `menu/{dishId}`: `title`, `description`, `category`, `price` (number), `imageUrl` (string), `isAvailable` (boolean).
- `users/{uid}`: `uid`, `email`, `firstName`, `lastName`, `phone`, `role`, `createdAt`.
- `reviews/{reviewId}`: `userId`, `name`, `rating` (1–5), `text`, `createdAt`, `isPublished`.
- `orders/{orderId}`: `userId`, `addressId` (ссылка на документ в `addresses`), `customer`, `deliveryAddress` (снимок адреса на момент заказа), `status`, `isPaid`, `paymentMethod`, `subtotal`, `discountAmount`, `promoCode`, `deliveryFee`, `total`, `currency`, `createdAt`.
- `order_items/{itemId}`: `orderId` (строка ID заказа), `dishId` (строка ID документа меню), `dishTitle`, `priceAtOrder`, `quantity`, `total`.
- Дополнительно: `settings/app_config` и `promocodes/{CODE}`.

Если документы меню называются `Dish1`, `Dish2` и т. п., связи в `order_items.dishId` будут такими же строковыми ID. Это нормально для Firestore.

## Firestore Rules — стартовые правила для учебного проекта

Откройте Firebase Console → Firestore Database → Rules и вставьте правила ниже. Они позволяют публично читать меню/опубликованные отзывы, авторизованному пользователю создавать собственный профиль и отзыв, сохранять адрес доставки и оформлять заказы только от своего аккаунта. Гостевые заказы при этих правилах не разрешены. Для production обязательно перенесите расчёт заказов на доверенный backend/Cloud Functions: клиентские правила не могут надёжно защитить расчёты и проверку промокодов.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function owns(uid) { return signedIn() && request.auth.uid == uid; }

    match /menu/{dishId} {
      allow read: if true;
      allow write: if false; // Меню меняйте вручную в консоли или через админ-интерфейс.
    }

    match /settings/{docId} {
      allow read: if true;
      allow write: if false;
    }

    match /promocodes/{code} {
      allow read: if true;
      allow write: if false;
    }

    match /users/{uid} {
      allow read: if owns(uid);
      allow create, update: if owns(uid)
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.email == request.auth.token.email
        && request.resource.data.role == "customer";
      allow delete: if false;
    }

    match /addresses/{addressId} {
      allow read: if signedIn() && resource.data.userId == request.auth.uid;
      allow create: if signedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.city is string
        && request.resource.data.street is string
        && request.resource.data.building is string;
      allow update, delete: if signedIn() && resource.data.userId == request.auth.uid;
    }

    match /reviews/{reviewId} {
      allow read: if resource.data.isPublished == true;
      allow create: if signedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.name is string
        && request.resource.data.text is string
        && request.resource.data.text.size() >= 5
        && request.resource.data.text.size() <= 1000
        && request.resource.data.rating is int
        && request.resource.data.rating >= 1
        && request.resource.data.rating <= 5
        && request.resource.data.isPublished == true;
      allow update, delete: if signedIn() && resource.data.userId == request.auth.uid;
    }

    match /orders/{orderId} {
      allow read: if signedIn() && resource.data.userId == request.auth.uid;
      allow create: if signedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.customer is map
        && request.resource.data.deliveryAddress is map
        && request.resource.data.total is number
        && request.resource.data.total >= 0;
      allow update, delete: if false;
    }

    match /order_items/{itemId} {
      allow read: if signedIn()
        && exists(/databases/$(database)/documents/orders/$(resource.data.orderId))
        && get(/databases/$(database)/documents/orders/$(resource.data.orderId)).data.userId == request.auth.uid;
      allow create: if signedIn()
        && request.resource.data.orderId is string
        && getAfter(/databases/$(database)/documents/orders/$(request.resource.data.orderId)).data.userId == request.auth.uid;
      allow update, delete: if false;
    }
  }
}
```

### Важные ограничения
- Эти правила требуют входа для оформления заказа. Если хотите принимать гостевые заказы, нужен защищённый backend/Cloud Function либо отдельная безопасная схема гостевого checkout.
- В данном учебном frontend заказ записывается из браузера. Для реального коммерческого запуска нельзя доверять суммам/скидкам, пришедшим с клиента; пересчитывайте заказ на сервере.
- Онлайн-оплата не подключена; доступны наличные или карта курьеру.
- Старые документы в `order_items` с числовыми `dishId/orderId` продолжат существовать, новые документы используют строковые ID документов.
- Firebase Web API key виден в браузере по дизайну. Не публикуйте секреты сервисных аккаунтов; безопасность обеспечивают Authentication и Rules.

## Если что-то не работает
Откройте F12 → Console и проверьте ошибку. Самые частые причины:
- `auth/operation-not-allowed` — не включён Email/Password.
- `permission-denied` — Rules не опубликованы или не соответствуют коллекции.
- Меню пустое — проверьте документы `menu`: поля `title` (или `name`), `price`, `category`, `description`, `imageUrl`; `price` должен быть числом или строкой, которую можно преобразовать в число. `isAvailable: false` скрывает блюдо.
- Отзывы не отображаются — проверьте, что коллекция называется строго `reviews`, документы содержат `isPublished: true`, а правила позволяют читать опубликованные отзывы. После первого успешного отзыва коллекция создастся автоматически.
- Заказ не сохраняется — пользователь должен войти в аккаунт, а опубликованные Rules должны разрешать создание документов в `orders`, `order_items` и `addresses`.
