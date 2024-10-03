// inject environment variables
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const app = express();
app.use(express.json());


const dbConfig = {
    connectionString: process.env.DATABASE_URL,
    // Heroku mandates SSL connections to pg databases as a security best practice
    ssl: process.env.IN_HEROKU === 'true' ? { rejectUnauthorized: false } : false
};

// NOTE: add any tests tables here
const tableNameMap = {
    "development": "dev_",
    "production": "prod_",
    "test1": "test1_"
}

// get table names depending on the NODE_ENV variable in the .env file
// this will either be "development" or "production"
const getTableNames = () => {
    const env = process.env.NODE_ENV || 'development';
    const prefix = tableNameMap[env];
    return {
        annotations: `${prefix}annotations`,
        subtasks: `${prefix}subtasks`
    };
};

const createTables = async (client, tableNames) => {
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${tableNames.annotations} (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                video_filename VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS ${tableNames.subtasks} (
                id SERIAL PRIMARY KEY,
                start_step INT NOT NULL,
                end_step INT NOT NULL,
                subtask TEXT NOT NULL,
                time_spent INT NOT NULL,
                annotation_id INT REFERENCES ${tableNames.annotations}(id)
            );
        `);
        console.log('Tables created successfully');
    } catch (err) {
        console.error('Error creating tables:', err);
        throw err;
    }
};

const dropTables = async (client, tableNames) => {
    try {
        await client.query(`
            DROP TABLE IF EXISTS ${tableNames.subtasks};
            DROP TABLE IF EXISTS ${tableNames.annotations};
        `);
        console.log('Tables dropped successfully');
    } catch (err) {
        console.error('Error dropping tables:', err);
        throw err;
    }
};

const initializeDatabase = async (shouldDropTables) => {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        console.log('Connected to the database');
        const tableNames = getTableNames();
        if (shouldDropTables) {
            await dropTables(client, tableNames);
        }
        await createTables(client, tableNames);
        return { client, tableNames };
    } catch (err) {
        console.error('Error initializing database:', err);
        throw err;
    }
};

let cachedVideos = null;

const loadVideos = () => {
    if (cachedVideos) {
        return cachedVideos;
    }

    const videosFile = path.join(__dirname, 'public', 'videos.json');
    if (!fs.existsSync(videosFile)) {
        throw new Error('Videos list not found.');
    }

    const videos = JSON.parse(fs.readFileSync(videosFile, 'utf8')).videos;
    cachedVideos = videos;
    return videos;
};

// Routes
const setupRoutes = (app, client, tableNames) => {
    app.get('/overview', (_, res) => {
        res.sendFile(path.join(__dirname, 'public', 'overview.html'));
    });

    app.get('/annotate.html', (_, res) => {
        res.sendFile(path.join(__dirname, 'public', 'annotate.html'));
    });

    app.get('/video-progress', async (_, res) => {
        try {
            const videos = loadVideos();

            // Query db for annotation counts
            const annotationCountsQuery = `
                SELECT a.video_filename, COUNT(a.id) as count
                FROM ${tableNames.annotations} a
                GROUP BY a.video_filename
            `

            const subtaskCounts = await client.query(annotationCountsQuery);

            // Create a map of video filenames to their subtask counts
            const subtaskCountMap = new Map(
                subtaskCounts.rows.map(row => [row.video_filename, parseInt(row.count)])
            );

            const videoProgress = videos.map(video => {
                const count = subtaskCountMap.get(video) || 0;
                return {
                    video,
                    // only show up to a count of up to 3 annotations
                    annotationCount: Math.min(count, process.env.MAX_ANNOTATIONS_PER_VIDEO),
                    maxAnnotations: process.env.MAX_ANNOTATIONS_PER_VIDEO
                };
            });

            res.json(videoProgress);
        } catch (err) {
            console.error('Error fetching video progress:', err);
            res.status(500).json({ error: 'Server error', details: err.message });
        }
    });

    app.post('/save', async (req, res) => {
        const { username, video, annotations: userAnnotations } = req.body;
        try {
            await client.query('BEGIN');

            // Insert new annotation
            const { rows } = await client.query(
                `INSERT INTO ${tableNames.annotations} (username, video_filename, created_at)
                     VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING id`,
                [username, video]
            );
            const annotationId = rows[0].id;


            // Insert new subtasks
            for (const subtask of userAnnotations) {
                await client.query(
                    `INSERT INTO ${tableNames.subtasks} (start_step, end_step, subtask, time_spent, annotation_id)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [subtask.startStep, subtask.endStep, subtask.subtask, subtask.timeSpent, annotationId]
                );
            }

            await client.query('COMMIT');
            res.json({ message: 'Annotation and subtasks saved successfully!' });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error saving annotation:', err);
            res.status(500).json({ error: `Database error: ${err}` });
        }
    });
};


const startServer = async () => {
    try {
        const shouldDropTables = process.argv.includes("--drop-tables");
        const { client, tableNames } = await initializeDatabase(shouldDropTables);

        // Serve static files from public directory
        app.use(express.static('public'));
        setupRoutes(app, client, tableNames);

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Using tables: ${tableNames.annotations}, ${tableNames.subtasks}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer();
