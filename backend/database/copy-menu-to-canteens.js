// One-off: copy every food item to all canteens that don't have it yet.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'pwani_bite',
        port: Number(process.env.DB_PORT || 3306)
    });

    try {
        const [canteens] = await connection.query('SELECT canteen_id, name FROM canteens ORDER BY canteen_id');
        if (canteens.length < 2) {
            console.log('Fewer than 2 canteens found — nothing to do.');
            return;
        }

        const [foods] = await connection.query('SELECT * FROM food');
        let inserted = 0;

        await connection.beginTransaction();
        for (const food of foods) {
            for (const canteen of canteens) {
                if (food.canteen_id === canteen.canteen_id) continue;
                // Skip if a same-named item already exists at the target canteen.
                const [dup] = await connection.query(
                    'SELECT food_id FROM food WHERE canteen_id = ? AND LOWER(food_name) = LOWER(?) LIMIT 1',
                    [canteen.canteen_id, food.food_name]
                );
                if (dup.length) continue;
                await connection.query(
                    `INSERT INTO food (food_name, description, price, image, category, canteen_id, availability, stock_quantity)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [food.food_name, food.description, food.price, food.image, food.category,
                     canteen.canteen_id, food.availability, food.stock_quantity]
                );
                inserted++;
            }
        }
        await connection.commit();
        console.log(`Copied menu items across ${canteens.length} canteens: ${inserted} new rows created.`);
        canteens.forEach(c => console.log(`  - ${c.name} (id ${c.canteen_id})`));
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        await connection.end();
    }
}

run().catch(error => {
    console.error('Menu copy failed:', error.message);
    process.exitCode = 1;
});
