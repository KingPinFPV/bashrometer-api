// tests/auth.test.js
const request = require('supertest');
const app = require('../app'); 
const { pool } = require('../db'); 

beforeAll(async () => {
    if (process.env.NODE_ENV === 'test') {
        try {
            // הסדר חשוב אם יש קשרי גומלין עם ON DELETE CASCADE
            await pool.query('DELETE FROM price_report_likes');
            await pool.query('DELETE FROM prices');
            await pool.query('DELETE FROM users');
            // הוסף טבלאות נוספות אם צריך, למשל products, retailers
            // await pool.query('DELETE FROM products');
            // await pool.query('DELETE FROM retailers');

            // לחלופין, לניקוי מלא יותר, אם אין התנגדות:
            // await pool.query('TRUNCATE TABLE users, prices, price_report_likes, products, retailers RESTART IDENTITY CASCADE');
        } catch (error) {
            console.error("Error cleaning database in beforeAll:", error);
            throw error;
        }
    } else {
        throw new Error('NODE_ENV is not set to "test". Aborting tests to prevent data loss on production/development DB.');
    }
});

afterAll(async () => {
    await pool.end();
});

describe('Auth API Endpoints', () => {
    describe('POST /api/auth/register', () => {
        it('should register a new user successfully', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'password123'
                });
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message', 'User registered successfully.'); // תיקון: הוספת נקודה
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('id');
            expect(res.body.user.email).toEqual('test@example.com');
        });

        it('should fail to register if email already exists', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Test User Again',
                    email: 'test@example.com', 
                    password: 'password456'
                });
            expect(res.statusCode).toEqual(409); // תיקון: שינוי ל-409 (או מה שה-API שלך מחזיר)
            expect(res.body).toHaveProperty('error');
            // התאם את ההודעה למה שה-API שלך מחזיר, לדוגמה:
            // expect(res.body.error).toEqual('Email already in use'); 
        });

        it('should fail to register if required fields are missing (e.g., password)', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Missing Pwd',
                    email: 'missingpassword@example.com'
                });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error');
            // התאם את ההודעה למה שה-API שלך מחזיר, לדוגמה:
            // expect(res.body.error).toEqual('Password is required');
        });
    });

    describe('POST /api/auth/login', () => {
        it('should login an existing user successfully', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'password123' 
                });
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Login successful.'); // תיקון: הוספת נקודה
            expect(res.body).toHaveProperty('token');
            expect(res.body).toHaveProperty('user');
            expect(res.body.user.email).toEqual('test@example.com');
        });

        it('should fail to login with incorrect password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'wrongpassword'
                });
            expect(res.statusCode).toBeOneOf([400, 401]); 
            expect(res.body).toHaveProperty('error');
            // התאם את ההודעה למה שה-API שלך מחזיר, לדוגמה:
            // expect(res.body.error).toEqual('Invalid credentials.');
        });

        it('should fail to login if user does not exist', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password123'
                });
            expect(res.statusCode).toBeOneOf([400, 401]);
            expect(res.body).toHaveProperty('error');
            // התאם את ההודעה למה שה-API שלך מחזיר, לדוגמה:
            // expect(res.body.error).toEqual('Invalid credentials.');
        });
    });
});

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