// tests/prices.test.js 
const request = require('supertest'); 
const app = require('../app'); 
const { pool } = require('../db'); 

let testUserToken; 
let adminUserToken; 
let testUserId; 
let adminUserId; 
let testProductId; 
let testRetailerId; 
let testPriceReportId;  // דיווח שאושר לצורך בדיקות לייק
let pendingPriceReportId; // דיווח שיישאר pending לצורך בדיקות עדכון סטטוס

beforeAll(async () => { 
    if (process.env.NODE_ENV !== 'test') { 
        throw new Error('NODE_ENV is not set to "test". Aborting tests.'); 
    } 

    await pool.query('DELETE FROM price_report_likes'); 
    await pool.query('DELETE FROM prices'); 
    await pool.query('DELETE FROM users'); 
    await pool.query('DELETE FROM products'); 
    await pool.query('DELETE FROM retailers'); 

    const userRes = await request(app) 
        .post('/api/auth/register') 
        .send({ name: 'Price Test User', email: 'pricetest@example.com', password: 'password123' }); 
    expect(userRes.statusCode).toEqual(201); 
    testUserId = userRes.body.user.id; 
    const loginRes = await request(app) 
        .post('/api/auth/login') 
        .send({ email: 'pricetest@example.com', password: 'password123' }); 
    expect(loginRes.statusCode).toEqual(200); 
    testUserToken = loginRes.body.token; 
    expect(testUserToken).toBeDefined(); 

    const adminRegRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Price Admin User', email: 'priceadmin@example.com', password: 'password123', role: 'admin' }); 
    expect(adminRegRes.statusCode).toEqual(201);
    if (adminRegRes.body.user.role !== 'admin') {
        await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", ['priceadmin@example.com']);
    }
    adminUserId = adminRegRes.body.user.id;
    const loginAdminRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'priceadmin@example.com', password: 'password123' });
    expect(loginAdminRes.statusCode).toEqual(200);
    adminUserToken = loginAdminRes.body.token;
    expect(adminUserToken).toBeDefined();

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

    const priceReportRes = await request(app)
        .post('/api/prices')
        .set('Authorization', `Bearer ${adminUserToken}`) 
        .send({
            product_id: testProductId, retailer_id: testRetailerId, regular_price: 100.50,
            unit_for_price: 'kg', quantity_for_price: 1, source: 'user_report', status: 'approved' 
        });
    expect(priceReportRes.statusCode).toBeOneOf([200, 201]);
    testPriceReportId = priceReportRes.body.id;
    expect(testPriceReportId).toBeDefined();

    const pendingRes = await request(app)
        .post('/api/prices')
        .set('Authorization', `Bearer ${testUserToken}`) 
        .send({
            product_id: testProductId, retailer_id: testRetailerId, regular_price: 120.00,
            unit_for_price: 'kg', quantity_for_price: 1, source: 'user_report',
        });
    expect(pendingRes.statusCode).toBeOneOf([200, 201]);
    pendingPriceReportId = pendingRes.body.id;
    expect(pendingPriceReportId).toBeDefined();
    const checkPending = await pool.query("SELECT status FROM prices WHERE id = $1", [pendingPriceReportId]);
    expect(checkPending.rows[0].status).toEqual('pending_approval');
}); 

afterAll(async () => { 
    await pool.end(); 
}); 

