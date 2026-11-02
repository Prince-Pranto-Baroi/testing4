# AquaLuxe – Aquarium Store (Website + Admin Panel)

Customer website:  http://localhost:3000
Admin panel:       http://localhost:3000/admin     (separate login, separate design)

Built with: HTML, CSS, JavaScript, Node.js (Express) and MySQL (XAMPP).

## How to run (Windows + VS Code + XAMPP)
1. Install **Node.js LTS** from nodejs.org (one time).
2. Open **XAMPP Control Panel** and click **Start** next to **MySQL**. (Apache is not needed.)
3. Open this folder in **VS Code** (File > Open Folder).
4. Open the VS Code terminal (Ctrl + `) and run:
       npm install
       npm start
5. Open http://localhost:3000 (website) and http://localhost:3000/admin (admin).

First start creates the database `aqualuxe_db`, all tables, the 8 categories, sample products and the admin account automatically. You do NOT need to import anything in phpMyAdmin.

**Admin login:** username `admin`  password `admin123`  -> change it in Admin > Settings.

Want to see charts and reports with data? Run `npm run demo-data` (adds fake orders). Remove them any time with `npm run clear-demo`.

## If something goes wrong
- "Could not connect to MySQL": start MySQL in XAMPP. If your MySQL uses another port or has a password, edit `src/config.js`.
- "Port 3000 already in use": close the other program, or change `port` in `src/config.js`.
- The old project database `aquarium_db` is NOT touched. This version uses a new database `aqualuxe_db`.

## What is inside
    server.js          all backend routes (public API + admin API)
    src/config.js      database + port settings
    src/db.js          creates tables, seeds categories / sample products / admin
    sql/schema.sql     the database tables (also importable by hand)
    public/            CUSTOMER website (index, shop, product, checkout, track, about, aquascapes, contact)
    admin/             ADMIN panel (login.html, index.html, css/, js/)  <- fully separate from public/
    uploads/           product pictures you upload from the admin panel
    scripts/demo.js    demo data helper

## Customer website features
Home with hero, 8 categories, featured products, new arrivals, promo banner (your plants photo) · Shop with category list, search, price filter, in-stock filter, sorting · Product page with how-to-use, delivery info, related products · Cart drawer · Checkout (no account needed): all 64 districts, advance payment by bKash / Nagad with a Transaction & Payment Summary box on the confirmation page · AI chat assistant · Rising-bubble animation (change the gap in `public/js/bubbles.js`) · Order tracking by order number + phone · Our Story, Aquascapes gallery, Contact form · WhatsApp button · mobile friendly.

## Admin panel features
- **Dashboard:** today / month sales, profit, pending orders, low-stock alerts, selling-vs-buying chart, top products, recent orders.
- **Orders:** Kanban board – drag an order card between Pending > Confirmed > Shipped > Delivered (or Cancelled; stock is returned automatically). List view with search. Order details, WhatsApp/call buttons, printable invoice.
- **Product Store:** drag & drop product cards to choose their order on the website; drag & drop a picture to upload; edit, hide/show, featured star, delete; table view; CSV export.
- **Buying & Stock:** record purchases from suppliers (stock goes up, cost price updates), quick stock editing, low-stock filter, purchase history.
- **Reports:** choose any date range – total selling, total buying, gross profit, cash difference, selling-vs-buying chart (daily or monthly), sales by category and product, orders by status, print, CSV downloads.
- **Customers:** built from real orders (same phone number = same customer). Search, filter by segment (high-value / loyal / repeat / new), order count, total spent, last-order date; sort; order history; select customers and copy their numbers or download a CSV for your own promotions (sending from the panel is NOT built). The red × archives a customer after a confirmation: they are only hidden, orders and payments are kept, and they return if they order again ("Show archived" > Restore).
- **Orders** also show the delivery area, advance, balance and the bKash/Nagad TrxID. Use **Mark advance as verified** only after you have really received the money.
- **Messages** (from the contact form), **Settings** (phone, WhatsApp, email, address, banner text, the high-value / loyal customer limits, change password).

## AI chat assistant (aquarium expert + shop helper)
A chat bubble 🐠 appears on every page. It answers in English, Bangla and Banglish about products, prices, stock, delivery, advance payment, order tracking, and fish / plant / water care (72 knowledge documents, English + Bangla). It reads your live shop data (products, categories, delivery rules, store contact), shows product cards with an "Add to cart" button, and logs questions it could not answer in **Admin > AI Chat**.

**It works out of the box, with no key and no cost ("no-AI mode").** It understands English, Bangla and Banglish and answers from your shop data and the knowledge base: product prices and stock (with Add to cart), delivery and advance rules, a delivery calculator ("Sylhet 1000"), order tracking, contact details, and fish/plant/water care. It cannot hold a free conversation; when it does not know it says so, shows your contact details and logs the question in **Admin > AI Chat**.

**Optional: upgrade to real AI replies (paid per message, or a free-tier key)**
1. Get an API key: Anthropic at https://console.anthropic.com (default, `claude-haiku-5-5` is cheap), or OpenAI, or any OpenAI-compatible service (set `AI_PROVIDER=openai` and `AI_BASE_URL=<chat completions address>`; only the Anthropic path was tested).
2. Copy `.env.example` to `.env` and paste the key after `AI_API_KEY=`. On a live server also set `SITE_URL=https://your-domain`.
3. Restart with `npm start`. Admin > AI Chat shows **AI** instead of **No-AI**. If the AI service ever fails or the key runs out, the bot automatically falls back to no-AI mode.

**Safety and cost control**
- The key lives only in `.env` (never in the website files or Settings).
- The assistant is read-only: it cannot place orders, take payments, or see customer lists, cost prices or admin data. Order tracking needs BOTH the order number and the phone number.
- Limits per visitor (8 per minute, 80 per day) and for the whole site (500 per day) protect your bill. Change them in `.env`.
- Chats are stored in `chat_conversations` / `chat_messages`. Add your own aquarium knowledge by inserting rows into `knowledge_documents`.
- If the site runs behind Nginx/a proxy set `TRUST_PROXY=1`.

## Delivery and advance payment rules (applied on the server)
| | Inside Dhaka (district = Dhaka) | Outside Dhaka (any other district) |
|---|---|---|
| Delivery charge | ৳90 | ৳150 |
| Advance now | ৳90 | 50% of the product subtotal only |
| Pay on delivery | product subtotal | other 50% + ৳150 |

Example for a ৳1,000 order: inside Dhaka total ৳1,090, advance ৳90, balance ৳1,000; outside Dhaka total ৳1,150, advance ৳500, balance ৳650. The charges live in `src/config.js` (`delivery`). The free-delivery limit no longer exists. The advance is shown as "paid" only after you verify it in Admin.

## Upgrading an existing database
Nothing to import. On the next `npm start` the server adds the new order columns and the `archived_customers` table automatically (your orders and products are kept). If your top banner still has the old "Free delivery over ৳5,000" text it is replaced; otherwise edit it in Admin > Settings.

## Good to know (limitations)
- bKash / Nagad is manual (customer sends the advance and types the Transaction ID; you verify it in admin). There is no online payment gateway yet.
- Sample products, prices and the phone/WhatsApp number are placeholders: replace them in Admin.
- Admin sessions are kept in memory: restarting the server logs you out (just log in again).
- No email/SMS notifications and no customer accounts yet.
- Fonts load from Google Fonts, so the first load needs internet.
