// tests/prices.test.js
const request = require('supertest');
const app = require('../app'); // האפליקציה שלנו
const { pool } = require('../db'); // ה-pool של בסיס הנתונים

let testUserToken; // לשמור את הטוקן של משתמש הבדיקה
let testUserId;
let testProductId;
let testRetailerId;
let testPriceReportId; // לשמור ID של דיווח מחיר שנ יצור

// הרצה לפני כל הבדיקות בקובץ זה
beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('NODE_ENV is not set to "test". Aborting tests.');
    }

    // ניקוי טבלאות בסדר הנכון (תלויות)
    await pool.query('DELETE FROM price_report_likes');
    await pool.query('DELETE FROM prices');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM retailers');
    // אפשר להוסיף TRUNCATE ... RESTART IDENTITY CASCADE אם רוצים לאפס גם את ה-SERIAL IDs

    // 1. יצירת משתמש לבדיקות
    const userRes = await request(app)
        .post('/api/auth/register')
        .send({
            name: 'Price Test User',
            email: 'pricetest@example.com',
            password: 'password123'
        });
    expect(userRes.statusCode).toEqual(201); // ודא שהרישום הצליח
    testUserId = userRes.body.user.id;

    // 2. התחברות המשתמש כדי לקבל טוקן
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
            email: 'pricetest@example.com',
            password: 'password123'
        });
    expect(loginRes.statusCode).toEqual(200); // ודא שההתחברות הצליחה
    testUserToken = loginRes.body.token;
    expect(testUserToken).toBeDefined();

    // 3. יצירת מוצר לדוגמה (נצטרך נתיב ליצירת מוצר, כרגע נעשה זאת ישירות ב-DB)
    // אם אין לך API ליצירת מוצרים, נכניס ישירות ל-DB לצורך הבדיקה.
    // עדיף שיהיה API גם לזה וניצור דרכו.
    // כרגע, בהנחה שיש לך מוצרים/קמעונאים קיימים ב-DB הבדיקות או שאתה יכול להוסיף אותם ידנית.
    // לחלופין, אם ה-API ליצירת מוצרים/קמעונאים קיים ומאובטח, צריך להשתמש בו.
    
    // לדוגמה, הכנסה ישירה ל-DB (לא אידיאלי לבדיקות אינטגרציה טהורות, אבל פרקטי להתחלה)
    const productInsert = await pool.query(
        "INSERT INTO products (name, category, unit_of_measure) VALUES ($1, $2, $3) RETURNING id",
        ['Test Product for Prices', 'Test Category', 'kg']
    );
    testProductId = productInsert.rows[0].id;

    const retailerInsert = await pool.query(
        "INSERT INTO retailers (name, type) VALUES ($1, $2) RETURNING id",
        ['Test Retailer for Prices', 'סופרמרקט']
    );
    testRetailerId = retailerInsert.rows[0].id;
});

// לאחר כל הבדיקות בקובץ זה
afterAll(async () => {
    await pool.end();
});

