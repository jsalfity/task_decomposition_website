let videoIndex = 0;
let videos = [];
let annotations = [];
let startTime = 0; // Track time spent on each video

// Load the video based on the query parameter from the URL
function loadVideoFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoFilename = urlParams.get('video');

    if (videoFilename) {
        const videoPlayer = document.getElementById('videoPlayer');
        // videoPlayer.src = `/videos/${videoFilename}`; // Local path
        videoPlayer.src = `https://storage.googleapis.com/robot_traj_videos/all/${videoFilename}`;
        videoPlayer.load();
        resetTimer(); // Reset the timer for tracking how long the user spends on this video
    } else {
        document.getElementById('feedback').textContent = 'No video selected.';
    }
}

// Function to reset and start the timer
function resetTimer() {
    startTime = Date.now(); // Reset the start time to the current time
}

// Function to calculate the time spent on each video in seconds
function getElapsedTime() {
    const currentTime = Date.now();
    return Math.floor((currentTime - startTime) / 1000); // Calculate elapsed time in seconds
}

function addSubtask() {
    const startStep = parseInt(document.getElementById('startStep').value);
    const endStep = parseInt(document.getElementById('endStep').value);
    const subtask = document.getElementById('subtask').value;
    const elapsedTime = getElapsedTime(); // Calculate how long the user took

    // Validate inputs
    if (isNaN(startStep) || isNaN(endStep) || !subtask) {
        alert("Please provide valid inputs for all fields.");
        return;
    }

    // Hide the placeholder message when the first subtask is added
    const placeholder = document.getElementById('subtask-placeholder');
    if (placeholder) {
        placeholder.style.display = 'none';
    }

    // Add the subtask to the annotations array
    const subtaskTuple = { startStep, endStep, subtask, timeSpent: elapsedTime };
    annotations.push(subtaskTuple);

    // Display the subtask in an editable list (without time spent)
    const annotationList = document.getElementById('annotations');
    const li = document.createElement('li');
    li.innerHTML = `
        <input type="number" class="edit-start-step" value="${startStep}" min="0">
        <input type="number" class="edit-end-step" value="${endStep}" min="0">
        <input type="text" class="edit-subtask" value="${subtask}" style="width: 150px">
        <button onclick="updateSubtask(this)">Update and Save</button>
        <button onclick="removeSubtask(this)">Remove</button>
    `;
    annotationList.appendChild(li);

    // Clear the input fields after adding the subtask
    document.getElementById('startStep').value = '';
    document.getElementById('endStep').value = '';
    document.getElementById('subtask').value = '';

    resetTimer(); // Reset the timer for the next subtask
}

// Function to update a subtask in the list
function updateSubtask(button) {
    const li = button.parentNode;
    const startStepInput = li.querySelector('.edit-start-step');
    const endStepInput = li.querySelector('.edit-end-step');
    const subtaskInput = li.querySelector('.edit-subtask');

    const newStartStep = parseInt(startStepInput.value);
    const newEndStep = parseInt(endStepInput.value);
    const newSubtask = subtaskInput.value;

    const index = Array.from(li.parentNode.children).indexOf(li);

    // Update the corresponding subtask in the annotations array
    annotations[index] = { startStep: newStartStep, endStep: newEndStep, subtask: newSubtask };

    // Update feedback message
    document.getElementById('feedback').textContent = 'Subtask updated.';
}

// Function to remove a subtask from the list
function removeSubtask(button) {
    const li = button.parentNode;
    const index = Array.from(li.parentNode.children).indexOf(li);

    // Remove the subtask from the annotations array
    annotations.splice(index, 1);

    // Remove the list item from the DOM
    li.remove();

    // Show the placeholder message if no subtasks remain
    if (annotations.length === 0) {
        const placeholder = document.getElementById('subtask-placeholder');
        if (placeholder) {
            placeholder.style.display = 'block';
        }
    }
}


// Function to save the annotation and update user progress
function saveAnnotation() {
    const username = document.getElementById('username').value.trim();
    if (!username) {
        alert("Please enter your username.");
        return;
    }

    if (!annotations.length) {
        alert("You must label at least one subtask in this annotation.");
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const videoFilename = urlParams.get('video'); // Get the video filename from the URL

    const annotationData = {
        username: username,
        video: videoFilename,
        annotations: annotations // List of subtasks (with timeSpent)
    };

    // Send the annotation data to the backend for saving
    fetch('/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotationData),
    })
        .then(response => response.json())
        .then(_ => {
            // Show success message
            document.getElementById('feedback').textContent = 'Annotation saved successfully! Redirecting to the homepage...';
            document.getElementById('annotations').innerHTML = ''; // Clear displayed annotations
            annotations = []; // Clear current annotation list

            // Delay redirection by 1 seconds to show the success message
            setTimeout(() => {
                window.location.href = '/index.html';
            }, 1000); // 1 seconds delay before redirection
        })
        .catch(error => {
            console.error('Error saving annotation:', error);
            document.getElementById('feedback').textContent = 'Error saving annotation. Please try again.';

            // Delay redirection by 1 seconds to show the error message
            setTimeout(() => {
                window.location.href = '/index.html';
            }, 1000); // 1 seconds delay before redirection
        });
}

function saveUsername() {
    const username = document.getElementById('username').value.trim();
    localStorage.setItem('annotationUsername', username);
}

// Function to load username from localStorage
function loadUsername() {
    const savedUsername = localStorage.getItem('annotationUsername');
    if (savedUsername) {
        document.getElementById('username').value = savedUsername;
    }
}

// Call loadUsername when the page loads
window.addEventListener('load', loadUsername);

// Load the video and setup the page when it loads
window.onload = loadVideoFromURL;
