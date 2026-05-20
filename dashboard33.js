// dashboard.js
let mainMap, hotspotMap, modalMap;
let allMarkersGroup, highRiskGroup, verifiedGroup;
let heatmapLayer;
let reports = [];
let originalReports = [];
let governmentAlerts = [];
let currentFilter = 'all';
let searchTerm = '';
let currentPage = 1;
let pageSize = 10;
let hazardPieChart, comparisonBarChart, trendLineChart;
let currentTab = 'dashboard';
let reportChannel, alertChannel;

// Supabase configuration
const SUPABASE_URL = 'https://mnejfugdushmrwzocxlx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZWpmdWdkdXNobXJ3em9jeGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5Mjg1ODMsImV4cCI6MjA3MzUwNDU4M30.XsAaOz53omvyBB9yPBLuTjmSYBrY4GBinqKbYPrup8w';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cache for reverse geocoding
const geocodeCache = new Map();

// Cache for relays
const relays = new Map();

// Generate unique relay name
function getUniqueRelayName(baseName) {
    let name = baseName;
    let counter = 1;
    while (relays.has(name)) {
        name = `${baseName}_${counter++}`;
    }
    relays.set(name, true);
    return name;
}

// Remove all subscriptions with error handling
function unsubscribeAll() {
    try {
        if (reportChannel) {
            supabaseClient.removeChannel(reportChannel);
            reportChannel = null;
        }
        if (alertChannel) {
            supabaseClient.removeChannel(alertChannel);
            alertChannel = null;
        }
        relays.clear();
    } catch (error) {
        console.error('Error unsubscribing channels:', error);
    }
}

// Reverse geocoding with Nominatim
async function reverseGeocode(lat, lng) {
    const cacheKey = `${lat},${lng}`;
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey);
    }
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await response.json();
        const address = data.display_name || 'Unknown Location';
        geocodeCache.set(cacheKey, address);
        return address;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return 'Unknown Location';
    }
}

// Monitor auth state changes
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
        localStorage.removeItem('samudra_suraksha_user');
        window.location.href = 'auth.html';
    }
});

// Check authentication status
async function checkDashboardAuth() {
    try {
        if (window.location.search.includes('mock=true')) {
            console.log('checkDashboardAuth: Mock mode active. Bypassing auth.');
            const mockUser = {
                id: '00000000-0000-0000-0000-000000000000',
                email: 'officer.kumar@gov.in',
                role: 'gov_portal',
                state: 'KERALA',
                department_name: 'Coastal Disaster Management'
            };
            localStorage.setItem('samudra_suraksha_user', JSON.stringify(mockUser));
            return mockUser;
        }

        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !session) {
            alert('Please log in to access the dashboard.');
            window.location.href = 'auth.html';
            return null;
        }

        let user = session.user;
        const userData = localStorage.getItem('samudra_suraksha_user');
        if (userData) {
            try {
                const parsedData = JSON.parse(userData);
                user = { ...user, ...parsedData };
            } catch (e) {
                console.error('Error parsing user data:', e);
            }
        }

        if (!user.role || user.role !== 'gov_portal') {
            alert('Unauthorized access. Government portal role required.');
            window.location.href = 'auth.html';
            return null;
        }

        // Don't set hardcoded values here - let fetchUserMetadata handle it
        return user;
    } catch (error) {
        console.error('Authentication error:', error);
        alert('Authentication error. Please log in again.');
        window.location.href = 'auth.html';
        return null;
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async function() {
    const user = await checkDashboardAuth();
    if (!user) return;

    try {
        setupEventListeners();
        initCharts();
        await waitForMapContainer('map', initializeMaps);
        await Promise.all([
            fetchUserMetadata(),
            fetchReports(),
            fetchAlerts()
        ]);
        document.getElementById('dashboardLoading').style.display = 'none';
        updateCurrentTime();
        setInterval(updateCurrentTime, 1000);
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        alert('Failed to initialize dashboard: ' + error.message);
        document.getElementById('dashboardLoading').style.display = 'none';
    }
});

// Update current time dynamically
function updateCurrentTime() {
    const currentTimeEl = document.getElementById('currentTime');
    if (currentTimeEl) {
        const now = new Date();
        currentTimeEl.textContent = now.toLocaleString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        }) + ', ' + now.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }
}

// Format timestamp from created_at
function formatTimestamp(createdAt) {
    try {
        const date = new Date(createdAt);
        if (isNaN(date.getTime())) {
            console.warn('Invalid created_at timestamp:', createdAt);
            return 'Unknown Time';
        }
        return date.toLocaleString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        });
    } catch (error) {
        console.error('Error formatting timestamp:', error, createdAt);
        return 'Unknown Time';
    }
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    const tabElement = document.getElementById(tabName + '-tab');
    if (tabElement) {
        tabElement.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('href') === `#${tabName}` || item.dataset.tab === tabName) {
            item.classList.add('active');
        }
    });

    const titles = {
        dashboard: { title: 'Regional Dashboard', subtitle: 'Monitor coastal hazards and safety reports' },
        reports: { title: 'Reports Management', subtitle: 'Manage and verify hazard reports' },
        hotspots: { title: 'Hotspots & Trends', subtitle: 'Analyze hazard patterns and trends' },
        alerts: { title: 'Alert Management', subtitle: 'Create and manage safety alerts' },
        social: { title: 'Social Media Monitoring', subtitle: 'Monitor social media for hazard reports' },
        coastalinfo: { title: 'Coastal Threat Information', subtitle: 'Monitor flood and coastal alerts' },
        settings: { title: 'Settings', subtitle: 'Configure your dashboard preferences' }
    };

    // Get user data from localStorage to set proper title
    const userData = localStorage.getItem('samudra_suraksha_user');
    let userState = 'Regional';
    if (userData) {
        try {
            const parsedData = JSON.parse(userData);
            userState = parsedData.state || 'Regional';
        } catch (e) {
            console.error('Error parsing user data for title:', e);
        }
    }

    // Set title with user's state if it's dashboard tab
    if (tabName === 'dashboard') {
        document.getElementById('pageTitle').textContent = `${userState} Dashboard`;
    } else {
        document.getElementById('pageTitle').textContent = titles[tabName]?.title || 'Dashboard';
    }
    document.getElementById('pageSubtitle').textContent = titles[tabName]?.subtitle || '';

    currentTab = tabName;

    if (tabName === 'hotspots') {
        waitForMapContainer('hotspot-map', initializeHotspotMap);
        updateCharts();
    } else if (tabName === 'alerts') {
        fetchAlerts();
    } else if (tabName === 'reports') {
        populateReportsTable();
    } else if (tabName === 'coastalinfo') {
        waitForMapContainer('coastal-map-container', initializeCoastalMap);
        setupCoastalEventListeners();
    } else if (tabName === 'social') {
        // Auto-trigger search when social tab opens for the first time
        setTimeout(() => {
            const btn = document.getElementById('twitter-search-btn');
            const container = document.getElementById('tweets-container');
            // Only auto-search if no results yet
            if (btn && container && container.children.length === 0) {
                console.log('Auto-triggering social media search on tab open');
                btn.click();
            }
        }, 400);
    }

    setTimeout(() => {
        if (mainMap) mainMap.invalidateSize();
        if (hotspotMap) hotspotMap.invalidateSize();
        if (modalMap) modalMap.invalidateSize();
        if (coastalMap) coastalMap.invalidateSize();
    }, 100);
}

function waitForMapContainer(containerId, callback) {
    return new Promise(resolve => {
        const container = document.getElementById(containerId);
        if (container && container.offsetWidth > 0 && container.offsetHeight > 0) {
            callback();
            resolve();
            return;
        }
        const observer = new ResizeObserver(entries => {
            if (entries[0].contentRect.width > 0 && entries[0].contentRect.height > 0) {
                callback();
                observer.disconnect();
                resolve();
            }
        });
        observer.observe(container);
    });
}