describe('Prices API Endpoints', () => {
    // --- בדיקות ל-CRUD של דיווחי מחירים ---
    describe('POST /api/prices (Create Price Report)', () => {
        it('should create a new price report successfully', async () => {
            const res = await request(app)
                .post('/api/prices')
                .set('Authorization', `Bearer ${testUserToken}`) // שלח את הטוקן
                .send({
                    product_id: testProductId,
                    retailer_id: testRetailerId,
                    regular_price: 100.50,
                    unit_for_price: 'kg',
                    quantity_for_price: 1,
                    source: 'user_report',
                    // הוסף שדות חובה נוספים אם יש
                });
            expect(res.statusCode).toBeOneOf([200, 201]); // 201 אם חדש, 200 אם UPSERT עדכן
            expect(res.body).toHaveProperty('id');
            testPriceReportId = res.body.id; // שמור את ה-ID של הדיווח לבדיקות הבאות
            expect(res.body.product_id).toEqual(testProductId);
            expect(res.body.regular_price).toEqual("100.50"); // מחירים חוזרים כמחרוזת מ-pg לפעמים
        });

        it('should fail to create a price report without authentication', async () => {
            const res = await request(app)
                .post('/api/prices')
                .send({
                    product_id: testProductId,
                    retailer_id: testRetailerId,
                    regular_price: 99.00,
                    unit_for_price: 'kg',
                    source: 'user_report'
                });
            expect(res.statusCode).toEqual(401); // Unauthorized
        });

        it('should fail to create a price report with missing required fields', async () => {
            const res = await request(app)
                .post('/api/prices')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ // שולח גוף חלקי בכוונה
                    product_id: testProductId,
                    // retailer_id חסר
                    regular_price: 100.00,
                    unit_for_price: 'kg',
                    source: 'user_report'
                });
            expect(res.statusCode).toEqual(400); // Bad Request
            expect(res.body).toHaveProperty('error');
        });
    });

    // --- בדיקות לנתיבי ה-Like/Unlike ---
    describe('POST /api/prices/:priceId/like (Like a Price Report)', () => {
        it('should allow a logged-in user to like a price report', async () => {
            expect(testPriceReportId).toBeDefined(); // ודא שיש לנו ID של דיווח לבדוק
            const res = await request(app)
                .post(`/api/prices/${testPriceReportId}/like`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({}); // שלח גוף JSON ריק
            
            expect(res.statusCode).toBeOneOf([200, 201]); // 201 אם הלייק נוצר, 200 אם עודכן/כבר היה
            expect(res.body).toHaveProperty('message');
            expect(res.body.priceId).toEqual(testPriceReportId);
            expect(res.body.userId).toEqual(testUserId);
            expect(res.body.userLiked).toEqual(true);
            expect(res.body.likesCount).toBeGreaterThanOrEqual(1); // לפחות 1, יכול להיות יותר אם היו לייקים קודמים
        });

        it('should return updated like status if liked again (idempotent or reflects current state)', async () => {
            const res = await request(app)
                .post(`/api/prices/${testPriceReportId}/like`) // קריאה שנייה ל-like
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({});
            
            expect(res.statusCode).toEqual(200); // השרת שלי החזיר 200 בבדיקה עם ON CONFLICT
            expect(res.body.userLiked).toEqual(true);
            expect(res.body.likesCount).toBeGreaterThanOrEqual(1); 
        });

        it('should fail to like a price report without authentication', async () => {
            const res = await request(app)
                .post(`/api/prices/${testPriceReportId}/like`)
                .send({});
            expect(res.statusCode).toEqual(401);
        });

        it('should return 404 if trying to like a non-existent price report', async () => {
            const nonExistentPriceId = 999999;
            const res = await request(app)
                .post(`/api/prices/${nonExistentPriceId}/like`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({});
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('error', 'Price report not found.');
        });
    });

    describe('DELETE /api/prices/:priceId/like (Unlike a Price Report)', () => {
        it('should allow a logged-in user to unlike a previously liked price report', async () => {
            // ודא שהמשתמש אכן עשה לייק בבדיקה הקודמת
            const res = await request(app)
                .delete(`/api/prices/${testPriceReportId}/like`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(); // DELETE לרוב לא דורש גוף, אבל שליחת Content-Type יכולה להיות שימושית אם השרת מצפה לזה

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message');
            expect(res.body.userLiked).toEqual(false);
            // כאן אפשר לבדוק ש-likesCount ירד, או שהוא 0 אם זה היה הלייק היחיד
        });

        it('should handle unliking a report that was not liked (or already unliked) gracefully', async () => {
            const res = await request(app)
                .delete(`/api/prices/${testPriceReportId}/like`) // קריאה שנייה ל-unlike
                .set('Authorization', `Bearer ${testUserToken}`)
                .send();
            
            expect(res.statusCode).toEqual(200); 
            expect(res.body.userLiked).toEqual(false);
            // הודעת השגיאה עשויה להשתנות כאן בהתאם למימוש שלך
            // expect(res.body.message).toEqual('User had not liked this price report (no like to remove).');
        });
        
        it('should fail to unlike a price report without authentication', async () => {
            const res = await request(app)
                .delete(`/api/prices/${testPriceReportId}/like`)
                .send();
            expect(res.statusCode).toEqual(401);
        });
    });
    
    // TODO: הוסף בדיקות לנתיבים GET /api/prices, GET /api/prices/:id, PUT /api/prices/:id, DELETE /api/prices/:id
});

// Helper for expect to check if status code is one of the expected values
// (השאר את זה אם השתמשת בו ב-auth.test.js והוא לא הוגדר גלובלית)
if (!expect.toBeOneOf) { // הוסף רק אם לא קיים כבר
    expect.extend({
      toBeOneOf(received, items) {
        const pass = items.includes(received);
        if (pass) {
          return {
            message: () => `expected ${received} not to be one of [${items.join(', ')}]`,
            pass: true,
          };
        } else {
          return {
            message: () => `expected ${received} to be one of [${items.join(', ')}]`,
            pass: false,
          };
        }
      },
    });
}