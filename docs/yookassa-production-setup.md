# Production YooKassa setup

Production payments are prepared for `https://ultimatehockey.ru` but remain disabled until both production credentials are configured.

## GitHub secrets

Add both repository secrets together:

- `PRODUCTION_YOOKASSA_SHOP_ID`
- `PRODUCTION_YOOKASSA_SECRET_KEY`

If both are absent, deployment continues with payments disabled. If only one is present, deployment fails before restarting the application.

## YooKassa cabinet URLs

- Public prices page: `https://ultimatehockey.ru/prices`
- Public user agreement: `https://ultimatehockey.ru/terms`
- Public offer: `https://ultimatehockey.ru/offer`
- Privacy policy: `https://ultimatehockey.ru/privacy`
- Personal data consent: `https://ultimatehockey.ru/personal-data-consent`
- Payment return URL: `https://ultimatehockey.ru/inventory?tab=bank&payment=return`
- Webhook URL: `https://ultimatehockey.ru/api/bank/payments/yookassa/webhook`

The webhook must subscribe to `payment.succeeded` and `payment.canceled`.

## Website review requirements

Before asking YooKassa to review the production shop, verify that the public website is reachable and contains:

- the current coin packages and their real RUB prices at `/prices`;
- a public user agreement at `/terms`;
- seller details: `ИП Гуменюк Егор Михайлович`, `ИНН 101602099457`, `ОГРНИП 323100000016441`;
- public support contact details;
- a clear statement that coin packages are digital goods credited to the user's in-app account after successful payment and require no physical delivery.

Do not publish placeholder legal details. Fiscal receipt, refund, and chargeback handling must be approved separately before accepting real payments.