async function fetchUserMetadata() {
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) {
            console.error('Error getting user:', userError);
            return;
        }

        console.log('Fetching metadata for user ID:', user.id);

        // Fetch user metadata from the users_metadata table
        const { data, error } = await supabaseClient
            .from('users_metadata')
            .select('department_name, state, role')
            .eq('id', user.id)
            .maybeSingle();

        if (error) {
            console.error('Error fetching user metadata:', error);
            // If error or no metadata found, use user email as fallback
            document.getElementById('officer-name').textContent = user.email || 'Government Officer';
            document.getElementById('region-display').textContent = 'INCOIS';
            document.getElementById('pageTitle').textContent = 'Regional Dashboard';
            return;
        }

        console.log('User metadata retrieved:', data);

        // If metadata is found, use it to update the UI
        if (data) {
            const officerName = data.department_name || user.email || 'Government Officer';
            const regionDisplay = data.state || 'INCOIS';
            const dashboardTitle = `${data.state || 'Regional'} Dashboard`;

            document.getElementById('officer-name').textContent = officerName;
            document.getElementById('region-display').textContent = regionDisplay;

            // Also populate the Settings profile form
            const pName = document.getElementById('profileName');
            const pEmail = document.getElementById('profileEmail');
            const pDept = document.getElementById('profileDepartment');
            const pRegion = document.getElementById('profileRegion');
            if (pName) pName.value = data.department_name || '';
            if (pEmail) pEmail.value = user.email || '';
            if (pDept) pDept.value = data.department_name || '';
            if (pRegion) {
                const stateVal = data.state || '';
                Array.from(pRegion.options).forEach(opt => {
                    if (opt.value === stateVal || opt.text === stateVal) opt.selected = true;
                });
            }

            // Only update page title if we're on dashboard tab
            if (currentTab === 'dashboard') {
                document.getElementById('pageTitle').textContent = dashboardTitle;
            }

            // Store the complete user data in localStorage for future use
            localStorage.setItem('samudra_suraksha_user', JSON.stringify({ ...user, ...data }));
            
            console.log('UI updated with:', { officerName, regionDisplay, dashboardTitle });
        } else {
            // No metadata found, use user email and defaults
            console.log('No metadata found for user, using defaults');
            document.getElementById('officer-name').textContent = user.email || 'Government Officer';
            document.getElementById('region-display').textContent = 'INCOIS';
            if (currentTab === 'dashboard') {
                document.getElementById('pageTitle').textContent = 'Regional Dashboard';
            }
        }
    } catch (error) {
        console.error('Failed to load user metadata:', error);
        // Fallback to user email if available
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                document.getElementById('officer-name').textContent = user.email || 'Government Officer';
                document.getElementById('region-display').textContent = 'INCOIS';
                if (currentTab === 'dashboard') {
                    document.getElementById('pageTitle').textContent = 'Regional Dashboard';
                }
            }
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
        }
    }
}

function getImagePublicUrl(imagePath) {
    if (!imagePath) return null;

    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath.replace(/([^:]\/)\/+/g, '$1');
    }

    let cleanPath = imagePath
        .replace(/^\/+/, '')
        .replace(/^public\/report_images\//, '')
        .replace(/^report_images\//, '');

    return `${SUPABASE_URL}/storage/v1/object/public/report_images/${cleanPath}`;
}

const imageCache = new Map();

function handleReportImages(report, mediaContent, mediaBadges) {
    mediaContent.innerHTML = '';
    mediaBadges.innerHTML = '';
    const fallbackImage = 'https://via.placeholder.com/300x200?text=Image+Not+Available';

    if (report.image_url) {
        const imageUrls = Array.isArray(report.image_url) ? report.image_url : [report.image_url];

        imageUrls.forEach((imagePath, index) => {
            if (!imagePath) return;

            const publicUrl = getImagePublicUrl(imagePath) || fallbackImage;
            const imgContainer = document.createElement('div');
            imgContainer.className = 'media-item mb-3 relative w-full aspect-w-4 aspect-h-3';

            const img = document.createElement('img');
            img.src = publicUrl;
            img.className = 'w-full h-full rounded-lg shadow-sm object-contain';
            img.alt = `Report image ${index + 1}`;

            img.onerror = () => {
                img.src = fallbackImage;
                img.className += ' opacity-50';
                imgContainer.insertAdjacentHTML('beforeend', '<p class="text-center text-amber-600 text-xs mt-2"><i class="fas fa-exclamation-triangle mr-1"></i>Failed to load image</p>');
            };

            img.onload = () => {
                img.className += ' loaded';
                imageCache.set(publicUrl, img.cloneNode(true));
            };

            img.onclick = () => {
                const enlargeModal = document.createElement('div');
                enlargeModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
                enlargeModal.innerHTML = `
                    <div class="bg-white p-4 rounded-lg max-w-4xl max-h-full overflow-auto">
                        <div class="flex justify-between items-center mb-4">
                            <h5 class="text-xl font-bold">Report Image ${index + 1}</h5>
                            <button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-gray-500 hover:text-gray-700">&times;</button>
                        </div>
                        <img src="${publicUrl}" class="w-full max-h-[80vh] object-contain" alt="Enlarged report image">
                        <div class="mt-4">
                            <a href="${publicUrl}" target="_blank" class="inline-block px-4 py-2 bg-gov-accent text-white rounded-lg hover:bg-emerald-600">
                                <i class="fas fa-external-link-alt mr-2"></i>Open in New Tab
                            </a>
                        </div>
                    </div>
                `;
                document.body.appendChild(enlargeModal);
            };

            imgContainer.appendChild(img);
            mediaContent.appendChild(imgContainer);
            mediaBadges.innerHTML += `<span class="inline-block bg-gov-accent text-white px-2 py-1 rounded text-xs mr-1 mb-1">Image ${index + 1}</span>`;
        });
    } else {
        mediaContent.innerHTML = '<p class="text-gray-500 text-center"><i class="fas fa-image mr-2"></i>No media attached.</p>';
    }
}

async function fetchReports() {
    try {
        unsubscribeAll();
        const { data, error } = await supabaseClient
            .from('user_reports')
            .select('*')
            .order('created_at', { ascending: false })
            .range(0, 199); // ✅ Server-side pagination: fetch latest 200 reports

        if (error) {
            console.error('Error fetching reports:', error);
            alert('Failed to load reports: ' + error.message);
            return;
        }

        originalReports = await Promise.all(data.map(async report => {
            if (!report.address && report.latitude && report.longitude) {
                const lat = parseFloat(report.latitude);
                const lng = parseFloat(report.longitude);
                if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    const address = await reverseGeocode(lat, lng);
                    return { ...report, address };
                }
            }
            return report;
        }));
        reports = originalReports.filter(r => r.latitude && r.longitude && !isNaN(parseFloat(r.latitude)) && !isNaN(parseFloat(r.longitude)));

        updateRecentReportsTable();
        populateReportsTable();
        updateSummaryCards();
        updateCharts();
        if (!mainMap) {
            await waitForMapContainer('map', initializeMaps);
        }
        addMarkersToMap(reports);
        if (mainMap) {
            const center = calculateMapCenter(reports);
            mainMap.setView(center, 10);
            mainMap.invalidateSize();
        }
        updateHeatmap();

        const reportChannelName = getUniqueRelayName('reports_' + Date.now());
        reportChannel = supabaseClient
            .channel(reportChannelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_reports' }, async (payload) => {
                console.log('Reports channel update:', payload);
                await fetchReports();
            })
            .subscribe((status, err) => {
                console.log('Reports channel status:', status, reportChannelName);
                if (err) {
                    console.error('Reports channel subscription error:', err);
                }
            });
    } catch (error) {
        console.error('Unexpected error fetching reports:', error);
        alert('An unexpected error occurred while loading reports: ' + error.message);
    }
}

