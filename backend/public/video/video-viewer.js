const BASE_URL = `${location.hostname}${location.port ? `:${location.port}` : ''}`;
console.log(BASE_URL);
const WS_URL = `ws://${BASE_URL}/ws`;
const VIDEO_TIMESTAMP_MAP_KEY = 'chakravyuha_video_timestamps';
const FEEDBACKS_STORAGE_KEY = 'chakravyuha_feedbacks';

let websocketInstance = null;
let currentRequestId = null;
let currentVideoFilename = null;

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const videoFile = urlParams.get('video');
    console.log('Video Viewer - Received video:', videoFile);

    if (videoFile) {
        currentVideoFilename = videoFile;
        currentRequestId = getOriginalTimestamp(videoFile);
        
        if (currentRequestId) {
            console.log('[Feedback] Original timestamp found:', currentRequestId);
        } else {
            console.warn('[Feedback] No original timestamp found for:', videoFile);
            console.warn('[Feedback] Feedback submission may not work correctly');
        }
        
        displayVideoInfo(videoFile);
        loadVideo(videoFile);
    } else {
        alert('⚠️ Missing video parameter');
        console.error('Missing video parameter');
    }
    
    initWebSocket();
    injectVideoStyles();
});

function injectVideoStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #videoPlayer {
            width: 100%;
            height: auto;
            max-width: 100%;
            max-height: 80vh;
            object-fit: contain;
            background: #000;
            display: block;
            margin: 0 auto;
        }
        
        .video-container {
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
            position: relative;
        }
        
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

function getOriginalTimestamp(videoFilename) {
    try {
        const map = JSON.parse(localStorage.getItem(VIDEO_TIMESTAMP_MAP_KEY) || '{}');
        const timestamp = map[videoFilename];
        
        if (timestamp) {
            console.log('[Storage] Retrieved timestamp for', videoFilename, '→', timestamp);
            return timestamp;
        } else {
            console.warn('[Storage] No timestamp mapping found for', videoFilename);
            console.warn('[Storage] Available mappings:', Object.keys(map));
            return null;
        }
    } catch (error) {
        console.error('[Storage] Error retrieving timestamp:', error);
        return null;
    }
}

function removeFeedbackFromStorage(requestId, videoFilename) {
    try {
        const feedbacks = JSON.parse(localStorage.getItem(FEEDBACKS_STORAGE_KEY) || '[]');
        const updatedFeedbacks = feedbacks.filter(f => f.time !== requestId);
        localStorage.setItem(FEEDBACKS_STORAGE_KEY, JSON.stringify(updatedFeedbacks));
        
        const map = JSON.parse(localStorage.getItem(VIDEO_TIMESTAMP_MAP_KEY) || '{}');
        delete map[videoFilename];
        localStorage.setItem(VIDEO_TIMESTAMP_MAP_KEY, JSON.stringify(map));
        
        console.log('[Storage] Removed feedback for:', requestId);
        console.log('[Storage] Removed timestamp mapping for:', videoFilename);
    } catch (error) {
        console.error('[Storage] Error removing feedback:', error);
    }
}

function initWebSocket() {
    try {
        console.log('[WS] Connecting to:', WS_URL);
        websocketInstance = new WebSocket(WS_URL);
        
        websocketInstance.onopen = () => {
            console.log('[WS] Connected for feedback submission');
        };
        
        websocketInstance.onclose = () => {
            console.log('[WS] Connection closed');
        };
        
        websocketInstance.onerror = (error) => {
            console.error('[WS] Connection error:', error);
        };
    } catch (error) {
        console.error('[WS] Failed to initialize WebSocket:', error);
    }
}

function handleFeedback(response) {
    const yesBtn = document.getElementById('intrusionYesBtn');
    const noBtn = document.getElementById('intrusionNoBtn');
    const label = response === 'yes' ? 1 : 0;
    
    if (response === 'yes') {
        yesBtn.classList.add('selected');
        yesBtn.disabled = true;
        noBtn.disabled = true;
        noBtn.style.opacity = '0.3';
        console.log('[Feedback] User confirmed: INTRUSION');
    } else if (response === 'no') {
        noBtn.classList.add('selected');
        noBtn.disabled = true;
        yesBtn.disabled = true;
        yesBtn.style.opacity = '0.3';
        console.log('[Feedback] User confirmed: NOT AN INTRUSION');
    }
    
    sendFeedbackViaWebSocket(label);
}

