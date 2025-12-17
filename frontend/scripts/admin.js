const API_BASE_URL = '/api/admin';
const TOKEN_STORAGE_KEY = "meetflow.token";

let meetingStatusChart = null;
let userGrowthChart = null;

// Check authentication
function getAuthToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/index.html';
        return null;
    }
    return token;
}

// API Calls
async function fetchStats() {
    const token = checkAuth();
    const response = await fetch(`${API_BASE_URL}/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch stats: ${response.status}`);
    return await response.json();
}

async function fetchUsers() {
    const token = checkAuth();
    const response = await fetch(`${API_BASE_URL}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch users: ${response.status}`);
    return await response.json();
}

async function fetchMeetings() {
    const token = checkAuth();
    const response = await fetch(`${API_BASE_URL}/meetings`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch meetings: ${response.status}`);
    return await response.json();
}

async function fetchRecentActivity() {
    const token = checkAuth();
    const response = await fetch(`${API_BASE_URL}/recent-activity`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch activity: ${response.status}`);
    return await response.json();
}

async function fetchSystemHealth() {
    const token = checkAuth();
    const response = await fetch(`${API_BASE_URL}/system-health`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch system health: ${response.status}`);
    return await response.json();
}

// UI Updates
function updateDashboard(stats) {
    document.getElementById('total-users').textContent = stats.total_users;
    document.getElementById('new-users-today').textContent = stats.new_users_today;
    document.getElementById('admin-count').textContent = stats.admin_count;
    document.getElementById('total-meetings').textContent = stats.total_meetings;
    document.getElementById('meetings-today').textContent = stats.meetings_today;
    document.getElementById('ended-meetings').textContent = stats.ended_meetings;
    document.getElementById('active-meetings').textContent = stats.active_meetings;
    document.getElementById('avg-participants').textContent = stats.avg_participants_per_meeting;
    document.getElementById('total-messages').textContent = stats.total_messages;
    document.getElementById('messages-today').textContent = stats.messages_today;
    
    // Update charts
    updateMeetingStatusChart(stats);
    updateUserGrowthChart(stats);
}

function updateMeetingStatusChart(stats) {
    const ctx = document.getElementById('meeting-status-chart');
    if (!ctx) return;
    
    if (meetingStatusChart) {
        meetingStatusChart.destroy();
    }
    
    meetingStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['进行中', '已结束', '待开始'],
            datasets: [{
                data: [
                    stats.active_meetings, 
                    stats.ended_meetings,
                    stats.total_meetings - stats.active_meetings - stats.ended_meetings
                ],
                backgroundColor: ['#10b981', '#6b7280', '#3b82f6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateUserGrowthChart(stats) {
    const ctx = document.getElementById('user-growth-chart');
    if (!ctx) return;
    
    if (userGrowthChart) {
        userGrowthChart.destroy();
    }
    
    // Mock data for demonstration
    const labels = ['7天前', '6天前', '5天前', '4天前', '3天前', '2天前', '昨天', '今天'];
    const data = [
        Math.max(0, stats.total_users - stats.new_users_today - 50),
        Math.max(0, stats.total_users - stats.new_users_today - 40),
        Math.max(0, stats.total_users - stats.new_users_today - 30),
        Math.max(0, stats.total_users - stats.new_users_today - 20),
        Math.max(0, stats.total_users - stats.new_users_today - 15),
        Math.max(0, stats.total_users - stats.new_users_today - 10),
        Math.max(0, stats.total_users - stats.new_users_today),
        stats.total_users
    ];
    
    userGrowthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '用户数',
                data: data,
                borderColor: '#0f62fe',
                backgroundColor: 'rgba(15, 98, 254, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function renderUsers(users) {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.email}</td>
            <td><span class="status-badge ${user.role === 'admin' ? 'status-active' : 'status-inactive'}">${user.role}</span></td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

function renderMeetings(meetings) {
    const tbody = document.getElementById('meetings-table-body');
    tbody.innerHTML = meetings.map(meeting => `
        <tr>
            <td>${meeting.id}</td>
            <td>${meeting.meeting_number}</td>
            <td>${meeting.host_email}</td>
            <td><span class="status-badge ${meeting.status === 'started' ? 'status-active' : meeting.status === 'ended' ? 'status-ended' : 'status-inactive'}">${meeting.status}</span></td>
            <td>${meeting.participant_count}</td>
            <td>${meeting.start_time ? new Date(meeting.start_time).toLocaleString() : '-'}</td>
            <td>${new Date(meeting.created_at).toLocaleString()}</td>
        </tr>
    `).join('');
}

function renderActivity(activities) {
    const container = document.getElementById('activity-timeline');
    container.innerHTML = activities.map(activity => {
        const icon = activity.type === 'user_registered' ? '👤' : 
                     activity.type === 'meeting_created' ? '🎥' : '💬';
        const color = activity.type === 'user_registered' ? 'activity-user' : 
                      activity.type === 'meeting_created' ? 'activity-meeting' : 'activity-message';
        
        return `
            <div class="activity-item ${color}">
                <div class="activity-icon">${icon}</div>
                <div class="activity-content">
                    <div class="activity-description">${activity.description}</div>
                    <div class="activity-timestamp">${new Date(activity.timestamp).toLocaleString()}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderSystemHealth(health) {
    document.getElementById('cpu-usage').textContent = health.cpu_usage.toFixed(1);
    document.getElementById('memory-usage').textContent = health.memory_percent.toFixed(1);
    document.getElementById('memory-used').textContent = (health.memory_used / 1024 / 1024 / 1024).toFixed(2);
    document.getElementById('memory-total').textContent = (health.memory_total / 1024 / 1024 / 1024).toFixed(2);
    document.getElementById('disk-usage').textContent = health.disk_percent.toFixed(1);
    document.getElementById('disk-used').textContent = (health.disk_used / 1024 / 1024 / 1024).toFixed(2);
    document.getElementById('disk-total').textContent = (health.disk_total / 1024 / 1024 / 1024).toFixed(2);
    document.getElementById('process-count').textContent = health.process_count;
    
    // Update progress circle colors
    updateProgressColor('cpu-usage', health.cpu_usage);
    updateProgressColor('memory-usage', health.memory_percent);
    updateProgressColor('disk-usage', health.disk_percent);
}

function updateProgressColor(elementId, value) {
    const element = document.getElementById(elementId);
    const circle = element.closest('.progress-circle');
    if (!circle) return;
    
    circle.classList.remove('progress-low', 'progress-medium', 'progress-high');
    
    if (value < 50) {
        circle.classList.add('progress-low');
    } else if (value < 80) {
        circle.classList.add('progress-medium');
    } else {
        circle.classList.add('progress-high');
    }
}

// Navigation
function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('page-title');

    links.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const target = link.dataset.target;

            // Update active link
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Update view
            views.forEach(view => view.classList.add('hidden'));
            document.getElementById(`view-${target}`).classList.remove('hidden');

            // Update title
            pageTitle.textContent = link.textContent;

            // Load data
            try {
                if (target === 'dashboard') {
                    const stats = await fetchStats();
                    updateDashboard(stats);
                } else if (target === 'users') {
                    const users = await fetchUsers();
                    renderUsers(users);
                } else if (target === 'meetings') {
                    const meetings = await fetchMeetings();
                    renderMeetings(meetings);
                } else if (target === 'activity') {
                    const activities = await fetchRecentActivity();
                    renderActivity(activities);
                } else if (target === 'system') {
                    const health = await fetchSystemHealth();
                    renderSystemHealth(health);
                }
            } catch (error) {
                console.error('Error loading data:', error);
                if (error.message.includes('403') || error.message.includes('401')) {
                    alert('Unauthorized access');
                    window.location.href = '/index.html';
                }
            }
        });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;

    setupNavigation();
    
    // Load initial dashboard data
    try {
        const stats = await fetchStats();
        updateDashboard(stats);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        if (error.message.includes('403')) {
            alert('You do not have admin privileges');
            window.location.href = '/dashboard.html';
        }
    }
});