async function fetchAlerts() {
    try {
        unsubscribeAll();
        const { data, error } = await supabaseClient
            .from('gov_alerts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching alerts:', error);
            alert('Failed to load alerts: ' + error.message);
            return;
        }

        governmentAlerts = data || [];
        populateAlertsTable();
        updateSummaryCards();
        const badge = document.getElementById('alerts-badge');
        if (badge) badge.textContent = governmentAlerts.filter(a => new Date(a.expires_at) > new Date()).length;

        const alertChannelName = getUniqueRelayName('alerts_' + Date.now());
        alertChannel = supabaseClient
            .channel(alertChannelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'gov_alerts' }, async (payload) => {
                console.log('Alerts channel update:', payload);
                await fetchAlerts();
            })
            .subscribe((status, err) => {
                console.log('Alerts channel status:', status, alertChannelName);
                if (err) {
                    console.error('Alerts channel subscription error:', err);
                }
            });
    } catch (error) {
        console.error('Error fetching alerts:', error);
        alert('Failed to load alerts: ' + error.message);
    }
}

function populateAlertsTable() {
    const tbody = document.getElementById('alertsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    governmentAlerts.forEach(alertItem => {
        const row = document.createElement('tr');
        const severityClass = alertItem.severity === 'emergency' ? 'severity-emergency' : 'severity-minor';
        const statusClass = alertItem.sent_via_fcm ? 'badge-verified' : 'badge-pending';
        const statusText = alertItem.sent_via_fcm ? 'Sent' : 'Pending';
        row.innerHTML = `
            <td class="py-4 px-4 font-medium text-gov-primary">${alertItem.id.substring(0, 8)}...</td>
            <td class="py-4 px-4">${alertItem.title}</td>
            <td class="py-4 px-4"><span class="px-3 py-1 ${severityClass} rounded-full text-xs font-medium">${alertItem.severity.toUpperCase()}</span></td>
            <td class="py-4 px-4">${alertItem.target_region || 'All Regions'}</td>
            <td class="py-4 px-4 text-gray-600">${formatTimestamp(alertItem.created_at)}</td>
            <td class="py-4 px-4"><span class="px-3 py-1 ${statusClass} rounded-full text-xs font-medium">${statusText}</span></td>
            <td class="py-4 px-4">
                <div class="flex space-x-2">
                    <button onclick="viewAlert('${alertItem.id}')" class="action-button view"><i class="fas fa-eye mr-1"></i></button>
                    <button onclick="deleteAlert('${alertItem.id}')" class="action-button reject"><i class="fas fa-trash mr-1"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function createNewAlert() {
    const titleEl = document.getElementById('alertTitle');
    const descriptionEl = document.getElementById('alertDescription');
    const severityEl = document.getElementById('alertSeverity');
    const regionEl = document.getElementById('alertRegion');
    const sendFCMEl = document.getElementById('sendFCM');

    if (!titleEl || !descriptionEl || !severityEl || !sendFCMEl) {
        alert('Form elements not found. Please refresh the page and try again.');
        return;
    }

    const title = titleEl.value.trim();
    const description = descriptionEl.value.trim();
    const severity = severityEl.value;
    const region = regionEl ? regionEl.value.trim() : null;
    const sendFCM = sendFCMEl.checked;

    if (!title || !description || !severity) {
        alert('Please fill all required fields.');
        return;
    }

    const priorityMapping = {
        'emergency': 'high',
        'high': 'high',
        'medium': 'medium',
        'low': 'low',
        'minor': 'low'
    };
    const priority = priorityMapping[severity] || 'medium';

    try {
        const { data, error } = await supabaseClient
            .from('gov_alerts')
            .insert({
                title: title,
                description: description,
                severity: severity,
                priority: priority,
                target_region: region || null,
                sent_via_fcm: sendFCM,
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        if (sendFCM) {
            const fcmSuccess = await sendFCMAlert(data);
            if (!fcmSuccess) {
                console.warn("FCM notification failed, but alert was created");
            }
        }

        alert('Alert created successfully!');
        closeModal('newAlertModal');
        document.getElementById('newAlertForm').reset();
        await fetchAlerts();
    } catch (error) {
        console.error('Error creating alert:', error);
        alert('Failed to create alert: ' + error.message);
    }
}

/**
 * ✅ REAL FCM: Sends alert to backend which dispatches via Firebase Admin SDK.
 * Falls back gracefully if the backend is unreachable.
 */
async function sendFCMAlert(alertData) {
    try {
        const response = await fetch('/api/send-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: alertData.title,
                body: alertData.description,
                severity: alertData.severity,
                region: alertData.target_region || null,
                alert_id: alertData.id
            })
        });
        const result = await response.json();
        if (result.success) {
            console.log('FCM alert sent successfully:', result);
            return true;
        } else {
            console.warn('FCM send returned failure:', result.error);
            return false;
        }
    } catch (err) {
        console.error('FCM backend call failed:', err.message);
        return false;
    }
}

/**
 * ✅ AUDIT: Log officer actions to Supabase audit_log table.
 * Fire-and-forget — never blocks the UI.
 */
async function logAuditAction(action, targetId, metadata = {}) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        await supabaseClient.from('audit_log').insert({
            action,
            actor_id: user.id,
            target_id: targetId,
            metadata: JSON.stringify(metadata)
        });
        console.log(`Audit logged: ${action} on ${targetId}`);
    } catch (e) {
        console.warn('Audit log failed (non-blocking):', e.message);
    }
}

function viewAlert(alertId) {
    const alertItem = governmentAlerts.find(a => a.id === alertId);
    if (alertItem) {
        const message = `
            Title: ${alertItem.title}
            Description: ${alertItem.description}
            Severity: ${alertItem.severity.toUpperCase()}
            Region: ${alertItem.target_region || 'All Regions'}
            Issued: ${formatTimestamp(alertItem.created_at)}
            Status: ${alertItem.sent_via_fcm ? 'Sent' : 'Pending'}
        `;
        alert(message.replace(/\n/g, '\n'));
    } else {
        alert('Alert not found.');
    }
}

async function deleteAlert(alertId) {
    if (!confirm('Are you sure you want to delete this alert?')) return;

    try {
        const { error } = await supabaseClient
            .from('gov_alerts')
            .delete()
            .eq('id', alertId);

        if (error) throw error;
        logAuditAction('delete_alert', alertId, { deleted: true });
        alert('Alert deleted successfully.');
        await fetchAlerts();
    } catch (error) {
        console.error('Error deleting alert:', error);
        alert('Failed to delete alert: ' + error.message);
    }
}

async function verifyReport(reportId) {
    try {
        const { error } = await supabaseClient
            .from('user_reports')
            .update({ status: 'verified' })
            .eq('id', reportId);

        if (error) throw error;
        logAuditAction('verify_report', reportId, { new_status: 'verified' });
        alert('Report verified successfully.');
        await fetchReports();
        closeModal('reportModal');
    } catch (error) {
        console.error('Verification error:', error);
        alert('Failed to verify report: ' + error.message);
    }
};

async function rejectReport(reportId) {
    try {
        const { error } = await supabaseClient
            .from('user_reports')
            .update({ status: 'rejected' })
            .eq('id', reportId);

        if (error) throw error;
        logAuditAction('reject_report', reportId, { new_status: 'rejected' });
        alert('Report rejected successfully.');
        await fetchReports();
        closeModal('reportModal');
    } catch (error) {
        console.error('Rejection error:', error);
        alert('Failed to reject report: ' + error.message);
    }
};

function exportReports() {
    // Show export choice modal
    const existing = document.getElementById('exportChoiceModal');
    if (existing) { existing.remove(); }

    const modal = document.createElement('div');
    modal.id = 'exportChoiceModal';
    modal.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(6,11,24,0.55);
        backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;`;
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:28px;max-width:380px;width:100%;
            box-shadow:0 32px 64px -16px rgba(11,19,37,0.18);border:1px solid rgba(15,23,42,0.08);">
            <h3 style="font-family:Outfit,sans-serif;font-size:18px;font-weight:700;margin:0 0 6px;">Export Reports</h3>
            <p style="font-size:13px;color:#5b6478;margin:0 0 20px;">Choose your preferred format</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button onclick="exportCSV();document.getElementById('exportChoiceModal').remove();"
                    style="padding:12px 16px;border-radius:10px;border:1px solid #e2e8f0;background:white;
                    font-size:13px;font-weight:600;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;
                    transition:background 160ms;" onmouseover="this.style.background='#f4f6fb'" onmouseout="this.style.background='white'">
                    <span style="font-size:18px;">📄</span>
                    <div><div>CSV Spreadsheet</div><div style="font-size:11px;font-weight:400;color:#8892a6;">Open in Excel, Google Sheets</div></div>
                </button>
                <button onclick="exportPDF();document.getElementById('exportChoiceModal').remove();"
                    style="padding:12px 16px;border-radius:10px;border:1px solid #e2e8f0;background:white;
                    font-size:13px;font-weight:600;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;
                    transition:background 160ms;" onmouseover="this.style.background='#f4f6fb'" onmouseout="this.style.background='white'">
                    <span style="font-size:18px;">📕</span>
                    <div><div>PDF Report</div><div style="font-size:11px;font-weight:400;color:#8892a6;">Formatted for printing & sharing</div></div>
                </button>
                <button onclick="document.getElementById('exportChoiceModal').remove();"
                    style="padding:10px;border-radius:10px;border:none;background:transparent;
                    font-size:13px;color:#8892a6;cursor:pointer;">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function exportCSV() {
    const csvContent = "data:text/csv;charset=utf-8,"
        + "ID,Reporter,Location,Hazard Type,Date,Status,Description\n"
        + reports.map(report =>
            `${report.id},${report.reporter_name || 'Anonymous'},${report.address || 'Unknown'},${report.hazard_type || 'Unknown'},${formatTimestamp(report.created_at)},${report.status},"${report.description?.replace(/"/g, '""') || ''}"`
        ).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `samudra_reports_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function exportPDF() {
    if (!window.jspdf) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const PW = 297, PH = 210;

    // ── Branded Header ────────────────────────────────────────
    // Deep navy gradient bar
    doc.setFillColor(6, 11, 24);
    doc.rect(0, 0, PW, 28, 'F');
    // Teal accent stripe
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 26, PW, 2, 'F');

    // Wave logo circle
    doc.setFillColor(16, 185, 129);
    doc.circle(20, 14, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('~', 17, 16);

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Samudra Suraksha', 32, 12);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 185, 129);
    doc.text('INCOIS · Ocean Information & Early Warning System', 32, 18);

    // Right-side metadata
    doc.setTextColor(200, 210, 230);
    doc.setFontSize(8);
    doc.text('HAZARD REPORT EXPORT', PW - 14, 10, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleString('en-IN', {dateStyle:'medium',timeStyle:'short'})}`, PW - 14, 16, { align: 'right' });
    doc.text(`Total records: ${reports.length}`, PW - 14, 22, { align: 'right' });

    // ── Summary Stats Band ────────────────────────────────────
    const total = reports.length;
    const pending  = reports.filter(r => r.status === 'pending').length;
    const verified = reports.filter(r => r.status === 'verified').length;
    const rejected = reports.filter(r => r.status === 'rejected').length;

    const stats = [
        { label: 'TOTAL', value: total,    color: [3, 105, 161] },
        { label: 'PENDING', value: pending,  color: [180, 83, 9] },
        { label: 'VERIFIED', value: verified, color: [4, 120, 87] },
        { label: 'REJECTED', value: rejected, color: [185, 28, 28] },
    ];
    const boxW = 40, boxH = 16, startX = 14, statY = 32;
    stats.forEach((s, i) => {
        const bx = startX + i * (boxW + 4);
        doc.setFillColor(...s.color);
        doc.roundedRect(bx, statY, boxW, boxH, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text(String(s.value), bx + boxW / 2, statY + 9, { align: 'center' });
        doc.setFontSize(6); doc.setFont('helvetica', 'normal');
        doc.text(s.label, bx + boxW / 2, statY + 14, { align: 'center' });
    });

    // ── Table ─────────────────────────────────────────────────
    const headers = ['Report ID', 'Reporter', 'Location', 'Hazard Type', 'Date', 'Severity', 'Status'];
    const colW    = [35, 32, 45, 28, 38, 22, 22];
    let y = 56;

    // Header row
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y - 5, PW - 28, 9, 'F');
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    let x = 14;
    headers.forEach((h, i) => { doc.text(h, x + 2, y); x += colW[i]; });

    // Data rows
    doc.setFont('helvetica', 'normal');
    const hazardEmoji = { flood:'🌊', tsunami:'⚠️', storm:'🌀', waves:'🌊', erosion:'🏖', other:'📍' };
    reports.slice(0, 120).forEach((r, idx) => {
        y += 8;
        if (y > PH - 18) {
            // Footer on current page
            _pdfFooter(doc, PW, PH, idx);
            doc.addPage();
            y = 20;
            // Repeat header
            doc.setFillColor(15, 23, 42);
            doc.rect(14, y - 5, PW - 28, 9, 'F');
            doc.setTextColor(148, 163, 184);
            doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            x = 14;
            headers.forEach((h, i) => { doc.text(h, x + 2, y); x += colW[i]; });
            doc.setFont('helvetica', 'normal');
            y += 8;
        }

        // Alternating row bg
        if (idx % 2 === 0) {
            doc.setFillColor(244, 247, 252);
            doc.rect(14, y - 5, PW - 28, 7.5, 'F');
        }

        const statusColor = r.status === 'verified' ? [4,120,87] : r.status === 'rejected' ? [185,28,28] : [180,83,9];
        const severityColor = (r.severity==='high'||r.severity==='emergency') ? [185,28,28] : r.severity==='medium' ? [180,83,9] : [4,120,87];

        const row = [
            { text: String(r.id).slice(0,8)+'…', color: [71,85,105] },
            { text: (r.reporter_name||'Anonymous').slice(0,18), color: [30,41,59] },
            { text: (r.address||'Unknown').slice(0,24), color: [30,41,59] },
            { text: (r.hazard_type||'other').toUpperCase().slice(0,12), color: [3,105,161] },
            { text: formatTimestamp(r.created_at).slice(0,16), color: [71,85,105] },
            { text: (r.severity||'N/A').slice(0,8), color: severityColor },
            { text: (r.status||'pending').toUpperCase(), color: statusColor },
        ];

        x = 14;
        doc.setFontSize(7);
        row.forEach((cell, i) => {
            doc.setTextColor(...cell.color);
            doc.text(String(cell.text), x + 2, y);
            x += colW[i];
        });
    });

    _pdfFooter(doc, PW, PH);
    doc.save(`samudra_hazard_report_${new Date().toISOString().slice(0,10)}.pdf`);
}