function sendFeedbackViaWebSocket(label) {
    if (!websocketInstance || websocketInstance.readyState !== WebSocket.OPEN) {
        console.error('[Feedback] WebSocket not connected');
        showFeedbackMessage('Failed to send feedback: No connection', false);
        return;
    }
    
    if (!currentRequestId) {
        console.error('[Feedback] No original timestamp available');
        showFeedbackMessage('Failed to send feedback: No timestamp found', false);
        alert('⚠️ Cannot send feedback: Original timestamp not found.\n\nThis may happen if:\n1. You opened this video directly without clicking from dashboard\n2. localStorage was cleared\n\nPlease return to dashboard and click the feedback card again.');
        return;
    }
    
    const feedbackMessage = {
        jsonType: "feedback_response",
        label: label,
        requestId: currentRequestId
    };
    
    try {
        websocketInstance.send(JSON.stringify(feedbackMessage));
        console.log('[Feedback] Sent:', feedbackMessage);
        console.log('[Feedback] RequestID (exact timestamp):', currentRequestId);
        console.log('[Feedback] Label:', label === 1 ? 'TRUE ALERT' : 'FALSE ALERT');
        
        removeFeedbackFromStorage(currentRequestId, currentVideoFilename);
        
        showFeedbackMessage(
            label === 1 ? 'Intrusion confirmed ✓ Feedback sent' : 'Not an intrusion confirmed ✓ Feedback sent',
            true
        );
    } catch (error) {
        console.error('[Feedback] Error sending:', error);
        showFeedbackMessage('Failed to send feedback', false);
    }
}

function showFeedbackMessage(message, success) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${success ? '#28a745' : '#dc143c'};
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        font-weight: 600;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = `✓ ${message}`;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

async function loadVideo(videoFilename) {
    const videoSource = document.getElementById('videoSource');
    const videoPlayer = document.getElementById('videoPlayer');
    
    try {
        console.log(`[Video] Checking if ${videoFilename} exists...`);
        const infoResponse = await fetch(`http://${BASE_URL}/api/videos/${videoFilename}/info`);
        
        if (!infoResponse.ok) {
            throw new Error(`Video not found: ${videoFilename}`);
        }
        
        const videoInfo = await infoResponse.json();
        console.log('[Video] Video info retrieved:', videoInfo);
        
        videoSource.src = `http://${BASE_URL}/api/videos/${videoFilename}`;
        videoPlayer.load();
        console.log(`[Video] Loading from: http://${BASE_URL}/api/videos/${videoFilename}`);
        
        videoPlayer.addEventListener('loadeddata', function() {
            console.log('Video loaded successfully');
            console.log(`  Duration: ${videoPlayer.duration.toFixed(2)}s`);
            console.log(`  Size: ${formatFileSize(videoInfo.size)}`);
            videoPlayer.play().catch(e => console.log('[Video] Autoplay blocked:', e));
        }, { once: true });
        
        videoPlayer.addEventListener('error', function(e) {
            console.error('Video loading error:', e);
            showError(`Failed to load video: ${videoFilename}`);
        });
    } catch (error) {
        console.error('[Video] Error loading video:', error);
        showError(error.message);
    }
}

function displayVideoInfo(videoFilename) {
    const parts = videoFilename.replace('.mp4', '').split('_');
    
    if (parts.length >= 3) {
        const timeStr = parts[0];
        const dateStr = parts[1];
        const trigger = parts.slice(2).join('_');
        
        document.getElementById('dateDisplay').textContent = decodeDate(dateStr);
        document.getElementById('timeDisplay').textContent = decodeTime(timeStr);
        document.getElementById('triggerDisplay').textContent = decodeTriggerType(trigger);
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        color: #dc143c;
        background: #ffe6e6;
        padding: 20px;
        border-radius: 8px;
        margin: 20px;
        text-align: center;
        font-weight: 600;
    `;
    errorDiv.innerHTML = `⚠️ ${message}`;
    
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.parentElement.appendChild(errorDiv);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function goBack() {
    if (websocketInstance) {
        websocketInstance.close();
    }
    window.history.back();
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
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[parseInt(month) - 1];
    
    return `${day} ${monthName} ${year}`;
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

document.addEventListener('keydown', function(event) {
    const videoPlayer = document.getElementById('videoPlayer');
    
    switch(event.key) {
        case 'Escape':
            goBack();
            break;
        case ' ':
            event.preventDefault();
            if (videoPlayer.paused) {
                videoPlayer.play();
            } else {
                videoPlayer.pause();
            }
            break;
        case 'ArrowLeft':
            videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5);
            break;
        case 'ArrowRight':
            videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 5);
            break;
        case 'f':
        case 'F':
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                videoPlayer.requestFullscreen();
            }
            break;
        case 'm':
        case 'M':
            videoPlayer.muted = !videoPlayer.muted;
            break;
        case '1':
            handleFeedback('yes');
            break;
        case '0':
            handleFeedback('no');
            break;
    }
});

const videoPlayer = document.getElementById('videoPlayer');
if (videoPlayer) {
    videoPlayer.addEventListener('play', () => {
        console.log('[Video] Playback started');
    });
    
    videoPlayer.addEventListener('pause', () => {
        console.log('[Video] Playback paused');
    });
    
    videoPlayer.addEventListener('ended', () => {
        console.log('[Video] Playback completed');
    });
}

