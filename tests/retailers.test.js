// tests/retailers.test.js
const request = require('supertest');
const app = require('../app');
const { pool } = require('../db');

let testUserToken;    // משתמש רגיל
let adminUserToken;   // משתמש אדמין
let testUserId;
let adminUserId;
let testRetailerId;   // ID של קמעונאי שנוצר ב-beforeAll
let createdRetailerId; // ID של קמעונאי שנוצר במהלך בדיקת POST

beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('NODE_ENV is not set to "test". Aborting tests.');
    }

    await pool.query('DELETE FROM price_report_likes');
    await pool.query('DELETE FROM prices');
    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM retailers');

    const userRegRes = await request(app).post('/api/auth/register').send({ name: 'Retailer Regular User', email: 'retailerregular@example.com', password: 'password123', role: 'user' });
    testUserId = userRegRes.body.user.id;
    const loginResUser = await request(app).post('/api/auth/login').send({ email: 'retailerregular@example.com', password: 'password123' });
    testUserToken = loginResUser.body.token;

    const adminRegRes = await request(app).post('/api/auth/register').send({ name: 'Retailer Admin User', email: 'retaileradmin@example.com', password: 'password123', role: 'admin' });
    adminUserId = adminRegRes.body.user.id;
    // await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", ['retaileradmin@example.com']); // אם הרישום לא מאפשר role
    const loginResAdmin = await request(app).post('/api/auth/login').send({ email: 'retaileradmin@example.com', password: 'password123' });
    adminUserToken = loginResAdmin.body.token;
    expect(adminUserToken).toBeDefined();

    const initialRetailerData = { name: 'קמעונאי קיים לבדיקות', type: 'סופרמרקט', is_active: true };
    const initialRetailerRes = await request(app).post('/api/retailers').set('Authorization', `Bearer ${adminUserToken}`).send(initialRetailerData);
    expect(initialRetailerRes.statusCode).toEqual(201);
    testRetailerId = initialRetailerRes.body.id;
    expect(testRetailerId).toBeDefined();
});

afterAll(async () => {
    await pool.end();
});

describe('Retailers API Endpoints', () => {
    describe('GET /api/retailers', () => {
        it('should return a list of retailers', async () => { /* ... בדיקה קיימת ... */ 
            const res = await request(app).get('/api/retailers');
            expect(res.statusCode).toEqual(200);
            expect(res.body.data).toBeInstanceOf(Array);
            if (res.body.data && testRetailerId) {
               expect(res.body.data.some(r => r.id === testRetailerId)).toBe(true);
            }
        });
        // ... עוד בדיקות GET ...
    });

    describe('GET /api/retailers/:id', () => {
        it('should return a single retailer if ID exists', async () => { /* ... בדיקה קיימת ... */ 
            const res = await request(app).get(`/api/retailers/${testRetailerId}`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id', testRetailerId);
        });
        it('should return 404 if retailer ID does not exist', async () => { /* ... בדיקה קיימת ... */
            const res = await request(app).get(`/api/retailers/999999`);
            expect(res.statusCode).toEqual(404);
        });
        it('should return 400 if retailer ID is not a valid number', async () => { /* ... בדיקה קיימת ... */
            const res = await request(app).get(`/api/retailers/abc`);
            expect(res.statusCode).toEqual(400);
        });
    });

    // --- בדיקות CRUD חדשות ---
    describe('POST /api/retailers (Create Retailer)', () => {
        const newRetailerData = { name: 'קצביה חדשה לגמרי', type: 'קצביה', address: 'רחוב התקווה 1', is_active: true };

        it('should allow admin to create a new retailer', async () => {
            const res = await request(app).post('/api/retailers').set('Authorization', `Bearer ${adminUserToken}`).send(newRetailerData);
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toEqual(newRetailerData.name);
            createdRetailerId = res.body.id;
        });
        it('should prevent non-admin from creating a retailer', async () => { /* ... */ });
        it('should fail with missing required fields', async () => { /* ... */ });
    });

    describe('PUT /api/retailers/:id (Update Retailer)', () => {
        const updatedData = { name: 'קצביה חדשה - שם מעודכן', phone: '050-1234567' };
        it('should allow admin to update an existing retailer', async () => {
            expect(createdRetailerId).toBeDefined();
            const res = await request(app).put(`/api/retailers/${createdRetailerId}`).set('Authorization', `Bearer ${adminUserToken}`).send(updatedData);
            expect(res.statusCode).toEqual(200);
            expect(res.body.name).toEqual(updatedData.name);
            expect(res.body.phone).toEqual(updatedData.phone);
        });
        it('should prevent non-admin from updating', async () => { /* ... */ });
        it('should return 404 for non-existent retailer', async () => { /* ... */ });
    });

    describe('DELETE /api/retailers/:id (Delete Retailer)', () => {
        it('should allow admin to delete a retailer', async () => {
            expect(createdRetailerId).toBeDefined();
            const res = await request(app).delete(`/api/retailers/${createdRetailerId}`).set('Authorization', `Bearer ${adminUserToken}`);
            expect(res.statusCode).toEqual(204);
            const getRes = await request(app).get(`/api/retailers/${createdRetailerId}`);
            expect(getRes.statusCode).toEqual(404);
        });
        it('should prevent non-admin from deleting', async () => { /* ... */ });
        it('should return 404 for non-existent retailer to delete', async () => { /* ... */ });
    });
});