function _pdfFooter(doc, PW, PH) {
    doc.setFillColor(6, 11, 24);
    doc.rect(0, PH - 10, PW, 10, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('Samudra Suraksha · INCOIS · Confidential Government Document', 14, PH - 4);
    doc.setTextColor(16, 185, 129);
    doc.text('incois.gov.in', PW - 14, PH - 4, { align: 'right' });
}

function openNewAlertModal() {
    const modal = document.getElementById('newAlertModal');
    if (modal) modal.style.display = 'block';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
    if (modalMap) {
        modalMap.remove();
        modalMap = null;
    }
}

function calculateMapCenter(reports) {
    const validReports = reports.filter(r => r.latitude && r.longitude && !isNaN(parseFloat(r.latitude)) && !isNaN(parseFloat(r.longitude)) && r.status !== 'rejected');

    if (validReports.length === 0) {
        return [8.5241, 76.9366]; // Default to Thiruvananthapuram
    }

    let latSum = 0, lngSum = 0, count = 0;
    validReports.forEach(report => {
        const lat = parseFloat(report.latitude);
        const lng = parseFloat(report.longitude);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            latSum += lat;
            lngSum += lng;
            count++;
        }
    });

    if (count === 0) {
        return [8.5241, 76.9366];
    }

    return [latSum / count, lngSum / count];
}

