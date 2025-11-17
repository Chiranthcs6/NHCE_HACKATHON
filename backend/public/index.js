// ====================================================================
// FRONTEND CONFIGURATION (Matching Your Backend)
// ====================================================================
const BASE_URL = `${location.hostname}${location.port ? `:${location.port}` : ''}`;
console.log(BASE_URL);
const WS_URL = `ws://${BASE_URL}/ws`;
const USER_DATA_API = `http://${BASE_URL}/user/data`;
const VIDEO_STREAM_API = `http://${BASE_URL}/api/videos`;

// Chart and WebSocket variables
let websocketInstance = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;
let intrusionChart = null;
const MAX_DATA_POINTS = 30;



// ✅ Storage for feedback requests
const MAX_STORED_FEEDBACKS = 10;
const FEEDBACKS_STORAGE_KEY = 'chakravyuha_feedbacks';
const VIDEO_TIMESTAMP_MAP_KEY = 'chakravyuha_video_timestamps'; // Map video filename to original timestamp



// ✅ Max displayed logs (no localStorage)
const MAX_DISPLAYED_LOGS = 50;



// ====================================================================
// ✅ VIDEO TIMESTAMP MAPPING (for video viewer feedback)
// ====================================================================



// Store video filename → original timestamp mapping
function storeVideoTimestamp(videoFilename, originalTimestamp) {
    try {
        const map = JSON.parse(localStorage.getItem(VIDEO_TIMESTAMP_MAP_KEY) || '{}');
        map[videoFilename] = originalTimestamp;
        localStorage.setItem(VIDEO_TIMESTAMP_MAP_KEY, JSON.stringify(map));
        console.log('[Storage] ✅ Stored video timestamp mapping:', videoFilename, '→', originalTimestamp);
    } catch (error) {
        console.error('[Storage] Error storing video timestamp:', error);
    }
}



// Get original timestamp for a video filename
function getVideoTimestamp(videoFilename) {
    try {
        const map = JSON.parse(localStorage.getItem(VIDEO_TIMESTAMP_MAP_KEY) || '{}');
        return map[videoFilename] || null;
    } catch (error) {
        console.error('[Storage] Error getting video timestamp:', error);
        return null;
    }
}
function updateProbabilityIndicator(probability) {
    const indicator = document.getElementById("probabilityIndicator");
    const symbol = document.getElementById("probSymbol");
    const text = document.getElementById("probText");


    if (!indicator || !symbol || !text) return;


    indicator.className = "probability-indicator"; // reset classes


    if (probability < 60) {
        indicator.classList.add("safe");
        symbol.textContent = "🟢";
        text.textContent = `Safe (${probability.toFixed(1)}%)`;
    } else if (probability < 70) {
        indicator.classList.add("caution");
        symbol.textContent = "🟡";
        text.textContent = `Caution (${probability.toFixed(1)}%)`;
    } else {
        indicator.classList.add("alert");
        symbol.textContent = "🔴";
        text.textContent = `Alert (${probability.toFixed(1)}%)`;
    }
}



// ====================================================================
// ✅ LOCALSTORAGE HELPERS FOR FEEDBACK REQUESTS
// ====================================================================



