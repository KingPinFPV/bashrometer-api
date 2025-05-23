// tests/products.test.js
const request = require('supertest');
const app = require('../app'); // האפליקציה שלנו
const { pool } = require('../db'); // ה-pool של בסיס הנתונים

let testUserToken; // טוקן למשתמש רגיל (אם נצטרך לבדוק גישה ללא הרשאות אדמין)
let adminUserToken; // טוקן למשתמש אדמין (אם נצטרך לבדוק נתיבי אדמין)
let testProductId;

beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('NODE_ENV is not set to "test". Aborting tests.');
    }

    // ניקוי טבלאות (בסדר הפוך ליצירה או עם התחשבות ב-Foreign Keys)
    await pool.query('DELETE FROM price_report_likes');
    await pool.query('DELETE FROM prices');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM retailers');

    // יצירת משתמש רגיל
    await request(app)
        .post('/api/auth/register')
        .send({ name: 'Product Test User', email: 'productuser@example.com', password: 'password123', role: 'user' });
    const loginResUser = await request(app)
        .post('/api/auth/login')
        .send({ email: 'productuser@example.com', password: 'password123' });
    testUserToken = loginResUser.body.token;

    // יצירת משתמש אדמין (אם יש לך לוגיקה כזו ברישום או שתצטרך לעדכן ידנית ב-DB לבדיקות)
    // לצורך הפשטות כרגע, נניח שמשתמש אדמין נוצר ידנית או ב-seed נפרד לבדיקות
    // אם לא, נצטרך להתאים את זה. כרגע נשאיר את adminUserToken ריק או שנוכל ליצור משתמש רגיל נוסף.
    // לדוגמה, אם אתה רוצה לבדוק יצירת מוצר על ידי אדמין:
    // await request(app)
    //     .post('/api/auth/register')
    //     .send({ name: 'Admin Product User', email: 'adminproduct@example.com', password: 'password123', role: 'admin' }); // הנחה שהרישום מאפשר קביעת role
    // const loginResAdmin = await request(app)
    //     .post('/api/auth/login')
    //     .send({ email: 'adminproduct@example.com', password: 'password123' });
    // adminUserToken = loginResAdmin.body.token;


    // יצירת מוצר ראשוני לבדיקות GET by ID, PUT, DELETE
    const productData = {
        name: 'בדיקה - סטייק אנטריקוט',
        brand: 'בדיקה מותג',
        category: 'בקר טרי',
        unit_of_measure: 'kg', // ודא שזה ערך תקין לפי ה-CHECK constraint שלך
        // הוסף שדות חובה נוספים אם יש בהגדרת הטבלה שלך
    };
    // אם יצירת מוצר דורשת אדמין, השתמש ב-adminUserToken. אם לא, אפשר עם testUserToken או ללא טוקן אם הנתיב פתוח.
    // כרגע, נניח שיצירת מוצר היא פעולת אדמין (תצטרך נתיב POST /api/products מאובטח לאדמין)
    // או שנוסיף אותו ישירות ל-DB לצורך הבדיקה:
    const newProduct = await pool.query(
        "INSERT INTO products (name, brand, category, unit_of_measure, default_weight_per_unit_grams) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [productData.name, productData.brand, productData.category, productData.unit_of_measure, 1000] // הנחה של 1000 גרם לק"ג
    );
    testProductId = newProduct.rows[0].id;
});

afterAll(async () => {
    await pool.end();
});

describe('Products API Endpoints', () => {
    // --- בדיקות ל-GET /api/products (שליפת כל המוצרים) ---
    describe('GET /api/products', () => {
        it('should return a list of products', async () => {
            const res = await request(app).get('/api/products');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array); // מצפים למערך של מוצרים
            // אם יצרת מוצר ב-beforeAll, ודא שהוא מופיע ברשימה
            if (res.body.length > 0 && testProductId) {
                expect(res.body.some(p => p.id === testProductId)).toBe(true);
            }
        });

        // TODO: הוסף בדיקות לפילטור, מיון ועימוד אם ממומשים ב-getAllProducts
        it('should support pagination with limit and offset', async () => {
            // צור מספר מוצרים כדי לבדוק עימוד
            await pool.query("INSERT INTO products (name, unit_of_measure) VALUES ('Product A', 'kg')");
            await pool.query("INSERT INTO products (name, unit_of_measure) VALUES ('Product B', 'kg')");
            await pool.query("INSERT INTO products (name, unit_of_measure) VALUES ('Product C', 'kg')");

            const res = await request(app).get('/api/products?limit=2&offset=1&sort_by=name&order=ASC');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
            expect(res.body.length).toBeLessThanOrEqual(2); // עשוי להיות פחות מ-2 אם יש פחות מ-3 מוצרים אחרי ה-offset
            // אם אתה יודע מה יהיה המוצר השני בסדר אלפביתי, תוכל לבדוק אותו
            // לדוגמה: expect(res.body[0].name).toEqual('Product B'); (תלוי בנתונים הקיימים)
        });
    });

    // --- בדיקות ל-GET /api/products/:id (שליפת מוצר יחיד) ---
    describe('GET /api/products/:id', () => {
        it('should return a single product if ID exists', async () => {
            expect(testProductId).toBeDefined(); // ודא שיש לנו ID לבדוק
            const res = await request(app).get(`/api/products/${testProductId}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id', testProductId);
            expect(res.body).toHaveProperty('name', 'בדיקה - סטייק אנטריקוט');
        });

        it('should return 404 if product ID does not exist', async () => {
            const nonExistentId = 999999;
            const res = await request(app).get(`/api/products/${nonExistentId}`);
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('error', 'Product not found'); // התאם להודעת השגיאה שלך
        });

        it('should return 400 if product ID is not a valid number', async () => {
            const invalidId = 'abc';
            const res = await request(app).get(`/api/products/${invalidId}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error'); // התאם להודעת השגיאה שלך, למשל 'Invalid product ID format'
        });
    });

    // --- בדיקות לנתיבי יצירה, עדכון ומחיקה (דורשים אדמין או לוגיקה מתאימה) ---
    // כרגע, הקוד שלך ב-productController.js לא כולל פונקציות יצירה, עדכון או מחיקה.
    // אם תוסיף אותן בעתיד, אלו דוגמאות לבדיקות שתוכל להוסיף:

    /*
    describe('POST /api/products (Create Product - Admin)', () => {
        it('should create a new product if user is admin', async () => {
            // ודא שיש לך adminUserToken
            if (!adminUserToken) {
                console.warn('Admin token not available, skipping admin test for product creation.');
                return;
            }
            const newProductData = {
                name: 'מוצר חדש של אדמין',
                brand: 'מותג אדמין',
                category: 'קטגוריה חדשה',
                unit_of_measure: 'unit',
                default_weight_per_unit_grams: 150
            };
            const res = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${adminUserToken}`)
                .send(newProductData);
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toEqual(newProductData.name);
        });

        it('should prevent creating a new product if user is not admin', async () => {
            const newProductData = { name: 'מוצר לא מורשה', unit_of_measure: 'g' };
            const res = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${testUserToken}`) // משתמש רגיל
                .send(newProductData);
            expect(res.statusCode).toEqual(403); // Forbidden
        });
    });
    */

    // הוסף כאן בדיקות דומות עבור PUT /api/products/:id ו-DELETE /api/products/:id
    // אם וכאשר תממש את הפונקציונליות הזו.
});