describe('Prices API Endpoints', () => { 
    describe('POST /api/prices (Create Price Report)', () => { 
        it('should create a new price report successfully by a regular user (defaults to pending_approval)', async () => {
           const res = await request(app)
               .post('/api/prices')
               .set('Authorization', `Bearer ${testUserToken}`)
               .send({
                   product_id: testProductId,
                   retailer_id: testRetailerId,
                   regular_price: 110.00, 
                   unit_for_price: 'kg',
                   quantity_for_price: 1,
                   source: 'user_report',
               });
           expect(res.statusCode).toBeOneOf([200, 201]);
           expect(res.body).toHaveProperty('id');
           expect(res.body.status).toEqual('pending_approval');
       });
       
       it('should fail to create a price report without authentication', async () => {
            const res = await request(app)
                .post('/api/prices')
                .send({
                    product_id: testProductId, retailer_id: testRetailerId, regular_price: 99.00,
                    unit_for_price: 'kg', source: 'user_report'
                });
            expect(res.statusCode).toEqual(401); 
        });

        it('should fail to create a price report with missing required fields', async () => {
            const res = await request(app)
                .post('/api/prices')
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({ 
                    product_id: testProductId, regular_price: 100.00,
                    unit_for_price: 'kg', source: 'user_report'
                });
            expect(res.statusCode).toEqual(400); 
            expect(res.body).toHaveProperty('error');
        });
    }); 

    describe('POST /api/prices/:priceId/like (Like a Price Report)', () => { 
         it('should allow a logged-in user to like a price report', async () => { 
            expect(testPriceReportId).toBeDefined(); 
            const res = await request(app) 
                .post(`/api/prices/${testPriceReportId}/like`) 
                .set('Authorization', `Bearer ${testUserToken}`) 
                .send({}); 
            expect(res.statusCode).toBeOneOf([200, 201]);
            expect(res.body).toHaveProperty('message'); 
            expect(res.body.priceId).toEqual(testPriceReportId); 
            expect(res.body.userId).toEqual(testUserId); 
            expect(res.body.userLiked).toEqual(true); 
            expect(res.body.likesCount).toBeGreaterThanOrEqual(1); 
        }); 
        
        it('should return updated like status if liked again (idempotent or reflects current state)', async () => {
            const res = await request(app)
                .post(`/api/prices/${testPriceReportId}/like`) 
                .set('Authorization', `Bearer ${testUserToken}`)
                .send({});
            expect(res.statusCode).toEqual(200); 
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
            const res = await request(app) 
                .delete(`/api/prices/${testPriceReportId}/like`) 
                .set('Authorization', `Bearer ${testUserToken}`) 
                .send(); 
            expect(res.statusCode).toEqual(200); 
            expect(res.body.userLiked).toEqual(false); 
        }); 
        
        it('should handle unliking a report that was not liked (or already unliked) gracefully', async () => {
            const res = await request(app)
                .delete(`/api/prices/${testPriceReportId}/like`) 
                .set('Authorization', `Bearer ${testUserToken}`)
                .send();
            expect(res.statusCode).toEqual(200); 
            expect(res.body.userLiked).toEqual(false);
        });
        
        it('should fail to unlike a price report without authentication', async () => {
            const res = await request(app)
                .delete(`/api/prices/${testPriceReportId}/like`)
                .send();
            expect(res.statusCode).toEqual(401);
        });
    }); 
     
    describe('PUT /api/prices/:priceId/status (Admin Update Status)', () => {
       it('should allow admin to update price report status to "approved"', async () => {
           expect(pendingPriceReportId).toBeDefined(); 
           expect(adminUserToken).toBeDefined();
           const res = await request(app)
               .put(`/api/prices/${pendingPriceReportId}/status`)
               .set('Authorization', `Bearer ${adminUserToken}`)
               .send({ status: 'approved' });
           expect(res.statusCode).toEqual(200);
           expect(res.body).toHaveProperty('id', pendingPriceReportId);
           expect(res.body).toHaveProperty('status', 'approved');
       });

       it('should allow admin to update price report status to "rejected"', async () => {
           const newPendingReport = await request(app)
               .post('/api/prices')
               .set('Authorization', `Bearer ${testUserToken}`) 
               .send({
                   product_id: testProductId, retailer_id: testRetailerId, regular_price: 130.00,
                   unit_for_price: 'kg', quantity_for_price: 1, source: 'user_report'
               });
           const newPendingReportId = newPendingReport.body.id;
           expect(newPendingReportId).toBeDefined();
           expect(newPendingReport.body.status).toEqual('pending_approval'); // ודא סטטוס התחלתי

           const res = await request(app)
               .put(`/api/prices/${newPendingReportId}/status`)
               .set('Authorization', `Bearer ${adminUserToken}`)
               .send({ status: 'rejected' });
           expect(res.statusCode).toEqual(200);
           expect(res.body.status).toEqual('rejected');
       });

       it('should prevent non-admin from updating status', async () => {
           const res = await request(app)
               .put(`/api/prices/${pendingPriceReportId}/status`)
               .set('Authorization', `Bearer ${testUserToken}`) 
               .send({ status: 'approved' });
           expect(res.statusCode).toEqual(403); 
           expect(res.body).toHaveProperty('error', 'Forbidden: You do not have the required role for this action.');
       });

       it('should return 400 for invalid status value', async () => {
           const res = await request(app)
               .put(`/api/prices/${pendingPriceReportId}/status`)
               .set('Authorization', `Bearer ${adminUserToken}`)
               .send({ status: 'invalid_status_value' });
           expect(res.statusCode).toEqual(400);
           expect(res.body).toHaveProperty('error');
           expect(res.body.error).toContain('Invalid status provided'); 
       });

       it('should return 404 if price report does not exist when updating status', async () => {
           const nonExistentId = 999888;
           const res = await request(app)
               .put(`/api/prices/${nonExistentId}/status`)
               .set('Authorization', `Bearer ${adminUserToken}`)
               .send({ status: 'approved' });
           expect(res.statusCode).toEqual(404);
           expect(res.body).toHaveProperty('error', 'Price report not found for status update.');
       });

       it('should fail to update status without authentication', async () => {
           const res = await request(app)
               .put(`/api/prices/${pendingPriceReportId}/status`)
               .send({ status: 'approved' });
           expect(res.statusCode).toEqual(401);
       });
   });
}); 

if (!expect.toBeOneOf) { 
    expect.extend({ 
      toBeOneOf(received, items) { 
        const pass = items.includes(received); 
        if (pass) { return { message: () => `expected ${received} not to be one of [${items.join(', ')}]`, pass: true }; } 
        else { return { message: () => `expected ${received} to be one of [${items.join(', ')}]`, pass: false }; } 
      }, 
    }); 
}