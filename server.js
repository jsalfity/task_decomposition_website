// inject environment variables
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const app = express();
app.use(express.json());

const MAX_ANNOTATIONS = 3;  // Define the maximum number of annotations allowed per video

const dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// get table names depending on the NODE_ENV variable in the .env file
const getTableNames = () => {
    const env = process.env.NODE_ENV || 'development';
    const prefix = env === 'production' ? 'prod_' : 'dev_';
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
                video_filename VARCHAR(255) NOT NULL UNIQUE,
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

const initializeDatabase = async () => {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        console.log('Connected to the database');
        const tableNames = getTableNames();
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

            // Query the database for annotation counts
            const annotationCounts = await client.query(`
                SELECT video_filename, COUNT(*) as count
                FROM ${tableNames.annotations}
                GROUP BY video_filename
            `);

            // Create a map of video filenames to their annotation counts
            const annotationCountMap = new Map(
                annotationCounts.rows.map(row => [row.video_filename, parseInt(row.count)])
            );

            const videoProgress = videos.map(video => ({
                video,
                annotationCount: annotationCountMap.get(video) || 0,
                maxAnnotations: MAX_ANNOTATIONS
            }));

            res.json(videoProgress);
        } catch (err) {
            console.error('Error fetching video progress:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    app.post('/save', async (req, res) => {
        const { username, video, annotations: userAnnotations } = req.body;
        try {
            await client.query('BEGIN');

            // Check if an annotation for this video already exists
            const existingAnnotation = await client.query(
                `SELECT id FROM ${tableNames.annotations} WHERE video_filename = $1`,
                [video]
            );

            console.log(existingAnnotation);

            if (existingAnnotation.rows.length) {
                const errorString = `Annotation already exists for video_filename: ${video}`;
                console.error(errorString);
                res.status(500).json({ error: errorString });
                return;
            }

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
            res.status(500).json({ error: 'Database error' });
        }
    });
};


const startServer = async () => {
    try {
        const { client, tableNames } = await initializeDatabase();

        console.log(client)

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