// Load feedback requests from localStorage
function loadStoredFeedbacks() {
    try {
        const stored = localStorage.getItem(FEEDBACKS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('[Storage] Error loading feedbacks:', error);
        return [];
    }
}



// Save feedback requests to localStorage
function saveStoredFeedbacks(feedbacks) {
    try {
        const trimmed = feedbacks.slice(0, MAX_STORED_FEEDBACKS);
        localStorage.setItem(FEEDBACKS_STORAGE_KEY, JSON.stringify(trimmed));
    } catch (error) {
        console.error('[Storage] Error saving feedbacks:', error);
    }
}



// Add new feedback to storage
function addFeedbackToStorage(feedbackData) {
    const feedbacks = loadStoredFeedbacks();
    feedbacks.unshift({
        time: feedbackData.time, // ✅ Store exact timestamp from backend
        trigger: feedbackData.trigger,
        video: feedbackData.video,
        training_count: feedbackData.training_count,
        operation_mode: feedbackData.operation_mode,
        probability: feedbackData.probability,
        timestamp: Date.now()
    });
    saveStoredFeedbacks(feedbacks);
    
    // ✅ CRITICAL: Store video filename → timestamp mapping for video viewer
    storeVideoTimestamp(feedbackData.video, feedbackData.time);
}



// Restore feedback requests from localStorage
function restoreStoredFeedbacks() {
    const feedbacks = loadStoredFeedbacks();
    
    if (feedbacks.length === 0) {
        console.log('[Storage] No stored feedbacks found');
        return;
    }
    
    console.log('[Storage] Restoring', feedbacks.length, 'feedbacks');
    feedbacks.forEach(feedback => {
        displayFeedbackRequest(feedback, false);
    });
}



// Clear all stored feedbacks
function clearAllFeedbacks() {
    if (confirm('Clear all feedback requests?')) {
        localStorage.removeItem(FEEDBACKS_STORAGE_KEY);
        
        const feedbackContainer = document.getElementById('triggerInfo');
        if (feedbackContainer) {
            feedbackContainer.innerHTML = '<h3 style="margin-bottom: 20px; color: royalblue;">Feedback Requests</h3>';
        }
        
        console.log('[Storage] All feedbacks cleared');
    }
}



// ====================================================================
// ✅ UPDATED: SENSOR LOGS MANAGEMENT (NO LOCALSTORAGE + AUTO-SCROLL)
// ====================================================================



// Initialize logs on page load
function initializeLogs() {
    const logsContainer = document.getElementById('sensorLogs');
    if (logsContainer) {
        logsContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="color: royalblue; margin: 0;">Real-Time Sensor Logs</h3>
                <button onclick="clearAllLogs()" style="padding: 6px 12px; background: crimson; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s;">Clear Logs</button>
            </div>
            <div id="sidebar" style="color: #666; padding: 10px; max-height: calc(100vh - 100px); overflow-y: auto;">No logs available. Logs will appear when events are detected.</div>
        `;
    }
}



// ✅ UPDATED: Add log entry directly to DOM with auto-scroll to bottom
function addLogEntry(logData) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) {
        console.warn('[Logs] Container #sidebar not found in HTML');
        return;
    }
    
    // Remove "No logs available" message if it exists
    if (sidebar.textContent.includes('No logs available')) {
        sidebar.innerHTML = '';
    }
    
    // Create log entry element
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    // Determine severity level and color
    const isCritical = logData.event.toLowerCase().includes('critical') || 
                       logData.event.toLowerCase().includes('trigger') ||
                       logData.event.toLowerCase().includes('alert');
    
    entry.style.cssText = `
        padding: 12px;
        margin-bottom: 8px;
        border-left: 4px solid ${isCritical ? 'crimson' : 'orange'};
        background: ${isCritical ? 'rgba(220, 20, 60, 0.08)' : 'rgba(255, 165, 0, 0.08)'};
        border-radius: 4px;
        transition: all 0.2s ease;
        cursor: default;
    `;
    
    // Add hover effect
    entry.addEventListener('mouseenter', function() {
        this.style.background = isCritical ? 'rgba(220, 20, 60, 0.15)' : 'rgba(255, 165, 0, 0.15)';
        this.style.transform = 'translateX(4px)';
    });
    entry.addEventListener('mouseleave', function() {
        this.style.background = isCritical ? 'rgba(220, 20, 60, 0.08)' : 'rgba(255, 165, 0, 0.08)';
        this.style.transform = 'translateX(0)';
    });
    
    // Format timestamp
    const timestamp = new Date(logData.time).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    
    entry.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-weight: 600; color: ${isCritical ? 'crimson' : 'orange'}; font-size: 14px;">
                ${isCritical ? '🔴' : '🟠'} ${logData.event}
            </div>
            <div style="font-size: 12px; color: #999;">
                ${timestamp}
            </div>
        </div>
    `;
    
    // ✅ Append to bottom (newest last)
    sidebar.appendChild(entry);
    
    // Keep only last MAX_DISPLAYED_LOGS entries in DOM
    const allEntries = sidebar.querySelectorAll('.log-entry');
    if (allEntries.length > MAX_DISPLAYED_LOGS) {
        allEntries[0].remove(); // Remove oldest entry from top
    }
    
    // ✅ AUTO-SCROLL TO BOTTOM (show latest log)
    sidebar.scrollTop = sidebar.scrollHeight;
    
    console.log('[Logs] ✅ New log entry added:', logData.event);
}



// ✅ Clear all logs from DOM only
function clearAllLogs() {
    if (confirm('Clear all sensor logs?')) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.innerHTML = '<div style="color: #666; padding: 10px;">No logs available. Logs will appear when events are detected.</div>';
        }
        
        console.log('[Logs] All logs cleared from display');
    }
}



