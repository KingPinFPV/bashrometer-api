// tests/retailers.test.js
const request = require('supertest');
const app = require('../app'); // האפליקציה שלנו
const { pool } = require('../db'); // ה-pool של בסיס הנתונים

let testUserToken; // טוקן למשתמש רגיל (אם נצטרך לבדוק גישה ללא הרשאות אדמין)
// let adminUserToken; // טוקן למשתמש אדמין (אם נצטרך בעתיד)
let testRetailerId;

beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('NODE_ENV is not set to "test". Aborting tests.');
    }

    // ניקוי טבלאות (בסדר הפוך ליצירה או עם התחשבות ב-Foreign Keys)
    // הסדר כאן חשוב אם prices תלוי ב-retailers ו-users
    await pool.query('DELETE FROM price_report_likes');
    await pool.query('DELETE FROM prices');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM products'); // נקה גם מוצרים למקרה שיש תלויות עקיפות
    await pool.query('DELETE FROM retailers');

    // יצירת משתמש לבדיקות (אם נצטרך בעתיד לבדוק נתיבים מאובטחים)
    await request(app)
        .post('/api/auth/register')
        .send({ name: 'Retailer Test User', email: 'retaileruser@example.com', password: 'password123', role: 'user' });
    const loginResUser = await request(app)
        .post('/api/auth/login')
        .send({ email: 'retaileruser@example.com', password: 'password123' });
    testUserToken = loginResUser.body.token;

    // יצירת קמעונאי ראשוני לבדיקות GET by ID, PUT, DELETE
    // כרגע, נניח שנתיבי יצירת קמעונאי אינם קיימים או דורשים אדמין.
    // נוסיף אותו ישירות ל-DB לצורך הבדיקה:
    const retailerData = {
        name: 'בדיקה - סופר זול',
        chain: 'בדיקה רשת',
        type: 'סופרמרקט', // ודא שזה ערך תקין לפי ה-CHECK constraint שלך
    };
    const newRetailer = await pool.query(
        "INSERT INTO retailers (name, chain, type, is_active) VALUES ($1, $2, $3, TRUE) RETURNING *",
        [retailerData.name, retailerData.chain, retailerData.type]
    );
    testRetailerId = newRetailer.rows[0].id;
});

afterAll(async () => {
    await pool.end();
});

describe('Retailers API Endpoints', () => {
    // --- בדיקות ל-GET /api/retailers (שליפת כל הקמעונאים) ---
    describe('GET /api/retailers', () => {
        it('should return a list of retailers', async () => {
            const res = await request(app).get('/api/retailers');
            expect(res.statusCode).toEqual(200);
            expect(res.body.data).toBeInstanceOf(Array); // בהנחה שהתשובה היא אובייקט עם מפתח data
            
            if (res.body.data && res.body.data.length > 0 && testRetailerId) {
                expect(res.body.data.some(r => r.id === testRetailerId)).toBe(true);
            }
        });

        it('should support pagination with limit and offset', async () => {
            // צור מספר קמעונאים נוספים כדי לבדוק עימוד
            await pool.query("INSERT INTO retailers (name, type, is_active) VALUES ('Retailer A', 'קצביה', TRUE)");
            await pool.query("INSERT INTO retailers (name, type, is_active) VALUES ('Retailer B', 'אונליין', TRUE)");
            await pool.query("INSERT INTO retailers (name, type, is_active) VALUES ('Retailer C', 'שוק', TRUE)");

            const res = await request(app).get('/api/retailers?limit=2&offset=1&sort_by=name&order=ASC');
            expect(res.statusCode).toEqual(200);
            expect(res.body.data).toBeInstanceOf(Array);
            expect(res.body.data.length).toBeLessThanOrEqual(2);
            // אם אתה מצפה ל-page_info, בדוק גם אותו:
            // expect(res.body.page_info.limit).toEqual(2);
            // expect(res.body.page_info.offset).toEqual(1);
        });
        // TODO: הוסף בדיקות לפילטור (למשל, לפי type, chain) אם ממומש
    });

    // --- בדיקות ל-GET /api/retailers/:id (שליפת קמעונאי יחיד) ---
    describe('GET /api/retailers/:id', () => {
        it('should return a single retailer if ID exists', async () => {
            expect(testRetailerId).toBeDefined();
            const res = await request(app).get(`/api/retailers/${testRetailerId}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id', testRetailerId);
            expect(res.body).toHaveProperty('name', 'בדיקה - סופר זול');
        });

        it('should return 404 if retailer ID does not exist', async () => {
            const nonExistentId = 999999;
            const res = await request(app).get(`/api/retailers/${nonExistentId}`);
            expect(res.statusCode).toEqual(404);
            // התאם את הודעת השגיאה למה שה-API שלך מחזיר
            expect(res.body).toHaveProperty('error', 'Retailer not found'); 
        });

        it('should return 400 if retailer ID is not a valid number', async () => {
            const invalidId = 'xyz';
            const res = await request(app).get(`/api/retailers/${invalidId}`);
            expect(res.statusCode).toEqual(400);
            // התאם את הודעת השגיאה למה שה-API שלך מחזיר
            expect(res.body).toHaveProperty('error', 'Invalid retailer ID format. Must be an integer.');
        });
    });

    // --- מקום לבדיקות עתידיות (יצירה, עדכון, מחיקה של קמעונאים) ---
    // אם/כאשר תממש נתיבי POST, PUT, DELETE עבור קמעונאים (שכנראה ידרשו הרשאות אדמין),
    // תוכל להוסיף כאן בדיקות דומות לאלו שיצרנו עבור products ו-prices.
    // לדוגמה:
    /*
    describe('POST /api/retailers (Admin)', () => {
        it('should allow admin to create a new retailer', async () => {
            // ... (השג adminUserToken) ...
            const res = await request(app)
                .post('/api/retailers')
                .set('Authorization', `Bearer ${adminUserToken}`)
                .send({ name: 'קצביה חדשה בעיר', type: 'קצביה', address: 'רחוב ראשי 1' });
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('id');
        });
    });
    */
});