const TOKEN_STORAGE_KEY = "meetflow.token";

export const state = {
    token: window.localStorage.getItem(TOKEN_STORAGE_KEY),
    currentUser: null,
    currentMeeting: null,
};

export function setToken(token) {
    state.token = token;
    if (token) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
}

export function setCurrentUser(user) {
    state.currentUser = user;
}

export function setCurrentMeeting(meeting) {
    state.currentMeeting = meeting;
}

export function resetState() {
    setToken(null);
    setCurrentUser(null);
    setCurrentMeeting(null);
}