// ====================================================================
// INITIALIZATION
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    initWebSocket();
    fetchUserProfile();
    
    // ✅ Restore stored feedback requests on page load
    restoreStoredFeedbacks();
    
    // ✅ Initialize logs display
    initializeLogs();
    
    // Hamburger menu toggle
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const profilePanel = document.getElementById('profilePanel');
    
    if (hamburgerMenu && profilePanel) {
        hamburgerMenu.addEventListener('click', () => {
            hamburgerMenu.classList.toggle('active');
            profilePanel.classList.toggle('open');
        });
    }
    
    // Profile edit buttons
    const changeBtn = document.getElementById('changeBtn');
    const saveBtn = document.getElementById('saveBtn');
    
    if (changeBtn) {
        changeBtn.addEventListener('click', enableEditMode);
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', saveProfileChanges);
    }
    
    // ✅ Vacation mode toggle status display
    const vacationToggle = document.getElementById('vacationModeToggle');
    const vacationStatus = document.getElementById('vacationModeStatus');
    
    if (vacationToggle && vacationStatus) {
        vacationToggle.addEventListener('change', function() {
            vacationStatus.textContent = this.checked ? 'ON' : 'OFF';
        });
    }
});



// ====================================================================
// CHART.JS INITIALIZATION
// ====================================================================
function initChart() {
    const canvas = document.getElementById('intrusionChart');
    if (!canvas) {
        console.warn('[Chart] Canvas element #intrusionChart not found in HTML');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    intrusionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Intrusion Probability (%)',
                data: [],
                borderColor: '#00ff00',
                backgroundColor: '#00ff00',
                tension: 0.3,
                pointRadius: 4,
                borderWidth: 2
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid:{color: "#00ff00"
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    },
                    ticks: {
                        maxTicksLimit: 10
                    }
                },
                y: {
                    grid:{color: "#00ff00"
                    },
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Probability (%)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    console.log('[Chart] ✅ Initialized');
}



// Update chart with new data point
function updateChart(probability, timestamp) {
    if (!intrusionChart) {
        console.warn('[Chart] Chart not initialized, skipping update');
        return;
    }
    
    const chartData = intrusionChart.data;
    const timeLabel = formatTimestamp(timestamp);
    
    chartData.labels.push(timeLabel);
    chartData.datasets[0].data.push(probability);
    
    // Keep only last MAX_DATA_POINTS
    if (chartData.labels.length > MAX_DATA_POINTS) {
        chartData.labels.shift();
        chartData.datasets[0].data.shift();
    }
    
    intrusionChart.update('quiet');
}


function updateProbabilityIndicator(probability) {
    let indicator = document.getElementById("probabilityIndicator");
    let symbol = document.getElementById("probSymbol");
    let text = document.getElementById("probText");


    // If not found, create it dynamically
    if (!indicator) {
        indicator = document.createElement("div");
        indicator.id = "probabilityIndicator";
        indicator.className = "probability-indicator safe";
        indicator.innerHTML = `<span id="probSymbol">🟢</span> <span id="probText">Safe</span>`;
        document.querySelector(".intrusion-graph").appendChild(indicator);
        symbol = document.getElementById("probSymbol");
        text = document.getElementById("probText");
    }


    indicator.className = "probability-indicator"; // reset base class


    if (probability < 60) {
        indicator.classList.add("safe");
        symbol.textContent = "🟢";
        text.textContent = `Safe (${probability.toFixed(1)}%)`;
    } else if (probability < 70) {
        indicator.classList.add("caution");
        symbol.textContent = "🟡";
        text.textContent = `Caution (${probability.toFixed(1)}%)`;
    } else {
        indicator.classList.add("alert");
        symbol.textContent = "🔴";
        text.textContent = `Alert (${probability.toFixed(1)}%)`;
    }
}


// ====================================================================
// ✅ WEBSOCKET CONNECTION - HANDLES LOG MESSAGES AND FEEDBACK REQUESTS
// ====================================================================



function initWebSocket() {
    const connect = () => {
        if (websocketInstance && (websocketInstance.readyState === WebSocket.OPEN || websocketInstance.readyState === WebSocket.CONNECTING)) {
            return;
        }
        
        try {
            console.log('[WS] Attempting to connect to:', WS_URL);
            websocketInstance = new WebSocket(WS_URL);
        } catch (error) {
            console.error('[WS] Failed to create WebSocket:', error.message);
            reconnectAttempts++;
            scheduleReconnect();
            return;
        }
        
        websocketInstance.onopen = () => {
            console.log('[WS] ✅ Connected to backend on port 9090');
            reconnectAttempts = 0;
        };
        
        // ✅ Handle all message types including logs and feedback requests
websocketInstance.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);


        console.log('[WS] Received:', message);


        // =============================
        // ✅ Handle probability updates
        // =============================
        if (message.jsonType === 'probability') {
            const probability = (message.probab * 100).toFixed(2);
            const timestamp = new Date(message.time).getTime();


            console.log('[Graph] Probability:', probability + '%');


            // Update the intrusion chart
            updateChart(parseFloat(probability), timestamp);


            // ✅ Update color indicator
            updateProbabilityIndicator(parseFloat(probability));
        }


        // =============================
        // ✅ Handle log messages
        // =============================
        else if (message.jsonType === 'log') {
            console.log('[Log] Event received:', message.event);


            const logData = {
                event: message.event,
                time: message.time
            };


            addLogEntry(logData);
        }


        // =============================
        // ✅ Handle feedback requests
        // =============================
        else if (message.jsonType === 'feedback_request') {
            console.log('[Feedback] Request received:', message.trigger);


            const feedbackData = {
                time: message.time,
                trigger: message.trigger,
                video: message.video,
                training_count: message.training_count,
                operation_mode: message.operation_mode,
                probability: message.probability
            };


            displayFeedbackRequest(feedbackData);
        }


        // =============================
        // Unknown message type
        // =============================
        else {
            console.log('[WS] Unknown message type:', message.jsonType);
        }


    } catch (e) {
        console.error('[WS] Error processing message:', e.message);
        console.error('[WS] Raw data:', event.data);
    }
};


        
        websocketInstance.onclose = () => {
            console.log('[WS] Connection closed. Reconnecting...');
            reconnectAttempts++;
            scheduleReconnect();
        };
        
        websocketInstance.onerror = (error) => {
            console.error('[WS] Socket error:', error);
        };
    };
    
    const scheduleReconnect = () => {
        let delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
        console.log(`[WS] Reconnecting in ${delay / 1000}s (Attempt ${reconnectAttempts})...`);
        setTimeout(connect, delay);
    };
    
    connect();
}



