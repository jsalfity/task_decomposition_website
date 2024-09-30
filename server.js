// inject environment variables
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const app = express();
app.use(express.json());

const MAX_ANNOTATIONS = 3;  // Define the maximum number of annotations allowed per video

// Directory where the annotation files will be stored
const annotationsDir = path.join(__dirname, 'annotations');

// Initialize the Postgres client
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false
});

client.connect();

// Ensure the directory exists
if (!fs.existsSync(annotationsDir)) {
    fs.mkdirSync(annotationsDir);
}

// Serve the overview.html page when a user visits /overview
app.get('/overview', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overview.html'));
});

// Serve the annotation page (assuming it’s in public/annotate.html)
app.get('/annotate.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'annotate.html'));
});

// Endpoint to get video progress (number of annotations per video)
app.get('/video-progress', (req, res) => {
    const videosFile = path.join(__dirname, 'public', 'videos.json'); // Assuming this holds your video filenames

    if (!fs.existsSync(videosFile)) {
        return res.status(500).json({ message: 'Videos list not found.' });
    }

    const videos = JSON.parse(fs.readFileSync(videosFile, 'utf8')).videos;
    const videoProgress = videos.map(video => {
        const annotationFile = path.join(annotationsDir, `${video}.json`);
        let annotationCount = 0;

        if (fs.existsSync(annotationFile)) {
            const fileContent = fs.readFileSync(annotationFile, 'utf8');
            const annotations = fileContent ? JSON.parse(fileContent) : [];
            annotationCount = annotations.length;
        }

        return {
            video,
            annotationCount,
            maxAnnotations: MAX_ANNOTATIONS // Include the max annotations in the response
        };
    });

    res.json(videoProgress);
});

app.post('/save', (req, res) => {
    const { username, video, annotations: userAnnotations } = req.body;

    userAnnotations.forEach(annotation => {
        const query_annotations = `
            INSERT INTO annotations (username, video_filename, time_spent, created_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP);
        `;
        const values_annotations = [
            username,
            video,
            annotation.timeSpent
        ];

        // query the big table and ask for the annotation_id
        client.query(query_annotations, values_annotations, (err, result) => {
            if (err) {
                console.error('Error saving annotation:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            const query_subtask = `
            INSERT INTO subtask (start_step, end_step, subtask, annotation_id)
            VALUES ($1, $2, $3, $4);
            `;
            const values_subtask = [
                annotation.startStep,
                annotation.endStep,
                annotation.subtask,
                result.id
            ];

            client.query(query_subtask, values_subtask, (err, result) => {
                if (err) {
                    console.error('Error saving annotation:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
            });
        });

    });

    res.json({ message: 'Annotations saved successfully!' });
});

// Serve static files from the public directory
app.use(express.static('public'));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
