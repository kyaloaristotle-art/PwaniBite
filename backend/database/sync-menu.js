// Synchronize the active menu while preserving older food rows for order history.
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql2/promise');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const menu = [
    ['Tamarind Juice', 'Fresh tamarind juice', 30, 'Juices'],
    ['Passion Juice', 'Fresh passion juice', 40, 'Juices'],
    ['Mango Juice', 'Fresh mango juice', 50, 'Juices'],
    ['Pineapple Juice', 'Fresh pineapple juice', 40, 'Juices'],
    ['Hibiscus Juice', 'Refreshing hibiscus juice', 50, 'Juices'],
    ['Samosa', 'Crispy samosa', 10, 'Snacks'],
    ['Viazi Karai', 'Spiced viazi karai', 5, 'Snacks'],
    ['Donuts', 'Fresh donuts', 10, 'Snacks', ['Donut']],
    ['Chapati', 'Fresh chapati', 15, 'Snacks'],
    ['Chips', 'Crispy chips', 100, 'Snacks'],
    ['Smokie', 'Smokie sausage', 40, 'Snacks'],
    ['Boiled Eggs', 'Boiled eggs', 30, 'Snacks'],
    ['Smocha', 'Smokie wrapped in chapati', 60, 'Snacks'],
    ['Chips Zoge', 'Chips zoge', 150, 'Snacks'],
    ['Chips Kuku Macha', 'Chips kuku macha', 300, 'Snacks'],
    ['Chapati & Beans Offer', 'Four chapatis served with beans', 60, 'Main Dishes', ['Chapati Offer']],
    ['Ugali & Omena', 'Ugali served with omena', 70, 'Main Dishes', ['Ugali Omena']],
    ['Ugali & Mayai', 'Ugali served with eggs', 100, 'Main Dishes'],
    ['Rice & Beans', 'Rice served with beans', 70, 'Main Dishes'],
    ['Kahawa', 'Kenyan coffee', 20, 'Drinks'],
    ['Chai Rangi', 'Kenyan black tea', 20, 'Drinks'],
    ['Milk Tea', 'Tea with milk', 30, 'Drinks'],
    ['Mineral Water', 'Bottled mineral water', 30, 'Drinks']
];

async function syncMenu() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'pwani_bite',
        port: Number(process.env.DB_PORT || 3306)
    });

    try {
        await connection.beginTransaction();
        await connection.query('UPDATE food SET availability = FALSE');

        // Assign synced items to Main Canteen when the multi-canteen schema is present.
        const [colRows] = await connection.query(
            `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'food' AND COLUMN_NAME = 'canteen_id'`
        );
        const hasCanteenColumn = colRows.length && Number(colRows[0].n) > 0;
        let mainCanteenId = null;
        if (hasCanteenColumn) {
            const [canteenRows] = await connection.query(
                "SELECT canteen_id FROM canteens WHERE name = 'Main Canteen' LIMIT 1"
            ).catch(() => [[]]);
            mainCanteenId = canteenRows.length ? canteenRows[0].canteen_id : null;
        }

        for (const [name, description, price, category, aliases = []] of menu) {
            const candidates = [name, ...aliases];
            const [existing] = await connection.query(
                `SELECT food_id FROM food WHERE LOWER(food_name) IN (${candidates.map(() => '?').join(', ')}) ORDER BY CASE WHEN LOWER(food_name) = LOWER(?) THEN 0 ELSE 1 END LIMIT 1`,
                [...candidates.map(value => value.toLowerCase()), name]
            );

            if (existing.length) {
                if (hasCanteenColumn) {
                    await connection.query(
                        'UPDATE food SET food_name = ?, description = ?, price = ?, category = ?, availability = TRUE, canteen_id = COALESCE(canteen_id, ?) WHERE food_id = ?',
                        [name, description, price, category, mainCanteenId, existing[0].food_id]
                    );
                } else {
                    await connection.query(
                        'UPDATE food SET food_name = ?, description = ?, price = ?, category = ?, availability = TRUE WHERE food_id = ?',
                        [name, description, price, category, existing[0].food_id]
                    );
                }
            } else if (hasCanteenColumn) {
                await connection.query(
                    'INSERT INTO food (food_name, description, price, category, canteen_id, availability, stock_quantity) VALUES (?, ?, ?, ?, ?, TRUE, 50)',
                    [name, description, price, category, mainCanteenId]
                );
            } else {
                await connection.query(
                    'INSERT INTO food (food_name, description, price, category, availability, stock_quantity) VALUES (?, ?, ?, ?, TRUE, 50)',
                    [name, description, price, category]
                );
            }
        }

        await connection.commit();
        console.log(`Active menu synchronized: ${menu.length} items.`);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        await connection.end();
    }
}

syncMenu().catch(error => {
    console.error('Menu synchronization failed:', error.message);
    process.exitCode = 1;
});
