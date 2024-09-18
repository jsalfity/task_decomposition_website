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

// Endpoint to save annotations
app.post('/save', (req, res) => {
    const { username, video, annotations: userAnnotations } = req.body;

    // Define the file path for the video annotations
    const annotationFile = path.join(annotationsDir, `${video}.json`);

    // Load existing annotations for the video (if any)
    let existingAnnotations = [];
    if (fs.existsSync(annotationFile)) {
        const fileContent = fs.readFileSync(annotationFile, 'utf8');
        existingAnnotations = fileContent ? JSON.parse(fileContent) : [];
    }

    // Structure for the new subtask decomposition
    const subtaskDecomposition = userAnnotations.map(annotation => [
        annotation.startStep,
        annotation.endStep,
        annotation.subtask
    ]);

    // Create a new annotation entry for this user
    const newEntry = {
        username,
        subtask_decomposition: subtaskDecomposition,
        timeSpent: userAnnotations.reduce((acc, curr) => acc + curr.timeSpent, 0) // Summing up total time spent
    };

    // Add the new annotation to the list
    existingAnnotations.push(newEntry);

    // Save the updated annotations to the file
    fs.writeFileSync(annotationFile, JSON.stringify(existingAnnotations, null, 2), 'utf8');

    // Respond with success
    res.json({ message: 'Annotations saved successfully!' });
});

// Serve static files from the public directory
app.use(express.static('public'));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
