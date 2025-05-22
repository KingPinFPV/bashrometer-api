-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Table: users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_users_modtime
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

-- Table: products
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    brand VARCHAR(75),
    origin_country VARCHAR(75),
    kosher_level VARCHAR(30) CHECK (kosher_level IN ('רגיל', 'מהדרין', 'גלאט', 'ללא', 'לא ידוע', 'אחר')),
    animal_type VARCHAR(50), 
    cut_type VARCHAR(75),
    description TEXT,
    category VARCHAR(50),
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT '100g' CHECK (unit_of_measure IN ('100g', 'kg', 'g', 'unit', 'package')),
    default_weight_per_unit_grams NUMERIC(10,2) NULL,
    image_url TEXT,
    short_description VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_animal_type ON products(animal_type);


CREATE TRIGGER update_products_modtime
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

-- Table: retailers
CREATE TABLE retailers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    chain VARCHAR(75),
    address VARCHAR(255),
    type VARCHAR(50) CHECK (type IN ('סופרמרקט', 'קצביה', 'מעדניה', 'חנות נוחות', 'אונליין', 'שוק')),
    geo_lat DOUBLE PRECISION,
    geo_lon DOUBLE PRECISION,
    opening_hours VARCHAR(255),
    user_rating NUMERIC(2,1) CHECK (user_rating IS NULL OR (user_rating >= 1 AND user_rating <= 5)),
    rating_count INT DEFAULT 0 CHECK (rating_count >= 0),
    phone VARCHAR(30),
    website VARCHAR(255),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_retailers_name ON retailers(name);
CREATE INDEX idx_retailers_chain ON retailers(chain);
CREATE INDEX idx_retailers_type ON retailers(type);

CREATE TRIGGER update_retailers_modtime
BEFORE UPDATE ON retailers
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

-- Table: prices
CREATE TABLE prices (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    retailer_id INTEGER NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, 
    price_submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
    price_valid_from DATE DEFAULT CURRENT_DATE,
    price_valid_to DATE,
    unit_for_price VARCHAR(20) NOT NULL CHECK (unit_for_price IN ('100g', 'kg', 'g', 'unit', 'package')),
    quantity_for_price NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity_for_price > 0),
    regular_price NUMERIC(10,2) NOT NULL CHECK (regular_price > 0),
    sale_price NUMERIC(10,2) CHECK (sale_price IS NULL OR sale_price > 0),
    is_on_sale BOOLEAN DEFAULT FALSE,
    source VARCHAR(50) CHECK (source IN ('user_report', 'web_scrape', 'manual_import', 'retailer_feed', 'other')),
    report_type VARCHAR(20) CHECK (report_type IS NULL OR report_type IN ('community', 'auto', 'manual')),
    status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'expired', 'edited')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_sale_price_if_on_sale CHECK (NOT (is_on_sale = TRUE AND sale_price IS NULL)),
    CONSTRAINT chk_price_logic CHECK (sale_price IS NULL OR sale_price <= regular_price)
);

CREATE INDEX idx_prices_product_retailer ON prices(product_id, retailer_id);
CREATE INDEX idx_prices_submission_date ON prices(price_submission_date);
CREATE INDEX idx_prices_status ON prices(status);
CREATE INDEX idx_prices_user_id ON prices(user_id);


CREATE TRIGGER update_prices_modtime
BEFORE UPDATE ON prices
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

-- Example roles (can be expanded)
-- INSERT INTO users (name, email, password_hash, role) VALUES ('Admin User', 'admin@example.com', '[BCRYPT_HASH_FOR_PASSWORD]', 'admin');
-- INSERT INTO users (name, email, password_hash, role) VALUES ('Regular User', 'user@example.com', '[BCRYPT_HASH_FOR_PASSWORD]', 'user');

COMMENT ON COLUMN products.default_weight_per_unit_grams IS 'Weight in grams if unit_of_measure is ''unit'' or ''package'' for a single item (quantity_for_price=1)';
COMMENT ON COLUMN prices.quantity_for_price IS 'Number of units (as defined by unit_for_price) for which the given price applies (e.g., 1 for a single unit/kg/100g, or 3 for a pack of 3 units)';