function calculateHeatmapCenter(reports) {
    const validReports = reports.filter(r => r.latitude && r.longitude && !isNaN(parseFloat(r.latitude)) && !isNaN(parseFloat(r.longitude)) && r.status !== 'rejected');

    if (validReports.length === 0) {
        return [8.5241, 76.9366];
    }

    let latSum = 0, lngSum = 0, weightSum = 0;
    validReports.forEach(report => {
        const lat = parseFloat(report.latitude);
        const lng = parseFloat(report.longitude);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            const weight = report.priority === 'high' ? 2 : 1;
            latSum += lat * weight;
            lngSum += lng * weight;
            weightSum += weight;
        }
    });

    if (weightSum === 0) {
        return [8.5241, 76.9366];
    }

    return [latSum / weightSum, lngSum / weightSum];
}

function initializeMaps() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
        console.error('Map container not ready or invalid dimensions');
        return;
    }

    mapContainer.style.position = 'relative';
    mapContainer.style.zIndex = '0';
    mapContainer.style.width = '100%';
    mapContainer.style.height = '500px'; // Ensure fixed height

    try {
        if (mainMap) {
            mainMap.invalidateSize();
            return;
        }

        mainMap = L.map('map', {
            preferCanvas: true,
            renderer: L.canvas({ padding: 0.5 })
        }).setView([8.5241, 76.9366], 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18,
            tileSize: 256
        }).addTo(mainMap);

        allMarkersGroup = L.layerGroup().addTo(mainMap);
        highRiskGroup = L.layerGroup().addTo(mainMap);
        verifiedGroup = L.layerGroup().addTo(mainMap);

        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function() {
            const div = L.DomUtil.create('div', 'legend bg-white p-2 rounded shadow');
            div.innerHTML = `
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-emerald-500"></span>Flood</div>
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-red-600"></span>Oil Spill</div>
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-amber-500"></span>High Waves</div>
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-gray-800"></span>Tsunami</div>
                <div class="legend-item flex items-center"><span class="w-4 h-4 mr-2 rounded-full bg-blue-600"></span>Other</div>
            `;
            return div;
        };
        legend.addTo(mainMap);

        addMarkersToMap(reports);
        setTimeout(() => mainMap.invalidateSize(), 100);
    } catch (error) {
        console.error('Failed to initialize map:', error);
        alert('Failed to initialize map: ' + error.message);
    }
}

function initializeHotspotMap() {
    const mapContainer = document.getElementById('hotspot-map');
    if (!mapContainer || mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
        console.error('Hotspot map container not ready or invalid dimensions');
        return;
    }

    mapContainer.style.position = 'relative';
    mapContainer.style.zIndex = '0';
    mapContainer.style.width = '100%';
    mapContainer.style.height = '500px'; // Ensure fixed height

    try {
        if (hotspotMap) {
            hotspotMap.invalidateSize();
            return;
        }

        const center = calculateHeatmapCenter(reports);
        hotspotMap = L.map('hotspot-map', {
            preferCanvas: true,
            renderer: L.canvas({ padding: 0.5, willReadFrequently: true })
        }).setView(center, 10);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18,
            tileSize: 256
        }).addTo(hotspotMap);

        // Add layer control for heatmap and clusters
        const baseLayers = {
            "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            })
        };

        const overlayLayers = {
            "Heatmap": L.layerGroup(),
            "Clusters": L.markerClusterGroup()
        };

        L.control.layers(baseLayers, overlayLayers, { position: 'topright' }).addTo(hotspotMap);

        // Add hotspot markers with clustering
        const clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            iconCreateFunction: function(cluster) {
                return L.divIcon({
                    html: `<div class="bg-red-600 text-white rounded-full w-10 h-10 flex items-center justify-center">${cluster.getChildCount()}</div>`,
                    className: 'marker-cluster',
                    iconSize: [40, 40]
                });
            }
        });

        reports.forEach(report => {
            if (report.latitude && report.longitude && !isNaN(parseFloat(report.latitude)) && !isNaN(parseFloat(report.longitude)) && report.status !== 'rejected') {
                const lat = parseFloat(report.latitude);
                const lng = parseFloat(report.longitude);
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    const markerType = (report.hazard_type ? report.hazard_type.toLowerCase() : 'other');
                    const iconMap = {
                        'flood': { icon: 'fa-water', color: 'bg-emerald-500' },
                        'oil spill': { icon: 'fa-oil-can', color: 'bg-red-600' },
                        'high waves': { icon: 'fa-wave-square', color: 'bg-amber-500' },
                        'tsunami': { icon: 'fa-exclamation-triangle', color: 'bg-gray-800' },
                        'other': { icon: 'fa-question', color: 'bg-blue-600' }
                    };
                    const iconClass = iconMap[markerType]?.icon || 'fa-question';
                    const markerColor = iconMap[markerType]?.color || 'bg-blue-600';

                    const marker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            className: `custom-marker ${markerColor} opacity-75`,
                            html: `<i class="fas ${iconClass} text-white"></i>`,
                            iconSize: [28, 28],
                            iconAnchor: [14, 14]
                        })
                    }).bindPopup(`
                        <div class="popup-content p-2">
                            <h3 class="font-bold text-lg">${report.hazard_type || 'Unknown Hazard'}</h3>
                            <p><strong>ID:</strong> ${report.id.substring(0, 8)}...</p>
                            <p><strong>Location:</strong> ${report.address || 'Unknown'}</p>
                            <p><strong>Time:</strong> ${formatTimestamp(report.created_at)}</p>
                            <p><strong>Status:</strong> ${report.status}</p>
                            <button onclick="viewReport('${report.id}')" class="px-3 py-1 bg-gov-accent text-white rounded mt-2 hover:bg-emerald-600">View Details</button>
                        </div>
                    `);
                    clusterGroup.addLayer(marker);
                }
            }
        });

        hotspotMap.addLayer(clusterGroup);
        overlayLayers["Clusters"] = clusterGroup;

        updateHeatmap();
        setTimeout(() => hotspotMap.invalidateSize(), 100);
    } catch (error) {
        console.error('Failed to initialize hotspot map:', error);
        alert('Failed to initialize hotspot map: ' + error.message);
    }
}

function initializeModalMap(report) {
    const mapContainer = document.getElementById('modal-map');
    if (!mapContainer || mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
        console.error('Modal map container not ready or invalid dimensions');
        return;
    }

    try {
        if (modalMap) {
            modalMap.remove();
        }
        modalMap = L.map('modal-map', {
            preferCanvas: true,
            renderer: L.canvas({ padding: 0.5 })
        }).setView([parseFloat(report.latitude), parseFloat(report.longitude)], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 18,
            tileSize: 256
        }).addTo(modalMap);
        L.marker([parseFloat(report.latitude), parseFloat(report.longitude)]).addTo(modalMap);
        setTimeout(() => modalMap.invalidateSize(), 100);
    } catch (error) {
        console.error('Failed to initialize modal map:', error);
    }
}

function updateHeatmap() {
    if (!hotspotMap) return;

    if (heatmapLayer) {
        hotspotMap.removeLayer(heatmapLayer);
        heatmapLayer = null;
    }

    const mapContainer = document.getElementById('hotspot-map');
    if (!mapContainer || mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
        console.warn('Hotspot map container not ready for heatmap');
        return;
    }

    const heatPoints = reports
        .filter(r => r.latitude && r.longitude && !isNaN(parseFloat(r.latitude)) && !isNaN(parseFloat(r.longitude)) && r.status !== 'rejected')
        .map(r => {
            const lat = parseFloat(r.latitude);
            const lng = parseFloat(r.longitude);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return [lat, lng, r.priority === 'high' ? 1 : 0.5];
            }
            return null;
        })
        .filter(point => point !== null);

    if (heatPoints.length === 0) {
        console.warn('No valid points for heatmap');
        return;
    }

    try {
        heatmapLayer = L.heatLayer(heatPoints, {
            radius: 25,
            blur: 15,
            maxZoom: 17,
            gradient: { 0.4: 'blue', 0.65: 'yellow', 1.0: 'red' }
        }).addTo(hotspotMap);

        const center = calculateHeatmapCenter(reports);
        hotspotMap.setView(center, 10);
        hotspotMap.invalidateSize();
    } catch (error) {
        console.error('Error updating heatmap:', error);
        alert('Failed to update heatmap: ' + error.message);
    }
}

