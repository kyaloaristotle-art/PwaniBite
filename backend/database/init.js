const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
    try {
        console.log('🔗 Connecting to MySQL server...');

        // Connect to MySQL server (without database)
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: process.env.DB_PORT || 3306,
            multipleStatements: true
        });

        console.log('✅ Connected to MySQL server');

        // Read and execute schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('📝 Executing schema...');
        await connection.query(schema);

        console.log('✅ Database schema created successfully');
        console.log('📊 Database: pwani_bite');
        console.log('👤 Default admin user created:');
        console.log('   Email: admin@pwanibite.com');
        console.log('   Password: password123');
        console.log('   Role: admin');

        await connection.end();
        console.log('🔌 Connection closed');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        process.exit(1);
    }
}

initializeDatabase();
