const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Directory where the annotation files will be stored
const annotationsDir = path.join(__dirname, 'annotations');

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
            annotationCount
        };
    });

    res.json(videoProgress);
});

// Endpoint to save annotations (same as before)
app.post('/save', (req, res) => {
    const { username, video, annotations: userAnnotations } = req.body;

    const annotationFile = path.join(annotationsDir, `${video}.json`);

    let existingAnnotations = [];
    if (fs.existsSync(annotationFile)) {
        const fileContent = fs.readFileSync(annotationFile, 'utf8');
        existingAnnotations = fileContent ? JSON.parse(fileContent) : [];
    }

    const subtaskDecomposition = userAnnotations.map(annotation => [
        annotation.startStep,
        annotation.endStep,
        annotation.subtask
    ]);

    const newEntry = {
        username,
        subtask_decomposition: subtaskDecomposition,
        timeSpent: userAnnotations.reduce((acc, curr) => acc + curr.timeSpent, 0)
    };

    existingAnnotations.push(newEntry);
    fs.writeFileSync(annotationFile, JSON.stringify(existingAnnotations, null, 2), 'utf8');
    res.json({ message: 'Annotations saved successfully!' });
});

// Serve static files from the public directory
app.use(express.static('public'));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