function addMarkersToMap(reports) {
    if (!mainMap || !allMarkersGroup || !highRiskGroup || !verifiedGroup) {
        console.error('Main map or marker groups not initialized');
        return;
    }

    allMarkersGroup.clearLayers();
    highRiskGroup.clearLayers();
    verifiedGroup.clearLayers();

    const iconMap = {
        'flood': { icon: 'fa-water', color: 'bg-emerald-500' },
        'oil spill': { icon: 'fa-oil-can', color: 'bg-red-600' },
        'high waves': { icon: 'fa-wave-square', color: 'bg-amber-500' },
        'tsunami': { icon: 'fa-exclamation-triangle', color: 'bg-gray-800' },
        'other': { icon: 'fa-question', color: 'bg-blue-600' }
    };

    let markerCount = 0;
    reports.forEach(report => {
        if (!report.latitude || !report.longitude || isNaN(parseFloat(report.latitude)) || isNaN(parseFloat(report.longitude)) || report.status === 'rejected') {
            console.warn('Skipping invalid or rejected report:', report.id);
            return;
        }

        const lat = parseFloat(report.latitude);
        const lng = parseFloat(report.longitude);
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.warn('Invalid coordinates for report:', report.id, lat, lng);
            return;
        }

        const markerType = (report.hazard_type ? report.hazard_type.toLowerCase() : 'other');
        const iconClass = iconMap[markerType]?.icon || 'fa-question';
        const markerColor = iconMap[markerType]?.color || 'bg-blue-600';

        const marker = L.divIcon({
            className: `custom-marker ${markerColor} opacity-75`,
            html: `<i class="fas ${iconClass} text-white"></i>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const popupContent = `
            <div class="popup-content p-2">
                <h3 class="font-bold text-lg">${report.hazard_type || 'Unknown Hazard'}</h3>
                <p><strong>ID:</strong> ${report.id.substring(0, 8)}...</p>
                <p><strong>Location:</strong> ${report.address || 'Unknown'}</p>
                <p><strong>Time:</strong> ${formatTimestamp(report.created_at)}</p>
                <p><strong>Status:</strong> ${report.status}</p>
                <button onclick="viewReport('${report.id}')" class="px-3 py-1 bg-gov-accent text-white rounded mt-2 hover:bg-emerald-600">View Details</button>
            </div>
        `;

        const markerObj = L.marker([lat, lng], {
            icon: marker,
            opacity: 0.75
        }).bindPopup(popupContent);

        allMarkersGroup.addLayer(markerObj);
        if (report.priority === 'high') highRiskGroup.addLayer(markerObj);
        if (report.status === 'verified') verifiedGroup.addLayer(markerObj);
        markerCount++;
    });

    applyMapFilter(currentFilter);
    mainMap.invalidateSize();
    console.log('Markers added:', markerCount);
}

function applyMapFilter(filter) {
    currentFilter = filter;
    if (!mainMap) {
        console.error('Main map not initialized');
        return;
    }

    mainMap.eachLayer(layer => {
        if (layer instanceof L.LayerGroup && (layer === allMarkersGroup || layer === highRiskGroup || layer === verifiedGroup)) {
            mainMap.removeLayer(layer);
        }
    });

    const buttons = document.querySelectorAll('#map-filters button');
    buttons.forEach(btn => {
        // Support both old Tailwind classes and new chip/active design system
        btn.classList.remove('active', 'bg-gov-accent', 'text-white');
        btn.classList.add('bg-gray-100', 'text-gray-700');
        if (btn.dataset.filter === filter) {
            btn.classList.remove('bg-gray-100', 'text-gray-700');
            btn.classList.add('active', 'bg-gov-accent', 'text-white');
        }
    });

    if (filter === 'all') {
        mainMap.addLayer(allMarkersGroup);
    } else if (filter === 'high') {
        mainMap.addLayer(highRiskGroup);
    } else if (filter === 'verified') {
        mainMap.addLayer(verifiedGroup);
    } else if (filter === 'pending') {
        const pendingGroup = L.layerGroup();
        allMarkersGroup.eachLayer(layer => {
            const report = reports.find(r => parseFloat(r.latitude) === layer.getLatLng().lat && parseFloat(r.longitude) === layer.getLatLng().lng);
            if (report && report.status === 'pending') {
                pendingGroup.addLayer(layer);
            }
        });
        mainMap.addLayer(pendingGroup);
    }

    mainMap.invalidateSize();
}

function updateRecentReportsTable() {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) {
        console.error('Recent reports table body not found');
        return;
    }

    tbody.innerHTML = '';
    const recentReports = reports.slice(0, 5);
    recentReports.forEach(report => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-100 hover:bg-gray-50';
        const statusClass = `badge-${report.status}`;
        row.innerHTML = `
            <td class="py-4 px-4 font-medium text-gov-primary">${report.id.substring(0, 8)}...</td>
            <td class="py-4 px-4">${report.reporter_name || 'Anonymous'}</td>
            <td class="py-4 px-4">${report.address || 'Unknown'}</td>
            <td class="py-4 px-4">${report.hazard_type || 'Unknown'}</td>
            <td class="py-4 px-4 text-gray-600">${formatTimestamp(report.created_at)}</td>
            <td class="py-4 px-4"><span class="px-3 py-1 ${statusClass} rounded-full text-xs font-medium">${report.status}</span></td>
            <td class="py-4 px-4">
                <div class="flex space-x-2">
                    <button onclick="viewReport('${report.id}')" class="action-button view"><i class="fas fa-eye mr-1"></i>View</button>
                    <button onclick="verifyReport('${report.id}')" class="action-button verify ${report.status !== 'pending' ? 'disabled' : ''}" ${report.status !== 'pending' ? 'disabled' : ''}><i class="fas fa-check mr-1"></i>Verify</button>
                    <button onclick="rejectReport('${report.id}')" class="action-button reject ${report.status !== 'pending' ? 'disabled' : ''}" ${report.status !== 'pending' ? 'disabled' : ''}><i class="fas fa-times mr-1"></i>Reject</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function populateReportsTable() {
    const tbody = document.getElementById('reportsTableBodyFull');
    if (!tbody) {
        console.error('Reports table body not found');
        return;
    }

    let filteredReports = originalReports.filter(report => {
        const matchesFilter = 
            currentFilter === 'all' || 
            (currentFilter === 'pending' && report.status === 'pending') ||
            (currentFilter === 'verified' && report.status === 'verified') ||
            (currentFilter === 'high' && report.priority === 'high');
        const matchesSearch = !searchTerm ||
            report.id.toLowerCase().includes(searchTerm) ||
            (report.reporter_name && report.reporter_name.toLowerCase().includes(searchTerm)) ||
            (report.address && report.address.toLowerCase().includes(searchTerm)) ||
            (report.hazard_type && report.hazard_type.toLowerCase().includes(searchTerm));
        return matchesFilter && matchesSearch;
    });

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const paginatedReports = filteredReports.slice(start, end);

    tbody.innerHTML = '';
    paginatedReports.forEach(report => {
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-100 hover:bg-gray-50';
        const statusClass = `badge-${report.status}`;
        row.innerHTML = `
            <td class="py-3 px-4 font-sans text-sm font-medium text-gray-900">${report.id.substring(0, 8)}...</td>
            <td class="py-3 px-4 font-sans text-sm font-medium text-gray-900">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                        <i class="fas fa-user text-gray-600"></i>
                    </div>
                    <span>${report.reporter_name || 'Anonymous'}</span>
                </div>
            </td>
            <td class="py-3 px-4 font-sans text-sm font-medium text-gray-900">${report.address || 'Unknown'}</td>
            <td class="py-3 px-4 font-sans text-sm font-medium text-gray-900">${report.hazard_type || 'Unknown'}</td>
            <td class="py-3 px-4 font-sans text-sm font-medium text-gray-900">${formatTimestamp(report.created_at)}</td>
            <td class="py-3 px-4 font-sans text-sm font-medium">
                <span class="px-3 py-1 ${statusClass} rounded-full text-xs">${report.status}</span>
            </td>
            <td class="py-3 px-4 font-sans text-sm font-medium">
                <div class="flex space-x-2">
                    <button onclick="viewReport('${report.id}')" class="action-button view">View</button>
                    <button onclick="verifyReport('${report.id}')" class="action-button verify ${report.status !== 'pending' ? 'disabled' : ''}" ${report.status !== 'pending' ? 'disabled' : ''}>Verify</button>
                    <button onclick="rejectReport('${report.id}')" class="action-button reject ${report.status !== 'pending' ? 'disabled' : ''}" ${report.status !== 'pending' ? 'disabled' : ''}>Reject</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    updatePagination(filteredReports.length);
}

function updatePagination(totalItems) {
    const paginationInfo = document.getElementById('paginationInfo');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (paginationInfo) {
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalItems);
        paginationInfo.textContent = `Showing ${start}-${end} of ${totalItems} results`;
    }
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage * pageSize >= totalItems;
}

function filterReports(filterType) {
    currentFilter = filterType;
    currentPage = 1;
    populateReportsTable();
};

async function viewReport(reportId) {
    const report = reports.find(r => r.id === reportId);
    if (!report) {
        alert('Report not found.');
        return;
    }

    const modal = document.getElementById('reportModal');
    const modalTitle = document.getElementById('modal-report-title');
    const modalDetails = document.getElementById('modal-report-details');
    const modalDescription = document.getElementById('modal-report-description');
    const modalMediaBadges = document.getElementById('modal-media-badges');
    const modalMediaContent = document.getElementById('modal-media-content');
    const modalFooter = document.getElementById('modal-footer');

    if (!modal || !modalTitle || !modalDetails || !modalDescription || !modalMediaBadges || !modalMediaContent || !modalFooter) {
        console.error('Modal elements not found');
        alert('Modal elements not found.');
        return;
    }

    modalTitle.textContent = `${report.hazard_type || 'Unknown Hazard'} Report`;
    modalDetails.innerHTML = `
        <p><strong>ID:</strong> ${report.id}</p>
        <p><strong>Reporter:</strong> ${report.reporter_name || 'Anonymous'}</p>
        <p><strong>Location:</strong> ${report.address || 'Unknown'}</p>
        <p><strong>Time:</strong> ${formatTimestamp(report.created_at)}</p>
        <p><strong>Status:</strong> ${report.status}</p>
        <p><strong>Priority:</strong> ${report.priority || 'N/A'}</p>
    `;
    modalDescription.textContent = report.description || 'No description provided.';
    modalMediaBadges.innerHTML = '';
    modalMediaContent.innerHTML = '';

    handleReportImages(report, modalMediaContent, modalMediaBadges);

    modalFooter.innerHTML = `
        <button onclick="closeModal('reportModal')" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">Close</button>
        <button onclick="verifyReport('${report.id}')" class="px-4 py-2 action-button verify ${report.status !== 'pending' ? 'disabled' : ''}" ${report.status !== 'pending' ? 'disabled' : ''}><i class="fas fa-check mr-1"></i>Verify</button>
        <button onclick="rejectReport('${report.id}')" class="px-4 py-2 action-button reject ${report.status !== 'pending' ? 'disabled' : ''}" ${report.status !== 'pending' ? 'disabled' : ''}><i class="fas fa-times mr-1"></i>Reject</button>
    `;

    modal.style.display = 'block';
    initializeModalMap(report);
};

function updateSummaryCards() {
    const totalReportsEl = document.getElementById('totalReports');
    const pendingReportsEl = document.getElementById('pendingReports');
    const activeAlertsEl = document.getElementById('activeAlerts');
    const hotspotsDetectedEl = document.getElementById('hotspotsDetected');
    const totalTrendEl = document.getElementById('totalTrend');
    const pendingUrgentEl = document.getElementById('pendingUrgent');
    const alertsNewEl = document.getElementById('alertsNew');
    const hotspotsNewEl = document.getElementById('hotspotsNew');

    if (totalReportsEl) totalReportsEl.textContent = reports.length;
    if (pendingReportsEl) pendingReportsEl.textContent = reports.filter(r => r.status === 'pending').length;
    if (activeAlertsEl) activeAlertsEl.textContent = governmentAlerts.filter(a => new Date(a.expires_at) > new Date()).length;
    if (hotspotsDetectedEl) hotspotsDetectedEl.textContent = reports.filter(r => r.status === 'verified' && r.priority === 'high').length;

    if (totalTrendEl) totalTrendEl.innerHTML = `<i class="fas fa-arrow-up mr-1"></i> ${reports.length} new this week`;
    if (pendingUrgentEl) pendingUrgentEl.innerHTML = `<i class="fas fa-exclamation-triangle mr-1"></i> ${reports.filter(r => r.status === 'pending' && r.priority === 'high').length} urgent`;
    if (alertsNewEl) alertsNewEl.innerHTML = `<i class="fas fa-bell mr-1"></i> ${governmentAlerts.filter(a => new Date(a.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length} new`;
    if (hotspotsNewEl) hotspotsNewEl.innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i> ${reports.filter(r => r.status === 'verified' && new Date(r.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length} new`;
}

function initCharts() {
    const pieCtx = document.getElementById('hazardPieChart');
    const barCtx = document.getElementById('comparisonBarChart');
    const lineCtx = document.getElementById('trendLineChart');

    if (!pieCtx || !barCtx || !lineCtx) {
        console.error('Chart canvases not found:', { pieCtx: !!pieCtx, barCtx: !!barCtx, lineCtx: !!lineCtx });
        return;
    }

    try {
        if (hazardPieChart) hazardPieChart.destroy();
        if (comparisonBarChart) comparisonBarChart.destroy();
        if (trendLineChart) trendLineChart.destroy();

        hazardPieChart = new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: ['Flood', 'Oil Spill', 'High Waves', 'Tsunami', 'Other'],
                datasets: [{
                    data: [0, 0, 0, 0, 0],
                    backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#333333', '#3b82f6'],
                    borderColor: ['#fff', '#fff', '#fff', '#fff', '#fff'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { size: 12, family: 'Arial' },
                            padding: 10
                        }
                    },
                    title: {
                        display: true,
                        text: 'Hazard Type Distribution',
                        font: { size: 14, weight: 'bold' },
                        padding: 10
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.label}: ${context.raw} reports`
                        }
                    }
                }
            }
        });

        comparisonBarChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Today', 'Yesterday', 'Last Week'],
                datasets: [
                    {
                        label: 'Reports',
                        data: [0, 0, 0],
                        backgroundColor: '#10b981',
                        borderColor: '#047857',
                        borderWidth: 1
                    },
                    {
                        label: 'Alerts',
                        data: [0, 0, 0],
                        backgroundColor: '#3b82f6',
                        borderColor: '#1d4ed8',
                        borderWidth: 1
                    },
                    {
                        label: 'High Priority',
                        data: [0, 0, 0],
                        backgroundColor: '#ef4444',
                        borderColor: '#b91c1c',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            font: { size: 12, family: 'Arial' },
                            padding: 10
                        }
                    },
                    title: {
                        display: true,
                        text: 'Hazard Trends Over Time',
                        font: { size: 14, weight: 'bold' },
                        padding: 10
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${context.raw}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Count',
                            font: { size: 12 }
                        },
                        grid: { color: '#e5e7eb' }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time Period',
                            font: { size: 12 }
                        },
                        grid: { display: false }
                    }
                }
            }
        });

        trendLineChart = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Reports',
                    data: [],
                    borderColor: '#10b981',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    title: {
                        display: true,
                        text: '7-Day Report Trends'
                    }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });

        updateCharts();
    } catch (error) {
        console.error('Error initializing charts:', error);
        alert('Failed to initialize charts: ' + error.message);
    }
}

function updateCharts() {
    try {
        const hazardCounts = {
            Flood: 0,
            'Oil Spill': 0,
            'High Waves': 0,
            Tsunami: 0,
            Other: 0
        };

        reports.forEach(report => {
            const type = report.hazard_type || 'Other';
            hazardCounts[type] = (hazardCounts[type] || 0) + 1;
        });

        if (hazardPieChart) {
            hazardPieChart.data.datasets[0].data = [
                hazardCounts.Flood,
                hazardCounts['Oil Spill'],
                hazardCounts['High Waves'],
                hazardCounts.Tsunami,
                hazardCounts.Other
            ];
            hazardPieChart.update();
        } else {
            console.warn('Hazard pie chart not initialized');
        }

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);

        const todayReports = reports.filter(r => new Date(r.created_at).toDateString() === today.toDateString()).length;
        const yesterdayReports = reports.filter(r => new Date(r.created_at).toDateString() === yesterday.toDateString()).length;
        const lastWeekReports = reports.filter(r => new Date(r.created_at) >= lastWeek && new Date(r.created_at) < today).length;

        const todayAlerts = governmentAlerts.filter(a => new Date(a.created_at).toDateString() === today.toDateString()).length;
        const yesterdayAlerts = governmentAlerts.filter(a => new Date(a.created_at).toDateString() === yesterday.toDateString()).length;
        const lastWeekAlerts = governmentAlerts.filter(a => new Date(a.created_at) >= lastWeek && new Date(a.created_at) < today).length;

        const todayHighPriority = reports.filter(r => new Date(r.created_at).toDateString() === today.toDateString() && r.priority === 'high').length;
        const yesterdayHighPriority = reports.filter(r => new Date(r.created_at).toDateString() === yesterday.toDateString() && r.priority === 'high').length;
        const lastWeekHighPriority = reports.filter(r => new Date(r.created_at) >= lastWeek && new Date(r.created_at) < today && r.priority === 'high').length;

        if (comparisonBarChart) {
            comparisonBarChart.data.datasets[0].data = [todayReports, yesterdayReports, lastWeekReports];
            comparisonBarChart.data.datasets[1].data = [todayAlerts, yesterdayAlerts, lastWeekAlerts];
            comparisonBarChart.data.datasets[2].data = [todayHighPriority, yesterdayHighPriority, lastWeekHighPriority];
            comparisonBarChart.update();
        } else {
            console.warn('Comparison bar chart not initialized');
        }

        if (trendLineChart) {
            const days = [];
            const reportCounts = [];
            for (let i = 6; i >= 0; i--) {
                const day = new Date();
                day.setDate(day.getDate() - i);
                days.push(day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                reportCounts.push(reports.filter(r => new Date(r.created_at).toDateString() === day.toDateString()).length);
            }
            trendLineChart.data.labels = days;
            trendLineChart.data.datasets[0].data = reportCounts;
            trendLineChart.update();
        } else {
            console.warn('Trend line chart not initialized');
        }
    } catch (error) {
        console.error('Error updating charts:', error);
        alert('Failed to update charts: ' + error.message);
    }
}

function setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = item.getAttribute('href')?.substring(1) || item.dataset.tab;
            if (tabName) {
                showTab(tabName);
            }
        });
    });

    // Mobile sidebar toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('-translate-x-full');
            sidebarOverlay.classList.toggle('hidden');
        });
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.add('hidden');
        });
    }

    // Dropdown toggles
    const dropdownButtons = document.querySelectorAll('[data-bs-toggle="dropdown"]');
    dropdownButtons.forEach(btn => {
        const menu = btn.nextElementSibling;
        if (menu) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!btn.contains(e.target) && !menu.contains(e.target)) {
                    menu.classList.add('hidden');
                }
            });
        }
    });

    document.getElementById('map-filters')?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            applyMapFilter(e.target.dataset.filter);
        }
    });

    const searchInput = document.getElementById('search-reports');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            currentPage = 1;
            populateReportsTable();
        });
    }

    const newAlertForm = document.getElementById('newAlertForm');
    if (newAlertForm) {
        newAlertForm.addEventListener('submit', (e) => {
            e.preventDefault();
            createNewAlert();
        });
    }

    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            closeModal('reportModal');
            closeModal('newAlertModal');
        });
    });

    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('profileName').value;
            const email = document.getElementById('profileEmail').value;
            const department = document.getElementById('profileDepartment').value;
            const region = document.getElementById('profileRegion').value;

            try {
                const { error } = await supabaseClient
                    .from('users_metadata')
                    .update({
                        department_name: department,
                        state: region
                    })
                    .eq('id', (await supabaseClient.auth.getUser()).data.user.id);

                if (error) throw error;
                await supabaseClient.auth.updateUser({ email });
                alert('Profile updated successfully.');
                await fetchUserMetadata();
            } catch (error) {
                console.error('Error updating profile:', error);
                alert('Failed to update profile: ' + error.message);
            }
        });
    }

    // Apply saved dark mode on load (Tailwind needs class on <html>)
    const saved = JSON.parse(localStorage.getItem('dashboardSettings') || '{}');
    if (saved.darkMode) {
        document.documentElement.classList.add('dark');
        const dm = document.getElementById('darkMode');
        if (dm) dm.checked = true;
    }

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const emailNotif = document.getElementById('emailNotif').checked;
            const pushNotif = document.getElementById('pushNotif').checked;
            const smsNotif = document.getElementById('smsNotif').checked;
            const darkMode = document.getElementById('darkMode').checked;
            const mapStyle = document.getElementById('mapStyle').value;

            // Apply dark mode on <html> — required for Tailwind dark: variants
            document.documentElement.classList.toggle('dark', darkMode);

            localStorage.setItem('dashboardSettings', JSON.stringify({
                emailNotif, pushNotif, smsNotif, darkMode, mapStyle
            }));

            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
                background:#0b1325;color:white;padding:12px 20px;border-radius:10px;
                font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.3);
                display:flex;align-items:center;gap:8px;animation:fadeIn 200ms ease;`;
            toast.innerHTML = '<span style="color:#10b981">✓</span> Settings saved';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2500);
        });

        // Live preview on toggle — instant feedback
        const dmToggle = document.getElementById('darkMode');
        if (dmToggle) {
            dmToggle.addEventListener('change', () => {
                document.documentElement.classList.toggle('dark', dmToggle.checked);
            });
        }
    }

    const prevPage = document.getElementById('prevPage');
    if (prevPage) {
        prevPage.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                populateReportsTable();
            }
        });
    }

    const nextPage = document.getElementById('nextPage');
    if (nextPage) {
        nextPage.addEventListener('click', () => {
            currentPage++;
            populateReportsTable();
        });
    }

    document.getElementById('refreshIcon')?.parentElement.addEventListener('click', refreshData);
}

function refreshData() {
    const refreshBtn = document.querySelector('.btn-refresh');
    const refreshIcon = document.getElementById('refreshIcon');
    if (refreshBtn && refreshIcon) {
        refreshBtn.disabled = true;
        refreshIcon.classList.add('fa-spin');
        setTimeout(async () => {
            await Promise.all([fetchReports(), fetchAlerts()]);
            refreshBtn.disabled = false;
            refreshIcon.classList.remove('fa-spin');
            alert('Data refreshed successfully.');
        }, 1000);
    }
}

async function logout() {
    try {
        unsubscribeAll();
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        localStorage.removeItem('samudra_suraksha_user');
        window.location.href = 'auth.html';
    } catch (error) {
        console.error('Logout error:', error);
        alert('Failed to log out: ' + error.message);
    }
}