// ====================================================================
// ✅ DISPLAY FUNCTIONS - FEEDBACK REQUEST (NO FEEDBACK BUTTONS)
// ====================================================================



// Display feedback request card WITHOUT feedback buttons (view-only)
function displayFeedbackRequest(feedbackData, saveToStorage = true) {
    if (!feedbackData || !feedbackData.video) {
        console.warn('[Feedback] Invalid feedback data:', feedbackData);
        return;
    }
    
    const feedbackContainer = document.getElementById('triggerInfo');
    if (!feedbackContainer) {
        console.warn('[Feedback] Container #triggerInfo not found in HTML');
        return;
    }
    
    // Remove "Loading..." message if present
    if (feedbackContainer.textContent.includes('Loading')) {
        feedbackContainer.innerHTML = '<h3 style="margin-bottom: 20px; color: royalblue;">Feedback Requests</h3>';
    }
    
    // Parse filename from backend (e.g., "063733_291025_risk_threshold.mp4")
    const filename = feedbackData.video;
    const parts = filename.replace('.mp4', '').split('_');
    
    if (parts.length < 3) {
        console.error('[Feedback] Invalid filename format:', filename);
        console.error('[Feedback] Expected format: HHMMSS_DDMMYY_type.mp4');
        return;
    }
    
    const time = parts[0];
    const date = parts[1];
    const trigger = parts.slice(2).join('_');
    
    // Save to localStorage (only for new feedback from WebSocket)
    if (saveToStorage) {
        addFeedbackToStorage(feedbackData);
    }
    
    // Format probability percentage
    const probabilityPercent = (feedbackData.probability * 100).toFixed(1);
    
    // Format timestamp
    const formattedTime = new Date(feedbackData.time).toLocaleString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    
    // Determine mode color
    const modeColor = feedbackData.operation_mode === 'learning' ? 'orange' : 'green';
    const modeIcon = feedbackData.operation_mode === 'learning' ? '📚' : '✅';
    
    // Create feedback card (clickable to view video)
    const feedbackCard = document.createElement('div');
    feedbackCard.className = 'feedback-card';
    feedbackCard.setAttribute('data-request-id', feedbackData.time);
    feedbackCard.setAttribute('data-video-filename', filename); // Store for removal later
    feedbackCard.style.cssText = `
        padding: 20px;
        margin-bottom: 15px;
        background: rgba(65, 105, 225, 0.08);
        border-left: 4px solid royalblue;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        cursor: pointer;
        transition: all 0.3s ease;
    `;
    
    // Add hover effects
    feedbackCard.addEventListener('mouseenter', function() {
        this.style.background = 'rgba(65, 105, 225, 0.15)';
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 4px 12px rgba(65, 105, 225, 0.3)';
    });
    
    feedbackCard.addEventListener('mouseleave', function() {
        this.style.background = 'rgba(65, 105, 225, 0.08)';
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
    });
    
    // ✅ Make entire card clickable - Redirect to video viewer
   // Make entire card clickable - Redirect to video viewer
	feedbackCard.addEventListener('click', function() {
	  const videoFile = this.getAttribute('data-video-filename');
	  window.location.href = `video/video-viewer.html?video=${encodeURIComponent(videoFile)}`;
	});
 
    feedbackCard.innerHTML = `
        <div style="color: royalblue; font-weight: bold; font-size: 16px; margin-bottom: 12px;">
            🔔 FEEDBACK REQUEST
        </div>
        <div style="font-size: 14px; line-height: 1.8;">
            <div style="margin-bottom: 8px;">
                <strong>Timestamp:</strong> <span style="color: #555;">${formattedTime}</span>
            </div>
            <div style="margin-bottom: 8px;">
                <strong>Trigger Type:</strong> <span style="color: crimson; font-weight: 600;">${decodeTriggerType(feedbackData.trigger)}</span>
            </div>
            <div style="margin-bottom: 8px;">
                <strong>Probability:</strong> <span style="background: rgba(220, 20, 60, 0.15); padding: 2px 8px; border-radius: 4px; font-weight: 600; color: crimson;">${probabilityPercent}%</span>
            </div>
            <div style="margin-bottom: 8px;">
                <strong>Operation Mode:</strong> <span style="color: ${modeColor}; font-weight: 600;">${modeIcon} ${feedbackData.operation_mode.toUpperCase()}</span>
            </div>
            <div style="margin-bottom: 8px;">
                <strong>Training Count:</strong> <span style="color: #555;">${feedbackData.training_count}</span>
            </div>
            <div style="margin-bottom: 8px;">
                <strong>Video File:</strong> <span style="font-style: italic; color: #666; font-size: 12px;">${filename}</span>
            </div>
        </div>
        
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(65, 105, 225, 0.2); font-size: 12px; color: #666; font-style: italic; text-align: center;">
            💡 Click to view video and provide feedback
        </div>
        
        <div style="margin-top: 8px; font-size: 11px; color: #999; font-style: italic; text-align: center;">
            Request ID: ${feedbackData.time}
        </div>
    `;
    
    // Add to top of container (newest first)
    const header = feedbackContainer.querySelector('h3');
    if (header && header.nextSibling) {
        feedbackContainer.insertBefore(feedbackCard, header.nextSibling);
    } else {
        feedbackContainer.appendChild(feedbackCard);
    }
    
    // Keep only last MAX_STORED_FEEDBACKS entries in DOM
    const cards = feedbackContainer.querySelectorAll('.feedback-card');
    if (cards.length > MAX_STORED_FEEDBACKS) {
        cards[cards.length - 1].remove();
    }
    
    // Auto-scroll to top (newest feedback)
    feedbackContainer.scrollTop = 0;
    
    console.log('[Feedback] ✅ Card created:', decodeTriggerType(feedbackData.trigger), '-', probabilityPercent + '%');
}



