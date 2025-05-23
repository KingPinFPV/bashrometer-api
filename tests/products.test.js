// tests/products.test.js
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db');

let testUserToken;    // טוקן למשתמש רגיל
let adminUserToken;   // טוקן למשתמש אדמין
let testUserId;
let adminUserId;
let testProductId;    // ID של מוצר שנוצר ב-beforeAll
let createdProductId; // ID של מוצר שנוצר במהלך בדיקת POST

beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('NODE_ENV is not set to "test". Aborting tests.');
    }

    await pool.query('DELETE FROM price_report_likes');
    await pool.query('DELETE FROM prices');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM retailers');

    // 1. יצירת משתמש רגיל
    const userRegRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Product Test Regular User', email: 'productregular@example.com', password: 'password123', role: 'user' });
    testUserId = userRegRes.body.user.id;
    const loginResUser = await request(app)
        .post('/api/auth/login')
        .send({ email: 'productregular@example.com', password: 'password123' });
    testUserToken = loginResUser.body.token;

    // 2. יצירת משתמש אדמין
    const adminRegRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Product Test Admin User', email: 'productadmin@example.com', password: 'password123', role: 'admin' }); // הנחה שהרישום מאפשר קביעת role או שתעדכן ידנית
    adminUserId = adminRegRes.body.user.id;
    // אם הרישום לא מאפשר קביעת role, עדכן ידנית ב-DB:
    // await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", ['productadmin@example.com']);
    const loginResAdmin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'productadmin@example.com', password: 'password123' });
    adminUserToken = loginResAdmin.body.token;
    expect(adminUserToken).toBeDefined();


    // 3. יצירת מוצר ראשוני לבדיקות GET by ID, PUT, DELETE דרך ה-API (אם אפשרי ע"י אדמין)
    const initialProductData = {
        name: 'מוצר קיים לבדיקות',
        brand: 'מותג קיים',
        category: 'קטגוריה קיימת',
        unit_of_measure: 'kg',
        default_weight_per_unit_grams: 1000,
        is_active: true
    };
    const initialProductRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminUserToken}`)
        .send(initialProductData);
    expect(initialProductRes.statusCode).toEqual(201); // ודא שהיצירה הראשונית מצליחה
    testProductId = initialProductRes.body.id;
    expect(testProductId).toBeDefined();
});

afterAll(async () => {
    await pool.end();
});

describe('Products API Endpoints', () => {
    // --- בדיקות GET (כפי שהיו ועברו) ---
    describe('GET /api/products', () => {
        it('should return a list of products', async () => {
            const res = await request(app).get('/api/products');
            expect(res.statusCode).toEqual(200);
            expect(res.body.data).toBeInstanceOf(Array);
            if (res.body.data && res.body.data.length > 0 && testProductId) {
               expect(res.body.data.some(p => p.id === testProductId)).toBe(true);
            }
        });

        it('should support pagination with limit and offset', async () => {
            // יצירת עוד מוצרים כדי שיהיה מספיק לעימוד
            await request(app).post('/api/products').set('Authorization', `Bearer ${adminUserToken}`).send({ name: 'Product Pagination A', unit_of_measure: 'kg', is_active: true });
            await request(app).post('/api/products').set('Authorization', `Bearer ${adminUserToken}`).send({ name: 'Product Pagination B', unit_of_measure: 'kg', is_active: true });
            await request(app).post('/api/products').set('Authorization', `Bearer ${adminUserToken}`).send({ name: 'Product Pagination C', unit_of_measure: 'kg', is_active: true });

            const res = await request(app).get('/api/products?limit=2&offset=1&sort_by=name&order=ASC');
            expect(res.statusCode).toEqual(200);
            expect(res.body.data).toBeInstanceOf(Array);
            expect(res.body.data.length).toBeLessThanOrEqual(2);
            // אפשר להוסיף בדיקה על סדר המוצרים אם הנתונים והמיון ידועים
        });
    });

    describe('GET /api/products/:id', () => {
        it('should return a single product if ID exists', async () => {
            const res = await request(app).get(`/api/products/${testProductId}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id', testProductId);
            expect(res.body).toHaveProperty('name', 'מוצר קיים לבדיקות');
        });

        it('should return 404 if product ID does not exist', async () => {
            const nonExistentId = 999999;
            const res = await request(app).get(`/api/products/${nonExistentId}`);
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('error', 'Product not found');
        });

        it('should return 400 if product ID is not a valid number', async () => {
            const invalidId = 'abc';
            const res = await request(app).get(`/api/products/${invalidId}`);
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Invalid product ID format. Must be an integer.');
        });
    });

    // --- בדיקות חדשות ל-CRUD של מוצרים (דורש אדמין) ---
    describe('POST /api/products (Create Product)', () => {
        const newProductData = {
            name: 'בדיקה - מוצר חדש',
            brand: 'מותג חדש',
            category: 'בדיקות',
            unit_of_measure: 'unit',
            default_weight_per_unit_grams: 250,
            is_active: true,
            description: 'תיאור מוצר חדש'
        };

        it('should allow admin to create a new product', async () => {
            const res = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${adminUserToken}`)
                .send(newProductData);
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toEqual(newProductData.name);
            expect(res.body.brand).toEqual(newProductData.brand);
            createdProductId = res.body.id; // שמור את ה-ID לבדיקות הבאות
        });

        it('should prevent non-admin from creating a product', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${testUserToken}`) // משתמש רגיל
            .send(newProductData);
        expect(res.statusCode).toEqual(403); // Forbidden
        expect(res.body).toHaveProperty('error', 'Forbidden: You do not have the required role for this action.'); // <--- הודעה מעודכנת
    });

        it('should fail to create a product without authentication', async () => {
            const res = await request(app)
                .post('/api/products')
                .send(newProductData);
            expect(res.statusCode).toEqual(401); // Unauthorized
        });

        it('should fail to create a product with missing required fields (e.g., name)', async () => {
            const incompleteData = { ...newProductData };
            delete incompleteData.name; // הסר שדה חובה
            const res = await request(app)
                .post('/api/products')
                .set('Authorization', `Bearer ${adminUserToken}`)
                .send(incompleteData);
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Product name and unit_of_measure are required.');
        });
    });

    describe('PUT /api/products/:id (Update Product)', () => {
        const updatedProductData = {
            name: 'שם מוצר מעודכן',
            brand: 'מותג מעודכן',
            is_active: false
        };

        it('should allow admin to update an existing product', async () => {
            expect(createdProductId).toBeDefined(); // ודא שהמוצר נוצר בבדיקת ה-POST
            const res = await request(app)
                .put(`/api/products/${createdProductId}`)
                .set('Authorization', `Bearer ${adminUserToken}`)
                .send(updatedProductData);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id', createdProductId);
            expect(res.body.name).toEqual(updatedProductData.name);
            expect(res.body.brand).toEqual(updatedProductData.brand);
            expect(res.body.is_active).toEqual(false);
        });

        it('should prevent non-admin from updating a product', async () => {
            const res = await request(app)
                .put(`/api/products/${createdProductId}`)
                .set('Authorization', `Bearer ${testUserToken}`)
                .send(updatedProductData);
            expect(res.statusCode).toEqual(403);
        });

        it('should return 404 if trying to update a non-existent product', async () => {
            const nonExistentId = 999888;
            const res = await request(app)
                .put(`/api/products/${nonExistentId}`)
                .set('Authorization', `Bearer ${adminUserToken}`)
                .send(updatedProductData);
            expect(res.statusCode).toEqual(404);
            // התאם להודעת שגיאה מה-API שלך
             expect(res.body).toHaveProperty('error', 'Product not found for update.');
        });
    });

    describe('DELETE /api/products/:id (Delete Product)', () => {
        it('should allow admin to delete a product', async () => {
            expect(createdProductId).toBeDefined();
            const res = await request(app)
                .delete(`/api/products/${createdProductId}`)
                .set('Authorization', `Bearer ${adminUserToken}`);
            expect(res.statusCode).toEqual(204); // No Content

            // ודא שהמוצר נמחק (קריאה חוזרת אמורה להחזיר 404)
            const getRes = await request(app).get(`/api/products/${createdProductId}`);
            expect(getRes.statusCode).toEqual(404);
        });

        it('should prevent non-admin from deleting a product', async () => {
            // צור מוצר חדש כדי שיהיה מה לנסות למחוק
            const tempProductRes = await request(app).post('/api/products').set('Authorization', `Bearer ${adminUserToken}`).send({ name: 'Temp Product to Delete', unit_of_measure: 'g' });
            const tempProductId = tempProductRes.body.id;

            const res = await request(app)
                .delete(`/api/products/${tempProductId}`)
                .set('Authorization', `Bearer ${testUserToken}`);
            expect(res.statusCode).toEqual(403);
        });

        it('should return 404 if trying to delete a non-existent product', async () => {
            const nonExistentId = 999777;
            const res = await request(app)
                .delete(`/api/products/${nonExistentId}`)
                .set('Authorization', `Bearer ${adminUserToken}`);
            expect(res.statusCode).toEqual(404);
            // התאם להודעת שגיאה מה-API שלך
            expect(res.body).toHaveProperty('error', 'Product not found for deletion.');
        });
    });
});