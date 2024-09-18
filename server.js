const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.json());

const annotationsFile = path.join(__dirname, 'annotations.json');
const usersFile = path.join(__dirname, 'users.json');

// Load existing annotations or initialize as empty
let annotations = fs.existsSync(annotationsFile) ? JSON.parse(fs.readFileSync(annotationsFile, 'utf8')) : {};
let users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf8')) : {};

// Endpoint to save annotation
app.post('/save', (req, res) => {
    const { username, video, annotations: userAnnotations } = req.body;

    // Ensure the video exists in the annotations file
    if (!annotations[video]) {
        annotations[video] = { annotations: [], annotationCount: 0 };
    }

    // Add the new annotation to the video
    annotations[video].annotations.push({ username, subtasks: userAnnotations });

    // Increment the annotation count
    annotations[video].annotationCount++;

    // Save the updated annotations to the file
    fs.writeFileSync(annotationsFile, JSON.stringify(annotations, null, 2), 'utf8');

    // Track user's progress in users.json
    if (!users[username]) {
        users[username] = { annotatedVideos: 0 };
    }

    // Increment the number of annotated videos by the user
    users[username].annotatedVideos++;

    // Save the user's updated progress
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');

    // Send back the updated annotation count and user progress
    res.json({ annotationCount: annotations[video].annotationCount, userProgress: users[username] });
});

// Serve static files from the public directory
app.use(express.static('public'));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