// ====================================================================
// TIME DECODING FUNCTIONS
// ====================================================================



function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
}



function decodeTime(hhmmss) {
    if (!hhmmss || hhmmss.length !== 6) {
        return 'Invalid Time';
    }
    
    const hours = parseInt(hhmmss.substring(0, 2));
    const minutes = hhmmss.substring(2, 4);
    const seconds = hhmmss.substring(4, 6);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes}:${seconds} ${period}`;
}



function decodeDate(ddmmyy) {
    if (!ddmmyy || ddmmyy.length !== 6) {
        return 'Invalid Date';
    }
    
    const day = ddmmyy.substring(0, 2);
    const month = ddmmyy.substring(2, 4);
    const year = '20' + ddmmyy.substring(4, 6);
    
    return `${day}/${month}/${year}`;
}



function decodeTriggerType(trigger) {
    const triggerMap = {
        'motion': 'Immediate Motion',
        'door': 'Door Sensor',
        'risk_threshold': 'Risk Threshold Alert',
        'high_probability': 'High Probability Alert'
    };
    
    return triggerMap[trigger] || trigger.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}



// ====================================================================
// USER PROFILE API
// ====================================================================



async function fetchUserProfile() {
    try {
        const response = await fetch(USER_DATA_API);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log('[Profile] No profile found (404)');
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[Profile] ✅ Loaded');
        
        if (result.data) {
            populateProfileData(result.data);
        } else {
            populateProfileData(result);
        }
        
    } catch (error) {
        console.error('[Profile] Error fetching:', error);
    }
}



async function saveProfileChanges() {
    const saveBtn = document.getElementById('saveBtn');
    if (!saveBtn) return;
    
    const originalText = saveBtn.textContent;
    
    try {
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;
        
        const profileData = {
            name: document.getElementById('editName').value,
            email: document.getElementById('editEmail').value,
            phone: document.getElementById('editPhone').value,
            vacationMode: document.getElementById('vacationModeToggle').checked,
            sleepSchedule: {
                weekdays: {
                    start: document.getElementById('editWeekdaysStart').value,
                    end: document.getElementById('editWeekdaysEnd').value
                },
                weekends: {
                    start: document.getElementById('editWeekendsStart').value,
                    end: document.getElementById('editWeekendsEnd').value
                }
            },
            thresholdLevels: {
                high: parseInt(document.getElementById('editHighValue').value),
                mid: parseInt(document.getElementById('editMediumValue').value),
                low: parseInt(document.getElementById('editLowValue').value)
            }
        };
        
        if (!profileData.name || !profileData.email || !profileData.phone) {
            alert('❌ Name, Email, and Phone are required!');
            return;
        }
        
        const response = await fetch(USER_DATA_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('[Profile] ✅ Saved successfully');
            populateProfileData(profileData);
            
            document.querySelectorAll('.edit-input').forEach(el => el.style.display = 'none');
            document.getElementById('editWeekdaysSleep').style.display = 'none';
            document.getElementById('editWeekendsSleep').style.display = 'none';
            document.getElementById('editThresholdValues').style.display = 'none';
            
            document.querySelectorAll('.display-value').forEach(el => el.style.display = 'block');
            document.querySelectorAll('.threshold-display').forEach(el => el.style.display = 'flex');
            
            document.getElementById('changeBtn').style.display = 'inline-block';
            document.getElementById('saveBtn').style.display = 'none';
            
            alert('✅ Profile saved successfully!');
        } else {
            console.error('[Profile] ❌ Save failed:', result);
            alert('❌ ' + (result.error || 'Failed to save profile'));
        }
        
    } catch (error) {
        console.error('[Profile] ❌ Network error:', error);
        alert('❌ Network error: Make sure backend is running on port 9090');
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}



function populateProfileData(data) {
    const setContent = (id, value, fallback) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || fallback;
    };
    
    setContent('displayName', data.name, 'User Name');
    setContent('displayEmail', data.email, 'user@email.com');
    setContent('displayPhone', data.phone, '1234567890');
    
    if (data.sleepSchedule) {
        setContent('displayWeekdaysStart', data.sleepSchedule.weekdays.start, '10:00 PM');
        setContent('displayWeekdaysEnd', data.sleepSchedule.weekdays.end, '06:00 AM');
        setContent('displayWeekendsStart', data.sleepSchedule.weekends.start, '11:00 PM');
        setContent('displayWeekendsEnd', data.sleepSchedule.weekends.end, '08:00 AM');
    }
    
    if (data.thresholdLevels) {
        setContent('displayHighValue', data.thresholdLevels.high, 80);
        setContent('displayMediumValue', data.thresholdLevels.mid, 60);
        setContent('displayLowValue', data.thresholdLevels.low, 50);
    }
    
    const vacationToggle = document.getElementById('vacationModeToggle');
    const vacationStatus = document.getElementById('vacationModeStatus');
    if (vacationToggle && data.vacationMode !== undefined) {
        vacationToggle.checked = data.vacationMode;
        if (vacationStatus) {
            vacationStatus.textContent = data.vacationMode ? 'ON' : 'OFF';
        }
    }
}



function enableEditMode() {
    document.querySelectorAll('.display-value').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.threshold-display').forEach(el => el.style.display = 'none');
    
    const getValue = (id) => document.getElementById(id)?.textContent || '';
    
    document.getElementById('editName').value = getValue('displayName');
    document.getElementById('editEmail').value = getValue('displayEmail');
    document.getElementById('editPhone').value = getValue('displayPhone');
    
    document.getElementById('editWeekdaysStart').value = getValue('displayWeekdaysStart');
    document.getElementById('editWeekdaysEnd').value = getValue('displayWeekdaysEnd');
    document.getElementById('editWeekendsStart').value = getValue('displayWeekendsStart');
    document.getElementById('editWeekendsEnd').value = getValue('displayWeekendsEnd');
    
    document.getElementById('editHighValue').value = getValue('displayHighValue');
    document.getElementById('editMediumValue').value = getValue('displayMediumValue');
    document.getElementById('editLowValue').value = getValue('displayLowValue');
    
    document.querySelectorAll('.edit-input').forEach(el => el.style.display = 'block');
    document.getElementById('editWeekdaysSleep').style.display = 'flex';
    document.getElementById('editWeekendsSleep').style.display = 'flex';
    document.getElementById('editThresholdValues').style.display = 'block';
    
    document.getElementById('changeBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display = 'inline-block';
}



// ====================================================================
// ✅ DETECT PAGE VISIBILITY AND REFRESH FEEDBACK CARDS
// ====================================================================


// Refresh feedback display when returning to the page
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        console.log('[Page] Page became visible - refreshing feedback cards');
        refreshFeedbackDisplay();
    }
});


// Also refresh when page gains focus
window.addEventListener('focus', function() {
    console.log('[Page] Page gained focus - refreshing feedback cards');
    refreshFeedbackDisplay();
});



// ✅ NEW FUNCTION: Refresh feedback display from localStorage
function refreshFeedbackDisplay() {
    const feedbackContainer = document.getElementById('triggerInfo');
    if (!feedbackContainer) {
        console.warn('[Refresh] Container #triggerInfo not found');
        return;
    }
    
    // Clear current display
    feedbackContainer.innerHTML = '<h3 style="margin-bottom: 20px; color: royalblue;">Feedback Requests</h3>';
    
    // Reload from localStorage
    const feedbacks = loadStoredFeedbacks();
    
    if (feedbacks.length === 0) {
        console.log('[Refresh] No feedback requests to display');
        return;
    }
    
    console.log('[Refresh] Displaying', feedbacks.length, 'feedback requests');
    
    // Display each feedback (don't save to storage again)
    feedbacks.forEach(feedback => {
        displayFeedbackRequest(feedback, false);
    });
}
